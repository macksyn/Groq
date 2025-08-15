// economy-utils.js - Utility functions and data
import moment from 'moment-timezone';

// Shop Items Database with FIXED case sensitivity issue
const SHOP_ITEMS = {
  // Using lowercase keys for direct matching
  workboost: {
    id: 'workboost',
    name: "Work Boost",
    price: 3000,
    description: "Double work earnings for 24 hours",
    type: "consumable",
    effect: "workBoost",
    emoji: "⚡"
  },
  robprotection: {
    id: 'robprotection',
    name: "Robbery Protection",
    price: 8000,
    description: "Prevents robberies for 48 hours",
    type: "consumable", 
    effect: "robProtection",
    emoji: "🛡️"
  },
  dailyboost: {
    id: 'dailyboost',
    name: "Lucky Charm",
    price: 2500,
    description: "Increases daily reward by 50% for 7 days",
    type: "consumable",
    effect: "dailyBoost",
    emoji: "🍀"
  },
  gamblingluck: {
    id: 'gamblingluck',
    name: "Rabbit's Foot",
    price: 5000,
    description: "Increases gambling luck for 12 hours",
    type: "consumable",
    effect: "gamblingLuck",
    emoji: "🐰"
  },
  
  // Permanent Upgrades
  vipstatus: {
    id: 'vipstatus',
    name: "VIP Status",
    price: 100000,
    description: "Permanent 25% bonus to all earnings",
    type: "permanent",
    effect: "vipBonus",
    emoji: "👑"
  },
  privatevault: {
    id: 'privatevault',
    name: "Private Vault",
    price: 50000,
    description: "Secure storage that can't be robbed",
    type: "upgrade",
    effect: "vault",
    emoji: "🔐"
  },
  
  // Tools & Equipment
  lockpicks: {
    id: 'lockpicks',
    name: "Professional Lockpicks",
    price: 1200,
    description: "Increases robbery success rate by 20%",
    type: "tool",
    effect: "robberyBoost",
    uses: 3,
    emoji: "🗝️"
  },
  businesssuit: {
    id: 'businesssuit',
    name: "Designer Business Suit",
    price: 4500,
    description: "Increases work earnings by 35%",
    type: "equipment",
    effect: "workBonus",
    emoji: "👔"
  },
  
  // Cosmetic Items
  goldencrown: {
    id: 'goldencrown',
    name: "Golden Crown",
    price: 250000,
    description: "Shows 👑 next to your name in leaderboards",
    type: "cosmetic",
    effect: "crown",
    emoji: "👑"
  },
  customtitle: {
    id: 'customtitle',
    name: "Custom Title",
    price: 25000,
    description: "Set a custom rank title",
    type: "cosmetic",
    effect: "customTitle",
    emoji: "📛"
  },
  
  // Special Items
  heistplans: {
    id: 'heistplans',
    name: "Heist Plans",
    price: 15000,
    description: "Reduces heist cooldown by 50%",
    type: "consumable",
    effect: "heistCooldown",
    emoji: "📋"
  },
  markettip: {
    id: 'markettip',
    name: "Market Insider Info",
    price: 10000,
    description: "Guarantees profitable investment for 1 trade",
    type: "consumable",
    effect: "marketTip",
    emoji: "📊"
  }
};

// Helper function to find shop item by ID (case insensitive)
function findShopItem(itemId) {
  if (!itemId || typeof itemId !== 'string') return null;
  
  const lowercaseId = itemId.toLowerCase();
  return SHOP_ITEMS[lowercaseId] || null;
}

// Get shop items by category
function getShopItemsByCategory(category) {
  const categories = {
    consumables: ['workboost', 'robprotection', 'dailyboost', 'gamblingluck', 'heistplans'],
    upgrades: ['vipstatus', 'privatevault'],
    tools: ['lockpicks', 'businesssuit'],
    cosmetics: ['goldencrown', 'customtitle'],
    special: ['markettip']
  };
  
  const categoryItems = categories[category.toLowerCase()] || [];
  return categoryItems.map(id => SHOP_ITEMS[id]).filter(Boolean);
}

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

// Time utility functions
function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

// User targeting function
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

// Permission checking functions
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

// Format currency function
function formatCurrency(amount, currency = '₦') {
  return `${currency}${amount.toLocaleString()}`;
}

// Calculate rank based on wealth
function calculateRank(totalWealth) {
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
  return currentRank;
}

// Validate amount input
function validateAmount(amount, min = 1, max = Infinity) {
  const num = parseInt(amount);
  if (isNaN(num)) return { valid: false, error: 'Invalid number' };
  if (num < min) return { valid: false, error: `Minimum amount is ${min}` };
  if (num > max) return { valid: false, error: `Maximum amount is ${max.toLocaleString()}` };
  return { valid: true, amount: num };
}

// Generate random number between min and max
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Calculate percentage with precision
function calculatePercentage(value, percentage) {
  return Math.floor(value * (percentage / 100));
}

// Format time remaining
function formatTimeRemaining(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// Validate cooldown
function checkCooldown(lastTime, cooldownMinutes) {
  if (!lastTime) return { ready: true };
  
  const now = new Date();
  const timeDiff = now - new Date(lastTime);
  const cooldownMs = cooldownMinutes * 60 * 1000;
  
  if (timeDiff >= cooldownMs) {
    return { ready: true };
  } else {
    const remaining = Math.ceil((cooldownMs - timeDiff) / 60000);
    return { ready: false, remaining };
  }
}

// Export all utilities
export {
  // Shop system
  SHOP_ITEMS,
  findShopItem,
  getShopItemsByCategory,
  
  // Achievements
  ACHIEVEMENTS,
  
  // Time utilities
  getNigeriaTime,
  getCurrentDate,
  formatTimeRemaining,
  checkCooldown,
  
  // User utilities
  getTargetUser,
  isAdmin,
  isOwner,
  
  // Calculation utilities
  formatCurrency,
  calculateRank,
  validateAmount,
  randomBetween,
  calculatePercentage
};
