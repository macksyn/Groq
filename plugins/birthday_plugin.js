// At the top of your birthday plugin, add:
const isConnectionHealthy = global.isConnectionHealthy || (() => true);
const safeSend = global.sendMessageSafely || ((sock, jid, msg) => sock.sendMessage(jid, msg));

// plugins/birthday.js - Birthday plugin compatible with PluginManager
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';

// Plugin information export
export const info = {
  name: 'Birthday System',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Advanced birthday system with automatic reminders, wishes, and integration with attendance data',
  commands: [
    {
      name: 'birthday',
      aliases: ['bday', 'birthdays'],
      description: 'Access the birthday system'
    },
    {
      name: 'mybirthday',
      aliases: ['mybday'],
      description: 'View your birthday information'
    }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
const COLLECTIONS = {
  BIRTHDAYS: 'birthdays',
  BIRTHDAY_SETTINGS: 'birthday_settings',
  BIRTHDAY_WISHES: 'birthday_wishes',
  BIRTHDAY_REMINDERS: 'birthday_reminders'
};

// Database connection
let db = null;
let mongoClient = null;

// Initialize MongoDB connection
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    // Create indexes for better performance
    await db.collection(COLLECTIONS.BIRTHDAYS).createIndex({ userId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.BIRTHDAYS).createIndex({ 'birthday.searchKey': 1 });
    await db.collection(COLLECTIONS.BIRTHDAY_WISHES).createIndex({ date: -1, userId: 1 });
    await db.collection(COLLECTIONS.BIRTHDAY_REMINDERS).createIndex({ reminderKey: 1 }, { unique: true });
    
    console.log('✅ MongoDB connected successfully for Birthday system');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed for Birthday system:', error);
    throw error;
  }
}

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default birthday settings
const defaultSettings = {
  enableReminders: true,
  enableAutoWishes: true,
  reminderDays: [7, 3, 1], // Days before birthday to send reminders
  reminderTime: '09:00', // Time to send reminders (24h format)
  wishTime: '00:01', // Time to send birthday wishes (just after midnight)
  enableGroupReminders: true,
  enablePrivateReminders: true,
  reminderGroups: [], // Groups to send reminders to
  adminNumbers: []
};

// Load settings from database
let birthdaySettings = { ...defaultSettings };

async function loadSettings() {
  try {
    const settings = await db.collection(COLLECTIONS.BIRTHDAY_SETTINGS).findOne({ type: 'birthday' });
    if (settings) {
      birthdaySettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading birthday settings:', error);
  }
}

// Save settings to database
async function saveSettings() {
  try {
    await db.collection(COLLECTIONS.BIRTHDAY_SETTINGS).replaceOne(
      { type: 'birthday' },
      { type: 'birthday', data: birthdaySettings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving birthday settings:', error);
  }
}

// Check if user is authorized
function isAuthorized(senderId) {
  // Check if user is in admin list
  if (birthdaySettings.adminNumbers.includes(senderId.split('@')[0])) {
    return true;
  }
  
  // Check owner/admin from environment
  const ownerNumber = process.env.OWNER_NUMBER || '';
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  
  if (senderId.split('@')[0] === ownerNumber || adminNumbers.includes(senderId.split('@')[0])) {
    return true;
  }
  
  return false;
}

// Get all birthdays from database
async function getAllBirthdays() {
  try {
    const birthdays = await db.collection(COLLECTIONS.BIRTHDAYS).find({}).toArray();
    const formattedBirthdays = {};
    
    birthdays.forEach(entry => {
      formattedBirthdays[entry.userId] = {
        userId: entry.userId,
        name: entry.name,
        birthday: entry.birthday
      };
    });
    
    return formattedBirthdays;
  } catch (error) {
    console.error('Error getting all birthdays:', error);
    return {};
  }
}

// Get birthday data for specific user
async function getBirthdayData(userId) {
  try {
    return await db.collection(COLLECTIONS.BIRTHDAYS).findOne({ userId });
  } catch (error) {
    console.error('Error getting birthday data:', error);
    return null;
  }
}

// Get today's birthdays
async function getTodaysBirthdays() {
  const today = moment.tz('Africa/Lagos');
  const todayKey = `${String(today.month() + 1).padStart(2, '0')}-${String(today.date()).padStart(2, '0')}`;
  
  try {
    const birthdays = await db.collection(COLLECTIONS.BIRTHDAYS)
      .find({ 'birthday.searchKey': todayKey })
      .toArray();
    
    return birthdays;
  } catch (error) {
    console.error('Error getting today\'s birthdays:', error);
    return [];
  }
}

// Get upcoming birthdays for reminders
async function getUpcomingBirthdays(daysAhead) {
  const targetDate = moment.tz('Africa/Lagos').add(daysAhead, 'days');
  const targetKey = `${String(targetDate.month() + 1).padStart(2, '0')}-${String(targetDate.date()).padStart(2, '0')}`;
  
  try {
    const birthdays = await db.collection(COLLECTIONS.BIRTHDAYS)
      .find({ 'birthday.searchKey': targetKey })
      .toArray();
    
    return birthdays;
  } catch (error) {
    console.error('Error getting upcoming birthdays:', error);
    return [];
  }
}

// Generate birthday wish message (without specific names - uses mentions)
function getBirthdayWishMessage(birthdayPerson) {
  const wishes = [
    `🎉🎂 HAPPY BIRTHDAY! 🎂🎉\n\nWishing you a day filled with happiness and a year filled with joy! 🎈✨`,
    
    `🎊 Happy Birthday to our amazing member! 🎊\n\nMay your special day be surrounded with happiness, filled with laughter, wrapped with pleasure and painted with fun! 🎨🎁`,
    
    `🌟 It's someone's Birthday! 🌟\n\n🎂 Another year older, another year wiser, another year more awesome! May all your dreams come true! ✨🎉`,
    
    `🎈 BIRTHDAY ALERT! 🎈\n\nIt's someone's special day! 🎂 Let's celebrate this wonderful person who brings joy to our group! 🎊🎉`,
    
    `🎵 Happy Birthday to you! 🎵\n🎵 Happy Birthday to you! 🎵\n🎵 Happy Birthday dear friend! 🎵\n🎵 Happy Birthday to you! 🎵\n\n🎂 Hope your day is as special as you are! 🌟`
  ];
  
  const randomWish = wishes[Math.floor(Math.random() * wishes.length)];
  
  let message = randomWish;
  
  // Add age if available
  if (birthdayPerson.birthday.age !== undefined) {
    message += `\n\n🎈 Celebrating ${birthdayPerson.birthday.age} wonderful years! 🎈`;
  }
  
  message += `\n\n💝 From your friends at GIST HQ! 💝`;
  
  return message;
}

// Generate reminder message (without specific names - uses mentions)
function getReminderMessage(birthdayPerson, daysUntil) {
  let message;
  
  if (daysUntil === 1) {
    message = `🎂 *BIRTHDAY REMINDER* 🎂\n\n📅 Tomorrow is someone's birthday!\n\n🎁 Don't forget to wish them well! 🎉`;
  } else {
    message = `🎂 *BIRTHDAY REMINDER* 🎂\n\n📅 Someone's birthday is in ${daysUntil} days!\n\n🗓️ Mark your calendar: ${birthdayPerson.birthday.displayDate} 🎉`;
  }
  
  if (birthdayPerson.birthday.age !== undefined) {
    const upcomingAge = birthdayPerson.birthday.age + 1;
    message += `\n\n🎈 They'll be turning ${upcomingAge}! 🎈`;
  }
  
  return message;
}

// Send birthday wishes
async function sendBirthdayWishes(sock) {
  if (!birthdaySettings.enableAutoWishes) {
    console.log('🎂 Auto wishes disabled, skipping...');
    return;
  }
  
  // Check connection first
  if (!isConnectionHealthy(sock)) {
    console.log('❌ Connection not healthy, skipping birthday wishes');
    return;
  }
  
  const todaysBirthdays = await getTodaysBirthdays();
  if (todaysBirthdays.length === 0) return;
  
  console.log(`🎂 Found ${todaysBirthdays.length} birthday(s) today!`);
  const today = moment.tz('Africa/Lagos').format('YYYY-MM-DD');
  
  for (const birthdayPerson of todaysBirthdays) {
    try {
      // Check if already wished today
      const existingWish = await db.collection(COLLECTIONS.BIRTHDAY_WISHES)
        .findOne({ userId: birthdayPerson.userId, date: today });
      
      if (existingWish) {
        console.log(`⏭️ Already wished ${birthdayPerson.name} today`);
        continue;
      }
      
      // Double-check connection before each person
      if (!isConnectionHealthy(sock)) {
        console.log('❌ Connection lost during birthday processing');
        break;
      }
      
      const wishMessage = getBirthdayWishMessage(birthdayPerson);
      let successfulSends = 0;
    
      // Send private wish to the birthday person
      if (birthdaySettings.enablePrivateReminders) {
        try {
          const privateMsg = `🎉 *HAPPY BIRTHDAY ${birthdayPerson.name}!* 🎉\n\nToday is your special day! 🎂\n\nWishing you all the happiness in the world! ✨🎈`;
          
          await safeSend(sock, birthdayPerson.userId, { text: privateMsg });
          successfulSends++;
          console.log(`✅ Sent private wish to ${birthdayPerson.name}`);
          
          // Wait between messages
          await new Promise(resolve => setTimeout(resolve, 5000));
          
        } catch (error) {
          console.error(`❌ Private wish failed for ${birthdayPerson.name}:`, error.message);
        }
      }
      
      // Send to configured groups
      if (birthdaySettings.enableGroupReminders && birthdaySettings.reminderGroups.length > 0) {
        for (const groupId of birthdaySettings.reminderGroups) {
          try {
            if (!isConnectionHealthy(sock)) break;
            
            await safeSend(sock, groupId, {
              text: wishMessage,
              mentions: [birthdayPerson.userId]
            });
            
            successfulSends++;
            console.log(`✅ Sent group wish to ${groupId.split('@')[0]} for ${birthdayPerson.name}`);
            
            // Longer wait between groups
            await new Promise(resolve => setTimeout(resolve, 8000));
            
          } catch (error) {
            console.error(`❌ Group wish failed for ${groupId.split('@')[0]}:`, error.message);
          }
        }
      }
      
      // Mark as sent if at least one succeeded (to avoid duplicate wishes)
      if (successfulSends > 0) {
        await db.collection(COLLECTIONS.BIRTHDAY_WISHES).insertOne({
          userId: birthdayPerson.userId,
          name: birthdayPerson.name,
          date: today,
          timestamp: new Date(),
          successfulSends
        });
        
        console.log(`✅ Birthday completed for ${birthdayPerson.name} (${successfulSends} sent)`);
      }
      
      // Wait between different people
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (error) {
      console.error(`💥 Error processing ${birthdayPerson.name}:`, error.message);
    }
  }
}

// Send birthday reminders
async function sendBirthdayReminders(sock) {
  if (!birthdaySettings.enableReminders) {
    return;
  }
  
  const today = moment.tz('Africa/Lagos').format('YYYY-MM-DD');
  
  for (const daysAhead of birthdaySettings.reminderDays) {
    const upcomingBirthdays = await getUpcomingBirthdays(daysAhead);
    
    if (upcomingBirthdays.length === 0) continue;
    
    console.log(`📅 Found ${upcomingBirthdays.length} birthday(s) in ${daysAhead} days`);
    
    for (const birthdayPerson of upcomingBirthdays) {
      const reminderKey = `${today}-${birthdayPerson.userId}-${daysAhead}`;
      
      try {
        // Skip if reminder already sent today for this person and days ahead
        const existingReminder = await db.collection(COLLECTIONS.BIRTHDAY_REMINDERS)
          .findOne({ reminderKey });
        
        if (existingReminder) {
          continue;
        }
        
        const reminderMessage = getReminderMessage(birthdayPerson, daysAhead);
        
        // Send to configured groups
        if (birthdaySettings.enableGroupReminders && birthdaySettings.reminderGroups.length > 0) {
          for (const groupId of birthdaySettings.reminderGroups) {
            try {
              await sock.sendMessage(groupId, {
                text: reminderMessage,
                mentions: [birthdayPerson.userId]
              });
              
              console.log(`✅ Sent ${daysAhead}-day reminder to group ${groupId} for ${birthdayPerson.name}`);
            } catch (error) {
              console.error(`Error sending reminder to group ${groupId}:`, error);
            }
          }
        }
        
        // Mark reminder as sent
        await db.collection(COLLECTIONS.BIRTHDAY_REMINDERS).insertOne({
          reminderKey,
          userId: birthdayPerson.userId,
          daysAhead,
          date: today,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error(`Error sending birthday reminder for ${birthdayPerson.name}:`, error);
      }
    }
  }
}

// Clean up old reminder records (keep only last 30 days)
async function cleanupReminderRecords() {
  try {
    const cutoffDate = moment.tz('Africa/Lagos').subtract(30, 'days').toDate();
    
    // Clean up old wishes
    await db.collection(COLLECTIONS.BIRTHDAY_WISHES).deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    // Clean up old reminders
    await db.collection(COLLECTIONS.BIRTHDAY_REMINDERS).deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    console.log('✅ Birthday records cleanup completed');
  } catch (error) {
    console.error('Error cleaning up reminder records:', error);
  }
}

// Birthday scheduler class
class BirthdayScheduler {
  constructor(sock) {
    this.sock = sock;
    this.intervals = [];
    this.running = false;
  }
  
  start() {
    if (this.running) return;
    this.running = true;
    
    console.log('🎂 Birthday scheduler started');
    
    // Check for birthdays every minute
    const birthdayInterval = setInterval(async () => {
      const now = moment.tz('Africa/Lagos');
      
      // Send birthday wishes at the specified time
      if (now.format('HH:mm') === birthdaySettings.wishTime) {
        await sendBirthdayWishes(this.sock);
      }
      
      // Send reminders at the specified time
      if (now.format('HH:mm') === birthdaySettings.reminderTime) {
        await sendBirthdayReminders(this.sock);
      }
      
      // Clean up old records once a day at midnight
      if (now.format('HH:mm') === '00:00') {
        await cleanupReminderRecords();
      }
      
    }, 60000); // Check every minute
    
    this.intervals.push(birthdayInterval);
    
    // Also check immediately on start
    setTimeout(async () => {
      const now = moment.tz('Africa/Lagos');
      if (now.format('HH:mm') === birthdaySettings.wishTime) {
        await sendBirthdayWishes(this.sock);
      }
      if (now.format('HH:mm') === birthdaySettings.reminderTime) {
        await sendBirthdayReminders(this.sock);
      }
    }, 5000);
  }
  
  stop() {
    this.running = false;
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    console.log('🎂 Birthday scheduler stopped');
  }
  
  restart() {
    this.stop();
    setTimeout(() => this.start(), 1000);
  }
}

// Global scheduler instance
let birthdayScheduler = null;

// Initialize scheduler
function initializeBirthdayScheduler(sock) {
  if (birthdayScheduler) {
    birthdayScheduler.stop();
  }
  
  birthdayScheduler = new BirthdayScheduler(sock);
  birthdayScheduler.start();
  
  return birthdayScheduler;
}

// Main plugin handler function
export default async function birthdayHandler(m, sock, config) {
  try {
    // Initialize database connection
    if (!db) {
      await initDatabase();
      await loadSettings();
      
      // Initialize scheduler if not already running
      if (!birthdayScheduler) {
        initializeBirthdayScheduler(sock);
      }
    }
    
    // Handle commands
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    
    // Helper function for sending replies
    const reply = async (text) => {
      await sock.sendMessage(from, { text }, { quoted: m });
    };
    
    // Handle different commands
    switch (command) {
      case 'birthday':
      case 'bday':
      case 'birthdays':
        if (args.length === 1) {
          await showBirthdayMenu(reply, config.PREFIX);
        } else {
          await handleSubCommand(args[1], args.slice(2), { m, sock, config, senderId, from, reply });
        }
        break;
        
      case 'mybirthday':
      case 'mybday':
        await handleMyBirthday({ m, sock, config, senderId, from, reply });
        break;
    }
  } catch (error) {
    console.error('❌ Birthday plugin error:', error);
  }
}

// Handle subcommands for the main birthday command
async function handleSubCommand(subCommand, args, context) {
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
    case 'test':
      await handleTest(context, args);
      break;
    case 'groups':
      await handleGroups(context, args);
      break;
    case 'help':
      await showBirthdayMenu(context.reply, context.config.PREFIX);
      break;
    default:
      await context.reply(`❓ Unknown birthday command: *${subCommand}*\n\nUse *${context.config.PREFIX}birthday help* to see available commands.`);
  }
}

// Show birthday menu
async function showBirthdayMenu(reply, prefix) {
  const menuText = `🎂 *BIRTHDAY SYSTEM* 🎂\n\n` +
                  `📅 *View Commands:*\n` +
                  `• *today* - Today's birthdays\n` +
                  `• *upcoming [days]* - Upcoming birthdays (default: 7 days)\n` +
                  `• *thismonth* - This month's birthdays\n` +
                  `• *all* - All recorded birthdays\n\n` +
                  `👑 *Admin Commands:*\n` +
                  `• *settings* - View/modify settings\n` +
                  `• *groups* - Manage reminder groups\n` +
                  `• *test* - Test birthday functions\n\n` +
                  `🤖 *Features:*\n` +
                  `• Automatic birthday wishes at midnight\n` +
                  `• Configurable reminders (7, 3, 1 days before)\n` +
                  `• Group and private notifications\n\n` +
                  `💡 *Usage:* ${prefix}birthday [command]`;
  
  await reply(menuText);
}

// Handle today's birthdays
async function handleToday(context) {
  const { sock, m } = context;
  
  const todaysBirthdays = await getTodaysBirthdays();
  
  if (todaysBirthdays.length === 0) {
    await sock.sendMessage(m.key.remoteJid, {
      text: `🎂 *No birthdays today*\n\n📅 Check upcoming birthdays with *${context.config.PREFIX}birthday upcoming*`
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
  
  await sock.sendMessage(m.key.remoteJid, {
    text: message,
    mentions: mentions
  });
}

// Handle upcoming birthdays
async function handleUpcoming(context, args) {
  const { sock, m } = context;
  
  const days = args.length > 0 ? parseInt(args[0]) : 7;
  if (isNaN(days) || days < 1 || days > 365) {
    await sock.sendMessage(m.key.remoteJid, {
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
    await sock.sendMessage(m.key.remoteJid, {
      text: `📅 *No birthdays in the next ${days} days*\n\nTry checking a longer period or use *${context.config.PREFIX}birthday thismonth*`
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
  
  await sock.sendMessage(m.key.remoteJid, {
    text: message,
    mentions: mentions
  });
}

// Handle this month's birthdays
async function handleThisMonth(context) {
  const { sock, m } = context;
  
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
    await sock.sendMessage(m.key.remoteJid, {
      text: `📅 *No birthdays in ${monthName}*\n\nUse *${context.config.PREFIX}birthday all* to see all recorded birthdays`
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
  
  await sock.sendMessage(m.key.remoteJid, {
    text: message,
    mentions: mentions
  });
}

// Handle all birthdays (admin only)
async function handleAll(context) {
  const { sock, m, senderId } = context;
  
  if (!isAuthorized(senderId)) {
    await sock.sendMessage(m.key.remoteJid, {
      text: '🚫 Only admins can view all birthdays.'
    });
    return;
  }
  
  const allBirthdays = await getAllBirthdays();
  const birthdayEntries = Object.values(allBirthdays);
  
  if (birthdayEntries.length === 0) {
    await sock.sendMessage(m.key.remoteJid, {
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
  
  await sock.sendMessage(m.key.remoteJid, {
    text: message,
    mentions: mentions
  });
}

// Handle my birthday command
async function handleMyBirthday(context) {
  const { reply, senderId } = context;
  
  try {
    const birthdayData = await getBirthdayData(senderId);
    
    if (!birthdayData) {
      await reply(`🎂 *No Birthday Recorded*\n\nYour birthday hasn't been saved yet. It will be automatically saved when you submit your next attendance form with a valid D.O.B field.\n\n💡 *Make sure to fill your D.O.B correctly in the attendance form!*`);
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
    
    await reply(message);
  } catch (error) {
    await reply('❌ *Error loading birthday information. Please try again.*');
    console.error('My birthday error:', error);
  }
}

// Handle settings command (admin only)
async function handleSettings(context, args) {
  const { reply, senderId } = context;
  
  if (!isAuthorized(senderId)) {
    await reply('🚫 Only admins can modify birthday settings.');
    return;
  }
  
  if (args.length === 0) {
    await showSettings(reply);
    return;
  }
  
  const setting = args[0].toLowerCase();
  const value = args.slice(1).join(' ');
  
  switch (setting) {
    case 'reminders':
      await toggleReminders(reply, value, context);
      break;
    case 'wishes':
      await toggleWishes(reply, value, context);
      break;
    case 'remindertime':
      await setReminderTime(reply, value, context);
      break;
    case 'wishtime':
      await setWishTime(reply, value, context);
      break;
    case 'reminderdays':
      await setReminderDays(reply, value, context);
      break;
    case 'groupreminders':
      await toggleGroupReminders(reply, value, context);
      break;
    case 'privatereminders':
      await togglePrivateReminders(reply, value, context);
      break;
    case 'addadmin':
      await addAdmin(reply, value, context);
      break;
    case 'removeadmin':
      await removeAdmin(reply, value, context);
      break;
    case 'reload':
      await reloadSettings(reply, context);
      break;
    default:
      await reply(`❓ Unknown setting: *${setting}*\n\nUse *${context.config.PREFIX}birthday settings* to see available options.`);
  }
}

// Show settings
async function showSettings(reply) {
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
  
  await reply(message);
}

// Settings helper functions
async function toggleReminders(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please specify: *on* or *off*\n\nExample: *${context.config.PREFIX}birthday settings reminders on*`);
    return;
  }
  
  const enable = value.toLowerCase() === 'on';
  birthdaySettings.enableReminders = enable;
  await saveSettings();
  
  if (birthdayScheduler) {
    birthdayScheduler.restart();
  }
  
  await reply(`✅ Birthday reminders ${enable ? 'enabled' : 'disabled'} successfully!`);
}

async function toggleWishes(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please specify: *on* or *off*\n\nExample: *${context.config.PREFIX}birthday settings wishes on*`);
    return;
  }
  
  const enable = value.toLowerCase() === 'on';
  birthdaySettings.enableAutoWishes = enable;
  await saveSettings();
  
  if (birthdayScheduler) {
    birthdayScheduler.restart();
  }
  
  await reply(`✅ Auto birthday wishes ${enable ? 'enabled' : 'disabled'} successfully!`);
}

async function setReminderTime(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please specify time in HH:MM format\n\nExample: *${context.config.PREFIX}birthday settings remindertime 09:00*`);
    return;
  }
  
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(value)) {
    await reply('⚠️ Invalid time format. Please use HH:MM (24-hour format)\n\nExample: 09:00, 14:30, 23:45');
    return;
  }
  
  birthdaySettings.reminderTime = value;
  await saveSettings();
  
  if (birthdayScheduler) {
    birthdayScheduler.restart();
  }
  
  await reply(`✅ Reminder time set to *${value}* successfully!`);
}

async function setWishTime(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please specify time in HH:MM format\n\nExample: *${context.config.PREFIX}birthday settings wishtime 00:01*`);
    return;
  }
  
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(value)) {
    await reply('⚠️ Invalid time format. Please use HH:MM (24-hour format)\n\nExample: 00:01, 12:00, 23:59');
    return;
  }
  
  birthdaySettings.wishTime = value;
  await saveSettings();
  
  if (birthdayScheduler) {
    birthdayScheduler.restart();
  }
  
  await reply(`✅ Birthday wish time set to *${value}* successfully!`);
}

async function setReminderDays(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please specify days separated by commas\n\nExample: *${context.config.PREFIX}birthday settings reminderdays 7,3,1*`);
    return;
  }
  
  const daysStr = value.split(',').map(d => d.trim());
  const days = [];
  
  for (const dayStr of daysStr) {
    const day = parseInt(dayStr);
    if (isNaN(day) || day < 1 || day > 365) {
      await reply(`⚠️ Invalid day: *${dayStr}*. Days must be between 1 and 365.`);
      return;
    }
    days.push(day);
  }
  
  // Sort days in descending order
  days.sort((a, b) => b - a);
  
  birthdaySettings.reminderDays = days;
  await saveSettings();
  
  if (birthdayScheduler) {
    birthdayScheduler.restart();
  }
  
  await reply(`✅ Reminder days set to *${days.join(', ')}* days before birthday!`);
}

async function toggleGroupReminders(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please specify: *on* or *off*\n\nExample: *${context.config.PREFIX}birthday settings groupreminders on*`);
    return;
  }
  
  const enable = value.toLowerCase() === 'on';
  birthdaySettings.enableGroupReminders = enable;
  await saveSettings();
  
  await reply(`✅ Group reminders ${enable ? 'enabled' : 'disabled'} successfully!`);
}

async function togglePrivateReminders(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please specify: *on* or *off*\n\nExample: *${context.config.PREFIX}birthday settings privatereminders on*`);
    return;
  }
  
  const enable = value.toLowerCase() === 'on';
  birthdaySettings.enablePrivateReminders = enable;
  await saveSettings();
  
  await reply(`✅ Private reminders ${enable ? 'enabled' : 'disabled'} successfully!`);
}

async function addAdmin(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please mention a user to add as admin\n\nExample: *${context.config.PREFIX}birthday settings addadmin @user*`);
    return;
  }
  
  // Extract phone number from mention or direct input
  let phoneNumber = value.replace('@', '').replace(/\s+/g, '');
  if (!phoneNumber.includes('@s.whatsapp.net')) {
    phoneNumber += '@s.whatsapp.net';
  }
  
  if (birthdaySettings.adminNumbers.includes(phoneNumber)) {
    await reply('⚠️ User is already a birthday admin.');
    return;
  }
  
  birthdaySettings.adminNumbers.push(phoneNumber);
  await saveSettings();
  
  await reply(`✅ Added ${phoneNumber.split('@')[0]} as birthday admin!`);
}

async function removeAdmin(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please mention a user to remove from admins\n\nExample: *${context.config.PREFIX}birthday settings removeadmin @user*`);
    return;
  }
  
  // Extract phone number from mention or direct input
  let phoneNumber = value.replace('@', '').replace(/\s+/g, '');
  if (!phoneNumber.includes('@s.whatsapp.net')) {
    phoneNumber += '@s.whatsapp.net';
  }
  
  const index = birthdaySettings.adminNumbers.indexOf(phoneNumber);
  if (index === -1) {
    await reply('⚠️ User is not a birthday admin.');
    return;
  }
  
  birthdaySettings.adminNumbers.splice(index, 1);
  await saveSettings();
  
  await reply(`✅ Removed ${phoneNumber.split('@')[0]} from birthday admins!`);
}

async function reloadSettings(reply, context) {
  try {
    await loadSettings();
    
    if (birthdayScheduler) {
      birthdayScheduler.restart();
    }
    
    await reply('✅ Birthday settings reloaded successfully!');
  } catch (error) {
    console.error('Error reloading settings:', error);
    await reply('❌ Error reloading settings. Check logs for details.');
  }
}

// Handle test command (admin only)
async function handleTest(context, args) {
  const { reply, senderId, sock } = context;
  
  if (!isAuthorized(senderId)) {
    await reply('🚫 Only admins can run birthday tests.');
    return;
  }
  
  if (args.length === 0) {
    await reply(`🧪 *BIRTHDAY TEST COMMANDS*\n\n` +
               `• *wish* - Test birthday wish message\n` +
               `• *reminder* - Test reminder message\n` +
               `• *scheduler* - Test scheduler status\n` +
               `• *today* - Force check today's birthdays\n` +
               `• *cleanup* - Test cleanup function\n\n` +
               `Usage: *${context.config.PREFIX}birthday test [command]*`);
    return;
  }
  
  const testType = args[0].toLowerCase();
  
  switch (testType) {
    case 'wish':
      await testWish(reply);
      break;
    case 'reminder':
      await testReminder(reply);
      break;
    case 'scheduler':
      await testScheduler(reply);
      break;
    case 'today':
      await testTodayBirthdays(reply, sock);
      break;
    case 'cleanup':
      await testCleanup(reply);
      break;
    default:
      await reply(`❓ Unknown test: *${testType}*\n\nUse *${context.config.PREFIX}birthday test* to see available tests.`);
  }
}

// Test functions
async function testWish(reply) {
  const testPerson = {
    name: 'Test User',
    userId: '1234567890@s.whatsapp.net',
    birthday: {
      age: 25,
      displayDate: 'January 1',
      monthName: 'January',
      day: 1,
      month: 1
    }
  };
  
  const wishMessage = getBirthdayWishMessage(testPerson);
  
  await reply(`🧪 *BIRTHDAY WISH TEST*\n\n${wishMessage}`);
}

async function testReminder(reply) {
  const testPerson = {
    name: 'Test User',
    birthday: {
      age: 25,
      displayDate: 'January 1',
      monthName: 'January',
      day: 1,
      month: 1
    }
  };
  
  const reminderMessage = getReminderMessage(testPerson, 3);
  
  await reply(`🧪 *BIRTHDAY REMINDER TEST*\n\n${reminderMessage}`);
}

async function testScheduler(reply) {
  const status = birthdayScheduler ? 
    (birthdayScheduler.running ? '✅ Running' : '❌ Stopped') : 
    '❌ Not initialized';
  
  const now = moment.tz('Africa/Lagos');
  
  await reply(`🧪 *SCHEDULER STATUS TEST*\n\n` +
             `Status: ${status}\n` +
             `Current Time: ${now.format('YYYY-MM-DD HH:mm:ss')}\n` +
             `Wish Time: ${birthdaySettings.wishTime}\n` +
             `Reminder Time: ${birthdaySettings.reminderTime}\n` +
             `Intervals: ${birthdayScheduler ? birthdayScheduler.intervals.length : 0}`);
}

async function testTodayBirthdays(reply, sock) {
  await reply('🧪 *Testing today\'s birthdays...*');
  
  try {
    await sendBirthdayWishes(sock);
    await reply('✅ Birthday wish test completed. Check logs for details.');
  } catch (error) {
    console.error('Test birthday wishes error:', error);
    await reply(`❌ Test failed: ${error.message}`);
  }
}

async function testCleanup(reply) {
  await reply('🧪 *Testing cleanup function...*');
  
  try {
    await cleanupReminderRecords();
    await reply('✅ Cleanup test completed successfully!');
  } catch (error) {
    console.error('Test cleanup error:', error);
    await reply(`❌ Cleanup test failed: ${error.message}`);
  }
}

// Add to your handleTest function
  await testConnection(reply, sock);
  break;

async function testConnection(reply, sock) {
  try {
    const isHealthy = isConnectionHealthy(sock);
    const userInfo = sock.user ? `${sock.user.name} (${sock.user.id})` : 'Not available';
    const wsState = sock.ws ? sock.ws.readyState : 'N/A';
    
    const testMessage = `🔍 **CONNECTION TEST**\n\n` +
                       `✅ **Healthy:** ${isHealthy ? 'YES' : 'NO'}\n` +
                       `👤 **User:** ${userInfo}\n` +
                       `🌐 **WebSocket:** ${wsState} (1=OPEN)\n` +
                       `⏰ **Time:** ${new Date().toLocaleString()}\n\n` +
                       `${isHealthy ? '🎉 Connection is ready!' : '⚠️ Connection issues detected!'}`;
    
    await reply(testMessage);
    
    if (isHealthy) {
      // Test actual message sending
      await new Promise(resolve => setTimeout(resolve, 2000));
      await reply('📤 Test message sent successfully!');
    }
    
  } catch (error) {
    await reply(`❌ Connection test failed: ${error.message}`);
  }
}

// Handle groups command (admin only)
async function handleGroups(context, args) {
  const { reply, senderId, m } = context;
  
  if (!isAuthorized(senderId)) {
    await reply('🚫 Only admins can manage birthday groups.');
    return;
  }
  
  if (args.length === 0) {
    await showGroups(reply, context);
    return;
  }
  
  const action = args[0].toLowerCase();
  
  switch (action) {
    case 'add':
      await addGroup(reply, m, context);
      break;
    case 'remove':
      await removeGroup(reply, args[1], context);
      break;
    case 'list':
      await showGroups(reply, context);
      break;
    case 'clear':
      await clearGroups(reply, context);
      break;
    default:
      await reply(`❓ Unknown group action: *${action}*\n\nUse *${context.config.PREFIX}birthday groups* to see available actions.`);
  }
}

// Group management functions
async function showGroups(reply, context) {
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
  
  await reply(message);
}

async function addGroup(reply, message, context) {
  const groupId = message.key.remoteJid;
  
  if (!groupId.includes('@g.us')) {
    await reply('⚠️ This command can only be used in groups.');
    return;
  }
  
  if (birthdaySettings.reminderGroups.includes(groupId)) {
    await reply('⚠️ This group is already configured for birthday reminders.');
    return;
  }
  
  birthdaySettings.reminderGroups.push(groupId);
  await saveSettings();
  
  const shortId = groupId.split('@')[0];
  await reply(`✅ Group *${shortId}* added for birthday reminders!\n\n🎂 This group will now receive birthday wishes and reminders.`);
}

async function removeGroup(reply, groupIdArg, context) {
  if (!groupIdArg) {
    await reply(`⚠️ Please specify a group ID\n\nExample: *${context.config.PREFIX}birthday groups remove 1234567890*`);
    return;
  }
  
  // Find group by partial ID
  const targetGroup = birthdaySettings.reminderGroups.find(id => 
    id.includes(groupIdArg) || id.split('@')[0] === groupIdArg
  );
  
  if (!targetGroup) {
    await reply(`⚠️ Group not found: *${groupIdArg}*\n\nUse *${context.config.PREFIX}birthday groups list* to see configured groups.`);
    return;
  }
  
  const index = birthdaySettings.reminderGroups.indexOf(targetGroup);
  birthdaySettings.reminderGroups.splice(index, 1);
  await saveSettings();
  
  const shortId = targetGroup.split('@')[0];
  await reply(`✅ Group *${shortId}* removed from birthday reminders!`);
}

async function clearGroups(reply, context) {
  const groupCount = birthdaySettings.reminderGroups.length;
  
  if (groupCount === 0) {
    await reply('📝 No groups are currently configured for birthday reminders.');
    return;
  }
  
  birthdaySettings.reminderGroups = [];
  await saveSettings();
  
  await reply(`✅ Cleared all ${groupCount} group(s) from birthday reminders!`);
}

// Export functions for use by other plugins
export { 
  getAllBirthdays, 
  getBirthdayData,
  getTodaysBirthdays,
  getUpcomingBirthdays,
  birthdaySettings,
  initializeBirthdayScheduler,
  sendBirthdayWishes,
  sendBirthdayReminders
};
