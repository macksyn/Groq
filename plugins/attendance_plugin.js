// plugins/attendance.js - Attendance plugin compatible with PluginManager
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Attendance System',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Advanced attendance system with form validation, streaks, and MongoDB persistence',
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
    }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
const COLLECTIONS = {
  USERS: 'attendance_users',
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
    await db.collection(COLLECTIONS.USERS).createIndex({ userId: 1 }, { unique: true });
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
  // Full month names
  'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
  'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
  
  // Short month names
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
  'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
  
  // Alternative spellings
  'sept': 9, 'janu': 1, 'febr': 2
};

function parseBirthday(dobText) {
  if (!dobText || typeof dobText !== 'string') {
    return null;
  }

  const cleaned = dobText.toLowerCase().trim();
  
  // Remove common prefixes and suffixes
  const cleanedDOB = cleaned
    .replace(/^(dob|d\.o\.b|date of birth|birthday|born)[:=\s]*/i, '')
    .replace(/[,\s]+$/, '')
    .trim();

  if (!cleanedDOB) return null;

  let day = null, month = null, year = null;

  try {
    // Pattern 1: Month Day, Year (e.g., "December 12, 1995" or "Dec 12, 1995")
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

    // Pattern 2: Day Month Year (e.g., "12 December 1995" or "12 Dec 1995")
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

    // Pattern 3: MM/DD/YYYY or DD/MM/YYYY or MM/DD or DD/MM
    match = cleanedDOB.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (match) {
      const num1 = parseInt(match[1]);
      const num2 = parseInt(match[2]);
      year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])) : null;

      // Heuristic: if first number > 12, it's likely DD/MM, otherwise MM/DD
      if (num1 > 12 && num2 <= 12) {
        day = num1;
        month = num2;
      } else if (num2 > 12 && num1 <= 12) {
        month = num1;
        day = num2;
      } else if (num1 <= 12 && num2 <= 12) {
        // Ambiguous case - assume MM/DD (common format)
        month = num1;
        day = num2;
      } else {
        return null; // Both numbers > 12, invalid
      }

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return formatBirthday(day, month, year, cleanedDOB);
      }
    }

    // Pattern 4: YYYY-MM-DD or YYYY/MM/DD
    match = cleanedDOB.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (match) {
      year = parseInt(match[1]);
      month = parseInt(match[2]);
      day = parseInt(match[3]);
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return formatBirthday(day, month, year, cleanedDOB);
      }
    }

    // Pattern 5: Just month and day (e.g., "Dec 12", "December 12")
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

  // Validate day for the specific month
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) {
    return null; // Invalid day for the month
  }

  const formatted = {
    day: day,
    month: month,
    year: year,
    monthName: monthNames[month - 1],
    displayDate: year ? 
      `${monthNames[month - 1]} ${day}, ${year}` : 
      `${monthNames[month - 1]} ${day}`,
    searchKey: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, // MM-DD for easy searching
    originalText: originalText,
    parsedAt: new Date().toISOString()
  };

  // Calculate age if year is provided
  if (year) {
    const today = new Date();
    let age = today.getFullYear() - year;
    const monthDiff = today.getMonth() + 1 - month;
    const dayDiff = today.getDate() - day;
    
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      age--;
    }
    
    if (age >= 0 && age <= 150) { // Reasonable age range
      formatted.age = age;
    }
  }

  return formatted;
}

// =======================
// 🗄️ DATABASE FUNCTIONS
// =======================

// Get user data from unified manager
async function getUserData(userId) {
  try {
    return await unifiedUserManager.getUserData(userId);
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
}

// Update user data via unified manager
async function updateUserData(userId, data) {
  try {
    return await unifiedUserManager.updateUserData(userId, data);
  } catch (error) {
    console.error('Error updating user data:', error);
    throw error;
  }
}

// Initialize user via unified manager
async function initUser(userId) {
  try {
    return await unifiedUserManager.initUser(userId);
  } catch (error) {
    console.error('Error initializing user:', error);
    throw error;
  }
}

// Add money to user balance (integrates with economy plugin via unified manager)
async function addMoney(userId, amount, reason = 'Attendance reward') {
  try {
    return await unifiedUserManager.addMoney(userId, amount, reason);
  } catch (error) {
    console.error('Error adding money:', error);
    throw error;
  }
}

// Save birthday data to database (for birthday plugin to use)
async function saveBirthdayData(userId, name, birthdayData) {
  try {
    if (!birthdayData) return false;

    // Check if user already has birthday data
    const existingRecord = await db.collection(COLLECTIONS.BIRTHDAYS).findOne({ userId });
    
    let updateType = 'new';
    let finalName = name;
    
    if (existingRecord) {
      // User already has birthday data
      const existingBirthday = existingRecord.birthday;
      const newBirthday = birthdayData;
      
      // Check if the birthday data is the same (same month and day)
      const isSameBirthday = existingBirthday.month === newBirthday.month && 
                            existingBirthday.day === newBirthday.day;
      
      if (isSameBirthday) {
        // Same birthday - just update the name if it's more complete
        updateType = 'name_update';
        
        // Keep the more complete name (longer or has more info)
        if (name.length > existingRecord.name.length || 
            (name.includes(' ') && !existingRecord.name.includes(' '))) {
          finalName = name;
          console.log(`📝 Updating name from "${existingRecord.name}" to "${name}"`);
        } else {
          finalName = existingRecord.name;
          console.log(`📝 Keeping existing name "${existingRecord.name}"`);
        }
        
        // Keep the year if the existing record has it and new one doesn't
        if (existingBirthday.year && !newBirthday.year) {
          birthdayData.year = existingBirthday.year;
          birthdayData.age = existingBirthday.age;
          birthdayData.displayDate = existingBirthday.displayDate;
        }
      } else {
        // Different birthday - this might be an error or correction
        updateType = 'birthday_change';
        console.log(`⚠️ Birthday change detected for ${existingRecord.name}:`);
        console.log(`   Old: ${existingBirthday.displayDate}`);
        console.log(`   New: ${newBirthday.displayDate}`);
        
        // Use the new data but keep a record of the change
        finalName = name;
      }
    } else {
      // New user birthday record
      updateType = 'new';
      console.log(`🆕 New birthday record for ${name}`);
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
        name: name,
        birthday: birthdayData,
        timestamp: new Date()
      }]
    };

    await db.collection(COLLECTIONS.BIRTHDAYS).replaceOne(
      { userId },
      birthdayRecord,
      { upsert: true }
    );

    // Also save to user data
    await updateUserData(userId, { 
      birthdayData,
      displayName: finalName // Store the most complete name
    });

    let logMessage = '';
    switch (updateType) {
      case 'new':
        logMessage = `✅ Birthday saved for ${finalName}: ${birthdayData.displayDate}`;
        break;
      case 'name_update':
        logMessage = `✅ Birthday updated for ${finalName}: ${birthdayData.displayDate}`;
        break;
      case 'birthday_change':
        logMessage = `⚠️ Birthday changed for ${finalName}: ${birthdayData.displayDate}`;
        break;
    }
    
    console.log(logMessage);
    return { success: true, updateType, finalName };
    
  } catch (error) {
    console.error('Error saving birthday data:', error);
    return { success: false, error: error.message };
  }
}

// Save attendance record to database
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
    // Check for image in current message
    if (message.message?.imageMessage) return true;
    if (message.message?.stickerMessage) return true;
    
    // Check for image in quoted message
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

  // Simple check for GIST HQ text
  const hasGistHQ = /GIST\s+HQ/i.test(body);
  const hasNameField = /Name[:*]/i.test(body);
  const hasRelationshipField = /Relationship[:*]/i.test(body);

  if (!hasGistHQ || !hasNameField || !hasRelationshipField) {
    validation.errors.push("❌ Invalid attendance form format");
    return validation;
  }

  // Check image requirement
  if (attendanceSettings.requireImage && !hasImg) {
    validation.missingFields.push("📸 Image (required)");
  }

  // Define required fields with extraction
  const requiredFields = [
    { name: "Name", pattern: /Name[:*]\s*(.+)/i, fieldName: "👤 Name", extract: true },
    { name: "Location", pattern: /Location[:*]\s*(.+)/i, fieldName: "🌍 Location", extract: true },
    { name: "Time", pattern: /Time[:*]\s*(.+)/i, fieldName: "⌚ Time", extract: true },
    { name: "Weather", pattern: /Weather[:*]\s*(.+)/i, fieldName: "🌥 Weather", extract: true },
    { name: "Mood", pattern: /Mood[:*]\s*(.+)/i, fieldName: "❤️‍🔥 Mood", extract: true },
    { name: "DOB", pattern: /D\.O\.B[:*]\s*(.+)/i, fieldName: "🗓 D.O.B", extract: true, isBirthday: true },
    { name: "Relationship", pattern: /Relationship[:*]\s*(.+)/i, fieldName: "👩‍❤️‍👨 Relationship", extract: true }
  ];

  // Check each required field and extract data
  requiredFields.forEach(field => {
    const match = body.match(field.pattern);
    if (!match || !match[1] || match[1].trim() === '' || match[1].trim().length < attendanceSettings.minFieldLength) {
      validation.missingFields.push(field.fieldName);
    } else if (field.extract) {
      const extractedValue = match[1].trim();
      validation.extractedData[field.name.toLowerCase()] = extractedValue;
      
      // Special handling for birthday
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

  // Check wake up members section
  const wakeUpPattern1 = /1[:]\s*(.+)/i;
  const wakeUpPattern2 = /2[:]\s*(.+)/i;
  const wakeUpPattern3 = /3[:]\s*(.+)/i;

  const wakeUp1 = body.match(wakeUpPattern1);
  const wakeUp2 = body.match(wakeUpPattern2);
  const wakeUp3 = body.match(wakeUpPattern3);

  let missingWakeUps = [];
  if (!wakeUp1 || !wakeUp1[1] || wakeUp1[1].trim() === '' || wakeUp1[1].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("1:");
  if (!wakeUp2 || !wakeUp2[1] || wakeUp2[1].trim() === '' || wakeUp2[1].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("2:");
  if (!wakeUp3 || !wakeUp3[1] || wakeUp3[1].trim() === '' || wakeUp3[1].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("3:");

  if (missingWakeUps.length > 0) {
    validation.missingFields.push(`🔔 Wake up members (${missingWakeUps.join(", ")})`);
  } else {
    validation.hasWakeUpMembers = true;
    // Extract wake up members
    validation.extractedData.wakeUpMembers = [
      wakeUp1[1].trim(),
      wakeUp2[1].trim(),
      wakeUp3[1].trim()
    ];
  }

  // Check if form is complete
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

  if (userData.streak > (userData.longestStreak || 0)) {
    userData.longestStreak = userData.streak;
  }

  return userData.streak;
}

// Get current Nigeria time
function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

// Get current date in Nigeria timezone
function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

// Check if user is authorized (admin or group admin)
async function isAuthorized(sock, from, sender) {
  // Check if user is in admin list
  if (attendanceSettings.adminNumbers.includes(sender.split('@')[0])) {
    return true;
  }
  
  // Check owner/admin from environment
  const ownerNumber = process.env.OWNER_NUMBER || '';
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  
  if (sender.split('@')[0] === ownerNumber || adminNumbers.includes(sender.split('@')[0])) {
    return true;
  }
  
  // Check if user is group admin
  try {
    if (!from.endsWith('@g.us')) return false;
    
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(participant => participant.admin === 'admin' || participant.admin === 'superadmin')
      .map(participant => participant.id);

    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking group admin:', error);
    return false;
  }
}

// Auto-detection handler for attendance forms
async function handleAutoAttendance(m, sock, config) {
  try {
    const messageText = m.body || '';
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    
    // Check if message matches attendance form pattern
    if (!attendanceFormRegex.test(messageText)) {
      return false; // Not an attendance form
    }
    
    console.log('✅ Attendance form detected!');
    
    const today = getCurrentDate();
    
    // Initialize user
    await initUser(senderId);
    const userData = await getUserData(senderId);
    
    // Check if already marked attendance today
    if (userData.lastAttendance === today) {
      await sock.sendMessage(from, {
        text: `📝 You've already marked your attendance today! Come back tomorrow.`
      }, { quoted: m });
      return true;
    }
    
    // Check for image
    const messageHasImage = hasImage(m);
    console.log('Image detection result:', messageHasImage);
    
    // Validate the form completion and extract data
    const validation = validateAttendanceForm(messageText, messageHasImage);
    
    if (!validation.isValidForm) {
      let errorMessage = `📋 *INCOMPLETE ATTENDANCE FORM* 📋\n\n`;
      errorMessage += `❌ Please complete the following fields:\n\n`;
      
      validation.missingFields.forEach((field, index) => {
        errorMessage += `${index + 1}. ${field}\n`;
      });
      
      errorMessage += `\n💡 *Please fill out all required fields and try again.*\n`;
      errorMessage += `📝 Make sure to:\n`;
      errorMessage += `• Fill your personal details completely\n`;
      errorMessage += `• Wake up 3 members (1:, 2:, 3:)\n`;
      
      if (attendanceSettings.requireImage) {
        errorMessage += `• Include an image with your attendance\n`;
      }
      
      errorMessage += `• Don't leave any field empty\n\n`;
      errorMessage += `✨ *Complete the form properly to mark your attendance!*`;
      
      await sock.sendMessage(from, {
        text: errorMessage
      }, { quoted: m });
      return true;
    }
    
    // Update attendance record
    const currentStreak = updateStreak(senderId, userData, today);
    
    // Update user data with new attendance info
    await updateUserData(senderId, {
      lastAttendance: today,
      totalAttendances: (userData.totalAttendances || 0) + 1,
      streak: currentStreak,
      longestStreak: userData.longestStreak
    });
    
    // Save birthday data if extracted successfully (for birthday plugin to use)
    let birthdayMessage = '';
    if (validation.extractedData.parsedBirthday && validation.extractedData.name) {
      const birthdayResult = await saveBirthdayData(
        senderId, 
        validation.extractedData.name, 
        validation.extractedData.parsedBirthday
      );
      
      if (birthdayResult.success) {
        switch (birthdayResult.updateType) {
          case 'new':
            birthdayMessage = `\n🎂 Birthday saved: ${validation.extractedData.parsedBirthday.displayDate}`;
            break;
          case 'name_update':
            birthdayMessage = `\n🎂 Birthday confirmed: ${validation.extractedData.parsedBirthday.displayDate}`;
            break;
          case 'birthday_change':
            birthdayMessage = `\n🎂 Birthday updated: ${validation.extractedData.parsedBirthday.displayDate}`;
            break;
        }
        
        if (validation.extractedData.parsedBirthday.age !== undefined) {
          birthdayMessage += ` (Age: ${validation.extractedData.parsedBirthday.age})`;
        }
      }
    }
    
    // Calculate reward
    let finalReward = attendanceSettings.rewardAmount;
    
    // Add image bonus if image is present
    if (messageHasImage && attendanceSettings.imageRewardBonus > 0) {
      finalReward += attendanceSettings.imageRewardBonus;
    }
    
    // Apply streak bonus
    if (attendanceSettings.enableStreakBonus && currentStreak >= 3) {
      finalReward = Math.floor(finalReward * attendanceSettings.streakBonusMultiplier);
    }
    
    // Add money to user's wallet
    await addMoney(senderId, finalReward, 'Attendance reward');
    
    // Save attendance record
    await saveAttendanceRecord(senderId, {
      date: today,
      extractedData: validation.extractedData,
      hasImage: messageHasImage,
      reward: finalReward,
      streak: currentStreak
    });
    
    // Build reward message
    let rewardBreakdown = `💸 Reward: ₦${finalReward.toLocaleString()}`;
    let bonusDetails = [];
    
    if (messageHasImage && attendanceSettings.imageRewardBonus > 0) {
      bonusDetails.push(`+₦${attendanceSettings.imageRewardBonus} image bonus`);
    }
    
    if (attendanceSettings.enableStreakBonus && currentStreak >= 3) {
      bonusDetails.push(`${Math.floor((attendanceSettings.streakBonusMultiplier - 1) * 100)}% streak bonus`);
    }
    
    if (bonusDetails.length > 0) {
      rewardBreakdown += ` (${bonusDetails.join(', ')})`;
    }
    
    // Get updated user data for display
    const updatedUserData = await getUserData(senderId);
    
    // Success message
    let successMessage = `✅ *ATTENDANCE APPROVED!* ✅\n\n`;
    successMessage += `📋 Form completed successfully!\n`;
    successMessage += `${getImageStatus(messageHasImage, attendanceSettings.requireImage)}\n`;
    successMessage += rewardBreakdown + '\n';
    successMessage += `💰 New wallet balance: ₦${(updatedUserData.balance || 0).toLocaleString()}\n`;
    successMessage += `🔥 Current streak: ${currentStreak} days\n`;
    successMessage += `📊 Total attendances: ${updatedUserData.totalAttendances}\n`;
    successMessage += `🏆 Longest streak: ${updatedUserData.longestStreak} days`;
    successMessage += birthdayMessage;
    successMessage += `\n\n🎉 *Thank you for your consistent participation!*\n`;
    successMessage += `🧾 *Keep it up!*`;
    
    await sock.sendMessage(from, {
      text: successMessage
    }, { quoted: m });
    
    return true;
  } catch (error) {
    console.error('Error in auto attendance handler:', error);
    return false;
  }
}

// Main plugin handler function
export default async function attendanceHandler(m, sock, config) {
  try {
    // Initialize database connection
    if (!db) {
      await initDatabase();
      await loadSettings();
    }
    
    // Auto-detect attendance forms if enabled
    if (attendanceSettings.autoDetection && m.body && !m.body.startsWith(config.PREFIX)) {
      const handled = await handleAutoAttendance(m, sock, config);
      if (handled) return; // Form was processed, exit early
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
      case 'attendance':
      case 'attend':
      case 'att':
        if (args.length === 1) {
          await showAttendanceMenu(reply, config.PREFIX);
        } else {
          await handleSubCommand(args[1], args.slice(2), { m, sock, config, senderId, from, reply });
        }
        break;
        
      case 'attendstats':
      case 'mystats':
        await handleStats({ m, sock, config, senderId, from, reply });
        break;
        
      case 'testattendance':
      case 'testatt':
        await handleTest({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
    }
  } catch (error) {
    console.error('❌ Attendance plugin error:', error);
  }
}

// Handle subcommands for the main attendance command
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
      await showAttendanceMenu(context.reply, context.config.PREFIX);
      break;
    default:
      await context.reply(`❓ Unknown attendance command: *${subCommand}*\n\nUse *${context.config.PREFIX}attendance help* to see available commands.`);
  }
}

// Show attendance menu
async function showAttendanceMenu(reply, prefix) {
  const menuText = `📋 *ATTENDANCE SYSTEM* 📋\n\n` +
                  `📊 *User Commands:*\n` +
                  `• *stats* - View your attendance stats\n` +
                  `• *test [form]* - Test attendance form\n` +
                  `• *testbirthday [date]* - Test birthday parsing\n` +
                  `• *records* - View your attendance history\n\n` +
                  `👑 *Admin Commands:*\n` +
                  `• *settings* - View/modify settings\n\n` +
                  `🤖 *Auto-Detection:*\n` +
                  `Just send your GIST HQ attendance form and it will be automatically processed!\n\n` +
                  `💡 *Usage:* ${prefix}attendance [command]`;
  
  await reply(menuText);
}

// Handle stats command
async function handleStats(context) {
  const { reply, senderId } = context;
  
  try {
    await initUser(senderId);
    const userData = await getUserData(senderId);
    const today = getCurrentDate();
    
    let statsMessage = `📊 *YOUR ATTENDANCE STATS* 📊\n\n`;
    statsMessage += `📅 Last attendance: ${userData.lastAttendance || 'Never'}\n`;
    statsMessage += `📋 Total attendances: ${userData.totalAttendances || 0}\n`;
    statsMessage += `🔥 Current streak: ${userData.streak || 0} days\n`;
    statsMessage += `🏆 Longest streak: ${userData.longestStreak || 0} days\n`;
    statsMessage += `✅ Today's status: ${userData.lastAttendance === today ? 'Marked ✅' : 'Not marked ❌'}\n`;
    statsMessage += `💰 Current balance: ₦${(userData.balance || 0).toLocaleString()}\n`;
    statsMessage += `📸 Image required: ${attendanceSettings.requireImage ? 'Yes' : 'No'}\n`;
    
    const streak = userData.streak || 0;
    if (streak >= 7) {
      statsMessage += `\n🌟 *Amazing! You're on fire with a ${streak}-day streak!*`;
    } else if (streak >= 3) {
      statsMessage += `\n🔥 *Great job! Keep the streak going!*`;
    } else {
      statsMessage += `\n💪 *Mark your attendance daily to build a streak!*`;
    }
    
    await reply(statsMessage);
  } catch (error) {
    await reply('❌ *Error loading stats. Please try again.*');
    console.error('Stats error:', error);
  }
}

// Handle settings command
async function handleSettings(context, args) {
  const { reply, senderId, sock, m } = context;
  
  const isAdminUser = await isAuthorized(sock, m.key.remoteJid, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can use this command.');
    return;
  }
  
  try {
    if (args.length === 0) {
      let settingsMessage = `⚙️ *ATTENDANCE SETTINGS* ⚙️\n\n`;
      settingsMessage += `💰 Reward Amount: ₦${attendanceSettings.rewardAmount.toLocaleString()}\n`;
      settingsMessage += `📸 Require Image: ${attendanceSettings.requireImage ? 'Yes ✅' : 'No ❌'}\n`;
      settingsMessage += `💎 Image Bonus: ₦${attendanceSettings.imageRewardBonus.toLocaleString()}\n`;
      settingsMessage += `📏 Min Field Length: ${attendanceSettings.minFieldLength}\n`;
      settingsMessage += `🔥 Streak Bonus: ${attendanceSettings.enableStreakBonus ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `📈 Streak Multiplier: ${attendanceSettings.streakBonusMultiplier}x\n`;
      settingsMessage += `🤖 Auto Detection: ${attendanceSettings.autoDetection ? 'Enabled ✅' : 'Disabled ❌'}\n\n`;
      settingsMessage += `*📋 Usage Commands:*\n`;
      settingsMessage += `• \`${context.config.PREFIX}attendance settings reward 1000\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}attendance settings image on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}attendance settings imagebonus 200\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}attendance settings streak on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}attendance settings multiplier 2.0\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}attendance settings minlength 3\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}attendance settings autodetect on/off\``;
      
      await reply(settingsMessage);
      return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args[1];
    
    let responseText = "";
    
    switch (setting) {
      case 'reward':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid reward amount. Use: ${context.config.PREFIX}attendance settings reward 1000`;
        } else {
          attendanceSettings.rewardAmount = parseInt(value);
          await saveSettings();
          responseText = `✅ Attendance reward set to ₦${parseInt(value).toLocaleString()}`;
        }
        break;
        
      case 'image':
        if (value === 'on' || value === 'true' || value === 'yes') {
          attendanceSettings.requireImage = true;
          await saveSettings();
          responseText = "✅ Image requirement enabled 📸\n\n*Users must now include an image with their attendance form.*";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          attendanceSettings.requireImage = false;
          await saveSettings();
          responseText = "✅ Image requirement disabled\n\n*Images are now optional for attendance.*";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}attendance settings image on/off`;
        }
        break;
        
      case 'imagebonus':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid bonus amount. Use: ${context.config.PREFIX}attendance settings imagebonus 200`;
        } else {
          attendanceSettings.imageRewardBonus = parseInt(value);
          await saveSettings();
          responseText = `✅ Image bonus reward set to ₦${parseInt(value).toLocaleString()}\n\n*Users will get extra ₦${parseInt(value).toLocaleString()} when they include images.*`;
        }
        break;
        
      case 'streak':
        if (value === 'on' || value === 'true' || value === 'yes') {
          attendanceSettings.enableStreakBonus = true;
          await saveSettings();
          responseText = "✅ Streak bonus enabled 🔥\n\n*Users will get bonus rewards for maintaining streaks.*";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          attendanceSettings.enableStreakBonus = false;
          await saveSettings();
          responseText = "✅ Streak bonus disabled\n\n*No more streak bonuses will be applied.*";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}attendance settings streak on/off`;
        }
        break;
        
      case 'multiplier':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid multiplier. Use: ${context.config.PREFIX}attendance settings multiplier 2.0`;
        } else {
          attendanceSettings.streakBonusMultiplier = parseFloat(value);
          await saveSettings();
          responseText = `✅ Streak bonus multiplier set to ${parseFloat(value)}x`;
        }
        break;
        
      case 'minlength':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid field length. Use: ${context.config.PREFIX}attendance settings minlength 3`;
        } else {
          attendanceSettings.minFieldLength = parseInt(value);
          await saveSettings();
          responseText = `✅ Minimum field length set to ${parseInt(value)} characters`;
        }
        break;
        
      case 'autodetect':
        if (value === 'on' || value === 'true' || value === 'yes') {
          attendanceSettings.autoDetection = true;
          await saveSettings();
          responseText = "✅ Auto-detection enabled 🤖\n\n*Attendance forms will be automatically detected and processed.*";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          attendanceSettings.autoDetection = false;
          await saveSettings();
          responseText = "✅ Auto-detection disabled\n\n*Users will need to use commands to mark attendance.*";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}attendance settings autodetect on/off`;
        }
        break;
        
      default:
        responseText = "⚠️ Unknown setting. Available options:\n• reward\n• image\n• imagebonus\n• streak\n• multiplier\n• minlength\n• autodetect";
    }
    
    await reply(responseText);
  } catch (error) {
    await reply('❌ *Error updating settings. Please try again.*');
    console.error('Settings error:', error);
  }
}

// Handle test command
async function handleTest(context, args) {
  const { reply, m } = context;
  const testText = args.join(' ');
  
  if (!testText) {
    await reply(`🔍 *Attendance Form Test*\n\nUsage: ${context.config.PREFIX}attendance test [paste your attendance form]\n\nThis will validate your form without submitting it.\n\n📸 *Image Detection:* Include an image with your test message to test image detection.\n🎂 *Birthday Parsing:* The D.O.B field will be tested for birthday extraction.`);
    return;
  }
  
  try {
    const hasGistHQ = /GIST\s+HQ/i.test(testText);
    const hasNameField = /Name[:*]/i.test(testText);
    const hasRelationshipField = /Relationship[:*]/i.test(testText);
    const messageHasImage = hasImage(m);
    
    let result = `🔍 *Form Detection Results:*\n\n`;
    result += `📋 GIST HQ header: ${hasGistHQ ? '✅' : '❌'}\n`;
    result += `👤 Name field: ${hasNameField ? '✅' : '❌'}\n`;
    result += `👩‍❤️‍👨 Relationship field: ${hasRelationshipField ? '✅' : '❌'}\n`;
    result += `📸 Image detected: ${messageHasImage ? '✅' : '❌'}\n`;
    result += `📸 Image required: ${attendanceSettings.requireImage ? 'Yes' : 'No'}\n\n`;
    
    if (hasGistHQ && hasNameField && hasRelationshipField) {
      result += `🎉 *Form structure detected!*\n\n`;
      
      const validation = validateAttendanceForm(testText, messageHasImage);
      result += `📝 *Validation Results:*\n`;
      result += `✅ Form complete: ${validation.isValidForm ? 'YES' : 'NO'}\n`;
      result += `📸 Image status: ${getImageStatus(messageHasImage, attendanceSettings.requireImage)}\n`;
      
      // Test birthday parsing
      if (validation.extractedData.dob) {
        result += `\n🎂 *Birthday Parsing Test:*\n`;
        result += `📝 D.O.B Input: "${validation.extractedData.dob}"\n`;
        
        if (validation.extractedData.parsedBirthday) {
          const birthday = validation.extractedData.parsedBirthday;
          result += `✅ Successfully parsed!\n`;
          result += `📅 Parsed as: ${birthday.displayDate}\n`;
          if (birthday.age !== undefined) {
            result += `🎈 Age: ${birthday.age} years old\n`;
          }
          result += `💾 *This data would be saved for the birthday plugin*\n`;
        } else {
          result += `❌ Could not parse birthday\n`;
          result += `💡 Try formats like: Dec 12, 1995 or 12/12/1995\n`;
        }
      }
      
      if (!validation.isValidForm) {
        result += `\n❌ Missing fields (${validation.missingFields.length}):\n`;
        validation.missingFields.forEach((field, index) => {
          result += `   ${index + 1}. ${field}\n`;
        });
      } else {
        result += `\n🎉 *Ready to submit!*`;
        let potentialReward = attendanceSettings.rewardAmount;
        if (messageHasImage && attendanceSettings.imageRewardBonus > 0) {
          potentialReward += attendanceSettings.imageRewardBonus;
        }
        result += `\n💰 *Potential reward: ₦${potentialReward.toLocaleString()}*`;
        
        if (validation.extractedData.parsedBirthday) {
          result += `\n🎂 *Birthday will be saved/updated for user (prevents duplicates)*`;
        }
      }
    } else {
      result += `❌ *Form structure not detected*\nMake sure you're using the correct GIST HQ attendance format.`;
    }
    
    await reply(result);
  } catch (error) {
    await reply('❌ *Error testing form. Please try again.*');
    console.error('Test error:', error);
  }
}

// Handle test birthday command
async function handleTestBirthday(context, args) {
  const { reply } = context;
  const testDate = args.join(' ');
  
  if (!testDate) {
    await reply(`🎂 *Birthday Parser Test*\n\nUsage: ${context.config.PREFIX}attendance testbirthday [date]\n\nExamples:\n• ${context.config.PREFIX}attendance testbirthday December 12, 1995\n• ${context.config.PREFIX}attendance testbirthday Dec 12\n• ${context.config.PREFIX}attendance testbirthday 12/12/1995\n• ${context.config.PREFIX}attendance testbirthday 12 December\n• ${context.config.PREFIX}attendance testbirthday 2000-12-12`);
    return;
  }
  
  try {
    const parsed = parseBirthday(testDate);
    
    let result = `🎂 *Birthday Parser Results*\n\n`;
    result += `📝 Input: "${testDate}"\n\n`;
    
    if (parsed) {
      result += `✅ *Successfully Parsed!*\n\n`;
      result += `📅 Display Date: ${parsed.displayDate}\n`;
      result += `📊 Day: ${parsed.day}\n`;
      result += `📊 Month: ${parsed.month} (${parsed.monthName})\n`;
      if (parsed.year) {
        result += `📊 Year: ${parsed.year}\n`;
      }
      if (parsed.age !== undefined) {
        result += `🎈 Age: ${parsed.age} years old\n`;
      }
      result += `🔍 Search Key: ${parsed.searchKey}\n`;
      result += `⏰ Parsed At: ${new Date(parsed.parsedAt).toLocaleString()}\n\n`;
      result += `💾 *This data would be saved for the birthday plugin to use.*`;
    } else {
      result += `❌ *Could not parse the date*\n\n`;
      result += `💡 *Supported Formats:*\n`;
      result += `• Month Day, Year (December 12, 1995)\n`;
      result += `• Day Month Year (12 December 1995)\n`;
      result += `• MM/DD/YYYY or DD/MM/YYYY\n`;
      result += `• YYYY-MM-DD\n`;
      result += `• Short names (Dec, Jan, Feb, etc.)\n`;
      result += `• Just month and day (Dec 12)\n\n`;
      result += `🔧 *Try different formats or check for typos.*`;
    }
    
    await reply(result);
  } catch (error) {
    await reply('❌ *Error testing birthday parser. Please try again.*');
    console.error('Test birthday error:', error);
  }
}

// Handle attendance records command
async function handleAttendanceRecords(context, args) {
  const { reply, senderId } = context;
  
  try {
    const limit = args[0] ? parseInt(args[0]) : 10;
    const limitValue = Math.min(Math.max(limit, 1), 50); // Between 1 and 50
    
    const records = await db.collection(COLLECTIONS.ATTENDANCE_RECORDS)
      .find({ userId: senderId })
      .sort({ timestamp: -1 })
      .limit(limitValue)
      .toArray();
    
    if (records.length === 0) {
      await reply(`📋 *No Attendance Records*\n\nYou haven't marked any attendance yet. Submit your GIST HQ attendance form to get started!`);
      return;
    }
    
    let recordsText = `📋 *YOUR ATTENDANCE HISTORY* 📋\n\n`;
    recordsText += `📊 Showing last ${records.length} records:\n\n`;
    
    records.forEach((record, index) => {
      recordsText += `${index + 1}. 📅 ${record.date}\n`;
      recordsText += `   💰 Reward: ₦${record.reward.toLocaleString()}\n`;
      recordsText += `   🔥 Streak: ${record.streak} days\n`;
      recordsText += `   📸 Image: ${record.hasImage ? 'Yes' : 'No'}\n`;
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

// Export functions for use by other plugins (like economy and birthday)
export { 
  parseBirthday, 
  saveBirthdayData,
  attendanceSettings,
  addMoney,
  getUserData,
  updateUserData,
  initUser
};
