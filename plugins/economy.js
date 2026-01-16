// plugins/economy_v3_plugin.js - A focused Economy plugin
// ✅ V3 MIGRATION: This file is now in the V3 plugin manager format.
import moment from 'moment-timezone';
import { TimeHelpers } from '../lib/helpers.js';
// ✅ REFACTORED: Import the new PluginHelpers and safeOperation for database access
import { PluginHelpers, safeOperation, getCollection } from '../lib/pluginIntegration.js';


// ---------------------------------------------------------------- //
//  V3 PLUGIN METADATA & ENTRY POINT
// ---------------------------------------------------------------- //

// Extract commands and aliases from the old info structure
const oldInfo = {
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

    // Subscription
    { name: 'subscription', aliases: ['sub'], description: 'Manage your subscription' },

    // Events & Admin
    { name: 'events', aliases: [], description: 'View active events' },
    { name: 'bounty', aliases: [], description: 'Bounty hunting system' },

    // Admin
    { name: 'freeze', description: 'Freeze a user\'s account (Admin only)', aliases: [] },
    { name: 'unfreeze', description: 'Unfreeze a user\'s account (Admin only)', aliases: [] },
  ]
};

// Generate V3 command and alias lists
const v3Commands = oldInfo.commands.map(cmd => cmd.name);
const v3Aliases = oldInfo.commands.flatMap(cmd => cmd.aliases || []);

export default {
  // ===== V3 Metadata =====
  name: oldInfo.name,
  version: oldInfo.version,
  author: oldInfo.author,
  description: oldInfo.description,
  category: 'economy', // Set V3 category

  // ===== V3 Command Handling =====
  commands: v3Commands,
  aliases: v3Aliases,

  // ===== Scheduled Tasks =====
  scheduledTasks: [
    {
      name: 'subscription_billing',
      description: 'Charge weekly subscription fees and apply bonuses',
      schedule: '0 0 * * 0', // Every Sunday at 00:00
      handler: (context) => scheduledSubscriptionBilling(context)
    }
  ],

  // ===== V3 Main Handler =====
      async run(context) {
      // Destructure the V3 context object
      const { msg: m, args, text, command, sock, db, config, bot, logger, helpers } = context;
      const { PermissionHelpers, TimeHelpers } = helpers; // Get helpers

      try {
        // Preserve original sender/from logic
        const senderId = m.key.participant || m.key.remoteJid;
        const from = m.key.remoteJid; // 'from' is the chat JID (group or user)

        if (!senderId || !from) return;

        // --- START GROUP CHECK ---
        const allowedGroupId = config.ALLOWED_ECONOMY_GROUP_ID; // Get ID from config

        if (!allowedGroupId) {
            logger.error('Economy Plugin: ALLOWED_ECONOMY_GROUP_ID is not set in the configuration. Plugin will not run.');
            // Optionally reply to the user, but logging might be better for config issues
            // await sock.sendMessage(from, { text: 'Economy plugin is not configured correctly.' }, { quoted: m });
            return; // Stop execution if config is missing
        }

        // Check if the message is from the allowed group
        if (from !== allowedGroupId) {
            // Send a message only if it's a group chat (to avoid spamming users in PM)
            if (from.endsWith('@g.us')) {
                await sock.sendMessage(from, { text: '💰 This command can only be used in the designated group.' }, { quoted: m });
            }
            return; // Stop execution if not in the allowed group
        }
        // --- END GROUP CHECK ---


      // Run plugin startup logic
      await loadSettings();
      await initUser(senderId);
      await cleanupExpiredEffects(senderId);

      // Define the reply function used by all helper functions
      const reply = async (replyText) => {
        try {
          if (!replyText || typeof replyText !== 'string') return;
          await sock.sendMessage(from, { text: replyText }, { quoted: m });
        } catch (error) {
          logger.error('Error sending reply in economy plugin:', error);
        }
      };

      // Create the context object for the original helper functions
      // Pass V3 objects (logger, config, helpers) to it
      const ecoContext = { m, sock, config, senderId, from, reply, logger, helpers };

      // Route to the correct command handler
      // This switch block is preserved from the original plugin
      switch (command.toLowerCase()) {
        // Basic Economy Commands
        case 'economy':
        case 'eco':
        case 'money': // Added alias
          if (args.length === 0) {
            await showEconomyMenu(reply, config.PREFIX);
          } else {
            // Pass ecoContext to sub-handler
            await handleSubCommand(args[0], args.slice(1), ecoContext);
          }
          break;

        case 'balance':
        case 'bal':
        case 'wallet':
          await handleBalance(ecoContext, args);
          break;

        case 'send':
        case 'transfer':
        case 'pay':
          await handleSend(ecoContext, args);
          break;

        case 'deposit':
        case 'dep':
          await handleDeposit(ecoContext, args);
          break;

        case 'withdraw':
        case 'wd':
          await handleWithdraw(ecoContext, args);
          break;

        // Earning Commands
        case 'work':
          await handleWork(ecoContext);
          break;

        case 'rob':
          await handleRob(ecoContext, args);
          break;

        case 'daily':
          await handleDaily(ecoContext);
          break;

        // Investment Commands
        case 'invest':
          await handleInvest(ecoContext, args);
          break;

        case 'stocks':
          await handleStocks(ecoContext, args);
          break;

        case 'crypto':
          await handleCrypto(ecoContext, args);
          break;

        case 'business':
          await handleBusiness(ecoContext, args);
          break;

        // Social Commands
        case 'profile':
          await handleProfile(ecoContext, args);
          break;

        case 'leaderboard':
        case 'lb':
          await handleLeaderboard(ecoContext, args);
          break;

        case 'achievements':
        case 'ach':
          await handleAchievements(ecoContext, args);
          break;

        // Shop Commands
        case 'shop':
          await handleShop(ecoContext, args);
          break;

        case 'inventory':
        case 'inv':
          await handleInventory(ecoContext);
          break;

        case 'use':
          await handleUse(ecoContext, args);
          break;

        // Subscription Commands
        case 'subscription':
        case 'sub':
          await handleSubscription(ecoContext, args);
          break;

        // Event Commands
        case 'events':
          await handleEvents(ecoContext);
          break;

        case 'bounty':
          await handleBounty(ecoContext, args);
          break;

        // Admin Commands
        case 'freeze':
          await handleAdminFreeze(ecoContext, args);
          break;

        case 'unfreeze':
          await handleAdminUnfreeze(ecoContext, args);
          break;

        default:
          // This command was mapped but not in the switch?
          // This case should ideally not be hit if commands/aliases are correct.
          logger.warn(`Economy plugin: Unhandled command ${command}`);
          break;
      }
    } catch (error) {
      logger.error('❌ Economy plugin error:', error.message);
      // Try to reply with an error
      try {
        await sock.sendMessage(m.key.remoteJid, { text: '❌ An internal error occurred in the economy plugin.' }, { quoted: m });
      } catch (e) {
        logger.error('Failed to send error message:', e);
      }
    }
  }
};


// ---------------------------------------------------------------- //
//  ORIGINAL PLUGIN CODE (HELPER FUNCTIONS)
// ---------------------------------------------------------------- //
// All original functions are preserved below, outside the default export.
// They are now called by the `run` function above.

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

// Set Nigeria timezone (UNCHANGED)
moment.tz.setDefault('Africa/Lagos');

// Enhanced economy settings with removed features (UNCHANGED)
const defaultSettings = {
  // Basic Economy
  startingBalance: 0,
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
  cryptoVolatility: 0.15,
  businessROI: 0.08, // 8% daily return

  // Portfolio Limits (Anti-Inflation Measures)
  maxCryptoPerToken: 100, // Maximum coins per cryptocurrency (FREE tier)
  maxStocksPerStock: 50, // Maximum shares per stock (FREE tier)

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
  marketCrashChance: 0.55, // 55% daily

  // Subscription Settings
  subscriptionEnabled: true,
  subscriptionBillingDay: 0, // Day of week (0=Sunday, auto-charge on Sundays)
  subscriptionAutoRenew: true,
  showSubscriptionReminders: true,

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
        frozen: false, // ✅ ENHANCED: Explicitly set to false for new users

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

        // Subscription System
        subscription: {
          tier: 'free',
          active: false,
          subscribedAt: null,
          renewalDate: null,
          lastChargeDate: null,
          autoRenew: true
        },

        // System
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await usersCollection.insertOne(newUser);
      await checkAchievements(userId, 'registration');
      return newUser;
    } else {
      // ✅ ENHANCED: Ensure ALL existing users have the frozen field
      const updates = {};
      let needsUpdate = false;

      const requiredFields = {
        frozen: false, // ✅ Add frozen field to required fields
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
        },
        subscription: {
          tier: 'free',
          active: false,
          subscribedAt: null,
          renewalDate: null,
          lastChargeDate: null,
          autoRenew: true
        }
      };

      for (const [field, defaultValue] of Object.entries(requiredFields)) {
        if (existingUser[field] === undefined) {
          updates[field] = defaultValue;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        updates.updatedAt = new Date();
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
    price: 8000000,
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
}
  // ========== NEW EXCLUSIVE SHOP ITEMS FOR SUPREME/TITAN ==========
  // Add these to your SHOP_ITEMS object

  const SUPREME_TITAN_SHOP_ITEMS = {
    // Supreme Tier Exclusive
    moneyMagnet: {
      name: "Money Magnet",
      price: 50000000,
      description: "Attract 5% of all group transactions for 7 days (Supreme+)",
      type: "consumable",
      effect: "moneyMagnet",
      emoji: "🧲",
      requiredTier: "supreme"
    },
    inflationShield: {
      name: "Inflation Shield",
      price: 300000000,
      description: "Protects portfolio from market crashes for 14 days (Supreme+)",
      type: "consumable",
      effect: "inflationShield",
      emoji: "🛡️",
      requiredTier: "supreme"
    },

    // Titan Tier Exclusive
    goldenParachute: {
      name: "Golden Parachute",
      price: 100000000,
      description: "One-time protection from bankruptcy - Auto-saves you (Titan only)",
      type: "permanent",
      effect: "goldenParachute",
      emoji: "🪂",
      requiredTier: "titan"
    },
    marketManipulator: {
      name: "Market Manipulator",
      price: 1500000000,
      description: "Force a specific crypto/stock price up or down once (Titan only)",
      type: "consumable",
      effect: "marketManipulator",
      emoji: "📊",
      requiredTier: "titan",
      uses: 1
    },
    royalCrown: {
      name: "Royal Crown",
      price: 500000000,
      description: "Shows 🔱 next to your name + immunity to robberies (Titan only)",
      type: "permanent",
      effect: "royalCrown",
      emoji: "🔱",
      requiredTier: "titan"
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
  BTC: { name: "Bitcoin", price: 45000, volatility: 0.015, trend: 0.0001, history: [], lastChange: 'stable', buyVolume: 0, sellVolume: 0 },
  ETH: { name: "Ethereum", price: 3200, volatility: 0.018, trend: -0.00015, history: [], lastChange: 'stable', buyVolume: 0, sellVolume: 0 },
  SOL: { name: "Solana", price: 120, volatility: 0.020, trend: 0.0002, history: [], lastChange: 'stable', buyVolume: 0, sellVolume: 0 },
  SHIB: { name: "Shiba Inu", price: 0.0000002, volatility: 0.012, trend: 0.0001, history: [], lastChange: 'stable', buyVolume: 0, sellVolume: 0 },
  GROQ: { name: "Groq Coin", price: 15, volatility: 0.022, trend: -0.00015, history: [], lastChange: 'stable', buyVolume: 0, sellVolume: 0 },
  ADA: { name: "Cardano", price: 0.8, volatility: 0.017, trend: 0.0001, history: [], lastChange: 'stable', buyVolume: 0, sellVolume: 0 },
  DOT: { name: "Polkadot", price: 25, volatility: 0.019, trend: 0.00008, history: [], lastChange: 'stable', buyVolume: 0, sellVolume: 0 },
  MATIC: { name: "Polygon", price: 1.2, volatility: 0.021, trend: -0.0001, history: [], lastChange: 'stable', buyVolume: 0, sellVolume: 0 }
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

// ===== SUBSCRIPTION TIER SYSTEM =====
const SUBSCRIPTION_TIERS = {
  free: {
    name: '🆓 Free',
    weeklyCost: 0,
    limits: {
      walletLimit: 1000000,
      bankLimit: 5000000,
      maxCryptoPerToken: 100,
      maxStocksPerStock: 50
    },
    bonuses: {
      workBonus: 1.0,
      dailyBonus: 1.0,
      weeklyPassiveIncome: 0,
      robProtectionBlocks: 0,
      cashbackPercent: 0,
      interestPercent: 0
    },
    features: {
      robProtection: false,
      passiveIncome: false,
      marketInsider: false,
      taxAvoidance: false
    }
  },

  plus: {
    name: '⭐ Plus',
    weeklyCost: 100000,
    limits: {
      walletLimit: 2000000,
      bankLimit: 10000000,
      maxCryptoPerToken: 250,
      maxStocksPerStock: 150
    },
    bonuses: {
      workBonus: 1.15,
      dailyBonus: 1.20,
      weeklyPassiveIncome: 0,
      robProtectionBlocks: 1,
      cashbackPercent: 0,
      interestPercent: 0
    },
    features: {
      robProtection: true,
      passiveIncome: false,
      marketInsider: false,
      taxAvoidance: false
    }
  },

  pro: {
    name: '🔥 Pro',
    weeklyCost: 250000,
    limits: {
      walletLimit: 5000000,
      bankLimit: 100000000,
      maxCryptoPerToken: 500,
      maxStocksPerStock: 300
    },
    bonuses: {
      workBonus: 1.30,
      dailyBonus: 1.40,
      weeklyPassiveIncome: 0,
      robProtectionBlocks: 2,
      cashbackPercent: 2,
      interestPercent: 5
    },
    features: {
      robProtection: true,
      passiveIncome: false,
      marketInsider: false,
      taxAvoidance: false
    }
  },

  smart: {
    name: '💎 Smart',
    weeklyCost: 500000,
    limits: {
      walletLimit: 50000000,
      bankLimit: 1000000000,
      maxCryptoPerToken: 1000,
      maxStocksPerStock: 500
    },
    bonuses: {
      workBonus: 1.50,
      dailyBonus: 1.60,
      weeklyPassiveIncome: 5000,
      robProtectionBlocks: 3,
      cashbackPercent: 4,
      interestPercent: 8
    },
    features: {
      robProtection: true,
      passiveIncome: true,
      marketInsider: false,
      taxAvoidance: true
    }
  },

  ultra: {
    name: '👑 Ultra',
    weeklyCost: 1000000,
    limits: {
      walletLimit: 100000000,
      bankLimit: 10000000000,
      maxCryptoPerToken: 2000,
      maxStocksPerStock: 1000
    },
    bonuses: {
      workBonus: 1.75,
      dailyBonus: 2.0,
      weeklyPassiveIncome: 15000,
      robProtectionBlocks: 999,
      cashbackPercent: 6,
      interestPercent: 12
    },
    features: {
      robProtection: true,
      passiveIncome: true,
      marketInsider: true,
      taxAvoidance: true,
      monopolyBonus: true
    }
  },
    // ========== NEW: SUPREME TIER ==========
      supreme: {
        name: '🌟 Supreme',
        weeklyCost: 5000000, // ₦5M/week
        limits: {
          walletLimit: 500000000,        // ₦500M
          bankLimit: 50000000000,        // ₦50B
          maxCryptoPerToken: 5000,       // 5,000 per token
          maxStocksPerStock: 2500        // 2,500 per stock
        },
        bonuses: {
          workBonus: 2.0,                // 100% boost
          dailyBonus: 2.5,               // 150% boost
          weeklyPassiveIncome: 50000,    // ₦50k/week
          robProtectionBlocks: 999,      // Unlimited
          cashbackPercent: 10,           // 10% cashback
          interestPercent: 15            // 15% weekly interest
        },
        features: {
          robProtection: true,
          passiveIncome: true,
          marketInsider: true,
          taxAvoidance: true,
          monopolyBonus: true,
          prioritySupport: true,         // NEW: Admin priority
          exclusiveItems: true,          // NEW: Supreme-only items
          investmentInsights: true,      // NEW: See trends
          doubleAchievementRewards: true // NEW: 2x achievements
        }
      },

      // ========== NEW: TITAN TIER ==========
      titan: {
        name: '🔱 Titan',
        weeklyCost: 10000000, // ₦10M/week
        limits: {
          walletLimit: 1000000000,       // ₦1B
          bankLimit: 100000000000,       // ₦100B
          maxCryptoPerToken: 10000,      // 10,000 per token
          maxStocksPerStock: 5000        // 5,000 per stock
        },
        bonuses: {
          workBonus: 2.5,                // 150% boost
          dailyBonus: 3.0,               // 200% boost
          weeklyPassiveIncome: 100000,   // ₦100k/week
          robProtectionBlocks: 999,      // Unlimited
          cashbackPercent: 15,           // 15% cashback
          interestPercent: 20            // 20% weekly interest
        },
        features: {
          robProtection: true,
          passiveIncome: true,
          marketInsider: true,
          taxAvoidance: true,
          monopolyBonus: true,
          prioritySupport: true,
          exclusiveItems: true,
          investmentInsights: true,
          doubleAchievementRewards: true,
          immuneToMarketCrashes: true,   // NEW: Immune to crashes
          instantBusinessPayouts: true,  // NEW: Collect anytime
          vipLeaderboardBadge: true      // NEW: 🔱 badge
        }
      }
    };

// ===== GRACE PERIOD & AUTO-LIQUIDATION CONFIG =====
// When new limits launch, players have a grace period to voluntarily sell excess holdings
const GRACE_PERIOD_CONFIG = {
  ENABLED: true,
  GRACE_PERIOD_DAYS: 14,  // Players have 14 days to adjust holdings
  LAUNCH_DATE: new Date('2025-12-15T00:00:00+01:00'),  // Change to your launch date
  AUTO_LIQUIDATION_REFUND_PERCENT: 80,  // Give 80% refund on auto-liquidated items
  WARNING_THRESHOLD_PERCENT: 100,  // Warn when over 100% of new limit
  IGNORE_BEFORE_LAUNCH: true  // Don't enforce until after launch
};

// Calculate grace period end date
function getGracePeriodEndDate() {
  const endDate = new Date(GRACE_PERIOD_CONFIG.LAUNCH_DATE);
  endDate.setDate(endDate.getDate() + GRACE_PERIOD_CONFIG.GRACE_PERIOD_DAYS);
  return endDate;
}

// Check if we're still in grace period
function isInGracePeriod() {
  if (!GRACE_PERIOD_CONFIG.ENABLED) return false;
  const now = new Date();
  const endDate = getGracePeriodEndDate();
  return now <= endDate;
}

// Get days remaining in grace period
function getDaysRemainingInGracePeriod() {
  const now = new Date();
  const endDate = getGracePeriodEndDate();
  const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, daysRemaining);
}

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
      // ✅ NEW: Calculate supply/demand impact from buy/sell volumes
      const totalVolume = (data.buyVolume || 0) + (data.sellVolume || 0);
      let demandPressure = 0;

      if (totalVolume > 0) {
        // Net demand: positive if more buys, negative if more sells
        const netDemand = ((data.buyVolume || 0) - (data.sellVolume || 0)) / totalVolume;
        // Apply demand pressure to trend (max ±2% additional impact from supply/demand)
        demandPressure = netDemand * 0.02;
      }

      // Base random volatility (now 1.5-2.2% instead of 5-10%)
      const randomVolatility = (Math.random() - 0.5) * data.volatility;

      // Add gradual trend effect (very small, ~0.01% per tick) + supply/demand pressure
      const trendEffect = (data.trend || 0) + demandPressure;

      // Calculate total change
      let change = randomVolatility + trendEffect;

      // ✅ NEW: Moving average dampening
      // Calculate 20-period moving average to anchor price
      let priceHistory = cryptoData[symbol].history || [];
      if (priceHistory.length > 0) {
        const movingAverage = priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;
        const currentPrice = data.price;
        const deviationPercent = (currentPrice - movingAverage) / movingAverage;

        // If price deviates >5% from MA, dampen the change proportionally
        if (Math.abs(deviationPercent) > 0.05) {
          change *= 0.5; // Reduce change momentum to pull price back to MA
        }
      }

      // ✅ NEW: Maximum change cap (±3% per tick max for stability)
      const maxChangePercent = 0.03;
      change = Math.max(-maxChangePercent, Math.min(maxChangePercent, change));

      const oldPrice = data.price;
      let newPrice = oldPrice * (1 + change);

      // Prevent price from going to zero or negative
      newPrice = Math.max(newPrice, 0.00000001);

      cryptoData[symbol].price = parseFloat(newPrice.toFixed(symbol === 'SHIB' ? 8 : 2));

      // Track history (last 20 ticks = ~6.7 hours at default tick rate)
      if (!cryptoData[symbol].history) {
        cryptoData[symbol].history = [];
      }
      cryptoData[symbol].history.push(oldPrice);
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

      // Reset buy/sell volumes for next cycle
      cryptoData[symbol].buyVolume = 0;
      cryptoData[symbol].sellVolume = 0;
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

// ✅ REFACTORED & SECURED: Money functions with NaN Guard
async function addMoney(userId, amount, reason = 'Unknown', applyEffects = true) {
  try {
    // 🛡️ SECURITY: NaN Protection
    // If amount is NaN, Infinite, or negative, freeze the account immediately
    if (Number.isNaN(amount) || !Number.isFinite(amount) || amount < 0) {
        console.error(`🚨 SECURITY: NaN detected for ${userId}. Freezing account.`);
        await setFreezeStatus(userId, true, 'System - Anti-Corruption (NaN detected)');
        return { success: false, message: '❌ Security Alert: Corrupt data detected. Account frozen.', balance: null };
    }

    // ✅ ENHANCED: Check if account is frozen first
    const freezeCheck = await checkAccountFrozen(userId);
    if (freezeCheck.isFrozen) {
      console.warn(`Blocked transaction (add money) on frozen account: ${userId}. Reason: ${reason}`);
      return { success: false, message: freezeCheck.message, balance: null };
    }

    const user = await getUserData(userId);

    // 🛡️ SECURITY: Database Integrity Check
    // If the user's CURRENT balance is already NaN, freeze them to prevent spread
    if (Number.isNaN(user.balance) || Number.isNaN(user.bank)) {
        await setFreezeStatus(userId, true, 'System - Account already corrupted');
        return { success: false, message: '❌ Critical Error: Your account data is corrupt. Account frozen.', balance: null };
    }

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

    // ✅ FIXED: Use subscription tier wallet limit, not global max
    const tier = user.subscription?.tier || 'free';
    const tierConfig = SUBSCRIPTION_TIERS[tier];
    const walletLimit = tierConfig.limits.walletLimit;
    const newBalance = Math.min(user.balance + finalAmount, walletLimit);

    // REFACTORED DB CALL
    await updateUserData(userId, { 
      balance: newBalance,
      'stats.totalEarned': (user.stats?.totalEarned || 0) + finalAmount,
      updatedAt: new Date()
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

    return { success: true, balance: newBalance };
  } catch (error) {
    console.error('Error adding money:', error);
    return { success: false, message: 'Transaction failed', balance: null };
  }
}

async function removeMoney(userId, amount, reason = 'Unknown') {
  try {
    // 🛡️ SECURITY: NaN Protection
    if (Number.isNaN(amount) || !Number.isFinite(amount) || amount < 0) {
        console.error(`🚨 SECURITY: NaN detected for ${userId} during deduction. Freezing account.`);
        await setFreezeStatus(userId, true, 'System - Anti-Corruption (NaN detected)');
        return { success: false, message: '❌ Security Alert: Corrupt data detected. Account frozen.' };
    }

    // ✅ ENHANCED: Check if account is frozen first
    const freezeCheck = await checkAccountFrozen(userId);
    if (freezeCheck.isFrozen) {
      console.warn(`Blocked transaction (remove money) on frozen account: ${userId}. Reason: ${reason}`);
      return { success: false, message: freezeCheck.message };
    }

    const user = await getUserData(userId);

    // 🛡️ SECURITY: Database Integrity Check
    if (Number.isNaN(user.balance)) {
        await setFreezeStatus(userId, true, 'System - Account already corrupted');
        return { success: false, message: '❌ Critical Error: Your account data is corrupt. Account frozen.' };
    }

    if (user.balance >= amount) {
      const newBalance = user.balance - amount;

      // REFACTORED DB CALL
      await updateUserData(userId, { 
        balance: newBalance,
        'stats.totalSpent': (user.stats?.totalSpent || 0) + amount,
        updatedAt: new Date()
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

      return { success: true };
    }
    return { success: false, message: 'Insufficient funds' };
  } catch (error) {
    console.error('Error removing money:', error);
    return { success: false, message: 'Transaction failed' };
  }
}

// ========== UPDATED ACHIEVEMENTS WITH BONUS MULTIPLIERS ==========
// Modify checkAchievements function to apply doubleAchievementRewards

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

      // Give rewards with Supreme/Titan multiplier
      let totalReward = 0;
      for (const achName of newAchievements) {
        if (ACHIEVEMENTS[achName]) {
          totalReward += ACHIEVEMENTS[achName].reward;
        }
      }

      if (totalReward > 0) {
        // ✨ NEW: Check if user has doubleAchievementRewards feature
        const subscription = user.subscription || { tier: 'free' };
        const tierConfig = SUBSCRIPTION_TIERS[subscription.tier];

        if (tierConfig.features.doubleAchievementRewards) {
          totalReward *= 2; // Double rewards for Supreme/Titan
        }

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

// ✅ V3 REFACTORED: These functions now take `config` and `helpers` to use V3 standards
// Note: `helpers` is passed but not used by `isOwner` to preserve original env var logic
function isAdmin(userId, config) {
  try {
    if (!userId || typeof userId !== 'string' || !config) return false;
    // Preserves original logic of checking config.ADMIN_NUMBERS
    const adminNumbers = (Array.isArray(config.ADMIN_NUMBERS) ? config.ADMIN_NUMBERS : (config.ADMIN_NUMBERS || '').split(','))
                          .map(num => String(num).trim().replace(/\D/g, ''));
    return adminNumbers.includes(userId.split('@')[0]);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

function isOwner(userId, config, helpers) {
    try {
        if (!userId || typeof userId !== 'string' || !config) return false;
        // Use V3 PermissionHelpers if available
        if (helpers && helpers.PermissionHelpers) {
            return helpers.PermissionHelpers.isOwner(userId, config.OWNER_NUMBER + '@s.whatsapp.net');
        }
        // Fallback to original logic
        const ownerNumber = config.OWNER_NUMBER || '';
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

// ✅ NEW FUNCTION: Add this after cleanupExpiredEffects function
async function checkAccountFrozen(userId) {
  try {
    const userData = await getUserData(userId);
    if (userData.frozen) {
      return {
        isFrozen: true,
        message: '🥶 *Your account is frozen and under review.*\n\n❌ *All transactions are blocked until further notice.*\n\n📞 *Contact an administrator for more details.*'
      };
    }
    return { isFrozen: false };
  } catch (error) {
    console.error('Error checking freeze status:', error);
    return { isFrozen: false };
  }
}

// ❌ REMOVED: The old `export default async function economyHandler(...)` is GONE.
// It has been replaced by the `run` function in the `export default` object at the top.

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

// Balance Command 
async function handleBalance(context, args) {
  const { reply, senderId, m, sock, from, helpers } = context;

  try {
    const targetUser = getTargetUser(m, args.join(' ')) || senderId;

    await initUser(targetUser);
    const userData = await getUserData(targetUser);

    const totalWealth = userData.balance + userData.bank;
    const isOwnBalance = targetUser === senderId;
    const userNumber = targetUser.split('@')[0];

    let balanceText = `💰 *${isOwnBalance ? 'YOUR BALANCE' : `@${userNumber}'S BALANCE`}*\n\n`;

    // ✅ Show freeze status prominently
    if (userData.frozen) {
      balanceText += `🥶 *ACCOUNT STATUS: FROZEN* ❄️\n`;
      if (isOwnBalance) {
        balanceText += `⚠️ *All transactions are blocked*\n`;
      }
      balanceText += '\n';
    }

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
            // Use TimeHelpers from the V3 context
            const timeString = helpers.TimeHelpers.formatDuration(remainingMs);
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
  const { reply, senderId, config } = context;

  try {
    if (!ecoSettings.investmentsEnabled) {
      await reply('🚫 *Investments are currently disabled*');
      return;
    }

    if (!args || args.length === 0) {
      await reply(`📈 *Stock Market Commands:*\n• *${config.PREFIX}stocks list* - View available stocks\n• *${config.PREFIX}stocks buy [stock] [amount]* - Buy stocks\n• *${config.PREFIX}stocks sell [stock] [amount]* - Sell stocks\n• *${config.PREFIX}stocks portfolio* - View your stocks`);
      return;
    }

    const action = args[0].toLowerCase();

    // Generate mock stock data
    const stocks = {
      AAPL: { name: 'Apple Inc.', price: 850 + (Math.random() - 0.5) * 30 },
      GOOGL: { name: 'Alphabet Inc.', price: 800 + (Math.random() - 0.5) * 400 },
      TSLA: { name: 'Tesla Inc.', price: 690 + (Math.random() - 0.5) * 200 },
      COKE: { name: 'Coca-Cola', price: 190 + (Math.random() - 0.5) * 200 },
      META: { name: 'Meta Platforms', price: 760 + (Math.random() - 0.5) * 200 },
      NFLX: { name: 'Netflix', price: 690 + (Math.random() - 0.5) * 200 },
      AMZN: { name: 'Amazon.com Inc.', price: 430 + (Math.random() - 0.5) * 500 },
      MSFT: { name: 'Microsoft Corp.', price: 900 + (Math.random() - 0.5) * 50 }
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

        // 🛡️ SECURITY CHECK
        if (isNaN(buyAmount)) {
            await setFreezeStatus(senderId, true, 'System - Invalid Stock Input');
            await reply(`🚨 *SECURITY ALERT* 🚨\n\n❌ *Invalid amount detected.*\n❄️ *Your account has been automatically frozen for security.*`);
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

        // 🛡️ PORTFOLIO LIMIT CHECK - Use subscription tier limits
        const subscriptionStocks = userData.subscription || { tier: 'free' };
        const tierConfigStocks = SUBSCRIPTION_TIERS[subscriptionStocks.tier] || SUBSCRIPTION_TIERS.free;
        const maxStockLimit = tierConfigStocks.limits.maxStocksPerStock;

        const currentShares = userData.investments?.stocks?.[buySymbol] || 0;
        const newShares = currentShares + buyAmount;
        if (newShares > maxStockLimit) {
          const available = maxStockLimit - currentShares;
          let message = `⚠️ *Portfolio Limit Reached!*\n\n📊 *${buySymbol} Limit:* ${maxStockLimit} shares (${tierConfigStocks.name})\n📦 *You currently own:* ${currentShares}\n✅ *You can buy:* ${available} more shares\n\n💡 *Tip:* Upgrade to a Premium subscription for higher limits!`;

          if (isInGracePeriod()) {
            const daysLeft = getDaysRemainingInGracePeriod();
            message += `\n\n⏰ *Grace Period:* You have ${daysLeft} days to adjust your portfolio.`;
          }

          await reply(message);
          return;
        }

        await removeMoney(senderId, totalCost, 'Stock purchase');
        await updateUserData(senderId, {
          [`investments.stocks.${buySymbol}`]: newShares
        });

        await reply(`📈 *Stock Purchase Successful!*\n\n🏢 *Company:* ${stocks[buySymbol].name}\n📊 *Symbol:* ${buySymbol}\n💰 *Price per share:* ${ecoSettings.currency}${buyPrice.toFixed(2)}\n📦 *Shares bought:* ${buyAmount}\n💸 *Total cost:* ${ecoSettings.currency}${totalCost.toLocaleString()}\n\n📈 *Portfolio:* ${newShares}/${maxStockLimit} ${buySymbol}`);
        break;

      case 'sell':
        if (args.length < 3) {
          await reply('⚠️ *Usage: stocks sell [symbol] [amount]*');
          return;
        }

        const sellSymbol = args[1].toUpperCase();
        const sellAmount = parseInt(args[2]);

        // 🛡️ SECURITY CHECK
        if (isNaN(sellAmount)) {
             await setFreezeStatus(senderId, true, 'System - Invalid Stock Input');
             await reply(`🚨 *SECURITY ALERT* 🚨\n\n❌ *Invalid amount detected.*\n❄️ *Your account has been automatically frozen for security.*`);
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

        const updatedStockUserData = await getUserData(senderId);
        await reply(`📈 *Stock Sale Successful!*\n\n🏢 *Company:* ${stocks[sellSymbol].name}\n📊 *Symbol:* ${sellSymbol}\n💰 *Price per share:* ${ecoSettings.currency}${sellPrice.toFixed(2)}\n📦 *Shares sold:* ${sellAmount}\n💸 *Total earned:* ${ecoSettings.currency}${totalEarned.toLocaleString()}\n\n💵 *Updated wallet:* ${ecoSettings.currency}${updatedStockUserData.balance.toLocaleString()}`);
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
  const { reply, senderId, config } = context;

  try {
    if (!ecoSettings.shopEnabled) {
      await reply('🚫 *Shop is currently closed*');
      return;
    }

    if (!args || args.length === 0) {
      // Show shop categories
      await reply(`🛍️ *ECONOMY SHOP* 🛍️\n\n📋 *Categories:*\n• *${config.PREFIX}shop consumables* - Temporary boosts\n• *${config.PREFIX}shop upgrades* - Permanent improvements\n• *${config.PREFIX}shop tools* - Equipment with uses\n• *${config.PREFIX}shop cosmetics* - Visual items\n\n💡 *Buy with:* ${config.PREFIX}shop buy [item_id]`);
      return;
    }

    const action = args[0].toLowerCase();

      if (action === 'buy') {
        if (args.length < 2) {
          await reply('⚠️ *Usage: shop buy [item_id]*');
          return;
        }

        const itemId = getItemId(args[1]);
        const item = { ...SHOP_ITEMS[itemId], ...SUPREME_TITAN_SHOP_ITEMS[itemId] }[itemId];

        if (!item) {
          await reply('❌ *Item not found*');
          return;
        }

        // ✨ NEW: Check tier requirement
        if (item.requiredTier) {
          const userData = await getUserData(senderId);
          const userTier = userData.subscription?.tier || 'free';

          // Define tier hierarchy
          const tierHierarchy = ['free', 'plus', 'pro', 'smart', 'ultra', 'supreme', 'titan'];
          const userTierLevel = tierHierarchy.indexOf(userTier);
          const requiredTierLevel = tierHierarchy.indexOf(item.requiredTier);

          if (userTierLevel < requiredTierLevel) {
            const requiredTierConfig = SUBSCRIPTION_TIERS[item.requiredTier];
            await reply(`🔒 *Tier Locked Item*\n\n${item.emoji} *${item.name}*\n\n⚠️ *Requires:* ${requiredTierConfig.name} subscription or higher\n💡 *Your tier:* ${SUBSCRIPTION_TIERS[userTier].name}\n\nUpgrade with: ${config.PREFIX}subscription upgrade ${item.requiredTier}`);
            return;
          }
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

        await reply(`✅ *Purchase Successful!*\n\n${item.emoji} *${item.name}*\n💰 *Price:* ${ecoSettings.currency}${item.price.toLocaleString()}\n📝 *Description:* ${item.description}\n\n💡 *Use with:* ${config.PREFIX}use ${itemId}`);
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

      categoryText += `💡 *Buy with:* ${config.PREFIX}shop buy [item_id]`;
      await reply(categoryText);
    }
  } catch (error) {
    await reply('❌ *Error processing shop command. Please try again.*');
    console.error('Shop error:', error);
  }
}

// Use Item Command
async function handleUse(context, args) {
  const { reply, senderId, config } = context;

  try {
    if (!args || args.length === 0) {
      await reply(`💊 *Use Item Command:*\n${config.PREFIX}use [item_id]\n\n💡 *Check your inventory to see available items*`);
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
  const { reply, senderId, config } = context;

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
      invText += `\n   🔧 Use: ${config.PREFIX}use ${item.id}\n\n`;
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
    // Check if account is frozen
    const freezeCheck = await checkAccountFrozen(senderId);
    if (freezeCheck.isFrozen) {
      await reply(freezeCheck.message);
      return;
    }

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
  try {
    const { reply, senderId } = context;
    // Check if account is frozen
    const freezeCheck = await checkAccountFrozen(senderId);
    if (freezeCheck.isFrozen) {
      await reply(freezeCheck.message);
      return;
    }

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
    await context.reply('❌ *Error claiming daily reward. Please try again.*');
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
      { name: 'Worker', min: 1000 },
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
  const { reply, senderId, config } = context;

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
        await reply(`🏆 *YOUR ACHIEVEMENTS* 🏆\n\n📭 *No achievements yet!*\n\n💡 Use *${config.PREFIX}achievements all* to see available achievements`);
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

      userAchText += `💡 Use *${config.PREFIX}achievements all* to see all available achievements`;
      await reply(userAchText);
    }
  } catch (error) {
    await reply('❌ *Error loading achievements. Please try again.*');
    console.error('Achievements error:', error);
  }
}

// ✅ REFACTORED: Leaderboard now uses getCollection for its aggregation pipeline.
async function handleLeaderboard(context, args) {
  const { reply, sock, from, config } = context;

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
        await reply(`📊 *Leaderboard Categories:*\n• *wealth* - Total money\n• *work* - Jobs completed\n• *streak* - Best daily streak\n• *achievements* - Achievement count\n\n💡 Usage: ${config.PREFIX}leaderboard [category]`);
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

            // ✅ FIX: Use the string version created in aggregation
            const userName = user.userIdString.split('@')[0];

            // ✨ NEW: Show tier badges
            let badge = '';
            if (user.activeEffects?.royalCrown || user.subscription?.tier === 'titan') {
              badge = '🔱 ';
            } else if (user.subscription?.tier === 'supreme') {
              badge = '🌟 ';
            } else if (user.activeEffects?.crown) {
              badge = '👑 ';
            }

            leaderboard += `${rank} ${badge}@${userName}\n`;

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

    leaderboard += `💡 Try: ${config.PREFIX}leaderboard [category]`;

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

async function setFreezeStatus(userId, freeze, adminId = null) {
  try {
    await initUser(userId);

    const updates = {
      frozen: freeze,
      updatedAt: new Date()
    };

    // Add freeze/unfreeze metadata
    if (freeze) {
      updates.freezeInfo = {
        frozenAt: new Date(),
        frozenBy: adminId,
        reason: 'Account frozen by administrator'
      };
    } else {
// ===== UNFREEZING AN ACCOUNT =====
      // FIXED: Use direct database access to properly unset freezeInfo
      const usersCollection = await getCollection(COLLECTIONS.USERS);

      await usersCollection.updateOne(
        { userId },
        {
          $set: {
            frozen: false,
            unfreezeInfo: {
              unfrozenAt: new Date(),
              unfrozenBy: adminId
            },
            updatedAt: new Date()
          },
          $unset: {
            freezeInfo: "" // Remove the freezeInfo field
          }
        }
      );
    }

    // Log the freeze/unfreeze action
    const transactionsCollection = await getCollection(COLLECTIONS.TRANSACTIONS);
    await transactionsCollection.insertOne({
      userId,
      type: freeze ? 'account_frozen' : 'account_unfrozen',
      amount: 0,
      reason: `Account ${freeze ? 'frozen' : 'unfrozen'} by admin`,
      adminId: adminId,
      timestamp: new Date()
    });

    return { success: true };
  } catch (error) {
    console.error(`Error setting freeze status for ${userId}:`, error);
    return { success: false, message: 'Could not update account status' };
  }
}

async function handleAdminSettings(context, args) {
  // ✅ V3 REFACTORED: Get config and helpers from context
  const { reply, senderId, config, helpers } = context;

  try {
    // ✅ V3 REFACTORED: Use new permission functions with config/helpers
    if (!isAdmin(senderId, config) && !isOwner(senderId, config, helpers)) {
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
      settingsText += `• *${config.PREFIX}eco admin set [setting] [value]*\n`;
      settingsText += `• *${config.PREFIX}eco admin toggle [feature]*\n`;
      settingsText += `• *${config.PREFIX}eco admin give @user [amount]*\n`;
      settingsText += `• *${config.PREFIX}eco admin take @user [amount]*\n`;
      settingsText += `• *${config.PREFIX}eco admin reset @user*\n`;
      settingsText += `• *${config.PREFIX}eco admin freeze @user*\n`;
      settingsText += `• *${config.PREFIX}eco admin unfreeze @user*\n`;
      settingsText += `• *${config.PREFIX}eco admin event [type]*`;

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

// 7. ENHANCED ADMIN FREEZE/UNFREEZE COMMANDS
async function handleAdminFreeze(context, args) {
  const { reply, senderId, sock, from, m, config, helpers } = context;

  try {
    if (!isAdmin(senderId, config) && !isOwner(senderId, config, helpers)) {
      await reply('🚫 *Only administrators can freeze accounts*');
      return;
    }

    if (args.length < 1) {
      await reply('⚠️ *Usage: freeze @user [reason]*');
      return;
    }

    const targetUser = getTargetUser(m, args.join(' '));
    if (!targetUser) {
      await reply('⚠️ *Please mention or reply to a user to freeze their account*');
      return;
    }

    // Prevent freezing other admins (unless owner)
    if (isAdmin(targetUser, config) && !isOwner(senderId, config, helpers)) {
      await reply('🚫 *You cannot freeze another administrator\'s account*');
      return;
    }

    const result = await setFreezeStatus(targetUser, true, senderId);

    if (result.success) {
      await sock.sendMessage(from, {
        text: `🥶 *Account Frozen Successfully*\n\n👤 *User:* @${targetUser.split('@')[0]}\n🔒 *Status:* Account Frozen\n👮 *Frozen by:* @${senderId.split('@')[0]}\n⏰ *Time:* ${new Date().toLocaleString()}\n\n⚠️ *The user's account is now frozen and all transactions are blocked.*`,
        mentions: [targetUser, senderId]
      }, { quoted: m });
    } else {
      await reply(`❌ *Error freezing account: ${result.message}*`);
    }
  } catch (error) {
    await reply('❌ *Error processing freeze command*');
    console.error('Freeze error:', error);
  }
}

async function handleAdminUnfreeze(context, args) {
  const { reply, senderId, sock, from, m, config, helpers } = context;

  try {
    if (!isAdmin(senderId, config) && !isOwner(senderId, config, helpers)) {
      await reply('🚫 *Only administrators can unfreeze accounts*');
      return;
    }

    if (args.length < 1) {
      await reply('⚠️ *Usage: unfreeze @user*');
      return;
    }

    const targetUser = getTargetUser(m, args.join(' '));
    if (!targetUser) {
      await reply('⚠️ *Please mention or reply to a user to unfreeze their account*');
      return;
    }

    const result = await setFreezeStatus(targetUser, false, senderId);

    if (result.success) {
      await sock.sendMessage(from, {
        text: `✅ *Account Unfrozen Successfully*\n\n👤 *User:* @${targetUser.split('@')[0]}\n🔓 *Status:* Account Active\n👮 *Unfrozen by:* @${senderId.split('@')[0]}\n⏰ *Time:* ${new Date().toLocaleString()}\n\n🎉 *The user can now access all economy features again.*`,
        mentions: [targetUser, senderId]
      }, { quoted: m });
    } else {
      await reply(`❌ *Error unfreezing account: ${result.message}*`);
    }
  } catch (error) {
    await reply('❌ *Error processing unfreeze command*');
    console.error('Unfreeze error:', error);
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

// Helper function to get wallet/bank limits based on subscription tier
function getWalletBankLimits(userData) {
  const tier = userData.subscription?.tier || 'free';
  const tierConfig = SUBSCRIPTION_TIERS[tier];
  return {
    walletLimit: tierConfig.limits.walletLimit,
    bankLimit: tierConfig.limits.bankLimit
  };
}

// ===== AUTO-LIQUIDATION SYSTEM =====
// Enforce portfolio limits by liquidating excess holdings after grace period
async function enforcePortfolioLimits(userData, sock = null) {
  const userId = userData.id || userData._id;
  const tier = userData.subscription?.tier || 'free';
  const tierConfig = SUBSCRIPTION_TIERS[tier];
  const liquidationReport = {
    success: true,
    liquidated: false,
    items: [],
    totalRefund: 0,
    errors: []
  };

  try {
    let updates = {};

    // ========== CHECK WALLET LIMIT ==========
    const walletLimit = tierConfig.limits.walletLimit;
    if (userData.balance > walletLimit) {
      const excess = userData.balance - walletLimit;
      const refund = Math.floor(excess * (GRACE_PERIOD_CONFIG.AUTO_LIQUIDATION_REFUND_PERCENT / 100));

      liquidationReport.liquidated = true;
      liquidationReport.items.push({
        type: 'wallet',
        excess: excess,
        refund: refund,
        description: `Wallet excess (had ₦${excess.toLocaleString()}, limit ₦${walletLimit.toLocaleString()})`
      });
      liquidationReport.totalRefund += refund;
      updates.balance = walletLimit;
      updates['bank'] = (userData.bank || 0) + refund;  // Add refund to bank
    }

    // ========== CHECK BANK LIMIT ==========
    const bankLimit = tierConfig.limits.bankLimit;
    const currentBank = (updates.bank !== undefined) ? updates.bank : userData.bank || 0;
    if (currentBank > bankLimit) {
      const excess = currentBank - bankLimit;
      const refund = Math.floor(excess * (GRACE_PERIOD_CONFIG.AUTO_LIQUIDATION_REFUND_PERCENT / 100));

      liquidationReport.liquidated = true;
      liquidationReport.items.push({
        type: 'bank',
        excess: excess,
        refund: refund,
        description: `Bank excess (had ₦${excess.toLocaleString()}, limit ₦${bankLimit.toLocaleString()})`
      });
      liquidationReport.totalRefund += refund;
      updates.bank = bankLimit;
      updates.balance = (updates.balance !== undefined) ? updates.balance : userData.balance || 0;
      updates.balance += refund;  // Add refund to wallet
    }

    // ========== CHECK CRYPTO HOLDINGS ==========
    const maxCryptoPerToken = tierConfig.limits.maxCryptoPerToken;
    if (userData.investments?.crypto) {
      for (const [symbol, amount] of Object.entries(userData.investments.crypto)) {
        if (amount > maxCryptoPerToken) {
          const excess = amount - maxCryptoPerToken;
          const price = cryptoData[symbol]?.price || 0;
          const refund = Math.floor(excess * price * (GRACE_PERIOD_CONFIG.AUTO_LIQUIDATION_REFUND_PERCENT / 100));

          liquidationReport.liquidated = true;
          liquidationReport.items.push({
            type: 'crypto',
            symbol: symbol,
            excess: excess,
            pricePerCoin: price,
            refund: refund,
            description: `${symbol} crypto excess (had ${excess.toLocaleString()}, limit ${maxCryptoPerToken})`
          });
          liquidationReport.totalRefund += refund;
          updates[`investments.crypto.${symbol}`] = maxCryptoPerToken;
          updates.balance = (updates.balance !== undefined) ? updates.balance : userData.balance || 0;
          updates.balance += refund;  // Add refund to wallet
        }
      }
    }

    // ========== CHECK STOCK HOLDINGS ==========
    const maxStocksPerStock = tierConfig.limits.maxStocksPerStock;
    if (userData.investments?.stocks) {
      for (const [symbol, shares] of Object.entries(userData.investments.stocks)) {
        if (shares > maxStocksPerStock) {
          const excess = shares - maxStocksPerStock;
          const price = stocks[symbol]?.price || 0;
          const refund = Math.floor(excess * price * (GRACE_PERIOD_CONFIG.AUTO_LIQUIDATION_REFUND_PERCENT / 100));

          liquidationReport.liquidated = true;
          liquidationReport.items.push({
            type: 'stock',
            symbol: symbol,
            excess: excess,
            pricePerShare: price,
            refund: refund,
            description: `${symbol} stock excess (had ${excess.toLocaleString()}, limit ${maxStocksPerStock})`
          });
          liquidationReport.totalRefund += refund;
          updates[`investments.stocks.${symbol}`] = maxStocksPerStock;
          updates.balance = (updates.balance !== undefined) ? updates.balance : userData.balance || 0;
          updates.balance += refund;  // Add refund to wallet
        }
      }
    }

    // ========== APPLY UPDATES IF ANY LIQUIDATIONS OCCURRED ==========
    if (liquidationReport.liquidated && Object.keys(updates).length > 0) {
      await updateUserData(userId, updates);

      // Send liquidation notification if socket available
      if (sock && liquidationReport.items.length > 0) {
        await sendLiquidationNotification(userId, liquidationReport, sock);
      }
    }

    return liquidationReport;
  } catch (error) {
    console.error('Error enforcing portfolio limits:', error);
    liquidationReport.success = false;
    liquidationReport.errors.push(error.message);
    return liquidationReport;
  }
}

// Send notification when holdings are auto-liquidated
async function sendLiquidationNotification(userId, liquidationReport, sock) {
  try {
    if (!sock || !liquidationReport.liquidated) return;

    const userData = await getUserData(userId);
    const tier = userData.subscription?.tier || 'free';
    const tierConfig = SUBSCRIPTION_TIERS[tier];

    let itemsList = liquidationReport.items.map(item => {
      return `• ${item.description}\n  💰 *Refunded:* ₦${item.refund.toLocaleString()} (${GRACE_PERIOD_CONFIG.AUTO_LIQUIDATION_REFUND_PERCENT}%)`;
    }).join('\n');

    const message = `⚠️ *PORTFOLIO LIMIT ENFORCED*\n\nYour holdings exceeded the new limits for your subscription tier.\n\n*Items Liquidated:*\n${itemsList}\n\n💰 *Total Refund:* ₦${liquidationReport.totalRefund.toLocaleString()}\n\n🎁 Refunds have been added to your wallet.\n\n💎 *Your Tier:* ${tierConfig.name}\n📊 *Wallet Limit:* ₦${tierConfig.limits.walletLimit.toLocaleString()}\n🏦 *Bank Limit:* ₦${tierConfig.limits.bankLimit.toLocaleString()}\n\n💡 *Tip:* Upgrade your subscription to increase limits!`;

    await sock.sendMessage(userId, { text: message });
  } catch (error) {
    console.error('Error sending liquidation notification:', error);
  }
}

// Enhanced handleSend with transaction limits and fees
async function handleSend(context, args) {
  const { reply, senderId, sock, m, from, config } = context;

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
      await reply(`⚠️ *Please provide a valid amount to send.*\n\n*Example:* ${config.PREFIX}send 1000`);
      return;
    }

    if (targetUser === senderId) {
      await reply('🧠 *You cannot send money to yourself!*');
      return;
    }

    const fee = Math.max(Math.floor(amount * 0.01), 5);
    const totalCost = amount + fee;

    const senderData = await getUserData(senderId);
    if (senderData.frozen) {
      await reply('🚫 *Your account is frozen. You cannot send money.*');
      return;
    }
    if (senderData.balance < totalCost) {
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${ecoSettings.currency}${senderData.balance.toLocaleString()}\n💸 *Required:* ${ecoSettings.currency}${totalCost.toLocaleString()} (includes ${ecoSettings.currency}${fee} fee)`);
      return;
    }

    await initUser(targetUser);

    // Check if recipient can receive the money (wallet limit)
    const targetData = await getUserData(targetUser);
    const targetLimits = getWalletBankLimits(targetData);
    if (targetData.balance + amount > targetLimits.walletLimit) {
      const availableSpace = targetLimits.walletLimit - targetData.balance;
      await reply(`🚫 *Recipient's wallet is full*\n\nRecipient can only receive ${ecoSettings.currency}${availableSpace.toLocaleString()} more\n💎 *Recipient tier:* ${SUBSCRIPTION_TIERS[targetData.subscription?.tier || 'free'].name}`);
      return;
    }

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
  const { reply, senderId, config } = context;

  try {
    if (!args || args.length === 0) {
      await reply(`🏦 *Bank Deposit*\n\n⚠️ *Usage:* ${config.PREFIX}deposit [amount]\n💡 *Example:* ${config.PREFIX}deposit 1000\n\n📈 *Bank pays 0.1% daily interest on deposits!*`);
      return;
    }

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await reply('⚠️ *Please provide a valid amount to deposit*');
      return;
    }

    const userData = await getUserData(senderId);
    if (userData.frozen) {
      await reply('🚫 *Your account is frozen. You cannot deposit money.*');
      return;
    }
    if (userData.balance < amount) {
      await reply('🚫 *Insufficient wallet balance*');
      return;
    }

    const limits = getWalletBankLimits(userData);

    // Check if wallet is already at or exceeding limit
    if (userData.balance > limits.walletLimit) {
      let message = `🚫 *Wallet limit exceeded*\n\nYour wallet balance (${ecoSettings.currency}${userData.balance.toLocaleString()}) exceeds your tier limit (${ecoSettings.currency}${limits.walletLimit.toLocaleString()})\n💎 *Your tier:* ${SUBSCRIPTION_TIERS[userData.subscription?.tier || 'free'].name}\n\nYou must deposit funds to bring your wallet within the limit.`;

      if (isInGracePeriod()) {
        const daysLeft = getDaysRemainingInGracePeriod();
        message += `\n\n⏰ *Grace Period Warning:* You have ${daysLeft} days to reduce your wallet balance.\nAfter that, excess will be liquidated with ${GRACE_PERIOD_CONFIG.AUTO_LIQUIDATION_REFUND_PERCENT}% refund.`;
      }

      await reply(message);
      return;
    }

    if (userData.bank + amount > limits.bankLimit) {
      let message = `🚫 *Bank deposit limit exceeded*\n\nMax bank balance: ${ecoSettings.currency}${limits.bankLimit.toLocaleString()}\n💎 *Your tier:* ${SUBSCRIPTION_TIERS[userData.subscription?.tier || 'free'].name}`;

      if (isInGracePeriod()) {
        const daysLeft = getDaysRemainingInGracePeriod();
        message += `\n\n⏰ *Grace Period Warning:* You have ${daysLeft} days to reduce your bank balance.\nAfter that, excess will be liquidated with ${GRACE_PERIOD_CONFIG.AUTO_LIQUIDATION_REFUND_PERCENT}% refund.`;
      }

      await reply(message);
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
  const { reply, senderId, config } = context;

  try {
    if (!args || args.length === 0) {
      await reply(`🏦 *Bank Withdrawal*\n\n⚠️ *Usage:* ${config.PREFIX}withdraw [amount]\n💡 *Example:* ${config.PREFIX}withdraw 1000`);
      return;
    }

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await reply('⚠️ *Please provide a valid amount to withdraw*');
      return;
    }

    const userData = await getUserData(senderId);
    if (userData.frozen) {
      await reply('🚫 *Your account is frozen. You cannot withdraw money.*');
      return;
    }
    if (userData.bank < amount) {
      await reply('🚫 *Insufficient bank balance*');
      return;
    }

    const limits = getWalletBankLimits(userData);
    if (userData.balance + amount > limits.walletLimit) {
      let message = `🚫 *Wallet limit exceeded*\n\nMax wallet balance: ${ecoSettings.currency}${limits.walletLimit.toLocaleString()}\n💎 *Your tier:* ${SUBSCRIPTION_TIERS[userData.subscription?.tier || 'free'].name}`;

      if (isInGracePeriod()) {
        const daysLeft = getDaysRemainingInGracePeriod();
        message += `\n\n⏰ *Grace Period Warning:* You have ${daysLeft} days to reduce your wallet.\nAfter that, excess will be liquidated with ${GRACE_PERIOD_CONFIG.AUTO_LIQUIDATION_REFUND_PERCENT}% refund.`;
      }

      await reply(message);
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
  try {
    const { reply, senderId, sock, m, from, helpers } = context;
    // Check if robber's account is frozen
    const freezeCheck = await checkAccountFrozen(senderId);
    if (freezeCheck.isFrozen) {
      await reply(freezeCheck.message);
      return;
    }

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
      const timeString = helpers.TimeHelpers.formatDuration(remainingMs);

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
    await context.reply('❌ *Error processing robbery. Please try again.*');
    console.error('Rob error:', error);
  }
}


// Placeholder functions for remaining features
async function handleInvest(context, args) {
  await context.reply('🚧 *Investment overview coming soon!* 🚧');
}

async function handleCrypto(context, args) {
  const { reply, senderId, config } = context;

  try {
    if (!ecoSettings.investmentsEnabled) {
      await reply('🚫 *Cryptocurrency trading is currently disabled*');
      return;
    }

    if (!args || args.length === 0) {
      await reply(`₿ *Cryptocurrency Commands:*\n• *${config.PREFIX}crypto list* - View available coins\n• *${config.PREFIX}crypto buy [coin] [amount]* - Buy crypto\n• *${config.PREFIX}crypto sell [coin] [amount]* - Sell crypto\n• *${config.PREFIX}crypto portfolio* - View your crypto`);
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

        // 🛡️ SECURITY CHECK
        if (isNaN(buyAmount)) {
            await setFreezeStatus(senderId, true, 'System - Invalid Crypto Input');
            await reply(`🚨 *SECURITY ALERT* 🚨\n\n❌ *Invalid amount detected.*\n❄️ *Your account has been automatically frozen for security.*`);
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

        // 🛡️ PORTFOLIO LIMIT CHECK - Use subscription tier limits
        const subscription = userData.subscription || { tier: 'free' };
        const tierConfig = SUBSCRIPTION_TIERS[subscription.tier] || SUBSCRIPTION_TIERS.free;
        const maxCryptoLimit = tierConfig.limits.maxCryptoPerToken;

        const currentHolding = userData.investments?.crypto?.[buySymbol] || 0;
        const newHolding = currentHolding + buyAmount;
        if (newHolding > maxCryptoLimit) {
          const available = maxCryptoLimit - currentHolding;
          let message = `⚠️ *Portfolio Limit Reached!*\n\n📊 *${buySymbol} Limit:* ${maxCryptoLimit} coins (${tierConfig.name})\n🪙 *You currently own:* ${currentHolding}\n✅ *You can buy:* ${available} more coins\n\n💡 *Tip:* Upgrade to a Premium subscription for higher limits!`;

          if (isInGracePeriod()) {
            const daysLeft = getDaysRemainingInGracePeriod();
            message += `\n\n⏰ *Grace Period:* You have ${daysLeft} days to adjust your portfolio.`;
          }

          await reply(message);
          return;
        }

        await removeMoney(senderId, totalCost, 'Crypto purchase');
        await updateUserData(senderId, {
          [`investments.crypto.${buySymbol}`]: newHolding
        });

        // ✅ NEW: Track buy volume for supply/demand mechanics
        cryptoData[buySymbol].buyVolume = (cryptoData[buySymbol].buyVolume || 0) + buyAmount;

        await reply(`₿ *Crypto Purchase Successful!*\n\n🪙 *Coin:* ${cryptoData[buySymbol].name}\n📊 *Symbol:* ${buySymbol}\n💰 *Price per coin:* ${ecoSettings.currency}${buyPrice.toLocaleString()}\n🪙 *Amount bought:* ${buyAmount}\n💸 *Total cost:* ${ecoSettings.currency}${totalCost.toLocaleString()}\n\n📈 *Portfolio:* ${newHolding}/${maxCryptoLimit} ${buySymbol}`);
        break;

      case 'sell':
        if (args.length < 3) {
          await reply('⚠️ *Usage: crypto sell [symbol] [amount]*');
          return;
        }

        const sellSymbol = args[1].toUpperCase();
        const sellAmount = parseFloat(args[2]);

        // 🛡️ SECURITY CHECK
        if (isNaN(sellAmount)) {
             await setFreezeStatus(senderId, true, 'System - Invalid Crypto Input');
             await reply(`🚨 *SECURITY ALERT* 🚨\n\n❌ *Invalid amount detected.*\n❄️ *Your account has been automatically frozen for security.*`);
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

        // ✅ NEW: Track sell volume for supply/demand mechanics
        cryptoData[sellSymbol].sellVolume = (cryptoData[sellSymbol].sellVolume || 0) + sellAmount;

        const updatedUserData = await getUserData(senderId);
        await reply(`₿ *Crypto Sale Successful!*\n\n🪙 *Coin:* ${cryptoData[sellSymbol].name}\n📊 *Symbol:* ${sellSymbol}\n💰 *Price per coin:* ${ecoSettings.currency}${sellPrice.toLocaleString()}\n🪙 *Amount sold:* ${sellAmount}\n💸 *Total earned:* ${ecoSettings.currency}${totalEarned.toLocaleString()}\n\n💵 *Updated wallet:* ${ecoSettings.currency}${updatedUserData.balance.toLocaleString()}`);
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
  const { reply, senderId, config, helpers } = context;

  try {
    if (!ecoSettings.investmentsEnabled) {
      await reply('🚫 *Business investments are currently disabled*');
      return;
    }

    if (!args || args.length === 0) {
      await reply(`🏢 *Business Commands:*\n• *${config.PREFIX}business list* - View available businesses\n• *${config.PREFIX}business buy [business]* - Buy a business\n• *${config.PREFIX}business portfolio* - View your businesses\n• *${config.PREFIX}business collect* - Collect daily profits`);
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

        await reply(`🏢 *Business Purchase Successful!*\n\n🏪 *Business:* ${business.name}\n💰 *Price:* ${ecoSettings.currency}${business.price.toLocaleString()}\n📈 *Daily ROI:* ${(business.roi * 100).toFixed(1)}%\n\n💡 *Collect daily profits with:* ${config.PREFIX}business collect`);
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

// ✨ NEW: Check if user has instant payout feature (Titan tier)
const subscription = collectData.subscription || { tier: 'free' };
const tierConfig = SUBSCRIPTION_TIERS[subscription.tier];
const hasInstantPayout = tierConfig.features.instantBusinessPayouts;

let totalProfit = 0;
const now = new Date();
const updatedBusinesses = [];
const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

userBusinesses.forEach(business => {
  const lastCollected = new Date(business.lastCollected);
  const timeSince = now.getTime() - lastCollected.getTime();

  if (hasInstantPayout || timeSince >= twentyFourHoursInMs) {
    const daysToCollect = hasInstantPayout ? Math.max(1, Math.floor(timeSince / twentyFourHoursInMs)) : Math.floor(timeSince / twentyFourHoursInMs);
    const currentROI = businessData[business.id]?.roi || business.roi;
    const profit = business.price * currentROI * daysToCollect;
    totalProfit += profit;

    business.lastCollected = new Date(lastCollected.getTime() + daysToCollect * twentyFourHoursInMs);
  }

  updatedBusinesses.push(business);
});

if (totalProfit === 0 && !hasInstantPayout) {
  let soonestNextCollection = Infinity;
  userBusinesses.forEach(business => {
    const nextCollectionTime = new Date(business.lastCollected).getTime() + twentyFourHoursInMs;
    if (nextCollectionTime < soonestNextCollection) {
      soonestNextCollection = nextCollectionTime;
    }
  });

  const timeString = helpers.TimeHelpers.formatFutureTime(soonestNextCollection);
  await reply(`⏰ *No profits to collect yet*\n\nPlease come back *${timeString}*`);
  return;
}

await addMoney(senderId, totalProfit, 'Business profits', false);
await updateUserData(senderId, {
  'investments.businesses': updatedBusinesses
});

let collectMsg = `🏢 *Business Profits Collected!* 🏢\n\n💰 *Total Profit:* ${ecoSettings.currency}${Math.floor(totalProfit).toLocaleString()}\n🏪 *From:* ${userBusinesses.length} businesses\n`;

if (hasInstantPayout) {
  collectMsg += `\n🔱 *Titan Perk:* Instant collection anytime!`;
} else {
  collectMsg += `\n💡 *Your next profits will be available in 24 hours!*`;
}

await reply(collectMsg);
break;

      default:
        await reply('❓ *Unknown business command*');
    }
  } catch (error) {
    await reply('❌ *Error processing business command. Please try again.*');
    console.error('Business error:', error);
  }
}

// ===== SUBSCRIPTION MANAGEMENT FUNCTIONS =====

async function getUserSubscription(userId) {
  try {
    const userData = await getUserData(userId);
    return userData.subscription || { tier: 'free', active: false };
  } catch (error) {
    console.error('Error getting subscription:', error);
    return { tier: 'free', active: false };
  }
}

async function getSubscriptionTierConfig(tier = 'free') {
  return SUBSCRIPTION_TIERS[tier] || SUBSCRIPTION_TIERS.free;
}

async function upgradeSubscription(userId, newTier) {
  try {
    if (!SUBSCRIPTION_TIERS[newTier]) {
      throw new Error('Invalid subscription tier');
    }

    const userData = await getUserData(userId);
    const tierConfig = SUBSCRIPTION_TIERS[newTier];

    // Charge the first week immediately (handled by caller)
    // Set up subscription data
    const now = new Date();
    const renewalDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    await updateUserData(userId, {
      'subscription.tier': newTier,
      'subscription.active': newTier !== 'free',
      'subscription.subscribedAt': now,
      'subscription.renewalDate': renewalDate,
      'subscription.lastChargeDate': now,
      'subscription.autoRenew': true
    });

    return true;
  } catch (error) {
    console.error('Error upgrading subscription:', error);
    throw error;
  }
}

async function cancelSubscription(userId) {
  try {
    await updateUserData(userId, {
      'subscription.tier': 'free',
      'subscription.active': false,
      'subscription.autoRenew': false
    });
    return true;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

// Helper function to send subscription charge notification
async function sendSubscriptionChargeNotification(userId, chargeResult, sock) {
  try {
    if (!sock) return; // Socket not available (might be in scheduled task)

    const userData = await getUserData(userId);
    const tier = userData.subscription?.tier || 'free';
    const tierConfig = SUBSCRIPTION_TIERS[tier];

    if (chargeResult.success) {
      // Success notification
      const notification = `✅ *SUBSCRIPTION CHARGED*\n\n💎 *Tier:* ${tierConfig.name}\n💳 *Amount:* ${ecoSettings.currency}${chargeResult.cost.toLocaleString()}\n\n📅 *Next charge:* ${new Date(userData.subscription.renewalDate).toLocaleDateString()}\n💰 *New balance:* ${ecoSettings.currency}${userData.balance.toLocaleString()}`;

      await sock.sendMessage(userId, { text: notification });
    } else {
      // Failure notification
      let message = '';
      if (chargeResult.reason.includes('Insufficient funds')) {
        message = `⚠️ *SUBSCRIPTION CANCELLED*\n\n❌ Insufficient funds to renew your ${tierConfig.name} subscription.\n\n💸 *Required:* ${ecoSettings.currency}${tierConfig.weeklyCost.toLocaleString()}\n💰 *Your balance:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n\n📌 *Downgraded to:* 🆓 Free tier\n\n💡 *To re-subscribe:*\n!subscription upgrade ${tier}`;
      } else {
        message = `❌ *SUBSCRIPTION CHARGE FAILED*\n\n⚠️ *Reason:* ${chargeResult.reason}\n💎 *Tier:* ${tierConfig.name}\n\n📞 *Contact admin if this persists.*`;
      }

      await sock.sendMessage(userId, { text: message });
    }
  } catch (error) {
    console.error('Error sending charge notification:', error);
  }
}

// Helper function to send bonus notification
async function sendBonusNotification(userId, bonuses, tierConfig, sock) {
  try {
    if (!sock) return; // Socket not available

    let bonusText = `💰 *WEEKLY BONUSES APPLIED*\n\n💎 *Tier:* ${tierConfig.name}\n\n`;
    let totalBonus = 0;

    if (bonuses.weeklyPassiveIncome > 0) {
      bonusText += `🏦 *Passive Income:* +${ecoSettings.currency}${bonuses.weeklyPassiveIncome.toLocaleString()}\n`;
      totalBonus += bonuses.weeklyPassiveIncome;
    }

    const userData = await getUserData(userId);
    if (bonuses.interestPercent > 0) {
      const interest = Math.floor(userData.bank * bonuses.interestPercent / 100);
      bonusText += `📈 *Bank Interest:* +${ecoSettings.currency}${interest.toLocaleString()} (${bonuses.interestPercent}%)\n`;
      totalBonus += interest;
    }

    bonusText += `\n✨ *Total bonus:* +${ecoSettings.currency}${totalBonus.toLocaleString()}`;

    await sock.sendMessage(userId, { text: bonusText });
  } catch (error) {
    console.error('Error sending bonus notification:', error);
  }
}

async function chargeSubscriptionFee(userId, sock = null) {
  try {
    const userData = await getUserData(userId);
    const subscription = userData.subscription;

    if (!subscription.active || subscription.tier === 'free') {
      return { success: false, reason: 'No active subscription' };
    }

    const tierConfig = SUBSCRIPTION_TIERS[subscription.tier];
    const weeklyCost = tierConfig.weeklyCost;

    if (userData.balance < weeklyCost) {
      // Insufficient funds - cancel subscription
      await cancelSubscription(userId);
      const result = { success: false, reason: 'Insufficient funds - subscription cancelled' };

      // Send failure notification
      await sendSubscriptionChargeNotification(userId, result, sock);
      return result;
    }

    await removeMoney(userId, weeklyCost, `Subscription fee - ${tierConfig.name}`);

    const renewalDate = new Date();
    renewalDate.setDate(renewalDate.getDate() + 7);

    await updateUserData(userId, {
      'subscription.lastChargeDate': new Date(),
      'subscription.renewalDate': renewalDate
    });

    const result = { success: true, cost: weeklyCost };

    // Get updated balance and send success notification
    const updatedUserData = await getUserData(userId);
    const chargeResultForNotification = {
      success: true,
      cost: weeklyCost,
      balance: updatedUserData.balance
    };

    // Send success notification
    await sendSubscriptionChargeNotification(userId, chargeResultForNotification, sock);

    return result;
  } catch (error) {
    console.error('Error charging subscription:', error);
    return { success: false, reason: 'Error processing charge' };
  }
}

async function applySubscriptionBonuses(userId, sock = null) {
  try {
    const userData = await getUserData(userId);
    const subscription = userData.subscription;
    const tierConfig = SUBSCRIPTION_TIERS[subscription.tier];
    const bonuses = tierConfig.bonuses;

    // Apply passive income
    if (subscription.active && bonuses.weeklyPassiveIncome > 0) {
      await addMoney(userId, bonuses.weeklyPassiveIncome, `Weekly ${tierConfig.name} bonus`, false);
    }

    // Apply interest on bank balance
    if (subscription.active && bonuses.interestPercent > 0) {
      const interest = Math.floor(userData.bank * bonuses.interestPercent / 100);
      await addMoney(userId, interest, `${tierConfig.name} bank interest`, false);
    }

    // Send bonus notification if there are any bonuses
    if ((bonuses.weeklyPassiveIncome > 0 || bonuses.interestPercent > 0) && sock) {
      await sendBonusNotification(userId, bonuses, tierConfig, sock);
    }

    return true;
  } catch (error) {
    console.error('Error applying subscription bonuses:', error);
    return false;
  }
}

// Scheduled task handler: Charge subscriptions weekly and apply bonuses
async function scheduledSubscriptionBilling(context) {
  const { logger, sock } = context || {};
  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    // Find all users with active subscriptions
    const cursor = usersCollection.find({ 'subscription.active': true, 'subscription.tier': { $ne: 'free' } });

    while (await cursor.hasNext()) {
      const user = await cursor.next();
      const userId = user.userId;

      try {
        const chargeResult = await chargeSubscriptionFee(userId, sock);
        if (chargeResult.success) {
          // Apply bonuses after successful charge
          await applySubscriptionBonuses(userId, sock);
          if (logger) logger.info(`Subscription charged for ${userId} - ${chargeResult.cost}`);
        } else {
          if (logger) logger.warn(`Subscription charge failed for ${userId} - ${chargeResult.reason}`);
        }
      } catch (err) {
        if (logger) logger.error(`Error processing subscription for ${userId}: ${err.message}`);
      }
    }

    return true;
  } catch (error) {
    if (context && context.logger) context.logger.error('Error in scheduledSubscriptionBilling:', error);
    else console.error('Error in scheduledSubscriptionBilling:', error);
    return false;
  }
}

async function handleSubscription(context, args) {
  const { reply, senderId, config } = context;

  try {
    if (!ecoSettings.subscriptionEnabled) {
      await reply('🚫 *Subscription system is currently disabled*');
      return;
    }

    if (!args || args.length === 0) {
      // Show subscription menu
      const currentSub = await getUserSubscription(senderId);
      let menu = `💎 *SUBSCRIPTION TIERS* 💎\n\n`;

      for (const [tierKey, tierConfig] of Object.entries(SUBSCRIPTION_TIERS)) {
        const isActive = currentSub.tier === tierKey && currentSub.active;
        const status = isActive ? ' ✅ ACTIVE' : '';
        menu += `${tierConfig.name}${status}\n`;
        menu += `  • Cost: ${tierConfig.weeklyCost > 0 ? ecoSettings.currency + tierConfig.weeklyCost.toLocaleString() + '/week' : 'FREE'}\n`;
        menu += `  • Wallet: ${ecoSettings.currency}${tierConfig.limits.walletLimit.toLocaleString()}\n`;
        menu += `  • Bank: ${ecoSettings.currency}${tierConfig.limits.bankLimit.toLocaleString()}\n`;
        menu += `  • Crypto/Stock: ${tierConfig.limits.maxCryptoPerToken}/${tierConfig.limits.maxStocksPerStock}\n`;

        if (tierConfig.bonuses.weeklyPassiveIncome > 0) {
          menu += `  • Passive: +${ecoSettings.currency}${tierConfig.bonuses.weeklyPassiveIncome.toLocaleString()}/week\n`;
        }
        if (tierConfig.bonuses.workBonus > 1) {
          menu += `  • Work: +${Math.round((tierConfig.bonuses.workBonus - 1) * 100)}%\n`;
        }
        if (tierConfig.bonuses.interestPercent > 0) {
          menu += `  • Interest: ${tierConfig.bonuses.interestPercent}% weekly\n`;
        }

        menu += `\n`;
      }

      menu += `\n📝 *Commands:*\n`;
      menu += `• ${config.PREFIX}subscription view [tier] - Details about a tier\n`;
      menu += `• ${config.PREFIX}subscription upgrade [tier] - Upgrade your subscription\n`;
      menu += `• ${config.PREFIX}subscription cancel - Cancel your subscription\n`;
      menu += `• ${config.PREFIX}subscription info - Your current subscription\n`;

      await reply(menu);
      return;
    }

    const action = args[0].toLowerCase();

    switch (action) {
      case 'view':
        if (args.length < 2) {
          await reply('⚠️ *Usage: subscription view [tier]*\nAvailable tiers: free, plus, pro, smart, ultra');
          return;
        }

        const viewTier = args[1].toLowerCase();
        const viewConfig = SUBSCRIPTION_TIERS[viewTier];

        if (!viewConfig) {
          await reply('❌ *Invalid tier name*');
          return;
        }

        let details = `${viewConfig.name} *SUBSCRIPTION*\n\n`;
        details += `💰 *Cost:* ${viewConfig.weeklyCost > 0 ? ecoSettings.currency + viewConfig.weeklyCost.toLocaleString() + '/week' : 'FREE'}\n\n`;

        details += `📊 *LIMITS:*\n`;
        details += `  • Wallet: ${ecoSettings.currency}${viewConfig.limits.walletLimit.toLocaleString()}\n`;
        details += `  • Bank: ${ecoSettings.currency}${viewConfig.limits.bankLimit.toLocaleString()}\n`;
        details += `  • Per Crypto: ${viewConfig.limits.maxCryptoPerToken} coins\n`;
        details += `  • Per Stock: ${viewConfig.limits.maxStocksPerStock} shares\n\n`;

        details += `⚡ *BONUSES:*\n`;
        details += `  • Work Earnings: +${Math.round((viewConfig.bonuses.workBonus - 1) * 100)}%\n`;
        details += `  • Daily Reward: +${Math.round((viewConfig.bonuses.dailyBonus - 1) * 100)}%\n`;
        if (viewConfig.bonuses.weeklyPassiveIncome > 0) {
          details += `  • Weekly Passive: +${ecoSettings.currency}${viewConfig.bonuses.weeklyPassiveIncome.toLocaleString()}\n`;
        }
        if (viewConfig.bonuses.interestPercent > 0) {
          details += `  • Bank Interest: ${viewConfig.bonuses.interestPercent}% weekly\n`;
        }
        if (viewConfig.bonuses.cashbackPercent > 0) {
          details += `  • Cashback: ${viewConfig.bonuses.cashbackPercent}%\n`;
        }

        details += `\n🛡️ *FEATURES:*\n`;
        if (viewConfig.features.robProtection) {
          details += `  ✅ Rob Protection (${viewConfig.bonuses.robProtectionBlocks} blocks/week)\n`;
        }
        if (viewConfig.features.passiveIncome) {
          details += `  ✅ Passive Income\n`;
        }
        if (viewConfig.features.marketInsider) {
          details += `  ✅ Market Insider Info\n`;
        }
        if (viewConfig.features.taxAvoidance) {
          details += `  ✅ Tax Avoidance\n`;
        }

        await reply(details);
        break;

      case 'upgrade':
        if (args.length < 2) {
          await reply('⚠️ *Usage: subscription upgrade [tier]*\nAvailable tiers: free, plus, pro, smart, ultra');
          return;
        }

        const newTier = args[1].toLowerCase();
        if (!SUBSCRIPTION_TIERS[newTier]) {
          await reply('❌ *Invalid tier name*');
          return;
        }

        if (newTier === 'free') {
          await reply('ℹ️ *You\'re already on the free tier!*\nTo upgrade, use one of the premium tiers: plus, pro, smart, ultra');
          return;
        }

        const userDataBefore = await getUserData(senderId);
        const tierConfigUpgrade = SUBSCRIPTION_TIERS[newTier];
        const weeklyCost = tierConfigUpgrade.weeklyCost;

        if (userDataBefore.balance < weeklyCost) {
          await reply(`🚫 *Insufficient funds to upgrade*\n\nCost: ${ecoSettings.currency}${weeklyCost.toLocaleString()}\nYou have: ${ecoSettings.currency}${userDataBefore.balance.toLocaleString()}`);
          return;
        }

        // Charge first week
        await removeMoney(senderId, weeklyCost, `Subscription upgrade - ${tierConfigUpgrade.name}`);
        await upgradeSubscription(senderId, newTier);

        let upgradeMsg = `✅ *Subscription Upgraded!*\n\n`;
        upgradeMsg += `Tier: ${tierConfigUpgrade.name}\n`;
        upgradeMsg += `Weekly Cost: ${ecoSettings.currency}${weeklyCost.toLocaleString()}\n`;
        upgradeMsg += `First payment: ${ecoSettings.currency}${weeklyCost.toLocaleString()}\n\n`;
        upgradeMsg += `🎉 *Your new limits are active immediately!*\n`;
        upgradeMsg += `🔄 *You'll be charged every Sunday at midnight*\n`;
        upgradeMsg += `💡 Use *${config.PREFIX}subscription info* to check your subscription`;

        await reply(upgradeMsg);
        break;

      case 'cancel':
        const currentSub = await getUserSubscription(senderId);
        if (currentSub.tier === 'free' || !currentSub.active) {
          await reply('ℹ️ *You don\'t have an active subscription to cancel*');
          return;
        }

        await cancelSubscription(senderId);
        await reply(`❌ *Subscription Cancelled*\n\nYour ${currentSub.tier} subscription has been cancelled.\nYour account has been downgraded to FREE tier.\n\n💡 You can always upgrade again later!`);
        break;

      case 'info':
        const subInfo = await getUserSubscription(senderId);
        const subConfig = SUBSCRIPTION_TIERS[subInfo.tier];

        let infoMsg = `💎 *YOUR SUBSCRIPTION* 💎\n\n`;
        infoMsg += `Tier: ${subConfig.name}\n`;
        infoMsg += `Status: ${subInfo.active ? '✅ ACTIVE' : '❌ INACTIVE'}\n`;

        if (subInfo.active) {
          infoMsg += `\n📅 *Renewal:* ${subInfo.renewalDate ? new Date(subInfo.renewalDate).toLocaleDateString() : 'Unknown'}\n`;
          infoMsg += `💰 *Weekly Cost:* ${ecoSettings.currency}${subConfig.weeklyCost.toLocaleString()}\n`;
          infoMsg += `🔄 *Auto-Renew:* ${subInfo.autoRenew ? '✅ Yes' : '❌ No'}\n`;
        }

        infoMsg += `\n📊 *Current Limits:*\n`;
        infoMsg += `  • Wallet: ${ecoSettings.currency}${subConfig.limits.walletLimit.toLocaleString()}\n`;
        infoMsg += `  • Bank: ${ecoSettings.currency}${subConfig.limits.bankLimit.toLocaleString()}\n`;
        infoMsg += `  • Crypto: ${subConfig.limits.maxCryptoPerToken} per token\n`;
        infoMsg += `  • Stock: ${subConfig.limits.maxStocksPerStock} per stock\n`;

        await reply(infoMsg);
        break;

      default:
        await reply('❓ *Unknown subscription command*');
    }
  } catch (error) {
    await reply('❌ *Error processing subscription command. Please try again.*');
    console.error('Subscription error:', error);
  }
}

async function handleEvents(context) {
  await context.reply('🚧 *Events system coming soon!* Double money events, challenges, and more! 🚧');
}

async function handleBounty(context, args) {
  await context.reply('🚧 *Bounty hunting system coming soon!* Hunt down targets for rewards! 🚧');
}

// ❌ REMOVED: The old `export { ... }` block is gone.
// PluginHelpers is the correct way to share functions.
