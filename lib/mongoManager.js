// lib/mongoManager.js - Centralized MongoDB Connection Manager
import { MongoClient } from 'mongodb';
import chalk from 'chalk';

class MongoConnectionManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.connectionPromise = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds
    
    // Connection monitoring
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      lastConnectionTime: null,
      uptime: Date.now()
    };
    
    // Start monitoring
    this.startMonitoring();
  }

  async connect() {
    // If already connected, return existing connection
    if (this.isConnected && this.db) {
      return this.db;
    }

    // If connection is in progress, wait for it
    if (this.isConnecting && this.connectionPromise) {
      return await this.connectionPromise;
    }

    // Start new connection
    this.isConnecting = true;
    this.connectionPromise = this._performConnection();
    
    try {
      const db = await this.connectionPromise;
      return db;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  async _performConnection() {
    try {
      const MONGODB_URI = process.env.MONGODB_URI;
      const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
      
      if (!MONGODB_URI) {
        throw new Error('MONGODB_URI not found in environment variables');
      }

      console.log(chalk.blue('🔌 Connecting to MongoDB...'));

      // Enhanced connection options for M0 tier optimization
      const options = {
        // Connection Pool Settings - CRITICAL for M0 tier
        maxPoolSize: 8,          // Reduced from default 100 for M0 tier
        minPoolSize: 2,          // Keep minimum connections alive
        maxIdleTimeMS: 30000,    // Close connections after 30s idle
        maxConnecting: 3,        // Limit concurrent connections
        
        // Timeout Settings
        serverSelectionTimeoutMS: 10000,  // Reduced timeout
        socketTimeoutMS: 45000,
        connectTimeoutMS: 15000,
        heartbeatFrequencyMS: 10000,      // Check connection health
        
        // Resilience Settings
        retryWrites: true,
        retryReads: true,
        
        // Buffer Settings
        bufferMaxEntries: 0,     // Fail fast instead of buffering
        bufferCommands: false,
        
        // Monitoring
        monitorCommands: process.env.NODE_ENV === 'development'
      };

      // Create single client instance
      this.client = new MongoClient(MONGODB_URI, options);
      
      // Connect with timeout
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 20000);
      });
      
      await Promise.race([connectPromise, timeoutPromise]);
      
      this.db = this.client.db(DATABASE_NAME);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.connectionStats.totalConnections++;
      this.connectionStats.lastConnectionTime = new Date();
      
      console.log(chalk.green(`✅ MongoDB connected successfully to: ${DATABASE_NAME}`));
      console.log(chalk.cyan(`🏊 Pool settings: maxPoolSize=${options.maxPoolSize}, minPoolSize=${options.minPoolSize}`));
      
      // Setup event listeners for monitoring
      this._setupEventListeners();
      
      // Test connection
      await this._testConnection();
      
      return this.db;
      
    } catch (error) {
      this.isConnected = false;
      this.connectionStats.failedConnections++;
      
      console.error(chalk.red('❌ MongoDB connection failed:'), error.message);
      
      // Auto-reconnect logic
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(chalk.yellow(`🔄 Reconnecting in ${this.reconnectDelay/1000}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`));
        
        setTimeout(() => {
          this.connect().catch(err => {
            console.error('Reconnection failed:', err.message);
          });
        }, this.reconnectDelay);
        
        // Exponential backoff
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
      }
      
      throw error;
    }
  }

  _setupEventListeners() {
    if (!this.client) return;

    // Connection pool monitoring
    this.client.on('connectionPoolCreated', (event) => {
      console.log(chalk.cyan(`🏊 Connection pool created for: ${event.address}`));
    });

    this.client.on('connectionPoolReady', (event) => {
      console.log(chalk.green(`✅ Connection pool ready: ${event.address}`));
    });

    this.client.on('connectionPoolCleared', (event) => {
      console.log(chalk.yellow(`🧹 Connection pool cleared: ${event.address}`));
    });

    this.client.on('connectionCreated', (event) => {
      this.connectionStats.activeConnections++;
      if (process.env.NODE_ENV === 'development') {
        console.log(chalk.blue(`➕ Connection created: ${event.connectionId} (Total: ${this.connectionStats.activeConnections})`));
      }
    });

    this.client.on('connectionClosed', (event) => {
      this.connectionStats.activeConnections--;
      if (process.env.NODE_ENV === 'development') {
        console.log(chalk.gray(`➖ Connection closed: ${event.connectionId} (Total: ${this.connectionStats.activeConnections})`));
      }
    });

    this.client.on('error', (error) => {
      console.error(chalk.red('🚨 MongoDB client error:'), error.message);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log(chalk.yellow('📪 MongoDB connection closed'));
      this.isConnected = false;
    });
  }

  async _testConnection() {
    try {
      await this.db.admin().ping();
      console.log(chalk.green('🏓 MongoDB ping successful'));
    } catch (error) {
      console.warn(chalk.yellow('⚠️ MongoDB ping failed:'), error.message);
    }
  }

  // Get database instance (main method plugins should use)
  async getDatabase() {
    if (!this.isConnected || !this.db) {
      return await this.connect();
    }
    return this.db;
  }

  // Get collection with auto-connection
  async getCollection(collectionName) {
    const db = await this.getDatabase();
    return db.collection(collectionName);
  }

  // Helper method for safe operations
  async safeOperation(operation, collectionName = null) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const db = await this.getDatabase();
        const collection = collectionName ? db.collection(collectionName) : null;
        
        return await operation(db, collection);
        
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          console.error(chalk.red(`❌ MongoDB operation failed after ${maxRetries} attempts:`), error.message);
          throw error;
        }
        
        console.warn(chalk.yellow(`⚠️ MongoDB operation attempt ${attempt} failed, retrying...`), error.message);
        
        // Reset connection if it seems broken
        if (error.message.includes('connection') || error.message.includes('timeout')) {
          this.isConnected = false;
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }
    
    throw lastError;
  }

  // Connection health check
  async healthCheck() {
    try {
      if (!this.isConnected || !this.client) {
        return {
          healthy: false,
          error: 'Not connected',
          stats: this.connectionStats
        };
      }

      // Test connection
      const start = Date.now();
      await this.db.admin().ping();
      const pingTime = Date.now() - start;

      // Get server status
      const serverStatus = await this.db.admin().serverStatus();
      const connectionInfo = serverStatus.connections || {};

      return {
        healthy: true,
        pingTime,
        connections: {
          current: connectionInfo.current || 0,
          available: connectionInfo.available || 0,
          totalCreated: connectionInfo.totalCreated || 0,
          active: this.connectionStats.activeConnections
        },
        stats: this.connectionStats,
        uptime: Math.round((Date.now() - this.connectionStats.uptime) / 1000),
        poolSize: {
          max: 8,
          min: 2,
          current: this.connectionStats.activeConnections
        }
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        stats: this.connectionStats
      };
    }
  }

  // Start connection monitoring
  startMonitoring() {
    // Log connection stats every 10 minutes
    setInterval(async () => {
      try {
        const health = await this.healthCheck();
        
        if (health.healthy) {
          console.log(chalk.cyan(
            `📊 MongoDB Stats: ${health.connections.current}/${health.connections.available} connections, ` +
            `${health.pingTime}ms ping, ${health.uptime}s uptime`
          ));
          
          // Warn if approaching connection limit
          const usage = health.connections.current / health.connections.available;
          if (usage > 0.8) {
            console.log(chalk.yellow(`⚠️ High connection usage: ${Math.round(usage * 100)}%`));
          }
        } else {
          console.log(chalk.red('❌ MongoDB health check failed:', health.error));
        }
      } catch (error) {
        console.warn('Health check error:', error.message);
      }
    }, 10 * 60 * 1000); // Every 10 minutes

    // Connection cleanup every 30 minutes
    setInterval(() => {
      this._performMaintenance();
    }, 30 * 60 * 1000);
  }

  async _performMaintenance() {
    try {
      if (this.client && this.isConnected) {
        console.log(chalk.blue('🔧 Performing MongoDB maintenance...'));
        
        // Force cleanup of idle connections
        // Note: This is automatically handled by maxIdleTimeMS, but we can log it
        const health = await this.healthCheck();
        console.log(chalk.cyan(`🔧 Maintenance complete. Active connections: ${health.connections.active}`));
      }
    } catch (error) {
      console.warn('Maintenance error:', error.message);
    }
  }

  // Graceful shutdown
  async close() {
    try {
      if (this.client) {
        console.log(chalk.yellow('🔒 Closing MongoDB connections...'));
        await this.client.close();
        this.isConnected = false;
        this.client = null;
        this.db = null;
        console.log(chalk.green('✅ MongoDB connections closed gracefully'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Error closing MongoDB connections:'), error.message);
    }
  }

  // Get connection statistics
  getStats() {
    return {
      ...this.connectionStats,
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      uptimeSeconds: Math.round((Date.now() - this.connectionStats.uptime) / 1000)
    };
  }
}

// Create singleton instance
const mongoManager = new MongoConnectionManager();

// Export singleton and helper functions
export default mongoManager;

// Export helper functions for easy use in plugins
export const getDatabase = () => mongoManager.getDatabase();
export const getCollection = (name) => mongoManager.getCollection(name);
export const safeOperation = (operation, collectionName) => mongoManager.safeOperation(operation, collectionName);
export const mongoHealthCheck = () => mongoManager.healthCheck();

// Export the class for advanced usage
export { MongoConnectionManager };

// Auto-connect on import in production
if (process.env.NODE_ENV === 'production') {
  mongoManager.connect().catch(error => {
    console.error('Auto-connect failed:', error.message);
  });
}
