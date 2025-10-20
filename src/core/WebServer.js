// src/core/WebServer.js - Full monitoring and management server
import express from 'express';
import http from 'http';
import chalk from 'chalk';
import helmet from 'helmet'; // For security headers
import rateLimit from 'express-rate-limit'; // For rate limiting

export class WebServer {
  constructor(config, bot) {
    this.config = config;
    this.bot = bot; // Inject the main bot instance to access other managers
    this.app = express();
    this.server = http.createServer(this.app);
    this.isListening = false;
  }

  async start() {
    const PORT = this.config.PORT || 3000;

    return new Promise((resolve, reject) => {
      if (this.isListening) {
        console.log(chalk.yellow('🌐 Web server is already running.'));
        return resolve();
      }

      // --- Middleware ---
      this.app.use(helmet()); // ✅ Security headers
      this.app.use(express.json());
      this.app.use(express.static('public')); // Serve static files from public/

      // ✅ Rate limiting per IP
      const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per window
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' },
      });
      this.app.use('/api/', apiLimiter);


      // --- Routes ---
      this.setupRoutes();

      this.server.listen(PORT, () => {
        console.log(chalk.green(`✅ Web server started on http://localhost:${PORT}`));
        this.isListening = true;
        resolve();
      });

      this.server.on('error', (error) => {
        console.error(chalk.red('❌ Web server failed to start:'), error.message);
        this.isListening = false;
        reject(error);
      });
    });
  }

  setupRoutes() {
    // --- Basic Health Check ---
    // ✅ Comprehensive health endpoints
    this.app.get('/health', async (req, res) => {
      try {
        const socketStatus = this.bot.getStatus();
        const dbHealth = await this.bot.getDatabase().healthCheck();
        const pluginHealth = await this.bot.getPluginManager().healthCheck();
        
        const isHealthy = socketStatus === 'connected' && dbHealth.healthy && pluginHealth.healthy;
        
        res.status(isHealthy ? 200 : 503).json({
          status: isHealthy ? 'ok' : 'unhealthy',
          socket: socketStatus,
          database: {
            healthy: dbHealth.healthy,
            ping: dbHealth.pingTime,
            error: dbHealth.error || null,
          },
          plugins: {
            healthy: pluginHealth.healthy,
            issues: pluginHealth.issues,
          },
        });
      } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
      }
    });

    // --- API Endpoints ---
    
    // ✅ Bot Info Endpoint
    this.app.get('/api/bot-info', async (req, res) => {
      try {
        const stats = this.bot.getStats();
        const dbHealth = await this.bot.getDatabase().healthCheck();

        res.json({
          botName: this.config.BOT_NAME,
          status: stats.status,
          mode: this.config.MODE,
          prefix: this.config.PREFIX,
          uptime: stats.uptime,
          memory: stats.memory,
          database: {
            connected: dbHealth.healthy,
            ping: dbHealth.pingTime,
            error: dbHealth.error || null,
          },
          connection: {
            status: stats.status,
            lastSuccessfulConnection: stats.lastConnection,
          },
          plugins: {
            total: stats.plugins.total,
            enabled: stats.plugins.enabled,
            disabled: stats.plugins.disabled,
          },
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bot info', details: error.message });
      }
    });

    // ✅ Plugin Management API
    this.app.get('/api/plugins', async (req, res) => {
      try {
        const plugins = await this.bot.getPluginManager().getAllPlugins();
        res.json(plugins);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch plugins', details: error.message });
      }
    });

    // ✅ Memory Profiling & Manual GC
    this.app.post('/api/force-gc', (req, res) => {
      if (global.gc) {
        const memBefore = process.memoryUsage();
        global.gc();
        const memAfter = process.memoryUsage();

        const formatBytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
        const freed = memBefore.heapUsed - memAfter.heapUsed;

        res.json({
          message: 'Garbage collection forced.',
          memoryBefore: {
            heapUsed: formatBytes(memBefore.heapUsed),
            rss: formatBytes(memBefore.rss),
          },
          memoryAfter: {
            heapUsed: formatBytes(memAfter.heapUsed),
            rss: formatBytes(memAfter.rss),
          },
          freed: {
            bytes: freed,
            formatted: formatBytes(freed),
          },
        });
      } else {
        res.status(501).json({ error: 'Garbage collection is not available. Run with --expose-gc flag.' });
      }
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (!this.isListening || !this.server) {
        console.log(chalk.yellow('🌐 Web server is not running.'));
        return resolve();
      }

      this.server.close(() => {
        console.log(chalk.green('✅ Web server stopped.'));
        this.isListening = false;
        resolve();
      });
    });
  }
}