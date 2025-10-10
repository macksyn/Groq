// plugins/owner.js - Advanced Owner & Admin Management Plugin
import chalk from 'chalk';
import moment from 'moment-timezone';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// Plugin Information
export const info = {
  name: 'Owner Plugin',
  version: '2.1.0',
  author: 'Bot Framework',
  description: 'Complete owner and admin management system with database persistence and ENV support',
  category: 'admin',
  commands: [
    'owner', 'admin', 'unadmin', 'admins', 'mode', 'settings', 'backup', 'restore',
    'plugins', 'enable', 'disable', 'reload', 'broadcast', 'ban', 'unban',
    'eval', 'exec', 'stats', 'ping', 'restart', 'shutdown', 'gc', 'logs'
  ],
  usage: {
    owner: 'Display owner contact information',
    admin: '<@user|number> - Add user as admin',
    unadmin: '<@user|number> - Remove admin privileges',
    admins: 'List all admins',
    mode: '<public|private> - Change bot mode',
    settings: '[key] [value] - View/change bot settings',
    backup: 'Create database backup',
    restore: '<backup_id> - Restore from backup',
    plugins: 'List all plugins with status',
    enable: '<plugin> - Enable a plugin',
    disable: '<plugin> - Disable a plugin',
    reload: '<plugin|all> - Reload plugin(s)',
    broadcast: '<message> - Send message to all groups',
    ban: '<@user|number> - Ban user from bot',
    unban: '<@user|number> - Remove user ban',
    eval: '<code> - Execute JavaScript code',
    exec: '<command> - Execute shell command',
    stats: 'Show detailed bot statistics',
    ping: 'Check bot response time',
    restart: 'Restart the bot',
    shutdown: 'Shutdown the bot',
    gc: 'Force garbage collection',
    logs: '[lines] - Show recent logs'
  }
};

// MongoDB Collections
const COLLECTIONS = {
  SETTINGS: 'bot_settings',
  ADMINS: 'bot_admins',
  BANNED_USERS: 'banned_users',
  BACKUPS: 'bot_backups',
  LOGS: 'bot_logs'
};

// Simple ENV admin check function (like attendance plugin)
function getEnvAdmins() {
  try {
    const adminNumbers = process.env.ADMIN_NUMBERS || '';
    if (!adminNumbers.trim()) return [];
    
    return adminNumbers
      .split(',')
      .map(n => n.trim())
      .filter(n => n && n.length >= 10)
      .map(n => n.replace(/\D/g, '')) // Remove non-digits
      .filter(n => n.length >= 10);
  } catch (error) {
    console.error(chalk.red('❌ Error loading ENV admins:'), error.message);
    return [];
  }
}

function getEnvAdminCount() {
  return getEnvAdmins().length;
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

// Initialize ENV Admin Manager
// const envAdminManager = new EnvAdminManager();

// Settings Manager Class
class SettingsManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.defaultSettings = {
      botMode: 'public',
      autoRead: true,
      autoReact: true,
      welcome: true,
      antilink: true,
      rejectCall: true,
      autoBio: false,
      timezone: 'Africa/Lagos',
      maxPluginErrors: 15,
      rateLimitWindow: 60000,
      rateLimitMax: 10,
      backupInterval: 24 * 60 * 60 * 1000, // 24 hours
      logRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
      lastBackup: null,
      lastRestart: null
    };
  }

  async getSetting(key) {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    try {
      const result = await PluginHelpers.safeDBOperation(async (db, collection) => {
        const setting = await collection.findOne({ key });
        return setting ? setting.value : this.defaultSettings[key];
      }, COLLECTIONS.SETTINGS);

      // Cache the result
      this.cache.set(key, {
        value: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.error(chalk.red('❌ Error getting setting:'), error.message);
      return this.defaultSettings[key];
    }
  }

  async setSetting(key, value) {
    try {
      await PluginHelpers.safeDBOperation(async (db, collection) => {
        await collection.updateOne(
          { key },
          { 
            $set: { 
              key, 
              value, 
              updatedAt: new Date(),
              updatedBy: 'owner_plugin'
            } 
          },
          { upsert: true }
        );
      }, COLLECTIONS.SETTINGS);

      // Update cache
      this.cache.set(key, {
        value,
        timestamp: Date.now()
      });

      console.log(chalk.green(`✅ Setting updated: ${key} = ${value}`));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Error setting value:'), error.message);
      throw error;
    }
  }

  async getAllSettings() {
    try {
      return await PluginHelpers.safeDBOperation(async (db, collection) => {
        const settings = await collection.find({}).toArray();
        const result = { ...this.defaultSettings };
        
        settings.forEach(setting => {
          result[setting.key] = setting.value;
        });
        
        return result;
      }, COLLECTIONS.SETTINGS);
    } catch (error) {
      console.error(chalk.red('❌ Error getting all settings:'), error.message);
      return this.defaultSettings;
    }
  }

  invalidateCache(key = null) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

// Admin Manager Class (Enhanced with ENV support)
class AdminManager {
  constructor() {
    this.cache = new Set();
    this.lastCacheUpdate = 0;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

   async addAdmin(userId, addedBy) {
    try {
      // Check if it's an ENV admin
      if (isEnvAdmin(userId)) {
        throw new Error('This user is already an admin via ENV configuration');
      }

      await PluginHelpers.safeDBOperation(async (db, collection) => {
        const existingAdmin = await collection.findOne({ userId });
        if (existingAdmin) {
          throw new Error('User is already an admin');
        }

        await collection.insertOne({
          userId,
          phone: userId.replace('@s.whatsapp.net', ''),
          addedBy,
          addedAt: new Date(),
          status: 'active',
          source: 'database',
          permissions: {
            canManagePlugins: true,
            canManageUsers: true,
            canAccessLogs: true,
            canExecuteCode: false,
            canManageSettings: true
          }
        });
      }, COLLECTIONS.ADMINS);

      this.invalidateCache();
      console.log(chalk.green(`✅ Admin added: ${userId.split('@')[0]}`));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Error adding admin:'), error.message);
      throw error;
    }
  }
  
  async removeAdmin(userId) {
    try {
      // Prevent removing ENV admins
      if (isEnvAdmin(userId)) {
        throw new Error('Cannot remove ENV admin. Update ADMIN_NUMBERS environment variable instead.');
      }

      const result = await PluginHelpers.safeDBOperation(async (db, collection) => {
        const deleteResult = await collection.deleteOne({ userId });
        return deleteResult.deletedCount > 0;
      }, COLLECTIONS.ADMINS);

      if (result) {
        this.invalidateCache();
        console.log(chalk.green(`✅ Admin removed: ${userId.split('@')[0]}`));
      }
      
      return result;
    } catch (error) {
      console.error(chalk.red('❌ Error removing admin:'), error.message);
      throw error;
    }
  }

  async getAdmins(includeEnv = true) {
    try {
      const dbAdmins = await PluginHelpers.safeDBOperation(async (db, collection) => {
        return await collection.find({ status: 'active' }).toArray();
      }, COLLECTIONS.ADMINS);

      // Add ENV admins if requested
      if (includeEnv) {
        const envAdminNumbers = getEnvAdmins();
        const envAdmins = envAdminNumbers.map(number => ({
          userId: number + '@s.whatsapp.net',
          phone: number,
          addedBy: 'ENV',
          addedAt: new Date(0),
          status: 'active',
          source: 'env',
          permissions: {
            canManagePlugins: true,
            canManageUsers: true,
            canAccessLogs: true,
            canExecuteCode: false,
            canManageSettings: true
          }
        }));

        return [...envAdmins, ...dbAdmins];
      }

      return dbAdmins;
    } catch (error) {
      console.error(chalk.red('❌ Error getting admins:'), error.message);
      return [];
    }
  }

  async isAdmin(userId) {
    // Check ENV admins first (simpler approach)
    if (isEnvAdmin(userId)) {
      console.log(chalk.green(`✅ ENV Admin recognized: ${userId.split('@')[0]}`));
      return true;
    }

    // Check cache for database admins
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.cacheTimeout) {
      return this.cache.has(userId);
    }

    // Refresh cache
    await this.refreshCache();
    return this.cache.has(userId);
  }

  async refreshCache() {
    try {
      const admins = await this.getAdmins(true); // Include ENV admins
      this.cache.clear();
      
      admins.forEach(admin => {
        this.cache.add(admin.userId);
      });
      
      this.lastCacheUpdate = Date.now();
    } catch (error) {
      console.error(chalk.red('❌ Error refreshing admin cache:'), error.message);
    }
  }

  invalidateCache() {
    this.cache.clear();
    this.lastCacheUpdate = 0;
  }

  // Sync ENV admins to database (optional, for persistence)
  async syncEnvAdminsToDatabase() {
    try {
      const envAdmins = getEnvAdmins().map(num => num + '@s.whatsapp.net')
      let synced = 0;

      for (const userId of envAdmins) {
        try {
          const exists = await PluginHelpers.safeDBOperation(async (db, collection) => {
            return await collection.findOne({ userId });
          }, COLLECTIONS.ADMINS);

          if (!exists) {
            await PluginHelpers.safeDBOperation(async (db, collection) => {
              await collection.insertOne({
                userId,
                phone: userId.replace('@s.whatsapp.net', ''),
                addedBy: 'ENV_AUTO_SYNC',
                addedAt: new Date(),
                status: 'active',
                source: 'env_synced',
                permissions: {
                  canManagePlugins: true,
                  canManageUsers: true,
                  canAccessLogs: true,
                  canExecuteCode: false,
                  canManageSettings: true
                }
              });
            }, COLLECTIONS.ADMINS);
            synced++;
          }
        } catch (error) {
          console.warn(chalk.yellow(`⚠️ Failed to sync ENV admin ${userId.split('@')[0]}:`, error.message));
        }
      }

      if (synced > 0) {
        console.log(chalk.green(`✅ Synced ${synced} ENV admin(s) to database`));
        this.invalidateCache();
      }

      return synced;
    } catch (error) {
      console.error(chalk.red('❌ Error syncing ENV admins:'), error.message);
      return 0;
    }
  }
}

// Ban Manager Class
class BanManager {
  async banUser(userId, reason, bannedBy) {
    try {
      await PluginHelpers.safeDBOperation(async (db, collection) => {
        await collection.updateOne(
          { userId },
          {
            $set: {
              userId,
              phone: userId.replace('@s.whatsapp.net', ''),
              reason: reason || 'No reason provided',
              bannedBy,
              bannedAt: new Date(),
              status: 'banned'
            }
          },
          { upsert: true }
        );
      }, COLLECTIONS.BANNED_USERS);

      console.log(chalk.green(`✅ User banned: ${userId.split('@')[0]}`));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Error banning user:'), error.message);
      throw error;
    }
  }

  async unbanUser(userId) {
    try {
      const result = await PluginHelpers.safeDBOperation(async (db, collection) => {
        const deleteResult = await collection.deleteOne({ userId });
        return deleteResult.deletedCount > 0;
      }, COLLECTIONS.BANNED_USERS);

      if (result) {
        console.log(chalk.green(`✅ User unbanned: ${userId.split('@')[0]}`));
      }
      
      return result;
    } catch (error) {
      console.error(chalk.red('❌ Error unbanning user:'), error.message);
      throw error;
    }
  }

  async isBanned(userId) {
    try {
      return await PluginHelpers.safeDBOperation(async (db, collection) => {
        const banned = await collection.findOne({ userId, status: 'banned' });
        return !!banned;
      }, COLLECTIONS.BANNED_USERS);
    } catch (error) {
      console.error(chalk.red('❌ Error checking ban status:'), error.message);
      return false;
    }
  }

  async getBannedUsers() {
    try {
      return await PluginHelpers.safeDBOperation(async (db, collection) => {
        return await collection.find({ status: 'banned' }).toArray();
      }, COLLECTIONS.BANNED_USERS);
    } catch (error) {
      console.error(chalk.red('❌ Error getting banned users:'), error.message);
      return [];
    }
  }
}

// Backup Manager Class
class BackupManager {
  async createBackup(createdBy) {
    try {
      console.log(chalk.blue('📦 Creating database backup...'));
      
      const backupId = `backup_${Date.now()}`;
      const db = await PluginHelpers.getDB();
      
      // Get all collections
      const collections = await db.listCollections().toArray();
      const backupData = {
        id: backupId,
        createdBy,
        createdAt: new Date(),
        collections: {},
        metadata: {
          version: '2.1.0',
          totalCollections: collections.length,
          botName: process.env.BOT_NAME || 'WhatsApp Bot',
          envAdminCount: getEnvAdminCount()
        }
      };

      // Backup each collection
      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        console.log(chalk.cyan(`📄 Backing up: ${collectionName}`));
        
        const data = await db.collection(collectionName).find({}).toArray();
        backupData.collections[collectionName] = data;
        
        console.log(chalk.green(`✅ ${collectionName}: ${data.length} documents`));
      }

      // Save backup metadata
      await PluginHelpers.safeDBOperation(async (db, collection) => {
        await collection.insertOne({
          id: backupId,
          createdBy,
          createdAt: new Date(),
          size: JSON.stringify(backupData).length,
          collections: Object.keys(backupData.collections),
          status: 'completed'
        });
      }, COLLECTIONS.BACKUPS);

      // Update last backup setting
      const settingsManager = new SettingsManager();
      await settingsManager.setSetting('lastBackup', new Date());

      console.log(chalk.green(`✅ Backup created: ${backupId}`));
      return { backupId, data: backupData };

    } catch (error) {
      console.error(chalk.red('❌ Backup creation failed:'), error.message);
      throw error;
    }
  }

  async listBackups() {
    try {
      return await PluginHelpers.safeDBOperation(async (db, collection) => {
        return await collection.find({}).sort({ createdAt: -1 }).limit(10).toArray();
      }, COLLECTIONS.BACKUPS);
    } catch (error) {
      console.error(chalk.red('❌ Error listing backups:'), error.message);
      return [];
    }
  }
}

// Log Manager Class
class LogManager {
  async log(level, message, source = 'owner_plugin', metadata = {}) {
    try {
      await PluginHelpers.safeDBOperation(async (db, collection) => {
        await collection.insertOne({
          level: level.toUpperCase(),
          message,
          source,
          metadata,
          timestamp: new Date(),
          userId: metadata.userId || null,
          command: metadata.command || null
        });
      }, COLLECTIONS.LOGS);

      // Also log to console
      const colorMap = {
        INFO: chalk.blue,
        WARN: chalk.yellow,
        ERROR: chalk.red,
        SUCCESS: chalk.green
      };
      
      const colorFn = colorMap[level.toUpperCase()] || chalk.white;
      console.log(colorFn(`[${level.toUpperCase()}] ${source}: ${message}`));

    } catch (error) {
      console.error(chalk.red('❌ Error logging to database:'), error.message);
    }
  }

  async getLogs(limit = 50, level = null) {
    try {
      return await PluginHelpers.safeDBOperation(async (db, collection) => {
        const query = level ? { level: level.toUpperCase() } : {};
        return await collection.find(query)
          .sort({ timestamp: -1 })
          .limit(limit)
          .toArray();
      }, COLLECTIONS.LOGS);
    } catch (error) {
      console.error(chalk.red('❌ Error getting logs:'), error.message);
      return [];
    }
  }

  async cleanupOldLogs() {
    try {
      const settingsManager = new SettingsManager();
      const retention = await settingsManager.getSetting('logRetention');
      const cutoffDate = new Date(Date.now() - retention);

      const result = await PluginHelpers.safeDBOperation(async (db, collection) => {
        return await collection.deleteMany({ timestamp: { $lt: cutoffDate } });
      }, COLLECTIONS.LOGS);

      if (result.deletedCount > 0) {
        console.log(chalk.green(`🗑️ Cleaned up ${result.deletedCount} old log entries`));
      }

      return result.deletedCount;
    } catch (error) {
      console.error(chalk.red('❌ Error cleaning up logs:'), error.message);
      return 0;
    }
  }
}

// Initialize managers
const settingsManager = new SettingsManager();
const adminManager = new AdminManager();
const banManager = new BanManager();
const backupManager = new BackupManager();
const logManager = new LogManager();

// Helper Functions
function isOwner(userId, ownerNumber) {
  const cleanUserId = userId.replace('@s.whatsapp.net', '');
  const cleanOwnerNumber = ownerNumber.replace('@s.whatsapp.net', '');
  return cleanUserId === cleanOwnerNumber;
}

async function isAdminOrOwner(userId, config) {
  // Check owner first
  const ownerNumber = (config.OWNER_NUMBER || '').replace(/\D/g, '');
  const userNumber = userId.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  
  if (userNumber === ownerNumber) {
    return true;
  }
  
  // Check ENV admin
  if (isEnvAdmin(userId)) {
    return true;
  }
  
  // Check database admin
  return await adminManager.isAdmin(userId);
}

function extractUserFromMessage(m, args) {
  // From mention
  if (m.mentionedJid && m.mentionedJid.length > 0) {
    return m.mentionedJid[0];
  }
  
  // From argument (phone number)
  if (args[0] && /^\d+$/.test(args[0])) {
    return args[0] + '@s.whatsapp.net';
  }
  
  // From quoted message
  if (m.quoted && m.quoted.sender) {
    return m.quoted.sender;
  }
  
  return null;
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Command Handlers
const commands = {
  // Owner contact information
  owner: async (m, sock, config) => {
    const ownerMessage = `╭─────────────────────╮
│      👨‍💻 BOT OWNER      │
╰─────────────────────╯

👤 *Name:* ${config.OWNER_NAME}
📱 *Contact:* +${config.OWNER_NUMBER}
🤖 *Bot:* ${config.BOT_NAME}
⚙️ *Version:* 2.1.0

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

    await logManager.log('info', 'Owner contact info requested', 'owner_plugin', {
      userId: m.sender,
      command: 'owner'
    });
  },

  // Add admin
  admin: async (m, sock, config, args) => {
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
      await adminManager.addAdmin(targetUser, m.sender);
      
      await sock.sendMessage(m.from, { 
        text: `✅ Successfully added @${targetUser.split('@')[0]} as admin!`,
        mentions: [targetUser]
      });

      // Notify the new admin
      await sock.sendMessage(targetUser, {
        text: `🎉 *Admin Privileges Granted!*

You have been promoted to admin by the bot owner.

🔹 You can now use admin commands
🔹 Type *${config.PREFIX}help admin* for admin commands
🔹 Use your powers responsibly!

Welcome to the admin team! 🚀`
      });

      await logManager.log('success', `Admin added: ${targetUser.split('@')[0]}`, 'owner_plugin', {
        userId: m.sender,
        command: 'admin',
        targetUser
      });

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Failed to add admin: ${error.message}` 
      });
    }
  },

  // Remove admin
  unadmin: async (m, sock, config, args) => {
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
      const removed = await adminManager.removeAdmin(targetUser);
      
      if (removed) {
        await sock.sendMessage(m.from, { 
          text: `✅ Successfully removed @${targetUser.split('@')[0]} from admin list!`,
          mentions: [targetUser]
        });

        // Notify the removed admin
        await sock.sendMessage(targetUser, {
          text: `📢 *Admin Status Removed*

Your admin privileges have been revoked by the bot owner.

You can no longer use admin commands.
Thank you for your service! 🙏`
        });

        await logManager.log('success', `Admin removed: ${targetUser.split('@')[0]}`, 'owner_plugin', {
          userId: m.sender,
          command: 'unadmin',
          targetUser
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
  },

  // List admins
  admins: async (m, sock, config) => {
  if (!await isAdminOrOwner(m.sender, config)) {
    return await sock.sendMessage(m.from, { 
      text: '❌ Only admins can view the admin list.' 
    });
  }

  try {
    const adminList = await adminManager.getAdmins(true);
    const envAdmins = getEnvAdmins();
    const dbAdmins = adminList.filter(a => a.source !== 'env');
    
    let message = `╭─────────────────────╮
│    👥 ADMIN LIST     │
╰─────────────────────╯

👑 *Owner:* +${config.OWNER_NUMBER}

`;

    if (adminList.length === 0) {
      message += '📝 No admins added yet.';
    } else {
      message += `🛡️ *Admins (${adminList.length}):*\n\n`;
      
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
│   Total: ${adminList.length + 1} (Owner + ${envAdmins.length} ENV + ${dbAdmins.length} DB)   │
╰─────────────────────╯

💡 ENV admins cannot be removed via commands`;

    await sock.sendMessage(m.from, { text: message });

  } catch (error) {
    await sock.sendMessage(m.from, { 
      text: `❌ Failed to get admin list: ${error.message}` 
    });
  }
},

  // Change bot mode
  mode: async (m, sock, config, args) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can change bot mode.' 
      });
    }

    if (!args[0]) {
      const currentMode = await settingsManager.getSetting('botMode');
      return await sock.sendMessage(m.from, { 
        text: `📊 Current bot mode: *${currentMode.toUpperCase()}*\n\nUsage: \`mode public\` or \`mode private\`` 
      });
    }

    const newMode = args[0].toLowerCase();
    if (!['public', 'private'].includes(newMode)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Invalid mode. Use `public` or `private`.' 
      });
    }

    try {
      await settingsManager.setSetting('botMode', newMode);
      
      const modeEmoji = newMode === 'public' ? '🌐' : '🔒';
      const modeDesc = newMode === 'public' 
        ? 'Anyone can use the bot' 
        : 'Only admins and owner can use the bot';

      await sock.sendMessage(m.from, { 
        text: `✅ Bot mode changed to *${newMode.toUpperCase()}* ${modeEmoji}\n\n📝 ${modeDesc}` 
      });

      await logManager.log('success', `Bot mode changed to: ${newMode}`, 'owner_plugin', {
        userId: m.sender,
        command: 'mode',
        newMode
      });

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Failed to change mode: ${error.message}` 
      });
    }
  },

  // Bot statistics
  stats: async (m, sock, config) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can view bot statistics.' 
      });
    }

    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime() * 1000;
      const adminList = await adminManager.getAdmins(true);
      const envAdminCount = getEnvAdminCount();
      const dbAdminCount = adminList.filter(a => a.source !== 'env').length;
      const bannedUsers = await banManager.getBannedUsers();
      const settings = await settingsManager.getAllSettings();

      // Get database stats if available
      let dbStats = 'Not available';
      try {
        const mongoManager = PluginHelpers.getDB();
        if (mongoManager && mongoManager.stats) {
          const stats = await mongoManager.stats();
          dbStats = `${stats.collections || 0} collections, ${formatBytes(stats.dataSize || 0)}`;
        }
      } catch (error) {
        dbStats = 'Error retrieving stats';
      }

      const statsMessage = `╭─────────────────────╮
│    📊 BOT STATISTICS    │
╰─────────────────────╯

🤖 *Bot Info:*
• Name: ${config.BOT_NAME}
• Version: 2.1.0
• Mode: ${settings.botMode?.toUpperCase() || 'PUBLIC'} ${settings.botMode === 'private' ? '🔒' : '🌐'}
• Prefix: ${config.PREFIX}
• Timezone: ${settings.timezone || 'Africa/Lagos'}

⚡ *Performance:*
• Uptime: ${formatUptime(uptime)}
• Memory: ${formatBytes(memUsage.heapUsed)} / ${formatBytes(memUsage.heapTotal)}
• RSS: ${formatBytes(memUsage.rss)}
• CPU Usage: ${process.cpuUsage().user / 1000}ms

👥 *Users & Access:*
• Owner: 1
• ENV Admins: ${envAdminCount} 🔐
• DB Admins: ${dbAdminCount} 💾
• Total Admins: ${adminList.length}
• Banned Users: ${bannedUsers.length}

🗄️ *Database:*
• Status: ${dbStats}
• Last Backup: ${settings.lastBackup ? moment(settings.lastBackup).fromNow() : 'Never'}

🔧 *Features:*
• Auto Read: ${settings.autoRead ? '✅' : '❌'}
• Auto React: ${settings.autoReact ? '✅' : '❌'}
• Welcome: ${settings.welcome ? '✅' : '❌'}
• Antilink: ${settings.antilink ? '✅' : '❌'}
• Reject Calls: ${settings.rejectCall ? '✅' : '❌'}
• Auto Bio: ${settings.autoBio ? '✅' : '❌'}

📅 *Timestamps:*
• Started: ${moment().subtract(uptime, 'milliseconds').format('DD/MM/YYYY HH:mm:ss')}
• Last Restart: ${settings.lastRestart ? moment(settings.lastRestart).fromNow() : 'Unknown'}

╭─────────────────────╮
│   System Health: ✅   │
╰─────────────────────╯`;

      await sock.sendMessage(m.from, { text: statsMessage });

      await logManager.log('info', 'Bot statistics requested', 'owner_plugin', {
        userId: m.sender,
        command: 'stats'
      });

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Failed to get statistics: ${error.message}` 
      });
    }
  },

  // Ping command
  ping: async (m, sock, config) => {
    const startTime = Date.now();
    
    const pingMsg = await sock.sendMessage(m.from, { text: '🏓 Pinging...' });
    const endTime = Date.now();
    const latency = endTime - startTime;

    // Get database ping if available
    let dbPing = 'N/A';
    try {
      const dbStartTime = Date.now();
      await PluginHelpers.safeDBOperation(async (db) => {
        await db.admin().ping();
      });
      dbPing = `${Date.now() - dbStartTime}ms`;
    } catch (error) {
      dbPing = 'Error';
    }

    const pingResult = `🏓 *Pong!*

📡 *Response Time:* ${latency}ms
🗄️ *Database Ping:* ${dbPing}
🤖 *Bot Status:* Active ✅
⏰ *Server Time:* ${moment().tz(config.TIMEZONE || 'Africa/Lagos').format('HH:mm:ss')}

${latency < 100 ? '🟢 Excellent' : latency < 300 ? '🟡 Good' : '🔴 Poor'} connection quality`;

    await sock.sendMessage(m.from, { 
      text: pingResult,
      edit: pingMsg.key 
    });
  },

  // Settings management
  settings: async (m, sock, config, args) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can manage settings.' 
      });
    }

    if (!args[0]) {
      // Show all settings
      try {
        const settings = await settingsManager.getAllSettings();
        
        let message = `╭─────────────────────╮
│    ⚙️ BOT SETTINGS    │
╰─────────────────────╯

🔧 *Core Settings:*
• botMode: ${settings.botMode || 'public'}
• timezone: ${settings.timezone || 'Africa/Lagos'}
• maxPluginErrors: ${settings.maxPluginErrors || 15}

🎯 *Features:*
• autoRead: ${settings.autoRead}
• autoReact: ${settings.autoReact}
• welcome: ${settings.welcome}
• antilink: ${settings.antilink}
• rejectCall: ${settings.rejectCall}
• autoBio: ${settings.autoBio}

📊 *System:*
• rateLimitWindow: ${settings.rateLimitWindow || 60000}ms
• rateLimitMax: ${settings.rateLimitMax || 10}
• backupInterval: ${Math.round((settings.backupInterval || 86400000) / 1000 / 60 / 60)}h
• logRetention: ${Math.round((settings.logRetention || 604800000) / 1000 / 60 / 60 / 24)}d

Usage: \`${config.PREFIX}settings <key> <value>\``;

        await sock.sendMessage(m.from, { text: message });
      } catch (error) {
        await sock.sendMessage(m.from, { 
          text: `❌ Failed to get settings: ${error.message}` 
        });
      }
      return;
    }

    if (!args[1]) {
      // Get specific setting
      try {
        const value = await settingsManager.getSetting(args[0]);
        await sock.sendMessage(m.from, { 
          text: `⚙️ Setting: \`${args[0]}\`\nValue: \`${value}\`` 
        });
      } catch (error) {
        await sock.sendMessage(m.from, { 
          text: `❌ Failed to get setting: ${error.message}` 
        });
      }
      return;
    }

    // Set setting value
    const key = args[0];
    let value = args.slice(1).join(' ');

    // Parse boolean values
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (!isNaN(value)) value = Number(value);

    try {
      await settingsManager.setSetting(key, value);
      await sock.sendMessage(m.from, { 
        text: `✅ Setting updated:\n\`${key}\` = \`${value}\`` 
      });

      await logManager.log('success', `Setting updated: ${key} = ${value}`, 'owner_plugin', {
        userId: m.sender,
        command: 'settings',
        key,
        value
      });

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Failed to update setting: ${error.message}` 
      });
    }
  },

  // Plugin management
  plugins: async (m, sock, config) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can view plugin information.' 
      });
    }

    try {
      // Get plugin manager from bot instance
      const pluginManager = global.bot?.getPluginManager();
      if (!pluginManager) {
        return await sock.sendMessage(m.from, { 
          text: '❌ Plugin manager not available.' 
        });
      }

      const plugins = await pluginManager.getAllPlugins();
      const stats = pluginManager.getPluginStats();

      let message = `╭─────────────────────╮
│   🔌 PLUGIN STATUS   │
╰─────────────────────╯

📊 *Summary:*
• Total: ${stats.total}
• Enabled: ${stats.enabled} ✅
• Disabled: ${stats.disabled} ❌
• With Scheduled Tasks: ${stats.withScheduledTasks} ⏰

🔌 *Plugin List:*

`;

      plugins.forEach((plugin, index) => {
        const status = plugin.enabled ? '✅' : '❌';
        const scheduled = plugin.hasScheduledTasks ? '⏰' : '';
        const errors = plugin.stats ? ` (${plugin.stats.errors} errors)` : '';
        
        message += `${index + 1}. ${status} \`${plugin.filename}\` ${scheduled}${errors}\n`;
      });

      message += `\n💡 Use \`${config.PREFIX}enable <plugin>\` or \`${config.PREFIX}disable <plugin>\``;

      await sock.sendMessage(m.from, { text: message });

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Failed to get plugin info: ${error.message}` 
      });
    }
  },

  // Enable plugin
  enable: async (m, sock, config, args) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can manage plugins.' 
      });
    }

    if (!args[0]) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Please specify a plugin name.\n\nUsage: `enable <plugin_name>`' 
      });
    }

    try {
      const pluginManager = global.bot?.getPluginManager();
      if (!pluginManager) {
        return await sock.sendMessage(m.from, { 
          text: '❌ Plugin manager not available.' 
        });
      }

      const pluginName = args[0];
      const success = await pluginManager.enablePlugin(pluginName);

      if (success) {
        await sock.sendMessage(m.from, { 
          text: `✅ Plugin \`${pluginName}\` has been enabled!` 
        });

        await logManager.log('success', `Plugin enabled: ${pluginName}`, 'owner_plugin', {
          userId: m.sender,
          command: 'enable',
          pluginName
        });
      } else {
        await sock.sendMessage(m.from, { 
          text: `❌ Failed to enable plugin \`${pluginName}\`. Check if it exists.` 
        });
      }

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Error enabling plugin: ${error.message}` 
      });
    }
  },

  // Disable plugin
  disable: async (m, sock, config, args) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can manage plugins.' 
      });
    }

    if (!args[0]) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Please specify a plugin name.\n\nUsage: `disable <plugin_name>`' 
      });
    }

    const pluginName = args[0];
    
    // Prevent disabling owner plugin
    if (pluginName === 'owner.js' || pluginName === 'owner') {
      return await sock.sendMessage(m.from, { 
        text: '❌ Cannot disable the owner plugin for security reasons.' 
      });
    }

    try {
      const pluginManager = global.bot?.getPluginManager();
      if (!pluginManager) {
        return await sock.sendMessage(m.from, { 
          text: '❌ Plugin manager not available.' 
        });
      }

      const success = await pluginManager.disablePlugin(pluginName);

      if (success) {
        await sock.sendMessage(m.from, { 
          text: `❌ Plugin \`${pluginName}\` has been disabled!` 
        });

        await logManager.log('success', `Plugin disabled: ${pluginName}`, 'owner_plugin', {
          userId: m.sender,
          command: 'disable',
          pluginName
        });
      } else {
        await sock.sendMessage(m.from, { 
          text: `❌ Failed to disable plugin \`${pluginName}\`. Check if it exists.` 
        });
      }

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Error disabling plugin: ${error.message}` 
      });
    }
  },

  // Reload plugin
  reload: async (m, sock, config, args) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can reload plugins.' 
      });
    }

    if (!args[0]) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Please specify a plugin name or "all".\n\nUsage: `reload <plugin_name>` or `reload all`' 
      });
    }

    try {
      const pluginManager = global.bot?.getPluginManager();
      if (!pluginManager) {
        return await sock.sendMessage(m.from, { 
          text: '❌ Plugin manager not available.' 
        });
      }

      const target = args[0];

      if (target === 'all') {
        await sock.sendMessage(m.from, { 
          text: '🔄 Reloading all plugins...' 
        });

        await pluginManager.reloadAllPlugins();

        await sock.sendMessage(m.from, { 
          text: '✅ All plugins have been reloaded!' 
        });

        await logManager.log('success', 'All plugins reloaded', 'owner_plugin', {
          userId: m.sender,
          command: 'reload'
        });
      } else {
        await sock.sendMessage(m.from, { 
          text: `🔄 Reloading plugin \`${target}\`...` 
        });

        const success = await pluginManager.reloadPlugin(target);

        if (success) {
          await sock.sendMessage(m.from, { 
            text: `✅ Plugin \`${target}\` has been reloaded!` 
          });

          await logManager.log('success', `Plugin reloaded: ${target}`, 'owner_plugin', {
            userId: m.sender,
            command: 'reload',
            pluginName: target
          });
        } else {
          await sock.sendMessage(m.from, { 
            text: `❌ Failed to reload plugin \`${target}\`. Check if it exists.` 
          });
        }
      }

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Error reloading plugin(s): ${error.message}` 
      });
    }
  },

  // Database backup
  backup: async (m, sock, config) => {
    if (!isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net')) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only the bot owner can create backups.' 
      });
    }

    try {
      await sock.sendMessage(m.from, { 
        text: '📦 Creating database backup... This may take a moment.' 
      });

      const result = await backupManager.createBackup(m.sender);

      const backupInfo = `✅ *Backup Created Successfully!*

🆔 *Backup ID:* \`${result.backupId}\`
📅 *Created:* ${moment().format('DD/MM/YYYY HH:mm:ss')}
👤 *Created by:* Owner
📊 *Collections:* ${Object.keys(result.data.collections).length}
💾 *Size:* ${formatBytes(JSON.stringify(result.data).length)}

💡 Keep this backup ID safe for restoration.`;

      await sock.sendMessage(m.from, { text: backupInfo });

      await logManager.log('success', `Database backup created: ${result.backupId}`, 'owner_plugin', {
        userId: m.sender,
        command: 'backup',
        backupId: result.backupId
      });

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Backup failed: ${error.message}` 
      });
    }
  },

  // Ban user
  ban: async (m, sock, config, args) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can ban users.' 
      });
    }

    const targetUser = extractUserFromMessage(m, args);
    if (!targetUser) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Please mention a user or provide their number.\n\nUsage: `ban @user [reason]`' 
      });
    }

    if (isOwner(targetUser, config.OWNER_NUMBER + '@s.whatsapp.net')) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Cannot ban the bot owner.' 
      });
    }

    if (await adminManager.isAdmin(targetUser)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Cannot ban an admin. Remove admin privileges first.' 
      });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await banManager.banUser(targetUser, reason, m.sender);

      await sock.sendMessage(m.from, { 
        text: `🚫 Successfully banned @${targetUser.split('@')[0]}\n\n📝 Reason: ${reason}`,
        mentions: [targetUser]
      });

      // Notify banned user
      await sock.sendMessage(targetUser, {
        text: `🚫 *You have been banned from using this bot*

📝 **Reason:** ${reason}
👤 **Banned by:** Admin
📅 **Date:** ${moment().format('DD/MM/YYYY HH:mm:ss')}

To appeal this ban, contact the bot owner.`
      });

      await logManager.log('success', `User banned: ${targetUser.split('@')[0]} - ${reason}`, 'owner_plugin', {
        userId: m.sender,
        command: 'ban',
        targetUser,
        reason
      });

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Failed to ban user: ${error.message}` 
      });
    }
  },

  // Unban user
  unban: async (m, sock, config, args) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can unban users.' 
      });
    }

    const targetUser = extractUserFromMessage(m, args);
    if (!targetUser) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Please mention a user or provide their number.\n\nUsage: `unban @user` or `unban 1234567890`' 
      });
    }

    try {
      const unbanned = await banManager.unbanUser(targetUser);

      if (unbanned) {
        await sock.sendMessage(m.from, { 
          text: `✅ Successfully unbanned @${targetUser.split('@')[0]}`,
          mentions: [targetUser]
        });

        // Notify unbanned user
        await sock.sendMessage(targetUser, {
          text: `✅ *Ban Lifted*

Your ban has been lifted by an admin.
You can now use the bot again.

Please follow the rules to avoid future bans.
Welcome back! 🎉`
        });

        await logManager.log('success', `User unbanned: ${targetUser.split('@')[0]}`, 'owner_plugin', {
          userId: m.sender,
          command: 'unban',
          targetUser
        });
      } else {
        await sock.sendMessage(m.from, { 
          text: `❌ @${targetUser.split('@')[0]} is not banned.`,
          mentions: [targetUser]
        });
      }

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Failed to unban user: ${error.message}` 
      });
    }
  },

  // Broadcast message
  broadcast: async (m, sock, config, args) => {
    if (!isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net')) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only the bot owner can broadcast messages.' 
      });
    }

    if (!args[0]) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Please provide a message to broadcast.\n\nUsage: `broadcast <message>`' 
      });
    }

    const message = args.join(' ');
    const broadcastMsg = `📢 *BROADCAST MESSAGE*

${message}

────────────────────
🤖 ${config.BOT_NAME} Official`;

    try {
      await sock.sendMessage(m.from, { 
        text: '📡 Starting broadcast... This may take some time.' 
      });

      // Get all groups where bot is a member
      const groups = Object.keys(await sock.groupFetchAllParticipating());
      let successCount = 0;
      let failCount = 0;

      for (const groupId of groups) {
        try {
          await sock.sendMessage(groupId, { text: broadcastMsg });
          successCount++;
          
          // Add delay to avoid spam detection
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          failCount++;
          console.log(chalk.yellow(`⚠️ Failed to send broadcast to ${groupId}:`, error.message));
        }
      }

      const result = `✅ *Broadcast Complete!*

📊 **Results:**
• ✅ Successful: ${successCount}
• ❌ Failed: ${failCount}
• 📱 Total Groups: ${groups.length}

📝 **Message:** ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`;

      await sock.sendMessage(m.from, { text: result });

      await logManager.log('success', `Broadcast sent to ${successCount} groups`, 'owner_plugin', {
        userId: m.sender,
        command: 'broadcast',
        successCount,
        failCount,
        message: message.substring(0, 100)
      });

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Broadcast failed: ${error.message}` 
      });
    }
  },

  // Code evaluation (DANGEROUS - Owner only)
  eval: async (m, sock, config, args) => {
    if (!isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net')) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only the bot owner can execute code.' 
      });
    }

    if (!args[0]) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Please provide code to execute.\n\nUsage: `eval <code>`\n\n⚠️ **Warning:** This is dangerous!' 
      });
    }

    const code = args.join(' ');

    try {
      await sock.sendMessage(m.from, { 
        text: '⚡ Executing code...\n\n⚠️ **Warning:** Direct code execution can be dangerous!' 
      });

      const result = eval(code);
      const output = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);

      const evalResult = `✅ *Code Executed*

**Input:**
\`\`\`javascript
${code}
\`\`\`

**Output:**
\`\`\`
${output.length > 1000 ? output.substring(0, 1000) + '...(truncated)' : output}
\`\`\`

⚡ Execution completed successfully.`;

      await sock.sendMessage(m.from, { text: evalResult });

      await logManager.log('warn', `Code executed: ${code.substring(0, 100)}`, 'owner_plugin', {
        userId: m.sender,
        command: 'eval',
        code: code.substring(0, 500)
      });

    } catch (error) {
      const errorResult = `❌ *Code Execution Failed*

**Input:**
\`\`\`javascript
${code}
\`\`\`

**Error:**
\`\`\`
${error.message}
\`\`\``;

      await sock.sendMessage(m.from, { text: errorResult });
    }
  },

  // System command execution (DANGEROUS - Owner only)
  exec: async (m, sock, config, args) => {
    if (!isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net')) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only the bot owner can execute system commands.' 
      });
    }

    if (!args[0]) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Please provide a command to execute.\n\nUsage: `exec <command>`\n\n⚠️ **Warning:** This can execute system commands!' 
      });
    }

    const command = args.join(' ');

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      await sock.sendMessage(m.from, { 
        text: `⚡ Executing system command...\n\n\`${command}\`\n\n⚠️ **Warning:** System command execution!` 
      });

      const { stdout, stderr } = await execAsync(command);
      const output = stdout || stderr || 'No output';

      const execResult = `✅ *System Command Executed*

**Command:**
\`${command}\`

**Output:**
\`\`\`
${output.length > 1500 ? output.substring(0, 1500) + '...(truncated)' : output}
\`\`\``;

      await sock.sendMessage(m.from, { text: execResult });

      await logManager.log('warn', `System command executed: ${command}`, 'owner_plugin', {
        userId: m.sender,
        command: 'exec',
        systemCommand: command
      });

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Command execution failed:\n\`\`\`\n${error.message}\n\`\`\`` 
      });
    }
  },

  // Force garbage collection
  gc: async (m, sock, config) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can force garbage collection.' 
      });
    }

    try {
      const beforeMem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

      if (global.gc) {
        global.gc();
        const afterMem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const freed = beforeMem - afterMem;

        const gcResult = `🗑️ *Garbage Collection Complete*

📊 **Memory Stats:**
• Before: ${beforeMem}MB
• After: ${afterMem}MB
• Freed: ${freed}MB

${freed > 0 ? '✅ Memory cleaned successfully!' : '📝 No significant memory freed.'}`;

        await sock.sendMessage(m.from, { text: gcResult });

        await logManager.log('success', `GC executed: ${freed}MB freed`, 'owner_plugin', {
          userId: m.sender,
          command: 'gc',
          beforeMem,
          afterMem,
          freed
        });
      } else {
        await sock.sendMessage(m.from, { 
          text: '❌ Garbage collection not available.\n\n💡 Start the bot with `--expose-gc` flag to enable.' 
        });
      }

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Garbage collection failed: ${error.message}` 
      });
    }
  },

  // View logs
  logs: async (m, sock, config, args) => {
    if (!await isAdminOrOwner(m.sender, config)) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only admins can view logs.' 
      });
    }

    try {
      const limit = parseInt(args[0]) || 20;
      const logs = await logManager.getLogs(Math.min(limit, 50)); // Max 50 logs

      if (logs.length === 0) {
        return await sock.sendMessage(m.from, { 
          text: '📝 No logs found.' 
        });
      }

      let message = `╭─────────────────────╮
│    📋 RECENT LOGS    │
╰─────────────────────╯

📊 Showing last ${logs.length} entries:

`;

      logs.forEach((log, index) => {
        const time = moment(log.timestamp).format('MM/DD HH:mm:ss');
        const levelEmoji = {
          INFO: 'ℹ️',
          WARN: '⚠️',
          ERROR: '❌',
          SUCCESS: '✅'
        }[log.level] || '📝';

        message += `${levelEmoji} \`${time}\` [${log.source}] ${log.message}\n`;
        
        if (index < logs.length - 1) message += '\n';
      });

      message += `\n💡 Use \`${config.PREFIX}logs <number>\` to show more/fewer logs (max 50).`;

      await sock.sendMessage(m.from, { text: message });

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Failed to get logs: ${error.message}` 
      });
    }
  },

  // Restart bot
  restart: async (m, sock, config) => {
    if (!isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net')) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only the bot owner can restart the bot.' 
      });
    }

    try {
      await sock.sendMessage(m.from, { 
        text: '🔄 *Restarting Bot...*\n\nPlease wait while the bot restarts.\nThis may take a few moments.' 
      });

      await settingsManager.setSetting('lastRestart', new Date());

      await logManager.log('warn', 'Bot restart initiated by owner', 'owner_plugin', {
        userId: m.sender,
        command: 'restart'
      });

      // Give time for message to send
      setTimeout(() => {
        if (global.bot && global.bot.emit) {
          global.bot.emit('restart');
        } else {
          process.exit(1); // Force restart
        }
      }, 3000);

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Restart failed: ${error.message}` 
      });
    }
  },

  // Shutdown bot
  shutdown: async (m, sock, config) => {
    if (!isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net')) {
      return await sock.sendMessage(m.from, { 
        text: '❌ Only the bot owner can shutdown the bot.' 
      });
    }

    try {
      await sock.sendMessage(m.from, { 
        text: '🛑 *Shutting Down Bot...*\n\nBot is shutting down gracefully.\nGoodbye! 👋' 
      });

      await logManager.log('warn', 'Bot shutdown initiated by owner', 'owner_plugin', {
        userId: m.sender,
        command: 'shutdown'
      });

      // Give time for message to send
      setTimeout(() => {
        if (global.bot && global.bot.emit) {
          global.bot.emit('shutdown');
        } else {
          process.exit(0);
        }
      }, 3000);

    } catch (error) {
      await sock.sendMessage(m.from, { 
        text: `❌ Shutdown failed: ${error.message}` 
      });
    }
  }
};

// Helper functions for export
export const OwnerHelpers = {
  // Check if bot is in public mode
  isBotPublic: async () => {
    try {
      const mode = await settingsManager.getSetting('botMode');
      return mode === 'public';
    } catch (error) {
      return true; // Default to public if error
    }
  },

  // Get all admins
  getAdmins: async () => {
    try {
      return await adminManager.getAdmins();
    } catch (error) {
      return [];
    }
  },

  // Check if user is admin
  isAdmin: async (userId) => {
    try {
      return await adminManager.isAdmin(userId);
    } catch (error) {
      return false;
    }
  },

  // Check if user is banned
  isBanned: async (userId) => {
    try {
      return await banManager.isBanned(userId);
    } catch (error) {
      return false;
    }
  },

  // Get bot setting
  getSetting: async (key) => {
    try {
      return await settingsManager.getSetting(key);
    } catch (error) {
      return null;
    }
  },

  // Set bot setting
  setSetting: async (key, value) => {
    try {
      return await settingsManager.setSetting(key, value);
    } catch (error) {
      return false;
    }
  },

  // Log to database
  log: async (level, message, source = 'system', metadata = {}) => {
    try {
      return await logManager.log(level, message, source, metadata);
    } catch (error) {
      console.error('Failed to log to database:', error.message);
    }
  }
};

// Initialize function (called when plugin loads)
export async function initialize(config) {
  try {
    console.log(chalk.blue('🔧 Initializing Owner Plugin...'));

    // Initialize default settings
    const defaultSettings = settingsManager.defaultSettings;
    for (const [key, value] of Object.entries(defaultSettings)) {
      try {
        const existing = await settingsManager.getSetting(key);
        if (existing === undefined || existing === null) {
          await settingsManager.setSetting(key, value);
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to initialize setting ${key}:`, error.message));
      }
    }

    // Start cleanup tasks
    startCleanupTasks();

    console.log(chalk.green('✅ Owner Plugin initialized successfully'));
    
    // Log initialization
    await logManager.log('success', 'Owner plugin initialized', 'owner_plugin', {
      version: info.version
    });

  } catch (error) {
    console.error(chalk.red('❌ Owner Plugin initialization failed:'), error.message);
    throw error;
  }
}

// Cleanup tasks
function startCleanupTasks() {
  // Cleanup old logs every 6 hours
  setInterval(async () => {
    try {
      const cleaned = await logManager.cleanupOldLogs();
      if (cleaned > 0) {
        console.log(chalk.green(`🗑️ Cleaned up ${cleaned} old log entries`));
      }
    } catch (error) {
      console.error(chalk.red('❌ Log cleanup error:'), error.message);
    }
  }, 6 * 60 * 60 * 1000);

  // Cache cleanup every 30 minutes
  setInterval(() => {
    settingsManager.invalidateCache();
    adminManager.invalidateCache();
    console.log(chalk.cyan('🧹 Cache invalidated for owner plugin'));
  }, 30 * 60 * 1000);
}

// Scheduled tasks configuration
export const scheduledTasks = [
  {
    name: 'cleanup_logs',
    schedule: '0 2 * * *', // Daily at 2 AM
    description: 'Clean up old log entries',
    handler: async () => {
      try {
        const cleaned = await logManager.cleanupOldLogs();
        console.log(chalk.green(`📅 Scheduled cleanup: ${cleaned} log entries removed`));
      } catch (error) {
        console.error(chalk.red('❌ Scheduled log cleanup failed:'), error.message);
      }
    }
  },
  {
    name: 'cache_refresh',
    schedule: '*/30 * * * *', // Every 30 minutes
    description: 'Refresh admin and settings cache',
    handler: async () => {
      try {
        await adminManager.refreshCache();
        settingsManager.invalidateCache();
        console.log(chalk.cyan('📅 Scheduled cache refresh completed'));
      } catch (error) {
        console.error(chalk.red('❌ Scheduled cache refresh failed:'), error.message);
      }
    }
  },
  {
    name: 'auto_backup',
    schedule: '0 4 * * 0', // Weekly on Sunday at 4 AM
    description: 'Automatic database backup',
    handler: async () => {
      try {
        console.log(chalk.blue('📅 Starting scheduled backup...'));
        const result = await backupManager.createBackup('system_scheduled');
        console.log(chalk.green(`📅 Scheduled backup completed: ${result.backupId}`));
      } catch (error) {
        console.error(chalk.red('❌ Scheduled backup failed:'), error.message);
      }
    }
  }
];

// Permission middleware
async function checkPermissions(m, sock, config, requiredLevel = 'admin') {
  const userId = m.sender;

  // Check if user is banned
  if (await banManager.isBanned(userId)) {
    await sock.sendMessage(m.from, { 
      text: '🚫 You are banned from using this bot.\n\nContact the bot owner to appeal.' 
    });
    return false;
  }

  // Check permission levels
  if (requiredLevel === 'owner') {
    if (!isOwner(userId, config.OWNER_NUMBER + '@s.whatsapp.net')) {
      await sock.sendMessage(m.from, { 
        text: '❌ This command requires owner privileges.' 
      });
      return false;
    }
  } else if (requiredLevel === 'admin') {
    if (!await isAdminOrOwner(userId, config)) {
      await sock.sendMessage(m.from, { 
        text: '❌ This command requires admin privileges.' 
      });
      return false;
    }
  }

  return true;
}

// Main plugin handler
export default async function OwnerPlugin(m, sock, config, bot) {
  try {
    // Set global bot reference for cross-plugin access
    if (bot && !global.bot) {
      global.bot = bot;
    }

    // Only process commands that start with prefix
    if (!m.body?.startsWith(config.PREFIX)) return;

    // Extract command and arguments
    const args = m.body.slice(config.PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    // Check if it's an owner command
    if (!info.commands.includes(command)) return;

    // Log command usage
    await logManager.log('info', `Command executed: ${command}`, 'owner_plugin', {
      userId: m.sender,
      command,
      args: args.slice(0, 3), // Only log first 3 args for privacy
      from: m.from,
      isGroup: m.isGroup
    });

    // Execute command
    if (commands[command]) {
      // Add small delay to prevent spam
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await commands[command](m, sock, config, args, bot);
    }

  } catch (error) {
    console.error(chalk.red('❌ Owner Plugin error:'), error.message);
    
    // Log error
    await logManager.log('error', `Plugin error: ${error.message}`, 'owner_plugin', {
      userId: m.sender,
      command: m.body?.slice(config.PREFIX.length).trim().split(/ +/)[0],
      error: error.message,
      stack: error.stack?.split('\n')[0]
    });

    // Send error message to user
    try {
      await sock.sendMessage(m.from, { 
        text: `❌ An error occurred while executing the command.\n\n**Error:** ${error.message}` 
      });
    } catch (sendError) {
      console.error(chalk.red('❌ Failed to send error message:'), sendError.message);
    }
  }
}

// Export managers for external use
export {
  settingsManager,
  adminManager,
  banManager,
  backupManager,
  logManager
};
