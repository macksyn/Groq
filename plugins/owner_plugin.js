// plugins/owner_plugin.js - V3 Format
import chalk from 'chalk';
import moment from 'moment-timezone';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// ===== V3 PLUGIN EXPORT =====
export default {
  name: 'owner',
  description: 'Owner and admin management commands',
  category: 'admin',
  version: '3.0.0',
  author: 'Bot Framework',
  
  // Commands this plugin handles
  commands: ['owner', 'admin', 'unadmin', 'admins', 'ping', 'stats'],
  aliases: ['botowner', 'botadmin'],
  
  // Main plugin handler
  async run(context) {
    const { msg: m, args, text, command, sock, config } = context;
    
    // Route to appropriate command handler
    switch (command) {
      case 'owner':
      case 'botowner':
        await handleOwner(m, sock, config);
        break;
        
      case 'admin':
        await handleAddAdmin(m, sock, config, args);
        break;
        
      case 'unadmin':
        await handleRemoveAdmin(m, sock, config, args);
        break;
        
      case 'admins':
        await handleListAdmins(m, sock, config);
        break;
        
      case 'ping':
        await handlePing(m, sock, config);
        break;
        
      case 'stats':
        await handleStats(m, sock, config);
        break;
        
      default:
        // Unknown command
        break;
    }
  }
};

// ===== HELPER FUNCTIONS =====

function isOwner(userId, ownerNumber) {
  const cleanUserId = userId.replace('@s.whatsapp.net', '');
  const cleanOwnerNumber = ownerNumber.replace('@s.whatsapp.net', '');
  return cleanUserId === cleanOwnerNumber;
}

function getEnvAdmins() {
  try {
    const adminNumbers = process.env.ADMIN_NUMBERS || '';
    if (!adminNumbers.trim()) return [];
    
    return adminNumbers
      .split(',')
      .map(n => n.trim())
      .filter(n => n && n.length >= 10)
      .map(n => n.replace(/\D/g, ''))
      .filter(n => n.length >= 10);
  } catch (error) {
    console.error(chalk.red('❌ Error loading ENV admins:'), error.message);
    return [];
  }
}

function isEnvAdmin(userId) {
  try {
    const bareNumber = userId.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const envAdmins = getEnvAdmins();
    return envAdmins.includes(bareNumber);
  } catch (error) {
    return false;
  }
}

async function isAdminOrOwner(userId, config) {
  const ownerNumber = (config.OWNER_NUMBER || '').replace(/\D/g, '');
  const userNumber = userId.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  
  if (userNumber === ownerNumber) return true;
  if (isEnvAdmin(userId)) return true;
  
  // Check database admins
  try {
    const admins = await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.find({ status: 'active' }).toArray();
    }, 'bot_admins');
    
    return admins.some(admin => admin.userId === userId);
  } catch (error) {
    return false;
  }
}

function extractUserFromMessage(m, args) {
  if (m.mentions && m.mentions.length > 0) {
    return m.mentions[0];
  }
  
  if (args[0] && /^\d+$/.test(args[0])) {
    return args[0] + '@s.whatsapp.net';
  }
  
  if (m.quoted && m.quoted.sender) {
    return m.quoted.sender;
  }
  
  return null;
}

// ===== COMMAND HANDLERS =====

async function handleOwner(m, sock, config) {
  const ownerMessage = `╭─────────────────────╮
│      👨‍💻 BOT OWNER      │
╰─────────────────────╯

👤 *Name:* ${config.OWNER_NAME}
📱 *Contact:* +${config.OWNER_NUMBER}
🤖 *Bot:* ${config.BOT_NAME}
⚙️ *Version:* 3.0.0

🌐 *GitHub:* github.com/whatsapp-bot
💬 *Support:* Contact owner for assistance

╭─────────────────────╮
│   Powered by Node.js   │
╰─────────────────────╯`;

  await sock.sendMessage(m.from, {
    text: ownerMessage,
    contextInfo: {
      externalAdReply: {
        title: '👨‍💻 Bot Owner Information',
        body: `${config.BOT_NAME} - Advanced WhatsApp Bot`,
        thumbnailUrl: 'https://i.ibb.co/XYZ123/owner.jpg',
        mediaType: 1,
        renderLargerThumbnail: true,
        sourceUrl: 'https://github.com/whatsapp-bot'
      }
    }
  });
}

async function handleAddAdmin(m, sock, config, args) {
  if (!isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net')) {
    return await sock.sendMessage(m.from, { 
      text: '❌ Only the bot owner can add admins.' 
    });
  }

  const targetUser = extractUserFromMessage(m, args);
  if (!targetUser) {
    return await sock.sendMessage(m.from, { 
      text: '❌ Please mention a user or provide their number.\n\nUsage: `admin @user` or `admin 1234567890`' 
    });
  }

  if (isOwner(targetUser, config.OWNER_NUMBER + '@s.whatsapp.net')) {
    return await sock.sendMessage(m.from, { 
      text: '❌ Owner cannot be added as admin (already has full privileges).' 
    });
  }

  try {
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      const existingAdmin = await collection.findOne({ userId: targetUser });
      if (existingAdmin) {
        throw new Error('User is already an admin');
      }

      await collection.insertOne({
        userId: targetUser,
        phone: targetUser.replace('@s.whatsapp.net', ''),
        addedBy: m.sender,
        addedAt: new Date(),
        status: 'active',
        source: 'database'
      });
    }, 'bot_admins');
    
    await sock.sendMessage(m.from, { 
      text: `✅ Successfully added @${targetUser.split('@')[0]} as admin!`,
      mentions: [targetUser]
    });

    await sock.sendMessage(targetUser, {
      text: `🎉 *Admin Privileges Granted!*

You have been promoted to admin by the bot owner.

🔹 You can now use admin commands
🔹 Type *${config.PREFIX}help admin* for admin commands
🔹 Use your powers responsibly!

Welcome to the admin team! 🚀`
    });

  } catch (error) {
    await sock.sendMessage(m.from, { 
      text: `❌ Failed to add admin: ${error.message}` 
    });
  }
}

async function handleRemoveAdmin(m, sock, config, args) {
  if (!isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net')) {
    return await sock.sendMessage(m.from, { 
      text: '❌ Only the bot owner can remove admins.' 
    });
  }

  const targetUser = extractUserFromMessage(m, args);
  if (!targetUser) {
    return await sock.sendMessage(m.from, { 
      text: '❌ Please mention a user or provide their number.\n\nUsage: `unadmin @user` or `unadmin 1234567890`' 
    });
  }

  try {
    if (isEnvAdmin(targetUser)) {
      return await sock.sendMessage(m.from, {
        text: '❌ Cannot remove ENV admin. Update ADMIN_NUMBERS environment variable instead.'
      });
    }

    const removed = await PluginHelpers.safeDBOperation(async (db, collection) => {
      const result = await collection.deleteOne({ userId: targetUser });
      return result.deletedCount > 0;
    }, 'bot_admins');
    
    if (removed) {
      await sock.sendMessage(m.from, { 
        text: `✅ Successfully removed @${targetUser.split('@')[0]} from admin list!`,
        mentions: [targetUser]
      });

      await sock.sendMessage(targetUser, {
        text: `📢 *Admin Status Removed*

Your admin privileges have been revoked by the bot owner.

You can no longer use admin commands.
Thank you for your service! 🙏`
      });
    } else {
      await sock.sendMessage(m.from, { 
        text: `❌ @${targetUser.split('@')[0]} is not an admin.`,
        mentions: [targetUser]
      });
    }

  } catch (error) {
    await sock.sendMessage(m.from, { 
      text: `❌ Failed to remove admin: ${error.message}` 
    });
  }
}

async function handleListAdmins(m, sock, config) {
  if (!await isAdminOrOwner(m.sender, config)) {
    return await sock.sendMessage(m.from, { 
      text: '❌ Only admins can view the admin list.' 
    });
  }

  try {
    const envAdmins = getEnvAdmins();
    const dbAdmins = await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.find({ status: 'active' }).toArray();
    }, 'bot_admins');
    
    let message = `╭─────────────────────╮
│    👥 ADMIN LIST     │
╰─────────────────────╯

👑 *Owner:* +${config.OWNER_NUMBER}

`;

    if (envAdmins.length === 0 && dbAdmins.length === 0) {
      message += '📝 No admins added yet.';
    } else {
      message += `🛡️ *Admins (${envAdmins.length + dbAdmins.length}):*\n\n`;
      
      if (envAdmins.length > 0) {
        message += `🌍 *From ENV (${envAdmins.length}):*\n`;
        envAdmins.forEach((number, index) => {
          message += `${index + 1}. +${number} 🔐\n`;
        });
        message += '\n';
      }

      if (dbAdmins.length > 0) {
        message += `💾 *From Database (${dbAdmins.length}):*\n`;
        dbAdmins.forEach((admin, index) => {
          const addedDate = moment(admin.addedAt).format('DD/MM/YYYY');
          message += `${index + 1}. +${admin.phone}\n   📅 Added: ${addedDate}\n\n`;
        });
      }
    }

    message += `\n╭─────────────────────╮
│   Total: ${1 + envAdmins.length + dbAdmins.length} (Owner + ${envAdmins.length} ENV + ${dbAdmins.length} DB)   │
╰─────────────────────╯

💡 ENV admins cannot be removed via commands`;

    await sock.sendMessage(m.from, { text: message });

  } catch (error) {
    await sock.sendMessage(m.from, { 
      text: `❌ Failed to get admin list: ${error.message}` 
    });
  }
}

async function handlePing(m, sock, config) {
  const startTime = Date.now();
  
  const pingMsg = await sock.sendMessage(m.from, { text: '🏓 Pinging...' });
  const endTime = Date.now();
  const latency = endTime - startTime;

  const pingResult = `🏓 *Pong!*

📡 *Response Time:* ${latency}ms
🤖 *Bot Status:* Active ✅
⏰ *Server Time:* ${moment().tz(config.TIMEZONE || 'Africa/Lagos').format('HH:mm:ss')}

${latency < 100 ? '🟢 Excellent' : latency < 300 ? '🟡 Good' : '🔴 Poor'} connection quality`;

  await sock.sendMessage(m.from, { 
    text: pingResult,
    edit: pingMsg.key 
  });
}

async function handleStats(m, sock, config) {
  if (!await isAdminOrOwner(m.sender, config)) {
    return await sock.sendMessage(m.from, { 
      text: '❌ Only admins can view bot statistics.' 
    });
  }

  try {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime() * 1000;
    const envAdminCount = getEnvAdmins().length;
    
    let dbAdminCount = 0;
    try {
      const dbAdmins = await PluginHelpers.safeDBOperation(async (db, collection) => {
        return await collection.find({ status: 'active' }).toArray();
      }, 'bot_admins');
      dbAdminCount = dbAdmins.length;
    } catch (error) {
      // DB not available
    }

    const formatUptime = (ms) => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
      if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
      return `${seconds}s`;
    };

    const formatBytes = (bytes) => {
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      if (bytes === 0) return '0 Bytes';
      const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    const statsMessage = `╭─────────────────────╮
│    📊 BOT STATISTICS    │
╰─────────────────────╯

🤖 *Bot Info:*
• Name: ${config.BOT_NAME}
• Version: 3.0.0
• Mode: ${config.MODE?.toUpperCase() || 'PUBLIC'}
• Prefix: ${config.PREFIX}

⚡ *Performance:*
• Uptime: ${formatUptime(uptime)}
• Memory: ${formatBytes(memUsage.heapUsed)} / ${formatBytes(memUsage.heapTotal)}
• RSS: ${formatBytes(memUsage.rss)}

👥 *Users & Access:*
• Owner: 1
• ENV Admins: ${envAdminCount} 🔐
• DB Admins: ${dbAdminCount} 💾
• Total Admins: ${envAdminCount + dbAdminCount}

🔧 *Features:*
• Auto Read: ${config.AUTO_READ ? '✅' : '❌'}
• Auto React: ${config.AUTO_REACT ? '✅' : '❌'}
• Welcome: ${config.WELCOME ? '✅' : '❌'}
• Antilink: ${config.ANTILINK ? '✅' : '❌'}

╭─────────────────────╮
│   System Health: ✅   │
╰─────────────────────╯`;

    await sock.sendMessage(m.from, { text: statsMessage });

  } catch (error) {
    await sock.sendMessage(m.from, { 
      text: `❌ Failed to get statistics: ${error.message}` 
    });
  }
}