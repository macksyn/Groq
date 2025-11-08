// src/core/WhatsAppBot.js - FIXED VERSION
import { EventEmitter } from 'events';
import moment from 'moment-timezone';
import logger from '../utils/logger.js';
import mongoManager from '../../lib/mongoManager.js';
import PluginManager from '../../lib/pluginManager.js';
import { SocketManager } from './SocketManager.js';
import { WebServer } from './WebServer.js';
import { SessionManager } from './SessionManager.js';
import { HealthMonitor } from './HealthMonitor.js';
import { ConnectionMonitor } from './ConnectionMonitor.js';
import MessageHandler from '../../handlers/messageHandler.js';
import CallHandler from '../../handlers/callHandler.js';
import GroupHandler from '../../handlers/groupHandler.js';

export class WhatsAppBot extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.status = 'initializing';
    this.startTime = Date.now();
    this.mongoManager = mongoManager;
    this.pluginManager = PluginManager;
    this.sessionManager = null;
    this.socketManager = null;
    this.webServer = null;
    this.healthMonitor = null;
    this.connectionMonitor = null; // ✅ Added
    this.bioUpdateCount = 0;
    this.lastSuccessfulConnection = Date.now();
  }

  async start() {
    try {
      logger.info('🚀 Starting Fresh WhatsApp Bot...');

      // Step 1: Initialize database
      await this.initializeDatabase();

      // Step 2: Initialize session management
      await this.initializeSessionManager();

      // Step 3: Initialize plugins
      await this.initializePlugins();

      // Step 4: Start web server
      await this.startWebServer();

      // Step 5: Connect to WhatsApp
      await this.connectWhatsApp();

      // Step 6: Start monitoring
      await this.startMonitoring();

      this.status = 'running';
      logger.info('🎉 Bot started successfully!');
      this.emit('started');

      this.on('shutdown', () => {
        this.stop().then(() => process.exit(0));
      });

      this.on('restart', () => {
        this.restart();
      });
    } catch (error) {
      this.status = 'error';
      logger.error(error, '❌ Bot startup failed');
      throw error;
    }
  }

  async restart() {
    try {
      await this.stop();
      await this.start();
    } catch (error) {
      logger.error(error, '❌ Bot restart failed');
      process.exit(1);
    }
  }

  async stop() {
    try {
      logger.info('🛑 Stopping bot...');
      this.status = 'stopping';

      // ✅ FIXED: Stop all monitors in correct order
      if (this.connectionMonitor) this.connectionMonitor.stop();
      if (this.healthMonitor) await this.healthMonitor.stop();
      if (this.socketManager) await this.socketManager.disconnect();
      if (this.webServer) await this.webServer.stop();
      if (this.mongoManager) await this.mongoManager.close();

      this.status = 'stopped';
      logger.info('✅ Bot stopped');
      this.emit('stopped');
    } catch (error) {
      logger.error(error, '❌ Bot stop failed');
      throw error;
    }
  }

  async initializeDatabase() {
    if (!this.config.MONGODB_URI) {
      logger.warn('⚠️ No MongoDB URI - running without database');
      return;
    }

    try {
      logger.info('🗄️ Initializing database...');
      const db = await this.mongoManager.connect();

      if (db) {
        logger.info('✅ Database connected successfully');
      } else {
        logger.warn('⚠️ Database connection failed - bot will continue without DB');
      }
    } catch (error) {
      logger.warn('⚠️ Database initialization failed - bot will continue without DB');
    }
  }

  async initializeSessionManager() {
    logger.info('📁 Initializing session management...');
    this.sessionManager = new SessionManager(this.config);
    await this.sessionManager.initialize();
  }

  async initializePlugins() {
    try {
      logger.info('🔌 Loading plugins...');
      await this.pluginManager.loadPlugins();
      const stats = this.pluginManager.getPluginStats();
      logger.info(`✅ Loaded ${stats.enabled}/${stats.total} plugins`);
    } catch (error) {
      logger.warn(error, '⚠️ Plugin initialization warning');
    }
  }

  async startWebServer() {
    logger.info('🌐 Starting web server...');
    this.webServer = new WebServer(this.config, this);
    await this.webServer.start();
  }

  async connectWhatsApp() {
    logger.info('📱 Connecting to WhatsApp...');

    // Create socket manager
    this.socketManager = new SocketManager(
      this.sessionManager, 
      this.pluginManager, 
      this.mongoManager
    );

    // ✅ Create connection monitor BEFORE connecting
    this.connectionMonitor = new ConnectionMonitor(this.socketManager);

    // ✅ Listen to health warnings
    this.connectionMonitor.on('healthWarning', (data) => {
      logger.warn(`⚠️ Connection health warning: ${data.failedChecks} failed checks`);
    });

    // Setup event handlers
    this.socketManager.on('message', async (data) => {
      try {
        await MessageHandler(data.messageUpdate, data.socket, logger, this.config, this);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        if (msg.includes('Bad MAC') || msg.includes('Failed to decrypt')) {
          logger.warn('⚠️ Dropped message from %s due to decryption failure: %s', 
            data.messageUpdate?.key?.remoteJid || 'unknown', msg);
        } else {
          logger.error(err, '❌ Message handler error:');
        }
      }
    });

    this.socketManager.on('call', async (data) => {
      await CallHandler(data.callUpdate, data.socket, this.config, logger);
    });

    this.socketManager.on('groupUpdate', async (data) => {
      await GroupHandler(data.socket, data.groupUpdate, this.config, logger);
    });

    this.socketManager.on('statusChange', (status) => {
      this.handleStatusChange(status);
    });

    // Connect to WhatsApp
    await this.socketManager.connect();
  }

  async startMonitoring() {
    this.healthMonitor = new HealthMonitor(this, this.config);
    await this.healthMonitor.start();

    if (this.config.AUTO_BIO) {
      this.startBioUpdates();
    }
  }

  startBioUpdates() {
    setInterval(async () => {
      try {
        if (this.bioUpdateCount >= 3) return; 

        const socket = this.socketManager?.getSocket();
        if (!socket || !socket.user?.id) return;

        const time = moment().tz(this.config.TIMEZONE).format('HH:mm:ss');
        const date = moment().tz(this.config.TIMEZONE).format('DD/MM/YYYY');
        const dbStatus = this.mongoManager.isConnected ? '🔗' : '⚠️';

        const bioText = `🤖 ${this.config.BOT_NAME}\n📅 ${date} | ⏰ ${time}\n${dbStatus} Database ${this.mongoManager.isConnected ? 'Online' : 'Offline'}`;

        await socket.updateProfileStatus(bioText);
        this.bioUpdateCount++;

        logger.info(`📝 Bio updated: ${bioText.replace(/\n/g, ' | ')}`);
      } catch (error) {
        logger.warn(error, '⚠️ Bio update failed');
      }
    }, 20 * 60 * 1000); 

    setInterval(() => {
      this.bioUpdateCount = 0;
    }, 60 * 60 * 1000);
  }

  // ✅ FIXED: Clean handleStatusChange method
  handleStatusChange(status) {
    this.status = status;
    this.emit('statusChange', status);

    if (status === 'connected') {
      this.lastSuccessfulConnection = Date.now();

      // Set plugin references for scheduled tasks
      this.setPluginReferences();

      // Send startup notification
      this.sendStartupNotification();

      // ✅ Start connection monitoring (only once, with internal 45s delay)
      if (this.connectionMonitor && !this.connectionMonitor.isMonitoring) {
        this.connectionMonitor.start();
      }
    }
  }

  // ✅ Set references for scheduled tasks
  setPluginReferences() {
    try {
      const socket = this.socketManager?.getSocket();
      if (socket && socket.user?.id) {
        logger.info('🔗 Setting plugin manager references for scheduled tasks...');
        this.pluginManager.setReferences(socket, this.config, this);
        logger.info('✅ Plugin references set successfully');
      }
    } catch (error) {
      logger.error(error, '❌ Failed to set plugin references');
    }
  }

  async sendStartupNotification() {
    try {
      if (!this.config.OWNER_NUMBER) return;

      const socket = this.socketManager?.getSocket();
      if (!socket || !socket.user?.id) return;

      setTimeout(async () => {
        try {
          const message = this.buildStartupMessage();
          await socket.sendMessage(this.config.OWNER_NUMBER + '@s.whatsapp.net', { 
            text: message 
          });
          logger.info('📤 Startup notification sent');
        } catch (error) {
          logger.warn(error, '⚠️ Startup notification failed');
        }
      }, 10000); 
    } catch (error) {
      logger.warn(error, '⚠️ Startup notification error');
    }
  }

  buildStartupMessage() {
    const pluginStats = this.pluginManager.getPluginStats();
    const dbStatus = this.mongoManager.isConnected ? '✅ Connected' : '❌ Offline';
    const scheduledTasksInfo = this.pluginManager.getScheduledTasksInfo();

    return `🤖 *${this.config.BOT_NAME} Online!*

📊 Status: ✅ Running
⚙️ Mode: ${this.config.MODE.toUpperCase()}
🎯 Prefix: ${this.config.PREFIX}
⏰ ${moment().tz(this.config.TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}

🔌 Plugins: ${pluginStats.enabled}/${pluginStats.total}
⏰ Scheduled Tasks: ${scheduledTasksInfo.enabled}/${scheduledTasksInfo.total}
🗄️ Database: ${dbStatus}

🎮 *Active Features:*
${this.config.AUTO_READ ? '✅' : '❌'} Auto Read
${this.config.AUTO_REACT ? '✅' : '❌'} Auto React  
${this.config.WELCOME ? '✅' : '❌'} Welcome Messages
${this.config.REJECT_CALL ? '✅' : '❌'} Call Rejection

🔥 Ready to serve!

💡 Type *${this.config.PREFIX}menu* to see available commands.`;
  }

  // Getters for external access
  getStatus() { 
    return this.status; 
  }

  getUptime() { 
    return Date.now() - this.startTime; 
  }

  getSocket() { 
    return this.socketManager?.getSocket(); 
  }

  getDatabase() { 
    return this.mongoManager; 
  }

  getPluginManager() { 
    return this.pluginManager; 
  }

  getStats() {
    const memUsage = process.memoryUsage();
    const socket = this.socketManager?.getSocket();

    // Add detailed socket diagnostics
    const socketDiagnostics = socket ? {
      hasSocket: true,
      hasUser: !!socket.user?.id,
      userId: socket.user?.id || null,
      hasWebSocket: !!socket.ws,
      wsReadyState: socket.ws?.readyState,
      wsReadyStateText: this.getWebSocketStateText(socket.ws?.readyState)
    } : {
      hasSocket: false
    };

    return {
      status: this.status,
      uptime: this.getUptime(),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      plugins: this.pluginManager.getPluginStats(),
      scheduledTasks: this.pluginManager.getScheduledTasksInfo(),
      database: this.mongoManager.getStats ? this.mongoManager.getStats() : {},
      lastConnection: new Date(this.lastSuccessfulConnection).toISOString(),
      connection: this.connectionMonitor ? this.connectionMonitor.getStats() : null,
      socketDiagnostics: socketDiagnostics,
      features: {
        AUTO_READ: this.config.AUTO_READ,
        AUTO_REACT: this.config.AUTO_REACT,
        WELCOME: this.config.WELCOME,
        ANTILINK: this.config.ANTILINK,
        REJECT_CALL: this.config.REJECT_CALL,
        AUTO_BIO: this.config.AUTO_BIO
      }
    };
  }

  getWebSocketStateText(state) {
    if (state === undefined || state === null) return 'UNDEFINED';
    const states = {
      0: 'CONNECTING',
      1: 'OPEN',
      2: 'CLOSING',
      3: 'CLOSED'
    };
    return states[state] || `UNKNOWN(${state})`;
  }
}