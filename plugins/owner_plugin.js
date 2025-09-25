// plugins/owner_plugin.js - Owner-only commands plugin
export const info = {
  name: 'Owner Manager',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Advanced owner-only administrative commands',
  commands: [
    { name: 'reload', aliases: ['rl'], description: 'Reload all plugins' },
    { name: 'stats', aliases: ['status'], description: 'Show bot statistics' },
    { name: 'enable', description: 'Enable a plugin' },
    { name: 'disable', description: 'Disable a plugin' },
    { name: 'mode', description: 'Change bot mode (public/private)' },
    { name: 'ban', description: 'Ban a user by phone number' },
    { name: 'unban', description: 'Unban a user by phone number' },
    { name: 'banned', description: 'List banned users' },
    { name: 'broadcast', description: 'Send message to all chats' },
    { name: 'addadmin', description: 'Add admin by phone number' },
    { name: 'removeadmin', description: 'Remove admin by phone number' },
    { name: 'admins', description: 'List all admins' },
    { name: 'setname', description: 'Change bot profile name' },
    { name: 'setstatus', description: 'Change bot profile status' },
    { name: 'shutdown', description: 'Shutdown bot' },
    { name: 'restart', description: 'Restart bot' },
    { name: 'help', description: 'Show this help message' }
  ]
};

import { OwnerHelpers } from '../lib/helpers.js';
import PluginManager from '../lib/pluginManager.js';

// --- Helper Functions ---

// Extracts target user from message (quoted or by argument)
const getTargetUser = (m, args) => {
  if (m.quoted && m.quoted.sender) {
    return m.quoted.sender.replace('@s.whatsapp.net', '');
  }
  if (args[1]) {
    return args[1].replace('@s.whatsapp.net', '');
  }
  return null;
};

// --- Command Handlers ---

const commands = {
  reload: {
    name: 'reload',
    aliases: ['rl'],
    description: 'Reload all plugins',
    cooldown: 10,
    execute: async (m, sock) => {
      await m.reply('🔄 Reloading all plugins...');
      try {
        await PluginManager.reloadAllPlugins();
        const stats = PluginManager.getPluginStats();
        await m.reply(`✅ *Plugins Reloaded Successfully!*\n\n📊 *Results:*\n• Total: ${stats.total}\n• Enabled: ${stats.enabled}\n• Disabled: ${stats.disabled}\n\n🔥 All plugins are ready to serve!`);
      } catch (error) {
        await m.reply(`❌ *Plugin Reload Failed*\n\n📝 Error: ${error.message}`);
      }
    }
  },

  stats: {
    name: 'stats',
    aliases: ['status'],
    description: 'Show bot statistics',
    cooldown: 5,
    execute: async (m, sock) => {
      const stats = PluginManager.getPluginStats();
      const health = await PluginManager.healthCheck();
      const memUsage = process.memoryUsage();
      const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const uptime = process.uptime();
      const uptimeStr = Math.floor(uptime / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm';
      
      const statsText = `📊 *Bot Statistics*\n\n🤖 *System:*\n• Uptime: ${uptimeStr}\n• Memory: ${memUsedMB}MB\n• Health: ${health.healthy ? '✅ Healthy' : '⚠️ Issues'}\n\n🔌 *Plugins:*\n• Total: ${stats.total}\n• Enabled: ${stats.enabled}\n• Disabled: ${stats.disabled}\n• Executions: ${stats.totalExecutions}\n• Errors: ${stats.totalErrors}\n${health.issues.length > 0 ? `\n⚠️ *Issues:*\n${health.issues.map(issue => `• ${issue}`).join('\n')}` : ''}\n\n🌐 *API Endpoints:*\n• /plugins - Plugin management\n• /health - System health\n• /stats - Statistics`;
      
      await m.reply(statsText);
    }
  },

  enable: {
    name: 'enable',
    description: 'Enable a plugin',
    usage: '<plugin-name>',
    execute: async (m, sock, args, config) => {
      const pluginName = args[1];
      if (!pluginName) return m.reply(`❌ Please specify plugin name\n\n📝 Usage: ${config.PREFIX}enable <plugin-name>`);
      
      const success = await PluginManager.enablePlugin(pluginName);
      if (success) {
        await m.reply(`✅ Plugin *${pluginName}* has been enabled!`);
      } else {
        await m.reply(`❌ Failed to enable plugin *${pluginName}*\n\nPlugin might not exist or already enabled.`);
      }
    }
  },

  disable: {
    name: 'disable',
    description: 'Disable a plugin',
    usage: '<plugin-name>',
    execute: async (m, sock, args, config) => {
      const pluginName = args[1];
      if (!pluginName) return m.reply(`❌ Please specify plugin name\n\n📝 Usage: ${config.PREFIX}disable <plugin-name>`);
      
      const success = await PluginManager.disablePlugin(pluginName);
      if (success) {
        await m.reply(`🚫 Plugin *${pluginName}* has been disabled!`);
      } else {
        await m.reply(`❌ Failed to disable plugin *${pluginName}*\n\nPlugin might not exist or already disabled.`);
      }
    }
  },

  mode: {
    name: 'mode',
    description: 'Change bot mode (public/private)',
    usage: '<public|private>',
    execute: async (m, sock, args, config) => {
      const mode = args[1];
      if (!mode || !['public', 'private'].includes(mode.toLowerCase())) {
        const currentMode = await OwnerHelpers.getBotMode();
        return m.reply(`❌ Usage: ${config.PREFIX}mode <public|private>\n\n📊 Current mode: *${currentMode}*`);
      }

      await OwnerHelpers.setBotMode(mode.toLowerCase());
      await m.reply(`🔧 Bot mode changed to *${mode.toLowerCase()}*.\n\n${mode.toLowerCase() === 'private' ? '🔒 Bot will only respond to owner and admins.' : '🌐 Bot will respond to everyone.'}`);
    }
  },

  ban: {
    name: 'ban',
    description: 'Ban a user by phone number',
    usage: '<phone-number> [reason]',
    minArgs: 1,
    execute: async (m, sock, args, config) => {
      const targetUser = getTargetUser(m, args);
      const reason = (m.quoted ? args.slice(1) : args.slice(2)).join(' ') || 'No reason provided';

      if (!targetUser) return m.reply(`❌ Usage: ${config.PREFIX}ban <phone-number> [reason]\n\n💡 *Tip:* You can also reply to a message and use \`${config.PREFIX}ban [reason]\``);
      if (targetUser === config.OWNER_NUMBER) return m.reply('❌ Cannot ban the bot owner!');
      if (targetUser === m.sender.replace('@s.whatsapp.net', '')) return m.reply('❌ You cannot ban yourself!');

      try {
        await OwnerHelpers.banUser(targetUser);
        const banMessage = `🚫 User *${targetUser}* has been banned.\n\n📝 *Reason:* ${reason}\n👤 *Banned by:* ${m.sender.replace('@s.whatsapp.net', '')}`;
        await sock.sendMessage(m.from, { text: banMessage, mentions: m.quoted ? [m.quoted.sender] : [] });
      } catch (error) {
        await m.reply(`❌ Error banning user: ${error.message}`);
      }
    }
  },

  unban: {
    name: 'unban',
    description: 'Unban a user by phone number',
    usage: '<phone-number>',
    minArgs: 1,
    execute: async (m, sock, args, config) => {
      const targetUser = getTargetUser(m, args);
      if (!targetUser) return m.reply(`❌ Usage: ${config.PREFIX}unban <phone-number>\n\n💡 *Tip:* You can also reply to a message and use \`${config.PREFIX}unban\``);

      try {
        const success = await OwnerHelpers.unbanUser(targetUser);
        if (success) {
          const unbanMessage = `✅ User *${targetUser}* has been unbanned.\n👤 *Unbanned by:* ${m.sender.replace('@s.whatsapp.net', '')}`;
          await sock.sendMessage(m.from, { text: unbanMessage, mentions: m.quoted ? [m.quoted.sender] : [] });
        } else {
          await m.reply(`❌ User *${targetUser}* was not found in the ban list.`);
        }
      } catch (error) {
        await m.reply(`❌ Error unbanning user: ${error.message}`);
      }
    }
  },

  banned: {
    name: 'banned',
    description: 'List banned users',
    execute: async (m, sock) => {
      try {
        const list = await OwnerHelpers.getBannedUsers();
        if (list.length === 0) return m.reply('✅ No banned users.');

        let message = `🚫 *Banned Users (${list.length}):*\n\n`;
        list.forEach((user, i) => {
          const bannedDate = user.bannedAt ? new Date(user.bannedAt).toLocaleDateString() : 'Unknown';
          message += `${i + 1}. *${user.phone}*\n   📅 Banned: ${bannedDate}\n\n`;
        });
        message += `💡 *Tip:* Reply to a message and use \`.unban\` to unban someone quickly.`;
        await m.reply(message);
      } catch (error) {
        await m.reply(`❌ Error fetching banned users: ${error.message}`);
      }
    }
  },

  addadmin: {
    name: 'addadmin',
    description: 'Add admin by phone number',
    usage: '<phone-number>',
    minArgs: 1,
    execute: async (m, sock, args, config) => {
      const targetUser = getTargetUser(m, args);
      if (!targetUser) return m.reply(`❌ Usage: ${config.PREFIX}addadmin <phone-number>\n\n💡 *Tip:* You can also reply to a message and use \`${config.PREFIX}addadmin\``);
      if (targetUser === config.OWNER_NUMBER) return m.reply('❌ Owner already has full access!');

      try {
        if (await OwnerHelpers.isUserAdmin(targetUser)) return m.reply(`❌ User *${targetUser}* is already an admin.`);
        
        await OwnerHelpers.addAdmin(targetUser);
        const adminMessage = `👑 User *${targetUser}* has been added as admin.\n👤 *Added by:* ${m.sender.replace('@s.whatsapp.net', '')}`;
        await sock.sendMessage(m.from, { text: adminMessage, mentions: m.quoted ? [m.quoted.sender] : [] });
      } catch (error) {
        await m.reply(`❌ Error adding admin: ${error.message}`);
      }
    }
  },

  removeadmin: {
    name: 'removeadmin',
    description: 'Remove admin by phone number',
    usage: '<phone-number>',
    minArgs: 1,
    execute: async (m, sock, args, config) => {
      const targetUser = getTargetUser(m, args);
      if (!targetUser) return m.reply(`❌ Usage: ${config.PREFIX}removeadmin <phone-number>\n\n💡 *Tip:* You can also reply to a message and use \`${config.PREFIX}removeadmin\``);
      if (targetUser === config.OWNER_NUMBER) return m.reply('❌ Cannot remove owner privileges!');

      try {
        const success = await OwnerHelpers.removeAdmin(targetUser);
        if (success) {
          const removeMessage = `❌ User *${targetUser}* has been removed from admin.\n👤 *Removed by:* ${m.sender.replace('@s.whatsapp.net', '')}`;
          await sock.sendMessage(m.from, { text: removeMessage, mentions: m.quoted ? [m.quoted.sender] : [] });
        } else {
          await m.reply(`❌ User *${targetUser}* was not found in the admin list.`);
        }
      } catch (error) {
        await m.reply(`❌ Error removing admin: ${error.message}`);
      }
    }
  },

  admins: {
    name: 'admins',
    description: 'List all admins',
    execute: async (m, sock) => {
      try {
        const list = await OwnerHelpers.getAdmins();
        if (list.length === 0) return m.reply('❌ No admin users.');

        let message = `👑 *Admin Users (${list.length}):*\n\n`;
        list.forEach((user, i) => {
          const addedDate = user.addedAt ? new Date(user.addedAt).toLocaleDateString() : 'Unknown';
          message += `${i + 1}. *${user.phone}*\n   📅 Added: ${addedDate}\n\n`;
        });
        message += `💡 *Tip:* Reply to a message and use \`.removeadmin\` to remove admin quickly.`;
        await m.reply(message);
      } catch (error) {
        await m.reply(`❌ Error fetching admins: ${error.message}`);
      }
    }
  },

  broadcast: {
    name: 'broadcast',
    description: 'Send message to all chats',
    usage: '<message>',
    minArgs: 1,
    execute: async (m, sock, args) => {
      const message = args.slice(1).join(' ');
      try {
        const chats = await sock.groupFetchAllParticipating();
        const chatIds = Object.keys(chats);

        if (chatIds.length === 0) {
          return m.reply('❌ No chats found to broadcast to.');
        }

        await m.reply(`📢 Broadcasting to ${chatIds.length} chats...`);
        let successCount = 0;
        let errorCount = 0;

        for (const chatId of chatIds) {
          try {
            await sock.sendMessage(chatId, { text: message });
            successCount++;
            // Delay to avoid spam detection
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (e) {
            errorCount++;
            console.error(`Failed to send broadcast to ${chatId}:`, e);
          }
        }
        await m.reply(`✅ Broadcast complete.\n\nSent: ${successCount}\nFailed: ${errorCount}`);
      } catch (error) {
        console.error('Error fetching chats for broadcast:', error);
        await m.reply(`❌ An error occurred during broadcast: ${error.message}`);
      }
    }
  },

  setname: {
    name: 'setname',
    description: 'Change bot profile name',
    usage: '<new-name>',
    minArgs: 1,
    execute: async (m, sock, args) => {
      const name = args.slice(1).join(' ');
      await sock.updateProfileName(name);
      await m.reply(`✅ Bot profile name changed to *${name}*.`);
    }
  },

  setstatus: {
    name: 'setstatus',
    description: 'Change bot profile status',
    usage: '<new-status>',
    minArgs: 1,
    execute: async (m, sock, args) => {
      const status = args.slice(1).join(' ');
      await sock.updateProfileStatus(status);
      await m.reply(`✅ Bot profile status changed.`);
    }
  },

  shutdown: {
    name: 'shutdown',
    description: 'Shutdown bot',
    execute: async (m, sock, args, config, bot) => {
      await m.reply('🛑 Shutting down bot...');
      bot.emit('shutdown');
    }
  },

  restart: {
    name: 'restart',
    description: 'Restart bot',
    execute: async (m, sock, args, config, bot) => {
      await m.reply('🔄 Restarting bot...');
      bot.emit('restart');
    }
  },

  help: {
    name: 'help',
    description: 'Show this help message',
    execute: async (m, sock, args, config) => {
      let helpText = `*${info.name} v${info.version}*\n${info.description}\n\n*Commands:*\n`;

      for (const cmd of info.commands) {
        helpText += `\n• *${config.PREFIX}${cmd.name}*`;
        if (cmd.aliases && cmd.aliases.length > 0) {
          helpText += ` (aliases: ${cmd.aliases.map(a => `*${a}*`).join(', ')})`;
        }
        helpText += `\n  - ${cmd.description}`;
      }

      await m.reply(helpText);
    }
  }
};

// --- Main Handler ---

export default async function ownerHandler(m, sock, config, bot) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;

  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const commandName = args[0].toLowerCase();

  const command = Object.values(commands).find(cmd => cmd.name === commandName || (cmd.aliases && cmd.aliases.includes(commandName)));

  if (!command) return;

  const isOwner = m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';

  // Define permission levels for commands
  const commandPermissions = {
    owner: ['reload', 'stats', 'enable', 'disable', 'mode', 'broadcast', 'setname', 'setstatus', 'shutdown', 'restart'],
    admin: ['ban', 'unban', 'banned', 'addadmin', 'removeadmin', 'admins'],
    all: ['help']
  };

  // Default to owner-only access
  let requiredPermission = 'owner';

  // Check if the command is in the admin list
  if (commandPermissions.admin.includes(command.name)) {
    requiredPermission = 'admin';
  } else if (commandPermissions.all.includes(command.name)) {
    requiredPermission = 'all';
  }

  // Authorize user
  if (requiredPermission === 'owner' && !isOwner) {
    return m.reply('❌ You are not the owner. This command is restricted.');
  }

  if (requiredPermission === 'admin' && !isOwner) {
    try {
      const isAdmin = await OwnerHelpers.isUserAdmin(m.sender.replace('@s.whatsapp.net', ''));
      if (!isAdmin) return m.reply('❌ You are not authorized to use this command.');
    } catch (error) {
      console.error('Error checking admin status:', error);
      return m.reply('❌ Error checking authorization.');
    }
  }

  try {
    await command.execute(m, sock, args, config, bot);
  } catch (error) {
    console.error(`Error executing owner command '${command.name}':`, error);
    await m.reply(`❌ An error occurred while executing the command: ${error.message}`);
  }
}
