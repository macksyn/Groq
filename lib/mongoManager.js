// lib/mongoManager.js - Centralized MongoDB Connection Manager (Using Logger)
import { MongoClient } from 'mongodb';
import logger from '../src/utils/logger.js'; // Import the centralized logger

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
    
    this.connectionStats = { /* ... stats object ... */ };
    
    // Start monitoring - Wrap in try/catch for early errors
    try {
      this.startMonitoring();
    } catch (monitorError) {
        // Use console.error here as logger might not be fully ready if error is super early
        console.error('Initial monitoring setup failed:', monitorError);
    }
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

      const options = { /* ... your M0 optimized options ... */ };

      this.client = new MongoClient(MONGODB_URI, options);
      
      // Connect with timeout (using standard Promise.race)
      await Promise.race([
          this.client.connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout after 20s')), 20000))
      ]);
      
      this.db = this.client.db(DATABASE_NAME);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.connectionStats.totalConnections++;
      this.connectionStats.lastConnectionTime = new Date();
      
      logger.info(`✅ MongoDB connected successfully to: ${DATABASE_NAME}`);
      logger.info(`🏊 Pool settings: maxPoolSize=${options.maxPoolSize}, minPoolSize=${options.minPoolSize}`);
      
      this._setupEventListeners();
      await this._testConnection();
      
      return this.db;
      
    } catch (error) {
      this.isConnected = false;
      this.connectionStats.failedConnections++;
      
      // Use logger.error(error, message) format
      logger.error(error, '❌ MongoDB connection failed');
      
      // Auto-reconnect logic
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        logger.warn(`🔄 Reconnecting in ${this.reconnectDelay/1000}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
          this.connect().catch(err => {
            // Log the reconnection failure specifically
            logger.error(err, '❌ MongoDB reconnection attempt failed');
          });
        }, this.reconnectDelay);
        
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
      } else {
         logger.error('💀 Max MongoDB reconnection attempts reached.');
      }
      
      throw error; // Re-throw the error after logging and attempting reconnect
    }
  }

  _setupEventListeners() {
    if (!this.client) return;

    this.client.on('connectionPoolCreated', (event) => logger.info(`🏊 Connection pool created for: ${event.address}`));
    this.client.on('connectionPoolReady', (event) => logger.info(`✅ Connection pool ready: ${event.address}`));
    this.client.on('connectionPoolCleared', (event) => logger.warn(`🧹 Connection pool cleared: ${event.address}`));
    
    this.client.on('connectionCreated', (event) => {
      this.connectionStats.activeConnections++;
      // Use debug level for frequent events
      logger.debug(`➕ Connection created: ${event.connectionId} (Total: ${this.connectionStats.activeConnections})`);
    });

    this.client.on('connectionClosed', (event) => {
      this.connectionStats.activeConnections--;
      logger.debug(`➖ Connection closed: ${event.connectionId} (Total: ${this.connectionStats.activeConnections})`);
    });

    this.client.on('error', (error) => {
      logger.error(error, '🚨 MongoDB client error');
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('📪 MongoDB connection closed');
      this.isConnected = false;
      // Consider triggering reconnect logic here too if needed
    });
  }

  async _testConnection() {
    try {
      await this.db.admin().ping();
      logger.info('🏓 MongoDB ping successful');
    } catch (error) {
      logger.warn(error, '⚠️ MongoDB ping failed during connection test');
    }
  }

  async getDatabase() {
    if (!this.isConnected || !this.db) {
      // Log attempt to get DB when not connected
      logger.debug('Database requested but not connected, attempting connection...');
      return await this.connect();
    }
    return this.db;
  }

  async getCollection(collectionName) {
    const db = await this.getDatabase();
    return db.collection(collectionName);
  }

  async safeOperation(operation, collectionName = null) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const db = await this.getDatabase(); // Ensures connection
        const collection = collectionName ? db.collection(collectionName) : null;
        return await operation(db, collection);
      } catch (error) {
        lastError = error;
        logger.warn(error, `⚠️ MongoDB operation attempt ${attempt} failed, retrying...`);
        
        if (attempt === maxRetries) {
          logger.error(error, `❌ MongoDB operation failed after ${maxRetries} attempts`);
          throw error; // Give up after max retries
        }
        
        // Simple delay before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        
        // Force reconnect check if error seems connection related
        if (error.message.includes('topology') || error.message.includes('timed out')) {
            logger.warn('Attempting MongoDB reconnect due to operation error...');
            this.isConnected = false; // Mark as disconnected
            await this.connect().catch(e => logger.error(e, 'Forced reconnect failed')); // Try to reconnect
        }
      }
    }
    // Should not be reachable if maxRetries > 0, but throw just in case
    throw lastError;
  }

  async healthCheck() {
    try {
      // Use logger.debug for health check start/end
      logger.debug('Performing MongoDB health check...');
      if (!this.isConnected || !this.client) {
        return { healthy: false, error: 'Not connected', stats: this.connectionStats };
      }

      const start = Date.now();
      await this.db.admin().ping();
      const pingTime = Date.now() - start;

      const serverStatus = await this.db.admin().serverStatus();
      // Corrected code
      const connectionInfo = serverStatus.connections || {};
      const uptime = serverStatus.uptime || 0;
      
      logger.debug('MongoDB health check successful.');
      
      // This was commented out and is now complete
      return {
        healthy: true,
        pingTime: pingTime,
        uptime: uptime,
        connections: {
          current: connectionInfo.current || 0,
          available: connectionInfo.available || 0
        },
        stats: this.connectionStats
      };
      
    } catch (error) {
      logger.error(error, '❌ MongoDB health check failed');
      // Ensure we always pass a string, even if error is not a standard Error object
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      return { healthy: false, error: errorMessage, stats: this.connectionStats };
    }
  }

  startMonitoring() {
    logger.info('🏥 Starting MongoDB monitoring intervals...');
    // Log connection stats periodically
    setInterval(async () => {
      try {
        const health = await this.healthCheck();
        if (health.healthy) {
          logger.info(
            `📊 MongoDB Stats: ${health.connections?.current || 0}/${health.connections?.available || 0} connections, ` +
            `${health.pingTime}ms ping, ${health.uptime}s uptime`
          );
          const usage = (health.connections?.available || 0) > 0 ? health.connections.current / health.connections.available : 0;
          if (usage > 0.8) {
            logger.warn(`⚠️ High MongoDB connection usage: ${Math.round(usage * 100)}%`);
          }
        } // Error is logged within healthCheck itself
      } catch (error) {
        // Catch errors from the interval function itself
        logger.warn(error, '⚠️ Error during periodic MongoDB health check');
      }
    }, 10 * 60 * 1000); // Every 10 minutes

    // No need for explicit maintenance interval with modern drivers + maxIdleTimeMS
    // setInterval(() => { this._performMaintenance(); }, 30 * 60 * 1000);
  }

  // _performMaintenance can likely be removed if using maxIdleTimeMS
  // async _performMaintenance() { ... }

  async close() {
    try {
      if (this.client) {
        logger.info('🔒 Closing MongoDB connections...');
        await this.client.close();
        this.isConnected = false;
        this.client = null;
        this.db = null;
        logger.info('✅ MongoDB connections closed gracefully');
      }
    } catch (error) {
      logger.error(error, '❌ Error closing MongoDB connections');
    }
  }

  getStats() {
    return { /* ... stats ... */ };
  }
}

// Create singleton instance
const mongoManager = new MongoConnectionManager();

// Export singleton and helper functions
export default mongoManager;
export const getDatabase = () => mongoManager.getDatabase();
export const getCollection = (name) => mongoManager.getCollection(name);
export const safeOperation = (operation, collectionName) => mongoManager.safeOperation(operation, collectionName);
export const mongoHealthCheck = () => mongoManager.healthCheck();
export { MongoConnectionManager }; // Export class if needed

// --- POTENTIAL ISSUE AREA ---
// Auto-connect on import in production
// This runs IMMEDIATELY when the module is imported. If logger isn't ready,
// or if connect throws an error before the main app's try/catch, it could fail silently.
if (process.env.NODE_ENV === 'production' && process.env.MONGODB_URI) {
  logger.info('🏭 Production mode: Attempting MongoDB auto-connect on import...');
  // No delay, connect immediately. We need to see if this causes the silent failure.
  mongoManager.connect().catch(error => {
      // Use console.error as a fallback if logger itself fails early
      console.error('MongoDB auto-connect failed:', error.message);
      logger.error(error, '⚠️ Initial MongoDB auto-connect failed');
  });
} else {
    logger.info('MongoDB auto-connect skipped (not production or no URI)');
}