// plugins/bot-settings.js - Comprehensive Bot Control Panel (V3 Format)
import { PluginHelpers } from '../lib/pluginIntegration.js';
import os from 'os';
import moment from 'moment-timezone';

// Settings collection name
const SETTINGS_COLLECTION = 'bot_settings';
const ADMINS_COLLECTION = 'bot_admins';
const BANNED_USERS_COLLECTION = 'bot_banned_users';

// ===== V3 PLUGIN EXPORT =====
export default {
  name: 'Bot Control Panel',
  version: '1.0.0',
  author: 'Alex Macksyn',
  description: 'Complete bot settings and control panel with persistent storage',
  category: 'owner',

  // Commands this plugin handles
  commands: ['settings', 'mode', 'plugins', 'admins', 'stats', 'ping', 'restart', 'shutdown', 'ban', 'unban'],
  aliases: ['set', 'config', 'control'],
  ownerOnly: true, // Note: The original logic allows admins too, but follows V3 convention

  // Main plugin handler
  async run(context) {
    const { msg: m, args, text, command, sock, db, config, bot, logger, helpers } = context;
    const { PermissionHelpers, TimeHelpers } = helpers;

    // Permission check (owner or admin) - retain original logic for flexibility
    const isOwner = PermissionHelpers.isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net');
    let isAdmin = false;

    try {
      const admins = await getAdmins();
      isAdmin = admins.some(admin => admin.phone === m.sender.replace('@s.whatsapp.net', ''));
    } catch (error) {
      logger.warn('Failed to check admin status:', error.message);
    }

    // Although ownerOnly is true in metadata, keep the code allowing admins as per original logic
    if (!isOwner && !isAdmin) {
      return m.reply('🔒 *Access Denied*\n\nThis command is only available to the bot owner and authorized admins.');
    }

    // Command routing - using the command passed in context
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
        await handlePing(m, sock, db, logger); // Note: db is passed in context
        break;

      case 'restart':
        await handleRestart(m, sock, bot, logger, isOwner);
        break;

      case 'shutdown':
        await handleShutdown(m, sock, bot, logger, isOwner);
        break;

      case 'ban':
        await handleBanUser(context, isOwner);
        break;
      
      case 'unban':
        await handleUnbanUser(context, isOwner);
        break;

      default:
        // If the command matched one of the plugin's commands but isn't handled above,
        // it might imply the main 'settings' menu should show, or it's an alias issue.
        // Assuming default shows the main menu if no specific subcommand is matched.
        await showMainMenu(m, sock, config);
    }
  }
};

// ==================== HELPER FUNCTIONS (Remain outside the exported object) ====================

// Get bot settings from database
async function getBotSettings() {
  try {
    // Use safeDBOperation from PluginHelpers passed in context if needed,
    // or assume it's globally available if your structure allows.
    // For simplicity here, assuming PluginHelpers is accessible.
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
    return null; // Return null or default object on error
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

// Gets all banned users from the database.
async function getBannedUsers() {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(BANNED_USERS_COLLECTION);
      return await collection.find({}).toArray();
    });
  } catch (error) {
    console.error('Failed to get banned users:', error.message);
    return [];
  }
}

// Checks if a user is banned.
export async function isUserBanned(phone) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(BANNED_USERS_COLLECTION);
      const bannedUser = await collection.findOne({ phone: phone });
      return !!bannedUser; // True if user is found, false otherwise
    });
  } catch (error) {
    console.error('Failed to check ban status:', error.message);
    return false; // Fail-safe: assume not banned if DB check fails
  }
}

// Bans a user, storing their info in the database.
async function banUser(phone, reason, bannedBy) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(BANNED_USERS_COLLECTION);
      
      const existing = await collection.findOne({ phone });
      if (existing) {
        return { success: false, message: 'User is already banned.' };
      }

      await collection.insertOne({
        phone,
        reason: reason || 'No reason provided.',
        bannedBy: bannedBy.split('@')[0],
        bannedAt: new Date(),
      });

      return { success: true, message: 'User banned successfully.' };
    });
  } catch (error) {
    console.error('Failed to ban user:', error.message);
    return { success: false, message: error.message };
  }
}

// Unbans a user by removing them from the database.
async function unbanUser(phone) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(BANNED_USERS_COLLECTION);

      const result = await collection.deleteOne({ phone });

      if (result.deletedCount === 0) {
        return { success: false, message: 'User is not banned.' };
      }

      return { success: true, message: 'User unbanned successfully.' };
    });
  } catch (error) {
    console.error('Failed to unban user:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Formats uptime in seconds into a human-readable string (Days, Hours, Minutes, Seconds).
 * @param {number} seconds - The total uptime in seconds.
 * @returns {string} Formatted uptime string.
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ==================== COMMAND HANDLER IMPLEMENTATIONS (Unchanged from original logic) ====================

// Main settings menu or specific setting handler
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

  // Map user-friendly names to database field names
  const booleanSettingsMap = {
    autoread: 'autoRead',
    autoreact: 'autoReact',
    welcome: 'welcome',
    antilink: 'antilink',
    rejectcall: 'rejectCall',
    autobio: 'autoBio'
  };

  if (booleanSettingsMap[setting]) {
    if (!value || !['on', 'off', 'true', 'false'].includes(value)) {
      return m.reply(`❌ Invalid value. Use: *on/off* or *true/false*\n\nExample: *.settings ${setting} on*`);
    }

    const newValue = ['on', 'true'].includes(value);
    const fieldName = booleanSettingsMap[setting];

    // Create update object dynamically
    const update = {};
    update[fieldName] = newValue;

    const result = await updateBotSettings(update);

    if (result && result.acknowledged) {
         // Update the live config if the bot instance allows it (optional, depends on your bot structure)
         if (bot && typeof bot.updateConfig === 'function') {
            bot.updateConfig({ [fieldName]: newValue });
         } else if (config) {
             // Directly modify the passed config object (less ideal but works if bot doesn't have update method)
             config[fieldName] = newValue;
         }

        return m.reply(`✅ *Setting Updated*\n\n📝 ${fieldName}: ${newValue ? '✅ Enabled' : '❌ Disabled'}\n\n💾 Settings saved to database.`);
    } else {
        return m.reply('❌ Failed to update setting in database.');
    }
  }

  return m.reply(`❌ Unknown setting: *${setting}*\n\nType *.settings* to see available options.`);
}


// Show main menu
async function showMainMenu(m, sock, config) {
  const settings = await getBotSettings();
  const admins = await getAdmins();
  const bannedCount = (await getBannedUsers()).length;

  // Use optional chaining and provide defaults
  const currentSettings = settings || {};
  const mode = currentSettings.mode || config.MODE || 'public';
  const autoRead = currentSettings.autoRead ?? (config.AUTO_READ === 'true');
  const autoReact = currentSettings.autoReact ?? (config.AUTO_REACT === 'true');
  const welcome = currentSettings.welcome ?? (config.WELCOME === 'true');
  const antilink = currentSettings.antilink ?? (config.ANTILINK === 'true');
  const rejectCall = currentSettings.rejectCall ?? (config.REJECT_CALL === 'true');
  const autoBio = currentSettings.autoBio ?? (config.AUTO_BIO === 'true');

  const menu = `╭─────────────────────╮
│   ⚙️ *BOT CONTROL PANEL* │
╰─────────────────────╯

📊 *Current Settings:*
• Mode: ${mode.toUpperCase()}
• Auto Read: ${autoRead ? '✅' : '❌'}
• Auto React: ${autoReact ? '✅' : '❌'}
• Welcome: ${welcome ? '✅' : '❌'}
• Anti-Link: ${antilink ? '✅' : '❌'}
• Reject Call: ${rejectCall ? '✅' : '❌'}
• Auto Bio: ${autoBio ? '✅' : '❌'}

👥 *Admins:* ${admins.length}
🚫 *Banned:* ${bannedCount}
📍 *Prefix:* ${config.PREFIX}

╭─────────────────────╮
│      🎛️ *COMMANDS* │
╰─────────────────────╯

*🔧 Settings Management:*
• ${config.PREFIX}settings [option] [on/off]
  Options: autoread, autoreact, welcome, antilink, rejectcall, autobio
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

*🚫 User Management (Owner Only):* (<!-- ADDED -->)
• ${config.PREFIX}ban [@user | number] [reason]
• ${config.PREFIX}unban [@user | number]

*📊 System Monitoring:*
• ${config.PREFIX}stats - Full system stats
• ${config.PREFIX}ping - Check latency

*🔴 System Control:*
• ${config.PREFIX}restart - Restart bot
• ${config.PREFIX}shutdown - Stop bot

╭─────────────────────╮
│   💡 *EXAMPLES* │
╰─────────────────────╯

\`\`\`
${config.PREFIX}settings autoread on
${config.PREFIX}mode private
${config.PREFIX}plugins disable fun.js
${config.PREFIX}admins add @2348089782988
${config.PREFIX}ban @user spamming
${config.PREFIX}unban 2348012345678
${config.PREFIX}stats
\`\`\`

💾 Settings are saved to database and persist restarts.`;

  return m.reply(menu);
}


// Handle mode switching
async function handleModeSwitch(m, args, sock, config, logger) {
  if (args.length === 0) {
    const settings = await getBotSettings();
    const currentMode = settings?.mode || config.MODE || 'public'; // Provide default

    return m.reply(`🔧 *Bot Mode*\n\nCurrent: *${currentMode.toUpperCase()}*\n\n• Public - Bot responds to everyone\n• Private - Bot only responds to owner/admins\n\nUsage: *.mode [public/private]*`);
  }

  const newMode = args[0].toLowerCase();

  if (!['public', 'private'].includes(newMode)) {
    return m.reply('❌ Invalid mode. Use: *public* or *private*');
  }

  const result = await updateBotSettings({ mode: newMode });

  if (result && result.acknowledged) {
    logger.info(`Mode switched to: ${newMode}`);
     // Update live config if possible
     if (config) config.MODE = newMode; // Update the passed config directly

    return m.reply(`✅ *Mode Updated*\n\n🔧 Bot mode set to: *${newMode.toUpperCase()}*\n\n${newMode === 'private' ? '🔒 Bot will only respond to owner and admins' : '🌐 Bot will respond to everyone'}\n\n💾 Setting saved to database.`);
  } else {
    logger.error('Failed to update mode in database.');
    return m.reply('❌ Failed to update mode setting.');
  }
}


// Handle plugin management
async function handlePluginManagement(m, args, sock, bot, logger) {
  // Check if bot instance and plugin manager exist
  if (!bot || typeof bot.getPluginManager !== 'function') {
      return m.reply('❌ Internal error: Bot instance or Plugin Manager is not available.');
  }
  const pluginManager = bot.getPluginManager();
  if (!pluginManager) {
      return m.reply('❌ Plugin manager has not been initialized.');
  }


  const action = args[0]?.toLowerCase();

  // LIST PLUGINS
  if (!action || action === 'list') {
    try {
      const plugins = await pluginManager.getAllPlugins(); // Assume this returns detailed info

      if (!plugins || plugins.length === 0) {
        return m.reply('📦 No plugins found or loaded.');
      }

      let message = `📦 *Plugin Management*\n\n`;
      const stats = pluginManager.getPluginStats(); // Assume this returns counts
      message += `Total: ${stats.total}\n`;
      message += `Enabled: ${stats.enabled}\n`;
      message += `Disabled: ${stats.disabled}\n\n`;

      message += `*📋 Plugin List:*\n\n`;

      plugins.forEach((plugin, index) => {
        const status = plugin.enabled ? '✅' : '❌';
        // Access nested stats safely
        const executions = plugin.stats?.executions || 0;
        const crashes = plugin.stats?.crashes || 0;
        const crashIndicator = crashes > 0 ? ` ⚠️ ${crashes}` : '';
        message += `${index + 1}. ${status} *${plugin.name || plugin.filename}*\n`;
        message += `   📂 ${plugin.filename}\n`;
        message += `   📊 Runs: ${executions}${crashIndicator}\n\n`;
      });

      message += `\n*💡 Commands:*\n`;
      message += `• .plugins enable [filename]\n`;
      message += `• .plugins disable [filename]\n`;
      message += `• .plugins stats\n`;

      return m.reply(message);
    } catch (error) {
      logger.error('Error listing plugins:', error);
      return m.reply('❌ Error fetching plugin list.');
    }
  }

  // PLUGIN STATS
  if (action === 'stats') {
    try {
      const stats = pluginManager.getPluginStats(); // Assume detailed stats here

      if (!stats || !stats.plugins || stats.plugins.length === 0) {
        return m.reply('📊 No plugin statistics available yet.');
      }

      let message = `📊 *Plugin Statistics*\n\n`;
      message += `Total Plugins: ${stats.total}\n`;
      message += `✅ Enabled: ${stats.enabled}\n`;
      message += `❌ Disabled: ${stats.disabled}\n\n`;

      message += `*🔥 Top Plugins by Usage:*\n\n`;

      // Sort plugins by executions, safely handling missing stats
      const sortedPlugins = [...stats.plugins].sort((a, b) => (b.stats?.executions || 0) - (a.stats?.executions || 0));

      const topPlugins = sortedPlugins
        .filter(p => (p.stats?.executions || 0) > 0)
        .slice(0, 5); // Show top 5

      if (topPlugins.length === 0) {
        message += '_No plugins have been executed yet._\n';
      } else {
        topPlugins.forEach((plugin, index) => {
          const executions = plugin.stats?.executions || 0;
          const crashes = plugin.stats?.crashes || 0;
          message += `${index + 1}. *${plugin.name || plugin.filename}*\n`;
          message += `   Runs: ${executions}\n`;
          message += `   Crashes: ${crashes}\n\n`;
        });
      }

      return m.reply(message);
    } catch (error) {
      logger.error('Error fetching plugin stats:', error);
      return m.reply('❌ Error fetching plugin statistics.');
    }
  }


  // ENABLE/DISABLE (Placeholder - requires PluginManager implementation)
  if (action === 'enable' || action === 'disable') {
    const filename = args[1];

    if (!filename) {
      return m.reply(`❌ Please specify plugin filename\n\nExample: *.plugins ${action} fun.js*`);
    }

    // Check if PluginManager has the required methods
    if (typeof pluginManager.enablePlugin !== 'function' || typeof pluginManager.disablePlugin !== 'function') {
         return m.reply(`⚠️ Plugin enable/disable feature not fully implemented in PluginManager.\n\nManual method:\n1. Edit plugin state in database ('plugin_state' collection)\n2. Restart bot with .restart`);
    }

    try {
        let result;
        if (action === 'enable') {
            result = await pluginManager.enablePlugin(filename);
        } else {
            result = await pluginManager.disablePlugin(filename);
        }

        if (result.success) {
            return m.reply(`✅ Plugin *${filename}* ${action}d successfully!\n\nBot might need a restart (.restart) for changes to fully apply.`);
        } else {
            return m.reply(`❌ Failed to ${action} plugin *${filename}*: ${result.message}`);
        }
    } catch (error) {
        logger.error(`Error ${action}ing plugin ${filename}:`, error);
        return m.reply(`❌ An error occurred while trying to ${action} the plugin.`);
    }
  }

  return m.reply(`❌ Unknown action: *${action}*\n\nAvailable: list, enable, disable, stats`);
}


// Handle admin management
async function handleAdminManagement(m, args, sock, config, logger, isOwner) {
  const action = args[0]?.toLowerCase();

  // LIST ADMINS
  if (!action || action === 'list') {
    try {
      const dbAdmins = await getAdmins(); // Fetch from DB
      const envAdminsRaw = config.ADMIN_NUMBERS || []; // Get raw numbers/strings from config
      const ownerNumber = config.OWNER_NUMBER || '';

      // Ensure envAdmins contains only valid numbers
      const envAdmins = (Array.isArray(envAdminsRaw) ? envAdminsRaw : envAdminsRaw.split(','))
                          .map(num => String(num).trim().replace(/\D/g, '')) // Clean and keep only digits
                          .filter(num => num.length >= 10); // Basic validation

      let message = `👥 *Admin Management*\n\n`;
      message += `👑 *Owner:* +${ownerNumber}\n`; // Display owner clearly

      // Display ENV Admins
      message += `\n🌍 *ENV Admins (${envAdmins.length}):*\n`;
      if (envAdmins.length === 0) {
        message += `_No admins defined in environment variables._\n`;
      } else {
        envAdmins.forEach((num, index) => {
          message += `${index + 1}. +${num} 🔐\n`;
        });
      }

      // Display Database Admins
      message += `\n💾 *Database Admins (${dbAdmins.length}):*\n`;
      if (dbAdmins.length === 0) {
        message += `_No admins added via commands._\n`;
      } else {
        dbAdmins.forEach((admin, index) => {
          message += `${index + 1}. *${admin.name || 'Unknown'}* (+${admin.phone})\n`;
          message += `   ➕ Added: ${moment(admin.addedAt).format('DD/MM/YYYY')}\n`;
          message += `   👤 By: ${admin.addedBy}\n\n`;
        });
      }

      message += `\n*💡 Commands (Owner Only):*\n`;
      message += `• .admins add @user\n`;
      message += `• .admins remove @user\n`;
      message += `\n_ENV admins 🔐 cannot be removed via command._`;

      return m.reply(message);

    } catch (error) {
      logger.error('Error listing admins:', error);
      return m.reply('❌ Error fetching admin list.');
    }
  }


  // --- OWNER ONLY ACTIONS BELOW ---
  if (!isOwner) {
    return m.reply('🔒 Only the bot owner can add or remove database admins.');
  }

  // ADD ADMIN
  if (action === 'add') {
    if (!m.mentions || m.mentions.length === 0) {
      return m.reply('❌ Please mention a user to add as admin\n\nExample: *.admins add @user*');
    }

    const userToAdd = m.mentions[0];
    const phone = userToAdd.replace('@s.whatsapp.net', '');

    // Prevent adding owner or ENV admins to DB
    if (phone === config.OWNER_NUMBER) return m.reply('❌ Owner cannot be added.');
    const envAdmins = getEnvAdmins();
    if (envAdmins.includes(phone)) return m.reply('❌ User is already an ENV admin.');


    try {
      const name = await sock.getName(userToAdd) || phone; // Get name or use phone
      const result = await addAdmin(phone, name, m.sender.split('@')[0]); // Pass phone number

      if (result.success) {
        return m.reply(`✅ *Admin Added*\n\n👤 @${phone}\n📛 Name: ${name}\n\n💾 Saved to database.`, {
          mentions: [userToAdd]
        });
      } else {
        return m.reply(`❌ Failed to add admin: ${result.message}`);
      }
    } catch (error) {
      logger.error('Failed to add admin:', error.message);
      return m.reply(`❌ Error adding admin: ${error.message}`);
    }
  }

  // REMOVE ADMIN
  if (action === 'remove') {
    if (!m.mentions || m.mentions.length === 0) {
      return m.reply('❌ Please mention a user to remove from admins\n\nExample: *.admins remove @user*');
    }

    const userToRemove = m.mentions[0];
    const phone = userToRemove.replace('@s.whatsapp.net', '');

    // Check if trying to remove ENV admin
    const envAdmins = getEnvAdmins();
     if (envAdmins.includes(phone)) {
        return m.reply('❌ Cannot remove ENV admin via command. Modify environment variables.');
     }


    const result = await removeAdmin(phone); // Use phone number

    if (result.success) {
      return m.reply(`✅ *Admin Removed*\n\n👤 @${phone}\n\n💾 Updated in database.`, {
        mentions: [userToRemove]
      });
    } else {
      // If not found in DB, specifically mention it.
      if (result.message === 'Admin not found') {
          return m.reply(`❌ User +${phone} is not a database admin.`);
      }
      return m.reply(`❌ Failed to remove admin: ${result.message}`);
    }
  }

  return m.reply(`❌ Unknown action: *${action}*\n\nAvailable: list, add, remove`);
}

/**
 * Handles the .ban command
 */
async function handleBanUser(context, isOwner) {
  const { msg: m, args, text, sock, config, logger } = context;

  if (!isOwner) {
    return m.reply('🔒 Only the bot owner can ban users.');
  }

  let userToBanJid = '';
  let reason = '';

  // Case 1: Ban by quoting a message
  if (m.quoted) {
    userToBanJid = m.quoted.sender;
    reason = text || 'No reason provided.';
  } 
  // Case 2: Ban by mentioning (@user)
  else if (m.mentions && m.mentions.length > 0) {
    userToBanJid = m.mentions[0];
    // Reason is everything after the mention
    const reasonArgs = args.slice(1);
    reason = reasonArgs.join(' ') || 'No reason provided.';
  }
  // Case 3: Ban by number (e.g., .ban 23480...)
  else if (args.length > 0) {
    const potentialNumber = args[0].replace(/[^0-9]/g, ''); // Clean the number
    if (potentialNumber.length > 9) { // Basic validation
      userToBanJid = `${potentialNumber}@s.whatsapp.net`;
      reason = args.slice(1).join(' ') || 'No reason provided.';
    }
  }

  if (!userToBanJid) {
    return m.reply('❌ *Invalid Usage*\n\nHow to ban:\n1. Reply to a user\'s message with `.ban [reason]`\n2. Mention a user with `.ban @user [reason]`\n3. Type the number `.ban 234... [reason]`');
  }

  const phone = userToBanJid.split('@')[0];

  // Prevent banning owner or admins
  if (phone === config.OWNER_NUMBER) {
    return m.reply('❌ You cannot ban the bot owner.');
  }
  // You might want to add a check for other admins here
  // const admins = await getAdmins();
  // if (admins.some(admin => admin.phone === phone)) {
  //   return m.reply('❌ You cannot ban another admin.');
  // }

  try {
    const result = await banUser(phone, reason, m.sender);

    if (result.success) {
      await m.reply(`🚫 *User Banned*\n\n👤 @${phone}\n📝 Reason: ${reason}\n\nThis user will no longer receive responses from the bot.`, {
        mentions: [userToBanJid]
      });
    } else {
      return m.reply(`❌ Failed to ban user: ${result.message}`);
    }
  } catch (error) {
    logger.error('Failed to ban user:', error.message);
    return m.reply(`❌ An error occurred while banning the user.`);
  }
}

/**
 * Handles the .unban command
 */
async function handleUnbanUser(context, isOwner) {
  const { msg: m, args, sock, logger } = context;

  if (!isOwner) {
    return m.reply('🔒 Only the bot owner can unban users.');
  }

  let userToUnbanJid = '';

  // Case 1: Unban by quoting
  if (m.quoted) {
    userToUnbanJid = m.quoted.sender;
  }
  // Case 2: Unban by mentioning
  else if (m.mentions && m.mentions.length > 0) {
    userToUnbanJid = m.mentions[0];
  }
  // Case 3: Unban by number
  else if (args.length > 0) {
    const potentialNumber = args[0].replace(/[^0-9]/g, '');
    if (potentialNumber.length > 9) {
      userToUnbanJid = `${potentialNumber}@s.whatsapp.net`;
    }
  }

  if (!userToUnbanJid) {
    return m.reply('❌ *Invalid Usage*\n\nHow to unban:\n1. Reply to a user\'s message with `.unban`\n2. Mention a user with `.unban @user`\n3. Type the number `.unban 234...`');
  }

  const phone = userToUnbanJid.split('@')[0];

  try {
    const result = await unbanUser(phone);

    if (result.success) {
      await m.reply(`✅ *User Unbanned*\n\n👤 @${phone}\n\nThis user can now interact with the bot again.`, {
        mentions: [userToUnbanJid]
      });
    } else {
      return m.reply(`❌ Failed to unban user: ${result.message}`);
    }
  } catch (error) {
    logger.error('Failed to unban user:', error.message);
    return m.reply(`❌ An error occurred while unbanning the user.`);
  }
}

// Handle system stats - Requires 'os' and 'moment' imports
async function handleStats(m, sock, bot, config, logger) {
  try {
    await m.react('📊');

    // Safely get bot stats, provide defaults if bot instance is missing methods
    let stats = {}; // Default empty stats object
    let botStatus = '❓ Unknown';
    let botUptimeMs = process.uptime() * 1000; // Default to process uptime

    // Safely try to get stats from the bot instance
    if (bot && typeof bot.getStats === 'function') {
      try {
          stats = await bot.getStats(); // Call the getStats method
          botStatus = stats.status || botStatus; // Use status from stats if available
          botUptimeMs = typeof stats.uptime === 'number' ? stats.uptime : botUptimeMs; // Use bot uptime if available
      } catch (getStatsError) {
          logger.error(getStatsError, '⚠️ Error calling bot.getStats()');
          // Proceed with default/process stats, maybe add an indicator
          botStatus = '⚠️ Stats Error';
      }
    } else {
        logger.warn('⚠️ bot.getStats() function not found. Using default stats.');
        botStatus = '⚠️ Partial'; // Indicate that stats are incomplete
    }
    const dbHealth = bot && bot.getDatabase() && typeof bot.getDatabase().healthCheck === 'function'
                     ? await bot.getDatabase().healthCheck()
                     : { healthy: false, pingTime: 'N/A', stats: {}, error: 'DB Check Unavailable' };

    // System info
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = totalMem > 0 ? ((usedMem / totalMem) * 100).toFixed(1) : 'N/A';

    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || 'Unknown';
    const cpuCores = cpus.length;

    // --- Use the new botUptimeMs and formatUptime ---
    const uptimeFormatted = formatUptime(botUptimeMs / 1000); // Use the potentially more accurate bot uptime
    
    // Format Memory Safely
     const formatBytes = (bytes) => {
        if (typeof bytes !== 'number' || bytes < 0) return 'N/A';
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.max(0, Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
     };


    // --- Construct the message using safely accessed stats ---
    const message = `📊 *SYSTEM STATISTICS*

╭─────────────────────╮
│   🤖 *BOT STATUS* │
╰─────────────────────╯

• Status: ${botStatus === 'connected' ? '✅ Online' : `⚠️ ${botStatus}`}
• Uptime: ${uptimeFormatted} 
• Mode: ${(config.MODE || stats.features?.mode || 'public').toUpperCase()}
• Prefix: ${config.PREFIX}

╭─────────────────────╮
│   💾 *MEMORY USAGE* │
╰─────────────────────╯

• Heap Used: ${formatBytes(stats.memory?.heapUsed ?? process.memoryUsage().heapUsed)}
• Heap Total: ${formatBytes(stats.memory?.heapTotal ?? process.memoryUsage().heapTotal)}
• RSS: ${formatBytes(stats.memory?.rss ?? process.memoryUsage().rss)}
• System Used: ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${memPercent}%)

╭─────────────────────╮
│   💻 *SYSTEM INFO* │
╰─────────────────────╯

• Platform: ${os.platform()}
• Architecture: ${os.arch()}
• Node Version: ${process.version}
• CPU: ${cpuModel} (${cpuCores} cores)
• Load Avg: ${os.loadavg().map(l => l.toFixed(2)).join(', ')}

╭─────────────────────╮
│   🗄️ *DATABASE* │
╰─────────────────────╯

• Status: ${dbHealth.healthy ? '✅ Connected' : '❌ Offline'}
• Ping: ${dbHealth.pingTime ?? 'N/A'} ms
${dbHealth.healthy ? `• Collections: ${dbHealth.stats?.collections || 'N/A'}\n• Documents: ${dbHealth.stats?.documents || 'N/A'}\n• Data Size: ${formatBytes(dbHealth.stats?.dataSize * 1024 * 1024) || 'N/A'}` : `• Error: ${dbHealth.error || 'Unknown'}`}

╭─────────────────────╮
│   🔌 *PLUGINS* │
╰─────────────────────╯

• Total: ${stats.plugins?.total ?? 'N/A'}
• Enabled: ${stats.plugins?.enabled ?? 'N/A'}
• Disabled: ${stats.plugins?.disabled ?? 'N/A'}

╭─────────────────────╮
│   ⚡ *FEATURES* │
╰─────────────────────╯

${(stats.features?.autoRead ?? config.AUTO_READ === 'true') ? '✅' : '❌'} Auto Read
${(stats.features?.autoReact ?? config.AUTO_REACT === 'true') ? '✅' : '❌'} Auto React
${(stats.features?.welcome ?? config.WELCOME === 'true') ? '✅' : '❌'} Welcome Messages
${(stats.features?.antilink ?? config.ANTILINK === 'true') ? '✅' : '❌'} Anti-Link
${(stats.features?.rejectCall ?? config.REJECT_CALL === 'true') ? '✅' : '❌'} Call Rejection
${(stats.features?.autoBio ?? config.AUTO_BIO === 'true') ? '✅' : '❌'} Auto Bio

⏰ ${moment().tz(config.TIMEZONE || 'UTC').format('DD/MM/YYYY HH:mm:ss Z')}`;


    await m.reply(message);
    await m.react('✅');

  } catch (error) {
    logger.error('Stats command failed:', error.message);
    await m.react('❌');
    // Provide a more informative error message
    await m.reply(`❌ Failed to fetch some system statistics.\n\n_Error: ${error.message}_`);
  }
}


// Handle ping command - Requires 'moment' import
async function handlePing(m, sock, db, logger) { // Ensure db is passed correctly
  try {
    const start = Date.now();

    await m.react('🏓');

    // Test message sending latency
    const msgLatency = Date.now() - start;

    // Test database ping - Ensure db object is valid and has healthCheck
    let dbPing = 'N/A';
    let dbStatus = '❌ Offline';
    if (db && typeof db.healthCheck === 'function') {
      try {
        const dbStart = Date.now();
        const health = await db.healthCheck(); // Call healthCheck on the db object
        if (health.healthy) {
           dbPing = `${Date.now() - dbStart} ms`;
           dbStatus = '✅ Connected';
        } else {
           dbPing = `Error: ${health.error || 'Unknown'}`;
        }
      } catch (dbError) {
        logger.warn('Database ping failed during ping command:', dbError);
        dbPing = 'Error';
      }
    } else {
        dbStatus = '❓ Unavailable'; // Indicate if db object is missing or doesn't have healthCheck
    }


    const message = `🏓 *PONG!*

📊 *Latency Results:*
• Message: ${msgLatency} ms
• Database Ping: ${dbPing}
• DB Status: ${dbStatus}
• Process Uptime: ${formatUptime(process.uptime())}
• Memory (Heap): ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB

⏰ ${moment().format('HH:mm:ss')}`;


    // Use edit message if supported by your bot framework, otherwise reply
    // Assuming m.reply works like a simple send here
    await m.reply(message);
    await m.react('✅'); // React after sending pong

  } catch (error) {
    logger.error('Ping command failed:', error.message);
    // Attempt to react even on failure
    try { await m.react('❌'); } catch (reactError) {}
    await m.reply('❌ Ping failed');
  }
}


// Handle bot restart - Requires bot instance
async function handleRestart(m, sock, bot, logger, isOwner) {
  if (!isOwner) {
    return m.reply('🔒 Only the bot owner can restart the bot.');
  }

   // Check if bot instance is valid and has emit method
   if (!bot || typeof bot.emit !== 'function') {
     logger.error('Restart failed: Invalid bot instance provided.');
     return m.reply('❌ Internal Error: Cannot trigger restart.');
   }


  try {
    await m.reply('🔄 *Restarting Bot...*\n\nPlease wait 10-20 seconds...');
    await m.react('🔄');

    logger.info('Bot restart initiated by owner');

    // Delay slightly to allow reply to send
    setTimeout(() => {
       try {
         bot.emit('restart'); // Emit the restart event on the bot instance
       } catch (emitError) {
         logger.error('Error emitting restart event:', emitError);
         // Attempt to exit gracefully if emit fails
         process.exit(1);
       }
    }, 2000); // 2 second delay


  } catch (error) {
    logger.error('Restart command failed:', error.message);
    await m.reply('❌ Restart command failed: ' + error.message);
     // Try to react with error even if reply fails
     try { await m.react('❌'); } catch (reactError) {}
  }
}


// Handle bot shutdown - Requires bot instance
async function handleShutdown(m, sock, bot, logger, isOwner) {
  if (!isOwner) {
    return m.reply('🔒 Only the bot owner can shutdown the bot.');
  }

  // Check if bot instance is valid and has emit method
  if (!bot || typeof bot.emit !== 'function') {
      logger.error('Shutdown failed: Invalid bot instance provided.');
      return m.reply('❌ Internal Error: Cannot trigger shutdown.');
  }

  try {
    await m.reply('🛑 *Shutting Down Bot...*\n\nGoodbye! 👋');
    await m.react('🛑');

    logger.info('Bot shutdown initiated by owner');

    // Delay slightly before emitting shutdown
    setTimeout(() => {
       try {
           bot.emit('shutdown'); // Emit the shutdown event
       } catch (emitError) {
           logger.error('Error emitting shutdown event:', emitError);
           // Force exit if emit fails
           process.exit(0);
       }
    }, 2000); // 2 second delay


  } catch (error) {
    logger.error('Shutdown command failed:', error.message);
    await m.reply('❌ Shutdown command failed: ' + error.message);
    // Try to react with error even if reply fails
    try { await m.react('❌'); } catch (reactError) {}
  }
}

