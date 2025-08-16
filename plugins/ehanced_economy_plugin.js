// Profile Handler
async function handleProfile(context, args) {
  const { reply, senderId, m } = context;
  
  try {
    let targetUserId = senderId;
    
    if (args.length > 0) {
      const targetUser = getTargetUser(m, args.join(' '));
      if (targetUser) {
        targetUserId = targetUser;
      }
    }
    
    const user = await getUserData(targetUserId);
    const isOwnProfile = targetUserId === senderId;
    
    // Calculate total wealth and ranks
    const totalWealth = user.balance + user.bank + (user.vault || 0);
    const cryptoValue = await calculateCryptoValue(user.investments?.crypto || {});
    
    // Determine rank based on wealth
    let rank = 'Newbie';
    if (totalWealth >= 10000000) rank = 'Billionaire 💎';
    else if (totalWealth >= 1000000) rank = 'Millionaire 💰';
    else if (totalWealth >= 500000) rank = 'Rich 🤑';
    else if (totalWealth >= 100000) rank = 'Well-off 💵';
    else if (totalWealth >= 50000) rank = 'Middle Class 🏠';
    else if (totalWealth >= 10000) rank = 'Working Class 💼';
    
    // Active effects count
    const activeEffectsCount = user.activeEffects ? Object.keys(user.activeEffects).filter(effect => {
      const expiry = user.activeEffects[effect];
      return typeof expiry === 'boolean' || expiry > Date.now();
    }).length : 0;
    
    const profileText = `👤 *USER PROFILE* 👤\n\n` +
                       `🏆 *Rank:* ${user.customTitle || rank}\n` +
                       `💎 *Total Wealth:* ${ecoSettings.currency}${totalWealth.toLocaleString()}\n` +
                       `🪙 *Crypto Value:* ${ecoSettings.currency}${Math.floor(cryptoValue).toLocaleString()}\n\n` +
                       `📊 *Statistics:*\n` +
                       `💰 Total Earned: ${ecoSettings.currency}${(user.stats?.totalEarned || 0).toLocaleString()}\n` +
                       `💸 Total Spent: ${ecoSettings.currency}${(user.stats?.totalSpent || 0).toLocaleString()}\n` +
                       `🎰 Total Gambled: ${ecoSettings.currency}${(user.stats?.totalGambled || 0).toLocaleString()}\n` +
                       `💼 Work Count: ${user.stats?.workCount || 0}\n` +
                       `🔥 Daily Streak: ${user.stats?.dailyStreak || 0} (Max: ${user.stats?.maxDailyStreak || 0})\n` +
                       `🦹 Rob Success: ${user.stats?.robsSuccessful || 0}/${user.stats?.robsAttempted || 0}\n\n` +
                       `🏅 *Achievements:* ${user.achievements?.length || 0}\n` +
                       `🔮 *Active Effects:* ${activeEffectsCount}\n` +
                       `📦 *Inventory Items:* ${user.inventory?.length || 0}\n` +
                       (user.clan ? `🛡️ *Clan:* ${user.clan}\n` : '') +
                       `📅 *Joined:* ${moment(user.createdAt).format('DD/MM/YYYY')}`;
    
    await reply(profileText);
  } catch (error) {
    await reply('❌ *Error loading profile. Please try again.*');
    console.error('Profile error:', error);
  }
}

// Leaderboard Handler
async function handleLeaderboard(context, args) {
  const { reply } = context;
  
  try {
    const type = args[0]?.toLowerCase() || 'wealth';
    let sortField, title, emoji;
    
    switch (type) {
      case 'wealth':
      case 'rich':
        title = '💎 WEALTH LEADERBOARD';
        emoji = '💰';
        break;
      case 'daily':
      case 'streak':
        sortField = 'stats.dailyStreak';
        title = '🔥 DAILY STREAK LEADERBOARD';
        emoji = '🔥';
        break;
      case 'work':
        sortField = 'stats.workCount';
        title = '💼 WORK LEADERBOARD';
        emoji = '💼';
        break;
      case 'rob':
      case 'robbery':
        sortField = 'stats.robsSuccessful';
        title = '🦹 ROBBERY LEADERBOARD';
        emoji = '🦹';
        break;
      case 'gamble':
      case 'gambling':
        sortField = 'stats.totalGambled';
        title = '🎰 GAMBLING LEADERBOARD';
        emoji = '🎰';
        break;
      default:
        title = '💎 WEALTH LEADERBOARD';
        emoji = '💰';
    }
    
    let users;
    if (type === 'wealth' || type === 'rich') {
      // Calculate total wealth for each user
      users = await db.collection(COLLECTIONS.USERS).find().toArray();
      users = users.map(user => ({
        ...user,
        totalWealth: user.balance + user.bank + (user.vault || 0)
      })).sort((a, b) => b.totalWealth - a.totalWealth);
    } else {
      users = await db.collection(COLLECTIONS.USERS).find().sort({ [sortField]: -1 }).limit(10).toArray();
    }
    
    let leaderboardText = `${title}\n\n`;
    
    users.slice(0, 10).forEach((user, index) => {
      const position = index + 1;
      const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
      
      let value;
      if (type === 'wealth' || type === 'rich') {
        value = `${ecoSettings.currency}${user.totalWealth.toLocaleString()}`;
      } else if (sortField.includes('total')) {
        value = `${ecoSettings.currency}${(user.stats?.[sortField.split('.')[1]] || 0).toLocaleString()}`;
      } else {
        value = user.stats?.[sortField.split('.')[1]] || 0;
      }
      
      const crown = user.activeEffects?.crown ? ' 👑' : '';
      leaderboardText += `${medal} ${value} ${crown}\n`;
    });
    
    leaderboardText += `\n💡 *Available types:* wealth, daily, work, rob, gamble`;
    
    await reply(leaderboardText);
  } catch (error) {
    await reply('❌ *Error loading leaderboard. Please try again.*');
    console.error('Leaderboard error:', error);
  }
}

// Achievements Handler
async function handleAchievements(context, args) {
  const { reply, senderId } = context;
  
  try {
    const user = await getUserData(senderId);
    const userAchievements = user.achievements || [];
    
    if (userAchievements.length === 0) {
      await reply('🏅 *No achievements yet!*\n💡 Complete activities to earn achievements and rewards');
      return;
    }
    
    let achievementText = `🏅 *YOUR ACHIEVEMENTS* 🏅\n\n`;
    let totalRewards = 0;
    
    userAchievements.forEach(achId => {
      const achievement = ACHIEVEMENTS[achId];
      if (achievement) {
        achievementText += `${achievement.emoji} *${achievement.name}*\n   ${achievement.description}\n   💰 Reward: ${ecoSettings.currency}${achievement.reward.toLocaleString()}\n\n`;
        totalRewards += achievement.reward;
      }
    });
    
    achievementText += `📊 *Progress:* ${userAchievements.length}/${Object.keys(ACHIEVEMENTS).length} achievements\n`;
    achievementText += `💰 *Total Rewards Earned:* ${ecoSettings.currency}${totalRewards.toLocaleString()}`;
    
    await reply(achievementText);
  } catch (error) {
    await reply('❌ *Error loading achievements. Please try again.*');
    console.error('Achievements error:', error);
  }
}

// Events Handler  
async function handleEvents(context) {
  const { reply } = context;
  
  try {
    if (!ecoSettings.eventsEnabled) {
      await reply('🚫 *Events are currently disabled*');
      return;
    }
    
    // Get active events from database
    const activeEvents = await db.collection(COLLECTIONS.EVENTS).find({
      endTime: { $gt: new Date() },
      active: true
    }).toArray();
    
    if (activeEvents.length === 0) {
      await reply('📅 *No active events at the moment*\n💡 Check back later for special events with bonuses and rewards!');
      return;
    }
    
    let eventsText = '🎉 *ACTIVE EVENTS* 🎉\n\n';
    
    activeEvents.forEach(event => {
      const timeLeft = Math.ceil((new Date(event.endTime).getTime() - Date.now()) / (1000 * 60 * 60));
      eventsText += `${event.emoji || '🎪'} *${event.name}*\n`;
      eventsText += `   📝 ${event.description}\n`;
      eventsText += `   ⏰ Ends in: ${timeLeft}h\n`;
      if (event.bonus) {
        eventsText += `   🎁 Bonus: ${event.bonus}\n`;
      }
      eventsText += '\n';
    });
    
    await reply(eventsText);
  } catch (error) {
    await reply('❌ *Error loading events. Please try again.*');
    console.error('Events error:', error);
  }
}

// Placeholder handlers for complex features (basic implementation)
async function handleHeist(context, args) {
  const { reply } = context;
  await reply('🚧 *Heist system coming soon!*\n💡 Team up with other players for big scores');
}

async function handleLottery(context, args) {
  const { reply } = context;
  await reply('🚧 *Lottery system coming soon!*\n🎟️ Buy tickets for a chance to win the jackpot');
}

async function handleRoulette(context, args) {
  const { reply } = context;
  await reply('🚧 *Russian Roulette coming soon!*\n🔫 High risk, high reward gambling game');
}

async function handleGuess(context, args) {
  const { reply } = context;
  await reply('🚧 *Number Guessing game coming soon!*\n🔢 Guess the number for multiplied rewards');
}

async function handleInvest(context, args) {
  const { reply } = context;
  await reply('📈 *Investment System*\n\n💡 *Available:*\n• stocks - Stock market trading\n• crypto - Cryptocurrency trading\n• business - Buy and manage businesses');
}

async function handleStocks(context, args) {
  const { reply } = context;
  await reply('🚧 *Stock market coming soon!*\n📈 Trade stocks and build your portfolio');
}

async function handleCrypto(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.investmentsEnabled) {
      await reply('🚫 *Investments are currently disabled*');
      return;
    }
    
    if (!args || args.length === 0) {
      await reply(`🪙 *Crypto Commands:*\n• crypto list - View available cryptos\n• crypto buy [symbol] [amount] - Buy crypto\n• crypto sell [symbol] [amount] - Sell crypto\n• crypto portfolio - View your holdings`);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    switch (action) {
      case 'list':
        const cryptos = await db.collection(COLLECTIONS.CRYPTO).find().toArray();
        if (cryptos.length === 0) {
          await reply('📊 *No cryptocurrencies available at the moment*');
          return;
        }
        
        let listText = '🪙 *CRYPTO MARKET* 🪙\n\n';
        cryptos.forEach(crypto => {
          const change = (Math.random() - 0.5) * 10; // Mock daily change
          const color = change >= 0 ? '🟢' : '🔴';
          listText += `${color} *${crypto.symbol}* - ${crypto.name}\n`;
          listText += `   💰 ${ecoSettings.currency}${crypto.price.toFixed(4)}\n`;
          listText += `   📊 24h: ${change.toFixed(2)}%\n\n`;
        });
        await reply(listText);
        break;
        
      case 'portfolio':
        const user = await getUserData(senderId);
        const portfolio = user.investments?.crypto || {};
        
        if (Object.keys(portfolio).length === 0) {
          await reply('📊 *Your crypto portfolio is empty*\n💡 Use: crypto buy [symbol] [amount]');
          return;
        }
        
        let portfolioText = '🪙 *YOUR CRYPTO PORTFOLIO* 🪙\n\n';
        let totalValue = 0;
        
        const cryptos = await db.collection(COLLECTIONS.CRYPTO).find().toArray();
        
        for (const [symbol, amount] of Object.entries(portfolio)) {
          if (amount > 0) {
            const crypto = cryptos.find(c => c.symbol === symbol);
            if (crypto) {
              const value = amount * crypto.price;
              totalValue += value;
              portfolioText += `💎 *${symbol}*\n`;
              portfolioText += `   📊 Amount: ${amount.toFixed(4)}\n`;
              portfolioText += `   💰 Value: ${ecoSettings.currency}${value.toFixed(2)}\n\n`;
            }
          }
        }
        
        portfolioText += `📈 *Total Portfolio Value:* ${ecoSettings.currency}${totalValue.toFixed(2)}`;
        await reply(portfolioText);
        break;
        
      default:
        await reply('❌ *Invalid crypto command*\n💡 Use: crypto list, buy, sell, or portfolio');
    }
  } catch (error) {
    await reply('❌ *Error processing crypto command. Please try again.*');
    console.error('Crypto error:', error);
  }
}

async function handleBusiness(context, args) {
  const { reply } = context;
  await reply('🚧 *Business system coming soon!*\n🏢 Buy businesses and earn passive income');
}

async function handleClan(context, args) {
  const { reply } = context;
  await reply('🚧 *Clan system coming soon!*\n🛡️ Create clans, compete, and share resources');
}

async function handleBounty(context, args) {
  const { reply } = context;
  await reply('🚧 *Bounty system coming soon!*\n🎯 Place bounties on other players');
}

// Sub-command handler for economy admin
async function handleSubCommand(subCommand, args, context) {
  const { reply, senderId } = context;
  
  if (subCommand.toLowerCase() === 'admin') {
    if (!isAdmin(senderId) && !isOwner(senderId)) {
      await reply('❌ *You need admin permissions to access this*');
      return;
    }
    await handleAdminSettings(context, args);
  } else {
    await reply('❌ *Invalid sub-command*');
  }
}

// Admin settings handler
async function handleAdminSettings(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (args.length === 0) {
      const adminText = `⚙️ *ECONOMY ADMIN PANEL* ⚙️\n\n` +
                       `💰 *User Management:*\n` +
                       `• admin addmoney @user amount\n` +
                       `• admin removemoney @user amount\n` +
                       `• admin resetuser @user\n\n` +
                       `🎰 *System Settings:*\n` +
                       `• admin toggle gambling\n` +
                       `• admin toggle shop\n` +
                       `• admin toggle events\n\n` +
                       `📊 *Statistics:*\n` +
                       `• admin stats\n` +
                       `• admin backup\n\n` +
                       `🎉 *Events:*\n` +
                       `• admin event create <name>\n` +
                       `• admin event end <name>`;
      
      await reply(adminText);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    switch (action) {
      case 'addmoney':
        if (args.length < 3) {
          await reply('❌ *Usage:* admin addmoney @user amount');
          return;
        }
        
        const targetUser = getTargetUser(context.m, args[1]);
        const amount = parseInt(args[2]);
        
        if (!targetUser || isNaN(amount) || amount <= 0) {
          await reply('❌ *Invalid user or amount*');
          return;
        }
        
        await addMoney(targetUser, amount, 'Admin grant', false);
        await reply(`✅ *Added ${ecoSettings.currency}${amount.toLocaleString()} to user*`);
        break;
        
      case 'stats':
        const totalUsers = await db.collection(COLLECTIONS.USERS).countDocuments();
        const totalTransactions = await db.collection(COLLECTIONS.TRANSACTIONS).countDocuments();
        const totalWealth = await db.collection(COLLECTIONS.USERS).aggregate([
          { $group: { _id: null, total: { $sum: { $add: ['$balance', '$bank'] } } } }
        ]).toArray();
        
        const statsText = `📊 *ECONOMY STATISTICS* 📊\n\n` +
                         `👥 Total Users: ${totalUsers}\n` +
                         `💳 Total Transactions: ${totalTransactions}\n` +
                         `💰 Total Wealth: ${ecoSettings.currency}${(totalWealth[0]?.total || 0).toLocaleString()}\n` +
                         `⚙️ Currency: ${ecoSettings.currency}\n` +
                         `🎰 Gambling: ${ecoSettings.gamblingEnabled ? 'Enabled' : 'Disabled'}\n` +
                         `🛍️ Shop: ${ecoSettings.shopEnabled ? 'Enabled' : 'Disabled'}`;
        
        await reply(statsText);
        break;
        
      case 'toggle':
        if (args.length < 2) {
          await reply('❌ *Usage:* admin toggle <gambling/shop/events>');
          return;
        }
        
        const feature = args[1].toLowerCase();
        
        switch (feature) {
          case 'gambling':
            ecoSettings.gamblingEnabled = !ecoSettings.gamblingEnabled;
            await saveSettings();
            await reply(`🎰 *Gambling ${ecoSettings.gamblingEnabled ? 'enabled' : 'disabled'}*`);
            break;
          case 'shop':
            ecoSettings.shopEnabled = !ecoSettings.shopEnabled;
            await saveSettings();
            await reply(`🛍️ *Shop ${ecoSettings.shopEnabled ? 'enabled' : 'disabled'}*`);
            break;
          case 'events':
            ecoSettings.eventsEnabled = !ecoSettings.eventsEnabled;
            await saveSettings();
            await reply(`🎉 *Events ${ecoSettings.eventsEnabled ? 'enabled' : 'disabled'}*`);
            break;
          default:
            await reply('❌ *Invalid feature. Use: gambling, shop, or events*');
        }
        break;
        
      default:
        await reply('❌ *Invalid admin command*');
    }
  } catch (error) {
    await reply('❌ *Error processing admin command*');
    console.error('Admin error:', error);
  }
}

// Enhanced Economy Menu
async function showEconomyMenu(reply, prefix) {
  try {
    const menuText = `💰 *ENHANCED ECONOMY SYSTEM* 💰\n\n` +
                    `💵 *Basic Commands:* \n` +
                    `• *balance* - Check balance & vault\n` +
                    `• *send @user amount* - Transfer money\n` +
                    `• *deposit/withdraw amount* - Bank operations\n` +
                    `• *vault* - Access secure storage\n\n` +
                    `💼 *Earning:*\n` +
                    `• *work* - Work for money\n` +
                    `• *daily* - Daily rewards with streaks\n` +
                    `• *rob @user* - Risk/reward robbery\n` +
                    `• *heist* - Team robberies (coming soon)\n\n` +
                    `🎰 *Gambling:*\n` +
                    `• *coinflip amount* - Heads or tails\n` +
                    `• *dice amount* - Roll the dice\n` +
                    `• *slots amount* - Slot machine\n` +
                    `• *lottery* - Buy tickets (coming soon)\n` +
                    `• *roulette amount* - Russian roulette (coming soon)\n` +
                    `• *guess amount* - Number guessing (coming soon)\n\n` +
                    `📈 *Investments:* \n` +
                    `• *stocks* - Stock market (coming soon)\n` +
                    `• *crypto* - Cryptocurrency\n` +
                    `• *business* - Buy businesses (coming soon)\n\n` +
                    `🛍️ *Shopping:* \n` +
                    `• *shop* - Browse items\n` +
                    `• *inventory* - Your items\n` +
                    `• *use item* - Use items\n\n` +
                    `👥 *Social:* \n` +
                    `• *profile* - View stats\n` +
                    `• *achievements* - Your badges\n` +
                    `• *leaderboard* - Top players\n` +
                    `• *clan* - Clan system (coming soon)\n\n` +
                    `🎉 *Events:* ${prefix}events\n` +
                    `⚙️ *Admin:* ${prefix}economy admin (admin only)`;
    
    await reply(menuText);
  } catch (error) {
    console.error('Error showing economy menu:', error);
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
    
    // Update market on every command (silent)
    try {
      await updateMarket(sock, from);
    } catch (error) {
      console.log('Market update error (non-critical):', error.message);
    }
    
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

// Export functions
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
};// Vault Handler
async function handleVault(context, args) {
  const { reply, senderId } = context;
  
  try {
    const user = await getUserData(senderId);
    
    // Check if user has vault access
    if (!user.activeEffects?.vault && !user.activeEffects?.privateVault) {
      await reply('❌ *You need to buy a Private Vault from the shop first!*\n💡 Use: shop to browse items');
      return;
    }
    
    if (args.length === 0) {
      await reply(`🔐 *Your Private Vault* 🔐\n\n💎 Balance: ${ecoSettings.currency}${(user.vault || 0).toLocaleString()}\n\n📝 *Commands:*\n• vault deposit <amount>\n• vault withdraw <amount>`);
      return;
    }
    
    const action = args[0].toLowerCase();
    const amount = parseInt(args[1]) || 0;
    
    switch (action) {
      case 'deposit':
        if (amount <= 0 || isNaN(amount)) {
          await reply('❌ *Please provide a valid amount to deposit*');
          return;
        }
        
        if (user.balance < amount) {
          await reply(`❌ *Insufficient wallet balance!*\n💰 Available: ${ecoSettings.currency}${user.balance.toLocaleString()}`);
          return;
        }
        
        await updateUserData(senderId, {
          balance: user.balance - amount,
          vault: (user.vault || 0) + amount
        });
        
        await reply(`✅ *Vault deposit successful!*\n💰 Deposited: ${ecoSettings.currency}${amount.toLocaleString()}\n🔐 Vault balance: ${ecoSettings.currency}${((user.vault || 0) + amount).toLocaleString()}`);
        break;
        
      case 'withdraw':
        if (amount <= 0 || isNaN(amount)) {
          await reply('❌ *Please provide a valid amount to withdraw*');
          return;
        }
        
        if ((user.vault || 0) < amount) {
          await reply(`❌ *Insufficient vault balance!*\n🔐 Available: ${ecoSettings.currency}${(user.vault || 0).toLocaleString()}`);
          return;
        }
        
        await updateUserData(senderId, {
          balance: user.balance + amount,
          vault: (user.vault || 0) - amount
        });
        
        await reply(`✅ *Vault withdrawal successful!*\n💰 Withdrawn: ${ecoSettings.currency}${amount.toLocaleString()}\n🔐 Vault balance: ${ecoSettings.currency}${((user.vault || 0) - amount).toLocaleString()}`);
        break;
        
      default:
        await reply('❌ *Invalid vault action. Use: vault deposit/withdraw <amount>*');
    }
  } catch (error) {
    await reply('❌ *Error accessing vault. Please try again.*');
    console.error('Vault error:', error);
  }
}

// Work Handler
async function handleWork(context) {
  const { reply, senderId } = context;
  
  try {
    const user = await getUserData(senderId);
    const now = Date.now();
    
    // Check cooldown
    if (user.lastWork && (now - new Date(user.lastWork).getTime()) < (ecoSettings.workCooldownMinutes * 60 * 1000)) {
      const timeLeft = Math.ceil(((new Date(user.lastWork).getTime() + (ecoSettings.workCooldownMinutes * 60 * 1000)) - now) / (1000 * 60));
      await reply(`⏰ *Work cooldown active!*\n🕐 Try again in ${timeLeft} minutes`);
      return;
    }
    
    // Select random job
    const job = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
    let earnings = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
    
    // Apply effects
    if (user.activeEffects?.workBonus) {
      earnings *= 1.35; // Business suit bonus
    }
    
    earnings = Math.floor(earnings);
    
    // Add money and update stats
    await addMoney(senderId, earnings, `Work as ${job.name}`);
    await updateUserData(senderId, {
      lastWork: new Date(),
      'stats.workCount': (user.stats?.workCount || 0) + 1
    });
    
    // Check achievements
    await checkAchievements(senderId, 'work');
    
    await reply(`💼 *Work Complete!*\n\n👷 Job: ${job.name}\n💰 Earned: ${ecoSettings.currency}${earnings.toLocaleString()}\n⏰ Cooldown: ${job.cooldown} minutes`);
  } catch (error) {
    await reply('❌ *Error processing work. Please try again.*');
    console.error('Work error:', error);
  }
}

// Daily Handler
async function handleDaily(context) {
  const { reply, senderId } = context;
  
  try {
    const user = await getUserData(senderId);
    const today = getCurrentDate();
    const lastDaily = user.lastDaily ? moment(user.lastDaily).format('DD-MM-YYYY') : null;
    
    if (lastDaily === today) {
      const tomorrow = moment().add(1, 'day').format('DD-MM-YYYY HH:mm');
      await reply(`⏰ *Daily already claimed today!*\n🌅 Come back tomorrow: ${tomorrow}`);
      return;
    }
    
    // Calculate streak
    let streak = user.stats?.dailyStreak || 0;
    const yesterday = moment().subtract(1, 'day').format('DD-MM-YYYY');
    
    if (lastDaily === yesterday) {
      streak += 1;
    } else if (lastDaily !== null) {
      streak = 1; // Reset streak if more than 1 day gap
    } else {
      streak = 1; // First time
    }
    
    // Calculate reward
    let reward = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
    const streakBonus = streak * ecoSettings.dailyStreakBonus;
    reward += streakBonus;
    
    // Apply daily boost effect
    let finalReward = reward;
    
    // Add money and update user
    await addMoney(senderId, finalReward, 'Daily reward');
    await updateUserData(senderId, {
      lastDaily: new Date(),
      'stats.dailyStreak': streak,
      'stats.maxDailyStreak': Math.max(user.stats?.maxDailyStreak || 0, streak)
    });
    
    // Check achievements
    await checkAchievements(senderId, 'daily', { streak });
    
    const streakEmojis = ['🔥', '⭐', '💎', '👑'][Math.min(Math.floor(streak / 10), 3)];
    
    await reply(`🌅 *Daily Reward Claimed!* 🌅\n\n💰 Base reward: ${ecoSettings.currency}${(reward - streakBonus).toLocaleString()}\n${streakEmojis} Streak bonus: ${ecoSettings.currency}${streakBonus.toLocaleString()} (${streak} days)\n✨ Total earned: ${ecoSettings.currency}${finalReward.toLocaleString()}\n\n🔥 Current streak: ${streak} days`);
  } catch (error) {
    await reply('❌ *Error claiming daily reward. Please try again.*');
    console.error('Daily error:', error);
  }
}

// Rob Handler
async function handleRob(context, args) {
  const { reply, senderId, m } = context;
  
  try {
    if (args.length === 0) {
      await reply('❌ *Usage:* rob @user\n*Example:* rob @user');
      return;
    }
    
    const targetUser = getTargetUser(m, args.join(' '));
    if (!targetUser) {
      await reply('❌ *Please mention a valid user to rob*');
      return;
    }
    
    if (targetUser === senderId) {
      await reply('❌ *You cannot rob yourself!*');
      return;
    }
    
    const robber = await getUserData(senderId);
    const target = await getUserData(targetUser);
    const now = Date.now();
    
    // Check robber cooldown
    if (robber.lastRob && (now - new Date(robber.lastRob).getTime()) < (ecoSettings.robCooldownMinutes * 60 * 1000)) {
      const timeLeft = Math.ceil(((new Date(robber.lastRob).getTime() + (ecoSettings.robCooldownMinutes * 60 * 1000)) - now) / (1000 * 60));
      await reply(`⏰ *Robbery cooldown active!*\n🕐 Try again in ${timeLeft} minutes`);
      return;
    }
    
    // Check target protection (bodyguard)
    if (target.activeEffects?.bodyguard && target.activeEffects.bodyguard > now) {
      await reply('🥷 *Target is protected by a bodyguard!*\n🛡️ Cannot rob this user');
      return;
    }
    
    // Check minimum balances
    if (robber.balance < ecoSettings.robMinRobberBalance) {
      await reply(`❌ *You need at least ${ecoSettings.currency}${ecoSettings.robMinRobberBalance} to attempt a robbery!*`);
      return;
    }
    
    if (target.balance < ecoSettings.robMinTargetBalance) {
      await reply(`❌ *Target doesn't have enough money to rob!*\n💰 Minimum required: ${ecoSettings.currency}${ecoSettings.robMinTargetBalance}`);
      return;
    }
    
    // Calculate success rate
    let successRate = ecoSettings.robSuccessRate;
    if (robber.activeEffects?.robberyBoost) {
      successRate += 0.2; // Lockpicks bonus
    }
    
    const isSuccessful = Math.random() < successRate;
    
    // Update stats
    await updateUserData(senderId, {
      lastRob: new Date(),
      'stats.robsAttempted': (robber.stats?.robsAttempted || 0) + 1,
      'stats.robsSuccessful': (robber.stats?.robsSuccessful || 0) + (isSuccessful ? 1 : 0)
    });
    
    if (isSuccessful) {
      // Calculate stolen amount
      const maxSteal = Math.floor(target.balance * ecoSettings.robMaxStealPercent);
      const stolenAmount = Math.max(ecoSettings.robMinSteal, Math.floor(Math.random() * maxSteal + ecoSettings.robMinSteal));
      
      // Transfer money
      await removeMoney(targetUser, stolenAmount, 'Robbed');
      await addMoney(senderId, stolenAmount, 'Robbery successful', false);
      
      // Check achievements
      await checkAchievements(senderId, 'rob', { 
        successful: true, 
        successfulCount: (robber.stats?.robsSuccessful || 0) + 1 
      });
      
      await reply(`🦹 *Robbery Successful!* 🦹\n\n💰 Stolen: ${ecoSettings.currency}${stolenAmount.toLocaleString()}\n🎯 Success rate was: ${(successRate * 100).toFixed(1)}%\n⏰ Cooldown: ${ecoSettings.robCooldownMinutes} minutes`);
    } else {
      // Failed robbery - penalty
      await removeMoney(senderId, ecoSettings.robFailPenalty, 'Robbery failed - penalty');
      
      await reply(`🚔 *Robbery Failed!* 🚔\n\n💸 Penalty: ${ecoSettings.currency}${ecoSettings.robFailPenalty}\n🎯 Success rate was: ${(successRate * 100).toFixed(1)}%\n⏰ Cooldown: ${ecoSettings.robCooldownMinutes} minutes`);
    }
  } catch (error) {
    await reply('❌ *Error processing robbery. Please try again.*');
    console.error('Rob error:', error);
  }
}

// Shop Handler
async function handleShop(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.shopEnabled) {
      await reply('🚫 *Shop is currently disabled*');
      return;
    }
    
    if (args.length === 0) {
      // Display shop items
      let shopText = '🛍️ *ECONOMY SHOP* 🛍️\n\n';
      
      const categories = {
        'Consumables': ['workBoost', 'bodyguard', 'dailyBoost', 'gamblingLuck', 'heistPlans', 'marketTip'],
        'Equipment': ['lockpicks', 'businessSuit'],
        'Upgrades': ['privateVault', 'vipStatus'],
        'Cosmetics': ['goldenCrown', 'customTitle']
      };
      
      for (const [category, items] of Object.entries(categories)) {
        shopText += `📂 *${category}:*\n`;
        for (const itemKey of items) {
          const item = SHOP_ITEMS[itemKey];
          if (item) {
            shopText += `${item.emoji} *${item.name}* - ${ecoSettings.currency}${item.price.toLocaleString()}\n   ${item.description}\n\n`;
          }
        }
      }
      
      shopText += `💡 *Usage:* shop buy <item>\n*Example:* shop buy workBoost`;
      
      await reply(shopText);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    if (action === 'buy') {
      if (args.length < 2) {
        await reply('❌ *Usage:* shop buy <item>\n*Example:* shop buy workBoost');
        return;
      }
      
      const itemName = args[1].toLowerCase();
      const actualKey = SHOP_ITEMS_LOWER[itemName];
      
      if (!actualKey || !SHOP_ITEMS[actualKey]) {
        await reply('❌ *Item not found!* Use `shop` to see available items');
        return;
      }
      
      const item = SHOP_ITEMS[actualKey];
      const user = await getUserData(senderId);
      
      if (user.balance < item.price) {
        await reply(`❌ *Insufficient balance!*\n💰 Required: ${ecoSettings.currency}${item.price.toLocaleString()}\n💵 Your balance: ${ecoSettings.currency}${user.balance.toLocaleString()}`);
        return;
      }
      
      // Remove money
      await removeMoney(senderId, item.price, `Bought ${item.name}`);
      
      // Add item to inventory
      const existingItem = user.inventory.find(invItem => invItem.id.toLowerCase() === actualKey.toLowerCase());
      
      if (existingItem) {
        existingItem.quantity += 1;
        if (item.uses) existingItem.uses = item.uses;
      } else {
        user.inventory.push({
          id: actualKey,
          name: item.name,
          quantity: 1,
          uses: item.uses || null,
          purchasedAt: new Date()
        });
      }
      
      await updateUserData(senderId, { inventory: user.inventory });
      
      await reply(`✅ *Purchase successful!*\n${item.emoji} Bought: ${item.name}\n💰 Paid: ${ecoSettings.currency}${item.price.toLocaleString()}\n📦 Check your inventory with: inventory`);
    }
  } catch (error) {
    await reply('❌ *Error accessing shop. Please try again.*');
    console.error('Shop error:', error);
  }
}

// Inventory Handler
async function handleInventory(context) {
  const { reply, senderId } = context;
  
  try {
    const user = await getUserData(senderId);
    
    if (!user.inventory || user.inventory.length === 0) {
      await reply('📦 *Your inventory is empty!*\n🛍️ Visit the shop to buy items: shop');
      return;
    }
    
    let inventoryText = '📦 *YOUR INVENTORY* 📦\n\n';
    
    user.inventory.forEach(item => {
      const shopItem = SHOP_ITEMS[item.id];
      if (shopItem) {
        inventoryText += `${shopItem.emoji} *${item.name}*\n`;
        inventoryText += `   📊 Quantity: ${item.quantity}\n`;
        if (item.uses) inventoryText += `   🔧 Uses left: ${item.uses}\n`;
        inventoryText += `   📝 ${shopItem.description}\n\n`;
      }
    });
    
    inventoryText += `💡 *Usage:* use <item>\n*Example:* use workBoost`;
    
    await reply(inventoryText);
  } catch (error) {
    await reply('❌ *Error accessing inventory. Please try again.*');
    console.error('Inventory error:', error);
  }
}

// Use Item Handler
async function handleUse(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (args.length === 0) {
      await reply('❌ *Usage:* use <item>\n*Example:* use workBoost');
      return;
    }
    
    const itemName = args[0].toLowerCase();
    const result = await useItem(senderId, itemName);
    
    if (result.success) {
      await reply(`✅ ${result.message}\n🔮 ${result.effect}`);
    } else {
      await reply(`❌ ${result.message}`);
    }
  } catch (error) {
    await reply('❌ *Error using item. Please try again.*');
    console.error('Use item error:', error);
  }
}

// Coinflip Handler
async function handleCoinflip(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.gamblingEnabled) {
      await reply('🚫 *Gambling is currently disabled*');
      return;
    }
    
    if (args.length === 0) {
      await reply(`🪙 *Coinflip Game* 🪙\n\n💡 *Usage:* coinflip <amount> <heads/tails>\n*Example:* coinflip 1000 heads\n\n💰 Min bet: ${ecoSettings.currency}${ecoSettings.coinflipMinBet}\n💰 Max bet: ${ecoSettings.currency}${ecoSettings.coinflipMaxBet}`);
      return;
    }
    
    if (args.length < 2) {
      await reply('❌ *Usage:* coinflip <amount> <heads/tails>');
      return;
    }
    
    const amount = parseInt(args[0]);
    const choice = args[1].toLowerCase();
    
    if (isNaN(amount) || amount < ecoSettings.coinflipMinBet || amount > ecoSettings.coinflipMaxBet) {
      await reply(`❌ *Invalid bet amount!*\n💰 Min: ${ecoSettings.currency}${ecoSettings.coinflipMinBet} | Max: ${ecoSettings.currency}${ecoSettings.coinflipMaxBet}`);
      return;
    }
    
    if (!['heads', 'tails', 'h', 't'].includes(choice)) {
      await reply('❌ *Choose heads or tails (h/t)*');
      return;
    }
    
    const user = await getUserData(senderId);
    if (user.balance < amount) {
      await reply(`❌ *Insufficient balance!*\n💰 Your balance: ${ecoSettings.currency}${user.balance.toLocaleString()}`);
      return;
    }
    
    // Flip coin
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const userChoice = choice === 'h' ? 'heads' : choice === 't' ? 'tails' : choice;
    const won = result === userChoice;
    
    // Apply gambling luck effect
    let finalResult = result;
    if (user.activeEffects?.gamblingLuck && user.activeEffects.gamblingLuck > Date.now()) {
      if (!won && Math.random() < 0.3) { // 30% chance to turn loss into win
        finalResult = userChoice;
      }
    }
    
    const actuallyWon = finalResult === userChoice;
    
    if (actuallyWon) {
      await addMoney(senderId, amount, 'Coinflip win', false);
    } else {
      await removeMoney(senderId, amount, 'Coinflip loss');
    }
    
    // Update gambling stats
    await updateUserData(senderId, {
      'stats.totalGambled': (user.stats?.totalGambled || 0) + amount
    });
    
    // Check achievements
    await checkAchievements(senderId, 'gambling', { 
      totalGambled: (user.stats?.totalGambled || 0) + amount 
    });
    
    const resultEmoji = finalResult === 'heads' ? '🪙' : '🪙';
    const statusEmoji = actuallyWon ? '🎉' : '😞';
    
    await reply(`${resultEmoji} *Coinflip Result* ${resultEmoji}\n\n🎯 Your choice: ${userChoice}\n🪙 Result: ${finalResult}\n${statusEmoji} ${actuallyWon ? 'You won!' : 'You lost!'}\n💰 ${actuallyWon ? '+' : '-'}${ecoSettings.currency}${amount.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing coinflip. Please try again.*');
    console.error('Coinflip error:', error);
  }
}

// Dice Handler
async function handleDice(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.gamblingEnabled) {
      await reply('🚫 *Gambling is currently disabled*');
      return;
    }
    
    if (args.length === 0) {
      await reply(`🎲 *Dice Game* 🎲\n\n💡 *Usage:* dice <amount>\n*Example:* dice 1000\n\n🎯 Roll 4-6 to win 2x your bet!\n💰 Min bet: ${ecoSettings.currency}${ecoSettings.diceMinBet}\n💰 Max bet: ${ecoSettings.currency}${ecoSettings.diceMaxBet}`);
      return;
    }
    
    const amount = parseInt(args[0]);
    
    if (isNaN(amount) || amount < ecoSettings.diceMinBet || amount > ecoSettings.diceMaxBet) {
      await reply(`❌ *Invalid bet amount!*\n💰 Min: ${ecoSettings.currency}${ecoSettings.diceMinBet} | Max: ${ecoSettings.currency}${ecoSettings.diceMaxBet}`);
      return;
    }
    
    const user = await getUserData(senderId);
    if (user.balance < amount) {
      await reply(`❌ *Insufficient balance!*\n💰 Your balance: ${ecoSettings.currency}${user.balance.toLocaleString()}`);
      return;
    }
    
    // Roll dice
    const roll = Math.floor(Math.random() * 6) + 1;
    const won = roll >= 4;
    
    // Apply gambling luck
    let finalRoll = roll;
    if (user.activeEffects?.gamblingLuck && user.activeEffects.gamblingLuck > Date.now()) {
      if (!won && Math.random() < 0.25) { // 25% chance to reroll
        finalRoll = Math.floor(Math.random() * 3) + 4; // Force win
      }
    }
    
    const actuallyWon = finalRoll >= 4;
    
    if (actuallyWon) {
      await addMoney(senderId, amount, 'Dice win', false); // 2x return (bet + win)
    } else {
      await removeMoney(senderId, amount, 'Dice loss');
    }
    
    // Update stats
    await updateUserData(senderId, {
      'stats.totalGambled': (user.stats?.totalGambled || 0) + amount
    });
    
    await checkAchievements(senderId, 'gambling', { 
      totalGambled: (user.stats?.totalGambled || 0) + amount 
    });
    
    const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const statusEmoji = actuallyWon ? '🎉' : '😞';
    
    await reply(`🎲 *Dice Roll Result* 🎲\n\n${diceEmojis[finalRoll - 1]} Rolled: ${finalRoll}\n🎯 Need: 4-6 to win\n${statusEmoji} ${actuallyWon ? 'You won!' : 'You lost!'}\n💰 ${actuallyWon ? '+' : '-'}${ecoSettings.currency}${amount.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing dice game. Please try again.*');
    console.error('Dice error:', error);
  }
}

// Slots Handler
async function handleSlots(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!ecoSettings.gamblingEnabled) {
      await reply('🚫 *Gambling is currently disabled*');
      return;
    }
    
    if (args.length === 0) {
      await reply(`🎰 *Slot Machine* 🎰\n\n💡 *Usage:* slots <amount>\n*Example:* slots 500\n\n🎯 Match 3 symbols to win!\n💎 Jackpot: ${ecoSettings.currency}${ecoSettings.slotJackpot.toLocaleString()}\n💰 Min bet: ${ecoSettings.currency}${ecoSettings.slotsMinBet}\n💰 Max bet: ${ecoSettings.currency}${ecoSettings.slotsMaxBet}`);
      return;
    }
    
    const amount = parseInt(args[0]);
    
    if (isNaN(amount) || amount < ecoSettings.slotsMinBet || amount > ecoSettings.slotsMaxBet) {
      await reply(`❌ *Invalid bet amount!*\n💰 Min: ${ecoSettings.currency}${ecoSettings.slotsMinBet} | Max: ${ecoSettings.currency}${ecoSettings.slotsMaxBet}`);
      return;
    }
    
    const user = await getUserData(senderId);
    if (user.balance < amount) {
      await reply(`❌ *Insufficient balance!*\n💰 Your balance: ${ecoSettings.currency}${user.balance.toLocaleString()}`);
      return;
    }
    
    // Slot symbols with different probabilities
    const symbols = ['🍒', '🍋', '🍊', '🍉', '⭐', '💎', '🔔', '7️⃣'];
    const weights = [25, 20, 20, 15, 10, 5, 3, 2]; // Higher numbers = more common
    
    function getRandomSymbol() {
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;
      
      for (let i = 0; i < symbols.length; i++) {
        if (random < weights[i]) {
          return symbols[i];
        }
        random -= weights[i];
      }
      return symbols[0];
    }
    
    // Spin the slots
    const slot1 = getRandomSymbol();
    const slot2 = getRandomSymbol();
    const slot3 = getRandomSymbol();
    
    let winAmount = 0;
    let winType = '';
    
    // Check for wins
    if (slot1 === slot2 && slot2 === slot3) {
      // Three of a kind
      switch (slot1) {
        case '🍒': winAmount = amount * 2; winType = 'Cherry Trio'; break;
        case '🍋': winAmount = amount * 3; winType = 'Lemon Trio'; break;
        case '🍊': winAmount = amount * 4; winType = 'Orange Trio'; break;
        case '🍉': winAmount = amount * 5; winType = 'Watermelon Trio'; break;
        case '⭐': winAmount = amount * 10; winType = 'Star Trio'; break;
        case '💎': winAmount = amount * 25; winType = 'Diamond Trio'; break;
        case '🔔': winAmount = amount * 50; winType = 'Bell Trio'; break;
        case '7️⃣': winAmount = ecoSettings.slotJackpot; winType = '🎰 JACKPOT! 🎰'; break;
      }
    } else if ((slot1 === slot2) || (slot2 === slot3) || (slot1 === slot3)) {
      // Two of a kind - small win
      winAmount = Math.floor(amount * 0.5);
      winType = 'Pair';
    }
    
    // Apply gambling luck
    if (user.activeEffects?.gamblingLuck && user.activeEffects.gamblingLuck > Date.now() && winAmount === 0) {
      if (Math.random() < 0.2) { // 20% chance to force a small win
        winAmount = Math.floor(amount * 0.8);
        winType = 'Lucky Break!';
      }
    }
    
    // Process result
    if (winAmount > 0) {
      await addMoney(senderId, winAmount, `Slots ${winType}`, false);
    } else {
      await removeMoney(senderId, amount, 'Slots loss');
    }
    
    // Update stats
    const isJackpot = winType.includes('JACKPOT');
    await updateUserData(senderId, {
      'stats.totalGambled': (user.stats?.totalGambled || 0) + amount
    });
    
    await checkAchievements(senderId, 'gambling', { 
      totalGambled: (user.stats?.totalGambled || 0) + amount,
      jackpot: isJackpot
    });
    
    const resultText = `🎰 *SLOT MACHINE* 🎰\n\n┌─────────────┐\n│ ${slot1} │ ${slot2} │ ${slot3} │\n└─────────────┘\n\n${winAmount > 0 ? '🎉' : '😞'} ${winType || 'No match'}\n💰 ${winAmount > 0 ? '+' : '-'}${ecoSettings.currency}${(winAmount || amount).toLocaleString()}`;
    
    await reply(resultText);
  } catch (error) {
    await reply('❌ *Error processing slots. Please try again.*');
    console.error('Slots error:', error);
  }
}// plugins/economy_enhanced.js - Enhanced Economy plugin with all features
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';

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
  BUSINESSES: 'economy_businesses',
  CRYPTO: 'economy_crypto',
  MARKET_HISTORY: 'economy_market_history'
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
    await db.collection(COLLECTIONS.CRYPTO).createIndex({ symbol: 1 }, { unique: true });
    
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
  guessMinBet: 50,
  guessMaxBet: 10000,
  
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
  newsTags: 'investors', // all, investors, off
  
  // Shop Settings
  shopEnabled: true,
  itemEffectDuration: {
    workBoost: 86400000, // 24 hours
    bodyguard: 172800000, // 48 hours
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
          maxDailyStreak: 0,
          lotteriesWon: 0,
          heistsSuccessful: 0
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
        lastBusinessCollect: null,
        
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
          maxDailyStreak: 0,
          lotteriesWon: 0,
          heistsSuccessful: 0
        },
        achievements: [],
        investments: {
          stocks: {},
          crypto: {},
          businesses: []
        },
        lastBusinessCollect: null
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
  workBoost: {
    name: "Work Boost",
    price: 3000,
    description: "Double work earnings for 24 hours",
    type: "consumable",
    effect: "workBoost",
    emoji: "⚡"
  },
  bodyguard: {
    name: "Bodyguard",
    price: 8000,
    description: "Prevents robberies for 48 hours 🥷🛡️",
    type: "consumable", 
    effect: "bodyguard",
    emoji: "🥷"
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

// Case-insensitive shop item lookup
const SHOP_ITEMS_LOWER = {};
for (const key in SHOP_ITEMS) {
  SHOP_ITEMS_LOWER[key.toLowerCase()] = key;
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
  },
  cryptoWhale: {
    name: "Crypto Whale",
    description: "Accumulate 100,000 in crypto value",
    reward: 25000,
    emoji: "🐋"
  },
  heistMaster: {
    name: "Heist Master",
    description: "Successfully complete 10 heists",
    reward: 30000,
    emoji: "🕵️"
  },
  lotteryLuck: {
    name: "Lottery Luck",
    description: "Win the lottery",
    reward: 10000,
    emoji: "🎟️"
  }
};

// Utility functions
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
        
      case 'crypto':
        const cryptoValue = await calculateCryptoValue(user.investments.crypto || {});
        if (cryptoValue >= 100000 && !user.achievements.includes('cryptoWhale')) {
          newAchievements.push('cryptoWhale');
        }
        break;
        
      case 'heist':
        if (data.successful && data.successfulCount >= 10 && !user.achievements.includes('heistMaster')) {
          newAchievements.push('heistMaster');
        }
        break;
        
      case 'lottery':
        if (data.won && !user.achievements.includes('lotteryLuck')) {
          newAchievements.push('lotteryLuck');
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
    const itemIndex = user.inventory.findIndex(item => item.id.toLowerCase() === itemId.toLowerCase());
    
    if (itemIndex === -1) {
      return { success: false, message: 'Item not found in inventory' };
    }
    
    const item = user.inventory[itemIndex];
    const actualKey = SHOP_ITEMS_LOWER[item.id.toLowerCase()];
    const shopItem = SHOP_ITEMS[actualKey];
    
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

// Market update function for daily volatility and news
async function updateMarket(sock, from) {
  try {
    const today = getCurrentDate();
    const currentWeek = getNigeriaTime().isoWeek();
    
    const marketSettings = await db.collection(COLLECTIONS.SETTINGS).findOne({ type: 'market' }) || { lastDaily: '', lastWeekly: 0 };
    
    let needsDailyUpdate = marketSettings.lastDaily !== today;
    let needsWeeklyUpdate = marketSettings.lastWeekly !== currentWeek;
    
    if (!needsDailyUpdate && !needsWeeklyUpdate) return;
    
    // Update stocks (existing mock, but add history)
    const stocks = {
      AAPL: { name: 'Apple Inc.', price: 150, volatility: ecoSettings.stockMarketVolatility },
      GOOGL: { name: 'Alphabet Inc.', price: 2800, volatility: ecoSettings.stockMarketVolatility },
      TSLA: { name: 'Tesla Inc.', price: 800, volatility: ecoSettings.stockMarketVolatility },
      AMZN: { name: 'Amazon.com Inc.', price: 3300, volatility: ecoSettings.stockMarketVolatility },
      MSFT: { name: 'Microsoft Corp.', price: 300, volatility: ecoSettings.stockMarketVolatility }
    };
    
    // Get cryptos from DB (overhauled)
    let cryptos = await db.collection(COLLECTIONS.CRYPTO).find().toArray();
    if (cryptos.length === 0) {
      // Seed default cryptos
      cryptos = [
        { symbol: 'BTC', name: 'Bitcoin', price: 60000, volatility: ecoSettings.cryptoVolatility },
        { symbol: 'ETH', name: 'Ethereum', price: 4000, volatility: ecoSettings.cryptoVolatility },
        { symbol: 'SOL', name: 'Solana', price: 200, volatility: ecoSettings.cryptoVolatility },
        { symbol: 'ADA', name: 'Cardano', price: 1.5, volatility: ecoSettings.cryptoVolatility },
        { symbol: 'DOGE', name: 'Dogecoin', price: 0.25, volatility: ecoSettings.cryptoVolatility * 1.5 } // Higher volatility
      ];
      await db.collection(COLLECTIONS.CRYPTO).insertMany(cryptos);
    }
    
    // Businesses overhaul - fixed businesses with levels
    const businesses = [
      { id: 'cafe', name: 'Cafe', basePrice: 50000, roi: 0.05, maxLevel: 5 },
      { id: 'shop', name: 'Retail Shop', basePrice: 100000, roi: 0.07, maxLevel: 5 },
      { id: 'factory', name: 'Factory', basePrice: 250000, roi: 0.10, maxLevel: 5 },
      { id: 'hotel', name: 'Hotel', basePrice: 500000, roi: 0.12, maxLevel: 5 },
      { id: 'tech', name: 'Tech Startup', basePrice: 1000000, roi: 0.15, maxLevel: 5 }
    ];
    
    if (needsDailyUpdate) {
      let stockNews = '📈 *DAILY STOCK NEWS* 📈\n\n';
      let cryptoNews = '🪙 *DAILY CRYPTO NEWS* 🪙\n\n';
      let businessNews = '🏢 *DAILY BUSINESS NEWS* 🏢\n\n';
      
      // Update stocks
      for (const symbol in stocks) {
        const change = (Math.random() - 0.5) * stocks[symbol].volatility * stocks[symbol].price;
        stocks[symbol].price += change;
        stocks[symbol].price = Math.max(0.01, stocks[symbol].price);
        const percent = (change / (stocks[symbol].price - change) * 100).toFixed(2);
        const color = change >= 0 ? '🟢' : '🔴';
        stockNews += `${color} *${symbol}*: ${ecoSettings.currency}${stocks[symbol].price.toFixed(2)} (${percent}%)\n`;
      }
      
      // Update cryptos
      const cryptoChanges = {};
      for (let crypto of cryptos) {
        const change = (Math.random() - 0.5) * crypto.volatility * crypto.price;
        crypto.price += change;
        crypto.price = Math.max(0.01, crypto.price);
        const percent = (change / (crypto.price - change) * 100).toFixed(2);
        const color = change >= 0 ? '🟢' : '🔴';
        cryptoNews += `${color} *${crypto.symbol}*: ${ecoSettings.currency}${crypto.price.toFixed(2)} (${percent}%)\n`;
        cryptoChanges[crypto.symbol] = { change, percent, color };
        await db.collection(COLLECTIONS.CRYPTO).updateOne({ symbol: crypto.symbol }, { $set: { price: crypto.price } });
      }
      
      // Business income collection - users collect manually, but news on market
      const businessEvent = Math.random() < 0.2 ? 'Boom! Businesses +10% ROI today' : Math.random() < 0.1 ? 'Slump: Businesses -5% ROI today' : 'Stable business day';
      businessNews += `📊 *Market Event:* ${businessEvent}\n`;
      
      // Save updates
      await db.collection(COLLECTIONS.SETTINGS).updateOne({ type: 'market' }, { $set: { lastDaily: today } }, { upsert: true });
      
      // Send news with tags
      if (ecoSettings.newsTags !== 'off') {
        const mentions = await getNewsMentions(ecoSettings.newsTags);
        if (mentions.length > 0) {
          await sock.sendMessage(from, { text: stockNews, mentions });
          await sock.sendMessage(from, { text: cryptoNews, mentions });
          await sock.sendMessage(from, { text: businessNews, mentions });
        }
      }
    }
    
    if (needsWeeklyUpdate) {
      // Weekly summaries
      let weeklyCrypto = '📅 *WEEKLY CRYPTO SUMMARY* 📅\n\n';
      cryptos.forEach(crypto => {
        // Assume history in DB, but for simplicity, fake
        const weeklyChange = (Math.random() - 0.5) * 20;
        const color = weeklyChange >= 0 ? '🟢' : '🔴';
        weeklyCrypto += `${color} *${crypto.symbol}*: ${weeklyChange.toFixed(2)}% this week\n`;
      });
      
      let weeklyBusiness = '📅 *WEEKLY BUSINESS SUMMARY* 📅\n\n';
      businesses.forEach(biz => {
        const weeklyROI = ecoSettings.businessROI + (Math.random() - 0.5) * 0.02;
        weeklyBusiness += `🏢 *${biz.name}*: ROI ${ (weeklyROI * 100).toFixed(2) }%\n`;
      });
      
      await db.collection(COLLECTIONS.SETTINGS).updateOne({ type: 'market' }, { $set: { lastWeekly: currentWeek } }, { upsert: true });
      
      if (ecoSettings.newsTags !== 'off') {
        const mentions = await getNewsMentions(ecoSettings.newsTags);
        if (mentions.length > 0) {
          await sock.sendMessage(from, { text: weeklyCrypto, mentions });
          await sock.sendMessage(from, { text: weeklyBusiness, mentions });
        }
      }
    }
  } catch (error) {
    console.error('Market update error:', error);
  }
}

// Helper for news mentions
async function getNewsMentions(mode) {
  try {
    if (mode === 'all') {
      const users = await db.collection(COLLECTIONS.USERS).find().toArray();
      return users.map(u => u.userId);
    } else if (mode === 'investors') {
      const investors = await db.collection(COLLECTIONS.USERS).find({ 
        $or: [
          { 'investments.crypto': { $exists: true, $ne: {} } },
          { 'investments.stocks': { $exists: true, $ne: {} } },
          { 'investments.businesses.0': { $exists: true } }
        ]
      }).toArray();
      return investors.map(u => u.userId);
    }
    return [];
  } catch (error) {
    console.error('Error getting news mentions:', error);
    return [];
  }
}

// Calculate crypto value
async function calculateCryptoValue(portfolio) {
  try {
    let value = 0;
    const cryptos = await db.collection(COLLECTIONS.CRYPTO).find().toArray();
    cryptos.forEach(crypto => {
      if (portfolio[crypto.symbol]) {
        value += portfolio[crypto.symbol] * crypto.price;
      }
    });
    return value;
  } catch (error) {
    console.error('Error calculating crypto value:', error);
    return 0;
  }
}

// ===========================================
// HANDLER FUNCTIONS
// ===========================================

// Balance Handler
async function handleBalance(context, args) {
  const { reply, senderId } = context;
  
  try {
    let targetUserId = senderId;
    
    // Check if viewing another user's balance
    if (args.length > 0) {
      const targetUser = getTargetUser(context.m, args.join(' '));
      if (targetUser) {
        targetUserId = targetUser;
      }
    }
    
    const user = await getUserData(targetUserId);
    const isOwnBalance = targetUserId === senderId;
    const userName = targetUserId === senderId ? 'Your' : `User's`;
    
    // Calculate total wealth
    const totalWealth = user.balance + user.bank + (user.vault || 0);
    
    // Active effects display
    let effectsText = '';
    if (user.activeEffects && Object.keys(user.activeEffects).length > 0) {
      effectsText = '\n\n🔮 *Active Effects:*\n';
      for (const [effect, expiry] of Object.entries(user.activeEffects)) {
        if (typeof expiry === 'boolean') {
          effectsText += `• ${effect}: Permanent\n`;
        } else if (expiry > Date.now()) {
          const timeLeft = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60));
          effectsText += `• ${effect}: ${timeLeft}h left\n`;
        }
      }
    }
    
    const balanceText = `💰 *${userName} Balance* 💰\n\n` +
                       `💵 *Wallet:* ${ecoSettings.currency}${user.balance.toLocaleString()}\n` +
                       `🏦 *Bank:* ${ecoSettings.currency}${user.bank.toLocaleString()}\n` +
                       (isOwnBalance ? `🔐 *Vault:* ${ecoSettings.currency}${(user.vault || 0).toLocaleString()}\n` : '') +
                       `💎 *Total Wealth:* ${ecoSettings.currency}${totalWealth.toLocaleString()}\n` +
                       (user.rank ? `🏆 *Rank:* ${user.rank}\n` : '') +
                       (user.customTitle ? `📛 *Title:* ${user.customTitle}\n` : '') +
                       effectsText;
    
    await reply(balanceText);
  } catch (error) {
    await reply('❌ *Error fetching balance. Please try again.*');
    console.error('Balance error:', error);
  }
}

// Send Money Handler
async function handleSend(context, args) {
  const { reply, senderId, m } = context;
  
  try {
    if (args.length < 2) {
      await reply('❌ *Usage:* send @user amount\n*Example:* send @user 1000');
      return;
    }
    
    const targetUser = getTargetUser(m, args[0]);
    if (!targetUser) {
      await reply('❌ *Please mention a valid user or provide phone number*');
      return;
    }
    
    if (targetUser === senderId) {
      await reply('❌ *You cannot send money to yourself!*');
      return;
    }
    
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) {
      await reply('❌ *Please provide a valid amount*');
      return;
    }
    
    const senderData = await getUserData(senderId);
    if (senderData.balance < amount) {
      await reply(`❌ *Insufficient balance!*\n💰 Your balance: ${ecoSettings.currency}${senderData.balance.toLocaleString()}`);
      return;
    }
    
    // Initialize target user if needed
    await initUser(targetUser);
    
    // Transfer money
    await removeMoney(senderId, amount, 'Transfer sent');
    await addMoney(targetUser, amount, 'Transfer received', false);
    
    await reply(`✅ *Transfer successful!*\n💸 Sent ${ecoSettings.currency}${amount.toLocaleString()} to user\n💰 Your new balance: ${ecoSettings.currency}${(senderData.balance - amount).toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing transfer. Please try again.*');
    console.error('Send error:', error);
  }
}

// Deposit Handler
async function handleDeposit(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (args.length === 0) {
      await reply('❌ *Usage:* deposit <amount>\n*Example:* deposit 5000');
      return;
    }
    
    let amount;
    if (args[0].toLowerCase() === 'all') {
      const user = await getUserData(senderId);
      amount = user.balance;
    } else {
      amount = parseInt(args[0]);
    }
    
    if (isNaN(amount) || amount <= 0) {
      await reply('❌ *Please provide a valid amount*');
      return;
    }
    
    const user = await getUserData(senderId);
    if (user.balance < amount) {
      await reply(`❌ *Insufficient wallet balance!*\n💰 Wallet balance: ${ecoSettings.currency}${user.balance.toLocaleString()}`);
      return;
    }
    
    if (user.bank + amount > ecoSettings.maxBankBalance) {
      await reply(`❌ *Bank deposit limit exceeded!*\n🏦 Max bank balance: ${ecoSettings.currency}${ecoSettings.maxBankBalance.toLocaleString()}`);
      return;
    }
    
    // Process deposit
    const newBalance = user.balance - amount;
    const newBank = user.bank + amount;
    
    await updateUserData(senderId, {
      balance: newBalance,
      bank: newBank
    });
    
    // Log transaction
    await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({
      userId: senderId,
      type: 'deposit',
      amount,
      reason: 'Bank deposit',
      balanceBefore: user.balance,
      balanceAfter: newBalance,
      bankBefore: user.bank,
      bankAfter: newBank,
      timestamp: new Date()
    });
    
    await reply(`✅ *Deposit successful!*\n💰 Deposited: ${ecoSettings.currency}${amount.toLocaleString()}\n💵 Wallet: ${ecoSettings.currency}${newBalance.toLocaleString()}\n🏦 Bank: ${ecoSettings.currency}${newBank.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing deposit. Please try again.*');
    console.error('Deposit error:', error);
  }
}

// Withdraw Handler
async function handleWithdraw(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (args.length === 0) {
      await reply('❌ *Usage:* withdraw <amount>\n*Example:* withdraw 5000');
      return;
    }
    
    let amount;
    if (args[0].toLowerCase() === 'all') {
      const user = await getUserData(senderId);
      amount = user.bank;
    } else {
      amount = parseInt(args[0]);
    }
    
    if (isNaN(amount) || amount <= 0) {
      await reply('❌ *Please provide a valid amount*');
      return;
    }
    
    const user = await getUserData(senderId);
    if (user.bank < amount) {
      await reply(`❌ *Insufficient bank balance!*\n🏦 Bank balance: ${ecoSettings.currency}${user.bank.toLocaleString()}`);
      return;
    }
    
    if (user.balance + amount > ecoSettings.maxWalletBalance) {
      await reply(`❌ *Wallet limit exceeded!*\n💰 Max wallet balance: ${ecoSettings.currency}${ecoSettings.maxWalletBalance.toLocaleString()}`);
      return;
    }
    
    // Process withdrawal
    const newBalance = user.balance + amount;
    const newBank = user.bank - amount;
    
    await updateUserData(senderId, {
      balance: newBalance,
      bank: newBank
    });
    
    // Log transaction
    await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({
      userId: senderId,
      type: 'withdrawal',
      amount,
      reason: 'Bank withdrawal',
      balanceBefore: user.balance,
      balanceAfter: newBalance,
      bankBefore: user.bank,
      bankAfter: newBank,
      timestamp: new Date()
    });
    
    await reply(`✅ *Withdrawal successful!*\n💰 Withdrawn: ${ecoSettings.currency}${amount.toLocaleString()}\n💵 Wallet: ${ecoSettings.currency}${newBalance.toLocaleString()}\n🏦 Bank: ${ecoSettings.currency}${newBank.toLocaleString()}`);
  } catch (error) {
    await reply('❌ *Error processing withdrawal. Please try again.*');
    console.error('Withdraw error:', error);
  }
}
