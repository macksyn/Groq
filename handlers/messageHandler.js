import chalk from 'chalk';
import { serializeMessage } from '../lib/serializer.js';
import { PermissionHelpers, RateLimitHelpers } from '../lib/helpers.js';
import PluginManager from '../lib/pluginManager.js';

// Auto reaction emojis
const reactionEmojis = ['❤️', '👍', '🔥', '⚡', '🎉', '💯', '✨', '🚀'];

// Main message handler
export default async function MessageHandler(messageUpdate, sock, logger, config) {
  try {
    if (messageUpdate.type !== 'notify') return;
    if (!messageUpdate.messages?.[0]) return;

    // Serialize message with helper methods
    const m = serializeMessage(messageUpdate.messages[0], sock);
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

    // FIXED: Safe permission checks with null safety
    const isOwner = PermissionHelpers.isOwner(m.sender || '', config.OWNER_NUMBER + '@s.whatsapp.net');
    
    // FIXED: Check for multiple admin numbers
    let isAdmin = isOwner;
    if (config.ADMIN_NUMBERS) {
      const adminNumbers = Array.isArray(config.ADMIN_NUMBERS) 
        ? config.ADMIN_NUMBERS 
        : config.ADMIN_NUMBERS.split(',').map(num => num.trim());
      
      const senderNumber = (m.sender || '').replace('@s.whatsapp.net', '');
      isAdmin = isOwner || adminNumbers.some(adminNum => {
        const cleanAdminNum = adminNum.replace('@s.whatsapp.net', '');
        return senderNumber === cleanAdminNum;
      });
    }
    
    const isPublic = config.MODE === 'public';
    
    if (!isPublic && !isOwner && !isAdmin) return;

    // FIXED: Safe rate limiting check with null safety
    const senderId = m.sender || 'unknown';
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
      ? `${(m.sender || 'unknown').split('@')[0]} in ${(m.from || 'unknown').split('@')[0]}` 
      : (m.sender || 'unknown').split('@')[0];
    
    if (messageBody && messageBody.startsWith(config.PREFIX)) {
      const displayMessage = messageBody.length > 50 
        ? messageBody.substring(0, 50) + '...' 
        : messageBody;
      console.log(chalk.blue(`📨 Command from ${senderName}: ${displayMessage}`));
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
      await PluginManager.executePlugins(m, sock, config);
    } catch (error) {
      console.error(chalk.red('❌ Plugin execution error:'), error.message);
    }

  } catch (error) {
    console.error(chalk.red('❌ Message handler error:'), error.message);
    
    // Optional: Send error notification to owner (with safety checks)
    if (config.OWNER_NUMBER && error.message) {
      try {
        await sock.sendMessage(config.OWNER_NUMBER + '@s.whatsapp.net', {
          text: `🚨 Bot Error Alert\n\n❌ Error: ${error.message}\n📍 Location: Message Handler\n⏰ Time: ${new Date().toLocaleString()}`
        });
      } catch (notifyError) {
        // Silent fail for error notifications
      }
    }
  }
}
