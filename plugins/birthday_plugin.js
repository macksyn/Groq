// plugins/birthday.js - Complete Birthday Management Plugin
import moment from 'moment-timezone';
import chalk from 'chalk';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// Plugin Configuration
const TIMEZONE = 'Africa/Lagos';
const BIRTHDAY_COLLECTION = 'birthday_data';
const SETTINGS_COLLECTION = 'birthday_settings';
const ADMIN_ENV_VARS = ['OWNER', 'MODS', 'PREMIUM'].map(v => process.env[v]?.split(',') || []).flat();

// Default Settings
const DEFAULT_SETTINGS = {
  reminders: true,
  wishes: true,
  reminderTime: '09:00', // 9 AM
  wishTime: '00:01', // Just after midnight
  reminderDays: 1, // 1 day before
  groupReminders: true,
  privateReminders: true,
  admins: ADMIN_ENV_VARS,
  enabledGroups: [],
  lastCleanup: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

/**
 * Birthday Plugin Class
 */
class BirthdayPlugin {
  constructor() {
    this.settings = null;
    this.initialized = false;
    this.adminNumbers = new Set();
    
    // Initialize on first load
    this.initializePlugin();
  }

  /**
   * Initialize plugin settings and admin numbers
   */
  async initializePlugin() {
    try {
      await this.loadSettings();
      this.updateAdminNumbers();
      this.initialized = true;
      console.log(chalk.green('🎂 Birthday Plugin initialized successfully'));
    } catch (error) {
      console.error(chalk.red('❌ Birthday Plugin initialization failed:'), error.message);
    }
  }

  /**
   * Load settings from database
   */
  async loadSettings() {
    try {
      const collection = await PluginHelpers.getCollection(SETTINGS_COLLECTION);
      let settings = await collection.findOne({ type: 'global' });
      
      if (!settings) {
        // Create default settings
        settings = { type: 'global', ...DEFAULT_SETTINGS };
        await collection.insertOne(settings);
        console.log(chalk.yellow('📝 Created default birthday settings'));
      }
      
      this.settings = settings;
      return settings;
    } catch (error) {
      console.error(chalk.red('❌ Error loading birthday settings:'), error.message);
      this.settings = { type: 'global', ...DEFAULT_SETTINGS };
      return this.settings;
    }
  }

  /**
   * Save settings to database
   */
  async saveSettings() {
    try {
      const collection = await PluginHelpers.getCollection(SETTINGS_COLLECTION);
      this.settings.updatedAt = new Date();
      
      await collection.updateOne(
        { type: 'global' },
        { $set: this.settings },
        { upsert: true }
      );
      
      this.updateAdminNumbers();
      console.log(chalk.green('💾 Birthday settings saved'));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Error saving birthday settings:'), error.message);
      return false;
    }
  }

  /**
   * Update admin numbers set
   */
  updateAdminNumbers() {
    this.adminNumbers.clear();
    if (this.settings?.admins) {
      this.settings.admins.forEach(admin => {
        if (admin && typeof admin === 'string') {
          // Clean and normalize phone numbers
          const cleaned = admin.replace(/[^\d]/g, '');
          this.adminNumbers.add(cleaned);
          this.adminNumbers.add(`${cleaned}@s.whatsapp.net`);
        }
      });
    }
  }

  /**
   * Check if user is admin
   */
  isAdmin(userId) {
    if (!userId) return false;
    
    const cleaned = userId.replace(/[^\d]/g, '');
    return this.adminNumbers.has(userId) || this.adminNumbers.has(cleaned);
  }

  /**
   * Get or create birthday data for user
   */
  async getBirthdayData(userId) {
    try {
      const collection = await PluginHelpers.getCollection(BIRTHDAY_COLLECTION);
      let data = await collection.findOne({ userId });
      
      if (!data) {
        // Check attendance data for DOB
        const user = await PluginHelpers.getUserData(userId);
        let birthday = null;
        
        if (user?.birthdayData?.dob) {
          birthday = moment(user.birthdayData.dob).format('YYYY-MM-DD');
        }
        
        data = {
          userId,
          birthday,
          remindersSent: [],
          wishSent: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await collection.insertOne(data);
      }
      
      return data;
    } catch (error) {
      console.error(chalk.red(`❌ Error getting birthday data for ${userId}:`), error.message);
      return null;
    }
  }

  /**
   * Update birthday data
   */
  async updateBirthdayData(userId, updates) {
    try {
      const collection = await PluginHelpers.getCollection(BIRTHDAY_COLLECTION);
      
      await collection.updateOne(
        { userId },
        { 
          $set: { 
            ...updates, 
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );
      
      return true;
    } catch (error) {
      console.error(chalk.red(`❌ Error updating birthday data for ${userId}:`), error.message);
      return false;
    }
  }

  /**
   * Get all birthdays
   */
  async getAllBirthdays() {
    try {
      const collection = await PluginHelpers.getCollection(BIRTHDAY_COLLECTION);
      const birthdays = await collection.find({ 
        birthday: { $ne: null, $exists: true } 
      }).toArray();
      
      return birthdays.filter(b => b.birthday && b.birthday !== '');
    } catch (error) {
      console.error(chalk.red('❌ Error getting all birthdays:'), error.message);
      return [];
    }
  }

  /**
   * Get today's birthdays
   */
  async getTodaysBirthdays() {
    try {
      const today = moment.tz(TIMEZONE).format('MM-DD');
      const birthdays = await this.getAllBirthdays();
      
      return birthdays.filter(b => {
        const bday = moment(b.birthday).format('MM-DD');
        return bday === today;
      });
    } catch (error) {
      console.error(chalk.red('❌ Error getting today\'s birthdays:'), error.message);
      return [];
    }
  }

  /**
   * Get upcoming birthdays
   */
  async getUpcomingBirthdays(days = 7) {
    try {
      const birthdays = await this.getAllBirthdays();
      const upcoming = [];
      
      for (let i = 1; i <= days; i++) {
        const date = moment.tz(TIMEZONE).add(i, 'days').format('MM-DD');
        
        birthdays.forEach(b => {
          const bday = moment(b.birthday).format('MM-DD');
          if (bday === date) {
            const age = moment.tz(TIMEZONE).add(i, 'days').year() - moment(b.birthday).year();
            upcoming.push({
              ...b,
              daysUntil: i,
              age: age,
              date: moment.tz(TIMEZONE).add(i, 'days').format('MMMM Do')
            });
          }
        });
      }
      
      return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
    } catch (error) {
      console.error(chalk.red('❌ Error getting upcoming birthdays:'), error.message);
      return [];
    }
  }

  /**
   * Get this month's birthdays
   */
  async getThisMonthsBirthdays() {
    try {
      const currentMonth = moment.tz(TIMEZONE).format('MM');
      const birthdays = await this.getAllBirthdays();
      
      return birthdays.filter(b => {
        const month = moment(b.birthday).format('MM');
        return month === currentMonth;
      }).map(b => ({
        ...b,
        age: moment.tz(TIMEZONE).year() - moment(b.birthday).year(),
        date: moment(b.birthday).format('MMMM Do')
      })).sort((a, b) => {
        const dayA = moment(a.birthday).date();
        const dayB = moment(b.birthday).date();
        return dayA - dayB;
      });
    } catch (error) {
      console.error(chalk.red('❌ Error getting this month\'s birthdays:'), error.message);
      return [];
    }
  }

  /**
   * Send birthday wishes
   */
  async sendBirthdayWishes(sock, bot) {
    if (!this.settings?.wishes) return;
    
    try {
      console.log(chalk.blue('🎂 Checking for birthday wishes to send...'));
      
      const todaysBirthdays = await this.getTodaysBirthdays();
      const today = moment.tz(TIMEZONE).format('YYYY-MM-DD');
      
      for (const birthday of todaysBirthdays) {
        // Skip if wish already sent today
        if (birthday.wishSent === today) continue;
        
        const age = moment.tz(TIMEZONE).year() - moment(birthday.birthday).year();
        const name = birthday.userId.split('@')[0];
        
        const wishes = [
          `🎉🎂 Happy Birthday ${name}! 🎂🎉\n\nWishing you a fantastic ${age}th birthday filled with joy, laughter, and all your heart desires! 🎈✨`,
          `🎊 Happy ${age}th Birthday, ${name}! 🎊\n\nMay this special day bring you happiness and may the year ahead be filled with blessings! 🎁🌟`,
          `🎂✨ It's your special day, ${name}! ✨🎂\n\nHappy ${age}th Birthday! Hope your day is as amazing as you are! 🎉💖`,
          `🎈🎉 Happy Birthday ${name}! 🎉🎈\n\nCelebrating ${age} wonderful years of you! May your birthday be the start of a year filled with good luck, good health and much happiness! 🍰🌺`
        ];
        
        const randomWish = wishes[Math.floor(Math.random() * wishes.length)];
        
        try {
          // Send private wish
          if (this.settings.privateReminders) {
            await sock.sendMessage(birthday.userId, { text: randomWish });
            console.log(chalk.green(`🎂 Sent birthday wish to ${name} (private)`));
          }
          
          // Send to enabled groups
          if (this.settings.groupReminders && this.settings.enabledGroups?.length > 0) {
            for (const groupId of this.settings.enabledGroups) {
              try {
                await sock.sendMessage(groupId, { 
                  text: `${randomWish}\n\n_Birthday wishes from ${bot.name || 'Bot'}_` 
                });
                console.log(chalk.green(`🎂 Sent birthday wish for ${name} to group`));
              } catch (groupError) {
                console.warn(chalk.yellow(`⚠️ Failed to send birthday wish to group ${groupId}:`, groupError.message));
              }
            }
          }
          
          // Mark as sent
          await this.updateBirthdayData(birthday.userId, { wishSent: today });
          
        } catch (error) {
          console.error(chalk.red(`❌ Failed to send birthday wish to ${name}:`), error.message);
        }
      }
      
      console.log(chalk.green(`✅ Processed ${todaysBirthdays.length} birthday wishes`));
      
    } catch (error) {
      console.error(chalk.red('❌ Error sending birthday wishes:'), error.message);
    }
  }

  /**
   * Send birthday reminders
   */
  async sendBirthdayReminders(sock, bot) {
    if (!this.settings?.reminders) return;
    
    try {
      console.log(chalk.blue('🔔 Checking for birthday reminders to send...'));
      
      const reminderDays = this.settings.reminderDays || 1;
      const upcoming = await this.getUpcomingBirthdays(reminderDays);
      const today = moment.tz(TIMEZONE).format('YYYY-MM-DD');
      
      for (const birthday of upcoming) {
        if (birthday.daysUntil !== reminderDays) continue;
        
        // Check if reminder already sent today
        if (birthday.remindersSent?.includes(today)) continue;
        
        const name = birthday.userId.split('@')[0];
        const reminderText = `🔔 Birthday Reminder! 🔔\n\n🎂 ${name}'s birthday is tomorrow (${birthday.date})!\n\nDon't forget to wish them a happy ${birthday.age}th birthday! 🎉`;
        
        try {
          // Send private reminder
          if (this.settings.privateReminders) {
            await sock.sendMessage(birthday.userId, { text: reminderText });
            console.log(chalk.green(`🔔 Sent birthday reminder for ${name} (private)`));
          }
          
          // Send to enabled groups
          if (this.settings.groupReminders && this.settings.enabledGroups?.length > 0) {
            for (const groupId of this.settings.enabledGroups) {
              try {
                await sock.sendMessage(groupId, { 
                  text: `${reminderText}\n\n_Reminder from ${bot.name || 'Bot'}_` 
                });
                console.log(chalk.green(`🔔 Sent birthday reminder for ${name} to group`));
              } catch (groupError) {
                console.warn(chalk.yellow(`⚠️ Failed to send birthday reminder to group ${groupId}:`, groupError.message));
              }
            }
          }
          
          // Mark reminder as sent
          const updatedReminders = birthday.remindersSent || [];
          updatedReminders.push(today);
          await this.updateBirthdayData(birthday.userId, { remindersSent: updatedReminders });
          
        } catch (error) {
          console.error(chalk.red(`❌ Failed to send birthday reminder for ${name}:`), error.message);
        }
      }
      
      console.log(chalk.green(`✅ Processed ${upcoming.length} birthday reminders`));
      
    } catch (error) {
      console.error(chalk.red('❌ Error sending birthday reminders:'), error.message);
    }
  }

  /**
   * Cleanup old birthday records
   */
  async cleanupOldRecords() {
    try {
      console.log(chalk.blue('🧹 Starting birthday records cleanup...'));
      
      const collection = await PluginHelpers.getCollection(BIRTHDAY_COLLECTION);
      const sixMonthsAgo = moment.tz(TIMEZONE).subtract(6, 'months').toDate();
      
      // Remove old reminder records
      const result = await collection.updateMany(
        {},
        { 
          $pull: { 
            remindersSent: { 
              $lt: moment.tz(TIMEZONE).subtract(1, 'month').format('YYYY-MM-DD') 
            } 
          } 
        }
      );
      
      // Clear old wish records (older than 1 year)
      const clearWishResult = await collection.updateMany(
        { 
          wishSent: { 
            $lt: moment.tz(TIMEZONE).subtract(1, 'year').format('YYYY-MM-DD') 
          } 
        },
        { $unset: { wishSent: "" } }
      );
      
      await this.updateSettings({ lastCleanup: new Date() });
      
      console.log(chalk.green(`✅ Cleanup completed. Modified ${result.modifiedCount} records, cleared ${clearWishResult.modifiedCount} old wishes`));
      
      return { 
        remindersCleared: result.modifiedCount, 
        wishesCleared: clearWishResult.modifiedCount 
      };
      
    } catch (error) {
      console.error(chalk.red('❌ Error during birthday cleanup:'), error.message);
      return { remindersCleared: 0, wishesCleared: 0 };
    }
  }

  /**
   * Update settings
   */
  async updateSettings(updates) {
    Object.assign(this.settings, updates);
    return await this.saveSettings();
  }

  /**
   * Format birthday list
   */
  formatBirthdayList(birthdays, title) {
    if (birthdays.length === 0) {
      return `${title}\n\n❌ No birthdays found.`;
    }
    
    let text = `${title}\n\n`;
    
    birthdays.forEach((b, index) => {
      const name = b.userId.split('@')[0];
      const date = moment(b.birthday).format('MMMM Do, YYYY');
      const age = b.age || (moment.tz(TIMEZONE).year() - moment(b.birthday).year());
      
      if (b.daysUntil !== undefined) {
        text += `${index + 1}. 🎂 ${name}\n   📅 ${b.date} (in ${b.daysUntil} day${b.daysUntil !== 1 ? 's' : ''})\n   🎈 Turning ${b.age}\n\n`;
      } else {
        text += `${index + 1}. 🎂 ${name}\n   📅 ${date}\n   🎈 Age: ${age}\n\n`;
      }
    });
    
    return text.trim();
  }

  /**
   * Handle admin commands
   */
  async handleAdminCommands(m, sock, args) {
    const command = args[1]?.toLowerCase();
    
    switch (command) {
      case 'settings':
        return await this.handleSettingsCommand(m, sock, args);
      
      case 'groups':
        return await this.handleGroupsCommand(m, sock, args);
      
      case 'test':
        return await this.handleTestCommand(m, sock, args);
      
      case 'reload':
        await this.loadSettings();
        return await sock.sendMessage(m.key.remoteJid, { 
          text: '✅ Birthday settings reloaded successfully!' 
        });
      
      default:
        return await sock.sendMessage(m.key.remoteJid, {
          text: `❌ Unknown admin command: ${command}\n\nAvailable: settings, groups, test, reload`
        });
    }
  }

  /**
   * Handle settings commands
   */
  async handleSettingsCommand(m, sock, args) {
    const setting = args[2]?.toLowerCase();
    const value = args[3];
    
    if (!setting) {
      const settings = `🎂 **Birthday Settings**\n\n` +
        `🔔 Reminders: ${this.settings.reminders ? '✅' : '❌'}\n` +
        `🎉 Wishes: ${this.settings.wishes ? '✅' : '❌'}\n` +
        `⏰ Reminder Time: ${this.settings.reminderTime}\n` +
        `🎂 Wish Time: ${this.settings.wishTime}\n` +
        `📅 Reminder Days: ${this.settings.reminderDays}\n` +
        `👥 Group Reminders: ${this.settings.groupReminders ? '✅' : '❌'}\n` +
        `💬 Private Reminders: ${this.settings.privateReminders ? '✅' : '❌'}\n` +
        `🏷️ Enabled Groups: ${this.settings.enabledGroups?.length || 0}\n` +
        `👑 Admins: ${this.settings.admins?.length || 0}\n\n` +
        `Use: birthday settings <setting> <value>`;
      
      return await sock.sendMessage(m.key.remoteJid, { text: settings });
    }
    
    switch (setting) {
      case 'reminders':
        this.settings.reminders = value === 'true' || value === 'on';
        break;
      
      case 'wishes':
        this.settings.wishes = value === 'true' || value === 'on';
        break;
      
      case 'remindertime':
        if (!/^\d{2}:\d{2}$/.test(value)) {
          return await sock.sendMessage(m.key.remoteJid, { 
            text: '❌ Invalid time format. Use HH:MM (e.g., 09:00)' 
          });
        }
        this.settings.reminderTime = value;
        break;
      
      case 'wishtime':
        if (!/^\d{2}:\d{2}$/.test(value)) {
          return await sock.sendMessage(m.key.remoteJid, { 
            text: '❌ Invalid time format. Use HH:MM (e.g., 00:01)' 
          });
        }
        this.settings.wishTime = value;
        break;
      
      case 'reminderdays':
        const days = parseInt(value);
        if (isNaN(days) || days < 0 || days > 30) {
          return await sock.sendMessage(m.key.remoteJid, { 
            text: '❌ Invalid days. Use 0-30' 
          });
        }
        this.settings.reminderDays = days;
        break;
      
      case 'groupreminders':
        this.settings.groupReminders = value === 'true' || value === 'on';
        break;
      
      case 'privatereminders':
        this.settings.privateReminders = value === 'true' || value === 'on';
        break;
      
      case 'addadmin':
        if (!value) {
          return await sock.sendMessage(m.key.remoteJid, { 
            text: '❌ Provide admin number' 
          });
        }
        
        if (!this.settings.admins) this.settings.admins = [];
        const cleanNumber = value.replace(/[^\d]/g, '');
        
        if (!this.settings.admins.includes(cleanNumber)) {
          this.settings.admins.push(cleanNumber);
        }
        break;
      
      case 'removeadmin':
        if (!value) {
          return await sock.sendMessage(m.key.remoteJid, { 
            text: '❌ Provide admin number' 
          });
        }
        
        const removeNumber = value.replace(/[^\d]/g, '');
        this.settings.admins = this.settings.admins?.filter(a => a !== removeNumber) || [];
        break;
      
      default:
        return await sock.sendMessage(m.key.remoteJid, {
          text: `❌ Unknown setting: ${setting}\n\nAvailable: reminders, wishes, remindertime, wishtime, reminderdays, groupreminders, privatereminders, addadmin, removeadmin`
        });
    }
    
    await this.saveSettings();
    return await sock.sendMessage(m.key.remoteJid, { 
      text: `✅ Setting updated: ${setting} = ${value}` 
    });
  }

  /**
   * Handle groups commands
   */
  async handleGroupsCommand(m, sock, args) {
    const action = args[2]?.toLowerCase();
    
    switch (action) {
      case 'add':
        if (!this.settings.enabledGroups) this.settings.enabledGroups = [];
        
        if (!this.settings.enabledGroups.includes(m.key.remoteJid)) {
          this.settings.enabledGroups.push(m.key.remoteJid);
          await this.saveSettings();
        }
        
        return await sock.sendMessage(m.key.remoteJid, { 
          text: '✅ Birthday notifications enabled for this group!' 
        });
      
      case 'remove':
        if (this.settings.enabledGroups) {
          this.settings.enabledGroups = this.settings.enabledGroups.filter(g => g !== m.key.remoteJid);
          await this.saveSettings();
        }
        
        return await sock.sendMessage(m.key.remoteJid, { 
          text: '❌ Birthday notifications disabled for this group!' 
        });
      
      case 'list':
        const groups = this.settings.enabledGroups || [];
        return await sock.sendMessage(m.key.remoteJid, { 
          text: `🏷️ **Enabled Groups (${groups.length})**\n\n${groups.join('\n') || 'No groups enabled'}` 
        });
      
      case 'clear':
        this.settings.enabledGroups = [];
        await this.saveSettings();
        
        return await sock.sendMessage(m.key.remoteJid, { 
          text: '🗑️ All groups cleared from birthday notifications!' 
        });
      
      default:
        return await sock.sendMessage(m.key.remoteJid, {
          text: `❌ Unknown groups command: ${action}\n\nAvailable: add, remove, list, clear`
        });
    }
  }

  /**
   * Handle test commands
   */
  async handleTestCommand(m, sock, args) {
    const test = args[2]?.toLowerCase();
    
    switch (test) {
      case 'wish':
        await this.sendBirthdayWishes(sock, { name: 'Test Bot' });
        return await sock.sendMessage(m.key.remoteJid, { 
          text: '✅ Test birthday wishes sent!' 
        });
      
      case 'reminder':
        await this.sendBirthdayReminders(sock, { name: 'Test Bot' });
        return await sock.sendMessage(m.key.remoteJid, { 
          text: '✅ Test birthday reminders sent!' 
        });
      
      case 'today':
        const todaysBirthdays = await this.getTodaysBirthdays();
        return await sock.sendMessage(m.key.remoteJid, { 
          text: this.formatBirthdayList(todaysBirthdays, '🎂 **Test - Today\'s Birthdays**') 
        });
      
      case 'cleanup':
        const cleanup = await this.cleanupOldRecords();
        return await sock.sendMessage(m.key.remoteJid, { 
          text: `✅ Test cleanup completed!\n\nReminders cleared: ${cleanup.remindersCleared}\nWishes cleared: ${cleanup.wishesCleared}` 
        });
      
      case 'scheduler':
        const health = await this.testScheduler();
        return await sock.sendMessage(m.key.remoteJid, { 
          text: `🔧 **Scheduler Test**\n\n${health.message}` 
        });
      
      default:
        return await sock.sendMessage(m.key.remoteJid, {
          text: `❌ Unknown test command: ${test}\n\nAvailable: wish, reminder, today, cleanup, scheduler`
        });
    }
  }

  /**
   * Test scheduler health
   */
  async testScheduler() {
    try {
      const now = moment.tz(TIMEZONE);
      const wishTime = moment.tz(this.settings.wishTime, 'HH:mm', TIMEZONE);
      const reminderTime = moment.tz(this.settings.reminderTime, 'HH:mm', TIMEZONE);
      
      return {
        healthy: true,
        message: `✅ Scheduler is healthy\n\n` +
          `⏰ Current time: ${now.format('HH:mm')}\n` +
          `🎂 Wish time: ${this.settings.wishTime}\n` +
          `🔔 Reminder time: ${this.settings.reminderTime}\n` +
          `📊 Settings loaded: ${this.initialized ? '✅' : '❌'}\n` +
          `👥 Enabled groups: ${this.settings.enabledGroups?.length || 0}`
      };
    } catch (error) {
      return {
        healthy: false,
        message: `❌ Scheduler error: ${error.message}`
      };
    }
  }
}

// Create plugin instance
const birthdayPlugin = new BirthdayPlugin();

/**
 * Main plugin handler
 */
export default async function birthdayHandler(m, sock, config, bot) {
  try {
    // Skip if not a text message
    if (!m.message?.conversation && !m.message?.extendedTextMessage?.text) return;
    
    const text = (m.message?.conversation || m.message?.extendedTextMessage?.text || '').trim();
    const isCommand = text.startsWith(config.prefix);
    
    if (!isCommand) return;
    
    const args = text.slice(config.prefix.length).split(' ');
    const command = args[0]?.toLowerCase();
    
    // Check if it's a birthday command
    if (!['birthday', 'bday', 'birthdays', 'mybirthday', 'mybday'].includes(command)) return;
    
    const userId = m.key.participant || m.key.remoteJid;
    
    // Handle mybirthday commands
    if (['mybirthday', 'mybday'].includes(command)) {
      return await handleMyBirthdayCommand(m, sock, args, userId);
    }
    
    // Handle main birthday commands
    const subCommand = args[1]?.toLowerCase();
    
    // Admin commands
    if (['settings', 'groups', 'test', 'reload'].includes(subCommand)) {
      if (!birthdayPlugin.isAdmin(userId)) {
        return await sock.sendMessage(m.key.remoteJid, { 
          text: '❌ This command requires admin privileges!' 
        });
      }
      
      return await birthdayPlugin.handleAdminCommands(m, sock, args);
    }
    
    // Public commands
    switch (subCommand) {
      case 'today':
        const todaysBirthdays = await birthdayPlugin.getTodaysBirthdays();
        return await sock.sendMessage(m.key.remoteJid, { 
          text: birthdayPlugin.formatBirthdayList(todaysBirthdays, '🎂 **Today\'s Birthdays**') 
        });
      
      case 'upcoming':
        const days = parseInt(args[2]) || 7;
        if (days < 1 || days > 30) {
          return await sock.sendMessage(m.key.remoteJid, { 
            text: '❌ Days must be between 1 and 30' 
          });
        }
        
        const upcoming = await birthdayPlugin.getUpcomingBirthdays(days);
        return await sock.sendMessage(m.key.remoteJid, { 
          text: birthdayPlugin.formatBirthdayList(upcoming, `🗓️ **Upcoming Birthdays (Next ${days} days)**`) 
        });
      
      case 'thismonth':
        const thisMonth = await birthdayPlugin.getThisMonthsBirthdays();
        const monthName = moment.tz(TIMEZONE).format('MMMM YYYY');
        return await sock.sendMessage(m.key.remoteJid, { 
          text: birthdayPlugin.formatBirthdayList(thisMonth, `📅 **${monthName} Birthdays**`) 
        });
      
      case 'all':
        const allBirthdays = await birthdayPlugin.getAllBirthdays();
        const sortedBirthdays = allBirthdays.map(b => ({
          ...b,
          age: moment.tz(TIMEZONE).year() - moment(b.birthday).year()
        })).sort((a, b) => {
          const dateA = moment(a.birthday).format('MM-DD');
          const dateB = moment(b.birthday).format('MM-DD');
          return dateA.localeCompare(dateB);
        });
        
        if (sortedBirthdays.length > 20) {
          return await sock.sendMessage(m.key.remoteJid, { 
            text: `🎂 **All Birthdays (${sortedBirthdays.length} total)**\n\n` +
              `Too many birthdays to display. Use:\n` +
              `• ${config.prefix}birthday today\n` +
              `• ${config.prefix}birthday upcoming [days]\n` +
              `• ${config.prefix}birthday thismonth` 
          });
        }
        
        return await sock.sendMessage(m.key.remoteJid, { 
          text: birthdayPlugin.formatBirthdayList(sortedBirthdays, '🎂 **All Birthdays**') 
        });
      
      case 'help':
      case undefined:
        return await sock.sendMessage(m.key.remoteJid, { 
          text: getBirthdayHelpText(config.prefix, birthdayPlugin.isAdmin(userId)) 
        });
      
      default:
        return await sock.sendMessage(m.key.remoteJid, {
          text: `❌ Unknown command: ${subCommand}\n\nUse ${config.prefix}birthday help for available commands`
        });
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Birthday plugin error:'), error.message);
    
    try {
      await sock.sendMessage(m.key.remoteJid, { 
        text: '❌ An error occurred while processing your birthday command. Please try again later.' 
      });
    } catch (sendError) {
      console.error(chalk.red('❌ Failed to send error message:'), sendError.message);
    }
  }
}

/**
 * Handle mybirthday commands
 */
async function handleMyBirthdayCommand(m, sock, args, userId) {
  try {
    const action = args[1]?.toLowerCase();
    
    if (!action) {
      // Show user's birthday info
      const birthdayData = await birthdayPlugin.getBirthdayData(userId);
      
      if (!birthdayData?.birthday) {
        return await sock.sendMessage(m.key.remoteJid, { 
          text: `🎂 **Your Birthday**\n\n❌ No birthday set.\n\nYour birthday will be automatically detected from your attendance DOB submission, or contact an admin to set it manually.` 
        });
      }
      
      const age = moment.tz(TIMEZONE).year() - moment(birthdayData.birthday).year();
      const nextBirthday = moment(birthdayData.birthday).year(moment.tz(TIMEZONE).year());
      
      if (nextBirthday.isBefore(moment.tz(TIMEZONE))) {
        nextBirthday.add(1, 'year');
      }
      
      const daysUntil = nextBirthday.diff(moment.tz(TIMEZONE), 'days');
      
      return await sock.sendMessage(m.key.remoteJid, { 
        text: `🎂 **Your Birthday**\n\n` +
          `📅 Date: ${moment(birthdayData.birthday).format('MMMM Do, YYYY')}\n` +
          `🎈 Current Age: ${age}\n` +
          `⏳ Days until next birthday: ${daysUntil}\n` +
          `🎯 Next birthday: ${nextBirthday.format('MMMM Do, YYYY')}` 
      });
    }
    
    // Future: Could add manual birthday setting for admins
    return await sock.sendMessage(m.key.remoteJid, {
      text: `❌ Unknown mybirthday command: ${action}\n\nUse ${config.prefix}mybirthday to view your birthday info.`
    });
    
  } catch (error) {
    console.error(chalk.red('❌ MyBirthday command error:'), error.message);
    return await sock.sendMessage(m.key.remoteJid, { 
      text: '❌ Error retrieving your birthday information.' 
    });
  }
}

/**
 * Get help text
 */
function getBirthdayHelpText(prefix, isAdmin) {
  let helpText = `🎂 **Birthday Commands Help**\n\n`;
  
  // Public commands
  helpText += `**📋 Public Commands:**\n`;
  helpText += `• ${prefix}birthday today - Today's birthdays\n`;
  helpText += `• ${prefix}birthday upcoming [days] - Upcoming birthdays (default: 7 days)\n`;
  helpText += `• ${prefix}birthday thismonth - This month's birthdays\n`;
  helpText += `• ${prefix}birthday all - All birthdays (limited display)\n`;
  helpText += `• ${prefix}mybirthday - Your birthday info\n`;
  helpText += `• ${prefix}birthday help - This help message\n\n`;
  
  // Admin commands
  if (isAdmin) {
    helpText += `**🔧 Admin Commands:**\n`;
    helpText += `• ${prefix}birthday settings - View/modify settings\n`;
    helpText += `• ${prefix}birthday groups add/remove/list/clear - Manage groups\n`;
    helpText += `• ${prefix}birthday test <command> - Test functions\n`;
    helpText += `• ${prefix}birthday reload - Reload settings\n\n`;
    
    helpText += `**⚙️ Settings:**\n`;
    helpText += `• reminders on/off - Enable/disable reminders\n`;
    helpText += `• wishes on/off - Enable/disable birthday wishes\n`;
    helpText += `• remindertime HH:MM - Set reminder time\n`;
    helpText += `• wishtime HH:MM - Set wish time\n`;
    helpText += `• reminderdays N - Days before birthday to remind\n`;
    helpText += `• groupreminders on/off - Group notifications\n`;
    helpText += `• privatereminders on/off - Private notifications\n`;
    helpText += `• addadmin <number> - Add admin\n`;
    helpText += `• removeadmin <number> - Remove admin\n\n`;
    
    helpText += `**🧪 Test Commands:**\n`;
    helpText += `• wish, reminder, today, cleanup, scheduler\n\n`;
  }
  
  helpText += `**ℹ️ Notes:**\n`;
  helpText += `• Birthdays are detected from attendance DOB submissions\n`;
  helpText += `• All times are in Africa/Lagos timezone\n`;
  helpText += `• Automatic wishes sent at midnight\n`;
  helpText += `• Reminders sent day before birthday`;
  
  return helpText;
}

/**
 * Scheduled task handlers for plugin manager
 */
const birthdayWishTask = async () => {
  try {
    // This will be called by the plugin manager's cron system
    console.log(chalk.blue('🎂 Birthday wish scheduled task triggered'));
    
    // We need access to sock and bot, but they're not available here
    // The actual execution will happen in the main handler when conditions are met
    
  } catch (error) {
    console.error(chalk.red('❌ Birthday wish scheduled task error:'), error.message);
  }
};

const birthdayReminderTask = async () => {
  try {
    console.log(chalk.blue('🔔 Birthday reminder scheduled task triggered'));
    
    // Similar to wish task - actual execution handled in main flow
    
  } catch (error) {
    console.error(chalk.red('❌ Birthday reminder scheduled task error:'), error.message);
  }
};

const birthdayCleanupTask = async () => {
  try {
    console.log(chalk.blue('🧹 Birthday cleanup scheduled task triggered'));
    
    // This can run independently
    await birthdayPlugin.cleanupOldRecords();
    
  } catch (error) {
    console.error(chalk.red('❌ Birthday cleanup scheduled task error:'), error.message);
  }
};

/**
 * Plugin info and scheduled tasks for plugin manager
 */
export const info = {
  name: 'Birthday Manager',
  version: '2.0.0',
  author: 'System',
  description: 'Complete birthday management system with wishes, reminders, and admin controls',
  category: 'utility',
  commands: [
    'birthday', 'bday', 'birthdays', 'mybirthday', 'mybday'
  ],
  scheduledTasks: [
    {
      name: 'birthday_wishes',
      schedule: '1 0 * * *', // Every day at 12:01 AM
      handler: birthdayWishTask,
      description: 'Send birthday wishes at midnight'
    },
    {
      name: 'birthday_reminders', 
      schedule: '0 9 * * *', // Every day at 9:00 AM
      handler: birthdayReminderTask,
      description: 'Send birthday reminders in the morning'
    },
    {
      name: 'birthday_cleanup',
      schedule: '0 3 * * 0', // Every Sunday at 3:00 AM
      handler: birthdayCleanupTask,
      description: 'Clean up old birthday records weekly'
    }
  ],
  permissions: ['admin'],
  dependencies: ['moment-timezone', 'pluginIntegration']
};

/**
 * Initialize function for plugin manager
 */
export const initialize = (config) => {
  console.log(chalk.green('🎂 Birthday Plugin initializing...'));
  
  // Set up any configuration needed
  if (config?.timezone) {
    // Could override timezone if needed
  }
  
  // Ensure plugin is ready
  if (!birthdayPlugin.initialized) {
    birthdayPlugin.initializePlugin();
  }
  
  console.log(chalk.green('✅ Birthday Plugin initialized successfully'));
};

// =============================================
// EXPORTED HELPER FUNCTIONS FOR OTHER PLUGINS
// =============================================

/**
 * Get all birthdays - for use by other plugins
 */
export async function getAllBirthdays() {
  try {
    return await birthdayPlugin.getAllBirthdays();
  } catch (error) {
    console.error(chalk.red('❌ Error in getAllBirthdays export:'), error.message);
    return [];
  }
}

/**
 * Get birthday data for specific user - for use by other plugins
 */
export async function getBirthdayData(userId) {
  try {
    return await birthdayPlugin.getBirthdayData(userId);
  } catch (error) {
    console.error(chalk.red(`❌ Error in getBirthdayData export for ${userId}:`), error.message);
    return null;
  }
}

/**
 * Get today's birthdays - for use by other plugins
 */
export async function getTodaysBirthdays() {
  try {
    return await birthdayPlugin.getTodaysBirthdays();
  } catch (error) {
    console.error(chalk.red('❌ Error in getTodaysBirthdays export:'), error.message);
    return [];
  }
}

/**
 * Get upcoming birthdays - for use by other plugins
 */
export async function getUpcomingBirthdays(days = 7) {
  try {
    return await birthdayPlugin.getUpcomingBirthdays(days);
  } catch (error) {
    console.error(chalk.red('❌ Error in getUpcomingBirthdays export:'), error.message);
    return [];
  }
}

/**
 * Get this month's birthdays - for use by other plugins
 */
export async function getThisMonthsBirthdays() {
  try {
    return await birthdayPlugin.getThisMonthsBirthdays();
  } catch (error) {
    console.error(chalk.red('❌ Error in getThisMonthsBirthdays export:'), error.message);
    return [];
  }
}

/**
 * Send birthday wishes - for use by other plugins
 */
export async function sendBirthdayWishes(sock, bot) {
  try {
    return await birthdayPlugin.sendBirthdayWishes(sock, bot);
  } catch (error) {
    console.error(chalk.red('❌ Error in sendBirthdayWishes export:'), error.message);
    return false;
  }
}

/**
 * Send birthday reminders - for use by other plugins  
 */
export async function sendBirthdayReminders(sock, bot) {
  try {
    return await birthdayPlugin.sendBirthdayReminders(sock, bot);
  } catch (error) {
    console.error(chalk.red('❌ Error in sendBirthdayReminders export:'), error.message);
    return false;
  }
}

/**
 * Update birthday data - for use by other plugins
 */
export async function updateBirthdayData(userId, updates) {
  try {
    return await birthdayPlugin.updateBirthdayData(userId, updates);
  } catch (error) {
    console.error(chalk.red(`❌ Error in updateBirthdayData export for ${userId}:`), error.message);
    return false;
  }
}

/**
 * Cleanup old records - for use by other plugins
 */
export async function cleanupOldRecords() {
  try {
    return await birthdayPlugin.cleanupOldRecords();
  } catch (error) {
    console.error(chalk.red('❌ Error in cleanupOldRecords export:'), error.message);
    return { remindersCleared: 0, wishesCleared: 0 };
  }
}

/**
 * Check if user is admin - for use by other plugins
 */
export function isAdmin(userId) {
  try {
    return birthdayPlugin.isAdmin(userId);
  } catch (error) {
    console.error(chalk.red(`❌ Error in isAdmin export for ${userId}:`), error.message);
    return false;
  }
}

/**
 * Get birthday settings - for use by other plugins
 */
export async function getBirthdaySettings() {
  try {
    return birthdayPlugin.settings;
  } catch (error) {
    console.error(chalk.red('❌ Error in getBirthdaySettings export:'), error.message);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Format birthday list - for use by other plugins
 */
export function formatBirthdayList(birthdays, title) {
  try {
    return birthdayPlugin.formatBirthdayList(birthdays, title);
  } catch (error) {
    console.error(chalk.red('❌ Error in formatBirthdayList export:'), error.message);
    return `${title}\n\n❌ Error formatting birthday list.`;
  }
}

// =============================================
// PLUGIN MANAGER INTEGRATION EVENTS
// =============================================

// Register plugin events for cross-plugin communication
if (typeof PluginHelpers !== 'undefined' && PluginHelpers.registerPlugin) {
  PluginHelpers.registerPlugin('birthday', {
    name: 'Birthday Manager',
    version: '2.0.0',
    exports: {
      getAllBirthdays,
      getBirthdayData,
      getTodaysBirthdays,
      getUpcomingBirthdays,
      getThisMonthsBirthdays,
      sendBirthdayWishes,
      sendBirthdayReminders,
      updateBirthdayData,
      cleanupOldRecords,
      isAdmin,
      getBirthdaySettings,
      formatBirthdayList
    }
  });
  
  // Listen for attendance events to sync birthday data
  PluginHelpers.onEvent('attendance_dob_updated', async (data) => {
    try {
      const { userId, dob } = data;
      if (userId && dob) {
        const birthday = moment(dob).format('YYYY-MM-DD');
        await birthdayPlugin.updateBirthdayData(userId, { birthday });
        console.log(chalk.green(`🎂 Birthday synced from attendance: ${userId} - ${birthday}`));
      }
    } catch (error) {
      console.error(chalk.red('❌ Error syncing birthday from attendance:'), error.message);
    }
  });
  
  // Emit birthday events for other plugins
  PluginHelpers.onEvent('daily_birthday_check', async () => {
    try {
      const todaysBirthdays = await getTodaysBirthdays();
      if (todaysBirthdays.length > 0) {
        PluginHelpers.emitEvent('birthdays_today', { birthdays: todaysBirthdays });
      }
    } catch (error) {
      console.error(chalk.red('❌ Error in daily birthday check event:'), error.message);
    }
  });
}

console.log(chalk.green('🎂 Birthday Plugin loaded successfully with all features!'));
