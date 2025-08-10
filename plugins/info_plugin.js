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