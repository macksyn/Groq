// handlers/messageHandler.js - V2 (Fully Refactored)
import { safeOperation } from '../lib/mongoManager.js';
import { serializeMessage } from '../lib/serializer.js';
import { PermissionHelpers, RateLimitHelpers, OwnerHelpers } from '../lib/helpers.js';
import PluginManager from '../lib/pluginManager.js';
import { isUserBanned } from '../plugins/bot_settings_plugin.js'; 
import logger from '../src/utils/logger.js'; // Import the logger

// Group settings
const GROUP_SETTINGS_COLLECTION = 'group_settings';
const linkRegex = /https?:\/\/[^\s/$.?#].[^\s]*/gi;

async function getGroupSettings(groupId) {
  try {
    return await safeOperation(async (db) => {
      const collection = db.collection(GROUP_SETTINGS_COLLECTION);
      let settings = await collection.findOne({ _id: groupId });
      if (!settings) {
        settings = { _id: groupId, antilink: false }; // Default
      }
      return settings;
    });
  } catch (error) {
    console.error('Failed to get group settings:', error.message);
    return { antilink: false }; // Fail-safe
  }
}

/**
 * Checks if a user has admin privileges (Group or Bot).
 */
async function isUserAdmin(m, sock, config) {
  // 1. Check if Bot Owner
  if (PermissionHelpers.isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net')) {
    return true;
  }
  
  // 2. Check if Bot Admin
  try {
    const botAdmins = await getAdmins();
    if (botAdmins.some(admin => admin.phone === m.sender.replace('@s.whatsapp.net', ''))) {
      return true;
    }
  } catch (e) {
    console.error('Failed to check bot admin status:', e);
  }

  // 3. Check if Group Admin
  try {
    const groupMeta = await sock.groupMetadata(m.chat);
    const participant = groupMeta.participants.find(p => p.id === m.sender);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch (e) {
    console.error('Failed to check group admin status:', e);
  }
  
  return false;
}

/**
 * Main Anti-Link logic handler.
 * Returns true if the message was deleted, false otherwise.
 */
async function handleAntiLink(m, sock, config, logger) {
  if (!m.isGroup || !m.body) {
    return false; // Not a group or no message body
  }

  // Check if message contains a link
  if (!linkRegex.test(m.body)) {
    return false; // No link found
  }

  // Get settings for this group
  const groupSettings = await getGroupSettings(m.chat);
  if (!groupSettings.antilink) {
    return false; // Anti-link is disabled for this group
  }

  // Check if the user is an Admin (group or bot)
  const isAdmin = await isUserAdmin(m, sock, config);
  if (isAdmin) {
    return false; // Admin is allowed to send links
  }

  // --- If we reach here, it's a non-admin sending a link in an antilink-enabled group ---
  try {
    logger.warn(`🔗 Anti-Link triggered in ${m.chat} by ${m.sender}`);
    
    // Send warning
    await sock.sendMessage(m.chat, {
      text: `🛡️ *Anti-Link Violation* 🛡️\n\n@${m.sender.split('@')[0]}, links are not allowed in this group!`,
      mentions: [m.sender]
    });
    
    // Delete the message
    await sock.sendMessage(m.chat, { delete: m.key });
    
    return true; // Message was deleted
  } catch (err) {
    logger.error(err, 'Failed to enforce anti-link');
    return false;
  }
}

// Auto reaction emojis
const reactionEmojis = ['❤️', '👍', '🔥', '⚡', '🎉', '💯', '✨', '🚀'];

export default async function MessageHandler(messageUpdate, sock, loggerArg, config, bot) {
  try {
    if (messageUpdate.type !== 'notify') return;
    if (!messageUpdate.messages?.[0]) return;

    const m = serializeMessage(messageUpdate.messages[0], sock);
    if (!m.message) return;

    if (m.key.remoteJid === 'status@broadcast') {
      if (config.AUTO_STATUS_SEEN) await sock.readMessages([m.key]);
      return;
    }

    if (config.AUTO_READ) {
      await sock.readMessages([m.key]);
    }
    
    // --- ADD THIS BLOCK ---
  try {
    const linkDeleted = await handleAntiLink(m, sock, config, logger);
    if (linkDeleted) {
      return; // Stop processing this message since it was deleted
    }
  } catch (e) {
    logger.error(e, 'Error in anti-link handler');
  }
  // --- END OF BLOCK ---

    // --- Permission & Mode Checks ---
    const isOwner = PermissionHelpers.isOwner(m.sender || '', config.OWNER_NUMBER + '@s.whatsapp.net');
    
    let isConfigAdmin = isOwner;
    if (config.ADMIN_NUMBERS) {
      const adminNumbers = Array.isArray(config.ADMIN_NUMBERS) 
        ? config.ADMIN_NUMBERS 
        : config.ADMIN_NUMBERS.split(',').map(num => num.trim());
      const senderNumber = (m.sender || '').replace('@s.whatsapp.net', '');
      isConfigAdmin = isOwner || adminNumbers.some(adminNum => senderNumber === adminNum.replace('@s.whatsapp.net', ''));
    }

    let isDbAdmin = false;
    try {
      const dbAdmins = await OwnerHelpers.getAdmins();
      isDbAdmin = dbAdmins.some(admin => admin.phone === (m.sender || '').replace('@s.whatsapp.net', ''));
    } catch (error) {
      logger.warn(error, '⚠️ Error checking database admins');
    }
    
    const isAdmin = isConfigAdmin || isDbAdmin;
    
    let isPublic = true;
    try {
      isPublic = await OwnerHelpers.isBotPublic();
    } catch (error) {
      logger.warn(error, '⚠️ Error checking bot mode, defaulting to public');
      isPublic = config.MODE === 'public';
    }
    
    if (!isPublic && !isOwner && !isAdmin) {
      return; // Private mode
    }

     if (m.sender) {
        const userPhone = m.sender.split('@')[0];
        if (await isUserBanned(userPhone)) {
            logger.info(`🚫 Ignoring message from banned user: ${userPhone}`);
            return; // Stop processing the message
        }
    }

    // --- Rate Limiting (using the new V2 helper) ---
    const senderId = m.sender || 'unknown';
    if (RateLimitHelpers.isLimited(senderId) && !isOwner) {
      return;
    }

    let messageBody = m.body ? m.body.trim() : '';
    const isCommand = messageBody.startsWith(config.PREFIX);

    // --- Non-Command Features ---
    if (config.AUTO_REACT && !m.isSelf && !isCommand && Math.random() < 0.1) {
      try { await m.react(reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)]); } catch (e) {}
    }

    // --- V2 ROUTING LOGIC ---
    if (isCommand) {
      const displayMessage = messageBody.length > 50 ? messageBody.substring(0, 50) + '...' : messageBody;
      logger.info(`📨 Command from ${m.sender.split('@')[0]}: ${displayMessage}`);
      // Send to V2 command handler
      await PluginManager.handleCommand(m, sock, config, bot);
    } else {
      // Send to non-command plugins
      await PluginManager.executePlugins(m, sock, config, bot);
    }

  } catch (error) {
    logger.error(error, '❌ Message handler error');
    if (config.OWNER_NUMBER) {
      try {
        await sock.sendMessage(config.OWNER_NUMBER + '@s.whatsapp.net', {
          text: `🚨 Bot Error Alert\n\n❌ Error: ${error.message}\n📍 Location: Message Handler`
        });
      } catch (notifyError) {
        logger.warn(notifyError, '⚠️ Failed to send error notification to owner');
      }
    }
  }
}

