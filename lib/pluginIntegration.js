// lib/pluginIntegration.js - Updated with centralized MongoDB connection
import mongoManager, { getDatabase, getCollection, safeOperation } from './mongoManager.js';
import chalk from 'chalk';
import logger from '../src/utils/logger.js'; // Added logger import, as it was used but not imported.

// DEPRECATED: Remove duplicate connection logic - use mongoManager instead
// let sharedDb = null;
// let sharedClient = null;

// Initialize shared database connection - NOW USES SINGLETON
export async function initSharedDatabase() {
  try {
  	console.log(chalk.blue('🔄 Initializing shared database connection...'));
  	const db = await mongoManager.getDatabase();
    if (!db) {
      console.error(chalk.red('❌ Shared database initialization failed: mongoManager returned null.'));
      throw new Error('Failed to get database instance from mongoManager');
    }
  	console.log(chalk.green('✅ Shared database connection established via mongoManager'));
  	return db;
  } catch (error) {
  	console.error(chalk.red('❌ Shared database initialization failed:'), error.message);
  	throw error;
  }
}

// Get shared database instance - NOW USES SINGLETON
export function getSharedDatabase() {
  return mongoManager.getDatabase();
}

// Unified user management with connection pooling optimization
export class UnifiedUserManager {
  constructor() {
  	this.collection = 'economy_users';
  	this.transactionCollection = 'economy_transactions';
  	
  	// Cache for frequently accessed users (reduce DB calls)
  	this.userCache = new Map();
  	this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  	
  	// Start cache cleanup
  	this.startCacheCleanup();
  }
  
  // Cache cleanup to prevent memory leaks
  startCacheCleanup() {
  	setInterval(() => {
  	  const now = Date.now();
  	  for (const [userId, data] of this.userCache.entries()) {
  	  	if (now - data.timestamp > this.cacheTimeout) {
  	  	  this.userCache.delete(userId);
  	  	}
  	  }
  	}, 60000); // Cleanup every minute
  }

  // Initialize user with connection pooling optimization
 async initUser(userId) {
  // Check cache first
  if (this.userCache.has(userId)) {
  	const cached = this.userCache.get(userId);
  	if (Date.now() - cached.timestamp < this.cacheTimeout) {
  	  return cached.user;
  	}
  }

  try {
  	const result = await safeOperation(async (db, collection) => {
  	  if (!collection) return null; // DB unavailable
  	  
  	  const existingUser = await collection.findOne({ userId });
  	  	
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
  	  	  
  	  	  await collection.insertOne(newUser);
  	  	  
  	  	  // Cache the new user
  	  	  this.userCache.set(userId, {
  	  	  	user: newUser,
  	  	  	timestamp: Date.now()
  	  	  });
  	  	  
  	  	  return newUser;
  	  	} else {
  	  	  // Ensure backward compatibility
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
  	  	  	await collection.updateOne(
  	  	  	  { userId },
  	  	  	  { $set: updates }
  	  	  	);
  	  	  	
  	  	  	// Update the user object
  	  	  	Object.assign(existingUser, updates);
  	  	  }
  	  	  
  	  	  // Cache the user
  	  	  this.userCache.set(userId, {
  	  	  	user: existingUser,
  	  	  	timestamp: Date.now()
  	  	  });
  	  	  
  	  	  return existingUser;
  	  	}
  	  }, this.collection, 2000);

  	  if (!result) {
  	  // DB unavailable, return in-memory default
  	  logger.debug(`Using in-memory user for ${userId}`);
  	  return {
  	  	  	userId,
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
  	}
  	
  	return result;
  } catch (error) {
  	logger.warn(`User init failed for ${userId}, using defaults`);
  	return {
  	  	  	userId,
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
  }
}
  
  // ----- SYNTAX ERROR WAS HERE -----
  // The stray "} catch (error) { ... } }" block that
  // was between initUser and getUserData has been removed.
  // ---------------------------------

  // Get user data with caching
  async getUserData(userId) {
  	return await this.initUser(userId);
  }
  
  // Update user data with cache invalidation
  async updateUserData(userId, data) {
  	try {
  	  const result = await safeOperation(async (db, collection) => {
  	  	const updateResult = await collection.updateOne(
  	  	  { userId },
  	  	  { 
  	  	  	$set: { 
  	  	  	  ...data, 
  	  	  	  updatedAt: new Date() 
  	  	  	} 
  	  	  },
  	  	  { upsert: true }
  	  	);
  	  	
  	  	// Invalidate cache
  	  	this.userCache.delete(userId);
  	  	
  	  	return updateResult;
  	  }, this.collection);
  	  
  	  return result;
  	} catch (error) {
  	  console.error(chalk.red(`❌ Error updating user data for ${userId}:`), error.message);
  	  throw error;
  	}
  }
  
  // Optimized money operations with single database call
  async addMoney(userId, amount, reason = 'Unknown') {
  	try {
  	  return await safeOperation(async (db) => {
        if (!db) return null; // Check if db is available
  	  	const usersCollection = db.collection(this.collection);
  	  	const transactionsCollection = db.collection(this.transactionCollection);
  	  	
  	  	// Get current user data
  	  	const user = await this.getUserData(userId);
  	  	const newBalance = (user.balance || 0) + amount;
  	  	
  	  	// Update balance and log transaction in parallel
  	  	const [updateResult] = await Promise.all([
  	  	  usersCollection.updateOne(
  	  	  	{ userId },
  	  	  	{ $set: { balance: newBalance, updatedAt: new Date() } }
  	  	  ),
  	  	  transactionsCollection.insertOne({
  	  	  	userId,
  	  	  	type: 'credit',
  	  	  	amount,
  	  	  	reason,
  	  	  	balanceBefore: user.balance || 0,
  	  	  	balanceAfter: newBalance,
  	  	  	timestamp: new Date()
  	  	  })
  	  	]);
  	  	
  	  	// Invalidate cache
  	  	this.userCache.delete(userId);
  	  	
  	  	console.log(chalk.green(`💰 Added ₦${amount} to ${userId.split('@')[0]} (${reason})`));
  	  	return newBalance;
  	  });
  	  
  	} catch (error) {
  	  console.error(chalk.red(`❌ Error adding money to ${userId}:`), error.message);
  	  throw error;
  	}
  }
  
  // Optimized money removal with transaction
  async removeMoney(userId, amount, reason = 'Unknown') {
  	try {
  	  return await safeOperation(async (db) => {
        if (!db) return false; // Check if db is available
  	  	const usersCollection = db.collection(this.collection);
  	  	const transactionsCollection = db.collection(this.transactionCollection);
  	  	
  	  	const user = await this.getUserData(userId);
  	  	
  	  	if ((user.balance || 0) >= amount) {
  	  	  const newBalance = (user.balance || 0) - amount;
  	  	  
  	  	  // Update balance and log transaction
  	  	  await Promise.all([
  	  	  	usersCollection.updateOne(
  	  	  	  { userId },
  	  	  	  { $set: { balance: newBalance, updatedAt: new Date() } }
  	  	  	),
  	  	  	transactionsCollection.insertOne({
  	  	  	  userId,
  	  	  	  type: 'debit',
  	  	  	  amount,
  	  	  	  reason,
  	  	  	  balanceBefore: user.balance || 0,
  	  	  	  balanceAfter: newBalance,
  	  	  	  timestamp: new Date()
  	  	  	})
  	  	  ]);
  	  	  
  	  	  // Invalidate cache
  	  	  this.userCache.delete(userId);
  	  	  
  	  	  console.log(chalk.green(`💸 Removed ₦${amount} from ${userId.split('@')[0]} (${reason})`));
  	  	  return true;
  	  	}
  	  	return false;
  	  });
  	  
  	} catch (error) {
  	  console.error(chalk.red(`❌ Error removing money from ${userId}:`), error.message);
  	  throw error;
  	}
  }

  // Bulk operations for better performance
  async bulkUpdateUsers(updates) {
  	try {
  	  return await safeOperation(async (db, collection) => {
        if (!collection) return null; // Check if collection is available
  	  	const bulkOps = updates.map(update => ({
  	  	  updateOne: {
  	  	  	filter: { userId: update.userId },
  	  	  	update: { $set: { ...update.data, updatedAt: new Date() } },
  	  	  	upsert: true
  	  	  }
  	  	}));
  	  	
  	  	const result = await collection.bulkWrite(bulkOps);
  	  	
  	  	// Clear cache for updated users
  	  	updates.forEach(update => this.userCache.delete(update.userId));
  	  	
  	  	return result;
  	  }, this.collection);
  	} catch (error) {
  	  console.error(chalk.red('❌ Bulk update error:'), error.message);
  	  throw error;
  	}
  }

  // Get cache statistics
  getCacheStats() {
  	return {
  	  size: this.userCache.size,
  	  timeout: this.cacheTimeout,
  	  hitRate: this.cacheHitRate || 0
  	};
  }
}

// Create singleton instance
export const unifiedUserManager = new UnifiedUserManager();

// Enhanced plugin communication with connection awareness
export class PluginCommunicator {
  constructor() {
  	this.pluginData = new Map();
  	this.eventListeners = new Map();
  	this.connectionAware = true; // New flag for connection-aware operations
  }
  
  // Register plugin data
  registerPlugin(pluginName, data) {
  	this.pluginData.set(pluginName, {
  	  ...data,
  	  registeredAt: new Date(),
  	  connectionHealth: null
  	});
  }
  
  // Get data from another plugin
  getPluginData(pluginName) {
  	return this.pluginData.get(pluginName);
  }
  
  // Emit event with connection awareness
  async emit(eventName, data) {
  	const listeners = this.eventListeners.get(eventName) || [];
  	const promises = listeners.map(async (listener) => {
  	  try {
  	  	// Check connection health before executing
  	  	if (this.connectionAware) {
  	  	  const health = await mongoManager.healthCheck();
  	  	  if (!health.healthy) {
  	  	  	console.warn(chalk.yellow(`⚠️ Skipping event ${eventName}: MongoDB unhealthy`));
  	  	  	return;
  	  	  }
  	  	}
  	  	
  	  	return await listener(data);
  	  } catch (error) {
  	  	console.error(chalk.red(`❌ Error in event listener for ${eventName}:`), error.message);
  	  }
  	});
  	
  	await Promise.allSettled(promises);
  }
  
  // Listen for events
  on(eventName, callback) {
  	if (!this.eventListeners.has(eventName)) {
  	  this.eventListeners.set(eventName, []);
  	}
  	this.eventListeners.get(eventName).push(callback);
  }

  // Health check for plugin communication
  async healthCheck() {
  	const mongoHealth = await mongoManager.healthCheck();
  	
  	return {
  	  healthy: mongoHealth.healthy,
  	  pluginsRegistered: this.pluginData.size,
  	  eventListeners: this.eventListeners.size,
  	  mongoConnection: mongoHealth,
  	  lastCheck: new Date()
  	};
  }
}

// Create singleton instance
export const pluginCommunicator = new PluginCommunicator();

// Helper functions with connection pooling optimization
export async function getEconomyBalance(userId) {
  try {
  	const user = await unifiedUserManager.getUserData(userId);
  	if (!user) {
  	  // DB unavailable, return defaults
  	  return { wallet: 0, bank: 0, total: 0 };
  	}
  	return {
  	  wallet: user.balance || 0,
  	  bank: user.bank || 0,
  	  total: (user.balance || 0) + (user.bank || 0)
  	};
  } catch (error) {
  	logger.warn('Economy balance unavailable, using defaults');
  	return { wallet: 0, bank: 0, total: 0 };
  }
}

export async function getAttendanceStats(userId) {
  try {
  	const user = await unifiedUserManager.getUserData(userId);
    // User will always be an object (either from DB or default in-memory)
    // So this is safe.
  	return {
  	  lastAttendance: user.lastAttendance,
  	  totalAttendances: user.totalAttendances || 0,
  	  streak: user.streak || 0,
  	  longestStreak: user.longestStreak || 0
  	};
  } catch (error) {
  	console.error(chalk.red(`❌ Error getting attendance for ${userId}:`), error.message);
  	return { lastAttendance: null, totalAttendances: 0, streak: 0, longestStreak: 0 };
  }
}

// Enhanced Database Manager with connection pooling
export class DatabaseManager {
  constructor() {
  	this.backupDir = './backups';
  	this.maxBackups = 5; // Keep only 5 most recent backups
  }
  
  // Ensure backup directory exists
  async ensureBackupDir() {
  	const fs = await import('fs/promises');
  	const path = await import('path');
  	
  	try {
  	  await fs.mkdir(this.backupDir, { recursive: true });
  	} catch (error) {
  	  // Directory already exists
  	}
  }
  
  // Optimized backup with streaming
  async backup() {
  	try {
  	  await this.ensureBackupDir();
  	  
  	  return await safeOperation(async (db) => {
        if (!db) return null; // Check if db is available
  	  	console.log(chalk.blue('📦 Starting database backup...'));
  	  	
  	  	const collections = await db.listCollections().toArray();
  	  	const backup = {
  	  	  timestamp: new Date(),
  	  	  collections: {},
  	  	  stats: await mongoManager.getStats()
  	  	};
  	  	
  	  	// Backup each collection with progress logging
  	  	for (const collectionInfo of collections) {
  	  	  const collectionName = collectionInfo.name;
  	  	  console.log(chalk.cyan(`📄 Backing up collection: ${collectionName}`));
  	  	  
  	  	  const data = await db.collection(collectionName).find({}).toArray();
  	  	  backup.collections[collectionName] = data;
  	  	  
  	  	  console.log(chalk.green(`✅ Collection ${collectionName}: ${data.length} documents`));
  	  	}
  	  	
  	  	// Save backup with timestamp
  	  	const fs = await import('fs/promises');
  	  	const path = await import('path');
  	  	const backupPath = path.join(this.backupDir, `backup_${Date.now()}.json`);
  	  	
  	  	await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
  	  	
  	  	// Cleanup old backups
  	  	await this.cleanupOldBackups();
  	  	
  	  	console.log(chalk.green(`✅ Database backup completed: ${backupPath}`));
  	  	return { path: backupPath, collections: collections.length, backup };
  	  	
  	  });
  	  
  	} catch (error) {
  	  console.error(chalk.red('❌ Database backup failed:'), error.message);
  	  throw error;
  	}
  }
  
  // Cleanup old backups
  async cleanupOldBackups() {
  	try {
  	  const fs = await import('fs/promises');
  	  const path = await import('path');
  	  
  	  const files = await fs.readdir(this.backupDir);
  	  const backupFiles = files
  	  	.filter(file => file.startsWith('backup_') && file.endsWith('.json'))
  	  	.map(file => ({
  	  	  name: file,
  	  	  path: path.join(this.backupDir, file),
  	  	  timestamp: parseInt(file.split('_')[1].split('.')[0])
  	  	}))
  	  	.sort((a, b) => b.timestamp - a.timestamp);
  	  	
  	  // Remove old backups
  	  if (backupFiles.length > this.maxBackups) {
  	  	const toDelete = backupFiles.slice(this.maxBackups);
  	  	
  	  	for (const backup of toDelete) {
  	  	  await fs.unlink(backup.path);
  	  	  console.log(chalk.yellow(`🗑️ Removed old backup: ${backup.name}`));
  	  	}
  	  }
  	  
  	} catch (error) {
  	  console.warn(chalk.yellow('⚠️ Backup cleanup warning:'), error.message);
  	}
  }
  
  // Enhanced health check with connection monitoring
  async healthCheck() {
  	try {
  	  const mongoHealth = await mongoManager.healthCheck();
  	  
  	  if (!mongoHealth.healthy) {
  	  	return {
  	  	  healthy: false,
  	  	  error: mongoHealth.error,
  	  	  mongoStats: mongoHealth
  	  	};
  	  }
  	  
  	  return await safeOperation(async (db) => {
        if (!db) return { healthy: false, error: 'DB not available' };
  	  	const stats = await db.stats();
  	  	
  	  	return {
  	  	  healthy: true,
  	  	  ping: mongoHealth.pingTime,
  	  	  stats: {
  	  	  	collections: stats.collections || 0,
  	  	  	documents: stats.objects || 0,
  	  	  	dataSize: Math.round((stats.dataSize || 0) / 1024 / 1024 * 100) / 100, // MB
  	  	  	storageSize: Math.round((stats.storageSize || 0) / 1024 / 1024 * 100) / 100, // MB
  	  	  	indexes: stats.indexes || 0,
  	  	  	indexSize: Math.round((stats.indexSize || 0) / 1024 / 1024 * 100) / 100 // MB
  	  	  },
  	  	  connections: mongoHealth.connections,
  	  	  uptime: mongoHealth.uptime
  	  	};
  	  });
  	  
  	} catch (error) {
  	  console.error(chalk.red('❌ Database health check failed:'), error.message);
  	  return {
  	  	healthy: false,
  	  	error: error.message,
  	  	lastCheck: new Date()
  	  };
  	}
  }

  // Collection optimization utilities
  async optimizeCollections() {
  	try {
  	  return await safeOperation(async (db) => {
        if (!db) return null;
  	  	console.log(chalk.blue('🔧 Starting collection optimization...'));
  	  	
  	  	const collections = await db.listCollections().toArray();
  	  	const results = [];
  	  	
  	  	for (const collectionInfo of collections) {
  	  	  const collectionName = collectionInfo.name;
  	  	  const collection = db.collection(collectionName);
  	  	  
  	  	  try {
  	  	  	// Create common indexes for performance
  	  	  	if (collectionName === 'economy_users') {
  	  	  	  await collection.createIndex({ userId: 1 }, { unique: true, background: true });
  	  	  	  await collection.createIndex({ 'updatedAt': 1 }, { background: true });
  	  	  	  console.log(chalk.green(`✅ Optimized indexes for ${collectionName}`));
  	  	  	}
  	  	  	
  	  	  	if (collectionName === 'economy_transactions') {
  	  	  	  await collection.createIndex({ userId: 1, timestamp: -1 }, { background: true });
  	  	  	  await collection.createIndex({ timestamp: -1 }, { background: true });
  	  	  	  console.log(chalk.green(`✅ Optimized indexes for ${collectionName}`));
  	  	  	}
  	  	  	
  	  	  	// Get collection stats
  	  	  	const stats = await collection.stats();
  	  	  	results.push({
  	  	  	  collection: collectionName,
  	  	  	  documents: stats.count,
  	  	  	  size: Math.round(stats.size / 1024),
  	  	  	  avgObjSize: Math.round(stats.avgObjSize)
  	  	  	});
  	  	  	
  	  	  } catch (indexError) {
  	  	  	console.warn(chalk.yellow(`⚠️ Index creation warning for ${collectionName}:`), indexError.message);
  	  	  }
  	  	}
  	  	
  	  	console.log(chalk.green('✅ Collection optimization completed'));
  	  	return results;
  	  });
  	  
  	} catch (error) {
  	  console.error(chalk.red('❌ Collection optimization failed:'), error.message);
  	  throw error;
  	}
  }
}

export const databaseManager = new DatabaseManager();

// Enhanced connection monitoring and alerting
export class ConnectionMonitor {
  constructor() {
  	this.alertThresholds = {
  	  connectionUsage: 0.8, // 80% of available connections
  	  responseTime: 2000,   // 2 seconds
  	  errorRate: 0.1        // 10% error rate
  	};
  	
  	this.stats = {
  	  totalOperations: 0,
  	  failedOperations: 0,
  	  avgResponseTime: 0,
  	  lastAlert: null
  	};
  	
  	this.startMonitoring();
  }
  
  startMonitoring() {
  	// Check connection health every 2 minutes
  	setInterval(async () => {
  	  await this.checkConnectionHealth();
  	}, 2 * 60 * 1000);
  	
  	// Reset stats every hour
  	setInterval(() => {
  	  this.resetStats();
  	}, 60 * 60 * 1000);
  }
  
  async checkConnectionHealth() {
  	try {
  	  const health = await mongoManager.healthCheck();
  	  
  	  if (!health.healthy) {
  	  	await this.sendAlert('Connection Unhealthy', health.error);
  	  	return;
  	  }

      if (!health.connections || !health.connections.available) {
        logger.warn('Connection health check missing connection data, skipping usage alert.');
        return;
      }
  	  
  	  const connectionUsage = health.connections.current / health.connections.available;
  	  
  	  // Check connection usage
  	  if (connectionUsage > this.alertThresholds.connectionUsage) {
  	  	await this.sendAlert(
  	  	  'High Connection Usage', 
  	  	  `Using ${Math.round(connectionUsage * 100)}% of available connections (${health.connections.current}/${health.connections.available})`
  	  	);
  	  }
  	  
  	  // Check response time
  	  if (health.pingTime > this.alertThresholds.responseTime) {
  	  	await this.sendAlert(
  	  	  'High Response Time',
  	  	  `MongoDB ping: ${health.pingTime}ms (threshold: ${this.alertThresholds.responseTime}ms)`
  	  	);
  	  }
  	  
  	  // Update stats
  	  this.stats.avgResponseTime = health.pingTime;
  	  
  	} catch (error) {
  	  console.error(chalk.red('❌ Connection health check error:'), error.message);
  	}
  }
  
  async sendAlert(type, message) {
  	const now = Date.now();
  	
  	// Rate limit alerts (max 1 per 10 minutes)
  	if (this.stats.lastAlert && now - this.stats.lastAlert < 10 * 60 * 1000) {
  	  return;
  	}
  	
  	this.stats.lastAlert = now;
  	
  	console.log(chalk.red(`🚨 MongoDB Alert: ${type}`));
  	console.log(chalk.yellow(`📝 ${message}`));
  	
  	// Could send to external monitoring service or owner WhatsApp
  	// Example: await notifyOwner(`🚨 MongoDB Alert: ${type}\n${message}`);
  }
  
  recordOperation(success, responseTime) {
  	this.stats.totalOperations++;
  	if (!success) {
  	  this.stats.failedOperations++;
  	}
  	
  	// Calculate error rate
  	const errorRate = this.stats.failedOperations / this.stats.totalOperations;
  	
  	if (errorRate > this.alertThresholds.errorRate && this.stats.totalOperations > 10) {
  	  this.sendAlert(
  	  	'High Error Rate',
  	  	`Error rate: ${Math.round(errorRate * 100)}% (${this.stats.failedOperations}/${this.stats.totalOperations})`
  	  );
  	}
  }
  
  resetStats() {
  	this.stats = {
  	  totalOperations: 0,
  	  failedOperations: 0,
  	  avgResponseTime: 0,
  	  lastAlert: this.stats.lastAlert
  	};
  }
  
  getStats() {
  	const errorRate = this.stats.totalOperations > 0 
  	  ? this.stats.failedOperations / this.stats.totalOperations 
  	  : 0;
  	  
  	return {
  	  ...this.stats,
  	  errorRate: Math.round(errorRate * 100) / 100,
  	  alertThresholds: this.alertThresholds
  	};
  }
}

export const connectionMonitor = new ConnectionMonitor();

// Export utility functions that plugins should use
export {
  mongoManager,
  getDatabase,
  getCollection,
  safeOperation
};

// Re-export mongoHealthCheck from mongoManager
export const mongoHealthCheck = () => mongoManager.healthCheck();

// Plugin helper functions for easy migration
export const PluginHelpers = {
  // Get database connection (plugins should use this instead of creating their own)
  getDB: () => getDatabase(),
  
  // Get collection with automatic connection handling
  getCollection: (name) => getCollection(name),
  
  // Perform safe database operation with retry logic
  safeDBOperation: (operation, collectionName) => safeOperation(operation, collectionName),
  
  // Get user data (unified across all plugins)
  getUserData: (userId) => unifiedUserManager.getUserData(userId),
  
  // Update user data (unified across all plugins)  
  updateUser: (userId, data) => unifiedUserManager.updateUserData(userId, data),
  
  // Economy operations
  addMoney: (userId, amount, reason) => unifiedUserManager.addMoney(userId, amount, reason),
  removeMoney: (userId, amount, reason) => unifiedUserManager.removeMoney(userId, amount, reason),
  getBalance: (userId) => getEconomyBalance(userId),
  
  // Plugin communication
  registerPlugin: (name, data) => pluginCommunicator.registerPlugin(name, data),
  emitEvent: (eventName, data) => pluginCommunicator.emit(eventName, data),
  onEvent: (eventName, callback) => pluginCommunicator.on(eventName, callback),
  
  // Health monitoring
  recordOperation: (success, responseTime) => connectionMonitor.recordOperation(success, responseTime),
  
  // Cache operations
  getCacheStats: () => unifiedUserManager.getCacheStats()
};

// Initialize connections and cleanup on app start/stop
process.on('SIGTERM', async () => {
  console.log(chalk.yellow('📪 Closing MongoDB connections...'));
  await mongoManager.close();
});

process.on('SIGINT', async () => {
  console.log(chalk.yellow('📪 Closing MongoDB connections...'));
  await mongoManager.close();
});

// Export everything for easy importing
export default {
  mongoManager,
  unifiedUserManager,
  pluginCommunicator,
  databaseManager,
  connectionMonitor,
  PluginHelpers,
  // Utility functions
  getDatabase,
  getCollection,
  safeOperation,
  getEconomyBalance,
  getAttendanceStats
};
