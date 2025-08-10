// plugins/economy.js - Economy plugin compatible with PluginManager
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';

// Plugin information export
export const info = {
  name: 'Economy System',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Complete economy system with wallet, bank, work, rob, clans and MongoDB persistence',
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
  SETTINGS: 'economy_settings'
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
    
    console.log('✅ MongoDB connected successfully');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default economy settings
const defaultSettings = {
  startingBalance: 0,
  startingBankBalance: 0,
  dailyMinAmount: 500,
  dailyMaxAmount: 1000,
  workCooldownMinutes: 60,
  workJobs: [
    { name: 'Uber Driver', min: 200, max: 800 },
    { name: 'Food Delivery', min: 150, max: 600 },
    { name: 'Freelancer', min: 300, max: 1200 },
    { name: 'Tutor', min: 250, max: 900 },
    { name: 'Cleaner', min: 180, max: 500 },
    { name: 'Mechanic', min: 400, max: 1000 }
  ],
  robCooldownMinutes: 60,
  robSuccessRate: 0.7,
  robMaxStealPercent: 0.3,
  robMinTargetBalance: 100,
  robMinRobberBalance: 100,
  robMinSteal: 10,
  robFailPenalty: 100,
  clanCreationCost: 5000,
  currency: '₦',
  timezone: 'Africa/Lagos'
};

// Load settings from database
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
    
    await updateUserData(userId, { balance: newBalance });
    
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
      
      await updateUserData(userId, { balance: newBalance });
      
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

// Check if user is admin (you might need to adjust this based on your bot's admin system)
function isAdmin(userId) {
  try {
    if (!userId || typeof userId !== 'string') return false;
    
    // Implement your admin check logic here
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
    
    // Implement your owner check logic here
    const ownerNumber = process.env.OWNER_NUMBER || '';
    return userId.split('@')[0] === ownerNumber;
  } catch (error) {
    console.error('Error checking owner status:', error);
    return false;
  }
}

// Main plugin handler function - FIXED VERSION
export default async function economyHandler(m, sock, config) {
  try {
    // CRITICAL FIX: Add comprehensive null safety checks
    if (!m || !m.body || typeof m.body !== 'string') {
      return; // Exit early if no valid message body
    }

    if (!config || !config.PREFIX || typeof config.PREFIX !== 'string') {
      console.error('❌ Economy plugin: Invalid config or PREFIX');
      return;
    }

    if (!m.body.startsWith(config.PREFIX)) {
      return; // Not a command
    }

    // SAFE string processing with null checks
    let messageBody = '';
    try {
      messageBody = m.body.slice(config.PREFIX.length).trim();
      if (!messageBody) {
        return; // Empty command
      }
    } catch (stringError) {
      console.error('❌ Error processing message body:', stringError.message);
      return;
    }

    // SAFE argument parsing
    let args = [];
    let command = '';
    try {
      args = messageBody.split(' ').filter(arg => arg.length > 0); // Remove empty args
      if (args.length === 0) {
        return; // No valid command
      }
      command = args[0].toLowerCase();
    } catch (argsError) {
      console.error('❌ Error parsing arguments:', argsError.message);
      return;
    }

    // SAFE user ID extraction
    let senderId = '';
    let from = '';
    try {
      if (!m.key || !m.key.remoteJid) {
        console.error('❌ Economy plugin: Invalid message key');
        return;
      }
      
      senderId = m.key.participant || m.key.remoteJid;
      from = m.key.remoteJid;
      
      if (!senderId || !from) {
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
        if (!text || typeof text !== 'string') {
          console.error('❌ Attempted to send empty reply');
          return;
        }
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
        
      case 'balance':
      case 'bal':
      case 'wallet':
        await handleBalance({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'send':
      case 'transfer':
      case 'pay':
        await handleSend({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'deposit':
      case 'dep':
        await handleDeposit({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'withdraw':
      case 'wd':
        await handleWithdraw({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'work':
        await handleWork({ m, sock, config, senderId, from, reply });
        break;
        
      case 'rob':
        await handleRob({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'daily':
        await handleDaily({ m, sock, config, senderId, from, reply });
        break;
        
      case 'profile':
        await handleProfile({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'leaderboard':
      case 'lb':
        await handleLeaderboard({ m, sock, config, senderId, from, reply });
        break;
        
      case 'clan':
        await handleClan({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'shop':
        await handleShop({ m, sock, config, senderId, from, reply });
        break;
        
      case 'inventory':
      case 'inv':
        await handleInventory({ m, sock, config, senderId, from, reply });
        break;
        
      default:
        // Don't respond to unknown commands to avoid spam
        break;
    }
  } catch (error) {
    console.error('❌ Economy plugin error:', error.message);
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
        await handleWork(context);
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
        await handleLeaderboard(context);
        break;
      case 'clan':
        await handleClan(context, args);
        break;
      case 'shop':
        await handleShop(context);
        break;
      case 'inventory':
      case 'inv':
        await handleInventory(context);
        break;
      case 'settings':
        await handleSettings(context, args);
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
    const menuText = `💰 *ECONOMY SYSTEM* 💰\n\n` +
                    `💵 *Wallet Commands:*\n` +
                    `• *balance/bal* - Check your balance\n` +
                    `• *send @user amount* - Send money\n` +
                    `• *deposit amount* - Deposit to bank\n` +
                    `• *withdraw amount* - Withdraw from bank\n\n` +
                    `💼 *Earning Commands:*\n` +
                    `• *work* - Work to earn money\n` +
                    `• *daily* - Claim daily reward\n` +
                    `• *rob @user* - Rob someone (risky!)\n\n` +
                    `👥 *Social Commands:*\n` +
                    `• *profile [@user]* - View profile\n` +
                    `• *leaderboard* - Top users\n` +
                    `• *clan* - Clan system\n\n` +
                    `🛍️ *Shop Commands:*\n` +
                    `• *shop* - Browse items\n` +
                    `• *inventory* - View your items\n\n` +
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
    // Safe argument processing
    const targetUser = (args && args.length > 0) ? getTargetUser(m, args.join(' ')) : senderId;
    
    if (targetUser && targetUser !== senderId) {
      await initUser(targetUser);
      const targetData = await getUserData(targetUser);
      const targetNumber = targetUser.split('@')[0];
      
      await reply(`💰 *@${targetNumber}'s Balance*\n\n` +
                 `💵 *Wallet:* ${ecoSettings.currency}${targetData.balance.toLocaleString()}\n` +
                 `🏦 *Bank:* ${ecoSettings.currency}${targetData.bank.toLocaleString()}\n` +
                 `💎 *Total Wealth:* ${ecoSettings.currency}${(targetData.balance + targetData.bank).toLocaleString()}`);
    } else {
      const userData = await getUserData(senderId);
      await reply(`💰 *YOUR BALANCE* 💰\n\n` +
                 `💵 *Wallet:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n` +
                 `🏦 *Bank:* ${ecoSettings.currency}${userData.bank.toLocaleString()}\n` +
                 `💎 *Total Wealth:* ${ecoSettings.currency}${(userData.balance + userData.bank).toLocaleString()}\n\n` +
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
    
    // Process transaction
    await initUser(targetUser);
    await removeMoney(senderId, amount, 'Transfer sent');
    await addMoney(targetUser, amount, 'Transfer received');
    
    const updatedSender = await getUserData(senderId);
    const updatedTarget = await getUserData(targetUser);
    
    await sock.sendMessage(from, {
      text: `✅ *TRANSFER SUCCESSFUL* ✅\n\n💸 *@${senderId.split('@')[0]}* sent *${ecoSettings.currency}${amount.toLocaleString()}* to *@${targetUser.split('@')[0]}*\n\n💵 *Sender's new balance:* ${ecoSettings.currency}${updatedSender.balance.toLocaleString()}\n💰 *Receiver's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}`,
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
      await reply(`⚠️ *Usage:* ${context.config.PREFIX}deposit [amount]\n\n💡 *Example:* ${context.config.PREFIX}deposit 1000`);
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
    
    await updateUserData(senderId, {
      balance: userData.balance - amount,
      bank: userData.bank + amount
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`🏦 *Successfully deposited ${ecoSettings.currency}${amount.toLocaleString()} to your bank*\n\n💵 *New Wallet Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🏦 *New Bank Balance:* ${ecoSettings.currency}${updatedData.bank.toLocaleString()}`);
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
      await reply(`⚠️ *Usage:* ${context.config.PREFIX}withdraw [amount]\n\n💡 *Example:* ${context.config.PREFIX}withdraw 1000`);
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
    
    await updateUserData(senderId, {
      balance: userData.balance + amount,
      bank: userData.bank - amount
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`💵 *Successfully withdrew ${ecoSettings.currency}${amount.toLocaleString()} from your bank*\n\n💵 *New Wallet Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🏦 *New Bank Balance:* ${ecoSettings.currency}${updatedData.bank.toLocaleString()}`);
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
    const earnings = Math.floor(Math.random() * (randomJob.max - randomJob.min + 1)) + randomJob.min;
    
    await updateUserData(senderId, {
      balance: userData.balance + earnings,
      lastWork: now
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`💼 *Work Complete!*\n\n🔨 *Job:* ${randomJob.name}\n💰 *Earned:* ${ecoSettings.currency}${earnings.toLocaleString()}\n💵 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n\n⏱️ *Next work available in ${ecoSettings.workCooldownMinutes} minutes*`);
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
      await reply(`💸 *Your balance is too low to attempt a robbery*\n\n💰 *Your balance:* ${ecoSettings.currency}${robberData.balance.toLocaleString()}\n⚠️ _You need at least ${ecoSettings.currency}${ecoSettings.robMinRobberBalance} in your wallet to bail yourself in case you get caught and arrested._`);
      return;
    }
    
    // Process robbery attempt
    const success = Math.random() < ecoSettings.robSuccessRate;
    
    await updateUserData(senderId, { lastRob: now });
    
    if (success) {
      const maxSteal = Math.floor(targetData.balance * ecoSettings.robMaxStealPercent);
      const stolen = Math.floor(Math.random() * maxSteal) + ecoSettings.robMinSteal;
      
      await updateUserData(targetUser, { balance: targetData.balance - stolen });
      await updateUserData(senderId, { balance: robberData.balance + stolen });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      await sock.sendMessage(from, {
        text: `🦹‍♂️ *ROBBERY SUCCESS!* 🦹‍♂️\n\n💰 *@${senderId.split('@')[0]}* successfully robbed *${ecoSettings.currency}${stolen.toLocaleString()}* from *@${targetUser.split('@')[0]}*\n\n🤑 *Robber's new balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😭 *Victim's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
        mentions: [senderId, targetUser]
      });
    } else {
      await updateUserData(senderId, { balance: robberData.balance - ecoSettings.robFailPenalty });
      await updateUserData(targetUser, { balance: targetData.balance + ecoSettings.robFailPenalty });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      await sock.sendMessage(from, {
        text: `🚨 *ROBBERY FAILED!* 🚨\n\n❌ *@${senderId.split('@')[0]}* got caught trying to rob *@${targetUser.split('@')[0]}* and has been arrested.\n\n💸 *Bail paid:* ${ecoSettings.currency}${ecoSettings.robFailPenalty.toLocaleString()}\n😔 *Robber's new balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😊 *Victim's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
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
    
    const dailyAmount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
    
    // Calculate streak
    const yesterday = getNigeriaTime().subtract(1, 'day').format('DD-MM-YYYY');
    let newStreak = 1;
    
    if (userData.lastDaily === yesterday) {
      newStreak = (userData.streak || 0) + 1;
    }
    
    const newLongestStreak = Math.max(userData.longestStreak || 0, newStreak);
    
    await updateUserData(senderId, {
      balance: userData.balance + dailyAmount,
      lastDaily: currentDate,
      streak: newStreak,
      longestStreak: newLongestStreak,
      totalAttendances: (userData.totalAttendances || 0) + 1
    });
    
    const updatedData = await getUserData(senderId);
    
    await reply(`🎁 *Daily Reward Claimed!*\n\n💰 *Received:* ${ecoSettings.currency}${dailyAmount.toLocaleString()}\n💵 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🔥 *Current Streak:* ${newStreak} days\n\n✨ *Come back tomorrow for another reward!*\n⏰ *Nigeria Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`);
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
    
    await sock.sendMessage(from, {
      text: `👤 *USER PROFILE* 👤\n\n📱 *User:* @${targetUser.split('@')[0]}\n🏅 *Rank:* ${profileData.rank}\n💰 *Total Wealth:* ${ecoSettings.currency}${profileWealth.toLocaleString()}\n💵 *Wallet:* ${ecoSettings.currency}${profileData.balance.toLocaleString()}\n🏦 *Bank:* ${ecoSettings.currency}${profileData.bank.toLocaleString()}\n🎯 *Bounty:* ${ecoSettings.currency}${profileData.bounty.toLocaleString()}\n🛡️ *Clan:* ${profileData.clan || 'None'}\n\n📊 *ATTENDANCE RECORD*\n📅 *Last Attendance:* ${profileData.lastAttendance || 'Never'}\n✅ *Today's Status:* ${profileData.lastAttendance === today ? 'Marked ✅' : 'Not marked ❌'}\n📋 *Total Attendances:* ${profileData.totalAttendances}\n🔥 *Current Streak:* ${profileData.streak} days\n🏆 *Longest Streak:* ${profileData.longestStreak} days\n\n⏰ *Current Nigeria Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`,
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
      .sort({ balance: -1, bank: -1 })
      .limit(10)
      .toArray();
    
    const leaderboard = users.map(user => ({
      id: user.userId,
      wealth: user.balance + user.bank,
      attendances: user.totalAttendances || 0,
      streak: user.streak || 0
    }));
    
    let lb = '🏆 *ECONOMY LEADERBOARD* 🏆\n\n';
    leaderboard.forEach((userEntry, index) => {
      const rank = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      lb += `${rank} @${userEntry.id.split('@')[0]}\n`;
      lb += `   💰 ${ecoSettings.currency}${userEntry.wealth.toLocaleString()} | 📋 ${userEntry.attendances} | 🔥 ${userEntry.streak}\n\n`;
    });
    
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
      await reply(`🛡️ *Clan Commands:*\n\n• *${context.config.PREFIX}clan create [name]* - Create a clan\n• *${context.config.PREFIX}clan join [name]* - Join a clan\n• *${context.config.PREFIX}clan leave* - Leave your clan\n• *${context.config.PREFIX}clan disband* - Disband your clan (leader only)\n• *${context.config.PREFIX}clan info* - View clan information\n• *${context.config.PREFIX}clan list* - View all clans\n• *${context.config.PREFIX}clan members* - View clan members`);
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
          created: new Date()
        });
        
        await updateUserData(senderId, {
          clan: clanName,
          balance: userData.balance - ecoSettings.clanCreationCost
        });
        
        await reply(`✅ *Clan "${clanName}" created successfully!*\n\n👑 *You are now the clan leader*\n💰 *${ecoSettings.currency}${ecoSettings.clanCreationCost.toLocaleString()} deducted as creation fee*`);
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
        
        await db.collection(COLLECTIONS.CLANS).updateOne(
          { name: clanName },
          { $push: { members: senderId } }
        );
        await updateUserData(senderId, { clan: clanName });
        
        await reply(`✅ *You have joined clan "${clanName}"!*`);
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
          text: `🏰 *Clan Information*\n\n🛡️ *Name:* ${clan.name}\n👑 *Leader:* @${clan.leader.split('@')[0]}\n👥 *Members:* ${clan.members.length}\n🏅 *Level:* ${clan.level}\n💰 *Clan Bank:* ${ecoSettings.currency}${clan.bank.toLocaleString()}\n📅 *Created:* ${moment(clan.created).tz('Africa/Lagos').format('DD/MM/YYYY')}`,
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
        
        await sock.sendMessage(from, {
          text: membersList,
          mentions: clanData.members
        });
        break;
        
      case 'list':
        const allClans = await db.collection(COLLECTIONS.CLANS).find({}).toArray();
        
        if (allClans.length === 0) {
          await reply('📜 *No clans exist yet*');
          return;
        }
        
        let clanList = '🏰 *ALL CLANS* 🏰\n\n';
        allClans.forEach((clanEntry, index) => {
          clanList += `${index + 1}. *${clanEntry.name}*\n`;
          clanList += `   👑 ${clanEntry.leader.split('@')[0]} | 👥 ${clanEntry.members.length} members\n\n`;
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
async function handleShop(context) {
  const { reply } = context;
  
  try {
    await reply(`🛍️ *ECONOMY SHOP* 🛍️\n\n🚧 *Coming Soon!* 🚧\n\nStay tuned for items you can buy with your hard-earned ${ecoSettings.currency}!\n\n💡 *Suggestions for shop items:*\n• 🛡️ Protection items\n• 💎 Premium roles\n• 🎁 Special rewards\n• ⚡ Power-ups`);
  } catch (error) {
    console.error('Shop error:', error);
  }
}

// Handle inventory command
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
      invText += `${index + 1}. ${item.name} x${item.quantity}\n`;
    });
    
    await reply(invText);
  } catch (error) {
    await reply('❌ *Error loading inventory. Please try again.*');
    console.error('Inventory error:', error);
  }
}

// Handle settings command (admin only)
async function handleSettings(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!isAdmin(senderId) && !isOwner(senderId)) {
      await reply('🚫 *Only admins can access economy settings*');
      return;
    }
    
    if (!args || args.length === 0) {
      let settingsText = `⚙️ *ECONOMY SETTINGS* ⚙️\n\n`;
      settingsText += `💰 *Economy:*\n`;
      settingsText += `• Starting Balance: ${ecoSettings.currency}${ecoSettings.startingBalance}\n`;
      settingsText += `• Starting Bank: ${ecoSettings.currency}${ecoSettings.startingBankBalance}\n`;
      settingsText += `• Currency: ${ecoSettings.currency}\n\n`;
      settingsText += `🎁 *Daily Rewards:*\n`;
      settingsText += `• Min Amount: ${ecoSettings.currency}${ecoSettings.dailyMinAmount}\n`;
      settingsText += `• Max Amount: ${ecoSettings.currency}${ecoSettings.dailyMaxAmount}\n\n`;
      settingsText += `💼 *Work:*\n`;
      settingsText += `• Cooldown: ${ecoSettings.workCooldownMinutes} minutes\n`;
      settingsText += `• Jobs: ${ecoSettings.workJobs.length} available\n\n`;
      settingsText += `🦹 *Robbery:*\n`;
      settingsText += `• Success Rate: ${(ecoSettings.robSuccessRate * 100)}%\n`;
      settingsText += `• Cooldown: ${ecoSettings.robCooldownMinutes} minutes\n`;
      settingsText += `• Max Steal: ${(ecoSettings.robMaxStealPercent * 100)}%\n\n`;
      settingsText += `💡 *Use:* ${context.config.PREFIX}economy settings set [setting] [value]`;
      
      await reply(settingsText);
      return;
    }
    
    if (args[0] === 'set' && args.length >= 3) {
      const setting = args[1];
      const value = args[2];
      
      // Handle different setting types
      let newValue = value;
      if (['startingBalance', 'dailyMinAmount', 'dailyMaxAmount', 'workCooldownMinutes', 'robCooldownMinutes'].includes(setting)) {
        newValue = parseInt(value);
        if (isNaN(newValue)) {
          await reply('⚠️ *Value must be a number*');
          return;
        }
      } else if (['robSuccessRate', 'robMaxStealPercent'].includes(setting)) {
        newValue = parseFloat(value);
        if (isNaN(newValue) || newValue < 0 || newValue > 1) {
          await reply('⚠️ *Rate must be between 0 and 1 (e.g., 0.4 for 40%)*');
          return;
        }
      }
      
      if (ecoSettings.hasOwnProperty(setting)) {
        ecoSettings[setting] = newValue;
        await saveSettings();
        await reply(`✅ *Setting updated successfully!*\n\n📝 *${setting}* = ${newValue}`);
      } else {
        await reply('❌ *Invalid setting name*');
      }
    } else {
      await reply(`⚠️ *Usage:* ${context.config.PREFIX}economy settings set [setting] [value]`);
    }
  } catch (error) {
    await reply('❌ *Error accessing settings. Please try again.*');
    console.error('Settings error:', error);
  }
}

// Export functions for use by other plugins
export { addMoney, removeMoney, getUserData, updateUserData, initUser, ecoSettings };
