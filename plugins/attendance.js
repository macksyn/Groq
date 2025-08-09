// plugins/attendance.js - Attendance system for Fresh WhatsApp Bot
import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import { PermissionHelpers, TimeHelpers } from '../lib/helpers.js';
import { COMMAND_CATEGORIES } from '../lib/constants.js';
import { initUser, getUserData, updateUserData, addMoney } from './economy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Database paths
const dbPath = path.join(__dirname, '..', 'temp', 'attendance.json');
const settingsPath = path.join(__dirname, '..', 'temp', 'attendance_settings.json');

// Ensure temp directory exists
const tempDir = path.dirname(dbPath);
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Initialize database
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ birthdays: {}, attendanceRecords: [] }, null, 2));
}

// Default attendance settings
const defaultSettings = {
  rewardAmount: 500,
  requireImage: false,
  imageRewardBonus: 200,
  minFieldLength: 2,
  enableStreakBonus: true,
  streakBonusMultiplier: 1.5,
  adminNumbers: []
};

// Load settings
let attendanceSettings = defaultSettings;
if (fs.existsSync(settingsPath)) {
  try {
    const loadedSettings = JSON.parse(fs.readFileSync(settingsPath));
    attendanceSettings = { ...defaultSettings, ...loadedSettings };
  } catch (error) {
    console.error('Error loading attendance settings:', error);
  }
}

// Save settings
function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(attendanceSettings, null, 2));
  } catch (error) {
    console.error('Error saving attendance settings:', error);
  }
}

// Load database
function loadDatabase() {
  try {
    return JSON.parse(fs.readFileSync(dbPath));
  } catch (error) {
    console.error('Error loading database:', error);
    return { birthdays: {}, attendanceRecords: [] };
  }
}

// Save database
function saveDatabase(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Month names mapping for birthday parsing
const MONTH_NAMES = {
  'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
  'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
  'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12
};

// Parse birthday from text
function parseBirthday(dobText) {
  if (!dobText || typeof dobText !== 'string') {
    return null;
  }

  const cleaned = dobText.toLowerCase().trim()
    .replace(/^(dob|d\.o\.b|date of birth|birthday|born)[:=\s]*/i, '')
    .replace(/[,\s]+$/, '')
    .trim();

  if (!cleaned) return null;

  let day = null, month = null, year = null;

  try {
    // Pattern 1: Month Day, Year (e.g., "December 12, 1995")
    let match = cleaned.match(/([a-z]+)\s+(\d{1,2}),?\s*(\d{4})?/i);
    if (match) {
      const monthName = match[1].toLowerCase();
      month = MONTH_NAMES[monthName] || MONTH_NAMES[monthName.substring(0, 3)];
      day = parseInt(match[2]);
      year = match[3] ? parseInt(match[3]) : null;
      
      if (month && day >= 1 && day <= 31) {
        return formatBirthday(day, month, year, cleaned);
      }
    }

    // Pattern 2: Day Month Year (e.g., "12 December 1995")
    match = cleaned.match(/(\d{1,2})\s+([a-z]+)\s*(\d{4})?/i);
    if (match) {
      day = parseInt(match[1]);
      const monthName = match[2].toLowerCase();
      month = MONTH_NAMES[monthName] || MONTH_NAMES[monthName.substring(0, 3)];
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
        return formatBirthday(day, month, year, cleaned);
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing birthday:', error);
    return null;
  }
}

// Format birthday data
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

// Save birthday data
function saveBirthdayData(userId, name, birthdayData) {
  try {
    if (!birthdayData) return false;

    const db = loadDatabase();
    
    db.birthdays[userId] = {
      name: name,
      birthday: birthdayData,
      lastUpdated: new Date().toISOString(),
      userId: userId
    };

    updateUserData(userId, { birthdayData: birthdayData });
    saveDatabase(db);
    
    console.log(`✅ Birthday saved for ${name}: ${birthdayData.displayDate}`);
    return true;
  } catch (error) {
    console.error('Error saving birthday data:', error);
    return false;
  }
}

// Get birthday data
function getBirthdayData(userId) {
  try {
    const db = loadDatabase();
    return db.birthdays?.[userId] || null;
  } catch (error) {
    console.error('Error getting birthday data:', error);
    return null;
  }
}

// Get all birthdays
function getAllBirthdays() {
  try {
    const db = loadDatabase();
    return db.birthdays || {};
  } catch (error) {
    console.error('Error getting all birthdays:', error);
    return {};
  }
}

// Check if message has image
function hasImage(m) {
  try {
    if (m.type === 'imageMessage') return true;
    if (m.type === 'stickerMessage') return true;
    if (m.quoted && (m.quoted.type === 'imageMessage' || m.quoted.type === 'stickerMessage')) return true;
    return false;
  } catch (error) {
    console.error('Error checking for image:', error);
    return false;
  }
}

// Validate attendance form
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
        }
      }
    }
  });

  // Check wake up members
  const wakeUpPatterns = [/1[:]\s*(.+)/i, /2[:]\s*(.+)/i, /3[:]\s*(.+)/i];
  let missingWakeUps = [];
  const wakeUpMembers = [];

  wakeUpPatterns.forEach((pattern, index) => {
    const match = body.match(pattern);
    if (!match || !match[1] || match[1].trim() === '' || match[1].trim().length < attendanceSettings.minFieldLength) {
      missingWakeUps.push(`${index + 1}:`);
    } else {
      wakeUpMembers.push(match[1].trim());
    }
  });

  if (missingWakeUps.length > 0) {
    validation.missingFields.push(`🔔 Wake up members (${missingWakeUps.join(", ")})`);
  } else {
    validation.hasWakeUpMembers = true;
    validation.extractedData.wakeUpMembers = wakeUpMembers;
  }

  validation.isValidForm = validation.missingFields.length === 0;
  return validation;
}

// Update streak
function updateStreak(userId) {
  const userData = getUserData(userId);
  const today = moment.tz('Africa/Lagos').format('DD-MM-YYYY');
  const yesterday = moment.tz('Africa/Lagos').subtract(1, 'day').format('DD-MM-YYYY');

  let newStreak = 1;
  if (userData.lastAttendance === yesterday) {
    newStreak = userData.streak + 1;
  } else if (userData.lastAttendance !== today) {
    newStreak = 1;
  }

  const newLongestStreak = newStreak > userData.longestStreak ? newStreak : userData.longestStreak;

  updateUserData(userId, {
    streak: newStreak,
    longestStreak: newLongestStreak
  });

  return newStreak;
}

// Check if user is authorized
async function isAuthorized(sock, from, sender, config) {
  if (PermissionHelpers.isOwner(sender, config.OWNER_NUMBER + '@s.whatsapp.net')) {
    return true;
  }
  
  if (attendanceSettings.adminNumbers.includes(sender)) {
    return true;
  }
  
  try {
    if (from.endsWith('@g.us')) {
      const metadata = await sock.groupMetadata(from);
      const participant = metadata.participants.find(p => p.id === sender);
      return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    }
  } catch (error) {
    console.error('Error checking group admin:', error);
  }
  
  return false;
}

// Auto-detection handler for attendance forms
async function handleAutoAttendance(m, sock, config) {
  const messageText = m.body || '';
  
  // Check if message matches attendance form pattern
  const attendanceFormRegex = /GIST\s+HQ.*?Name[:*].*?Relationship[:*]/is;
  if (!attendanceFormRegex.test(messageText)) {
    return false;
  }
  
  console.log('✅ Attendance form detected!');
  
  const userId = m.sender;
  const today = moment.tz('Africa/Lagos').format('DD-MM-YYYY');
  
  initUser(userId);
  const userData = getUserData(userId);
  
  // Check if already marked today
  if (userData.lastAttendance === today) {
    await m.reply('📝 You\'ve already marked your attendance today! Come back tomorrow.');
    return true;
  }
  
  const messageHasImage = hasImage(m);
  const validation = validateAttendanceForm(messageText, messageHasImage);
  
  if (!validation.isValidForm) {
    let errorMessage = '📋 *INCOMPLETE ATTENDANCE FORM* 📋\n\n';
    errorMessage += '❌ Please complete the following fields:\n\n';
    
    validation.missingFields.forEach((field, index) => {
      errorMessage += `${index + 1}. ${field}\n`;
    });
    
    errorMessage += '\n💡 *Please fill out all required fields and try again.*';
    
    await m.reply(errorMessage);
    return true;
  }
  
  // Update attendance
  const currentStreak = updateStreak(userId);
  
  updateUserData(userId, {
    lastAttendance: today,
    totalAttendances: userData.totalAttendances + 1
  });
  
  // Save birthday if extracted
  let birthdayMessage = '';
  if (validation.extractedData.parsedBirthday && validation.extractedData.name) {
    const birthdaySaved = saveBirthdayData(
      userId, 
      validation.extractedData.name, 
      validation.extractedData.parsedBirthday
    );
    
    if (birthdaySaved) {
      birthdayMessage = `\n🎂 Birthday saved: ${validation.extractedData.parsedBirthday.displayDate}`;
      if (validation.extractedData.parsedBirthday.age !== undefined) {
        birthdayMessage += ` (Age: ${validation.extractedData.parsedBirthday.age})`;
      }
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
  
  // Add money using economy system
  addMoney(userId, finalReward, 'Attendance reward');
  
  const updatedUserData = getUserData(userId);
  
  let successMessage = '✅ *ATTENDANCE APPROVED!* ✅\n\n';
  successMessage += '📋 Form completed successfully!\n';
  successMessage += `💸 Reward: ₦${finalReward.toLocaleString()}\n`;
  successMessage += `💰 New balance: ₦${updatedUserData.balance.toLocaleString()}\n`;
  successMessage += `🔥 Current streak: ${currentStreak} days\n`;
  successMessage += `📊 Total attendances: ${updatedUserData.totalAttendances}\n`;
  successMessage += `🏆 Longest streak: ${updatedUserData.longestStreak} days`;
  successMessage += birthdayMessage;
  successMessage += '\n\n🎉 *Thank you for your consistent participation!*';
  
  await m.reply(successMessage);
  return true;
}

// Main attendance plugin
export default async function attendancePlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase().split(' ')[0];
  const args = m.body.split(' ').slice(1);
  
  // Auto-detect attendance forms first
  if (await handleAutoAttendance(m, sock, config)) {
    return;
  }
  
  // Manual attendance commands
  if (cmd === `${prefix}attendance` || cmd === `${prefix}attend`) {
    if (args.length === 0) {
      await showAttendanceMenu(m);
      return;
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
      case 'stats':
        await handleStats(m);
        break;
      case 'settings':
        await handleSettings(m, sock, config, args.slice(1));
        break;
      case 'test':
        await handleTest(m, args.slice(1));
        break;
      case 'testbirthday':
        await handleTestBirthday(m, args.slice(1));
        break;
      case 'mybirthday':
        await handleMyBirthday(m);
        break;
      case 'allbirthdays':
        await handleAllBirthdays(m, sock, config);
        break;
      case 'help':
        await showAttendanceMenu(m);
        break;
      default:
        await m.reply(`❓ Unknown attendance command: *${subCommand}*\n\nUse *${prefix}attendance help* to see available commands.`);
    }
  }
}

// Show attendance menu
async function showAttendanceMenu(m) {
  const menuText = `📋 *ATTENDANCE SYSTEM* 📋

📊 *User Commands:*
• *stats* - View your attendance stats
• *mybirthday* - View your birthday info
• *test [form]* - Test attendance form
• *testbirthday [date]* - Test birthday parsing

👑 *Admin Commands:*
• *settings* - View/modify settings
• *allbirthdays* - View all member birthdays

🤖 *Auto-Detection:*
Just send your GIST HQ attendance form and it will be automatically processed!

💡 *Usage:* ${m.body.split(' ')[0]} [command]`;
  
  await m.reply(menuText);
}

// Handle stats command
async function handleStats(m) {
  initUser(m.sender);
  const userData = getUserData(m.sender);
  const birthdayData = getBirthdayData(m.sender);
  const today = moment.tz('Africa/Lagos').format('DD-MM-YYYY');
  
  let statsMessage = '📊 *YOUR ATTENDANCE STATS* 📊\n\n';
  statsMessage += `📅 Last attendance: ${userData.lastAttendance || 'Never'}\n`;
  statsMessage += `📋 Total attendances: ${userData.totalAttendances}\n`;
  statsMessage += `🔥 Current streak: ${userData.streak} days\n`;
  statsMessage += `🏆 Longest streak: ${userData.longestStreak} days\n`;
  statsMessage += `✅ Today's status: ${userData.lastAttendance === today ? 'Marked ✅' : 'Not marked ❌'}\n`;
  statsMessage += `💰 Current balance: ₦${userData.balance.toLocaleString()}\n`;
  statsMessage += `🏦 Bank balance: ₦${userData.bank.toLocaleString()}\n`;
  
  if (birthdayData) {
    statsMessage += `🎂 Birthday: ${birthdayData.birthday.displayDate}`;
    if (birthdayData.birthday.age !== undefined) {
      statsMessage += ` (Age: ${birthdayData.birthday.age})`;
    }
    statsMessage += '\n';
  }
  
  if (userData.streak >= 7) {
    statsMessage += `\n🌟 *Amazing! You're on fire with a ${userData.streak}-day streak!*`;
  } else if (userData.streak >= 3) {
    statsMessage += '\n🔥 *Great job! Keep the streak going!*';
  }
  
  await m.reply(statsMessage);
}

// Handle settings command
async function handleSettings(m, sock, config, args) {
  const isAdminUser = await isAuthorized(sock, m.from, m.sender, config);
  if (!isAdminUser) {
    await m.reply('🚫 Only admins can use this command.');
    return;
  }
  
  if (args.length === 0) {
    let settingsMessage = '⚙️ *ATTENDANCE SETTINGS* ⚙️\n\n';
    settingsMessage += `💰 Reward Amount: ₦${attendanceSettings.rewardAmount.toLocaleString()}\n`;
    settingsMessage += `📸 Require Image: ${attendanceSettings.requireImage ? 'Yes ✅' : 'No ❌'}\n`;
    settingsMessage += `💎 Image Bonus: ₦${attendanceSettings.imageRewardBonus.toLocaleString()}\n`;
    settingsMessage += `🔥 Streak Bonus: ${attendanceSettings.enableStreakBonus ? 'Enabled ✅' : 'Disabled ❌'}\n`;
    settingsMessage += `📈 Streak Multiplier: ${attendanceSettings.streakBonusMultiplier}x\n\n`;
    settingsMessage += '*Available Settings:* reward, image, imagebonus, streak, multiplier';
    
    await m.reply(settingsMessage);
    return;
  }
  
  const setting = args[0].toLowerCase();
  const value = args[1];
  
  let responseText = "";
  
  switch (setting) {
    case 'reward':
      if (!value || isNaN(value)) {
        responseText = '⚠️ Invalid reward amount. Usage: settings reward 1000';
      } else {
        attendanceSettings.rewardAmount = parseInt(value);
        saveSettings();
        responseText = `✅ Attendance reward set to ₦${parseInt(value).toLocaleString()}`;
      }
      break;
      
    case 'image':
      if (['on', 'true', 'yes'].includes(value)) {
        attendanceSettings.requireImage = true;
        saveSettings();
        responseText = '✅ Image requirement enabled 📸';
      } else if (['off', 'false', 'no'].includes(value)) {
        attendanceSettings.requireImage = false;
        saveSettings();
        responseText = '✅ Image requirement disabled';
      } else {
        responseText = '⚠️ Invalid value. Use: on/off';
      }
      break;
      
    case 'imagebonus':
      if (!value || isNaN(value)) {
        responseText = '⚠️ Invalid bonus amount. Usage: settings imagebonus 200';
      } else {
        attendanceSettings.imageRewardBonus = parseInt(value);
        saveSettings();
        responseText = `✅ Image bonus set to ₦${parseInt(value).toLocaleString()}`;
      }
      break;
      
    case 'streak':
      if (['on', 'true', 'yes'].includes(value)) {
        attendanceSettings.enableStreakBonus = true;
        saveSettings();
        responseText = '✅ Streak bonus enabled 🔥';
      } else if (['off', 'false', 'no'].includes(value)) {
        attendanceSettings.enableStreakBonus = false;
        saveSettings();
        responseText = '✅ Streak bonus disabled';
      } else {
        responseText = '⚠️ Invalid value. Use: on/off';
      }
      break;
      
    case 'multiplier':
      if (!value || isNaN(value)) {
        responseText = '⚠️ Invalid multiplier. Usage: settings multiplier 2.0';
      } else {
        attendanceSettings.streakBonusMultiplier = parseFloat(value);
        saveSettings();
        responseText = `✅ Streak multiplier set to ${parseFloat(value)}x`;
      }
      break;
      
    default:
      responseText = '⚠️ Unknown setting. Available: reward, image, imagebonus, streak, multiplier';
  }
  
  await m.reply(responseText);
}

// Handle test command
async function handleTest(m, args) {
  const testText = args.join(' ');
  
  if (!testText) {
    await m.reply('🔍 *Attendance Form Test*\n\nUsage: test [paste your attendance form]\n\nThis will validate your form without submitting it.');
    return;
  }
  
  const messageHasImage = hasImage(m);
  const validation = validateAttendanceForm(testText, messageHasImage);
  
  let result = '🔍 *Form Validation Results:*\n\n';
  result += `✅ Form complete: ${validation.isValidForm ? 'YES' : 'NO'}\n`;
  result += `📸 Image detected: ${messageHasImage ? '✅' : '❌'}\n`;
  
  if (validation.extractedData.parsedBirthday) {
    result += `🎂 Birthday parsed: ${validation.extractedData.parsedBirthday.displayDate}\n`;
  }
  
  if (!validation.isValidForm) {
    result += `\n❌ Missing fields:\n`;
    validation.missingFields.forEach((field, index) => {
      result += `   ${index + 1}. ${field}\n`;
    });
  } else {
    result += '\n🎉 *Ready to submit!*';
  }
  
  await m.reply(result);
}

// Handle test birthday command
async function handleTestBirthday(m, args) {
  const testDate = args.join(' ');
  
  if (!testDate) {
    await m.reply('🎂 *Birthday Parser Test*\n\nUsage: testbirthday [date]\n\nExamples:\n• testbirthday December 12, 1995\n• testbirthday 12/12/1995\n• testbirthday 12 December');
    return;
  }
  
  const parsed = parseBirthday(testDate);
  
  let result = `🎂 *Birthday Parser Results*\n\nInput: "${testDate}"\n\n`;
  
  if (parsed) {
    result += `✅ *Successfully Parsed!*\n\n`;
    result += `📅 Display: ${parsed.displayDate}\n`;
    result += `📊 Day: ${parsed.day}, Month: ${parsed.month}\n`;
    if (parsed.year) result += `📊 Year: ${parsed.year}\n`;
    if (parsed.age !== undefined) result += `🎈 Age: ${parsed.age} years\n`;
  } else {
    result += `❌ *Could not parse the date*\n\n`;
    result += `💡 Try formats like: Dec 12, 1995 or 12/12/1995`;
  }
  
  await m.reply(result);
}

// Handle my birthday command
async function handleMyBirthday(m) {
  const birthdayData = getBirthdayData(m.sender);
  
  if (!birthdayData) {
    await m.reply('🎂 *No Birthday Recorded*\n\nYour birthday will be saved when you submit an attendance form with a valid D.O.B field.');
    return;
  }
  
  const birthday = birthdayData.birthday;
  let message = `🎂 *Your Birthday Information*\n\n`;
  message += `👤 Name: ${birthdayData.name}\n`;
  message += `📅 Birthday: ${birthday.displayDate}\n`;
  
  if (birthday.age !== undefined) {
    message += `🎈 Age: ${birthday.age} years old\n`;
  }
  
  // Calculate days until next birthday
  const today = new Date();
  const thisYear = today.getFullYear();
  const nextBirthday = new Date(thisYear, birthday.month - 1, birthday.day);
  
  if (nextBirthday < today) {
    nextBirthday.setFullYear(thisYear + 1);
  }
  
  const daysUntil = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
  
  if (daysUntil === 0) {
    message += `\n🎉 *IT'S YOUR BIRTHDAY TODAY!* 🎉`;
  } else if (daysUntil === 1) {
    message += `\n🎂 *Your birthday is TOMORROW!*`;
  } else if (daysUntil <= 7) {
    message += `\n🗓 *Your birthday is in ${daysUntil} days!*`;
  } else {
    message += `\n📅 Days until birthday: ${daysUntil}`;
  }
  
  await m.reply(message);
}

// Handle all birthdays command
async function handleAllBirthdays(m, sock, config) {
  const isAdminUser = await isAuthorized(sock, m.from, m.sender, config);
  if (!isAdminUser) {
    await m.reply('🚫 Only admins can view all birthdays.');
    return;
  }
  
  const allBirthdays = getAllBirthdays();
  const birthdayEntries = Object.values(allBirthdays);
  
  if (birthdayEntries.length === 0) {
    await m.reply('🎂 *No Birthdays Recorded*\n\nNo birthdays have been saved yet.');
    return;
  }
  
  // Sort by month and day
  birthdayEntries.sort((a, b) => {
    if (a.birthday.month !== b.birthday.month) {
      return a.birthday.month - b.birthday.month;
    }
    return a.birthday.day - b.birthday.day;
  });
  
  let messageText = `🎂 *ALL MEMBER BIRTHDAYS*\n\n`;
  messageText += `📊 Total: ${birthdayEntries.length} members\n\n`;
  
  let currentMonth = '';
  birthdayEntries.forEach(entry => {
    const birthday = entry.birthday;
    
    if (currentMonth !== birthday.monthName) {
      currentMonth = birthday.monthName;
      messageText += `\n📅 *${currentMonth}*\n`;
    }
    
    messageText += `• ${entry.name} - ${birthday.monthName} ${birthday.day}`;
    if (birthday.age !== undefined) {
      messageText += ` (${birthday.age} yrs)`;
    }
    messageText += '\n';
  });
  
  // Find upcoming birthdays
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
    
    if (daysUntil <= 30) {
      upcomingBirthdays.push({
        name: entry.name,
        daysUntil: daysUntil
      });
    }
  });
  
  if (upcomingBirthdays.length > 0) {
    upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);
    
    messageText += `\n\n🎉 *UPCOMING (Next 30 Days)*\n`;
    upcomingBirthdays.forEach(upcoming => {
      if (upcoming.daysUntil === 0) {
        messageText += `🎊 ${upcoming.name} - TODAY!\n`;
      } else if (upcoming.daysUntil === 1) {
        messageText += `🎂 ${upcoming.name} - Tomorrow\n`;
      } else {
        messageText += `📅 ${upcoming.name} - ${upcoming.daysUntil} days\n`;
      }
    });
  }
  
  await m.reply(messageText);
}

// Plugin metadata
export const info = {
  name: 'Attendance System',
  version: '1.0.0',
  author: 'Fresh Bot Team',
  description: 'Comprehensive attendance system with form validation, streak tracking, birthday parsing, and rewards',
  category: COMMAND_CATEGORIES.UTILITY,
  commands: [
    {
      name: 'attendance',
      description: 'Attendance system with auto-detection and management',
      usage: '.attendance [stats|settings|test|mybirthday|allbirthdays]',
      aliases: ['attend']
    }
  ],
  features: [
    '🤖 Auto-detection of GIST HQ attendance forms',
    '📊 Streak tracking and statistics',
    '🎂 Birthday parsing and storage',
    '💰 Economic rewards integration',
    '📸 Optional image requirement',
    '👑 Admin settings management',
    '🔍 Form testing and validation',
    '📅 Birthday reminders and tracking'
  ],
  autoDetect: true // This plugin has auto-detection capabilities
};