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
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development'
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

// Constants
const MAX_CONNECTION_ATTEMPTS = 15;
const MAX_BIO_UPDATES_PER_HOUR = 2;
const CONNECTION_TIMEOUT = 60000;
const RECONNECT_DELAY = {
  MIN: 5000,
  MAX: 60000,
  MULTIPLIER: 1.5
};

// Reset bio update count every hour
setInterval(() => {
  bioUpdateCount = 0;
}, 60 * 60 * 1000);

// Initialize PluginManager on startup
async function initializePluginManager() {
  try {
    console.log(chalk.blue('🔌 Initializing PluginManager...'));
    await PluginManager.loadPlugins();
    
    // Show plugin health check on startup
    const health = await PluginManager.healthCheck();
    if (!health.healthy) {
      console.log(chalk.yellow('⚠️ Plugin health issues detected:'));
      health.issues.forEach(issue => {
        console.log(chalk.yellow(`   • ${issue}`));
      });
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
    const time = moment().tz(process.env.TIMEZONE || 'Africa/Lagos').format('HH:mm:ss');
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

// Enhanced connection event handler
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
        
        // Initialize plugins after successful connection
        await initializePluginManager();
        
        // Send startup notification (only for new logins or owner)
        if (isNewLogin || config.OWNER_NUMBER) {
          try {
            const pluginStats = PluginManager.getPluginStats();
            const startupMsg = `🤖 *${config.BOT_NAME} Connected!*

📊 *Status:* Online ✅
⚙️ *Mode:* ${config.MODE.toUpperCase()}
🎯 *Prefix:* ${config.PREFIX}
⏰ *Time:* ${moment().tz(process.env.TIMEZONE || 'Africa/Lagos').format('DD/MM/YYYY HH:mm:ss')}

🔌 *Plugins:* ${pluginStats.enabled}/${pluginStats.total} loaded

🎮 *Active Features:*
${config.AUTO_READ ? '✅' : '❌'} Auto Read
${config.AUTO_REACT ? '✅' : '❌'} Auto React  
${config.WELCOME ? '✅' : '❌'} Welcome Messages
${config.REJECT_CALL ? '✅' : '❌'} Call Rejection

🔥 Bot is ready to serve!

💡 Type *${config.PREFIX}menu* to see available commands.`;

            const targetJid = config.OWNER_NUMBER + '@s.whatsapp.net';
            await socket.sendMessage(targetJid, { text: startupMsg });
            console.log(chalk.green('📤 Startup notification sent to owner'));
            
          } catch (error) {
            console.log(chalk.yellow('⚠️ Could not send startup notification:', error.message));
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
          process.exit(1);
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
          
          if (messageText && typeof messageText === 'string') {
            messageText = messageText.replace(/\s+/g, ' ').trim();
          }
          
        } catch (textError) {
          console.log(chalk.yellow('⚠️ Text extraction error:', textError.message));
          continue;
        }
      }
      
      await MessageHandler(messageUpdate, socket, logger, config);
      
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
      await CallHandler(callUpdate, socket, config);
    } catch (error) {
      console.error(chalk.red('❌ Call handler error:'), error.message);
    }
  });

  // Group updates handler
  socket.ev.on('groups.update', async (groupUpdate) => {
    try {
      await GroupHandler(socket, groupUpdate, config);
    } catch (error) {
      console.error(chalk.red('❌ Group handler error:'), error.message);
    }
  });
  
  // Connection health monitoring
  socket.ev.on('connection.update', ({ connection }) => {
    if (connection === 'open') {
      lastSuccessfulConnection = Date.now();
    }
  });
}

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

// Express server setup
const app = express();
app.use(express.json());

// Main entry point
async function main() {
    console.log(chalk.cyan('🎬 Initializing Fresh WhatsApp Bot...'));
    console.log(chalk.blue(`📊 Environment: ${config.NODE_ENV}`));
    console.log(chalk.blue(`👑 Owner: ${config.OWNER_NUMBER}`));
    
    // Express server routes
    const startTime = Date.now();
    
    app.get('/', (req, res) => {
      const pluginStats = PluginManager.getPluginStats();
      res.json({
        status: botStatus,
        bot: config.BOT_NAME,
        mode: config.MODE,
        owner: config.OWNER_NUMBER,
        plugins: {
          total: pluginStats.total,
          enabled: pluginStats.enabled,
          disabled: pluginStats.disabled
        },
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString()
      });
    });
    
    // Health check - Always returns 200 OK
    app.get('/health', (req, res) => {
      try {
        const healthData = {
          status: botStatus,
          connected: botStatus === 'running',
          socketState: sock?.readyState || 'unknown',
          uptime: process.uptime(),
          lastConnection: new Date(lastSuccessfulConnection).toISOString(),
          connectionAttempts,
          timeSinceLastConnection: Math.round((Date.now() - lastSuccessfulConnection) / 1000), // in seconds
          isConnecting
        };
        res.status(200).json(healthData);
      } catch (error) {
        res.status(200).json({
          status: 'error',
          error: error.message,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Readiness check - More strict
    app.get('/ready', (req, res) => {
      const isReady = sock?.user && sock.readyState === 0;
      if (isReady) {
        res.status(200).json({ status: 'ready', connected: true });
      } else {
        res.status(503).json({ status: 'not ready', connected: false });
      }
    });
    
    // Simple ping endpoint for basic connectivity
    app.get('/ping', (req, res) => {
      res.status(200).json({
        status: 'pong',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
    
    app.get('/qr', (req, res) => {
      if (sock?.user) {
        res.json({ status: 'connected', message: 'Bot is already connected' });
      } else {
        res.json({ status: botStatus, message: 'Check console for QR code' });
      }
    });
    
    // Plugin Management API Routes (same as before)
    app.get('/plugins', async (req, res) => { /* ... */ });
    app.get('/plugins/stats', async (req, res) => { /* ... */ });
    app.get('/plugins/health', async (req, res) => { /* ... */ });
    app.post('/plugins/:filename/enable', async (req, res) => { /* ... */ });
    app.post('/plugins/:filename/disable', async (req, res) => { /* ... */ });
    app.post('/plugins/:filename/reload', async (req, res) => { /* ... */ });
    app.post('/plugins/reload-all', async (req, res) => { /* ... */ });

    // Start Express server
    const server = app.listen(config.PORT, () => {
      console.log(chalk.blue(`🌐 Server running on port ${config.PORT}`));
      console.log(chalk.cyan(`🔗 Health check: http://localhost:${config.PORT}/health`));
      console.log(chalk.cyan(`🏓 Ping endpoint: http://localhost:${config.PORT}/ping`));
      console.log(chalk.cyan(`🔌 Plugin API: http://localhost:${config.PORT}/plugins`));
      
      // Now that the server is listening, start the bot connection
      startBot();
    });

    // ... (rest of the code for graceful shutdown, monitoring, etc.)
}

// Call the main function to start everything
main();
