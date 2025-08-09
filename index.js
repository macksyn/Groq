import dotenv from 'dotenv';
dotenv.config();

// Import Node.js built-in modules first
import crypto from 'crypto';
import { Buffer } from 'buffer';

// Make crypto globally available for Baileys
if (!global.crypto) {
  global.crypto = crypto;
}

// Ensure Buffer is available
if (!global.Buffer) {
  global.Buffer = Buffer;
}

import { 
  makeWASocket, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  DisconnectReason 
} from '@whiskeysockets/baileys';

import express from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import chalk from 'chalk';
import pino from 'pino';
import moment from 'moment-timezone';
import { File } from 'megajs';
import { fileURLToPath } from 'url';

// Import handlers
import MessageHandler from './handlers/messageHandler.js';
import CallHandler from './handlers/callHandler.js';
import GroupHandler from './handlers/groupHandler.js';

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

// Express server setup
const app = express();
app.use(express.json());

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
      }
      
      if (connection === 'connecting') {
        console.log(chalk.yellow(`🔄 Connecting to WhatsApp... (Attempt ${connectionAttempts + 1}/${MAX_CONNECTION_ATTEMPTS})`));
      }
      
      if (connection === 'open') {
        console.log(chalk.green('✅ Successfully connected to WhatsApp!'));
        console.log(chalk.cyan(`📱 Connected as: ${socket.user?.name || 'Unknown'}`));
        console.log(chalk.cyan(`📞 Phone: ${socket.user?.id?.split(':')[0] || 'Unknown'}`));
        
        // Reset connection attempts and update last successful connection
        connectionAttempts = 0;
        lastSuccessfulConnection = Date.now();
        isConnecting = false;
        
        // Send startup notification (only for new logins or owner)
        if (isNewLogin || config.OWNER_NUMBER) {
          try {
            const startupMsg = `🤖 *${config.BOT_NAME} Connected!*

📊 *Status:* Online ✅
⚙️ *Mode:* ${config.MODE.toUpperCase()}
🎯 *Prefix:* ${config.PREFIX}
⏰ *Time:* ${moment().tz(process.env.TIMEZONE || 'Africa/Lagos').format('DD/MM/YYYY HH:mm:ss')}

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
          
          setTimeout(() => {
            connectionAttempts = 0;
            startBot();
          }, 2 * 60 * 1000);
          
        } else {
          console.log(chalk.red('🛑 Bot stopped - manual intervention required'));
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

// Setup message and event handlers
function setupEventHandlers(socket) {
  // Message handler
  socket.ev.on('messages.upsert', async (messageUpdate) => {
    try {
      await MessageHandler(messageUpdate, socket, logger, config);
    } catch (error) {
      console.error(chalk.red('❌ Message handler error:'), error.message);
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
    console.log(chalk.magenta(`🚀 Starting ${config.BOT_NAME}...`));
    
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
    console.error(chalk.red('❌ Bot startup error:'), error.message);
    
    const delay = getReconnectDelay();
    console.log(chalk.yellow(`🔄 Retrying in ${delay/1000} seconds...`));
    
    setTimeout(startBot, delay);
  }
}

// Initialize bot with session management
async function initializeBot() {
  try {
    console.log(chalk.cyan('🎬 Initializing Fresh WhatsApp Bot...'));
    console.log(chalk.blue(`📊 Environment: ${config.NODE_ENV}`));
    console.log(chalk.blue(`👑 Owner: ${config.OWNER_NUMBER}`));
    
    // Check if session exists locally
    if (fs.existsSync(credsPath)) {
      console.log(chalk.green('🔐 Found local session, starting bot...'));
      await startBot();
    } else if (config.SESSION_ID) {
      console.log(chalk.yellow('📥 Attempting to download session from Mega...'));
      const downloaded = await downloadSessionFromMega();
      
      if (downloaded) {
        console.log(chalk.green('✅ Session downloaded, starting bot...'));
        await startBot();
      } else {
        console.log(chalk.yellow('📱 Starting with QR code authentication...'));
        await startBot();
      }
    } else {
      console.log(chalk.yellow('📱 No session found. Starting with QR code authentication...'));
      await startBot();
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Bot initialization failed:'), error.message);
    setTimeout(initializeBot, 30000); // Retry in 30 seconds
  }
}

// Express server routes
app.get('/', (req, res) => {
  res.json({
    status: sock?.user ? 'connected' : 'connecting',
    bot: config.BOT_NAME,
    mode: config.MODE,
    owner: config.OWNER_NUMBER,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  const isHealthy = sock?.user && (Date.now() - lastSuccessfulConnection) < 5 * 60 * 1000;
  
  res.status(isHealthy ? 200 : 503).json({ 
    status: isHealthy ? 'healthy' : 'unhealthy',
    connected: !!sock?.user,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    lastConnection: new Date(lastSuccessfulConnection).toISOString(),
    connectionAttempts
  });
});

app.get('/qr', (req, res) => {
  if (sock?.user) {
    res.json({ status: 'connected', message: 'Bot is already connected' });
  } else {
    res.json({ status: 'waiting', message: 'Check console for QR code' });
  }
});

// Start Express server
const server = app.listen(config.PORT, () => {
  console.log(chalk.blue(`🌐 Server running on port ${config.PORT}`));
  console.log(chalk.cyan(`🔗 Health check: http://localhost:${config.PORT}/health`));
});

// Keep alive ping for cloud platforms
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(async () => {
    try {
      await axios.get(`${process.env.RENDER_EXTERNAL_URL}/health`, { 
        timeout: 10000,
        headers: { 'User-Agent': 'KeepAlive/1.0' }
      });
    } catch (error) {
      // Silent fail - just keep the service alive
    }
  }, 4 * 60 * 1000); // Every 4 minutes
}

// Connection health monitor
setInterval(() => {
  const timeSinceLastConnection = Date.now() - lastSuccessfulConnection;
  
  // If no connection for 15 minutes, force restart
  if (timeSinceLastConnection > 15 * 60 * 1000 && !isConnecting) {
    console.log(chalk.red('💀 No connection for 15 minutes. Forcing restart...'));
    cleanSession();
    process.exit(1); // Let container/PM2 restart
  }
  
  // Memory cleanup
  if (global.gc) {
    global.gc();
  }
  
}, 2 * 60 * 1000); // Every 2 minutes

// Graceful shutdown handling
async function gracefulShutdown(signal) {
  console.log(chalk.yellow(`\n🛑 Received ${signal}. Shutting down gracefully...`));
  
  try {
    if (sock?.user) {
      // Send offline status
      if (config.OWNER_NUMBER) {
        await sock.sendMessage(config.OWNER_NUMBER + '@s.whatsapp.net', {
          text: `🤖 *${config.BOT_NAME} Shutting Down*\n\n⏰ Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}\n📝 Reason: ${signal} received\n\n👋 Bot will restart automatically if configured.`
        });
      }
      
      // Close socket connection
      if (sock.end) {
        sock.end();
      }
    }
    
    // Close server
    server.close(() => {
      console.log(chalk.green('✅ Server closed'));
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      console.log(chalk.red('⏰ Force exit after timeout'));
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error(chalk.red('❌ Error during shutdown:'), error.message);
    process.exit(1);
  }
}

// Process event handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (error) => {
  console.error(chalk.red('❌ Unhandled Promise Rejection:'), error.message);
  console.error(error.stack);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error.message);
  console.error(error.stack);
  process.exit(1);
});

// Memory monitoring
setInterval(() => {
  const memUsage = process.memoryUsage();
  const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  
  if (memUsedMB > 450) { // Alert if using more than 450MB
    console.log(chalk.yellow(`⚠️ High memory usage: ${memUsedMB}MB`));
    
    if (global.gc) {
      global.gc();
      console.log(chalk.blue('🧹 Garbage collection triggered'));
    }
  }
}, 10 * 60 * 1000); // Every 10 minutes

// Start the bot
initializeBot();
