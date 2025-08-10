// plugins/economy_plugin.js - Economy plugin compatible with PluginManager
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';

// Plugin information export
export const info = {
  name: 'Economy System',
  version: '3.0.0',
  author: 'Bot Developer',
  description: 'Complete economy system with wallet, bank, work, rob, clans and MongoDB persistence with enhanced admin controls',
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
      name: 'gamble',
      aliases: ['bet'],
      description: 'Gamble your money'
    },
    {
      name: 'lottery',
      aliases: ['lotto'],
      description: 'Buy lottery tickets'
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
  LOTTERY: 'economy_lottery'
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

// Default economy settings with expanded options
const defaultSettings = {
  // Basic Economy
  startingBalance: 0,
  startingBankBalance: 0,
  currency: '₦',
  timezone: 'Africa/Lagos',
  maxWalletBalance: 1000000,
  maxBankBalance: 10000000,
  interestRate: 0.05, // 5% daily bank interest
  
  // Daily Rewards
  dailyMinAmount: 500,
  dailyMaxAmount: 1000,
  dailyStreakBonus: 100, // Extra per streak day
  dailyMaxStreak: 30, // Max streak for bonus calculation
  
  // Work System
  workCooldownMinutes: 60,
  workMinAmount: 100,
  workMaxAmount: 1500,
  workJobs: [
    { name: 'Uber Driver', min: 200, max: 800, cooldown: 60 },
    { name: 'Food Delivery', min: 150, max: 600, cooldown: 45 },
    { name: 'Freelancer', min: 300, max: 1200, cooldown: 90 },
    { name: 'Tutor', min: 250, max: 900, cooldown: 75 },
    { name: 'Cleaner', min: 180, max: 500, cooldown: 30 },
    { name: 'Mechanic', min: 400, max: 1000, cooldown: 120 },
    { name: 'Doctor', min: 800, max: 2000, cooldown: 180 },
    { name: 'Engineer', min: 600, max: 1800, cooldown: 150 },
    { name: 'Teacher', min: 350, max: 1100, cooldown: 90 }
  ],
  
  // Robbery System
  robCooldownMinutes: 60,
  robSuccessRate: 0.7,
  robMaxStealPercent: 0.3,
  robMinTargetBalance: 100,
  robMinRobberBalance: 100,
  robMinSteal: 10,
  robFailPenalty: 100,
  robJailTime: 30, // minutes in jail
  
  // Gambling System
  gambleEnabled: true,
  gambleMinBet: 10,
  gambleMaxBet: 10000,
  gambleCooldownMinutes: 5,
  gambleWinRate: 0.45, // 45% win rate
  gambleMultiplier: 2.0, // 2x multiplier on win
  
  // Lottery System
  lotteryEnabled: true,
  lotteryTicketPrice: 100,
  lotteryMaxTickets: 10,
  lotteryDrawInterval: 1440, // minutes (24 hours)
  lotteryWinRate: 0.1, // 10% chance to win
  lotteryMultiplier: 50, // 50x ticket price
  
  // Clan System
  clanCreationCost: 5000,
  clanMaxMembers: 20,
  clanBankInterest: 0.02, // 2% daily interest
  clanUpgradeCosts: [10000, 25000, 50000, 100000], // Level upgrade costs
  
  // Shop System
  shopEnabled: true,
  shopRefreshInterval: 1440, // minutes (24 hours)
  
  // Tax System
  taxEnabled: false,
  taxRate: 0.1, // 10% tax on transactions over threshold
  taxThreshold: 10000,
  
  // Cooldown Reductions
  vipWorkCooldown: 30, // VIP users work cooldown
  vipRobCooldown: 30, // VIP users rob cooldown
  
  // Ranks and Levels
  rankTitles: [
    { min: 0, title: 'Newbie' },
    { min: 10000, title: 'Trader' },
    { min: 50000, title: 'Entrepreneur' },
    { min: 100000, title: 'Business Owner' },
    { min: 250000, title: 'Millionaire' },
    { min: 500000, title: 'Tycoon' },
    { min: 1000000, title: 'Elite' },
    { min: 2500000, title: 'Legend' },
    { min: 5000000, title: 'God Mode' }
  ]
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
        
        // Experience and Level
        xp: 0,
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
        lastGamble: null,
        jailUntil: null,
        
        // Stats
        totalEarned: 0,
        totalSpent: 0,
        totalGambled: 0,
        robsSuccessful: 0,
        robsFailed: 0,
        workCount: 0,
        
        // VIP Status
        vipStatus: false,
        vipExpiry: null,
        
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
        xp: 0,
        level: 1,
        totalAttendances: 0,
        streak: 0,
        longestStreak: 0,
        birthdayData: null,
        lastDaily: null,
        lastWork: null,
        lastRob: null,
        lastGamble: null,
        jailUntil: null,
        totalEarned: 0,
        totalSpent: 0,
        totalGambled: 0,
        robsSuccessful: 0,
        robsFailed: 0,
        workCount: 0,
        vipStatus: false,
        vipExpiry: null
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

// Calculate user rank based on wealth
function calculateRank(wealth) {
  for (let i = ecoSettings.rankTitles.length - 1; i >= 0; i--) {
    if (wealth >= ecoSettings.rankTitles[i].min) {
      return ecoSettings.rankTitles[i].title;
    }
  }
  return 'Newbie';
}

// Add money to user balance with transaction logging
async function addMoney(userId, amount, reason = 'Unknown') {
  try {
    const user = await getUserData(userId);
    const newBalance = Math.min(user.balance + amount, ecoSettings.maxWalletBalance);
    const actualAmount = newBalance - user.balance;
    
    // Update rank and XP
    const newWealth = newBalance + user.bank;
    const newRank = calculateRank(newWealth);
    const newXP = user.xp + Math.floor(actualAmount / 10);
    const newLevel = Math.floor(newXP / 1000) + 1;
    
    await updateUserData(userId, { 
      balance: newBalance, 
      rank: newRank,
      xp: newXP,
      level: newLevel,
      totalEarned: (user.totalEarned || 0) + actualAmount
    });
    
    // Log transaction
    await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({
      userId,
      type: 'credit',
      amount: actualAmount,
      reason,
      balanceBefore: user.balance,
      balanceAfter: newBalance,
      timestamp: new Date()
    });
    
    console.log(`💰 Added ${ecoSettings.currency}${actualAmount} to ${userId.split('@')[0]} (${reason})`);
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

// Get current Nigeria time
function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

// Get current date in Nigeria timezone
function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

// Safe message body extraction with comprehensive null checks
function safeGetMessageBody(m, prefix) {
  try {
    // Multiple layers of null safety
    if (!m) return null;
    if (!m.body) return null;
    if (typeof m.body !== 'string') return null;
    if (!prefix || typeof prefix !== 'string') return null;
    
    // Check if message starts with prefix
    if (!m.body.startsWith(prefix)) return null;
    
    // Extract command safely
    const body = m.body.slice(prefix.length).trim();
    if (!body || body.length === 0) return null;
    
    return body;
  } catch (error) {
    console.error('❌ Error extracting message body:', error.message);
    return null;
  }
}

// Safe argument parsing
function safeParseArgs(messageBody) {
  try {
    if (!messageBody || typeof messageBody !== 'string') return [];
    
    const args = messageBody.split(/\s+/).filter(arg => arg && arg.length > 0);
    return args || [];
  } catch (error) {
    console.error('❌ Error parsing arguments:', error.message);
    return [];
  }
}

// Get target user from mentions, quoted message, or text input
function getTargetUser(m, text) {
  try {
    // Safety check for m object
    if (!m || !m.message) {
      return null;
    }

    // Check for mentions
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      return m.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    
    // Check for quoted message
    if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      return m.message.extendedTextMessage.contextInfo.participant;
    }
    
    // Extract from text input
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

// Check if user is owner
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

// Check if user is in jail
function isInJail(userData) {
  if (!userData.jailUntil) return false;
  return new Date() < new Date(userData.jailUntil);
}

// Check if user is VIP
function isVIP(userData) {
  if (!userData.vipStatus) return false;
  if (userData.vipExpiry && new Date() > new Date(userData.vipExpiry)) {
    return false;
  }
  return true;
}

// Main plugin handler function - COMPLETELY REWRITTEN WITH COMPREHENSIVE SAFETY
export default async function economyHandler(m, sock, config) {
  try {
    // CRITICAL: Comprehensive null safety checks at the very beginning
    if (!m) {
      console.warn('⚠️ Economy plugin: Received null message object');
      return;
    }

    if (!sock) {
      console.warn('⚠️ Economy plugin: Received null socket object');
      return;
    }

    if (!config) {
      console.error('❌ Economy plugin: Received null config object');
      return;
    }

    if (!config.PREFIX || typeof config.PREFIX !== 'string') {
      console.error('❌ Economy plugin: Invalid or missing PREFIX in config');
      return;
    }

    // SAFE message body extraction
    const messageBody = safeGetMessageBody(m, config.PREFIX);
    if (!messageBody) {
      // Not a valid command or not for this plugin
      return;
    }

    // SAFE argument parsing
    const args = safeParseArgs(messageBody);
    if (args.length === 0) {
      console.warn('⚠️ Economy plugin: No valid arguments found');
      return;
    }

    const command = args[0].toLowerCase();

    // SAFE user ID and chat extraction
    let senderId = '';
    let from = '';
    
    try {
      if (!m.key || !m.key.remoteJid) {
        console.error('❌ Economy plugin: Invalid message key structure');
        return;
      }
      
      senderId = m.key.participant || m.key.remoteJid;
      from = m.key.remoteJid;
      
      if (!senderId || !from || typeof senderId !== 'string' || typeof from !== 'string') {
        console.error('❌ Economy plugin: Could not determine sender or chat');
        return;
      }
    } catch (keyError) {
      console.error('❌ Error extracting message info:', keyError.message);
      return;
    }

    // Initialize database connection
    if (!db) {
      await initDatabase();
      await loadSettings();
    }
    
    // Initialize user
    await initUser(senderId);
    
    // Helper function for sending replies with error handling
    const reply = async (text) => {
      try {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
          console.error('❌ Attempted to send empty or invalid reply');
          return;
        }
        await sock.sendMessage(from, { text: text.trim() }, { quoted: m });
      } catch (replyError) {
        console.error('❌ Error sending reply:', replyError.message);
      }
    };
    
    // Create context object
    const context = { m, sock, config, senderId, from, reply };
    
    // Check if user is in jail (except for profile and admin commands)
    const userData = await getUserData(senderId);
    const jailCommands = ['profile', 'balance', 'leaderboard', 'economy'];
    
    if (isInJail(userData) && !jailCommands.includes(command) && !isAdmin(senderId)) {
      const jailTime = Math.ceil((new Date(userData.jailUntil) - new Date()) / 60000);
      await reply(`🔒 *You are in jail!*\n\n⏰ *Time remaining:* ${jailTime} minutes\n💡 *You can only check your profile and balance while in jail*`);
      return;
    }
    
    // Handle different commands
    switch (command) {
      case 'economy':
      case 'eco':
        if (args.length === 1) {
          await showEconomyMenu(reply, config.PREFIX);
        } else {
          await handleSubCommand(args[1], args.slice(2), context);
        }
        break;
        
      case 'balance':
      case 'bal':
      case 'wallet':
        await handleBalance(context, args.slice(1));
        break;
        
      case 'send':
      case 'transfer':
      case 'pay':
        await handleSend(context, args.slice(1));
        break;
        
      case 'deposit':
      case 'dep':
        await handleDeposit(context, args.slice(1));
        break;
        
      case 'withdraw':
      case 'wd':
        await handleWithdraw(context, args.slice(1));
        break;
        
      case 'work':
        await handleWork(context, args.slice(1));
        break;
        
      case 'rob':
        await handleRob(context, args.slice(1));
        break;
        
      case 'daily':
        await handleDaily(context);
        break;
        
      case 'profile':
        await handleProfile(context, args.slice(1));
        break;
        
      case 'leaderboard':
      case 'lb':
        await handleLeaderboard(context, args.slice(1));
        break;
        
      case 'clan':
        await handleClan(context, args.slice(1));
        break;
        
      case 'shop':
        await handleShop(context, args.slice(1));
        break;
        
      case 'inventory':
      case 'inv':
        await handleInventory(context, args.slice(1));
        break;
        
      case 'gamble':
      case 'bet':
        await handleGamble(context, args.slice(1));
        break;
        
      case 'lottery':
      case 'lotto':
        await handleLottery(context, args.slice(1));
        break;
        
      default:
        // Don't respond to unknown commands to avoid spam
        break;
    }
  } catch (error) {
    console.error('❌ Economy plugin critical error:', error.message);
    console.error('❌ Stack trace:', error.stack);
    // Don't send error messages to chat to avoid spam
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
        await handleSend(context, args);
        break;
      case 'deposit':
      case 'dep':
        await handleDeposit(context, args);
        break;
      case 'withdraw':
      case 'wd':
        await handleWithdraw(context, args);
        break;
      case 'work':
        await handleWork(context, args);
        break;
      case 'rob':
        await handleRob(context, args);
        break;
      case 'daily':
        await handleDaily(context);
        break;
      case 'profile':
        await handleProfile(context, args);
        break;
      case 'leaderboard':
      case 'lb':
        await handleLeaderboard(context, args);
        break;
      case 'clan':
        await handleClan(context, args);
        break;
      case 'shop':
        await handleShop(context, args);
        break;
      case 'inventory':
      case 'inv':
        await handleInventory(context, args);
        break;
      case 'gamble':
      case 'bet':
        await handleGamble(context, args);
        break;
      case 'lottery':
      case 'lotto':
        await handleLottery(context, args);
        break;
      case 'settings':
      case 'config':
        await handleSettings(context, args);
        break;
      case 'admin':
        await handleAdminCommands(context, args);
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
    const menuText = `💰 *ECONOMY SYSTEM v3.0* 💰\n\n` +
                    `💵 *Wallet Commands:*\n` +
                    `• *balance/bal* - Check your balance\n` +
                    `• *send @user amount* - Send money\n` +
                    `• *deposit amount* - Deposit to bank\n` +
                    `• *withdraw amount* - Withdraw from bank\n\n` +
                    `💼 *Earning Commands:*\n` +
                    `• *work* - Work to earn money\n` +
                    `• *daily* - Claim daily reward\n` +
                    `• *rob @user* - Rob someone (risky!)\n` +
                    `• *gamble amount* - Gamble your money\n` +
                    `• *lottery buy [tickets]* - Buy lottery tickets\n\n` +
                    `👥 *Social Commands:*\n` +
                    `• *profile [@user]* - View profile\n` +
                    `• *leaderboard [type]* - Top users\n` +
                    `• *clan* - Clan system\n\n` +
                    `🛍️ *Shop Commands:*\n` +
                    `• *shop* - Browse items\n` +
                    `• *inventory* - View your items\n\n` +
                    `⚙️ *Admin Commands:*\n` +
                    `• *admin* - Admin panel (admin only)\n` +
                    `• *settings* - Economy settings (admin only)\n\n` +
                    `💡 *Usage:* ${prefix}economy [command] or ${prefix}[command]`;
    
    await reply(menuText);
  } catch (error) {
    console.error('❌ Error showing economy menu:', error.message);
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
      const wealth = targetData.balance + targetData.bank;
      
      await reply(`💰 *@${targetNumber}'s Balance*\n\n` +
                 `💵 *Wallet:* ${ecoSettings.currency}${targetData.balance.toLocaleString()}\n` +
                 `🏦 *Bank:* ${ecoSettings.currency}${targetData.bank.toLocaleString()}\n` +
                 `💎 *Total Wealth:* ${ecoSettings.currency}${wealth.toLocaleString()}\n` +
                 `🏅 *Rank:* ${targetData.rank}\n` +
                 `⭐ *Level:* ${targetData.level} (${targetData.xp} XP)`);
    } else {
      const userData = await getUserData(senderId);
      const wealth = userData.balance + userData.bank;
      const vipStatus = isVIP(userData) ? '👑 VIP' : '🔸 Regular';
      
      await reply(`💰 *YOUR BALANCE* 💰\n\n` +
                 `💵 *Wallet:* ${ecoSettings.currency}${userData.balance.toLocaleString()} / ${ecoSettings.currency}${ecoSettings.maxWalletBalance.toLocaleString()}\n` +
                 `🏦 *Bank:* ${ecoSettings.currency}${userData.bank.toLocaleString()} / ${ecoSettings.currency}${ecoSettings.maxBankBalance.toLocaleString()}\n` +
                 `💎 *Total Wealth:* ${ecoSettings.currency}${wealth.toLocaleString()}\n` +
                 `🏅 *Rank:* ${userData.rank}\n` +
                 `⭐ *Level:* ${userData.level} (${userData.xp} XP)\n` +
                 `👤 *Status:* ${vipStatus}\n\n` +
                 `💡 *Use ${context.config.PREFIX}profile for detailed stats*`);
    }
  } catch (error) {
    await reply('❌ *Error retrieving balance. Please try again.*');
    console.error('Balance error:', error);
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
    
    // Try to find amount in args if not last
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
    
    if (isNaN(amount) || amount <= 0) {
      await reply('⚠️ *Please provide a valid amount*');
      return;
    }
    
    if (targetUser === senderId) {
      await reply('🧠 *You cannot send money to yourself!*');
      return;
    }
    
    const senderData = await getUserData(senderId);
    if (senderData.balance < amount) {
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${ecoSettings.currency}${senderData.balance.toLocaleString()}\n💸 *Required:* ${ecoSettings.currency}${amount.toLocaleString()}`);
      return;
    }
    
    // Calculate tax if enabled
    let tax = 0;
    if (ecoSettings.taxEnabled && amount > ecoSettings.taxThreshold) {
      tax = Math.floor(amount * ecoSettings.taxRate);
    }
    
    const totalCost = amount + tax;
    if (senderData.balance < totalCost) {
      await reply(`🚫 *Insufficient balance including tax*\n\n💵 *Your Balance:* ${ecoSettings.currency}${senderData.balance.toLocaleString()}\n💸 *Amount:* ${ecoSettings.currency}${amount.toLocaleString()}\n🏛️ *Tax:* ${ecoSettings.currency}${tax.toLocaleString()}\n💰 *Total Required:* ${ecoSettings.currency}${totalCost.toLocaleString()}`);
      return;
    }
    
    // Process transaction
    await initUser(targetUser);
    await removeMoney(senderId, totalCost, `Transfer sent${tax > 0 ? ' (including tax)' : ''}`);
    await addMoney(targetUser, amount, 'Transfer received');
    
    const updatedSender = await getUserData(senderId);
    const updatedTarget = await getUserData(targetUser);
    
    let transferText = `✅ *TRANSFER SUCCESSFUL* ✅\n\n💸 *@${senderId.split('@')[0]}* sent *${ecoSettings.currency}${amount.toLocaleString()}* to *@${targetUser.split('@')[0]}*\n`;
    
    if (tax > 0) {
      transferText += `🏛️ *Tax deducted:* ${ecoSettings.currency}${tax.toLocaleString()}\n`;
    }
    
    transferText += `\n💵 *Sender's new balance:* ${ecoSettings.currency}${updatedSender.balance.toLocaleString()}\n💰 *Receiver's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}`;
    
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
      await reply(`⚠️ *Usage:* ${context.config.PREFIX}deposit [amount/all]\n\n💡 *Examples:*\n• ${context.config.PREFIX}deposit 1000\n• ${context.config.PREFIX}deposit all`);
      return;
    }
    
    const userData = await getUserData(senderId);
    let amount;
    
    if (args[0].toLowerCase() === 'all') {
      amount = userData.balance;
    } else {
      amount = parseInt(args[0]);
      if (isNaN(amount) || amount <= 0) {
        await reply('⚠️ *Please provide a valid amount to deposit*');
        return;
      }
    }
    
    if (userData.balance < amount) {
      await reply('🚫 *Insufficient wallet balance*');
      return;
    }
    
    const newBankBalance = Math.min(userData.bank + amount, ecoSettings.maxBankBalance);
    const actualDeposit = newBankBalance - userData.bank;
    
    if (actualDeposit < amount) {
      await reply(`⚠️ *Bank capacity exceeded. Can only deposit ${ecoSettings.currency}${actualDeposit.toLocaleString()}*`);
      return;
    }
    
    await updateUserData(senderId, {
      balance: userData.balance - actualDeposit,
      bank: newBankBalance
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`🏦 *Successfully deposited ${ecoSettings.currency}${actualDeposit.toLocaleString()} to your bank*\n\n💵 *New Wallet Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🏦 *New Bank Balance:* ${ecoSettings.currency}${updatedData.bank.toLocaleString()}\n\n💡 *Bank earns ${(ecoSettings.interestRate * 100)}% daily interest!*`);
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
      await reply(`⚠️ *Usage:* ${context.config.PREFIX}withdraw [amount/all]\n\n💡 *Examples:*\n• ${context.config.PREFIX}withdraw 1000\n• ${context.config.PREFIX}withdraw all`);
      return;
    }
    
    const userData = await getUserData(senderId);
    let amount;
    
    if (args[0].toLowerCase() === 'all') {
      amount = userData.bank;
    } else {
      amount = parseInt(args[0]);
      if (isNaN(amount) || amount <= 0) {
        await reply('⚠️ *Please provide a valid amount to withdraw*');
        return;
      }
    }
    
    if (userData.bank < amount) {
      await reply('🚫 *Insufficient bank balance*');
      return;
    }
    
    const newWalletBalance = Math.min(userData.balance + amount, ecoSettings.maxWalletBalance);
    const actualWithdrawal = newWalletBalance - userData.balance;
    
    if (actualWithdrawal < amount) {
      await reply(`⚠️ *Wallet capacity exceeded. Can only withdraw ${ecoSettings.currency}${actualWithdrawal.toLocaleString()}*`);
      return;
    }
    
    await updateUserData(senderId, {
      balance: newWalletBalance,
      bank: userData.bank - actualWithdrawal
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`💵 *Successfully withdrew ${ecoSettings.currency}${actualWithdrawal.toLocaleString()} from your bank*\n\n💵 *New Wallet Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🏦 *New Bank Balance:* ${ecoSettings.currency}${updatedData.bank.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing withdrawal. Please try again.*');
    console.error('Withdraw error:', error);
  }
}

// Handle work command with job selection
async function handleWork(context, args) {
  const { reply, senderId } = context;
  const now = new Date();
  
  try {
    const userData = await getUserData(senderId);
    const isUserVIP = isVIP(userData);
    const cooldown = isUserVIP ? ecoSettings.vipWorkCooldown : ecoSettings.workCooldownMinutes;
    
    if (userData.lastWork && now - new Date(userData.lastWork) < cooldown * 60 * 1000) {
      const remaining = Math.ceil((cooldown * 60 * 1000 - (now - new Date(userData.lastWork))) / 60000);
      await reply(`⏱️ *You're tired! Rest for ${remaining} minutes before working again.*\n\n${isUserVIP ? '👑 *VIP users have reduced cooldown!*' : '💡 *Get VIP for faster work cooldown*'}`);
      return;
    }
    
    // Show available jobs if no specific job selected
    if (!args || args.length === 0) {
      let jobsList = `💼 *AVAILABLE JOBS* 💼\n\n`;
      ecoSettings.workJobs.forEach((job, index) => {
        jobsList += `${index + 1}. *${job.name}*\n`;
        jobsList += `   💰 ${ecoSettings.currency}${job.min} - ${ecoSettings.currency}${job.max}\n`;
        jobsList += `   ⏱️ ${job.cooldown || ecoSettings.workCooldownMinutes} min cooldown\n\n`;
      });
      jobsList += `💡 *Usage:* ${context.config.PREFIX}work [job number] or ${context.config.PREFIX}work random`;
      
      await reply(jobsList);
      return;
    }
    
    let selectedJob;
    if (args[0].toLowerCase() === 'random') {
      selectedJob = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
    } else {
      const jobIndex = parseInt(args[0]) - 1;
      if (isNaN(jobIndex) || jobIndex < 0 || jobIndex >= ecoSettings.workJobs.length) {
        await reply('⚠️ *Invalid job number. Use work command to see available jobs.*');
        return;
      }
      selectedJob = ecoSettings.workJobs[jobIndex];
    }
    
    const earnings = Math.floor(Math.random() * (selectedJob.max - selectedJob.min + 1)) + selectedJob.min;
    const xpGain = Math.floor(earnings / 10);
    
    await updateUserData(senderId, {
      balance: userData.balance + earnings,
      lastWork: now,
      workCount: (userData.workCount || 0) + 1,
      xp: (userData.xp || 0) + xpGain,
      totalEarned: (userData.totalEarned || 0) + earnings
    });
    
    const updatedData = await getUserData(senderId);
    const newLevel = Math.floor(updatedData.xp / 1000) + 1;
    let levelUpText = '';
    
    if (newLevel > userData.level) {
      await updateUserData(senderId, { level: newLevel });
      levelUpText = `\n\n🎉 *LEVEL UP!* You are now level ${newLevel}!`;
    }
    
    await reply(`💼 *Work Complete!*\n\n🔨 *Job:* ${selectedJob.name}\n💰 *Earned:* ${ecoSettings.currency}${earnings.toLocaleString()}\n⭐ *XP Gained:* +${xpGain}\n💵 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n\n⏱️ *Next work available in ${cooldown} minutes*${levelUpText}`);
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
    const isUserVIP = isVIP(robberData);
    const cooldown = isUserVIP ? ecoSettings.vipRobCooldown : ecoSettings.robCooldownMinutes;
    
    // Check cooldown
    if (robberData.lastRob && now - new Date(robberData.lastRob) < cooldown * 60 * 1000) {
      const remaining = Math.ceil((cooldown * 60 * 1000 - (now - new Date(robberData.lastRob))) / 60000);
      await reply(`⏱️ *You're on cooldown. Try again in ${remaining} minutes.*\n\n${isUserVIP ? '👑 *VIP users have reduced cooldown!*' : '💡 *Get VIP for faster rob cooldown*'}`);
      return;
    }
    
    await initUser(targetUser);
    const targetData = await getUserData(targetUser);
    
    // Check if target is VIP (VIP users are harder to rob)
    const targetIsVIP = isVIP(targetData);
    let successRate = ecoSettings.robSuccessRate;
    if (targetIsVIP) {
      successRate *= 0.6; // VIP users have 40% less chance of being robbed
    }
    
    // Validation checks
    if (targetData.balance < ecoSettings.robMinTargetBalance) {
      await reply(`👀 *Target is too broke to rob*\n\n💸 *@${targetUser.split('@')[0]}* only has ${ecoSettings.currency}${targetData.balance.toLocaleString()}\n🚫 *Minimum required: ${ecoSettings.currency}${ecoSettings.robMinTargetBalance}*`);
      return;
    }
    
    if (robberData.balance < ecoSettings.robMinRobberBalance) {
      await reply(`💸 *Your balance is too low to attempt a robbery*\n\n💰 *Your balance:* ${ecoSettings.currency}${robberData.balance.toLocaleString()}\n⚠️ _You need at least ${ecoSettings.currency}${ecoSettings.robMinRobberBalance} in your wallet to bail yourself in case you get caught._`);
      return;
    }
    
    // Process robbery attempt
    const success = Math.random() < successRate;
    
    await updateUserData(senderId, { lastRob: now });
    
    if (success) {
      const maxSteal = Math.floor(targetData.balance * ecoSettings.robMaxStealPercent);
      const stolen = Math.floor(Math.random() * maxSteal) + ecoSettings.robMinSteal;
      
      await updateUserData(targetUser, { balance: targetData.balance - stolen });
      await updateUserData(senderId, { 
        balance: robberData.balance + stolen,
        robsSuccessful: (robberData.robsSuccessful || 0) + 1,
        totalEarned: (robberData.totalEarned || 0) + stolen
      });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      await sock.sendMessage(from, {
        text: `🦹‍♂️ *ROBBERY SUCCESS!* 🦹‍♂️\n\n💰 *@${senderId.split('@')[0]}* successfully robbed *${ecoSettings.currency}${stolen.toLocaleString()}* from *@${targetUser.split('@')[0]}*\n\n🤑 *Robber's new balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😭 *Victim's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${cooldown} minutes${targetIsVIP ? '\n🛡️ *Target had VIP protection!*' : ''}`,
        mentions: [senderId, targetUser]
      });
    } else {
      const jailUntil = new Date(now.getTime() + ecoSettings.robJailTime * 60 * 1000);
      
      await updateUserData(senderId, { 
        balance: robberData.balance - ecoSettings.robFailPenalty,
        robsFailed: (robberData.robsFailed || 0) + 1,
        jailUntil: jailUntil
      });
      await updateUserData(targetUser, { balance: targetData.balance + ecoSettings.robFailPenalty });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      await sock.sendMessage(from, {
        text: `🚨 *ROBBERY FAILED!* 🚨\n\n❌ *@${senderId.split('@')[0]}* got caught trying to rob *@${targetUser.split('@')[0]}* and has been arrested!\n\n💸 *Bail paid:* ${ecoSettings.currency}${ecoSettings.robFailPenalty.toLocaleString()}\n🔒 *Jail time:* ${ecoSettings.robJailTime} minutes\n😔 *Robber's new balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😊 *Victim's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${cooldown} minutes`,
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
    
    // Apply streak bonus
    const streakBonus = Math.min(newStreak - 1, ecoSettings.dailyMaxStreak) * ecoSettings.dailyStreakBonus;
    dailyAmount += streakBonus;
    
    // VIP bonus
    if (isVIP(userData)) {
      dailyAmount = Math.floor(dailyAmount * 1.5); // 50% bonus for VIP
    }
    
    const newLongestStreak = Math.max(userData.longestStreak || 0, newStreak);
    
    await updateUserData(senderId, {
      balance: userData.balance + dailyAmount,
      lastDaily: currentDate,
      streak: newStreak,
      longestStreak: newLongestStreak,
      totalAttendances: (userData.totalAttendances || 0) + 1,
      totalEarned: (userData.totalEarned || 0) + dailyAmount
    });
    
    const updatedData = await getUserData(senderId);
    
    let rewardText = `🎁 *Daily Reward Claimed!*\n\n💰 *Base Reward:* ${ecoSettings.currency}${(dailyAmount - streakBonus).toLocaleString()}`;
    
    if (streakBonus > 0) {
      rewardText += `\n🔥 *Streak Bonus:* ${ecoSettings.currency}${streakBonus.toLocaleString()} (${newStreak} days)`;
    }
    
    if (isVIP(userData)) {
      rewardText += `\n👑 *VIP Bonus Applied!*`;
    }
    
    rewardText += `\n💵 *Total Received:* ${ecoSettings.currency}${dailyAmount.toLocaleString()}\n💰 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🔥 *Current Streak:* ${newStreak} days\n\n✨ *Come back tomorrow for another reward!*\n⏰ *Nigeria Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`;
    
    await reply(rewardText);
  } catch (error) {
    await reply('❌ *Error claiming daily reward. Please try again.*');
    console.error('Daily error:', error);
  }
}

// Handle gambling command
async function handleGamble(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.gambleEnabled) {
      await reply('🚫 *Gambling is currently disabled*');
      return;
    }
    
    if (!args || args.length === 0) {
      await reply(`🎲 *GAMBLING SYSTEM* 🎲\n\n💰 *Min Bet:* ${ecoSettings.currency}${ecoSettings.gambleMinBet}\n💸 *Max Bet:* ${ecoSettings.currency}${ecoSettings.gambleMaxBet}\n🎯 *Win Rate:* ${(ecoSettings.gambleWinRate * 100)}%\n💎 *Multiplier:* ${ecoSettings.gambleMultiplier}x\n⏱️ *Cooldown:* ${ecoSettings.gambleCooldownMinutes} minutes\n\n💡 *Usage:* ${context.config.PREFIX}gamble [amount]`);
      return;
    }
    
    const now = new Date();
    const userData = await getUserData(senderId);
    
    // Check cooldown
    if (userData.lastGamble && now - new Date(userData.lastGamble) < ecoSettings.gambleCooldownMinutes * 60 * 1000) {
      const remaining = Math.ceil((ecoSettings.gambleCooldownMinutes * 60 * 1000 - (now - new Date(userData.lastGamble))) / 60000);
      await reply(`⏱️ *Gambling cooldown active. Try again in ${remaining} minutes.*`);
      return;
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < ecoSettings.gambleMinBet || amount > ecoSettings.gambleMaxBet) {
      await reply(`⚠️ *Invalid bet amount*\n\n💰 *Min:* ${ecoSettings.currency}${ecoSettings.gambleMinBet}\n💸 *Max:* ${ecoSettings.currency}${ecoSettings.gambleMaxBet}`);
      return;
    }
    
    if (userData.balance < amount) {
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n💸 *Required:* ${ecoSettings.currency}${amount.toLocaleString()}`);
      return;
    }
    
    const won = Math.random() < ecoSettings.gambleWinRate;
    
    await updateUserData(senderId, {
      lastGamble: now,
      totalGambled: (userData.totalGambled || 0) + amount
    });
    
    if (won) {
      const winnings = Math.floor(amount * ecoSettings.gambleMultiplier);
      await addMoney(senderId, winnings - amount, 'Gambling winnings');
      const updatedData = await getUserData(senderId);
      
      await reply(`🎉 *GAMBLING WIN!* 🎉\n\n🎲 *Bet:* ${ecoSettings.currency}${amount.toLocaleString()}\n💰 *Won:* ${ecoSettings.currency}${winnings.toLocaleString()}\n📈 *Profit:* ${ecoSettings.currency}${(winnings - amount).toLocaleString()}\n💵 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}`);
    } else {
      await removeMoney(senderId, amount, 'Gambling loss');
      const updatedData = await getUserData(senderId);
      
      await reply(`😔 *GAMBLING LOSS* 😔\n\n🎲 *Bet:* ${ecoSettings.currency}${amount.toLocaleString()}\n💸 *Lost:* ${ecoSettings.currency}${amount.toLocaleString()}\n💵 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n\n🍀 *Better luck next time!*`);
    }
  } catch (error) {
    await reply('❌ *Error processing gamble. Please try again.*');
    console.error('Gamble error:', error);
  }
}

// Handle lottery command
async function handleLottery(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.lotteryEnabled) {
      await reply('🚫 *Lottery is currently disabled*');
      return;
    }
    
    if (!args || args.length === 0) {
      const lotteryInfo = await db.collection(COLLECTIONS.LOTTERY).findOne({ type: 'current' });
      const totalPool = lotteryInfo ? lotteryInfo.totalPool : 0;
      const totalTickets = lotteryInfo ? lotteryInfo.totalTickets : 0;
      
      await reply(`🎟️ *LOTTERY SYSTEM* 🎟️\n\n💳 *Ticket Price:* ${ecoSettings.currency}${ecoSettings.lotteryTicketPrice}\n🎫 *Max Tickets:* ${ecoSettings.lotteryMaxTickets} per user\n🎯 *Win Rate:* ${(ecoSettings.lotteryWinRate * 100)}%\n💎 *Prize:* ${ecoSettings.lotteryMultiplier}x ticket price\n\n📊 *Current Pool:*\n💰 *Total Pool:* ${ecoSettings.currency}${totalPool.toLocaleString()}\n🎫 *Total Tickets:* ${totalTickets}\n\n💡 *Usage:* ${context.config.PREFIX}lottery buy [tickets]`);
      return;
    }
    
    if (args[0].toLowerCase() === 'buy') {
      const ticketCount = parseInt(args[1]) || 1;
      
    newValue = parseInt(value);
    if (isNaN(newValue) || newValue < 0) {
      await reply('⚠️ *Value must be a positive number*');
      return;
    }
  }
  // Float settings (rates and percentages)
  else if ([
    'interestRate', 'robSuccessRate', 'robMaxStealPercent', 
    'gambleWinRate', 'gambleMultiplier', 'lotteryWinRate', 
    'lotteryMultiplier', 'clanBankInterest', 'taxRate'
  ].includes(setting)) {
    newValue = parseFloat(value);
    if (isNaN(newValue) || newValue < 0) {
      await reply('⚠️ *Value must be a positive number*');
      return;
    }
    // Validate percentage rates (0-1)
    if (['interestRate', 'robSuccessRate', 'robMaxStealPercent', 'gambleWinRate', 'lotteryWinRate', 'clanBankInterest', 'taxRate'].includes(setting)) {
      if (newValue > 1) {
        await reply('⚠️ *Rate values must be between 0 and 1 (e.g., 0.5 for 50%)*');
        return;
      }
    }
  }
  // String settings
  else if (['currency', 'timezone'].includes(setting)) {
    newValue = value;
  }
  // Array settings (work jobs)
  else if (setting === 'workJobs') {
    try {
      newValue = JSON.parse(value);
      if (!Array.isArray(newValue)) {
        await reply('⚠️ *Work jobs must be a valid JSON array*');
        return;
      }
    } catch {
      await reply('⚠️ *Invalid JSON format for work jobs*');
      return;
    }
  }
  else {
    await reply(`❌ *Unknown setting: ${setting}*\n\n💡 Use *${context.config.PREFIX}economy settings view* to see available settings`);
    return;
  }
  
  // Update the setting
  const oldValue = ecoSettings[setting];
  ecoSettings[setting] = newValue;
  
  try {
    await saveSettings();
    await reply(`✅ *Setting updated successfully!*\n\n📝 *Setting:* ${setting}\n📊 *Old Value:* ${oldValue}\n🔄 *New Value:* ${newValue}\n\n💾 *Changes saved to database*`);
  } catch (error) {
    // Revert the change if save failed
    ecoSettings[setting] = oldValue;
    await reply('❌ *Failed to save settings. Changes reverted.*');
    console.error('Settings save error:', error);
  }
}

// Reset settings
async function resetSettings(context, args) {
  const { reply, senderId } = context;
  
  if (!isOwner(senderId)) {
    await reply('🚫 *Only the bot owner can reset settings*');
    return;
  }
  
  if (args.length === 0) {
    await reply(`⚠️ *Usage:*\n• ${context.config.PREFIX}economy settings reset [setting]\n• ${context.config.PREFIX}economy settings reset all\n\n⚠️ *This action cannot be undone!*`);
    return;
  }
  
  if (args[0].toLowerCase() === 'all') {
    ecoSettings = { ...defaultSettings };
    await saveSettings();
    await reply('✅ *All economy settings have been reset to defaults!*');
  } else {
    const setting = args[0];
    if (defaultSettings.hasOwnProperty(setting)) {
      const oldValue = ecoSettings[setting];
      ecoSettings[setting] = defaultSettings[setting];
      await saveSettings();
      await reply(`✅ *Setting reset successfully!*\n\n📝 *Setting:* ${setting}\n📊 *Old Value:* ${oldValue}\n🔄 *New Value:* ${defaultSettings[setting]}`);
    } else {
      await reply(`❌ *Unknown setting: ${setting}*`);
    }
  }
}

// Export settings
async function exportSettings(context) {
  const { reply } = context;
  
  try {
    const settingsJson = JSON.stringify(ecoSettings, null, 2);
    await reply(`📤 *Economy Settings Export*\n\n\`\`\`json\n${settingsJson}\n\`\`\`\n\n💡 *Copy this JSON to backup your settings*`);
  } catch (error) {
    await reply('❌ *Error exporting settings*');
    console.error('Export error:', error);
  }
}

// Enhanced admin commands handler
async function handleAdminCommands(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!isAdmin(senderId) && !isOwner(senderId)) {
      await reply('🚫 *Only admins can access admin commands*');
      return;
    }
    
    if (!args || args.length === 0) {
      await showAdminMenu(context);
      return;
    }
    
    switch (args[0].toLowerCase()) {
      case 'give':
      case 'add':
        await handleAdminGiveMoney(context, args.slice(1));
        break;
      case 'take':
      case 'remove':
        await handleAdminTakeMoney(context, args.slice(1));
        break;
      case 'set':
        await handleAdminSetBalance(context, args.slice(1));
        break;
      case 'reset':
        await handleAdminResetUser(context, args.slice(1));
        break;
      case 'ban':
        await handleAdminBanUser(context, args.slice(1));
        break;
      case 'unban':
        await handleAdminUnbanUser(context, args.slice(1));
        break;
      case 'jail':
        await handleAdminJailUser(context, args.slice(1));
        break;
      case 'unjail':
        await handleAdminUnjailUser(context, args.slice(1));
        break;
      case 'vip':
        await handleAdminVIP(context, args.slice(1));
        break;
      case 'stats':
        await handleAdminStats(context);
        break;
      case 'backup':
        await handleAdminBackup(context);
        break;
      case 'wipe':
        await handleAdminWipe(context, args.slice(1));
        break;
      case 'shop':
        await handleAdminShop(context, args.slice(1));
        break;
      default:
        await reply('⚠️ *Unknown admin command*');
    }
  } catch (error) {
    await reply('❌ *Error processing admin command*');
    console.error('Admin command error:', error);
  }
}

// Show admin menu
async function showAdminMenu(context) {
  const { reply } = context;
  
  const menuText = `👨‍💼 *ADMIN PANEL* 👨‍💼\n\n` +
                  `💰 *Money Management:*\n` +
                  `• *give @user amount* - Give money to user\n` +
                  `• *take @user amount* - Take money from user\n` +
                  `• *set @user amount* - Set user's balance\n\n` +
                  `👤 *User Management:*\n` +
                  `• *reset @user* - Reset user's data\n` +
                  `• *ban @user [reason]* - Ban user from economy\n` +
                  `• *unban @user* - Unban user\n` +
                  `• *jail @user [minutes]* - Jail user\n` +
                  `• *unjail @user* - Release from jail\n` +
                  `• *vip @user [days]* - Grant VIP status\n\n` +
                  `📊 *System Management:*\n` +
                  `• *stats* - View system statistics\n` +
                  `• *backup* - Create data backup\n` +
                  `• *wipe confirm* - Wipe all economy data\n\n` +
                  `🛍️ *Shop Management:*\n` +
                  `• *shop add* - Add shop item\n` +
                  `• *shop remove [id]* - Remove shop item\n` +
                  `• *shop stock [id] [amount]* - Update stock\n\n` +
                  `💡 *Usage:* ${context.config.PREFIX}economy admin [command]`;
  
  await reply(menuText);
}

// Admin give money
async function handleAdminGiveMoney(context, args) {
  const { reply, m } = context;
  
  if (args.length < 2) {
    await reply(`⚠️ *Usage:* ${context.config.PREFIX}economy admin give @user amount [reason]`);
    return;
  }
  
  const targetUser = getTargetUser(m, args[0]);
  const amount = parseInt(args[1]);
  const reason = args.slice(2).join(' ') || 'Admin gift';
  
  if (!targetUser) {
    await reply('⚠️ *Please specify a valid user*');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await reply('⚠️ *Please provide a valid amount*');
    return;
  }
  
  await addMoney(targetUser, amount, reason);
  await reply(`✅ *Successfully gave ${ecoSettings.currency}${amount.toLocaleString()} to @${targetUser.split('@')[0]}*\n\n📝 *Reason:* ${reason}`);
}

// Admin take money
async function handleAdminTakeMoney(context, args) {
  const { reply, m } = context;
  
  if (args.length < 2) {
    await reply(`⚠️ *Usage:* ${context.config.PREFIX}economy admin take @user amount [reason]`);
    return;
  }
  
  const targetUser = getTargetUser(m, args[0]);
  const amount = parseInt(args[1]);
  const reason = args.slice(2).join(' ') || 'Admin deduction';
  
  if (!targetUser) {
    await reply('⚠️ *Please specify a valid user*');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await reply('⚠️ *Please provide a valid amount*');
    return;
  }
  
  const success = await removeMoney(targetUser, amount, reason);
  if (success) {
    await reply(`✅ *Successfully took ${ecoSettings.currency}${amount.toLocaleString()} from @${targetUser.split('@')[0]}*\n\n📝 *Reason:* ${reason}`);
  } else {
    await reply('❌ *User has insufficient balance*');
  }
}

// Admin set balance
async function handleAdminSetBalance(context, args) {
  const { reply, m } = context;
  
  if (args.length < 2) {
    await reply(`⚠️ *Usage:* ${context.config.PREFIX}economy admin set @user amount`);
    return;
  }
  
  const targetUser = getTargetUser(m, args[0]);
  const amount = parseInt(args[1]);
  
  if (!targetUser) {
    await reply('⚠️ *Please specify a valid user*');
    return;
  }
  
  if (isNaN(amount) || amount < 0) {
    await reply('⚠️ *Please provide a valid amount*');
    return;
  }
  
  await updateUserData(targetUser, { balance: amount });
  await reply(`✅ *Successfully set @${targetUser.split('@')[0]}'s balance to ${ecoSettings.currency}${amount.toLocaleString()}*`);
}

// Admin VIP management
async function handleAdminVIP(context, args) {
  const { reply, m } = context;
  
  if (args.length < 1) {
    await reply(`⚠️ *Usage:*\n• ${context.config.PREFIX}economy admin vip @user [days]\n• ${context.config.PREFIX}economy admin vip @user remove`);
    return;
  }
  
  const targetUser = getTargetUser(m, args[0]);
  if (!targetUser) {
    await reply('⚠️ *Please specify a valid user*');
    return;
  }
  
  if (args[1] === 'remove') {
    await updateUserData(targetUser, { 
      vipStatus: false, 
      vipExpiry: null 
    });
    await reply(`✅ *Removed VIP status from @${targetUser.split('@')[0]}*`);
  } else {
    const days = parseInt(args[1]) || 30;
    const vipExpiry = new Date();
    vipExpiry.setDate(vipExpiry.getDate() + days);
    
    await updateUserData(targetUser, { 
      vipStatus: true, 
      vipExpiry: vipExpiry 
    });
    await reply(`✅ *Granted ${days} days VIP status to @${targetUser.split('@')[0]}*\n\n👑 *Expires:* ${moment(vipExpiry).format('DD/MM/YYYY')}`);
  }
}

// Admin stats
async function handleAdminStats(context) {
  const { reply } = context;
  
  try {
    const totalUsers = await db.collection(COLLECTIONS.USERS).countDocuments();
    const totalClans = await db.collection(COLLECTIONS.CLANS).countDocuments();
    const totalTransactions = await db.collection(COLLECTIONS.TRANSACTIONS).countDocuments();
    
    // Calculate total economy value
    const economyStats = await db.collection(COLLECTIONS.USERS).aggregate([
      {
        $group: {
          _id: null,
          totalWalletMoney: { $sum: '$balance' },
          totalBankMoney: { $sum: '$bank' },
          totalEarned: { $sum: '$totalEarned' },
          totalSpent: { $sum: '$totalSpent' },
          totalGambled: { $sum: '$totalGambled' },
          activeUsers: { $sum: { $cond: [{ $gte: ['$balance', 1] }, 1, 0] } }
        }
      }
    ]).toArray();
    
    const stats = economyStats[0] || {};
    const totalMoney = (stats.totalWalletMoney || 0) + (stats.totalBankMoney || 0);
    
    await reply(`📊 *ECONOMY STATISTICS* 📊\n\n👥 *Users:*\n• Total Registered: ${totalUsers}\n• Active Users: ${stats.activeUsers || 0}\n\n💰 *Economy:*\n• Total Money: ${ecoSettings.currency}${totalMoney.toLocaleString()}\n• Wallet Money: ${ecoSettings.currency}${(stats.totalWalletMoney || 0).toLocaleString()}\n• Bank Money: ${ecoSettings.currency}${(stats.totalBankMoney || 0).toLocaleString()}\n• Total Earned: ${ecoSettings.currency}${(stats.totalEarned || 0).toLocaleString()}\n• Total Spent: ${ecoSettings.currency}${(stats.totalSpent || 0).toLocaleString()}\n• Total Gambled: ${ecoSettings.currency}${(stats.totalGambled || 0).toLocaleString()}\n\n🏛️ *System:*\n• Total Clans: ${totalClans}\n• Total Transactions: ${totalTransactions}\n• Database: Connected ✅\n\n⏰ *Server Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`);
  } catch (error) {
    await reply('❌ *Error loading statistics*');
    console.error('Stats error:', error);
  }
}

// Admin shop management
async function handleAdminShop(context, args) {
  const { reply } = context;
  
  if (!args || args.length === 0) {
    await reply(`🛍️ *Admin Shop Management*\n\n• *add* - Add new item\n• *remove [id]* - Remove item\n• *stock [id] [amount]* - Update stock\n• *list* - View all items\n\n💡 *Usage:* ${context.config.PREFIX}economy admin shop [command]`);
    return;
  }
  
  switch (args[0].toLowerCase()) {
    case 'add':
      await reply(`📝 *Add Shop Item Format:*\n\nSend the item details in this format:\n\`\`\`\nName: Item Name\nPrice: 1000\nDescription: Item description\nStock: 10\nType: consumable\n\`\`\`\n\n💡 *Item types: consumable, permanent, vip*`);
      break;
      
    case 'list':
      const allItems = await db.collection(COLLECTIONS.SHOP_ITEMS).find({}).toArray();
      
      if (allItems.length === 0) {
        await reply('📦 *No shop items exist*');
        return;
      }
      
      let itemsList = `🛍️ *ALL SHOP ITEMS* 🛍️\n\n`;
      allItems.forEach((item, index) => {
        itemsList += `${index + 1}. *${item.name}* (ID: ${item.id})\n`;
        itemsList += `   💰 ${ecoSettings.currency}${item.price} | 📦 Stock: ${item.stock}\n`;
        itemsList += `   🏷️ ${item.available ? 'Available' : 'Disabled'}\n\n`;
      });
      
      await reply(itemsList);
      break;
      
    case 'remove':
      if (args.length < 2) {
        await reply('⚠️ *Please specify item ID*');
        return;
      }
      
      const removeResult = await db.collection(COLLECTIONS.SHOP_ITEMS).deleteOne({ id: args[1] });
      if (removeResult.deletedCount > 0) {
        await reply(`✅ *Item ${args[1]} removed from shop*`);
      } else {
        await reply('❌ *Item not found*');
      }
      break;
      
    case 'stock':
      if (args.length < 3) {
        await reply('⚠️ *Usage: shop stock [id] [amount]*');
        return;
      }
      
      const newStock = parseInt(args[2]);
      if (isNaN(newStock) || newStock < 0) {
        await reply('⚠️ *Invalid stock amount*');
        return;
      }
      
      const stockResult = await db.collection(COLLECTIONS.SHOP_ITEMS).updateOne(
        { id: args[1] },
        { $set: { stock: newStock } }
      );
      
      if (stockResult.matchedCount > 0) {
        await reply(`✅ *Updated stock for item ${args[1]} to ${newStock}*`);
      } else {
        await reply('❌ *Item not found*');
      }
      break;
      
    default:
      await reply('⚠️ *Unknown shop admin command*');
  }
}

// Process bank interest (call this periodically)
async function processBankInterest() {
  try {
    if (!db) return;
    
    const users = await db.collection(COLLECTIONS.USERS).find({ bank: { $gt: 0 } }).toArray();
    
    for (const user of users) {
      const interest = Math.floor(user.bank * ecoSettings.interestRate);
      if (interest > 0) {
        await updateUserData(user.userId, {
          bank: user.bank + interest
        });
        
        // Log transaction
        await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({
          userId: user.userId,
          type: 'interest',
          amount: interest,
          reason: 'Daily bank interest',
          timestamp: new Date()
        });
      }
    }
    
    console.log(`💳 Processed bank interest for ${users.length} users`);
  } catch (error) {
    console.error('Bank interest error:', error);
  }
}

// Process clan bank interest
async function processClanInterest() {
  try {
    if (!db) return;
    
    const clans = await db.collection(COLLECTIONS.CLANS).find({ bank: { $gt: 0 } }).toArray();
    
    for (const clan of clans) {
      const interest = Math.floor(clan.bank * ecoSettings.clanBankInterest);
      if (interest > 0) {
        await db.collection(COLLECTIONS.CLANS).updateOne(
          { name: clan.name },
          { $inc: { bank: interest } }
        );
      }
    }
    
    console.log(`🏰 Processed clan interest for ${clans.length} clans`);
  } catch (error) {
    console.error('Clan interest error:', error);
  }
}

// Utility function to format large numbers
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Initialize default shop items
async function initializeShopItems() {
  try {
    const existingItems = await db.collection(COLLECTIONS.SHOP_ITEMS).countDocuments();
    
    if (existingItems === 0) {
      const defaultItems = [
        {
          id: 'protection_shield',
          name: '🛡️ Protection Shield',
          description: 'Reduces robbery success rate against you by 50%',
          price: 5000,
          stock: 50,
          type: 'consumable',
          available: true,
          duration: 24, // hours
          effect: 'protection'
        },
        {
          id: 'lucky_charm',
          name: '🍀 Lucky Charm',
          description: 'Increases work earnings by 25% for 12 hours',
          price: 3000,
          stock: 30,
          type: 'consumable',
          available: true,
          duration: 12,
          effect: 'work_boost'
        },
        {
          id: 'vip_pass_1day',
          name: '👑 VIP Pass (1 Day)',
          description: 'VIP status for 1 day with all benefits',
          price: 10000,
          stock: 100,
          type: 'vip',
          available: true,
          duration: 1,
          effect: 'vip'
        },
        {
          id: 'bank_upgrade',
          name: '🏦 Bank Upgrade',
          description: 'Increases bank capacity by 50%',
          price: 25000,
          stock: 20,
          type: 'permanent',
          available: true,
          effect: 'bank_upgrade'
        }
      ];
      
      await db.collection(COLLECTIONS.SHOP_ITEMS).insertMany(defaultItems);
      console.log('✅ Default shop items initialized');
    }
  } catch (error) {
    console.error('Error initializing shop items:', error);
  }
}

// Plugin initialization function
export async function initialize() {
  try {
    await initDatabase();
    await loadSettings();
    await initializeShopItems();
    
    // Set up periodic tasks
    setInterval(processBankInterest, 60 * 60 * 1000); // Every hour
    setInterval(processClanInterest, 60 * 60 * 1000); // Every hour
    
    console.log('✅ Economy plugin initialized successfully');
  } catch (error) {
    console.error('❌ Economy plugin initialization failed:', error);
  }
}

// Plugin cleanup function
export async function cleanup() {
  try {
    if (mongoClient) {
      await mongoClient.close();
      console.log('✅ Economy plugin cleanup completed');
    }
  } catch (error) {
    console.error('❌ Economy plugin cleanup error:', error);
  }
}

// Export functions for use by other plugins
export { 
  addMoney, 
  removeMoney, 
  getUserData, 
  updateUserData, 
  initUser, 
  ecoSettings,
  isAdmin,
  isOwner,
  isVIP,
  calculateRank,
  formatNumber,
  getNigeriaTime,
  getCurrentDate
};context, args) {
  const { reply, sock, from } = context;
  
  try {
    const type = args && args.length > 0 ? args[0].toLowerCase() : 'wealth';
    let sortField = {};
    let title = '';
    
    switch (type) {
      case 'wealth':
      case 'money':
        title = '💰 WEALTH LEADERBOARD 💰';
        sortField = { $add: ['$balance', '$bank'] };
        break;
      case 'level':
      case 'xp':
        title = '⭐ LEVEL LEADERBOARD ⭐';
        sortField = '$xp';
        break;
      case 'work':
        title = '💼 WORK LEADERBOARD 💼';
        sortField = '$workCount';
        break;
      case 'streak':
        title = '🔥 STREAK LEADERBOARD 🔥';
        sortField = '$longestStreak';
        break;
      case 'rob':
        title = '🦹 ROBBERY LEADERBOARD 🦹';
        sortField = '$robsSuccessful';
        break;
      default:
        await reply(`📊 *Available Leaderboards:*\n\n• *wealth* - Richest users\n• *level* - Highest level users\n• *work* - Most hardworking users\n• *streak* - Longest daily streaks\n• *rob* - Most successful robbers\n\n💡 *Usage:* ${context.config.PREFIX}leaderboard [type]`);
        return;
    }
    
    const pipeline = [
      {
        $addFields: {
          sortValue: sortField
        }
      },
      {
        $sort: { sortValue: -1 }
      },
      {
        $limit: 10
      }
    ];
    
    const users = await db.collection(COLLECTIONS.USERS).aggregate(pipeline).toArray();
    
    let lb = `🏆 ${title} 🏆\n\n`;
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const rank = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      let value = '';
      
      switch (type) {
        case 'wealth':
          value = `${ecoSettings.currency}${(user.balance + user.bank).toLocaleString()}`;
          break;
        case 'level':
          value = `Level ${user.level} (${user.xp} XP)`;
          break;
        case 'work':
          value = `${user.workCount || 0} jobs`;
          break;
        case 'streak':
          value = `${user.longestStreak || 0} days`;
          break;
        case 'rob':
          value = `${user.robsSuccessful || 0} successful`;
          break;
      }
      
      lb += `${rank} @${user.userId.split('@')[0]}\n   ${value}\n\n`;
    }
    
    await sock.sendMessage(from, {
      text: lb,
      mentions: users.map(u => u.userId)
    });
  } catch (error) {
    await reply('❌ *Error loading leaderboard. Please try again.*');
    console.error('Leaderboard error:', error);
  }
}

// Handle clan command (enhanced)
async function handleClan(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!args || args.length === 0) {
      await reply(`🛡️ *Clan Commands:*\n\n🏗️ *Management:*\n• *create [name]* - Create a clan (${ecoSettings.currency}${ecoSettings.clanCreationCost.toLocaleString()})\n• *join [name]* - Join a clan\n• *leave* - Leave your clan\n• *disband* - Disband your clan (leader only)\n\n📊 *Information:*\n• *info* - View clan information\n• *members* - View clan members\n• *list* - View all clans\n• *stats* - Clan statistics\n\n💰 *Banking:*\n• *deposit [amount]* - Deposit to clan bank\n• *withdraw [amount]* - Withdraw from clan bank (leader only)\n\n🔧 *Management:*\n• *kick @user* - Kick member (leader only)\n• *promote @user* - Promote to co-leader\n• *demote @user* - Demote co-leader\n• *upgrade* - Upgrade clan level`);
      return;
    }
    
    const subcmd = args[0].toLowerCase();
    const userData = await getUserData(senderId);
    
    switch (subcmd) {
      case 'create':
        await handleClanCreate(context, args.slice(1), userData);
        break;
      case 'join':
        await handleClanJoin(context, args.slice(1), userData);
        break;
      case 'leave':
        await handleClanLeave(context, userData);
        break;
      case 'disband':
        await handleClanDisband(context, userData);
        break;
      case 'info':
        await handleClanInfo(context, userData);
        break;
      case 'members':
        await handleClanMembers(context, userData);
        break;
      case 'list':
        await handleClanList(context);
        break;
      case 'stats':
        await handleClanStats(context, userData);
        break;
      case 'deposit':
        await handleClanDeposit(context, args.slice(1), userData);
        break;
      case 'withdraw':
        await handleClanWithdraw(context, args.slice(1), userData);
        break;
      case 'kick':
        await handleClanKick(context, args.slice(1), userData);
        break;
      case 'upgrade':
        await handleClanUpgrade(context, userData);
        break;
      default:
        await reply('⚠️ *Unknown clan command. Use clan for help*');
    }
  } catch (error) {
    await reply('❌ *Error processing clan command. Please try again.*');
    console.error('Clan error:', error);
  }
}

// Enhanced clan create
async function handleClanCreate(context, args, userData) {
  const { reply } = context;
  
  const clanName = args.join(' ');
  if (!clanName || clanName.length < 3) {
    await reply('⚠️ *Clan name must be at least 3 characters long*');
    return;
  }
  
  if (clanName.length > 20) {
    await reply('⚠️ *Clan name must be 20 characters or less*');
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
    leader: userData.userId,
    coLeaders: [],
    members: [userData.userId],
    level: 1,
    bank: 0,
    xp: 0,
    totalEarned: 0,
    description: '',
    created: new Date(),
    lastActivity: new Date()
  });
  
  await updateUserData(userData.userId, {
    clan: clanName,
    balance: userData.balance - ecoSettings.clanCreationCost
  });
  
  await reply(`✅ *Clan "${clanName}" created successfully!*\n\n👑 *You are now the clan leader*\n💰 *${ecoSettings.currency}${ecoSettings.clanCreationCost.toLocaleString()} deducted as creation fee*\n🏰 *Start inviting members to grow your clan!*`);
}

// Handle shop command (enhanced)
async function handleShop(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.shopEnabled) {
      await reply('🚫 *Shop is currently disabled*');
      return;
    }
    
    if (!args || args.length === 0) {
      const shopItems = await db.collection(COLLECTIONS.SHOP_ITEMS).find({ available: true }).toArray();
      
      if (shopItems.length === 0) {
        await reply(`🛍️ *ECONOMY SHOP* 🛍️\n\n📦 *No items available*\n\n💡 *Check back later or contact an admin*`);
        return;
      }
      
      let shopText = `🛍️ *ECONOMY SHOP* 🛍️\n\n`;
      shopItems.forEach((item, index) => {
        shopText += `${index + 1}. *${item.name}*\n`;
        shopText += `   💰 ${ecoSettings.currency}${item.price.toLocaleString()}\n`;
        shopText += `   📝 ${item.description}\n`;
        shopText += `   📦 ${item.stock > 0 ? `${item.stock} in stock` : 'Out of stock'}\n\n`;
      });
      
      shopText += `💡 *Usage:* ${context.config.PREFIX}shop buy [item number]`;
      await reply(shopText);
      return;
    }
    
    if (args[0].toLowerCase() === 'buy') {
      const itemIndex = parseInt(args[1]) - 1;
      const quantity = parseInt(args[2]) || 1;
      
      const shopItems = await db.collection(COLLECTIONS.SHOP_ITEMS).find({ available: true }).toArray();
      
      if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= shopItems.length) {
        await reply('⚠️ *Invalid item number*');
        return;
      }
      
      const item = shopItems[itemIndex];
      if (item.stock < quantity) {
        await reply(`📦 *Insufficient stock. Only ${item.stock} available*`);
        return;
      }
      
      const totalCost = item.price * quantity;
      const userData = await getUserData(senderId);
      
      if (userData.balance < totalCost) {
        await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n💸 *Required:* ${ecoSettings.currency}${totalCost.toLocaleString()}`);
        return;
      }
      
      // Process purchase
      await removeMoney(senderId, totalCost, `Shop purchase: ${item.name}`);
      
      // Add to inventory
      const inventory = userData.inventory || [];
      const existingItem = inventory.find(invItem => invItem.id === item.id);
      
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        inventory.push({
          id: item.id,
          name: item.name,
          quantity: quantity,
          purchasedAt: new Date()
        });
      }
      
      await updateUserData(senderId, { inventory });
      
      // Update shop stock
      await db.collection(COLLECTIONS.SHOP_ITEMS).updateOne(
        { id: item.id },
        { $inc: { stock: -quantity, sold: quantity } }
      );
      
      await reply(`✅ *Purchase successful!*\n\n🛒 *Item:* ${item.name} x${quantity}\n💸 *Cost:* ${ecoSettings.currency}${totalCost.toLocaleString()}\n📦 *Added to your inventory*`);
    }
  } catch (error) {
    await reply('❌ *Error accessing shop. Please try again.*');
    console.error('Shop error:', error);
  }
}

// Handle inventory command
async function handleInventory(context, args) {
  const { reply, senderId } = context;
  
  try {
    const userData = await getUserData(senderId);
    
    if (!userData.inventory || userData.inventory.length === 0) {
      await reply('📦 *Your inventory is empty*\n\n🛍️ Visit the shop to buy items!');
      return;
    }
    
    if (args && args.length > 0 && args[0].toLowerCase() === 'use') {
      const itemIndex = parseInt(args[1]) - 1;
      
      if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= userData.inventory.length) {
        await reply('⚠️ *Invalid item number*');
        return;
      }
      
      const item = userData.inventory[itemIndex];
      // Handle item usage logic here based on item type
      await reply(`✨ *Used ${item.name}!*\n\n🎮 *Item effects will be implemented soon*`);
      return;
    }
    
    let invText = '📦 *YOUR INVENTORY* 📦\n\n';
    userData.inventory.forEach((item, index) => {
      invText += `${index + 1}. *${item.name}* x${item.quantity}\n`;
      invText += `   📅 Purchased: ${moment(item.purchasedAt).format('DD/MM/YYYY')}\n\n`;
    });
    
    invText += `💡 *Usage:* ${context.config.PREFIX}inventory use [item number]`;
    
    await reply(invText);
  } catch (error) {
    await reply('❌ *Error loading inventory. Please try again.*');
    console.error('Inventory error:', error);
  }
}

// Enhanced admin settings handler
async function handleSettings(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!isAdmin(senderId) && !isOwner(senderId)) {
      await reply('🚫 *Only admins can access economy settings*');
      return;
    }
    
    if (!args || args.length === 0) {
      await showSettingsMenu(context);
      return;
    }
    
    switch (args[0].toLowerCase()) {
      case 'view':
      case 'show':
        await showDetailedSettings(context, args.slice(1));
        break;
      case 'set':
        await setSettingValue(context, args.slice(1));
        break;
      case 'reset':
        await resetSettings(context, args.slice(1));
        break;
      case 'export':
        await exportSettings(context);
        break;
      case 'import':
        await importSettings(context, args.slice(1));
        break;
      case 'backup':
        await backupSettings(context);
        break;
      default:
        await reply('⚠️ *Unknown settings command*');
    }
  } catch (error) {
    await reply('❌ *Error accessing settings. Please try again.*');
    console.error('Settings error:', error);
  }
}

// Show settings menu
async function showSettingsMenu(context) {
  const { reply } = context;
  
  const menuText = `⚙️ *ECONOMY SETTINGS PANEL* ⚙️\n\n` +
                  `📊 *View Commands:*\n` +
                  `• *view* - Show all settings\n` +
                  `• *view [category]* - Show specific category\n\n` +
                  `✏️ *Modify Commands:*\n` +
                  `• *set [setting] [value]* - Update a setting\n` +
                  `• *reset [setting]* - Reset to default\n` +
                  `• *reset all* - Reset all settings\n\n` +
                  `💾 *Data Commands:*\n` +
                  `• *export* - Export current settings\n` +
                  `• *backup* - Create settings backup\n\n` +
                  `📋 *Categories:* economy, daily, work, rob, gamble, lottery, clan, shop, tax\n\n` +
                  `💡 *Usage:* ${context.config.PREFIX}economy settings [command]`;
  
  await reply(menuText);
}

// Show detailed settings
async function showDetailedSettings(context, args) {
  const { reply } = context;
  
  const category = args.length > 0 ? args[0].toLowerCase() : 'all';
  
  let settingsText = `⚙️ *ECONOMY SETTINGS* ⚙️\n\n`;
  
  if (category === 'all' || category === 'economy') {
    settingsText += `💰 *Basic Economy:*\n`;
    settingsText += `• startingBalance: ${ecoSettings.currency}${ecoSettings.startingBalance}\n`;
    settingsText += `• startingBankBalance: ${ecoSettings.currency}${ecoSettings.startingBankBalance}\n`;
    settingsText += `• currency: ${ecoSettings.currency}\n`;
    settingsText += `• maxWalletBalance: ${ecoSettings.currency}${ecoSettings.maxWalletBalance.toLocaleString()}\n`;
    settingsText += `• maxBankBalance: ${ecoSettings.currency}${ecoSettings.maxBankBalance.toLocaleString()}\n`;
    settingsText += `• interestRate: ${(ecoSettings.interestRate * 100)}%\n\n`;
  }
  
  if (category === 'all' || category === 'daily') {
    settingsText += `🎁 *Daily Rewards:*\n`;
    settingsText += `• dailyMinAmount: ${ecoSettings.currency}${ecoSettings.dailyMinAmount}\n`;
    settingsText += `• dailyMaxAmount: ${ecoSettings.currency}${ecoSettings.dailyMaxAmount}\n`;
    settingsText += `• dailyStreakBonus: ${ecoSettings.currency}${ecoSettings.dailyStreakBonus}\n`;
    settingsText += `• dailyMaxStreak: ${ecoSettings.dailyMaxStreak} days\n\n`;
  }
  
  if (category === 'all' || category === 'work') {
    settingsText += `💼 *Work System:*\n`;
    settingsText += `• workCooldownMinutes: ${ecoSettings.workCooldownMinutes} min\n`;
    settingsText += `• vipWorkCooldown: ${ecoSettings.vipWorkCooldown} min\n`;
    settingsText += `• workJobs: ${ecoSettings.workJobs.length} available\n\n`;
  }
  
  if (category === 'all' || category === 'rob') {
    settingsText += `🦹 *Robbery System:*\n`;
    settingsText += `• robSuccessRate: ${(ecoSettings.robSuccessRate * 100)}%\n`;
    settingsText += `• robCooldownMinutes: ${ecoSettings.robCooldownMinutes} min\n`;
    settingsText += `• vipRobCooldown: ${ecoSettings.vipRobCooldown} min\n`;
    settingsText += `• robMaxStealPercent: ${(ecoSettings.robMaxStealPercent * 100)}%\n`;
    settingsText += `• robFailPenalty: ${ecoSettings.currency}${ecoSettings.robFailPenalty}\n`;
    settingsText += `• robJailTime: ${ecoSettings.robJailTime} min\n\n`;
  }
  
  if (category === 'all' || category === 'gamble') {
    settingsText += `🎲 *Gambling System:*\n`;
    settingsText += `• gambleEnabled: ${ecoSettings.gambleEnabled ? 'Yes' : 'No'}\n`;
    settingsText += `• gambleMinBet: ${ecoSettings.currency}${ecoSettings.gambleMinBet}\n`;
    settingsText += `• gambleMaxBet: ${ecoSettings.currency}${ecoSettings.gambleMaxBet}\n`;
    settingsText += `• gambleWinRate: ${(ecoSettings.gambleWinRate * 100)}%\n`;
    settingsText += `• gambleMultiplier: ${ecoSettings.gambleMultiplier}x\n\n`;
  }
  
  if (category === 'all' || category === 'lottery') {
    settingsText += `🎟️ *Lottery System:*\n`;
    settingsText += `• lotteryEnabled: ${ecoSettings.lotteryEnabled ? 'Yes' : 'No'}\n`;
    settingsText += `• lotteryTicketPrice: ${ecoSettings.currency}${ecoSettings.lotteryTicketPrice}\n`;
    settingsText += `• lotteryMaxTickets: ${ecoSettings.lotteryMaxTickets}\n`;
    settingsText += `• lotteryWinRate: ${(ecoSettings.lotteryWinRate * 100)}%\n\n`;
  }
  
  if (category === 'all' || category === 'clan') {
    settingsText += `🛡️ *Clan System:*\n`;
    settingsText += `• clanCreationCost: ${ecoSettings.currency}${ecoSettings.clanCreationCost.toLocaleString()}\n`;
    settingsText += `• clanMaxMembers: ${ecoSettings.clanMaxMembers}\n`;
    settingsText += `• clanBankInterest: ${(ecoSettings.clanBankInterest * 100)}%\n\n`;
  }
  
  if (category === 'all' || category === 'tax') {
    settingsText += `🏛️ *Tax System:*\n`;
    settingsText += `• taxEnabled: ${ecoSettings.taxEnabled ? 'Yes' : 'No'}\n`;
    settingsText += `• taxRate: ${(ecoSettings.taxRate * 100)}%\n`;
    settingsText += `• taxThreshold: ${ecoSettings.currency}${ecoSettings.taxThreshold.toLocaleString()}\n\n`;
  }
  
  settingsText += `💡 *Use:* ${context.config.PREFIX}economy settings set [setting] [value]`;
  
  await reply(settingsText);
}

// Set setting value
async function setSetting


Setting value
async function setSettingValue(context, args) {
  const { reply, senderId } = context;
  
  if (!isOwner(senderId)) {
    await reply('🚫 *Only the bot owner can modify settings*');
    return;
  }
  
  if (args.length < 2) {
    await reply(`⚠️ *Usage:* ${context.config.PREFIX}economy settings set [setting] [value]\n\n💡 *Example:* ${context.config.PREFIX}economy settings set dailyMinAmount 1000`);
    return;
  }
  
  const setting = args[0];
  const value = args.slice(1).join(' ');
  
  // Validate and convert values based on setting type
  let newValue = value;
  
  // Boolean settings
  if (['gambleEnabled', 'lotteryEnabled', 'shopEnabled', 'taxEnabled'].includes(setting)) {
    newValue = ['true', 'yes', '1', 'on'].includes(value.toLowerCase());
  }
  // Integer settings
  else if ([
    'startingBalance', 'startingBankBalance', 'maxWalletBalance', 'maxBankBalance',
    'dailyMinAmount', 'dailyMaxAmount', 'dailyStreakBonus', 'dailyMaxStreak',
    'workCooldownMinutes', 'vipWorkCooldown', 'vipRobCooldown',
    'robCooldownMinutes', 'robMinTargetBalance', 'robMinRobberBalance',
    'robMinSteal', 'robFailPenalty', 'robJailTime',
    'gambleMinBet', 'gambleMaxBet', 'gambleCooldownMinutes',
    'lotteryTicketPrice', 'lotteryMaxTickets', 'lotteryDrawInterval',
    'clanCreationCost', 'clanMaxMembers', 'taxThreshold'
  ].includes(setting)) {
    newValue = parseInt(value