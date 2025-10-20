// src/core/SocketManager.js - Focused connection management with exponential backoff
import { EventEmitter } from 'events';
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';
import pino from 'pino';
import chalk from 'chalk';

// Constants for new retry logic
const MAX_RETRIES = 8;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000; // 30 seconds

export class SocketManager extends EventEmitter {
  constructor(sessionManager, pluginManager, mongoManager) {
    super();
    // Clean dependency injection
    this.sessionManager = sessionManager;
    this.pluginManager = pluginManager; // Available for future use (e.g., emitting events to plugins)
    this.mongoManager = mongoManager; // Available for future use

    this.socket = null;
    this.retryCount = 0;
    this.isConnecting = false;
    this.status = 'disconnected';
  }

  /**
   * Calculates the exponential backoff delay.
   * @returns {number} The delay in milliseconds.
   */
  getReconnectDelay() {
    const delay = BASE_RETRY_DELAY_MS * Math.pow(2, this.retryCount);
    // Return the calculated delay, capped at the maximum
    return Math.min(delay, MAX_RETRY_DELAY_MS);
  }

  /**
   * Initiates the connection to WhatsApp.
   */
  async connect() {
    if (this.isConnecting) {
      console.log(chalk.yellow('🔄 Connection attempt already in progress.'));
      return;
    }
    
    try {
      this.isConnecting = true;
      this.status = 'connecting';
      this.emit('statusChange', 'connecting', { attempt: this.retryCount + 1, max: MAX_RETRIES });

      const { state, saveCreds } = await this.sessionManager.getAuthState();
      const { version } = await fetchLatestBaileysVersion();

      console.log(chalk.blue(`📱 Using WhatsApp Web version: ${version.join('.')}`));

      this.socket = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        // Use sessionManager to check if a session ID is present
        printQRInTerminal: !this.sessionManager.sessionId,
        browser: [this.sessionManager.config?.BOT_NAME || 'Groq', 'Chrome', '4.0.0'],
        auth: state,
        
        // Connection optimizations from old file
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 45000,
        defaultQueryTimeoutMs: 45000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 500,
        maxMsgRetryCount: 2,
        
        // Event and history handling
        emitOwnEvents: true,
        shouldSyncHistoryMessage: () => false,
        shouldIgnoreJid: jid => jid === 'status@broadcast',
        
        mobile: false,
        fireInitQueries: true,
      });

      // Add message retry cache (from your existing code)
      this.socket.msgRetryCache = new Map();

      // Setup event handlers that delegate to other managers/emit events
      this.setupEventHandlers(saveCreds);
      
      // Setup the listener for connection state changes
      this.setupConnectionListener();

    } catch (error) {
      this.isConnecting = false;
      this.status = 'error';
      this.emit('statusChange', 'error', { error: error.message });
      console.error(chalk.red('❌ Failed to initiate connection:'), error.message);
    } finally {
        // This is set to false here, but connection listener will manage state
        // from this point forward (e.g. 'open', 'close')
        this.isConnecting = false; 
    }
  }

  /**
   * Sets up listeners for socket events (messages, calls, etc.)
   * and delegates them by emitting them for other managers to handle.
   * @param {Function} saveCreds - The function to save credentials.
   */
  setupEventHandlers(saveCreds) {
    // Save credentials (delegated to sessionManager)
    this.socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (error) {
        console.error(chalk.red('❌ Failed to save credentials:'), error.message);
      }
    });

    // Forward core events for handlers to process
    this.socket.ev.on('messages.upsert', (messageUpdate) => {
      this.emit('message', { socket: this.socket, messageUpdate });
      
      // Keep retry cache logic from old file
      if (messageUpdate.messages) {
        for (const msg of messageUpdate.messages) {
          if (msg.key?.id) {
            this.socket.msgRetryCache?.set(msg.key.id, msg);
          }
        }
        
        // Clean cache periodically
        setTimeout(() => {
          if (this.socket.msgRetryCache?.size > 1000) {
            const entries = Array.from(this.socket.msgRetryCache.entries());
            const toDelete = entries.slice(0, 500);
            toDelete.forEach(([key]) => this.socket.msgRetryCache.delete(key));
          }
        }, 30000);
      }
    });

    this.socket.ev.on('call', (callUpdate) => {
      this.emit('call', { socket: this.socket, callUpdate });
    });

    this.socket.ev.on('groups.update', (groupUpdate) => {
      this.emit('groupUpdate', { socket: this.socket, groupUpdate });
    });

    this.socket.ev.on('group-participants.update', (event) => {
      this.emit('groupParticipants', { socket: this.socket, event });
    });
  }

  /**
   * Sets up the primary listener for connection status changes
   * and implements the exponential backoff retry logic.
   */
  setupConnectionListener() {
    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(chalk.yellow('📱 QR Code Generated - Scan with WhatsApp'));
        console.log(chalk.blue('💡 QR codes expire in 60 seconds. Please scan quickly!'));
        this.status = 'qr_ready';
        this.emit('statusChange', 'qr_ready');
      }

      if (connection === 'connecting') {
        console.log(chalk.yellow(`🔄 Connecting to WhatsApp... (Attempt ${this.retryCount + 1}/${MAX_RETRIES})`));
        this.status = 'connecting';
        this.emit('statusChange', 'connecting', { attempt: this.retryCount + 1, max: MAX_RETRIES });
      }

      if (connection === 'open') {
        console.log(chalk.green('✅ Successfully connected to WhatsApp!'));
        console.log(chalk.cyan(`📱 Connected as: ${this.socket.user?.name || 'Unknown'}`));
        console.log(chalk.cyan(`📞 Phone: ${this.socket.user?.id?.split(':')[0] || 'Unknown'}`));
        
        this.status = 'connected';
        this.retryCount = 0; // Reset retry count on successful connection
        this.emit('statusChange', 'connected');
      }

      if (connection === 'close') {
        this.status = 'disconnected';
        this.emit('statusChange', 'disconnected');

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';

        console.log(chalk.red(`❌ Connection closed`));
        console.log(chalk.yellow(`📝 Status Code: ${statusCode || 'undefined'}`));
        console.log(chalk.yellow(`📝 Reason: ${reason}`));

        let shouldReconnect = true;
        let cleanSessionFirst = false;

        // Handle specific disconnection reasons
        switch (statusCode) {
          case DisconnectReason.loggedOut:
            console.log(chalk.red('🚪 Logged out - Session invalid. Manual re-scan required.'));
            shouldReconnect = false; // Do not attempt to reconnect
            this.status = 'error';
            this.emit('statusChange', 'error', { error: 'Logged out', requiresScan: true });
            cleanSessionFirst = true;
            break;
            
          case DisconnectReason.connectionReplaced:
            console.log(chalk.red('🔄 Connection replaced - Another instance detected. Stopping.'));
            shouldReconnect = false; // Do not attempt to reconnect
            this.status = 'error';
            this.emit('statusChange', 'error', { error: 'Connection replaced' });
            break;
            
          case DisconnectReason.badSession:
            console.log(chalk.red('🚫 Bad session file. Cleaning session and retrying...'));
            cleanSessionFirst = true;
            break;

          case DisconnectReason.restartRequired:
            console.log(chalk.yellow('🔄 Server requires a restart. Retrying...'));
            break;

          case DisconnectReason.timedOut:
            console.log(chalk.red('⏰ Connection timed out. Retrying...'));
            break;
            
          default:
            console.log(chalk.yellow(`❓ Unknown disconnection reason (${statusCode}). Retrying...`));
            break;
        }

        // Handle reconnection logic
        if (shouldReconnect && this.retryCount < MAX_RETRIES) {
          this.retryCount++;
          
          if (cleanSessionFirst) {
            console.log(chalk.blue('🧹 Cleaning session files...'));
            this.sessionManager.cleanSession(); // Asynchronously clean session
          }

          const delay = this.getReconnectDelay();
          console.log(chalk.blue(`🔄 Reconnecting in ${delay / 1000} seconds... (${this.retryCount}/${MAX_RETRIES})`));

          setTimeout(() => {
            this.connect().catch(error => {
              console.error(chalk.red('❌ Reconnection failed:'), error.message);
            });
          }, delay);

        } else if (this.retryCount >= MAX_RETRIES) {
          console.log(chalk.red(`💀 Maximum reconnection attempts (${MAX_RETRIES}) reached. Stopping.`));
          this.status = 'error';
          this.emit('statusChange', 'error', { error: 'Max retries reached' });
        }
      }
    });
  }

  /**
   * Gracefully disconnects the socket.
   */
  async disconnect() {
    if (this.socket) {
      try {
        this.socket.end();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.warn(chalk.yellow('⚠️ Socket disconnect warning:'), error.message);
      }
    }
    this.status = 'disconnected';
    this.socket = null;
    console.log(chalk.blue('🔌 Socket disconnected.'));
  }

  getSocket() { 
    return this.socket; 
  }
  
  /**
   * Checks if the bot is fully connected and ready.
   * @returns {boolean}
   */
  isReady() {
    return this.socket && 
           this.socket.user?.id && 
           this.socket.ws?.readyState === 1 && // 1 = WebSocket.OPEN
           this.status === 'connected';
  }
}