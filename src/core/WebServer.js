import express from 'express';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class WebServer {
  constructor(config, bot) {
    this.config = config;
    this.bot = bot;
    this.app = express();
    this.server = null;
    this.rateLimitStore = new Map();
    this.setupApp();
  }

  setupApp() {
    // Trust proxy
    this.app.set('trust proxy', true);
    
    // Basic middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      next();
    });
    
    // Rate limiting
    this.app.use(this.rateLimit());
    
    // Serve static files if available
    try {
      const publicPath = path.join(__dirname, '../../public');
      if (fs.existsSync(publicPath)) {
        this.app.use(express.static(publicPath));
      }
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Static file setup warning:'), error.message);
    }
    
    this.setupRoutes();
  }

  rateLimit(windowMs = 15 * 60 * 1000, maxRequests = 100) {
    return (req, res, next) => {
      const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
      const now = Date.now();
      const windowStart = now - windowMs;

      let clientRequests = this.rateLimitStore.get(clientIP) || [];
      clientRequests = clientRequests.filter(timestamp => timestamp > windowStart);

      if (clientRequests.length >= maxRequests) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      clientRequests.push(now);
      this.rateLimitStore.set(clientIP, clientRequests);
      next();
    };
  }

  setupRoutes() {
    // Main status route
    this.app.get('/', (req, res) => {
      try {
        const stats = this.bot.getStats();
        res.json({
          name: this.config.BOT_NAME,
          status: this.bot.getStatus(),
          uptime: this.bot.getUptime(),
          version: '2.0.0',
          timestamp: new Date().toISOString(),
          memory: stats.memory
        });
      } catch (error) {
        res.status(500).json({ 
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // Health check for PM2
    this.app.get('/health', (req, res) => {
      try {
        const stats = this.bot.getStats();
        res.status(200).json({
          status: 'healthy',
          botStatus: this.bot.getStatus(),
          uptime: stats.uptime,
          memory: stats.memory,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(200).json({
          status: 'server_healthy',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Detailed health check
    this.app.get('/api/bot-info', async (req, res) => {
      try {
        const stats = this.bot.getStats();
        
        // Get MongoDB health if available
        let mongoHealth = { healthy: false, error: 'Not configured' };
        try {
          const mongoManager = this.bot.getDatabase();
          if (mongoManager && mongoManager.healthCheck) {
            mongoHealth = await mongoManager.healthCheck();
          }
        } catch (error) {
          mongoHealth = { healthy: false, error: error.message };
        }

        res.json({
          botName: this.config.BOT_NAME,
          status: this.bot.getStatus(),
          mode: this.config.MODE,
          prefix: this.config.PREFIX,
          ownerNumber: this.config.OWNER_NUMBER,
          features: stats.features,
          plugins: stats.plugins,
          database: {
            initialized: !!mongoManager,
            healthy: mongoHealth.healthy,
            connections: mongoHealth.connections || { current: 0, available: 0 },
            error: mongoHealth.error || null
          },
          uptime: stats.uptime,
          memory: stats.memory,
          lastConnection: stats.lastConnection,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Plugin management
    this.app.get('/api/plugins', async (req, res) => {
      try {
        const pluginManager = this.bot.getPluginManager();
        if (!pluginManager) {
          return res.status(404).json({
            success: false,
            error: 'Plugin manager not available'
          });
        }

        const plugins = await pluginManager.getAllPlugins();
        res.json({
          success: true,
          data: plugins,
          count: plugins.length
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Force garbage collection (development only)
    this.app.post('/api/force-gc', (req, res) => {
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
          res.json({
            success: false,
            error: 'GC not available. Start with --expose-gc'
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Page not found',
        availableEndpoints: [
          'GET /',
          'GET /health', 
          'GET /api/bot-info',
          'GET /api/plugins'
        ]
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error(chalk.red('Express error:'), err.message);
      res.status(500).json({ 
        error: 'Internal server error',
        message: this.config.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    });

    // Rate limit cleanup every 10 minutes
    setInterval(() => {
      const now = Date.now();
      const fifteenMinutesAgo = now - (15 * 60 * 1000);
      
      for (const [ip, requests] of this.rateLimitStore.entries()) {
        const recentRequests = requests.filter(timestamp => timestamp > fifteenMinutesAgo);
        if (recentRequests.length === 0) {
          this.rateLimitStore.delete(ip);
        } else {
          this.rateLimitStore.set(ip, recentRequests);
        }
      }
    }, 10 * 60 * 1000);
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.PORT, '0.0.0.0', (err) => {
        if (err) return reject(err);
        
        console.log(chalk.blue(`🌐 Server running on port ${this.config.PORT}`));
        console.log(chalk.cyan(`🔗 Health: http://localhost:${this.config.PORT}/health`));
        console.log(chalk.cyan(`🔌 API: http://localhost:${this.config.PORT}/api/bot-info`));
        
        resolve();
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.config.PORT} already in use`));
        } else {
          reject(error);
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log(chalk.green('✅ Web server stopped'));
          resolve();
        });
      });
    }
  }
}
