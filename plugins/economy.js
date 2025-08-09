// plugins/economy.js - Economy system for Fresh WhatsApp Bot
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PermissionHelpers, TimeHelpers, RateLimitHelpers } from '../lib/helpers.js';
import { COMMAND_CATEGORIES } from '../lib/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database paths
const dbPath = path.join(__dirname, '..', 'temp', 'economy.json');
const settingsPath = path.join(__dirname, '..', 'temp', 'economy_settings.json');

// Ensure temp directory exists
const tempDir = path.dirname(dbPath);
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Initialize database
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ users: {}, transactions: [] }, null, 2));
}

// Default economy settings
const defaultEcoSettings = {
  currency: '₦',
  startingBalance: 1000,
  startingBankBalance: 0,
  dailyMinAmount: 500,
  dailyMaxAmount: 1500,
  workCooldownMinutes: 60,
  workJobs: [
    { name: 'Uber Driver', min: 200, max: 800 },
    { name: 'Food Delivery', min: 150, max: 600 },
    { name: 'Freelancer', min: 300, max: 1200 },
    { name: 'Content Creator', min: 250, max: 900 },
    { name: 'Tech Support', min: 180, max: 700 },
    { name: 'Online Tutor', min: 400, max: 1000 }
  ],
  robCooldownMinutes: 120,
  robSuccessRate: 0.7,
  robMaxStealPercent: 0.3,
  robMinTargetBalance: 500,
  robMinRobberBalance: 200,
  robFailPenalty: 150,
  gamblingMinBet: 100,
  gamblingMaxBet: 10000
};

// Load settings
let ecoSettings = defaultEcoSettings;
if (fs.existsSync(settingsPath)) {
  try {
    const loadedSettings = JSON.parse(fs.readFileSync(settingsPath));
    ecoSettings = { ...defaultEcoSettings, ...loadedSettings };
  } catch (error) {
    console.error('Error loading economy settings:', error);
  }
}

// Save settings
function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(ecoSettings, null, 2));
  } catch (error) {
    console.error('Error saving economy settings:', error);
  }
}

// Load database
function loadDatabase() {
  try {
    return JSON.parse(fs.readFileSync(dbPath));
  } catch (error) {
    console.error('Error loading database:', error);
    return { users: {}, transactions: [] };
  }
}

// Save database
function saveDatabase(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Initialize user
export function initUser(userId) {
  const db = loadDatabase();
  
  if (!db.users[userId]) {
    db.users[userId] = {
      balance: ecoSettings.startingBalance,
      bank: ecoSettings.startingBankBalance,
      totalEarned: 0,
      totalSpent: 0,
      workCount: 0,
      robCount: 0,
      lastDaily: null,
      lastWork: null,
      lastRob: null,
      streak: 0,
      longestStreak: 0,
      totalAttendances: 0,
      lastAttendance: null,
      rank: 'Newbie',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      commandsUsed: 0
    };
    
    saveDatabase(db);
    console.log(`👤 New user initialized: ${userId.split('@')[0]}`);
  }
  
  // Update last seen
  db.users[userId].lastSeen = new Date().toISOString();
  db.users[userId].commandsUsed = (db.users[userId].commandsUsed || 0) + 1;
  saveDatabase(db);
  
  return db.users[userId];
}

// Get user data
export function getUserData(userId) {
  const db = loadDatabase();
  return db.users[userId] || null;
}

// Update user data
export function updateUserData(userId, updates) {
  const db = loadDatabase();
  if (db.users[userId]) {
    Object.assign(db.users[userId], updates);
    saveDatabase(db);
  }
}

// Add money to user
export function addMoney(userId, amount, reason = 'Unknown') {
  const db = loadDatabase();
  if (!db.users[userId]) {
    initUser(userId);
  }
  
  db.users[userId].balance += amount;
  db.users[userId].totalEarned += amount;
  
  // Log transaction
  db.transactions.push({
    userId,
    type: 'credit',
    amount,
    reason,
    timestamp: new Date().toISOString()
  });
  
  saveDatabase(db);
  return db.users[userId].balance;
}

// Remove money from user
export function removeMoney(userId, amount, reason = 'Unknown') {
  const db = loadDatabase();
  if (!db.users[userId]) {
    initUser(userId);
  }
  
  if (db.users[userId].balance >= amount) {
    db.users[userId].balance -= amount;
    db.users[userId].totalSpent += amount;
    
    // Log transaction
    db.transactions.push({
      userId,
      type: 'debit',
      amount,
      reason,
      timestamp: new Date().toISOString()
    });
    
    saveDatabase(db);
    return true;
  }
  
  return false;
}

// Get user rank
function getUserRank(totalWealth) {
  if (totalWealth >= 1000000) return '👑 Millionaire';
  if (totalWealth >= 500000) return '💎 Diamond';
  if (totalWealth >= 100000) return '🏆 Gold';
  if (totalWealth >= 50000) return '🥈 Silver';
  if (totalWealth >= 10000) return '🥉 Bronze';
  if (totalWealth >= 5000) return '⭐ Rising';
  return '🌱 Newbie';
}

// Format currency
function formatCurrency(amount) {
  return `${ecoSettings.currency}${amount.toLocaleString()}`;
}

// Get target user from mentions or quoted messages
function getTargetUser(m) {
  if (m.mentions && m.mentions.length > 0) {
    return m.mentions[0];
  }
  
  if (m.quoted && m.quoted.sender) {
    return m.quoted.sender;
  }
  
  return null;
}

// Main economy plugin
export default async function economyPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase().split(' ')[0];
  const args = m.body.split(' ').slice(1);
  
  // Economy commands
  const economyCommands = [
    `${prefix}balance`, `${prefix}bal`, `${prefix}wallet`,
    `${prefix}send`, `${prefix}transfer`, `${prefix}pay`,
    `${prefix}deposit`, `${prefix}dep`, `${prefix}withdraw`, `${prefix}wd`,
    `${prefix}work`, `${prefix}daily`, `${prefix}rob`,
    `${prefix}gamble`, `${prefix}bet`, `${prefix}flip`,
    `${prefix}leaderboard`, `${prefix}lb`, `${prefix}top`,
    `${prefix}profile`, `${prefix}stats`,
    `${prefix}ecosettings`
  ];
  
  if (!economyCommands.includes(cmd)) return;
  
  const user = initUser(m.sender);
  
  switch (cmd) {
    case `${prefix}balance`:
    case `${prefix}bal`:
    case `${prefix}wallet`:
      {
        let targetUser = user;
        let targetUserId = m.sender;
        
        // Check if viewing someone else's balance
        const target = getTargetUser(m);
        if (target) {
          targetUserId = target;
          targetUser = initUser(target);
        }
        
        const totalWealth = targetUser.balance + targetUser.bank;
        const rank = getUserRank(totalWealth);
        
        const balanceMsg = `💰 *WALLET BALANCE* 💰

👤 *User:* @${targetUserId.split('@')[0]}
🏅 *Rank:* ${rank}

💵 *Wallet:* ${formatCurrency(targetUser.balance)}
🏦 *Bank:* ${formatCurrency(targetUser.bank)}
💎 *Total Wealth:* ${formatCurrency(totalWealth)}

📊 *Statistics:*
💰 *Total Earned:* ${formatCurrency(targetUser.totalEarned)}
💸 *Total Spent:* ${formatCurrency(targetUser.totalSpent)}
⚡ *Work Count:* ${targetUser.workCount}
🔥 *Current Streak:* ${targetUser.streak} days

🕒 *Last Seen:* ${targetUser.lastSeen ? TimeHelpers.timeAgo(targetUser.lastSeen) : 'Just now'}`;

        await m.reply(balanceMsg);
        break;
      }

    case `${prefix}work`:
      {
        // Check cooldown
        if (RateLimitHelpers.isLimited(m.sender, 'work', 1, ecoSettings.workCooldownMinutes * 60 * 1000)) {
          const remaining = Math.ceil(RateLimitHelpers.limits.get(`${m.sender}:work`).resetTime - Date.now()) / (60 * 1000);
          return m.reply(`⏱️ *You're tired! Rest for ${Math.ceil(remaining)} minutes before working again.*`);
        }
        
        const job = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
        const earnings = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
        
        updateUserData(m.sender, {
          balance: user.balance + earnings,
          totalEarned: user.totalEarned + earnings,
          workCount: user.workCount + 1
        });
        
        const workMsg = `💼 *WORK COMPLETED* 💼

🔨 *Job:* ${job.name}
💰 *Earned:* ${formatCurrency(earnings)}
💵 *New Balance:* ${formatCurrency(user.balance + earnings)}

⏱️ *Next work available in ${ecoSettings.workCooldownMinutes} minutes*`;

        await m.reply(workMsg);
        break;
      }

    case `${prefix}daily`:
      {
        const today = new Date().toISOString().split('T')[0];
        
        if (user.lastDaily === today) {
          return m.reply('⏰ *You have already claimed your daily reward today!*\n\nCome back tomorrow for another reward.');
        }
        
        const dailyAmount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
        
        // Update streak
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        let newStreak = 1;
        
        if (user.lastDaily === yesterday) {
          newStreak = user.streak + 1;
        }
        
        const newLongestStreak = newStreak > user.longestStreak ? newStreak : user.longestStreak;
        
        updateUserData(m.sender, {
          balance: user.balance + dailyAmount,
          totalEarned: user.totalEarned + dailyAmount,
          lastDaily: today,
          streak: newStreak,
          longestStreak: newLongestStreak
        });
        
        const dailyMsg = `🎁 *DAILY REWARD CLAIMED* 🎁

💰 *Received:* ${formatCurrency(dailyAmount)}
💵 *New Balance:* ${formatCurrency(user.balance + dailyAmount)}
🔥 *Current Streak:* ${newStreak} days

✨ *Come back tomorrow for another reward!*`;

        await m.reply(dailyMsg);
        break;
      }

    case `${prefix}send`:
    case `${prefix}transfer`:
    case `${prefix}pay`:
      {
        if (args.length < 1) {
          return m.reply(`❓ *Usage:* ${cmd} <amount> [@user or reply to message]\n\n*Example:* ${cmd} 500 @user`);
        }
        
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
          return m.reply('❌ *Please enter a valid amount greater than 0*');
        }
        
        if (user.balance < amount) {
          return m.reply(`❌ *Insufficient balance!*\n\n💵 Your balance: ${formatCurrency(user.balance)}\n💸 Amount needed: ${formatCurrency(amount)}`);
        }
        
        const targetUserId = getTargetUser(m);
        if (!targetUserId || targetUserId === m.sender) {
          return m.reply('❌ *Please mention a user or reply to their message*');
        }
        
        const targetUser = initUser(targetUserId);
        
        // Perform transfer
        updateUserData(m.sender, {
          balance: user.balance - amount,
          totalSpent: user.totalSpent + amount
        });
        
        updateUserData(targetUserId, {
          balance: targetUser.balance + amount,
          totalEarned: targetUser.totalEarned + amount
        });
        
        const transferMsg = `✅ *TRANSFER SUCCESSFUL* ✅

💸 *Sent:* ${formatCurrency(amount)}
👤 *To:* @${targetUserId.split('@')[0]}
💵 *Your new balance:* ${formatCurrency(user.balance - amount)}

💝 *Transfer completed successfully!*`;

        await sock.sendMessage(m.from, {
          text: transferMsg,
          mentions: [targetUserId]
        });
        break;
      }

    case `${prefix}deposit`:
    case `${prefix}dep`:
      {
        if (args.length < 1) {
          return m.reply(`❓ *Usage:* ${cmd} <amount|all>\n\n*Example:* ${cmd} 1000`);
        }
        
        let amount;
        if (args[0].toLowerCase() === 'all') {
          amount = user.balance;
        } else {
          amount = parseInt(args[0]);
        }
        
        if (isNaN(amount) || amount <= 0) {
          return m.reply('❌ *Please enter a valid amount greater than 0 or "all"*');
        }
        
        if (user.balance < amount) {
          return m.reply(`❌ *Insufficient wallet balance!*\n\n💵 Your wallet: ${formatCurrency(user.balance)}`);
        }
        
        updateUserData(m.sender, {
          balance: user.balance - amount,
          bank: user.bank + amount
        });
        
        const depositMsg = `🏦 *DEPOSIT SUCCESSFUL* 🏦

💰 *Deposited:* ${formatCurrency(amount)}
💵 *Wallet Balance:* ${formatCurrency(user.balance - amount)}
🏦 *Bank Balance:* ${formatCurrency(user.bank + amount)}

✅ *Your money is now safely stored in the bank!*`;

        await m.reply(depositMsg);
        break;
      }

    case `${prefix}withdraw`:
    case `${prefix}wd`:
      {
        if (args.length < 1) {
          return m.reply(`❓ *Usage:* ${cmd} <amount|all>\n\n*Example:* ${cmd} 1000`);
        }
        
        let amount;
        if (args[0].toLowerCase() === 'all') {
          amount = user.bank;
        } else {
          amount = parseInt(args[0]);
        }
        
        if (isNaN(amount) || amount <= 0) {
          return m.reply('❌ *Please enter a valid amount greater than 0 or "all"*');
        }
        
        if (user.bank < amount) {
          return m.reply(`❌ *Insufficient bank balance!*\n\n🏦 Your bank: ${formatCurrency(user.bank)}`);
        }
        
        updateUserData(m.sender, {
          balance: user.balance + amount,
          bank: user.bank - amount
        });
        
        const withdrawMsg = `🏦 *WITHDRAWAL SUCCESSFUL* 🏦

💰 *Withdrawn:* ${formatCurrency(amount)}
💵 *Wallet Balance:* ${formatCurrency(user.balance + amount)}
🏦 *Bank Balance:* ${formatCurrency(user.bank - amount)}

✅ *Money transferred to your wallet!*`;

        await m.reply(withdrawMsg);
        break;
      }

    case `${prefix}rob`:
      {
        if (RateLimitHelpers.isLimited(m.sender, 'rob', 1, ecoSettings.robCooldownMinutes * 60 * 1000)) {
          const remaining = Math.ceil(RateLimitHelpers.limits.get(`${m.sender}:rob`).resetTime - Date.now()) / (60 * 1000);
          return m.reply(`⏱️ *You're in hiding! Wait ${Math.ceil(remaining)} minutes before attempting another robbery.*`);
        }
        
        if (user.balance < ecoSettings.robMinRobberBalance) {
          return m.reply(`❌ *You need at least ${formatCurrency(ecoSettings.robMinRobberBalance)} to attempt a robbery!*`);
        }
        
        const targetUserId = getTargetUser(m);
        if (!targetUserId || targetUserId === m.sender) {
          return m.reply('❌ *Please mention a user to rob or reply to their message*');
        }
        
        const targetUser = initUser(targetUserId);
        
        if (targetUser.balance < ecoSettings.robMinTargetBalance) {
          return m.reply(`❌ *Target doesn't have enough money to rob! They need at least ${formatCurrency(ecoSettings.robMinTargetBalance)}*`);
        }
        
        const isSuccess = Math.random() < ecoSettings.robSuccessRate;
        
        if (isSuccess) {
          const maxSteal = Math.floor(targetUser.balance * ecoSettings.robMaxStealPercent);
          const stolenAmount = Math.floor(Math.random() * maxSteal) + 100;
          
          updateUserData(m.sender, {
            balance: user.balance + stolenAmount,
            totalEarned: user.totalEarned + stolenAmount,
            robCount: user.robCount + 1
          });
          
          updateUserData(targetUserId, {
            balance: targetUser.balance - stolenAmount
          });
          
          const successMsg = `🦹‍♀️ *ROBBERY SUCCESSFUL* 🦹‍♀️

💰 *Stolen:* ${formatCurrency(stolenAmount)}
👤 *From:* @${targetUserId.split('@')[0]}
💵 *Your new balance:* ${formatCurrency(user.balance + stolenAmount)}

🎭 *You successfully robbed them and got away!*`;

          await sock.sendMessage(m.from, {
            text: successMsg,
            mentions: [targetUserId]
          });
        } else {
          const penalty = Math.min(ecoSettings.robFailPenalty, user.balance);
          
          updateUserData(m.sender, {
            balance: user.balance - penalty
          });
          
          const failMsg = `🚨 *ROBBERY FAILED* 🚨

❌ *You got caught trying to rob @${targetUserId.split('@')[0]}!*
💸 *Fine:* ${formatCurrency(penalty)}
💵 *Your new balance:* ${formatCurrency(user.balance - penalty)}

🚔 *Better luck next time, criminal!*`;

          await sock.sendMessage(m.from, {
            text: failMsg,
            mentions: [targetUserId]
          });
        }
        break;
      }

    case `${prefix}gamble`:
    case `${prefix}bet`:
      {
        if (args.length < 1) {
          return m.reply(`❓ *Usage:* ${cmd} <amount>\n\n*Example:* ${cmd} 500`);
        }
        
        const betAmount = parseInt(args[0]);
        if (isNaN(betAmount) || betAmount <= 0) {
          return m.reply('❌ *Please enter a valid bet amount greater than 0*');
        }
        
        if (betAmount < ecoSettings.gamblingMinBet) {
          return m.reply(`❌ *Minimum bet is ${formatCurrency(ecoSettings.gamblingMinBet)}*`);
        }
        
        if (betAmount > ecoSettings.gamblingMaxBet) {
          return m.reply(`❌ *Maximum bet is ${formatCurrency(ecoSettings.gamblingMaxBet)}*`);
        }
        
        if (user.balance < betAmount) {
          return m.reply(`❌ *Insufficient balance!*\n\n💵 Your balance: ${formatCurrency(user.balance)}\n💸 Bet amount: ${formatCurrency(betAmount)}`);
        }
        
        const isWin = Math.random() < 0.45; // 45% win chance
        
        if (isWin) {
          const winMultiplier = 1.8;
          const winnings = Math.floor(betAmount * winMultiplier);
          const profit = winnings - betAmount;
          
          updateUserData(m.sender, {
            balance: user.balance + profit,
            totalEarned: user.totalEarned + profit
          });
          
          const winMsg = `🎰 *GAMBLING WIN!* 🎰

🎲 *Bet Amount:* ${formatCurrency(betAmount)}
💰 *Won:* ${formatCurrency(winnings)}
📈 *Profit:* ${formatCurrency(profit)}
💵 *New Balance:* ${formatCurrency(user.balance + profit)}

🍀 *Lady luck is on your side!*`;

          await m.reply(winMsg);
        } else {
          updateUserData(m.sender, {
            balance: user.balance - betAmount,
            totalSpent: user.totalSpent + betAmount
          });
          
          const loseMsg = `🎰 *GAMBLING LOSS!* 🎰

🎲 *Bet Amount:* ${formatCurrency(betAmount)}
💸 *Lost:* ${formatCurrency(betAmount)}
💵 *New Balance:* ${formatCurrency(user.balance - betAmount)}

😢 *Better luck next time!*`;

          await m.reply(loseMsg);
        }
        break;
      }

    case `${prefix}leaderboard`:
    case `${prefix}lb`:
    case `${prefix}top`:
      {
        const db = loadDatabase();
        const users = Object.entries(db.users)
          .map(([userId, userData]) => ({
            userId,
            totalWealth: userData.balance + userData.bank,
            ...userData
          }))
          .sort((a, b) => b.totalWealth - a.totalWealth)
          .slice(0, 10);
        
        if (users.length === 0) {
          return m.reply('📊 *No users found in the economy system*');
        }
        
        let leaderboard = '🏆 *ECONOMY LEADERBOARD* 🏆\n\n';
        
        users.forEach((user, index) => {
          const rank = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          const displayName = user.userId.split('@')[0];
          
          leaderboard += `${rank} ${displayName}\n`;
          leaderboard += `   💎 ${formatCurrency(user.totalWealth)}\n\n`;
        });
        
        await m.reply(leaderboard);
        break;
      }

    case `${prefix}profile`:
    case `${prefix}stats`:
      {
        let targetUser = user;
        let targetUserId = m.sender;
        
        const target = getTargetUser(m);
        if (target) {
          targetUserId = target;
          targetUser = initUser(target);
        }
        
        const totalWealth = targetUser.balance + targetUser.bank;
        const rank = getUserRank(totalWealth);
        
        const profileMsg = `👤 *USER PROFILE* 👤

🏷️ *Name:* @${targetUserId.split('@')[0]}
🏅 *Rank:* ${rank}
💎 *Total Wealth:* ${formatCurrency(totalWealth)}

💰 *ECONOMY STATS:*
💵 Wallet: ${formatCurrency(targetUser.balance)}
🏦 Bank: ${formatCurrency(targetUser.bank)}
📈 Total Earned: ${formatCurrency(targetUser.totalEarned)}
📉 Total Spent: ${formatCurrency(targetUser.totalSpent)}

⚡ *ACTIVITY STATS:*
🔨 Work Count: ${targetUser.workCount}
🎁 Daily Streak: ${targetUser.streak} days
🏆 Longest Streak: ${targetUser.longestStreak} days
📋 Commands Used: ${targetUser.commandsUsed}

📅 *DATES:*
🗓️ First Seen: ${targetUser.firstSeen ? new Date(targetUser.firstSeen).toLocaleDateString() : 'Unknown'}
🕒 Last Seen: ${targetUser.lastSeen ? TimeHelpers.timeAgo(targetUser.lastSeen) : 'Just now'}`;

        await sock.sendMessage(m.from, {
          text: profileMsg,
          mentions: [targetUserId]
        });
        break;
      }

    case `${prefix}ecosettings`:
      {
        const isOwner = PermissionHelpers.isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net');
        if (!isOwner) {
          return m.reply('🚫 *Only the bot owner can view economy settings*');
        }
        
        const db = loadDatabase();
        const totalUsers = Object.keys(db.users).length;
        const totalWealth = Object.values(db.users).reduce((sum, user) => sum + user.balance + user.bank, 0);
        
        const settingsMsg = `🔧 *ECONOMY SYSTEM STATS* 🔧

👥 *Total Users:* ${totalUsers}
💰 *Total Wealth in Circulation:* ${formatCurrency(totalWealth)}

📊 *Economy Settings:*
💵 *Currency:* ${ecoSettings.currency}
🎁 *Daily Rewards:* ${formatCurrency(ecoSettings.dailyMinAmount)} - ${formatCurrency(ecoSettings.dailyMaxAmount)}
💼 *Work Cooldown:* ${ecoSettings.workCooldownMinutes} minutes
🦹 *Rob Success Rate:* ${(ecoSettings.robSuccessRate * 100)}%
🎰 *Gambling Limits:* ${formatCurrency(ecoSettings.gamblingMinBet)} - ${formatCurrency(ecoSettings.gamblingMaxBet)}

🗄️ *Database:* File-based JSON ✅
📁 *Storage:* ${dbPath}`;

        await m.reply(settingsMsg);
        break;
      }

    default:
      await m.reply(`🚧 *${cmd.replace(prefix, '').toUpperCase()} - Available Commands* 🚧

💡 *Economy Commands:*
• \`${prefix}balance\` - Check your wallet
• \`${prefix}work\` - Earn money by working
• \`${prefix}daily\` - Claim daily reward
• \`${prefix}send <amount> @user\` - Send money
• \`${prefix}deposit <amount>\` - Deposit to bank
• \`${prefix}withdraw <amount>\` - Withdraw from bank
• \`${prefix}rob @user\` - Rob another user
• \`${prefix}gamble <amount>\` - Gamble your money
• \`${prefix}leaderboard\` - View top users
• \`${prefix}profile\` - View your profile

💰 *Start with \`${prefix}daily\` to get your first reward!*`);
      break;
  }
}

// Plugin metadata
export const info = {
  name: 'Economy System',
  version: '1.0.0',
  author: 'Fresh Bot Team',
  description: 'Complete economy system with balance, work, daily rewards, transfers, gambling, and more',
  category: COMMAND_CATEGORIES.UTILITY,
  commands: [
    {
      name: 'balance',
      description: 'Check your wallet balance and stats',
      usage: '.balance [@user]',
      aliases: ['bal', 'wallet']
    },
    {
      name: 'work',
      description: 'Work to earn money (has cooldown)',
      usage: '.work'
    },
    {
      name: 'daily',
      description: 'Claim your daily reward',
      usage: '.daily'
    },
    {
      name: 'send',
      description: 'Send money to another user',
      usage: '.send <amount> @user',
      aliases: ['transfer', 'pay']
    },
    {
      name: 'deposit',
      description: 'Deposit money to your bank',
      usage: '.deposit <amount|all>',
      aliases: ['dep']
    },
    {
      name: 'withdraw',
      description: 'Withdraw money from your bank',
      usage: '.withdraw <amount|all>',
      aliases: ['wd']
    },
    {
      name: 'rob',
      description: 'Attempt to rob another user (has cooldown)',
      usage: '.rob @user'
    },
    {
      name: 'gamble',
      description: 'Gamble your money for a chance to win',
      usage: '.gamble <amount>',
      aliases: ['bet']
    },
    {
      name: 'leaderboard',
      description: 'View the economy leaderboard',
      usage: '.leaderboard',
      aliases: ['lb', 'top']
    },
    {
      name: 'profile',
      description: 'View your or someone else\'s profile',
      usage: '.profile [@user]',
      aliases: ['stats']
    }
  ]
};