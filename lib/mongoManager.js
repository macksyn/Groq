// lib/mongoManager.js - Non-blocking centralized connection manager
import { MongoClient } from 'mongodb';
import logger from '../src/utils/logger.js';

class MongoConnectionManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.connectionPromise = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3; // Reduced from 5
    this.reconnectDelay = 5000;
    
    this.connectionStats = {
      totalConnections: 0,
      failedConnections: 0,
      activeConnections: 0,
      lastConnectionTime: null,
      slowOperations: 0
    };
    
    // Start monitoring AFTER connection
    this.monitoringStarted = false;
  }

  async connect() {
    if (this.isConnected && this.db) return this.db;
    if (this.isConnecting && this.connectionPromise) return await this.connectionPromise;

    this.isConnecting = true;
    this.connectionPromise = this._performConnection();
    
    try {
      return await this.connectionPromise;
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

      logger.info('🔌 Connecting to MongoDB...');

      // OPTIMIZED OPTIONS FOR M0 FREE TIER
      const options = {
        maxPoolSize: 3,           // Small pool for free tier
        minPoolSize: 1,
        maxIdleTimeMS: 60000,     // Close idle connections after 1 min
        serverSelectionTimeoutMS: 5000,  // Fail fast
        socketTimeoutMS: 20000,   // 20 sec timeout
        connectTimeoutMs: 10000,  // 10 sec connect timeout
        heartbeatFrequencyMS: 30000, // Less frequent heartbeats
        retryWrites: true,
        retryReads: false,        // Don't retry reads on failure
        compressors: ['zlib'],
        zlibCompressionLevel: 6
      };

      this.client = new MongoClient(MONGODB_URI, options);
      
      // Connect with timeout
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout after 10s')), 10000)
        )
      ]);
      
      this.db = this.client.db(DATABASE_NAME);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.connectionStats.totalConnections++;
      this.connectionStats.lastConnectionTime = new Date();
      
      logger.info(`✅ MongoDB connected: ${DATABASE_NAME}`);
      
      this._setupEventListeners();
      await this._testConnection();
      
      // Start monitoring ONLY after successful connection
      if (!this.monitoringStarted) {
        this.startMonitoring();
        this.monitoringStarted = true;
      }
      
      return this.db;
      
    } catch (error) {
      this.isConnected = false;
      this.connectionStats.failedConnections++;
      
      logger.error(error, '❌ MongoDB connection failed');
      
      // Auto-reconnect with backoff
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        logger.warn(`🔄 Reconnecting in ${delay/1000}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
          this.connect().catch(err => {
            logger.warn('⚠️ Background reconnection failed');
          });
        }, delay);
      } else {
        logger.error('💀 Max reconnection attempts reached. MongoDB unavailable.');
      }
      
      // DON'T throw - let bot continue without DB
      return null;
    }
  }

  _setupEventListeners() {
    if (!this.client) return;

    this.client.on('connectionPoolCreated', (event) => 
      logger.debug(`🏊 Pool created: ${event.address}`)
    );
    
    this.client.on('connectionPoolReady', (event) => 
      logger.info(`✅ Pool ready: ${event.address}`)
    );
    
    this.client.on('connectionPoolCleared', (event) => 
      logger.warn(`🧹 Pool cleared: ${event.address}`)
    );
    
    this.client.on('connectionCreated', () => {
      this.connectionStats.activeConnections++;
    });

    this.client.on('connectionClosed', () => {
      this.connectionStats.activeConnections--;
    });

    this.client.on('error', (error) => {
      logger.error(error, '🚨 MongoDB client error');
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('📪 MongoDB connection closed');
      this.isConnected = false;
    });
  }

  async _testConnection() {
    try {
      await Promise.race([
        this.db.admin().ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Ping timeout')), 3000)
        )
      ]);
      logger.info('🏓 MongoDB ping successful');
    } catch (error) {
      logger.warn('⚠️ MongoDB ping failed, but connection established');
    }
  }

  async getDatabase() {
    if (!this.isConnected || !this.db) {
      logger.debug('DB requested but not connected, attempting connection...');
      return await this.connect();
    }
    return this.db;
  }

  async getCollection(collectionName) {
    const db = await this.getDatabase();
    if (!db) return null; // Return null if DB unavailable
    return db.collection(collectionName);
  }

  // CRITICAL FIX: Non-blocking safe operation with timeout
  async safeOperation(operation, collectionName = null, timeoutMs = 3000) {
    // If not connected, try once but don't block
    if (!this.isConnected) {
      try {
        await Promise.race([
          this.connect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 2000)
          )
        ]);
      } catch (error) {
        logger.debug('MongoDB unavailable, returning null');
        return null; // Return null instead of throwing
      }
    }

    const startTime = Date.now();
    
    try {
      const db = this.db;
      if (!db) return null;
      
      const collection = collectionName ? db.collection(collectionName) : null;
      
      // Execute with timeout
      const result = await Promise.race([
        operation(db, collection),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
        )
      ]);
      
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        this.connectionStats.slowOperations++;
        logger.warn(`⚠️ Slow MongoDB operation: ${duration}ms`);
      }
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error.message.includes('timeout')) {
        logger.warn(`⏱️ MongoDB operation timeout (${duration}ms)`);
        this.connectionStats.slowOperations++;
        // Mark as disconnected to force reconnect
        this.isConnected = false;
      } else {
        logger.warn(error, '⚠️ MongoDB operation failed');
      }
      
      // Return null instead of throwing - let caller handle
      return null;
    }
  }

  async healthCheck() {
    try {
      if (!this.isConnected || !this.client) {
        return { 
          healthy: false, 
          error: 'Not connected', 
          stats: this.connectionStats 
        };
      }

      const start = Date.now();
      
      // Quick ping with timeout
      await Promise.race([
        this.db.admin().ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Ping timeout')), 2000)
        )
      ]);
      
      const pingTime = Date.now() - start;

      // If ping is too slow, mark as unhealthy
      if (pingTime > 2000) {
        logger.error(`🐌 MongoDB ping too slow: ${pingTime}ms`);
        return {
          healthy: false,
          error: 'High latency',
          pingTime,
          stats: this.connectionStats
        };
      }

      const serverStatus = await this.db.admin().serverStatus();
      const connectionInfo = serverStatus.connections || {};
      const uptime = serverStatus.uptime || 0;
      
      return {
        healthy: true,
        pingTime,
        uptime,
        connections: {
          current: connectionInfo.current || 0,
          available: connectionInfo.available || 0
        },
        stats: this.connectionStats
      };
      
    } catch (error) {
      logger.warn(error, '⚠️ Health check failed');
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        healthy: false, 
        error: errorMessage, 
        stats: this.connectionStats 
      };
    }
  }

  startMonitoring() {
    logger.info('🏥 Starting MongoDB monitoring (30min intervals)...');
    
    // Reduced frequency - every 30 minutes instead of 10
    setInterval(async () => {
      try {
        const health = await this.healthCheck();
        if (health.healthy) {
          logger.info(
            `📊 MongoDB: ${health.connections?.current || 0}/${health.connections?.available || 0} conn, ` +
            `${health.pingTime}ms ping, ${this.connectionStats.slowOperations} slow ops`
          );
          
          const usage = (health.connections?.available || 0) > 0 
            ? health.connections.current / health.connections.available 
            : 0;
          
          if (usage > 0.7) {
            logger.warn(`⚠️ High connection usage: ${Math.round(usage * 100)}%`);
          }
          
          // Reset slow operation counter
          this.connectionStats.slowOperations = 0;
        }
      } catch (error) {
        logger.debug('Monitoring check skipped');
      }
    }, 30 * 60 * 1000); // 30 minutes
  }

  async close() {
    try {
      if (this.client) {
        logger.info('🔒 Closing MongoDB connections...');
        await this.client.close();
        this.isConnected = false;
        this.client = null;
        this.db = null;
        logger.info('✅ MongoDB closed gracefully');
      }
    } catch (error) {
      logger.error(error, '❌ Error closing MongoDB');
    }
  }

  getStats() {
    return {
      ...this.connectionStats,
      isConnected: this.isConnected,
      isConnecting: this.isConnecting
    };
  }
}

// Create singleton instance
const mongoManager = new MongoConnectionManager();

// Export singleton and helper functions
export default mongoManager;
export const getDatabase = () => mongoManager.getDatabase();
export const getCollection = (name) => mongoManager.getCollection(name);
export const safeOperation = (operation, collectionName, timeout) => 
  mongoManager.safeOperation(operation, collectionName, timeout);
export const mongoHealthCheck = () => mongoManager.healthCheck();
export { MongoConnectionManager };

// REMOVED AUTO-CONNECT - Let bot handle it explicitly
// The auto-connect on import was causing silent failures
logger.info('📦 MongoDB manager loaded (connection deferred to bot startup)');
