// plugins/birthday.js - V3 Plugin Format with Scheduled Tasks Integration
// FIXED: Removed globalSock and now uses the 'context' object passed by PluginManager.
import { PluginHelpers } from '../lib/pluginIntegration.js';
import moment from 'moment-timezone';

// Collection names
const COLLECTIONS = {
  BIRTHDAYS: 'birthdays',
  BIRTHDAY_SETTINGS: 'birthday_settings',
  BIRTHDAY_WISHES: 'birthday_wishes',
  BIRTHDAY_REMINDERS: 'birthday_reminders'
};

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default settings
const defaultSettings = {
  enableReminders: true,
  enableAutoWishes: true,
  reminderDays: [7, 3, 1],
  reminderTime: '09:00',
  wishTime: '00:01',
  enableGroupReminders: true,
  enablePrivateReminders: true,
  reminderGroups: [],
  adminNumbers: [],
  maxRetries: 3,
  retryDelay: 5000
};

// Global settings cache
let birthdaySettings = { ...defaultSettings };

// ===== V3 PLUGIN EXPORT =====
export default {
  name: 'Birthday System',
  version: '3.0.0',
  author: 'Bot Developer',
  description: 'Advanced birthday system with automatic reminders and wishes using scheduled tasks',
  category: 'social',

  // Commands this plugin handles
  commands: ['birthday', 'mybirthday'],
  aliases: ['bday', 'birthdays', 'mybday'],

  // Scheduled Tasks - These will be registered by PluginManager V3
  scheduledTasks: [
    {
      name: 'birthday_wishes',
      description: 'Send birthday wishes at midnight',
      schedule: '1 0 * * *', // 00:01 every day
      // FIXED: Pass the 'context' object to the handler
      handler: (context) => scheduledBirthdayWishes(context)
    },
    {
      name: 'birthday_reminders_7d',
      description: 'Send 7-day birthday reminders',
      schedule: '0 9 * * *', // 09:00 every day
      // FIXED: Pass the 'context' object and args
      handler: (context) => scheduledBirthdayReminders(context, 7)
    },
    {
      name: 'birthday_reminders_3d',
      description: 'Send 3-day birthday reminders',
      schedule: '0 9 * * *', // 09:00 every day
      // FIXED: Pass the 'context' object and args
      handler: (context) => scheduledBirthdayReminders(context, 3)
    },
    {
      name: 'birthday_reminders_1d',
      description: 'Send 1-day birthday reminders',
      schedule: '0 9 * * *', // 09:00 every day
      // FIXED: Pass the 'context' object and args
      handler: (context) => scheduledBirthdayReminders(context, 1)
    },
    {
      name: 'birthday_cleanup',
      description: 'Clean up old birthday records',
      schedule: '0 2 * * 0', // 02:00 every Sunday
      // FIXED: Pass the 'context' object
      handler: (context) => scheduledCleanup(context)
    }
  ],

  // Main plugin handler
  async run(context) {
    const { msg: m, args, text, command, sock, config, logger, helpers } = context;

    // Load settings on first run
    if (!birthdaySettings.loaded) {
      await loadSettings();
      birthdaySettings.loaded = true;
    }

    // Command routing
    switch (command.toLowerCase()) {
      case 'birthday':
      case 'bday':
      case 'birthdays':
        if (args.length === 0) {
          await showBirthdayMenu(m, config.PREFIX);
        } else {
          // Pass the full context to sub-handlers
          await handleSubCommand(args[0], args.slice(1), context);
        }
        break;

      case 'mybirthday':
      case 'mybday':
        await handleMyBirthday(context);
        break;

      default:
        await showBirthdayMenu(m, config.PREFIX);
    }
  }
};

// ==================== HELPER FUNCTIONS ====================

// Load settings from database
async function loadSettings() {
  try {
    const settings = await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.BIRTHDAY_SETTINGS);
      return await collection.findOne({ type: 'birthday' });
    });

    if (settings) {
      birthdaySettings = { ...defaultSettings, ...settings.data, loaded: true };
    } else {
      birthdaySettings.loaded = true;
    }
  } catch (error) {
    console.error('❌ Error loading birthday settings:', error);
    birthdaySettings.loaded = true;
  }
}

// Save settings to database
async function saveSettings() {
  try {
    await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.BIRTHDAY_SETTINGS);
      await collection.updateOne(
        { type: 'birthday' },
        { 
          $set: { 
            type: 'birthday',
            data: birthdaySettings, 
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );
    });
  } catch (error) {
    console.error('❌ Error saving birthday settings:', error);
  }
}

// Authorization check
function isAuthorized(senderId, config) {
  if (birthdaySettings.adminNumbers.includes(senderId.split('@')[0])) {
    return true;
  }

  const ownerNumber = config.OWNER_NUMBER || '';
  const adminNumbers = config.ADMIN_NUMBERS ? 
    (Array.isArray(config.ADMIN_NUMBERS) ? config.ADMIN_NUMBERS : config.ADMIN_NUMBERS.split(',')) : [];

  if (senderId.split('@')[0] === ownerNumber || adminNumbers.includes(senderId.split('@')[0])) {
    return true;
  }

  return false;
}

// Safe message sending with retry logic
async function safeSend(sock, jid, message, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sock.sendMessage(jid, message);
      return true;
    } catch (error) {
      console.error(`❌ Send attempt ${attempt}/${retries} failed to ${jid.split('@')[0]}:`, error.message);

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, birthdaySettings.retryDelay * attempt));
      }
    }
  }
  return false;
}

// Connection health check
function isConnectionHealthy(sock) {
  return sock && sock.user && sock.user.id;
}

// Helper to get all group participants
async function getGroupParticipants(sock, groupId, logger) {
  try {
    const metadata = await sock.groupMetadata(groupId);
    if (!metadata || !metadata.participants) return [];

    // Get all participant JIDs
    const participants = metadata.participants.map(p => p.id);

    // Get the bot's JID (handle potential device ID)
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    // Filter out the bot
    return participants.filter(jid => jid !== botJid);
  } catch (error) {
    if (logger) {
      logger.error(`❌ Error fetching participants for group ${groupId}:`, error.message);
    } else {
      console.error(`❌ Error fetching participants for group ${groupId}:`, error.message);
    }
    return []; // Return empty array on failure
  }
}

// Get all birthdays
async function getAllBirthdays() {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.BIRTHDAYS);
      const birthdays = await collection.find({}).toArray();
      const formattedBirthdays = {};

      birthdays.forEach(entry => {
        formattedBirthdays[entry.userId] = {
          userId: entry.userId,
          name: entry.name,
          birthday: entry.birthday
        };
      });

      return formattedBirthdays;
    });
  } catch (error) {
    console.error('❌ Error getting all birthdays:', error);
    return {};
  }
}

// Get birthday data for specific user
async function getBirthdayData(userId) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.BIRTHDAYS);
      return await collection.findOne({ userId });
    });
  } catch (error) {
    console.error('❌ Error getting birthday data:', error);
    return null;
  }
}

// Get today's birthdays
async function getTodaysBirthdays() {
  const today = moment.tz('Africa/Lagos');
  const todayKey = `${String(today.month() + 1).padStart(2, '0')}-${String(today.date()).padStart(2, '0')}`;

  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.BIRTHDAYS);
      return await collection
        .find({ 'birthday.searchKey': todayKey })
        .toArray();
    });
  } catch (error) {
    console.error('❌ Error getting today\'s birthdays:', error);
    return [];
  }
}

// Get upcoming birthdays for specific days ahead
async function getUpcomingBirthdays(daysAhead) {
  const targetDate = moment.tz('Africa/Lagos').add(daysAhead, 'days');
  const targetKey = `${String(targetDate.month() + 1).padStart(2, '0')}-${String(targetDate.date()).padStart(2, '0')}`;

  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const collection = db.collection(COLLECTIONS.BIRTHDAYS);
      return await collection
        .find({ 'birthday.searchKey': targetKey })
        .toArray();
    });
  } catch (error) {
    console.error('❌ Error getting upcoming birthdays:', error);
    return [];
  }
}

// Generate birthday wish message
function getBirthdayWishMessage(birthdayPerson) {
  // NEW: Get the user's number for tagging
  const userTag = `@${birthdayPerson.userId.split('@')[0]}`;

  const wishes = [
    `🎉🎂 HAPPY BIRTHDAY ${userTag}! 🎂🎉\n\nWishing you a day filled with happiness and a year filled with joy! 🎈✨`,
    `🎊 Happy Birthday to our amazing friend ${userTag}! 🎊\n\nMay your special day be surrounded with happiness, filled with laughter, wrapped with pleasure and painted with fun! 🎨🎁`,
    `🌟 It's ${userTag}'s Birthday! 🌟\n\n🎂 Another year older, another year wiser, another year more awesome! May all your dreams come true! ✨🎉`,
    `🎈 BIRTHDAY ALERT! 🎈\n\nIt's ${userTag}'s special day! 🎂 Let's celebrate this wonderful person who brings joy to our group! 🎊🎉`,
    `🎵 Happy Birthday to you! 🎵\n🎵 Happy Birthday to you! 🎵\n🎵 Happy Birthday dear ${userTag}! 🎵\n🎵 Happy Birthday to you! 🎵\n\n🎂 Hope your day is as special as you are! 🌟`
  ];

  const randomWish = wishes[Math.floor(Math.random() * wishes.length)];
  let message = randomWish;

  if (birthdayPerson.birthday.age !== undefined) {
    message += `\n\n🎈 Celebrating ${birthdayPerson.birthday.age} wonderful years! 🎈`;
  }

  message += `\n\n👏 From your friends at GIST HQ! 👏`;

  return message;
}

// Generate reminder message
function getReminderMessage(birthdayPerson, daysUntil) {
  let message;

  if (daysUntil === 1) {
    message = `🎂 *BIRTHDAY REMINDER* 🎂\n\n📅 Tomorrow is ${birthdayPerson.name}'s birthday!\n\n🎁 Don't forget to wish them well! 🎉`;
  } else {
    message = `🎂 *BIRTHDAY REMINDER* 🎂\n\n📅 ${birthdayPerson.name}'s birthday is in ${daysUntil} days!\n\n🗓️ Save the date: ${birthdayPerson.birthday.displayDate} 🎉`;
  }

  if (birthdayPerson.birthday.age !== undefined) {
    const upcomingAge = birthdayPerson.birthday.age + 1;
    message += `\n\n🎈 They'll be turning ${upcomingAge}! 🎈`;
  }

  return message;
}

// ==================== SCHEDULED TASK HANDLERS ====================

// FIXED: Accept 'context' and destructure 'sock' and 'logger'
async function scheduledBirthdayWishes(context) {
  const { sock, logger } = context;

  if (!birthdaySettings.enableAutoWishes || !sock) {
    logger.info('🎂 Birthday wishes disabled or no connection');
    return;
  }

  if (!isConnectionHealthy(sock)) {
    logger.warn('❌ Connection not healthy, skipping birthday wishes');
    return;
  }

  try {
    const todaysBirthdays = await getTodaysBirthdays();
    if (todaysBirthdays.length === 0) {
      logger.info('📅 No birthdays today');
      return;
    }

    logger.info(`🎂 Processing ${todaysBirthdays.length} birthday(s) today`);
    const today = moment.tz('Africa/Lagos').format('YYYY-MM-DD');

    for (const birthdayPerson of todaysBirthdays) {
      try {
        // Check if already wished today
        const existingWish = await PluginHelpers.safeDBOperation(async (db) => {
          const collection = db.collection(COLLECTIONS.BIRTHDAY_WISHES);
          return await collection.findOne({ 
            userId: birthdayPerson.userId, 
            date: today 
          });
        });

        if (existingWish) {
          logger.info(`⭐ Already wished ${birthdayPerson.name} today`);
          continue;
        }

        if (!isConnectionHealthy(sock)) {
          logger.warn('❌ Connection lost during birthday processing');
          break;
        }

        const wishMessage = getBirthdayWishMessage(birthdayPerson);
        let successfulSends = 0;

        // Send private wish
        if (birthdaySettings.enablePrivateReminders) {
          try {
            const privateMsg = `🎉 *HAPPY BIRTHDAY ${birthdayPerson.name}!* 🎉\n\nToday is your special day! 🎂\n\nWishing you all the happiness in the world! ✨🎈`;

            // FIXED: Use 'sock' from context
            const success = await safeSend(sock, birthdayPerson.userId, { text: privateMsg });
            if (success) {
              successfulSends++;
              logger.info(`✅ Private wish sent to ${birthdayPerson.name}`);
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
          } catch (error) {
            logger.error(`❌ Private wish failed for ${birthdayPerson.name}:`, error.message);
          }
        }

        // Send to configured groups
        if (birthdaySettings.enableGroupReminders && birthdaySettings.reminderGroups.length > 0) {
          for (const groupId of birthdaySettings.reminderGroups) {
            try {
              if (!isConnectionHealthy(sock)) break;

              // NEW: Get all participants for silent tag
              const allParticipants = await getGroupParticipants(sock, groupId, logger);

              // Add birthday person to mentions if not already in the list (should be)
              const mentions = [...new Set([birthdayPerson.userId, ...allParticipants])];

              // FIXED: Use 'sock' from context
              const success = await safeSend(sock, groupId, {
                text: wishMessage,
                // CHANGED: Use all participants for silent mention
                mentions: mentions
              });

              if (success) {
                successfulSends++;
                logger.info(`✅ Group wish sent to ${groupId.split('@')[0]} for ${birthdayPerson.name}`);
              }

              await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error) {
              logger.error(`❌ Group wish failed for ${groupId.split('@')[0]}:`, error.message);
            }
          }
        }

        // Mark as sent if at least one succeeded
        if (successfulSends > 0) {
          await PluginHelpers.safeDBOperation(async (db) => {
            const collection = db.collection(COLLECTIONS.BIRTHDAY_WISHES);
            await collection.insertOne({
              userId: birthdayPerson.userId,
              name: birthdayPerson.name,
              date: today,
              timestamp: new Date(),
              successfulSends
            });
          });

          logger.info(`✅ Birthday completed for ${birthdayPerson.name} (${successfulSends} sent)`);
        }

        await new Promise(resolve => setTimeout(resolve, 8000));

      } catch (error) {
        logger.error(`💥 Error processing ${birthdayPerson.name}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('❌ Scheduled birthday wishes error:', error);
  }
}

// FIXED: Accept 'context' and destructure 'sock' and 'logger'
async function scheduledBirthdayReminders(context, daysAhead) {
  const { sock, logger } = context;

  if (!birthdaySettings.enableReminders || !sock || !birthdaySettings.reminderDays.includes(daysAhead)) {
    return;
  }

  if (!isConnectionHealthy(sock)) {
    logger.warn('❌ Connection not healthy, skipping reminders');
    return;
  }

  try {
    const upcomingBirthdays = await getUpcomingBirthdays(daysAhead);
    if (upcomingBirthdays.length === 0) {
      logger.info(`📅 No birthdays in ${daysAhead} days`);
      return;
    }

    logger.info(`📅 Processing ${upcomingBirthdays.length} reminder(s) for ${daysAhead} days ahead`);

    const today = moment.tz('Africa/Lagos').format('YYYY-MM-DD');

    for (const birthdayPerson of upcomingBirthdays) {
      const reminderKey = `${today}-${birthdayPerson.userId}-${daysAhead}`;

      try {
        // Skip if reminder already sent
        const existingReminder = await PluginHelpers.safeDBOperation(async (db) => {
          const collection = db.collection(COLLECTIONS.BIRTHDAY_REMINDERS);
          return await collection.findOne({ reminderKey });
        });

        if (existingReminder) {
          continue;
        }

        const reminderMessage = getReminderMessage(birthdayPerson, daysAhead);

        // Send to configured groups
        if (birthdaySettings.enableGroupReminders && birthdaySettings.reminderGroups.length > 0) {
          for (const groupId of birthdaySettings.reminderGroups) {
            try {
              if (!isConnectionHealthy(sock)) break;

              // NEW: Get all participants for silent tag
              const allParticipants = await getGroupParticipants(sock, groupId, logger);

              // Add birthday person to mentions if not already in the list (should be)
              const mentions = [...new Set([birthdayPerson.userId, ...allParticipants])];

              // FIXED: Use 'sock' from context
              const success = await safeSend(sock, groupId, {
                text: reminderMessage,
                // CHANGED: Use all participants for silent mention
                mentions: mentions
              });

              if (success) {
                logger.info(`✅ ${daysAhead}-day reminder sent to ${groupId.split('@')[0]} for ${birthdayPerson.name}`);
              }

              await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (error) {
              logger.error(`❌ Reminder failed for group ${groupId.split('@')[0]}:`, error.message);
            }
          }
        }

        // Mark reminder as sent
        await PluginHelpers.safeDBOperation(async (db) => {
          const collection = db.collection(COLLECTIONS.BIRTHDAY_REMINDERS);
          await collection.insertOne({
            reminderKey,
            userId: birthdayPerson.userId,
            daysAhead,
            date: today,
            timestamp: new Date()
          });
        });

      } catch (error) {
        logger.error(`❌ Error sending reminder for ${birthdayPerson.name}:`, error.message);
      }
    }
  } catch (error) {
    logger.error(`❌ Scheduled ${daysAhead}-day reminders error:`, error);
  }
}

// FIXED: Accept 'context' and destructure 'logger'
async function scheduledCleanup(context) {
  const { logger } = context;

  try {
    const cutoffDate = moment.tz('Africa/Lagos').subtract(30, 'days').toDate();

    // Clean up old wishes and reminders
    const results = await PluginHelpers.safeDBOperation(async (db) => {
      const wishesCollection = db.collection(COLLECTIONS.BIRTHDAY_WISHES);
      const remindersCollection = db.collection(COLLECTIONS.BIRTHDAY_REMINDERS);

      const wishesResult = await wishesCollection.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      const remindersResult = await remindersCollection.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      return { wishesResult, remindersResult };
    });

    if (results) {
      logger.info(`🗑️ Cleaned up ${results.wishesResult.deletedCount} wishes and ${results.remindersResult.deletedCount} reminders`);
    }
  } catch (error) {
    logger.error('❌ Cleanup error:', error);
  }
}

// ==================== COMMAND HANDLERS ====================

// Handle sub commands
async function handleSubCommand(subCommand, args, context) {
  // context is already passed in full, no need to repackage
  switch (subCommand.toLowerCase()) {
    case 'today':
      await handleToday(context);
      break;
    case 'upcoming':
      await handleUpcoming(context, args);
      break;
    case 'thismonth':
      await handleThisMonth(context);
      break;
    case 'all':
      await handleAll(context);
      break;
    case 'settings':
      await handleSettings(context, args);
      break;
    case 'groups':
      await handleGroups(context, args);
      break;
    case 'force':
      await handleForceWishes(context, args);
      break;
    case 'status':
      await handleStatus(context);
      break;
    case 'help':
      await showBirthdayMenu(context.msg, context.config.PREFIX);
      break;
    default:
      await context.msg.reply(`❓ Unknown birthday command: *${subCommand}*\n\nUse *${context.config.PREFIX}birthday help* to see available commands.`);
  }
}

// Show birthday menu
async function showBirthdayMenu(m, prefix) {
  const menuText = `🎂 *BIRTHDAY SYSTEM v3.0* 🎂\n\n` +
                  `📅 *View Commands:*\n` +
                  `• *today* - Today's birthdays\n` +
                  `• *upcoming [days]* - Upcoming birthdays (default: 7 days)\n` +
                  `• *thismonth* - This month's birthdays\n` +
                  `• *all* - All recorded birthdays\n` +
                  `• *status* - System status\n\n` +
                  `👑 *Admin Commands:*\n` +
                  `• *settings* - View/modify settings\n` +
                  `• *groups* - Manage reminder groups\n` +
                  `• *force* - Force birthday checks\n\n` +
                  `🤖 *Features:*\n` +
                  `• Scheduled wishes via cron tasks\n` +
                  `• Reliable reminder system\n` +
                  `• Connection health monitoring\n` +
                  `• Retry logic for failed messages\n\n` +
                  `💡 *Usage:* ${prefix}birthday [command]`;

  await m.reply(menuText);
}

// Handle force wishes (admin only)
async function handleForceWishes(context, args) {
  const { msg: m, sock, config, logger } = context;

  if (!isAuthorized(m.sender, config)) {
    await m.reply('🚫 Only admins can force birthday checks.');
    return;
  }

  if (args.length === 0) {
    await m.reply(`🔧 *FORCE COMMANDS*\n\n• *wishes* - Force today's birthday wishes\n• *reminders [days]* - Force reminders for specific days\n• *cleanup* - Force cleanup\n\nUsage: *${config.PREFIX}birthday force [command]*`);
    return;
  }

  const forceType = args[0].toLowerCase();

  switch (forceType) {
    case 'wishes':
      await m.reply('🔧 Forcing birthday wishes...');
      // FIXED: Pass the context
      await scheduledBirthdayWishes({ sock, logger });
      await m.reply('✅ Forced birthday wishes completed');
      break;
    case 'reminders':
      const days = args[1] ? parseInt(args[1]) : 7;
      if (isNaN(days)) {
        await m.reply('❌ Invalid days parameter');
        return;
      }
      await m.reply(`🔧 Forcing ${days}-day reminders...`);
      // FIXED: Pass the context
      await scheduledBirthdayReminders({ sock, logger }, days);
      await m.reply(`✅ Forced ${days}-day reminders completed`);
      break;
    case 'cleanup':
      await m.reply('🔧 Forcing cleanup...');
      // FIXED: Pass the context
      await scheduledCleanup({ logger });
      await m.reply('✅ Forced cleanup completed');
      break;
    default:
      await m.reply(`❓ Unknown force command: *${forceType}*`);
  }
}

// Handle status command
async function handleStatus(context) {
  const { msg: m, sock } = context;

  try {
    const todaysBirthdays = await getTodaysBirthdays();
    const upcoming7 = await getUpcomingBirthdays(7);
    const upcoming3 = await getUpcomingBirthdays(3);
    const upcoming1 = await getUpcomingBirthdays(1);

    const now = moment.tz('Africa/Lagos');
    const connectionStatus = sock && isConnectionHealthy(sock) ? '✅ Healthy' : '❌ Unhealthy';

    let statusText = `📊 *BIRTHDAY SYSTEM STATUS* 📊\n\n`;
    statusText += `🔌 *Connection:* ${connectionStatus}\n`;
    statusText += `⏰ *Current Time:* ${now.format('YYYY-MM-DD HH:mm:ss')}\n\n`;
    statusText += `📅 *Birthday Counts:*\n`;
    statusText += `• Today: ${todaysBirthdays.length}\n`;
    statusText += `• Tomorrow: ${upcoming1.length}\n`;
    statusText += `• Next 3 days: ${upcoming3.length}\n`;
    statusText += `• Next 7 days: ${upcoming7.length}\n\n`;
    statusText += `⚙️ *Settings:*\n`;
    statusText += `• Auto Wishes: ${birthdaySettings.enableAutoWishes ? '✅' : '❌'}\n`;
    statusText += `• Reminders: ${birthdaySettings.enableReminders ? '✅' : '❌'}\n`;
    statusText += `• Groups: ${birthdaySettings.reminderGroups.length}\n`;
    statusText += `• Reminder Days: ${birthdaySettings.reminderDays.join(', ')}\n\n`;
    statusText += `🤖 *Scheduled Tasks:*\n`;
    statusText += `• Birthday wishes: Daily at 00:01\n`;
    statusText += `• Reminders: Daily at 09:00\n`;
    statusText += `• Cleanup: Weekly on Sundays at 02:00`;

    await m.reply(statusText);
  } catch (error) {
    await m.reply('❌ Error getting status information');
    console.error('Status error:', error);
  }
}

// Handle today's birthdays
async function handleToday(context) {
  const { sock, msg: m, config } = context;

  const todaysBirthdays = await getTodaysBirthdays();

  if (todaysBirthdays.length === 0) {
    await sock.sendMessage(m.from, {
      text: `🎂 *No birthdays today*\n\n📅 Check upcoming birthdays with *${config.PREFIX}birthday upcoming*`
    });
    return;
  }

  let message = `🎉 *TODAY'S BIRTHDAYS* 🎉\n\n`;
  const mentions = [];

  todaysBirthdays.forEach(person => {
    mentions.push(person.userId);
    message += `🎂 @${person.userId.split('@')[0]}\n`;
    if (person.birthday.age !== undefined) {
      message += `   🎈 Turning ${person.birthday.age} today!\n`;
    }
  });

  message += `\n🎊 *Let's wish them a happy birthday!* 🎊`;

  await sock.sendMessage(m.from, {
    text: message,
    mentions: mentions
  });
}

// Handle upcoming birthdays
async function handleUpcoming(context, args) {
  const { sock, msg: m, config } = context;

  const days = args.length > 0 ? parseInt(args[0]) : 7;
  if (isNaN(days) || days < 1 || days > 365) {
    await sock.sendMessage(m.from, {
      text: '⚠️ *Please provide a valid number of days (1-365)*'
    });
    return;
  }

  const allBirthdays = await getAllBirthdays();
  const birthdayEntries = Object.values(allBirthdays);
  const today = new Date();
  const upcomingBirthdays = [];

  birthdayEntries.forEach(entry => {
    const birthday = entry.birthday;
    const thisYear = today.getFullYear();
    const nextBirthday = new Date(thisYear, birthday.month - 1, birthday.day);

    if (nextBirthday < today) {
      nextBirthday.setFullYear(thisYear + 1);
    }

    const daysUntil = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));

    if (daysUntil >= 0 && daysUntil <= days) {
      upcomingBirthdays.push({
        ...entry,
        daysUntil: daysUntil
      });
    }
  });

  if (upcomingBirthdays.length === 0) {
    await sock.sendMessage(m.from, {
      text: `📅 *No birthdays in the next ${days} days*\n\nTry checking a longer period or use *${config.PREFIX}birthday thismonth*`
    });
    return;
  }

  upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

  let message = `📅 *UPCOMING BIRTHDAYS (Next ${days} days)* 📅\n\n`;
  const mentions = [];

  upcomingBirthdays.forEach(upcoming => {
    mentions.push(upcoming.userId);

    if (upcoming.daysUntil === 0) {
      message += `🎊 @${upcoming.userId.split('@')[0]} - TODAY! 🎊\n`;
    } else if (upcoming.daysUntil === 1) {
      message += `🎂 @${upcoming.userId.split('@')[0]} - Tomorrow\n`;
    } else {
      message += `📌 @${upcoming.userId.split('@')[0]} - ${upcoming.daysUntil} days (${upcoming.birthday.monthName} ${upcoming.birthday.day})\n`;
    }

    if (upcoming.birthday.age !== undefined) {
      const upcomingAge = upcoming.birthday.age + (upcoming.daysUntil === 0 ? 0 : 1);
      message += `   🎈 ${upcoming.daysUntil === 0 ? 'Turned' : 'Turning'} ${upcomingAge}\n`;
    }

    message += '\n';
  });

  await sock.sendMessage(m.from, {
    text: message,
    mentions: mentions
  });
}

// Handle this month's birthdays
async function handleThisMonth(context) {
  const { sock, msg: m, config } = context;

  const currentMonth = moment.tz('Africa/Lagos').month() + 1; // moment months are 0-indexed
  const allBirthdays = await getAllBirthdays();
  const thisMonthBirthdays = [];

  Object.values(allBirthdays).forEach(entry => {
    if (entry.birthday.month === currentMonth) {
      thisMonthBirthdays.push(entry);
    }
  });

  if (thisMonthBirthdays.length === 0) {
    const monthName = moment.tz('Africa/Lagos').format('MMMM');
    await sock.sendMessage(m.from, {
      text: `📅 *No birthdays in ${monthName}*\n\nUse *${config.PREFIX}birthday all* to see all recorded birthdays`
    });
    return;
  }

  // Sort by day
  thisMonthBirthdays.sort((a, b) => a.birthday.day - b.birthday.day);

  const monthName = moment.tz('Africa/Lagos').format('MMMM YYYY');
  let message = `📅 *${monthName.toUpperCase()} BIRTHDAYS* 📅\n\n`;
  const mentions = [];

  thisMonthBirthdays.forEach(person => {
    mentions.push(person.userId);
    message += `🎂 @${person.userId.split('@')[0]} - ${person.birthday.monthName} ${person.birthday.day}`;

    if (person.birthday.age !== undefined) {
      message += ` (${person.birthday.age} years old)`;
    }

    // Check if birthday has passed this month
    const today = moment.tz('Africa/Lagos');
    if (person.birthday.month === today.month() + 1) {
      if (person.birthday.day === today.date()) {
        message += ` 🎊 TODAY!`;
      } else if (person.birthday.day < today.date()) {
        message += ` ✅ Celebrated`;
      } else {
        const daysLeft = person.birthday.day - today.date();
        message += ` (${daysLeft} days left)`;
      }
    }

    message += '\n';
  });

  await sock.sendMessage(m.from, {
    text: message,
    mentions: mentions
  });
}

// Handle all birthdays (admin only)
async function handleAll(context) {
  const { sock, msg: m, config } = context;

  if (!isAuthorized(m.sender, config)) {
    await sock.sendMessage(m.from, {
      text: '🚫 Only admins can view all birthdays.'
    });
    return;
  }

  const allBirthdays = await getAllBirthdays();
  const birthdayEntries = Object.values(allBirthdays);

  if (birthdayEntries.length === 0) {
    await sock.sendMessage(m.from, {
      text: `🎂 *No birthdays recorded*\n\nBirthdays are automatically saved when members submit attendance forms with valid D.O.B information.`
    });
    return;
  }

  // Sort by month and day
  birthdayEntries.sort((a, b) => {
    if (a.birthday.month !== b.birthday.month) {
      return a.birthday.month - b.birthday.month;
    }
    return a.birthday.day - b.birthday.day;
  });

  let message = `🎂 *ALL BIRTHDAYS* 🎂\n\n📊 Total: ${birthdayEntries.length} members\n\n`;
  const mentions = [];

  let currentMonth = null;

  birthdayEntries.forEach(person => {
    mentions.push(person.userId);

    // Add month header
    if (currentMonth !== person.birthday.month) {
      currentMonth = person.birthday.month;
      message += `\n📅 *${person.birthday.monthName.toUpperCase()}*\n`;
    }

    message += `🎂 @${person.userId.split('@')[0]} - ${person.birthday.day}`;

    if (person.birthday.age !== undefined) {
      message += ` (${person.birthday.age} years old)`;
    }

    message += '\n';
  });

  await sock.sendMessage(m.from, {
    text: message,
    mentions: mentions
  });
}

// Handle my birthday command
async function handleMyBirthday(context) {
  const { msg: m, config } = context;

  try {
    const birthdayData = await getBirthdayData(m.sender);

    if (!birthdayData) {
      await m.reply(`🎂 *No Birthday Recorded*\n\nYour birthday hasn't been saved yet. It will be automatically saved when you submit your next attendance form with a valid D.O.B field.\n\n💡 *Make sure to fill your D.O.B correctly in the attendance form!*`);
      return;
    }

    const birthday = birthdayData.birthday;
    let message = `🎂 *Your Birthday Information* 🎂\n\n`;
    message += `👤 Name: ${birthdayData.name}\n`;
    message += `📅 Birthday: ${birthday.displayDate}\n`;
    message += `📊 Day: ${birthday.day}\n`;
    message += `📊 Month: ${birthday.monthName}\n`;

    if (birthday.year) {
      message += `📊 Year: ${birthday.year}\n`;
    }

    if (birthday.age !== undefined) {
      message += `🎈 Current Age: ${birthday.age} years old\n`;
    }

    message += `💾 Last Updated: ${new Date(birthdayData.lastUpdated).toLocaleString()}\n`;

    // Calculate days until next birthday
    const today = new Date();
    const thisYear = today.getFullYear();
    const nextBirthday = new Date(thisYear, birthday.month - 1, birthday.day);

    if (nextBirthday < today) {
      nextBirthday.setFullYear(thisYear + 1);
    }

    const daysUntil = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));

    if (daysUntil === 0) {
      message += `🎉 *IT'S YOUR BIRTHDAY TODAY!* 🎉\n`;
      message += `🎊 *HAPPY BIRTHDAY!* 🎊`;
    } else if (daysUntil === 1) {
      message += `🎂 *Your birthday is TOMORROW!* 🎂`;
    } else if (daysUntil <= 7) {
      message += `🗓 *Your birthday is in ${daysUntil} days!*`;
    } else {
      message += `📅 Days until next birthday: ${daysUntil}`;
    }

    await m.reply(message);
  } catch (error) {
    await m.reply('❌ *Error loading birthday information. Please try again.*');
    console.error('My birthday error:', error);
  }
}

// Handle settings command (admin only)
async function handleSettings(context, args) {
  const { msg: m, config } = context;

  if (!isAuthorized(m.sender, config)) {
    await m.reply('🚫 Only admins can modify birthday settings.');
    return;
  }

  if (args.length === 0) {
    await showSettings(m, config);
    return;
  }

  const setting = args[0].toLowerCase();
  const value = args.slice(1).join(' ');

  switch (setting) {
    case 'reminders':
      await toggleReminders(m, value, config);
      break;
    case 'wishes':
      await toggleWishes(m, value, config);
      break;
    case 'remindertime':
      await setReminderTime(m, value, config);
      break;
    case 'wishtime':
      await setWishTime(m, value, config);
      break;
    case 'reminderdays':
      await setReminderDays(m, value, config);
      break;
    case 'groupreminders':
      await toggleGroupReminders(m, value, config);
      break;
    case 'privatereminders':
      await togglePrivateReminders(m, value, config);
      break;
    case 'addadmin':
      await addAdmin(m, value, config);
      break;
    case 'removeadmin':
      await removeAdmin(m, value, config);
      break;
    case 'reload':
      await reloadSettings(m, config);
      break;
    default:
      await m.reply(`❓ Unknown setting: *${setting}*\n\nUse *${config.PREFIX}birthday settings* to see available options.`);
  }
}

// Show settings
async function showSettings(m, config) {
  const settings = birthdaySettings;

  let message = `⚙️ *BIRTHDAY SETTINGS* ⚙️\n\n`;

  message += `🔔 *Reminders:* ${settings.enableReminders ? '✅ ON' : '❌ OFF'}\n`;
  message += `🎉 *Auto Wishes:* ${settings.enableAutoWishes ? '✅ ON' : '❌ OFF'}\n`;
  message += `👥 *Group Reminders:* ${settings.enableGroupReminders ? '✅ ON' : '❌ OFF'}\n`;
  message += `💬 *Private Reminders:* ${settings.enablePrivateReminders ? '✅ ON' : '❌ OFF'}\n\n`;

  message += `⏰ *Reminder Time:* ${settings.reminderTime}\n`;
  message += `🕐 *Wish Time:* ${settings.wishTime}\n`;
  message += `📅 *Reminder Days:* ${settings.reminderDays.join(', ')} days before\n\n`;

  message += `👥 *Configured Groups:* ${settings.reminderGroups.length}\n`;
  message += `👑 *Authorized Admins:* ${settings.adminNumbers.length}\n\n`;

  message += `🔧 *Change Settings:*\n`;
  message += `• *reminders on/off* - Toggle reminders\n`;
  message += `• *wishes on/off* - Toggle auto wishes\n`;
  message += `• *remindertime HH:MM* - Set reminder time\n`;
  message += `• *wishtime HH:MM* - Set wish time\n`;
  message += `• *reminderdays 7,3,1* - Set reminder days\n`;
  message += `• *groupreminders on/off* - Toggle group reminders\n`;
  message += `• *privatereminders on/off* - Toggle private reminders\n`;
  message += `• *addadmin @user* - Add birthday admin\n`;
  message += `• *removeadmin @user* - Remove birthday admin`;

  await m.reply(message);
}

// Settings helper functions
async function toggleReminders(m, value, config) {
  if (!value) {
    await m.reply(`⚠️ Please specify: *on* or *off*\n\nExample: *${config.PREFIX}birthday settings reminders on*`);
    return;
  }

  const enable = value.toLowerCase() === 'on';
  birthdaySettings.enableReminders = enable;
  await saveSettings();

  await m.reply(`✅ Birthday reminders ${enable ? 'enabled' : 'disabled'} successfully!`);
}

async function toggleWishes(m, value, config) {
  if (!value) {
    await m.reply(`⚠️ Please specify: *on* or *off*\n\nExample: *${config.PREFIX}birthday settings wishes on*`);
    return;
  }

  const enable = value.toLowerCase() === 'on';
  birthdaySettings.enableAutoWishes = enable;
  await saveSettings();

  await m.reply(`✅ Auto birthday wishes ${enable ? 'enabled' : 'disabled'} successfully!`);
}

async function setReminderTime(m, value, config) {
  if (!value) {
    await m.reply(`⚠️ Please specify time in HH:MM format\n\nExample: *${config.PREFIX}birthday settings remindertime 09:00*`);
    return;
  }

  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(value)) {
    await m.reply('⚠️ Invalid time format. Please use HH:MM (24-hour format)\n\nExample: 09:00, 14:30, 23:45');
    return;
  }

  birthdaySettings.reminderTime = value;
  await saveSettings();

  await m.reply(`✅ Reminder time set to *${value}* successfully!`);
}

async function setWishTime(m, value, config) {
  if (!value) {
    await m.reply(`⚠️ Please specify time in HH:MM format\n\nExample: *${config.PREFIX}birthday settings wishtime 00:01*`);
    return;
  }

  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(value)) {
    await m.reply('⚠️ Invalid time format. Please use HH:MM (24-hour format)\n\nExample: 00:01, 12:00, 23:59');
    return;
  }

  birthdaySettings.wishTime = value;
  await saveSettings();

  await m.reply(`✅ Birthday wish time set to *${value}* successfully!`);
}

async function setReminderDays(m, value, config) {
  if (!value) {
    await m.reply(`⚠️ Please specify days separated by commas\n\nExample: *${config.PREFIX}birthday settings reminderdays 7,3,1*`);
    return;
  }

  const daysStr = value.split(',').map(d => d.trim());
  const days = [];

  for (const dayStr of daysStr) {
    const day = parseInt(dayStr);
    if (isNaN(day) || day < 1 || day > 365) {
      await m.reply(`⚠️ Invalid day: *${dayStr}*. Days must be between 1 and 365.`);
      return;
    }
    days.push(day);
  }

  days.sort((a, b) => b - a);

  birthdaySettings.reminderDays = days;
  await saveSettings();

  await m.reply(`✅ Reminder days set to *${days.join(', ')}* days before birthday!`);
}

async function toggleGroupReminders(m, value, config) {
  if (!value) {
    await m.reply(`⚠️ Please specify: *on* or *off*\n\nExample: *${config.PREFIX}birthday settings groupreminders on*`);
    return;
  }

  const enable = value.toLowerCase() === 'on';
  birthdaySettings.enableGroupReminders = enable;
  await saveSettings();

  await m.reply(`✅ Group reminders ${enable ? 'enabled' : 'disabled'} successfully!`);
}

async function togglePrivateReminders(m, value, config) {
  if (!value) {
    await m.reply(`⚠️ Please specify: *on* or *off*\n\nExample: *${config.PREFIX}birthday settings privatereminders on*`);
    return;
  }

  const enable = value.toLowerCase() === 'on';
  birthdaySettings.enablePrivateReminders = enable;
  await saveSettings();

  await m.reply(`✅ Private reminders ${enable ? 'enabled' : 'disabled'} successfully!`);
}

async function addAdmin(m, value, config) {
  if (!value) {
    await m.reply(`⚠️ Please mention a user to add as admin\n\nExample: *${config.PREFIX}birthday settings addadmin @user*`);
    return;
  }

  let phoneNumber = value.replace('@', '').replace(/\s+/g, '');
  if (!phoneNumber.includes('@s.whatsapp.net')) {
    phoneNumber += '@s.whatsapp.net';
  }

  if (birthdaySettings.adminNumbers.includes(phoneNumber)) {
    await m.reply('⚠️ User is already a birthday admin.');
    return;
  }

  birthdaySettings.adminNumbers.push(phoneNumber);
  await saveSettings();

  await m.reply(`✅ Added ${phoneNumber.split('@')[0]} as birthday admin!`);
}

async function removeAdmin(m, value, config) {
  if (!value) {
    await m.reply(`⚠️ Please mention a user to remove from admins\n\nExample: *${config.PREFIX}birthday settings removeadmin @user*`);
    return;
  }

  let phoneNumber = value.replace('@', '').replace(/\s+/g, '');
  if (!phoneNumber.includes('@s.whatsapp.net')) {
    phoneNumber += '@s.whatsapp.net';
  }

  const index = birthdaySettings.adminNumbers.indexOf(phoneNumber);
  if (index === -1) {
    await m.reply('⚠️ User is not a birthday admin.');
    return;
  }

  birthdaySettings.adminNumbers.splice(index, 1);
  await saveSettings();

  await m.reply(`✅ Removed ${phoneNumber.split('@')[0]} from birthday admins!`);
}

async function reloadSettings(m, config) {
  try {
    await loadSettings();
    await m.reply('✅ Birthday settings reloaded successfully!');
  } catch (error) {
    console.error('Error reloading settings:', error);
    await m.reply('❌ Error reloading settings. Check logs for details.');
  }
}

// Handle groups command (admin only)
async function handleGroups(context, args) {
  const { msg: m, config } = context;

  if (!isAuthorized(m.sender, config)) {
    await m.reply('🚫 Only admins can manage birthday groups.');
    return;
  }

  if (args.length === 0) {
    await showGroups(m, config);
    return;
  }

  const action = args[0].toLowerCase();

  switch (action) {
    case 'add':
      await addGroup(m, config);
      break;
    case 'remove':
      await removeGroup(m, args[1], config);
      break;
    case 'list':
      await showGroups(m, config);
      break;
    case 'clear':
      await clearGroups(m, config);
      break;
    default:
      await m.reply(`❓ Unknown group action: *${action}*\n\nUse *${config.PREFIX}birthday groups* to see available actions.`);
  }
}

// Group management functions
async function showGroups(m, config) {
  const groupCount = birthdaySettings.reminderGroups.length;

  let message = `👥 *BIRTHDAY REMINDER GROUPS* 👥\n\n`;

  if (groupCount === 0) {
    message += `📝 No groups configured for birthday reminders.\n\n`;
  } else {
    message += `📊 Total Groups: ${groupCount}\n\n`;

    birthdaySettings.reminderGroups.forEach((groupId, index) => {
      const shortId = groupId.split('@')[0];
      message += `${index + 1}. ${shortId}\n`;
    });

    message += '\n';
  }

  message += `🔧 *Group Management:*\n`;
  message += `• *add* - Add current group\n`;
  message += `• *remove [groupId]* - Remove specific group\n`;
  message += `• *list* - Show all groups\n`;
  message += `• *clear* - Remove all groups\n\n`;
  message += `💡 Use this command in a group to add it for birthday reminders.`;

  await m.reply(message);
}

async function addGroup(m, config) {
  const groupId = m.from;

  if (!groupId.includes('@g.us')) {
    await m.reply('⚠️ This command can only be used in groups.');
    return;
  }

  if (birthdaySettings.reminderGroups.includes(groupId)) {
    await m.reply('⚠️ This group is already configured for birthday reminders.');
    return;
  }

  birthdaySettings.reminderGroups.push(groupId);
  await saveSettings();

  const shortId = groupId.split('@')[0];
  await m.reply(`✅ Group *${shortId}* added for birthday reminders!\n\n🎂 This group will now receive birthday wishes and reminders.`);
}

async function removeGroup(m, groupIdArg, config) {
  if (!groupIdArg) {
    await m.reply(`⚠️ Please specify a group ID\n\nExample: *${config.PREFIX}birthday groups remove 1234567890*`);
    return;
  }

  const targetGroup = birthdaySettings.reminderGroups.find(id => 
    id.includes(groupIdArg) || id.split('@')[0] === groupIdArg
  );

  if (!targetGroup) {
    await m.reply(`⚠️ Group not found: *${groupIdArg}*\n\nUse *${config.PREFIX}birthday groups list* to see configured groups.`);
    return;
  }

  const index = birthdaySettings.reminderGroups.indexOf(targetGroup);
  birthdaySettings.reminderGroups.splice(index, 1);
  await saveSettings();

  const shortId = targetGroup.split('@')[0];
  await m.reply(`✅ Group *${shortId}* removed from birthday reminders!`);
}

async function clearGroups(m, config) {
  const groupCount = birthdaySettings.reminderGroups.length;

  if (groupCount === 0) {
    await m.reply('📝 No groups are currently configured for birthday reminders.');
    return;
  }

  birthdaySettings.reminderGroups = [];
  await saveSettings();

  await m.reply(`✅ Cleared all ${groupCount} group(s) from birthday reminders!`);
}

// Export functions for external use
export {
  getAllBirthdays,
  getBirthdayData,
  getTodaysBirthdays,
  getUpcomingBirthdays,
  birthdaySettings
};