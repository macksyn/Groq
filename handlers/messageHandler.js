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

// Plugin cache
let pluginsCache = [];
let pluginsLoaded = false;
let lastPluginCheck = 0;

// Load plugins dynamically
async function loadPlugins() {
  const now = Date.now();
  
  // Only reload plugins every 30 seconds to avoid constant file system checks
  if (pluginsLoaded && (now - lastPluginCheck) < 30000) {
    return pluginsCache;
  }
  
  try {
    const pluginsDir = path.join(__dirname, '..', 'plugins');
    console.log(chalk.blue(`🔌 Loading plugins from: ${pluginsDir}`));
    
    // Check if plugins directory exists
    try {
      await fs.access(pluginsDir);
    } catch {
      console.log(chalk.yellow('📂 Plugins directory not found, creating...'));
      await fs.mkdir(pluginsDir, { recursive: true });
      
      // Create basic plugin if it doesn't exist
      const basicPluginPath = path.join(pluginsDir, 'basic.js');
      try {
        await fs.access(basicPluginPath);
        console.log(chalk.green('✅ Basic plugin already exists'));
      } catch {
        console.log(chalk.yellow('📝 Creating basic plugin...'));
        await createBasicPlugin(basicPluginPath);
      }
    }
    
    const files = await fs.readdir(pluginsDir);
    const jsFiles = files.filter(file => file.endsWith('.js'));
    
    console.log(chalk.cyan(`📁 Found ${jsFiles.length} plugin files: ${jsFiles.join(', ')}`));
    
    // Clear old cache
    pluginsCache = [];
    
    for (const file of jsFiles) {
      try {
        const pluginPath = path.join(pluginsDir, file);
        
        // Add timestamp to bypass import cache
        const pluginModule = await import(`file://${pluginPath}?t=${Date.now()}`);
        
        if (pluginModule.default && typeof pluginModule.default === 'function') {
          pluginsCache.push({
            name: file.replace('.js', ''),
            handler: pluginModule.default,
            info: pluginModule.info || {}
          });
          console.log(chalk.green(`✅ Loaded plugin: ${file}`));
        } else {
          console.log(chalk.red(`❌ Invalid plugin format: ${file} (missing default export)`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Failed to load plugin ${file}:`), error.message);
      }
    }
    
    pluginsLoaded = true;
    lastPluginCheck = now;
    console.log(chalk.cyan(`🔌 Successfully loaded ${pluginsCache.length} plugins`));
    
  } catch (error) {
    console.error(chalk.red('❌ Error loading plugins:'), error.message);
  }
  
  return pluginsCache;
}

// Create basic plugin if missing
async function createBasicPlugin(pluginPath) {
  const basicPluginContent = `export default async function handler(m, sock, config) {
  const cmd = m.body.toLowerCase();
  const prefix = config.PREFIX;
  
  // Ping command
  if (cmd === prefix + 'ping') {
    const start = Date.now();
    await m.react('🏓');
    const sentMsg = await m.reply('🏓 Pong!');
    const end = Date.now();
    
    const pingText = \`🏓 *Pong!*

📊 Response Time: \${end - start}ms
⚡ Status: Online
🕐 Time: \${new Date().toLocaleString()}
🤖 Bot: \${config.BOT_NAME}\`;
    
    try {
      await sock.sendMessage(m.from, {
        text: pingText,
        edit: sentMsg.key
      });
    } catch (error) {
      console.log('Could not edit message:', error.message);
    }
  }
  
  // Menu command
  if (cmd === prefix + 'menu' || cmd === prefix + 'help') {
    const menuText = \`🤖 *\${config.BOT_NAME} Menu*

📝 *Available Commands:*
• \${prefix}ping - Check bot response
• \${prefix}menu - Show this menu
• \${prefix}owner - Get owner contact
• \${prefix}info - Bot information
• \${prefix}alive - Check if bot is alive

👑 *Owner Commands:*
• \${prefix}restart - Restart bot
• \${prefix}setbio - Update bot bio

💡 *Bot Info:*
• Mode: \${config.MODE}
• Prefix: \${prefix}
• Owner: \${config.OWNER_NUMBER}

🔗 Powered by Fresh Bot Team\`;
    
    await m.reply(menuText);
  }
  
  // Owner command
  if (cmd === prefix + 'owner') {
    await m.reply(\`👑 *Bot Owner*

📱 Number: \${config.OWNER_NUMBER}
👤 Name: \${config.OWNER_NAME}

💬 Contact: wa.me/\${config.OWNER_NUMBER}\`);
    
    try {
      await sock.sendContact(m.from, [config.OWNER_NUMBER], m);
    } catch (error) {
      console.log('Could not send contact:', error.message);
    }
  }
  
  // Info command
  if (cmd === prefix + 'info') {
    const infoText = \`ℹ️ *Bot Information*

🤖 Name: \${config.BOT_NAME}
📱 Version: 1.0.0
⚙️ Mode: \${config.MODE}
🎯 Prefix: \${prefix}
👑 Owner: \${config.OWNER_NUMBER}
📊 Uptime: \${Math.floor(process.uptime() / 60)} minutes

🔗 Powered by Baileys\`;
    
    await m.reply(infoText);
  }
  
  // Alive command
  if (cmd === prefix + 'alive') {
    await m.reply(\`✅ *Bot Status: ALIVE*

🕐 Current Time: \${new Date().toLocaleString()}
⏰ Uptime: \${Math.floor(process.uptime() / 60)} minutes
📊 Memory: \${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
🤖 Bot: \${config.BOT_NAME}

All systems operational! 🚀\`);
  }
}

// Plugin metadata
export const info = {
  name: 'Basic Commands',
  version: '1.0.0',
  description: 'Essential bot commands'
};`;
  
  await fs.writeFile(pluginPath, basicPluginContent);
  console.log(chalk.green('✅ Created basic plugin'));
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
    
    // Log all messages for debugging
    const senderName = m.isGroup ? \`\${m.sender.split('@')[0]} in \${m.from}\` : m.sender.split('@')[0];
    console.log(chalk.blue(\`📨 Message from \${senderName}: \${m.body.substring(0, 50)}\${m.body.length > 50 ? '...' : ''}\`));
    
    // Check permissions
    if (!isPublic && !isOwner) {
      console.log(chalk.yellow(\`⚠️ Private mode - ignoring message from \${senderName}\`));
      return;
    }

    // Auto react to messages
    if (config.AUTO_REACT && !m.isSelf && Math.random() < 0.3) {
      const randomEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
      try {
        await m.react(randomEmoji);
      } catch (error) {
        // Silent fail for reactions
      }
    }

    // Handle antilink
    if (config.ANTILINK && m.isGroup && !isOwner) {
      const linkRegex = /(https?:\\/\\/[^\\s]+)|([a-zA-Z0-9-]+\\.[a-zA-Z]{2,})/gi;
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

    // Only process commands that start with prefix or are directed at bot
    const hasPrefix = m.body.startsWith(config.PREFIX);
    const mentionedBot = m.body.includes('@' + sock.user.id.split(':')[0]);
    
    if (!hasPrefix && !mentionedBot) {
      // Not a command, skip plugin processing
      return;
    }

    console.log(chalk.green(\`🎯 Processing command: \${m.body}\`));

    // Load and run plugins
    const plugins = await loadPlugins();
    
    if (plugins.length === 0) {
      console.log(chalk.red('❌ No plugins available!'));
      await m.reply('⚠️ No plugins loaded. Please check bot configuration.');
      return;
    }
    
    console.log(chalk.cyan(\`🔌 Running \${plugins.length} plugins...\`));
    
    let commandProcessed = false;
    
    for (const plugin of plugins) {
      try {
        console.log(chalk.blue(\`🔄 Running plugin: \${plugin.name}\`));
        await plugin.handler(m, sock, config);
        commandProcessed = true;
      } catch (error) {
        console.error(chalk.red(\`❌ Plugin \${plugin.name} error:\`), error.message);
      }
    }
    
    if (!commandProcessed && hasPrefix) {
      console.log(chalk.yellow(\`❓ Unknown command: \${m.body}\`));
      await m.reply(\`❓ Unknown command. Type *\${config.PREFIX}menu* to see available commands.\`);
    }

  } catch (error) {
    console.error(chalk.red('❌ Message handler error:'), error.message);
    console.error(error.stack);
  }
}
