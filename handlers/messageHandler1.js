import { getContentType } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serialize message
function serializeMessage(m, sock) {
  // Basic message properties
  if (m.key) {
    m.id = m.key.id;
    m.isSelf = m.key.fromMe;
    m.from = m.key.remoteJid;
    m.isGroup = m.from.endsWith('@g.us');
    m.sender = m.isGroup ? m.key.participant : m.isSelf ? sock.user.id : m.from;
  }

  if (m.message) {
    m.type = getContentType(m.message);
    
    // Handle ephemeral messages
    if (m.type === 'ephemeralMessage') {
      m.message = m.message[m.type].message;
      m.type = getContentType(m.message);
    }
    
    // Handle view once messages
    if (m.type === 'viewOnceMessageV2') {
      m.message = m.message[m.type].message;
      m.type = getContentType(m.message);
    }

    // Extract quoted message
    try {
      const quoted = m.message[m.type]?.contextInfo?.quotedMessage;
      if (quoted) {
        m.quoted = {
          id: m.message[m.type].contextInfo.stanzaId,
          sender: m.message[m.type].contextInfo.participant,
          message: quoted,
          type: getContentType(quoted)
        };
      }
    } catch {
      m.quoted = null;
    }

    // Extract message text
    m.body = m.message?.conversation ||
             m.message?.[m.type]?.text ||
             m.message?.[m.type]?.caption ||
             m.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
             m.message?.buttonsResponseMessage?.selectedButtonId ||
             '';
  }

  // Helper functions
  m.reply = (text) => sock.sendMessage(m.from, { text }, { quoted: m });
  
  m.react = async (emoji) => {
    await sock.sendMessage(m.from, {
      react: { text: emoji, key: m.key }
    });
  };

  return m;
}

// Load plugins dynamically
let pluginsCache = [];
let pluginsLoaded = false;

async function loadPlugins() {
  if (pluginsLoaded) return pluginsCache;
  
  try {
    const pluginsDir = path.join(__dirname, '..', 'plugins');
    
    // Check if plugins directory exists
    try {
      await fs.access(pluginsDir);
    } catch {
      console.log(chalk.yellow('📂 Plugins directory not found, creating...'));
      await fs.mkdir(pluginsDir, { recursive: true });
      
      // Create a sample plugin
      const samplePlugin = `export default async function handler(m, sock, config) {
  const cmd = m.body.toLowerCase();
  
  if (cmd === '.ping') {
    const start = Date.now();
    await m.reply('🏓 Pong!');
    const end = Date.now();
    await sock.sendMessage(m.from, {
      text: \`📊 Response time: \${end - start}ms\`,
      edit: m.key
    });
  }
  
  if (cmd === '.menu') {
    const menuText = \`🤖 *\${config.BOT_NAME} Menu*

📝 *Available Commands:*
• \${config.PREFIX}ping - Check bot response
• \${config.PREFIX}menu - Show this menu
• \${config.PREFIX}owner - Get owner info
• \${config.PREFIX}info - Bot information

💡 More commands coming soon!\`;
    
    await m.reply(menuText);
  }
  
  if (cmd === '.owner') {
    await sock.sendContact(m.from, [config.OWNER_NUMBER], m);
  }
  
  if (cmd === '.info') {
    const infoText = \`ℹ️ *Bot Information*

🤖 Name: \${config.BOT_NAME}
📱 Version: 1.0.0
⚙️ Mode: \${config.MODE}
🎯 Prefix: \${config.PREFIX}
👑 Owner: \${config.OWNER_NUMBER}

🔗 Powered by Baileys\`;
    
    await m.reply(infoText);
  }
}`;
      
      await fs.writeFile(path.join(pluginsDir, 'basic.js'), samplePlugin);
      console.log(chalk.green('✅ Created sample plugin: basic.js'));
    }
    
    const files = await fs.readdir(pluginsDir);
    const jsFiles = files.filter(file => file.endsWith('.js'));
    
    for (const file of jsFiles) {
      try {
        const pluginPath = path.join(pluginsDir, file);
        const pluginModule = await import(`file://${pluginPath}?t=${Date.now()}`);
        
        if (pluginModule.default && typeof pluginModule.default === 'function') {
          pluginsCache.push({
            name: file,
            handler: pluginModule.default
          });
          console.log(chalk.green(`✅ Loaded plugin: ${file}`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Failed to load plugin ${file}:`, error.message));
      }
    }
    
    pluginsLoaded = true;
    console.log(chalk.cyan(`🔌 Loaded ${pluginsCache.length} plugins`));
    
  } catch (error) {
    console.error(chalk.red('❌ Error loading plugins:'), error.message);
  }
  
  return pluginsCache;
}

// Auto reaction emojis
const reactionEmojis = ['❤️', '👍', '🔥', '⚡', '🎉', '💯', '✨', '🚀'];

// Main message handler
export default async function MessageHandler(messageUpdate, sock, logger, config) {
  try {
    if (messageUpdate.type !== 'notify') return;
    if (!messageUpdate.messages?.[0]) return;

    const m = serializeMessage(messageUpdate.messages[0], sock);
    if (!m.message || m.key.remoteJid === 'status@broadcast') return;

    // Auto read messages
    if (config.AUTO_READ) {
      await sock.readMessages([m.key]);
    }

    // Permission checks
    const isOwner = m.sender === (config.OWNER_NUMBER + '@s.whatsapp.net');
    const isPublic = config.MODE === 'public';
    
    if (!isPublic && !isOwner) return;

    // Log incoming message
    const senderName = m.isGroup ? `${m.sender.split('@')[0]} in ${m.from}` : m.sender.split('@')[0];
    console.log(chalk.blue(`📨 Message from ${senderName}: ${m.body.substring(0, 50)}${m.body.length > 50 ? '...' : ''}`));

    // Auto react to messages
    if (config.AUTO_REACT && !m.isSelf && Math.random() < 0.3) { // 30% chance
      const randomEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
      try {
        await m.react(randomEmoji);
      } catch (error) {
        // Silent fail for reactions
      }
    }

    // Handle antilink
    if (config.ANTILINK && m.isGroup && !isOwner) {
      const linkRegex = /(https?:\/\/[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/gi;
      if (linkRegex.test(m.body)) {
        try {
          await sock.sendMessage(m.from, {
            text: '🚫 Links are not allowed in this group!',
            mentions: [m.sender]
          });
          await sock.groupParticipantsUpdate(m.from, [m.sender], 'remove');
          return;
        } catch (error) {
          console.log(chalk.yellow('⚠️ Failed to remove link sender (not admin?)'));
        }
      }
    }

    // Load and run plugins
    const plugins = await loadPlugins();
    
    for (const plugin of plugins) {
      try {
        await plugin.handler(m, sock, config);
      } catch (error) {
        console.error(chalk.red(`❌ Plugin ${plugin.name} error:`), error.message);
      }
    }

    // Group participant changes
    sock.ev.on('group-participants.update', async (update) => {
      if (!config.WELCOME) return;
      
      try {
        const { id, participants, action } = update;
        const metadata = await sock.groupMetadata(id);
        
        for (const jid of participants) {
          const userName = jid.split('@')[0];
          
          if (action === 'add') {
            const welcomeMsg = `👋 Welcome to *${metadata.subject}*!\n\n@${userName}, hope you enjoy your stay here! 🎉`;
            await sock.sendMessage(id, {
              text: welcomeMsg,
              mentions: [jid]
            });
          }
          
          if (action === 'remove') {
            const byeMsg = `👋 @${userName} left the group.\n\nFarewell! 😢`;
            await sock.sendMessage(id, {
              text: byeMsg,
              mentions: [jid]
            });
          }
        }
      } catch (error) {
        console.log(chalk.yellow('⚠️ Welcome message error:', error.message));
      }
    });

  } catch (error) {
    console.error(chalk.red('❌ Message handler error:'), error.message);
  }
}
