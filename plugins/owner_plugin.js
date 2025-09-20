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
    { name: 'restart', description: 'Restart bot' }
  ]
};

import { OwnerHelpers } from '../lib/helpers.js';

export default async function ownerHandler(m, sock, config) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;
  
  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  
  // Define owner-only commands
  const ownerCommands = [
    'reload', 'rl', 'stats', 'status', 'enable', 'disable', 'mode', 
    'ban', 'unban', 'banned', 'broadcast', 'addadmin', 'removeadmin', 
    'admins', 'setname', 'setstatus', 'shutdown', 'restart'
  ];
  
  // Only process if it's actually an owner command
  if (!ownerCommands.includes(command)) {
    return; // Let other plugins handle non-owner commands
  }
  
  const isOwner = m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
  
  // Check admin status for specific commands
  let isAdmin = false;
  if (!isOwner && ['ban', 'unban', 'banned', 'addadmin', 'removeadmin', 'admins'].includes(command)) {
    try {
      const admins = await OwnerHelpers.getAdmins();
      const senderPhone = m.sender.replace('@s.whatsapp.net', '');
      isAdmin = admins.some(admin => admin.phone === senderPhone);
      
      if (!isAdmin) {
        await m.reply('❌ You are not authorized to use this command.');
        return;
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      await m.reply('❌ Error checking authorization.');
      return;
    }
  } else if (!isOwner) {
    await m.reply('❌ You are not the owner. These commands are restricted.');
    return;
  }

  try {
    // Reload plugins
    if (command === 'reload' || command === 'rl') {
      const { default: PluginManager } = await import('../lib/pluginManager.js');
      await sock.sendMessage(m.from, { text: '🔄 Reloading all plugins...' });
      
      try {
        await PluginManager.reloadAllPlugins();
        const stats = PluginManager.getPluginStats();
        await sock.sendMessage(m.from, {
          text: `✅ *Plugins Reloaded Successfully!*\n\n📊 *Results:*\n• Total: ${stats.total}\n• Enabled: ${stats.enabled}\n• Disabled: ${stats.disabled}\n\n🔥 All plugins are ready to serve!`
        });
      } catch (error) {
        await sock.sendMessage(m.from, {
          text: `❌ *Plugin Reload Failed*\n\n📝 Error: ${error.message}`
        });
      }
    }

    // Bot statistics
    else if (command === 'stats' || command === 'status') {
      const { default: PluginManager } = await import('../lib/pluginManager.js');
      const stats = PluginManager.getPluginStats();
      const health = await PluginManager.healthCheck();
      const memUsage = process.memoryUsage();
      const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const uptime = process.uptime();
      const uptimeStr = Math.floor(uptime / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm';
      
      const statsText = `📊 *Bot Statistics*\n\n🤖 *System:*\n• Uptime: ${uptimeStr}\n• Memory: ${memUsedMB}MB\n• Health: ${health.healthy ? '✅ Healthy' : '⚠️ Issues'}\n\n🔌 *Plugins:*\n• Total: ${stats.total}\n• Enabled: ${stats.enabled}\n• Disabled: ${stats.disabled}\n• Executions: ${stats.totalExecutions}\n• Errors: ${stats.totalErrors}\n${health.issues.length > 0 ? `\n⚠️ *Issues:*\n${health.issues.map(issue => `• ${issue}`).join('\n')}` : ''}\n\n🌐 *API Endpoints:*\n• /plugins - Plugin management\n• /health - System health\n• /stats - Statistics`;
      
      await sock.sendMessage(m.from, { text: statsText });
    }

    // Enable plugin
    else if (command === 'enable') {
      const pluginName = args[1];
      if (!pluginName) {
        await sock.sendMessage(m.from, {
          text: `❌ Please specify plugin name\n\n📝 Usage: ${config.PREFIX}enable <plugin-name>`
        });
        return;
      }
      
      const { default: PluginManager } = await import('../lib/pluginManager.js');
      const success = await PluginManager.enablePlugin(pluginName);
      
      if (success) {
        await sock.sendMessage(m.from, {
          text: `✅ Plugin *${pluginName}* has been enabled!`
        });
      } else {
        await sock.sendMessage(m.from, {
          text: `❌ Failed to enable plugin *${pluginName}*\n\nPlugin might not exist or already enabled.`
        });
      }
    }

    // Disable plugin
    else if (command === 'disable') {
      const pluginName = args[1];
      if (!pluginName) {
        await sock.sendMessage(m.from, {
          text: `❌ Please specify plugin name\n\n📝 Usage: ${config.PREFIX}disable <plugin-name>`
        });
        return;
      }
      
      const { default: PluginManager } = await import('../lib/pluginManager.js');
      const success = await PluginManager.disablePlugin(pluginName);
      
      if (success) {
        await sock.sendMessage(m.from, {
          text: `🚫 Plugin *${pluginName}* has been disabled!`
        });
      } else {
        await sock.sendMessage(m.from, {
          text: `❌ Failed to disable plugin *${pluginName}*\n\nPlugin might not exist or already disabled.`
        });
      }
    }

    // Ban user
    else if (command === 'ban') {
      let targetUser = null;
      let reason = '';

      // Check if there's a quoted message
      if (m.quoted && m.quoted.sender) {
        targetUser = m.quoted.sender.replace('@s.whatsapp.net', '');
        reason = args.slice(1).join(' ') || 'No reason provided';
      } 
      // Check if phone number is provided as argument
      else if (args[1]) {
        targetUser = args[1].replace('@s.whatsapp.net', '');
        reason = args.slice(2).join(' ') || 'No reason provided';
      }

      if (!targetUser) {
        await sock.sendMessage(m.from, { 
          text: `❌ Usage: ${config.PREFIX}ban <phone-number> [reason]\n\n💡 *Tip:* You can also reply to a message and use \`${config.PREFIX}ban [reason]\`` 
        });
        return;
      }

      // Don't allow banning the owner
      if (targetUser === config.OWNER_NUMBER) {
        await sock.sendMessage(m.from, { text: '❌ Cannot ban the bot owner!' });
        return;
      }

      // Don't allow banning yourself
      const senderPhone = m.sender.replace('@s.whatsapp.net', '');
      if (targetUser === senderPhone) {
        await sock.sendMessage(m.from, { text: '❌ You cannot ban yourself!' });
        return;
      }

      try {
        await OwnerHelpers.banUser(targetUser);
        
        const banMessage = `🚫 User *${targetUser}* has been banned.\n\n📝 *Reason:* ${reason}\n👤 *Banned by:* ${senderPhone}`;
        
        // If in a group, mention the banned user
        if (m.isGroup && m.quoted) {
          await sock.sendMessage(m.from, { 
            text: banMessage,
            mentions: [m.quoted.sender]
          });
        } else {
          await sock.sendMessage(m.from, { text: banMessage });
        }
      } catch (error) {
        await sock.sendMessage(m.from, { text: `❌ Error banning user: ${error.message}` });
      }
    }

    // Unban user
    else if (command === 'unban') {
      let targetUser = null;

      // Check if there's a quoted message
      if (m.quoted && m.quoted.sender) {
        targetUser = m.quoted.sender.replace('@s.whatsapp.net', '');
      } 
      // Check if phone number is provided as argument
      else if (args[1]) {
        targetUser = args[1].replace('@s.whatsapp.net', '');
      }

      if (!targetUser) {
        await sock.sendMessage(m.from, { 
          text: `❌ Usage: ${config.PREFIX}unban <phone-number>\n\n💡 *Tip:* You can also reply to a message and use \`${config.PREFIX}unban\`` 
        });
        return;
      }

      try {
        const success = await OwnerHelpers.unbanUser(targetUser);
        
        if (success) {
          const unbanMessage = `✅ User *${targetUser}* has been unbanned.\n👤 *Unbanned by:* ${m.sender.replace('@s.whatsapp.net', '')}`;
          
          // If in a group, mention the unbanned user
          if (m.isGroup && m.quoted) {
            await sock.sendMessage(m.from, { 
              text: unbanMessage,
              mentions: [m.quoted.sender]
            });
          } else {
            await sock.sendMessage(m.from, { text: unbanMessage });
          }
        } else {
          await sock.sendMessage(m.from, { text: `❌ User *${targetUser}* was not found in the ban list.` });
        }
      } catch (error) {
        await sock.sendMessage(m.from, { text: `❌ Error unbanning user: ${error.message}` });
      }
    }

    // List banned users
    else if (command === 'banned') {
      try {
        const list = await OwnerHelpers.getBannedUsers();
        
        if (list.length === 0) {
          await sock.sendMessage(m.from, { text: '✅ No banned users.' });
          return;
        }

        let message = `🚫 *Banned Users (${list.length}):*\n\n`;
        
        list.forEach((user, i) => {
          const bannedDate = user.bannedAt ? new Date(user.bannedAt).toLocaleDateString() : 'Unknown';
          message += `${i + 1}. *${user.phone}*\n   📅 Banned: ${bannedDate}\n\n`;
        });
        
        message += `💡 *Tip:* Reply to a message and use \`${config.PREFIX}unban\` to unban someone quickly.`;
        
        await sock.sendMessage(m.from, { text: message });
      } catch (error) {
        await sock.sendMessage(m.from, { text: `❌ Error fetching banned users: ${error.message}` });
      }
    }

    // Add admin
    else if (command === 'addadmin') {
      let targetUser = null;

      // Check if there's a quoted message
      if (m.quoted && m.quoted.sender) {
        targetUser = m.quoted.sender.replace('@s.whatsapp.net', '');
      } 
      // Check if phone number is provided as argument
      else if (args[1]) {
        targetUser = args[1].replace('@s.whatsapp.net', '');
      }

      if (!targetUser) {
        await sock.sendMessage(m.from, { 
          text: `❌ Usage: ${config.PREFIX}addadmin <phone-number>\n\n💡 *Tip:* You can also reply to a message and use \`${config.PREFIX}addadmin\`` 
        });
        return;
      }

      // Don't allow adding owner as admin (they already have full access)
      if (targetUser === config.OWNER_NUMBER) {
        await sock.sendMessage(m.from, { text: '❌ Owner already has full access!' });
        return;
      }

      try {
        // Check if already admin
        const isAlreadyAdmin = await OwnerHelpers.isUserAdmin(targetUser);
        if (isAlreadyAdmin) {
          await sock.sendMessage(m.from, { text: `❌ User *${targetUser}* is already an admin.` });
          return;
        }

        await OwnerHelpers.addAdmin(targetUser);
        
        const adminMessage = `👑 User *${targetUser}* has been added as admin.\n👤 *Added by:* ${m.sender.replace('@s.whatsapp.net', '')}`;
        
        // If in a group, mention the new admin
        if (m.isGroup && m.quoted) {
          await sock.sendMessage(m.from, { 
            text: adminMessage,
            mentions: [m.quoted.sender]
          });
        } else {
          await sock.sendMessage(m.from, { text: adminMessage });
        }
      } catch (error) {
        await sock.sendMessage(m.from, { text: `❌ Error adding admin: ${error.message}` });
      }
    }

    // Remove admin
    else if (command === 'removeadmin') {
      let targetUser = null;

      // Check if there's a quoted message
      if (m.quoted && m.quoted.sender) {
        targetUser = m.quoted.sender.replace('@s.whatsapp.net', '');
      } 
      // Check if phone number is provided as argument
      else if (args[1]) {
        targetUser = args[1].replace('@s.whatsapp.net', '');
      }

      if (!targetUser) {
        await sock.sendMessage(m.from, { 
          text: `❌ Usage: ${config.PREFIX}removeadmin <phone-number>\n\n💡 *Tip:* You can also reply to a message and use \`${config.PREFIX}removeadmin\`` 
        });
        return;
      }

      // Don't allow removing owner
      if (targetUser === config.OWNER_NUMBER) {
        await sock.sendMessage(m.from, { text: '❌ Cannot remove owner privileges!' });
        return;
      }

      try {
        const success = await OwnerHelpers.removeAdmin(targetUser);
        
        if (success) {
          const removeMessage = `❌ User *${targetUser}* has been removed from admin.\n👤 *Removed by:* ${m.sender.replace('@s.whatsapp.net', '')}`;
          
          // If in a group, mention the removed admin
          if (m.isGroup && m.quoted) {
            await sock.sendMessage(m.from, { 
              text: removeMessage,
              mentions: [m.quoted.sender]
            });
          } else {
            await sock.sendMessage(m.from, { text: removeMessage });
          }
        } else {
          await sock.sendMessage(m.from, { text: `❌ User *${targetUser}* was not found in the admin list.` });
        }
      } catch (error) {
        await sock.sendMessage(m.from, { text: `❌ Error removing admin: ${error.message}` });
      }
    }

    // List admins
    else if (command === 'admins') {
      try {
        const list = await OwnerHelpers.getAdmins();
        
        if (list.length === 0) {
          await sock.sendMessage(m.from, { text: '❌ No admin users.' });
          return;
        }

        let message = `👑 *Admin Users (${list.length}):*\n\n`;
        
        list.forEach((user, i) => {
          const addedDate = user.addedAt ? new Date(user.addedAt).toLocaleDateString() : 'Unknown';
          message += `${i + 1}. *${user.phone}*\n   📅 Added: ${addedDate}\n\n`;
        });
        
        message += `💡 *Tip:* Reply to a message and use \`${config.PREFIX}removeadmin\` to remove admin quickly.`;
        
        await sock.sendMessage(m.from, { text: message });
      } catch (error) {
        await sock.sendMessage(m.from, { text: `❌ Error fetching admins: ${error.message}` });
      }
    }

    // Change bot mode
    else if (command === 'mode') {
      const mode = args[1];
      if (!mode || !['public', 'private'].includes(mode.toLowerCase())) {
        const currentMode = await OwnerHelpers.getBotMode();
        await sock.sendMessage(m.from, { 
          text: `❌ Usage: ${config.PREFIX}mode <public|private>\n\n📊 Current mode: *${currentMode}*` 
        });
        return;
      }
      
      await OwnerHelpers.setBotMode(mode.toLowerCase());
      await sock.sendMessage(m.from, { 
        text: `🔧 Bot mode changed to *${mode.toLowerCase()}*.\n\n${mode.toLowerCase() === 'private' ? '🔒 Bot will only respond to owner and admins.' : '🌐 Bot will respond to everyone.'}` 
      });
    }

    // Broadcast message
    else if (command === 'broadcast') {
      const message = args.slice(1).join(' ');
      if (!message) {
        await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}broadcast <message>` });
        return;
      }
      
      await sock.sendMessage(m.from, { text: `📢 Broadcasting message to all chats...` });
      // Implementation depends on how you store chat information
    }

    // Change bot profile name
    else if (command === 'setname') {
      const name = args.slice(1).join(' ');
      if (!name) {
        await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}setname <new-name>` });
        return;
      }
      
      await sock.updateProfileName(name);
      await sock.sendMessage(m.from, { text: `✅ Bot profile name changed to *${name}*.` });
    }

    // Change bot profile status
    else if (command === 'setstatus') {
      const status = args.slice(1).join(' ');
      if (!status) {
        await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}setstatus <new-status>` });
        return;
      }
      
      await sock.updateProfileStatus(status);
      await sock.sendMessage(m.from, { text: `✅ Bot profile status changed.` });
    }

    // Shutdown bot
    else if (command === 'shutdown') {
      await sock.sendMessage(m.from, { text: '🛑 Shutting down bot...' });
      setTimeout(() => process.exit(0), 1000);
    }

    // Restart bot
    else if (command === 'restart') {
      await sock.sendMessage(m.from, { text: '🔄 Restarting bot...' });
      setTimeout(() => process.exit(1), 1000);
    }

  } catch (error) {
    console.error('Owner plugin error:', error);
    await sock.sendMessage(m.from, { text: `❌ An error occurred: ${error.message}` });
  }
    }
