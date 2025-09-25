import { EventEmitter } from 'events';
import chalk from 'chalk';
import moment from 'moment-timezone';

// Import your existing managers (keeping them as-is)
import mongoManager from '../../lib/mongoManager.js';
import PluginManager from '../../lib/pluginManager.js';

// Import new lightweight components
import { SocketManager } from './SocketManager.js';
import { WebServer } from './WebServer.js';
import { SessionManager } from './SessionManager.js';
import { HealthMonitor } from './HealthMonitor.js';

// Import your existing handlers (keeping them)
import MessageHandler from '../../handlers/messageHandler.js';
import CallHandler from '../../handlers/callHandler.js';
import GroupHandler from '../../handlers/groupHandler.js';

export class WhatsAppBot extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.status = 'initializing';
    this.startTime = Date.now();
    
    // Use your existing managers
    this.mongoManager = mongoManager;
    this.pluginManager = PluginManager;
    
    // New lightweight components
    this.sessionManager = null;
    this.socketManager = null;
    this.webServer = null;
    this.healthMonitor = null;
    
    this.bioUpdateCount = 0;
    this.lastSuccessfulConnection = Date.now();
  }

  async start() {
    try {
      console.log(chalk.blue('🚀 Starting Fresh WhatsApp Bot...'));
      
      // Step 1: Initialize database (your existing mongoManager)
      await this.initializeDatabase();
      
      // Step 2: Initialize session management
      await this.initializeSessionManager();
      
      // Step 3: Initialize plugins (your existing PluginManager)  
      await this.initializePlugins();
      
      // Step 4: Start web server
      await this.startWebServer();
      
      // Step 5: Connect to WhatsApp
      await this.connectWhatsApp();
      
      // Step 6: Start monitoring
      await this.startMonitoring();
      
      this.status = 'running';
      console.log(chalk.green('🎉 Bot started successfully!'));
      this.emit('started');

      this.on('shutdown', () => {
        this.stop().then(() => process.exit(0));
      });

      this.on('restart', () => {
        this.restart();
      });
      
    } catch (error) {
      this.status = 'error';
      console.error(chalk.red('❌ Bot startup failed:'), error.message);
      throw error;
    }
  }

  async restart() {
    try {
      await this.stop();
      await this.start();
    } catch (error) {
      console.error(chalk.red('❌ Bot restart failed:'), error.message);
      process.exit(1);
    }
  }

  async stop() {
    try {
      console.log(chalk.yellow('🛑 Stopping bot...'));
      this.status = 'stopping';
      
      if (this.healthMonitor) await this.healthMonitor.stop();
      if (this.socketManager) await this.socketManager.disconnect();
      if (this.webServer) await this.webServer.stop();
      if (this.mongoManager) await this.mongoManager.close();
      
      this.status = 'stopped';
      console.log(chalk.green('✅ Bot stopped'));
      this.emit('stopped');
      
    } catch (error) {
      console.error(chalk.red('❌ Bot stop failed:'), error.message);
      throw error;
    }
  }

  async initializeDatabase() {
    if (!this.config.MONGODB_URI) {
      console.log(chalk.yellow('⚠️ No MongoDB URI - skipping database'));
      return;
    }

    try {
      console.log(chalk.blue('🗄️ Initializing database...'));
      await this.mongoManager.connect();
      console.log(chalk.green('✅ Database connected'));
    } catch (error) {
      console.log(chalk.yellow('⚠️ Database failed, continuing without it'));
    }
  }

  async initializeSessionManager() {
    console.log(chalk.blue('📁 Initializing session management...'));
    this.sessionManager = new SessionManager(this.config);
    await this.sessionManager.initialize();
  }

  async initializePlugins() {
    try {
      console.log(chalk.blue('🔌 Initializing plugins...'));
      await this.pluginManager.loadPlugins();
      const stats = this.pluginManager.getPluginStats();
      console.log(chalk.green(`✅ Loaded ${stats.enabled}/${stats.total} plugins`));
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Plugin initialization warning:'), error.message);
    }
  }

  async startWebServer() {
    console.log(chalk.blue('🌐 Starting web server...'));
    this.webServer = new WebServer(this.config, this);
    await this.webServer.start();
  }

  async connectWhatsApp() {
    console.log(chalk.blue('📱 Connecting to WhatsApp...'));
    this.socketManager = new SocketManager(this.config, this.sessionManager);
    
    // Connect your existing handlers
    this.socketManager.on('message', async (data) => {
      await MessageHandler(data.messageUpdate, data.socket, console, this.config, this);
    });
    
    this.socketManager.on('call', async (data) => {
      await CallHandler(data.callUpdate, data.socket, this.config);
    });
    
    this.socketManager.on('groupUpdate', async (data) => {
      await GroupHandler(data.socket, data.groupUpdate, this.config);
    });
    
    this.socketManager.on('statusChange', (status) => {
      this.handleStatusChange(status);
    });
    
    await this.socketManager.connect();
  }

  async startMonitoring() {
    this.healthMonitor = new HealthMonitor(this, this.config);
    await this.healthMonitor.start();
    
    // Start bio updates if enabled
    if (this.config.AUTO_BIO) {
      this.startBioUpdates();
    }
  }

  startBioUpdates() {
    setInterval(async () => {
      try {
        if (this.bioUpdateCount >= 3) return; // Max 3 per hour
        
        const socket = this.socketManager?.getSocket();
        if (!socket || !socket.user?.id) return;
        
        const time = moment().tz(this.config.TIMEZONE).format('HH:mm:ss');
        const date = moment().tz(this.config.TIMEZONE).format('DD/MM/YYYY');
        const dbStatus = this.mongoManager.isConnected ? '🔗' : '⚠️';
        
        const bioText = `🤖 ${this.config.BOT_NAME}
📅 ${date} | ⏰ ${time}
${dbStatus} Database ${this.mongoManager.isConnected ? 'Online' : 'Offline'}`;

        await socket.updateProfileStatus(bioText);
        this.bioUpdateCount++;
        
        console.log(chalk.cyan(`📝 Bio updated: ${bioText.replace(/\n/g, ' | ')}`));
      } catch (error) {
        console.log(chalk.yellow('⚠️ Bio update failed:'), error.message);
      }
    }, 20 * 60 * 1000); // Every 20 minutes
    
    // Reset bio update count every hour
    setInterval(() => {
      this.bioUpdateCount = 0;
    }, 60 * 60 * 1000);
  }

  handleStatusChange(status) {
    this.status = status;
    this.emit('statusChange', status);
    
    if (status === 'connected') {
      this.lastSuccessfulConnection = Date.now();
      this.sendStartupNotification();
    }
  }

  async sendStartupNotification() {
    try {
      if (!this.config.OWNER_NUMBER) return;
      
      const socket = this.socketManager?.getSocket();
      if (!socket || !socket.user?.id) return;
      
      // Wait a bit for socket to be fully ready
      setTimeout(async () => {
        try {
          const message = this.buildStartupMessage();
          await socket.sendMessage(this.config.OWNER_NUMBER + '@s.whatsapp.net', { 
            text: message 
          });
          console.log(chalk.green('📤 Startup notification sent'));
        } catch (error) {
          console.log(chalk.yellow('⚠️ Startup notification failed:'), error.message);
        }
      }, 10000); // 10 second delay
      
    } catch (error) {
      console.log(chalk.yellow('⚠️ Startup notification error:'), error.message);
    }
  }

  buildStartupMessage() {
    const pluginStats = this.pluginManager.getPluginStats();
    const dbStatus = this.mongoManager.isConnected ? '✅ Connected' : '❌ Offline';
    
    return `🤖 *${this.config.BOT_NAME} Online!*

📊 Status: ✅ Running
⚙️ Mode: ${this.config.MODE.toUpperCase()}
🎯 Prefix: ${this.config.PREFIX}
⏰ ${moment().tz(this.config.TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}

🔌 Plugins: ${pluginStats.enabled}/${pluginStats.total}
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
  getStatus() { return this.status; }
  getUptime() { return Date.now() - this.startTime; }
  getSocket() { return this.socketManager?.getSocket(); }
  getDatabase() { return this.mongoManager; }
  getPluginManager() { return this.pluginManager; }
  
  getStats() {
    const memUsage = process.memoryUsage();
    
    return {
      status: this.status,
      uptime: this.getUptime(),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      plugins: this.pluginManager.getPluginStats(),
      database: this.mongoManager.getStats ? this.mongoManager.getStats() : {},
      lastConnection: new Date(this.lastSuccessfulConnection).toISOString(),
      features: {
        autoRead: this.config.AUTO_READ,
        autoReact: this.config.AUTO_REACT,
        welcome: this.config.WELCOME,
        antilink: this.config.ANTILINK,
        rejectCall: this.config.REJECT_CALL,
        autoBio: this.config.AUTO_BIO
      }
    };
  }
}
