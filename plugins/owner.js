import { PermissionHelpers, SystemHelpers } from '../lib/helpers.js';
import { COMMAND_CATEGORIES } from '../lib/constants.js';

export default async function ownerPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase();
  const args = m.body.split(' ').slice(1);
  
  // Check if user is owner
  const isOwner = PermissionHelpers.isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net');
  if (!isOwner) return; // Exit if not owner
  
  // Restart bot command
  if (cmd === `${prefix}restart` || cmd === `${prefix}reboot`) {
    await m.reply('🔄 Restarting bot... Please wait...');
    
    try {
      // Give time for message to send
      setTimeout(() => {
        process.exit(0); // PM2 will restart automatically
      }, 2000);
    } catch (error) {
      await m.reply(`❌ *Code Evaluation Error*\n\n📝 *Input:*\n\`\`\`${code}\`\`\`\n\n🚨 *Error:*\n\`\`\`${error.message}\`\`\``);
    }
  }
  
  // Block/unblock user
  if (cmd.startsWith(`${prefix}block `) || cmd.startsWith(`${prefix}ban `)) {
    const user = args[0];
    
    if (!user) {
      return m.reply('🚫 Please specify user to block!\n\nUsage:\n• Reply to user message\n• .block @user\n• .block 1234567890');
    }
    
    try {
      let targetUser;
      
      // If replying to a message
      if (m.quoted) {
        targetUser = m.quoted.sender;
      } else if (user.includes('@')) {
        // If mentioning user
        targetUser = user.replace('@', '') + '@s.whatsapp.net';
      } else {
        // If providing number
        targetUser = user + '@s.whatsapp.net';
      }
      
      await sock.updateBlockStatus(targetUser, 'block');
      await m.reply(`🚫 Successfully blocked ${targetUser.split('@')[0]}`);
      
    } catch (error) {
      await m.reply('❌ Failed to block user: ' + error.message);
    }
  }
  
  // Unblock user
  if (cmd.startsWith(`${prefix}unblock `) || cmd.startsWith(`${prefix}unban `)) {
    const user = args[0];
    
    if (!user) {
      return m.reply('✅ Please specify user to unblock!\n\nExample: .unblock 1234567890');
    }
    
    try {
      const targetUser = user + '@s.whatsapp.net';
      await sock.updateBlockStatus(targetUser, 'unblock');
      await m.reply(`✅ Successfully unblocked ${user}`);
      
    } catch (error) {
      await m.reply('❌ Failed to unblock user: ' + error.message);
    }
  }
  
  // Join group by invite link
  if (cmd.startsWith(`${prefix}join `) || cmd.startsWith(`${prefix}joingroup `)) {
    const inviteLink = args[0];
    
    if (!inviteLink || !inviteLink.includes('chat.whatsapp.com')) {
      return m.reply('🔗 Please provide valid WhatsApp group invite link!\n\nExample: .join https://chat.whatsapp.com/ABC123');
    }
    
    try {
      const inviteCode = inviteLink.split('chat.whatsapp.com/')[1];
      const response = await sock.groupAcceptInvite(inviteCode);
      
      await m.reply(`✅ Successfully joined group!\n\n🏷️ Group ID: ${response}`);
      
    } catch (error) {
      await m.reply('❌ Failed to join group: ' + error.message);
    }
  }
  
  // Leave group
  if (cmd === `${prefix}leave` || cmd === `${prefix}leftgroup`) {
    if (!m.isGroup) {
      return m.reply('👥 This command can only be used in groups!');
    }
    
    try {
      await m.reply('👋 Bot is leaving this group. Goodbye everyone!');
      
      // Delay before leaving
      setTimeout(async () => {
        await sock.groupLeave(m.from);
      }, 3000);
      
    } catch (error) {
      await m.reply('❌ Failed to leave group: ' + error.message);
    }
  }
  
  // Get bot's current status
  if (cmd === `${prefix}botstatus` || cmd === `${prefix}system`) {
    const memory = SystemHelpers.getMemoryUsage();
    const platform = SystemHelpers.getPlatformInfo();
    const uptime = SystemHelpers.getUptime();
    
    const statusMsg = `🤖 *Bot System Status*

📊 *Performance:*
• Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m
• Memory: ${memory.used}MB / ${memory.total}MB (${Math.round(memory.used/memory.total*100)}%)
• CPU: Normal
• Status: Online ✅

💻 *System Info:*
• Platform: ${platform.platform}
• Architecture: ${platform.arch}
• Node.js: ${platform.nodeVersion}
• Process ID: ${platform.pid}

🔧 *Configuration:*
• Mode: ${config.MODE}
• Prefix: ${config.PREFIX}
• Auto Read: ${config.AUTO_READ ? 'ON' : 'OFF'}
• Auto React: ${config.AUTO_REACT ? 'ON' : 'OFF'}
• Welcome: ${config.WELCOME ? 'ON' : 'OFF'}
• Anti-link: ${config.ANTILINK ? 'ON' : 'OFF'}

📱 *WhatsApp Info:*
• Connected: Yes
• Session: Active
• Multi-device: Supported
• Phone: ${sock.user.id.split(':')[0]}

🔄 *Last Restart:* ${new Date(Date.now() - uptime * 1000).toLocaleString()}`;

    await m.reply(statusMsg);
  }
  
  // Set bot name/profile name
  if (cmd.startsWith(`${prefix}setname `) || cmd.startsWith(`${prefix}name `)) {
    const newName = m.body.slice(cmd.indexOf(' ') + 1);
    
    if (!newName) {
      return m.reply('📝 Please provide new bot name!\n\nExample: .setname Fresh Bot v2.0');
    }
    
    try {
      await sock.updateProfileName(newName);
      await m.reply(`✅ Bot name updated successfully!\n\n📝 New name: "${newName}"`);
      
    } catch (error) {
      await m.reply('❌ Failed to update name: ' + error.message);
    }
  }
  
  // Get all blocked users
  if (cmd === `${prefix}blocklist` || cmd === `${prefix}blocked`) {
    try {
      const blockedUsers = await sock.fetchBlocklist();
      
      if (blockedUsers.length === 0) {
        return m.reply('📝 No blocked users found.');
      }
      
      let blockedList = '🚫 *Blocked Users List:*\n\n';
      blockedUsers.forEach((user, index) => {
        blockedList += `${index + 1}. ${user.split('@')[0]}\n`;
      });
      
      blockedList += `\n📊 Total: ${blockedUsers.length} blocked users`;
      
      await m.reply(blockedList);
      
    } catch (error) {
      await m.reply('❌ Failed to fetch blocked users: ' + error.message);
    }
  }
  
  // Bot maintenance mode toggle
  if (cmd === `${prefix}maintenance`) {
    // This would require a global state management
    // For now, just show the concept
    await m.reply('🔧 Maintenance mode is not implemented in this version.\n\nTo enable maintenance:\n• Stop the bot\n• Update code\n• Restart bot');
  }
  
  // Send message to specific chat
  if (cmd.startsWith(`${prefix}send `)) {
    const parts = m.body.split(' ');
    if (parts.length < 3) {
      return m.reply('📤 Usage: .send [number/groupid] [message]\n\nExample: .send 1234567890 Hello from bot!');
    }
    
    const target = parts[1];
    const message = parts.slice(2).join(' ');
    
    try {
      const targetJid = target.includes('@') ? target : target + '@s.whatsapp.net';
      
      await sock.sendMessage(targetJid, { text: message });
      await m.reply(`✅ Message sent to ${target}\n\n📝 Message: "${message}"`);
      
    } catch (error) {
      await m.reply('❌ Failed to send message: ' + error.message);
    }
  }
}

// Plugin metadata
export const info = {
  name: 'Owner Commands',
  version: '1.0.0',
  author: 'Fresh Bot Team',
  description: 'Owner-only administrative commands for bot management',
  category: COMMAND_CATEGORIES.OWNER,
  commands: [
    {
      name: 'restart',
      description: 'Restart the bot (requires PM2)',
      usage: '.restart',
      ownerOnly: true
    },
    {
      name: 'setbio',
      description: 'Update bot bio/status message',
      usage: '.setbio [text]',
      ownerOnly: true
    },
    {
      name: 'broadcast',
      description: 'Send message to all bot chats',
      usage: '.broadcast [message]',
      ownerOnly: true
    },
    {
      name: 'eval',
      description: 'Evaluate JavaScript code (dangerous)',
      usage: '.eval [code]',
      ownerOnly: true
    },
    {
      name: 'block',
      description: 'Block a user from using the bot',
      usage: '.block [number/@user]',
      ownerOnly: true
    },
    {
      name: 'unblock', 
      description: 'Unblock a previously blocked user',
      usage: '.unblock [number]',
      ownerOnly: true
    },
    {
      name: 'join',
      description: 'Join a group using invite link',
      usage: '.join [invite-link]',
      ownerOnly: true
    },
    {
      name: 'leave',
      description: 'Leave the current group',
      usage: '.leave',
      ownerOnly: true,
      groupOnly: true
    },
    {
      name: 'botstatus',
      description: 'Get detailed bot system status',
      usage: '.botstatus',
      ownerOnly: true
    },
    {
      name: 'setname',
      description: 'Update bot display name',
      usage: '.setname [name]',
      ownerOnly: true
    },
    {
      name: 'blocklist',
      description: 'Show all blocked users',
      usage: '.blocklist',
      ownerOnly: true
    },
    {
      name: 'send',
      description: 'Send message to specific chat',
      usage: '.send [number] [message]',
      ownerOnly: true
    }
  ]
};) {
      await m.reply('❌ Failed to restart: ' + error.message);
    }
  }
  
  // Set bot bio/status
  if (cmd.startsWith(`${prefix}setbio `) || cmd.startsWith(`${prefix}bio `)) {
    const bioText = m.body.slice(cmd.indexOf(' ') + 1);
    
    if (!bioText) {
      return m.reply('📝 Please provide bio text!\n\nExample: .setbio Fresh Bot is online!');
    }
    
    try {
      await sock.updateProfileStatus(bioText);
      await m.reply(`✅ Bio updated successfully!\n\n📝 New bio: "${bioText}"`);
    } catch (error) {
      await m.reply('❌ Failed to update bio: ' + error.message);
    }
  }
  
  // Broadcast message to all chats
  if (cmd.startsWith(`${prefix}broadcast `) || cmd.startsWith(`${prefix}bc `)) {
    const broadcastMsg = m.body.slice(cmd.indexOf(' ') + 1);
    
    if (!broadcastMsg) {
      return m.reply('📢 Please provide broadcast message!\n\nExample: .broadcast Server maintenance in 1 hour');
    }
    
    try {
      await m.reply('📡 Starting broadcast...');
      
      // Get all chats
      const chats = await sock.chats.all();
      let successCount = 0;
      let errorCount = 0;
      
      const finalMessage = `📢 *BROADCAST MESSAGE*\n\n${broadcastMsg}\n\n_Sent by ${config.BOT_NAME}_`;
      
      // Send to all chats with delay to avoid rate limiting
      for (const chat of chats) {
        try {
          await sock.sendMessage(chat.id, { text: finalMessage });
          successCount++;
          
          // Delay to avoid spamming
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          errorCount++;
        }
      }
      
      await m.reply(`📊 *Broadcast Complete*\n\n✅ Sent to: ${successCount} chats\n❌ Failed: ${errorCount} chats\n📝 Message: "${broadcastMsg}"`);
      
    } catch (error) {
      await m.reply('❌ Broadcast failed: ' + error.message);
    }
  }
  
  // Evaluate JavaScript code (dangerous - owner only)
  if (cmd.startsWith(`${prefix}eval `) || cmd.startsWith(`${prefix}> `)) {
    const code = m.body.slice(cmd.indexOf(' ') + 1);
    
    if (!code) {
      return m.reply('💻 Please provide code to evaluate!\n\nExample: .eval console.log("Hello World")');
    }
    
    try {
      await m.react('⚡');
      
      let result = eval(code);
      
      // Handle promises
      if (result instanceof Promise) {
        result = await result;
      }
      
      // Format result
      const output = typeof result === 'object' 
        ? JSON.stringify(result, null, 2) 
        : String(result);
      
      await m.reply(`💻 *Code Evaluation*\n\n📝 *Input:*\n\`\`\`${code}\`\`\`\n\n📤 *Output:*\n\`\`\`${output}\`\`\``);
      
    } catch (error
