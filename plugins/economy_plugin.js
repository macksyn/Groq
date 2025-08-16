// plugins/economy_enhanced.js - Enhanced Economy plugin with all features
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';

// Plugin information export
export const info = {
  name: 'Enhanced Economy System',
  version: '3.0.0',
  author: 'Bot Developer',
  description: 'Complete economy system with gambling, investments, shop, achievements and more',
  commands: [
    // Basic Economy
    { name: 'economy', aliases: ['eco', 'money'], description: 'Access the economy system' },
    { name: 'balance', aliases: ['bal', 'wallet'], description: 'Check your balance' },
    { name: 'send', aliases: ['transfer', 'pay'], description: 'Send money to someone' },
    { name: 'deposit', aliases: ['dep'], description: 'Deposit money to bank' },
    { name: 'withdraw', aliases: ['wd'], description: 'Withdraw money from bank' },
    
    // Earning
    { name: 'work', aliases: [], description: 'Work to earn money' },
    { name: 'rob', aliases: [], description: 'Rob someone (risky!)' },
    { name: 'daily', aliases: [], description: 'Claim daily reward' },
    { name: 'heist', aliases: [], description: 'Plan team robberies' },
    
    // Gambling & Games
    { name: 'coinflip', aliases: ['cf'], description: 'Bet on coin flip' },
    { name: 'dice', aliases: [], description: 'Roll dice for money' },
    { name: 'slots', aliases: [], description: 'Play slot machine' },
    { name: 'lottery', aliases: [], description: 'Buy lottery tickets' },
    { name: 'roulette', aliases: [], description: 'Russian roulette game' },
    { name: 'guess', aliases: [], description: 'Number guessing game' },
    
    // Investments
    { name: 'invest', aliases: [], description: 'Investment system' },
    { name: 'stocks', aliases: [], description: 'Stock market' },
    { name: 'crypto', aliases: [], description: 'Cryptocurrency trading' },
    { name: 'business', aliases: [], description: 'Buy businesses' },
    
    // Social & Achievements
    { name: 'profile', aliases: [], description: 'View user profile' },
    { name: 'leaderboard', aliases: ['lb'], description: 'View top users' },
    { name: 'achievements', aliases: ['ach'], description: 'View achievements' },
    { name: 'clan', aliases: [], description: 'Clan system commands' },
    
    // Shop & Items
    { name: 'shop', aliases: [], description: 'Browse shop items' },
    { name: 'inventory', aliases: ['inv'], description: 'View your inventory' },
    { name: 'use', aliases: [], description: 'Use an item' },
    { name: 'vault', aliases: [], description: 'Access private vault' },
    
    // Events & Admin
    { name: 'events', aliases: [], description: 'View active events' },
    { name: 'bounty', aliases: [], description: 'Bounty hunting system' }
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
  ACHIEVEMENTS: 'economy_achievements',
  INVESTMENTS: 'economy_investments',
  EVENTS: 'economy_events',
  LOTTERY: 'economy_lottery',
  BUSINESSES: 'economy_businesses'
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
    await db.collection(COLLECTIONS.INVESTMENTS).createIndex({ userId: 1, type: 1 });
    
    console.log('✅ MongoDB connected successfully');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Enhanced economy settings with all new features
const defaultSettings = {
  // Basic Economy
  startingBalance: 1000,
  startingBankBalance: 0,
  currency: '₦',
  timezone: 'Africa/Lagos',
  maxWalletBalance: 1000000,
  maxBankBalance: 10000000,
  
  // Daily System
  dailyMinAmount: 500,
  dailyMaxAmount: 1500,
  dailyStreakBonus: 100, // Per day streak
  
  // Work System
  workCooldownMinutes: 45,
  workJobs: [
    { name: 'Uber Driver', min: 300, max: 1000, cooldown: 60 },
    { name: 'Food Delivery', min: 200, max: 800, cooldown: 45 },
    { name: 'Freelancer', min: 500, max: 1500, cooldown: 90 },
    { name: 'Teacher', min: 400, max: 1200, cooldown: 75 },
    { name: 'Doctor', min: 800, max: 2000, cooldown: 120 },
    { name: 'Engineer', min: 600, max: 1800, cooldown: 105 },
    { name: 'Trader', min: 100, max: 3000, cooldown: 60 } // High risk/reward
  ],
  
  // Robbery System
  robCooldownMinutes: 90,
  robSuccessRate: 0.65,
  robMaxStealPercent: 0.25,
  robMinTargetBalance: 200,
  robMinRobberBalance: 150,
  robMinSteal: 20,
  robFailPenalty: 200,
  
  // Heist System
  heistCooldownHours: 6,
  heistMinMembers: 3,
  heistMaxMembers: 6,
  heistSuccessBaseRate: 0.3,
  heistMemberBonus: 0.1, // Per additional member
  
  // Gambling Settings
  gamblingEnabled: true,
  coinflipMinBet: 10,
  coinflipMaxBet: 50000,
  diceMinBet: 10,
  diceMaxBet: 25000,
  slotsMinBet: 25,
  slotsMaxBet: 10000,
  slotJackpot: 100000,
  rouletteMinBet: 100,
  rouletteMaxBet: 75000,
  
  // Lottery System
  lotteryEnabled: true,
  lotteryTicketPrice: 500,
  lotteryMaxTickets: 10,
  lotteryDrawDays: [0, 3, 6], // Sunday, Wednesday, Saturday
  lotteryJackpotSeed: 50000,
  
  // Investment System
  investmentsEnabled: true,
  stockMarketVolatility: 0.15,
  cryptoVolatility: 0.35,
  businessROI: 0.08, // 8% daily return
  
  // Shop Settings
  shopEnabled: true,
  itemEffectDuration: {
    workBoost: 86400000, // 24 hours
    robProtection: 172800000, // 48 hours
    dailyBoost: 604800000 // 7 days
  },
  
  // Clan Settings
  clanCreationCost: 10000,
  clanMaxMembers: 20,
  clanBankTax: 0.05, // 5% of deposits
  clanWarEnabled: true,
  
  // Achievement Settings
  achievementRewards: {
    firstDaily: 1000,
    firstWork: 500,
    firstRob: 2000,
    millionaire: 50000,
    robKing: 25000
  },
  
  // Event Settings
  eventsEnabled: true,
  doubleMoneyDuration: 3600000, // 1 hour
  marketCrashChance: 0.02, // 2% daily
  
  // Admin Settings
  adminCanModifyBalances: true,
  adminCanCreateEvents: true,
  adminCanResetCooldowns: true,
  ownerCanAccessAllSettings: true
};

// Load and save settings (same as before but enhanced)
let ecoSettings = { ...defaultSettings };

async function loadSettings() {
  try {
    const settings = await db.collection(COLLECTIONS.SETTINGS).findOne({ type: 'economy' });
    if (settings) {
      ecoSettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading economy settings:', error);
  }
}

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

// Enhanced user initialization with new fields
async function initUser(userId) {
  try {
    const existingUser = await db.collection(COLLECTIONS.USERS).findOne({ userId });
    
    if (!existingUser) {
      const newUser = {
        userId,
        // Basic Economy
        balance: ecoSettings.startingBalance,
        bank: ecoSettings.startingBankBalance,
        vault: 0, // Private secure storage
        
        // Inventory & Items
        inventory: [],
        activeEffects: {},
        
        // Social
        clan: null,
        bounty: 0,
        rank: 'Newbie',
        customTitle: null,
        
        // Stats & Achievements
        stats: {
          totalEarned: 0,
          totalSpent: 0,
          totalGambled: 0,
          robsSuccessful: 0,
          robsAttempted: 0,
          workCount: 0,
          dailyStreak: 0,
          maxDailyStreak: 0
        },
        achievements: [],
        
        // Investments
        investments: {
          stocks: {},
          crypto: {},
          businesses: []
        },
        
        // Cooldowns
        lastDaily: null,
        lastWork: null,
        lastRob: null,
        lastHeist: null,
        lastGamble: null,
        
        // System
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection(COLLECTIONS.USERS).insertOne(newUser);
      await checkAchievements(userId, 'registration');
      return newUser;
    } else {
      // Backward compatibility - add missing fields
      const updates = {};
      let needsUpdate = false;
      
      const requiredFields = {
        vault: 0,
        activeEffects: {},
        customTitle: null,
        stats: {
          totalEarned: 0,
          totalSpent: 0,
          totalGambled: 0,
          robsSuccessful: 0,
          robsAttempted: 0,
          workCount: 0,
          dailyStreak: 0,
          maxDailyStreak: 0
        },
        achievements: [],
        investments: {
          stocks: {},
          crypto: {},
          businesses: []
        }
      };
      
      for (const [field, defaultValue] of Object.entries(requiredFields)) {
        if (existingUser[field] === undefined) {
          updates[field] = defaultValue;
          needsUpdate = true;
        }
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

// Shop Items Database
const SHOP_ITEMS = {
  // Consumable Items
  workBoost: {
    name: "Work Boost",
    price: 3000,
    description: "Double work earnings for 24 hours",
    type: "consumable",
    effect: "workBoost",
    emoji: "⚡"
  },
  robProtection: {
    name: "Robbery Protection",
    price: 8000,
    description: "Prevents robberies for 48 hours",
    type: "consumable", 
    effect: "robProtection",
    emoji: "🛡️"
  },
  dailyBoost: {
    name: "Lucky Charm",
    price: 2500,
    description: "Increases daily reward by 50% for 7 days",
    type: "consumable",
    effect: "dailyBoost",
    emoji: "🍀"
  },
  gamblingLuck: {
    name: "Rabbit's Foot",
    price: 5000,
    description: "Increases gambling luck for 12 hours",
    type: "consumable",
    effect: "gamblingLuck",
    emoji: "🐰"
  },
  
  // Permanent Upgrades
  vipStatus: {
    name: "VIP Status",
    price: 100000,
    description: "Permanent 25% bonus to all earnings",
    type: "permanent",
    effect: "vipBonus",
    emoji: "👑"
  },
  privateVault: {
    name: "Private Vault",
    price: 50000,
    description: "Secure storage that can't be robbed",
    type: "upgrade",
    effect: "vault",
    emoji: "🔐"
  },
  
  // Tools & Equipment
  lockpicks: {
    name: "Professional Lockpicks",
    price: 1200,
    description: "Increases robbery success rate by 20%",
    type: "tool",
    effect: "robberyBoost",
    uses: 3,
    emoji: "🗝️"
  },
  businessSuit: {
    name: "Designer Business Suit",
    price: 4500,
    description: "Increases work earnings by 35%",
    type: "equipment",
    effect: "workBonus",
    emoji: "👔"
  },
  
  // Cosmetic Items
  goldenCrown: {
    name: "Golden Crown",
    price: 250000,
    description: "Shows 👑 next to your name in leaderboards",
    type: "cosmetic",
    effect: "crown",
    emoji: "👑"
  },
  customTitle: {
    name: "Custom Title",
    price: 25000,
    description: "Set a custom rank title",
    type: "cosmetic",
    effect: "customTitle",
    emoji: "📛"
  },
  
  // Special Items
  heistPlans: {
    name: "Heist Plans",
    price: 15000,
    description: "Reduces heist cooldown by 50%",
    type: "consumable",
    effect: "heistCooldown",
    emoji: "📋"
  },
  marketTip: {
    name: "Market Insider Info",
    price: 10000,
    description: "Guarantees profitable investment for 1 trade",
    type: "consumable",
    effect: "marketTip",
    emoji: "📊"
  }
};

// Achievement definitions
const ACHIEVEMENTS = {
  firstDaily: {
    name: "Daily Grind",
    description: "Claim your first daily reward",
    reward: 1000,
    emoji: "🌅"
  },
  firstWork: {
    name: "Hard Worker",
    description: "Complete your first work",
    reward: 500,
    emoji: "💼"
  },
  firstRob: {
    name: "First Heist",
    description: "Successfully rob someone for the first time",
    reward: 2000,
    emoji: "🦹"
  },
  millionaire: {
    name: "Millionaire",
    description: "Accumulate 1 million in total wealth",
    reward: 50000,
    emoji: "💰"
  },
  gamblingAddict: {
    name: "High Roller",
    description: "Gamble 100,000 total",
    reward: 10000,
    emoji: "🎰"
  },
  robKing: {
    name: "Robbery King",
    description: "Successfully rob 50 people",
    reward: 25000,
    emoji: "👑"
  },
  streakMaster: {
    name: "Consistency King",
    description: "Maintain a 30-day daily streak",
    reward: 30000,
    emoji: "🔥"
  },
  clanLeader: {
    name: "Clan Leader",
    description: "Create and lead a clan",
    reward: 5000,
    emoji: "🛡️"
  },
  jackpotWinner: {
    name: "Jackpot Winner",
    description: "Win a slots jackpot",
    reward: 20000,
    emoji: "🎯"
  },
  businessTycoon: {
    name: "Business Tycoon",
    description: "Own 5 different businesses",
    reward: 75000,
    emoji: "🏢"
  }
};

// Utility functions (keeping existing ones and adding new ones)
async function getUserData(userId) {
  try {
    await initUser(userId);
    return await db.collection(COLLECTIONS.USERS).findOne({ userId });
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
}

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

// Enhanced money functions with effect bonuses
async function addMoney(userId, amount, reason = 'Unknown', applyEffects = true) {
  try {
    const user = await getUserData(userId);
    let finalAmount = amount;
    
    // Apply active effects if enabled
    if (applyEffects && user.activeEffects) {
      if (user.activeEffects.vipBonus) {
        finalAmount *= 1.25; // VIP 25% bonus
      }
      if (user.activeEffects.workBoost && reason.includes('work')) {
        finalAmount *= 2; // Work boost doubles work earnings
      }
      if (user.activeEffects.dailyBoost && reason.includes('daily')) {
        finalAmount *= 1.5; // Daily boost 50% more
      }
    }
    
    finalAmount = Math.floor(finalAmount);
    const newBalance = Math.min(user.balance + finalAmount, ecoSettings.maxWalletBalance);
    
    await updateUserData(userId, { 
      balance: newBalance,
      'stats.totalEarned': (user.stats?.totalEarned || 0) + finalAmount
    });
    
    // Log transaction
    await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({
      userId,
      type: 'credit',
      amount: finalAmount,
      reason,
      balanceBefore: user.balance,
      balanceAfter: newBalance,
      timestamp: new Date()
    });
    
    // Check achievements
    await checkAchievements(userId, 'money', { amount: finalAmount, total: user.stats?.totalEarned || 0 + finalAmount });
    
    return newBalance;
  } catch (error) {
    console.error('Error adding money:', error);
    throw error;
  }
}

async function removeMoney(userId, amount, reason = 'Unknown') {
  try {
    const user = await getUserData(userId);
    if (user.balance >= amount) {
      const newBalance = user.balance - amount;
      
      await updateUserData(userId, { 
        balance: newBalance,
        'stats.totalSpent': (user.stats?.totalSpent || 0) + amount
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
      
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error removing money:', error);
    throw error;
  }
}

// Achievement checking system
async function checkAchievements(userId, type, data = {}) {
  try {
    const user = await getUserData(userId);
    const newAchievements = [];
    
    switch (type) {
      case 'registration':
        if (!user.achievements.includes('firstDaily')) {
          // This will be awarded when they claim first daily
        }
        break;
        
      case 'daily':
        if (!user.achievements.includes('firstDaily')) {
          newAchievements.push('firstDaily');
        }
        if (data.streak >= 30 && !user.achievements.includes('streakMaster')) {
          newAchievements.push('streakMaster');
        }
        break;
        
      case 'work':
        if (!user.achievements.includes('firstWork')) {
          newAchievements.push('firstWork');
        }
        break;
        
      case 'rob':
        if (data.successful && !user.achievements.includes('firstRob')) {
          newAchievements.push('firstRob');
        }
        if (data.successfulCount >= 50 && !user.achievements.includes('robKing')) {
          newAchievements.push('robKing');
        }
        break;
        
      case 'money':
        const totalWealth = user.balance + user.bank + (user.vault || 0);
        if (totalWealth >= 1000000 && !user.achievements.includes('millionaire')) {
          newAchievements.push('millionaire');
        }
        break;
        
      case 'gambling':
        if (data.totalGambled >= 100000 && !user.achievements.includes('gamblingAddict')) {
          newAchievements.push('gamblingAddict');
        }
        if (data.jackpot && !user.achievements.includes('jackpotWinner')) {
          newAchievements.push('jackpotWinner');
        }
        break;
        
      case 'clan':
        if (data.created && !user.achievements.includes('clanLeader')) {
          newAchievements.push('clanLeader');
        }
        break;
        
      case 'business':
        if (data.businessCount >= 5 && !user.achievements.includes('businessTycoon')) {
          newAchievements.push('businessTycoon');
        }
        break;
    }
    
    // Award new achievements
    if (newAchievements.length > 0) {
      await updateUserData(userId, {
        achievements: [...user.achievements, ...newAchievements]
      });
      
      // Give rewards
      let totalReward = 0;
      for (const achName of newAchievements) {
        if (ACHIEVEMENTS[achName]) {
          totalReward += ACHIEVEMENTS[achName].reward;
        }
      }
      
      if (totalReward > 0) {
        await addMoney(userId, totalReward, 'Achievement rewards', false);
      }
      
      return newAchievements;
    }
    
    return [];
  } catch (error) {
    console.error('Error checking achievements:', error);
    return [];
  }
}

// Item usage system
async function useItem(userId, itemId) {
  try {
    const user = await getUserData(userId);
    const itemIndex = user.inventory.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return { success: false, message: 'Item not found in inventory' };
    }
    
    const item = user.inventory[itemIndex];
    const shopItem = SHOP_ITEMS[item.id];
    
    if (!shopItem) {
      return { success: false, message: 'Invalid item' };
    }
    
    // Apply item effect
    const updates = { activeEffects: { ...user.activeEffects } };
    
    switch (shopItem.type) {
      case 'consumable':
        const duration = ecoSettings.itemEffectDuration[shopItem.effect] || 3600000;
        updates.activeEffects[shopItem.effect] = Date.now() + duration;
        break;
        
      case 'permanent':
        updates.activeEffects[shopItem.effect] = true;
        break;
        
      case 'tool':
        if (item.uses > 1) {
          user.inventory[itemIndex].uses -= 1;
          updates.inventory = user.inventory;
        } else {
          user.inventory.splice(itemIndex, 1);
          updates.inventory = user.inventory;
        }
        updates.activeEffects[shopItem.effect] = (updates.activeEffects[shopItem.effect] || 0) + 1;
        break;
    }
    
    // Remove consumable items after use
    if (shopItem.type === 'consumable') {
      if (item.quantity > 1) {
        user.inventory[itemIndex].quantity -= 1;
        updates.inventory = user.inventory;
      } else {
        user.inventory.splice(itemIndex, 1);
        updates.inventory = user.inventory;
      }
    }
    
    await updateUserData(userId, updates);
    
    return { 
      success: true, 
      message: `Successfully used ${shopItem.name}!`,
      effect: shopItem.description
    };
  } catch (error) {
    console.error('Error using item:', error);
    return { success: false, message: 'Error using item' };
  }
}

// Helper functions
function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

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

// Clean up expired effects
async function cleanupExpiredEffects(userId) {
  try {
    const user = await getUserData(userId);
    if (!user.activeEffects) return;
    
    const now = Date.now();
    const cleanEffects = {};
    let needsUpdate = false;
    
    for (const [effect, expiry] of Object.entries(user.activeEffects)) {
      if (typeof expiry === 'boolean' || expiry > now) {
        cleanEffects[effect] = expiry;
      } else {
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      await updateUserData(userId, { activeEffects: cleanEffects });
    }
  } catch (error) {
    console.error('Error cleaning up expired effects:', error);
  }
}

// Main plugin handler - Enhanced but kept lightweight
export default async function economyHandler(m, sock, config) {
  try {
    if (!m || !m.body || typeof m.body !== 'string') return;
    if (!config || !config.PREFIX || typeof config.PREFIX !== 'string') return;
    if (!m.body.startsWith(config.PREFIX)) return;

    let messageBody = m.body.slice(config.PREFIX.length).trim();
    if (!messageBody) return;

    let args = messageBody.split(' ').filter(arg => arg.length > 0);
    if (args.length === 0) return;
    
    let command = args[0].toLowerCase();
    let senderId = m.key.participant || m.key.remoteJid;
    let from = m.key.remoteJid;
    
    if (!senderId || !from) return;

    // Initialize database and user
    if (!db) {
      await initDatabase();
      await loadSettings();
    }
    
    await initUser(senderId);
    await cleanupExpiredEffects(senderId);
    
    const reply = async (text) => {
      try {
        if (!text || typeof text !== 'string') return;
        await sock.sendMessage(from, { text }, { quoted: m });
      } catch (error) {
        console.error('Error sending reply:', error);
      }
    };
    
    const context = { m, sock, config, senderId, from, reply };
    
    // Handle different commands
    switch (command) {
      // Basic Economy Commands
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
        
      case 'vault':
        await handleVault(context, args.slice(1));
        break;
        
      // Earning Commands
      case 'work':
        await handleWork(context);
        break;
        
      case 'rob':
        await handleRob(context, args.slice(1));
        break;
        
      case 'daily':
        await handleDaily(context);
        break;
        
      case 'heist':
        await handleHeist(context, args.slice(1));
        break;
        
      // Gambling Commands
      case 'coinflip':
      case 'cf':
        await handleCoinflip(context, args.slice(1));
        break;
        
      case 'dice':
        await handleDice(context, args.slice(1));
        break;
        
      case 'slots':
        await handleSlots(context, args.slice(1));
        break;
        
      case 'lottery':
        await handleLottery(context, args.slice(1));
        break;
        
      case 'roulette':
        await handleRoulette(context, args.slice(1));
        break;
        
      case 'guess':
        await handleGuess(context, args.slice(1));
        break;
        
      // Investment Commands
      case 'invest':
        await handleInvest(context, args.slice(1));
        break;
        
      case 'stocks':
        await handleStocks(context, args.slice(1));
        break;
        
      case 'crypto':
        await handleCrypto(context, args.slice(1));
        break;
        
      case 'business':
        await handleBusiness(context, args.slice(1));
        break;
        
      // Social Commands
      case 'profile':
        await handleProfile(context, args.slice(1));
        break;
        
      case 'leaderboard':
      case 'lb':
        await handleLeaderboard(context, args.slice(1));
        break;
        
      case 'achievements':
      case 'ach':
        await handleAchievements(context, args.slice(1));
        break;
        
      case 'clan':
        await handleClan(context, args.slice(1));
        break;
        
      // Shop Commands
      case 'shop':
        await handleShop(context, args.slice(1));
        break;
        
      case 'inventory':
      case 'inv':
        await handleInventory(context);
        break;
        
      case 'use':
        await handleUse(context, args.slice(1));
        break;
        
      // Event Commands
      case 'events':
        await handleEvents(context);
        break;
        
      case 'bounty':
        await handleBounty(context, args.slice(1));
        break;
        
      default:
        break;
    }
  } catch (error) {
    console.error('❌ Economy plugin error:', error.message);
  }
}

// Enhanced Economy Menu
async function showEconomyMenu(reply, prefix) {
  try {
    const menuText = `💰 *ENHANCED ECONOMY SYSTEM* 💰\n\n` +
                    `💵 *Basic Commands:*\n` +
                    `• *balance* - Check balance & vault\n` +
                    `• *send @user amount* - Transfer money\n` +
                    `• *deposit/withdraw amount* - Bank operations\n` +
                    `• *vault* - Access secure storage\n\n` +
                    `💼 *Earning:*\n` +
                    `• *work* - Work for money\n` +
                    `• *daily* - Daily rewards with streaks\n` +
                    `• *rob @user* - Risk/reward robbery\n` +
                    `• *heist* - Team robberies\n\n` +
                    `🎰 *Gambling:*\n` +
                    `• *coinflip amount* - Heads or tails\n` +
                    `• *dice amount* - Roll the dice\n` +
                    `• *slots amount* - Slot machine\n` +
                    `• *lottery* - Buy tickets\n` +
                    `• *roulette amount* - Russian roulette\n\n` +
                    `📈 *Investments:*\n` +
                    `• *stocks* - Stock market\n` +
                    `• *crypto* - Cryptocurrency\n` +
                    `• *business* - Buy businesses\n\n` +
                    `🛍️ *Shopping:*\n` +
                    `• *shop* - Browse items\n` +
                    `• *inventory* - Your items\n` +
                    `• *use item* - Use items\n\n` +
                    `👥 *Social:*\n` +
                    `• *profile* - View stats\n` +
                    `• *achievements* - Your badges\n` +
                    `• *leaderboard* - Top players\n` +
                    `• *clan* - Clan system\n\n` +
                    `🎉 *Events:* ${prefix}events\n` +
                    `⚙️ *Admin:* ${prefix}economy admin (admin only)`;
    
    await reply(menuText);
  } catch (error) {
    console.error('Error showing economy menu:', error);
  }
}

// Enhanced Balance Command
async function handleBalance(context, args) {
  const { reply, senderId, m } = context;
  
  try {
    const targetUser = (args && args.length > 0) ? getTargetUser(m, args.join(' ')) : senderId;
    await initUser(targetUser);
    const userData = await getUserData(targetUser);
    
    const totalWealth = userData.balance + userData.bank + (userData.vault || 0);
    const isOwnBalance = targetUser === senderId;
    const userNumber = targetUser.split('@')[0];
    
    let balanceText = `💰 *${isOwnBalance ? 'YOUR BALANCE' : `@${userNumber}'S BALANCE`}*\n\n`;
    balanceText += `💵 *Wallet:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n`;
    balanceText += `🏦 *Bank:* ${ecoSettings.currency}${userData.bank.toLocaleString()}\n`;
    
    if (isOwnBalance && userData.vault) {
      balanceText += `🔐 *Vault:* ${ecoSettings.currency}${userData.vault.toLocaleString()}\n`;
    }
    
    balanceText += `💎 *Total Wealth:* ${ecoSettings.currency}${totalWealth.toLocaleString()}\n`;
    
    if (isOwnBalance && userData.activeEffects) {
      const activeEffects = Object.keys(userData.activeEffects).filter(effect => {
        const expiry = userData.activeEffects[effect];
        return typeof expiry === 'boolean' || expiry > Date.now();
      });
      
      if (activeEffects.length > 0) {
        balanceText += `\n✨ *Active Effects:*\n`;
        activeEffects.forEach(effect => {
          const expiry = userData.activeEffects[effect];
          if (typeof expiry === 'boolean') {
            balanceText += `• ${effect} (Permanent)\n`;
          } else {
            const remaining = Math.ceil((expiry - Date.now()) / 60000);
            balanceText += `• ${effect} (${remaining}m left)\n`;
          }
        });
      }
    }
    
    await reply(balanceText);
  } catch (error) {
    await reply('❌ *Error retrieving balance. Please try again.*');
    console.error('Balance error:', error);
  }
}

// Gambling Commands

// Coinflip
async function handleCoinflip(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.gamblingEnabled) {
      await reply('🚫 *Gambling is currently disabled*');
      return;
    }
    
    if (!args || args.length < 2) {
      await reply(`🪙 *Coinflip Usage:*\n${context.config.PREFIX}coinflip [heads/tails] [amount]\n\n💡 Example: ${context.config.PREFIX}coinflip heads 1000`);
      return;
    }
    
    const choice = args[0].toLowerCase();
    const amount = parseInt(args[1]);
    
    if (!['heads', 'tails', 'h', 't'].includes(choice)) {
      await reply('⚠️ *Choose heads or tails*');
      return;
    }
    
    if (isNaN(amount) || amount < ecoSettings.coinflipMinBet || amount > ecoSettings.coinflipMaxBet) {
      await reply(`⚠️ *Bet amount must be between ${ecoSettings.currency}${ecoSettings.coinflipMinBet} and ${ecoSettings.currency}${ecoSettings.coinflipMaxBet.toLocaleString()}*`);
      return;
    }
    
    const userData = await getUserData(senderId);
    if (userData.balance < amount) {
      await reply('🚫 *Insufficient balance*');
      return;
    }
    
    // Process bet
    await removeMoney(senderId, amount, 'Coinflip bet');
    
    const userChoice = choice.startsWith('h') ? 'heads' : 'tails';
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = userChoice === result;
    
    let winnings = 0;
    if (won) {
      winnings = amount * 2;
      // Apply gambling luck effect
      if (userData.activeEffects?.gamblingLuck && userData.activeEffects.gamblingLuck > Date.now()) {
        winnings = Math.floor(winnings * 1.1); // 10% bonus
      }
      await addMoney(senderId, winnings, 'Coinflip win');
    }
    
    // Update gambling stats
    await updateUserData(senderId, {
      'stats.totalGambled': (userData.stats?.totalGambled || 0) + amount
    });
    
    // Check achievements
    await checkAchievements(senderId, 'gambling', { 
      totalGambled: (userData.stats?.totalGambled || 0) + amount 
    });
    
    const resultEmoji = result === 'heads' ? '🙂' : '🪙';
    const statusEmoji = won ? '🎉' : '😭';
    
    await reply(`🪙 *COINFLIP RESULT* 🪙\n\n${resultEmoji} *Result:* ${result.toUpperCase()}\n${statusEmoji} *You ${won ? 'WON' : 'LOST'}!*\n\n💰 *${won ? 'Winnings' : 'Lost'}:* ${ecoSettings.currency}${won ? winnings.toLocaleString() : amount.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing coinflip. Please try again.*');
    console.error('Coinflip error:', error);
  }
}

// Dice Game
async function handleDice(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.gamblingEnabled) {
      await reply('🚫 *Gambling is currently disabled*');
      return;
    }
    
    if (!args || args.length < 2) {
      await reply(`🎲 *Dice Usage:*\n${context.config.PREFIX}dice [1-6] [amount]\n\n💡 Example: ${context.config.PREFIX}dice 6 1000\n\n🎯 *Payouts:*\n• Exact match: 6x bet\n• ±1 number: 2x bet`);
      return;
    }
    
    const guess = parseInt(args[0]);
    const amount = parseInt(args[1]);
    
    if (isNaN(guess) || guess < 1 || guess > 6) {
      await reply('⚠️ *Choose a number between 1 and 6*');
      return;
    }
    
    if (isNaN(amount) || amount < ecoSettings.diceMinBet || amount > ecoSettings.diceMaxBet) {
      await reply(`⚠️ *Bet amount must be between ${ecoSettings.currency}${ecoSettings.diceMinBet} and ${ecoSettings.currency}${ecoSettings.diceMaxBet.toLocaleString()}*`);
      return;
    }
    
    const userData = await getUserData(senderId);
    if (userData.balance < amount) {
      await reply('🚫 *Insufficient balance*');
      return;
    }
    
    await removeMoney(senderId, amount, 'Dice bet');
    
    const roll = Math.floor(Math.random() * 6) + 1;
    let multiplier = 0;
    let winType = '';
    
    if (roll === guess) {
      multiplier = 6;
      winType = 'EXACT MATCH!';
    } else if (Math.abs(roll - guess) === 1) {
      multiplier = 2;
      winType = 'CLOSE GUESS!';
    }
    
    let winnings = 0;
    if (multiplier > 0) {
      winnings = amount * multiplier;
      if (userData.activeEffects?.gamblingLuck && userData.activeEffects.gamblingLuck > Date.now()) {
        winnings = Math.floor(winnings * 1.1);
      }
      await addMoney(senderId, winnings, 'Dice win');
    }
    
    await updateUserData(senderId, {
      'stats.totalGambled': (userData.stats?.totalGambled || 0) + amount
    });
    
    const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    await reply(`🎲 *DICE RESULT* 🎲\n\n${diceEmojis[roll]} *Rolled:* ${roll}\n🎯 *Your guess:* ${guess}\n\n${multiplier > 0 ? '🎉 ' + winType : '😭 NO MATCH'}\n💰 *${multiplier > 0 ? 'Winnings' : 'Lost'}:* ${ecoSettings.currency}${multiplier > 0 ? winnings.toLocaleString() : amount.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing dice game. Please try again.*');
    console.error('Dice error:', error);
  }
}

// Slot Machine
async function handleSlots(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.gamblingEnabled) {
      await reply('🚫 *Gambling is currently disabled*');
      return;
    }
    
    if (!args || args.length === 0) {
      await reply(`🎰 *Slots Usage:*\n${context.config.PREFIX}slots [amount]\n\n💡 Example: ${context.config.PREFIX}slots 1000\n\n🎯 *Payouts:*\n• 🍒🍒🍒 = 3x\n• 🍋🍋🍋 = 5x\n• 🍊🍊🍊 = 8x\n• 💎💎💎 = 15x\n• 🎰🎰🎰 = JACKPOT!`);
      return;
    }
    
    const amount = parseInt(args[0]);
    
    if (isNaN(amount) || amount < ecoSettings.slotsMinBet || amount > ecoSettings.slotsMaxBet) {
      await reply(`⚠️ *Bet amount must be between ${ecoSettings.currency}${ecoSettings.slotsMinBet} and ${ecoSettings.currency}${ecoSettings.slotsMaxBet.toLocaleString()}*`);
      return;
    }
    
    const userData = await getUserData(senderId);
    if (userData.balance < amount) {
      await reply('🚫 *Insufficient balance*');
      return;
    }
    
    await removeMoney(senderId, amount, 'Slots bet');
    
    const symbols = ['🍒', '🍋', '🍊', '💎', '🎰', '⭐'];
    const weights = [30, 25, 20, 15, 8, 2]; // Weighted probabilities
    
    function getRandomSymbol() {
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      let random = Math.random() * totalWeight;
      
      for (let i = 0; i < symbols.length; i++) {
        random -= weights[i];
        if (random <= 0) return symbols[i];
      }
      return symbols[0];
    }
    
    const slot1 = getRandomSymbol();
    const slot2 = getRandomSymbol();
    const slot3 = getRandomSymbol();
    
    let multiplier = 0;
    let winType = '';
    let isJackpot = false;
    
    if (slot1 === slot2 && slot2 === slot3) {
      switch (slot1) {
        case '🍒': multiplier = 3; winType = 'Cherry Match!'; break;
        case '🍋': multiplier = 5; winType = 'Lemon Match!'; break;
        case '🍊': multiplier = 8; winType = 'Orange Match!'; break;
        case '💎': multiplier = 15; winType = 'Diamond Match!'; break;
        case '🎰': 
          multiplier = 0;
          isJackpot = true;
          winType = 'JACKPOT!!!';
          break;
        case '⭐': multiplier = 25; winType = 'Star Match!'; break;
      }
    }
    
    let winnings = 0;
    if (isJackpot) {
      winnings = ecoSettings.slotJackpot;
      await checkAchievements(senderId, 'gambling', { jackpot: true });
    } else if (multiplier > 0) {
      winnings = amount * multiplier;
    }
    
    if (winnings > 0) {
      if (userData.activeEffects?.gamblingLuck && userData.activeEffects.gamblingLuck > Date.now()) {
        winnings = Math.floor(winnings * 1.1);
      }
      await addMoney(senderId, winnings, isJackpot ? 'Slots jackpot' : 'Slots win');
    }
    
    await updateUserData(senderId, {
      'stats.totalGambled': (userData.stats?.totalGambled || 0) + amount
    });
    
    await reply(`🎰 *SLOT MACHINE* 🎰\n\n[ ${slot1} | ${slot2} | ${slot3} ]\n\n${winnings > 0 ? '🎉 ' + winType : '😭 NO MATCH'}\n💰 *${winnings > 0 ? 'Winnings' : 'Lost'}:* ${ecoSettings.currency}${winnings > 0 ? winnings.toLocaleString() : amount.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing slots. Please try again.*');
    console.error('Slots error:', error);
  }
}

// Investment System - Stocks
async function handleStocks(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.investmentsEnabled) {
      await reply('🚫 *Investments are currently disabled*');
      return;
    }
    
    if (!args || args.length === 0) {
      await reply(`📈 *Stock Market Commands:*\n• *${context.config.PREFIX}stocks list* - View available stocks\n• *${context.config.PREFIX}stocks buy [stock] [amount]* - Buy stocks\n• *${context.config.PREFIX}stocks sell [stock] [amount]* - Sell stocks\n• *${context.config.PREFIX}stocks portfolio* - View your stocks`);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    // Generate mock stock data
    const stocks = {
      AAPL: { name: 'Apple Inc.', price: 150 + (Math.random() - 0.5) * 30 },
      GOOGL: { name: 'Alphabet Inc.', price: 2800 + (Math.random() - 0.5) * 400 },
      TSLA: { name: 'Tesla Inc.', price: 800 + (Math.random() - 0.5) * 200 },
      AMZN: { name: 'Amazon.com Inc.', price: 3300 + (Math.random() - 0.5) * 500 },
      MSFT: { name: 'Microsoft Corp.', price: 300 + (Math.random() - 0.5) * 50 }
    };
    
    switch (action) {
      case 'list':
        let stockList = '📈 *STOCK MARKET* 📈\n\n';
        for (const [symbol, data] of Object.entries(stocks)) {
          const change = (Math.random() - 0.5) * 10;
          const changeEmoji = change >= 0 ? '📈' : '📉';
          stockList += `${changeEmoji} *${symbol}* - ${data.name}\n`;
          stockList += `   💰 ${ecoSettings.currency}${data.price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)\n\n`;
        }
        await reply(stockList);
        break;
        
      case 'buy':
        if (args.length < 3) {
          await reply('⚠️ *Usage: stocks buy [symbol] [amount]*');
          return;
        }
        
        const buySymbol = args[1].toUpperCase();
        const buyAmount = parseInt(args[2]);
        
        if (!stocks[buySymbol]) {
          await reply('❌ *Invalid stock symbol*');
          return;
        }
        
        const buyPrice = stocks[buySymbol].price;
        const totalCost = buyPrice * buyAmount;
        
        const userData = await getUserData(senderId);
        if (userData.balance < totalCost) {
          await reply(`🚫 *Insufficient funds*\n\nRequired: ${ecoSettings.currency}${totalCost.toLocaleString()}\nAvailable: ${ecoSettings.currency}${userData.balance.toLocaleString()}`);
          return;
        }
        
        await removeMoney(senderId, totalCost, 'Stock purchase');
        
        const currentShares = userData.investments?.stocks?.[buySymbol] || 0;
        await updateUserData(senderId, {
          [`investments.stocks.${buySymbol}`]: currentShares + buyAmount
        });
        
        await reply(`📈 *Stock Purchase Successful!*\n\n🏢 *Company:* ${stocks[buySymbol].name}\n📊 *Symbol:* ${buySymbol}\n💰 *Price per share:* ${ecoSettings.currency}${buyPrice.toFixed(2)}\n📦 *Shares bought:* ${buyAmount}\n💸 *Total cost:* ${ecoSettings.currency}${totalCost.toLocaleString()}`);
        break;
        
      case 'sell':
        // Similar implementation for selling
        await reply('🚧 *Selling feature coming soon!*');
        break;
        
      case 'portfolio':
        const portfolioData = await getUserData(senderId);
        if (!portfolioData.investments?.stocks || Object.keys(portfolioData.investments.stocks).length === 0) {
          await reply('📊 *You don\'t own any stocks yet*');
          return;
        }
        
        let portfolio = '📊 *YOUR STOCK PORTFOLIO* 📊\n\n';
        let totalValue = 0;
        
        for (const [symbol, shares] of Object.entries(portfolioData.investments.stocks)) {
          if (shares > 0 && stocks[symbol]) {
            const currentValue = stocks[symbol].price * shares;
            totalValue += currentValue;
            portfolio += `📈 *${symbol}* - ${stocks[symbol].name}\n`;
            portfolio += `   📦 Shares: ${shares}\n`;
            portfolio += `   💰 Value: ${ecoSettings.currency}${currentValue.toLocaleString()}\n\n`;
          }
        }
        
        portfolio += `💎 *Total Portfolio Value:* ${ecoSettings.currency}${totalValue.toLocaleString()}`;
        await reply(portfolio);
        break;
        
      default:
        await reply('❓ *Unknown stocks command*');
    }
  } catch (error) {
    await reply('❌ *Error processing stocks command. Please try again.*');
    console.error('Stocks error:', error);
  }
}

// Enhanced Shop System
async function handleShop(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.shopEnabled) {
      await reply('🚫 *Shop is currently closed*');
      return;
    }
    
    if (!args || args.length === 0) {
      // Show shop categories
      await reply(`🛍️ *ECONOMY SHOP* 🛍️\n\n📋 *Categories:*\n• *${context.config.PREFIX}shop consumables* - Temporary boosts\n• *${context.config.PREFIX}shop upgrades* - Permanent improvements\n• *${context.config.PREFIX}shop tools* - Equipment with uses\n• *${context.config.PREFIX}shop cosmetics* - Visual items\n\n💡 *Buy with:* ${context.config.PREFIX}shop buy [item_id]`);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    if (action === 'buy') {
      if (args.length < 2) {
        await reply('⚠️ *Usage: shop buy [item_id]*');
        return;
      }
      
      const itemId = args[1].toLowerCase();
      const item = SHOP_ITEMS[itemId];
      
      if (!item) {
        await reply('❌ *Item not found*');
        return;
      }
      
      const userData = await getUserData(senderId);
      if (userData.balance < item.price) {
        await reply(`🚫 *Insufficient funds*\n\nRequired: ${ecoSettings.currency}${item.price.toLocaleString()}\nAvailable: ${ecoSettings.currency}${userData.balance.toLocaleString()}`);
        return;
      }
      
      // Check if user already has permanent item
      if (item.type === 'permanent' && userData.activeEffects?.[item.effect]) {
        await reply('⚠️ *You already own this permanent upgrade*');
        return;
      }
      
      await removeMoney(senderId, item.price, 'Shop purchase');
      
      // Add to inventory
      const existingItem = userData.inventory.find(invItem => invItem.id === itemId);
      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        userData.inventory.push({
          id: itemId,
          name: item.name,
          quantity: 1,
          uses: item.uses || null
        });
      }
      
      await updateUserData(senderId, { inventory: userData.inventory });
      
      await reply(`✅ *Purchase Successful!*\n\n${item.emoji} *${item.name}*\n💰 *Price:* ${ecoSettings.currency}${item.price.toLocaleString()}\n📝 *Description:* ${item.description}\n\n💡 *Use with:* ${context.config.PREFIX}use ${itemId}`);
    } else {
      // Show category items
      const categories = {
        consumables: ['workBoost', 'robProtection', 'dailyBoost', 'gamblingLuck', 'heistPlans'],
        upgrades: ['vipStatus', 'privateVault'],
        tools: ['lockpicks', 'businessSuit'],
        cosmetics: ['goldenCrown', 'customTitle'],
        special: ['marketTip']
      };
      
      const category = action;
      if (!categories[category]) {
        await reply('❌ *Invalid category*');
        return;
      }
      
      let categoryText = `🛍️ *${category.toUpperCase()} SHOP* 🛍️\n\n`;
      categories[category].forEach(itemId => {
        const item = SHOP_ITEMS[itemId];
        if (item) {
          categoryText += `${item.emoji} *${item.name}* - ${ecoSettings.currency}${item.price.toLocaleString()}\n`;
          categoryText += `   📝 ${item.description}\n`;
          categoryText += `   🛒 ID: ${itemId}\n\n`;
        }
      });
      
      categoryText += `💡 *Buy with:* ${context.config.PREFIX}shop buy [item_id]`;
      await reply(categoryText);
    }
  } catch (error) {
    await reply('❌ *Error processing shop command. Please try again.*');
    console.error('Shop error:', error);
  }
}

// Use Item Command
async function handleUse(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!args || args.length === 0) {
      await reply(`💊 *Use Item Command:*\n${context.config.PREFIX}use [item_id]\n\n💡 *Check your inventory to see available items*`);
      return;
    }
    
    const itemId = args[0].toLowerCase();
    const result = await useItem(senderId, itemId);
    
    if (result.success) {
      await reply(`✅ *${result.message}*\n\n📝 *Effect:* ${result.effect}`);
    } else {
      await reply(`❌ *${result.message}*`);
    }
  } catch (error) {
    await reply('❌ *Error using item. Please try again.*');
    console.error('Use item error:', error);
  }
}

// Enhanced Inventory Command
async function handleInventory(context) {
  const { reply, senderId } = context;
  
  try {
    const userData = await getUserData(senderId);
    
    if (!userData.inventory || userData.inventory.length === 0) {
      await reply('📦 *Your inventory is empty*\n\n🛍️ Visit the shop to buy items!');
      return;
    }
    
    let invText = '📦 *YOUR INVENTORY* 📦\n\n';
    userData.inventory.forEach((item, index) => {
      const shopItem = SHOP_ITEMS[item.id];
      const emoji = shopItem ? shopItem.emoji : '📦';
      invText += `${emoji} *${item.name}*\n`;
      invText += `   📦 Quantity: ${item.quantity}`;
      if (item.uses) {
        invText += ` (${item.uses} uses each)`;
      }
      invText += `\n   🔧 Use: ${context.config.PREFIX}use ${item.id}\n\n`;
    });
    
    await reply(invText);
  } catch (error) {
    await reply('❌ *Error loading inventory. Please try again.*');
    console.error('Inventory error:', error);
  }
}

// Vault Command
async function handleVault(context, args) {
  const { reply, senderId } = context;
  
  try {
    const userData = await getUserData(senderId);
    
    // Check if user has vault access
    if (!userData.activeEffects?.vault && !userData.activeEffects?.privateVault) {
      await reply(`🔐 *Private Vault*\n\n🚫 *You don't have vault access*\n\n🛍️ Buy "Private Vault" from the shop to unlock secure storage that can't be robbed!`);
      return;
    }
    
    if (!args || args.length === 0) {
      await reply(`🔐 *PRIVATE VAULT* 🔐\n\n💰 *Balance:* ${ecoSettings.currency}${(userData.vault || 0).toLocaleString()}\n\n📋 *Commands:*\n• *${context.config.PREFIX}vault deposit [amount]* - Store money\n• *${context.config.PREFIX}vault withdraw [amount]* - Take money\n\n🛡️ *Vault money is 100% safe from robberies!*`);
      return;
    }
    
    const action = args[0].toLowerCase();
    const amount = parseInt(args[1]);
    
    if (isNaN(amount) || amount <= 0) {
      await reply('⚠️ *Please provide a valid amount*');
      return;
    }
    
    switch (action) {
      case 'deposit':
      case 'dep':
        if (userData.balance < amount) {
          await reply('🚫 *Insufficient wallet balance*');
          return;
        }
        
        await updateUserData(senderId, {
          balance: userData.balance - amount,
          vault: (userData.vault || 0) + amount
        });
        
        const updatedUser = await getUserData(senderId);
        await reply(`🔐 *Successfully deposited ${ecoSettings.currency}${amount.toLocaleString()} to your vault*\n\n💵 *Wallet:* ${ecoSettings.currency}${updatedUser.balance.toLocaleString()}\n🔐 *Vault:* ${ecoSettings.currency}${updatedUser.vault.toLocaleString()}`);
        break;
        
      case 'withdraw':
      case 'wd':
        if ((userData.vault || 0) < amount) {
          await reply('🚫 *Insufficient vault balance*');
          return;
        }
        
        await updateUserData(senderId, {
          balance: userData.balance + amount,
          vault: (userData.vault || 0) - amount
        });
        
        const updatedUserWithdraw = await getUserData(senderId);
        await reply(`🔐 *Successfully withdrew ${ecoSettings.currency}${amount.toLocaleString()} from your vault*\n\n💵 *Wallet:* ${ecoSettings.currency}${updatedUserWithdraw.balance.toLocaleString()}\n🔐 *Vault:* ${ecoSettings.currency}${updatedUserWithdraw.vault.toLocaleString()}`);
        break;
        
      default:
        await reply('❓ *Unknown vault command*');
    }
  } catch (error) {
    await reply('❌ *Error processing vault command. Please try again.*');
    console.error('Vault error:', error);
  }
}

// Enhanced Work Command with job selection
async function handleWork(context) {
  const { reply, senderId } = context;
  const now = new Date();
  
  try {
    const userData = await getUserData(senderId);
    
    // Check cooldown
    if (userData.lastWork && now - new Date(userData.lastWork) < ecoSettings.workCooldownMinutes * 60 * 1000) {
      const remaining = Math.ceil((ecoSettings.workCooldownMinutes * 60 * 1000 - (now - new Date(userData.lastWork))) / 60000);
      await reply(`⏱️ *You're tired! Rest for ${remaining} minutes before working again.*`);
      return;
    }
    
    // Enhanced job selection with risk/reward
    const availableJobs = ecoSettings.workJobs;
    const randomJob = availableJobs[Math.floor(Math.random() * availableJobs.length)];
    
    let baseEarnings = Math.floor(Math.random() * (randomJob.max - randomJob.min + 1)) + randomJob.min;
    
    // Apply active effects
    if (userData.activeEffects?.workBoost && userData.activeEffects.workBoost > Date.now()) {
      baseEarnings *= 2;
    }
    if (userData.activeEffects?.businessSuit) {
      baseEarnings = Math.floor(baseEarnings * 1.35);
    }
    if (userData.activeEffects?.vipBonus) {
      baseEarnings = Math.floor(baseEarnings * 1.25);
    }
    
    // Random events during work
    const events = [
      { text: 'You received a tip from a satisfied customer!', bonus: 0.2 },
      { text: 'You worked overtime!', bonus: 0.3 },
      { text: 'You found money on the ground!', bonus: 0.15 },
      { text: 'Your boss was impressed with your work!', bonus: 0.25 },
      { text: 'It was a normal day at work.', bonus: 0 }
    ];
    
    const randomEvent = events[Math.floor(Math.random() * events.length)];
    const finalEarnings = Math.floor(baseEarnings * (1 + randomEvent.bonus));
    
    await updateUserData(senderId, {
      balance: userData.balance + finalEarnings,
      lastWork: now,
      'stats.workCount': (userData.stats?.workCount || 0) + 1,
      'stats.totalEarned': (userData.stats?.totalEarned || 0) + finalEarnings
    });
    
    // Check achievements
    await checkAchievements(senderId, 'work');
    
    const updatedData = await getUserData(senderId);
    await reply(`💼 *WORK COMPLETE!* 💼\n\n🔨 *Job:* ${randomJob.name}\n📖 *Event:* ${randomEvent.text}\n💰 *Earned:* ${ecoSettings.currency}${finalEarnings.toLocaleString()}\n💵 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n\n⏱️ *Next work available in ${ecoSettings.workCooldownMinutes} minutes*\n📊 *Total jobs completed:* ${updatedData.stats?.workCount || 1}`);
  } catch (error) {
    await reply('❌ *Error processing work. Please try again.*');
    console.error('Work error:', error);
  }
}

// Enhanced Daily Command with streaks and bonuses
async function handleDaily(context) {
  const { reply, senderId } = context;
  
  try {
    const currentDate = getCurrentDate();
    const userData = await getUserData(senderId);
    
    if (userData.lastDaily === currentDate) {
      await reply('⏰ *You have already claimed your daily reward today! Come back tomorrow.*');
      return;
    }
    
    // Calculate base daily amount
    let dailyAmount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
    
    // Calculate streak
    const yesterday = getNigeriaTime().subtract(1, 'day').format('DD-MM-YYYY');
    let newStreak = 1;
    
    if (userData.lastDaily === yesterday) {
      newStreak = (userData.stats?.dailyStreak || 0) + 1;
    }
    
    // Apply streak bonus
    const streakBonus = Math.floor(newStreak * ecoSettings.dailyStreakBonus);
    dailyAmount += streakBonus;
    
    // Apply active effects
    if (userData.activeEffects?.dailyBoost && userData.activeEffects.dailyBoost > Date.now()) {
      dailyAmount = Math.floor(dailyAmount * 1.5);
    }
    if (userData.activeEffects?.vipBonus) {
      dailyAmount = Math.floor(dailyAmount * 1.25);
    }
    
    const newLongestStreak = Math.max(userData.stats?.maxDailyStreak || 0, newStreak);
    
    await updateUserData(senderId, {
      balance: userData.balance + dailyAmount,
      lastDaily: currentDate,
      'stats.dailyStreak': newStreak,
      'stats.maxDailyStreak': newLongestStreak,
      'stats.totalEarned': (userData.stats?.totalEarned || 0) + dailyAmount
    });
    
    // Check achievements
    const achievements = await checkAchievements(senderId, 'daily', { streak: newStreak });
    
    const updatedData = await getUserData(senderId);
    
    let rewardText = `🎁 *DAILY REWARD CLAIMED!* 🎁\n\n💰 *Base Reward:* ${ecoSettings.currency}${(dailyAmount - streakBonus).toLocaleString()}\n🔥 *Streak Bonus:* ${ecoSettings.currency}${streakBonus.toLocaleString()}\n💎 *Total Received:* ${ecoSettings.currency}${dailyAmount.toLocaleString()}\n💵 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n\n🔥 *Current Streak:* ${newStreak} days`;
    
    if (newLongestStreak === newStreak && newStreak > 1) {
      rewardText += ` (NEW RECORD! 🏆)`;
    }
    
    if (achievements.length > 0) {
      rewardText += `\n\n🏆 *Achievement Unlocked:* ${achievements.map(a => ACHIEVEMENTS[a]?.name || a).join(', ')}`;
    }
    
    rewardText += `\n\n✨ *Come back tomorrow for another reward!*\n⏰ *Nigeria Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`;
    
    await reply(rewardText);
  } catch (error) {
    await reply('❌ *Error claiming daily reward. Please try again.*');
    console.error('Daily error:', error);
  }
}

// Enhanced Profile with achievements and stats
async function handleProfile(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    const targetUser = (args && args.length > 0) ? getTargetUser(m, args.join(' ')) : senderId;
    await initUser(targetUser);
    const profileData = await getUserData(targetUser);
    
    const totalWealth = profileData.balance + profileData.bank + (profileData.vault || 0);
    const isOwnProfile = targetUser === senderId;
    const userNumber = targetUser.split('@')[0];
    
    // Calculate rank based on wealth
    const ranks = [
      { name: 'Newbie', min: 0 },
      { name: 'Worker', min: 10000 },
      { name: 'Trader', min: 50000 },
      { name: 'Business Owner', min: 100000 },
      { name: 'Millionaire', min: 1000000 },
      { name: 'Tycoon', min: 5000000 },
      { name: 'Legend', min: 10000000 }
    ];
    
    let currentRank = ranks[0];
    for (const rank of ranks) {
      if (totalWealth >= rank.min) {
        currentRank = rank;
      }
    }
    
    const displayTitle = profileData.customTitle || currentRank.name;
    const crownEmoji = profileData.activeEffects?.crown ? '👑 ' : '';
    
    let profileText = `👤 *${isOwnProfile ? 'YOUR PROFILE' : 'USER PROFILE'}* 👤\n\n`;
    profileText += `📱 *User:* ${crownEmoji}@${userNumber}\n`;
    profileText += `🏅 *Rank:* ${displayTitle}\n`;
    profileText += `💎 *Total Wealth:* ${ecoSettings.currency}${totalWealth.toLocaleString()}\n`;
    profileText += `💵 *Wallet:* ${ecoSettings.currency}${profileData.balance.toLocaleString()}\n`;
    profileText += `🏦 *Bank:* ${ecoSettings.currency}${profileData.bank.toLocaleString()}\n`;
    
    if (isOwnProfile && profileData.vault) {
      profileText += `🔐 *Vault:* ${ecoSettings.currency}${profileData.vault.toLocaleString()}\n`;
    }
    
    profileText += `🛡️ *Clan:* ${profileData.clan || 'None'}\n`;
    
    if (profileData.stats) {
      profileText += `\n📊 *STATISTICS*\n`;
      profileText += `💼 *Jobs Completed:* ${profileData.stats.workCount || 0}\n`;
      profileText += `🔥 *Daily Streak:* ${profileData.stats.dailyStreak || 0} days\n`;
      profileText += `🏆 *Best Streak:* ${profileData.stats.maxDailyStreak || 0} days\n`;
      profileText += `🦹 *Robberies:* ${profileData.stats.robsSuccessful || 0}/${profileData.stats.robsAttempted || 0}\n`;
      profileText += `🎰 *Total Gambled:* ${ecoSettings.currency}${(profileData.stats.totalGambled || 0).toLocaleString()}\n`;
    }
    
    if (profileData.achievements && profileData.achievements.length > 0) {
      profileText += `\n🏆 *ACHIEVEMENTS* (${profileData.achievements.length})\n`;
      const recentAchievements = profileData.achievements.slice(-3);
      recentAchievements.forEach(achId => {
        const ach = ACHIEVEMENTS[achId];
        if (ach) {
          profileText += `${ach.emoji} ${ach.name}\n`;
        }
      });
      if (profileData.achievements.length > 3) {
        profileText += `... and ${profileData.achievements.length - 3} more!\n`;
      }
    }
    
    profileText += `\n⏰ *Nigeria Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`;
    
    await sock.sendMessage(from, {
      text: profileText,
      mentions: [targetUser]
    });
  } catch (error) {
    await reply('❌ *Error loading profile. Please try again.*');
    console.error('Profile error:', error);
  }
}

// Achievements Command
async function handleAchievements(context, args) {
  const { reply, senderId } = context;
  
  try {
    const userData = await getUserData(senderId);
    const userAchievements = userData.achievements || [];
    
    if (args && args[0] === 'all') {
      // Show all available achievements
      let allAchText = '🏆 *ALL ACHIEVEMENTS* 🏆\n\n';
      for (const [id, ach] of Object.entries(ACHIEVEMENTS)) {
        const hasAchievement = userAchievements.includes(id);
        const status = hasAchievement ? '✅' : '⬜';
        allAchText += `${status} ${ach.emoji} *${ach.name}*\n`;
        allAchText += `   📝 ${ach.description}\n`;
        allAchText += `   💰 Reward: ${ecoSettings.currency}${ach.reward.toLocaleString()}\n\n`;
      }
      await reply(allAchText);
    } else {
      // Show user's achievements
      if (userAchievements.length === 0) {
        await reply(`🏆 *YOUR ACHIEVEMENTS* 🏆\n\n📭 *No achievements yet!*\n\n💡 Use *${context.config.PREFIX}achievements all* to see available achievements`);
        return;
      }
      
      let userAchText = `🏆 *YOUR ACHIEVEMENTS* (${userAchievements.length}/${Object.keys(ACHIEVEMENTS).length}) 🏆\n\n`;
      userAchievements.forEach(achId => {
        const ach = ACHIEVEMENTS[achId];
        if (ach) {
          userAchText += `${ach.emoji} *${ach.name}*\n`;
          userAchText += `   📝 ${ach.description}\n`;
          userAchText += `   💰 ${ecoSettings.currency}${ach.reward.toLocaleString()}\n\n`;
        }
      });
      
      userAchText += `💡 Use *${context.config.PREFIX}achievements all* to see all available achievements`;
      await reply(userAchText);
    }
  } catch (error) {
    await reply('❌ *Error loading achievements. Please try again.*');
    console.error('Achievements error:', error);
  }
}

// Enhanced Leaderboard with categories
async function handleLeaderboard(context, args) {
  const { reply, sock, from } = context;
  
  try {
    const category = args && args[0] ? args[0].toLowerCase() : 'wealth';
    
    let sortField, title, emoji;
    switch (category) {
      case 'wealth':
      case 'money':
        sortField = { $add: ['$balance', '$bank', { $ifNull: ['$vault', 0] }] };
        title = 'WEALTH LEADERBOARD';
        emoji = '💰';
        break;
      case 'work':
      case 'jobs':
        sortField = '$stats.workCount';
        title = 'WORK LEADERBOARD';
        emoji = '💼';
        break;
      case 'streak':
      case 'daily':
        sortField = '$stats.maxDailyStreak';
        title = 'STREAK LEADERBOARD';
        emoji = '🔥';
        break;
      case 'gambling':
      case 'gamble':
        sortField = '$stats.totalGambled';
        title = 'GAMBLING LEADERBOARD';
        emoji = '🎰';
        break;
      case 'achievements':
      case 'ach':
        sortField = { $size: { $ifNull: ['$achievements', []] } };
        title = 'ACHIEVEMENT LEADERBOARD';
        emoji = '🏆';
        break;
      default:
        await reply(`📊 *Leaderboard Categories:*\n• *wealth* - Total money\n• *work* - Jobs completed\n• *streak* - Best daily streak\n• *gambling* - Total gambled\n• *achievements* - Achievement count\n\n💡 Usage: ${context.config.PREFIX}leaderboard [category]`);
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
    
    if (users.length === 0) {
      await reply('📊 *No data available for this leaderboard*');
      return;
    }
    
    let leaderboard = `${emoji} *${title}* ${emoji}\n\n`;
    
    users.forEach((user, index) => {
      const rank = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const userName = user.userId.split('@')[0];
      const crown = user.activeEffects?.crown ? '👑 ' : '';
      
      leaderboard += `${rank} ${crown}@${userName}\n`;
      
      switch (category) {
        case 'wealth':
          const wealth = user.balance + user.bank + (user.vault || 0);
          leaderboard += `   💰 ${ecoSettings.currency}${wealth.toLocaleString()}\n`;
          break;
        case 'work':
          leaderboard += `   💼 ${user.stats?.workCount || 0} jobs\n`;
          break;
        case 'streak':
          leaderboard += `   🔥 ${user.stats?.maxDailyStreak || 0} days\n`;
          break;
        case 'gambling':
          leaderboard += `   🎰 ${ecoSettings.currency}${(user.stats?.totalGambled || 0).toLocaleString()}\n`;
          break;
        case 'achievements':
          leaderboard += `   🏆 ${user.achievements?.length || 0} achievements\n`;
          break;
      }
      leaderboard += '\n';
    });
    
    leaderboard += `💡 Try: ${context.config.PREFIX}leaderboard [category]`;
    
    await sock.sendMessage(from, {
      text: leaderboard,
      mentions: users.map(u => u.userId)
    });
  } catch (error) {
    await reply('❌ *Error loading leaderboard. Please try again.*');
    console.error('Leaderboard error:', error);
  }
}

// Admin Settings Command
async function handleAdminSettings(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!isAdmin(senderId) && !isOwner(senderId)) {
      await reply('🚫 *Only admins can access these settings*');
      return;
    }
    
    if (!args || args.length === 0) {
      let settingsText = `⚙️ *ECONOMY ADMIN SETTINGS* ⚙️\n\n`;
      
      // Basic Settings
      settingsText += `💰 *Economy:*\n`;
      settingsText += `• Starting Balance: ${ecoSettings.currency}${ecoSettings.startingBalance.toLocaleString()}\n`;
      settingsText += `• Max Wallet: ${ecoSettings.currency}${ecoSettings.maxWalletBalance.toLocaleString()}\n`;
      settingsText += `• Max Bank: ${ecoSettings.currency}${ecoSettings.maxBankBalance.toLocaleString()}\n`;
      settingsText += `• Currency: ${ecoSettings.currency}\n\n`;
      
      // Feature Toggles
      settingsText += `🎛️ *Features:*\n`;
      settingsText += `• Gambling: ${ecoSettings.gamblingEnabled ? '✅' : '❌'}\n`;
      settingsText += `• Investments: ${ecoSettings.investmentsEnabled ? '✅' : '❌'}\n`;
      settingsText += `• Shop: ${ecoSettings.shopEnabled ? '✅' : '❌'}\n`;
      settingsText += `• Events: ${ecoSettings.eventsEnabled ? '✅' : '❌'}\n\n`;
      
      // Cooldowns
      settingsText += `⏱️ *Cooldowns:*\n`;
      settingsText += `• Work: ${ecoSettings.workCooldownMinutes}m\n`;
      settingsText += `• Rob: ${ecoSettings.robCooldownMinutes}m\n`;
      settingsText += `• Heist: ${ecoSettings.heistCooldownHours}h\n\n`;
      
      // Admin Commands
      settingsText += `🔧 *Admin Commands:*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin set [setting] [value]*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin toggle [feature]*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin give @user [amount]*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin take @user [amount]*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin reset @user*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin event [type]*\n`;
      
      await reply(settingsText);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    switch (action) {
      case 'set':
        if (args.length < 3) {
          await reply('⚠️ *Usage: eco admin set [setting] [value]*');
          return;
        }
        
        const setting = args[1];
        let value = args[2];
        
        // Parse value based on setting type
        if (['startingBalance', 'maxWalletBalance', 'maxBankBalance', 'workCooldownMinutes', 'robCooldownMinutes'].includes(setting)) {
          value = parseInt(value);
          if (isNaN(value)) {
            await reply('⚠️ *Value must be a number*');
            return;
          }
        } else if (['robSuccessRate', 'stockMarketVolatility'].includes(setting)) {
          value = parseFloat(value);
          if (isNaN(value) || value < 0 || value > 1) {
            await reply('⚠️ *Rate must be between 0 and 1*');
            return;
          }
        }
        
        if (ecoSettings.hasOwnProperty(setting)) {
          ecoSettings[setting] = value;
          await saveSettings();
          await reply(`✅ *Setting updated!*\n\n📝 *${setting}* = ${value}`);
        } else {
          await reply('❌ *Invalid setting name*');
        }
        break;
        
      case 'toggle':
        if (args.length < 2) {
          await reply('⚠️ *Usage: eco admin toggle [feature]*');
          return;
        }
        
        const feature = args[1] + 'Enabled';
        if (ecoSettings.hasOwnProperty(feature)) {
          ecoSettings[feature] = !ecoSettings[feature];
          await saveSettings();
          await reply(`🎛️ *Feature toggled!*\n\n${args[1]}: ${ecoSettings[feature] ? '✅ Enabled' : '❌ Disabled'}`);
        } else {
          await reply('❌ *Invalid feature name*');
        }
        break;
        
      case 'give':
        if (args.length < 3) {
          await reply('⚠️ *Usage: eco admin give @user [amount]*');
          return;
        }
        
        const giveTarget = getTargetUser(context.m, args[1]);
        const giveAmount = parseInt(args[2]);
        
        if (!giveTarget) {
          await reply('⚠️ *Invalid user*');
          return;
        }
        
        if (isNaN(giveAmount) || giveAmount <= 0) {
          await reply('⚠️ *Invalid amount*');
          return;
        }
        
        await initUser(giveTarget);
        await addMoney(giveTarget, giveAmount, 'Admin gift', false);
        
        await reply(`✅ *Successfully gave ${ecoSettings.currency}${giveAmount.toLocaleString()} to @${giveTarget.split('@')[0]}*`);
        break;
        
      case 'take':
        if (args.length < 3) {
          await reply('⚠️ *Usage: eco admin take @user [amount]*');
          return;
        }
        
        const takeTarget = getTargetUser(context.m, args[1]);
        const takeAmount = parseInt(args[2]);
        
        if (!takeTarget) {
          await reply('⚠️ *Invalid user*');
          return;
        }
        
        if (isNaN(takeAmount) || takeAmount <= 0) {
          await reply('⚠️ *Invalid amount*');
          return;
        }
        
        await initUser(takeTarget);
        const success = await removeMoney(takeTarget, takeAmount, 'Admin removal');
        
        if (success) {
          await reply(`✅ *Successfully removed ${ecoSettings.currency}${takeAmount.toLocaleString()} from @${takeTarget.split('@')[0]}*`);
        } else {
          await reply(`❌ *User doesn't have enough balance*`);
        }
        break;
        
      case 'reset':
        if (args.length < 2) {
          await reply('⚠️ *Usage: eco admin reset @user*');
          return;
        }
        
        const resetTarget = getTargetUser(context.m, args[1]);
        if (!resetTarget) {
          await reply('⚠️ *Invalid user*');
          return;
        }
        
        await updateUserData(resetTarget, {
          balance: ecoSettings.startingBalance,
          bank: ecoSettings.startingBankBalance,
          vault: 0,
          inventory: [],
          activeEffects: {},
          achievements: [],
          stats: {
            totalEarned: 0,
            totalSpent: 0,
            totalGambled: 0,
            robsSuccessful: 0,
            robsAttempted: 0,
            workCount: 0,
            dailyStreak: 0,
            maxDailyStreak: 0
          },
          lastDaily: null,
          lastWork: null,
          lastRob: null,
          lastHeist: null
        });
        
        await reply(`🔄 *Successfully reset @${resetTarget.split('@')[0]}'s economy data*`);
        break;
        
      case 'event':
        if (args.length < 2) {
          await reply(`🎉 *Event Commands:*\n• *double* - Double money event (1 hour)\n• *lucky* - Increased gambling luck (30 minutes)\n• *crash* - Market crash event\n• *bonus* - Bonus daily rewards (24 hours)`);
          return;
        }
        
        const eventType = args[1].toLowerCase();
        const eventDuration = Date.now() + (eventType === 'double' ? 3600000 : eventType === 'lucky' ? 1800000 : 86400000);
        
        await db.collection(COLLECTIONS.EVENTS).insertOne({
          type: eventType,
          active: true,
          startTime: new Date(),
          endTime: new Date(eventDuration),
          createdBy: senderId
        });
        
        await context.sock.sendMessage(context.from, {
          text: `🎉 *ECONOMY EVENT STARTED!* 🎉\n\n🎯 *Event:* ${eventType.toUpperCase()}\n⏰ *Duration:* ${eventType === 'double' ? '1 hour' : eventType === 'lucky' ? '30 minutes' : '24 hours'}\n👑 *Started by:* @${senderId.split('@')[0]}\n\n🚀 *Take advantage while it lasts!*`,
          mentions: [senderId]
        });
        break;
        
      default:
        await reply('❓ *Unknown admin command*');
    }
  } catch (error) {
    await reply('❌ *Error processing admin command. Please try again.*');
    console.error('Admin settings error:', error);
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
      // Basic commands
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
      case 'vault':
        await handleVault(context, args);
        break;
        
      // Earning
      case 'work':
        await handleWork(context);
        break;
      case 'rob':
        await handleRob(context, args);
        break;
      case 'daily':
        await handleDaily(context);
        break;
      case 'heist':
        await handleHeist(context, args);
        break;
        
      // Gambling
      case 'coinflip':
      case 'cf':
        await handleCoinflip(context, args);
        break;
      case 'dice':
        await handleDice(context, args);
        break;
      case 'slots':
        await handleSlots(context, args);
        break;
      case 'lottery':
        await handleLottery(context, args);
        break;
      case 'roulette':
        await handleRoulette(context, args);
        break;
      case 'guess':
        await handleGuess(context, args);
        break;
        
      // Investments
      case 'invest':
        await handleInvest(context, args);
        break;
      case 'stocks':
        await handleStocks(context, args);
        break;
      case 'crypto':
        await handleCrypto(context, args);
        break;
      case 'business':
        await handleBusiness(context, args);
        break;
        
      // Social
      case 'profile':
        await handleProfile(context, args);
        break;
      case 'leaderboard':
      case 'lb':
        await handleLeaderboard(context, args);
        break;
      case 'achievements':
      case 'ach':
        await handleAchievements(context, args);
        break;
      case 'clan':
        await handleClan(context, args);
        break;
        
      // Shop
      case 'shop':
        await handleShop(context, args);
        break;
      case 'inventory':
      case 'inv':
        await handleInventory(context);
        break;
      case 'use':
        await handleUse(context, args);
        break;
        
      // Events & Admin
      case 'events':
        await handleEvents(context);
        break;
      case 'bounty':
        await handleBounty(context, args);
        break;
      case 'admin':
        await handleAdminSettings(context, args);
        break;
        
      default:
        await context.reply(`❓ Unknown economy command: *${subCommand}*\n\nUse *${context.config.PREFIX}economy* to see available commands.`);
    }
  } catch (error) {
    console.error('❌ Economy subcommand error:', error.message);
    await context.reply('❌ *Error processing command. Please try again.*');
  }
}

// Keep all existing functions (handleBalance, handleSend, handleDeposit, handleWithdraw, etc.)
// that were in your original code but enhance them with the new features

// Enhanced handleSend with transaction limits and fees
async function handleSend(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!args || args.length < 2) {
      await reply(`💸 *Transfer Money*\n\n⚠️ *Usage:*\n• Reply to someone: *${context.config.PREFIX}send amount*\n• Mention someone: *${context.config.PREFIX}send @user amount*\n• Use number: *${context.config.PREFIX}send 1234567890 amount*\n\n💡 *Example: ${context.config.PREFIX}send @user 1000*\n\n📋 *Transfer fee: 1% (min ${ecoSettings.currency}5)*`);
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
    
    if (isNaN(amount) || amount <= 0) {
      await reply('⚠️ *Please provide a valid amount*');
      return;
    }
    
    if (targetUser === senderId) {
      await reply('🧠 *You cannot send money to yourself!*');
      return;
    }
    
    // Calculate transfer fee (1% minimum 5)
    const fee = Math.max(Math.floor(amount * 0.01), 5);
    const totalCost = amount + fee;
    
    const senderData = await getUserData(senderId);
    if (senderData.balance < totalCost) {
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${ecoSettings.currency}${senderData.balance.toLocaleString()}\n💸 *Required:* ${ecoSettings.currency}${totalCost.toLocaleString()} (includes ${ecoSettings.currency}${fee} fee)`);
      return;
    }
    
    // Process transaction
    await initUser(targetUser);
    await removeMoney(senderId, totalCost, 'Transfer sent');
    await addMoney(targetUser, amount, 'Transfer received', false);
    
    const updatedSender = await getUserData(senderId);
    const updatedTarget = await getUserData(targetUser);
    
    await sock.sendMessage(from, {
      text: `✅ *TRANSFER SUCCESSFUL* ✅\n\n💸 *@${senderId.split('@')[0]}* sent *${ecoSettings.currency}${amount.toLocaleString()}* to *@${targetUser.split('@')[0]}*\n\n💰 *Amount sent:* ${ecoSettings.currency}${amount.toLocaleString()}\n💳 *Transfer fee:* ${ecoSettings.currency}${fee.toLocaleString()}\n💵 *Sender's balance:* ${ecoSettings.currency}${updatedSender.balance.toLocaleString()}\n🎯 *Receiver's balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}`,
      mentions: [senderId, targetUser]
    });
  } catch (error) {
    await reply('❌ *Error processing transfer. Please try again.*');
    console.error('Send error:', error);
  }
}

// Keep original handleDeposit and handleWithdraw but add bank interest
async function handleDeposit(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!args || args.length === 0) {
      await reply(`🏦 *Bank Deposit*\n\n⚠️ *Usage:* ${context.config.PREFIX}deposit [amount]\n💡 *Example:* ${context.config.PREFIX}deposit 1000\n\n📈 *Bank pays 0.1% daily interest on deposits!*`);
      return;
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await reply('⚠️ *Please provide a valid amount to deposit*');
      return;
    }
    
    const userData = await getUserData(senderId);
    if (userData.balance < amount) {
      await reply('🚫 *Insufficient wallet balance*');
      return;
    }
    
    if (userData.bank + amount > ecoSettings.maxBankBalance) {
      await reply(`🚫 *Bank deposit limit exceeded*\n\nMax bank balance: ${ecoSettings.currency}${ecoSettings.maxBankBalance.toLocaleString()}`);
      return;
    }
    
    await updateUserData(senderId, {
      balance: userData.balance - amount,
      bank: userData.bank + amount
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`🏦 *Successfully deposited ${ecoSettings.currency}${amount.toLocaleString()} to your bank*\n\n💵 *Wallet:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🏦 *Bank:* ${ecoSettings.currency}${updatedData.bank.toLocaleString()}\n\n📈 *Earning 0.1% daily interest on bank deposits!*`);
  } catch (error) {
    await reply('❌ *Error processing deposit. Please try again.*');
    console.error('Deposit error:', error);
  }
}

async function handleWithdraw(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!args || args.length === 0) {
      await reply(`🏦 *Bank Withdrawal*\n\n⚠️ *Usage:* ${context.config.PREFIX}withdraw [amount]\n💡 *Example:* ${context.config.PREFIX}withdraw 1000`);
      return;
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await reply('⚠️ *Please provide a valid amount to withdraw*');
      return;
    }
    
    const userData = await getUserData(senderId);
    if (userData.bank < amount) {
      await reply('🚫 *Insufficient bank balance*');
      return;
    }
    
    if (userData.balance + amount > ecoSettings.maxWalletBalance) {
      await reply(`🚫 *Wallet limit exceeded*\n\nMax wallet balance: ${ecoSettings.currency}${ecoSettings.maxWalletBalance.toLocaleString()}`);
      return;
    }
    
    await updateUserData(senderId, {
      balance: userData.balance + amount,
      bank: userData.bank - amount
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`💵 *Successfully withdrew ${ecoSettings.currency}${amount.toLocaleString()} from your bank*\n\n💵 *Wallet:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🏦 *Bank:* ${ecoSettings.currency}${updatedData.bank.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing withdrawal. Please try again.*');
    console.error('Withdraw error:', error);
  }
}

// Enhanced handleRob with protection items and wanted level
async function handleRob(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!args || args.length === 0) {
      await reply(`🦹 *Robbery System*\n\n⚠️ *Usage:*\n• Reply to someone: *${context.config.PREFIX}rob*\n• Mention someone: *${context.config.PREFIX}rob @user*\n• Use number: *${context.config.PREFIX}rob 1234567890*\n\n💡 *Example: ${context.config.PREFIX}rob @username*\n\n⚡ *Success rate: ${(ecoSettings.robSuccessRate * 100)}%*\n🛡️ *Some users may have robbery protection!*`);
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
    
    // Check if target has robbery protection
    if (targetData.activeEffects?.robProtection && targetData.activeEffects.robProtection > Date.now()) {
      await reply(`🛡️ *@${targetUser.split('@')[0]} is protected from robberies!*\n\n⏰ *Protection expires in ${Math.ceil((targetData.activeEffects.robProtection - Date.now()) / 60000)} minutes*`);
      return;
    }
    
    // Validation checks
    if (targetData.balance < ecoSettings.robMinTargetBalance) {
      await reply(`👀 *Target is too broke to rob*\n\n💸 *@${targetUser.split('@')[0]}* only has ${ecoSettings.currency}${targetData.balance.toLocaleString()}\n🚫 *Minimum required: ${ecoSettings.currency}${ecoSettings.robMinTargetBalance}*`);
      return;
    }
    
    if (robberData.balance < ecoSettings.robMinRobberBalance) {
      await reply(`💸 *Your balance is too low to attempt a robbery*\n\n💰 *Your balance:* ${ecoSettings.currency}${robberData.balance.toLocaleString()}\n⚠️ _You need at least ${ecoSettings.currency}${ecoSettings.robMinRobberBalance} in your wallet for bail money if you get caught._`);
      return;
    }
    
    // Calculate success rate with bonuses
    let successRate = ecoSettings.robSuccessRate;
    
    // Apply lockpicks effect
    if (robberData.activeEffects?.robberyBoost) {
      successRate += 0.2; // +20% success rate
      // Consume one use
      await updateUserData(senderId, {
        'activeEffects.robberyBoost': Math.max(0, (robberData.activeEffects.robberyBoost || 0) - 1)
      });
    }
    
    // Process robbery attempt
    const success = Math.random() < successRate;
    
    await updateUserData(senderId, { 
      lastRob: now,
      'stats.robsAttempted': (robberData.stats?.robsAttempted || 0) + 1
    });
    
    if (success) {
      const maxSteal = Math.floor(targetData.balance * ecoSettings.robMaxStealPercent);
      const stolen = Math.floor(Math.random() * maxSteal) + ecoSettings.robMinSteal;
      
      await updateUserData(targetUser, { balance: targetData.balance - stolen });
      await updateUserData(senderId, { 
        balance: robberData.balance + stolen,
        'stats.robsSuccessful': (robberData.stats?.robsSuccessful || 0) + 1
      });
      
      // Check achievements
      await checkAchievements(senderId, 'rob', { 
        successful: true, 
        successfulCount: (robberData.stats?.robsSuccessful || 0) + 1 
      });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      await sock.sendMessage(from, {
        text: `🦹‍♂️ *ROBBERY SUCCESS!* 🦹‍♂️\n\n💰 *@${senderId.split('@')[0]}* successfully robbed *${ecoSettings.currency}${stolen.toLocaleString()}* from *@${targetUser.split('@')[0]}*\n\n🤑 *Robber's balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😭 *Victim's balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes\n📊 *Success rate:* ${Math.round(successRate * 100)}%`,
        mentions: [senderId, targetUser]
      });
    } else {
      await updateUserData(senderId, { balance: robberData.balance - ecoSettings.robFailPenalty });
      await updateUserData(targetUser, { balance: targetData.balance + ecoSettings.robFailPenalty });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      await sock.sendMessage(from, {
        text: `🚨 *ROBBERY FAILED!* 🚨\n\n❌ *@${senderId.split('@')[0]}* got caught trying to rob *@${targetUser.split('@')[0]}* and was arrested!\n\n💸 *Bail paid:* ${ecoSettings.currency}${ecoSettings.robFailPenalty.toLocaleString()}\n😔 *Robber's balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😊 *Victim's balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
        mentions: [senderId, targetUser]
      });
    }
  } catch (error) {
    await reply('❌ *Error processing robbery. Please try again.*');
    console.error('Rob error:', error);
  }
}

// Placeholder functions for remaining features
async function handleHeist(context, args) {
  await context.reply('🚧 *Heist system coming soon!* Team up with clan members for big scores! 🚧');
}

async function handleLottery(context, args) {
  await context.reply('🚧 *Lottery system coming soon!* Weekly jackpots await! 🚧');
}

async function handleRoulette(context, args) {
  await context.reply('🚧 *Russian Roulette coming soon!* High risk, high reward! 🚧');
}

async function handleGuess(context, args) {
  await context.reply('🚧 *Number guessing game coming soon!* 🚧');
}

async function handleInvest(context, args) {
  await context.reply('🚧 *Investment overview coming soon!* 🚧');
}

async function handleCrypto(context, args) {
  await context.reply('🚧 *Cryptocurrency trading coming soon!* 🚧');
}

async function handleBusiness(context, args) {
  await context.reply('🚧 *Business ownership coming soon!* Buy businesses for passive income! 🚧');
}

async function handleClan(context, args) {
  await context.reply('🚧 *Enhanced clan system coming soon!* Clan wars, shared vaults, and more! 🚧');
}

async function handleEvents(context) {
  await context.reply('🚧 *Events system coming soon!* Double money events, challenges, and more! 🚧');
}

async function handleBounty(context, args) {
  await context.reply('🚧 *Bounty hunting system coming soon!* Hunt down targets for rewards! 🚧');
}

// Export functions for use by other plugins
export { 
  addMoney, 
  removeMoney, 
  getUserData, 
  updateUserData, 
  initUser, 
  ecoSettings,
  useItem,
  checkAchievements,
  cleanupExpiredEffects
};
