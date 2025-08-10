// plugins/help.js - Help plugin
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
    // Import PluginManager (adjust path if needed)
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