import chalk from 'chalk';
import { serializeMessage } from '../lib/serializer.js';
import { PermissionHelpers, RateLimitHelpers } from '../lib/helpers.js';
import pluginManager from '../lib/pluginManager.js';

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

    // Permission checks
    const isOwner = PermissionHelpers.isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net');
    const isPublic = config.MODE === 'public';
    
    if (!isPublic && !isOwner) return;

    // Rate limiting check
    if (RateLimitHelpers.isLimited(m.sender, 'global', 10, 60000)) {
      return; // Silently ignore rate limited users
    }

    // Log incoming message
    const senderName = m.isGroup 
      ? `${m.sender.split('@')[0]} in ${m.from.split('@')[0]}` 
      : m.sender.split('@')[0];
    
    if (m.body.startsWith(config.PREFIX)) {
      console.log(chalk.blue(`📨 Command from ${senderName}: ${m.body.substring(0, 50)}${m.body.length > 50 ? '...' : ''}`));
    }

    // Auto react to messages (only for non-commands and random chance)
    if (config.AUTO_REACT && !m.isSelf && !m.body.startsWith(config.PREFIX) && Math.random() < 0.1) {
      const randomEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
      try {
        await m.react(randomEmoji);
      } catch (error) {
        // Silent fail for reactions
      }
    }

    // Handle antilink protection
    if (config.ANTILINK && m.isGroup && !isOwner) {
      const linkRegex = /(https?:\/\/[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
      
      if (linkRegex.test(m.body)) {
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

    // Execute all plugins through plugin manager
    try {
      await pluginManager.executePlugins(m, sock, config);
    } catch (error) {
      console.error(chalk.red('❌ Plugin execution error:'), error.message);
    }

    // Handle group participant updates (moved to groupHandler.js)
    // This is now handled in the main index.js file

  } catch (error) {
    console.error(chalk.red('❌ Message handler error:'), error.message);
    
    // Optional: Send error notification to owner
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
