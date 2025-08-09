export default async function handler(m, sock, config) {
  const cmd = m.body.toLowerCase();
  const prefix = config.PREFIX;
  
  console.log(`🔍 Basic plugin processing: ${cmd}`);
  
  // Ping command
  if (cmd === prefix + 'ping') {
    console.log('✅ Ping command detected');
    const start = Date.now();
    await m.react('🏓');
    
    const sentMsg = await m.reply('🏓 Pong!');
    const end = Date.now();
    
    const pingText = `🏓 *Pong!*

📊 Response Time: ${end - start}ms
⚡ Status: Online
🕐 Time: ${new Date().toLocaleString()}
🤖 Bot: ${config.BOT_NAME}
👑 Owner: ${config.OWNER_NUMBER}`;
    
    try {
      await sock.sendMessage(m.from, {
        text: pingText,
        edit: sentMsg.key
      });
    } catch (error) {
      console.log('Could not edit message:', error.message);
      await m.reply(pingText);
    }
  }
  
  // Menu command
  if (cmd === prefix + 'menu' || cmd === prefix + 'help') {
    console.log('✅ Menu command detected');
    const menuText = `🤖 *${config.BOT_NAME} Menu*

📝 *Available Commands:*
• ${prefix}ping - Check bot response
• ${prefix}menu - Show this menu
• ${prefix}owner - Get owner contact
• ${prefix}info - Bot information
• ${prefix}alive - Check if bot is alive
• ${prefix}test - Test command

👑 *Owner Commands:*
• ${prefix}restart - Restart bot
• ${prefix}setbio - Update bot bio
• ${prefix}broadcast - Send broadcast

💡 *Bot Info:*
• Mode: ${config.MODE}
• Prefix: ${prefix}
• Owner: ${config.OWNER_NUMBER}

🔗 Powered by Fresh Bot Team

💡 Type ${prefix}help [command] for more info!`;
    
    await m.reply(menuText);
  }
  
  // Test command
  if (cmd === prefix + 'test') {
    console.log('✅ Test command detected');
    await m.reply(`✅ *Test Successful!*

🤖 Bot is working properly
📱 Commands are being processed
🔌 Plugins are loaded
⚡ All systems operational!

Current time: ${new Date().toLocaleString()}`);
  }
  
  // Owner command
  if (cmd === prefix + 'owner') {
    console.log('✅ Owner command detected');
    await m.reply(`👑 *Bot Owner*

📱 Number: ${config.OWNER_NUMBER}
👤 Name: ${config.OWNER_NAME || 'Bot Owner'}

💬 Contact: wa.me/${config.OWNER_NUMBER}

🤖 This bot is managed by the above contact.`);
    
    try {
      await sock.sendContact(m.from, [config.OWNER_NUMBER], m);
    } catch (error) {
      console.log('Could not send contact:', error.message);
    }
  }
  
  // Info command
  if (cmd === prefix + 'info') {
    console.log('✅ Info command detected');
    const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const uptime = Math.floor(process.uptime() / 60);
    
    const infoText = `ℹ️ *Bot Information*

🤖 Name: ${config.BOT_NAME}
📱 Version: 1.0.0
⚙️ Mode: ${config.MODE}
🎯 Prefix: ${prefix}
👑 Owner: ${config.OWNER_NUMBER}

📊 *System Stats:*
• Uptime: ${uptime} minutes
• Memory: ${memUsage}MB
• Platform: ${process.platform}
• Node.js: ${process.version}

⚙️ *Features:*
${config.AUTO_READ ? '✅' : '❌'} Auto Read
${config.AUTO_REACT ? '✅' : '❌'} Auto React
${config.WELCOME ? '✅' : '❌'} Welcome Messages
${config.REJECT_CALL ? '✅' : '❌'} Call Rejection

🔗 Powered by Baileys & Fresh Bot`;
    
    await m.reply(infoText);
  }
  
  // Alive command
  if (cmd === prefix + 'alive') {
    console.log('✅ Alive command detected');
    const uptime = Math.floor(process.uptime() / 60);
    const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    await m.reply(`✅ *Bot Status: ALIVE*

🕐 Current Time: ${new Date().toLocaleString()}
⏰ Uptime: ${uptime} minutes
📊 Memory Usage: ${memUsage}MB
🤖 Bot Name: ${config.BOT_NAME}
📱 Mode: ${config.MODE}

All systems operational! 🚀

Type ${prefix}menu for available commands.`);
  }
}

// Plugin metadata
export const info = {
  name: 'Basic Commands',
  version: '1.0.0',
  author: 'Fresh Bot Team',
  description: 'Essential bot commands including ping, menu, info, and status'
};
