// plugins/economy_enhanced.js - A focused Economy plugin
// ✅ REFACTORED: Removed direct MongoClient import
import moment from 'moment-timezone';
import { TimeHelpers } from '../lib/helpers.js';
// ✅ REFACTORED: Import the new PluginHelpers and safeOperation for database access
import { PluginHelpers, safeOperation, getCollection } from '../lib/pluginIntegration.js';


// Plugin information export (UNCHANGED)
export const info = {
  name: 'Enhanced Economy System',
  version: '3.2.1',
  author: 'Alex Macksyn',
  description: 'A focused economy system with investments, shop, and achievements.',
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

// ✅ REFACTORED: Collection names are kept for local use
const COLLECTIONS = {
  USERS: 'economy_users',
  TRANSACTIONS: 'economy_transactions',
  SETTINGS: 'economy_settings',
  ACHIEVEMENTS: 'economy_achievements',
  INVESTMENTS: 'economy_investments',
  EVENTS: 'economy_events',
  BUSINESSES: 'economy_businesses'
};


// ❌ REMOVED: The old initDatabase function is no longer needed.
// The mongoManager handles the connection automatically.

// Set Nigeria timezone (UNCHANGED)
moment.tz.setDefault('Africa/Lagos');

// Enhanced economy settings with removed features (UNCHANGED)
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

// Load and save settings (UNCHANGED)
let ecoSettings = { ...defaultSettings };

// ✅ REFACTORED: Uses getCollection for safe, shared database access.
async function loadSettings() {
  try {
    const collection = await getCollection(COLLECTIONS.SETTINGS);
    const settings = await collection.findOne({ type: 'economy' });
    if (settings) {
      ecoSettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading economy settings:', error);
  }
}

// ✅ REFACTORED: Uses getCollection for safe, shared database access.
async function saveSettings() {
  try {
    const collection = await getCollection(COLLECTIONS.SETTINGS);
    await collection.replaceOne(
      { type: 'economy' },
      { type: 'economy', data: ecoSettings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving economy settings:', error);
  }
}

// ✅ REFACTORED: Uses getCollection for safe, shared database access.
async function initUser(userId) {
  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const existingUser = await usersCollection.findOne({ userId });
    
    if (!existingUser) {
      const newUser = {
        userId,
        // Basic Economy
        balance: ecoSettings.startingBalance,
        bank: ecoSettings.startingBankBalance,
        
        // Inventory & Items
        inventory: [],
        activeEffects: {},
        
        // Social
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
        lastGamble: null,
        
        // System
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await usersCollection.insertOne(newUser);
      await checkAchievements(userId, 'registration');
      return newUser;
    } else {
      // Backward compatibility - add missing fields (UNCHANGED LOGIC)
      const updates = {};
      let needsUpdate = false;

      // FIX: Check for and correct NaN balances
      if (isNaN(existingUser.balance)) {
        updates.balance = 0;
        needsUpdate = true;
        console.warn(`Corrected NaN balance for user ${userId}`);
      }
      if (isNaN(existingUser.bank)) {
        updates.bank = 0;
        needsUpdate = true;
        console.warn(`Corrected NaN bank balance for user ${userId}`);
      }
      
      const requiredFields = {
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
        await usersCollection.updateOne(
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

// Shop Items Database with items removed (UNCHANGED)
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
    price: 20000,
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

// Helper function to map lowercase item IDs to camelCase (UNCHANGED)
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

// MODIFIED: Cryptocurrency system with price fluctuation properties
let cryptoData = {
  BTC: { name: "Bitcoin", price: 45000, volatility: 0.05, trend: 0.001, history: [], lastChange: 'stable' },
  ETH: { name: "Ethereum", price: 3200, volatility: 0.06, trend: -0.002, history: [], lastChange: 'stable' },
  SOL: { name: "Solana", price: 120, volatility: 0.08, trend: 0.005, history: [], lastChange: 'stable' },
  SHIB: { name: "Shiba Inu", price: 0.00002, volatility: 0.12, trend: 0.01, history: [], lastChange: 'stable' },
  GROQ: { name: "Groq Coin", price: 15, volatility: 0.10, trend: -0.003, history: [], lastChange: 'stable' },
  ADA: { name: "Cardano", price: 0.8, volatility: 0.07, trend: 0.002, history: [], lastChange: 'stable' },
  DOT: { name: "Polkadot", price: 25, volatility: 0.08, trend: 0.001, history: [], lastChange: 'stable' },
  MATIC: { name: "Polygon", price: 1.2, volatility: 0.09, trend: -0.001, history: [], lastChange: 'stable' }
};

// Business system (UNCHANGED)
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

// ✅ REFACTORED: Auto-update business ROI using safeOperation
async function updateBusinessROI() {
  try {
    for (const [id, business] of Object.entries(businessData)) {
      const change = (Math.random() - 0.5) * 0.02; // ±2% change
      businessData[id].roi = Math.max(business.roi + change, 0.01); // Min 1% ROI
    }
    
    await safeOperation(async (db) => {
      await db.collection(COLLECTIONS.SETTINGS).replaceOne(
        { type: 'business_data' },
        { type: 'business_data', data: businessData, updatedAt: new Date() },
        { upsert: true }
      );
    });
  } catch (error) {
    console.error('Error updating business ROI:', error);
  }
}

// NEW: Function to handle market trends and events
async function updateMarketConditions() {
  try {
    // Update Crypto Trends
    for (const symbol in cryptoData) {
        if(!cryptoData[symbol].trend) cryptoData[symbol].trend = 0;
        // Small random change to the trend
        const trendChange = (Math.random() - 0.5) * 0.005; 
        cryptoData[symbol].trend += trendChange;

        // Clamp the trend to prevent it from running away
        cryptoData[symbol].trend = Math.max(-0.02, Math.min(0.02, cryptoData[symbol].trend));
    }

    // Global market event (e.g., 5% chance)
    if (Math.random() < 0.05) {
        const marketBoom = Math.random() > 0.5;
        const impact = (Math.random() * 0.15) + 0.1; // 10% to 25% impact
        console.log(`MARKET EVENT: ${marketBoom ? 'BOOM' : 'CRASH'} of ${(impact * 100).toFixed(2)}%`);

        for (const symbol in cryptoData) {
            // Not all coins are affected equally
            if (Math.random() > 0.3) { 
                const coinImpact = impact * (marketBoom ? 1 : -1) * (1 + (Math.random() - 0.5) * 0.5);
                cryptoData[symbol].price *= (1 + coinImpact);
            }
        }
    }
    
    // Also update business ROI
    await updateBusinessROI();
  } catch(error) {
    console.error('Error updating market conditions:', error);
  }
}

// MODIFIED: Auto-update prices frequently for realistic fluctuation
async function updateCryptoPrices() {
  try {
    for (const [symbol, data] of Object.entries(cryptoData)) {
      // Base change on volatility
      const randomVolatility = (Math.random() - 0.5) * data.volatility;
      
      // Add the current trend
      const trendEffect = data.trend || 0;
      
      // Calculate total change
      const change = randomVolatility + trendEffect;
      
      const oldPrice = data.price;
      let newPrice = oldPrice * (1 + change);
      
      // Prevent price from going to zero or negative
      newPrice = Math.max(newPrice, 0.00000001); 

      cryptoData[symbol].price = parseFloat(newPrice.toFixed(symbol === 'SHIB' ? 8 : 2));

      // Track history (last 20 ticks)
      if (!cryptoData[symbol].history) {
        cryptoData[symbol].history = [];
      }
      cryptoData[symbol].history.push(oldPrice); // Store the price before the change for comparison
      if (cryptoData[symbol].history.length > 20) {
        cryptoData[symbol].history.shift();
      }

      // Track last change direction
      if (newPrice > oldPrice) {
        cryptoData[symbol].lastChange = 'up';
      } else if (newPrice < oldPrice) {
        cryptoData[symbol].lastChange = 'down';
      } else {
         cryptoData[symbol].lastChange = 'stable';
      }
    }
    
    // Save updated prices to database
    await safeOperation(async (db) => {
      await db.collection(COLLECTIONS.SETTINGS).replaceOne(
        { type: 'crypto_prices' },
        { type: 'crypto_prices', data: cryptoData, updatedAt: new Date() },
        { upsert: true }
      );
    });
  } catch (error) {
    console.error('Error updating crypto prices:', error);
  }
}

// ✅ REFACTORED: Load crypto prices from database using safeOperation
async function loadCryptoPrices() {
  try {
    await safeOperation(async (db) => {
      const saved = await db.collection(COLLECTIONS.SETTINGS).findOne({ type: 'crypto_prices' });
      if (saved && saved.data) {
        cryptoData = { ...cryptoData, ...saved.data };
      }
    });
  } catch (error) {
    console.error('Error loading crypto prices:', error);
  }
}

// MODIFIED: Start dynamic market updates
(async () => {
  await loadCryptoPrices();
  setInterval(updateCryptoPrices, 5 * 60 * 1000); // Every 5 minutes for price fluctuation
  setInterval(updateMarketConditions, 6 * 60 * 60 * 1000); // Every 6 hours for market trends and business ROI
})();

// Achievement definitions (UNCHANGED)
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

// ✅ REFACTORED: Utility functions now use the new system.
async function getUserData(userId) {
  try {
    // initUser ensures the user exists with all necessary fields.
    await initUser(userId); 
    // This now uses the centralized helper which is more efficient and includes caching.
    return await PluginHelpers.getUserData(userId); 
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
}

async function updateUserData(userId, data) {
  try {
    // This now uses the centralized helper which is more efficient.
    return await PluginHelpers.updateUser(userId, data);
  } catch (error) {
    console.error('Error updating user data:', error);
    throw error;
  }
}

// ✅ REFACTORED: Money functions now use getCollection for direct, safe access.
// We keep the custom logic for effects, but replace the DB interaction.
async function addMoney(userId, amount, reason = 'Unknown', applyEffects = true) {
  // FIX: Failsafe to prevent non-finite numbers from being added
  if (!Number.isFinite(amount)) {
    console.error(`Attempted to add invalid amount: ${amount} for user ${userId}`);
    throw new Error('Invalid amount provided to addMoney');
  }
  try {
    const user = await getUserData(userId);
    let finalAmount = amount;
    
    // Apply active effects if enabled (UNCHANGED LOGIC)
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
    
    // REFACTORED DB CALL
    await updateUserData(userId, { 
      balance: newBalance,
      'stats.totalEarned': (user.stats?.totalEarned || 0) + finalAmount
    });
    
    // REFACTORED DB CALL
    const transactionsCollection = await getCollection(COLLECTIONS.TRANSACTIONS);
    await transactionsCollection.insertOne({
      userId,
      type: 'credit',
      amount: finalAmount,
      reason,
      balanceBefore: user.balance,
      balanceAfter: newBalance,
      timestamp: new Date()
    });
    
    // Check achievements (UNCHANGED LOGIC)
    await checkAchievements(userId, 'money', { amount: finalAmount, total: user.stats?.totalEarned || 0 + finalAmount });
    
    return newBalance;
  } catch (error) {
    console.error('Error adding money:', error);
    throw error;
  }
}

async function removeMoney(userId, amount, reason = 'Unknown') {
  // FIX: Failsafe to prevent non-finite numbers from being removed
  if (!Number.isFinite(amount)) {
    console.error(`Attempted to remove invalid amount: ${amount} for user ${userId}`);
    throw new Error('Invalid amount provided to removeMoney');
  }
  try {
    const user = await getUserData(userId);
    if (user.balance >= amount) {
      const newBalance = user.balance - amount;
      
      // REFACTORED DB CALL
      await updateUserData(userId, { 
        balance: newBalance,
        'stats.totalSpent': (user.stats?.totalSpent || 0) + amount
      });
      
      // REFACTORED DB CALL
      const transactionsCollection = await getCollection(COLLECTIONS.TRANSACTIONS);
      await transactionsCollection.insertOne({
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


// Achievement checking system (UNCHANGED - relies on refactored functions)
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
        const totalWealth = user.balance + user.bank;
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

// Item usage system (UNCHANGED - relies on refactored functions)
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

// Helper functions (UNCHANGED)
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

// Clean up expired effects (UNCHANGED - relies on refactored functions)
async function cleanupExpiredEffects(userId) {
  try {
    const user = await getUserData(userId);
    if (!user.activeEffects) return;
    
    const now = new Date();
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

// Main plugin handler (UNCHANGED for the most part)
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

    // ✅ REFACTORED: No longer need to initialize the database connection here.
    // It's handled automatically. We just load settings.
    await loadSettings();
    
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
    
    // Handle different commands (UNCHANGED)
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
        
      default:
        break;
    }
  } catch (error) {
    console.error('❌ Economy plugin error:', error.message);
  }
}

// Simplified Economy Menu (UNCHANGED)
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

// Balance Command without vault (UNCHANGED - relies on refactored functions)
async function handleBalance(context, args) {
  const { reply, senderId, m, sock, from } = context;
  
  try {
    const targetUser = getTargetUser(m, args.join(' ')) || senderId;
    
    await initUser(targetUser);
    const userData = await getUserData(targetUser);
    
    const totalWealth = userData.balance + userData.bank;
    const isOwnBalance = targetUser === senderId;
    const userNumber = targetUser.split('@')[0];
    
    let balanceText = `💰 *${isOwnBalance ? 'YOUR BALANCE' : `@${userNumber}'S BALANCE`}*\n\n`;
    balanceText += `💵 *Wallet:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n`;
    balanceText += `🏦 *Bank:* ${ecoSettings.currency}${userData.bank.toLocaleString()}\n`;
    
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
    
    const content = {
      text: balanceText,
      mentions: [targetUser]
    };
    
    const options = {
      quoted: m
    };
    
    await sock.sendMessage(from, content, options);

  } catch (error) {
    await reply('❌ *Error retrieving balance. Please try again.*');
    console.error('Balance error:', error);
  }
}

// Investment System - Stocks (UNCHANGED - relies on refactored functions)
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

        // FIX: Add robust input validation
        if (isNaN(buyAmount) || buyAmount <= 0) {
          await reply('⚠️ *Please provide a valid, positive number for the amount.*');
          return;
        }
        
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
        if (args.length < 3) {
          await reply('⚠️ *Usage: stocks sell [symbol] [amount]*');
          return;
        }
        
        const sellSymbol = args[1].toUpperCase();
        const sellAmount = parseInt(args[2]);

        // FIX: Add robust input validation
        if (isNaN(sellAmount) || sellAmount <= 0) {
            await reply('⚠️ *Please provide a valid, positive number for the amount.*');
            return;
        }
        
        if (!stocks[sellSymbol]) {
          await reply('❌ *Invalid stock symbol*');
          return;
        }
        
        const sellUserData = await getUserData(senderId);
        const shares = sellUserData.investments?.stocks?.[sellSymbol] || 0;
        
        if (shares < sellAmount) {
          await reply(`🚫 *Insufficient shares*\n\nYou own: ${shares}\nTrying to sell: ${sellAmount}`);
          return;
        }
        
        const sellPrice = stocks[sellSymbol].price;
        const totalEarned = sellPrice * sellAmount;
        
        await addMoney(senderId, totalEarned, 'Stock sale', false);
        await updateUserData(senderId, {
          [`investments.stocks.${sellSymbol}`]: shares - sellAmount
        });
        
        await reply(`📈 *Stock Sale Successful!*\n\n🏢 *Company:* ${stocks[sellSymbol].name}\n📊 *Symbol:* ${sellSymbol}\n💰 *Price per share:* ${ecoSettings.currency}${sellPrice.toFixed(2)}\n📦 *Shares sold:* ${sellAmount}\n💸 *Total earned:* ${ecoSettings.currency}${totalEarned.toLocaleString()}`);
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

// All other handler functions (handleShop, handleUse, handleInventory, handleWork, handleDaily, etc.) remain UNCHANGED
// as they already use the refactored helper functions like getUserData, addMoney, removeMoney, etc.
// ... (The rest of the file from handleShop onwards is identical to the original)


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
      
      const itemId = getItemId(args[1]);
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
        consumables: ['workBoost', 'robProtection', 'dailyBoost'],
        upgrades: ['vipStatus'],
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
    
    const itemId = getItemId(args[0]);
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

// Profile command without vault and clan
async function handleProfile(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    const targetUser = (args && args.length > 0) ? getTargetUser(m, args.join(' ')) : senderId;
    await initUser(targetUser);
    const profileData = await getUserData(targetUser);
    
    const totalWealth = profileData.balance + profileData.bank;
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
    
    if (profileData.stats) {
      profileText += `\n📊 *STATISTICS*\n`;
      profileText += `💼 *Jobs Completed:* ${profileData.stats.workCount || 0}\n`;
      profileText += `🔥 *Daily Streak:* ${profileData.stats.dailyStreak || 0} days\n`;
      profileText += `🏆 *Best Streak:* ${profileData.stats.maxDailyStreak || 0} days\n`;
      profileText += `🦹 *Robberies:* ${profileData.stats.robsSuccessful || 0}/${profileData.stats.robsAttempted || 0}\n`;
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

// ✅ REFACTORED: Leaderboard now uses getCollection for its aggregation pipeline.
async function handleLeaderboard(context, args) {
  const { reply, sock, from } = context;
  
  try {
    const category = args && args[0] ? args[0].toLowerCase() : 'wealth';
    
    let sortField, title, emoji;
    switch (category) {
      case 'wealth':
      case 'money':
        sortField = { $add: ['$balance', '$bank'] };
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
      case 'achievements':
      case 'ach':
        sortField = { $size: { $ifNull: ['$achievements', []] } };
        title = 'ACHIEVEMENT LEADERBOARD';
        emoji = '🏆';
        break;
      default:
        await reply(`📊 *Leaderboard Categories:*\n• *wealth* - Total money\n• *work* - Jobs completed\n• *streak* - Best daily streak\n• *achievements* - Achievement count\n\n💡 Usage: ${context.config.PREFIX}leaderboard [category]`);
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
    
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const users = await usersCollection.aggregate(pipeline).toArray();
    
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
          const wealth = user.balance + user.bank;
          leaderboard += `   💰 ${ecoSettings.currency}${wealth.toLocaleString()}\n`;
          break;
        case 'work':
          leaderboard += `   💼 ${user.stats?.workCount || 0} jobs\n`;
          break;
        case 'streak':
          leaderboard += `   🔥 ${user.stats?.maxDailyStreak || 0} days\n`;
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

// ... All remaining functions like handleAdminSettings, handleSubCommand, etc., remain UNCHANGED.
// They already use the refactored helper functions.

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
      settingsText += `• Investments: ${ecoSettings.investmentsEnabled ? '✅' : '❌'}\n`;
      settingsText += `• Shop: ${ecoSettings.shopEnabled ? '✅' : '❌'}\n`;
      settingsText += `• Events: ${ecoSettings.eventsEnabled ? '✅' : '❌'}\n\n`;
      
      // Cooldowns
      settingsText += `⏱️ *Cooldowns:*\n`;
      settingsText += `• Work: ${ecoSettings.workCooldownMinutes}m\n`;
      settingsText += `• Rob: ${ecoSettings.robCooldownMinutes}m\n\n`;
      
      // Admin Commands
      settingsText += `🔧 *Admin Commands:*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin set [setting] [value]*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin toggle [feature]*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin give @user [amount]*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin take @user [amount]*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin reset @user*\n`;
      settingsText += `• *${context.config.PREFIX}eco admin event [type]*`;
      
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
        
        const eventsCollection = await getCollection(COLLECTIONS.EVENTS);
        await eventsCollection.insertOne({
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

// Enhanced handleSend with transaction limits and fees
async function handleSend(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    // **MODIFIED LOGIC TO FIND TARGET**
    const targetUser = getTargetUser(m, args.join(' '));
    let amount = parseInt(args[args.length - 1]);
    
    // Check if the last argument is a valid number, if not, check other arguments
    if (isNaN(amount) || amount <= 0) {
      for (const arg of args) {
        const potentialAmount = parseInt(arg);
        if (!isNaN(potentialAmount) && potentialAmount > 0) {
          amount = potentialAmount;
          break;
        }
      }
    }

    // A more helpful message if no target is found
    if (!targetUser) {
      await reply(`💸 *Who is the recipient?*\n\nReply to someone's message or mention them to specify who to send money to.`);
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      await reply(`⚠️ *Please provide a valid amount to send.*\n\n*Example:* ${context.config.PREFIX}send 1000`);
      return;
    }
    
    if (targetUser === senderId) {
      await reply('🧠 *You cannot send money to yourself!*');
      return;
    }
    
    const fee = Math.max(Math.floor(amount * 0.01), 5);
    const totalCost = amount + fee;
    
    const senderData = await getUserData(senderId);
    if (senderData.balance < totalCost) {
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${ecoSettings.currency}${senderData.balance.toLocaleString()}\n💸 *Required:* ${ecoSettings.currency}${totalCost.toLocaleString()} (includes ${ecoSettings.currency}${fee} fee)`);
      return;
    }
    
    await initUser(targetUser);
    await removeMoney(senderId, totalCost, 'Transfer sent');
    await addMoney(targetUser, amount, 'Transfer received', false);
    
    const updatedSender = await getUserData(senderId);
    const updatedTarget = await getUserData(targetUser);
    
    await sock.sendMessage(from, {
      text: `✅ *TRANSFER SUCCESSFUL* ✅\n\n💸 *@${senderId.split('@')[0]}* sent *${ecoSettings.currency}${amount.toLocaleString()}* to *@${targetUser.split('@')[0]}*\n\n💰 *Amount sent:* ${ecoSettings.currency}${amount.toLocaleString()}\n💳 *Transfer fee:* ${ecoSettings.currency}${fee.toLocaleString()}\n💵 *Sender's balance:* ${ecoSettings.currency}${updatedSender.balance.toLocaleString()}\n🎯 *Receiver's balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}`,
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
    // **MODIFIED LOGIC TO FIND TARGET**
    const targetUser = getTargetUser(m, args.join(' '));

    // A more helpful message if no target is found
    if (!targetUser) {
      await reply(`🦹 *Who do you want to rob?*\n\nReply to someone's message or mention them to specify a target.`);
      return;
    }
    
    if (targetUser === senderId) {
      await reply('🧠 *You cannot rob yourself!*');
      return;
    }
    
    const now = new Date();
    const robberData = await getUserData(senderId);
    
    if (robberData.lastRob && now - new Date(robberData.lastRob) < ecoSettings.robCooldownMinutes * 60 * 1000) {
      const remaining = Math.ceil((ecoSettings.robCooldownMinutes * 60 * 1000 - (now - new Date(robberData.lastRob))) / 60000);
      await reply(`⏱️ *You're on cooldown. Try again in ${remaining} minutes.*`);
      return;
    }
    
    await initUser(targetUser);
    const targetData = await getUserData(targetUser);
    
    if (targetData.activeEffects?.robProtection && targetData.activeEffects.robProtection > Date.now()) {
      const remainingMs = targetData.activeEffects.robProtection - Date.now();
      const timeString = TimeHelpers.formatDuration(remainingMs);
      
      const protectionMessage = `🛡️ *@${targetUser.split('@')[0]} is protected from robberies!*\n\n⏰ *Protection expires in ${timeString}*`;
      
      await sock.sendMessage(
        from,
        { text: protectionMessage, mentions: [targetUser] },
        { quoted: m }
      );
      return;
    }
    
    if (targetData.balance < ecoSettings.robMinTargetBalance) {
      const targetJid = targetUser.split('@')[0];
      await sock.sendMessage(from, {
          text: `👀 *Target is too broke to rob*\n\n💸 *@${targetJid}* only has ${ecoSettings.currency}${targetData.balance.toLocaleString()}\n🚫 *Minimum required: ${ecoSettings.currency}${ecoSettings.robMinTargetBalance}*`,
          mentions: [targetUser]
      }, { quoted: m });
      return;
    }
    
    if (robberData.balance < ecoSettings.robMinRobberBalance) {
      await reply(`💸 *Your balance is too low to attempt a robbery*\n\n💰 *Your balance:* ${ecoSettings.currency}${robberData.balance.toLocaleString()}\n⚠️ _You need at least ${ecoSettings.currency}${ecoSettings.robMinRobberBalance} in your wallet for bail money if you get caught._`);
      return;
    }
    
    let successRate = ecoSettings.robSuccessRate;
    
    if (robberData.activeEffects?.robberyBoost) {
      successRate += 0.2;
      await updateUserData(senderId, {
        'activeEffects.robberyBoost': Math.max(0, (robberData.activeEffects.robberyBoost || 0) - 1)
      });
    }
    
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
      
      await checkAchievements(senderId, 'rob', { 
        successful: true, 
        successfulCount: (robberData.stats?.robsSuccessful || 0) + 1 
      });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      await sock.sendMessage(from, {
        text: `🦹‍♂️ *ROBBERY SUCCESS!* 🦹‍♂️\n\n💰 *@${senderId.split('@')[0]}* successfully robbed *${ecoSettings.currency}${stolen.toLocaleString()}* from *@${targetUser.split('@')[0]}*\n\n🤑 *Robber's balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😭 *Victim's balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes\n📊 *Success rate:* ${Math.round(successRate * 100)}%`,
        mentions: [senderId, targetUser]
      }, { quoted: m });
    } else {
      await updateUserData(senderId, { balance: robberData.balance - ecoSettings.robFailPenalty });
      await updateUserData(targetUser, { balance: targetData.balance + ecoSettings.robFailPenalty });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      await sock.sendMessage(from, {
        text: `🚨 *ROBBERY FAILED!* 🚨\n\n❌ *@${senderId.split('@')[0]}* got caught trying to rob *@${targetUser.split('@')[0]}* and was arrested!\n\n💸 *Bail paid:* ${ecoSettings.currency}${ecoSettings.robFailPenalty.toLocaleString()}\n😔 *Robber's balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😊 *Victim's balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
        mentions: [senderId, targetUser]
      }, { quoted: m });
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
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.investmentsEnabled) {
      await reply('🚫 *Cryptocurrency trading is currently disabled*');
      return;
    }
    
    if (!args || args.length === 0) {
      await reply(`₿ *Cryptocurrency Commands:*\n• *${context.config.PREFIX}crypto list* - View available coins\n• *${context.config.PREFIX}crypto buy [coin] [amount]* - Buy crypto\n• *${context.config.PREFIX}crypto sell [coin] [amount]* - Sell crypto\n• *${context.config.PREFIX}crypto portfolio* - View your crypto`);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    switch (action) {
      case 'list':
        let cryptoList = '₿ *CRYPTOCURRENCY MARKET* ₿\n\n';
        for (const [symbol, data] of Object.entries(cryptoData)) {
          const changeEmoji = data.lastChange === 'up' ? '📈' : data.lastChange === 'down' ? '📉' : '📊';
          
          let percentChange = 0;
          // Calculate change over the history period (approx last hour if ticks are 5 min)
          if(data.history && data.history.length > 1) {
              const startPrice = data.history[0];
              const currentPrice = data.price;
              if(startPrice > 0) {
                 percentChange = ((currentPrice - startPrice) / startPrice) * 100;
              }
          }

          cryptoList += `${changeEmoji} *${symbol}* - ${data.name}\n`;
          // Use .toFixed() for prices to avoid scientific notation for small numbers like SHIB
          const priceString = (symbol === 'SHIB' || data.price < 0.01) ? data.price.toFixed(8) : data.price.toLocaleString();
          cryptoList += `   💰 ${ecoSettings.currency}${priceString} (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%)\n\n`;
        }
        await reply(cryptoList);
        break;
        
      case 'buy':
        if (args.length < 3) {
          await reply('⚠️ *Usage: crypto buy [symbol] [amount]*');
          return;
        }
        
        const buySymbol = args[1].toUpperCase();
        const buyAmount = parseFloat(args[2]);

        // FIX: Add robust input validation
        if (isNaN(buyAmount) || buyAmount <= 0) {
          await reply('⚠️ *Please provide a valid, positive number for the amount.*');
          return;
        }
        
        if (!cryptoData[buySymbol]) {
          await reply('❌ *Invalid cryptocurrency symbol*');
          return;
        }
        
        const buyPrice = cryptoData[buySymbol].price;
        const totalCost = buyPrice * buyAmount;
        
        const userData = await getUserData(senderId);
        if (userData.balance < totalCost) {
          await reply(`🚫 *Insufficient funds*\n\nRequired: ${ecoSettings.currency}${totalCost.toLocaleString()}\nAvailable: ${ecoSettings.currency}${userData.balance.toLocaleString()}`);
          return;
        }
        
        await removeMoney(senderId, totalCost, 'Crypto purchase');
        
        const currentHolding = userData.investments?.crypto?.[buySymbol] || 0;
        await updateUserData(senderId, {
          [`investments.crypto.${buySymbol}`]: currentHolding + buyAmount
        });
        
        await reply(`₿ *Crypto Purchase Successful!*\n\n🪙 *Coin:* ${cryptoData[buySymbol].name}\n📊 *Symbol:* ${buySymbol}\n💰 *Price per coin:* ${ecoSettings.currency}${buyPrice.toLocaleString()}\n🪙 *Amount bought:* ${buyAmount}\n💸 *Total cost:* ${ecoSettings.currency}${totalCost.toLocaleString()}`);
        break;
        
      case 'sell':
        if (args.length < 3) {
          await reply('⚠️ *Usage: crypto sell [symbol] [amount]*');
          return;
        }
        
        const sellSymbol = args[1].toUpperCase();
        const sellAmount = parseFloat(args[2]);

        // FIX: Add robust input validation
        if (isNaN(sellAmount) || sellAmount <= 0) {
          await reply('⚠️ *Please provide a valid, positive number for the amount.*');
          return;
        }
        
        if (!cryptoData[sellSymbol]) {
          await reply('❌ *Invalid cryptocurrency symbol*');
          return;
        }
        
        const sellUserData = await getUserData(senderId);
        const holding = sellUserData.investments?.crypto?.[sellSymbol] || 0;
        
        if (holding < sellAmount) {
          await reply(`🚫 *Insufficient ${sellSymbol} holdings*\n\nYou have: ${holding}\nTrying to sell: ${sellAmount}`);
          return;
        }
        
        const sellPrice = cryptoData[sellSymbol].price;
        const totalEarned = sellPrice * sellAmount;
        
        await addMoney(senderId, totalEarned, 'Crypto sale', false);
        await updateUserData(senderId, {
          [`investments.crypto.${sellSymbol}`]: holding - sellAmount
        });
        
        await reply(`₿ *Crypto Sale Successful!*\n\n🪙 *Coin:* ${cryptoData[sellSymbol].name}\n📊 *Symbol:* ${sellSymbol}\n💰 *Price per coin:* ${ecoSettings.currency}${sellPrice.toLocaleString()}\n🪙 *Amount sold:* ${sellAmount}\n💸 *Total earned:* ${ecoSettings.currency}${totalEarned.toLocaleString()}`);
        break;
        
      case 'portfolio':
        const portfolioData = await getUserData(senderId);
        if (!portfolioData.investments?.crypto || Object.keys(portfolioData.investments.crypto).length === 0) {
          await reply('₿ *You don\'t own any cryptocurrency yet*');
          return;
        }
        
        let cryptoPortfolio = '₿ *YOUR CRYPTO PORTFOLIO* ₿\n\n';
        let totalValue = 0;
        
        for (const [symbol, amount] of Object.entries(portfolioData.investments.crypto)) {
          if (amount > 0 && cryptoData[symbol]) {
            const currentValue = cryptoData[symbol].price * amount;
            totalValue += currentValue;
            cryptoPortfolio += `₿ *${symbol}* - ${cryptoData[symbol].name}\n`;
            cryptoPortfolio += `   🪙 Holdings: ${amount}\n`;
            cryptoPortfolio += `   💰 Value: ${ecoSettings.currency}${currentValue.toLocaleString()}\n\n`;
          }
        }
        
        cryptoPortfolio += `💎 *Total Portfolio Value:* ${ecoSettings.currency}${totalValue.toLocaleString()}`;
        await reply(cryptoPortfolio);
        break;
        
      default:
        await reply('❓ *Unknown crypto command*');
    }
  } catch (error) {
    await reply('❌ *Error processing crypto command. Please try again.*');
    console.error('Crypto error:', error);
  }
}

async function handleBusiness(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.investmentsEnabled) {
      await reply('🚫 *Business investments are currently disabled*');
      return;
    }
    
    if (!args || args.length === 0) {
      await reply(`🏢 *Business Commands:*\n• *${context.config.PREFIX}business list* - View available businesses\n• *${context.config.PREFIX}business buy [business]* - Buy a business\n• *${context.config.PREFIX}business portfolio* - View your businesses\n• *${context.config.PREFIX}business collect* - Collect daily profits`);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    switch (action) {
      case 'list':
        let businessList = '🏢 *AVAILABLE BUSINESSES* 🏢\n\n';
        for (const [id, business] of Object.entries(businessData)) {
          businessList += `🏪 *${business.name}*\n`;
          businessList += `   💰 Price: ${ecoSettings.currency}${business.price.toLocaleString()}\n`;
          businessList += `   📈 Daily ROI: ${(business.roi * 100).toFixed(1)}%\n`;
          businessList += `   📝 ${business.description}\n`;
          businessList += `   🛒 ID: ${id}\n\n`;
        }
        await reply(businessList);
        break;
        
      case 'buy':
        if (args.length < 2) {
          await reply('⚠️ *Usage: business buy [business_id]*');
          return;
        }
        
        const businessId = args[1].toLowerCase();
        const business = businessData[businessId];
        
        if (!business) {
          await reply('❌ *Invalid business ID*');
          return;
        }
        
        const userData = await getUserData(senderId);
        
        const ownedBusinesses = userData.investments?.businesses || [];
        if (ownedBusinesses.some(b => b.id === businessId)) {
          await reply('⚠️ *You already own this business*');
          return;
        }
        
        if (userData.balance < business.price) {
          await reply(`🚫 *Insufficient funds*\n\nRequired: ${ecoSettings.currency}${business.price.toLocaleString()}\nAvailable: ${ecoSettings.currency}${userData.balance.toLocaleString()}`);
          return;
        }
        
        await removeMoney(senderId, business.price, 'Business purchase');
        
        const newBusiness = {
          id: businessId,
          name: business.name,
          price: business.price,
          roi: business.roi,
          purchaseDate: new Date(),
          lastCollected: new Date()
        };
        
        ownedBusinesses.push(newBusiness);
        await updateUserData(senderId, {
          'investments.businesses': ownedBusinesses
        });
        
        await checkAchievements(senderId, 'business', { businessCount: ownedBusinesses.length });
        
        await reply(`🏢 *Business Purchase Successful!*\n\n🏪 *Business:* ${business.name}\n💰 *Price:* ${ecoSettings.currency}${business.price.toLocaleString()}\n📈 *Daily ROI:* ${(business.roi * 100).toFixed(1)}%\n\n💡 *Collect daily profits with:* ${context.config.PREFIX}business collect`);
        break;
        
      case 'portfolio':
        const portfolioData = await getUserData(senderId);
        const businesses = portfolioData.investments?.businesses || [];
        
        if (businesses.length === 0) {
          await reply('🏢 *You don\'t own any businesses yet*');
          return;
        }
        
        let businessPortfolio = '🏢 *YOUR BUSINESS PORTFOLIO* 🏢\n\n';
        let totalValue = 0;
        
        businesses.forEach(business => {
          const currentROI = businessData[business.id]?.roi || business.roi;
          const dailyProfit = business.price * currentROI;
          totalValue += business.price;
          
          businessPortfolio += `🏪 *${business.name}*\n`;
          businessPortfolio += `   💰 Value: ${ecoSettings.currency}${business.price.toLocaleString()}\n`;
          businessPortfolio += `   📈 Daily Profit: ${ecoSettings.currency}${dailyProfit.toLocaleString()}\n`;
          businessPortfolio += `   📅 Owned: ${Math.floor((Date.now() - new Date(business.purchaseDate)) / 86400000)} days\n\n`;
        });
        
        businessPortfolio += `💎 *Total Portfolio Value:* ${ecoSettings.currency}${totalValue.toLocaleString()}`;
        await reply(businessPortfolio);
        break;
        
      case 'collect':
        const collectData = await getUserData(senderId);
        const userBusinesses = collectData.investments?.businesses || [];
        
        if (userBusinesses.length === 0) {
          await reply('🏢 *You don\'t have any businesses to collect profits from.*');
          return;
        }
        
        let totalProfit = 0;
        const now = new Date();
        const updatedBusinesses = [];
        const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
        
        userBusinesses.forEach(business => {
          const lastCollected = new Date(business.lastCollected);
          const timeSince = now.getTime() - lastCollected.getTime();
          
          if (timeSince >= twentyFourHoursInMs) {
            const daysToCollect = Math.floor(timeSince / twentyFourHoursInMs);
            const currentROI = businessData[business.id]?.roi || business.roi;
            const profit = business.price * currentROI * daysToCollect;
            totalProfit += profit;
            
            business.lastCollected = new Date(lastCollected.getTime() + daysToCollect * twentyFourHoursInMs);
          }
          
          updatedBusinesses.push(business);
        });
        
        if (totalProfit === 0) {
          let soonestNextCollection = Infinity;
          userBusinesses.forEach(business => {
            const nextCollectionTime = new Date(business.lastCollected).getTime() + twentyFourHoursInMs;
            if (nextCollectionTime < soonestNextCollection) {
              soonestNextCollection = nextCollectionTime;
            }
          });

          const timeString = TimeHelpers.formatFutureTime(soonestNextCollection);
          
          await reply(`⏰ *No profits to collect yet*\n\nPlease come back *${timeString}*`);
          return;
        }
        
        await addMoney(senderId, totalProfit, 'Business profits', false);
        await updateUserData(senderId, {
          'investments.businesses': updatedBusinesses
        });
        
        await reply(`🏢 *Business Profits Collected!* 🏢\n\n💰 *Total Profit:* ${ecoSettings.currency}${Math.floor(totalProfit).toLocaleString()}\n🏪 *From:* ${userBusinesses.length} businesses\n\n💡 *Your next profits will be available in 24 hours!*`);
        break;
        
      default:
        await reply('❓ *Unknown business command*');
    }
  } catch (error) {
    await reply('❌ *Error processing business command. Please try again.*');
    console.error('Business error:', error);
  }
}

async function handleEvents(context) {
  await context.reply('🚧 *Events system coming soon!* Double money events, challenges, and more! 🚧');
}

async function handleBounty(context, args) {
  await context.reply('🚧 *Bounty hunting system coming soon!* Hunt down targets for rewards! 🚧');
}

// ✅ REFACTORED: Export functions for use by other plugins
// This now exports the locally defined functions which use the centralized helpers.
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