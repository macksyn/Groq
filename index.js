#!/usr/bin/env node
import 'dotenv/config';
import http from 'http';
import express from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import chalk from 'chalk';
import pino from 'pino';
import moment from 'moment-timezone';
import { File } from 'megajs';
import { fileURLToPath } from 'url';

import { 
  makeWASocket, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  DisconnectReason 
} from '@whiskeysockets/baileys';

// Import handlers
import MessageHandler from './handlers/messageHandler.js';
import CallHandler from './handlers/callHandler.js';
import GroupHandler from './handlers/groupHandler.js';
import PluginManager from './lib/pluginManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FIXED: Enhanced configuration with better admin number handling
const config = {
  SESSION_ID: process.env.SESSION_ID || '',
  PREFIX: process.env.PREFIX || '.',
  BOT_NAME: process.env.BOT_NAME || 'Fresh WhatsApp Bot',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '',
  OWNER_NAME: process.env.OWNER_NAME || 'Bot Owner',
  
  // FIXED: Better admin numbers handling - support multiple admins
  ADMIN_NUMBERS: process.env.ADMIN_NUMBERS || process.env.OWNER_NUMBER || '',
  
  MODE: process.env.MODE || 'public',
  AUTO_BIO: process.env.AUTO_BIO === 'true',
  AUTO_READ: process.env.AUTO_READ === 'true',
  AUTO_REACT: process.env.AUTO_REACT === 'true',
  WELCOME: process.env.WELCOME === 'true',
  ANTILINK: process.env.ANTILINK === 'true',
  REJECT_CALL: process.env.REJECT_CALL === 'true',
  AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN === 'true',
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  TIMEZONE: process.env.TIMEZONE || 'Africa/Lagos'
};

// Validate required configuration
if (!config.OWNER_NUMBER) {
  console.error(chalk.red(' OWNER_NUMBER is required! Please set it in environment variables.'));
  process.exit(1);
}

// FIXED: Process admin numbers properly
if (config.ADMIN_NUMBERS && typeof config.ADMIN_NUMBERS === 'string') {
  // Split by comma and clean each number
  config.ADMIN_NUMBERS = config.ADMIN_NUMBERS.split(',')
    .map(num => num.trim())
    .filter(num => num.length > 0)
    .map(num => num.replace('@s.whatsapp.net', '')); // Remove WhatsApp suffix if present
  
  console.log(chalk.blue(` Admin numbers configured: ${config.ADMIN_NUMBERS.length} admin(s)`));
}

console.log(chalk.cyan(`

        ${config.BOT_NAME}       
     Starting WhatsApp Bot...        

`));

// Session management
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

// Create session directory
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

// Logger setup - less verbose for cloud
const logger = pino({
  level: config.NODE_ENV === 'production' ? 'warn' : 'info',
  timestamp: () => `,"time":"${new Date().toISOString()}"`
});

// Connection state tracking
let sock = null;
let botStatus = 'starting';
let isConnecting = false;
let connectionAttempts = 0;
let lastSuccessfulConnection = Date.now();
let bioUpdateCount = 0;
let server = null;
let serverReady = false;

// Constants
const MAX_CONNECTION_ATTEMPTS = 15;
const MAX_BIO_UPDATES_PER_HOUR = 2;
const CONNECTION_TIMEOUT = 60000;
const RECONNECT_DELAY = {
  MIN: 5000,
  MAX: 60000,
  MULTIPLIER: 1.5
};

// Simple rate limiting implementation (no external dependency)
const rateLimitStore = new Map();
function simpleRateLimit(windowMs = 15 * 60 * 1000, maxRequests = 100) {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    for (const [ip, requests] of rateLimitStore.entries()) {
      const filteredRequests = requests.filter(timestamp => timestamp > windowStart);
      if (filteredRequests.length === 0) {
        rateLimitStore.delete(ip);
      } else {
        rateLimitStore.set(ip, filteredRequests);
      }
    }
    
    // Check current IP
    const clientRequests = rateLimitStore.get(clientIP) || [];
    const recentRequests = clientRequests.filter(timestamp => timestamp > windowStart);
    
    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again later.`,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Add current request
    recentRequests.push(now);
    rateLimitStore.set(clientIP, recentRequests);
    
    next();
  };
}

// Basic security headers (no helmet dependency)
function addSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self';"
  );
  next();
}

// Reset bio update count every hour
setInterval(() => {
  bioUpdateCount = 0;
}, 60 * 60 * 1000);

// Initialize PluginManager on startup
async function initializePluginManager() {
  try {
    console.log(chalk.blue(' Initializing PluginManager...'));
    
    // Check if PluginManager exists and has required methods
    if (typeof PluginManager?.loadPlugins === 'function') {
      await PluginManager.loadPlugins();
      
      // Show plugin health check on startup
      if (typeof PluginManager?.healthCheck === 'function') {
        const health = await PluginManager.healthCheck();
        if (!health.healthy) {
          console.log(chalk.yellow(' Plugin health issues detected:'));
          health.issues.forEach(issue => {
            console.log(chalk.yellow(`   • ${issue}`));
          });
        }
      }
    } else {
      console.log(chalk.yellow(' PluginManager not available or missing methods'));
    }
    
  } catch (error) {
    console.error(chalk.red(' Failed to initialize PluginManager:'), error.message);
  }
}

// Download session from Mega with better error handling
async function downloadSessionFromMega() {
  if (!config.SESSION_ID || !config.SESSION_ID.includes('~')) {
    console.log(chalk.yellow(' No valid SESSION_ID found. Will use QR code authentication.'));
    return false;
  }

  try {
    console.log(chalk.yellow(' Downloading session from Mega...'));
    
    const fileData = config.SESSION_ID.split('~')[1];
    if (!fileData || !fileData.includes('#')) {
      throw new Error('Invalid SESSION_ID format. Expected: BotName~fileId#key');
    }

    const [fileId, key] = fileData.split('#');
    const file = File.fromURL(`https://mega.nz/file/${fileId}#${key}`);
    
    // Download with timeout and retry
    const downloadPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Download timeout after 45 seconds'));
      }, 45000);

      file.download((error, data) => {
        clearTimeout(timeout);
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });

    const data = await downloadPromise;
    await fs.promises.writeFile(credsPath, data);
    
    console.log(chalk.green(' Session downloaded successfully from Mega!'));
    return true;
    
  } catch (error) {
    console.log(chalk.red(' Failed to download session from Mega:'), error.message);
    console.log(chalk.yellow(' Will proceed with QR code authentication...'));
    return false;
  }
}

// Update bio with rate limiting
async function updateBio(socket) {
  if (!socket || !config.AUTO_BIO || bioUpdateCount >= MAX_BIO_UPDATES_PER_HOUR) {
    return;
  }

  try {
    const time = moment().tz(config.TIMEZONE).format('HH:mm:ss');
    const bioText = ` ${config.BOT_NAME} | Online at ${time}`;
    
    await socket.updateProfileStatus(bioText);
    bioUpdateCount++;
    
    console.log(chalk.cyan(` Bio updated: ${bioText}`));
  } catch (error) {
    if (!error.message.includes('rate')) {
      console.log(chalk.yellow(` Bio update failed: ${error.message}`));
    }
  }
}

// Calculate reconnection delay with exponential backoff
function getReconnectDelay() {
  const delay = Math.min(
    RECONNECT_DELAY.MIN * Math.pow(RECONNECT_DELAY.MULTIPLIER, connectionAttempts),
    RECONNECT_DELAY.MAX
  );
  return Math.floor(delay);
}

// Clean session files
function cleanSession() {
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      fs.mkdirSync(sessionDir, { recursive: true });
      console.log(chalk.yellow(' Session files cleaned'));
    }
  } catch (error) {
    console.log(chalk.yellow(' Could not clean session:', error.message));
  }
}

// Create WhatsApp socket with cloud-optimized settings
async function createWhatsAppSocket() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    
    console.log(chalk.blue(` Using WhatsApp Web version: ${version.join('.')}`));

    const socket = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: !config.SESSION_ID,
      browser: [config.BOT_NAME, 'Chrome', '4.0.0'],
      auth: state,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => null,
      
      // Cloud-optimized connection settings
      connectTimeoutMs: CONNECTION_TIMEOUT,
      defaultQueryTimeoutMs: CONNECTION_TIMEOUT,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 350,
      maxMsgRetryCount: 3,
      emitOwnEvents: true,
      
      // Reduce resource usage
      shouldSyncHistoryMessage: () => false,
      shouldIgnoreJid: jid => jid === 'status@broadcast',
      
      // Browser options
      mobile: false,
      fireInitQueries: true,
    });

    return { sock: socket, saveCreds };
    
  } catch (error) {
    console.error(chalk.red(' Failed to create WhatsApp socket:'), error.message);
    throw error;
  }
}

// Enhanced connection event handler
function setupConnectionHandler(socket, saveCreds) {
  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr, isNewLogin, isOnline }) => {
    try {
      if (qr) {
        console.log(chalk.yellow(' QR Code Generated - Scan with WhatsApp'));
        console.log(chalk.blue(' QR codes expire in 60 seconds. Please scan quickly!'));
        botStatus = 'waiting_for_qr';
      }
      
      if (connection === 'connecting') {
        console.log(chalk.yellow(` Connecting to WhatsApp... (Attempt ${connectionAttempts + 1}/${MAX_CONNECTION_ATTEMPTS})`));
        botStatus = 'connecting';
      }
      
      if (connection === 'open') {
        console.log(chalk.green(' Successfully connected to WhatsApp!'));
        console.log(chalk.cyan(` Connected as: ${socket.user?.name || 'Unknown'}`));
        console.log(chalk.cyan(` Phone: ${socket.user?.id?.split(':')[0] || 'Unknown'}`));
        
        botStatus = 'running';
        
        // Reset connection attempts and update last successful connection
        connectionAttempts = 0;
        lastSuccessfulConnection = Date.now();
        isConnecting = false;
        
        // Initialize plugins after successful connection
        await initializePluginManager();
        
        // Send startup notification (only for new logins or owner)
        if (isNewLogin || config.OWNER_NUMBER) {
          try {
            const pluginStats = getPluginStats();
            const startupMsg = ` *${config.BOT_NAME} Connected!*

 *Status:* Online 
 *Mode:* ${config.MODE.toUpperCase()}
 *Prefix:* ${config.PREFIX}
 *Time:* ${moment().tz(config.TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}

 *Plugins:* ${pluginStats.enabled}/${pluginStats.total} loaded

 *Active Features:*
${config.AUTO_READ ? '' : ''} Auto Read
${config.AUTO_REACT ? '' : ''} Auto React  
${config.WELCOME ? '' : ''} Welcome Messages
${config.REJECT_CALL ? '' : ''} Call Rejection

 Bot is ready to serve!

 Type *${config.PREFIX}menu* to see available commands.`;

            const targetJid = config.OWNER_NUMBER + '@s.whatsapp.net';
            await socket.sendMessage(targetJid, { text: startupMsg });
            console.log(chalk.green(' Startup notification sent to owner'));
            
          } catch (error) {
            console.log(chalk.yellow(' Could not send startup notification:', error.message));
          }
        }
        
        // Update bio
        setTimeout(() => updateBio(socket), 5000);
        
        // Start bio update interval (reduced frequency for cloud)
        if (config.AUTO_BIO) {
          setInterval(() => updateBio(socket), 15 * 60 * 1000); // Every 15 minutes
        }
      }
      
      if (connection === 'close') {
        isConnecting = false;
        botStatus = 'reconnecting';
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';
        
        console.log(chalk.red(` Connection closed`));
        console.log(chalk.yellow(` Status Code: ${statusCode || 'undefined'}`));
        console.log(chalk.yellow(` Reason: ${reason}`));
        
        // Handle different disconnection scenarios
        let shouldReconnect = true;
        let cleanSessionFirst = false;
        let customDelay = null;
        
        switch (statusCode) {
          case DisconnectReason.badSession:
            console.log(chalk.red(' Bad session detected'));
            cleanSessionFirst = true;
            customDelay = 10000;
            break;
            
          case DisconnectReason.connectionClosed:
            console.log(chalk.yellow(' Connection closed by server'));
            customDelay = 8000;
            break;
            
          case DisconnectReason.connectionLost:
            console.log(chalk.yellow(' Connection lost'));
            customDelay = 12000;
            break;
            
          case DisconnectReason.connectionReplaced:
            console.log(chalk.red(' Connection replaced - another instance detected'));
            customDelay = 30000;
            break;
            
          case DisconnectReason.loggedOut:
            console.log(chalk.red(' Logged out - session invalid'));
            cleanSessionFirst = true;
            customDelay = 15000;
            break;
            
          case DisconnectReason.restartRequired:
            console.log(chalk.yellow(' Restart required by server'));
            customDelay = 8000;
            break;
            
          case DisconnectReason.timedOut:
            console.log(chalk.red(' Connection timed out'));
            customDelay = 15000;
            break;
            
          default:
            console.log(chalk.yellow(' Unknown disconnection reason'));
            break;
        }
        
        // Check if we should attempt reconnection
        if (shouldReconnect && connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
          connectionAttempts++;
          
          // Clean session if required
          if (cleanSessionFirst) {
            cleanSession();
          }
          
          // Calculate delay
          const delay = customDelay || getReconnectDelay();
          console.log(chalk.blue(` Reconnecting in ${delay/1000} seconds... (${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})`));
          
          setTimeout(() => {
            startBot();
          }, delay);
          
        } else if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
          console.log(chalk.red(` Maximum reconnection attempts (${MAX_CONNECTION_ATTEMPTS}) reached`));
          console.log(chalk.blue(' Possible issues:'));
          console.log(chalk.cyan('   • WhatsApp account banned or restricted'));
          console.log(chalk.cyan('   • Network connectivity problems'));
          console.log(chalk.cyan('   • Invalid session data'));
          console.log(chalk.yellow(' Cleaning session and restarting in 2 minutes...'));
          
          cleanSession();
          botStatus = 'error';
          
          setTimeout(() => {
            connectionAttempts = 0;
            startBot();
          }, 2 * 60 * 1000);
          
        } else {
          console.log(chalk.red(' Bot stopped - manual intervention required'));
          botStatus = 'error';
          // Don't exit process in cloud environment - keep server running
        }
      }
      
    } catch (error) {
      console.error(chalk.red(' Connection handler error:'), error.message);
    }
  });

  // Save credentials when updated
  socket.ev.on('creds.update', saveCreds);
  
  return socket;
}

// FIXED: Setup message and event handlers with improved error handling
function setupEventHandlers(socket) {
  // Message handler with better error handling and null safety
  socket.ev.on('messages.upsert', async (messageUpdate) => {
    try {
      // Add comprehensive safety checks
      if (!messageUpdate || !messageUpdate.messages || !Array.isArray(messageUpdate.messages)) {
        return;
      }
      
      for (const message of messageUpdate.messages) {
        if (!message || !message.message) {
          continue;
        }
        
        // REMOVED: The problematic text processing that was causing the error
        // The error was in this section where null values were being processed with .replace()
      }
      
      if (typeof MessageHandler === 'function') {
        await MessageHandler(messageUpdate, socket, logger, config);
      }
      
    } catch (error) {
      console.error(chalk.red(' Message handler error:'), error.message);
      if (config.NODE_ENV === 'development') {
        console.error('Error stack:', error.stack);
      }
    }
  });

  // Call handler
  socket.ev.on('call', async (callUpdate) => {
    try {
      if (typeof CallHandler === 'function') {
        await CallHandler(callUpdate, socket, config);
      }
    } catch (error) {
      console.error(chalk.red(' Call handler error:'), error.message);
    }
  });

  // Group updates handler
  socket.ev.on('groups.update', async (groupUpdate) => {
    try {
      if (typeof GroupHandler === 'function') {
        await GroupHandler(socket, groupUpdate, config);
      }
    } catch (error) {
      console.error(chalk.red(' Group handler error:'), error.message);
    }
  });
  
  // Connection health monitoring
  socket.ev.on('connection.update', ({ connection }) => {
    if (connection === 'open') {
      lastSuccessfulConnection = Date.now();
    }
  });
}

// Safe plugin stats getter
function getPluginStats() {
  try {
    if (typeof PluginManager?.getPluginStats === 'function') {
      return PluginManager.getPluginStats();
    }
    return { total: 0, enabled: 0, disabled: 0 };
  } catch (error) {
    return { total: 0, enabled: 0, disabled: 0 };
  }
}

// Main bot startup function - DON'T START IMMEDIATELY
async function startBot() {
  if (isConnecting) {
    console.log(chalk.yellow(' Connection already in progress, skipping...'));
    return;
  }

  try {
    isConnecting = true;
    botStatus = 'connecting';
    console.log(chalk.magenta(` Starting ${config.BOT_NAME}...`));
    
    // Check for local session or download from Mega
    if (!fs.existsSync(credsPath) && config.SESSION_ID) {
      const downloaded = await downloadSessionFromMega();
      if (!downloaded) {
         console.log(chalk.yellow(' Proceeding with QR code authentication...'));
      }
    }
    
    const { sock: socket, saveCreds } = await createWhatsAppSocket();
    sock = socket;
    
    // Setup all event handlers
    setupConnectionHandler(socket, saveCreds);
    setupEventHandlers(socket);
    
    // Set bot mode
    socket.public = config.MODE === 'public';
    console.log(chalk.green(` Bot mode: ${config.MODE.toUpperCase()}`));
    
  } catch (error) {
    isConnecting = false;
    botStatus = 'error';
    console.error(chalk.red(' Bot startup error:'), error.message);
    
    const delay = getReconnectDelay();
    console.log(chalk.yellow(` Retrying in ${delay/1000} seconds...`));
    
    setTimeout(startBot, delay);
  }
}

// Express server setup with built-in security
const app = express();

// Apply security headers
app.use(addSecurityHeaders);

// Apply rate limiting
app.use(simpleRateLimit(15 * 60 * 1000, 100)); // 100 requests per 15 minutes

// Trust proxy (important for Koyeb)
app.set('trust proxy', true);

// Body parsing with limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CRITICAL FIX: Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Process error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Don't exit in production - let container orchestrator handle it
  if (config.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  if (server) {
    server.close(() => {
      console.log('HTTP server closed.');
      
      if (sock) {
        try {
          sock.end();
          console.log('WhatsApp connection closed.');
        } catch (error) {
          console.error('Error closing WhatsApp connection:', error);
        }
      }
      
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.log('Forcing shutdown...');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// FIXED: Main entry point - START SERVER FIRST, THEN BOT
async function main() {
    console.log(chalk.cyan(' Initializing Fresh WhatsApp Bot...'));
    console.log(chalk.blue(` Environment: ${config.NODE_ENV}`));
    console.log(chalk.blue(` Owner: ${config.OWNER_NUMBER}`));
    console.log(chalk.blue(` Admins: ${Array.isArray(config.ADMIN_NUMBERS) ? config.ADMIN_NUMBERS.join(', ') : config.ADMIN_NUMBERS}`));
    
    // Express server routes
    const startTime = Date.now();
    
    // Main status endpoint
    app.get('/', (req, res) => {
      try {
        const pluginStats = getPluginStats();
        res.json({
          status: botStatus,
          bot: config.BOT_NAME,
          mode: config.MODE,
          owner: config.OWNER_NUMBER,
          admins: config.ADMIN_NUMBERS,
          serverReady: serverReady,
          plugins: {
            total: pluginStats.total,
            enabled: pluginStats.enabled,
            disabled: pluginStats.disabled
          },
          uptime: Math.floor((Date.now() - startTime) / 1000),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    
    // CRITICAL FIX: Health check - ALWAYS returns 200 OK once server is ready
    app.get('/health', (req, res) => {
      try {
        const memUsage = process.memoryUsage();
        const healthData = {
          status: 'healthy', // ALWAYS healthy once server starts
          serverReady: serverReady,
          botStatus: botStatus,
          connected: botStatus === 'running',
          socketState: sock?.readyState || 'unknown',
          uptime: process.uptime(),
          lastConnection: new Date(lastSuccessfulConnection).toISOString(),
          connectionAttempts,
          timeSinceLastConnection: Math.round((Date.now() - lastSuccessfulConnection) / 1000),
          isConnecting,
          memory: {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            external: Math.round(memUsage.external / 1024 / 1024) // MB
          },
          timestamp: new Date().toISOString()
        };
        
        // ALWAYS return 200 - server is healthy if it can respond
        res.status(200).json(healthData);
      } catch (error) {
        // Even on error, return 200 with error info
        res.status(200).json({
          status: 'server_healthy',
          error: error.message,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        });
      }
    });
    
        // Readiness check - only ready when bot is connected
    app.get('/ready', (req, res) => {
      try {
        const isReady = serverReady && sock?.user && botStatus === 'running';
        if (isReady) {
          res.status(200).json({ status: 'ready', connected: true, serverReady: true });
        } else {
          res.status(503).json({ 
            status: 'not ready', 
            connected: false, 
            serverReady: serverReady,
            botStatus: botStatus 
          });
        }
      } catch (error) {
        res.status(503).json({ status: 'error', error: error.message });
      }
    });
    
    // Simple ping endpoint
    app.get('/ping', (req, res) => {
      res.status(200).json({
        status: 'pong',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        serverReady: serverReady
      });
    });
    
    // QR status
    app.get('/qr', (req, res) => {
      try {
        if (sock?.user) {
          res.json({ status: 'connected', message: 'Bot is already connected' });
        } else {
          res.json({ status: botStatus, message: 'Check console for QR code' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    
    // Plugin Management API Routes
    app.get('/plugins', async (req, res) => {
      try {
        if (typeof PluginManager?.getAllPlugins === 'function') {
          const plugins = await PluginManager.getAllPlugins();
          res.json(plugins);
        } else {
          res.json({ plugins: [], message: 'PluginManager not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.get('/plugins/stats', async (req, res) => {
      try {
        const stats = getPluginStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.get('/plugins/health', async (req, res) => {
      try {
        if (typeof PluginManager?.healthCheck === 'function') {
          const health = await PluginManager.healthCheck();
          res.json(health);
        } else {
          res.json({ healthy: true, issues: [] });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.post('/plugins/:filename/enable', async (req, res) => {
      try {
        const { filename } = req.params;
        if (typeof PluginManager?.enablePlugin === 'function') {
          const result = await PluginManager.enablePlugin(filename);
          res.json({ success: true, result });
        } else {
          res.status(404).json({ error: 'PluginManager not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.post('/plugins/:filename/disable', async (req, res) => {
      try {
        const { filename } = req.params;
        if (typeof PluginManager?.disablePlugin === 'function') {
          const result = await PluginManager.disablePlugin(filename);
          res.json({ success: true, result });
        } else {
          res.status(404).json({ error: 'PluginManager not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.post('/plugins/:filename/reload', async (req, res) => {
      try {
        const { filename } = req.params;
        if (typeof PluginManager?.reloadPlugin === 'function') {
          const result = await PluginManager.reloadPlugin(filename);
          res.json({ success: true, result });
        } else {
          res.status(404).json({ error: 'PluginManager not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.post('/plugins/reload-all', async (req, res) => {
      try {
        if (typeof PluginManager?.reloadAllPlugins === 'function') {
          const result = await PluginManager.reloadAllPlugins();
          res.json({ success: true, result });
        } else {
          res.status(404).json({ error: 'PluginManager not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // API endpoint for bot info (used by the HTML page)
    app.get('/api/bot-info', (req, res) => {
      try {
        const memUsage = process.memoryUsage();
        const pluginStats = getPluginStats();
        
        res.json({
          botName: config.BOT_NAME,
          status: botStatus,
          mode: config.MODE,
          prefix: config.PREFIX,
          ownerNumber: config.OWNER_NUMBER,
          serverReady: serverReady,
          features: {
            autoRead: config.AUTO_READ,
            autoReact: config.AUTO_REACT,
            welcome: config.WELCOME,
            antilink: config.ANTILINK,
            rejectCall: config.REJECT_CALL,
            autoBio: config.AUTO_BIO
          },
          plugins: pluginStats,
          uptime: process.uptime(),
          memory: {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) // MB
          },
          lastConnection: new Date(lastSuccessfulConnection).toISOString(),
          connectionAttempts,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // CRITICAL FIX: Catch all route - serve index.html for any unmatched routes
    app.get('*', (req, res) => {
      const htmlPath = path.join(__dirname, 'public', 'index.html');
      if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
      } else {
        res.status(404).json({ error: 'HTML file not found' });
      }
    });

    // CRITICAL CHANGE: Start Express server FIRST, mark as ready, THEN start bot
    server = app.listen(config.PORT, '0.0.0.0', () => {
      console.log(chalk.blue(` Server running on port ${config.PORT}`));
      console.log(chalk.cyan(` Health check: http://localhost:${config.PORT}/health`));
      console.log(chalk.cyan(` Ping endpoint: http://localhost:${config.PORT}/ping`));
      console.log(chalk.cyan(` Plugin API: http://localhost:${config.PORT}/plugins`));
      console.log(chalk.cyan(` Web Interface: http://localhost:${config.PORT}/`));
      
      // MARK SERVER AS READY IMMEDIATELY
      serverReady = true;
      console.log(chalk.green(' Server marked as ready for health checks'));
      
      // DELAY bot startup to ensure server is fully ready
      setTimeout(() => {
        console.log(chalk.blue(' Starting WhatsApp bot connection...'));
        startBot();
      }, 3000); // 3 second delay
    });

    // Server error handling
    server.on('error', (error) => {
      console.error(chalk.red(' Server error:'), error.message);
      if (error.code === 'EADDRINUSE') {
        console.log(chalk.yellow(` Port ${config.PORT} is already in use`));
        process.exit(1);
      }
    });

    // Keep-alive mechanism for cloud deployments - ONLY after server is ready
    if (config.NODE_ENV === 'production') {
      setTimeout(() => {
        // Send periodic keep-alive requests to self (prevents sleeping)
        setInterval(async () => {
          try {
            await axios.get(`http://localhost:${config.PORT}/ping`, { 
              timeout: 5000,
              headers: { 'User-Agent': 'KeepAlive-Bot' }
            });
          } catch (error) {
            // Ignore keep-alive errors
          }
        }, 5 * 60 * 1000); // Every 5 minutes
      }, 30000); // Start keep-alive after 30 seconds
    }

    // Memory monitoring and cleanup
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      
      if (memUsedMB > 400) { // Alert if memory usage exceeds 400MB
        console.log(chalk.yellow(` High memory usage: ${memUsedMB}MB`));
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          console.log(chalk.blue(' Garbage collection triggered'));
        }
      }
    }, 2 * 60 * 1000); // Every 2 minutes

    // Connection health monitoring - only start after bot initialization
    setTimeout(() => {
      setInterval(() => {
        const timeSinceLastConnection = Date.now() - lastSuccessfulConnection;
        const hoursOffline = timeSinceLastConnection / (1000 * 60 * 60);
        
        if (hoursOffline > 2 && botStatus !== 'running' && !isConnecting) {
          console.log(chalk.yellow(` Bot has been offline for ${Math.round(hoursOffline)} hours`));
          console.log(chalk.blue(' Attempting to restart connection...'));
          
          // Reset connection attempts and try to reconnect
          connectionAttempts = Math.floor(connectionAttempts / 2);
          startBot();
        }
      }, 30 * 60 * 1000); // Every 30 minutes
    }, 60000); // Start monitoring after 1 minute

    console.log(chalk.green(' Application initialized successfully!'));
    console.log(chalk.blue(' Ready to serve WhatsApp bot requests'));
}

// Call the main function to start everything
main().catch(error => {
  console.error(chalk.red(' Fatal error during startup:'), error);
  process.exit(1);
});
