// plugins/economy_plugin.js - Enhanced Economy plugin with full admin controls
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';

// Plugin information export
export const info = {
  name: 'Enhanced Economy System',
  version: '3.0.0',
  author: 'Bot Developer',
  description: 'Complete economy system with full admin controls, toggles, and MongoDB persistence',
  commands: [
    {
      name: 'economy',
      aliases: ['eco', 'money'],
      description: 'Access the economy system'
    },
    {
      name: 'balance',
      aliases: ['bal', 'wallet'],
      description: 'Check your balance'
    },
    {
      name: 'send',
      aliases: ['transfer', 'pay'],
      description: 'Send money to someone'
    },
    {
      name: 'deposit',
      aliases: ['dep'],
      description: 'Deposit money to bank'
    },
    {
      name: 'withdraw',
      aliases: ['wd'],
      description: 'Withdraw money from bank'
    },
    {
      name: 'work',
      aliases: [],
      description: 'Work to earn money'
    },
    {
      name: 'rob',
      aliases: [],
      description: 'Rob someone (risky!)'
    },
    {
      name: 'daily',
      aliases: [],
      description: 'Claim daily reward'
    },
    {
      name: 'profile',
      aliases: [],
      description: 'View user profile'
    },
    {
      name: 'leaderboard',
      aliases: ['lb'],
      description: 'View top users'
    },
    {
      name: 'clan',
      aliases: [],
      description: 'Clan system commands'
    },
    {
      name: 'shop',
      aliases: [],
      description: 'Browse shop items'
    },
    {
      name: 'inventory',
      aliases: ['inv'],
      description: 'View your inventory'
    },
    {
      name: 'ecoadmin',
      aliases: ['ea'],
      description: 'Economy admin panel (admin only)'
    }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'whatsapp_bot';
const COLLECTIONS = {
  USERS: 'economy_users',
  CLANS: 'economy_clans',
  TRANSACTIONS: 'economy_transactions',
  SETTINGS: 'economy_settings',
  SHOP_ITEMS: 'economy_shop_items',
  USER_ITEMS: 'economy_user_items'
};

// Database connection
let db = null;
let mongoClient = null;

// Initialize MongoDB connection
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    // Create indexes for better performance
    await db.collection(COLLECTIONS.USERS).createIndex({ userId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.CLANS).createIndex({ name: 1 }, { unique: true });
    await db.collection(COLLECTIONS.TRANSACTIONS).createIndex({ userId: 1, timestamp: -1 });
    await db.collection(COLLECTIONS.SHOP_ITEMS).createIndex({ id: 1 }, { unique: true });
    
    console.log('✅ MongoDB connected successfully');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default economy settings with comprehensive controls
const defaultSettings = {
  // System toggles
  systemEnabled: true,
  workEnabled: true,
  robEnabled: true,
  dailyEnabled: true,
  transferEnabled: true,
  bankEnabled: true,
  clanEnabled: true,
  shopEnabled: true,
  
  // Basic economy
  startingBalance: 0,
  startingBankBalance: 0,
  currency: '₦',
  timezone: 'Africa/Lagos',
  
  // Daily rewards
  dailyEnabled: true,
  dailyMinAmount: 500,
  dailyMaxAmount: 1000,
  dailyStreakBonus: true,
  dailyStreakBonusPercent: 0.1, // 10% bonus per streak day
  dailyMaxStreakBonus: 5, // Max 5 days of streak bonus
  
  // Work system
  workEnabled: true,
  workCooldownMinutes: 60,
  workMinEarnings: 100,
  workMaxEarnings: 1500,
  workExperienceEnabled: true,
  workJobs: [
    { name: 'Uber Driver', min: 200, max: 800, experience: 5 },
    { name: 'Food Delivery', min: 150, max: 600, experience: 3 },
    { name: 'Freelancer', min: 300, max: 1200, experience: 8 },
    { name: 'Tutor', min: 250, max: 900, experience: 6 },
    { name: 'Cleaner', min: 180, max: 500, experience: 2 },
    { name: 'Mechanic', min: 400, max: 1000, experience: 7 },
    { name: 'Programmer', min: 500, max: 1500, experience: 10 },
    { name: 'Designer', min: 350, max: 1100, experience: 8 }
  ],
  
  // Robbery system
  robEnabled: true,
  robCooldownMinutes: 60,
  robSuccessRate: 0.7,
  robMaxStealPercent: 0.3,
  robMinTargetBalance: 100,
  robMinRobberBalance: 100,
  robMinSteal: 10,
  robFailPenalty: 100,
  robPoliceChance: 0.1, // 10% chance to get arrested
  robPoliceMultiplier: 2, // 2x penalty if caught by police
  
  // Banking system
  bankEnabled: true,
  bankInterestRate: 0.02, // 2% daily interest
  bankInterestEnabled: true,
  bankMaxDeposit: 1000000,
  bankMinDeposit: 10,
  bankMaxWithdraw: 1000000,
  bankMinWithdraw: 10,
  
  // Transfer system
  transferEnabled: true,
  transferMinAmount: 1,
  transferMaxAmount: 1000000,
  transferTaxEnabled: false,
  transferTaxPercent: 0.05, // 5% tax
  
  // Clan system
  clanEnabled: true,
  clanCreationCost: 5000,
  clanMaxMembers: 20,
  clanRenameEnabled: true,
  clanRenameCost: 2000,
  clanBankEnabled: true,
  clanTaxEnabled: false,
  clanTaxPercent: 0.1, // 10% of earnings go to clan
  
  // Shop system
  shopEnabled: true,
  shopRefreshDaily: true,
  
  // Experience and ranking
  experienceEnabled: true,
  rankingEnabled: true,
  ranks: [
    { name: 'Newbie', minWealth: 0, benefits: { dailyBonus: 0, workBonus: 0 } },
    { name: 'Beginner', minWealth: 5000, benefits: { dailyBonus: 50, workBonus: 0.1 } },
    { name: 'Amateur', minWealth: 25000, benefits: { dailyBonus: 100, workBonus: 0.15 } },
    { name: 'Professional', minWealth: 100000, benefits: { dailyBonus: 200, workBonus: 0.2 } },
    { name: 'Expert', minWealth: 500000, benefits: { dailyBonus: 500, workBonus: 0.3 } },
    { name: 'Master', minWealth: 1000000, benefits: { dailyBonus: 1000, workBonus: 0.5 } },
    { name: 'Legend', minWealth: 5000000, benefits: { dailyBonus: 2000, workBonus: 1.0 } }
  ],
  
  // Bounty system
  bountyEnabled: true,
  bountyMinAmount: 1000,
  bountyMaxAmount: 100000,
  
  // Gambling (future feature)
  gamblingEnabled: false,
  
  // Limits and restrictions
  maxDailyEarnings: 50000,
  maxDailyTransfers: 10,
  maxDailyRobs: 5,
  
  // Notifications
  notifyTransfers: true,
  notifyRobberies: true,
  notifyDailyStreak: true,
  
  // Anti-cheat
  suspiciousActivityDetection: true,
  maxBalanceGrowthPerDay: 100000,
  
  // Maintenance
  maintenanceMode: false,
  maintenanceMessage: 'Economy system is under maintenance. Please try again later.'
};

// Load settings from database
let ecoSettings = { ...defaultSettings };

async function loadSettings() {
  try {
    const settings = await db.collection(COLLECTIONS.SETTINGS).findOne({ type: 'economy' });
    if (settings) {
      ecoSettings = { ...defaultSettings, ...settings.data };
    } else {
      // Save default settings if none exist
      await saveSettings();
    }
  } catch (error) {
    console.error('Error loading economy settings:', error);
  }
}

// Save settings to database
async function saveSettings() {
  try {
    await db.collection(COLLECTIONS.SETTINGS).replaceOne(
      { type: 'economy' },
      { type: 'economy', data: ecoSettings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving economy settings:', error);
  }
}

// Initialize default shop items
async function initShopItems() {
  try {
    const existingItems = await db.collection(COLLECTIONS.SHOP_ITEMS).countDocuments();
    if (existingItems === 0) {
      const defaultItems = [
        { id: 'protection_basic', name: '🛡️ Basic Protection', price: 1000, description: 'Reduces robbery success rate against you by 20%', type: 'protection', duration: 7 },
        { id: 'protection_premium', name: '🛡️ Premium Protection', price: 5000, description: 'Reduces robbery success rate against you by 50%', type: 'protection', duration: 30 },
        { id: 'multiplier_work', name: '⚡ Work Multiplier', price: 2000, description: 'Doubles work earnings for 24 hours', type: 'multiplier', duration: 1 },
        { id: 'multiplier_daily', name: '⚡ Daily Multiplier', price: 3000, description: 'Doubles daily rewards for 7 days', type: 'multiplier', duration: 7 },
        { id: 'rank_boost', name: '🚀 Rank Boost', price: 10000, description: 'Instantly advance to next rank', type: 'instant', duration: 0 },
        { id: 'clan_boost', name: '🏰 Clan Boost', price: 15000, description: 'Increases clan bank capacity by 50%', type: 'clan', duration: 30 }
      ];
      
      await db.collection(COLLECTIONS.SHOP_ITEMS).insertMany(defaultItems);
    }
  } catch (error) {
    console.error('Error initializing shop items:', error);
  }
}

// Initialize user in database
async function initUser(userId) {
  try {
    const existingUser = await db.collection(COLLECTIONS.USERS).findOne({ userId });
    
    if (!existingUser) {
      const newUser = {
        userId,
        // Economy fields
        balance: ecoSettings.startingBalance,
        bank: ecoSettings.startingBankBalance,
        inventory: [],
        clan: null,
        bounty: 0,
        rank: 'Newbie',
        experience: 0,
        level: 1,
        
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
        lastBankInterest: null,
        
        // Statistics
        totalEarned: 0,
        totalSpent: 0,
        totalTransfers: 0,
        totalRobberies: 0,
        successfulRobberies: 0,
        timesRobbed: 0,
        
        // Active effects
        activeEffects: [],
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection(COLLECTIONS.USERS).insertOne(newUser);
      return newUser;
    } else {
      // Ensure all fields exist for backward compatibility
      const updates = {};
      let needsUpdate = false;
      
      // Check and add missing fields
      const requiredFields = {
        balance: ecoSettings.startingBalance,
        bank: ecoSettings.startingBankBalance,
        inventory: [],
        clan: null,
        bounty: 0,
        rank: 'Newbie',
        experience: 0,
        level: 1,
        totalAttendances: 0,
        streak: 0,
        longestStreak: 0,
        birthdayData: null,
        lastDaily: null,
        lastWork: null,
        lastRob: null,
        lastBankInterest: null,
        totalEarned: 0,
        totalSpent: 0,
        totalTransfers: 0,
        totalRobberies: 0,
        successfulRobberies: 0,
        timesRobbed: 0,
        activeEffects: []
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
        await db.collection(COLLECTIONS.USERS).updateOne(
          { userId },
          { $set: updates }
        );
      }
      
      return existingUser;
    }
  } catch (error) {
    console.error('Error initializing user:', error);
    throw error;
  }
}

// Get user data from database
async function getUserData(userId) {
  try {
    await initUser(userId);
    return await db.collection(COLLECTIONS.USERS).findOne({ userId });
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
}

// Update user data in database
async function updateUserData(userId, data) {
  try {
    const result = await db.collection(COLLECTIONS.USERS).updateOne(
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
  } catch (error) {
    console.error('Error updating user data:', error);
    throw error;
  }
}

// Add money to user balance with transaction logging
async function addMoney(userId, amount, reason = 'Unknown') {
  try {
    const user = await getUserData(userId);
    const newBalance = user.balance + amount;
    
    await updateUserData(userId, { 
      balance: newBalance,
      totalEarned: (user.totalEarned || 0) + amount
    });
    
    // Log transaction
    await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({
      userId,
      type: 'credit',
      amount,
      reason,
      balanceBefore: user.balance,
      balanceAfter: newBalance,
      timestamp: new Date()
    });
    
    console.log(`💰 Added ${ecoSettings.currency}${amount} to ${userId.split('@')[0]} (${reason})`);
    return newBalance;
  } catch (error) {
    console.error('Error adding money:', error);
    throw error;
  }
}

// Remove money from user balance with transaction logging
async function removeMoney(userId, amount, reason = 'Unknown') {
  try {
    const user = await getUserData(userId);
    if (user.balance >= amount) {
      const newBalance = user.balance - amount;
      
      await updateUserData(userId, { 
        balance: newBalance,
        totalSpent: (user.totalSpent || 0) + amount
      });
      
      // Log transaction
      await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({
        userId,
        type: 'debit',
        amount,
        reason,
        balanceBefore: user.balance,
        balanceAfter: newBalance,
        timestamp: new Date()
      });
      
      console.log(`💸 Removed ${ecoSettings.currency}${amount} from ${userId.split('@')[0]} (${reason})`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error removing money:', error);
    throw error;
  }
}

// Update user rank based on wealth
async function updateUserRank(userId) {
  try {
    if (!ecoSettings.rankingEnabled) return;
    
    const userData = await getUserData(userId);
    const totalWealth = userData.balance + userData.bank;
    
    let newRank = 'Newbie';
    for (const rank of ecoSettings.ranks.reverse()) {
      if (totalWealth >= rank.minWealth) {
        newRank = rank.name;
        break;
      }
    }
    
    if (userData.rank !== newRank) {
      await updateUserData(userId, { rank: newRank });
      return newRank;
    }
    
    return userData.rank;
  } catch (error) {
    console.error('Error updating rank:', error);
  }
}

// Get current Nigeria time
function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

// Get current date in Nigeria timezone
function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

// Get target user from mentions, quoted message, or text input
function getTargetUser(m, text) {
  try {
    if (!m || !m.message) return null;

    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      return m.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    
    if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      return m.message.extendedTextMessage.contextInfo.participant;
    }
    
    if (text && typeof text === 'string') {
      const phoneNumber = text.replace(/[^0-9]/g, '');
      if (phoneNumber.length >= 10) {
        return phoneNumber + '@s.whatsapp.net';
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting target user:', error);
    return null;
  }
}

// Check if user is admin
function isAdmin(userId) {
  try {
    if (!userId || typeof userId !== 'string') return false;
    const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
    return adminNumbers.includes(userId.split('@')[0]);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

function isOwner(userId) {
  try {
    if (!userId || typeof userId !== 'string') return false;
    const ownerNumber = process.env.OWNER_NUMBER || '';
    return userId.split('@')[0] === ownerNumber;
  } catch (error) {
    console.error('Error checking owner status:', error);
    return false;
  }
}

// Check if system is enabled
function checkSystemEnabled(feature = 'system') {
  if (ecoSettings.maintenanceMode) return false;
  if (!ecoSettings.systemEnabled) return false;
  
  switch (feature) {
    case 'work': return ecoSettings.workEnabled;
    case 'rob': return ecoSettings.robEnabled;
    case 'daily': return ecoSettings.dailyEnabled;
    case 'transfer': return ecoSettings.transferEnabled;
    case 'bank': return ecoSettings.bankEnabled;
    case 'clan': return ecoSettings.clanEnabled;
    case 'shop': return ecoSettings.shopEnabled;
    default: return ecoSettings.systemEnabled;
  }
}

// Main plugin handler function
export default async function economyHandler(m, sock, config) {
  try {
    if (!m || !m.body || typeof m.body !== 'string') return;
    if (!config || !config.PREFIX || typeof config.PREFIX !== 'string') return;
    if (!m.body.startsWith(config.PREFIX)) return;

    let messageBody = m.body.slice(config.PREFIX.length).trim();
    if (!messageBody) return;

    let args = messageBody.split(' ').filter(arg => arg.length > 0);
    if (args.length === 0) return;
    
    const command = args[0].toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    
    if (!senderId || !from) return;

    // Initialize database connection
    if (!db) {
      await initDatabase();
      await loadSettings();
      await initShopItems();
    }
    
    // Check maintenance mode
    if (ecoSettings.maintenanceMode && !isAdmin(senderId) && !isOwner(senderId)) {
      await sock.sendMessage(from, { 
        text: `🔧 *${ecoSettings.maintenanceMessage}*` 
      }, { quoted: m });
      return;
    }
    
    // Initialize user
    await initUser(senderId);
    
    // Helper function for sending replies
    const reply = async (text) => {
      try {
        if (!text || typeof text !== 'string') return;
        await sock.sendMessage(from, { text }, { quoted: m });
      } catch (replyError) {
        console.error('❌ Error sending reply:', replyError.message);
      }
    };
    
    // Handle different commands
    switch (command) {
      case 'economy':
      case 'eco':
        if (args.length === 1) {
          await showEconomyMenu(reply, config.PREFIX);
        } else {
          await handleSubCommand(args[1], args.slice(2), { m, sock, config, senderId, from, reply });
        }
        break;
        
      case 'ecoadmin':
      case 'ea':
        await handleEcoAdmin(context = { m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'balance':
      case 'bal':
      case 'wallet':
        if (!checkSystemEnabled()) {
          await reply('🚫 *Economy system is currently disabled*');
          return;
        }
        await handleBalance({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'send':
      case 'transfer':
      case 'pay':
        if (!checkSystemEnabled('transfer')) {
          await reply('🚫 *Transfers are currently disabled*');
          return;
        }
        await handleSend({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'deposit':
      case 'dep':
        if (!checkSystemEnabled('bank')) {
          await reply('🚫 *Banking is currently disabled*');
          return;
        }
        await handleDeposit({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'withdraw':
      case 'wd':
        if (!checkSystemEnabled('bank')) {
          await reply('🚫 *Banking is currently disabled*');
          return;
        }
        await handleWithdraw({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'work':
        if (!checkSystemEnabled('work')) {
          await reply('🚫 *Work is currently disabled*');
          return;
        }
        await handleWork({ m, sock, config, senderId, from, reply });
        break;
        
      case 'rob':
        if (!checkSystemEnabled('rob')) {
          await reply('🚫 *Robbery is currently disabled*');
          return;
        }
        await handleRob({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'daily':
        if (!checkSystemEnabled('daily')) {
          await reply('🚫 *Daily rewards are currently disabled*');
          return;
        }
        await handleDaily({ m, sock, config, senderId, from, reply });
        break;
        
      case 'profile':
        if (!checkSystemEnabled()) {
          await reply('🚫 *Economy system is currently disabled*');
          return;
        }
        await handleProfile({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'leaderboard':
      case 'lb':
        if (!checkSystemEnabled()) {
          await reply('🚫 *Economy system is currently disabled*');
          return;
        }
        await handleLeaderboard({ m, sock, config, senderId, from, reply });
        break;
        
      case 'clan':
        if (!checkSystemEnabled('clan')) {
          await reply('🚫 *Clan system is currently disabled*');
          return;
        }
        await handleClan({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'shop':
        if (!checkSystemEnabled('shop')) {
          await reply('🚫 *Shop is currently disabled*');
          return;
        }
        await handleShop({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'inventory':
      case 'inv':
        if (!checkSystemEnabled()) {
          await reply('🚫 *Economy system is currently disabled*');
          return;
        }
        await handleInventory({ m, sock, config, senderId, from, reply });
        break;
        
      default:
        break;
    }
  } catch (error) {
    console.error('❌ Economy plugin error:', error.message);
  }
}

// Handle subcommands for the main economy command
async function handleSubCommand(subCommand, args, context) {
  try {
    if (!subCommand || typeof subCommand !== 'string') {
      await context.reply('⚠️ *Please specify a valid subcommand*');
      return;
    }

    switch (subCommand.toLowerCase()) {
      case 'balance':
      case 'bal':
      case 'wallet':
        await handleBalance(context, args);
        break;
      case 'send':
      case 'transfer':
      case 'pay':
        if (!checkSystemEnabled('transfer')) {
          await context.reply('🚫 *Transfers are currently disabled*');
          return;
        }
        await handleSend(context, args);
        break;
      case 'deposit':
      case 'dep':
        if (!checkSystemEnabled('bank')) {
          await context.reply('🚫 *Banking is currently disabled*');
          return;
        }
        await handleDeposit(context, args);
        break;
      case 'withdraw':
      case 'wd':
        if (!checkSystemEnabled('bank')) {
          await context.reply('🚫 *Banking is currently disabled*');
          return;
        }
        await handleWithdraw(context, args);
        break;
      case 'work':
        if (!checkSystemEnabled('work')) {
          await context.reply('🚫 *Work is currently disabled*');
          return;
        }
        await handleWork(context);
        break;
      case 'rob':
        if (!checkSystemEnabled('rob')) {
          await context.reply('🚫 *Robbery is currently disabled*');
          return;
        }
        await handleRob(context, args);
        break;
      case 'daily':
        if (!checkSystemEnabled('daily')) {
          await context.reply('🚫 *Daily rewards are currently disabled*');
          return;
        }
        await handleDaily(context);
        break;
      case 'profile':
        await handleProfile(context, args);
        break;
      case 'leaderboard':
      case 'lb':
        await handleLeaderboard(context);
        break;
      case 'clan':
        if (!checkSystemEnabled('clan')) {
          await context.reply('🚫 *Clan system is currently disabled*');
          return;
        }
        await handleClan(context, args);
        break;
      case 'shop':
        if (!checkSystemEnabled('shop')) {
          await context.reply('🚫 *Shop is currently disabled*');
          return;
        }
        await handleShop(context, args);
        break;
      case 'inventory':
      case 'inv':
        await handleInventory(context);
        break;
      default:
        await context.reply(`❓ Unknown economy command: *${subCommand}*\n\nUse *${context.config.PREFIX}economy* to see available commands.`);
    }
  } catch (error) {
    console.error('❌ Economy subcommand error:', error.message);
    await context.reply('❌ *Error processing command. Please try again.*');
  }
}

// Show economy menu
async function showEconomyMenu(reply, prefix) {
  try {
    const status = ecoSettings.systemEnabled ? '✅ Online' : '🔴 Offline';
    const menuText = `💰 *ECONOMY SYSTEM* 💰\n🔄 *Status:* ${status}\n\n` +
                    `💵 *Wallet Commands:*\n` +
                    `• *balance/bal* - Check your balance\n` +
                    `• *send @user amount* - Send money ${!ecoSettings.transferEnabled ? '(Disabled)' : ''}\n` +
                    `• *deposit amount* - Deposit to bank ${!ecoSettings.bankEnabled ? '(Disabled)' : ''}\n` +
                    `• *withdraw amount* - Withdraw from bank ${!ecoSettings.bankEnabled ? '(Disabled)' : ''}\n\n` +
                    `💼 *Earning Commands:*\n` +
                    `• *work* - Work to earn money ${!ecoSettings.workEnabled ? '(Disabled)' : ''}\n` +
                    `• *daily* - Claim daily reward ${!ecoSettings.dailyEnabled ? '(Disabled)' : ''}\n` +
                    `• *rob @user* - Rob someone ${!ecoSettings.robEnabled ? '(Disabled)' : ''}\n\n` +
                    `👥 *Social Commands:*\n` +
                    `• *profile [@user]* - View profile\n` +
                    `• *leaderboard* - Top users\n` +
                    `• *clan* - Clan system ${!ecoSettings.clanEnabled ? '(Disabled)' : ''}\n\n` +
                    `🛍️ *Shop Commands:*\n` +
                    `• *shop* - Browse items ${!ecoSettings.shopEnabled ? '(Disabled)' : ''}\n` +
                    `• *inventory* - View your items\n\n` +
                    `💡 *Usage:* ${prefix}economy [command] or ${prefix}[command]\n` +
                    `⚙️ *Admin:* ${prefix}ecoadmin - Admin panel`;
    
    await reply(menuText);
  } catch (error) {
    console.error('❌ Error showing economy menu:', error.message);
  }
}

// Handle economy admin panel
async function handleEcoAdmin(context, args) {
  const { reply, senderId, sock, from } = context;
  
  try {
    if (!isAdmin(senderId) && !isOwner(senderId)) {
      await reply('🚫 *Access denied. Admin privileges required.*');
      return;
    }
    
    if (!args || args.length === 0) {
      await showAdminPanel(context);
      return;
    }
    
    const subCmd = args[0].toLowerCase();
    
    switch (subCmd) {
      case 'toggle':
        await handleToggle(context, args.slice(1));
        break;
      case 'set':
        await handleSetSetting(context, args.slice(1));
        break;
      case 'add':
        await handleAddMoney(context, args.slice(1));
        break;
      case 'remove':
        await handleRemoveMoney(context, args.slice(1));
        break;
      case 'reset':
        await handleResetUser(context, args.slice(1));
        break;
      case 'stats':
        await handleEconomyStats(context);
        break;
      case 'backup':
        await handleBackup(context);
        break;
      case 'restore':
        await handleRestore(context, args.slice(1));
        break;
      case 'jobs':
        await handleJobsAdmin(context, args.slice(1));
        break;
      case 'shop':
        await handleShopAdmin(context, args.slice(1));
        break;
      case 'clan':
        await handleClanAdmin(context, args.slice(1));
        break;
      case 'ranks':
        await handleRanksAdmin(context, args.slice(1));
        break;
      default:
        await reply(`❓ *Unknown admin command:* ${subCmd}\n\nUse *${context.config.PREFIX}ecoadmin* for help`);
    }
  } catch (error) {
    await reply('❌ *Error in admin panel. Please try again.*');
    console.error('EcoAdmin error:', error);
  }
}

// Show admin panel
async function showAdminPanel(context) {
  const { reply } = context;
  
  try {
    const totalUsers = await db.collection(COLLECTIONS.USERS).countDocuments();
    const totalWealth = await db.collection(COLLECTIONS.USERS).aggregate([
      { $group: { _id: null, total: { $sum: { $add: ['$balance', '$bank'] } } } }
    ]).toArray();
    
    const wealth = totalWealth.length > 0 ? totalWealth[0].total : 0;
    
    const adminText = `⚙️ *ECONOMY ADMIN PANEL* ⚙️\n\n` +
                     `📊 *System Status:*\n` +
                     `• System: ${ecoSettings.systemEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                     `• Maintenance: ${ecoSettings.maintenanceMode ? '🔧 On' : '✅ Off'}\n` +
                     `• Total Users: ${totalUsers}\n` +
                     `• Total Wealth: ${ecoSettings.currency}${wealth.toLocaleString()}\n\n` +
                     `🔧 *Feature Toggles:*\n` +
                     `• Work: ${ecoSettings.workEnabled ? '✅' : '❌'}\n` +
                     `• Rob: ${ecoSettings.robEnabled ? '✅' : '❌'}\n` +
                     `• Daily: ${ecoSettings.dailyEnabled ? '✅' : '❌'}\n` +
                     `• Transfer: ${ecoSettings.transferEnabled ? '✅' : '❌'}\n` +
                     `• Bank: ${ecoSettings.bankEnabled ? '✅' : '❌'}\n` +
                     `• Clan: ${ecoSettings.clanEnabled ? '✅' : '❌'}\n` +
                     `• Shop: ${ecoSettings.shopEnabled ? '✅' : '❌'}\n\n` +
                     `📋 *Available Commands:*\n` +
                     `• *toggle [feature]* - Toggle features on/off\n` +
                     `• *set [setting] [value]* - Change settings\n` +
                     `• *add @user [amount]* - Add money to user\n` +
                     `• *remove @user [amount]* - Remove money from user\n` +
                     `• *reset @user* - Reset user data\n` +
                     `• *stats* - View detailed statistics\n` +
                     `• *jobs* - Manage work jobs\n` +
                     `• *shop* - Manage shop items\n` +
                     `• *clan* - Clan management\n` +
                     `• *ranks* - Manage user ranks\n\n` +
                     `💡 *Example:* ${context.config.PREFIX}ecoadmin toggle work`;
    
    await reply(adminText);
  } catch (error) {
    console.error('Error showing admin panel:', error);
  }
}

// Handle toggle commands
async function handleToggle(context, args) {
  const { reply } = context;
  
  try {
    if (!args || args.length === 0) {
      const toggleText = `🔧 *TOGGLE FEATURES* 🔧\n\n` +
                        `Available toggles:\n` +
                        `• *system* - Main economy system\n` +
                        `• *work* - Work system\n` +
                        `• *rob* - Robbery system\n` +
                        `• *daily* - Daily rewards\n` +
                        `• *transfer* - Money transfers\n` +
                        `• *bank* - Banking system\n` +
                        `• *clan* - Clan system\n` +
                        `• *shop* - Shop system\n` +
                        `• *maintenance* - Maintenance mode\n` +
                        `• *interest* - Bank interest\n` +
                        `• *experience* - Experience system\n` +
                        `• *ranking* - Ranking system\n` +
                        `• *bounty* - Bounty system\n\n` +
                        `💡 *Usage:* ${context.config.PREFIX}ecoadmin toggle [feature]`;
      
      await reply(toggleText);
      return;
    }
    
    const feature = args[0].toLowerCase();
    let settingKey = '';
    let featureName = '';
    
    switch (feature) {
      case 'system':
        settingKey = 'systemEnabled';
        featureName = 'Economy System';
        break;
      case 'work':
        settingKey = 'workEnabled';
        featureName = 'Work System';
        break;
      case 'rob':
      case 'robbery':
        settingKey = 'robEnabled';
        featureName = 'Robbery System';
        break;
      case 'daily':
        settingKey = 'dailyEnabled';
        featureName = 'Daily Rewards';
        break;
      case 'transfer':
      case 'send':
        settingKey = 'transferEnabled';
        featureName = 'Money Transfers';
        break;
      case 'bank':
      case 'banking':
        settingKey = 'bankEnabled';
        featureName = 'Banking System';
        break;
      case 'clan':
        settingKey = 'clanEnabled';
        featureName = 'Clan System';
        break;
      case 'shop':
        settingKey = 'shopEnabled';
        featureName = 'Shop System';
        break;
      case 'maintenance':
        settingKey = 'maintenanceMode';
        featureName = 'Maintenance Mode';
        break;
      case 'interest':
        settingKey = 'bankInterestEnabled';
        featureName = 'Bank Interest';
        break;
      case 'experience':
      case 'exp':
        settingKey = 'experienceEnabled';
        featureName = 'Experience System';
        break;
      case 'ranking':
      case 'ranks':
        settingKey = 'rankingEnabled';
        featureName = 'Ranking System';
        break;
      case 'bounty':
        settingKey = 'bountyEnabled';
        featureName = 'Bounty System';
        break;
      default:
        await reply(`❌ *Unknown feature:* ${feature}\n\nUse *${context.config.PREFIX}ecoadmin toggle* for available features`);
        return;
    }
    
    const currentValue = ecoSettings[settingKey];
    const newValue = !currentValue;
    
    ecoSettings[settingKey] = newValue;
    await saveSettings();
    
    const statusIcon = newValue ? '✅' : '❌';
    const statusText = newValue ? 'Enabled' : 'Disabled';
    
    await reply(`${statusIcon} *${featureName}* has been *${statusText}*`);
    
  } catch (error) {
    await reply('❌ *Error toggling feature. Please try again.*');
    console.error('Toggle error:', error);
  }
}

// Handle setting changes
async function handleSetSetting(context, args) {
  const { reply } = context;
  
  try {
    if (!args || args.length < 2) {
      const settingsText = `⚙️ *CONFIGURABLE SETTINGS* ⚙️\n\n` +
                          `💰 *Economy:*\n` +
                          `• startingBalance - Starting wallet amount\n` +
                          `• startingBankBalance - Starting bank amount\n` +
                          `• currency - Currency symbol\n\n` +
                          `🎁 *Daily Rewards:*\n` +
                          `• dailyMinAmount - Minimum daily reward\n` +
                          `• dailyMaxAmount - Maximum daily reward\n` +
                          `• dailyStreakBonusPercent - Streak bonus (0.1 = 10%)\n` +
                          `• dailyMaxStreakBonus - Max streak bonus days\n\n` +
                          `💼 *Work System:*\n` +
                          `• workCooldownMinutes - Work cooldown\n` +
                          `• workMinEarnings - Minimum work earnings\n` +
                          `• workMaxEarnings - Maximum work earnings\n\n` +
                          `🦹 *Robbery:*\n` +
                          `• robSuccessRate - Success rate (0.7 = 70%)\n` +
                          `• robCooldownMinutes - Rob cooldown\n` +
                          `• robMaxStealPercent - Max steal % (0.3 = 30%)\n` +
                          `• robMinTargetBalance - Min target balance\n` +
                          `• robFailPenalty - Penalty for failed rob\n\n` +
                          `🏦 *Banking:*\n` +
                          `• bankInterestRate - Daily interest (0.02 = 2%)\n` +
                          `• bankMaxDeposit - Max deposit amount\n` +
                          `• bankMinDeposit - Min deposit amount\n\n` +
                          `🏰 *Clans:*\n` +
                          `• clanCreationCost - Cost to create clan\n` +
                          `• clanMaxMembers - Max members per clan\n` +
                          `• clanRenameCost - Cost to rename clan\n\n` +
                          `💡 *Usage:* ${context.config.PREFIX}ecoadmin set [setting] [value]`;
      
      await reply(settingsText);
      return;
    }
    
    const setting = args[0];
    const value = args.slice(1).join(' ');
    
    // Validate and convert value based on setting type
    let newValue = value;
    const numericSettings = [
      'startingBalance', 'startingBankBalance', 'dailyMinAmount', 'dailyMaxAmount',
      'workCooldownMinutes', 'workMinEarnings', 'workMaxEarnings', 'robCooldownMinutes',
      'robMinTargetBalance', 'robFailPenalty', 'bankMaxDeposit', 'bankMinDeposit',
      'clanCreationCost', 'clanMaxMembers', 'clanRenameCost', 'dailyMaxStreakBonus'
    ];
    
    const percentSettings = [
      'dailyStreakBonusPercent', 'robSuccessRate', 'robMaxStealPercent', 
      'bankInterestRate', 'transferTaxPercent', 'clanTaxPercent'
    ];
    
    if (numericSettings.includes(setting)) {
      newValue = parseInt(value);
      if (isNaN(newValue) || newValue < 0) {
        await reply('⚠️ *Value must be a positive number*');
        return;
      }
    } else if (percentSettings.includes(setting)) {
      newValue = parseFloat(value);
      if (isNaN(newValue) || newValue < 0 || newValue > 1) {
        await reply('⚠️ *Rate must be between 0 and 1 (e.g., 0.1 for 10%)*');
        return;
      }
    } else if (setting === 'currency') {
      if (value.length > 3) {
        await reply('⚠️ *Currency symbol must be 3 characters or less*');
        return;
      }
    } else if (setting === 'maintenanceMessage') {
      if (value.length > 200) {
        await reply('⚠️ *Maintenance message must be 200 characters or less*');
        return;
      }
    }
    
    if (ecoSettings.hasOwnProperty(setting)) {
      const oldValue = ecoSettings[setting];
      ecoSettings[setting] = newValue;
      await saveSettings();
      
      await reply(`✅ *Setting Updated Successfully!*\n\n📝 *Setting:* ${setting}\n🔄 *Old Value:* ${oldValue}\n✨ *New Value:* ${newValue}`);
    } else {
      await reply(`❌ *Invalid setting:* ${setting}\n\nUse *${context.config.PREFIX}ecoadmin set* to see available settings`);
    }
  } catch (error) {
    await reply('❌ *Error updating setting. Please try again.*');
    console.error('Set setting error:', error);
  }
}

// Handle adding money to users
async function handleAddMoney(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!args || args.length < 2) {
      await reply(`⚠️ *Usage:*\n• Reply to user: *${context.config.PREFIX}ecoadmin add [amount]*\n• Mention user: *${context.config.PREFIX}ecoadmin add @user [amount]*\n• Use number: *${context.config.PREFIX}ecoadmin add 1234567890 [amount]*`);
      return;
    }
    
    const targetUser = getTargetUser(m, args[0]);
    const amount = parseInt(args[args.length - 1]);
    
    if (!targetUser) {
      await reply('⚠️ *Please specify a valid user*');
      return;
    }
    
    if (isNaN(amount) || amount <= 0) {
      await reply('⚠️ *Please provide a valid amount*');
      return;
    }
    
    await initUser(targetUser);
    await addMoney(targetUser, amount, `Admin bonus by ${senderId.split('@')[0]}`);
    
    const updatedUser = await getUserData(targetUser);
    
    await sock.sendMessage(from, {
      text: `💰 *ADMIN: Money Added* 💰\n\n👤 *User:* @${targetUser.split('@')[0]}\n💵 *Amount Added:* ${ecoSettings.currency}${amount.toLocaleString()}\n💎 *New Balance:* ${ecoSettings.currency}${updatedUser.balance.toLocaleString()}\n👨‍💼 *Admin:* @${senderId.split('@')[0]}`,
      mentions: [targetUser, senderId]
    });
  } catch (error) {
    await reply('❌ *Error adding money. Please try again.*');
    console.error('Add money error:', error);
  }
}

// Handle removing money from users
async function handleRemoveMoney(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!args || args.length < 2) {
      await reply(`⚠️ *Usage:*\n• Reply to user: *${context.config.PREFIX}ecoadmin remove [amount]*\n• Mention user: *${context.config.PREFIX}ecoadmin remove @user [amount]*`);
      return;
    }
    
    const targetUser = getTargetUser(m, args[0]);
    const amount = parseInt(args[args.length - 1]);
    
    if (!targetUser) {
      await reply('⚠️ *Please specify a valid user*');
      return;
    }
    
    if (isNaN(amount) || amount <= 0) {
      await reply('⚠️ *Please provide a valid amount*');
      return;
    }
    
    await initUser(targetUser);
    const success = await removeMoney(targetUser, amount, `Admin deduction by ${senderId.split('@')[0]}`);
    
    if (!success) {
      await reply('❌ *User has insufficient balance*');
      return;
    }
    
    const updatedUser = await getUserData(targetUser);
    
    await sock.sendMessage(from, {
      text: `💸 *ADMIN: Money Removed* 💸\n\n👤 *User:* @${targetUser.split('@')[0]}\n💵 *Amount Removed:* ${ecoSettings.currency}${amount.toLocaleString()}\n💎 *New Balance:* ${ecoSettings.currency}${updatedUser.balance.toLocaleString()}\n👨‍💼 *Admin:* @${senderId.split('@')[0]}`,
      mentions: [targetUser, senderId]
    });
  } catch (error) {
    await reply('❌ *Error removing money. Please try again.*');
    console.error('Remove money error:', error);
  }
}

// Handle user reset
async function handleResetUser(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!args || args.length === 0) {
      await reply(`⚠️ *Usage:*\n• Reply to user: *${context.config.PREFIX}ecoadmin reset*\n• Mention user: *${context.config.PREFIX}ecoadmin reset @user*`);
      return;
    }
    
    const targetUser = getTargetUser(m, args[0]);
    
    if (!targetUser) {
      await reply('⚠️ *Please specify a valid user*');
      return;
    }
    
    // Reset user to default values
    await updateUserData(targetUser, {
      balance: ecoSettings.startingBalance,
      bank: ecoSettings.startingBankBalance,
      inventory: [],
      clan: null,
      bounty: 0,
      rank: 'Newbie',
      experience: 0,
      level: 1,
      streak: 0,
      longestStreak: 0,
      totalAttendances: 0,
      lastDaily: null,
      lastWork: null,
      lastRob: null,
      lastBankInterest: null,
      totalEarned: 0,
      totalSpent: 0,
      totalTransfers: 0,
      totalRobberies: 0,
      successfulRobberies: 0,
      timesRobbed: 0,
      activeEffects: []
    });
    
    await sock.sendMessage(from, {
      text: `🔄 *ADMIN: User Reset* 🔄\n\n👤 *User:* @${targetUser.split('@')[0]}\n✅ *All user data has been reset to default values*\n👨‍💼 *Admin:* @${senderId.split('@')[0]}`,
      mentions: [targetUser, senderId]
    });
  } catch (error) {
    await reply('❌ *Error resetting user. Please try again.*');
    console.error('Reset user error:', error);
  }
}

// Handle economy statistics
async function handleEconomyStats(context) {
  const { reply } = context;
  
  try {
    const totalUsers = await db.collection(COLLECTIONS.USERS).countDocuments();
    const totalTransactions = await db.collection(COLLECTIONS.TRANSACTIONS).countDocuments();
    const totalClans = await db.collection(COLLECTIONS.CLANS).countDocuments();
    
    const wealthData = await db.collection(COLLECTIONS.USERS).aggregate([
      {
        $group: {
          _id: null,
          totalWealth: { $sum: { $add: ['$balance', '$bank'] } },
          totalWallet: { $sum: '$balance' },
          totalBank: { $sum: '$bank' },
          avgWealth: { $avg: { $add: ['$balance', '$bank'] } }
        }
      }
    ]).toArray();
    
    const wealth = wealthData.length > 0 ? wealthData[0] : {
      totalWealth: 0, totalWallet: 0, totalBank: 0, avgWealth: 0
    };
    
    const topUser = await db.collection(COLLECTIONS.USERS)
      .findOne({}, { sort: { balance: -1, bank: -1 } });
    
    const recentTransactions = await db.collection(COLLECTIONS.TRANSACTIONS)
      .countDocuments({ timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    
    const statsText = `📊 *ECONOMY STATISTICS* 📊\n\n` +
                     `👥 *Users:*\n` +
                     `• Total Users: ${totalUsers}\n` +
                     `• Total Transactions: ${totalTransactions}\n` +
                     `• Recent 24h Transactions: ${recentTransactions}\n\n` +
                     `💰 *Wealth Distribution:*\n` +
                     `• Total Wealth: ${ecoSettings.currency}${wealth.totalWealth.toLocaleString()}\n` +
                     `• Total in Wallets: ${ecoSettings.currency}${wealth.totalWallet.toLocaleString()}\n` +
                     `• Total in Banks: ${ecoSettings.currency}${wealth.totalBank.toLocaleString()}\n` +
                     `• Average Wealth: ${ecoSettings.currency}${Math.round(wealth.avgWealth).toLocaleString()}\n\n` +
                     `🏆 *Top User:*\n` +
                     `• @${topUser ? topUser.userId.split('@')[0] : 'None'}\n` +
                     `• Wealth: ${ecoSettings.currency}${topUser ? (topUser.balance + topUser.bank).toLocaleString() : '0'}\n\n` +
                     `🏰 *Clans:*\n` +
                     `• Total Clans: ${totalClans}\n\n` +
                     `⏰ *Server Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`;
    
    await reply(statsText);
  } catch (error) {
    await reply('❌ *Error loading statistics. Please try again.*');
    console.error('Stats error:', error);
  }
}

// Handle jobs admin
async function handleJobsAdmin(context, args) {
  const { reply } = context;
  
  try {
    if (!args || args.length === 0) {
      let jobsText = `💼 *WORK JOBS MANAGEMENT* 💼\n\n`;
      jobsText += `📋 *Current Jobs:*\n`;
      
      ecoSettings.workJobs.forEach((job, index) => {
        jobsText += `${index + 1}. *${job.name}*\n`;
        jobsText += `   💰 ${ecoSettings.currency}${job.min} - ${ecoSettings.currency}${job.max}\n`;
        jobsText += `   ⭐ Experience: ${job.experience || 0}\n\n`;
      });
      
      jobsText += `🔧 *Commands:*\n`;
      jobsText += `• *add [name] [min] [max] [exp]* - Add job\n`;
      jobsText += `• *remove [index]* - Remove job\n`;
      jobsText += `• *edit [index] [field] [value]* - Edit job\n\n`;
      jobsText += `💡 *Example:* ${context.config.PREFIX}ecoadmin jobs add "Doctor" 800 2000 15`;
      
      await reply(jobsText);
      return;
    }
    
    const subCmd = args[0].toLowerCase();
    
    switch (subCmd) {
      case 'add':
        if (args.length < 5) {
          await reply('⚠️ *Usage:* jobs add [name] [min] [max] [experience]');
          return;
        }
        
        const jobName = args[1].replace(/"/g, '');
        const minPay = parseInt(args[2]);
        const maxPay = parseInt(args[3]);
        const experience = parseInt(args[4]);
        
        if (isNaN(minPay) || isNaN(maxPay) || isNaN(experience)) {
          await reply('⚠️ *Min, max, and experience must be numbers*');
          return;
        }
        
        if (minPay >= maxPay) {
          await reply('⚠️ *Maximum pay must be greater than minimum pay*');
          return;
        }
        
        ecoSettings.workJobs.push({
          name: jobName,
          min: minPay,
          max: maxPay,
          experience: experience
        });
        
        await saveSettings();
        await reply(`✅ *Job added successfully!*\n\n💼 *Job:* ${jobName}\n💰 *Pay Range:* ${ecoSettings.currency}${minPay} - ${ecoSettings.currency}${maxPay}\n⭐ *Experience:* ${experience}`);
        break;
        
      case 'remove':
        if (args.length < 2) {
          await reply('⚠️ *Usage:* jobs remove [job_index]');
          return;
        }
        
        const removeIndex = parseInt(args[1]) - 1;
        if (isNaN(removeIndex) || removeIndex < 0 || removeIndex >= ecoSettings.workJobs.length) {
          await reply('⚠️ *Invalid job index*');
          return;
        }
        
        const removedJob = ecoSettings.workJobs.splice(removeIndex, 1)[0];
        await saveSettings();
        await reply(`✅ *Job removed:* ${removedJob.name}`);
        break;
        
      default:
        await reply(`❌ *Unknown jobs command:* ${subCmd}`);
    }
  } catch (error) {
    await reply('❌ *Error managing jobs. Please try again.*');
    console.error('Jobs admin error:', error);
  }
}

// Handle shop admin
async function handleShopAdmin(context, args) {
  const { reply } = context;
  
  try {
    if (!args || args.length === 0) {
      const shopItems = await db.collection(COLLECTIONS.SHOP_ITEMS).find({}).toArray();
      
      let shopText = `🛍️ *SHOP MANAGEMENT* 🛍️\n\n`;
      
      if (shopItems.length === 0) {
        shopText += `📦 *No items in shop*\n\n`;
      } else {
        shopText += `📦 *Current Items:*\n`;
        shopItems.forEach((item, index) => {
          shopText += `${index + 1}. *${item.name}*\n`;
          shopText += `   💰 ${ecoSettings.currency}${item.price.toLocaleString()}\n`;
          shopText += `   📝 ${item.description}\n`;
          shopText += `   🏷️ Type: ${item.type}\n\n`;
        });
      }
      
      shopText += `🔧 *Commands:*\n`;
      shopText += `• *add [name] [price] [type] [description]* - Add item\n`;
      shopText += `• *remove [index]* - Remove item\n`;
      shopText += `• *edit [index] [field] [value]* - Edit item\n`;
      shopText += `• *clear* - Clear all items\n\n`;
      shopText += `💡 *Types:* protection, multiplier, instant, clan\n`;
      shopText += `💡 *Example:* ${context.config.PREFIX}ecoadmin shop add "Lucky Charm" 5000 multiplier "Increases daily rewards by 50%"`;
      
      await reply(shopText);
      return;
    }
    
    const subCmd = args[0].toLowerCase();
    
    switch (subCmd) {
      case 'add':
        if (args.length < 5) {
          await reply('⚠️ *Usage:* shop add [name] [price] [type] [description]');
          return;
        }
        
        const itemName = args[1].replace(/"/g, '');
        const itemPrice = parseInt(args[2]);
        const itemType = args[3];
        const itemDescription = args.slice(4).join(' ').replace(/"/g, '');
        
        if (isNaN(itemPrice) || itemPrice <= 0) {
          await reply('⚠️ *Price must be a positive number*');
          return;
        }
        
        const validTypes = ['protection', 'multiplier', 'instant', 'clan'];
        if (!validTypes.includes(itemType)) {
          await reply(`⚠️ *Invalid type. Valid types: ${validTypes.join(', ')}*`);
          return;
        }
        
        const newItem = {
          id: `custom_${Date.now()}`,
          name: itemName,
          price: itemPrice,
          description: itemDescription,
          type: itemType,
          duration: itemType === 'instant' ? 0 : 7,
          createdBy: context.senderId,
          createdAt: new Date()
        };
        
        await db.collection(COLLECTIONS.SHOP_ITEMS).insertOne(newItem);
        await reply(`✅ *Shop item added successfully!*\n\n🛍️ *Item:* ${itemName}\n💰 *Price:* ${ecoSettings.currency}${itemPrice.toLocaleString()}\n🏷️ *Type:* ${itemType}`);
        break;
        
      case 'remove':
        if (args.length < 2) {
          await reply('⚠️ *Usage:* shop remove [item_index]');
          return;
        }
        
        const removeIndex = parseInt(args[1]) - 1;
        const allItems = await db.collection(COLLECTIONS.SHOP_ITEMS).find({}).toArray();
        
        if (isNaN(removeIndex) || removeIndex < 0 || removeIndex >= allItems.length) {
          await reply('⚠️ *Invalid item index*');
          return;
        }
        
        const itemToRemove = allItems[removeIndex];
        await db.collection(COLLECTIONS.SHOP_ITEMS).deleteOne({ id: itemToRemove.id });
        await reply(`✅ *Removed shop item:* ${itemToRemove.name}`);
        break;
        
      case 'clear':
        await db.collection(COLLECTIONS.SHOP_ITEMS).deleteMany({});
        await reply('✅ *All shop items cleared*');
        break;
        
      default:
        await reply(`❌ *Unknown shop command:* ${subCmd}`);
    }
  } catch (error) {
    await reply('❌ *Error managing shop. Please try again.*');
    console.error('Shop admin error:', error);
  }
}

// Handle balance command
async function handleBalance(context, args) {
  const { reply, senderId, m } = context;
  
  try {
    const targetUser = (args && args.length > 0) ? getTargetUser(m, args.join(' ')) : senderId;
    
    if (targetUser && targetUser !== senderId) {
      await initUser(targetUser);
      const targetData = await getUserData(targetUser);
      const targetNumber = targetUser.split('@')[0];
      
      await reply(`💰 *@${targetNumber}'s Balance*\n\n` +
                 `💵 *Wallet:* ${ecoSettings.currency}${targetData.balance.toLocaleString()}\n` +
                 `🏦 *Bank:* ${ecoSettings.currency}${targetData.bank.toLocaleString()}\n` +
                 `💎 *Total Wealth:* ${ecoSettings.currency}${(targetData.balance + targetData.bank).toLocaleString()}\n` +
                 `🏅 *Rank:* ${targetData.rank}\n` +
                 `⭐ *Level:* ${targetData.level}`);
    } else {
      const userData = await getUserData(senderId);
      
      // Calculate interest if enabled
      if (ecoSettings.bankInterestEnabled && userData.bank > 0) {
        await calculateBankInterest(senderId);
        const updatedData = await getUserData(senderId);
        
        await reply(`💰 *YOUR BALANCE* 💰\n\n` +
                   `💵 *Wallet:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n` +
                   `🏦 *Bank:* ${ecoSettings.currency}${updatedData.bank.toLocaleString()}\n` +
                   `💎 *Total Wealth:* ${ecoSettings.currency}${(updatedData.balance + updatedData.bank).toLocaleString()}\n` +
                   `🏅 *Rank:* ${updatedData.rank}\n` +
                   `⭐ *Level:* ${updatedData.level}\n\n` +
                   `💡 *Use ${context.config.PREFIX}profile for detailed stats*`);
      } else {
        await reply(`💰 *YOUR BALANCE* 💰\n\n` +
                   `💵 *Wallet:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n` +
                   `🏦 *Bank:* ${ecoSettings.currency}${userData.bank.toLocaleString()}\n` +
                   `💎 *Total Wealth:* ${ecoSettings.currency}${(userData.balance + userData.bank).toLocaleString()}\n` +
                   `🏅 *Rank:* ${userData.rank}\n` +
                   `⭐ *Level:* ${userData.level}\n\n` +
                   `💡 *Use ${context.config.PREFIX}profile for detailed stats*`);
      }
    }
  } catch (error) {
    await reply('❌ *Error retrieving balance. Please try again.*');
    console.error('Balance error:', error);
  }
}

// Calculate bank interest
async function calculateBankInterest(userId) {
  try {
    if (!ecoSettings.bankInterestEnabled) return;
    
    const userData = await getUserData(userId);
    const now = new Date();
    const lastInterest = userData.lastBankInterest ? new Date(userData.lastBankInterest) : new Date(userData.createdAt);
    
    const daysSinceLastInterest = Math.floor((now - lastInterest) / (24 * 60 * 60 * 1000));
    
    if (daysSinceLastInterest >= 1 && userData.bank > 0) {
      const interest = Math.floor(userData.bank * ecoSettings.bankInterestRate * daysSinceLastInterest);
      
      if (interest > 0) {
        await updateUserData(userId, {
          bank: userData.bank + interest,
          lastBankInterest: now
        });
        
        // Log transaction
        await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({
          userId,
          type: 'credit',
          amount: interest,
          reason: `Bank interest (${daysSinceLastInterest} days)`,
          balanceBefore: userData.bank,
          balanceAfter: userData.bank + interest,
          timestamp: now
        });
        
        return interest;
      }
    }
    
    return 0;
  } catch (error) {
    console.error('Error calculating bank interest:', error);
    return 0;
  }
}

// Handle send money command
async function handleSend(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!args || args.length < 2) {
      await reply(`⚠️ *Usage:*\n• Reply to someone: *${context.config.PREFIX}send amount*\n• Mention someone: *${context.config.PREFIX}send @user amount*\n• Use number: *${context.config.PREFIX}send 1234567890 amount*\n\n💡 *Example: ${context.config.PREFIX}send @user 1000*`);
      return;
    }
    
    const targetUser = getTargetUser(m, args[0]);
    let amount = parseInt(args[args.length - 1]);
    
    if (isNaN(amount)) {
      for (const arg of args) {
        const potentialAmount = parseInt(arg);
        if (!isNaN(potentialAmount) && potentialAmount > 0) {
          amount = potentialAmount;
          break;
        }
      }
    }
    
    if (!targetUser) {
      await reply('⚠️ *Please specify a valid recipient*');
      return;
    }
    
    if (isNaN(amount) || amount < ecoSettings.transferMinAmount) {
      await reply(`⚠️ *Amount must be at least ${ecoSettings.currency}${ecoSettings.transferMinAmount}*`);
      return;
    }
    
    if (amount > ecoSettings.transferMaxAmount) {
      await reply(`⚠️ *Amount cannot exceed ${ecoSettings.currency}${ecoSettings.transferMaxAmount.toLocaleString()}*`);
      return;
    }
    
    if (targetUser === senderId) {
      await reply('🧠 *You cannot send money to yourself!*');
      return;
    }
    
    const senderData = await getUserData(senderId);
    
    // Calculate tax if enabled
    let tax = 0;
    let totalCost = amount;
    if (ecoSettings.transferTaxEnabled) {
      tax = Math.floor(amount * ecoSettings.transferTaxPercent);
      totalCost = amount + tax;
    }
    
    if (senderData.balance < totalCost) {
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${ecoSettings.currency}${senderData.balance.toLocaleString()}\n💸 *Required:* ${ecoSettings.currency}${totalCost.toLocaleString()}${tax > 0 ? `\n🏛️ *Tax:* ${ecoSettings.currency}${tax.toLocaleString()}` : ''}`);
      return;
    }
    
    // Process transaction
    await initUser(targetUser);
    await removeMoney(senderId, totalCost, 'Transfer sent');
    await addMoney(targetUser, amount, 'Transfer received');
    
    // Update transfer statistics
    await updateUserData(senderId, {
      totalTransfers: (senderData.totalTransfers || 0) + 1
    });
    
    const updatedSender = await getUserData(senderId);
    const updatedTarget = await getUserData(targetUser);
    
    let transferText = `✅ *TRANSFER SUCCESSFUL* ✅\n\n💸 *@${senderId.split('@')[0]}* sent *${ecoSettings.currency}${amount.toLocaleString()}* to *@${targetUser.split('@')[0]}*\n\n💵 *Sender's new balance:* ${ecoSettings.currency}${updatedSender.balance.toLocaleString()}\n💰 *Receiver's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}`;
    
    if (tax > 0) {
      transferText += `\n🏛️ *Transfer tax:* ${ecoSettings.currency}${tax.toLocaleString()}`;
    }
    
    await sock.sendMessage(from, {
      text: transferText,
      mentions: [senderId, targetUser]
    });
  } catch (error) {
    await reply('❌ *Error processing transfer. Please try again.*');
    console.error('Send error:', error);
  }
}

// Handle deposit command
async function handleDeposit(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!args || args.length === 0) {
      await reply(`⚠️ *Usage:* ${context.config.PREFIX}deposit [amount]\n\n💡 *Limits:*\n• Minimum: ${ecoSettings.currency}${ecoSettings.bankMinDeposit}\n• Maximum: ${ecoSettings.currency}${ecoSettings.bankMaxDeposit.toLocaleString()}`);
      return;
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < ecoSettings.bankMinDeposit) {
      await reply(`⚠️ *Minimum deposit: ${ecoSettings.currency}${ecoSettings.bankMinDeposit}*`);
      return;
    }
    
    if (amount > ecoSettings.bankMaxDeposit) {
      await reply(`⚠️ *Maximum deposit: ${ecoSettings.currency}${ecoSettings.bankMaxDeposit.toLocaleString()}*`);
      return;
    }
    
    const userData = await getUserData(senderId);
    if (userData.balance < amount) {
      await reply('🚫 *Insufficient wallet balance*');
      return;
    }
    
    await updateUserData(senderId, {
      balance: userData.balance - amount,
      bank: userData.bank + amount
    });
    
    const updatedData = await getUserData(senderId);
    let depositText = `🏦 *Successfully deposited ${ecoSettings.currency}${amount.toLocaleString()} to your bank*\n\n💵 *New Wallet Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🏦 *New Bank Balance:* ${ecoSettings.currency}${updatedData.bank.toLocaleString()}`;
    
    if (ecoSettings.bankInterestEnabled) {
      depositText += `\n\n💡 *Your bank earns ${(ecoSettings.bankInterestRate * 100).toFixed(1)}% daily interest!*`;
    }
    
    await reply(depositText);
  } catch (error) {
    await reply('❌ *Error processing deposit. Please try again.*');
    console.error('Deposit error:', error);
  }
}

// Handle withdraw command
async function handleWithdraw(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!args || args.length === 0) {
      await reply(`⚠️ *Usage:* ${context.config.PREFIX}withdraw [amount]\n\n💡 *Limits:*\n• Minimum: ${ecoSettings.currency}${ecoSettings.bankMinWithdraw}\n• Maximum: ${ecoSettings.currency}${ecoSettings.bankMaxWithdraw.toLocaleString()}`);
      return;
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < ecoSettings.bankMinWithdraw) {
      await reply(`⚠️ *Minimum withdrawal: ${ecoSettings.currency}${ecoSettings.bankMinWithdraw}*`);
      return;
    }
    
    if (amount > ecoSettings.bankMaxWithdraw) {
      await reply(`⚠️ *Maximum withdrawal: ${ecoSettings.currency}${ecoSettings.bankMaxWithdraw.toLocaleString()}*`);
      return;
    }
    
    const userData = await getUserData(senderId);
    if (userData.bank < amount) {
      await reply('🚫 *Insufficient bank balance*');
      return;
    }
    
    // Calculate any accrued interest before withdrawal
    if (ecoSettings.bankInterestEnabled) {
      await calculateBankInterest(senderId);
    }
    
    const updatedUserData = await getUserData(senderId);
    
    await updateUserData(senderId, {
      balance: updatedUserData.balance + amount,
      bank: updatedUserData.bank - amount
    });
    
    const finalData = await getUserData(senderId);
    await reply(`💵 *Successfully withdrew ${ecoSettings.currency}${amount.toLocaleString()} from your bank*\n\n💵 *New Wallet Balance:* ${ecoSettings.currency}${finalData.balance.toLocaleString()}\n🏦 *New Bank Balance:* ${ecoSettings.currency}${finalData.bank.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing withdrawal. Please try again.*');
    console.error('Withdraw error:', error);
  }
}

// Handle work command
async function handleWork(context) {
  const { reply, senderId } = context;
  const now = new Date();
  
  try {
    const userData = await getUserData(senderId);
    if (userData.lastWork && now - new Date(userData.lastWork) < ecoSettings.workCooldownMinutes * 60 * 1000) {
      const remaining = Math.ceil((ecoSettings.workCooldownMinutes * 60 * 1000 - (now - new Date(userData.lastWork))) / 60000);
      await reply(`⏱️ *You're tired! Rest for ${remaining} minutes before working again.*`);
      return;
    }
    
    const randomJob = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
    let earnings = Math.floor(Math.random() * (randomJob.max - randomJob.min + 1)) + randomJob.min;
    
    // Apply rank bonus if enabled
    if (ecoSettings.rankingEnabled) {
      const currentRank = ecoSettings.ranks.find(rank => rank.name === userData.rank);
      if (currentRank && currentRank.benefits.workBonus > 0) {
        const bonus = Math.floor(earnings * currentRank.benefits.workBonus);
        earnings += bonus;
      }
    }
    
    // Apply active multipliers
    const activeMultiplier = userData.activeEffects?.find(effect => 
      effect.type === 'work_multiplier' && new Date(effect.expires) > now
    );
    
    if (activeMultiplier) {
      earnings *= activeMultiplier.multiplier;
    }
    
    // Add experience if enabled
    let expGained = 0;
    if (ecoSettings.experienceEnabled) {
      expGained = randomJob.experience || 0;
      const newExperience = (userData.experience || 0) + expGained;
      const newLevel = Math.floor(newExperience / 100) + 1;
      
      await updateUserData(senderId, {
        experience: newExperience,
        level: newLevel
      });
    }
    
    await updateUserData(senderId, {
      balance: userData.balance + earnings,
      lastWork: now
    });
    
    // Update rank
    await updateUserRank(senderId);
    
    const updatedData = await getUserData(senderId);
    let workText = `💼 *Work Complete!*\n\n🔨 *Job:* ${randomJob.name}\n💰 *Earned:* ${ecoSettings.currency}${earnings.toLocaleString()}\n💵 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}`;
    
    if (expGained > 0) {
      workText += `\n⭐ *Experience:* +${expGained} (Level ${updatedData.level})`;
    }
    
    workText += `\n\n⏱️ *Next work available in ${ecoSettings.workCooldownMinutes} minutes*`;
    
    await reply(workText);
  } catch (error) {
    await reply('❌ *Error processing work. Please try again.*');
    console.error('Work error:', error);
  }
}

// Handle rob command
async function handleRob(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!args || args.length === 0) {
      await reply(`⚠️ *Usage:*\n• Reply to someone: *${context.config.PREFIX}rob*\n• Mention someone: *${context.config.PREFIX}rob @user*\n• Use number: *${context.config.PREFIX}rob 1234567890*\n\n💡 *Example: ${context.config.PREFIX}rob @username*`);
      return;
    }
    
    const targetUser = getTargetUser(m, args[0]);
    if (!targetUser) {
      await reply('⚠️ *Please specify a valid target*');
      return;
    }
    
    if (targetUser === senderId) {
      await reply('🧠 *You cannot rob yourself!*');
      return;
    }
    
    const now = new Date();
    const robberData = await getUserData(senderId);
    
    // Check cooldown
    if (robberData.lastRob && now - new Date(robberData.lastRob) < ecoSettings.robCooldownMinutes * 60 * 1000) {
      const remaining = Math.ceil((ecoSettings.robCooldownMinutes * 60 * 1000 - (now - new Date(robberData.lastRob))) / 60000);
      await reply(`⏱️ *You're on cooldown. Try again in ${remaining} minutes.*`);
      return;
    }
    
    await initUser(targetUser);
    const targetData = await getUserData(targetUser);
    
    // Validation checks
    if (targetData.balance < ecoSettings.robMinTargetBalance) {
      await reply(`👀 *Target is too broke to rob*\n\n💸 *@${targetUser.split('@')[0]}* only has ${ecoSettings.currency}${targetData.balance.toLocaleString()}\n🚫 *Minimum required: ${ecoSettings.currency}${ecoSettings.robMinTargetBalance}*`);
      return;
    }
    
    if (robberData.balance < ecoSettings.robMinRobberBalance) {
      await reply(`💸 *Your balance is too low to attempt a robbery*\n\n💰 *Your balance:* ${ecoSettings.currency}${robberData.balance.toLocaleString()}\n⚠️ *You need at least ${ecoSettings.currency}${ecoSettings.robMinRobberBalance} to cover potential penalties*`);
      return;
    }
    
    // Check target's protection items
    let targetProtection = 0;
    if (targetData.activeEffects) {
      const protectionEffect = targetData.activeEffects.find(effect => 
        effect.type === 'protection' && new Date(effect.expires) > now
      );
      if (protectionEffect) {
        targetProtection = protectionEffect.protection || 0;
      }
    }
    
    // Adjust success rate based on protection
    let adjustedSuccessRate = ecoSettings.robSuccessRate - targetProtection;
    adjustedSuccessRate = Math.max(0.1, Math.min(0.9, adjustedSuccessRate)); // Keep between 10-90%
    
    // Process robbery attempt
    const success = Math.random() < adjustedSuccessRate;
    const policeInvolved = Math.random() < ecoSettings.robPoliceChance;
    
    await updateUserData(senderId, { 
      lastRob: now,
      totalRobberies: (robberData.totalRobberies || 0) + 1
    });
    
    if (success) {
      const maxSteal = Math.floor(targetData.balance * ecoSettings.robMaxStealPercent);
      const stolen = Math.floor(Math.random() * maxSteal) + ecoSettings.robMinSteal;
      
      await updateUserData(targetUser, { 
        balance: targetData.balance - stolen,
        timesRobbed: (targetData.timesRobbed || 0) + 1
      });
      await updateUserData(senderId, { 
        balance: robberData.balance + stolen,
        successfulRobberies: (robberData.successfulRobberies || 0) + 1
      });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      await sock.sendMessage(from, {
        text: `🦹‍♂️ *ROBBERY SUCCESS!* 🦹‍♂️\n\n💰 *@${senderId.split('@')[0]}* successfully robbed *${ecoSettings.currency}${stolen.toLocaleString()}* from *@${targetUser.split('@')[0]}*\n\n🤑 *Robber's new balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😭 *Victim's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
        mentions: [senderId, targetUser]
      });
    } else {
      let penalty = ecoSettings.robFailPenalty;
      if (policeInvolved) {
        penalty *= ecoSettings.robPoliceMultiplier;
      }
      
      await updateUserData(senderId, { balance: robberData.balance - penalty });
      await updateUserData(targetUser, { balance: targetData.balance + penalty });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      const failText = policeInvolved 
        ? `🚨 *ROBBERY FAILED - POLICE INVOLVED!* 🚨\n\n❌ *@${senderId.split('@')[0]}* got caught by police trying to rob *@${targetUser.split('@')[0]}*\n\n💸 *Police Fine:* ${ecoSettings.currency}${penalty.toLocaleString()}\n😔 *Robber's new balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😊 *Victim's compensation:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}`
        : `🚨 *ROBBERY FAILED!* 🚨\n\n❌ *@${senderId.split('@')[0]}* got caught trying to rob *@${targetUser.split('@')[0]}*\n\n💸 *Penalty paid:* ${ecoSettings.currency}${penalty.toLocaleString()}\n😔 *Robber's new balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😊 *Victim's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}`;
      
      await sock.sendMessage(from, {
        text: failText + `\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
        mentions: [senderId, targetUser]
      });
    }
  } catch (error) {
    await reply('❌ *Error processing robbery. Please try again.*');
    console.error('Rob error:', error);
  }
}

// Handle daily command
async function handleDaily(context) {
  const { reply, senderId } = context;
  
  try {
    const currentDate = getCurrentDate();
    const userData = await getUserData(senderId);
    
    if (userData.lastDaily === currentDate) {
      await reply('⏰ *You have already claimed your daily reward today! Come back tomorrow.*');
      return;
    }
    
    let dailyAmount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
    
    // Calculate streak
    const yesterday = getNigeriaTime().subtract(1, 'day').format('DD-MM-YYYY');
    let newStreak = 1;
    
    if (userData.lastDaily === yesterday) {
      newStreak = (userData.streak || 0) + 1;
    }
    
    // Apply streak bonus if enabled
    let streakBonus = 0;
    if (ecoSettings.dailyStreakBonus && newStreak > 1) {
      const bonusDays = Math.min(newStreak - 1, ecoSettings.dailyMaxStreakBonus);
      streakBonus = Math.floor(dailyAmount * ecoSettings.dailyStreakBonusPercent * bonusDays);
      dailyAmount += streakBonus;
    }
    
    // Apply rank bonus if enabled
    let rankBonus = 0;
    if (ecoSettings.rankingEnabled) {
      const currentRank = ecoSettings.ranks.find(rank => rank.name === userData.rank);
      if (currentRank && currentRank.benefits.dailyBonus > 0) {
        rankBonus = currentRank.benefits.dailyBonus;
        dailyAmount += rankBonus;
      }
    }
    
    // Apply active multipliers
    const activeMultiplier = userData.activeEffects?.find(effect => 
      effect.type === 'daily_multiplier' && new Date(effect.expires) > new Date()
    );
    
    if (activeMultiplier) {
      dailyAmount *= activeMultiplier.multiplier;
    }
    
    const newLongestStreak = Math.max(userData.longestStreak || 0, newStreak);
    
    await updateUserData(senderId, {
      balance: userData.balance + dailyAmount,
      lastDaily: currentDate,
      streak: newStreak,
      longestStreak: newLongestStreak,
      totalAttendances: (userData.totalAttendances || 0) + 1
    });
    
    // Update rank
    await updateUserRank(senderId);
    
    const updatedData = await getUserData(senderId);
    
    let dailyText = `🎁 *Daily Reward Claimed!*\n\n💰 *Base Reward:* ${ecoSettings.currency}${(dailyAmount - streakBonus - rankBonus).toLocaleString()}\n`;
    
    if (streakBonus > 0) {
      dailyText += `🔥 *Streak Bonus:* ${ecoSettings.currency}${streakBonus.toLocaleString()}\n`;
    }
    
    if (rankBonus > 0) {
      dailyText += `🏅 *Rank Bonus:* ${ecoSettings.currency}${rankBonus.toLocaleString()}\n`;
    }
    
    dailyText += `💵 *Total Received:* ${ecoSettings.currency}${dailyAmount.toLocaleString()}\n💎 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🔥 *Current Streak:* ${newStreak} days\n\n✨ *Come back tomorrow for another reward!*\n⏰ *Nigeria Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`;
    
    await reply(dailyText);
  } catch (error) {
    await reply('❌ *Error claiming daily reward. Please try again.*');
    console.error('Daily error:', error);
  }
}

// Handle profile command
async function handleProfile(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    const targetUser = (args && args.length > 0) ? getTargetUser(m, args.join(' ')) : senderId;
    
    await initUser(targetUser);
    const profileData = await getUserData(targetUser);
    const profileWealth = profileData.balance + profileData.bank;
    const today = getCurrentDate();
    
    // Calculate success rates
    const robSuccessRate = profileData.totalRobberies > 0 
      ? Math.round((profileData.successfulRobberies / profileData.totalRobberies) * 100) 
      : 0;
    
    await sock.sendMessage(from, {
      text: `👤 *USER PROFILE* 👤\n\n📱 *User:* @${targetUser.split('@')[0]}\n🏅 *Rank:* ${profileData.rank}\n⭐ *Level:* ${profileData.level}\n🎯 *Experience:* ${profileData.experience || 0}\n💰 *Total Wealth:* ${ecoSettings.currency}${profileWealth.toLocaleString()}\n💵 *Wallet:* ${ecoSettings.currency}${profileData.balance.toLocaleString()}\n🏦 *Bank:* ${ecoSettings.currency}${profileData.bank.toLocaleString()}\n🎯 *Bounty:* ${ecoSettings.currency}${profileData.bounty.toLocaleString()}\n🛡️ *Clan:* ${profileData.clan || 'None'}\n\n📊 *STATISTICS*\n💼 *Total Earned:* ${ecoSettings.currency}${(profileData.totalEarned || 0).toLocaleString()}\n💸 *Total Spent:* ${ecoSettings.currency}${(profileData.totalSpent || 0).toLocaleString()}\n🔄 *Total Transfers:* ${profileData.totalTransfers || 0}\n🦹 *Robberies Attempted:* ${profileData.totalRobberies || 0}\n✅ *Successful Robberies:* ${profileData.successfulRobberies || 0}\n📈 *Success Rate:* ${robSuccessRate}%\n😢 *Times Robbed:* ${profileData.timesRobbed || 0}\n\n📊 *ATTENDANCE RECORD*\n📅 *Last Attendance:* ${profileData.lastAttendance || 'Never'}\n✅ *Today's Status:* ${profileData.lastAttendance === today ? 'Marked ✅' : 'Not marked ❌'}\n📋 *Total Attendances:* ${profileData.totalAttendances}\n🔥 *Current Streak:* ${profileData.streak} days\n🏆 *Longest Streak:* ${profileData.longestStreak} days\n\n⏰ *Current Nigeria Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`,
      mentions: [targetUser]
    });
  } catch (error) {
    await reply('❌ *Error loading profile. Please try again.*');
    console.error('Profile error:', error);
  }
}

// Handle leaderboard command
async function handleLeaderboard(context) {
  const { reply, sock, from } = context;
  
  try {
    const users = await db.collection(COLLECTIONS.USERS)
      .find({})
      .sort([['balance', -1], ['bank', -1]])
      .limit(10)
      .toArray();
    
    const leaderboard = users.map(user => ({
      id: user.userId,
      wealth: user.balance + user.bank,
      attendances: user.totalAttendances || 0,
      streak: user.streak || 0,
      level: user.level || 1,
      rank: user.rank || 'Newbie'
    }));
    
    let lb = '🏆 *ECONOMY LEADERBOARD* 🏆\n\n';
    leaderboard.forEach((userEntry, index) => {
      const rank = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      lb += `${rank} @${userEntry.id.split('@')[0]}\n`;
      lb += `   💰 ${ecoSettings.currency}${userEntry.wealth.toLocaleString()} | 🏅 ${userEntry.rank} | ⭐ L${userEntry.level}\n`;
      lb += `   📋 ${userEntry.attendances} | 🔥 ${userEntry.streak}\n\n`;
    });
    
    lb += `📊 *Legend:* 💰 Wealth | 🏅 Rank | ⭐ Level | 📋 Attendances | 🔥 Streak`;
    
    await sock.sendMessage(from, {
      text: lb,
      mentions: leaderboard.map(u => u.id)
    });
  } catch (error) {
    await reply('❌ *Error loading leaderboard. Please try again.*');
    console.error('Leaderboard error:', error);
  }
}

// Handle clan command
async function handleClan(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!args || args.length === 0) {
      await reply(`🛡️ *Clan Commands:*\n\n• *${context.config.PREFIX}clan create [name]* - Create a clan (${ecoSettings.currency}${ecoSettings.clanCreationCost.toLocaleString()})\n• *${context.config.PREFIX}clan join [name]* - Join a clan\n• *${context.config.PREFIX}clan leave* - Leave your clan\n• *${context.config.PREFIX}clan disband* - Disband your clan (leader only)\n• *${context.config.PREFIX}clan info* - View clan information\n• *${context.config.PREFIX}clan list* - View all clans\n• *${context.config.PREFIX}clan members* - View clan members\n• *${context.config.PREFIX}clan bank* - Clan banking\n• *${context.config.PREFIX}clan rename [name]* - Rename clan (${ecoSettings.currency}${ecoSettings.clanRenameCost.toLocaleString()})`);
      return;
    }
    
    const subcmd = args[0].toLowerCase();
    const clanName = args.slice(1).join(' ');
    const userData = await getUserData(senderId);
    
    switch (subcmd) {
      case 'create':
        if (!clanName) {
          await reply('⚠️ *Please provide a clan name*');
          return;
        }
        if (userData.clan) {
          await reply('🚫 *You are already in a clan*');
          return;
        }
        
        const existingClan = await db.collection(COLLECTIONS.CLANS).findOne({ name: clanName });
        if (existingClan) {
          await reply('⚠️ *Clan name already exists*');
          return;
        }
        
        if (userData.balance < ecoSettings.clanCreationCost) {
          await reply(`💸 *You need ${ecoSettings.currency}${ecoSettings.clanCreationCost.toLocaleString()} to create a clan*`);
          return;
        }
        
        await db.collection(COLLECTIONS.CLANS).insertOne({
          name: clanName,
          leader: senderId,
          members: [senderId],
          level: 1,
          bank: 0,
          experience: 0,
          created: new Date(),
          settings: {
            taxEnabled: false,
            taxPercent: 0.1,
            bankEnabled: true
          }
        });
        
        await updateUserData(senderId, {
          clan: clanName,
          balance: userData.balance - ecoSettings.clanCreationCost
        });
        
        await reply(`✅ *Clan "${clanName}" created successfully!*\n\n👑 *You are now the clan leader*\n💰 *${ecoSettings.currency}${ecoSettings.clanCreationCost.toLocaleString()} deducted as creation fee*\n👥 *Max Members:* ${ecoSettings.clanMaxMembers}`);
        break;
        
      case 'join':
        if (!clanName) {
          await reply('⚠️ *Please specify a clan name*');
          return;
        }
        
        const clanToJoin = await db.collection(COLLECTIONS.CLANS).findOne({ name: clanName });
        if (!clanToJoin) {
          await reply('❌ *Clan not found*');
          return;
        }
        if (userData.clan) {
          await reply('🚫 *You are already in a clan*');
          return;
        }
        if (clanToJoin.members.length >= ecoSettings.clanMaxMembers) {
          await reply('🚫 *Clan is full*');
          return;
        }
        
        await db.collection(COLLECTIONS.CLANS).updateOne(
          { name: clanName },
          { $push: { members: senderId } }
        );
        await updateUserData(senderId, { clan: clanName });
        
        await reply(`✅ *You have joined clan "${clanName}"!*\n\n👥 *Members:* ${clanToJoin.members.length + 1}/${ecoSettings.clanMaxMembers}`);
        break;
        
      case 'leave':
        if (!userData.clan) {
          await reply('⚠️ *You are not in any clan*');
          return;
        }
        
        const currentClan = await db.collection(COLLECTIONS.CLANS).findOne({ name: userData.clan });
        if (!currentClan) {
          await reply('⚠️ *Your clan no longer exists*');
          return;
        }
        
        if (currentClan.leader === senderId) {
          await reply('🚫 *Clan leaders cannot leave. Use clan disband instead*');
          return;
        }
        
        await db.collection(COLLECTIONS.CLANS).updateOne(
          { name: userData.clan },
          { $pull: { members: senderId } }
        );
        await updateUserData(senderId, { clan: null });
        
        await reply(`✅ *You have left clan "${userData.clan}"*`);
        break;
        
      case 'disband':
        if (!userData.clan) {
          await reply('❌ *You are not in any clan*');
          return;
        }
        
        const clanToDisband = await db.collection(COLLECTIONS.CLANS).findOne({ name: userData.clan });
        if (!clanToDisband) {
          await reply('❌ *Your clan no longer exists*');
          return;
        }
        
        if (clanToDisband.leader !== senderId) {
          await reply('🚫 *Only the clan leader can disband the clan*');
          return;
        }
        
        // Remove clan from all members
        await db.collection(COLLECTIONS.USERS).updateMany(
          { clan: userData.clan },
          { $set: { clan: null } }
        );
        
        // Delete the clan
        await db.collection(COLLECTIONS.CLANS).deleteOne({ name: userData.clan });
        
        await reply(`💥 *Clan "${userData.clan}" has been disbanded*`);
        break;
        
      case 'info':
        if (!userData.clan) {
          await reply('⚠️ *You are not in any clan*');
          return;
        }
        
        const clan = await db.collection(COLLECTIONS.CLANS).findOne({ name: userData.clan });
        if (!clan) {
          await reply('❌ *Your clan no longer exists*');
          return;
        }
        
        await sock.sendMessage(from, {
          text: `🏰 *Clan Information*\n\n🛡️ *Name:* ${clan.name}\n👑 *Leader:* @${clan.leader.split('@')[0]}\n👥 *Members:* ${clan.members.length}/${ecoSettings.clanMaxMembers}\n🏅 *Level:* ${clan.level}\n💰 *Clan Bank:* ${ecoSettings.currency}${clan.bank.toLocaleString()}\n⭐ *Experience:* ${clan.experience || 0}\n📅 *Created:* ${moment(clan.created).tz('Africa/Lagos').format('DD/MM/YYYY')}\n\n⚙️ *Settings:*\n🏛️ *Tax:* ${clan.settings?.taxEnabled ? `${(clan.settings.taxPercent * 100)}%` : 'Disabled'}\n🏦 *Bank:* ${clan.settings?.bankEnabled ? 'Enabled' : 'Disabled'}`,
          mentions: [clan.leader]
        });
        break;
        
      case 'members':
        if (!userData.clan) {
          await reply('⚠️ *You are not in any clan*');
          return;
        }
        
        const clanData = await db.collection(COLLECTIONS.CLANS).findOne({ name: userData.clan });
        if (!clanData) {
          await reply('❌ *Your clan no longer exists*');
          return;
        }
        
        let membersList = `👥 *${clanData.name} MEMBERS* 👥\n\n👑 *Leader:* @${clanData.leader.split('@')[0]}\n\n👤 *Members:*\n`;
        
        clanData.members.forEach((member, index) => {
          if (member !== clanData.leader) {
            membersList += `${index}. @${member.split('@')[0]}\n`;
          }
        });
        
        membersList += `\n📊 *Total: ${clanData.members.length}/${ecoSettings.clanMaxMembers} members*`;
        
        await sock.sendMessage(from, {
          text: membersList,
          mentions: clanData.members
        });
        break;
        
      case 'rename':
        if (!userData.clan) {
          await reply('⚠️ *You are not in any clan*');
          return;
        }
        
        if (!clanName) {
          await reply(`⚠️ *Usage:* ${context.config.PREFIX}clan rename [new_name]\n\n💰 *Cost:* ${ecoSettings.currency}${ecoSettings.clanRenameCost.toLocaleString()}`);
          return;
        }
        
        const oldClan = await db.collection(COLLECTIONS.CLANS).findOne({ name: userData.clan });
        if (!oldClan) {
          await reply('❌ *Your clan no longer exists*');
          return;
        }
        
        if (oldClan.leader !== senderId) {
          await reply('🚫 *Only the clan leader can rename the clan*');
          return;
        }
        
        if (!ecoSettings.clanRenameEnabled) {
          await reply('🚫 *Clan renaming is currently disabled*');
          return;
        }
        
        if (userData.balance < ecoSettings.clanRenameCost) {
          await reply(`💸 *You need ${ecoSettings.currency}${ecoSettings.clanRenameCost.toLocaleString()} to rename your clan*`);
          return;
        }
        
        const nameExists = await db.collection(COLLECTIONS.CLANS).findOne({ name: clanName });
        if (nameExists) {
          await reply('⚠️ *Clan name already exists*');
          return;
        }
        
        // Update clan name
        await db.collection(COLLECTIONS.CLANS).updateOne(
          { name: userData.clan },
          { $set: { name: clanName } }
        );
        
        // Update all members' clan field
        await db.collection(COLLECTIONS.USERS).updateMany(
          { clan: userData.clan },
          { $set: { clan: clanName } }
        );
        
        // Deduct cost
        await updateUserData(senderId, {
          balance: userData.balance - ecoSettings.clanRenameCost
        });
        
        await reply(`✅ *Clan renamed successfully!*\n\n🏰 *Old Name:* ${userData.clan}\n✨ *New Name:* ${clanName}\n💰 *Cost:* ${ecoSettings.currency}${ecoSettings.clanRenameCost.toLocaleString()}`);
        break;
        
      case 'list':
        const allClans = await db.collection(COLLECTIONS.CLANS).find({}).sort({ level: -1, bank: -1 }).toArray();
        
        if (allClans.length === 0) {
          await reply('📜 *No clans exist yet*');
          return;
        }
        
        let clanList = '🏰 *ALL CLANS* 🏰\n\n';
        allClans.forEach((clanEntry, index) => {
          clanList += `${index + 1}. *${clanEntry.name}*\n`;
          clanList += `   👑 ${clanEntry.leader.split('@')[0]} | 👥 ${clanEntry.members.length}/${ecoSettings.clanMaxMembers}\n`;
          clanList += `   🏅 Level ${clanEntry.level} | 💰 ${ecoSettings.currency}${clanEntry.bank.toLocaleString()}\n\n`;
        });
        
        await reply(clanList);
        break;
        
      default:
        await reply('⚠️ *Unknown clan command. Use clan for help*');
    }
  } catch (error) {
    await reply('❌ *Error processing clan command. Please try again.*');
    console.error('Clan error:', error);
  }
}

// Handle shop command
async function handleShop(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!args || args.length === 0) {
      const shopItems = await db.collection(COLLECTIONS.SHOP_ITEMS).find({}).toArray();
      
      if (shopItems.length === 0) {
        await reply(`🛍️ *ECONOMY SHOP* 🛍️\n\n📦 *Shop is empty*\n\n🔧 *Admins can add items using the admin panel*`);
        return;
      }
      
      let shopText = `🛍️ *ECONOMY SHOP* 🛍️\n\n`;
      shopItems.forEach((item, index) => {
        shopText += `${index + 1}. *${item.name}*\n`;
        shopText += `   💰 ${ecoSettings.currency}${item.price.toLocaleString()}\n`;
        shopText += `   📝 ${item.description}\n`;
        shopText += `   ⏱️ Duration: ${item.duration === 0 ? 'Instant' : `${item.duration} days`}\n\n`;
      });
      
      shopText += `💡 *Usage:* ${context.config.PREFIX}shop buy [item_number]\n💳 *Example:* ${context.config.PREFIX}shop buy 1`;
      
      await reply(shopText);
      return;
    }
    
    const subCmd = args[0].toLowerCase();
    
    if (subCmd === 'buy') {
      if (args.length < 2) {
        await reply('⚠️ *Please specify an item number to buy*');
        return;
      }
      
      const itemIndex = parseInt(args[1]) - 1;
      const shopItems = await db.collection(COLLECTIONS.SHOP_ITEMS).find({}).toArray();
      
      if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= shopItems.length) {
        await reply('⚠️ *Invalid item number*');
        return;
      }
      
      const item = shopItems[itemIndex];
      const userData = await getUserData(senderId);
      
      if (userData.balance < item.price) {
        await reply(`💸 *Insufficient balance*\n\n💰 *Item Price:* ${ecoSettings.currency}${item.price.toLocaleString()}\n💵 *Your Balance:* ${ecoSettings.currency}${userData.balance.toLocaleString()}`);
        return;
      }
      
      // Process purchase
      await removeMoney(senderId, item.price, `Purchased ${item.name}`);
      
      // Apply item effect
      await applyItemEffect(senderId, item);
      
      await reply(`✅ *Purchase Successful!*\n\n🛍️ *Item:* ${item.name}\n💰 *Paid:* ${ecoSettings.currency}${item.price.toLocaleString()}\n✨ *Effect Applied!*\n\n${item.description}`);
    }
  } catch (error) {
    await reply('❌ *Error accessing shop. Please try again.*');
    console.error('Shop error:', error);
  }
}

// Apply item effects
async function applyItemEffect(userId, item) {
  try {
    const userData = await getUserData(userId);
    const now = new Date();
    
    switch (item.type) {
      case 'protection':
        const protectionExpires = new Date(now.getTime() + (item.duration * 24 * 60 * 60 * 1000));
        const protection = item.name.includes('Premium') ? 0.5 : 0.2;
        
        const protectionEffect = {
          type: 'protection',
          protection: protection,
          expires: protectionExpires,
          source: item.name
        };
        
        const newEffects = [...(userData.activeEffects || []), protectionEffect];
        await updateUserData(userId, { activeEffects: newEffects });
        break;
        
      case 'multiplier':
        const multiplierExpires = new Date(now.getTime() + (item.duration * 24 * 60 * 60 * 1000));
        const multiplierType = item.name.includes('Work') ? 'work_multiplier' : 'daily_multiplier';
        
        const multiplierEffect = {
          type: multiplierType,
          multiplier: 2,
          expires: multiplierExpires,
          source: item.name
        };
        
        const updatedEffects = [...(userData.activeEffects || []), multiplierEffect];
        await updateUserData(userId, { activeEffects: updatedEffects });
        break;
        
      case 'instant':
        if (item.name.includes('Rank Boost')) {
          // Advance to next rank
          const currentRankIndex = ecoSettings.ranks.findIndex(rank => rank.name === userData.rank);
          if (currentRankIndex < ecoSettings.ranks.length - 1) {
            const nextRank = ecoSettings.ranks[currentRankIndex + 1];
            await updateUserData(userId, { rank: nextRank.name });
          }
        }
        break;
    }
  } catch (error) {
    console.error('Error applying item effect:', error);
  }
}

// Handle inventory command
async function handleInventory(context) {
  const { reply, senderId } = context;
  
  try {
    const userData = await getUserData(senderId);
    const now = new Date();
    
    // Clean expired effects
    if (userData.activeEffects && userData.activeEffects.length > 0) {
      const activeEffects = userData.activeEffects.filter(effect => new Date(effect.expires) > now);
      
      if (activeEffects.length !== userData.activeEffects.length) {
        await updateUserData(senderId, { activeEffects });
      }
      
      if (activeEffects.length === 0) {
        await reply('📦 *Your inventory is empty*\n\n🛍️ Visit the shop to buy items!');
        return;
      }
      
      let invText = '📦 *YOUR INVENTORY* 📦\n\n✨ *Active Effects:*\n\n';
      activeEffects.forEach((effect, index) => {
        const timeLeft = moment(effect.expires).fromNow();
        invText += `${index + 1}. *${effect.source}*\n`;
        invText += `   🕐 Expires: ${timeLeft}\n`;
        invText += `   📝 Type: ${effect.type.replace('_', ' ')}\n\n`;
      });
      
      await reply(invText);
    } else {
      await reply('📦 *Your inventory is empty*\n\n🛍️ Visit the shop to buy items!');
    }
  } catch (error) {
    await reply('❌ *Error loading inventory. Please try again.*');
    console.error('Inventory error:', error);
  }
}

// Handle ranks admin
async function handleRanksAdmin(context, args) {
  const { reply } = context;
  
  try {
    if (!args || args.length === 0) {
      let ranksText = `🏅 *RANKS MANAGEMENT* 🏅\n\n📋 *Current Ranks:*\n\n`;
      
      ecoSettings.ranks.forEach((rank, index) => {
        ranksText += `${index + 1}. *${rank.name}*\n`;
        ranksText += `   💰 Min Wealth: ${ecoSettings.currency}${rank.minWealth.toLocaleString()}\n`;
        ranksText += `   🎁 Daily Bonus: ${ecoSettings.currency}${rank.benefits.dailyBonus}\n`;
        ranksText += `   💼 Work Bonus: ${(rank.benefits.workBonus * 100)}%\n\n`;
      });
      
      ranksText += `🔧 *Commands:*\n`;
      ranksText += `• *add [name] [minWealth] [dailyBonus] [workBonus]* - Add rank\n`;
      ranksText += `• *remove [index]* - Remove rank\n`;
      ranksText += `• *edit [index] [field] [value]* - Edit rank\n\n`;
      ranksText += `💡 *Example:* ${context.config.PREFIX}ecoadmin ranks add "VIP" 2000000 3000 0.8`;
      
      await reply(ranksText);
      return;
    }
    
    const subCmd = args[0].toLowerCase();
    
    switch (subCmd) {
      case 'add':
        if (args.length < 5) {
          await reply('⚠️ *Usage:* ranks add [name] [minWealth] [dailyBonus] [workBonus]');
          return;
        }
        
        const rankName = args[1];
        const minWealth = parseInt(args[2]);
        const dailyBonus = parseInt(args[3]);
        const workBonus = parseFloat(args[4]);
        
        if (isNaN(minWealth) || isNaN(dailyBonus) || isNaN(workBonus)) {
          await reply('⚠️ *Invalid values. Check your input.*');
          return;
        }
        
        ecoSettings.ranks.push({
          name: rankName,
          minWealth: minWealth,
          benefits: {
            dailyBonus: dailyBonus,
            workBonus: workBonus
          }
        });
        
        // Sort ranks by minWealth
        ecoSettings.ranks.sort((a, b) => a.minWealth - b.minWealth);
        
        await saveSettings();
        await reply(`✅ *Rank added successfully!*\n\n🏅 *Rank:* ${rankName}\n💰 *Min Wealth:* ${ecoSettings.currency}${minWealth.toLocaleString()}\n🎁 *Daily Bonus:* ${ecoSettings.currency}${dailyBonus}\n💼 *Work Bonus:* ${(workBonus * 100)}%`);
        break;
        
      case 'remove':
        if (args.length < 2) {
          await reply('⚠️ *Usage:* ranks remove [rank_index]');
          return;
        }
        
        const removeIndex = parseInt(args[1]) - 1;
        if (isNaN(removeIndex) || removeIndex < 0 || removeIndex >= ecoSettings.ranks.length) {
          await reply('⚠️ *Invalid rank index*');
          return;
        }
        
        const removedRank = ecoSettings.ranks.splice(removeIndex, 1)[0];
        await saveSettings();
        await reply(`✅ *Rank removed:* ${removedRank.name}`);
        break;
        
      default:
        await reply(`❌ *Unknown ranks command:* ${subCmd}`);
    }
}

// Handle clan admin commands
async function handleClanAdmin(context, args) {
  const { reply, sock, from } = context;
  
  try {
    if (!args || args.length === 0) {
      const totalClans = await db.collection(COLLECTIONS.CLANS).countDocuments();
      const totalMembers = await db.collection(COLLECTIONS.USERS).countDocuments({ clan: { $ne: null } });
      
      await reply(`🏰 *CLAN ADMIN PANEL* 🏰\n\n📊 *Statistics:*\n• Total Clans: ${totalClans}\n• Total Members: ${totalMembers}\n• Creation Cost: ${ecoSettings.currency}${ecoSettings.clanCreationCost.toLocaleString()}\n• Max Members: ${ecoSettings.clanMaxMembers}\n\n🔧 *Commands:*\n• *list* - View all clans\n• *delete [name]* - Delete a clan\n• *transfer [from] [to]* - Transfer leadership\n• *addmember [clan] @user* - Force add member\n• *removemember [clan] @user* - Force remove member\n• *setbank [clan] [amount]* - Set clan bank\n• *reset [clan]* - Reset clan data\n\n💡 *Example:* ${context.config.PREFIX}ecoadmin clan delete "BadClan"`);
      return;
    }
    
    const subCmd = args[0].toLowerCase();
    
    switch (subCmd) {
      case 'list':
        const allClans = await db.collection(COLLECTIONS.CLANS).find({}).toArray();
        
        if (allClans.length === 0) {
          await reply('📜 *No clans exist*');
          return;
        }
        
        let clanList = '🏰 *ADMIN: ALL CLANS* 🏰\n\n';
        allClans.forEach((clan, index) => {
          clanList += `${index + 1}. *${clan.name}*\n`;
          clanList += `   👑 ${clan.leader.split('@')[0]}\n`;
          clanList += `   👥 ${clan.members.length}/${ecoSettings.clanMaxMembers} members\n`;
          clanList += `   💰 Bank: ${ecoSettings.currency}${clan.bank.toLocaleString()}\n`;
          clanList += `   📅 Created: ${moment(clan.created).format('DD/MM/YYYY')}\n\n`;
        });
        
        await reply(clanList);
        break;
        
      case 'delete':
        if (args.length < 2) {
          await reply('⚠️ *Usage:* clan delete [clan_name]');
          return;
        }
        
        const clanToDelete = args.slice(1).join(' ');
        const clan = await db.collection(COLLECTIONS.CLANS).findOne({ name: clanToDelete });
        
        if (!clan) {
          await reply('❌ *Clan not found*');
          return;
        }
        
        // Remove clan from all members
        await db.collection(COLLECTIONS.USERS).updateMany(
          { clan: clanToDelete },
          { $set: { clan: null } }
        );
        
        // Delete the clan
        await db.collection(COLLECTIONS.CLANS).deleteOne({ name: clanToDelete });
        
        await sock.sendMessage(from, {
          text: `💥 *ADMIN: Clan "${clanToDelete}" has been deleted*\n\n👥 *${clan.members.length} members* have been removed from the clan`,
          mentions: clan.members
        });
        break;
        
      default:
        await reply(`❌ *Unknown clan admin command:* ${subCmd}`);
    }
  } catch (error) {
    await reply('❌ *Error in clan admin. Please try again.*');
    console.error('Clan admin error:', error);
  }
}

// Handle backup command
async function handleBackup(context) {
  const { reply } = context;
  
  try {
    const backupData = {
      users: await db.collection(COLLECTIONS.USERS).find({}).toArray(),
      clans: await db.collection(COLLECTIONS.CLANS).find({}).toArray(),
      settings: ecoSettings,
      shopItems: await db.collection(COLLECTIONS.SHOP_ITEMS).find({}).toArray(),
      timestamp: new Date(),
      version: info.version
    };
    
    // Save backup to database
    await db.collection('economy_backups').insertOne({
      backupId: `backup_${Date.now()}`,
      data: backupData,
      createdBy: context.senderId,
      createdAt: new Date()
    });
    
    await reply(`💾 *Economy Backup Created*\n\n📊 *Backup includes:*\n• ${backupData.users.length} users\n• ${backupData.clans.length} clans\n• All settings and shop items\n\n✅ *Backup saved to database*`);
  } catch (error) {
    await reply('❌ *Error creating backup. Please try again.*');
    console.error('Backup error:', error);
  }
}

// Cleanup expired effects (run periodically)
async function cleanupExpiredEffects() {
  try {
    const now = new Date();
    const users = await db.collection(COLLECTIONS.USERS).find({ 
      activeEffects: { $exists: true, $ne: [] } 
    }).toArray();
    
    for (const user of users) {
      const activeEffects = user.activeEffects.filter(effect => new Date(effect.expires) > now);
      
      if (activeEffects.length !== user.activeEffects.length) {
        await updateUserData(user.userId, { activeEffects });
      }
    }
  } catch (error) {
    console.error('Error cleaning up expired effects:', error);
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredEffects, 60 * 60 * 1000);

// Export functions for use by other plugins
export { 
  addMoney, 
  removeMoney, 
  getUserData, 
  updateUserData, 
  initUser, 
  ecoSettings, 
  initDatabase,
  calculateBankInterest,
  updateUserRank,
  isAdmin,
  isOwner,
  checkSystemEnabled
};
