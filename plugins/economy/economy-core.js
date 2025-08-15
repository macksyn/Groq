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
      const shopItem = findShopItem(item.id);
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

// Banking Commands
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
      await reply(`🚫 *Bank deposit limit exceeded*\n\nMax bank balance: ${formatCurrency(ecoSettings.maxBankBalance, ecoSettings.currency)}`);
      return;
    }
    
    await updateUserData(senderId, {
      balance: userData.balance - amount,
      bank: userData.bank + amount
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`🏦 *Successfully deposited ${formatCurrency(amount, ecoSettings.currency)} to your bank*\n\n💵 *Wallet:* ${formatCurrency(updatedData.balance, ecoSettings.currency)}\n🏦 *Bank:* ${formatCurrency(updatedData.bank, ecoSettings.currency)}\n\n📈 *Earning 0.1% daily interest on bank deposits!*`);
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
      await reply(`🚫 *Wallet limit exceeded*\n\nMax wallet balance: ${formatCurrency(ecoSettings.maxWalletBalance, ecoSettings.currency)}`);
      return;
    }
    
    await updateUserData(senderId, {
      balance: userData.balance + amount,
      bank: userData.bank - amount
    });
    
    const updatedData = await getUserData(senderId);
    await reply(`💵 *Successfully withdrew ${formatCurrency(amount, ecoSettings.currency)} from your bank*\n\n💵 *Wallet:* ${formatCurrency(updatedData.balance, ecoSettings.currency)}\n🏦 *Bank:* ${formatCurrency(updatedData.bank, ecoSettings.currency)}`);
  } catch (error) {
    await reply('❌ *Error processing withdrawal. Please try again.*');
    console.error('Withdraw error:', error);
  }
}

// Vault Command
async function handleVault(context, args) {
  const { reply, senderId } = context;
  
  try {
    const userData = await getUserData(senderId);
    
    // Check if user has vault access// economy-core.js - Main entry point and all feature handlers
import { 
  initDatabase, 
  ecoSettings, 
  loadSettings, 
  initUser, 
  getUserData, 
  updateUserData, 
  addMoney, 
  removeMoney, 
  cleanupExpiredEffects,
  COLLECTIONS,
  db
} from './economy-database.js';

import { 
  SHOP_ITEMS,
  findShopItem,
  getShopItemsByCategory,
  ACHIEVEMENTS,
  getNigeriaTime,
  getCurrentDate,
  formatTimeRemaining,
  checkCooldown,
  getTargetUser,
  isAdmin,
  isOwner,
  formatCurrency,
  calculateRank,
  validateAmount,
  randomBetween,
  calculatePercentage
} from './economy-utils.js';

// Plugin information export
export const info = {
  name: 'Enhanced Economy System',
  version: '3.1.0',
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

// Achievement checking system
async function checkAchievements(userId, type, data = {}) {
  try {
    const user = await getUserData(userId);
    const newAchievements = [];
    
    switch (type) {
      case 'registration':
        // This will be awarded when they claim first daily
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

// Item usage system with FIXED case sensitivity
async function useItem(userId, itemId) {
  try {
    const user = await getUserData(userId);
    
    // Find item in inventory (case insensitive search)
    const itemIndex = user.inventory.findIndex(item => 
      item.id.toLowerCase() === itemId.toLowerCase()
    );
    
    if (itemIndex === -1) {
      return { success: false, message: 'Item not found in inventory' };
    }
    
    const item = user.inventory[itemIndex];
    // Use the findShopItem function which handles case insensitivity
    const shopItem = findShopItem(item.id);
    
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

// Main plugin handler
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
    balanceText += `💵 *Wallet:* ${formatCurrency(userData.balance, ecoSettings.currency)}\n`;
    balanceText += `🏦 *Bank:* ${formatCurrency(userData.bank, ecoSettings.currency)}\n`;
    
    if (isOwnBalance && userData.vault) {
      balanceText += `🔐 *Vault:* ${formatCurrency(userData.vault, ecoSettings.currency)}\n`;
    }
    
    balanceText += `💎 *Total Wealth:* ${formatCurrency(totalWealth, ecoSettings.currency)}\n`;
    
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

// Enhanced Send Command with transaction limits and fees
async function handleSend(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  try {
    if (!args || args.length < 2) {
      await reply(`💸 *Transfer Money*\n\n⚠️ *Usage:*\n• Reply to someone: *${context.config.PREFIX}send amount*\n• Mention someone: *${context.config.PREFIX}send @user amount*\n• Use number: *${context.config.PREFIX}send 1234567890 amount*\n\n💡 *Example: ${context.config.PREFIX}send @user 1000*\n\n📋 *Transfer fee: 1% (min ${formatCurrency(5, ecoSettings.currency)})*`);
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
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${formatCurrency(senderData.balance, ecoSettings.currency)}\n💸 *Required:* ${formatCurrency(totalCost, ecoSettings.currency)} (includes ${formatCurrency(fee, ecoSettings.currency)} fee)`);
      return;
    }
    
    // Process transaction
    await initUser(targetUser);
    await removeMoney(senderId, totalCost, 'Transfer sent');
    await addMoney(targetUser, amount, 'Transfer received', false);
    
    const updatedSender = await getUserData(senderId);
    const updatedTarget = await getUserData(targetUser);
    
    await sock.sendMessage(from, {
      text: `✅ *TRANSFER SUCCESSFUL* ✅\n\n💸 *@${senderId.split('@')[0]}* sent *${formatCurrency(amount, ecoSettings.currency)}* to *@${targetUser.split('@')[0]}*\n\n💰 *Amount sent:* ${formatCurrency(amount, ecoSettings.currency)}\n💳 *Transfer fee:* ${formatCurrency(fee, ecoSettings.currency)}\n💵 *Sender's balance:* ${formatCurrency(updatedSender.balance, ecoSettings.currency)}\n🎯 *Receiver's balance:* ${formatCurrency(updatedTarget.balance, ecoSettings.currency)}`,
      mentions: [senderId, targetUser]
    });
  } catch (error) {
    await reply('❌ *Error processing transfer. Please try again.*');
    console.error('Send error:', error);
  }
}

// Enhanced Shop System with FIXED case sensitivity
async function handleShop(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.shopEnabled) {
      await reply('🚫 *Shop is currently closed*');
      return;
    }
    
    if (!args || args.length === 0) {
      // Show shop categories
      await reply(`🛍️ *ECONOMY SHOP* 🛍️\n\n📋 *Categories:*\n• *${context.config.PREFIX}shop consumables* - Temporary boosts\n• *${context.config.PREFIX}shop upgrades* - Permanent improvements\n• *${context.config.PREFIX}shop tools* - Equipment with uses\n• *${context.config.PREFIX}shop cosmetics* - Visual items\n• *${context.config.PREFIX}shop special* - Special items\n\n💡 *Buy with:* ${context.config.PREFIX}shop buy [item_name]\n\n🔍 *Item names are case-insensitive*`);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    if (action === 'buy') {
      if (args.length < 2) {
        await reply('⚠️ *Usage: shop buy [item_name]*\n\n💡 *Example: shop buy workboost* or *shop buy WorkBoost*');
        return;
      }
      
      const itemName = args[1];
      // Use findShopItem which handles case insensitivity
      const item = findShopItem(itemName);
      
      if (!item) {
        await reply(`❌ *Item not found*\n\n🔍 *Available items:*\n${Object.keys(SHOP_ITEMS).join(', ')}\n\n💡 *Item names are case-insensitive*`);
        return;
      }
      
      const userData = await getUserData(senderId);
      if (userData.balance < item.price) {
        await reply(`🚫 *Insufficient funds*\n\nRequired: ${formatCurrency(item.price, ecoSettings.currency)}\nAvailable: ${formatCurrency(userData.balance, ecoSettings.currency)}`);
        return;
      }
      
      // Check if user already has permanent item
      if (item.type === 'permanent' && userData.activeEffects?.[item.effect]) {
        await reply('⚠️ *You already own this permanent upgrade*');
        return;
      }
      
      await removeMoney(senderId, item.price, 'Shop purchase');
      
      // Add to inventory
      const existingItem = userData.inventory.find(invItem => invItem.id.toLowerCase() === item.id.toLowerCase());
      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        userData.inventory.push({
          id: item.id,
          name: item.name,
          quantity: 1,
          uses: item.uses || null
        });
      }
      
      await updateUserData(senderId, { inventory: userData.inventory });
      
      await reply(`✅ *Purchase Successful!*\n\n${item.emoji} *${item.name}*\n💰 *Price:* ${formatCurrency(item.price, ecoSettings.currency)}\n📝 *Description:* ${item.description}\n\n💡 *Use with:* ${context.config.PREFIX}use ${item.id}`);
    } else {
      // Show category items
      const categoryItems = getShopItemsByCategory(action);
      
      if (categoryItems.length === 0) {
        await reply(`❌ *Invalid category*\n\n📋 *Available categories:* consumables, upgrades, tools, cosmetics, special`);
        return;
      }
      
      let categoryText = `🛍️ *${action.toUpperCase()} SHOP* 🛍️\n\n`;
      categoryItems.forEach(item => {
        categoryText += `${item.emoji} *${item.name}* - ${formatCurrency(item.price, ecoSettings.currency)}\n`;
        categoryText += `   📝 ${item.description}\n`;
        categoryText += `   🛒 ID: ${item.id}\n\n`;
      });
      
      categoryText += `💡 *Buy with:* ${context.config.PREFIX}shop buy [item_name]`;
      await reply(categoryText);
    }
  } catch (error) {
    await reply('❌ *Error processing shop command. Please try again.*');
    console.error('Shop error:', error);
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
      await reply(`🔐 *PRIVATE VAULT* 🔐\n\n💰 *Balance:* ${formatCurrency(userData.vault || 0, ecoSettings.currency)}\n\n📋 *Commands:*\n• *${context.config.PREFIX}vault deposit [amount]* - Store money\n• *${context.config.PREFIX}vault withdraw [amount]* - Take money\n\n🛡️ *Vault money is 100% safe from robberies!*`);
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
        await reply(`🔐 *Successfully deposited ${formatCurrency(amount, ecoSettings.currency)} to your vault*\n\n💵 *Wallet:* ${formatCurrency(updatedUser.balance, ecoSettings.currency)}\n🔐 *Vault:* ${formatCurrency(updatedUser.vault, ecoSettings.currency)}`);
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
        await reply(`🔐 *Successfully withdrew ${formatCurrency(amount, ecoSettings.currency)} from your vault*\n\n💵 *Wallet:* ${formatCurrency(updatedUserWithdraw.balance, ecoSettings.currency)}\n🔐 *Vault:* ${formatCurrency(updatedUserWithdraw.vault, ecoSettings.currency)}`);
        break;
        
      default:
        await reply('❓ *Unknown vault command*');
    }
  } catch (error) {
    await reply('❌ *Error processing vault command. Please try again.*');
    console.error('Vault error:', error);
  }
}

// Enhanced Work Command
async function handleWork(context) {
  const { reply, senderId } = context;
  const now = new Date();
  
  try {
    const userData = await getUserData(senderId);
    
    // Check cooldown
    const cooldownCheck = checkCooldown(userData.lastWork, ecoSettings.workCooldownMinutes);
    if (!cooldownCheck.ready) {
      await reply(`⏱️ *You're tired! Rest for ${cooldownCheck.remaining} minutes before working again.*`);
      return;
    }
    
    // Enhanced job selection with risk/reward
    const availableJobs = ecoSettings.workJobs;
    const randomJob = availableJobs[Math.floor(Math.random() * availableJobs.length)];
    
    let baseEarnings = randomBetween(randomJob.min, randomJob.max);
    
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
    await reply(`💼 *WORK COMPLETE!* 💼\n\n🔨 *Job:* ${randomJob.name}\n📖 *Event:* ${randomEvent.text}\n💰 *Earned:* ${formatCurrency(finalEarnings, ecoSettings.currency)}\n💵 *New Balance:* ${formatCurrency(updatedData.balance, ecoSettings.currency)}\n\n⏱️ *Next work available in ${ecoSettings.workCooldownMinutes} minutes*\n📊 *Total jobs completed:* ${updatedData.stats?.workCount || 1}`);
  } catch (error) {
    await reply('❌ *Error processing work. Please try again.*');
    console.error('Work error:', error);
  }
}

// Enhanced Daily Command
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
    let dailyAmount = randomBetween(ecoSettings.dailyMinAmount, ecoSettings.dailyMaxAmount);
    
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
    
    let rewardText = `🎁 *DAILY REWARD CLAIMED!* 🎁\n\n💰 *Base Reward:* ${formatCurrency(dailyAmount - streakBonus, ecoSettings.currency)}\n🔥 *Streak Bonus:* ${formatCurrency(streakBonus, ecoSettings.currency)}\n💎 *Total Received:* ${formatCurrency(dailyAmount, ecoSettings.currency)}\n💵 *New Balance:* ${formatCurrency(updatedData.balance, ecoSettings.currency)}\n\n🔥 *Current Streak:* ${newStreak} days`;
    
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

// Enhanced Rob Command
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
    const cooldownCheck = checkCooldown(robberData.lastRob, ecoSettings.robCooldownMinutes);
    if (!cooldownCheck.ready) {
      await reply(`⏱️ *You're on cooldown. Try again in ${cooldownCheck.remaining} minutes.*`);
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
      await reply(`👀 *Target is too broke to rob*\n\n💸 *@${targetUser.split('@')[0]}* only has ${formatCurrency(targetData.balance, ecoSettings.currency)}\n🚫 *Minimum required: ${formatCurrency(ecoSettings.robMinTargetBalance, ecoSettings.currency)}*`);
      return;
    }
    
    if (robberData.balance < ecoSettings.robMinRobberBalance) {
      await reply(`💸 *Your balance is too low to attempt a robbery*\n\n💰 *Your balance:* ${formatCurrency(robberData.balance, ecoSettings.currency)}\n⚠️ _You need at least ${formatCurrency(ecoSettings.robMinRobberBalance, ecoSettings.currency)} in your wallet for bail money if you get caught._`);
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
      const stolen = randomBetween(ecoSettings.robMinSteal, maxSteal);
      
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
        text: `🦹‍♂️ *ROBBERY SUCCESS!* 🦹‍♂️\n\n💰 *@${senderId.split('@')[0]}* successfully robbed *${formatCurrency(stolen, ecoSettings.currency)}* from *@${targetUser.split('@')[0]}*\n\n🤑 *Robber's balance:* ${formatCurrency(updatedRobber.balance, ecoSettings.currency)}\n😭 *Victim's balance:* ${formatCurrency(updatedTarget.balance, ecoSettings.currency)}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes\n📊 *Success rate:* ${Math.round(successRate * 100)}%`,
        mentions: [senderId, targetUser]
      });
    } else {
      await updateUserData(senderId, { balance: robberData.balance - ecoSettings.robFailPenalty });
      await updateUserData(targetUser, { balance: targetData.balance + ecoSettings.robFailPenalty });
      
      const updatedRobber = await getUserData(senderId);
      const updatedTarget = await getUserData(targetUser);
      
      await sock.sendMessage(from, {
        text: `🚨 *ROBBERY FAILED!* 🚨\n\n❌ *@${senderId.split('@')[0]}* got caught trying to rob *@${targetUser.split('@')[0]}* and was arrested!\n\n💸 *Bail paid:* ${formatCurrency(ecoSettings.robFailPenalty, ecoSettings.currency)}\n😔 *Robber's balance:* ${formatCurrency(updatedRobber.balance, ecoSettings.currency)}\n😊 *Victim's balance:* ${formatCurrency(updatedTarget.balance, ecoSettings.currency)}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
        mentions: [senderId, targetUser]
      });
    }
  } catch (error) {
    await reply('❌ *Error processing robbery. Please try again.*');
    console.error('Rob error:', error);
  }
}

// Gambling Commands - Coinflip
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
    
    const validation = validateAmount(amount, ecoSettings.coinflipMinBet, ecoSettings.coinflipMaxBet);
    if (!validation.valid) {
      await reply(`⚠️ *${validation.error}*\n\n*Range:* ${formatCurrency(ecoSettings.coinflipMinBet, ecoSettings.currency)} - ${formatCurrency(ecoSettings.coinflipMaxBet, ecoSettings.currency)}`);
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
    
    await reply(`🪙 *COINFLIP RESULT* 🪙\n\n${resultEmoji} *Result:* ${result.toUpperCase()}\n${statusEmoji} *You ${won ? 'WON' : 'LOST'}!*\n\n💰 *${won ? 'Winnings' : 'Lost'}:* ${formatCurrency(won ? winnings : amount, ecoSettings.currency)}`);
  } catch (error) {
    await reply('❌ *Error processing coinflip. Please try again.*');
    console.error('Coinflip error:', error);
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
        
      // Gambling
      case 'coinflip':
      case 'cf':
        await handleCoinflip(context, args);
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
        
      // Placeholder handlers for remaining features
      case 'dice':
        await context.reply('🚧 *Dice game coming soon!* 🚧');
        break;
      case 'slots':
        await context.reply('🚧 *Slots game coming soon!* 🚧');
        break;
      case 'heist':
        await context.reply('🚧 *Heist system coming soon!* 🚧');
        break;
      case 'lottery':
        await context.reply('🚧 *Lottery system coming soon!* 🚧');
        break;
      case 'roulette':
        await context.reply('🚧 *Russian roulette coming soon!* 🚧');
        break;
      case 'guess':
        await context.reply('🚧 *Number guessing game coming soon!* 🚧');
        break;
      case 'invest':
        await context.reply('🚧 *Investment overview coming soon!* 🚧');
        break;
      case 'stocks':
        await context.reply('🚧 *Stock market coming soon!* 🚧');
        break;
      case 'crypto':
        await context.reply('🚧 *Cryptocurrency trading coming soon!* 🚧');
        break;
      case 'business':
        await context.reply('🚧 *Business ownership coming soon!* 🚧');
        break;
      case 'profile':
        await context.reply('🚧 *Enhanced profiles coming soon!* 🚧');
        break;
      case 'leaderboard':
      case 'lb':
        await context.reply('🚧 *Leaderboards coming soon!* 🚧');
        break;
      case 'achievements':
      case 'ach':
        await context.reply('🚧 *Achievement system coming soon!* 🚧');
        break;
      case 'clan':
        await context.reply('🚧 *Clan system coming soon!* 🚧');
        break;
      case 'events':
        await context.reply('🚧 *Events system coming soon!* 🚧');
        break;
      case 'bounty':
        await context.reply('🚧 *Bounty hunting coming soon!* 🚧');
        break;
      case 'admin':
        await context.reply('🚧 *Admin system coming soon!* 🚧');
        break;
        
      default:
        await context.reply(`❓ Unknown economy command: *${subCommand}*\n\nUse *${context.config.PREFIX}economy* to see available commands.`);
    }
  } catch (error) {
    console.error('❌ Economy subcommand error:', error.message);
    await context.reply('❌ *Error processing command. Please try again.*');
  }
}

// Placeholder handlers for remaining gambling and other features
async function handleDice(context, args) {
  await context.reply('🚧 *Dice game coming soon!* 🚧');
}

async function handleSlots(context, args) {
  await context.reply('🚧 *Slots game coming soon!* 🚧');
}

async function handleHeist(context, args) {
  await context.reply('🚧 *Heist system coming soon!* 🚧');
}

async function handleLottery(context, args) {
  await context.reply('🚧 *Lottery system coming soon!* 🚧');
}

async function handleRoulette(context, args) {
  await context.reply('🚧 *Russian Roulette coming soon!* 🚧');
}

async function handleGuess(context, args) {
  await context.reply('🚧 *Number guessing game coming soon!* 🚧');
}

async function handleInvest(context, args) {
  await context.reply('🚧 *Investment overview coming soon!* 🚧');
}

async function handleStocks(context, args) {
  await context.reply('🚧 *Stock market coming soon!* 🚧');
}

async function handleCrypto(context, args) {
  await context.reply('🚧 *Cryptocurrency trading coming soon!* 🚧');
}

async function handleBusiness(context, args) {
  await context.reply('🚧 *Business ownership coming soon!* 🚧');
}

async function handleProfile(context, args) {
  await context.reply('🚧 *Enhanced profiles coming soon!* 🚧');
}

async function handleLeaderboard(context, args) {
  await context.reply('🚧 *Leaderboards coming soon!* 🚧');
}

async function handleAchievements(context, args) {
  await context.reply('🚧 *Achievement system coming soon!* 🚧');
}

async function handleClan(context, args) {
  await context.reply('🚧 *Clan system coming soon!* 🚧');
}

async function handleEvents(context) {
  await context.reply('🚧 *Events system coming soon!* 🚧');
}

async function handleBounty(context, args) {
  await context.reply('🚧 *Bounty hunting coming soon!* 🚧');
}

// Export functions for use by other modules
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
