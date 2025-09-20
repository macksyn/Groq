// plugins/owner_plugin.js - Owner-only commands plugin
export const info = {
  name: 'Owner Manager',
  version: '2.0.0',
  author: 'Alex Macksyn',
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

import {
  banUser,
  unbanUser,
  getBannedUsers,
  addAdmin,
  removeAdmin,
  getAdmins
} from './owner_db_helpers.js';

export default async function ownerHandler(m, sock, config) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;
  
  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  const isOwner = m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
  
  // Check admin status for specific commands
  let isAdmin = false;
  if (!isOwner && ['ban', 'unban', 'banned', 'addadmin', 'removeadmin', 'admins'].includes(command)) {
    try {
      const admins = await getAdmins();
      // Extract phone number from sender (remove @s.whatsapp.net)
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
      const number = args[1];
      if (!number) {
        await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}ban <phone-number>` });
        return;
      }
      
      await banUser(number);
      await sock.sendMessage(m.from, { text: `🚫 User *${number}* has been banned.` });
    }

    // Unban user
    else if (command === 'unban') {
      const number = args[1];
      if (!number) {
        await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}unban <phone-number>` });
        return;
      }
      
      await unbanUser(number);
      await sock.sendMessage(m.from, { text: `✅ User *${number}* has been unbanned.` });
    }

    // List banned users
    else if (command === 'banned') {
      const list = await getBannedUsers();
      const message = list.length 
        ? `🚫 *Banned Users (${list.length}):*\n${list.map((u, i) => `${i + 1}. ${u.phone}`).join('\n')}` 
        : '✅ No banned users.';
      await sock.sendMessage(m.from, { text: message });
    }

    // Add admin
    else if (command === 'addadmin') {
      const number = args[1];
      if (!number) {
        await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}addadmin <phone-number>` });
        return;
      }
      
      await addAdmin(number);
      await sock.sendMessage(m.from, { text: `👑 User *${number}* has been added as admin.` });
    }

    // Remove admin
    else if (command === 'removeadmin') {
      const number = args[1];
      if (!number) {
        await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}removeadmin <phone-number>` });
        return;
      }
      
      await removeAdmin(number);
      await sock.sendMessage(m.from, { text: `❌ User *${number}* has been removed from admin.` });
    }

    // List admins
    else if (command === 'admins') {
      const list = await getAdmins();
      const message = list.length 
        ? `👑 *Admin Users (${list.length}):*\n${list.map((u, i) => `${i + 1}. ${u.phone}`).join('\n')}` 
        : '❌ No admin users.';
      await sock.sendMessage(m.from, { text: message });
    }

    // Change bot mode
    else if (command === 'mode') {
      const mode = args[1];
      if (!mode || !['public', 'private'].includes(mode.toLowerCase())) {
        await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}mode <public|private>` });
        return;
      }
      
      // You'll need to implement mode storage/retrieval
      await sock.sendMessage(m.from, { text: `🔧 Bot mode changed to *${mode}*.` });
    }

    // Broadcast message
    else if (command === 'broadcast') {
      const message = args.slice(1).join(' ');
      if (!message) {
        await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}broadcast <message>` });
        return;
      }
      
      // You'll need to implement chat storage/retrieval for broadcasting
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
      setTimeout(() => process.exit(1), 1000); // Use a process manager to auto-restart
    }

  } catch (error) {
    console.error('Owner plugin error:', error);
    await sock.sendMessage(m.from, { text: `❌ An error occurred: ${error.message}` });
  }
}
