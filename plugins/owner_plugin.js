// plugins/owner.js - Complete Owner/Admin Management System
import chalk from 'chalk';
import moment from 'moment-timezone';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// Plugin information
export const info = {
  name: 'Owner Management',
  version: '2.1.0',
  author: 'System',
  description: 'Complete owner and admin control system with persistent MongoDB settings',
  category: 'system',
  commands: [
    { command: 'owner', description: 'Owner contact and info' },
    { command: 'addadmin', description: 'Add bot admin' },
    { command: 'removeadmin', description: 'Remove bot admin' },
    { command: 'listadmins', description: 'List all admins' },
    { command: 'setmode', description: 'Change bot mode (public/private)' },
    { command: 'getmode', description: 'Get current bot mode' },
    { command: 'settings', description: 'View all bot settings' },
    { command: 'setsetting', description: 'Update bot setting' },
    { command: 'restart', description: 'Restart the bot' },
    { command: 'shutdown', description: 'Shutdown the bot' },
    { command: 'botstats', description: 'Detailed bot statistics' },
    { command: 'plugins', description: 'Plugin management' },
    { command: 'broadcast', description: 'Broadcast message to all groups' },
    { command: 'backup', description: 'Create database backup' },
    { command: 'dbhealth', description: 'Database health check' },
    { command: 'eval', description: 'Execute JavaScript code' },
    { command: 'shell', description: 'Execute shell commands' },
    { command: 'logs', description: 'View recent bot logs' },
    { command: 'block', description: 'Block/unblock users' },
    { command: 'ban', description: 'Ban users from using bot' },
    { command: 'maintenance', description: 'Toggle maintenance mode' }
  ]
};

// Initialize database collections and settings
export async function initialize(config) {
  try {
    console.log(chalk.blue('🔧 Initializing Owner plugin...'));
    
    // Initialize bot settings if they don't exist
    const defaultSettings = {
      mode: config.MODE || 'public',
      prefix: config.PREFIX || '.',
      timezone: config.TIMEZONE || 'Africa/Lagos',
      autoRead: config.AUTO_READ || false,
      autoReact: config.AUTO_REACT || false,
      welcome: config.WELCOME || false,
      antilink: config.ANTILINK || false,
      rejectCall: config.REJECT_CALL || false,
      autoBio: config.AUTO_BIO || false,
      autoStatusSeen: config.AUTO_STATUS_SEEN || false,
      maintenanceMode: false,
      maxWarnings: 3,
      rateLimitWindow: 60000,
      rateLimitMax: 10,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Initialize settings
    await initializeBotSettings(defaultSettings);
    
    // Initialize owner as admin if not exists
    if (config.OWNER_NUMBER) {
      await addAdminToDatabase(config.OWNER_NUMBER, config.OWNER_NAME || 'Owner', 'owner');
    }
    
    // Initialize config admins
    if (config.ADMIN_NUMBERS && Array.isArray(config.ADMIN_NUMBERS)) {
      for (const adminNumber of config.ADMIN_NUMBERS) {
        if (adminNumber && adminNumber !== config.OWNER_NUMBER) {
          await addAdminToDatabase(adminNumber, 'Config Admin', 'admin');
        }
      }
    }
    
    console.log(chalk.green('✅ Owner plugin initialized'));
    
  } catch (error) {
    console.error(chalk.red('❌ Owner plugin initialization failed:'), error.message);
  }
}

// Helper functions for database operations
async function initializeBotSettings(defaultSettings) {
  try {
    const collection = PluginHelpers.getCollection('bot_settings');
    
    const existingSettings = await collection.findOne({ type: 'main_settings' });
    if (!existingSettings) {
      await collection.insertOne({
        type: 'main_settings',
        ...defaultSettings
      });
      console.log(chalk.green('✅ Bot settings initialized in database'));
    }
  } catch (error) {
    console.warn(chalk.yellow('⚠️ Settings initialization warning:'), error.message);
  }
}

async function addAdminToDatabase(phone, name, role = 'admin') {
  try {
    const collection = PluginHelpers.getCollection('bot_admins');
    
    // Clean phone number
    const cleanPhone = phone.replace(/[^\d]/g, '');
    
    // Check if already exists
    const existing = await collection.findOne({ phone: cleanPhone });
    if (existing) return existing;
    
    const adminData = {
      phone: cleanPhone,
      name: name,
      role: role,
      addedAt: new Date(),
      addedBy: role === 'owner' ? 'system' : null,
      isActive: true
    };
    
    await collection.insertOne(adminData);
    console.log(chalk.green(`✅ Added ${role}: ${cleanPhone}`));
    return adminData;
    
  } catch (error) {
    console.error(chalk.red('❌ Error adding admin:'), error.message);
    return null;
  }
}

// Helper classes for better organization
class OwnerHelpers {
  static async isOwner(userJid, config) {
    if (!userJid || !config.OWNER_NUMBER) return false;
    const userPhone = userJid.replace('@s.whatsapp.net', '');
    const ownerPhone = config.OWNER_NUMBER.replace(/[^\d]/g, '');
    return userPhone === ownerPhone;
  }
  
  static async isAdmin(userJid) {
    try {
      const collection = PluginHelpers.getCollection('bot_admins');
      const userPhone = userJid.replace('@s.whatsapp.net', '');
      
      const admin = await collection.findOne({ 
        phone: userPhone, 
        isActive: true 
      });
      
      return !!admin;
    } catch (error) {
      console.error(chalk.red('Error checking admin status:'), error.message);
      return false;
    }
  }
  
  static async getAdmins() {
    try {
      const collection = PluginHelpers.getCollection('bot_admins');
      return await collection.find({ isActive: true }).toArray();
    } catch (error) {
      console.error(chalk.red('Error getting admins:'), error.message);
      return [];
    }
  }
  
  static async getBotSettings() {
    try {
      const collection = PluginHelpers.getCollection('bot_settings');
      const settings = await collection.findOne({ type: 'main_settings' });
      return settings || {};
    } catch (error) {
      console.error(chalk.red('Error getting bot settings:'), error.message);
      return {};
    }
  }
  
  static async updateBotSetting(key, value) {
    try {
      const collection = PluginHelpers.getCollection('bot_settings');
      await collection.updateOne(
        { type: 'main_settings' },
        { 
          $set: { 
            [key]: value, 
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );
      return true;
    } catch (error) {
      console.error(chalk.red('Error updating bot setting:'), error.message);
      return false;
    }
  }
  
  static async isBotPublic() {
    try {
      const settings = await this.getBotSettings();
      return settings.mode !== 'private';
    } catch (error) {
      console.error(chalk.red('Error checking bot mode:'), error.message);
      return true; // Default to public if error
    }
  }
}

// Export OwnerHelpers for use in other files
export { OwnerHelpers };

// Statistics and monitoring helpers
class BotStatistics {
  static async getDetailedStats(sock, config) {
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      // Get database stats
      let dbStats = { healthy: false, collections: 0, documents: 0 };
      try {
        const db = PluginHelpers.getDB();
        const dbHealth = await db.admin().serverStatus();
        const collections = await db.listCollections().toArray();
        
        let totalDocs = 0;
        for (const collection of collections) {
          try {
            const count = await db.collection(collection.name).countDocuments();
            totalDocs += count;
          } catch {}
        }
        
        dbStats = {
          healthy: true,
          collections: collections.length,
          documents: totalDocs,
          uptime: Math.round(dbHealth.uptime || 0),
          connections: dbHealth.connections || {}
        };
      } catch (error) {
        console.warn('Database stats unavailable:', error.message);
      }
      
      // Get admin count
      const admins = await OwnerHelpers.getAdmins();
      
      return {
        bot: {
          name: config.BOT_NAME,
          version: '2.0.0',
          uptime: {
            seconds: Math.round(uptime),
            formatted: formatUptime(uptime)
          },
          mode: await OwnerHelpers.isBotPublic() ? 'Public' : 'Private',
          prefix: config.PREFIX
        },
        system: {
          memory: {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            rss: Math.round(memUsage.rss / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024)
          },
          platform: process.platform,
          nodeVersion: process.version,
          pid: process.pid
        },
        database: dbStats,
        admins: {
          total: admins.length,
          owners: admins.filter(a => a.role === 'owner').length,
          admins: admins.filter(a => a.role === 'admin').length
        },
        whatsapp: {
          connected: !!sock?.user?.id,
          user: sock?.user || null
        }
      };
      
    } catch (error) {
      console.error(chalk.red('Error getting bot stats:'), error.message);
      return { error: error.message };
    }
  }
}

// Utility functions
function formatUptime(uptime) {
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function formatFileSize(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Main plugin handler
export default async function OwnerPlugin(m, sock, config, bot) {
  try {
    // Only process text messages with prefix
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    if (!command) return;
    
    // Check if user is owner or admin for protected commands
    const isOwner = await OwnerHelpers.isOwner(m.sender, config);
    const isAdmin = await OwnerHelpers.isAdmin(m.sender);
    
    // Public commands (no auth required)
    if (command === 'owner') {
      const ownerContact = `👑 *Bot Owner Information*

👤 *Name:* ${config.OWNER_NAME || 'Bot Owner'}
📱 *Contact:* wa.me/${config.OWNER_NUMBER}

🤖 *Bot Details:*
• Name: ${config.BOT_NAME}
• Prefix: ${config.PREFIX}
• Mode: ${await OwnerHelpers.isBotPublic() ? '🌍 Public' : '🔒 Private'}

💬 Feel free to contact the owner for support or inquiries!

🔗 *Quick Actions:*
• Report Bug: Send message with details
• Request Feature: Explain what you need
• General Help: Ask any questions

⚡ Powered by Advanced WhatsApp Bot Framework`;
      
      await m.reply(ownerContact);
      return;
    }
    
    // Protected commands - require owner/admin access
    const protectedCommands = [
      'addadmin', 'removeadmin', 'listadmins', 'setmode', 'getmode',
      'settings', 'setsetting', 'restart', 'shutdown', 'botstats',
      'plugins', 'broadcast', 'backup', 'dbhealth', 'eval', 'shell',
      'logs', 'block', 'ban', 'maintenance'
    ];
    
    if (protectedCommands.includes(command)) {
      if (!isOwner && !isAdmin) {
        await m.reply('❌ Access denied. This command requires admin privileges.');
        return;
      }
    }
    
    // Owner-only commands
    const ownerOnlyCommands = ['eval', 'shell', 'shutdown', 'addadmin', 'removeadmin'];
    if (ownerOnlyCommands.includes(command) && !isOwner) {
      await m.reply('❌ Access denied. This command requires owner privileges.');
      return;
    }
    
    // Command handlers
    switch (command) {
      case 'addadmin':
        await handleAddAdmin(m, args, config);
        break;
        
      case 'removeadmin':
        await handleRemoveAdmin(m, args, config);
        break;
        
      case 'listadmins':
        await handleListAdmins(m);
        break;
        
      case 'setmode':
        await handleSetMode(m, args);
        break;
        
      case 'getmode':
        await handleGetMode(m);
        break;
        
      case 'settings':
        await handleGetSettings(m);
        break;
        
      case 'setsetting':
        await handleSetSetting(m, args);
        break;
        
      case 'restart':
        await handleRestart(m, bot);
        break;
        
      case 'shutdown':
        await handleShutdown(m, bot);
        break;
        
      case 'botstats':
        await handleBotStats(m, sock, config);
        break;
        
      case 'plugins':
        await handlePlugins(m, args, bot);
        break;
        
      case 'broadcast':
        await handleBroadcast(m, args, sock);
        break;
        
      case 'backup':
        await handleBackup(m);
        break;
        
      case 'dbhealth':
        await handleDbHealth(m);
        break;
        
      case 'eval':
        await handleEval(m, args, { sock, config, bot });
        break;
        
      case 'shell':
        await handleShell(m, args);
        break;
        
      case 'maintenance':
        await handleMaintenance(m, args);
        break;
    }
    
  } catch (error) {
    console.error(chalk.red('Owner plugin error:'), error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

// Command handlers
async function handleAddAdmin(m, args, config) {
  try {
    if (args.length < 1) {
      await m.reply('❌ Usage: .addadmin @user [name]\nOr: .addadmin 234XXXXXXXXX [name]');
      return;
    }
    
    let targetNumber = args[0];
    let adminName = args.slice(1).join(' ') || 'Admin';
    
    // Handle @mention
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      targetNumber = m.message.extendedTextMessage.contextInfo.mentionedJid[0].replace('@s.whatsapp.net', '');
    } else {
      targetNumber = targetNumber.replace(/[^\d]/g, '');
    }
    
    if (!targetNumber) {
      await m.reply('❌ Invalid phone number format.');
      return;
    }
    
    // Check if already admin
    const isAlreadyAdmin = await OwnerHelpers.isAdmin(targetNumber + '@s.whatsapp.net');
    if (isAlreadyAdmin) {
      await m.reply('⚠️ User is already an admin.');
      return;
    }
    
    const result = await addAdminToDatabase(targetNumber, adminName, 'admin');
    if (result) {
      await m.reply(`✅ Successfully added admin:\n\n👤 Name: ${adminName}\n📱 Phone: ${targetNumber}\n⏰ Added: ${moment().format('DD/MM/YYYY HH:mm:ss')}`);
      
      // Notify the new admin
      try {
        await sock.sendMessage(targetNumber + '@s.whatsapp.net', {
          text: `🎉 Congratulations! You've been added as a bot admin.\n\n👑 You now have access to administrative commands.\n🔑 Use ${config.PREFIX}settings to see available options.`
        });
      } catch (error) {
        console.warn('Could not notify new admin:', error.message);
      }
    } else {
      await m.reply('❌ Failed to add admin. Please try again.');
    }
    
  } catch (error) {
    console.error('Add admin error:', error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

async function handleRemoveAdmin(m, args, config) {
  try {
    if (args.length < 1) {
      await m.reply('❌ Usage: .removeadmin @user\nOr: .removeadmin 234XXXXXXXXX');
      return;
    }
    
    let targetNumber = args[0];
    
    // Handle @mention
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      targetNumber = m.message.extendedTextMessage.contextInfo.mentionedJid[0].replace('@s.whatsapp.net', '');
    } else {
      targetNumber = targetNumber.replace(/[^\d]/g, '');
    }
    
    if (!targetNumber) {
      await m.reply('❌ Invalid phone number format.');
      return;
    }
    
    // Prevent removing owner
    if (targetNumber === config.OWNER_NUMBER.replace(/[^\d]/g, '')) {
      await m.reply('❌ Cannot remove the bot owner.');
      return;
    }
    
    const collection = PluginHelpers.getCollection('bot_admins');
    const result = await collection.updateOne(
      { phone: targetNumber },
      { 
        $set: { 
          isActive: false, 
          removedAt: new Date(),
          removedBy: m.sender 
        } 
      }
    );
    
    if (result.modifiedCount > 0) {
      await m.reply(`✅ Successfully removed admin: ${targetNumber}`);
      
      // Notify removed admin
      try {
        await sock.sendMessage(targetNumber + '@s.whatsapp.net', {
          text: `📢 You have been removed from bot admin privileges.\n\n⚠️ You no longer have access to administrative commands.`
        });
      } catch (error) {
        console.warn('Could not notify removed admin:', error.message);
      }
    } else {
      await m.reply('❌ Admin not found or already inactive.');
    }
    
  } catch (error) {
    console.error('Remove admin error:', error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

async function handleListAdmins(m) {
  try {
    const admins = await OwnerHelpers.getAdmins();
    
    if (admins.length === 0) {
      await m.reply('📋 No active admins found.');
      return;
    }
    
    let adminList = '👑 *Bot Administrators*\n\n';
    
    admins.forEach((admin, index) => {
      const roleEmoji = admin.role === 'owner' ? '👑' : '⭐';
      const addedDate = moment(admin.addedAt).format('DD/MM/YYYY');
      
      adminList += `${roleEmoji} *${admin.name}*\n`;
      adminList += `📱 ${admin.phone}\n`;
      adminList += `🎭 ${admin.role.toUpperCase()}\n`;
      adminList += `📅 Added: ${addedDate}\n`;
      if (index < admins.length - 1) adminList += '\n';
    });
    
    adminList += `\n📊 Total: ${admins.length} admin${admins.length > 1 ? 's' : ''}`;
    
    await m.reply(adminList);
    
  } catch (error) {
    console.error('List admins error:', error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

async function handleSetMode(m, args) {
  try {
    if (args.length < 1) {
      await m.reply('❌ Usage: .setmode <public|private>');
      return;
    }
    
    const mode = args[0].toLowerCase();
    if (!['public', 'private'].includes(mode)) {
      await m.reply('❌ Mode must be either "public" or "private"');
      return;
    }
    
    const success = await OwnerHelpers.updateBotSetting('mode', mode);
    if (success) {
      await m.reply(`✅ Bot mode changed to: *${mode.toUpperCase()}*\n\n${mode === 'private' ? '🔒 Only admins can use the bot' : '🌍 Everyone can use the bot'}`);
    } else {
      await m.reply('❌ Failed to update bot mode.');
    }
    
  } catch (error) {
    console.error('Set mode error:', error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

async function handleGetMode(m) {
  try {
    const isPublic = await OwnerHelpers.isBotPublic();
    const mode = isPublic ? 'Public' : 'Private';
    const emoji = isPublic ? '🌍' : '🔒';
    
    await m.reply(`${emoji} *Current Bot Mode: ${mode}*\n\n${isPublic ? '👥 Everyone can use the bot' : '🔐 Only admins can use the bot'}`);
    
  } catch (error) {
    console.error('Get mode error:', error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

async function handleGetSettings(m) {
  try {
    const settings = await OwnerHelpers.getBotSettings();
    
    const settingsText = `⚙️ *Bot Settings*

🤖 **General:**
• Mode: ${settings.mode === 'private' ? '🔒 Private' : '🌍 Public'}
• Prefix: ${settings.prefix}
• Timezone: ${settings.timezone}

📱 **Features:**
• Auto Read: ${settings.autoRead ? '✅' : '❌'}
• Auto React: ${settings.autoReact ? '✅' : '❌'}
• Welcome Messages: ${settings.welcome ? '✅' : '❌'}
• Anti-Link: ${settings.antilink ? '✅' : '❌'}
• Reject Calls: ${settings.rejectCall ? '✅' : '❌'}
• Auto Bio: ${settings.autoBio ? '✅' : '❌'}
• Auto Status Seen: ${settings.autoStatusSeen ? '✅' : '❌'}

🔧 **Advanced:**
• Maintenance Mode: ${settings.maintenanceMode ? '🚧 ON' : '✅ OFF'}
• Max Warnings: ${settings.maxWarnings}
• Rate Limit: ${settings.rateLimitMax}/${Math.round(settings.rateLimitWindow/1000)}s

📅 Last Updated: ${moment(settings.updatedAt).format('DD/MM/YYYY HH:mm:ss')}

💡 Use .setsetting <key> <value> to change settings`;

    await m.reply(settingsText);
    
  } catch (error) {
    console.error('Get settings error:', error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

async function handleSetSetting(m, args) {
  try {
    if (args.length < 2) {
      await m.reply(`❌ Usage: .setsetting <key> <value>

Available keys:
• autoRead (true/false)
• autoReact (true/false)
• welcome (true/false)
• antilink (true/false)
• rejectCall (true/false)
• autoBio (true/false)
• autoStatusSeen (true/false)
• maintenanceMode (true/false)
• maxWarnings (number)
• rateLimitMax (number)`);
      return;
    }
    
    const key = args[0].toLowerCase();
    let value = args[1].toLowerCase();
    
    // Convert string values to appropriate types
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (!isNaN(value)) value = parseInt(value);
    
    const validKeys = [
      'autoread', 'autoreact', 'welcome', 'antilink', 'rejectcall',
      'autobio', 'autostatusseen', 'maintenancemode', 'maxwarnings',
      'ratelimitmax'
    ];
    
    if (!validKeys.includes(key)) {
      await m.reply('❌ Invalid setting key. Use .setsetting to see available keys.');
      return;
    }
    
    const success = await OwnerHelpers.updateBotSetting(key, value);
    if (success) {
      await m.reply(`✅ Setting updated successfully:\n\n🔧 ${key}: ${value}`);
    } else {
      await m.reply('❌ Failed to update setting.');
    }
    
  } catch (error) {
    console.error('Set setting error:', error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

async function handleRestart(m, bot) {
  try {
    await m.reply('🔄 Restarting bot...\nPlease wait a moment.');
    
    setTimeout(() => {
      if (bot && typeof bot.restart === 'function') {
        bot.restart();
      } else {
        process.exit(0); // PM2 will restart
      }
    }, 2000);
    
  } catch (error) {
    console.error('Restart error:', error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

async function handleShutdown(m, bot) {
  try {
    await m.reply('🛑 Shutting down bot...\nGoodbye!');
    
    setTimeout(() => {
      if (bot && typeof bot.stop === 'function') {
        bot.stop().then(() => process.exit(0));
      } else {
        process.exit(0);
      }
    }, 2000);
    
  } catch (error) {
    console.error('Shutdown error:', error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

async function handleBotStats(m, sock, config) {
  try {
    const stats = await BotStatistics.getDetailedStats(sock, config);
    
    const statsText = `📊 *Detailed Bot Statistics*

🤖 **Bot Information:**
• Name: ${stats.bot.name}
• Version: ${stats.bot.version}
• Uptime: ${stats.bot.uptime.formatted}
• Mode: ${stats.bot.mode}
• Prefix: ${stats.bot.prefix}

💻 **System Resources:**
• Memory Used: ${stats.system.memory.heapUsed}MB
• Total Memory: ${stats.system.memory.heapTotal}MB
• RSS Memory: ${stats.system.memory.rss}MB
• Platform: ${stats.system.platform}
• Node.js: ${stats.system.nodeVersion}
• Process ID: ${stats.system.pid}

🗄️ **Database:**
• Status: ${stats.database.healthy ? '✅ Healthy' : '❌ Unhealthy'}
• Collections: ${stats.database.collections}
• Documents: ${stats.database.documents}
• DB Uptime: ${formatUptime(stats.database.uptime)}

👥 **Administration:**
• Total Admins: ${stats.admins.total}
• Owners: ${stats.admins.owners}
• Admins: ${stats.admins.admins}

📱 **WhatsApp:**
• Connection: ${stats.whatsapp.connected ? '✅ Connected' : '❌ Disconnected'}
• User: ${stats.whatsapp.user ? stats.whatsapp.user.name : 'Not connected'}

📅 Generated: ${moment().format('DD/MM/YYYY HH:mm:ss')}`;

    await m.reply(statsText);
    
  } catch (error) {
    console.error('Bot stats error:', error.message);
    await m.reply(`❌ Error: ${error.message}`);
  }
}

async function handlePlugins(m, args, bot) {
  try {
    const pluginManager = bot.getPluginManager();
    if (!pluginManager) {
      await m.reply('❌ Plugin manager not available.');
      return;
    }
    
    const action = args[0]?.
