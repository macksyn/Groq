/**
 * @fileoverview Manages the MongoDB connection and provides a database client.
 * Includes connection logic, health checks, and graceful shutdown.
 */

import { MongoClient } from 'mongodb'; // <-- This line is now fixed
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { DisconnectReason } from '@whiskeysockets/baileys';

/**
 * Manages the MongoDB connection pool and database access.
 */
class MongoManager {
  /**
   * Initializes the MongoDB client with connection options.
   */
  constructor() {
    if (!config.MONGODB_URI) {
      logger.warn('MONGODB_URI is not set. Database features will be disabled.');
      this.client = null;
      this.db = null;
      return;
    }

    const options = {
      // --- ADDED CHANGES ---
      /**
       * How long (in ms) a socket operation (read or write) can take before timing out.
       * This prevents hanging queries from stalling the application.
       */
      socketTimeoutMS: 5000, 
      /**
       * How long (in ms) the driver will try to find a suitable server to execute an operation.
       */
      serverSelectionTimeoutMS: 5000, 
      // --- END OF CHANGES ---
    };

    this.client = new MongoClient(config.MONGODB_URI, options);
    this.db = null;
    this.connectionListeners = [];

    this._setupConnectionMonitoring();
  }

  /**
   * Sets up event listeners for the MongoDB connection pool.
   */
  _setupConnectionMonitoring() {
    if (!this.client) return;

    this.client.on('connectionPoolCreated', (event) => {
      logger.debug(`[MongoDB] Connection pool created for: ${event.address}`);
    });
    this.client.on('connectionPoolReady', (event) => {
      logger.info(`✅ Connection pool ready: ${event.address}`);
    });
    this.client.on('connectionPoolCleared', (event) => {
      logger.warn(`🧹 Connection pool cleared: ${event.address}`);
    });
    this.client.on('connectionPoolClosed', (event) => {
      logger.info(`[MongoDB] Connection pool closed: ${event.address}`);
    });
    this.client.on('connectionCreated', (event) => {
      logger.debug(`[MongoDB] Connection created: ${event.address}`);
    });
    this.client.on('connectionReady', (event) => {
      logger.debug(`[MongoDB] Connection ready: ${event.address}`);
    });
    this.client.on('connectionClosed', (event) => {
      logger.warn(`[MongoDB] Connection closed: ${event.address}. Reason: ${event.reason}`);
    });
  }

  /**
   * Connects to the MongoDB database.
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.client) {
      logger.warn('MongoDB client not initialized. Skipping connection.');
      return;
    }
    try {
      await this.client.connect();
      this.db = this.client.db();
      logger.info('🗄️ Successfully connected to MongoDB.');
    } catch (error) {
      logger.error('❌ Failed to connect to MongoDB.', { error: error.message, stack: error.stack });
      // In a production environment, you might want to retry or handle this gracefully.
      // For now, we exit to prevent the bot from running in a broken state.
      process.exit(1);
    }
  }

  /**
   * Closes the MongoDB connection.
   * @returns {Promise<void>}
   */
  async close() {
    if (this.client) {
      try {
        await this.client.close();
        logger.info('MongoDB connection closed.');
      } catch (error) {
        logger.error('Error closing MongoDB connection:', error);
      }
    }
  }

  /**
   * Gets the database instance.
   * @returns {Db|null} The MongoDB database object, or null if not connected.
   */
  getDb() {
    if (!this.client) {
      logger.warn('Attempted to get DB, but client is not initialized.');
      return null;
    }
    if (!this.db) {
      logger.warn('Attempted to get DB, but connection is not established.');
      // In a real-world scenario, you might queue the request or wait for connection.
    }
    return this.db;
  }

  /**
   * Checks the health of the MongoDB connection.
   * @returns {Promise<{ status: string, message: string, ping: number }>}
   */
  async healthCheck() {
    if (!this.client || !this.db) {
      return { status: 'disconnected', message: 'MongoDB client not initialized or connected.', ping: -1 };
    }

    try {
      const startTime = process.hrtime.bigint();
      await this.db.command({ ping: 1 });
      const endTime = process.hrtime.bigint();
      const pingTime = Number(endTime - startTime) / 1_000_000; // Convert nanoseconds to milliseconds
      return { status: 'connected', message: 'MongoDB connection is healthy.', ping: pingTime };
    } catch (error) {
      logger.error('MongoDB health check failed:', error);
      return { status: 'error', message: error.message, ping: -1 };
    }
  }

  /**
   * Gets connection stats from the MongoDB driver.
   * @returns {Promise<{ connectionCount: number, maxPoolSize: number, minPoolSize: number, uptime: number, ping: number }>}
   */
  async getStats() {
    if (!this.client || !this.db) {
      return {
        connectionCount: 0,
        maxPoolSize: 0,
        minPoolSize: 0,
        uptime: 0,
        ping: -1,
      };
    }
    
    try {
      const stats = this.client.s.options;
      const adminDb = this.db.admin();
      
      // Get server status for uptime
      const serverStatus = await adminDb.serverStatus();
      const uptime = serverStatus.uptime || 0;
      
      // Get ping
      const { ping } = await this.healthCheck();

      return {
        connectionCount: this.client.s.activeConnectionCount || 0,
        maxPoolSize: stats.maxPoolSize || 100, // Default in driver
        minPoolSize: stats.minPoolSize || 0,
        uptime,
        ping,
      };
    } catch (error) {
      logger.error('Failed to get MongoDB stats:', error);
      return {
        connectionCount: -1,
        maxPoolSize: -1,
        minPoolSize: -1,
        uptime: -1,
        ping: -1,
      };
    }
  }
}

// Create a singleton instance
const mongoManager = new MongoManager();
export default mongoManager;
