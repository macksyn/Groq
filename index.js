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
// Import the new welcome/goodbye plugin handlers
import welcomeGoodbyeCommandHandler, { groupParticipantsUpdateHandler as welcomeGoodbyeGroupHandler } from './plugins/welcome_goodbye.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration with better defaults for cloud deployment
const config = {
  SESSION_ID: process.env.SESSION_ID || '',
  PREFIX: process.env.PREFIX || '.',
  BOT_NAME: process.env.BOT_NAME || 'Fresh WhatsApp Bot',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '',
  OWNER_NAME: process.env.OWNER_NAME || 'Bot Owner',
  MODE: process.env.MODE || 'public',
  AUTO_BIO: process.env.AUTO_BIO === 'true',
  AUTO_READ: process.env.AUTO_READ === 'true',
  AUTO_REACT: process.env.AUTO_REACT === 'true',
  WELCOME: process.env.WELCOME === 'true',
  ANTILINK: process.env.ANTILINK === 'true',
  REJECT_CALL: process.env.REJECT_CALL === 'true',
  AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN === 'true',
  ADMIN_NUMBERS: process.env.ADMIN_NUMBERS || '',
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  TIMEZONE: process.env.TIMEZONE || 'Africa/Lagos'
};

// Validate required configuration
if (!config.OWNER_NUMBER) {
  console.error(chalk.red('❌ OWNER_NUMBER is required! Please set it in environment variables.'));
  process.exit(1);
}

console.log(chalk.cyan(`
╭─────────────────────────────────────╮
│       🤖 ${config.BOT_NAME}       │
│     Starting WhatsApp Bot...        │
╰─────────────────────────────────────╯
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
    console.log(chalk.blue('🔌 Initializing PluginManager...'));

    // Check if PluginManager exists and has required methods
    if (typeof PluginManager?.loadPlugins === 'function') {
      await PluginManager.loadPlugins();

      // Show plugin health check on startup
      if (typeof PluginManager?.healthCheck === 'function') {
        const health = await PluginManager.healthCheck();
        if (!health.healthy) {
          console.log(chalk.yellow('⚠️ Plugin health issues detected:'));
          health.issues.forEach(issue => {
            console.log(chalk.yellow(`   • ${issue}`));
          });
        }
      }
    } else {
      console.log(chalk.yellow('⚠️ PluginManager not available or missing methods'));
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to initialize PluginManager:'), error.message);
  }
}

// Download session from Mega with better error handling
async function downloadSessionFromMega() {
  if (!config.SESSION_ID || !config.SESSION_ID.includes('~')) {
    console.log(chalk.yellow('📝 No valid SESSION_ID found. Will use QR code authentication.'));
    return false;
  }

  try {
    console.log(chalk.yellow('📥 Downloading session from Mega...'));

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

    console.log(chalk.green('✅ Session downloaded successfully from Mega!'));
    return true;

  } catch (error) {
    console.log(chalk.red('❌ Failed to download session from Mega:'), error.message);
    console.log(chalk.yellow('💡 Will proceed with QR code authentication...'));
    return false;
  }
}

// Update bio with rate limiting
async function updateBio(socket) {
  if (!socket || !config.AUTO_BIO || bioUpdateCount >= MAX_BIO_UPDATES_PER_HOUR) {
    return;
  }

  try {
    // Check if socket is healthy before updating bio
    if (!isConnectionHealthy(socket)) {
      console.log(chalk.yellow('⚠️ Skipping bio update - connection not healthy'));
      return;
    }

    const time = moment().tz(config.TIMEZONE).format('HH:mm:ss');
    const bioText = `🤖 ${config.BOT_NAME} | Online at ${time}`;

    await socket.updateProfileStatus(bioText);
    bioUpdateCount++;

    console.log(chalk.cyan(`📝 Bio updated: ${bioText}`));
  } catch (error) {
    if (!error.message.includes('rate')) {
      console.log(chalk.yellow(`⚠️ Bio update failed: ${error.message}`));
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
      console.log(chalk.yellow('🗑️ Session files cleaned'));
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️ Could not clean session:', error.message));
  }
}

// Create WhatsApp socket with cloud-optimized settings
async function createWhatsAppSocket() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(chalk.blue(`📱 Using WhatsApp Web version: ${version.join('.')}`));

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
    console.error(chalk.red('❌ Failed to create WhatsApp socket:'), error.message);
    throw error;
  }
}

// Enhanced isConnectionHealthy function with detailed logging
function isConnectionHealthy(socket) {
  if (!socket) {
    return false;
  }
  if (!socket.user?.id) {
    return false;
  }
  if (!socket.ws) {
    return false;
  }
  if (socket.ws.readyState !== 1) {
    return false;
  }
  return true;
}

// Enhanced sendMessageSafely with better error handling and WebSocket checks
async function sendMessageSafely(socket, jid, message, options = {}) {
  const maxRetries = 5;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wait for WebSocket to be ready
      let wsReady = false;
      let wsChecks = 0;
      const maxWsChecks = 10;
      
      while (!wsReady && wsChecks < maxWsChecks) {
        if (isConnectionHealthy(socket)) {
          wsReady = true;
        } else {
          wsChecks++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (!wsReady) {
        throw new Error(`WebSocket not ready after ${maxWsChecks} seconds`);
      }
      
      // Add delay between attempts
      if (attempt > 1) {
        const delay = 3000 * attempt; // 3, 6, 9, 12, 15 seconds
        console.log(chalk.blue(`⏳ Waiting ${delay/1000}s before retry...`));
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const result = await socket.sendMessage(jid, message, options);
      return result;
      
    } catch (error) {
      console.log(chalk.red(`❌ Send attempt ${attempt}/${maxRetries} failed: ${error.message}`));
      
      if (attempt === maxRetries) {
        throw new Error(`Failed to send message after ${maxRetries} attempts: ${error.message}`);
      }
    }
  }
}

// Enhanced connection event handler with WebSocket readiness checks
function setupConnectionHandler(socket, saveCreds) {
  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr, isNewLogin, isOnline }) => {
    try {
      if (qr) {
        console.log(chalk.yellow('📱 QR Code Generated - Scan with WhatsApp'));
        console.log(chalk.blue('💡 QR codes expire in 60 seconds. Please scan quickly!'));
        botStatus = 'waiting_for_qr';
      }

      if (connection === 'connecting') {
        console.log(chalk.yellow(`🔄 Connecting to WhatsApp... (Attempt ${connectionAttempts + 1}/${MAX_CONNECTION_ATTEMPTS})`));
        botStatus = 'connecting';
      }

      if (connection === 'open') {
        console.log(chalk.green('✅ Successfully connected to WhatsApp!'));
        console.log(chalk.cyan(`📱 Connected as: ${socket.user?.name || 'Unknown'}`));
        console.log(chalk.cyan(`📞 Phone: ${socket.user?.id?.split(':')[0] || 'Unknown'}`));

        botStatus = 'running';

        // Reset connection attempts and update last successful connection
        connectionAttempts = 0;
        lastSuccessfulConnection = Date.now();
        isConnecting = false;

        // CRITICAL FIX: Wait for WebSocket to be fully ready
        console.log(chalk.blue('⏳ Waiting for WebSocket to be fully ready...'));
        
        // Wait for WebSocket to be in OPEN state (readyState === 1)
        let wsReady = false;
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds maximum wait
        
        while (!wsReady && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          attempts++;
          
          if (socket.ws && socket.ws.readyState === 1 && socket.user?.id) {
            wsReady = true;
            console.log(chalk.green(`✅ WebSocket ready after ${attempts} seconds`));
          } else {
            if (attempts % 5 === 0) { // Log every 5 seconds to reduce spam
              console.log(chalk.yellow(`⏳ WebSocket not ready yet... (${attempts}/${maxAttempts}) - State: ${socket.ws?.readyState || 'unknown'}`));
            }
          }
        }
        
        if (!wsReady) {
          console.log(chalk.red('❌ WebSocket failed to become ready within 30 seconds'));
        }

        // Initialize plugins after connection is established
        try {
          await initializePluginManager();
          console.log(chalk.green('✅ PluginManager initialized'));
        } catch (error) {
          console.error(chalk.red('❌ Plugin initialization failed:'), error.message);
        }

        // Send startup notification ONLY if WebSocket is ready
        if (wsReady && config.OWNER_NUMBER) {
          // Additional delay to ensure everything is stable
          setTimeout(async () => {
            try {
              console.log(chalk.blue('📤 Sending startup notification...'));
              
              const pluginStats = getPluginStats();
              const startupMsg = `🤖 *${config.BOT_NAME} Connected!*

📊 *Status:* Online ✅
⚙️ *Mode:* ${config.MODE.toUpperCase()}
🎯 *Prefix:* ${config.PREFIX}
⏰ *Time:* ${moment().tz(config.TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}

🔌 *Plugins:* ${pluginStats.enabled}/${pluginStats.total} loaded

🎮 *Active Features:*
${config.AUTO_READ ? '✅' : '❌'} Auto Read
${config.AUTO_REACT ? '✅' : '❌'} Auto React  
${config.WELCOME ? '✅' : '❌'} Welcome Messages
${config.REJECT_CALL ? '✅' : '❌'} Call Rejection

🔥 Bot is ready to serve!

💡 Type *${config.PREFIX}menu* to see available commands.`;

              const targetJid = config.OWNER_NUMBER + '@s.whatsapp.net';
              await sendMessageSafely(socket, targetJid, { text: startupMsg });
              console.log(chalk.green('📤 Startup notification sent successfully'));

            } catch (error) {
              console.log(chalk.yellow('⚠️ Could not send startup notification:', error.message));
            }
          }, 5000); // 5 second delay after WebSocket is ready
        }

        // Update bio with delay
        setTimeout(() => updateBio(socket), 10000); // 10 second delay

        // Start bio update interval (reduced frequency for cloud)
        if (config.AUTO_BIO) {
          setInterval(() => updateBio(socket), 15 * 60 * 1000); // Every 15 minutes
        }
        
        // Start health monitoring after everything is ready
        setTimeout(() => {
          try {
            if (typeof startHealthMonitoring === 'function') {
              startHealthMonitoring();
            }
          } catch (error) {
            console.warn('Health monitoring setup warning:', error.message);
          }
        }, 15000); // Start monitoring after 15 seconds
      }

      if (connection === 'close') {
        isConnecting = false;
        botStatus = 'reconnecting';
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';

        console.log(chalk.red(`❌ Connection closed`));
        console.log(chalk.yellow(`📝 Status Code: ${statusCode || 'undefined'}`));
        console.log(chalk.yellow(`📝 Reason: ${reason}`));

        // Handle different disconnection scenarios
        let shouldReconnect = true;
        let cleanSessionFirst = false;
        let customDelay = null;

        switch (statusCode) {
          case DisconnectReason.badSession:
            console.log(chalk.red('🚫 Bad session detected'));
            cleanSessionFirst = true;
            customDelay = 10000;
            break;

          case DisconnectReason.connectionClosed:
            console.log(chalk.yellow('🔌 Connection closed by server'));
            customDelay = 8000;
            break;

          case DisconnectReason.connectionLost:
            console.log(chalk.yellow('📡 Connection lost'));
            customDelay = 12000;
            break;

          case DisconnectReason.connectionReplaced:
            console.log(chalk.red('🔄 Connection replaced - another instance detected'));
            customDelay = 30000;
            break;

          case DisconnectReason.loggedOut:
            console.log(chalk.red('🚪 Logged out - session invalid'));
            cleanSessionFirst = true;
            customDelay = 15000;
            break;

          case DisconnectReason.restartRequired:
            console.log(chalk.yellow('🔄 Restart required by server'));
            customDelay = 8000;
            break;

          case DisconnectReason.timedOut:
            console.log(chalk.red('⏰ Connection timed out'));
            customDelay = 15000;
            break;

          default:
            console.log(chalk.yellow('❓ Unknown disconnection reason'));
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
          console.log(chalk.blue(`🔄 Reconnecting in ${delay/1000} seconds... (${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})`));

          setTimeout(() => {
            startBot();
          }, delay);

        } else if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
          console.log(chalk.red(`💀 Maximum reconnection attempts (${MAX_CONNECTION_ATTEMPTS}) reached`));
          console.log(chalk.blue('💡 Possible issues:'));
          console.log(chalk.cyan('   • WhatsApp account banned or restricted'));
          console.log(chalk.cyan('   • Network connectivity problems'));
          console.log(chalk.cyan('   • Invalid session data'));
          console.log(chalk.yellow('🔄 Cleaning session and restarting in 2 minutes...'));

          cleanSession();
          botStatus = 'error';

          setTimeout(() => {
            connectionAttempts = 0;
            startBot();
          }, 2 * 60 * 1000);

        } else {
          console.log(chalk.red('🛑 Bot stopped - manual intervention required'));
          botStatus = 'error';
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ Connection handler error:'), error.message);
    }
  });

  // Save credentials when updated
  socket.ev.on('creds.update', saveCreds);

  return socket;
}

// Setup message and event handlers with improved error handling
function setupEventHandlers(socket) {
  // Message handler with better error handling
  socket.ev.on('messages.upsert', async (messageUpdate) => {
    try {
      // Add safety checks
      if (!messageUpdate || !messageUpdate.messages || !Array.isArray(messageUpdate.messages)) {
        return;
      }

      for (const message of messageUpdate.messages) {
        if (!message || !message.message) {
          continue;
        }
        
        // Call the Welcome/Goodbye command handler for every message
        if (typeof welcomeGoodbyeCommandHandler === 'function') {
           await welcomeGoodbyeCommandHandler(message, socket, config);
        }
        
        let messageText = '';

        try {
          if (message.message.conversation) {
            messageText = message.message.conversation;
          } else if (message.message.extendedTextMessage?.text) {
            messageText = message.message.extendedTextMessage.text;
          } else if (message.message.imageMessage?.caption) {
            messageText = message.message.imageMessage.caption;
          } else if (message.message.videoMessage?.caption) {
            messageText = message.message.videoMessage.caption;
          }

          if (messageText && typeof messageText === 'string' && messageText.length > 0) {
            messageText = messageText.replace(/\s+/g, ' ').trim();
          } else {
            messageText = '';
          }

          if (typeof messageText !== 'string') {
            messageText = '';
          }

        } catch (textError) {
          console.log(chalk.yellow('⚠️ Text extraction error:', textError.message));
          messageText = '';
          continue;
        }
      }

      if (typeof MessageHandler === 'function') {
        await MessageHandler(messageUpdate, socket, logger, config);
      }

    } catch (error) {
      console.error(chalk.red('❌ Message handler error:'), error.message);
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
      console.error(chalk.red('❌ Call handler error:'), error.message);
    }
  });

  // Group updates handler
  socket.ev.on('groups.update', async (groupUpdate) => {
    try {
      if (typeof GroupHandler === 'function') {
        await GroupHandler(socket, groupUpdate, config);
      }
    } catch (error) {
      console.error(chalk.red('❌ Group handler error:'), error.message);
    }
  });

  // Welcome & Goodbye handler for member join/leave events
  socket.ev.on('group-participants.update', async (event) => {
    try {
      if (typeof welcomeGoodbyeGroupHandler === 'function') {
        await welcomeGoodbyeGroupHandler(event, socket);
      }
    } catch (error) {
      console.error(chalk.red('❌ Welcome/Goodbye handler error:'), error.message);
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

// Make functions globally available
global.sendMessageSafely = sendMessageSafely;
global.isConnectionHealthy = isConnectionHealthy;

// Main bot startup function
async function startBot() {
  if (isConnecting) {
    console.log(chalk.yellow('⏳ Connection already in progress, skipping...'));
    return;
  }

  try {
    isConnecting = true;
    botStatus = 'connecting';
    console.log(chalk.magenta(`🚀 Starting ${config.BOT_NAME}...`));

    // Check for local session or download from Mega
    if (!fs.existsSync(credsPath) && config.SESSION_ID) {
      const downloaded = await downloadSessionFromMega();
      if (!downloaded) {
         console.log(chalk.yellow('📱 Proceeding with QR code authentication...'));
      }
    }

    const { sock: socket, saveCreds } = await createWhatsAppSocket();
    sock = socket;

    // Setup all event handlers
    setupConnectionHandler(socket, saveCreds);
    setupEventHandlers(socket);

    // Set bot mode
    socket.public = config.MODE === 'public';
    console.log(chalk.green(`🎯 Bot mode: ${config.MODE.toUpperCase()}`));

  } catch (error) {
    isConnecting = false;
    botStatus = 'error';
    console.error(chalk.red('❌ Bot startup error:'), error.message);

    const delay = getReconnectDelay();
    console.log(chalk.yellow(`🔄 Retrying in ${delay/1000} seconds...`));

    setTimeout(startBot, delay);
  }
}

// Express server setup with built-in security
const app = express();

// Apply security headers
app.use(addSecurityHeaders);

// Apply rate limiting
app.use(simpleRateLimit(15 * 60 * 1000, 100)); // 100 requests per 15 minutes

// Trust proxy (important for cloud platforms)
app.set('trust proxy', true);

// Body parsing with limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Process error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (config.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
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

// Enhanced health monitoring and recovery system
let lastPluginHealthCheck = Date.now();
let scheduledTasksFailCount = 0;
const MAX_SCHEDULED_TASK_FAILS = 5;

// Plugin and scheduled task health monitoring
async function monitorPluginHealth() {
  try {
    if (!sock || botStatus !== 'running') return;

    if (typeof PluginManager?.healthCheck === 'function') {
      const health = await PluginManager.healthCheck();
      
      // Log health status
      if (!health.healthy) {
        console.log(chalk.yellow(`⚠️ Plugin health issues detected: ${health.issues.length} issues`));
        health.issues.forEach(issue => {
          console.log(chalk.yellow(`   • ${issue}`));
        });
        
        // Check for critical issues with scheduled tasks
        if (health.criticalIssues > 2) {
          scheduledTasksFailCount++;
          console.log(chalk.red(`🚨 Critical plugin issues detected (${scheduledTasksFailCount}/${MAX_SCHEDULED_TASK_FAILS})`));
          
          // Force reload plugins if too many failures
          if (scheduledTasksFailCount >= MAX_SCHEDULED_TASK_FAILS) {
            console.log(chalk.red('🔄 Too many critical issues, forcing plugin reload...'));
            await PluginManager.loadPlugins(true); // Force reload
            scheduledTasksFailCount = 0; // Reset counter
            
            // Send alert to owner
            if (sock && config.OWNER_NUMBER) {
              try {
                const alertMsg = `🚨 *Bot Health Alert*\n\n❌ Critical plugin issues detected!\n🔄 Plugins have been automatically reloaded.\n⏰ Time: ${new Date().toLocaleString()}\n\n📊 *Health Report:*\n• Issues: ${health.issues.length}\n• Critical: ${health.criticalIssues}\n• Scheduled Tasks: ${health.scheduledTasks?.stuck || 0} stuck\n\n✅ Recovery completed automatically.`;
                await sendMessageSafely(sock, config.OWNER_NUMBER + '@s.whatsapp.net', { text: alertMsg });
              } catch (error) {
                console.error('Failed to send health alert:', error.message);
              }
            }
          }
        } else {
          scheduledTasksFailCount = Math.max(0, scheduledTasksFailCount - 1); // Gradually decrease if improving
        }
        
        // Check specifically for stuck scheduled tasks
        if (health.scheduledTasks?.stuck > 0) {
          console.log(chalk.yellow(`⚠️ ${health.scheduledTasks.stuck} scheduled tasks are stuck`));
          
          // Try to restart stuck tasks
          if (typeof PluginManager?.getScheduledTaskStatus === 'function') {
            const taskStatus = PluginManager.getScheduledTaskStatus();
            for (const task of taskStatus.tasks) {
              if (task.errorCount > 3) {
                console.log(chalk.blue(`🔄 Attempting to restart stuck task: ${task.key}`));
                try {
                  if (typeof PluginManager?.triggerScheduledTask === 'function') {
                    await PluginManager.triggerScheduledTask(task.key);
                  }
                } catch (error) {
                  console.error(chalk.red(`❌ Failed to restart task ${task.key}:`), error.message);
                }
              }
            }
          }
        }
      } else {
        // Reset fail count on healthy status
        scheduledTasksFailCount = Math.max(0, scheduledTasksFailCount - 1);
      }
    }
    
    lastPluginHealthCheck = Date.now();
    
  } catch (error) {
    console.error(chalk.red('❌ Plugin health monitoring error:'), error.message);
  }
}

// Memory monitoring and cleanup
async function monitorMemoryUsage() {
  try {
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    
    // Log memory usage every hour
    console.log(chalk.cyan(`💾 Memory: ${memUsedMB}MB used, ${memTotalMB}MB total`));
    
    // Alert if memory usage is high
    if (memUsedMB > 400) {
      console.log(chalk.yellow(`⚠️ High memory usage: ${memUsedMB}MB`));
      
      // Force garbage collection if available
      if (global.gc) {
        console.log(chalk.blue('🗑️ Running garbage collection...'));
        global.gc();
        
        const newMemUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        console.log(chalk.green(`✅ Memory after GC: ${newMemUsage}MB (freed ${memUsedMB - newMemUsage}MB)`));
      }
      
      // Send memory alert to owner if usage is critical
      if (memUsedMB > 500 && sock && config.OWNER_NUMBER) {
        try {
          const memoryAlert = `⚠️ *Memory Alert*\n\n🔴 High memory usage: ${memUsedMB}MB\n📊 Total allocated: ${memTotalMB}MB\n⏰ Time: ${new Date().toLocaleString()}\n\n💡 Consider restarting the bot if this persists.`;
          await sendMessageSafely(sock, config.OWNER_NUMBER + '@s.whatsapp.net', { text: memoryAlert });
        } catch (error) {
          console.warn('Failed to send memory alert:', error.message);
        }
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Memory monitoring error:'), error.message);
  }
}

// Connection health monitoring
function monitorConnectionHealth() {
  try {
    const timeSinceLastConnection = Date.now() - lastSuccessfulConnection;
    const hoursOffline = timeSinceLastConnection / (1000 * 60 * 60);
    
    // Check if we've been offline too long
    if (hoursOffline > 1 && botStatus !== 'running' && !isConnecting) {
      console.log(chalk.yellow(`⚠️ Bot offline for ${Math.round(hoursOffline * 10) / 10} hours`));
      
      // Attempt recovery if not already connecting
      if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
        console.log(chalk.blue('🔄 Attempting connection recovery...'));
        connectionAttempts = Math.floor(connectionAttempts / 2); // Reset attempts partially
        startBot();
      }
    }
    
    // Check WebSocket connection health
    if (sock && sock.ws) {
      const wsState = sock.ws.readyState;
      if (wsState !== 1 && botStatus === 'running') {
        console.log(chalk.yellow(`⚠️ WebSocket state unhealthy: ${wsState}`));
        botStatus = 'reconnecting';
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Connection health monitoring error:'), error.message);
  }
}

// Start all monitoring processes after successful bot initialization
function startHealthMonitoring() {
  console.log(chalk.blue('🏥 Starting health monitoring systems...'));
  
  // Plugin health check every 15 minutes
  setInterval(monitorPluginHealth, 15 * 60 * 1000);
  
  // Memory monitoring every 30 minutes
  setInterval(monitorMemoryUsage, 30 * 60 * 1000);
  
  // Connection health check every 10 minutes
  setInterval(monitorConnectionHealth, 10 * 60 * 1000);
  
  // Run initial checks after 2 minutes
  setTimeout(() => {
    monitorPluginHealth();
    monitorMemoryUsage();
    monitorConnectionHealth();
  }, 2 * 60 * 1000);
  
  console.log(chalk.green('✅ Health monitoring systems started'));
}

// Main entry point - START SERVER FIRST, THEN BOT
async function main() {
    console.log(chalk.cyan('🎬 Initializing Fresh WhatsApp Bot...'));
    console.log(chalk.blue(`📊 Environment: ${config.NODE_ENV}`));
    console.log(chalk.blue(`👑 Owner: ${config.OWNER_NUMBER}`));

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

    // Health check - ALWAYS returns 200 OK once server is ready
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

    // Manual recovery API endpoints
    app.post('/api/restart-plugins', async (req, res) => {
      try {
        console.log(chalk.blue('🔄 Manual plugin restart requested via API'));
        if (typeof PluginManager?.loadPlugins === 'function') {
          await PluginManager.loadPlugins(true);
          res.json({ success: true, message: 'Plugins restarted successfully' });
        } else {
          res.json({ success: false, message: 'PluginManager not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/trigger-scheduled-task/:taskKey', async (req, res) => {
      try {
        const { taskKey } = req.params;
        if (typeof PluginManager?.triggerScheduledTask === 'function') {
          await PluginManager.triggerScheduledTask(taskKey);
          res.json({ success: true, message: `Task ${taskKey} triggered successfully` });
        } else {
          res.json({ success: false, message: 'PluginManager not available' });
        }
      } catch (error) {
        res.status(404).json({ error: error.message });
      }
    });

    app.get('/api/scheduled-tasks', async (req, res) => {
      try {
        if (typeof PluginManager?.getScheduledTaskStatus === 'function') {
          const status = PluginManager.getScheduledTaskStatus();
          res.json(status);
        } else {
          res.json({ tasks: [], message: 'PluginManager not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/force-gc', (req, res) => {
      try {
        if (global.gc) {
          const beforeMem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
          global.gc();
          const afterMem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
          res.json({ 
            success: true, 
            beforeMB: beforeMem, 
            afterMB: afterMem, 
            freedMB: beforeMem - afterMem 
          });
        } else {
          res.json({ success: false, message: 'Garbage collection not available' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Enhanced health check endpoint with plugin status
    app.get('/api/health-detailed', async (req, res) => {
      try {
        let pluginHealth = { healthy: true, issues: [], criticalIssues: 0, stats: {} };
        let scheduledTasks = { total: 0, active: 0, stuck: 0 };
        
        if (typeof PluginManager?.healthCheck === 'function') {
          pluginHealth = await PluginManager.healthCheck();
        }
        
        if (typeof PluginManager?.getScheduledTaskStatus === 'function') {
          scheduledTasks = PluginManager.getScheduledTaskStatus();
        }
        
        const memUsage = process.memoryUsage();
        
        const healthData = {
          status: 'healthy',
          serverReady: serverReady,
          botStatus: botStatus,
          connected: botStatus === 'running',
          uptime: process.uptime(),
          lastConnection: new Date(lastSuccessfulConnection).toISOString(),
          connectionAttempts,
          plugins: {
            healthy: pluginHealth.healthy,
            issues: pluginHealth.issues.length,
            criticalIssues: pluginHealth.criticalIssues,
            stats: pluginHealth.stats
          },
          scheduledTasks: {
            total: scheduledTasks.total,
            active: scheduledTasks.active,
            stuck: scheduledTasks.stuck
          },
          memory: {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024),
            rss: Math.round(memUsage.rss / 1024 / 1024)
          },
          lastHealthCheck: new Date().toISOString()
        };
        
        res.json(healthData);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Catch all route - serve index.html for any unmatched routes
    app.get('*', (req, res) => {
      const htmlPath = path.join(__dirname, 'public', 'index.html');
      if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
      } else {
        res.status(404).json({ error: 'HTML file not found' });
      }
    });

    // Start Express server FIRST, mark as ready, THEN start bot
    server = app.listen(config.PORT, '0.0.0.0', () => {
      console.log(chalk.blue(`🌐 Server running on port ${config.PORT}`));
      console.log(chalk.cyan(`🔗 Health check: http://localhost:${config.PORT}/health`));
      console.log(chalk.cyan(`🏓 Ping endpoint: http://localhost:${config.PORT}/ping`));
      console.log(chalk.cyan(`🔌 Plugin API: http://localhost:${config.PORT}/plugins`));
      console.log(chalk.cyan(`🌍 Web Interface: http://localhost:${config.PORT}/`));

      // MARK SERVER AS READY IMMEDIATELY
      serverReady = true;
      console.log(chalk.green('✅ Server marked as ready for health checks'));

      // DELAY bot startup to ensure server is fully ready
      setTimeout(() => {
        console.log(chalk.blue('🤖 Starting WhatsApp bot connection...'));
        startBot();
      }, 3000); // 3 second delay
    });

    // Server error handling
    server.on('error', (error) => {
      console.error(chalk.red('❌ Server error:'), error.message);
      if (error.code === 'EADDRINUSE') {
        console.log(chalk.yellow(`⚠️ Port ${config.PORT} is already in use`));
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
        console.log(chalk.yellow(`⚠️ High memory usage: ${memUsedMB}MB`));

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          console.log(chalk.blue('🗑️ Garbage collection triggered'));
        }
      }
    }, 2 * 60 * 1000); // Every 2 minutes

    // Connection health monitoring - only start after bot initialization
    setTimeout(() => {
      setInterval(() => {
        const timeSinceLastConnection = Date.now() - lastSuccessfulConnection;
        const hoursOffline = timeSinceLastConnection / (1000 * 60 * 60);

        if (hoursOffline > 2 && botStatus !== 'running' && !isConnecting) {
          console.log(chalk.yellow(`⚠️ Bot has been offline for ${Math.round(hoursOffline)} hours`));
          console.log(chalk.blue('🔄 Attempting to restart connection...'));

          // Reset connection attempts and try to reconnect
          connectionAttempts = Math.floor(connectionAttempts / 2);
          startBot();
        }
      }, 30 * 60 * 1000); // Every 30 minutes
    }, 60000); // Start monitoring after 1 minute

    console.log(chalk.green('✅ Application initialized successfully!'));
    console.log(chalk.blue('🔥 Ready to serve WhatsApp bot requests'));
}

// Call the main function to start everything
main().catch(error => {
  console.error(chalk.red('❌ Fatal error during startup:'), error);
  process.exit(1);
});

// FIXED: Export utilities for other modules
export { 
  sendMessageSafely,
  isConnectionHealthy,
  getPluginStats,
  startEnhancedHealthMonitoring,
  config
};
