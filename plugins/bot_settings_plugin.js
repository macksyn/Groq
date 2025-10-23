// plugins/bot-settings.js - Comprehensive Bot Control Panel (V3)
import { PluginHelpers } from '../lib/pluginIntegration.js';
import os from 'os';
import moment from 'moment-timezone';

// Plugin metadata
export const info = {
  name: 'Bot Control Panel',
  version: '1.0.0',
  author: 'Alex Macksyn',
  description: 'Complete bot settings and control panel with persistent storage',
  category: 'owner',
  commands: ['settings', 'mode', 'plugins', 'admins', 'stats', 'ping', 'restart', 'shutdown'],
  aliases: ['set', 'config', 'control'],
  ownerOnly: true
};

// Settings collection name
const SETTINGS_COLLECTION = 'bot_settings';
const ADMINS_COLLECTION = 'bot_admins';

// Main plugin function
export default async function botSettingsPlugin(context) {
  const { msg: m, args, text, command, sock, db, config, bot, logger, helpers } = context;
  const { PermissionHelpers, TimeHelpers } = helpers;

  // Permission check (owner or admin)
  const isOwner = PermissionHelpers.isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net');
  let isAdmin = false;
  
  try {
    const admins = await getAdmins();
    isAdmin = admins.some(admin => admin.phone === m.sender.replace('@s.whatsapp.net', ''));
  } catch (error) {
    logger.warn('Failed to check admin status:', error.message);
  }

  if (!isOwner && !isAdmin) {
    return m.reply('🔒 *Access Denied*\n\nThis command is only available to the bot owner and authorized admins.');
  }

  // Command routing
  switch (command.toLowerCase()) {
    case 'settings':
    case 'set':
    case 'config':
      await handleSettings(m, args, sock, config, bot, logger);
      break;
      
    case 'mode':
      await handleModeSwitch(m, args, sock, config, logger);
      break;
      
    case 'plugins':
      await handlePluginManagement(m, args, sock, bot, logger);
      break;
      
    case 'admins':
      await handleAdminManagement(m, args, sock, config, logger, isOwner);
      break;
      
    case 'stats':
      await handleStats(m, sock, bot, config, logger);
      break;
      
    case 'ping':
      await handlePing(m, sock, db, logger);
      break;
      
    case 'restart':
      await handleRestart(m, sock, bot, logger, isOwner);
      break;
      
    case 'shutdown':
      await handleShutdown(m, sock, bot, logger, isOwner);
      break;
      
    default:
      await showMainMenu(m, sock, config);
  }
}

// ==================== HELPER FUNCTIONS ====================

// Get bot settings from database
async function getBotSettings() {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(SETTINGS_COLLECTION);
      let settings = await collection.findOne({ _id: 'general' });
      
      if (!settings) {
        settings = {
          _id: 'general',
          mode: 'public',
          autoRead: true,
          autoReact: true,
          welcome: true,
          antilink: false,
          rejectCall: true,
          autoBio: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await collection.insertOne(settings);
      }
      
      return settings;
    });
  } catch (error) {
    console.error('Failed to get settings:', error.message);
    return null;
  }
}

// Update bot settings in database
async function updateBotSettings(updates) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(SETTINGS_COLLECTION);
      return await collection.updateOne(
        { _id: 'general' },
        { 
          $set: { 
            ...updates, 
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );
    });
  } catch (error) {
    console.error('Failed to update settings:', error.message);
    return null;
  }
}

// Get admins from database
async function getAdmins() {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(ADMINS_COLLECTION);
      return await collection.find({}).toArray();
    });
  } catch (error) {
    console.error('Failed to get admins:', error.message);
    return [];
  }
}

// Add admin to database
async function addAdmin(phone, name, addedBy) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(ADMINS_COLLECTION);
      
      const existing = await collection.findOne({ phone });
      if (existing) return { success: false, message: 'Admin already exists' };
      
      await collection.insertOne({
        phone,
        name,
        addedBy,
        addedAt: new Date(),
        active: true
      });
      
      return { success: true, message: 'Admin added successfully' };
    });
  } catch (error) {
    console.error('Failed to add admin:', error.message);
    return { success: false, message: error.message };
  }
}

// Remove admin from database
async function removeAdmin(phone) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(ADMINS_COLLECTION);
      
      const result = await collection.deleteOne({ phone });
      
      if (result.deletedCount === 0) {
        return { success: false, message: 'Admin not found' };
      }
      
      return { success: true, message: 'Admin removed successfully' };
    });
  } catch (error) {
    console.error('Failed to remove admin:', error.message);
    return { success: false, message: error.message };
  }
}

// ==================== COMMAND HANDLERS ====================

// Main settings menu
async function handleSettings(m, args, sock, config, bot, logger) {
  if (args.length === 0) {
    return showMainMenu(m, sock, config);
  }

  const setting = args[0].toLowerCase();
  const value = args[1]?.toLowerCase();

  const settings = await getBotSettings();
  if (!settings) {
    return m.reply('❌ Failed to load settings from database.');
  }

  const booleanSettings = {
    autoread: 'autoRead',
    autoreact: 'autoReact',
    welcome: 'welcome',
    antilink: 'antilink',
    rejectcall: 'rejectCall',
    autobio: 'autoBio'
  };

  if (booleanSettings[setting]) {
    if (!value || !['on', 'off', 'true', 'false'].includes(value)) {
      return m.reply(`❌ Invalid value. Use: *on/off* or *true/false*\n\nExample: *.settings ${setting} on*`);
    }

    const newValue = ['on', 'true'].includes(value);
    const fieldName = booleanSettings[setting];
    
    await updateBotSettings({ [fieldName]: newValue });
    
    return m.reply(`✅ *Setting Updated*\n\n📝 ${fieldName}: ${newValue ? '✅ Enabled' : '❌ Disabled'}\n\n💾 Settings saved to database.`);
  }

  return m.reply(`❌ Unknown setting: *${setting}*\n\nType *.settings* to see available options.`);
}

// Show main menu
async function showMainMenu(m, sock, config) {
  const settings = await getBotSettings();
  const admins = await getAdmins();
  
  const menu = `╭─────────────────────╮
│   ⚙️ *BOT CONTROL PANEL*   │
╰─────────────────────╯

📊 *Current Settings:*
• Mode: ${settings?.mode || config.MODE}
• Auto Read: ${settings?.autoRead ? '✅' : '❌'}
• Auto React: ${settings?.autoReact ? '✅' : '❌'}
• Welcome: ${settings?.welcome ? '✅' : '❌'}
• Anti-Link: ${settings?.antilink ? '✅' : '❌'}
• Reject Call: ${settings?.rejectCall ? '✅' : '❌'}
• Auto Bio: ${settings?.autoBio ? '✅' : '❌'}

👥 *Admins:* ${admins.length}
📍 *Prefix:* ${config.PREFIX}

╭─────────────────────╮
│      🎛️ *COMMANDS*      │
╰─────────────────────╯

*🔧 Settings Management:*
• ${config.PREFIX}settings [option] [on/off]
• ${config.PREFIX}mode [public/private]

*🔌 Plugin Control:*
• ${config.PREFIX}plugins list
• ${config.PREFIX}plugins enable [name]
• ${config.PREFIX}plugins disable [name]
• ${config.PREFIX}plugins stats

*👥 Admin Management:*
• ${config.PREFIX}admins list
• ${config.PREFIX}admins add @user
• ${config.PREFIX}admins remove @user

*📊 System Monitoring:*
• ${config.PREFIX}stats - Full system stats
• ${config.PREFIX}ping - Check latency

*🔴 System Control:*
• ${config.PREFIX}restart - Restart bot
• ${config.PREFIX}shutdown - Stop bot

╭─────────────────────╮
│   💡 *EXAMPLES*        │
╰─────────────────────╯

\`\`\`
${config.PREFIX}settings autoread on
${config.PREFIX}mode private
${config.PREFIX}plugins disable fun
${config.PREFIX}admins add @2348089782988
${config.PREFIX}stats
\`\`\`

💾 All settings are saved to database and persist across restarts.`;

  return m.reply(menu);
}

// Handle mode switching
async function handleModeSwitch(m, args, sock, config, logger) {
  if (args.length === 0) {
    const settings = await getBotSettings();
    const currentMode = settings?.mode || config.MODE;
    
    return m.reply(`🔧 *Bot Mode*\n\nCurrent: *${currentMode.toUpperCase()}*\n\n• Public - Bot responds to everyone\n• Private - Bot only responds to owner/admins\n\nUsage: *.mode [public/private]*`);
  }

  const newMode = args[0].toLowerCase();
  
  if (!['public', 'private'].includes(newMode)) {
    return m.reply('❌ Invalid mode. Use: *public* or *private*');
  }

  await updateBotSettings({ mode: newMode });
  
  logger.info(`Mode switched to: ${newMode}`);
  
  return m.reply(`✅ *Mode Updated*\n\n🔧 Bot mode set to: *${newMode.toUpperCase()}*\n\n${newMode === 'private' ? '🔒 Bot will only respond to owner and admins' : '🌐 Bot will respond to everyone'}\n\n💾 Setting saved to database.`);
}

// Handle plugin management
async function handlePluginManagement(m, args, sock, bot, logger) {
  const pluginManager = bot.getPluginManager();
  
  if (!pluginManager) {
    return m.reply('❌ Plugin manager not available');
  }

  const action = args[0]?.toLowerCase();

  if (!action || action === 'list') {
    const plugins = await pluginManager.getAllPlugins();
    
    let message = `📦 *Plugin Management*\n\n`;
    message += `Total: ${plugins.length}\n`;
    message += `Enabled: ${plugins.filter(p => p.enabled).length}\n`;
    message += `Disabled: ${plugins.filter(p => !p.enabled).length}\n\n`;
    
    message += `*📋 Plugin List:*\n\n`;
    
    plugins.forEach((plugin, index) => {
      const status = plugin.enabled ? '✅' : '❌';
      const crashes = plugin.stats.crashes > 0 ? `⚠️ ${plugin.stats.crashes}` : '';
      message += `${index + 1}. ${status} *${plugin.name}*\n`;
      message += `   📂 ${plugin.filename}\n`;
      message += `   📊 Runs: ${plugin.stats.executions} ${crashes}\n\n`;
    });
    
    message += `\n*💡 Commands:*\n`;
    message += `• .plugins enable [filename]\n`;
    message += `• .plugins disable [filename]\n`;
    message += `• .plugins stats\n`;
    
    return m.reply(message);
  }

  if (action === 'stats') {
    const stats = pluginManager.getPluginStats();
    
    let message = `📊 *Plugin Statistics*\n\n`;
    message += `Total Plugins: ${stats.total}\n`;
    message += `✅ Enabled: ${stats.enabled}\n`;
    message += `❌ Disabled: ${stats.disabled}\n\n`;
    
    message += `*🔥 Top Plugins by Usage:*\n\n`;
    
    const topPlugins = stats.plugins
      .filter(p => p.executions > 0)
      .sort((a, b) => b.executions - a.executions)
      .slice(0, 5);
    
    topPlugins.forEach((plugin, index) => {
      message += `${index + 1}. ${plugin.name}\n`;
      message += `   Runs: ${plugin.executions}\n`;
      message += `   Crashes: ${plugin.crashes || 0}\n\n`;
    });
    
    return m.reply(message);
  }

  if (action === 'enable' || action === 'disable') {
    const filename = args[1];
    
    if (!filename) {
      return m.reply(`❌ Please specify plugin filename\n\nExample: *.plugins ${action} fun.js*`);
    }

    // This would require adding enable/disable methods to your PluginManager
    return m.reply(`⚠️ Plugin enable/disable feature requires PluginManager updates.\n\nManual method:\n1. Edit plugin state in database\n2. Restart bot with .restart`);
  }

  return m.reply(`❌ Unknown action: *${action}*\n\nAvailable: list, enable, disable, stats`);
}

// Handle admin management
async function handleAdminManagement(m, args, sock, config, logger, isOwner) {
  const action = args[0]?.toLowerCase();

  if (!action || action === 'list') {
    const admins = await getAdmins();
    const configAdmins = config.ADMIN_NUMBERS || [];
    
    let message = `👥 *Admin Management*\n\n`;
    message += `*🔧 Config Admins:* ${configAdmins.length}\n`;
    message += `*💾 Database Admins:* ${admins.length}\n\n`;
    
    message += `*📋 Database Admins:*\n\n`;
    
    if (admins.length === 0) {
      message += `_No database admins found_\n\n`;
    } else {
      admins.forEach((admin, index) => {
        message += `${index + 1}. *${admin.name || 'Unknown'}*\n`;
        message += `   📱 ${admin.phone}\n`;
        message += `   ➕ Added: ${moment(admin.addedAt).format('DD/MM/YYYY')}\n`;
        message += `   👤 By: ${admin.addedBy}\n\n`;
      });
    }
    
    message += `*💡 Commands:*\n`;
    message += `• .admins add @user\n`;
    message += `• .admins remove @user\n`;
    
    return m.reply(message);
  }

  // Only owner can add/remove admins
  if (!isOwner) {
    return m.reply('🔒 Only the bot owner can add or remove admins.');
  }

  if (action === 'add') {
    if (!m.mentions || m.mentions.length === 0) {
      return m.reply('❌ Please mention a user to add as admin\n\nExample: *.admins add @user*');
    }

    const userToAdd = m.mentions[0];
    const phone = userToAdd.replace('@s.whatsapp.net', '');
    
    try {
      const name = await sock.getName(userToAdd) || phone;
      const result = await addAdmin(phone, name, m.sender.split('@')[0]);
      
      if (result.success) {
        return m.reply(`✅ *Admin Added*\n\n👤 @${phone}\n📛 Name: ${name}\n\n💾 Saved to database.`, {
          mentions: [userToAdd]
        });
      } else {
        return m.reply(`❌ Failed to add admin: ${result.message}`);
      }
    } catch (error) {
      logger.error('Failed to add admin:', error.message);
      return m.reply(`❌ Error: ${error.message}`);
    }
  }

  if (action === 'remove') {
    if (!m.mentions || m.mentions.length === 0) {
      return m.reply('❌ Please mention a user to remove from admins\n\nExample: *.admins remove @user*');
    }

    const userToRemove = m.mentions[0];
    const phone = userToRemove.replace('@s.whatsapp.net', '');
    
    const result = await removeAdmin(phone);
    
    if (result.success) {
      return m.reply(`✅ *Admin Removed*\n\n👤 @${phone}\n\n💾 Updated in database.`, {
        mentions: [userToRemove]
      });
    } else {
      return m.reply(`❌ Failed to remove admin: ${result.message}`);
    }
  }

  return m.reply(`❌ Unknown action: *${action}*\n\nAvailable: list, add, remove`);
}

// Handle system stats
async function handleStats(m, sock, bot, config, logger) {
  try {
    await m.react('📊');
    
    const stats = bot.getStats();
    const dbHealth = await bot.getDatabase().healthCheck();
    
    // System info
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = ((usedMem / totalMem) * 100).toFixed(1);
    
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || 'Unknown';
    const cpuCores = cpus.length;
    
    // Uptime
    const uptimeSeconds = stats.uptime / 1000;
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    const message = `📊 *SYSTEM STATISTICS*

╭─────────────────────╮
│   🤖 *BOT STATUS*      │
╰─────────────────────╯

• Status: ${stats.status === 'connected' ? '✅ Online' : '❌ Offline'}
• Uptime: ${days}d ${hours}h ${minutes}m
• Mode: ${config.MODE.toUpperCase()}
• Prefix: ${config.PREFIX}

╭─────────────────────╮
│   💾 *MEMORY USAGE*    │
╰─────────────────────╯

• Heap Used: ${stats.memory.heapUsed} MB
• Heap Total: ${stats.memory.heapTotal} MB
• RSS: ${stats.memory.rss} MB
• System Used: ${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB (${memPercent}%)

╭─────────────────────╮
│   💻 *SYSTEM INFO*     │
╰─────────────────────╯

• Platform: ${os.platform()}
• Architecture: ${os.arch()}
• Node Version: ${process.version}
• CPU: ${cpuModel}
• Cores: ${cpuCores}
• Load Average: ${os.loadavg().map(l => l.toFixed(2)).join(', ')}

╭─────────────────────╮
│   🗄️ *DATABASE*        │
╰─────────────────────╯

• Status: ${dbHealth.healthy ? '✅ Connected' : '❌ Offline'}
• Ping: ${dbHealth.pingTime || 'N/A'} ms
• Collections: ${dbHealth.stats?.collections || 0}
• Documents: ${dbHealth.stats?.documents || 0}
• Data Size: ${dbHealth.stats?.dataSize || 0} MB

╭─────────────────────╮
│   🔌 *PLUGINS*         │
╰─────────────────────╯

• Total: ${stats.plugins.total}
• Enabled: ${stats.plugins.enabled}
• Disabled: ${stats.plugins.disabled}

╭─────────────────────╮
│   ⚡ *FEATURES*        │
╰─────────────────────╯

${stats.features.autoRead ? '✅' : '❌'} Auto Read
${stats.features.autoReact ? '✅' : '❌'} Auto React
${stats.features.welcome ? '✅' : '❌'} Welcome Messages
${stats.features.antilink ? '✅' : '❌'} Anti-Link
${stats.features.rejectCall ? '✅' : '❌'} Call Rejection
${stats.features.autoBio ? '✅' : '❌'} Auto Bio

⏰ ${moment().tz(config.TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}`;

    await m.reply(message);
    await m.react('✅');
    
  } catch (error) {
    logger.error('Stats command failed:', error.message);
    await m.react('❌');
    await m.reply('❌ Failed to fetch system statistics.');
  }
}

// Handle ping command
async function handlePing(m, sock, db, logger) {
  try {
    const start = Date.now();
    
    await m.react('🏓');
    
    // Test message sending latency
    const msgLatency = Date.now() - start;
    
    // Test database ping
    let dbPing = 'N/A';
    try {
      const dbStart = Date.now();
      await db.healthCheck();
      dbPing = `${Date.now() - dbStart} ms`;
    } catch (error) {
      dbPing = 'Offline';
    }
    
    const message = `🏓 *PONG!*

📊 *Latency Results:*

• Message: ${msgLatency} ms
• Database: ${dbPing}
• Process: ${process.uptime().toFixed(2)} s
• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB

⏰ ${moment().format('HH:mm:ss')}`;

    await m.reply(message);
    await m.react('✅');
    
  } catch (error) {
    logger.error('Ping command failed:', error.message);
    await m.reply('❌ Ping failed');
  }
}

// Handle bot restart
async function handleRestart(m, sock, bot, logger, isOwner) {
  if (!isOwner) {
    return m.reply('🔒 Only the bot owner can restart the bot.');
  }

  try {
    await m.reply('🔄 *Restarting Bot...*\n\nPlease wait 10-20 seconds...');
    await m.react('🔄');
    
    logger.info('Bot restart initiated by owner');
    
    setTimeout(() => {
      bot.emit('restart');
    }, 2000);
    
  } catch (error) {
    logger.error('Restart failed:', error.message);
    await m.reply('❌ Restart failed: ' + error.message);
  }
}

// Handle bot shutdown
async function handleShutdown(m, sock, bot, logger, isOwner) {
  if (!isOwner) {
    return m.reply('🔒 Only the bot owner can shutdown the bot.');
  }

  try {
    await m.reply('🛑 *Shutting Down Bot...*\n\nGoodbye! 👋');
    await m.react('🛑');
    
    logger.info('Bot shutdown initiated by owner');
    
    setTimeout(() => {
      bot.emit('shutdown');
    }, 2000);
    
  } catch (error) {
    logger.error('Shutdown failed:', error.message);
    await m.reply('❌ Shutdown failed: ' + error.message);
  }
}