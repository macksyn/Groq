// plugins/owner.js - Owner-only commands plugin
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

import { getAdmins } from './owner_db_helpers.js';

export default async function ownerHandler(m, sock, config) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;
  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  const isOwner = m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
  let isAdmin = false;
  if (!isOwner && (command === 'ban' || command === 'unban')) {
    // Check if sender is admin for ban/unban
    const admins = await getAdmins();
    isAdmin = admins.some(a => m.sender.includes(a.phone));
    if (!isAdmin) {
      await m.reply('❌ You are not authorized to use this command.');
      return;
    }
  } else if (!isOwner) {
    await m.reply('❌ You are not the owner. These commands are restricted.');
    return;
  }

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
  if (command === 'stats' || command === 'status') {
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
  if (command === 'enable') {
    const pluginName = args[1];
    if (!pluginName) {
      await sock.sendMessage(m.from, {
        text: `❌ Please specify plugin name\n\n📝 Usage: ${config.PREFIX}enable <plugin-name>`
      });
      return;
    }
    const { default: PluginManager } = await import('../lib/pluginManager.js');
    try {
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
    } catch (error) {
      await sock.sendMessage(m.from, {
        text: `❌ Error enabling plugin: ${error.message}`
      });
    }
  }

  // Disable plugin
  if (command === 'disable') {
    const pluginName = args[1];
    if (!pluginName) {
      await sock.sendMessage(m.from, {
        text: `❌ Please specify plugin name\n\n📝 Usage: ${config.PREFIX}disable <plugin-name>`
      });
      return;
    }
    const { default: PluginManager } = await import('../lib/pluginManager.js');
    try {
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
    } catch (error) {
      await sock.sendMessage(m.from, {
        text: `❌ Error disabling plugin: ${error.message}`
      });
    }
  }


  // Ban user (MongoDB)
  if (command === 'ban') {
    const number = args[1];
    if (!number) {
      await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}ban <phone-number>` });
      return;
    }
    await banUser(number);
    await sock.sendMessage(m.from, { text: `🚫 User *${number}* has been banned.` });
  }

  // Unban user (MongoDB)
  if (command === 'unban') {
    const number = args[1];
    if (!number) {
      await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}unban <phone-number>` });
      return;
    }
    await unbanUser(number);
    await sock.sendMessage(m.from, { text: `✅ User *${number}* has been unbanned.` });
  }

  // List banned users (MongoDB)
  if (command === 'banned') {
    const list = await getBannedUsers();
    await sock.sendMessage(m.from, { text: list.length ? `🚫 *Banned Users:*\n${list.map(u => u.phone).join('\n')}` : '✅ No banned users.' });
  }

  // Add admin (MongoDB)
  // ...existing code...

  // Change bot profile name
  if (command === 'setname') {
    const name = args.slice(1).join(' ');
    if (!name) {
      await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}setname <new-name>` });
      return;
    }
    await sock.updateProfileName(name);
    await sock.sendMessage(m.from, { text: `✅ Bot profile name changed to *${name}*.` });
  }

  // Change bot profile status
  if (command === 'setstatus') {
    const status = args.slice(1).join(' ');
    if (!status) {
      await sock.sendMessage(m.from, { text: `❌ Usage: ${config.PREFIX}setstatus <new-status>` });
      return;
    }
    await sock.updateProfileStatus(status);
    await sock.sendMessage(m.from, { text: `✅ Bot profile status changed.` });
  }

  // Shutdown bot
  if (command === 'shutdown') {
    await sock.sendMessage(m.from, { text: '🛑 Shutting down bot...' });
    process.exit(0);
  }

  // Restart bot
  if (command === 'restart') {
    await sock.sendMessage(m.from, { text: '🔄 Restarting bot...' });
    process.exit(1); // Use a process manager to auto-restart
  }
}