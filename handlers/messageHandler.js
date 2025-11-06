// handlers/messageHandler.js - V2 (Fully Refactored)
import { safeOperation } from '../lib/mongoManager.js';
import { serializeMessage } from '../lib/serializer.js';
import { PermissionHelpers, OwnerHelpers } from '../lib/helpers.js';
import PluginManager from '../lib/pluginManager.js';
import { isUserBanned } from '../plugins/bot_settings_plugin.js'; 
import logger from '../src/utils/logger.js';
import { checkLimit } from '../src/utils/rateLimiter.js'; // Updated import


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

export default async function MessageHandler(messageUpdate, sock, loggerArg, config, bot) {
  try {
    if (messageUpdate.type !== 'notify') return;
    if (!messageUpdate.messages?.[0]) return;

    // ------------------- MODIFICATION: Added 'await' -------------------
    const m = await serializeMessage(messageUpdate.messages[0], sock);
    if (!m.message) return;

    // --- CRITICAL BAN CHECK (MOVED UP) ---
    // This check now runs *before* anything else, using the *correctly resolved* m.sender
    if (m.sender) {
      const userPhone = m.sender.split('@')[0];
      if (await isUserBanned(userPhone)) {
        logger.info(`🚫 Ignoring message from banned user: ${userPhone} (Resolved JID)`);
        return; // Banned user is immediately stopped
      }
    }
    // --- END CRITICAL BAN CHECK ---


    if (m.key.remoteJid === 'status@broadcast') {
      if (config.AUTO_STATUS_SEEN) await sock.readMessages([m.key]);
      return;
    }

    if (config.AUTO_READ) {
      await sock.readMessages([m.key]);
    }

    // Permission & Mode Checks
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
      return;
    }

    // Ban check (This is now a secondary check, the primary one is at the top)
    if (m.sender) {
      const userPhone = m.sender.split('@')[0];
      if (await isUserBanned(userPhone)) {
        logger.info(`🚫 Ignoring message from banned user: ${userPhone}`);
        return;
      }
    }

    // --- UPDATED RATE LIMITING WITH NOTIFICATION ---
    const senderId = m.sender || 'unknown';
    if (!isOwner && !isAdmin) { // Don't rate limit admins
      const limitCheck = checkLimit(senderId);

      if (limitCheck.limited) {
        // User is rate limited
        if (limitCheck.shouldNotify) {
          // Send notification (only once per window)
          try {
            const userName = m.pushName || senderId.split('@')[0];
            await sock.sendMessage(m.chat, {
              text: `Hi @${senderId.split('@')[0]}! You're sending commands too quickly.\n\n` +
                    `⚠️ *Limit:* 10 commands per minute\n` +
                    `⏳ *Wait:* ~${Math.ceil(60)} seconds before trying again\n\n` +
                    `_This helps keep the bot running smoothly for everyone!_ 😊`,
              mentions: [senderId]
            });
            logger.info(`📢 Sent rate limit notification to ${senderId}`);
          } catch (notifyErr) {
            logger.error(notifyErr, 'Failed to send rate limit notification');
          }
        }
        return; // Stop processing
      }

      // Optional: Warn users when they're getting close to the limit
      if (limitCheck.remaining <= 2 && limitCheck.remaining > 0) {
        try {
          await sock.sendMessage(m.chat, {
            text: `⚠️ _You have ${limitCheck.remaining} commands remaining in this minute._`,
            mentions: [senderId]
          });
        } catch (e) {
          // Silently fail if warning can't be sent
        }
      }
    }

    let messageBody = m.body ? m.body.trim() : '';
    const isCommand = messageBody.startsWith(config.PREFIX);

    // Auto react
    if (config.AUTO_REACT && !m.isSelf && !isCommand && Math.random() < 0.1) {
      try { 
        const reactionEmojis = ['❤️', '👍', '🔥', '⚡', '🎉', '💯', '✨', '🚀'];
        await m.react(reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)]); 
      } catch (e) {}
    }

    // V2 ROUTING LOGIC
    if (isCommand) {
      const displayMessage = messageBody.length > 50 ? messageBody.substring(0, 50) + '...' : messageBody;
      logger.info(`📨 Command from ${m.sender.split('@')[0]}: ${displayMessage}`);
      await PluginManager.handleCommand(m, sock, config, bot);
    } else {
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