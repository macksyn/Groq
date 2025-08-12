// lib/pluginIntegration.js - Helper for plugin cross-communication
import { MongoClient } from 'mongodb';

// Shared MongoDB connection for all plugins
let sharedDb = null;
let sharedClient = null;

// Initialize shared database connection
export async function initSharedDatabase() {
  if (sharedDb) return sharedDb;
  
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
    
    sharedClient = new MongoClient(MONGODB_URI);
    await sharedClient.connect();
    sharedDb = sharedClient.db(DATABASE_NAME);
    
    console.log('✅ Shared MongoDB connection established');
    return sharedDb;
  } catch (error) {
    console.error('❌ Shared MongoDB connection failed:', error);
    throw error;
  }
}

// Get shared database instance
export function getSharedDatabase() {
  return sharedDb;
}

// Unified user management across plugins
export class UnifiedUserManager {
  constructor() {
    this.db = null;
    this.collection = 'economy_users';
  }
  
  async init() {
    if (!this.db) {
      this.db = await initSharedDatabase();
      // Create index for better performance
      await this.db.collection(this.collection).createIndex({ userId: 1 }, { unique: true });
    }
    return this.db;
  }
  
  // Initialize user with all plugin fields
  async initUser(userId) {
    await this.init();
    
    try {
      const existingUser = await this.db.collection(this.collection).findOne({ userId });
      
      if (!existingUser) {
        const newUser = {
          userId,
          // Economy fields
          balance: 0,
          bank: 0,
          inventory: [],
          clan: null,
          bounty: 0,
          rank: 'Newbie',
          
          // Attendance fields
          lastAttendance: null,
          totalAttendances: 0,
          streak: 0,
          longestStreak: 0,
          
          // Birthday fields
          birthdayData: null,
          
          // Cooldowns
          lastDaily: null,
          lastWork: null,
          lastRob: null,
          
          // Timestamps
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await this.db.collection(this.collection).insertOne(newUser);
        return newUser;
      } else {
        // Ensure all fields exist for backward compatibility
        const updates = {};
        let needsUpdate = false;
        
        const requiredFields = {
          balance: 0,
          bank: 0,
          inventory: [],
          clan: null,
          bounty: 0,
          rank: 'Newbie',
          totalAttendances: 0,
          streak: 0,
          longestStreak: 0,
          birthdayData: null,
          lastDaily: null,
          lastWork: null,
          lastRob: null
        };
        
        for (const [field, defaultValue] of Object.entries(requiredFields)) {
          if (existingUser[field] === undefined) {
            updates[field] = defaultValue;
            needsUpdate = true;
          }
        }
        
        if (!existingUser.updatedAt) {
          updates.updatedAt = new Date();
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          await this.db.collection(this.collection).updateOne(
            { userId },
            { $set: updates }
          );
        }
        
        return existingUser;
      }
    } catch (error) {
      console.error('Error initializing unified user:', error);
      throw error;
    }
  }
  
  // Get user data
  async getUserData(userId) {
    await this.init();
    await this.initUser(userId);
    return await this.db.collection(this.collection).findOne({ userId });
  }
  
  // Update user data
  async updateUserData(userId, data) {
    await this.init();
    const result = await this.db.collection(this.collection).updateOne(
      { userId },
      { 
        $set: { 
          ...data, 
          updatedAt: new Date() 
        } 
      },
      { upsert: true }
    );
    return result;
  }
  
  // Add money with transaction logging
  async addMoney(userId, amount, reason = 'Unknown') {
    await this.init();
    const user = await this.getUserData(userId);
    const newBalance = (user.balance || 0) + amount;
    
    await this.updateUserData(userId, { balance: newBalance });
    
    // Log transaction
    await this.db.collection('economy_transactions').insertOne({
      userId,
      type: 'credit',
      amount,
      reason,
      balanceBefore: user.balance || 0,
      balanceAfter: newBalance,
      timestamp: new Date()
    });
    
    console.log(`💰 Added ₦${amount} to ${userId.split('@')[0]} (${reason})`);
    return newBalance;
  }
  
  // Remove money with transaction logging
  async removeMoney(userId, amount, reason = 'Unknown') {
    await this.init();
    const user = await this.getUserData(userId);
    
    if ((user.balance || 0) >= amount) {
      const newBalance = (user.balance || 0) - amount;
      
      await this.updateUserData(userId, { balance: newBalance });
      
      // Log transaction
      await this.db.collection('economy_transactions').insertOne({
        userId,
        type: 'debit',
        amount,
        reason,
        balanceBefore: user.balance || 0,
        balanceAfter: newBalance,
        timestamp: new Date()
      });
      
      console.log(`💸 Removed ₦${amount} from ${userId.split('@')[0]} (${reason})`);
      return true;
    }
    return false;
  }
}

// Create singleton instance
export const unifiedUserManager = new UnifiedUserManager();

// Plugin communication system
export class PluginCommunicator {
  constructor() {
    this.pluginData = new Map();
    this.eventListeners = new Map();
  }
  
  // Register plugin data
  registerPlugin(pluginName, data) {
    this.pluginData.set(pluginName, data);
  }
  
  // Get data from another plugin
  getPluginData(pluginName) {
    return this.pluginData.get(pluginName);
  }
  
  // Emit event to other plugins
  emit(eventName, data) {
    const listeners = this.eventListeners.get(eventName) || [];
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error);
      }
    });
  }
  
  // Listen for events from other plugins
  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName).push(callback);
  }
}

// Create singleton instance
export const pluginCommunicator = new PluginCommunicator();

// Helper functions for plugin integration
export async function getEconomyBalance(userId) {
  const user = await unifiedUserManager.getUserData(userId);
  return {
    wallet: user.balance || 0,
    bank: user.bank || 0,
    total: (user.balance || 0) + (user.bank || 0)
  };
}

export async function getAttendanceStats(userId) {
  const user = await unifiedUserManager.getUserData(userId);
  return {
    lastAttendance: user.lastAttendance,
    totalAttendances: user.totalAttendances || 0,
    streak: user.streak || 0,
    longestStreak: user.longestStreak || 0
  };
}

// Database backup and recovery
export class DatabaseManager {
  constructor() {
    this.db = null;
  }
  
  async init() {
    if (!this.db) {
      this.db = await initSharedDatabase();
    }
    return this.db;
  }
  
  // Backup all collections
  async backup() {
    await this.init();
    
    try {
      const collections = await this.db.listCollections().toArray();
      const backup = {
        timestamp: new Date(),
        collections: {}
      };
      
      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        const data = await this.db.collection(collectionName).find({}).toArray();
        backup.collections[collectionName] = data;
      }
      
      // Save backup to file or cloud storage
      const backupPath = `./backups/backup_${Date.now()}.json`;
      require('fs').writeFileSync(backupPath, JSON.stringify(backup, null, 2));
      
      console.log(`✅ Database backup created: ${backupPath}`);
      return backup;
    } catch (error) {
      console.error('❌ Database backup failed:', error);
      throw error;
    }
  }
  
  // Health check for database
  async healthCheck() {
    await this.init();
    
    try {
      const ping = await this.db.admin().ping();
      const stats = await this.db.stats();
      
      return {
        healthy: true,
        ping: ping,
        stats: {
          collections: stats.collections,
          dataSize: stats.dataSize,
          storageSize: stats.storageSize,
          indexes: stats.indexes
        }
      };
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

export const databaseManager = new DatabaseManager();
