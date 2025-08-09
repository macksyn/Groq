import dotenv from 'dotenv';
dotenv.config();

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

// Configuration
const config = {
  SESSION_ID: process.env.SESSION_ID || '',
  PREFIX: process.env.PREFIX || '.',
  BOT_NAME: process.env.BOT_NAME || 'WhatsApp Bot',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '',
  MODE: process.env.MODE || 'public',
  AUTO_BIO: process.env.AUTO_BIO === 'true',
  AUTO_READ: process.env.AUTO_READ === 'true',
  AUTO_REACT: process.env.AUTO_REACT === 'true',
  WELCOME: process.env.WELCOME === 'true',
  ANTILINK: process.env.ANTILINK === 'true',
  REJECT_CALL: process.env.REJECT_CALL === 'true'
};

// Express server setup
const app = express();
const PORT = process.env.PORT || 3000;

// Session management
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

// Create session directory
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

// Logger setup
const logger = pino({
  level: 'info',
  timestamp: () => `,"time":"${new Date().toISOString()}"`
});

// Bio update variables
let bioUpdateCount = 0;
const MAX_BIO_UPDATES_PER_HOUR = 2;

// Reset bio update count every hour
setInterval(() => {
  bioUpdateCount = 0;
}, 60 * 60 * 1000);

// Download session from Mega
async function downloadSessionFromMega() {
  try {
    const sessionId = config.SESSION_ID;
    
    if (!sessionId || !sessionId.includes('~')) {
      console.log(chalk.red('❌ Invalid SESSION_ID format. Expected format: Bot~fileId#key'));
      return false;
    }

    console.log(chalk.yellow('📥 Downloading session from Mega...'));
    
    // Extract file data from session ID
    const fileData = sessionId.split('~')[1];
    
    if (!fileData || !fileData.includes('#')) {
      console.log(chalk.red('❌ Invalid SESSION_ID format. Missing file ID or key.'));
      return false;
    }

    const [fileId, key] = fileData.split('#');
    const file = File.fromURL(`https://mega.nz/file/${fileId}#${key}`);
    
    // Download with timeout
    const downloadPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Download timeout after 30 seconds'));
      }, 30000);

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
    console.error(chalk.red('❌ Failed to download session:'), error.message);
    return false;
  }
}

// Update bio with rate limiting
async function updateBio(sock) {
  try {
    if (!config.AUTO_BIO || bioUpdateCount >= MAX_BIO_UPDATES_PER_HOUR) {
      return;
    }

    const time = moment().tz('Africa/Lagos').format('HH:mm:ss');
    const bioText = `🤖 ${config.BOT_NAME} | Active at ${time}`;
    
    await sock.updateProfileStatus(bioText);
    bioUpdateCount++;
    
    console.log(chalk.cyan(`📝 Bio updated: ${bioText}`));
  } catch (error) {
    if (!error.message.includes('rate')) {
      console.log(chalk.yellow(`⚠️ Bio update failed: ${error.message}`));
    }
  }
}

// Create WhatsApp socket
async function createWhatsAppSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  
  console.log(chalk.blue(`📱 Using WhatsApp Web version: ${version.join('.')}`));

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    browser: [config.BOT_NAME, 'Chrome', '4.0.0'],
    auth: state,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => null
  });

  return { sock, saveCreds };
}

// Main bot startup function
async function startBot() {
  try {
    console.log(chalk.magenta('🚀 Starting WhatsApp Bot...'));
    
    const { sock, saveCreds } = await createWhatsAppSocket();
    
    // Connection event handler
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log(chalk.yellow('📱 Scan the QR code above to connect'));
      }
      
      if (connection === 'connecting') {
        console.log(chalk.yellow('🔄 Connecting to WhatsApp...'));
      }
      
      if (connection === 'open') {
        console.log(chalk.green('✅ Successfully connected to WhatsApp!'));
        
        // Send startup message
        const startupMsg = `🤖 *${config.BOT_NAME} Started Successfully!*

📊 *Bot Information:*
• Mode: ${config.MODE.toUpperCase()}
• Prefix: ${config.PREFIX}
• Owner: ${config.OWNER_NUMBER}
• Time: ${moment().format('DD/MM/YYYY HH:mm:ss')}

🎯 *Features Active:*
${config.AUTO_READ ? '✅' : '❌'} Auto Read
${config.AUTO_REACT ? '✅' : '❌'} Auto React
${config.WELCOME ? '✅' : '❌'} Welcome Messages
${config.ANTILINK ? '✅' : '❌'} Anti Link
${config.REJECT_CALL ? '✅' : '❌'} Call Rejection

🔥 Bot is ready to serve!`;

        try {
          await sock.sendMessage(sock.user.id, { text: startupMsg });
          await updateBio(sock);
        } catch (error) {
          console.log(chalk.yellow('⚠️ Failed to send startup message'));
        }
        
        // Start bio update interval
        if (config.AUTO_BIO) {
          setInterval(() => updateBio(sock), 5 * 60 * 1000); // Every 5 minutes
        }
      }
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(chalk.red(`❌ Connection closed. Status: ${statusCode}`));
        
        if (statusCode !== DisconnectReason.loggedOut) {
          console.log(chalk.yellow('🔄 Reconnecting in 5 seconds...'));
          setTimeout(startBot, 5000);
        } else {
          console.log(chalk.red('🚪 Bot logged out. Please restart and scan QR.'));
          process.exit(1);
        }
      }
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Message handler
    sock.ev.on('messages.upsert', async (messageUpdate) => {
      try {
        await MessageHandler(messageUpdate, sock, logger, config);
      } catch (error) {
        console.error(chalk.red('❌ Message handler error:'), error.message);
      }
    });

    // Call handler
    sock.ev.on('call', async (callUpdate) => {
      try {
        await CallHandler(callUpdate, sock, config);
      } catch (error) {
        console.error(chalk.red('❌ Call handler error:'), error.message);
      }
    });

    // Group updates handler
    sock.ev.on('groups.update', async (groupUpdate) => {
      try {
        await GroupHandler(sock, groupUpdate, config);
      } catch (error) {
        console.error(chalk.red('❌ Group handler error:'), error.message);
      }
    });

    // Set bot mode
    sock.public = config.MODE === 'public';
    
    console.log(chalk.green(`🎯 Bot mode: ${config.MODE.toUpperCase()}`));
    
  } catch (error) {
    console.error(chalk.red('❌ Startup error:'), error.message);
    console.log(chalk.yellow('🔄 Retrying in 10 seconds...'));
    setTimeout(startBot, 10000);
  }
}

// Initialize bot
async function initializeBot() {
  try {
    console.log(chalk.cyan('🎬 Initializing WhatsApp Bot...'));
    
    // Check if session exists locally
    if (fs.existsSync(credsPath)) {
      console.log(chalk.green('🔐 Found local session, starting bot...'));
      await startBot();
    } else if (config.SESSION_ID) {
      console.log(chalk.yellow('📥 No local session found, downloading from Mega...'));
      const downloaded = await downloadSessionFromMega();
      
      if (downloaded) {
        await startBot();
      } else {
        console.log(chalk.red('❌ Failed to download session. Please scan QR code.'));
        await startBot();
      }
    } else {
      console.log(chalk.yellow('📱 No SESSION_ID provided. Please scan QR code to authenticate.'));
      await startBot();
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Initialization failed:'), error.message);
    process.exit(1);
  }
}

// Express server routes
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: config.BOT_NAME,
    mode: config.MODE,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(chalk.blue(`🌐 Server running on port ${PORT}`));
});

// Keep alive ping
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(async () => {
    try {
      await axios.get(`${process.env.RENDER_EXTERNAL_URL}/health`, { timeout: 10000 });
    } catch (error) {
      // Silent fail
    }
  }, 4 * 60 * 1000); // Every 4 minutes
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Gracefully shutting down...'));
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error(chalk.red('❌ Unhandled Promise Rejection:'), error.message);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error.message);
  process.exit(1);
});

// Start the bot
initializeBot();
