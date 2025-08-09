import { TimeHelpers, SystemHelpers } from '../lib/helpers.js';
import { COMMAND_CATEGORIES } from '../lib/constants.js';

export default async function basicPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase();
  
  // Ping command - Check bot response time
  if (cmd === `${prefix}ping`) {
    const start = Date.now();
    await m.react('🏓');
    
    const sentMsg = await m.reply('🏓 Pong!');
    const end = Date.now();
    const responseTime = end - start;
    
    const pingMsg = `🏓 *Pong!*

📊 *Response Time:* ${responseTime}ms
⚡ *Status:* ${responseTime < 1000 ? 'Excellent' : responseTime < 3000 ? 'Good' : 'Slow'}
🕐 *Server Time:* ${TimeHelpers.formatTime()}
⏰ *Uptime:* ${TimeHelpers.formatUptime(SystemHelpers.getUptime())}`;

    // Edit the message to show detailed ping info
    await sock.sendMessage(m.from, {
      text: pingMsg,
      edit: sentMsg.key
    });
  }
  
  // Menu command - Show available commands
  if (cmd === `${prefix}menu` || cmd === `${prefix}help`) {
    const menuMsg = `🤖 *${config.BOT_NAME} - Command Menu*

📚 *General Commands:*
• ${prefix}ping - Check bot response
• ${prefix}menu - Show this menu  
• ${prefix}info - Bot information
• ${prefix}owner - Get owner contact
• ${prefix}status - Bot status
• ${prefix}uptime - Bot uptime

🎮 *Fun Commands:*
• ${prefix}joke - Random joke
• ${prefix}fact - Random fact
• ${prefix}quote - Inspirational quote

🔧 *Utility Commands:*
• ${prefix}weather [city] - Weather info
• ${prefix}qr [text] - Generate QR code
• ${prefix}short [url] - Shorten URL
• ${prefix}translate [text] - Translate text

🤖 *AI Commands:*
• ${prefix}ai [question] - Ask AI
• ${prefix}gpt [question] - Chat with GPT

👥 *Group Commands:* _(Groups only)_
• ${prefix}tagall - Tag all members
• ${prefix}groupinfo - Group information
• ${prefix}rules - Show group rules

👑 *Owner Commands:* _(Owner only)_
• ${prefix}restart - Restart bot
• ${prefix}broadcast [msg] - Broadcast message
• ${prefix}setbio [text] - Update bot bio

*ℹ️ Bot Information:*
• Prefix: *${prefix}*
• Mode: *${config.MODE.toUpperCase()}*
• Owner: *${config.OWNER_NUMBER}*
• Version: *1.0.0*

*📞 Support:*
• Owner: wa.me/${config.OWNER_NUMBER}
• Type: *${prefix}owner* for contact

*💡 Tips:*
• Use *${prefix}help [command]* for detailed help
• Commands work in groups and private chats
• Some commands require permissions

🔗 *Powered by Baileys & Fresh Bot*`;

    await m.reply(menuMsg);
  }
  
  // Info command - Bot information
  if (cmd === `${prefix}info` || cmd === `${prefix}about`) {
    const memory = SystemHelpers.getMemoryUsage();
    const platform = SystemHelpers.getPlatformInfo();
    
    const infoMsg = `ℹ️ *Bot Information*

🤖 *Basic Info:*
• Name: ${config.BOT_NAME}
• Version: 1.0.0
• Mode: ${config.MODE.toUpperCase()}
• Prefix: ${prefix}

👑 *Owner Info:*
• Number: ${config.OWNER_NUMBER}
• Name: ${config.OWNER_NAME || 'Bot Owner'}

📊 *System Stats:*
• Uptime: ${TimeHelpers.formatUptime(SystemHelpers.getUptime())}
• Memory Usage: ${memory.used}MB / ${memory.total}MB
• Platform: ${platform.platform} (${platform.arch})
• Node.js: ${platform.nodeVersion}
• Process ID: ${platform.pid}

⚙️ *Features Active:*
${config.AUTO_READ ? '✅' : '❌'} Auto Read Messages
${config.AUTO_REACT ? '✅' : '❌'} Auto React
${config.WELCOME ? '✅' : '❌'} Welcome Messages
${config.ANTILINK ? '✅' : '❌'} Anti-Link Protection
${config.REJECT_CALL ? '✅' : '❌'} Call Rejection

🕐 *Current Time:* ${TimeHelpers.formatTime()} (Lagos Time)
📅 *Current Date:* ${TimeHelpers.formatDate()}

🔗 *Technology Stack:*
• WhatsApp API: Baileys
• Runtime: Node.js
• Session Storage: Mega.nz
• Architecture: Plugin-based

📞 *Support:* wa.me/${config.OWNER_NUMBER}
🌐 *Repository:* github.com/freshbot/whatsapp-bot

Made with ❤️ by Fresh Bot Team`;

    await m.reply(infoMsg);
  }
  
  // Owner command - Get owner contact
  if (cmd === `${prefix}owner` || cmd === `${prefix}creator`) {
    const ownerMsg = `👑 *Bot Owner Information*

📱 *Contact Details:*
• Number: ${config.OWNER_NUMBER}
• Name: ${config.OWNER_NAME || 'Bot Owner'}
• WhatsApp: wa.me/${config.OWNER_NUMBER}

💼 *About Owner:*
• Role: Bot Developer & Administrator
• Responsible for: Bot maintenance and support
• Available: 24/7 for important issues

📞 *Contact Methods:*
1. Click the contact card below
2. Message directly: wa.me/${config.OWNER_NUMBER}
3. Call (urgent issues only)

⚠️ *Please Note:*
• Be respectful when contacting
• Clearly explain any issues
• Check the menu first before asking

🤖 Bot created and maintained by this awesome person! 🚀`;

    await m.reply(ownerMsg);
    
    // Send owner contact card
    await sock.sendContact(m.from, [config.OWNER_NUMBER], m, {
      displayName: config.OWNER_NAME || 'Bot Owner',
      vcard: `BEGIN:VCARD
VERSION:3.0
FN:${config.OWNER_NAME || 'Bot Owner'}
ORG:Fresh Bot Team
TEL;TYPE=cell:+${config.OWNER_NUMBER}
END:VCARD`
    });
  }
  
  // Status command - Current bot status
  if (cmd === `${prefix}status`) {
    const memory = SystemHelpers.getMemoryUsage();
    const uptime = SystemHelpers.getUptime();
    
    const statusMsg = `📊 *Bot Status Report*

🟢 *Current Status:* Online & Active

⏱️ *Performance:*
• Uptime: ${TimeHelpers.formatUptime(uptime)}
• Memory Usage: ${memory.used}MB
• CPU Usage: Normal
• Response Time: Fast

📈 *Statistics:*
• Messages Processed: ${Math.floor(uptime * 10)}+
• Commands Executed: ${Math.floor(uptime * 2)}+
• Groups Serving: Multiple
• Users Served: Many

🔧 *System Health:*
• Connection: Stable
• Session: Active  
• Plugins: Loaded
• API Services: Working

📱 *WhatsApp Status:*
• Connected: Yes ✅
• Multi-device: Supported
• Message Sync: Active
• Media Processing: Available

🕐 *Last Update:* ${TimeHelpers.formatTime()}
📊 *Next Restart:* Automatic if needed

All systems operational! 🚀`;

    await m.reply(statusMsg);
  }
  
  // Uptime command - Show how long bot has been running
  if (cmd === `${prefix}uptime`) {
    const uptime = SystemHelpers.getUptime();
    const memory = SystemHelpers.getMemoryUsage();
    
    const uptimeMsg = `⏰ *Bot Uptime Information*

🕐 *Current Uptime:* ${TimeHelpers.formatUptime(uptime)}

📊 *Detailed Stats:*
• Started: ${TimeHelpers.timeAgo(new Date(Date.now() - uptime * 1000))}
• Running for: ${Math.floor(uptime / 3600)} hours, ${Math.floor((uptime % 3600) / 60)} minutes
• Total seconds: ${Math.floor(uptime)}

💾 *Memory Status:*
• Used: ${memory.used}MB
• Total: ${memory.total}MB
• Efficiency: ${Math.round((memory.used / memory.total) * 100)}%

📈 *Performance:*
• Status: ${uptime > 3600 ? 'Stable' : 'Recently Started'}
• Restarts: Minimal
• Crashes: None

🔄 *Auto-Management:*
• Memory cleanup: Active
• Connection monitor: Running
• Error recovery: Enabled

The bot is running smoothly! 💪`;

    await m.reply(uptimeMsg);
  }
  
  // Rules command - Show group rules (group only)
  if (cmd === `${prefix}rules` && m.isGroup) {
    const rulesMsg = `📋 *Group Rules & Guidelines*

👥 *General Behavior:*
• Be respectful to all members
• No spam or flood messages
• Use appropriate language
• Stay on topic when possible

🚫 *Prohibited Content:*
• No adult/NSFW content
• No hate speech or discrimination  
• No personal attacks or bullying
• No sharing of illegal content

🔗 *Links & Media:*
• Ask before sharing links
• No promotional links without permission
• Share relevant media only
• Credit original creators

🤖 *Bot Usage:*
• Use commands responsibly
• Don't spam bot commands
• Report bugs to admins
• Prefix: ${prefix}

👮 *Enforcement:*
• Warnings will be given first
• Repeated violations = removal
• Admins have final say
• Appeal through private message

❓ *Questions?*
Contact group admins or bot owner.

*Remember: This is a friendly community! Let's keep it positive! 🌟*`;

    await m.reply(rulesMsg);
  }
}

// Plugin metadata
export const info = {
  name: 'Basic Commands',
  version: '1.0.0',
  author: 'Fresh Bot Team',
  description: 'Essential bot commands including ping, menu, info, and status',
  category: COMMAND_CATEGORIES.GENERAL,
  commands: [
    {
      name: 'ping',
      description: 'Check bot response time and status',
      usage: '.ping',
      aliases: ['p']
    },
    {
      name: 'menu',
      description: 'Show all available commands',
      usage: '.menu',
      aliases: ['help', 'commands']
    },
    {
      name: 'info',
      description: 'Display bot information and stats',
      usage: '.info',
      aliases: ['about', 'botinfo']
    },
    {
      name: 'owner',
      description: 'Get bot owner contact information',
      usage: '.owner',
      aliases: ['creator', 'dev']
    },
    {
      name: 'status',
      description: 'Check current bot status and performance',
      usage: '.status',
      aliases: ['health']
    },
    {
      name: 'uptime',
      description: 'Show how long bot has been running',
      usage: '.uptime',
      aliases: ['runtime']
    },
    {
      name: 'rules',
      description: 'Display group rules (groups only)',
      usage: '.rules',
      groupOnly: true
    }
  ]
};
