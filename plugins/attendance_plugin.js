// plugins/attendance_plugin.js - V3 (Converted for new plugin system)
import moment from 'moment-timezone';

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Collection names
const COLLECTIONS = {
  USERS: 'economy_users',
  TRANSACTIONS: 'economy_transactions',
  BIRTHDAYS: 'birthdays',
  ATTENDANCE_RECORDS: 'attendance_records',
  SETTINGS: 'attendance_settings'
};

// Default settings
const defaultSettings = {
  rewardAmount: 500,
  requireImage: false,
  imageRewardBonus: 200,
  minFieldLength: 2,
  enableStreakBonus: true,
  streakBonusMultiplier: 1.5,
  adminNumbers: [],
  autoDetection: true,
  preferredDateFormat: 'MM/DD'
};

// Global settings cache
let attendanceSettings = { ...defaultSettings };

// Simple in-memory cache for user data
const userCache = new Map();
const cacheTimeout = 5 * 60 * 1000; // 5 minutes

// Attendance form regex
const attendanceFormRegex = /GIST\s+HQ.*?Name[:*].*?Relationship[:*]/is;

// Month names mapping
const MONTH_NAMES = {
  'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
  'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
  'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12
};

// ============================================================
// V3 PLUGIN EXPORT (Required Structure)
// ============================================================

export default {
  name: 'attendance',
  description: 'Advanced attendance system with form validation, streaks, and MongoDB persistence',
  commands: ['attendance', 'attendstats', 'testattendance'],
  aliases: ['att', 'mystats', 'testatt'],
  category: 'utility',
  usage: '[subcommand] [args]',
  example: 'attendance stats | attendance test | attendstats',
  version: '2.3.0',

  async run({ msg, args, text, command, sock, db, config, logger }) {
    try {
      // Load settings on first run
      await loadSettings(db);

      // Handle auto-detection for non-command messages
      if (attendanceSettings.autoDetection && msg.body && !msg.body.startsWith(config.PREFIX)) {
        if (await handleAutoAttendance(msg, sock, config, db, logger)) {
          return;
        }
      }

      const senderId = msg.sender || msg.key.remoteJid;
      const from = msg.key.remoteJid;

      // Helper function to reply
      const reply = async (text) => {
        await sock.sendMessage(from, { text }, { quoted: msg });
      };

      // Route commands
      const cmd = command.toLowerCase();

      if (cmd === 'attendstats' || cmd === 'mystats') {
        await handleStats({ msg, sock, config, senderId, from, reply, db });
        return;
      }

      if (cmd === 'testattendance' || cmd === 'testatt') {
        await handleTest({ msg, sock, config, senderId, from, reply, db }, args);
        return;
      }

      // Handle attendance main command
      if (args.length === 0) {
        await showAttendanceMenu(reply, config.PREFIX);
        return;
      }

      // Handle subcommands
      const subCommand = args[0].toLowerCase();
      const subArgs = args.slice(1);

      await handleSubCommand(subCommand, subArgs, {
        msg, sock, config, senderId, from, reply, db, logger
      });

    } catch (error) {
      logger.error(error, '❌ Attendance plugin error');
      await sock.sendMessage(msg.key.remoteJid, {
        text: '❌ An error occurred. Please try again.'
      });
    }
  }
};

// ============================================================
// CACHE MANAGEMENT
// ============================================================

// Cache cleanup to prevent memory leaks
function startCacheCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of userCache.entries()) {
      if (now - data.timestamp > cacheTimeout) {
        userCache.delete(userId);
      }
    }
  }, 60000); // Cleanup every minute
}

startCacheCleanup();

// ============================================================
// DATABASE FUNCTIONS
// ============================================================

// Load settings from database
async function loadSettings(db) {
  try {
    const collection = db.collection(COLLECTIONS.SETTINGS);
    const settings = await collection.findOne({ type: 'attendance' });
    if (settings) {
      attendanceSettings = { ...defaultSettings, ...settings.data };
    }
    await ensureIndexes(db);
  } catch (error) {
    console.error('Error loading attendance settings:', error);
  }
}

// Save settings to database
async function saveSettings(db) {
  try {
    const collection = db.collection(COLLECTIONS.SETTINGS);
    await collection.replaceOne(
      { type: 'attendance' },
      { type: 'attendance', data: attendanceSettings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving attendance settings:', error);
  }
}

// Ensure database indexes
async function ensureIndexes(db) {
  try {
    const records = db.collection(COLLECTIONS.ATTENDANCE_RECORDS);
    await records.createIndex({ userId: 1, date: 1 }, { background: true });
    
    const birthdays = db.collection(COLLECTIONS.BIRTHDAYS);
    await birthdays.createIndex({ 'birthday.searchKey': 1 }, { background: true });
    await birthdays.createIndex({ userId: 1 }, { unique: true, background: true });
    
    const users = db.collection(COLLECTIONS.USERS);
    await users.createIndex({ userId: 1 }, { unique: true, background: true });
    await users.createIndex({ updatedAt: 1 }, { background: true });
    
    const transactions = db.collection(COLLECTIONS.TRANSACTIONS);
    await transactions.createIndex({ userId: 1, timestamp: -1 }, { background: true });
    await transactions.createIndex({ timestamp: -1 }, { background: true });
  } catch (error) {
    console.error('Error ensuring indexes:', error);
  }
}

// Initialize user
async function initUser(userId, db) {
  try {
    const collection = db.collection(COLLECTIONS.USERS);
    const existingUser = await collection.findOne({ userId });

    if (!existingUser) {
      const newUser = {
        userId,
        balance: 0,
        bank: 0,
        inventory: [],
        lastAttendance: null,
        totalAttendances: 0,
        streak: 0,
        longestStreak: 0,
        birthdayData: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await collection.insertOne(newUser);
      return newUser;
    }

    return existingUser;
  } catch (error) {
    console.error('Error initializing user:', error);
    return null;
  }
}

// Get user data
async function getUserData(userId, db) {
  try {
    // Check cache first
    if (userCache.has(userId)) {
      const cached = userCache.get(userId);
      if (Date.now() - cached.timestamp < cacheTimeout) {
        return cached.user;
      }
    }

    const collection = db.collection(COLLECTIONS.USERS);
    const user = await collection.findOne({ userId });

    if (user) {
      // Cache the user
      userCache.set(userId, {
        user: user,
        timestamp: Date.now()
      });
    }

    return user;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

// Update user data
async function updateUserData(userId, data, db) {
  try {
    const collection = db.collection(COLLECTIONS.USERS);
    await collection.updateOne(
      { userId },
      { 
        $set: { 
          ...data, 
          updatedAt: new Date() 
        } 
      },
      { upsert: true }
    );

    // Invalidate cache
    userCache.delete(userId);

    return true;
  } catch (error) {
    console.error('Error updating user data:', error);
    return false;
  }
}

// Add money to user
async function addMoney(userId, amount, reason, db) {
  try {
    const usersCollection = db.collection(COLLECTIONS.USERS);
    const transactionsCollection = db.collection(COLLECTIONS.TRANSACTIONS);

    const user = await getUserData(userId, db);
    const newBalance = (user.balance || 0) + amount;

    await Promise.all([
      usersCollection.updateOne(
        { userId },
        { $set: { balance: newBalance, updatedAt: new Date() } }
      ),
      transactionsCollection.insertOne({
        userId,
        type: 'credit',
        amount,
        reason,
        balanceBefore: user.balance || 0,
        balanceAfter: newBalance,
        timestamp: new Date()
      })
    ]);

    // Invalidate cache
    userCache.delete(userId);

    console.log(`💰 Added ₦${amount} to ${userId.split('@')[0]} (${reason})`);
    return newBalance;
  } catch (error) {
    console.error('Error adding money:', error);
    return null;
  }
}

// Save birthday data
async function saveBirthdayData(userId, name, birthdayData, db) {
  if (!birthdayData) return { success: false, error: 'No birthday data provided' };

  try {
    const collection = db.collection(COLLECTIONS.BIRTHDAYS);
    const existingRecord = await collection.findOne({ userId });
    let updateType = 'new';
    let finalName = name;

    if (existingRecord) {
      const existingBirthday = existingRecord.birthday;
      const isSameBirthday = existingBirthday.month === birthdayData.month && 
                             existingBirthday.day === birthdayData.day;
      
      if (isSameBirthday) {
        updateType = 'name_update';
        finalName = name.length > existingRecord.name.length || 
                   (name.includes(' ') && !existingRecord.name.includes(' ')) ? 
                   name : existingRecord.name;
        
        if (existingBirthday.year && !birthdayData.year) {
          birthdayData.year = existingBirthday.year;
          birthdayData.displayDate = existingBirthday.displayDate;
        }
      } else {
        updateType = 'birthday_change';
      }
    }

    const birthdayRecord = {
      userId,
      name: finalName,
      birthday: birthdayData,
      lastUpdated: new Date(),
      updateHistory: existingRecord ? [
        ...(existingRecord.updateHistory || []),
        { 
          type: updateType, 
          previousName: existingRecord?.name, 
          previousBirthday: existingRecord?.birthday, 
          newName: name, 
          newBirthday: birthdayData, 
          timestamp: new Date() 
        }
      ] : [{ 
        type: 'initial', 
        name, 
        birthday: birthdayData, 
        timestamp: new Date() 
      }]
    };

    await collection.replaceOne({ userId }, birthdayRecord, { upsert: true });
    await updateUserData(userId, { birthdayData, displayName: finalName }, db);

    console.log(`✅ Birthday data processed for ${finalName} (Type: ${updateType})`);
    return { success: true, updateType, finalName };
  } catch (error) {
    console.error('Error saving birthday:', error);
    return { success: false, error: error.message };
  }
}

// Save attendance record
async function saveAttendanceRecord(userId, attendanceData, db) {
  try {
    const collection = db.collection(COLLECTIONS.ATTENDANCE_RECORDS);
    const record = {
      userId,
      date: attendanceData.date,
      extractedData: attendanceData.extractedData,
      hasImage: attendanceData.hasImage,
      reward: attendanceData.reward,
      streak: attendanceData.streak,
      timestamp: new Date()
    };
    await collection.insertOne(record);
    return true;
  } catch (error) {
    console.error('Error saving attendance record:', error);
    return false;
  }
}

// ============================================================
// BIRTHDAY PARSING FUNCTIONS
// ============================================================

function isLeapYear(year) {
  return year ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) : false;
}

function parseBirthday(dobText) {
  if (!dobText || typeof dobText !== 'string') return null;

  const cleaned = dobText.toLowerCase().trim()
    .replace(/^(dob|d\.o\.b|date of birth|birthday|born)[:=\s]*/i, '')
    .replace(/[,\s]+$/, '')
    .trim();
  
  if (!cleaned) return null;

  let day, month, year;

  // Pattern 1: Month Day, Year (e.g., "January 15, 1990")
  let match = cleaned.match(/([a-z]+)\s+(\d{1,2}),?\s*(\d{4})?/i);
  if (match) {
    month = MONTH_NAMES[match[1]] || MONTH_NAMES[match[1].substring(0, 3)];
    day = parseInt(match[2]);
    year = match[3] ? parseInt(match[3]) : null;
    if (month && day >= 1 && day <= 31) {
      return formatBirthday(day, month, year, cleaned);
    }
  }

  // Pattern 2: Day Month Year (e.g., "15 January 1990")
  match = cleaned.match(/(\d{1,2})\s+([a-z]+)\s*(\d{4})?/i);
  if (match) {
    day = parseInt(match[1]);
    month = MONTH_NAMES[match[2]] || MONTH_NAMES[match[2].substring(0, 3)];
    year = match[3] ? parseInt(match[3]) : null;
    if (month && day >= 1 && day <= 31) {
      return formatBirthday(day, month, year, cleaned);
    }
  }

  // Pattern 3: MM/DD/YYYY or DD/MM/YYYY
  match = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (match) {
    const num1 = parseInt(match[1]);
    const num2 = parseInt(match[2]);
    year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])) : null;
    
    if (attendanceSettings.preferredDateFormat === 'DD/MM' && num1 > 12 && num2 <= 12) {
      day = num1;
      month = num2;
    } else if (num2 > 12 && num1 <= 12) {
      month = num1;
      day = num2;
    } else {
      month = num1;
      day = num2;
    }
    
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return formatBirthday(day, month, year, cleaned);
    }
  }

  // Pattern 4: YYYY-MM-DD
  match = cleaned.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (match) {
    year = parseInt(match[1]);
    month = parseInt(match[2]);
    day = parseInt(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return formatBirthday(day, month, year, cleaned);
    }
  }

  // Pattern 5: Just month and day (e.g., "January 15")
  match = cleaned.match(/([a-z]+)\s+(\d{1,2})/i);
  if (match) {
    month = MONTH_NAMES[match[1]] || MONTH_NAMES[match[1].substring(0, 3)];
    day = parseInt(match[2]);
    if (month && day >= 1 && day <= 31) {
      return formatBirthday(day, month, null, cleaned);
    }
  }

  return null;
}

function formatBirthday(day, month, year, originalText) {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const daysInMonth = [31, year && isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  
  if (day > daysInMonth[month - 1]) return null;

  // Calculate age if year is provided
  let age = null;
  if (year) {
    const today = moment.tz('Africa/Lagos');
    const birthDate = moment.tz(`${year}-${month}-${day}`, 'YYYY-M-D', 'Africa/Lagos');
    age = today.diff(birthDate, 'years');
  }

  return {
    day,
    month,
    year,
    age,
    monthName: monthNames[month - 1],
    displayDate: year ? `${monthNames[month - 1]} ${day}, ${year}` : `${monthNames[month - 1]} ${day}`,
    searchKey: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    originalText,
    parsedAt: new Date().toISOString()
  };
}

// ============================================================
// VALIDATION FUNCTIONS
// ============================================================

function hasImage(message) {
  try {
    return !!(message.message?.imageMessage || 
              message.message?.stickerMessage ||
              message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
              message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage);
  } catch (error) {
    console.error('Error checking for image:', error);
    return false;
  }
}

function getImageStatus(hasImg, isRequired) {
  return isRequired && !hasImg ? 
    "❌ Image required but not found" : 
    hasImg ? "📸 Image detected ✅" : "📸 No image (optional)";
}

function validateAttendanceForm(body, hasImg = false) {
  const validation = {
    isValidForm: false,
    missingFields: [],
    hasWakeUpMembers: false,
    hasImage: hasImg,
    imageRequired: attendanceSettings.requireImage,
    errors: [],
    extractedData: {}
  };

  // Check basic form structure
  if (!/GIST\s+HQ/i.test(body) || !/Name[:*]/i.test(body) || !/Relationship[:*]/i.test(body)) {
    validation.errors.push("❌ Invalid attendance form format");
    return validation;
  }

  // Check image requirement
  if (attendanceSettings.requireImage && !hasImg) {
    validation.missingFields.push("📸 Image (required)");
  }

  // Required fields
  const requiredFields = [
    { name: "Name", pattern: /Name[:*]\s*(.+)/i, fieldName: "👤 Name", extract: true },
    { name: "Location", pattern: /Location[:*]\s*(.+)/i, fieldName: "🌍 Location", extract: true },
    { name: "Time", pattern: /Time[:*]\s*(.+)/i, fieldName: "⌚ Time", extract: true },
    { name: "Weather", pattern: /Weather[:*]\s*(.+)/i, fieldName: "🌥 Weather", extract: true },
    { name: "Mood", pattern: /Mood[:*]\s*(.+)/i, fieldName: "❤️‍🔥 Mood", extract: true },
    { name: "DOB", pattern: /D\.O\.B[:*]\s*(.+)/i, fieldName: "🗓 D.O.B", extract: true, isBirthday: true },
    { name: "Relationship", pattern: /Relationship[:*]\s*(.+)/i, fieldName: "👩‍❤️‍👨 Relationship", extract: true }
  ];

  requiredFields.forEach(field => {
    const match = body.match(field.pattern);
    if (!match || !match[1] || match[1].trim().length < attendanceSettings.minFieldLength) {
      validation.missingFields.push(field.fieldName);
    } else if (field.extract) {
      validation.extractedData[field.name.toLowerCase()] = match[1].trim();
      if (field.isBirthday) {
        validation.extractedData.parsedBirthday = parseBirthday(match[1].trim());
        if (!validation.extractedData.parsedBirthday) {
          validation.missingFields.push(field.fieldName + " (invalid format)");
        }
      }
    }
  });

  // Check wake-up members
  const wakeUpPattern1 = /1[:]\s*(.+)/i;
  const wakeUpPattern2 = /2[:]\s*(.+)/i;
  const wakeUpPattern3 = /3[:]\s*(.+)/i;
  
  const wakeUp1 = body.match(wakeUpPattern1);
  const wakeUp2 = body.match(wakeUpPattern2);
  const wakeUp3 = body.match(wakeUpPattern3);
  
  let missingWakeUps = [];
  if (!wakeUp1 || !wakeUp1[1] || wakeUp1[1].trim().length < attendanceSettings.minFieldLength) {
    missingWakeUps.push("1:");
  }
  if (!wakeUp2 || !wakeUp2[1] || wakeUp2[1].trim().length < attendanceSettings.minFieldLength) {
    missingWakeUps.push("2:");
  }
  if (!wakeUp3 || !wakeUp3[1] || wakeUp3[1].trim().length < attendanceSettings.minFieldLength) {
    missingWakeUps.push("3:");
  }

  if (missingWakeUps.length > 0) {
    validation.missingFields.push(`🔔 Wake up members (${missingWakeUps.join(", ")})`);
  } else {
    validation.hasWakeUpMembers = true;
    validation.extractedData.wakeUpMembers = [
      wakeUp1[1].trim(), 
      wakeUp2[1].trim(), 
      wakeUp3[1].trim()
    ];
  }

  validation.isValidForm = validation.missingFields.length === 0;
  return validation;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function updateStreak(userId, userData, today) {
  const yesterday = moment.tz('Africa/Lagos').subtract(1, 'day').format('DD-MM-YYYY');
  
  if (userData.lastAttendance === yesterday) {
    userData.streak = (userData.streak || 0) + 1;
  } else if (userData.lastAttendance !== today) {
    userData.streak = 1;
  }
  
  if (userData.streak > (userData.longestStreak || 0)) {
    userData.longestStreak = userData.streak;
  }
  
  return userData.streak;
}

function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

async function isAuthorized(sock, from, sender, config) {
  const bareNumber = sender.split('@')[0];
  
  // Check attendance admin numbers
  if (attendanceSettings.adminNumbers.includes(bareNumber)) return true;
  
  // Check config owner and admins
  const ownerNumber = config.OWNER_NUMBER || '';
  const adminNumbers = config.ADMIN_NUMBERS ? 
    (Array.isArray(config.ADMIN_NUMBERS) ? config.ADMIN_NUMBERS : config.ADMIN_NUMBERS.split(',')) : [];
  
  if (bareNumber === ownerNumber || adminNumbers.includes(bareNumber)) return true;
  
  // Check group admin
  if (!from.endsWith('@g.us')) return false;
  
  try {
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);
    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking group admin:', error);
    return false;
  }
}

// ============================================================
// AUTO ATTENDANCE HANDLER
// ============================================================

async function handleAutoAttendance(msg, sock, config, db, logger) {
  try {
    const messageText = msg.body || '';
    const senderId = msg.sender || msg.key.remoteJid;
    const from = msg.key.remoteJid;

    // Check if it's an attendance form
    if (!attendanceFormRegex.test(messageText)) return false;

    const today = getCurrentDate();
    await initUser(senderId, db);
    const userData = await getUserData(senderId, db);

    // Check if already marked today
    if (userData.lastAttendance === today) {
      await sock.sendMessage(from, { 
        text: `📝 You've already marked your attendance today! Come back tomorrow.` 
      }, { quoted: msg });
      return true;
    }

    // Validate form
    const messageHasImage = hasImage(msg);
    const validation = validateAttendanceForm(messageText, messageHasImage);

    if (!validation.isValidForm) {
      let errorMessage = `❌ *INCOMPLETE ATTENDANCE FORM* \n\n📄 Please complete the following fields:\n\n${validation.missingFields.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n💡 *Please fill out all required fields and try again.*`;
      await sock.sendMessage(from, { text: errorMessage }, { quoted: msg });
      return true;
    }

    // Update streak
    const currentStreak = updateStreak(senderId, userData, today);
    
    await updateUserData(senderId, {
      lastAttendance: today,
      totalAttendances: (userData.totalAttendances || 0) + 1,
      streak: currentStreak,
      longestStreak: userData.longestStreak
    }, db);

    // Save birthday if provided
    let birthdayMessage = '';
    if (validation.extractedData.parsedBirthday && validation.extractedData.name) {
      const birthdayResult = await saveBirthdayData(
        senderId, 
        validation.extractedData.name, 
        validation.extractedData.parsedBirthday,
        db
      );
      
      if (birthdayResult.success) {
        birthdayMessage = `\n🎂 Birthday saved/updated: ${validation.extractedData.parsedBirthday.displayDate}.`;
      }
    }

    // Calculate reward
    let finalReward = attendanceSettings.rewardAmount;
    
    if (messageHasImage && attendanceSettings.imageRewardBonus > 0) {
      finalReward += attendanceSettings.imageRewardBonus;
    }
    
    if (attendanceSettings.enableStreakBonus && currentStreak >= 3) {
      finalReward = Math.floor(finalReward * attendanceSettings.streakBonusMultiplier);
    }

    // Add money and save record
    await addMoney(senderId, finalReward, 'Attendance reward', db);
    await saveAttendanceRecord(senderId, {
      date: today,
      extractedData: validation.extractedData,
      hasImage: messageHasImage,
      reward: finalReward,
      streak: currentStreak
    }, db);

    // Send success message
    const updatedUserData = await getUserData(senderId, db);
    let successMessage = `✅ *ATTENDANCE APPROVED!* ✅\n\n🔥 Current streak: ${currentStreak} days\n💰 New wallet balance: ₦${(updatedUserData.balance || 0).toLocaleString()}${birthdayMessage}\n\n🎉 *Thank you for your consistent participation!*`;
    
    await sock.sendMessage(from, { text: successMessage }, { quoted: msg });

    return true;
  } catch (error) {
    logger.error(error, 'Error in auto attendance handler');
    return false;
  }
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

async function handleSubCommand(subCommand, args, context) {
  switch (subCommand) {
    case 'stats':
      await handleStats(context);
      break;
    case 'settings':
      await handleSettings(context, args);
      break;
    case 'test':
      await handleTest(context, args);
      break;
    case 'testbirthday':
      await handleTestBirthday(context, args);
      break;
    case 'records':
      await handleAttendanceRecords(context, args);
      break;
    case 'help':
      await showAttendanceMenu(context.reply, context.config.PREFIX);
      break;
    default:
      await context.reply(`❓ Unknown attendance command: *${subCommand}*\n\nUse *${context.config.PREFIX}attendance help* to see available commands.`);
  }
}

async function showAttendanceMenu(reply, prefix) {
  await reply(
    `📋 *ATTENDANCE SYSTEM* 📋\n\n` +
    `📊 *User Commands:*\n` +
    `• *stats* - View your attendance stats\n` +
    `• *test [form]* - Test attendance form\n` +
    `• *testbirthday [date]* - Test birthday parsing\n` +
    `• *records* - View your attendance history\n\n` +
    `👑 *Admin Commands:*\n` +
    `• *settings* - View/modify settings\n\n` +
    `🤖 *Auto-Detection:*\n` +
    `Just send your GIST HQ attendance form!\n\n` +
    `💡 *Usage:* ${prefix}attendance [command]`
  );
}

async function handleStats(context) {
  const { reply, senderId, db } = context;
  
  try {
    await initUser(senderId, db);
    const userData = await getUserData(senderId, db);
    const today = getCurrentDate();
    
    let statsMessage = `📊 *YOUR ATTENDANCE STATS* 📊\n\n` +
                      `📅 Last attendance: ${userData.lastAttendance || 'Never'}\n` +
                      `📋 Total attendances: ${userData.totalAttendances || 0}\n` +
                      `🔥 Current streak: ${userData.streak || 0} days\n` +
                      `🏆 Longest streak: ${userData.longestStreak || 0} days\n` +
                      `✅ Today's status: ${userData.lastAttendance === today ? 'Marked ✅' : 'Not marked ❌'}\n` +
                      `💰 Current balance: ₦${(userData.balance || 0).toLocaleString()}\n` +
                      `📸 Image required: ${attendanceSettings.requireImage ? 'Yes' : 'No'}\n` +
                      `📅 Date format: ${attendanceSettings.preferredDateFormat}`;
    
    const streak = userData.streak || 0;
    statsMessage += streak >= 7 ? `\n🌟 *Amazing! You're on fire with a ${streak}-day streak!*` :
                    streak >= 3 ? `\n🔥 *Great job! Keep the streak going!*` :
                    `\n💪 *Mark your attendance daily to build a streak!*`;
    
    await reply(statsMessage);
  } catch (error) {
    await reply('❌ *Error loading stats. Please try again.*');
    console.error('Stats error:', error);
  }
}

async function handleSettings(context, args) {
  const { reply, senderId, sock, msg, config, db } = context;
  
  if (!(await isAuthorized(sock, msg.key.remoteJid, senderId, config))) {
    await reply('🚫 Only admins can use this command.');
    return;
  }

  if (args.length === 0) {
    let settingsMessage = `⚙️ *ATTENDANCE SETTINGS* ⚙️\n\n` +
                         `💰 Reward Amount: ₦${attendanceSettings.rewardAmount.toLocaleString()}\n` +
                         `📸 Require Image: ${attendanceSettings.requireImage ? 'Yes ✅' : 'No ❌'}\n` +
                         `💎 Image Bonus: ₦${attendanceSettings.imageRewardBonus.toLocaleString()}\n` +
                         `🔥 Streak Bonus: ${attendanceSettings.enableStreakBonus ? 'Enabled ✅' : 'Disabled ❌'}\n` +
                         `📈 Streak Multiplier: ${attendanceSettings.streakBonusMultiplier}x\n` +
                         `📅 Date Format: ${attendanceSettings.preferredDateFormat}\n` +
                         `🤖 Auto Detection: ${attendanceSettings.autoDetection ? 'Enabled ✅' : 'Disabled ❌'}\n\n` +
                         `🔧 *Change Settings:*\n` +
                         `• *reward [amount]* - Set base reward\n` +
                         `• *requireimage on/off* - Toggle image requirement\n` +
                         `• *imagebonus [amount]* - Set image bonus\n` +
                         `• *dateformat MM/DD|DD/MM* - Set date format\n` +
                         `• *autodetect on/off* - Toggle auto detection\n` +
                         `• *streakbonus on/off* - Toggle streak bonus\n` +
                         `• *multiplier [number]* - Set streak multiplier`;
    
    await reply(settingsMessage);
    return;
  }

  const setting = args[0].toLowerCase();
  const value = args.slice(1).join(' ');

  switch (setting) {
    case 'reward':
      const amount = parseInt(value);
      if (isNaN(amount) || amount < 0) {
        await reply('⚠️ Please specify a valid reward amount.');
        return;
      }
      attendanceSettings.rewardAmount = amount;
      await saveSettings(db);
      await reply(`✅ Reward amount set to ₦${amount.toLocaleString()}`);
      break;
      
    case 'requireimage':
      if (!['on', 'off'].includes(value.toLowerCase())) {
        await reply('⚠️ Please specify: *on* or *off*');
        return;
      }
      attendanceSettings.requireImage = value.toLowerCase() === 'on';
      await saveSettings(db);
      await reply(`✅ Image requirement ${attendanceSettings.requireImage ? 'enabled' : 'disabled'}`);
      break;
      
    case 'imagebonus':
      const bonus = parseInt(value);
      if (isNaN(bonus) || bonus < 0) {
        await reply('⚠️ Please specify a valid bonus amount.');
        return;
      }
      attendanceSettings.imageRewardBonus = bonus;
      await saveSettings(db);
      await reply(`✅ Image bonus set to ₦${bonus.toLocaleString()}`);
      break;
      
    case 'dateformat':
      if (!['MM/DD', 'DD/MM'].includes(value)) {
        await reply('⚠️ Please specify: *MM/DD* or *DD/MM*');
        return;
      }
      attendanceSettings.preferredDateFormat = value;
      await saveSettings(db);
      await reply(`✅ Date format set to ${value}`);
      break;
      
    case 'autodetect':
      if (!['on', 'off'].includes(value.toLowerCase())) {
        await reply('⚠️ Please specify: *on* or *off*');
        return;
      }
      attendanceSettings.autoDetection = value.toLowerCase() === 'on';
      await saveSettings(db);
      await reply(`✅ Auto detection ${attendanceSettings.autoDetection ? 'enabled' : 'disabled'}`);
      break;
      
    case 'streakbonus':
      if (!['on', 'off'].includes(value.toLowerCase())) {
        await reply('⚠️ Please specify: *on* or *off*');
        return;
      }
      attendanceSettings.enableStreakBonus = value.toLowerCase() === 'on';
      await saveSettings(db);
      await reply(`✅ Streak bonus ${attendanceSettings.enableStreakBonus ? 'enabled' : 'disabled'}`);
      break;
      
    case 'multiplier':
      const multiplier = parseFloat(value);
      if (isNaN(multiplier) || multiplier < 1 || multiplier > 5) {
        await reply('⚠️ Please specify a valid multiplier (1.0 - 5.0)');
        return;
      }
      attendanceSettings.streakBonusMultiplier = multiplier;
      await saveSettings(db);
      await reply(`✅ Streak multiplier set to ${multiplier}x`);
      break;
      
    default:
      await reply(`❓ Unknown setting: *${setting}*`);
  }
}

async function handleTest(context, args) {
  const { reply, msg } = context;
  const testText = args.join(' ');
  
  if (!testText) {
    await reply(`🔍 *Attendance Form Test*\n\nUsage: ${context.config.PREFIX}attendance test [paste your attendance form]`);
    return;
  }
  
  const validation = validateAttendanceForm(testText, hasImage(msg));
  
  let result = `🔍 *Form Detection Results:*\n\n` +
               `📋 Valid Form: ${validation.isValidForm ? '✅ Yes' : '❌ No'}\n` +
               `📸 Image: ${getImageStatus(validation.hasImage, validation.imageRequired)}\n` +
               `🔔 Wake-up Members: ${validation.hasWakeUpMembers ? '✅ Present' : '❌ Missing'}\n` +
               `🚫 Missing/Invalid Fields: ${validation.missingFields.length > 0 ? validation.missingFields.join(', ') : 'None'}\n`;
  
  if (Object.keys(validation.extractedData).length > 0) {
    result += `\n📝 *Extracted Data:*\n`;
    for (const [key, value] of Object.entries(validation.extractedData)) {
      if (key === 'parsedBirthday') {
        result += `🎂 DOB: ${value.displayDate}\n`;
      } else if (key === 'wakeUpMembers') {
        result += `🔔 Wake-up: ${value.join(', ')}\n`;
      } else {
        result += `${key}: ${value}\n`;
      }
    }
  }
  
  await reply(result);
}

async function handleTestBirthday(context, args) {
  const { reply } = context;
  const testDate = args.join(' ');
  
  if (!testDate) {
    await reply(`🎂 *Birthday Parser Test*\n\nUsage: ${context.config.PREFIX}attendance testbirthday [date]\n\nExamples:\n• January 15, 1990\n• 15/01/1990\n• 01-15\n• Jan 15`);
    return;
  }
  
  const parsed = parseBirthday(testDate);
  
  let result = `🎂 *Birthday Parser Results*\n\n`;
  
  if (parsed) {
    result += `✅ *Parsed Successfully:*\n` +
              `📅 Display: ${parsed.displayDate}\n` +
              `🔍 Search Key: ${parsed.searchKey}\n` +
              `🗓 Month: ${parsed.monthName}\n` +
              `📌 Day: ${parsed.day}\n`;
    
    if (parsed.year) {
      result += `📆 Year: ${parsed.year}\n`;
    }
    
    if (parsed.age !== null) {
      result += `🎈 Age: ${parsed.age} years\n`;
    }
    
    result += `📝 Original: ${parsed.originalText}`;
  } else {
    result += `❌ *Failed to parse birthday:* ${testDate}\n\n` +
              `💡 *Supported formats:*\n` +
              `• Month Day, Year (January 15, 1990)\n` +
              `• Day Month Year (15 January 1990)\n` +
              `• MM/DD/YYYY or DD/MM/YYYY\n` +
              `• YYYY-MM-DD\n` +
              `• Month Day (January 15)`;
  }
  
  await reply(result);
}

async function handleAttendanceRecords(context, args) {
  const { reply, senderId, db } = context;
  
  try {
    const limit = args[0] ? Math.min(Math.max(parseInt(args[0]), 1), 50) : 10;
    
    const collection = db.collection(COLLECTIONS.ATTENDANCE_RECORDS);
    const records = await collection
      .find({ userId: senderId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    if (records.length === 0) {
      await reply(`📋 *No Attendance Records*\n\nYou haven't marked any attendance yet. Submit your GIST HQ attendance form to get started!`);
      return;
    }

    let recordsText = `📋 *YOUR ATTENDANCE HISTORY* 📋\n\n📊 Showing last ${records.length} records:\n\n`;
    
    records.forEach((record, index) => {
      recordsText += `${index + 1}. 📅 ${record.date}\n` +
                     `   💰 Reward: ₦${record.reward.toLocaleString()}\n` +
                     `   🔥 Streak: ${record.streak} days\n` +
                     `   📸 Image: ${record.hasImage ? 'Yes' : 'No'}\n`;
      
      if (record.extractedData?.name) {
        recordsText += `   👤 Name: ${record.extractedData.name}\n`;
      }
      
      recordsText += `   ⏰ ${moment(record.timestamp).tz('Africa/Lagos').format('DD/MM/YYYY HH:mm')}\n\n`;
    });
    
    recordsText += `💡 *Use: ${context.config.PREFIX}attendance records [number]* to show more/less records (max 50)`;
    
    await reply(recordsText);
  } catch (error) {
    await reply('❌ *Error loading attendance records. Please try again.*');
    console.error('Records error:', error);
  }
}

// ============================================================
// EXPORTS FOR EXTERNAL USE
// ============================================================

export {
  parseBirthday,
  saveBirthdayData,
  attendanceSettings,
  addMoney,
  getUserData,
  updateUserData,
  initUser
};