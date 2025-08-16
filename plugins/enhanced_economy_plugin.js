// plugins/economy_enhanced.js - Enhanced Economy plugin with all features
const { MongoClient } = require('mongodb');
const moment = require('moment-timezone');

// Plugin information
const info = {
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
    // Add after the existing indexes
    await loadCryptoPrices();
    console.log('✅ Crypto prices loaded');
    await loadNewsSettings();
    console.log('✅ News system loaded');

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

// Helper function to map lowercase item IDs to camelCase
function getItemId(inputId) {
  const itemMapping = {
    'workboost': 'workBoost',
    'bodyguard': 'Bodyguard', 
    'dailyboost': 'dailyBoost',
    'gamblingluck': 'gamblingLuck',
    'vipstatus': 'vipStatus',
    'privatevault': 'privateVault',
    'lockpicks': 'lockpicks',
    'businesssuit': 'businessSuit',
    'goldencrown': 'goldenCrown',
    'customtitle': 'customTitle',
    'heistplans': 'heistPlans',
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

// News Flash System
const newsAgencies = ['CNN', 'Sky News', 'BBC', 'Al Jazeera', 'Reuters', 'Bloomberg', 'Financial Times'];

let newsSettings = {
  enabled: true,
  targetGroups: [], // Admin configurable groups
  frequency: 3, // News per day
  cryptoImpactRange: { min: 0.05, max: 0.20 }, // 5-20% price impact
  businessImpactRange: { min: 0.02, max: 0.08 }, // 2-8% ROI impact
  lastNewsTime: null
};

// News templates
const newsTemplates = {
  crypto: {
    crash: [
      "🚨 {agency} BREAKING: {coin} plummets {percent}% amid regulatory concerns",
      "📉 {agency}: Major sell-off hits {coin}, down {percent}% in 24 hours",
      "⚠️ {agency} ALERT: {coin} crashes {percent}% following market uncertainty",
      "🔴 {agency}: Crypto bloodbath continues as {coin} drops {percent}%"
    ],
    boom: [
      "🚀 {agency} BREAKING: {coin} surges {percent}% on institutional adoption",
      "📈 {agency}: {coin} rockets {percent}% higher on positive news",
      "💚 {agency}: Massive rally sends {coin} up {percent}% overnight",
      "🎯 {agency} REPORT: {coin} explodes {percent}% on breakthrough technology"
    ],
    listing: [
      "🆕 {agency}: New cryptocurrency {coin} launches on major exchanges",
      "📢 {agency}: {coin} debuts with strong investor interest",
      "🎉 {agency}: Latest crypto {coin} sees explosive trading volume"
    ],
    regulation: [
      "📜 {agency}: New crypto regulations affect {coin} trading",
      "⚖️ {agency}: Government policy changes impact {coin} markets",
      "🏛️ {agency}: Central bank statements move {coin} significantly"
    ]
  },
  business: {
    growth: [
      "📈 {agency}: {business} sector sees {percent}% ROI increase this quarter",
      "🏢 {agency} REPORT: {business} industry experiences unprecedented growth of {percent}%",
      "💼 {agency}: Economic boom lifts {business} returns by {percent}%",
      "📊 {agency}: {business} businesses report {percent}% profit surge"
    ],
    decline: [
      "📉 {agency}: {business} sector faces {percent}% ROI decline amid challenges",
      "⚠️ {agency} ALERT: {business} industry struggles with {percent}% drop in returns",
      "🔻 {agency}: Economic headwinds hit {business} businesses, down {percent}%",
      "📰 {agency}: {business} sector experiences {percent}% profitability decline"
    ],
    opportunity: [
      "🚀 {agency}: New {business} investment opportunities emerge",
      "💡 {agency} INSIGHT: {business} sector poised for major expansion",
      "🎯 {agency}: Market analysts bullish on {business} industry outlook"
    ],
    crisis: [
      "🚨 {agency}: Supply chain issues affect {business} operations",
      "⚠️ {agency} BREAKING: {business} industry faces regulatory challenges",
      "🔴 {agency}: Economic pressures impact {business} sector performance"
    ]
  }
};

// Load news settings
async function loadNewsSettings() {
  try {
    const settings = await db.collection(COLLECTIONS.SETTINGS).findOne({ type: 'news_settings' });
    if (settings) {
      newsSettings = { ...newsSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading news settings:', error);
  }
}

// Save news settings
async function saveNewsSettings() {
  try {
    await db.collection(COLLECTIONS.SETTINGS).replaceOne(
      { type: 'news_settings' },
      { type: 'news_settings', data: newsSettings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving news settings:', error);
  }
}

// Generate crypto news and apply market impact
async function generateCryptoNews() {
  try {
    if (!newsSettings.enabled || newsSettings.targetGroups.length === 0) return;

    const cryptoSymbols = Object.keys(cryptoData);
    const selectedCrypto = cryptoSymbols[Math.floor(Math.random() * cryptoSymbols.length)];
    const crypto = cryptoData[selectedCrypto];
    
    // Determine news type and impact
    const newsTypes = ['crash', 'boom', 'regulation'];
    const newsType = newsTypes[Math.floor(Math.random() * newsTypes.length)];
    
    let impactMultiplier;
    switch (newsType) {
      case 'crash':
        impactMultiplier = -(Math.random() * (newsSettings.cryptoImpactRange.max - newsSettings.cryptoImpactRange.min) + newsSettings.cryptoImpactRange.min);
        break;
      case 'boom':
        impactMultiplier = Math.random() * (newsSettings.cryptoImpactRange.max - newsSettings.cryptoImpactRange.min) + newsSettings.cryptoImpactRange.min;
        break;
      case 'regulation':
        impactMultiplier = (Math.random() - 0.5) * newsSettings.cryptoImpactRange.max;
        break;
    }
    
    // Apply price impact
    const oldPrice = crypto.price;
    const newPrice = Math.max(oldPrice * (1 + impactMultiplier), oldPrice * 0.1);
    cryptoData[selectedCrypto].price = parseFloat(newPrice.toFixed(selectedCrypto === 'SHIB' ? 8 : 2));
    
    // Generate news message
    const templates = newsTemplates.crypto[newsType];
    const template = templates[Math.floor(Math.random() * templates.length)];
    const agency = newsAgencies[Math.floor(Math.random() * newsAgencies.length)];
    const percent = Math.abs(impactMultiplier * 100).toFixed(1);
    
    const newsMessage = template
      .replace('{agency}', agency)
      .replace('{coin}', `${crypto.name} (${selectedCrypto})`)
      .replace('{percent}', percent);
    
    const fullNews = `📰 *CRYPTO NEWS FLASH* 📰\n\n${newsMessage}\n\n💰 *Price Impact:*\n${selectedCrypto}: ${ecoSettings.currency}${oldPrice.toLocaleString()} → ${ecoSettings.currency}${newPrice.toLocaleString()}\n\n⚡ *Market reacting in real-time!*`;
    
    // Save updated prices
    await db.collection(COLLECTIONS.SETTINGS).replaceOne(
      { type: 'crypto_prices' },
      { type: 'crypto_prices', data: cryptoData, updatedAt: new Date() },
      { upsert: true }
    );
    
    return { message: fullNews, groups: newsSettings.targetGroups };
  } catch (error) {
    console.error('Error generating crypto news:', error);
    return null;
  }
}

// Generate business news and apply ROI impact
async function generateBusinessNews() {
  try {
    if (!newsSettings.enabled || newsSettings.targetGroups.length === 0) return;

    const businessIds = Object.keys(businessData);
    const selectedBusinessId = businessIds[Math.floor(Math.random() * businessIds.length)];
    const business = businessData[selectedBusinessId];
    
    // Determine news type and impact
    const newsTypes = ['growth', 'decline', 'opportunity', 'crisis'];
    const newsType = newsTypes[Math.floor(Math.random() * newsTypes.length)];
    
    let impactMultiplier;
    switch (newsType) {
      case 'growth':
      case 'opportunity':
        impactMultiplier = Math.random() * (newsSettings.businessImpactRange.max - newsSettings.businessImpactRange.min) + newsSettings.businessImpactRange.min;
        break;
      case 'decline':
      case 'crisis':
        impactMultiplier = -(Math.random() * (newsSettings.businessImpactRange.max - newsSettings.businessImpactRange.min) + newsSettings.businessImpactRange.min);
        break;
    }
    
    // Apply ROI impact
    const oldROI = business.roi;
    const newROI = Math.max(business.roi + impactMultiplier, 0.01); // Minimum 1% ROI
    businessData[selectedBusinessId].roi = parseFloat(newROI.toFixed(3));
    
    // Generate news message
    const templates = newsTemplates.business[newsType];
    const template = templates[Math.floor(Math.random() * templates.length)];
    const agency = newsAgencies[Math.floor(Math.random() * newsAgencies.length)];
    const percent = Math.abs(impactMultiplier * 100).toFixed(1);
    
    const newsMessage = template
      .replace('{agency}', agency)
      .replace('{business}', business.name)
      .replace('{percent}', percent);
    
    const fullNews = `📰 *BUSINESS NEWS FLASH* 📰\n\n${newsMessage}\n\n📊 *ROI Impact:*\n${business.name}: ${(oldROI * 100).toFixed(1)}% → ${(newROI * 100).toFixed(1)}%\n\n🏢 *Affecting all ${business.name.toLowerCase()} investments!*`;
    
    // Save updated business data
    await db.collection(COLLECTIONS.SETTINGS).replaceOne(
      { type: 'business_data' },
      { type: 'business_data', data: businessData, updatedAt: new Date() },
      { upsert: true }
    );
    
    return { message: fullNews, groups: newsSettings.targetGroups };
  } catch (error) {
    console.error('Error generating business news:', error);
    return null;
  }
}

// Send news to target groups
async function broadcastNews(newsData, sock) {
  try {
    if (!newsData || !newsData.groups || newsData.groups.length === 0) return;
    
    for (const gr...(truncated 76192 characters)...specify a valid recipient*');
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
          const change = (Math.random() - 0.5) * 10;
          const changeEmoji = change >= 0 ? '📈' : '📉';
          cryptoList += `${changeEmoji} *${symbol}* - ${data.name}\n`;
          cryptoList += `   💰 ${ecoSettings.currency}${data.price.toLocaleString()} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)\n\n`;
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
        
        // Check if user already owns this business
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
        
        // Check achievement
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
          await reply('🏢 *You don\'t own any businesses*');
          return;
        }
        
        let totalProfit = 0;
        const now = new Date();
        const updatedBusinesses = [];
        
        userBusinesses.forEach(business => {
          const lastCollected = new Date(business.lastCollected);
          const daysSince = Math.floor((now - lastCollected) / 86400000);
          
          if (daysSince >= 1) {
            const currentROI = businessData[business.id]?.roi || business.roi;
            const profit = business.price * currentROI * daysSince;
            totalProfit += profit;
            
            business.lastCollected = now;
          }
          
          updatedBusinesses.push(business);
        });
        
        if (totalProfit === 0) {
          await reply('⏰ *No profits to collect yet*\n\nCome back tomorrow for daily business profits!');
          return;
        }
        
        await addMoney(senderId, totalProfit, 'Business profits', false);
        await updateUserData(senderId, {
          'investments.businesses': updatedBusinesses
        });
        
        await reply(`🏢 *Business Profits Collected!* 🏢\n\n💰 *Total Profit:* ${ecoSettings.currency}${totalProfit.toLocaleString()}\n🏪 *Businesses:* ${userBusinesses.length}\n\n💡 *Come back tomorrow for more profits!*`);
        break;
        
      default:
        await reply('❓ *Unknown business command*');
    }
  } catch (error) {
    await reply('❌ *Error processing business command. Please try again.*');
    console.error('Business error:', error);
  }
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
module.exports = { 
  info,
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
