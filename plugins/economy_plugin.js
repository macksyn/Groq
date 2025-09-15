// plugins/economy_enhanced.js - A focused and streamlined Economy plugin
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { TimeHelpers } from '../lib/helpers.js';

// Plugin information export
export const info = {
  name: 'Enhanced Economy System',
  version: '3.4.0',
  author: 'Bot Developer',
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
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'whatsapp_bot';
const COLLECTIONS = {
  USERS: 'economy_users',
  TRANSACTIONS: 'economy_transactions',
  SETTINGS: 'economy_settings',
  ACHIEVEMENTS: 'economy_achievements',
  INVESTMENTS: 'economy_investments',
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
    await db.collection(COLLECTIONS.TRANSACTIONS).createIndex({ userId: 1, timestamp: -1 });
    await db.collection(COLLECTIONS.INVESTMENTS).createIndex({ userId: 1, type: 1 });

    await loadCryptoPrices();
    console.log('✅ Crypto prices loaded');

    // Start auto-updates
    setTimeout(() => {
      updateCryptoPrices();
      updateBusinessROI();
    }, 5000); // Start after 5 seconds
    
    console.log('✅ MongoDB connected successfully');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Economy settings
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
  dailyStreakBonus: 100,
  
  // Work System
  workCooldownMinutes: 45,
  workJobs: [
    { name: 'Uber Driver', min: 300, max: 1000, cooldown: 60 },
    { name: 'Food Delivery', min: 200, max: 800, cooldown: 45 },
    { name: 'Freelancer', min: 500, max: 1500, cooldown: 90 },
    { name: 'Teacher', min: 400, max: 1200, cooldown: 75 },
    { name: 'Doctor', min: 800, max: 2000, cooldown: 120 },
    { name: 'Engineer', min: 600, max: 1800, cooldown: 105 },
    { name: 'Trader', min: 100, max: 3000, cooldown: 60 }
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
  
  // Admin Settings
  adminCanModifyBalances: true,
  adminCanResetCooldowns: true,
  ownerCanAccessAllSettings: true
};

// Load and save settings
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

// User initialization
async function initUser(userId) {
  try {
    const existingUser = await db.collection(COLLECTIONS.USERS).findOne({ userId });
    
    if (!existingUser) {
      const newUser = {
        userId,
        balance: ecoSettings.startingBalance,
        bank: ecoSettings.startingBankBalance,
        inventory: [],
        activeEffects: {},
        bounty: 0,
        rank: 'Newbie',
        customTitle: null,
        stats: {
          totalEarned: 0,
          totalSpent: 0,
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
        },
        lastDaily: null,
        lastWork: null,
        lastRob: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection(COLLECTIONS.USERS).insertOne(newUser);
      await checkAchievements(userId, 'registration');
      return newUser;
    } else {
        // This block for backward compatibility can be removed in future versions
        const updates = {};
        let needsUpdate = false;
        if (existingUser.investments === undefined) {
            updates.investments = { stocks: {}, crypto: {}, businesses: [] };
            needsUpdate = true;
        }
        if (needsUpdate) {
            await db.collection(COLLECTIONS.USERS).updateOne({ userId }, { $set: updates });
        }
        return { ...existingUser, ...updates };
    }
  } catch (error) {
    console.error('Error initializing user:', error);
    throw error;
  }
}

// Shop Items Database
const SHOP_ITEMS = {
  workBoost: { name: "Work Boost", price: 3000, description: "Double work earnings for 24 hours", type: "consumable", effect: "workBoost", emoji: "⚡" },
  robProtection: { name: "Bodyguard", price: 8000, description: "Hire a bodyguard for 48 hours", type: "consumable", effect: "robProtection", emoji: "🛡️" },
  dailyBoost: { name: "Lucky Charm", price: 2500, description: "Increases daily reward by 50% for 7 days", type: "consumable", effect: "dailyBoost", emoji: "🍀" },
  vipStatus: { name: "VIP Status", price: 100000, description: "Permanent 25% bonus to all earnings", type: "permanent", effect: "vipBonus", emoji: "👑" },
  lockpicks: { name: "Pro Lockpicks", price: 1200, description: "Increases rob success rate by 20%", type: "tool", effect: "robberyBoost", uses: 3, emoji: "🗝️" },
  businessSuit: { name: "Designer Suit", price: 4500, description: "Increases work earnings by 35%", type: "equipment", effect: "workBonus", emoji: "👔" },
  goldenCrown: { name: "Golden Crown", price: 250000, description: "Shows 👑 on your profile", type: "cosmetic", effect: "crown", emoji: "👑" },
  customTitle: { name: "Custom Title", price: 25000, description: "Set a custom rank title", type: "cosmetic", effect: "customTitle", emoji: "📛" },
  marketTip: { name: "Market Info", price: 10000, description: "Guaranteed profitable investment for 1 trade", type: "consumable", effect: "marketTip", emoji: "📊" }
};

// Item ID mapping
function getItemId(inputId) {
  const itemMapping = {
    'workboost': 'workBoost', 'bodyguard': 'robProtection', 'dailyboost': 'dailyBoost', 'vipstatus': 'vipStatus',
    'lockpicks': 'lockpicks', 'businesssuit': 'businessSuit', 'goldencrown': 'goldenCrown',
    'customtitle': 'customTitle', 'markettip': 'marketTip'
  };
  return itemMapping[inputId.toLowerCase()] || inputId;
}

// --- Investment Data ---
// Mock stock data
const stockData = {
    AAPL: { name: 'Apple Inc.', price: 150 + (Math.random() - 0.5) * 30 },
    GOOGL: { name: 'Alphabet Inc.', price: 2800 + (Math.random() - 0.5) * 400 },
    TSLA: { name: 'Tesla Inc.', price: 800 + (Math.random() - 0.5) * 200 },
    AMZN: { name: 'Amazon.com Inc.', price: 3300 + (Math.random() - 0.5) * 500 },
    MSFT: { name: 'Microsoft Corp.', price: 300 + (Math.random() - 0.5) * 50 }
};
let cryptoData = {
  BTC: { name: "Bitcoin", price: 45000, volatility: 0.05 }, ETH: { name: "Ethereum", price: 3200, volatility: 0.06 },
  SOL: { name: "Solana", price: 120, volatility: 0.08 }, SHIB: { name: "Shiba Inu", price: 0.00002, volatility: 0.12 },
  GROQ: { name: "Groq Coin", price: 15, volatility: 0.10 }, ADA: { name: "Cardano", price: 0.8, volatility: 0.07 },
  DOT: { name: "Polkadot", price: 25, volatility: 0.08 }, MATIC: { name: "Polygon", price: 1.2, volatility: 0.09 }
};
let businessData = {
  restaurant: { name: "Restaurant", price: 50000, roi: 0.12, description: "Earn from food sales" },
  laundry: { name: "Laundry Service", price: 25000, roi: 0.08, description: "Steady income" },
  realestate: { name: "Real Estate", price: 200000, roi: 0.06, description: "Rental income" },
  fillingstation: { name: "Filling Station", price: 150000, roi: 0.10, description: "Fuel sales profit" },
  pharmacy: { name: "Pharmacy", price: 75000, roi: 0.09, description: "Medicine sales" },
  supermarket: { name: "Supermarket", price: 100000, roi: 0.08, description: "Grocery profits" },
  carwash: { name: "Car Wash", price: 30000, roi: 0.07, description: "Vehicle cleaning" },
  barbershop: { name: "Barber Shop", price: 20000, roi: 0.11, description: "Hair cutting" }
};

// Auto-update prices daily
async function updateCryptoPrices() {
  try {
    for (const [symbol, data] of Object.entries(cryptoData)) {
      const change = (Math.random() - 0.5) * data.volatility * 2;
      const newPrice = Math.max(data.price * (1 + change), data.price * 0.1);
      cryptoData[symbol].price = parseFloat(newPrice.toFixed(symbol === 'SHIB' ? 8 : 2));
    }
    await db.collection(COLLECTIONS.SETTINGS).replaceOne({ type: 'crypto_prices' }, { type: 'crypto_prices', data: cryptoData, updatedAt: new Date() }, { upsert: true });
  } catch (error) { console.error('Error updating crypto prices:', error); }
}
async function loadCryptoPrices() {
  try {
    const saved = await db.collection(COLLECTIONS.SETTINGS).findOne({ type: 'crypto_prices' });
    if (saved?.data) cryptoData = { ...cryptoData, ...saved.data };
  } catch (error) { console.error('Error loading crypto prices:', error); }
}
async function updateBusinessROI() {
  try {
    for (const [id, business] of Object.entries(businessData)) {
      const change = (Math.random() - 0.5) * 0.02;
      businessData[id].roi = Math.max(business.roi + change, 0.01);
    }
    await db.collection(COLLECTIONS.SETTINGS).replaceOne({ type: 'business_data' }, { type: 'business_data', data: businessData, updatedAt: new Date() }, { upsert: true });
  } catch (error) { console.error('Error updating business ROI:', error); }
}
setInterval(updateCryptoPrices, 24 * 60 * 60 * 1000);
setInterval(updateBusinessROI, 24 * 60 * 60 * 1000);

// Achievement definitions
const ACHIEVEMENTS = {
  firstDaily: { name: "Daily Grind", description: "Claim your first daily reward", reward: 1000, emoji: "🌅" },
  firstWork: { name: "Hard Worker", description: "Complete your first work", reward: 500, emoji: "💼" },
  firstRob: { name: "First Heist", description: "Successfully rob someone", reward: 2000, emoji: "🦹" },
  millionaire: { name: "Millionaire", description: "Accumulate 1 million in wealth", reward: 50000, emoji: "💰" },
  robKing: { name: "Robbery King", description: "Successfully rob 50 people", reward: 25000, emoji: "👑" },
  streakMaster: { name: "Consistency King", description: "Maintain a 30-day daily streak", reward: 30000, emoji: "🔥" },
  businessTycoon: { name: "Business Tycoon", description: "Own 5 different businesses", reward: 75000, emoji: "🏢" }
};

// Utility functions
async function getUserData(userId) {
  try {
    const user = await db.collection(COLLECTIONS.USERS).findOne({ userId });
    return user || initUser(userId);
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
}
async function updateUserData(userId, data) {
  try {
    return await db.collection(COLLECTIONS.USERS).updateOne({ userId }, { $set: { ...data, updatedAt: new Date() } }, { upsert: true });
  } catch (error) {
    console.error('Error updating user data:', error);
    throw error;
  }
}

// Money functions
async function addMoney(userId, amount, reason = 'Unknown', applyEffects = true) {
    // This function remains largely the same, but simplified for brevity in this view
    const user = await getUserData(userId);
    let finalAmount = amount;
    if (applyEffects && user.activeEffects) {
      if (user.activeEffects.vipBonus) finalAmount *= 1.25;
      if (user.activeEffects.workBoost && reason.includes('work')) finalAmount *= 2;
      if (user.activeEffects.dailyBoost && reason.includes('daily')) finalAmount *= 1.5;
    }
    finalAmount = Math.floor(finalAmount);
    const newBalance = Math.min(user.balance + finalAmount, ecoSettings.maxWalletBalance);
    await updateUserData(userId, { balance: newBalance, [`stats.totalEarned`]: (user.stats.totalEarned || 0) + finalAmount });
    await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({ userId, type: 'credit', amount: finalAmount, reason, balanceBefore: user.balance, balanceAfter: newBalance, timestamp: new Date() });
    await checkAchievements(userId, 'money');
    return newBalance;
}
async function removeMoney(userId, amount, reason = 'Unknown') {
    const user = await getUserData(userId);
    if (user.balance >= amount) {
        const newBalance = user.balance - amount;
        await updateUserData(userId, { balance: newBalance, [`stats.totalSpent`]: (user.stats.totalSpent || 0) + amount });
        await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({ userId, type: 'debit', amount, reason, balanceBefore: user.balance, balanceAfter: newBalance, timestamp: new Date() });
        return true;
    }
    return false;
}

// Achievement checking system
async function checkAchievements(userId, type, data = {}) {
    const user = await getUserData(userId);
    const newAchievements = [];
    const pushIfMissing = (ach) => !user.achievements.includes(ach) && newAchievements.push(ach);

    switch (type) {
        case 'daily': pushIfMissing('firstDaily'); if (data.streak >= 30) pushIfMissing('streakMaster'); break;
        case 'work': pushIfMissing('firstWork'); break;
        case 'rob': if (data.successful) pushIfMissing('firstRob'); if (data.successfulCount >= 50) pushIfMissing('robKing'); break;
        case 'money': if (user.balance + user.bank >= 1000000) pushIfMissing('millionaire'); break;
        case 'business': if (data.businessCount >= 5) pushIfMissing('businessTycoon'); break;
    }
    
    if (newAchievements.length > 0) {
      await updateUserData(userId, { $push: { achievements: { $each: newAchievements } } });
      const totalReward = newAchievements.reduce((sum, ach) => sum + (ACHIEVEMENTS[ach]?.reward || 0), 0);
      if (totalReward > 0) await addMoney(userId, totalReward, 'Achievement rewards', false);
      return newAchievements;
    }
    return [];
}

// Item usage system
async function useItem(userId, itemId) {
    // This function remains the same, simplified for brevity
    const user = await getUserData(userId);
    const itemIndex = user.inventory.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return { success: false, message: 'Item not found in inventory' };
    const item = user.inventory[itemIndex];
    const shopItem = SHOP_ITEMS[item.id];
    if (!shopItem) return { success: false, message: 'Invalid item' };
    
    const updates = { activeEffects: { ...user.activeEffects } };
    if (shopItem.type === 'consumable' || shopItem.type === 'permanent') {
        const duration = shopItem.type === 'permanent' ? true : Date.now() + (ecoSettings.itemEffectDuration[shopItem.effect] || 3600000);
        updates.activeEffects[shopItem.effect] = duration;
    }
    
    if (item.quantity > 1) user.inventory[itemIndex].quantity -= 1;
    else user.inventory.splice(itemIndex, 1);
    updates.inventory = user.inventory;
    
    await updateUserData(userId, updates);
    return { success: true, message: `Used ${shopItem.name}!`, effect: shopItem.description };
}

// Helper functions
function getNigeriaTime() { return moment.tz('Africa/Lagos'); }
function getCurrentDate() { return getNigeriaTime().format('DD-MM-YYYY'); }
function getTargetUser(m, text) {
  try {
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) return m.message.extendedTextMessage.contextInfo.mentionedJid[0];
    if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) return m.message.extendedTextMessage.contextInfo.participant;
    if (text) {
      const phoneNumber = text.replace(/[^0-9]/g, '');
      if (phoneNumber.length >= 10) return phoneNumber + '@s.whatsapp.net';
    }
    return null;
  } catch { return null; }
}
function isAdmin(userId) {
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  return adminNumbers.includes(userId?.split('@')[0]);
}
function isOwner(userId) {
  return userId?.split('@')[0] === (process.env.OWNER_NUMBER || '');
}
async function cleanupExpiredEffects(userId) {
  const user = await getUserData(userId);
  if (!user.activeEffects) return;
  const now = Date.now();
  const cleanEffects = {};
  let needsUpdate = false;
  for (const [effect, expiry] of Object.entries(user.activeEffects)) {
    if (typeof expiry === 'boolean' || expiry > now) cleanEffects[effect] = expiry;
    else needsUpdate = true;
  }
  if (needsUpdate) await updateUserData(userId, { activeEffects: cleanEffects });
}

// --- COMMAND HANDLERS ---
async function showEconomyMenu(context) {
    const { reply, config } = context;
    const menuText = `💰 *ECONOMY SYSTEM* 💰\n\n` +
        `💵 *Basic:*\n` + `• balance • send • deposit • withdraw\n\n` +
        `💼 *Earning:*\n` + `• work • daily • rob\n\n` +
        `📈 *Investments:*\n` + `• stocks • crypto • business\n\n` +
        `🛍️ *Shopping:*\n` + `• shop • inventory • use\n\n` +
        `👥 *Social:*\n` + `• profile • achievements • leaderboard\n\n` +
        `⚙️ *Admin:* ${config.PREFIX}eco admin (admin only)`;
    await reply(menuText);
}

async function handleBalance(context) {
  const { reply, senderId, m, sock, from, args } = context;
  const targetUser = getTargetUser(m, args.join(' ')) || senderId;
  const userData = await getUserData(targetUser);
  const totalWealth = userData.balance + userData.bank;
  const isOwnBalance = targetUser === senderId;
  
  let balanceText = `💰 *${isOwnBalance ? 'YOUR' : `@${targetUser.split('@')[0]}'S`} BALANCE*\n\n` +
      `💵 *Wallet:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n` +
      `🏦 *Bank:* ${ecoSettings.currency}${userData.bank.toLocaleString()}\n` +
      `💎 *Total:* ${ecoSettings.currency}${totalWealth.toLocaleString()}`;
  
  await sock.sendMessage(from, { text: balanceText, mentions: [targetUser] }, { quoted: m });
}

async function handleSend(context) {
    const { reply, senderId, sock, m, from, args } = context;
    const targetUser = getTargetUser(m, args.join(' '));
    let amount = parseInt(args.find(arg => !isNaN(parseInt(arg))));

    if (!targetUser || !amount || amount <= 0) return reply(`⚠️ Usage: send <@user> <amount>`);
    if (targetUser === senderId) return reply('🧠 You cannot send money to yourself!');
    
    const fee = Math.max(Math.floor(amount * 0.01), 5);
    const totalCost = amount + fee;
    const senderData = await getUserData(senderId);

    if (senderData.balance < totalCost) return reply(`🚫 Insufficient balance. You need ${ecoSettings.currency}${totalCost.toLocaleString()}.`);
    
    await removeMoney(senderId, totalCost, 'Transfer sent');
    await addMoney(targetUser, amount, 'Transfer received', false);
    
    const updatedSender = await getUserData(senderId);
    await sock.sendMessage(from, { text: `✅ Successfully sent ${ecoSettings.currency}${amount.toLocaleString()} to @${targetUser.split('@')[0]}!\n\nYour new balance: ${ecoSettings.currency}${updatedSender.balance.toLocaleString()}`, mentions: [senderId, targetUser] }, { quoted: m });
}

async function handleDeposit(context) {
    const { reply, senderId, args } = context;
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) return reply(`⚠️ Usage: deposit <amount>`);
    
    const userData = await getUserData(senderId);
    if (userData.balance < amount) return reply('🚫 Insufficient wallet balance');
    if (userData.bank + amount > ecoSettings.maxBankBalance) return reply(`🚫 Bank is full.`);
    
    await updateUserData(senderId, { balance: userData.balance - amount, bank: userData.bank + amount });
    const updatedData = await getUserData(senderId);
    await reply(`🏦 Deposited ${ecoSettings.currency}${amount.toLocaleString()}.\n\nNew Bank Balance: ${ecoSettings.currency}${updatedData.bank.toLocaleString()}`);
}

async function handleWithdraw(context) {
    const { reply, senderId, args } = context;
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) return reply(`⚠️ Usage: withdraw <amount>`);
    
    const userData = await getUserData(senderId);
    if (userData.bank < amount) return reply('🚫 Insufficient bank balance');
    if (userData.balance + amount > ecoSettings.maxWalletBalance) return reply(`🚫 Wallet is full.`);

    await updateUserData(senderId, { balance: userData.balance + amount, bank: userData.bank - amount });
    const updatedData = await getUserData(senderId);
    await reply(`💵 Withdrew ${ecoSettings.currency}${amount.toLocaleString()}.\n\nNew Wallet Balance: ${ecoSettings.currency}${updatedData.balance.toLocaleString()}`);
}

async function handleWork(context) {
    const { reply, senderId } = context;
    const now = new Date();
    const userData = await getUserData(senderId);
    
    const cooldownMs = ecoSettings.workCooldownMinutes * 60 * 1000;
    if (userData.lastWork && now - new Date(userData.lastWork) < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - (now - new Date(userData.lastWork))) / 60000);
      return reply(`⏱️ You're tired! Rest for ${remaining} more minutes.`);
    }
    
    const job = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
    const earnings = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
    
    await addMoney(senderId, earnings, 'Work');
    await updateUserData(senderId, { lastWork: now, [`stats.workCount`]: (userData.stats.workCount || 0) + 1 });
    await checkAchievements(senderId, 'work');

    const updatedData = await getUserData(senderId);
    await reply(`💼 You worked as a ${job.name} and earned ${ecoSettings.currency}${earnings.toLocaleString()}!\n\nNew balance: ${ecoSettings.currency}${updatedData.balance.toLocaleString()}`);
}

async function handleRob(context) {
    const { reply, senderId, sock, m, from, args } = context;
    const targetUser = getTargetUser(m, args.join(' '));
    if (!targetUser) return reply(`🦹 Who do you want to rob? Mention or reply to a user.`);
    if (targetUser === senderId) return reply('🧠 You cannot rob yourself!');
    
    const now = new Date();
    const robberData = await getUserData(senderId);
    
    const cooldownMs = ecoSettings.robCooldownMinutes * 60 * 1000;
    if (robberData.lastRob && now - new Date(robberData.lastRob) < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - (now - new Date(robberData.lastRob))) / 60000);
      return reply(`⏱️ You need to lay low for ${remaining} more minutes.`);
    }

    const targetData = await getUserData(targetUser);
    if (targetData.activeEffects?.robProtection > Date.now()) return reply(`🛡️ @${targetUser.split('@')[0]} is protected by a bodyguard!`);
    if (targetData.balance < ecoSettings.robMinTargetBalance) return reply(`👀 Target is too broke.`);
    if (robberData.balance < ecoSettings.robMinRobberBalance) return reply(`💸 You need at least ${ecoSettings.currency}${ecoSettings.robMinRobberBalance} for bail money.`);
    
    await updateUserData(senderId, { lastRob: now, [`stats.robsAttempted`]: (robberData.stats.robsAttempted || 0) + 1 });
    
    const success = Math.random() < ecoSettings.robSuccessRate;
    if (success) {
      const stolen = Math.floor(Math.random() * (targetData.balance * ecoSettings.robMaxStealPercent)) + ecoSettings.robMinSteal;
      await removeMoney(targetUser, stolen, 'Robbed');
      await addMoney(senderId, stolen, 'Robbery');
      await updateUserData(senderId, { [`stats.robsSuccessful`]: (robberData.stats.robsSuccessful || 0) + 1 });
      await checkAchievements(senderId, 'rob', { successful: true, successfulCount: (robberData.stats.robsSuccessful || 0) + 1 });
      await sock.sendMessage(from, { text: `🦹‍♂️ SUCCESS! @${senderId.split('@')[0]} robbed ${ecoSettings.currency}${stolen.toLocaleString()} from @${targetUser.split('@')[0]}!`, mentions: [senderId, targetUser] }, { quoted: m });
    } else {
      await removeMoney(senderId, ecoSettings.robFailPenalty, 'Robbery failed');
      await sock.sendMessage(from, { text: `🚨 FAILED! @${senderId.split('@')[0]} was caught and paid a fine of ${ecoSettings.currency}${ecoSettings.robFailPenalty.toLocaleString()}!`, mentions: [senderId, targetUser] }, { quoted: m });
    }
}

async function handleDaily(context) {
    const { reply, senderId } = context;
    const currentDate = getCurrentDate();
    const userData = await getUserData(senderId);

    if (userData.lastDaily === currentDate) return reply('⏰ You have already claimed your daily reward today!');
    
    const yesterday = getNigeriaTime().subtract(1, 'day').format('DD-MM-YYYY');
    const newStreak = userData.lastDaily === yesterday ? (userData.stats.dailyStreak || 0) + 1 : 1;
    
    let dailyAmount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
    dailyAmount += newStreak * ecoSettings.dailyStreakBonus;
    
    await addMoney(senderId, dailyAmount, 'Daily reward');
    await updateUserData(senderId, { lastDaily: currentDate, [`stats.dailyStreak`]: newStreak, [`stats.maxDailyStreak`]: Math.max(userData.stats.maxDailyStreak || 0, newStreak) });
    await checkAchievements(senderId, 'daily', { streak: newStreak });
    
    await reply(`🎁 You claimed your daily reward of ${ecoSettings.currency}${dailyAmount.toLocaleString()}!\n🔥 Current Streak: ${newStreak} days.`);
}

async function handleProfile(context) {
    // This function remains the same, simplified for brevity
    const { reply, senderId, sock, m, from, args } = context;
    const targetUser = getTargetUser(m, args.join(' ')) || senderId;
    const profileData = await getUserData(targetUser);
    const totalWealth = profileData.balance + profileData.bank;
    const crownEmoji = profileData.activeEffects?.crown ? '👑 ' : '';
    let profileText = `👤 *PROFILE for ${crownEmoji}@${targetUser.split('@')[0]}*\n\n` +
        `💎 *Wealth:* ${ecoSettings.currency}${totalWealth.toLocaleString()}\n` +
        `💵 *Wallet:* ${ecoSettings.currency}${profileData.balance.toLocaleString()}\n` +
        `🏦 *Bank:* ${ecoSettings.currency}${profileData.bank.toLocaleString()}\n\n` +
        `📊 *STATS*\n` +
        `💼 Jobs: ${profileData.stats.workCount || 0}\n` +
        `🔥 Streak: ${profileData.stats.dailyStreak || 0} (Best: ${profileData.stats.maxDailyStreak || 0})\n` +
        `🦹 Robs: ${profileData.stats.robsSuccessful || 0}/${profileData.stats.robsAttempted || 0}\n\n` +
        `🏆 *ACHIEVEMENTS* (${profileData.achievements.length})\n` +
        profileData.achievements.slice(-5).map(id => ACHIEVEMENTS[id] ? `${ACHIEVEMENTS[id].emoji} ${ACHIEVEMENTS[id].name}` : '').join('\n');
    await sock.sendMessage(from, { text: profileText, mentions: [targetUser] }, { quoted: m });
}

async function handleLeaderboard(context) {
    const { reply, sock, from, args } = context;
    const category = args[0]?.toLowerCase() || 'wealth';
    let sortField, title, emoji;

    switch (category) {
        case 'work': sortField = { 'stats.workCount': -1 }; title = 'TOP WORKERS'; emoji = '💼'; break;
        case 'streak': sortField = { 'stats.maxDailyStreak': -1 }; title = 'STREAK LEADERS'; emoji = '🔥'; break;
        default: sortField = { totalWealth: -1 }; title = 'WEALTHIEST USERS'; emoji = '💰';
    }

    const users = await db.collection(COLLECTIONS.USERS).aggregate([
        { $addFields: { totalWealth: { $add: ["$balance", "$bank"] } } },
        { $sort: sortField },
        { $limit: 10 }
    ]).toArray();

    if (users.length === 0) return reply('📊 No data for this leaderboard yet.');
    
    let leaderboard = `${emoji} *${title}* ${emoji}\n\n`;
    users.forEach((user, index) => {
        const rank = ['👑', '🥈', '🥉'][index] || `${index + 1}.`;
        const crown = user.activeEffects?.crown ? '👑 ' : '';
        const value = category === 'work' ? `${user.stats.workCount} jobs` : category === 'streak' ? `${user.stats.maxDailyStreak} days` : `${ecoSettings.currency}${user.totalWealth.toLocaleString()}`;
        leaderboard += `${rank} ${crown}@${user.userId.split('@')[0]} - ${value}\n`;
    });
    
    await sock.sendMessage(from, { text: leaderboard, mentions: users.map(u => u.userId) });
}

async function handleAchievements(context) {
    const { reply, senderId, args } = context;
    const userData = await getUserData(senderId);
    const userAchievements = userData.achievements || [];
    
    if (args[0] === 'all') {
        let allAchText = '🏆 *ALL ACHIEVEMENTS* 🏆\n\n';
        for (const [id, ach] of Object.entries(ACHIEVEMENTS)) {
            allAchText += `${userAchievements.includes(id) ? '✅' : '⬜'} ${ach.emoji} *${ach.name}* - ${ach.description}\n`;
        }
        await reply(allAchText);
    } else {
        if (userAchievements.length === 0) return reply(`📭 You have no achievements yet.`);
        let userAchText = `🏆 *YOUR ACHIEVEMENTS* (${userAchievements.length}/${Object.keys(ACHIEVEMENTS).length}) 🏆\n\n`;
        userAchievements.forEach(id => {
            const ach = ACHIEVEMENTS[id];
            if (ach) userAchText += `${ach.emoji} *${ach.name}*\n   📝 ${ach.description}\n\n`;
        });
        await reply(userAchText);
    }
}

async function handleShop(context) {
    const { reply, senderId, args, config } = context;
    if (!ecoSettings.shopEnabled) return reply('🚫 Shop is closed.');

    const action = args[0]?.toLowerCase();
    if (action === 'buy') {
        const itemId = getItemId(args[1]);
        const item = SHOP_ITEMS[itemId];
        if (!item) return reply('❌ Item not found.');
        
        const userData = await getUserData(senderId);
        if (userData.balance < item.price) return reply(`🚫 Insufficient funds. You need ${ecoSettings.currency}${item.price.toLocaleString()}`);
        if (item.type === 'permanent' && userData.activeEffects?.[item.effect]) return reply('⚠️ You already own this permanent upgrade.');

        await removeMoney(senderId, item.price, `Shop purchase: ${item.name}`);
        const existingItem = userData.inventory.find(inv => inv.id === itemId);
        if (existingItem) existingItem.quantity = (existingItem.quantity || 1) + 1;
        else userData.inventory.push({ id: itemId, name: item.name, quantity: 1, uses: item.uses || null });
        
        await updateUserData(senderId, { inventory: userData.inventory });
        await reply(`✅ Purchased ${item.emoji} *${item.name}* for ${ecoSettings.currency}${item.price.toLocaleString()}!`);
    } else {
        let shopText = '🛍️ *ECONOMY SHOP* 🛍️\n\n';
        for (const [id, item] of Object.entries(SHOP_ITEMS)) {
            shopText += `${item.emoji} *${item.name}* - ${ecoSettings.currency}${item.price.toLocaleString()}\n   📝 ${item.description} (ID: \`${id}\`)\n\n`;
        }
        shopText += `💡 Buy with: ${config.PREFIX}shop buy <item_id>`;
        await reply(shopText);
    }
}

async function handleInventory(context) {
    const { reply, senderId, config } = context;
    const userData = await getUserData(senderId);
    if (!userData.inventory || userData.inventory.length === 0) return reply('📦 Your inventory is empty.');
    
    let invText = '📦 *YOUR INVENTORY* 📦\n\n';
    userData.inventory.forEach(item => {
      const shopItem = SHOP_ITEMS[item.id];
      invText += `${shopItem.emoji} *${item.name}* (x${item.quantity})\n   🔧 Use with: ${config.PREFIX}use ${item.id}\n\n`;
    });
    await reply(invText);
}

async function handleUse(context) {
    const { reply, senderId, args } = context;
    const itemId = getItemId(args[0]);
    if (!itemId) return reply(`💊 Usage: use <item_id>`);
    
    const result = await useItem(senderId, itemId);
    await reply(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
}

async function handleAdminSettings(context) {
    const { reply, senderId, args, m } = context;
    if (!isAdmin(senderId) && !isOwner(senderId)) return reply('🚫 Admins only.');

    const action = args[0]?.toLowerCase();
    const targetUser = getTargetUser(m, args.join(' '));
    const amount = parseInt(args.find(arg => !isNaN(parseInt(arg))));

    switch (action) {
        case 'give':
            if (!targetUser || !amount) return reply("Usage: ...admin give <@user> <amount>");
            await addMoney(targetUser, amount, 'Admin grant');
            await reply(`✅ Gave ${ecoSettings.currency}${amount.toLocaleString()} to @${targetUser.split('@')[0]}.`);
            break;
        case 'take':
            if (!targetUser || !amount) return reply("Usage: ...admin take <@user> <amount>");
            await removeMoney(targetUser, amount, 'Admin removal');
            await reply(`✅ Took ${ecoSettings.currency}${amount.toLocaleString()} from @${targetUser.split('@')[0]}.`);
            break;
        case 'reset':
            if (!targetUser) return reply("Usage: ...admin reset <@user>");
            await db.collection(COLLECTIONS.USERS).deleteOne({ userId: targetUser });
            await initUser(targetUser);
            await reply(`🔄 Successfully reset @${targetUser.split('@')[0]}.`);
            break;
        default:
            await reply(`⚙️ *Admin Commands:*\n• give <@user> <amount>\n• take <@user> <amount>\n• reset <@user>`);
    }
}

// --- Investment Command Consolidation ---
async function handleInvestment(context, args, type) {
    const { reply, senderId } = context;
    if (!ecoSettings.investmentsEnabled) return reply('🚫 Investments are disabled.');

    const configs = {
        stocks: { name: 'Stock', plural: 'Stocks', unit: 'share', data: stockData, path: 'investments.stocks', emoji: '📈' },
        crypto: { name: 'Crypto', plural: 'Cryptocurrencies', unit: 'coin', data: cryptoData, path: 'investments.crypto', emoji: '₿' },
        business: { name: 'Business', plural: 'Businesses', unit: 'property', data: businessData, path: 'investments.businesses', emoji: '🏢', isOwnable: true }
    };
    const config = configs[type];
    const action = args[0]?.toLowerCase() || 'list';

    switch (action) {
        case 'list': {
            let listText = `${config.emoji} *AVAILABLE ${config.plural.toUpperCase()}* ${config.emoji}\n\n`;
            for (const [id, item] of Object.entries(config.data)) {
                listText += `*${item.name}* (${id})\n` +
                    `   💰 Price: ${ecoSettings.currency}${item.price.toLocaleString()}\n` +
                    (item.roi ? `   📈 Daily ROI: ${(item.roi * 100).toFixed(1)}%\n` : '') +
                    `   📝 ${item.description || ''}\n\n`;
            }
            return reply(listText);
        }
        case 'buy': {
            const id = args[1]?.toLowerCase();
            const amount = config.isOwnable ? 1 : parseFloat(args[2]);
            const item = config.data[id];

            if (!item || !amount || amount <= 0) return reply(`⚠️ Usage: ${type} buy <id> ${config.isOwnable ? '' : '<amount>'}`);
            
            const userData = await getUserData(senderId);
            const cost = item.price * amount;

            if (userData.balance < cost) return reply(`🚫 Insufficient funds. You need ${ecoSettings.currency}${cost.toLocaleString()}.`);
            
            if (config.isOwnable) {
                if (userData[config.path].some(b => b.id === id)) return reply(`⚠️ You already own this ${config.name}.`);
                const newBusiness = { id, name: item.name, price: item.price, roi: item.roi, purchaseDate: new Date(), lastCollected: new Date() };
                await updateUserData(senderId, { $push: { [config.path]: newBusiness } });
                await checkAchievements(senderId, 'business', { businessCount: userData[config.path].length + 1 });
            } else {
                const currentAmount = userData[config.path]?.[id] || 0;
                await updateUserData(senderId, { [`${config.path}.${id}`]: currentAmount + amount });
            }

            await removeMoney(senderId, cost, `${config.name} purchase`);
            return reply(`✅ Purchased ${amount} ${config.unit}(s) of *${item.name}* for ${ecoSettings.currency}${cost.toLocaleString()}.`);
        }
        case 'sell': {
            if (config.isOwnable) return reply(`🚫 ${config.plural} cannot be sold.`);
            const id = args[1]?.toUpperCase();
            const amount = parseFloat(args[2]);
            const item = config.data[id];
            const userData = await getUserData(senderId);
            const userAmount = userData[config.path]?.[id] || 0;

            if (!item || !amount || amount <= 0) return reply(`⚠️ Usage: ${type} sell <id> <amount>`);
            if (userAmount < amount) return reply(`🚫 You only have ${userAmount} ${config.unit}s of ${id}.`);
            
            const earnings = item.price * amount;
            await addMoney(senderId, earnings, `${config.name} sale`, false);
            await updateUserData(senderId, { [`${config.path}.${id}`]: userAmount - amount });
            return reply(`✅ Sold ${amount} ${config.unit}(s) of *${item.name}* for ${ecoSettings.currency}${earnings.toLocaleString()}.`);
        }
        case 'collect': {
            if (!config.isOwnable) return reply(`🚫 You can only collect from businesses.`);
            const userData = await getUserData(senderId);
            const businesses = userData[config.path] || [];
            if (businesses.length === 0) return reply(`🏢 You don't own any businesses.`);

            let totalProfit = 0;
            const now = new Date();
            const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

            businesses.forEach(biz => {
                const timeSince = now.getTime() - new Date(biz.lastCollected).getTime();
                if (timeSince >= twentyFourHoursInMs) {
                    const days = Math.floor(timeSince / twentyFourHoursInMs);
                    totalProfit += biz.price * (config.data[biz.id]?.roi || biz.roi) * days;
                    biz.lastCollected = new Date(new Date(biz.lastCollected).getTime() + days * twentyFourHoursInMs);
                }
            });

            if (totalProfit === 0) return reply(`⏰ No profits to collect yet.`);
            
            await addMoney(senderId, totalProfit, 'Business profits', false);
            await updateUserData(senderId, { [config.path]: businesses });
            return reply(`🏢 Collected ${ecoSettings.currency}${Math.floor(totalProfit).toLocaleString()} from your businesses!`);
        }
        case 'portfolio': {
            const userData = await getUserData(senderId);
            const holdings = userData[config.path];
            if (!holdings || Object.keys(holdings).length === 0) return reply(`📊 You don't own any ${config.plural}.`);

            let portfolioText = `📊 *YOUR ${config.plural.toUpperCase()} PORTFOLIO* 📊\n\n`;
            let totalValue = 0;

            if (config.isOwnable) {
                holdings.forEach(item => {
                    totalValue += item.price;
                    portfolioText += `*${item.name}*\n   💰 Value: ${ecoSettings.currency}${item.price.toLocaleString()}\n\n`;
                });
            } else {
                for (const [id, amount] of Object.entries(holdings)) {
                    if (amount > 0 && config.data[id]) {
                        const value = config.data[id].price * amount;
                        totalValue += value;
                        portfolioText += `*${config.data[id].name}* (${id})\n   📦 Holdings: ${amount.toFixed(4)}\n   💰 Value: ${ecoSettings.currency}${value.toLocaleString()}\n\n`;
                    }
                }
            }
            portfolioText += `💎 *Total Value:* ${ecoSettings.currency}${totalValue.toLocaleString()}`;
            return reply(portfolioText);
        }
        default:
            return reply(`❓ Unknown command. Try: list, buy, sell, collect, or portfolio.`);
    }
}

// --- Main Handler & Command Map ---
const commandHandlers = {
    'economy': showEconomyMenu, 'money': showEconomyMenu, 'eco': showEconomyMenu,
    'balance': handleBalance, 'bal': handleBalance, 'wallet': handleBalance,
    'send': handleSend, 'transfer': handleSend, 'pay': handleSend,
    'deposit': handleDeposit, 'dep': handleDeposit,
    'withdraw': handleWithdraw, 'wd': handleWithdraw,
    'work': handleWork, 'rob': handleRob, 'daily': handleDaily,
    'stocks': (context, args) => handleInvestment(context, args, 'stocks'),
    'crypto': (context, args) => handleInvestment(context, args, 'crypto'),
    'business': (context, args) => handleInvestment(context, args, 'business'),
    'profile': handleProfile,
    'leaderboard': handleLeaderboard, 'lb': handleLeaderboard,
    'achievements': handleAchievements, 'ach': handleAchievements,
    'shop': handleShop,
    'inventory': handleInventory, 'inv': handleInventory,
    'use': handleUse
};

export default async function economyHandler(m, sock, config) {
  try {
    if (!m.body?.startsWith(config.PREFIX)) return;
    const args = m.body.slice(config.PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    let senderId = m.key.participant || m.key.remoteJid;
    let from = m.key.remoteJid;
    if (!senderId || !from) return;

    if (!db) {
      await initDatabase();
      await loadSettings();
    }
    
    await cleanupExpiredEffects(senderId);
    
    const context = {
      m, sock, config, senderId, from, args,
      reply: (text) => sock.sendMessage(from, { text }, { quoted: m })
    };

    let cmdToRun = command;
    let argsToUse = args;

    if (['economy', 'eco', 'money'].includes(command) && args.length > 0) {
        cmdToRun = args[0].toLowerCase();
        argsToUse = args.slice(1);
        context.args = argsToUse;
    }

    if (cmdToRun === 'admin') {
      return await handleAdminSettings(context);
    }
    
    const handler = commandHandlers[cmdToRun];
    if (handler) {
      await handler(context);
    } else if (['economy', 'eco', 'money'].includes(command) && args.length === 0) {
      await showEconomyMenu(context);
    }

  } catch (error) {
    console.error('❌ Economy plugin error:', error.message);
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
  useItem,
  checkAchievements,
  cleanupExpiredEffects
};
