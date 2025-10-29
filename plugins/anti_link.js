// plugins/antilink_plugin.js - Enterprise-Grade Anti-Link Protection System
import { PluginHelpers } from '../lib/pluginIntegration.js';
import moment from 'moment-timezone';

// ==================== CONFIGURATION ====================
const COLLECTIONS = {
  SETTINGS: 'antilink_settings',
  WARNINGS: 'antilink_warnings',
  WHITELIST: 'antilink_whitelist',
  TEMP_PERMISSIONS: 'antilink_temp_permissions'
};

// Default configuration (can be overridden by env or per-group settings)
const DEFAULT_CONFIG = {
  maxWarnings: parseInt(process.env.ANTILINK_MAX_WARNINGS) || 3,
  tempPermissionDuration: parseInt(process.env.ANTILINK_TEMP_DURATION) || 5 * 60 * 1000, // 5 minutes
  autoDelete: process.env.ANTILINK_AUTO_DELETE !== 'false', // true by default
  warningMessage: process.env.ANTILINK_WARNING_MSG || '⚠️ *Warning {current}/{max}*\n\n@{user}, links are not allowed in this group!\n\n🚫 *Violations:* {current}/{max}\n⚡ *Action:* {action}\n\n_Next violation will result in removal from the group._',
  removalMessage: process.env.ANTILINK_REMOVAL_MSG || '🚫 *User Removed*\n\n@{user} has been removed for repeatedly posting links.\n\n📊 *Total Violations:* {violations}\n⏰ *Final Warning Time:* {time}\n\n_Group rules must be followed by all members._',
  exemptBotAdmins: true,
  exemptGroupAdmins: process.env.ANTILINK_EXEMPT_ADMINS === 'true',
  logActions: true
};

// Link detection regex (comprehensive)
const LINK_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|((whatsapp\.com|wa\.me|t\.me|telegram\.me|instagram\.com|facebook\.com|fb\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|tiktok\.com)\/[^\s]+)/gi;

// ==================== V3 PLUGIN EXPORT ====================
export default {
  name: 'Anti-Link Protection',
  version: '2.0.0',
  author: 'Fresh Bot Framework',
  description: 'Enterprise-grade link protection system with persistent warnings, whitelist, and temporary permissions',
  category: 'moderation',

  commands: ['antilink'],
  aliases: ['al', 'linkblock', 'nolinks'],

  // This plugin needs to check ALL messages in groups
  executeOnAllMessages: true,

  async run(context) {
    const { msg: m, args, command, sock, config, logger, helpers } = context;
    const { PermissionHelpers, TimeHelpers } = helpers;

    // ==================== COMMAND ROUTING ====================
    if (command && ['antilink', 'al', 'linkblock', 'nolinks'].includes(command)) {
      return await handleCommand(context);
    }

    // ==================== MESSAGE MONITORING ====================
    // Only monitor group messages
    if (!m.isGroup) return;

    // Check if antilink is enabled for this group
    const settings = await getGroupSettings(m.chat);
    if (!settings || !settings.enabled) return;

    // Check for links in message
    const links = extractLinks(m.body);
    if (links.length === 0) return;

    // Check exemptions
    const isOwner = PermissionHelpers.isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net');

    // Get bot admin status
    let isBotAdmin = false;
    try {
      const admins = await PluginHelpers.getUserData('bot_admins') || [];
      isBotAdmin = admins.some(admin => admin.phone === m.sender.replace('@s.whatsapp.net', ''));
    } catch (e) {
      // Fail silently
    }

    // Exempt owners and bot admins
    if (isOwner || (isBotAdmin && settings.exemptBotAdmins)) {
      logger.debug(`Anti-link: Exempted ${m.sender} (owner/admin)`);
      return;
    }

    // Check group admin exemption
    if (settings.exemptGroupAdmins) {
      const isGroupAdmin = await m.isAdmin();
      if (isGroupAdmin) {
        logger.debug(`Anti-link: Exempted ${m.sender} (group admin)`);
        return;
      }
    }

    // Check temporary permissions
    const hasPermission = await checkTempPermission(m.chat, m.sender);
    if (hasPermission) {
      logger.info(`Anti-link: ${m.sender} has temporary permission`);
      return;
    }

    // Check whitelist
    const isWhitelisted = await checkWhitelist(m.chat, links);
    if (isWhitelisted) {
      logger.debug(`Anti-link: Links are whitelisted`);
      return;
    }

    // ==================== VIOLATION DETECTED ====================
    logger.warn(`Anti-link violation: ${m.sender} in ${m.chat}`);

    // Delete message if enabled
    if (settings.autoDelete) {
      try {
        await sock.sendMessage(m.chat, { delete: m.key });
        logger.info('Anti-link: Message deleted');
      } catch (error) {
        logger.warn('Anti-link: Failed to delete message', error.message);
      }
    }

    // Add warning
    const warning = await addWarning(m.chat, m.sender);

    // Check if bot can remove users
    const isBotGroupAdmin = await m.isBotAdmin();

    // Determine action
    if (warning.count >= settings.maxWarnings) {
      // Remove user
      if (isBotGroupAdmin) {
        await removeUser(m, sock, settings, warning);
      } else {
        await sendMaxWarningNotice(m, sock, settings, warning);
      }
    } else {
      // Send warning
      await sendWarning(m, sock, settings, warning);
    }

    // Log action
    if (settings.logActions) {
      await logAction(m.chat, m.sender, 'warning', warning.count, links);
    }
  }
};

// ==================== COMMAND HANDLER ====================
async function handleCommand(context) {
  const { msg: m, args, sock, config, logger, helpers } = context;
  const { PermissionHelpers } = helpers;

  // Must be in a group
  if (!m.isGroup) {
    return m.reply('❌ This command can only be used in groups.');
  }

  // Permission check - Group Admin or Bot Admin/Owner
  const isOwner = PermissionHelpers.isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net');

  let isBotAdmin = false;
  try {
    const admins = await PluginHelpers.getUserData('bot_admins') || [];
    isBotAdmin = admins.some(admin => admin.phone === m.sender.replace('@s.whatsapp.net', ''));
  } catch (e) {
    // Fail silently
  }

  let isGroupAdmin = false;
  try {
    isGroupAdmin = await m.isAdmin();
  } catch (e) {
    logger.warn('Failed to check group admin status', e.message);
  }

  if (!isOwner && !isBotAdmin && !isGroupAdmin) {
    return m.reply('🔒 This command requires Group Admin or Bot Admin privileges.');
  }

  const subCommand = args[0]?.toLowerCase();

  // Route to appropriate handler
  switch (subCommand) {
    case 'on':
    case 'enable':
      return await enableAntilink(m, sock);

    case 'off':
    case 'disable':
      return await disableAntilink(m, sock);

    case 'config':
    case 'settings':
    case 'status':
      return await showConfig(m, sock, config);

    case 'set':
      return await updateSetting(m, sock, args.slice(1));

    case 'whitelist':
      return await handleWhitelist(m, sock, args.slice(1));

    case 'permit':
    case 'allow':
      return await grantPermission(m, sock, config, args.slice(1));

    case 'warnings':
    case 'warns':
      return await showWarnings(m, sock, args.slice(1));

    case 'reset':
      return await resetWarnings(m, sock, args.slice(1));

    case 'help':
      return await showHelp(m, sock, config);

    default:
      return await showConfig(m, sock, config);
  }
}

// ==================== DATABASE OPERATIONS ====================

/**
 * Get group antilink settings
 */
async function getGroupSettings(groupId) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.SETTINGS);
      let settings = await collection.findOne({ groupId });

      if (!settings) {
        // Create default settings
        settings = {
          groupId,
          enabled: false,
          ...DEFAULT_CONFIG,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await collection.insertOne(settings);
      }

      return settings;
    });
  } catch (error) {
    console.error('Failed to get antilink settings:', error.message);
    return null;
  }
}

/**
 * Update group settings
 */
async function updateGroupSettings(groupId, updates) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.SETTINGS);
      return await collection.updateOne(
        { groupId },
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
    console.error('Failed to update antilink settings:', error.message);
    return null;
  }
}

/**
 * Add warning to user
 */
async function addWarning(groupId, userId) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.WARNINGS);
      const key = `${groupId}:${userId}`;

      const existing = await collection.findOne({ key });

      if (existing) {
        const newCount = existing.count + 1;
        await collection.updateOne(
          { key },
          { 
            $set: { 
              count: newCount,
              lastViolation: new Date(),
              updatedAt: new Date()
            } 
          }
        );
        return { count: newCount, previousCount: existing.count };
      } else {
        await collection.insertOne({
          key,
          groupId,
          userId,
          count: 1,
          firstViolation: new Date(),
          lastViolation: new Date(),
          createdAt: new Date()
        });
        return { count: 1, previousCount: 0 };
      }
    });
  } catch (error) {
    console.error('Failed to add warning:', error.message);
    return { count: 1, previousCount: 0 };
  }
}

/**
 * Get user warnings
 */
async function getUserWarnings(groupId, userId) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.WARNINGS);
      const key = `${groupId}:${userId}`;
      return await collection.findOne({ key });
    });
  } catch (error) {
    console.error('Failed to get warnings:', error.message);
    return null;
  }
}

/**
 * Reset user warnings
 */
async function resetUserWarnings(groupId, userId) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.WARNINGS);
      const key = `${groupId}:${userId}`;
      return await collection.deleteOne({ key });
    });
  } catch (error) {
    console.error('Failed to reset warnings:', error.message);
    return null;
  }
}

/**
 * Check whitelist
 */
async function checkWhitelist(groupId, links) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.WHITELIST);
      const whitelist = await collection.find({ groupId }).toArray();

      if (!whitelist || whitelist.length === 0) return false;

      // Check if any link matches whitelist patterns
      for (const link of links) {
        for (const entry of whitelist) {
          if (entry.pattern && link.includes(entry.pattern)) {
            return true;
          }
        }
      }

      return false;
    });
  } catch (error) {
    console.error('Failed to check whitelist:', error.message);
    return false;
  }
}

/**
 * Add to whitelist
 */
async function addToWhitelist(groupId, pattern, addedBy) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.WHITELIST);

      const existing = await collection.findOne({ groupId, pattern });
      if (existing) {
        return { success: false, message: 'Pattern already whitelisted' };
      }

      await collection.insertOne({
        groupId,
        pattern,
        addedBy: addedBy.split('@')[0],
        addedAt: new Date()
      });

      return { success: true };
    });
  } catch (error) {
    console.error('Failed to add to whitelist:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Remove from whitelist
 */
async function removeFromWhitelist(groupId, pattern) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.WHITELIST);
      const result = await collection.deleteOne({ groupId, pattern });

      if (result.deletedCount === 0) {
        return { success: false, message: 'Pattern not found' };
      }

      return { success: true };
    });
  } catch (error) {
    console.error('Failed to remove from whitelist:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Get whitelist for group
 */
async function getWhitelist(groupId) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.WHITELIST);
      return await collection.find({ groupId }).toArray();
    });
  } catch (error) {
    console.error('Failed to get whitelist:', error.message);
    return [];
  }
}

/**
 * Grant temporary permission
 */
async function grantTempPermission(groupId, userId, duration, grantedBy) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.TEMP_PERMISSIONS);
      const key = `${groupId}:${userId}`;
      const expiresAt = new Date(Date.now() + duration);

      await collection.updateOne(
        { key },
        { 
          $set: {
            key,
            groupId,
            userId,
            grantedBy: grantedBy.split('@')[0],
            grantedAt: new Date(),
            expiresAt,
            active: true
          }
        },
        { upsert: true }
      );

      return { success: true, expiresAt };
    });
  } catch (error) {
    console.error('Failed to grant permission:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Check temporary permission
 */
async function checkTempPermission(groupId, userId) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.TEMP_PERMISSIONS);
      const key = `${groupId}:${userId}`;

      const permission = await collection.findOne({ key, active: true });

      if (!permission) return false;

      // Check if expired
      if (new Date() > new Date(permission.expiresAt)) {
        // Deactivate expired permission
        await collection.updateOne(
          { key },
          { $set: { active: false } }
        );
        return false;
      }

      return true;
    });
  } catch (error) {
    console.error('Failed to check permission:', error.message);
    return false;
  }
}

/**
 * Log action for audit trail
 */
async function logAction(groupId, userId, action, count, links) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection('antilink_logs');
      await collection.insertOne({
        groupId,
        userId,
        action,
        warningCount: count,
        links: links.slice(0, 3), // Store first 3 links
        timestamp: new Date()
      });
    });
  } catch (error) {
    console.error('Failed to log action:', error.message);
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Extract links from message
 */
function extractLinks(text) {
  if (!text || typeof text !== 'string') return [];

  const matches = text.match(LINK_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Format message with placeholders
 */
function formatMessage(template, data) {
  let message = template;

  for (const [key, value] of Object.entries(data)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return message;
}

// ==================== ACTION HANDLERS ====================

/**
 * Send warning to user
 */
async function sendWarning(m, sock, settings, warning) {
  try {
    const message = formatMessage(settings.warningMessage, {
      user: m.sender.split('@')[0],
      current: warning.count,
      max: settings.maxWarnings,
      action: warning.count === settings.maxWarnings - 1 ? 'Final Warning' : 'Warning',
      violations: warning.count
    });

    await sock.sendMessage(m.chat, {
      text: message,
      mentions: [m.sender]
    });
  } catch (error) {
    console.error('Failed to send warning:', error.message);
  }
}

/**
 * Remove user from group
 */
async function removeUser(m, sock, settings, warning) {
  try {
    // Remove user
    await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove');

    // Send removal message
    const message = formatMessage(settings.removalMessage, {
      user: m.sender.split('@')[0],
      violations: warning.count,
      time: moment().format('HH:mm:ss DD/MM/YYYY')
    });

    await sock.sendMessage(m.chat, {
      text: message,
      mentions: [m.sender]
    });

    // Reset warnings
    await resetUserWarnings(m.chat, m.sender);

  } catch (error) {
    console.error('Failed to remove user:', error.message);
  }
}

/**
 * Send max warning notice (when bot can't remove)
 */
async function sendMaxWarningNotice(m, sock, settings, warning) {
  try {
    const message = `⚠️ *Maximum Warnings Reached*\n\n@${m.sender.split('@')[0]} has reached the maximum warning limit (${warning.count}/${settings.maxWarnings}).\n\n⚡ *Recommended Action:* Group admins should consider removing this member.\n\n💡 _Bot needs admin privileges to automatically remove members._`;

    await sock.sendMessage(m.chat, {
      text: message,
      mentions: [m.sender]
    });
  } catch (error) {
    console.error('Failed to send notice:', error.message);
  }
}

// ==================== COMMAND IMPLEMENTATIONS ====================

/**
 * Enable antilink
 */
async function enableAntilink(m, sock) {
  try {
    const settings = await getGroupSettings(m.chat);

    if (settings && settings.enabled) {
      return m.reply('💡 Anti-link protection is already enabled for this group.');
    }

    await updateGroupSettings(m.chat, { enabled: true });

    const response = `✅ *Anti-Link Enabled*

🛡️ Link protection is now active!

⚙️ *Current Settings:*
• Max Warnings: ${settings?.maxWarnings || DEFAULT_CONFIG.maxWarnings}
• Auto-Delete: ${settings?.autoDelete !== false ? 'ON' : 'OFF'}
• Exempt Admins: ${settings?.exemptGroupAdmins ? 'YES' : 'NO'}

💡 Type *.antilink config* to view full settings
📚 Type *.antilink help* for all commands`;

    return m.reply(response);
  } catch (error) {
    console.error('Failed to enable antilink:', error.message);
    return m.reply('❌ Failed to enable anti-link protection.');
  }
}

/**
 * Disable antilink
 */
async function disableAntilink(m, sock) {
  try {
    const settings = await getGroupSettings(m.chat);

    if (!settings || !settings.enabled) {
      return m.reply('💡 Anti-link protection is already disabled for this group.');
    }

    await updateGroupSettings(m.chat, { enabled: false });

    return m.reply('🔓 *Anti-Link Disabled*\n\nLink protection has been turned off for this group.\n\n💡 Type *.antilink on* to re-enable.');
  } catch (error) {
    console.error('Failed to disable antilink:', error.message);
    return m.reply('❌ Failed to disable anti-link protection.');
  }
}

/**
 * Show configuration
 */
async function showConfig(m, sock, config) {
  try {
    const settings = await getGroupSettings(m.chat);

    if (!settings) {
      return m.reply('❌ Failed to load settings.');
    }

    const status = settings.enabled ? '✅ ENABLED' : '❌ DISABLED';
    const whitelist = await getWhitelist(m.chat);

    const response = `⚙️ *Anti-Link Configuration*

📊 *Status:* ${status}

🔧 *Settings:*
• Max Warnings: ${settings.maxWarnings}
• Auto-Delete Links: ${settings.autoDelete ? 'ON' : 'OFF'}
• Exempt Group Admins: ${settings.exemptGroupAdmins ? 'YES' : 'NO'}
• Exempt Bot Admins: ${settings.exemptBotAdmins ? 'YES' : 'NO'}
• Log Actions: ${settings.logActions ? 'ON' : 'OFF'}

📝 *Temporary Permission Duration:* ${settings.tempPermissionDuration / 60000} minutes

🔐 *Whitelisted Patterns:* ${whitelist.length}

💡 *Commands:*
• .antilink set <option> <value>
• .antilink whitelist add <pattern>
• .antilink permit @user
• .antilink help

_Last updated: ${moment(settings.updatedAt).fromNow()}_`;

    return m.reply(response);
  } catch (error) {
    console.error('Failed to show config:', error.message);
    return m.reply('❌ Failed to load configuration.');
  }
}

/**
 * Update setting
 */
async function updateSetting(m, sock, args) {
  try {
    if (args.length < 2) {
      return m.reply('❌ Usage: .antilink set <option> <value>\n\nOptions: maxwarnings, autodelete, exemptadmins, logactions');
    }

    const option = args[0].toLowerCase();
    const value = args[1].toLowerCase();

    const updates = {};

    switch (option) {
      case 'maxwarnings':
      case 'warnings':
        const num = parseInt(value);
        if (isNaN(num) || num < 1 || num > 10) {
          return m.reply('❌ Max warnings must be between 1 and 10');
        }
        updates.maxWarnings = num;
        break;

      case 'autodelete':
      case 'delete':
        if (!['on', 'off', 'true', 'false'].includes(value)) {
          return m.reply('❌ Value must be: on/off');
        }
        updates.autoDelete = ['on', 'true'].includes(value);
        break;

      case 'exemptadmins':
      case 'admins':
        if (!['on', 'off', 'true', 'false'].includes(value)) {
          return m.reply('❌ Value must be: on/off');
        }
        updates.exemptGroupAdmins = ['on', 'true'].includes(value);
        break;

      case 'logactions':
      case 'logs':
        if (!['on', 'off', 'true', 'false'].includes(value)) {
          return m.reply('❌ Value must be: on/off');
        }
        updates.logActions = ['on', 'true'].includes(value);
        break;

      default:
        return m.reply('❌ Unknown option. Available: maxwarnings, autodelete, exemptadmins, logactions');
    }

    await updateGroupSettings(m.chat, updates);

    return m.reply(`✅ *Setting Updated*\n\n${option}: ${value}\n\n💾 Changes saved successfully.`);
  } catch (error) {
    console.error('Failed to update setting:', error.message);
    return m.reply('❌ Failed to update setting.');
  }
}

/**
 * Handle whitelist commands
 */
async function handleWhitelist(m, sock, args) {
  try {
    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
      const whitelist = await getWhitelist(m.chat);

      if (whitelist.length === 0) {
        return m.reply('📝 *Whitelist Empty*\n\nNo link patterns have been whitelisted.\n\n💡 Use: .antilink whitelist add <pattern>');
      }

      let response = `📋 *Whitelisted Link Patterns*\n\n`;
      whitelist.forEach((entry, index) => {
        response += `${index + 1}. \`${entry.pattern}\`\n`;
        response += `   Added by: ${entry.addedBy}\n`;
        response += `   Date: ${moment(entry.addedAt).format('DD/MM/YYYY')}\n\n`;
      });

      response += `💡 Total: ${whitelist.length} patterns`;

      return m.reply(response);
    }

    if (action === 'add') {
      const pattern = args.slice(1).join(' ');

      if (!pattern) {
        return m.reply('❌ Usage: .antilink whitelist add <pattern>\n\nExample: .antilink whitelist add youtube.com');
      }

      const result = await addToWhitelist(m.chat, pattern, m.sender);

      if (result.success) {
        return m.reply(`✅ *Pattern Whitelisted*\n\nPattern: \`${pattern}\`\n\nLinks containing this pattern will now be allowed.`);
      } else {
        return m.reply(`❌ ${result.message}`);
      }
    }

    if (action === 'remove') {
      const pattern = args.slice(1).join(' ');

      if (!pattern) {
        return m.reply('❌ Usage: .antilink whitelist remove <pattern>');
      }

      const result = await removeFromWhitelist(m.chat, pattern);

      if (result.success) {
        return m.reply(`✅ *Pattern Removed*\n\nPattern \`${pattern}\` has been removed from whitelist.`);
      } else {
        return m.reply(`❌ ${result.message}`);
      }
    }

    return m.reply('❌ Unknown action. Use: list, add, remove');
  } catch (error) {
    console.error('Failed to handle whitelist:', error.message);
    return m.reply('❌ Whitelist operation failed.');
  }
}

/**
 * Grant temporary permission
 */
async function grantPermission(m, sock, config, args) {
  try {
    if (!m.mentions || m.mentions.length === 0) {
      return m.reply('❌ Usage: .antilink permit @user [minutes]\n\nExample: .antilink permit @user 10');
    }

    const userId = m.mentions[0];
    const settings = await getGroupSettings(m.chat);

    // Parse duration (default 5 minutes)
    let duration = settings?.tempPermissionDuration || DEFAULT_CONFIG.tempPermissionDuration;
    if (args.length > 1) {
      const minutes = parseInt(args[1]);
      if (!isNaN(minutes) && minutes > 0 && minutes <= 60) {
        duration = minutes * 60 * 1000;
      }
    }

    const result = await grantTempPermission(m.chat, userId, duration, m.sender);

    if (result.success) {
      const expiryTime = moment(result.expiresAt).format('HH:mm:ss');

      return sock.sendMessage(m.chat, {
        text: `✅ *Temporary Permission Granted*\n\n@${userId.split('@')[0]} can now post links for ${duration / 60000} minutes.\n\n⏰ Expires at: ${expiryTime}\n\n💡 Permission will automatically expire.`,
        mentions: [userId]
      });
    } else {
      return m.reply(`❌ ${result.message}`);
    }
  } catch (error) {
    console.error('Failed to grant permission:', error.message);
    return m.reply('❌ Failed to grant permission.');
  }
}

/**
 * Show user warnings
 */
async function showWarnings(m, sock, args) {
  try {
    let userId = m.sender;

    // Check if checking another user
    if (m.mentions && m.mentions.length > 0) {
      userId = m.mentions[0];
    }

    const warnings = await getUserWarnings(m.chat, userId);
    const settings = await getGroupSettings(m.chat);

    if (!warnings || warnings.count === 0) {
      return sock.sendMessage(m.chat, {
        text: `✅ @${userId.split('@')[0]} has no warnings.`,
        mentions: [userId]
      });
    }

    const response = `⚠️ *Warning Status*

👤 User: @${userId.split('@')[0]}
🚫 Warnings: ${warnings.count}/${settings?.maxWarnings || DEFAULT_CONFIG.maxWarnings}
📅 First Violation: ${moment(warnings.firstViolation).format('DD/MM/YYYY HH:mm')}
🕐 Last Violation: ${moment(warnings.lastViolation).fromNow()}

${warnings.count >= (settings?.maxWarnings || DEFAULT_CONFIG.maxWarnings) ? '🔴 *Next violation will result in removal!*' : '⚡ *Action Required:* Stop posting links'}

💡 Admins can reset warnings with: .antilink reset @user`;

    return sock.sendMessage(m.chat, {
      text: response,
      mentions: [userId]
    });
  } catch (error) {
    console.error('Failed to show warnings:', error.message);
    return m.reply('❌ Failed to fetch warnings.');
  }
}

/**
 * Reset user warnings
 */
async function resetWarnings(m, sock, args) {
  try {
    if (!m.mentions || m.mentions.length === 0) {
      return m.reply('❌ Usage: .antilink reset @user\n\nExample: .antilink reset @user');
    }

    const userId = m.mentions[0];

    await resetUserWarnings(m.chat, userId);

    return sock.sendMessage(m.chat, {
      text: `✅ *Warnings Reset*\n\n@${userId.split('@')[0]}'s warnings have been cleared.\n\n💡 They start with a clean slate.`,
      mentions: [userId]
    });
  } catch (error) {
    console.error('Failed to reset warnings:', error.message);
    return m.reply('❌ Failed to reset warnings.');
  }
}

/**
 * Show help
 */
async function showHelp(m, sock, config) {
  const prefix = config.PREFIX;

  const help = `📚 *Anti-Link Command Guide*

╭─────────────────────╮
│   🛡️ PROTECTION │
╰─────────────────────╯

*Enable/Disable:*
• ${prefix}antilink on - Enable Antilink protection
• ${prefix}antilink off - Disable Antilink protection

*Configuration:*
• ${prefix}antilink config - View settings
• ${prefix}antilink set <option> <value> - Update setting

*Settings Options:*
• maxwarnings <1-10> - Warnings before removal
• autodelete <on/off> - Auto-delete links
• exemptadmins <on/off> - Exempt group admins
• logactions <on/off> - Log all actions

╭─────────────────────╮
│   📋 WHITELIST │
╰─────────────────────╯

• ${prefix}antilink whitelist list - Show whitelist
• ${prefix}antilink whitelist add <pattern> - Add pattern
• ${prefix}antilink whitelist remove <pattern> - Remove pattern

*Example:*
\`\`\`
${prefix}antilink whitelist add youtube.com
\`\`\`

╭─────────────────────╮
│   👥 USER MANAGEMENT │
╰─────────────────────╯

• ${prefix}antilink permit @user [minutes] - Temp permission
• ${prefix}antilink warnings [@user] - Check warnings
• ${prefix}antilink reset @user - Clear warnings

*Example:*
\`\`\`
${prefix}antilink permit @user 10
\`\`\`

╭─────────────────────╮
│   ℹ️ INFO │
╰─────────────────────╯

• Warnings are tracked per user per group
• Bot admins and owners are always exempt
• Temporary permissions expire automatically
• All actions are logged for audit trail

💡 Need help? Contact group admins or bot owner.`;

  return m.reply(help);
}