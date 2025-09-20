import { EventEmitter } from 'events';
import { 
  makeWASocket, 
  fetchLatestBaileysVersion, 
  DisconnectReason 
} from '@whiskeysockets/baileys';
import pino from 'pino';
import chalk from 'chalk';

export class SocketManager extends EventEmitter {
  constructor(config, sessionManager) {
    super();
    this.config = config;
    this.sessionManager = sessionManager;
    this.socket = null;
    this.connectionAttempts = 0;
    this.maxAttempts = 10;
    this.isConnecting = false;
    this.status = 'disconnected';
  }

  async connect() {
    if (this.isConnecting) return;
    
    try {
      this.isConnecting = true;
      this.status = 'connecting';
      this.emit('statusChange', 'connecting');

      const { state, saveCreds } = await this.sessionManager.getAuthState();
      const { version } = await fetchLatestBaileysVersion();

      console.log(chalk.blue(`📱 Using WhatsApp Web version: ${version.join('.')}`));

      this.socket = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !this.config.SESSION_ID,
        browser: [this.config.BOT_NAME, 'Chrome', '4.0.0'],
        auth: state,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 45000,
        defaultQueryTimeoutMs: 45000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 500,
        maxMsgRetryCount: 2,
        emitOwnEvents: true,
        shouldSyncHistoryMessage: () => false,
        shouldIgnoreJid: jid => jid === 'status@broadcast',
        mobile: false,
        fireInitQueries: true
      });

      // Add message retry cache (from your existing code)
      this.socket.msgRetryCache = new Map();

      this.setupEventHandlers(saveCreds);
      this.isConnecting = false;

    } catch (error) {
      this.isConnecting = false;
      this.status = 'error';
      this.emit('statusChange', 'error');
      throw error;
    }
  }

  setupEventHandlers(saveCreds) {
    // Connection updates (your existing logic)
    this.socket.ev.on('connection.update', (update) => {
      this.handleConnectionUpdate(update);
    });

    // Save credentials
    this.socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (error) {
        console.error(chalk.red('❌ Failed to save credentials:'), error.message);
      }
    });

    // Forward events to handlers (keeping your existing handlers)
    this.socket.ev.on('messages.upsert', (messageUpdate) => {
      this.emit('message', { socket: this.socket, messageUpdate });
      
      // Add to retry cache (your existing logic)
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

  handleConnectionUpdate({ connection, lastDisconnect, qr, isNewLogin }) {
    if (qr) {
      console.log(chalk.yellow('📱 QR Code Generated - Scan with WhatsApp'));
      console.log(chalk.blue('💡 QR codes expire in 60 seconds. Please scan quickly!'));
      this.status = 'qr_ready';
      this.emit('statusChange', 'qr_ready');
    }

    if (connection === 'connecting') {
      console.log(chalk.yellow(`🔄 Connecting to WhatsApp... (Attempt ${this.connectionAttempts + 1}/${this.maxAttempts})`));
    }

    if (connection === 'open') {
      console.log(chalk.green('✅ Successfully connected to WhatsApp!'));
      console.log(chalk.cyan(`📱 Connected as: ${this.socket.user?.name || 'Unknown'}`));
      console.log(chalk.cyan(`📞 Phone: ${this.socket.user?.id?.split(':')[0] || 'Unknown'}`));
      
      this.status = 'connected';
      this.connectionAttempts = 0;
      this.emit('statusChange', 'connected');
    }

    if (connection === 'close') {
      this.handleDisconnection(lastDisconnect);
    }
  }

  handleDisconnection(lastDisconnect) {
    this.status = 'disconnected';
    this.emit('statusChange', 'disconnected');

    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const reason = lastDisconnect?.error?.message || 'Unknown';

    console.log(chalk.red(`❌ Connection closed`));
    console.log(chalk.yellow(`📝 Status Code: ${statusCode || 'undefined'}`));
    console.log(chalk.yellow(`📝 Reason: ${reason}`));

    // Your existing reconnection logic
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
        customDelay = 60000;
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

    if (shouldReconnect && this.connectionAttempts < this.maxAttempts) {
      this.connectionAttempts++;

      if (cleanSessionFirst) {
        this.sessionManager.cleanSession();
      }

      const delay = customDelay || this.getReconnectDelay();
      console.log(chalk.blue(`🔄 Reconnecting in ${delay/1000} seconds... (${this.connectionAttempts}/${this.maxAttempts})`));

      setTimeout(() => {
        this.connect().catch(error => {
          console.error(chalk.red('❌ Reconnection failed:'), error.message);
        });
      }, delay);

    } else if (this.connectionAttempts >= this.maxAttempts) {
      console.log(chalk.red(`💀 Maximum reconnection attempts (${this.maxAttempts}) reached`));
      this.status = 'error';
      this.emit('statusChange', 'error');
    }
  }

  getReconnectDelay() {
    return Math.min(3000 * Math.pow(1.5, this.connectionAttempts), 45000);
  }

  async disconnect() {
    if (this.socket) {
      try {
        this.socket.end();
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.warn(chalk.yellow('⚠️ Socket disconnect warning:'), error.message);
      }
    }
    
    this.status = 'disconnected';
    this.socket = null;
  }

  getSocket() { return this.socket; }
  
  isReady() {
    return this.socket && 
           this.socket.user?.id && 
           this.socket.ws?.readyState === 1 &&
           this.status === 'connected';
  }
}
