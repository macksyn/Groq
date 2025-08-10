// plugins/ping.js - Simple ping plugin example
export const info = {
  name: 'ping',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Simple ping command to test bot responsiveness',
  commands: [
    {
      name: 'ping',
      aliases: ['p'],
      description: 'Check bot ping and status'
    }
  ]
};

export default async function pingHandler(m, sock, config) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;
  
  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  
  if (command === 'ping' || command === 'p') {
    const startTime = Date.now();
    
    const response = await sock.sendMessage(m.from, {
      text: '🏓 Pong!'
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    // Edit the message with response time
    setTimeout(async () => {
      try {
        await sock.sendMessage(m.from, {
          text: `🏓 Pong!\n⚡ Response time: ${responseTime}ms\n🤖 Status: Online ✅`
        });
      } catch (error) {
        // Silent fail
      }
    }, 100);
  }
}

// ============================================

// plugins/help.js - Help plugin example
export const info = {
  name: 'help',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Display available commands and plugin information',
  commands: [
    {
      name: 'help',
      aliases: ['menu', 'h'],
      description: 'Show all available commands'
    },
    {
      name: 'plugins',
      aliases: ['plugin'],
      description: 'Show plugin information'
    }
  ]
};

export default async function helpHandler(m, sock, config) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;
  
  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  
  if (command === 'help' || command === 'menu' || command === 'h') {
    const helpText = `🤖 *${config.BOT_NAME} - Help Menu*

🎯 *Prefix:* ${config.PREFIX}

📋 *Available Commands:*

🏓 *${config.PREFIX}ping* - Check bot responsiveness
📊 *${config.PREFIX}plugins* - Show plugin information  
❓ *${config.PREFIX}help* - Show this help menu

👑 *Owner Commands:*
🔧 *${config.PREFIX}reload* - Reload all plugins
📈 *${config.PREFIX}stats* - Show bot statistics

💡 *Bot Features:*
${config.AUTO_READ ? '✅' : '❌'} Auto Read Messages
${config.AUTO_REACT ? '✅' : '❌'} Auto Reactions
${config.WELCOME ? '✅' : '❌'} Welcome Messages
${config.ANTILINK ? '✅' : '❌'} Anti-Link Protection

🔥 Bot is running on PluginManager system!

_Type ${config.PREFIX}plugins for plugin details_`;

    await sock.sendMessage(m.from, { text: helpText });
  }
  
  if (command === 'plugins' || command === 'plugin') {
    // Import PluginManager (you'll need to adjust the path)
    const { default: PluginManager } = await import('../lib/pluginManager.js');
    const pluginsList = PluginManager.listPlugins();
    const stats = PluginManager.getPluginStats();
    
    let pluginsText = `🔌 *Plugin Manager Status*

📊 *Statistics:*
• Total Plugins: ${stats.total}
• Enabled: ${stats.enabled}
• Disabled: ${stats.disabled}
• Total Executions: ${stats.totalExecutions}
• Total Errors: ${stats.totalErrors}

📋 *Loaded Plugins:*\n`;

    pluginsList.forEach((plugin, index) => {
      const status = plugin.enabled ? '✅' : '❌';
      const commands = plugin.stats.commands?.length || 0;
      
      pluginsText += `\n${index + 1}. ${status} *${plugin.name}*
   📝 ${plugin.description}
   👨‍💻 Author: ${plugin.author}
   🎯 Version: ${plugin.version}
   📊 Executions: ${plugin.stats.executions}
   ❌ Errors: ${plugin.stats.errors}`;
    });
    
    pluginsText += `\n\n💡 Use the web API at /plugins for detailed stats`;
    
    await sock.sendMessage(m.from, { text: pluginsText });
  }
}

// ============================================

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

// ============================================

// plugins/info.js - Bot information plugin
export const info = {
  name: 'info',
  version: '1.0.0',  
  author: 'Bot Developer',
  description: 'Display bot information and system details',
  commands: [
    {
      name: 'info',
      aliases: ['about', 'bot'],
      description: 'Show bot information'
    },
    {
      name: 'uptime',
      description: 'Show bot uptime'
    }
  ]
};

export default async function infoHandler(m, sock, config) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;
  
  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  
  if (command === 'info' || command === 'about' || command === 'bot') {
    const uptime = process.uptime();
    const uptimeStr = Math.floor(uptime / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm';
    
    const { default: PluginManager } = await import('../lib/pluginManager.js');
    const stats = PluginManager.getPluginStats();
    
    const infoText = `🤖 *${config.BOT_NAME}*

📋 *Information:*
• Owner: ${config.OWNER_NAME}
• Mode: ${config.MODE.toUpperCase()}
• Prefix: ${config.PREFIX}
• Uptime: ${uptimeStr}

🔌 *Plugin System:*
• Loaded: ${stats.enabled}/${stats.total}
• System: PluginManager v2.0
• Executions: ${stats.totalExecutions}

🎮 *Features:*
${config.AUTO_READ ? '✅' : '❌'} Auto Read Messages
${config.AUTO_REACT ? '✅' : '❌'} Auto Reactions  
${config.WELCOME ? '✅' : '❌'} Welcome Messages
${config.ANTILINK ? '✅' : '❌'} Anti-Link Protection
${config.REJECT_CALL ? '✅' : '❌'} Call Rejection

🔥 *Advanced WhatsApp Bot*
Built with Baileys & PluginManager

💡 Type *${config.PREFIX}help* for commands`;

    await sock.sendMessage(m.from, { text: infoText });
  }
  
  if (command === 'uptime') {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const uptimeText = `⏰ *Bot Uptime*

📊 *Detailed Uptime:*
• Days: ${days}
• Hours: ${hours}
• Minutes: ${minutes}  
• Seconds: ${seconds}

🚀 Total: ${days}d ${hours}h ${minutes}m ${seconds}s

✅ Bot has been running smoothly!`;

    await sock.sendMessage(m.from, { text: uptimeText });
  }
}