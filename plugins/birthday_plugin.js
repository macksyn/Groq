// plugins/birthday.js - Birthday plugin with improved connection handling
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';

// Plugin information export
export const info = {
  name: 'Birthday System',
  version: '2.1.0',
  author: 'Bot Developer',
  description: 'Advanced birthday system with automatic reminders, wishes, and improved connection handling',
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
  adminNumbers: [],
  maxRetries: 3, // Max retries for failed messages
  retryDelay: 5000 // Delay between retries (ms)
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

// Check if socket connection is ready
function isSocketReady(sock) {
  if (!sock) {
    console.log('❌ Socket is null or undefined');
    return false;
  }
  
  // Check if socket has readyState property and it's open
  if (sock.ws && sock.ws.readyState !== 1) {
    console.log(`❌ WebSocket not ready, readyState: ${sock.ws.readyState}`);
    return false;
  }
  
  // Check if socket is connected (Baileys specific)
  if (sock.authState && sock.authState.creds && !sock.authState.creds.me) {
    console.log('❌ Socket not authenticated');
    return false;
  }
  
  return true;
}

// Safe message sender with retry logic
async function safeMessageSend(sock, jid, message, options = {}) {
  const maxRetries = birthdaySettings.maxRetries || 3;
  const retryDelay = birthdaySettings.retryDelay || 5000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Check if socket is ready before sending
      if (!isSocketReady(sock)) {
        console.log(`⚠️ Socket not ready, attempt ${attempt}/${maxRetries}`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        throw new Error('Socket connection not ready after all retries');
      }
      
      // Add a small delay to prevent rate limiting
      if (attempt > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const result = await sock.sendMessage(jid, message, options);
      console.log(`✅ Message sent successfully to ${jid.split('@')[0]} on attempt ${attempt}`);
      return result;
      
    } catch (error) {
      console.log(`❌ Message send attempt ${attempt}/${maxRetries} failed to ${jid.split('@')[0]}: ${error.message}`);
      
      if (attempt === maxRetries) {
        // Final attempt failed, log and throw
        console.error(`💥 All ${maxRetries} attempts failed for ${jid.split('@')[0]}:`, error.message);
        throw error;
      }
      
      // Wait before retrying
      console.log(`⏳ Waiting ${retryDelay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // If connection is closed, try to wait a bit longer
      if (error.message.includes('Connection Closed')) {
        console.log('🔄 Connection closed detected, waiting extra time...');
        await new Promise(resolve => setTimeout(resolve, retryDelay * 2));
      }
    }
  }
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

// Send birthday wishes with improved error handling
async function sendBirthdayWishes(sock) {
  if (!birthdaySettings.enableAutoWishes) {
    console.log('🎂 Auto wishes disabled, skipping...');
    return;
  }
  
  if (!isSocketReady(sock)) {
    console.log('❌ Socket not ready for birthday wishes, skipping...');
    return;
  }
  
  const todaysBirthdays = await getTodaysBirthdays();
  
  if (todaysBirthdays.length === 0) {
    console.log('🎂 No birthdays today');
    return;
  }
  
  console.log(`🎂 Found ${todaysBirthdays.length} birthday(s) today!`);
  
  // Check if wishes were already sent today to avoid duplicates
  const today = moment.tz('Africa/Lagos').format('YYYY-MM-DD');
  
  for (const birthdayPerson of todaysBirthdays) {
    try {
      // Check if wish already sent today
      const existingWish = await db.collection(COLLECTIONS.BIRTHDAY_WISHES)
        .findOne({ userId: birthdayPerson.userId, date: today });
      
      if (existingWish) {
        console.log(`⏭️ Birthday wish already sent today for ${birthdayPerson.name}`);
        continue;
      }
      
      const wishMessage = getBirthdayWishMessage(birthdayPerson);
      let successfulSends = 0;
      let totalAttempts = 0;
      
      // Send private wish to the birthday person
      if (birthdaySettings.enablePrivateReminders) {
        totalAttempts++;
        try {
          const privateMessage = `🎉 *HAPPY BIRTHDAY ${birthdayPerson.name}!* 🎉\n\nToday is your special day! 🎂\n\nWishing you all the happiness in the world! ✨🎈\n\nEnjoy your celebration! 🎊`;
          
          await safeMessageSend(sock, birthdayPerson.userId, {
            text: privateMessage
          });
          
          successfulSends++;
          console.log(`✅ Sent private birthday wish to ${birthdayPerson.name}`);
          
          // Small delay between messages
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`❌ Failed to send private birthday wish to ${birthdayPerson.name}:`, error.message);
        }
      }
      
      // Send to configured groups
      if (birthdaySettings.enableGroupReminders && birthdaySettings.reminderGroups.length > 0) {
        for (const groupId of birthdaySettings.reminderGroups) {
          totalAttempts++;
          try {
            await safeMessageSend(sock, groupId, {
              text: wishMessage,
              mentions: [birthdayPerson.userId]
            });
            
            successfulSends++;
            console.log(`✅ Sent birthday wish to group ${groupId.split('@')[0]} for ${birthdayPerson.name}`);
            
            // Small delay between group messages
            await new Promise(resolve => setTimeout(resolve, 3000));
            
          } catch (error) {
            console.error(`❌ Failed to send birthday wish to group ${groupId.split('@')[0]}:`, error.message);
          }
        }
      }
      
      // Mark as wished for today if at least one message was successful
      if (successfulSends > 0) {
        await db.collection(COLLECTIONS.BIRTHDAY_WISHES).insertOne({
          userId: birthdayPerson.userId,
          name: birthdayPerson.name,
          date: today,
          timestamp: new Date(),
          successfulSends: successfulSends,
          totalAttempts: totalAttempts
        });
        
        console.log(`✅ Birthday wishes completed for ${birthdayPerson.name} (${successfulSends}/${totalAttempts} successful)`);
      } else {
        console.error(`❌ All birthday wishes failed for ${birthdayPerson.name}`);
      }
      
    } catch (error) {
      console.error(`💥 Unexpected error processing birthday for ${birthdayPerson.name}:`, error);
    }
  }
}

// Send birthday reminders with improved error handling
async function sendBirthdayReminders(sock) {
  if (!birthdaySettings.enableReminders) {
    console.log('🎂 Reminders disabled, skipping...');
    return;
  }
  
  if (!isSocketReady(sock)) {
    console.log('❌ Socket not ready for reminders, skipping...');
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
          console.log(`⏭️ Reminder already sent for ${birthdayPerson.name} (${daysAhead} days)`);
          continue;
        }
        
        const reminderMessage = getReminderMessage(birthdayPerson, daysAhead);
        let successfulSends = 0;
        let totalAttempts = 0;
        
        // Send to configured groups
        if (birthdaySettings.enableGroupReminders && birthdaySettings.reminderGroups.length > 0) {
          for (const groupId of birthdaySettings.reminderGroups) {
            totalAttempts++;
            try {
              await safeMessageSend(sock, groupId, {
                text: reminderMessage,
                mentions: [birthdayPerson.userId]
              });
              
              successfulSends++;
              console.log(`✅ Sent ${daysAhead}-day reminder to group ${groupId.split('@')[0]} for ${birthdayPerson.name}`);
              
              // Small delay between group messages
              await new Promise(resolve => setTimeout(resolve, 3000));
              
            } catch (error) {
              console.error(`❌ Failed to send reminder to group ${groupId.split('@')[0]}:`, error.message);
            }
          }
        }
        
        // Mark reminder as sent if at least one was successful
        if (successfulSends > 0) {
          await db.collection(COLLECTIONS.BIRTHDAY_REMINDERS).insertOne({
            reminderKey,
            userId: birthdayPerson.userId,
            name: birthdayPerson.name,
            daysAhead,
            date: today,
            timestamp: new Date(),
            successfulSends: successfulSends,
            totalAttempts: totalAttempts
          });
          
          console.log(`✅ Reminders completed for ${birthdayPerson.name} (${successfulSends}/${totalAttempts} successful)`);
        } else {
          console.error(`❌ All reminders failed for ${birthdayPerson.name}`);
        }
        
      } catch (error) {
        console.error(`💥 Unexpected error sending birthday reminder for ${birthdayPerson.name}:`, error);
      }
    }
  }
}

// Clean up old reminder records (keep only last 30 days)
async function cleanupReminderRecords() {
  try {
    const cutoffDate = moment.tz('Africa/Lagos').subtract(30, 'days').toDate();
    
    // Clean up old wishes
    const wishResult = await db.collection(COLLECTIONS.BIRTHDAY_WISHES).deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    // Clean up old reminders
    const reminderResult = await db.collection(COLLECTIONS.BIRTHDAY_REMINDERS).deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    console.log(`✅ Birthday cleanup: ${wishResult.deletedCount} wishes, ${reminderResult.deletedCount} reminders`);
  } catch (error) {
    console.error('Error cleaning up reminder records:', error);
  }
}

// Birthday scheduler class with improved error handling
class BirthdayScheduler {
  constructor(sock) {
    this.sock = sock;
    this.intervals = [];
    this.running = false;
    this.lastWishCheck = null;
    this.lastReminderCheck = null;
  }
  
  start() {
    if (this.running) return;
    this.running = true;
    
    console.log('🎂 Birthday scheduler started');
    
    // Check for birthdays every minute
    const birthdayInterval = setInterval(async () => {
      try {
        const now = moment.tz('Africa/Lagos');
        const currentTime = now.format('HH:mm');
        
        // Send birthday wishes at the specified time (only once per day)
        if (currentTime === birthdaySettings.wishTime) {
          const today = now.format('YYYY-MM-DD');
          if (this.lastWishCheck !== today) {
            console.log('🎂 Birthday wish time reached, checking for birthdays...');
            await sendBirthdayWishes(this.sock);
            this.lastWishCheck = today;
          }
        }
        
        // Send reminders at the specified time (only once per day)
        if (currentTime === birthdaySettings.reminderTime) {
          const today = now.format('YYYY-MM-DD');
          if (this.lastReminderCheck !== today) {
            console.log('📅 Reminder time reached, checking for upcoming birthdays...');
            await sendBirthdayReminders(this.sock);
            this.lastReminderCheck = today;
          }
        }
        
        // Clean up old records once a day at midnight
        if (currentTime === '00:00') {
          console.log('🧹 Midnight cleanup time...');
          await cleanupReminderRecords();
        }
        
      } catch (error) {
        console.error('❌ Birthday scheduler error:', error);
      }
    }, 60000); // Check every minute
    
    this.intervals.push(birthdayInterval);
    
    // Initial check after 5 seconds
    setTimeout(async () => {
      try {
        const now = moment.tz('Africa/Lagos');
        const currentTime = now.format('HH:mm');
        const today = now.format('YYYY-MM-DD');
        
        console.log(`🎂 Initial birthday check at ${currentTime}`);
        
        if (currentTime === birthdaySettings.wishTime && this.lastWishCheck !== today) {
          await sendBirthdayWishes(this.sock);
          this.lastWishCheck = today;
        }
        if (currentTime === birthdaySettings.reminderTime && this.lastReminderCheck !== today) {
          await sendBirthdayReminders(this.sock);
          this.lastReminderCheck = today;
        }
      } catch (error) {
        console.error('❌ Initial birthday check error:', error);
      }
    }, 5000);
  }
  
  stop() {
    this.running = false;
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    this.lastWishCheck = null;
    this.lastReminderCheck = null;
    console.log('🎂 Birthday scheduler stopped');
  }
  
  restart() {
    console.log('🎂 Restarting birthday scheduler...');
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

// [REST OF THE CODE REMAINS THE SAME - Main plugin handler function and all other functions]
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
      await safeMessageSend(sock, from, { text }, { quoted: m });
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

// [INCLUDE ALL OTHER FUNCTIONS FROM THE ORIGINAL CODE HERE - they remain the same]

// Export functions for use by other plugins
export { 
  getAllBirthdays, 
  getBirthdayData,
  getTodaysBirthdays,
  getUpcomingBirthdays,
  birthdaySettings,
  initializeBirthdayScheduler,
  sendBirthdayWishes,
  sendBirthdayReminders,
  safeMessageSend,
  isSocketReady
};
