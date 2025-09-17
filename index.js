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

// FIXED: Import MongoDB connection manager
import mongoManager from './lib/mongoManager.js';
import { connectionMonitor, PluginHelpers, mongoHealthCheck } from './lib/pluginIntegration.js';

// Import welcome/goodbye plugin handlers
import welcomeGoodbyeCommandHandler, { 
  groupParticipantsUpdateHandler as welcomeGoodbyeGroupHandler 
} from './plugins/welcome_goodbye.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FIXED: Enhanced configuration with validation
const config = {
  SESSION_ID: process.env.SESSION_ID || '',
  PREFIX: process.env.PREFIX || '.',
  BOT_NAME: process.env.BOT_NAME || 'Fresh WhatsApp Bot',
  OWNER_NUMBER: process.env.OWNER_NUMBER?.replace(/[^\d]/g, '') || '', // Clean phone number
  ADMIN_NUMBERS: process.env.ADMIN_NUMBERS?.split(',').map(n => n.trim().replace(/[^\d]/g, '')) || [],
  OWNER_NAME: process.env.OWNER_NAME || 'Bot Owner',
  MODE: (process.env.MODE || 'public').toLowerCase(),
  AUTO_BIO: process.env.AUTO_BIO === 'true',
  AUTO_READ: process.env.AUTO_READ === 'true',
  AUTO_REACT: process.env.AUTO_REACT === 'true',
  WELCOME: process.env.WELCOME === 'true',
  ANTILINK: process.env.ANTILINK === 'true',
  REJECT_CALL: process.env.REJECT_CALL === 'true',
  AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN === 'true',
  PORT: parseInt(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  TIMEZONE: process.env.TIMEZONE || 'Africa/Lagos',
  // FIXED: MongoDB configuration
  MONGODB_URI: process.env.MONGODB_URI || '',
  DATABASE_NAME: process.env.DATABASE_NAME || 'whatsapp_bot'
};

// FIXED: Enhanced configuration validation
function validateConfiguration() {
  const errors = [];
  
  if (!config.OWNER_NUMBER) {
    errors.push('OWNER_NUMBER is required');
  }
  
  if (config.PORT < 1 || config.PORT > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }
  
  if (!['public', 'private'].includes(config.MODE)) {
    errors.push('MODE must be either "public" or "private"');
  }
  
  // MongoDB validation - warning only
  if (!config.MONGODB_URI) {
    console.log(chalk.yellow('⚠️ MONGODB_URI not set - database features will be disabled'));
  }
  
  if (errors.length > 0) {
    console.error(chalk.red('❌ Configuration errors:'));
    errors.forEach(error => console.error(chalk.red(`  • ${error}`)));
    process.exit(1);
  }
  
  console.log(chalk.green('✅ Configuration validated successfully'));
}

// Run validation
validateConfiguration();

console.log(chalk.cyan(`
╭─────────────────────────────────────╮
│       🤖 ${config.BOT_NAME}       │
│     Starting WhatsApp Bot...        │
╰─────────────────────────────────────╯
`));

// Session management
const sessionDir = path.join(__dirname, 'sessions');
const credsPath = path.join(sessionDir, 'creds.json');

// FIXED: Create session directory with error handling
try {
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    console.log(chalk.blue('📁 Created session directory'));
  }
} catch (error) {
  console.error(chalk.red('❌ Failed to create session directory:'), error.message);
  process.exit(1);
}

// FIXED: Enhanced logger setup
const logger = pino({
  level: config.NODE_ENV === 'production' ? 'warn' : 'info',
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label }),
    log: (object) => {
      // Sanitize sensitive data
      const sanitized = { ...object };
      if (sanitized.message && typeof sanitized.message === 'string') {
        sanitized.message = sanitized.message.replace(/mongodb\+srv:\/\/[^@]+@/g, 'mongodb+srv://***@');
      }
      return sanitized;
    }
  }
});

// FIXED: Connection state tracking with better initialization
let sock = null;
let botStatus = 'starting';
let isConnecting = false;
let connectionAttempts = 0;
let lastSuccessfulConnection = Date.now();
let bioUpdateCount = 0;
let server = null;
let serverReady = false;
let mongoInitialized = false;
let shutdownInProgress = false;

// Constants
const MAX_CONNECTION_ATTEMPTS = 10; // Reduced from 15
const MAX_BIO_UPDATES_PER_HOUR = 3; // Increased from 2
const CONNECTION_TIMEOUT = 45000; // Reduced from 60000
const RECONNECT_DELAY = {
  MIN: 3000,   // Reduced from 5000
  MAX: 45000,  // Reduced from 60000
  MULTIPLIER: 1.5
};

// FIXED: Enhanced rate limiting with memory cleanup
const rateLimitStore = new Map();
const RATE_LIMIT_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes

function simpleRateLimit(windowMs = 15 * 60 * 1000, maxRequests = 100) {
  return (req, res, next) => {
    if (shutdownInProgress) {
      return res.status(503).json({ error: 'Server shutting down' });
    }

    const clientIP = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create request history for this IP
    let clientRequests = rateLimitStore.get(clientIP) || [];
    
    // Filter out old requests
    clientRequests = clientRequests.filter(timestamp => timestamp > windowStart);

    if (clientRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again later.`,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    // Add current request
    clientRequests.push(now);
    rateLimitStore.set(clientIP, clientRequests);

    next();
  };
}

// FIXED: Rate limit cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const fifteenMinutesAgo = now - (15 * 60 * 1000);
  
  for (const [ip, requests] of rateLimitStore.entries()) {
    const recentRequests = requests.filter(timestamp => timestamp > fifteenMinutesAgo);
    if (recentRequests.length === 0) {
      rateLimitStore.delete(ip);
    } else {
      rateLimitStore.set(ip, recentRequests);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL);

// FIXED: Enhanced security headers
function addSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self';"
  );
  next();
}

// FIXED: Bio update count reset
setInterval(() => {
  bioUpdateCount = 0;
  console.log(chalk.cyan('🔄 Bio update count reset'));
}, 60 * 60 * 1000); // Every hour

// FIXED: MongoDB initialization with better error handling
async function initializeDatabase() {
  if (!config.MONGODB_URI) {
    console.log(chalk.yellow('⚠️ MongoDB URI not configured - skipping database initialization'));
    return false;
  }

  try {
    console.log(chalk.blue('🔌 Initializing MongoDB connection...'));
    await mongoManager.connect();
    
    // Test the connection
    const health = await mongoHealthCheck();
    if (health.healthy) {
      mongoInitialized = true;
      console.log(chalk.green('✅ MongoDB initialized successfully'));
      console.log(chalk.cyan(`📊 Connection pool: ${health.connections?.current || 0}/${health.connections?.available || 'N/A'}`));
      return true;
    } else {
      throw new Error(health.error || 'Health check failed');
    }
    
  } catch (error) {
    console.error(chalk.red('❌ MongoDB initialization failed:'), error.message);
    console.log(chalk.yellow('⚠️ Bot will continue without database features'));
    return false;
  }
}

// FIXED: Initialize PluginManager with error handling
async function initializePluginManager() {
  try {
    console.log(chalk.blue('🔌 Initializing PluginManager...'));

    if (typeof PluginManager?.loadPlugins === 'function') {
      await PluginManager.loadPlugins();

      if (typeof PluginManager?.healthCheck === 'function') {
        const health = await PluginManager.healthCheck();
        if (!health.healthy) {
          console.log(chalk.yellow('⚠️ Plugin health issues detected:'));
          health.issues.forEach(issue => {
            console.log(chalk.yellow(`   • ${issue}`));
          });
        }
      }
      
      console.log(chalk.green('✅ PluginManager initialized successfully'));
    } else {
      console.log(chalk.yellow('⚠️ PluginManager not available or missing methods'));
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to initialize PluginManager:'), error.message);
  }
}

// FIXED: Enhanced session download with better error handling
async function downloadSessionFromMega() {
  if (!config.SESSION_ID || !config.SESSION_ID.includes('~')) {
    console.log(chalk.yellow('📝 No valid SESSION_ID found. Will use QR code authentication.'));
    return false;
  }

  try {
    console.log(chalk.yellow('📥 Downloading session from Mega...'));

    const [botName, fileData] = config.SESSION_ID.split('~');
    if (!fileData || !fileData.includes('#')) {
      throw new Error('Invalid SESSION_ID format. Expected: BotName~fileId#key');
    }

    const [fileId, key] = fileData.split('#');
    
    // Validate file ID and key format
    if (!fileId || !key || fileId.length < 8 || key.length < 16) {
      throw new Error('Invalid file ID or key format');
    }

    const file = File.fromURL(`https://mega.nz/file/${fileId}#${key}`);

    const downloadPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Download timeout after 60 seconds'));
      }, 60000);

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
    
    // Validate downloaded data
    if (!data || data.length === 0) {
      throw new Error('Downloaded session data is empty');
    }

    // Try to parse as JSON to validate
    try {
      JSON.parse(data);
    } catch (parseError) {
      throw new Error('Downloaded session data is not valid JSON');
    }

    await fs.promises.writeFile(credsPath, data);
    console.log(chalk.green('✅ Session downloaded successfully from Mega!'));
    return true;

  } catch (error) {
    console.log(chalk.red('❌ Failed to download session from Mega:'), error.message);
    
    // FIXED: More specific error messages
    if (error.message.includes('timeout')) {
      console.log(chalk.yellow('💡 Timeout occurred. Check your internet connection and try again.'));
    } else if (error.message.includes('Invalid')) {
      console.log(chalk.yellow('💡 Check your SESSION_ID format. Should be: BotName~fileId#key'));
    } else {
      console.log(chalk.yellow('💡 Will proceed with QR code authentication...'));
    }
    
    return false;
  }
}

// FIXED: Enhanced bio update with error handling
async function updateBio(socket) {
  if (!socket || !config.AUTO_BIO || bioUpdateCount >= MAX_BIO_UPDATES_PER_HOUR) {
    return;
  }

  try {
    // Check if socket is still connected
    if (!socket.user?.id || socket.ws?.readyState !== 1) {
      console.log(chalk.yellow('⚠️ Skipping bio update - socket not ready'));
      return;
    }

    const time = moment().tz(config.TIMEZONE).format('HH:mm:ss');
    const date = moment().tz(config.TIMEZONE).format('DD/MM/YYYY');
    const bioText = `🤖 ${config.BOT_NAME}\n📅 ${date} | ⏰ ${time}\n${mongoInitialized ? '🔗' : '⚠️'} Database ${mongoInitialized ? 'Online' : 'Offline'}`;

    await socket.updateProfileStatus(bioText);
    bioUpdateCount++;

    console.log(chalk.cyan(`📝 Bio updated: ${bioText.replace(/\n/g, ' | ')}`));
  } catch (error) {
    if (!error.message.includes('rate') && !error.message.includes('timeout')) {
      console.log(chalk.yellow(`⚠️ Bio update failed: ${error.message}`));
    }
  }
}

// FIXED: Reconnection delay calculation
function getReconnectDelay() {
  const delay = Math.min(
    RECONNECT_DELAY.MIN * Math.pow(RECONNECT_DELAY.MULTIPLIER, connectionAttempts),
    RECONNECT_DELAY.MAX
  );
  return Math.floor(delay);
}

// FIXED: Session cleanup with better error handling
function cleanSession() {
  try {
    if (fs.existsSync(sessionDir)) {
      const files = fs.readdirSync(sessionDir);
      for (const file of files) {
        const filePath = path.join(sessionDir, file);
        try {
          if (fs.lstatSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.warn(chalk.yellow(`⚠️ Could not delete ${file}:`, fileError.message));
        }
      }
      console.log(chalk.yellow('🗑️ Session files cleaned'));
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️ Could not clean session:'), error.message);
  }
}

// FIXED: Enhanced socket creation with better error handling
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
      getMessage: async (key) => {
        if (sock?.msgRetryCache?.has(key.id)) {
          return sock.msgRetryCache.get(key.id);
        }
        return null;
      },

      // FIXED: Optimized connection settings
      connectTimeoutMs: CONNECTION_TIMEOUT,
      defaultQueryTimeoutMs: CONNECTION_TIMEOUT,
      keepAliveIntervalMs: 30000, // Increased from 25000
      retryRequestDelayMs: 500,   // Increased from 350
      maxMsgRetryCount: 2,        // Reduced from 3
      emitOwnEvents: true,

      // FIXED: Resource usage optimization
      shouldSyncHistoryMessage: () => false,
      shouldIgnoreJid: jid => jid === 'status@broadcast',
      cachedGroupMetadata: async (jid) => null, // Disable group metadata caching

      // FIXED: Browser options
      mobile: false,
      fireInitQueries: true,
    });

    // FIXED: Add message retry cache
    socket.msgRetryCache = new Map();
    
    return { sock: socket, saveCreds };

  } catch (error) {
    console.error(chalk.red('❌ Failed to create WhatsApp socket:'), error.message);
    throw error;
  }
}

// FIXED: Enhanced connection event handler
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
        connectionAttempts = 0;
        lastSuccessfulConnection = Date.now();
        isConnecting = false;

        // FIXED: Initialize plugins after successful connection
        await initializePluginManager();

        // *** NEW, MORE ROBUST FIX ***
        // Wait for the 'chats.set' event, which indicates the bot is fully initialized and ready.
        // This is much more reliable than a fixed timer.
        socket.ev.once('chats.set', async () => {
            console.log(chalk.blue('✅ Chats synced. Bot is fully ready.'));
            
            // FIXED: Send startup notification with database status
            if (isNewLogin || config.OWNER_NUMBER) {
                try {
                    const pluginStats = getPluginStats();
                    const mongoHealth = mongoInitialized ? await mongoHealthCheck() : { healthy: false };
                    
                    const startupMsg = `🤖 *${config.BOT_NAME} Connected!*

📊 *Status:* Online ✅
⚙️ *Mode:* ${config.MODE.toUpperCase()}
🎯 *Prefix:* ${config.PREFIX}
⏰ *Time:* ${moment().tz(config.TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}

🔌 *Plugins:* ${pluginStats.enabled}/${pluginStats.total} loaded
🗄️ *Database:* ${mongoHealth.healthy ? '✅ Connected' : '❌ Offline'}

🎮 *Active Features:*
${config.AUTO_READ ? '✅' : '❌'} Auto Read
${config.AUTO_REACT ? '✅' : '❌'} Auto React  
${config.WELCOME ? '✅' : '❌'} Welcome Messages
${config.REJECT_CALL ? '✅' : '❌'} Call Rejection

🔥 Bot is ready to serve!

💡 Type *${config.PREFIX}menu* to see available commands.`;

                    const targetJid = config.OWNER_NUMBER + '@s.whatsapp.net';
                    await sendMessageSafely(socket, targetJid, { text: startupMsg });
                    console.log(chalk.green('📤 Startup notification sent to owner'));

                } catch (error) {
                    console.log(chalk.yellow('⚠️ Could not send startup notification:'), error.message);
                }
            }

            // FIXED: Update bio after connection and notification
            updateBio(socket);
        });

        // FIXED: Start bio update interval
        if (config.AUTO_BIO) {
          setInterval(() => updateBio(socket), 20 * 60 * 1000); // Every 20 minutes
        }
      }

      if (connection === 'close') {
        if (shutdownInProgress) {
          console.log(chalk.blue('🔒 Connection closed during shutdown'));
          return;
        }

        isConnecting = false;
        botStatus = 'reconnecting';
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';

        console.log(chalk.red(`❌ Connection closed`));
        console.log(chalk.yellow(`📝 Status Code: ${statusCode || 'undefined'}`));
        console.log(chalk.yellow(`📝 Reason: ${reason}`));

        // FIXED: Enhanced disconnection handling
        let shouldReconnect = true;
        let cleanSessionFirst = false;
        let customDelay = null;

        switch (statusCode) {
          case DisconnectReason.badSession:
            console.log(chalk.red('🚫 Bad session detected'));
            cleanSessionFirst = true;
            customDelay = 15000;
            break;

          case DisconnectReason.connectionClosed:
            console.log(chalk.yellow('🔌 Connection closed by server'));
            customDelay = 10000;
            break;

          case DisconnectReason.connectionLost:
            console.log(chalk.yellow('📡 Connection lost'));
            customDelay = 15000;
            break;

          case DisconnectReason.connectionReplaced:
            console.log(chalk.red('🔄 Connection replaced - another instance detected'));
            customDelay = 60000; // Increased delay
            break;

          case DisconnectReason.loggedOut:
            console.log(chalk.red('🚪 Logged out - session invalid'));
            cleanSessionFirst = true;
            customDelay = 20000;
            break;

          case DisconnectReason.restartRequired:
            console.log(chalk.yellow('🔄 Restart required by server'));
            customDelay = 10000;
            break;

          case DisconnectReason.timedOut:
            console.log(chalk.red('⏰ Connection timed out'));
            customDelay = 20000;
            break;

          default:
            console.log(chalk.yellow('❓ Unknown disconnection reason'));
            customDelay = 15000;
            break;
        }

        // FIXED: Improved reconnection logic
        if (shouldReconnect && connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
          connectionAttempts++;

          if (cleanSessionFirst) {
            cleanSession();
          }

          const delay = customDelay || getReconnectDelay();
          console.log(chalk.blue(`🔄 Reconnecting in ${delay/1000} seconds... (${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})`));

          setTimeout(() => {
            if (!shutdownInProgress) {
              startBot();
            }
          }, delay);

        } else if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
          console.log(chalk.red(`💀 Maximum reconnection attempts (${MAX_CONNECTION_ATTEMPTS}) reached`));
          console.log(chalk.blue('💡 Possible issues:'));
          console.log(chalk.cyan('   • WhatsApp account banned or restricted'));
          console.log(chalk.cyan('   • Network connectivity problems'));
          console.log(chalk.cyan('   • Invalid session data'));
          console.log(chalk.yellow('🔄 Cleaning session and restarting in 3 minutes...'));

          cleanSession();
          botStatus = 'error';

          setTimeout(() => {
            if (!shutdownInProgress) {
              connectionAttempts = 0;
              startBot();
            }
          }, 3 * 60 * 1000);

        } else {
          console.log(chalk.red('🛑 Bot stopped - manual intervention required'));
          botStatus = 'error';
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ Connection handler error:'), error.message);
    }
  });

  // FIXED: Save credentials with error handling
  socket.ev.on('creds.update', async () => {
    try {
      await saveCreds();
    } catch (error) {
      console.error(chalk.red('❌ Failed to save credentials:'), error.message);
    }
  });

  return socket;
}

// FIXED: Enhanced message sending with retry logic
async function sendMessageSafely(socket, jid, message, options = {}) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!socket?.user?.id || socket.ws?.readyState !== 1) {
        throw new Error('Socket not ready');
      }
      
      if (attempt > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
      
      const result = await socket.sendMessage(jid, message, options);
      return result;
      
    } catch (error) {
      console.log(chalk.red(`❌ Send attempt ${attempt}/${maxRetries} failed:`, error.message));
      if (attempt === maxRetries) throw error;
    }
  }
}

// FIXED: Enhanced connection health check
function isConnectionHealthy(socket) {
  if (!socket?.user?.id) return false;
  if (socket.ws?.readyState !== 1) return false;
  if (shutdownInProgress) return false;
  return true;
}

// Make functions globally available
global.sendMessageSafely = sendMessageSafely;
global.isConnectionHealthy = isConnectionHealthy;

// FIXED: Enhanced event handlers setup
function setupEventHandlers(socket) {
  // FIXED: Message handler with better error handling and safety checks
  socket.ev.on('messages.upsert', async (messageUpdate) => {
    if (shutdownInProgress) return;
    
    try {
      if (!messageUpdate?.messages || !Array.isArray(messageUpdate.messages)) {
        return;
      }

      for (const message of messageUpdate.messages) {
        if (!message?.message) continue;
        
        // FIXED: Call welcome/goodbye command handler
        try {
          if (typeof welcomeGoodbyeCommandHandler === 'function') {
            await welcomeGoodbyeCommandHandler(message, socket, config);
          }
        } catch (welcomeError) {
          console.warn(chalk.yellow('⚠️ Welcome/goodbye handler error:'), welcomeError.message);
        }
      }

      // FIXED: Call main message handler with error handling
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

  // FIXED: Call handler with error handling
  socket.ev.on('call', async (callUpdate) => {
    if (shutdownInProgress) return;
    
    try {
      if (typeof CallHandler === 'function') {
        await CallHandler(callUpdate, socket, config);
      }
    } catch (error) {
      console.error(chalk.red('❌ Call handler error:'), error.message);
    }
  });

  // FIXED: Group handler with error handling
  socket.ev.on('groups.update', async (groupUpdate) => {
    if (shutdownInProgress) return;
    
    try {
      if (typeof GroupHandler === 'function') {
        await GroupHandler(socket, groupUpdate, config);
      }
    } catch (error) {
      console.error(chalk.red('❌ Group handler error:'), error.message);
    }
  });

  // FIXED: Group participants update handler
  socket.ev.on('group-participants.update', async (event) => {
    if (shutdownInProgress) return;
    
    try {
      if (typeof welcomeGoodbyeGroupHandler === 'function') {
        await welcomeGoodbyeGroupHandler(event, socket);
      }
    } catch (error) {
      console.error(chalk.red('❌ Welcome/goodbye group handler error:'), error.message);
    }
  });

  // FIXED: Connection health monitoring
  socket.ev.on('connection.update', ({ connection }) => {
    if (connection === 'open') {
      lastSuccessfulConnection = Date.now();
    }
  });

  // FIXED: Add message retry mechanism
  socket.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      if (msg.key?.id) {
        socket.msgRetryCache?.set(msg.key.id, msg);
      }
    }
    
    // Clean old cached messages
    setTimeout(() => {
      if (socket.msgRetryCache?.size > 1000) {
        const entries = Array.from(socket.msgRetryCache.entries());
        const toDelete = entries.slice(0, 500); // Remove oldest 500 messages
        toDelete.forEach(([key]) => socket.msgRetryCache.delete(key));
      }
    }, 30000); // Clean every 30 seconds
  });
}

// FIXED: Safe plugin stats getter with error handling
function getPluginStats() {
  try {
    if (typeof PluginManager?.getPluginStats === 'function') {
      return PluginManager.getPluginStats();
    }
    return { total: 0, enabled: 0, disabled: 0 };
  } catch (error) {
    console.warn(chalk.yellow('⚠️ Plugin stats error:'), error.message);
    return { total: 0, enabled: 0, disabled: 0 };
  }
}

// FIXED: Main bot startup function with enhanced error handling
async function startBot() {
  if (isConnecting || shutdownInProgress) {
    console.log(chalk.yellow('⏳ Connection already in progress or shutdown initiated, skipping...'));
    return;
  }

  try {
    isConnecting = true;
    botStatus = 'connecting';
    console.log(chalk.magenta(`🚀 Starting ${config.BOT_NAME}...`));

    // FIXED: Ensure database connection before bot startup
    if (config.MONGODB_URI && !mongoInitialized) {
      console.log(chalk.blue('🗄️ Ensuring database connection...'));
      const dbReady = await initializeDatabase();
      if (!dbReady) {
        console.log(chalk.yellow('⚠️ Starting bot without database features'));
      }
    }

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

    if (!shutdownInProgress) {
      const delay = getReconnectDelay();
      console.log(chalk.yellow(`🔄 Retrying in ${delay/1000} seconds...`));
      setTimeout(startBot, delay);
    }
  }
}

// FIXED: Enhanced Express server setup
const app = express();

// Apply security and middleware
app.use(addSecurityHeaders);
app.use(simpleRateLimit(15 * 60 * 1000, 100));
app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// FIXED: Static file serving with better error handling
try {
  const publicPath = path.join(__dirname, 'public');
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
    console.log(chalk.green('📁 Static files enabled'));
  } else {
    console.log(chalk.yellow('⚠️ Public directory not found - static files disabled'));
  }
} catch (staticError) {
  console.warn(chalk.yellow('⚠️ Static file setup warning:'), staticError.message);
}

// FIXED: Enhanced health check endpoints

// Main status endpoint
app.get('/', (req, res) => {
  try {
    const pluginStats = getPluginStats();
    const uptime = Math.floor((Date.now() - lastSuccessfulConnection) / 1000);
    
    res.json({
      status: botStatus,
      bot: config.BOT_NAME,
      mode: config.MODE,
      owner: config.OWNER_NUMBER,
      serverReady: serverReady,
      mongoInitialized: mongoInitialized,
      plugins: {
        total: pluginStats.total,
        enabled: pluginStats.enabled,
        disabled: pluginStats.disabled
      },
      uptime: uptime,
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// FIXED: Always healthy server endpoint
app.get('/health', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const healthData = {
      status: 'healthy',
      serverReady: serverReady,
      botStatus: botStatus,
      connected: botStatus === 'running',
      mongoHealthy: mongoInitialized,
      socketState: sock?.ws?.readyState || 'unknown',
      uptime: process.uptime(),
      lastConnection: new Date(lastSuccessfulConnection).toISOString(),
      connectionAttempts,
      timeSinceLastConnection: Math.round((Date.now() - lastSuccessfulConnection) / 1000),
      isConnecting,
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(healthData);
  } catch (error) {
    res.status(200).json({
      status: 'server_healthy',
      error: error.message,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  }
});

// FIXED: MongoDB-specific health endpoint
app.get('/api/mongodb-health', async (req, res) => {
  try {
    if (!mongoInitialized) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'MongoDB not initialized',
        mongoInitialized: false
      });
    }

    const health = await mongoHealthCheck();
    
    if (health.healthy) {
      res.status(200).json({
        status: 'healthy',
        ...health,
        message: 'MongoDB connection is healthy'
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        ...health,
        message: 'MongoDB connection issues detected'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      message: 'Failed to check MongoDB health'
    });
  }
});

// FIXED: Connection statistics endpoint
app.get('/api/connection-stats', async (req, res) => {
  try {
    const stats = {
      whatsapp: {
        status: botStatus,
        connected: botStatus === 'running',
        connectionAttempts,
        lastConnection: new Date(lastSuccessfulConnection).toISOString(),
        socketReady: sock?.ws?.readyState === 1
      },
      server: {
        uptime: process.uptime(),
        serverReady: serverReady,
        rateLimitCacheSize: rateLimitStore.size
      },
      timestamp: new Date().toISOString()
    };

    // Add MongoDB stats if initialized
    if (mongoInitialized) {
      try {
        const mongoStats = mongoManager.getStats();
        const connectionStats = connectionMonitor.getStats();
        stats.mongodb = mongoStats;
        stats.monitoring = connectionStats;
      } catch (mongoError) {
        stats.mongodb = { error: mongoError.message };
      }
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FIXED: Test MongoDB connection endpoint
app.post('/api/test-mongodb', async (req, res) => {
  try {
    if (!mongoInitialized) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB not initialized'
      });
    }

    const startTime = Date.now();
    const db = await mongoManager.getDatabase();
    
    const result = await db.admin().ping();
    const responseTime = Date.now() - startTime;
    
    res.json({
      success: true,
      responseTime,
      result,
      message: 'MongoDB connection test successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'MongoDB connection test failed'
    });
  }
});

// FIXED: Enhanced bot info endpoint with database status
app.get('/api/bot-info', async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const pluginStats = getPluginStats();
    
    // Get MongoDB health if initialized
    let mongoHealth = { healthy: false, error: 'Not initialized' };
    if (mongoInitialized) {
      try {
        mongoHealth = await mongoHealthCheck();
      } catch (healthError) {
        mongoHealth = { healthy: false, error: healthError.message };
      }
    }

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
      database: {
        initialized: mongoInitialized,
        healthy: mongoHealth.healthy,
        connections: mongoHealth.connections || { current: 0, available: 0 },
        pingTime: mongoHealth.pingTime || null,
        error: mongoHealth.error || null
      },
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      lastConnection: new Date(lastSuccessfulConnection).toISOString(),
      connectionAttempts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// FIXED: Plugin management endpoints with better error handling
app.get('/plugins', async (req, res) => {
  try {
    if (typeof PluginManager?.getAllPlugins === 'function') {
      const plugins = await PluginManager.getAllPlugins();
      res.json({ success: true, plugins });
    } else {
      res.json({ success: true, plugins: [], message: 'PluginManager not available' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/plugins/stats', async (req, res) => {
  try {
    const stats = getPluginStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/plugins/reload-all', async (req, res) => {
  try {
    if (typeof PluginManager?.reloadAllPlugins === 'function') {
      const result = await PluginManager.reloadAllPlugins();
      res.json({ success: true, result, message: 'All plugins reloaded successfully' });
    } else {
      res.status(404).json({ success: false, error: 'PluginManager not available' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// FIXED: Force garbage collection endpoint
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
        freedMB: beforeMem - afterMem,
        message: 'Garbage collection completed'
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Garbage collection not available. Start with --expose-gc flag.' 
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// FIXED: Catch all route with better handling
app.get('*', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  try {
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).json({ 
        error: 'Page not found',
        message: 'HTML file not found',
        availableEndpoints: [
          'GET /',
          'GET /health', 
          'GET /api/bot-info',
          'GET /api/mongodb-health',
          'GET /plugins'
        ]
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// FIXED: Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error(chalk.red('Express error:'), err.message);
  
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request too large' });
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: config.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// FIXED: Enhanced process error handlers
process.on('uncaughtException', (err) => {
  console.error(chalk.red('💥 Uncaught Exception:'), err.message);
  console.error('Stack:', err.stack);
  
  if (config.NODE_ENV === 'production') {
    console.log(chalk.yellow('⚠️ Attempting graceful recovery...'));
    setTimeout(() => {
      if (!shutdownInProgress) {
        console.log(chalk.blue('🔄 Restarting application...'));
        process.exit(1);
      }
    }, 5000);
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
  
  if (config.NODE_ENV === 'production') {
    console.log(chalk.yellow('⚠️ Logging unhandled rejection but continuing...'));
  }
});

// FIXED: Enhanced graceful shutdown
function gracefulShutdown(signal) {
  if (shutdownInProgress) {
    console.log(chalk.yellow('⚠️ Shutdown already in progress...'));
    return;
  }
  
  shutdownInProgress = true;
  console.log(chalk.blue(`\n📪 ${signal} received. Starting graceful shutdown...`));

  // Set a maximum shutdown time
  const forceShutdownTimer = setTimeout(() => {
    console.log(chalk.red('⚡ Force shutdown after timeout'));
    process.exit(1);
  }, 15000); // 15 seconds max

  if (server) {
    server.close(async () => {
      console.log(chalk.green('✅ HTTP server closed'));

      // Close WhatsApp connection
      if (sock) {
        try {
          if (sock.ws?.readyState === 1) {
            sock.end();
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for clean disconnect
          }
          console.log(chalk.green('✅ WhatsApp connection closed'));
        } catch (error) {
          console.warn(chalk.yellow('⚠️ WhatsApp close warning:'), error.message);
        }
      }

      // Close MongoDB connections
      if (mongoInitialized) {
        try {
          await mongoManager.close();
          console.log(chalk.green('✅ MongoDB connections closed'));
        } catch (error) {
          console.warn(chalk.yellow('⚠️ MongoDB close warning:'), error.message);
        }
      }

      // Clean up caches
      try {
        rateLimitStore.clear();
        if (sock?.msgRetryCache) {
          sock.msgRetryCache.clear();
        }
        console.log(chalk.green('✅ Caches cleared'));
      } catch (error) {
        console.warn(chalk.yellow('⚠️ Cache cleanup warning:'), error.message);
      }

      clearTimeout(forceShutdownTimer);
      console.log(chalk.green('🎉 Graceful shutdown completed'));
      process.exit(0);
    });
  } else {
    clearTimeout(forceShutdownTimer);
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// FIXED: Enhanced monitoring functions
async function monitorPluginHealth() {
  if (!PluginManager || typeof PluginManager.healthCheck !== 'function') {
    return;
  }
  
  try {
    if (!sock || botStatus !== 'running') return;

    const health = await PluginManager.healthCheck();
    
    if (!health.healthy && health.issues.length > 0) {
      console.log(chalk.yellow(`⚠️ Plugin health issues detected: ${health.issues.length} issues`));
      
      // Log issues but don't spam
      if (health.issues.length <= 5) {
        health.issues.forEach(issue => {
          console.log(chalk.yellow(`   • ${issue}`));
        });
      }
      
      // Send alert to owner if critical issues
      if (health.criticalIssues > 2 && sock && config.OWNER_NUMBER) {
        try {
          await sendMessageSafely(sock, config.OWNER_NUMBER + '@s.whatsapp.net', {
            text: `🚨 *Plugin Health Alert*\n\n❌ ${health.criticalIssues} critical issues detected!\n⏰ Time: ${new Date().toLocaleString()}\n\n📊 Issues: ${health.issues.length}\n\n🔧 Check server logs for details.`
          });
        } catch (alertError) {
          console.warn('Failed to send plugin health alert:', alertError.message);
        }
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Plugin health monitoring error:'), error.message);
  }
}

async function monitorMemoryUsage() {
  try {
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssUsedMB = Math.round(memUsage.rss / 1024 / 1024);
    
    console.log(chalk.cyan(`💾 Memory: ${memUsedMB}MB heap, ${rssUsedMB}MB RSS, ${memTotalMB}MB total`));
    
    if (memUsedMB > 400) {
      console.log(chalk.yellow(`⚠️ High memory usage: ${memUsedMB}MB`));
      
      if (global.gc) {
        console.log(chalk.blue('🗑️ Running garbage collection...'));
        global.gc();
        
        const newMemUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        console.log(chalk.green(`✅ Memory after GC: ${newMemUsage}MB (freed ${memUsedMB - newMemUsage}MB)`));
      }
      
      // Clear caches if memory is high
      if (memUsedMB > 500) {
        rateLimitStore.clear();
        if (sock?.msgRetryCache?.size > 100) {
          sock.msgRetryCache.clear();
        }
        console.log(chalk.blue('🧹 Cleared caches due to high memory usage'));
      }
      
      // Send critical memory alert
      if (memUsedMB > 600 && sock && config.OWNER_NUMBER) {
        try {
          await sendMessageSafely(sock, config.OWNER_NUMBER + '@s.whatsapp.net', {
            text: `⚠️ *Memory Alert*\n\n🔴 High memory usage: ${memUsedMB}MB\n📊 Total allocated: ${memTotalMB}MB\n⏰ Time: ${new Date().toLocaleString()}\n\n💡 Consider restarting if this persists.`
          });
        } catch (alertError) {
          console.warn('Failed to send memory alert:', alertError.message);
        }
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Memory monitoring error:'), error.message);
  }
}

function monitorConnectionHealth() {
  try {
    const timeSinceLastConnection = Date.now() - lastSuccessfulConnection;
    const minutesOffline = Math.round(timeSinceLastConnection / (1000 * 60));
    
    if (minutesOffline > 60 && botStatus !== 'running' && !isConnecting && !shutdownInProgress) {
      console.log(chalk.yellow(`⚠️ Bot offline for ${minutesOffline} minutes`));
      
      if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
        console.log(chalk.blue('🔄 Attempting connection recovery...'));
        connectionAttempts = Math.floor(connectionAttempts / 2);
        startBot();
      }
    }
    
    // Check WebSocket health
    if (sock?.ws && botStatus === 'running') {
      const wsState = sock.ws.readyState;
      if (wsState !== 1) {
        console.log(chalk.yellow(`⚠️ WebSocket unhealthy: state ${wsState}`));
        botStatus = 'reconnecting';
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Connection health monitoring error:'), error.message);
  }
}

// FIXED: Enhanced MongoDB monitoring
async function monitorMongoDBHealth() {
  if (!mongoInitialized) return;
  
  try {
    const health = await mongoHealthCheck();
    
    if (!health.healthy) {
      console.log(chalk.red('🚨 MongoDB Health Alert:'), health.error);
      
      // Attempt reconnection
      try {
        console.log(chalk.blue('🔄 Attempting MongoDB reconnection...'));
        await mongoManager.connect();
        mongoInitialized = true;
        console.log(chalk.green('✅ MongoDB reconnection successful'));
      } catch (reconnectError) {
        console.error(chalk.red('❌ MongoDB reconnection failed:'), reconnectError.message);
      }
      
      // Send alert to owner
      if (sock && config.OWNER_NUMBER && botStatus === 'running') {
        try {
          await sendMessageSafely(sock, config.OWNER_NUMBER + '@s.whatsapp.net', {
            text: `🚨 *MongoDB Alert*\n\n❌ Database connection issue!\n\n📝 Error: ${health.error}\n⏰ Time: ${new Date().toLocaleString()}\n\n🔧 Attempting automatic recovery...`
          });
        } catch (alertError) {
          console.warn('Failed to send MongoDB alert:', alertError.message);
        }
      }
    } else {
      // Log healthy status occasionally
      if (health.connections) {
        const usage = Math.round((health.connections.current / health.connections.available) * 100);
        console.log(chalk.cyan(`📊 MongoDB: ${health.connections.current}/${health.connections.available} connections (${usage}%), ${health.pingTime}ms ping`));
        
        // Warn if approaching limit
        if (usage > 70) {
          console.log(chalk.yellow(`⚠️ High MongoDB connection usage: ${usage}%`));
        }
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ MongoDB monitoring error:'), error.message);
  }
}

// FIXED: Start all monitoring systems
function startEnhancedHealthMonitoring() {
  console.log(chalk.blue('🏥 Starting enhanced health monitoring systems...'));
  
  // Plugin health check every 15 minutes
  setInterval(monitorPluginHealth, 15 * 60 * 1000);
  
  // Memory monitoring every 20 minutes
  setInterval(monitorMemoryUsage, 20 * 60 * 1000);
  
  // Connection health check every 10 minutes
  setInterval(monitorConnectionHealth, 10 * 60 * 1000);
  
  // MongoDB monitoring every 5 minutes
  setInterval(monitorMongoDBHealth, 5 * 60 * 1000);
  
  // Initial checks after 2 minutes
  setTimeout(() => {
    monitorPluginHealth();
    monitorMemoryUsage();
    monitorConnectionHealth();
    monitorMongoDBHealth();
  }, 2 * 60 * 1000);
  
  console.log(chalk.green('✅ Enhanced health monitoring started'));
}

// FIXED: Main application entry point
async function main() {
    try {
        console.log(chalk.cyan('🎬 Initializing Fresh WhatsApp Bot...'));
        console.log(chalk.blue(`📊 Environment: ${config.NODE_ENV}`));
        console.log(chalk.blue(`👑 Owner: ${config.OWNER_NUMBER}`));
        console.log(chalk.blue(`🌍 Timezone: ${config.TIMEZONE}`));

        // Initialize MongoDB connection early
        if (config.MONGODB_URI) {
            console.log(chalk.blue('🗄️ Initializing MongoDB connection...'));
            const dbReady = await initializeDatabase();
            if (dbReady) {
                console.log(chalk.green('✅ Database connection established'));
            } else {
                console.log(chalk.yellow('⚠️ Continuing without database features'));
            }
        }

        // Start Express server first
        const startTime = Date.now();
        
        server = app.listen(config.PORT, '0.0.0.0', () => {
            console.log(chalk.blue(`🌐 Server running on port ${config.PORT}`));
            console.log(chalk.cyan(`🔗 Health check: http://localhost:${config.PORT}/health`));
            console.log(chalk.cyan(`🏓 Ping endpoint: http://localhost:${config.PORT}/ping`));
            console.log(chalk.cyan(`🔌 Plugin API: http://localhost:${config.PORT}/plugins`));
            console.log(chalk.cyan(`🌍 Web Interface: http://localhost:${config.PORT}/`));

            serverReady = true;
            console.log(chalk.green('✅ Server marked as ready for health checks'));

            // Start bot after server is ready
            setTimeout(() => {
                console.log(chalk.blue('🤖 Starting WhatsApp bot connection...'));
                startBot();
            }, 2000);
        });

        // Server error handling
        server.on('error', (error) => {
            console.error(chalk.red('❌ Server error:'), error.message);
            if (error.code === 'EADDRINUSE') {
                console.log(chalk.yellow(`⚠️ Port ${config.PORT} is already in use`));
                process.exit(1);
            }
        });

        // Keep-alive mechanism for cloud deployments
        if (config.NODE_ENV === 'production') {
            setTimeout(() => {
                setInterval(async () => {
                    if (!shutdownInProgress) {
                        try {
                            await axios.get(`http://localhost:${config.PORT}/health`, {
                                timeout: 10000,
                                headers: { 'User-Agent': 'KeepAlive-Bot' }
                            });
                        } catch (error) {
                            // Ignore keep-alive errors
                        }
                    }
                }, 4 * 60 * 1000); // Every 4 minutes
            }, 30000);
        }

        // Start enhanced monitoring after everything is initialized
        setTimeout(() => {
            startEnhancedHealthMonitoring();
        }, 60000);

        console.log(chalk.green('✅ Application initialized successfully!'));
        console.log(chalk.blue('🔥 Ready to serve WhatsApp bot requests'));
        
    } catch (error) {
        console.error(chalk.red('❌ Fatal error during startup:'), error.message);
        process.exit(1);
    }
}

// Start the application
main().catch(error => {
  console.error(chalk.red('💥 Fatal startup error:'), error.message);
  console.error('Stack trace:', error.stack);
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

