// handlers/messageHandler.js - V2 (Fully Refactored)
import { serializeMessage } from '../lib/serializer.js';
import { PermissionHelpers, RateLimitHelpers, OwnerHelpers } from '../lib/helpers.js';
import PluginManager from '../lib/pluginManager.js';
import logger from '../src/utils/logger.js'; // Import the logger

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

    if (config.ANTILINK && m.isGroup && !isOwner && !isAdmin && !isCommand) {
      const linkRegex = /(https?:\/\/[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
      if (messageBody && linkRegex.test(messageBody)) {
        // ... (Antilink logic) ...
        return;
      }
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