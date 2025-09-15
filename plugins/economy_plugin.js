// plugins/economy_plugin_refactored.js - A focused Economy plugin, rewritten for the new architecture
import moment from 'moment-timezone';
import { PluginHelpers } from '../lib/pluginIntegration.js'; // ✅ NEW: Import the shared helpers
import { TimeHelpers } from '../lib/helpers.js';

// Plugin information export
export const info = {
  name: 'Enhanced Economy System',
  version: '4.0.0', // Version bumped to reflect major rewrite
  author: 'Bot Developer',
  description: 'A focused economy system with investments, shop, and achievements, using a centralized DB connection.',
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
    
    // Investments
    { name: 'invest', aliases: [], description: 'Investment system' },
    { name: 'stocks', aliases: [], description: 'Stock market' },
    { name: 'crypto', aliases: [], description: 'Cryptocurrency trading' },
    { name: 'business', aliases: [], description: 'Buy businesses' },
    
    // Social & Achievements
    { name: 'profile', aliases: [], description: 'View user profile' },
    { name: 'leaderboard', aliases: ['lb'], description: 'View top users' },
    { name: 'achievements', aliases: ['ach'], description: 'View achievements' },
    
    // Shop & Items
    { name: 'shop', aliases: [], description: 'Browse shop items' },
    { name: 'inventory', aliases: ['inv'], description: 'View your inventory' },
    { name: 'use', aliases: [], description: 'Use an item' },
    
    // Events & Admin
    { name: 'events', aliases: [], description: 'View active events' },
    { name: 'bounty', aliases: [], description: 'Bounty hunting system' }
  ]
};

// ⛔️ OLD MONGODB CONFIGURATION REMOVED ⛔️
// No longer needed, as the connection is managed centrally.

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Enhanced economy settings with removed features
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

let ecoSettings = { ...defaultSettings };
let settingsLoaded = false; // ✅ NEW: Flag to ensure settings are loaded only once

// ✅ REWRITTEN: Load and save settings using PluginHelpers
async function loadSettings() {
  try {
    const settings = await PluginHelpers.safeDBOperation(async (db) => {
      return db.collection('economy_settings').findOne({ type: 'economy' });
    });
    if (settings) {
      ecoSettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading economy settings:', error);
  }
}

async function saveSettings() {
  try {
    await PluginHelpers.safeDBOperation(async (db) => {
      return db.collection('economy_settings').replaceOne(
        { type: 'economy' },
        { type: 'economy', data: ecoSettings, updatedAt: new Date() },
        { upsert: true }
      );
    });
  } catch (error) {
    console.error('Error saving economy settings:', error);
  }
}

// ✅ REWRITTEN: User initialization is now handled by the UnifiedUserManager
async function initUser(userId) {
  return PluginHelpers.getUserData(userId);
}

// Shop Items Database with items removed
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
    name: "Bodyguard",
    price: 8000,
    description: "Hire a bodyguard to prevent robberies for 48 hours",
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
  
  // Permanent Upgrades
  vipStatus: {
    name: "VIP Status",
    price: 100000,
    description: "Permanent 25% bonus to all earnings",
    type: "permanent",
    effect: "vipBonus",
    emoji: "👑"
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
  marketTip: {
    name: "Market Insider Info",
    price: 10000,
    description: "Guarantees profitable investment for 1 trade",
    type: "consumable",
    effect: "marketTip",
    emoji: "📊"
  }
};

// Helper function to map lowercase item IDs to camelCase
function getItemId(inputId) {
  const itemMapping = {
    'workboost': 'workBoost',
    'bodyguard': 'Bodyguard', 
    'dailyboost': 'dailyBoost',
    'vipstatus': 'vipStatus',
    'lockpicks': 'lockpicks',
    'businesssuit': 'businessSuit',
    'goldencrown': 'goldenCrown',
    'customtitle': 'customTitle',
    'markettip': 'marketTip'
  };
  
  return itemMapping[inputId.toLowerCase()] || inputId;
}

// Cryptocurrency system
let cryptoData = {
  BTC: { name: "Bitcoin", price: 45000, volatility: 0.05 },
  ETH: { name: "Ethereum", price: 3200, volatility: 0.06 },
  SOL: { name: "Solana", price: 120, volatility: 0.08 },
  SHIB: { name: "Shiba Inu", price: 0.00002, volatility: 0.12 },
  GROQ: { name: "Groq Coin", price: 15, volatility: 0.10 },
  ADA: { name: "Cardano", price: 0.8, volatility: 0.07 },
  DOT: { name: "Polkadot", price: 25, volatility: 0.08 },
  MATIC: { name: "Polygon", price: 1.2, volatility: 0.09 }
};

// Business system
let businessData = {
  restaurant: { name: "Restaurant", price: 50000, roi: 0.12, description: "Earn from food sales" },
  laundry: { name: "Laundry Service", price: 25000, roi: 0.08, description: "Steady income from washing clothes" },
  realestate: { name: "Real Estate", price: 200000, roi: 0.06, description: "Rental income from properties" },
  fillingstation: { name: "Filling Station", price: 150000, roi: 0.10, description: "Fuel sales profit" },
  pharmacy: { name: "Pharmacy", price: 75000, roi: 0.09, description: "Medicine sales income" },
  supermarket: { name: "Supermarket", price: 100000, roi: 0.08, description: "Grocery retail profits" },
  carwash: { name: "Car Wash", price: 30000, roi: 0.07, description: "Vehicle cleaning service" },
  barbershop: { name: "Barber Shop", price: 20000, roi: 0.11, description: "Hair cutting service income" }
};

// ✅ REWRITTEN: Database auto-updates now use PluginHelpers
async function updateCryptoPrices() {
  try {
    for (const [symbol, data] of Object.entries(cryptoData)) {
      const change = (Math.random() - 0.5) * data.volatility * 2;
      const newPrice = Math.max(data.price * (1 + change), data.price * 0.1); // Prevent going too low
      cryptoData[symbol].price = parseFloat(newPrice.toFixed(symbol === 'SHIB' ? 8 : 2));
    }
    
    // Save updated prices to database
    await PluginHelpers.safeDBOperation(async (db) => {
        db.collection('economy_settings').replaceOne(
          { type: 'crypto_prices' },
          { type: 'crypto_prices', data: cryptoData, updatedAt: new Date() },
          { upsert: true }
        );
    });
  } catch (error) {
    console.error('Error updating crypto prices:', error);
  }
}

// Load crypto prices from database
async function loadCryptoPrices() {
  try {
    const saved = await PluginHelpers.safeDBOperation(async (db) => {
        return db.collection('economy_settings').findOne({ type: 'crypto_prices' });
    });
    if (saved && saved.data) {
      cryptoData = { ...cryptoData, ...saved.data };
    }
  } catch (error) {
    console.error('Error loading crypto prices:', error);
  }
}

// Auto-update business ROI
async function updateBusinessROI() {
  try {
    for (const [id, business] of Object.entries(businessData)) {
      const change = (Math.random() - 0.5) * 0.02; // ±2% change
      businessData[id].roi = Math.max(business.roi + change, 0.01); // Min 1% ROI
    }
    
    await PluginHelpers.safeDBOperation(async (db) => {
        db.collection('economy_settings').replaceOne(
          { type: 'business_data' },
          { type: 'business_data', data: businessData, updatedAt: new Date() },
          { upsert: true }
        );
    });
  } catch (error) {
    console.error('Error updating business ROI:', error);
  }
}

// Start daily updates
setInterval(updateCryptoPrices, 24 * 60 * 60 * 1000); // Daily
setInterval(updateBusinessROI, 24 * 60 * 60 * 1000); // Daily

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
  businessTycoon: {
    name: "Business Tycoon",
    description: "Own 5 different businesses",
    reward: 75000,
    emoji: "🏢"
  }
};

// ✅ REWRITTEN: Utility functions now use the new helpers
async function getUserData(userId) {
  try {
    return await PluginHelpers.getUserData(userId);
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
}

async function updateUserData(userId, data) {
  try {
    return await PluginHelpers.updateUser(userId, data);
  } catch (error) {
    console.error('Error updating user data:', error);
    throw error;
  }
}

// ✅ REWRITTEN: Money functions use helpers for DB operations
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
    const newBalance = Math.min((user.balance || 0) + finalAmount, ecoSettings.maxWalletBalance);
    
    await updateUserData(userId, { 
      balance: newBalance,
      'stats.totalEarned': (user.stats?.totalEarned || 0) + finalAmount
    });
    
    // Log transaction using safeDBOperation
    await PluginHelpers.safeDBOperation(async (db) => {
        db.collection('economy_transactions').insertOne({
            userId,
            type: 'credit',
            amount: finalAmount,
            reason,
            balanceBefore: user.balance || 0,
            balanceAfter: newBalance,
            timestamp: new Date()
        });
    });
    
    // Check achievements
    await checkAchievements(userId, 'money', { amount: finalAmount });
    
    return newBalance;
  } catch (error) {
    console.error('Error adding money:', error);
    throw error;
  }
}

async function removeMoney(userId, amount, reason = 'Unknown') {
  try {
    const user = await getUserData(userId);
    if ((user.balance || 0) >= amount) {
      const newBalance = user.balance - amount;
      
      await updateUserData(userId, { 
        balance: newBalance,
        'stats.totalSpent': (user.stats?.totalSpent || 0) + amount
      });
      
      // Log transaction using safeDBOperation
      await PluginHelpers.safeDBOperation(async (db) => {
        db.collection('economy_transactions').insertOne({
          userId,
          type: 'debit',
          amount,
          reason,
          balanceBefore: user.balance,
          balanceAfter: newBalance,
          timestamp: new Date()
        });
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
        const totalWealth = (user.balance || 0) + (user.bank || 0);
        if (totalWealth >= 1000000 && !user.achievements.includes('millionaire')) {
          newAchievements.push('millionaire');
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
        } else {
          user.inventory.splice(itemIndex, 1);
        }
        updates.inventory = user.inventory;
        updates.activeEffects[shopItem.effect] = (updates.activeEffects[shopItem.effect] || 0) + 1;
        break;
    }
    
    if (shopItem.type === 'consumable') {
      if (item.quantity > 1) {
        user.inventory[itemIndex].quantity -= 1;
      } else {
        user.inventory.splice(itemIndex, 1);
      }
      updates.inventory = user.inventory;
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
    if (m?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      return m.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    if (m?.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      return m.message.extendedTextMessage.contextInfo.participant;
    }
    if (text) {
      const phoneNumber = text.replace(/[^0-9]/g, '');
      if (phoneNumber.length >= 10) {
        return phoneNumber + '@s.whatsapp.net';
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

function isAdmin(userId) {
  if (!userId) return false;
  const adminNumbers = process.env.ADMIN_NUMBERS?.split(',') || [];
  return adminNumbers.includes(userId.split('@')[0]);
}

function isOwner(userId) {
  if (!userId) return false;
  return userId.split('@')[0] === (process.env.OWNER_NUMBER || '');
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

// Main plugin handler
export default async function economyHandler(m, sock, config) {
  try {
    if (!m?.body?.startsWith(config.PREFIX)) return;

    // ✅ NEW: Load settings once on first command execution
    if (!settingsLoaded) {
      await loadSettings();
      await loadCryptoPrices(); // Load market data
      settingsLoaded = true;
      console.log('✅ Economy plugin settings and market data loaded.');
    }

    const messageBody = m.body.slice(config.PREFIX.length).trim();
    const args = messageBody.split(' ').filter(arg => arg.length > 0);
    if (args.length === 0) return;
    
    const command = args[0].toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    
    if (!senderId || !from) return;

    // ⛔️ OLD DB INITIALIZATION REMOVED ⛔️
    
    // Initialize user and clean up effects
    await getUserData(senderId); // This also handles initialization
    await cleanupExpiredEffects(senderId);
    
    const reply = async (text) => {
      try {
        if (!text) return;
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
        await handleSend(context, args);
        break;
        
      case 'deposit':
      case 'dep':
        await handleDeposit(context, args.slice(1));
        break;
        
      case 'withdraw':
      case 'wd':
        await handleWithdraw(context, args.slice(1));
        break;
        
      // Earning Commands
      case 'work':
        await handleWork(context);
        break;
        
      case 'rob':
        await handleRob(context, args);
        break;
        
      case 'daily':
        await handleDaily(context);
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
    }
  } catch (error) {
    console.error('❌ Economy plugin error:', error.message);
  }
}

// Simplified Economy Menu
async function showEconomyMenu(reply, prefix) {
  try {
    const menuText = `💰 *ENHANCED ECONOMY SYSTEM* 💰\n\n` +
                    `💵 *Basic Commands:*\n` +
                    `• *balance* - Check your balance\n` +
                    `• *send @user amount* - Transfer money\n` +
                    `• *deposit/withdraw amount* - Bank operations\n\n` +
                    `💼 *Earning:*\n` +
                    `• *work* - Work for money\n` +
                    `• *daily* - Daily rewards with streaks\n` +
                    `• *rob @user* - Risk/reward robbery\n\n` +
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
                    `• *leaderboard* - Top players\n\n` +
                    `🎉 *Events:* ${prefix}events\n` +
                    `⚙️ *Admin:* ${prefix}economy admin (admin only)`;
    
    await reply(menuText);
  } catch (error) {
    console.error('Error showing economy menu:', error);
  }
}

// Balance Command without vault
async function handleBalance(context, args) {
  const { reply, senderId, m, sock, from } = context;
  
  try {
    const targetUser = getTargetUser(m, args.join(' ')) || senderId;
    const userData = await getUserData(targetUser);
    
    const totalWealth = (userData.balance || 0) + (userData.bank || 0);
    const isOwnBalance = targetUser === senderId;
    const userNumber = targetUser.split('@')[0];
    
    let balanceText = `💰 *${isOwnBalance ? 'YOUR BALANCE' : `@${userNumber}'S BALANCE`}*\n\n`;
    balanceText += `💵 *Wallet:* ${ecoSettings.currency}${(userData.balance || 0).toLocaleString()}\n`;
    balanceText += `🏦 *Bank:* ${ecoSettings.currency}${(userData.bank || 0).toLocaleString()}\n`;
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
            const remainingMs = expiry - Date.now();
            const timeString = TimeHelpers.formatDuration(remainingMs);
            balanceText += `• ${effect} (${timeString} left)\n`;
          }
        });
      }
    }
    
    await sock.sendMessage(from, { text: balanceText, mentions: [targetUser] }, { quoted: m });
  } catch (error) {
    await reply('❌ *Error retrieving balance. Please try again.*');
    console.error('Balance error:', error);
  }
}

// Investment System - Stocks
async function handleStocks(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.investmentsEnabled) {
      return await reply('🚫 *Investments are currently disabled*');
    }
    
    if (!args || args.length === 0) {
      return await reply(`📈 *Stock Market Commands:*\n• *${context.config.PREFIX}stocks list*\n• *${context.config.PREFIX}stocks buy [stock] [amount]*\n• *${context.config.PREFIX}stocks sell [stock] [amount]*\n• *${context.config.PREFIX}stocks portfolio*`);
    }
    
    const action = args[0].toLowerCase();
    
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
          stockList += `${change >= 0 ? '📈' : '📉'} *${symbol}* - ${data.name}\n   💰 ${ecoSettings.currency}${data.price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)\n\n`;
        }
        await reply(stockList);
        break;
        
      case 'buy':
        if (args.length < 3) return await reply('⚠️ *Usage: stocks buy [symbol] [amount]*');
        const buySymbol = args[1].toUpperCase();
        const buyAmount = parseInt(args[2]);
        if (!stocks[buySymbol]) return await reply('❌ *Invalid stock symbol*');
        
        const totalCost = stocks[buySymbol].price * buyAmount;
        const userData = await getUserData(senderId);
        
        if (userData.balance < totalCost) {
          return await reply(`🚫 *Insufficient funds*\nRequired: ${ecoSettings.currency}${totalCost.toLocaleString()}`);
        }
        
        await removeMoney(senderId, totalCost, 'Stock purchase');
        const currentShares = userData.investments?.stocks?.[buySymbol] || 0;
        await updateUserData(senderId, { [`investments.stocks.${buySymbol}`]: currentShares + buyAmount });
        await reply(`📈 *Stock Purchase Successful!*\nBought ${buyAmount} shares of ${buySymbol} for ${ecoSettings.currency}${totalCost.toLocaleString()}`);
        break;
        
      case 'sell':
        if (args.length < 3) return await reply('⚠️ *Usage: stocks sell [symbol] [amount]*');
        const sellSymbol = args[1].toUpperCase();
        const sellAmount = parseInt(args[2]);
        if (!stocks[sellSymbol]) return await reply('❌ *Invalid stock symbol*');
        
        const sellUserData = await getUserData(senderId);
        const shares = sellUserData.investments?.stocks?.[sellSymbol] || 0;
        if (shares < sellAmount) return await reply(`🚫 *Insufficient shares*. You have ${shares}.`);
        
        const totalEarned = stocks[sellSymbol].price * sellAmount;
        await addMoney(senderId, totalEarned, 'Stock sale', false);
        await updateUserData(senderId, { [`investments.stocks.${sellSymbol}`]: shares - sellAmount });
        await reply(`📈 *Stock Sale Successful!*\nSold ${sellAmount} shares of ${sellSymbol} for ${ecoSettings.currency}${totalEarned.toLocaleString()}`);
        break;
        
      case 'portfolio':
        const portfolioData = await getUserData(senderId);
        if (!portfolioData.investments?.stocks || Object.keys(portfolioData.investments.stocks).length === 0) {
          return await reply('📊 *You don\'t own any stocks yet*');
        }
        
        let portfolio = '📊 *YOUR STOCK PORTFOLIO* 📊\n\n';
        let totalValue = 0;
        for (const [symbol, shares] of Object.entries(portfolioData.investments.stocks)) {
          if (shares > 0 && stocks[symbol]) {
            const currentValue = stocks[symbol].price * shares;
            totalValue += currentValue;
            portfolio += `📈 *${symbol}* - Shares: ${shares}, Value: ${ecoSettings.currency}${currentValue.toLocaleString()}\n`;
          }
        }
        portfolio += `\n💎 *Total Portfolio Value:* ${ecoSettings.currency}${totalValue.toLocaleString()}`;
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
      return await reply('🚫 *Shop is currently closed*');
    }
    
    if (!args || args.length === 0) {
      return await reply(`🛍️ *ECONOMY SHOP* 🛍️\n\n*Categories:*\n• *${context.config.PREFIX}shop consumables*\n• *${context.config.PREFIX}shop upgrades*\n• *${context.config.PREFIX}shop tools*\n• *${context.config.PREFIX}shop cosmetics*\n\n*Buy with:* ${context.config.PREFIX}shop buy [item_id]`);
    }
    
    const action = args[0].toLowerCase();
    
    if (action === 'buy') {
      if (args.length < 2) return await reply('⚠️ *Usage: shop buy [item_id]*');
      const itemId = getItemId(args[1]);
      const item = SHOP_ITEMS[itemId];
      if (!item) return await reply('❌ *Item not found*');
      
      const userData = await getUserData(senderId);
      if (userData.balance < item.price) {
        return await reply(`🚫 *Insufficient funds*. Required: ${ecoSettings.currency}${item.price.toLocaleString()}`);
      }
      if (item.type === 'permanent' && userData.activeEffects?.[item.effect]) {
        return await reply('⚠️ *You already own this permanent upgrade*');
      }
      
      await removeMoney(senderId, item.price, 'Shop purchase');
      const inventory = userData.inventory || [];
      const existingItem = inventory.find(invItem => invItem.id === itemId);
      
      if (existingItem) {
        existingItem.quantity = (existingItem.quantity || 1) + 1;
      } else {
        inventory.push({ id: itemId, name: item.name, quantity: 1, uses: item.uses || null });
      }
      
      await updateUserData(senderId, { inventory });
      await reply(`✅ *Purchase Successful!*\nYou bought: *${item.name}*`);
    } else {
      const categories = { consumables: [], upgrades: [], tools: [], cosmetics: [], special: [] };
      Object.entries(SHOP_ITEMS).forEach(([id, item]) => {
          if (categories[item.type + 's']) {
            categories[item.type + 's'].push({id, ...item});
          } else if (categories[item.type]) {
            categories[item.type].push({id, ...item});
          }
      });

      const category = action;
      if (!categories[category]) return await reply('❌ *Invalid category*');
      
      let categoryText = `🛍️ *${category.toUpperCase()} SHOP* 🛍️\n\n`;
      categories[category].forEach(item => {
        categoryText += `${item.emoji} *${item.name}* - ${ecoSettings.currency}${item.price.toLocaleString()}\n   📝 ${item.description}\n   🛒 ID: ${item.id}\n\n`;
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
      return await reply(`💊 *Usage:* ${context.config.PREFIX}use [item_id]`);
    }
    
    const itemId = getItemId(args[0]);
    const result = await useItem(senderId, itemId);
    
    await reply(result.success ? `✅ *${result.message}*\nEffect: ${result.effect}` : `❌ *${result.message}*`);
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
      return await reply('📦 *Your inventory is empty*');
    }
    
    let invText = '📦 *YOUR INVENTORY* 📦\n\n';
    userData.inventory.forEach(item => {
      const shopItem = SHOP_ITEMS[item.id];
      invText += `${shopItem?.emoji || '📦'} *${item.name}* (x${item.quantity})\n`;
      if (item.uses) invText += `   Uses: ${item.uses}\n`;
      invText += `   🔧 Use: ${context.config.PREFIX}use ${item.id}\n\n`;
    });
    
    await reply(invText);
  } catch (error) {
    await reply('❌ *Error loading inventory. Please try again.*');
    console.error('Inventory error:', error);
  }
}

// Enhanced Work Command with job selection
async function handleWork(context) {
  const { reply, senderId } = context;
  const now = new Date();
  
  try {
    const userData = await getUserData(senderId);
    
    if (userData.lastWork && now - new Date(userData.lastWork) < ecoSettings.workCooldownMinutes * 60 * 1000) {
      const remaining = Math.ceil((ecoSettings.workCooldownMinutes * 60 * 1000 - (now - new Date(userData.lastWork))) / 60000);
      return await reply(`⏱️ *You're tired! Rest for ${remaining} minutes.*`);
    }
    
    const randomJob = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
    let baseEarnings = Math.floor(Math.random() * (randomJob.max - randomJob.min + 1)) + randomJob.min;
    
    const events = [ { text: 'You worked overtime!', bonus: 0.3 }, { text: 'It was a normal day.', bonus: 0 } ];
    const randomEvent = events[Math.floor(Math.random() * events.length)];
    const finalEarnings = Math.floor(baseEarnings * (1 + randomEvent.bonus));
    
    await addMoney(senderId, finalEarnings, `Work (${randomJob.name})`, true);
    await updateUserData(senderId, {
      lastWork: now,
      'stats.workCount': (userData.stats?.workCount || 0) + 1,
    });
    
    await checkAchievements(senderId, 'work');
    const updatedData = await getUserData(senderId);
    await reply(`💼 *WORK COMPLETE!*\nJob: ${randomJob.name}\nEvent: ${randomEvent.text}\n💰 Earned: ${ecoSettings.currency}${finalEarnings.toLocaleString()}\n💵 New Balance: ${ecoSettings.currency}${updatedData.balance.toLocaleString()}`);
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
      return await reply('⏰ *You have already claimed your daily reward today!*');
    }
    
    let dailyAmount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
    
    const yesterday = getNigeriaTime().subtract(1, 'day').format('DD-MM-YYYY');
    let newStreak = (userData.lastDaily === yesterday) ? (userData.stats?.dailyStreak || 0) + 1 : 1;
    
    const streakBonus = Math.floor(newStreak * ecoSettings.dailyStreakBonus);
    dailyAmount += streakBonus;
    
    await addMoney(senderId, dailyAmount, `Daily Reward (Streak: ${newStreak})`, true);
    const newLongestStreak = Math.max(userData.stats?.maxDailyStreak || 0, newStreak);
    
    await updateUserData(senderId, {
      lastDaily: currentDate,
      'stats.dailyStreak': newStreak,
      'stats.maxDailyStreak': newLongestStreak,
    });
    
    const achievements = await checkAchievements(senderId, 'daily', { streak: newStreak });
    
    let rewardText = `🎁 *DAILY REWARD CLAIMED!*\n\n💰 Total Received: ${ecoSettings.currency}${dailyAmount.toLocaleString()}\n🔥 Current Streak: ${newStreak} days`;
    if (achievements.length > 0) {
      rewardText += `\n\n🏆 *Achievement Unlocked:* ${achievements.map(a => ACHIEVEMENTS[a]?.name || a).join(', ')}`;
    }
    await reply(rewardText);
  } catch (error) {
    await reply('❌ *Error claiming daily reward. Please try again.*');
    console.error('Daily error:', error);
  }
}

// Profile command without vault and clan
async function handleProfile(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    const targetUser = (args && args.length > 0) ? getTargetUser(m, args.join(' ')) : senderId;
    const profileData = await getUserData(targetUser);
    
    const totalWealth = (profileData.balance || 0) + (profileData.bank || 0);
    const userNumber = targetUser.split('@')[0];
    
    const ranks = [ { name: 'Newbie', min: 0 }, { name: 'Worker', min: 10000 }, { name: 'Millionaire', min: 1000000 } ];
    let currentRank = ranks[0];
    for (const rank of ranks) { if (totalWealth >= rank.min) currentRank = rank; }
    
    const displayTitle = profileData.customTitle || currentRank.name;
    const crownEmoji = profileData.activeEffects?.crown ? '👑 ' : '';
    
    let profileText = `👤 *USER PROFILE*\n\n`;
    profileText += `📱 *User:* ${crownEmoji}@${userNumber}\n`;
    profileText += `🏅 *Rank:* ${displayTitle}\n`;
    profileText += `💎 *Total Wealth:* ${ecoSettings.currency}${totalWealth.toLocaleString()}\n`;
    profileText += `💵 *Wallet:* ${ecoSettings.currency}${(profileData.balance || 0).toLocaleString()}\n`;
    profileText += `🏦 *Bank:* ${ecoSettings.currency}${(profileData.bank || 0).toLocaleString()}\n`;
    
    if (profileData.stats) {
      profileText += `\n📊 *STATS*\n`;
      profileText += `💼 *Jobs:* ${profileData.stats.workCount || 0}\n`;
      profileText += `🔥 *Streak:* ${profileData.stats.dailyStreak || 0} days (Best: ${profileData.stats.maxDailyStreak || 0})\n`;
      profileText += `🦹 *Robberies:* ${profileData.stats.robsSuccessful || 0}/${profileData.stats.robsAttempted || 0}\n`;
    }
    
    await sock.sendMessage(from, { text: profileText, mentions: [targetUser] });
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
      let allAchText = '🏆 *ALL ACHIEVEMENTS* 🏆\n\n';
      for (const [id, ach] of Object.entries(ACHIEVEMENTS)) {
        allAchText += `${userAchievements.includes(id) ? '✅' : '⬜'} ${ach.emoji} *${ach.name}*\n   📝 ${ach.description}\n\n`;
      }
      await reply(allAchText);
    } else {
      if (userAchievements.length === 0) return await reply(`🏆 *No achievements yet!*\nUse *${context.config.PREFIX}achievements all* to see all.`);
      
      let userAchText = `🏆 *YOUR ACHIEVEMENTS* (${userAchievements.length}/${Object.keys(ACHIEVEMENTS).length}) 🏆\n\n`;
      userAchievements.forEach(achId => {
        const ach = ACHIEVEMENTS[achId];
        if (ach) userAchText += `${ach.emoji} *${ach.name}*\n   📝 ${ach.description}\n\n`;
      });
      await reply(userAchText);
    }
  } catch (error) {
    await reply('❌ *Error loading achievements. Please try again.*');
    console.error('Achievements error:', error);
  }
}

// ✅ REWRITTEN: Leaderboard now uses PluginHelpers
async function handleLeaderboard(context, args) {
  const { reply, sock, from } = context;
  
  try {
    const category = args?.[0]?.toLowerCase() || 'wealth';
    let sortField, title, emoji, fieldName;

    switch (category) {
      case 'wealth':
      case 'money':
        sortField = { $add: [{ $ifNull: ['$balance', 0] }, { $ifNull: ['$bank', 0] }] }; title = 'WEALTH'; emoji = '💰'; break;
      case 'work':
      case 'jobs':
        sortField = '$stats.workCount'; title = 'WORK'; emoji = '💼'; fieldName = 'jobs'; break;
      case 'streak':
      case 'daily':
        sortField = '$stats.maxDailyStreak'; title = 'STREAK'; emoji = '🔥'; fieldName = 'days'; break;
      case 'achievements':
      case 'ach':
        sortField = { $size: { $ifNull: ['$achievements', []] } }; title = 'ACHIEVEMENT'; emoji = '🏆'; fieldName = 'achievements'; break;
      default:
        return await reply(`📊 *Leaderboard Categories:*\n• wealth\n• work\n• streak\n• achievements`);
    }
    
    const pipeline = [ { $addFields: { sortValue: sortField } }, { $sort: { sortValue: -1 } }, { $limit: 10 } ];
    
    const users = await PluginHelpers.safeDBOperation(async (db) => {
      return db.collection('economy_users').aggregate(pipeline).toArray();
    });
    
    if (users.length === 0) return await reply('📊 *No data available for this leaderboard*');
    
    let leaderboard = `${emoji} *${title} LEADERBOARD* ${emoji}\n\n`;
    users.forEach((user, index) => {
      const rank = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const crown = user.activeEffects?.crown ? '👑 ' : '';
      leaderboard += `${rank} ${crown}@${user.userId.split('@')[0]}\n`;
      if (category === 'wealth') {
        const wealth = (user.balance || 0) + (user.bank || 0);
        leaderboard += `   💰 ${ecoSettings.currency}${wealth.toLocaleString()}\n`;
      } else {
          let value = 0;
          if(category === 'work') value = user.stats?.workCount || 0;
          if(category === 'streak') value = user.stats?.maxDailyStreak || 0;
          if(category === 'achievements') value = user.achievements?.length || 0;
          leaderboard += `   ${emoji} ${value} ${fieldName}\n`;
      }
      leaderboard += `\n`;
    });
    
    await sock.sendMessage(from, { text: leaderboard, mentions: users.map(u => u.userId) });
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
      return await reply('🚫 *Only admins can access these settings*');
    }
    
    if (!args || args.length === 0) {
      let settingsText = `⚙️ *ECONOMY ADMIN SETTINGS* ⚙️\n\n`;
      settingsText += `*Features:*\n• Investments: ${ecoSettings.investmentsEnabled ? '✅' : '❌'}\n• Shop: ${ecoSettings.shopEnabled ? '✅' : '❌'}\n\n`;
      settingsText += `*Commands:*\n• *${context.config.PREFIX}eco admin set [setting] [value]*\n• *${context.config.PREFIX}eco admin toggle [feature]*\n• *${context.config.PREFIX}eco admin give @user [amount]*`;
      return await reply(settingsText);
    }
    
    const action = args[0].toLowerCase();
    
    switch (action) {
      case 'set':
        if (args.length < 3) return await reply('⚠️ *Usage: eco admin set [setting] [value]*');
        const setting = args[1];
        let value = args[2];
        if (ecoSettings.hasOwnProperty(setting)) {
          ecoSettings[setting] = isNaN(parseInt(value)) ? value : parseInt(value);
          await saveSettings();
          await reply(`✅ *Setting updated: ${setting} = ${ecoSettings[setting]}*`);
        } else {
          await reply('❌ *Invalid setting name*');
        }
        break;
        
      case 'toggle':
        if (args.length < 2) return await reply('⚠️ *Usage: eco admin toggle [feature]*');
        const feature = args[1] + 'Enabled';
        if (ecoSettings.hasOwnProperty(feature)) {
          ecoSettings[feature] = !ecoSettings[feature];
          await saveSettings();
          await reply(`🎛️ *${args[1]} ${ecoSettings[feature] ? '✅ Enabled' : '❌ Disabled'}*`);
        } else {
          await reply('❌ *Invalid feature name*');
        }
        break;
        
      case 'give':
        if (args.length < 3) return await reply('⚠️ *Usage: eco admin give @user [amount]*');
        const giveTarget = getTargetUser(context.m, args[1]);
        const giveAmount = parseInt(args[2]);
        if (!giveTarget || isNaN(giveAmount) || giveAmount <= 0) return await reply('⚠️ *Invalid user or amount*');
        await addMoney(giveTarget, giveAmount, 'Admin gift', false);
        await reply(`✅ *Gave ${ecoSettings.currency}${giveAmount.toLocaleString()} to @${giveTarget.split('@')[0]}*`);
        break;
        
      case 'event':
        if (args.length < 2) return await reply(`🎉 *Event Commands:*\n• double, lucky, crash, bonus`);
        const eventType = args[1].toLowerCase();
        await PluginHelpers.safeDBOperation(async (db) => {
            db.collection('economy_events').insertOne({ type: eventType, active: true, startTime: new Date(), endTime: new Date(Date.now() + 3600000) });
        });
        await context.sock.sendMessage(context.from, { text: `🎉 *EVENT STARTED: ${eventType.toUpperCase()}!* 🎉` });
        break;
    }
  } catch (error) {
    await reply('❌ *Error processing admin command.*');
    console.error('Admin settings error:', error);
  }
}

// Handle subcommands for the main economy command
async function handleSubCommand(subCommand, args, context) {
    // This function routes 'economy <subcommand>' to the correct handler
    // e.g., 'economy balance' calls handleBalance
    const commandMap = {
        'balance': handleBalance, 'bal': handleBalance, 'wallet': handleBalance,
        'send': handleSend, 'transfer': handleSend, 'pay': handleSend,
        'deposit': handleDeposit, 'dep': handleDeposit,
        'withdraw': handleWithdraw, 'wd': handleWithdraw,
        'work': handleWork, 'rob': handleRob, 'daily': handleDaily,
        'invest': handleInvest, 'stocks': handleStocks, 'crypto': handleCrypto, 'business': handleBusiness,
        'profile': handleProfile, 'leaderboard': handleLeaderboard, 'lb': handleLeaderboard,
        'achievements': handleAchievements, 'ach': handleAchievements,
        'shop': handleShop, 'inventory': handleInventory, 'inv': handleInventory, 'use': handleUse,
        'events': handleEvents, 'bounty': handleBounty, 'admin': handleAdminSettings
    };

    const handler = commandMap[subCommand.toLowerCase()];
    if (handler) {
        await handler(context, args);
    } else {
        await context.reply(`❓ Unknown economy command: *${subCommand}*`);
    }
}

// Enhanced handleSend with transaction limits and fees
async function handleSend(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    const targetUser = getTargetUser(m, args.join(' '));
    let amount = NaN;
    for (const arg of args) {
      const potentialAmount = parseInt(arg);
      if (!isNaN(potentialAmount) && potentialAmount > 0) {
        amount = potentialAmount;
        break;
      }
    }

    if (!targetUser) return await reply(`💸 *Who is the recipient?* Mention or reply to them.`);
    if (isNaN(amount)) return await reply(`⚠️ *Please provide a valid amount to send.*`);
    if (targetUser === senderId) return await reply('🧠 *You cannot send money to yourself!*');
    
    const fee = Math.max(Math.floor(amount * 0.01), 5);
    const totalCost = amount + fee;
    
    const senderData = await getUserData(senderId);
    if ((senderData.balance || 0) < totalCost) {
      return await reply(`🚫 *Insufficient balance*. Required: ${ecoSettings.currency}${totalCost.toLocaleString()}`);
    }
    
    await removeMoney(senderId, totalCost, 'Transfer sent');
    await addMoney(targetUser, amount, 'Transfer received', false);
    
    await sock.sendMessage(from, {
      text: `✅ *TRANSFER SUCCESSFUL* ✅\n\n💸 *@${senderId.split('@')[0]}* sent *${ecoSettings.currency}${amount.toLocaleString()}* to *@${targetUser.split('@')[0]}*`,
      mentions: [senderId, targetUser]
    }, { quoted: m });
  } catch (error) {
    await reply('❌ *Error processing transfer. Please try again.*');
    console.error('Send error:', error);
  }
}


// Bank commands
async function handleDeposit(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!args || args.length === 0) return await reply(`🏦 *Usage:* ${context.config.PREFIX}deposit [amount]`);
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) return await reply('⚠️ *Invalid amount*');
    
    const userData = await getUserData(senderId);
    if ((userData.balance || 0) < amount) return await reply('🚫 *Insufficient wallet balance*');
    if (((userData.bank || 0) + amount) > ecoSettings.maxBankBalance) return await reply(`🚫 *Bank limit exceeded*`);
    
    await updateUserData(senderId, {
      balance: userData.balance - amount,
      bank: (userData.bank || 0) + amount
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`🏦 *Deposited ${ecoSettings.currency}${amount.toLocaleString()}*\nNew Bank Balance: ${ecoSettings.currency}${updatedData.bank.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing deposit. Please try again.*');
    console.error('Deposit error:', error);
  }
}

async function handleWithdraw(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!args || args.length === 0) return await reply(`🏦 *Usage:* ${context.config.PREFIX}withdraw [amount]`);
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) return await reply('⚠️ *Invalid amount*');
    
    const userData = await getUserData(senderId);
    if ((userData.bank || 0) < amount) return await reply('🚫 *Insufficient bank balance*');
    if (((userData.balance || 0) + amount) > ecoSettings.maxWalletBalance) return await reply(`🚫 *Wallet limit exceeded*`);
    
    await updateUserData(senderId, {
      balance: userData.balance + amount,
      bank: userData.bank - amount
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`💵 *Withdrew ${ecoSettings.currency}${amount.toLocaleString()}*\nNew Wallet Balance: ${ecoSettings.currency}${updatedData.balance.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing withdrawal. Please try again.*');
    console.error('Withdraw error:', error);
  }
}

// Enhanced handleRob with protection items and wanted level
async function handleRob(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    const targetUser = getTargetUser(m, args.join(' '));
    if (!targetUser) return await reply(`🦹 *Who do you want to rob?*`);
    if (targetUser === senderId) return await reply('🧠 *You cannot rob yourself!*');
    
    const now = new Date();
    const robberData = await getUserData(senderId);
    
    if (robberData.lastRob && now - new Date(robberData.lastRob) < ecoSettings.robCooldownMinutes * 60 * 1000) {
      const remaining = Math.ceil((ecoSettings.robCooldownMinutes * 60 * 1000 - (now - new Date(robberData.lastRob))) / 60000);
      return await reply(`⏱️ *Cooldown! Try again in ${remaining} minutes.*`);
    }
    
    const targetData = await getUserData(targetUser);
    
    if (targetData.activeEffects?.robProtection > Date.now()) {
      return await reply(`🛡️ *@${targetUser.split('@')[0]} is protected!*`);
    }
    if ((targetData.balance || 0) < ecoSettings.robMinTargetBalance) {
      return await reply(`👀 *Target is too broke to rob.*`);
    }
    if ((robberData.balance || 0) < ecoSettings.robMinRobberBalance) {
      return await reply(`💸 *You need at least ${ecoSettings.currency}${ecoSettings.robMinRobberBalance} to attempt a robbery.*`);
    }
    
    let successRate = ecoSettings.robSuccessRate;
    if (robberData.activeEffects?.robberyBoost) {
      successRate += 0.2;
      await updateUserData(senderId, { 'activeEffects.robberyBoost': Math.max(0, (robberData.activeEffects.robberyBoost || 0) - 1) });
    }
    
    const success = Math.random() < successRate;
    
    await updateUserData(senderId, { lastRob: now, 'stats.robsAttempted': (robberData.stats?.robsAttempted || 0) + 1 });
    
    if (success) {
      const stolen = Math.floor(Math.random() * (targetData.balance * ecoSettings.robMaxStealPercent)) + ecoSettings.robMinSteal;
      await removeMoney(targetUser, stolen, 'Robbed');
      await addMoney(senderId, stolen, 'Successful Robbery');
      await updateUserData(senderId, { 'stats.robsSuccessful': (robberData.stats?.robsSuccessful || 0) + 1 });
      await checkAchievements(senderId, 'rob', { successful: true, successfulCount: (robberData.stats?.robsSuccessful || 0) + 1 });
      await sock.sendMessage(from, { text: `🦹‍♂️ *SUCCESS!* @${senderId.split('@')[0]} robbed *${ecoSettings.currency}${stolen.toLocaleString()}* from @${targetUser.split('@')[0]}!`, mentions: [senderId, targetUser] });
    } else {
      await removeMoney(senderId, ecoSettings.robFailPenalty, 'Robbery Fail Penalty');
      await sock.sendMessage(from, { text: `🚨 *FAILED!* @${senderId.split('@')[0]} was caught and paid a fine of ${ecoSettings.currency}${ecoSettings.robFailPenalty.toLocaleString()}!`, mentions: [senderId] });
    }
  } catch (error) {
    await reply('❌ *Error processing robbery. Please try again.*');
    console.error('Rob error:', error);
  }
}


// Placeholder functions for remaining features
async function handleInvest(context, args) {
  await context.reply('🚧 *Investment overview coming soon!* 🚧');
}

async function handleCrypto(context, args) {
    await context.reply('🚧 *Crypto feature coming soon!* 🚧');
}

async function handleBusiness(context, args) {
    await context.reply('🚧 *Business feature coming soon!* 🚧');
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
