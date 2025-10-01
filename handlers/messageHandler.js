import chalk from 'chalk';
import { serializeMessage } from '../lib/serializer.js';
import { PermissionHelpers, RateLimitHelpers, OwnerHelpers, normalizeJID } from '../lib/helpers.js';
import PluginManager from '../lib/pluginManager.js';

// Auto reaction emojis
const reactionEmojis = ['❤️', '👍', '🔥', '⚡', '🎉', '💯', '✨', '🚀'];

// Main message handler
export default async function MessageHandler(messageUpdate, sock, logger, config, bot) {
  try {
    if (messageUpdate.type !== 'notify') return;
    if (!messageUpdate.messages?.[0]) return;

    // Serialize message with helper methods (NOW ASYNC)
    const m = await serializeMessage(messageUpdate.messages[0], sock);
    if (!m.message) return;

    // Handle status broadcasts
    if (m.key.remoteJid === 'status@broadcast') {
      if (config.AUTO_STATUS_SEEN) {
        await sock.readMessages([m.key]);
      }
      return;
    }

    // Auto read messages
    if (config.AUTO_READ) {
      await sock.readMessages([m.key]);
    }

    // DEBUG: Log raw sender info to diagnose the issue
    console.log(chalk.magenta('🔍 DEBUG - Raw sender info:'), {
      sender: m.sender,
      keyParticipant: m.key?.participant,
      keyRemoteJid: m.key?.remoteJid,
      isGroup: m.isGroup,
      isSelf: m.isSelf
    });

    // FIXED: Normalize sender for consistent comparison
    const senderPhone = normalizeJID(m.sender || '');
    const ownerPhone = normalizeJID(config.OWNER_NUMBER);

    console.log(chalk.cyan('🔍 DEBUG - Normalized comparison:'), {
      senderPhone,
      ownerPhone,
      configAdmins: config.ADMIN_NUMBERS
    });

    // FIXED: Safe permission checks with normalized JIDs
    const isOwner = senderPhone === ownerPhone;
    
    // FIXED: Check for multiple admin numbers (config admins) with normalized comparison
    let isConfigAdmin = isOwner;
    if (config.ADMIN_NUMBERS && !isOwner) {
      const adminNumbers = Array.isArray(config.ADMIN_NUMBERS) 
        ? config.ADMIN_NUMBERS 
        : config.ADMIN_NUMBERS.split(',').map(num => num.trim());
      
      isConfigAdmin = adminNumbers.some(adminNum => {
        const cleanAdminNum = normalizeJID(adminNum);
        console.log(chalk.yellow('🔍 Comparing:'), senderPhone, '===', cleanAdminNum, '?', senderPhone === cleanAdminNum);
        return senderPhone === cleanAdminNum;
      });
    }

    // ENHANCED: Check database admins (from owner plugin)
    let isDbAdmin = false;
    try {
      const dbAdmins = await OwnerHelpers.getAdmins();
      isDbAdmin = dbAdmins.some(admin => {
        const adminPhone = normalizeJID(admin.phone);
        return senderPhone === adminPhone;
      });
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Error checking database admins:'), error.message);
    }

    // Combined admin check (either config admin or database admin)
    const isAdmin = isConfigAdmin || isDbAdmin;
    
    // ENHANCED: Check if user is banned
    let isBanned = false;
    try {
      const bannedUsers = await OwnerHelpers.getBannedUsers();
      isBanned = bannedUsers.some(banned => {
        const bannedPhone = normalizeJID(banned.phone);
        return senderPhone === bannedPhone;
      });
      
      if (isBanned && !isOwner) {
        // Silently ignore banned users
        return;
      }
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Error checking banned users:'), error.message);
    }
    
    // ENHANCED: Check bot mode from database instead of config
    let isPublic = true;
    try {
      isPublic = await OwnerHelpers.isBotPublic();
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Error checking bot mode, defaulting to public:'), error.message);
      // Fallback to config mode if database check fails
      isPublic = config.MODE === 'public';
    }
    
    // Bot mode enforcement
    if (!isPublic && !isOwner && !isAdmin) {
      // Optional: Send private mode message (uncomment if desired)
      // if (m.body && m.body.startsWith(config.PREFIX)) {
      //   await sock.sendMessage(m.from, { 
      //     text: '🔒 Bot is currently in private mode. Only admins can use commands.' 
      //   });
      // }
      return;
    }

    // FIXED: Safe rate limiting check with normalized JID
    const senderId = senderPhone || 'unknown';
    if (RateLimitHelpers.isLimited(senderId, 'global', 10, 60000)) {
      return; // Silently ignore rate limited users
    }

    // FIXED: Safe message body extraction and logging
    let messageBody = '';
    try {
      if (m.body && typeof m.body === 'string') {
        messageBody = m.body.trim();
      } else {
        messageBody = '';
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️ Error extracting message body:', error.message));
      messageBody = '';
    }

    // Log incoming message with safety checks
    const senderName = m.isGroup 
      ? `${senderPhone} in ${(m.from || 'unknown').split('@')[0]}` 
      : senderPhone;
    
    if (messageBody && messageBody.startsWith(config.PREFIX)) {
      const displayMessage = messageBody.length > 50 
        ? messageBody.substring(0, 50) + '...' 
        : messageBody;
      console.log(chalk.blue(`📨 Command from ${senderName}: ${displayMessage} [Owner: ${isOwner}, Admin: ${isAdmin}, Mode: ${isPublic ? 'Public' : 'Private'}]`));
    }

    // Auto react to messages (only for non-commands and random chance)
    if (config.AUTO_REACT && !m.isSelf && messageBody && !messageBody.startsWith(config.PREFIX) && Math.random() < 0.1) {
      const randomEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
      try {
        await m.react(randomEmoji);
      } catch (error) {
        // Silent fail for reactions
      }
    }

    // FIXED: Handle antilink protection with better null safety
    if (config.ANTILINK && m.isGroup && !isOwner && !isAdmin) {
      const linkRegex = /(https?:\/\/[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
      
      if (messageBody && linkRegex.test(messageBody)) {
        try {
          // Check if bot is admin before trying to remove
          const isBotAdmin = await m.isBotAdmin();
          
          if (isBotAdmin) {
            await sock.sendMessage(m.from, {
              text: '🚫 Links are not allowed in this group!',
              mentions: [m.sender]
            });
            
            // Give user a moment to see the message before removal
            setTimeout(async () => {
              try {
                await sock.groupParticipantsUpdate(m.from, [m.sender], 'remove');
              } catch (removeError) {
                console.log(chalk.yellow('⚠️ Failed to remove user:', removeError.message));
              }
            }, 2000);
          } else {
            await sock.sendMessage(m.from, {
              text: '🚫 Links detected! Bot needs admin privileges to remove users.',
              mentions: [m.sender]
            });
          }
          
          return; // Don't process other commands for link messages
        } catch (error) {
          console.log(chalk.yellow('⚠️ Antilink error:', error.message));
        }
      }
    }

    // Execute all plugins using PluginManager
    try {
      await PluginManager.executePlugins(m, sock, config, bot);
    } catch (error) {
      console.error(chalk.red('❌ Plugin execution error:'), error.message);
    }

  } catch (error) {
    console.error(chalk.red('❌ Message handler error:'), error.message);
    
    // Optional: Send error notification to owner (with safety checks)
    if (config.OWNER_NUMBER && error.message) {
      try {
        const ownerJID = normalizeJID(config.OWNER_NUMBER) + '@s.whatsapp.net';
        await sock.sendMessage(ownerJID, {
          text: `🚨 Bot Error Alert\n\n❌ Error: ${error.message}\n📍 Location: Message Handler\n⏰ Time: ${new Date().toLocaleString()}`
        });
      } catch (notifyError) {
        // Silent fail for error notifications
      }
    }
  }
}
