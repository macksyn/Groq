// plugins/birthday.js - Birthday plugin compatible with PluginManager
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';
import { isAdmin, isOwner } from '../lib/helpers.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// =======================
// Plugin Information
// =======================
export const info = {
  name: 'Birthday System',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Birthday management with reminders, auto-wishes, and unified database support.',
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
    }
    // Add more commands here if needed
  ]
};

// =======================
// 🎂 BIRTHDAY PARSING UTILITIES (Adapted from attendance_plugin)
// =======================
const MONTH_NAMES = {
  'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
  'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
  'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
  'sept': 9, 'janu': 1, 'febr': 2
};

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
    logger.error('Error parsing birthday:', error);
    return null;
  }
}

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

// =======================
// 🗄️ DATABASE FUNCTIONS
// =======================
async function saveBirthday(userId, birthdayData) {
  try {
    const user = await unifiedUserManager.initUser(userId);
    user.birthdayData = birthdayData;
    await unifiedUserManager.updateUserData(userId, { birthdayData });
    logger.info(`✅ Birthday saved for ${userId}: ${birthdayData.displayDate}`);
    return true;
  } catch (error) {
    logger.error('Error saving birthday:', error);
    return false;
  }
}

async function getBirthday(userId) {
  try {
    const user = await unifiedUserManager.getUserData(userId);
    return user ? user.birthdayData : null;
  } catch (error) {
    logger.error('Error getting birthday:', error);
    return null;
  }
}

async function getAllBirthdays() {
  try {
    const users = await unifiedUserManager.getAllUsers();
    return users.filter(user => user.birthdayData).map(user => ({
      userId: user.userId,
      name: user.name || user.userId, // Assume user has a name or use userId
      birthday: user.birthdayData
    }));
  } catch (error) {
    logger.error('Error getting all birthdays:', error);
    return [];
  }
}

// =======================
// 🎂 WISH & REMINDER MESSAGES
// =======================
function getBirthdayWishMessage(birthdayPerson) {
  const wishes = [
    `🎉🎂 HAPPY BIRTHDAY ${birthdayPerson.name.toUpperCase()}! 🎂🎉`,
    `🎊 Happy Birthday to our amazing ${birthdayPerson.name}! 🎊`,
    `🌟 It's ${birthdayPerson.name}'s Birthday! 🌟`,
  ];
  const randomWish = wishes[Math.floor(Math.random() * wishes.length)];
  let message = randomWish;
  if (birthdayPerson.birthday.age !== undefined) {
    message += `\n\n🎈 Celebrating ${birthdayPerson.birthday.age} wonderful years! 🎈`;
  }
  return message;
}

function getReminderMessage(birthdayPerson, daysUntil) {
  let message;
  if (daysUntil === 1) {
    message = `🎂 *BIRTHDAY REMINDER* 🎂\n\n📅 Tomorrow is ${birthdayPerson.name}'s birthday!`;
  } else {
    message = `🎂 *BIRTHDAY REMINDER* 🎂\n\n📅 ${birthdayPerson.name}'s birthday is in ${daysUntil} days!`;
  }
  if (birthdayPerson.birthday.age !== undefined) {
    const upcomingAge = birthdayPerson.birthday.age + 1;
    message += `\n\n🎈 They'll be turning ${upcomingAge}! 🎈`;
  }
  return message;
}

// =======================
// 🤖 PLUGIN HANDLER
// =======================
async function handleSetBirthday(context, args) {
  const { senderId, reply } = context;
  const birthdayText = args.join(' ');
  if (!birthdayText) {
    await reply(`❌ Please provide a date. E.g., *${config.PREFIX}setbirthday December 12 1995*`);
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
    await reply(`❌ You have not set your birthday yet. Use *${config.PREFIX}setbirthday* to set it.`);
  }
}

async function handleUpcomingBirthdays(context) {
    const { reply } = context;
    const allBirthdays = await getAllBirthdays();
    const now = moment.tz('Africa/Lagos');
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
            const daysStr = user.daysUntil === 0 ? 'Today!' : `${user.daysUntil} days`;
            message += `-> *${user.name}* - ${dateStr} (${daysStr})\n`;
        });
        await reply(message);
    } else {
        await reply('❌ No upcoming birthdays found in the next 30 days.');
    }
}

async function main(context) {
  const { args, reply, senderId, sock, message } = context;
  if (args.length === 0) {
    await reply(`
🎂 *BIRTHDAY SYSTEM* 🎂
Commands:
*${config.PREFIX}setbirthday <date>* - Set your birthday.
*${config.PREFIX}mybirthday* - View your birthday.
*${config.PREFIX}upcomingbirthdays* - See upcoming birthdays.
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

// =======================
// 🤖 PLUGIN EXPORTS
// =======================
export default main;
