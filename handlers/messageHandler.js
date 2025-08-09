// messageHandler.js
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { COMMAND_CATEGORIES } from '../lib/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This is the main fix: Dynamically load all plugins from the '../plugins' directory
const pluginsDir = path.join(__dirname, '..', 'plugins');
const plugins = [];

try {
  const pluginFiles = readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
  for (const file of pluginFiles) {
    const pluginPath = path.join(pluginsDir, file);
    const { default: pluginFunction, info } = await import(`file://${pluginPath}`);
    if (pluginFunction && info) {
      plugins.push({ pluginFunction, info });
      console.log(`✅ Plugin loaded: ${info.name}`);
    } else {
      console.warn(`⚠️ Failed to load plugin: ${file} (missing default export or info object)`);
    }
  }
} catch (error) {
  console.error('❌ Error loading plugins:', error);
}

export default async function MessageHandler(m, sock, logger, config) {
  try {
    if (!m.body || m.fromMe || !m.isBot) return;

    const prefix = config.PREFIX;
    const body = m.body;

    // Fix for the regular expression error
    const linkRegex = /(https?:\/\/[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/gi;

    // Check if the message is a command
    if (body.startsWith(prefix)) {
      const args = body.slice(prefix.length).trim().split(' ');
      const command = args.shift().toLowerCase();
      
      // Iterate through all loaded plugins to find a matching command
      for (const { pluginFunction, info } of plugins) {
        const commandInfo = info.commands.find(cmd =>
          cmd.name === command || (cmd.aliases && cmd.aliases.includes(command))
        );
        
        if (commandInfo) {
          // Check for owner-only or group-only restrictions
          if (commandInfo.ownerOnly && m.sender !== config.OWNER_NUMBER + '@s.whatsapp.net') {
            await m.reply('🚫 This command is for the bot owner only.');
            return;
          }
          if (commandInfo.groupOnly && !m.isGroup) {
            await m.reply('👥 This command can only be used in a group chat.');
            return;
          }
          
          // Execute the plugin's function with error handling
          try {
            await pluginFunction(m, sock, config);
            console.log(`Command executed: ${command} by ${m.pushName}`);
          } catch (error) {
            console.error(`❌ Error executing command ${command}:`, error);
            await m.reply(`❌ An error occurred while running this command: ${error.message}`);
          }
          return; // Stop after executing the command
        }
      }
      
      // Optional: Add a response for unknown commands
      // await m.reply(`I don't know the command '${command}'. Type ${prefix}menu to see all commands.`);
    }

    // You can add other non-command message handling logic here
    if (config.ANTILINK && m.isGroup && linkRegex.test(body) && !m.isOwner) {
      // Add your anti-link logic here
    }

    // Your existing auto-read/auto-react logic can go here
    if (config.AUTO_REACT) {
        // You'll need to define a logic for auto-reacting
    }
    
    if (config.AUTO_READ) {
        await sock.readMessages([m.key]);
    }

  } catch (error) {
    logger.error('❌ Message handler error:', error);
  }
}
