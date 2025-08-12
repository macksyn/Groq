// plugins/attendance.js - Attendance plugin compatible with PluginManager
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { addMoney, getUserData, updateUserData, initUser, ecoSettings } from './economy_plugin.js';

// Plugin information export
export const info = {
  name: 'Attendance System',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Advanced attendance system with form validation, streaks, birthday tracking and MongoDB persistence',
  commands: [
    {
      name: 'attendance',
      aliases: ['attend', 'att'],
      description: 'Access the attendance system'
    },
    {
      name: 'attendstats',
      aliases: ['mystats'],
      description: 'View your attendance statistics'
    },
    {
      name: 'testattendance',
      aliases: ['testatt'],
      description: 'Test attendance form validation'
    },
    {
      name: 'mybirthday',
      aliases: ['birthday'],
      description: 'View your birthday information'
    }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
const COLLECTIONS = {
  USERS: 'economy_users', // Use the same user collection as the economy plugin
  BIRTHDAYS: 'birthdays',
  ATTENDANCE_RECORDS: 'attendance_records',
  SETTINGS: 'attendance_settings'
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
    // Note: The economy plugin manages the main user index, but we'll create others specific to attendance
    await db.collection(COLLECTIONS.BIRTHDAYS).createIndex({ userId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.BIRTHDAYS).createIndex({ 'birthday.searchKey': 1 });
    await db.collection(COLLECTIONS.ATTENDANCE_RECORDS).createIndex({ userId: 1, date: -1 });
    await db.collection(COLLECTIONS.ATTENDANCE_RECORDS).createIndex({ date: -1 });
    
    console.log('✅ MongoDB connected successfully for Attendance');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed for Attendance:', error);
    throw error;
  }
}

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default attendance settings
const defaultSettings = {
  rewardAmount: 500,
  requireImage: false,
  imageRewardBonus: 200,
  minFieldLength: 2,
  enableStreakBonus: true,
  streakBonusMultiplier: 1.5,
  adminNumbers: [],
  autoDetection: true
};

// Load settings from database
let attendanceSettings = { ...defaultSettings };

async function loadSettings() {
  try {
    const settings = await db.collection(COLLECTIONS.SETTINGS).findOne({ type: 'attendance' });
    if (settings) {
      attendanceSettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading attendance settings:', error);
  }
}

// Save settings to database
async function saveSettings() {
  try {
    await db.collection(COLLECTIONS.SETTINGS).replaceOne(
      { type: 'attendance' },
      { type: 'attendance', data: attendanceSettings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving attendance settings:', error);
  }
}

// =======================
// 🎂 BIRTHDAY PARSING UTILITIES
// =======================
const MONTH_NAMES = {
  'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
  'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
  
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
  'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
  
  'sept': 9, 'janu': 1, 'febr': 2
};

function parseBirthday(dobText) {
  if (!dobText || typeof dobText !== 'string') {
    return null;
  }

  const cleaned = dobText.toLowerCase().trim();
  
  const cleanedDOB = cleaned
    .replace(/^(dob|d\.o\.b|date of birth|birthday|born)[:=\s]*/i, '')
    .replace(/[,\s]+$/, '')
    .trim();

  if (!cleanedDOB) return null;

  let day = null, month = null, year = null;

  try {
    let match = cleanedDOB.match(/([a-z]+)\s+(\d{1,2}),?\s*(\d{4})?/i);
    if (match) {
      const monthName = match[1].toLowerCase();
      month = MONTH_NAMES[monthName] || MONTH_NAMES[monthName.substring(0, 3)];
      day = parseInt(match[2]);
      year = match[3] ? parseInt(match[3]) : null;
      
      if (month && day >= 1 && day <= 31) {
        return formatBirthday(day, month, year, cleanedDOB);
      }
    }

    match = cleanedDOB.match(/(\d{1,2})\s+([a-z]+)\s*(\d{4})?/i);
    if (match) {
      day = parseInt(match[1]);
      const monthName = match[2].toLowerCase();
      month = MONTH_NAMES[monthName] || MONTH_NAMES[monthName.substring(0, 3)];
      year = match[3] ? parseInt(match[3]) : null;
      
      if (month && day >= 1 && day <= 31) {
        return formatBirthday(day, month, year, cleanedDOB);
      }
    }

    match = cleanedDOB.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (match) {
      const num1 = parseInt(match[1]);
      const num2 = parseInt(match[2]);
      year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])) : null;

      if (num1 > 12 && num2 <= 12) {
        day = num1;
        month = num2;
      } else if (num2 > 12 && num1 <= 12) {
        month = num1;
        day = num2;
      } else if (num1 <= 12 && num2 <= 12) {
        month = num1;
        day = num2;
      } else {
        return null;
      }

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return formatBirthday(day, month, year, cleanedDOB);
      }
    }

    match = cleanedDOB.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (match) {
      year = parseInt(match[1]);
      month = parseInt(match[2]);
      day = parseInt(match[3]);
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return formatBirthday(day, month, year, cleanedDOB);
      }
    }

    match = cleanedDOB.match(/([a-z]+)\s+(\d{1,2})/i);
    if (match) {
      const monthName = match[1].toLowerCase();
      month = MONTH_NAMES[monthName] || MONTH_NAMES[monthName.substring(0, 3)];
      day = parseInt(match[2]);
      
      if (month && day >= 1 && day <= 31) {
        return formatBirthday(day, month, null, cleanedDOB);
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing birthday:', error);
    return null;
  }
}

function formatBirthday(day, month, year, originalText) {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) {
    return null;
  }

  const formatted = {
    day: day,
    month: month,
    year: year,
    monthName: monthNames[month - 1],
    displayDate: year ? 
      `${monthNames[month - 1]} ${day}, ${year}` : 
      `${monthNames[month - 1]} ${day}`,
    searchKey: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    originalText: originalText,
    parsedAt: new Date().toISOString()
  };

  if (year) {
    const today = new Date();
    let age = today.getFullYear() - year;
    const monthDiff = today.getMonth() + 1 - month;
    const dayDiff = today.getDate() - day;
    
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      age--;
    }
    
    if (age >= 0 && age <= 150) {
      formatted.age = age;
    }
  }

  return formatted;
}

// =======================
// 🗄️ DATABASE FUNCTIONS
// =======================

// Save birthday data to the unified user data
async function saveBirthdayData(userId, name, birthdayData) {
  try {
    if (!birthdayData) return false;

    // The economy plugin's initUser and updateUserData already handle the birthdayData field.
    // We just need to call updateUserData to save it.
    await updateUserData(userId, { birthdayData });

    console.log(`✅ Birthday saved for ${name}: ${birthdayData.displayDate}`);
    return true;
  } catch (error) {
    console.error('Error saving birthday data:', error);
    return false;
  }
}

// Get birthday data from the unified user data
async function getBirthdayData(userId) {
  try {
    const user = await getUserData(userId);
    return user ? user.birthdayData : null;
  } catch (error) {
    console.error('Error getting birthday data:', error);
    return null;
  }
}

// Get all birthdays from the economy users collection
async function getAllBirthdays() {
  try {
    // We get all users from the economy collection who have a birthday defined
    const usersWithBirthdays = await db.collection(COLLECTIONS.USERS).find({ birthdayData: { $ne: null } }).toArray();
    return usersWithBirthdays.map(user => ({ userId: user.userId, birthday: user.birthdayData }));
  } catch (error) {
    console.error('Error getting all birthdays:', error);
    return [];
  }
}

// Save attendance record to a separate collection
async function saveAttendanceRecord(userId, attendanceData) {
  try {
    const record = {
      userId,
      date: attendanceData.date,
      extractedData: attendanceData.extractedData,
      hasImage: attendanceData.hasImage,
      reward: attendanceData.reward,
      streak: attendanceData.streak,
      timestamp: new Date()
    };

    await db.collection(COLLECTIONS.ATTENDANCE_RECORDS).insertOne(record);
    return true;
  } catch (error) {
    console.error('Error saving attendance record:', error);
    return false;
  }
}

// =======================
// 🖼️ IMAGE DETECTION FUNCTIONS
// =======================
function hasImage(message) {
  try {
    if (message.message?.imageMessage) return true;
    if (message.message?.stickerMessage) return true;
    
    if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) return true;
    if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage) return true;
    
    return false;
  } catch (error) {
    console.error('Error checking for image:', error);
    return false;
  }
}

function getImageStatus(hasImg, isRequired) {
  if (isRequired && !hasImg) {
    return "❌ Image required but not found";
  } else if (hasImg) {
    return "📸 Image detected ✅";
  } else {
    return "📸 No image (optional)";
  }
}

// =======================
// 📋 FORM VALIDATION
// =======================
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

  const hasGistHQ = /GIST\s+HQ/i.test(body);
  const hasNameField = /Name[:*]/i.test(body);
  const hasRelationshipField = /Relationship[:*]/i.test(body);

  if (!hasGistHQ || !hasNameField || !hasRelationshipField) {
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
    if (!match || !match[1] || match[1].trim() === '' || match[1].trim().length < attendanceSettings.minFieldLength) {
      validation.missingFields.push(field.fieldName);
    } else if (field.extract) {
      const extractedValue = match[1].trim();
      validation.extractedData[field.name.toLowerCase()] = extractedValue;
      if (field.isBirthday) {
        const parsedBirthday = parseBirthday(extractedValue);
        if (parsedBirthday) {
          validation.extractedData.parsedBirthday = parsedBirthday;
          console.log(`🎂 Birthday parsed successfully: ${parsedBirthday.displayDate}`);
        } else {
          console.log(`⚠️ Could not parse birthday: ${extractedValue}`);
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
  if (!wakeUp1 || !wakeUp1[1] || wakeUp1[1].trim() === '' || wakeUp1[1].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("1:");
  if (!wakeUp2 || !wakeUp2[1] || wakeUp2[1].trim() === '' || wakeUp2[2].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("2:");
  if (!wakeUp3 || !wakeUp3[1] || wakeUp3[1].trim() === '' || wakeUp3[3].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("3:");
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

  if (validation.missingFields.length === 0) {
    validation.isValidForm = true;
  }
  return validation;
}

// =======================
// 📊 STREAK CALCULATION
// =======================
function updateStreak(userId, userData, today) {
  const yesterday = moment.tz('Africa/Lagos').subtract(1, 'day').format('DD-MM-YYYY');
  if (userData.lastAttendance === yesterday) {
    userData.streak = (userData.streak || 0) + 1;
  } else if (userData.lastAttendance !== today) {
    userData.streak = 1;
  }
  if (userData.streak > userData.longestStreak) {
    userData.longestStreak = userData.streak;
  }
}

// =======================
// 🤖 MAIN HANDLER FUNCTIONS
// =======================

export async function onMessage(m, sock, config) {
  try {
    if (!m.body || !config || !config.PREFIX) return;

    if (attendanceSettings.autoDetection && attendanceFormRegex.test(m.body)) {
      await handleAutoAttendance(m, sock, config);
      return;
    }

    if (!m.body.startsWith(config.PREFIX)) return;

    const [command, ...args] = m.body.slice(config.PREFIX.length).trim().split(/\s+/);
    const senderId = m.key.participant || m.key.remoteJid;

    switch (command.toLowerCase()) {
      case 'attendance':
      case 'attend':
      case 'att':
        await handleAttendanceCommand(senderId, sock, m, config, args);
        break;
      case 'attendstats':
      case 'mystats':
        await handleAttendStatsCommand(senderId, sock, m, config);
        break;
      case 'testattendance':
      case 'testatt':
        await handleTestAttendanceCommand(senderId, sock, m, config);
        break;
      case 'mybirthday':
      case 'birthday':
        await handleMyBirthdayCommand(senderId, sock, m, config);
        break;
      case 'setattendance':
        await handleSetAttendanceCommand(senderId, sock, m, config, args);
        break;
      case 'checkbirthdays':
        await handleCheckBirthdaysCommand(senderId, sock, m, config);
        break;
    }
  } catch (error) {
    console.error('❌ Attendance plugin error in onMessage:', error);
  }
}

async function handleAutoAttendance(m, sock, config) {
  const senderId = m.key.participant || m.key.remoteJid;
  const reply = (text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
  
  if (!db) {
    await initDatabase();
    await loadSettings();
  }
  
  const today = moment.tz('Africa/Lagos').format('DD-MM-YYYY');
  
  try {
    const user = await getUserData(senderId);

    if (user.lastAttendance === today) {
      await reply(`✅ *Attendance already recorded for today, ${user.name || 'user'}!*`);
      return;
    }
    
    const hasImg = hasImage(m);
    const validation = validateAttendanceForm(m.body, hasImg);
    
    if (validation.isValidForm) {
      updateStreak(senderId, user, today);
      
      let rewardAmount = attendanceSettings.rewardAmount;
      if (validation.hasImage && attendanceSettings.requireImage) {
        rewardAmount += attendanceSettings.imageRewardBonus;
      }
      if (attendanceSettings.enableStreakBonus && user.streak > 1) {
        rewardAmount = Math.floor(rewardAmount * attendanceSettings.streakBonusMultiplier);
      }
      
      const newBalance = await addMoney(senderId, rewardAmount, 'Attendance reward');
      
      user.lastAttendance = today;
      user.totalAttendances = (user.totalAttendances || 0) + 1;
      user.streak = user.streak;
      user.longestStreak = user.longestStreak;
      user.balance = newBalance;
      
      // Update all user data in a single call to the economy plugin
      await updateUserData(senderId, { 
        lastAttendance: today,
        totalAttendances: user.totalAttendances,
        streak: user.streak,
        longestStreak: user.longestStreak
      });

      // Save attendance record for history
      const attendanceData = {
        date: today,
        extractedData: validation.extractedData,
        hasImage: validation.hasImage,
        reward: rewardAmount,
        streak: user.streak,
      };
      await saveAttendanceRecord(senderId, attendanceData);
      
      // Save birthday if provided
      if (validation.extractedData.parsedBirthday) {
        await saveBirthdayData(senderId, validation.extractedData.name, validation.extractedData.parsedBirthday);
      }
      
      const imageStatus = getImageStatus(hasImg, attendanceSettings.requireImage);
      
      const streakMessage = user.streak > 1 ? `🔥 *Streak: ${user.streak} days*!` : '';
      
      const successMessage = `✅ *Attendance Recorded!*
      
*👤 Name:* ${validation.extractedData.name}
*💵 Reward:* ${ecoSettings.currency}${rewardAmount.toLocaleString()}
${streakMessage}
${imageStatus}
      
Your new balance is ${ecoSettings.currency}${newBalance.toLocaleString()}.`;
      
      await reply(successMessage);
      
    } else {
      const missingFields = validation.missingFields.join('\n');
      const errorMessage = `❌ *Invalid Attendance Form!*
      
Please correct the following:
${missingFields}
      
_The form must start with "GIST HQ" and include "Name", "Relationship", and other required fields with at least ${attendanceSettings.minFieldLength} characters._
      `;
      await reply(errorMessage);
    }
    
  } catch (error) {
    console.error('❌ Error in handleAutoAttendance:', error);
    await reply('❌ *An unexpected error occurred while recording your attendance. Please try again later.*');
  }
}

async function handleAttendanceCommand(senderId, sock, m, config, args) {
  const reply = (text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
  
  await initUser(senderId);
  if (!db) {
    await initDatabase();
    await loadSettings();
  }

  const today = moment.tz('Africa/Lagos').format('DD-MM-YYYY');
  const user = await getUserData(senderId);

  if (user.lastAttendance === today) {
    await reply(`✅ *Attendance already recorded for today, ${user.name || 'user'}!*`);
    return;
  }
  
  const form = `📝 *ATTENDANCE FORM*
*Required Fields:*
GIST HQ
Name:
Location:
Time:
Weather:
Mood:
D.O.B:
Relationship:

1:
2:
3:
${attendanceSettings.requireImage ? '*📸 Image Required*' : '_Image Optional_'}

_Please fill this form and send it in the group to get your daily reward!_`;

  await reply(form);
}

async function handleAttendStatsCommand(senderId, sock, m, config) {
  const reply = (text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
  
  try {
    await initUser(senderId);
    const user = await getUserData(senderId);
    
    if (!user) {
      await reply('⚠️ *User data not found. Please try again.*');
      return;
    }
    
    const statsMessage = `📊 *ATTENDANCE STATS*
      
👤 *Name:* ${user.name || 'Not Set'}
📅 *Last Attendance:* ${user.lastAttendance || 'N/A'}
✅ *Total Attendances:* ${user.totalAttendances}
🔥 *Current Streak:* ${user.streak} days
🏆 *Longest Streak:* ${user.longestStreak} days
      
_You get a bonus for maintaining your streak!_`;
    
    await reply(statsMessage);
    
  } catch (error) {
    console.error('❌ Error in handleAttendStatsCommand:', error);
    await reply('❌ *An unexpected error occurred while fetching your stats. Please try again later.*');
  }
}

async function handleTestAttendanceCommand(senderId, sock, m, config) {
  const reply = (text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
  
  if (!m.body) {
    await reply('❌ Please provide the form content to test it.');
    return;
  }

  const formText = m.body.slice(config.PREFIX.length + 'testattendance'.length).trim();
  const hasImg = hasImage(m);
  const validation = validateAttendanceForm(formText, hasImg);
  
  let result = `*ATTENDANCE FORM VALIDATION RESULT:*
  
*Status:* ${validation.isValidForm ? '✅ Valid' : '❌ Invalid'}
*Image Required:* ${attendanceSettings.requireImage ? 'Yes' : 'No'}
*Image Detected:* ${hasImg ? 'Yes' : 'No'}
*Wake Up Members:* ${validation.hasWakeUpMembers ? '✅ Found' : '❌ Not Found'}
  
*Missing Fields:*
${validation.missingFields.length > 0 ? validation.missingFields.join('\n') : '🎉 None!'}
  
*Errors:*
${validation.errors.length > 0 ? validation.errors.join('\n') : '✅ None!'}
  
*Extracted Data:*
${Object.keys(validation.extractedData).length > 0 ? JSON.stringify(validation.extractedData, null, 2) : 'None'}
  `;

  await reply(result);
}

async function handleMyBirthdayCommand(senderId, sock, m, config) {
  const reply = (text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });

  try {
    await initUser(senderId);
    const user = await getUserData(senderId);
    
    if (!user || !user.birthdayData) {
      await reply('🎂 *You have not set your birthday yet.* Please fill the attendance form with a valid D.O.B to set it.');
      return;
    }

    let birthdayMessage = `🎂 *YOUR BIRTHDAY*
    
*Date:* ${user.birthdayData.displayDate}
*Age:* ${user.birthdayData.age ? user.birthdayData.age : 'Not Provided'}
`;
    
    const today = moment.tz('Africa/Lagos').format('MM-DD');
    if (user.birthdayData.searchKey === today) {
      birthdayMessage += `\n🎉 *Happy Birthday to you today!* 🎉`;
    }
    
    await reply(birthdayMessage);

  } catch (error) {
    console.error('❌ Error in handleMyBirthdayCommand:', error);
    await reply('❌ *An unexpected error occurred while fetching your birthday. Please try again later.*');
  }
}

async function handleSetAttendanceCommand(senderId, sock, m, config, args) {
  const reply = (text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
  
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  const isAdmin = adminNumbers.includes(senderId.split('@')[0]);

  if (!isAdmin) {
    await reply('❌ *You are not authorized to use this command.*');
    return;
  }
  
  if (args.length < 2) {
    await reply(`⚠️ *Usage:* ${config.PREFIX}setattendance [setting] [value]
*Available settings:*
  - rewardAmount [number]
  - requireImage [true/false]
  - imageRewardBonus [number]
  - enableStreakBonus [true/false]
  - streakBonusMultiplier [number]`);
    return;
  }
  
  const setting = args[0];
  let value = args.slice(1).join(' ');
  
  try {
    switch (setting) {
      case 'rewardAmount':
      case 'imageRewardBonus':
      case 'streakBonusMultiplier':
        value = parseFloat(value);
        if (isNaN(value)) {
          await reply(`❌ *Invalid value for ${setting}.* Must be a number.`);
          return;
        }
        attendanceSettings[setting] = value;
        break;
      case 'requireImage':
      case 'enableStreakBonus':
        value = value.toLowerCase() === 'true';
        attendanceSettings[setting] = value;
        break;
      default:
        await reply(`❌ *Unknown setting:* ${setting}`);
        return;
    }
    
    await saveSettings();
    await reply(`✅ *Attendance setting '${setting}' updated to ${value}.*`);

  } catch (error) {
    console.error('❌ Error in handleSetAttendanceCommand:', error);
    await reply('❌ *An error occurred while updating settings. Please try again.*');
  }
}

async function handleCheckBirthdaysCommand(senderId, sock, m, config) {
  const reply = (text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
  
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  const isAdmin = adminNumbers.includes(senderId.split('@')[0]);

  if (!isAdmin) {
    await reply('❌ *You are not authorized to use this command.*');
    return;
  }

  try {
    const today = moment.tz('Africa/Lagos').format('MM-DD');
    const allUsers = await db.collection(COLLECTIONS.USERS).find({ 'birthdayData.searchKey': today }).toArray();

    if (allUsers.length > 0) {
      const birthdayList = allUsers.map(user => {
        const number = user.userId.split('@')[0];
        const age = user.birthdayData.age ? ` (${user.birthdayData.age} years old)` : '';
        return `🎉 @${number} ${age}`;
      }).join('\n');
      
      const message = `🎂 *HAPPY BIRTHDAY!* 🎉
      
The following people are celebrating their birthday today:
${birthdayList}
      `;
      
      await sock.sendMessage(m.key.remoteJid, { text: message, mentions: allUsers.map(u => u.userId) });
    } else {
      await reply('🙁 *No birthdays today.*');
    }

  } catch (error) {
    console.error('❌ Error checking birthdays:', error);
    await reply('❌ *An error occurred while checking for birthdays.*');
  }
}

// Ensure database connection is initialized when the plugin loads
initDatabase().then(() => {
  loadSettings();
}).catch(err => {
  console.error('❌ Failed to initialize attendance plugin:', err);
});
