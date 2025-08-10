// plugins/owner.js - Owner-only commands plugin
export const info = {
  name: 'owner',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Owner-only administrative commands',
  commands: [
    {
      name: 'reload',
      aliases: ['rl'],
      description: 'Reload all plugins (Owner only)'
    },
    {
      name: 'stats',
      aliases: ['status'],
      description: 'Show detailed bot statistics (Owner only)'
    },
    {
      name: 'enable',
      description: 'Enable a specific plugin (Owner only)'
    },
    {
      name: 'disable',
      description: 'Disable a specific plugin (Owner only)'
    }
  ]
};

export default async function ownerHandler(m, sock, config) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;
  
  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  
  // Check if user is owner
  const isOwner = m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
  
  if (!isOwner) return; // Only owner can use these commands
  
  if (command === 'reload' || command === 'rl') {
    const { default: PluginManager } = await import('../lib/pluginManager.js');
    
    await sock.sendMessage(m.from, { text: '🔄 Reloading all plugins...' });
    
    try {
      await PluginManager.reloadAllPlugins();
      const stats = PluginManager.getPluginStats();
      
      await sock.sendMessage(m.from, {
        text: `✅ *Plugins Reloaded Successfully!*
        
📊 *Results:*
• Total: ${stats.total}
• Enabled: ${stats.enabled}
• Disabled: ${stats.disabled}

🔥 All plugins are ready to serve!`
      });
    } catch (error) {
      await sock.sendMessage(m.from, {
        text: `❌ *Plugin Reload Failed*\n\n📝 Error: ${error.message}`
      });
    }
  }
  
  if (command === 'stats' || command === 'status') {
    const { default: PluginManager } = await import('../lib/pluginManager.js');
    const stats = PluginManager.getPluginStats();
    const health = await PluginManager.healthCheck();
    
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const uptime = process.uptime();
    const uptimeStr = Math.floor(uptime / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm';
    
    const statsText = `📊 *Bot Statistics*

🤖 *System:*
• Uptime: ${uptimeStr}
• Memory: ${memUsedMB}MB
• Health: ${health.healthy ? '✅ Healthy' : '⚠️ Issues'}

🔌 *Plugins:*
• Total: ${stats.total}
• Enabled: ${stats.enabled}
• Disabled: ${stats.disabled}
• Executions: ${stats.totalExecutions}
• Errors: ${stats.totalErrors}

${health.issues.length > 0 ? `\n⚠️ *Issues:*\n${health.issues.map(issue => `• ${issue}`).join('\n')}` : ''}

🌐 *API Endpoints:*
• /plugins - Plugin management
• /health - System health
• /stats - Statistics`;

    await sock.sendMessage(m.from, { text: statsText });
  }
  
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
}