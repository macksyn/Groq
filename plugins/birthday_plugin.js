// plugins/birthday.js - Birthday plugin compatible with PluginManager
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// ===================================
// 🎂 Plugin Information
// ===================================
export const info = {
  name: 'Birthday System',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Advanced birthday management with reminders and unified database support.',
  commands: [
    {
      name: 'setbirthday',
      aliases: ['setbday'],
      description: 'Set your birthday. E.g., !setbirthday Dec 12 1995',
      usage: `${config.PREFIX}setbirthday <date>`
    },
    {
      name: 'mybirthday',
      aliases: ['bday', 'mybday'],
      description: 'View your saved birthday.',
      usage: `${config.PREFIX}mybirthday`
    },
    {
      name: 'upcomingbirthdays',
      aliases: ['upcomingbday'],
      description: 'View upcoming birthdays in the next 30 days.',
      usage: `${config.PREFIX}upcomingbirthdays`
    },
  ]
};

// ===================================
// 🎂 DATE PARSING LOGIC
// (Copied and adapted from the old plugin)
// ===================================
const MONTH_NAMES = {
  'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
  'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
  'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
  'sept': 9, 'janu': 1, 'febr': 2
};

/**
 * Parses a string to extract birthday information.
 * @param {string} dobText - The input string containing the date of birth.
 * @returns {object|null} An object with parsed birthday data, or null on failure.
 */
function parseBirthday(dobText) {
  if (!dobText || typeof dobText !== 'string') { return null; }

  const cleaned = dobText.toLowerCase().trim()
    .replace(/^(dob|d\.o\.b|date of birth|birthday|born)[:=\s]*/i, '')
    .replace(/[,\s]+$/, '')
    .trim();

  if (!cleaned) return null;

  let day = null, month = null, year = null;

  try {
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

    match = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (match) {
      const num1 = parseInt(match[1]);
      const num2 = parseInt(match[2]);
      year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])) : null;
      if (num1 > 12 && num2 <= 12) { day = num1; month = num2; }
      else if (num2 > 12 && num1 <= 12) { month = num1; day = num2; }
      else if (num1 <= 12 && num2 <= 12) { month = num1; day = num2; }
      else { return null; }
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return formatBirthday(day, month, year, cleaned);
      }
    }

    match = cleaned.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (match) {
      year = parseInt(match[1]);
      month = parseInt(match[2]);
      day = parseInt(match[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return formatBirthday(day, month, year, cleaned);
      }
    }

    match = cleaned.match(/([a-z]+)\s+(\d{1,2})/i);
    if (match) {
      const monthName = match[1].toLowerCase();
      month = MONTH_NAMES[monthName] || MONTH_NAMES[monthName.substring(0, 3)];
      day = parseInt(match[2]);
      if (month && day >= 1 && day <= 31) {
        return formatBirthday(day, month, null, cleaned);
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing birthday:', error);
    return null;
  }
}

/**
 * Formats parsed birthday data into a structured object.
 * @param {number} day - The day of the month.
 * @param {number} month - The month of the year.
 * @param {number|null} year - The year of birth, or null.
 * @param {string} originalText - The original input string.
 * @returns {object|null} The formatted birthday object.
 */
function formatBirthday(day, month, year, originalText) {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) { return null; }

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
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) { age--; }
    if (age >= 0 && age <= 150) { formatted.age = age; }
  }

  return formatted;
}

// ===================================
// 🗄️ DATABASE INTERACTION
// (Using the provided unifiedUserManager)
// ===================================

/**
 * Saves a user's birthday to the shared database.
 * @param {string} userId - The unique ID of the user.
 * @param {object} birthdayData - The formatted birthday data object.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
async function saveBirthday(userId, birthdayData) {
  try {
    const user = await unifiedUserManager.initUser(userId);
    await unifiedUserManager.updateUserData(userId, { birthdayData });
    console.log(`✅ Birthday saved for ${userId}: ${birthdayData.displayDate}`);
    return true;
  } catch (error) {
    console.error('Error saving birthday:', error);
    return false;
  }
}

/**
 * Retrieves a user's birthday from the shared database.
 * @param {string} userId - The unique ID of the user.
 * @returns {Promise<object|null>} The birthday data object, or null.
 */
async function getBirthday(userId) {
  try {
    const user = await unifiedUserManager.getUserData(userId);
    return user ? user.birthdayData : null;
  } catch (error) {
    console.error('Error getting birthday:', error);
    return null;
  }
}

/**
 * Gets all users with a saved birthday from the database.
 * @returns {Promise<Array<object>>} An array of user objects with birthday data.
 */
async function getAllBirthdays() {
  try {
    const users = await unifiedUserManager.getAllUsers();
    return users.filter(user => user.birthdayData).map(user => ({
      userId: user.userId,
      name: user.name || user.userId,
      birthday: user.birthdayData
    }));
  } catch (error) {
    console.error('Error getting all birthdays:', error);
    return [];
  }
}

// ===================================
// 🤖 PLUGIN HANDLERS
// ===================================

/**
 * Handles the 'setbirthday' command.
 * @param {object} context - The context object from the PluginManager.
 * @param {Array<string>} args - The command arguments.
 */
async function handleSetBirthday(context, args) {
  const { senderId, reply } = context;
  const birthdayText = args.join(' ');
  if (!birthdayText) {
    await reply(`❌ Please provide a date. E.g., *${context.config.PREFIX}setbirthday December 12 1995*`);
    return;
  }

  const birthdayData = parseBirthday(birthdayText);
  if (!birthdayData) {
    await reply('❌ Invalid date format. Please try again with a valid date (e.g., Dec 12, 1995 or 12/12/1995).');
    return;
  }

  const success = await saveBirthday(senderId, birthdayData);
  if (success) {
    await reply(`✅ Your birthday has been set to: *${birthdayData.displayDate}*`);
  } else {
    await reply('❌ An error occurred while saving your birthday. Please try again.');
  }
}

/**
 * Handles the 'mybirthday' command.
 * @param {object} context - The context object from the PluginManager.
 */
async function handleMyBirthday(context) {
  const { senderId, reply } = context;
  const birthdayData = await getBirthday(senderId);

  if (birthdayData) {
    let response = `🎉 Your birthday is set to: *${birthdayData.displayDate}*`;
    if (birthdayData.year) {
      response += `\n\n🎈 You are currently ${birthdayData.age} years old.`;
    }
    await reply(response);
  } else {
    await reply(`❌ You have not set your birthday yet. Use *${context.config.PREFIX}setbirthday* to set it.`);
  }
}

/**
 * Handles the 'upcomingbirthdays' command.
 * @param {object} context - The context object from the PluginManager.
 */
async function handleUpcomingBirthdays(context) {
    const { reply } = context;
    const allBirthdays = await getAllBirthdays();
    const now = moment().tz('Africa/Lagos');
    const upcoming = [];

    allBirthdays.forEach(user => {
        const userBirthday = moment(`${now.year()}-${user.birthday.month}-${user.birthday.day}`, 'YYYY-M-D');
        if (userBirthday.isBefore(now)) {
            userBirthday.add(1, 'year');
        }

        const daysUntil = userBirthday.diff(now, 'days');
        if (daysUntil <= 30 && daysUntil >= 0) {
            upcoming.push({ ...user, daysUntil });
        }
    });

    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

    if (upcoming.length > 0) {
        let message = '📅 *UPCOMING BIRTHDAYS (Next 30 Days)* 📅\n\n';
        upcoming.forEach(user => {
            const dateStr = user.birthday.displayDate;
            const daysStr = user.daysUntil === 0 ? 'Today!' : `${user.daysUntil} day(s)`;
            message += `-> *${user.name}* - ${dateStr} (${daysStr})\n`;
        });
        await reply(message);
    } else {
        await reply('❌ No upcoming birthdays found in the next 30 days.');
    }
}

/**
 * Main entry point for the plugin, dispatched by the PluginManager.
 * @param {object} context - The full context object with bot, message, and plugin-specific data.
 */
async function main(context) {
  const { args, reply } = context;
  if (args.length === 0) {
    await reply(`
🎂 *BIRTHDAY SYSTEM* 🎂
Commands:
*${context.config.PREFIX}setbirthday <date>* - Set your birthday.
*${context.config.PREFIX}mybirthday* - View your birthday.
*${context.config.PREFIX}upcomingbirthdays* - See upcoming birthdays.
    `);
    return;
  }

  const subCommand = args[0].toLowerCase();
  const subArgs = args.slice(1);

  switch (subCommand) {
    case 'setbirthday':
    case 'setbday':
      await handleSetBirthday(context, subArgs);
      break;
    case 'mybirthday':
    case 'bday':
    case 'mybday':
      await handleMyBirthday(context);
      break;
    case 'upcomingbirthdays':
    case 'upcomingbday':
      await handleUpcomingBirthdays(context);
      break;
    default:
      await reply(`❌ Unknown subcommand: *${subCommand}*`);
      break;
  }
}

// ===================================
// 🤖 PLUGIN EXPORTS
// ===================================
export default main;
