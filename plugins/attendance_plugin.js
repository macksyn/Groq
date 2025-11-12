// plugins/attendance.js - V3 Attendance Plugin with Scheduled Tasks
import moment from 'moment-timezone';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// ===== COLLECTIONS =====
const COLLECTIONS = {
  USERS: 'economy_users',
  TRANSACTIONS: 'economy_transactions',
  BIRTHDAYS: 'birthdays',
  ATTENDANCE_RECORDS: 'attendance_records',
  SETTINGS: 'attendance_settings'
};

// ===== TIMEZONE =====
moment.tz.setDefault('Africa/Lagos');

// ===== DEFAULT SETTINGS =====
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

// ===== IN-MEMORY CACHE =====
const userCache = new Map();
const cacheTimeout = 5 * 60 * 1000; // 5 minutes

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

// ===== DATABASE SETUP =====
async function ensureIndexes() {
  await PluginHelpers.safeDBOperation(async (db) => {
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
  });
}

// ===== SETTINGS MANAGEMENT =====
let attendanceSettings = { ...defaultSettings };

async function loadSettings() {
  try {
    const collection = await PluginHelpers.getCollection(COLLECTIONS.SETTINGS);
    const settings = await collection.findOne({ type: 'attendance' });
    if (settings) {
      attendanceSettings = { ...defaultSettings, ...settings.data };
    }
    await ensureIndexes();
  } catch (error) {
    console.error('Error loading attendance settings:', error);
  }
}

async function saveSettings() {
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.replaceOne(
      { type: 'attendance' },
      { type: 'attendance', data: attendanceSettings, updatedAt: new Date() },
      { upsert: true }
    );
  }, COLLECTIONS.SETTINGS);
}

// ===== USER MANAGEMENT =====
async function initUser(userId) {
  return await PluginHelpers.getUserData(userId);
}

async function getUserData(userId) {
  return await PluginHelpers.getUserData(userId);
}

async function updateUserData(userId, data) {
  return await PluginHelpers.updateUser(userId, data);
}

async function addMoney(userId, amount, reason = 'Attendance reward') {
  return await PluginHelpers.addMoney(userId, amount, reason);
}

// ===== MONTH NAMES MAPPING =====
const MONTH_NAMES = {
  'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
  'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
  'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12
};

// ===== DATE PARSING UTILITIES =====
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

  // Pattern 1: Month Day, Year
  let match = cleaned.match(/([a-z]+)\s+(\d{1,2}),?\s*(\d{4})?/i);
  if (match) {
    month = MONTH_NAMES[match[1]] || MONTH_NAMES[match[1].substring(0, 3)];
    day = parseInt(match[2]);
    year = match[3] ? parseInt(match[3]) : null;
    if (month && day >= 1 && day <= 31) {
      return formatBirthday(day, month, year, cleaned);
    }
  }

  // Pattern 2: Day Month Year
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

  // Pattern 5: Just month and day
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

  return {
    day,
    month,
    year,
    monthName: monthNames[month - 1],
    displayDate: year ? `${monthNames[month - 1]} ${day}, ${year}` : `${monthNames[month - 1]} ${day}`,
    searchKey: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    originalText,
    parsedAt: new Date().toISOString()
  };
}

// ===== BIRTHDAY DATA MANAGEMENT =====
async function saveBirthdayData(userId, name, birthdayData) {
  if (!birthdayData) return { success: false, error: 'No birthday data provided' };

  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    const existingRecord = await collection.findOne({ userId });
    let updateType = 'new';
    let finalName = name;

    if (existingRecord) {
      const existingBirthday = existingRecord.birthday;
      const isSameBirthday = existingBirthday.month === birthdayData.month && existingBirthday.day === birthdayData.day;
      if (isSameBirthday) {
        updateType = 'name_update';
        finalName = name.length > existingRecord.name.length || (name.includes(' ') && !existingRecord.name.includes(' ')) ? name : existingRecord.name;
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
        { type: updateType, previousName: existingRecord?.name, previousBirthday: existingRecord?.birthday, newName: name, newBirthday: birthdayData, timestamp: new Date() }
      ] : [{ type: 'initial', name, birthday: birthdayData, timestamp: new Date() }]
    };

    await collection.replaceOne({ userId }, birthdayRecord, { upsert: true });
    await PluginHelpers.updateUser(userId, { birthdayData, displayName: finalName });

    console.log(`✅ Birthday data processed for ${finalName} (Type: ${updateType})`);
    return { success: true, updateType, finalName };
  }, COLLECTIONS.BIRTHDAYS);
}

// ===== ATTENDANCE RECORD MANAGEMENT =====
async function saveAttendanceRecord(userId, attendanceData) {
  return await PluginHelpers.safeDBOperation(async (db, collection) => {
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
  }, COLLECTIONS.ATTENDANCE_RECORDS);
}

async function cleanupRecords() {
  await PluginHelpers.safeDBOperation(async (db) => {
    const cutoffDate = moment.tz('Africa/Lagos').subtract(90, 'days').toDate();
    await db.collection(COLLECTIONS.ATTENDANCE_RECORDS).deleteMany({ timestamp: { $lt: cutoffDate } });
    console.log('✅ Attendance records cleanup completed');
  });
}

// ===== IMAGE DETECTION =====
function hasImage(message) {
  try {
    return !!(message.message?.imageMessage || message.message?.stickerMessage ||
              message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
              message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage);
  } catch (error) {
    console.error('Error checking for image:', error);
    return false;
  }
}

function getImageStatus(hasImg, isRequired) {
  return isRequired && !hasImg ? "❌ Image required but not found" : hasImg ? "📸 Image detected ✅" : "📸 No image (optional)";
}

// ===== FORM VALIDATION =====
const attendanceFormRegex = /GIST\s+HQ.*?Name[:*].*?Relationship[:*]/is;

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

  if (!/GIST\s+HQ/i.test(body) || !/Name[:*]/i.test(body) || !/Relationship[:*]/i.test(body)) {
    validation.errors.push("❌ Invalid attendance form format");
    return validation;
  }

  if (attendanceSettings.requireImage && !hasImg) {
    validation.missingFields.push("📸 Image (required)");
  }

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

  const wakeUpPattern1 = /1[:]\s*(.+)/i;
  const wakeUpPattern2 = /2[:]\s*(.+)/i;
  const wakeUpPattern3 = /3[:]\s*(.+)/i;
  const wakeUp1 = body.match(wakeUpPattern1);
  const wakeUp2 = body.match(wakeUpPattern2);
  const wakeUp3 = body.match(wakeUpPattern3);
  let missingWakeUps = [];
  if (!wakeUp1 || !wakeUp1[1] || wakeUp1[1].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("1:");
  if (!wakeUp2 || !wakeUp2[1] || wakeUp2[1].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("2:");
  if (!wakeUp3 || !wakeUp3[1] || wakeUp3[1].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("3:");

  if (missingWakeUps.length > 0) {
    validation.missingFields.push(`🔔 Wake up members (${missingWakeUps.join(", ")})`);
  } else {
    validation.hasWakeUpMembers = true;
    validation.extractedData.wakeUpMembers = [wakeUp1[1].trim(), wakeUp2[1].trim(), wakeUp3[1].trim()];
  }

  validation.isValidForm = validation.missingFields.length === 0;
  return validation;
}

// ===== STREAK MANAGEMENT =====
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

// ===== DATE UTILITIES =====
function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

// ===== AUTHORIZATION =====
async function isAuthorized(sock, from, sender) {
  const bareNumber = sender.split('@')[0];
  if (attendanceSettings.adminNumbers.includes(bareNumber)) return true;
  const ownerNumber = process.env.OWNER_NUMBER || '';
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  if (bareNumber === ownerNumber || adminNumbers.includes(bareNumber)) return true;
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

// ===== AUTO ATTENDANCE HANDLER =====
async function handleAutoAttendance(m, sock, config) {
  try {
    const messageText = m.body || '';
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    if (!attendanceFormRegex.test(messageText)) return false;

    const today = getCurrentDate();
    await initUser(senderId);
    const userData = await getUserData(senderId);

    if (userData.lastAttendance === today) {
      await sock.sendMessage(from, { text: `📝 You've already marked your attendance today! Come back tomorrow.` }, { quoted: m });
      return true;
    }

    const messageHasImage = hasImage(m);
    const validation = validateAttendanceForm(messageText, messageHasImage);

    if (!validation.isValidForm) {
      let errorMessage = `❌ *INCOMPLETE ATTENDANCE FORM* \n\n📄 Please complete the following fields:\n\n${validation.missingFields.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n💡 *Please fill out all required fields and try again.*`;
      await sock.sendMessage(from, { text: errorMessage }, { quoted: m });
      return true;
    }

    const currentStreak = updateStreak(senderId, userData, today);
    await updateUserData(senderId, {
      lastAttendance: today,
      totalAttendances: (userData.totalAttendances || 0) + 1,
      streak: currentStreak,
      longestStreak: userData.longestStreak
    });

    let birthdayMessage = '';
    if (validation.extractedData.parsedBirthday && validation.extractedData.name) {
      const birthdayResult = await saveBirthdayData(senderId, validation.extractedData.name, validation.extractedData.parsedBirthday);
      if (birthdayResult.success) {
        birthdayMessage = `\n🎂 Birthday saved/updated: ${validation.extractedData.parsedBirthday.displayDate}.`;
      }
    }

    let finalReward = attendanceSettings.rewardAmount;
    if (messageHasImage && attendanceSettings.imageRewardBonus > 0) {
      finalReward += attendanceSettings.imageRewardBonus;
    }
    if (attendanceSettings.enableStreakBonus && currentStreak >= 3) {
      finalReward = Math.floor(finalReward * attendanceSettings.streakBonusMultiplier);
    }

    await addMoney(senderId, finalReward, 'Attendance reward');
    await saveAttendanceRecord(senderId, {
      date: today,
      extractedData: validation.extractedData,
      hasImage: messageHasImage,
      reward: finalReward,
      streak: currentStreak
    });

    const updatedUserData = await getUserData(senderId);
    let successMessage = `✅ *ATTENDANCE APPROVED!* ✅\n\n🔥 Current streak: ${currentStreak} days\n💰 New wallet balance: ₦${(updatedUserData.balance || 0).toLocaleString()}${birthdayMessage}\n\n🎉 *Thank you for your consistent participation!*`;
    await sock.sendMessage(from, { text: successMessage }, { quoted: m });

    return true;
  } catch (error) {
    console.error('Error in auto attendance handler:', error);
    return false;
  }
}

// ===== COMMAND HANDLERS =====
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
  const { msg: m, sock, config } = context;
  const senderId = m.sender;
  const from = m.chat;

  const reply = async (text) => await sock.sendMessage(from, { text }, { quoted: m });

  try {
    await initUser(senderId);
    const userData = await getUserData(senderId);
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
  const { msg: m, sock, config, logger } = context;
  const senderId = m.sender;
  const from = m.chat;

  const reply = async (text) => await sock.sendMessage(from, { text }, { quoted: m });

  if (!(await isAuthorized(sock, from, senderId))) {
    await reply('🚫 Only admins can use this command.');
    return;
  }

  if (args.length === 0) {
    let settingsMessage = `⚙️ *ATTENDANCE SETTINGS* ⚙️\n\n` +
                         `💰 Reward Amount: ₦${attendanceSettings.rewardAmount.toLocaleString()}\n` +
                         `📸 Require Image: ${attendanceSettings.requireImage ? 'Yes ✅' : 'No ❌'}\n` +
                         `💎 Image Bonus: ₦${attendanceSettings.imageRewardBonus.toLocaleString()}\n` +
                         `📅 Date Format: ${attendanceSettings.preferredDateFormat}\n` +
                         `🔧 *Change Settings:*\n` +
                         `• *reward [amount]*\n• *requireimage on/off*\n• *imagebonus [amount]*\n• *dateformat MM/DD|DD/MM*`;
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
      await saveSettings();
      await reply(`✅ Reward amount set to ₦${amount.toLocaleString()}`);
      break;
    case 'requireimage':
      if (!['on', 'off'].includes(value.toLowerCase())) {
        await reply('⚠️ Please specify: *on* or *off*');
        return;
      }
      attendanceSettings.requireImage = value.toLowerCase() === 'on';
      await saveSettings();
      await reply(`✅ Image requirement ${attendanceSettings.requireImage ? 'enabled' : 'disabled'}`);
      break;
    case 'imagebonus':
      const bonus = parseInt(value);
      if (isNaN(bonus) || bonus < 0) {
        await reply('⚠️ Please specify a valid bonus amount.');
        return;
      }
      attendanceSettings.imageRewardBonus = bonus;
      await saveSettings();
      await reply(`✅ Image bonus set to ₦${bonus.toLocaleString()}`);
      break;
    case 'dateformat':
      if (!['MM/DD', 'DD/MM'].includes(value)) {
        await reply('⚠️ Please specify: *MM/DD* or *DD/MM*');
        return;
      }
      attendanceSettings.preferredDateFormat = value;
      await saveSettings();
      await reply(`✅ Date format set to ${value}`);
      break;
    default:
      await reply(`❓ Unknown setting: *${setting}*`);
  }
}

async function handleTest(context, args) {
  const { msg: m, sock, config } = context;
  const from = m.chat;

  const reply = async (text) => await sock.sendMessage(from, { text }, { quoted: m });

  const testText = args.join(' ');
  if (!testText) {
    await reply(`🔍 *Attendance Form Test*\n\nUsage: ${config.PREFIX}attendance test [paste your attendance form]`);
    return;
  }
  const validation = validateAttendanceForm(testText, hasImage(m));
  let result = `🔍 *Form Detection Results:*\n\n` +
               `📋 Valid Form: ${validation.isValidForm ? '✅ Yes' : '❌ No'}\n` +
               `📸 Image: ${getImageStatus(validation.hasImage, validation.imageRequired)}\n` +
               `🔔 Wake-up Members: ${validation.hasWakeUpMembers ? '✅ Present' : '❌ Missing'}\n` +
               `🚫 Missing/Invalid Fields: ${validation.missingFields.length > 0 ? validation.missingFields.join(', ') : 'None'}\n` +
               `\n📝 Extracted Data:\n${Object.entries(validation.extractedData).map(([k, v]) => k === 'parsedBirthday' ? `🎂 DOB: ${v.displayDate}` : `${k}: ${v}`).join('\n')}`;
  await reply(result);
}

async function handleTestBirthday(context, args) {
  const { msg: m, sock, config } = context;
  const from = m.chat;

  const reply = async (text) => await sock.sendMessage(from, { text }, { quoted: m });

  const testDate = args.join(' ');
  if (!testDate) {
    await reply(`🎂 *Birthday Parser Test*\n\nUsage: ${config.PREFIX}attendance testbirthday [date]`);
    return;
  }
  const parsed = parseBirthday(testDate);
  let result = `🎂 *Birthday Parser Results*\n\n` +
               (parsed ? `✅ Parsed Successfully:\n📅 Date: ${parsed.displayDate}\n🔍 Search Key: ${parsed.searchKey}\n🗓 Month: ${parsed.monthName}\n📌 Original: ${parsed.originalText}` :
                         `❌ Failed to parse birthday: ${testDate}`);
  await reply(result);
}

async function handleAttendanceRecords(context, args) {
  const { msg: m, sock, config } = context;
  const senderId = m.sender;
  const from = m.chat;

  const reply = async (text) => await sock.sendMessage(from, { text }, { quoted: m });

  try {
    const limit = args[0] ? Math.min(Math.max(parseInt(args[0]), 1), 50) : 10;
    const records = await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.find({ userId: senderId }).sort({ timestamp: -1 }).limit(limit).toArray();
    }, COLLECTIONS.ATTENDANCE_RECORDS);

    if (records.length === 0) {
      await reply(`📋 *No Attendance Records*\n\nYou haven't marked any attendance yet. Submit your GIST HQ attendance form to get started!`);
      return;
    }

    let recordsText = `📋 *YOUR ATTENDANCE HISTORY* 📋\n\n📊 Showing last ${records.length} records:\n\n`;
    records.forEach((record, index) => {
      recordsText += `${index + 1}. 📅 ${record.date}\n` +
                     `   💰 Reward: ₦${record.reward.toLocaleString()}\n` +
                     `   🔥 Streak: ${record.streak} days\n` +
                     `   📸 Image: ${record.hasImage ? 'Yes' : 'No'}\n` +
                     (record.extractedData?.name ? `   👤 Name: ${record.extractedData.name}\n` : '') +
                     `   ⏰ ${moment(record.timestamp).tz('Africa/Lagos').format('DD/MM/YYYY HH:mm')}\n\n`;
    });
    recordsText += `💡 *Use: ${config.PREFIX}attendance records [number]* to show more/less records (max 50)`;
    await reply(recordsText);
  } catch (error) {
    await reply('❌ *Error loading attendance records. Please try again.*');
    console.error('Records error:', error);
  }
}

async function handleSubCommand(subCommand, args, context) {
  switch (subCommand.toLowerCase()) {
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
      await showAttendanceMenu(async (text) => {
        await context.sock.sendMessage(context.msg.chat, { text }, { quoted: context.msg });
      }, context.config.PREFIX);
      break;
    default:
      const from = context.msg.chat;
      await context.sock.sendMessage(from, { 
        text: `❓ Unknown attendance command: *${subCommand}*\n\nUse *${context.config.PREFIX}attendance help* to see available commands.` 
      }, { quoted: context.msg });
  }
}

// ===== V3 PLUGIN EXPORT =====
export default {
  name: 'Attendance System',
  version: '2.3.0',
  author: 'Alex Macksyn',
  description: 'Advanced attendance system with form validation, streaks, and MongoDB persistence',
  category: 'utility',

  // Commands this plugin handles
  commands: ['attendance', 'attendstats'],
  aliases: ['att', 'mystats'],
  ownerOnly: false,

  // IMPORTANT: Enable non-command execution for auto-detection
  executeOnAllMessages: true, // This tells PluginManager to run this plugin even without commands

  // Scheduled tasks for cleanup
  scheduledTasks: [
    {
      name: 'attendance-cleanup',
      description: 'Clean up old attendance records (90+ days)',
      schedule: '0 2 * * *', // Daily at 2 AM WAT
      async handler(context) {
        const { logger } = context;
        try {
          logger.info('🧹 Starting attendance records cleanup...');
          await cleanupRecords();
          logger.info('✅ Attendance cleanup completed successfully');
        } catch (error) {
          logger.error(error, '❌ Attendance cleanup failed');
        }
      }
    },
    {
      name: 'attendance-stats-report',
      description: 'Generate daily attendance statistics',
      schedule: '0 23 * * *', // Daily at 11 PM WAT
      async handler(context) {
        const { logger } = context;
        try {
          logger.info('📊 Generating daily attendance statistics...');

          const today = getCurrentDate();
          const stats = await PluginHelpers.safeDBOperation(async (db) => {
            const records = db.collection(COLLECTIONS.ATTENDANCE_RECORDS);
            const todayRecords = await records.find({ date: today }).toArray();

            return {
              totalToday: todayRecords.length,
              totalRewardsGiven: todayRecords.reduce((sum, r) => sum + r.reward, 0),
              withImages: todayRecords.filter(r => r.hasImage).length,
              avgStreak: todayRecords.length > 0 
                ? (todayRecords.reduce((sum, r) => sum + r.streak, 0) / todayRecords.length).toFixed(1)
                : 0
            };
          });

          if (stats) {
            logger.info(`📊 Daily Stats for ${today}:
              - Total Attendance: ${stats.totalToday}
              - Total Rewards: ₦${stats.totalRewardsGiven.toLocaleString()}
              - With Images: ${stats.withImages}
              - Avg Streak: ${stats.avgStreak} days`);
          }
        } catch (error) {
          logger.error(error, '❌ Failed to generate attendance statistics');
        }
      }
    }
  ],

  // Main plugin handler
  async run(context) {
    const { msg: m, args, text, command, sock, db, config, bot, logger, helpers } = context;

    // Load settings on first run
    await loadSettings();

    // Add sender and chat to message object for compatibility
    if (!m.sender) {
      m.sender = m.key.participant || m.key.remoteJid;
    }
    if (!m.chat) {
      m.chat = m.key.remoteJid;
    }

    // Handle auto-detection for non-command messages (when no prefix)
    if (!command || !m.body?.startsWith(config.PREFIX)) {
      if (attendanceSettings.autoDetection && m.body) {
        try {
          const handled = await handleAutoAttendance(m, sock, config);
          if (handled) {
            logger.info(`✅ Auto-attendance processed for ${m.sender.split('@')[0]}`);
          }
        } catch (error) {
          logger.error(error, '❌ Auto-attendance handler error');
        }
      }
      return; // Don't process further if no command
    }

    // Route to appropriate command handler
    switch (command.toLowerCase()) {
      case 'attendance':
      case 'att':
        if (args.length === 0) {
          await showAttendanceMenu(async (text) => {
            await sock.sendMessage(m.chat, { text }, { quoted: m });
          }, config.PREFIX);
        } else {
          await handleSubCommand(args[0], args.slice(1), { ...context, msg: m });
        }
        break;

      case 'attendstats':
      case 'mystats':
        await handleStats({ ...context, msg: m });
        break;

      default:
        // Should not reach here due to command mapping
        break;
    }
  }
};

// ===== EXPORT UTILITY FUNCTIONS (for other plugins) =====
export {
  parseBirthday,
  saveBirthdayData,
  attendanceSettings,
  addMoney,
  getUserData,
  updateUserData,
  initUser,
  validateAttendanceForm,
  hasImage,
  getCurrentDate,
  getNigeriaTime
};