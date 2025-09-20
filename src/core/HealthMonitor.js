import chalk from 'chalk';

export class HealthMonitor {
  constructor(bot, config) {
    this.bot = bot;
    this.config = config;
    this.intervals = new Set();
    this.isMonitoring = false;
  }

  async start() {
    if (this.isMonitoring) return;
    
    console.log(chalk.blue('🏥 Starting health monitoring...'));
    this.isMonitoring = true;

    // Memory monitoring every 20 minutes
    const memoryInterval = setInterval(() => {
      this.monitorMemory();
    }, 20 * 60 * 1000);
    this.intervals.add(memoryInterval);

    // Connection health every 10 minutes
    const connectionInterval = setInterval(() => {
      this.monitorConnection();
    }, 10 * 60 * 1000);
    this.intervals.add(connectionInterval);

    // Database health every 5 minutes (if available)
    if (this.config.MONGODB_URI) {
      const dbInterval = setInterval(() => {
        this.monitorDatabase();
      }, 5 * 60 * 1000);
      this.intervals.add(dbInterval);
    }

    console.log(chalk.green('✅ Health monitoring started'));
  }

  async stop() {
    this.isMonitoring = false;
    
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
    
    console.log(chalk.green('✅ Health monitoring stopped'));
  }

  monitorMemory() {
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const rssUsedMB = Math.round(memUsage.rss / 1024 / 1024);
    
    console.log(chalk.cyan(`💾 Memory: ${memUsedMB}MB heap, ${rssUsedMB}MB RSS`));
    
    if (memUsedMB > 400) {
      console.log(chalk.yellow(`⚠️ High memory usage: ${memUsedMB}MB`));
      
      if (global.gc) {
        console.log(chalk.blue('🗑️ Running garbage collection...'));
        global.gc();
        
        const newMemUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        console.log(chalk.green(`✅ Memory after GC: ${newMemUsage}MB (freed ${memUsedMB - newMemUsage}MB)`));
      }
      
      // Send alert if very high
      if (memUsedMB > 600 && this.config.OWNER_NUMBER) {
        this.sendMemoryAlert(memUsedMB);
      }
    }
  }

  monitorConnection() {
    const status = this.bot.getStatus();
    console.log(chalk.cyan(`📡 Connection Status: ${status}`));

    if (status !== 'running' && status !== 'connected') {
      console.log(chalk.yellow('⚠️ Connection issue detected'));
    }
  }

  async monitorDatabase() {
    const mongoManager = this.bot.getDatabase();
    if (!mongoManager || !mongoManager.healthCheck) return;

    try {
      const health = await mongoManager.healthCheck();
      
      if (health.healthy) {
        const connections = health.connections || { current: 0, available: 0 };
        const usage = connections.available > 0 ? Math.round((connections.current / connections.available) * 100) : 0;
        
        console.log(chalk.cyan(`🗄️ Database: ${health.pingTime}ms ping, ${connections.current}/${connections.available} connections (${usage}%)`));
        
        if (usage > 70) {
          console.log(chalk.yellow(`⚠️ High database connection usage: ${usage}%`));
        }
      } else {
        console.log(chalk.red('🚨 Database health issue:', health.error));
      }
    } catch (error) {
      console.log(chalk.red('❌ Database monitoring error:', error.message));
    }
  }

  async sendMemoryAlert(memUsage) {
    try {
      const socket = this.bot.getSocket();
      if (!socket || !this.config.OWNER_NUMBER) return;
      
      const message = `⚠️ *Memory Alert*

🔴 High memory usage: ${memUsage}MB
⏰ Time: ${new Date().toLocaleString()}

💡 Consider restarting if this persists.`;
      
      await socket.sendMessage(this.config.OWNER_NUMBER + '@s.whatsapp.net', {
        text: message
      });
      
    } catch (error) {
      console.warn('Failed to send memory alert:', error.message);
    }
  }
}
