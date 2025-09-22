// plugins/birthday.js - Birthday plugin compatible with PluginManager
import moment from 'moment-timezone';
import cron from 'node-cron';
import { PluginHelpers } from '../lib/pluginIntegration.js';

const isConnectionHealthy = global.isConnectionHealthy || (() => true);
const safeSend = global.sendMessageSafely || ((sock, jid, msg) => sock.sendMessage(jid, msg));

export const info = {
  name: 'Birthday System',
  version: '2.1.0',
  author: 'Alex Macksyn',
  description: 'Advanced birthday system with reminders, wishes, and MongoDB integration',
  commands: [
    { name: 'birthday', aliases: ['bday', 'birthdays'], description: 'Access the birthday system' },
    { name: 'mybirthday', aliases: ['mybday'], description: 'View your birthday information' }
  ]
};

const COLLECTIONS = {
  BIRTHDAYS: 'birthdays',
  BIRTHDAY_SETTINGS: 'birthday_settings',
  BIRTHDAY_WISHES: 'birthday_wishes',
  BIRTHDAY_REMINDERS: 'birthday_reminders',
  CUSTOM_WISHES: 'custom_wishes'
};

moment.tz.setDefault('Africa/Lagos');

const defaultSettings = {
  enableReminders: true,
  enableAutoWishes: true,
  enablePrivateWishes: true,
  reminderDays: [7, 3, 1],
  reminderTime: '09:00',
  wishTime: '00:01',
  enableGroupReminders: true,
  enablePrivateReminders: true,
  reminderGroups: [],
  adminNumbers: []
};

// Initialize indexes for performance
async function ensureIndexes() {
  await PluginHelpers.safeDBOperation(async (db) => {
    const birthdays = db.collection(COLLECTIONS.BIRTHDAYS);
    await birthdays.createIndex({ 'birthday.searchKey': 1 });
    await birthdays.createIndex({ userId: 1 }, { unique: true });
    const wishes = db.collection(COLLECTIONS.BIRTHDAY_WISHES);
    await wishes.createIndex({ userId: 1, date: 1 });
    const reminders = db.collection(COLLECTIONS.BIRTHDAY_REMINDERS);
    await reminders.createIndex({ reminderKey: 1 }, { unique: true });
  }, COLLECTIONS.BIRTHDAYS);
}

let birthdaySettings = { ...defaultSettings };

async function loadSettings() {
  try {
    const collection = await PluginHelpers.getCollection(COLLECTIONS.BIRTHDAY_SETTINGS);
    const settings = await collection.findOne({ type: 'birthday' });
    if (settings) {
      birthdaySettings = { ...defaultSettings, ...settings.data };
    }
    await ensureIndexes();
  } catch (error) {
    console.error('Error loading birthday settings:', error);
  }
}

async function saveSettings() {
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.replaceOne(
      { type: 'birthday' },
      { type: 'birthday', data: birthdaySettings, updatedAt: new Date() },
      { upsert: true }
    );
  }, COLLECTIONS.BIRTHDAY_SETTINGS);
}

function isAuthorized(senderId) {
  const bareNumber = senderId.split('@')[0];
  if (birthdaySettings.adminNumbers.includes(bareNumber)) return true;
  const ownerNumber = process.env.OWNER_NUMBER || '';
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  return bareNumber === ownerNumber || adminNumbers.includes(bareNumber);
}

function calculateAge(birthday) {
  if (!birthday.year) return undefined;
  const today = moment.tz('Africa/Lagos');
  let age = today.year() - birthday.year;
  const birthDateThisYear = moment.tz('Africa/Lagos').year(today.year()).month(birthday.month - 1).date(birthday.day);
  if (today.isBefore(birthDateThisYear)) age--;
  return age >= 0 && age <= 150 ? age : undefined;
}

async function getAllBirthdays() {
  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    const birthdays = await collection.find({}).toArray();
    const formattedBirthdays = {};
    birthdays.forEach(entry => {
      formattedBirthdays[entry.userId] = {
        userId: entry.userId,
        name: entry.name,
        birthday: { ...entry.birthday, age: calculateAge(entry.birthday) }
      };
    });
    return formattedBirthdays;
  }, COLLECTIONS.BIRTHDAYS);
}

async function getBirthdayData(userId) {
  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    const data = await collection.findOne({ userId });
    if (data) {
      data.birthday.age = calculateAge(data.birthday);
    }
    return data;
  }, COLLECTIONS.BIRTHDAYS);
}

async function getTodaysBirthdays() {
  const today = moment.tz('Africa/Lagos');
  const todayKey = `${String(today.month() + 1).padStart(2, '0')}-${String(today.date()).padStart(2, '0')}`;
  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    const birthdays = await collection.find({ 'birthday.searchKey': todayKey }).toArray();
    return birthdays.map(b => ({ ...b, birthday: { ...b.birthday, age: calculateAge(b.birthday) } }));
  }, COLLECTIONS.BIRTHDAYS);
}

async function getUpcomingBirthdays(daysAhead) {
  const targetDate = moment.tz('Africa/Lagos').add(daysAhead, 'days');
  const targetKey = `${String(targetDate.month() + 1).padStart(2, '0')}-${String(targetDate.date()).padStart(2, '0')}`;
  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    const birthdays = await collection.find({ 'birthday.searchKey': targetKey }).toArray();
    return birthdays.map(b => ({ ...b, birthday: { ...b.birthday, age: calculateAge(b.birthday) } }));
  }, COLLECTIONS.BIRTHDAYS);
}

async function getCustomWishes() {
  try {
    const collection = await PluginHelpers.getCollection(COLLECTIONS.CUSTOM_WISHES);
    const wishes = await collection.find({}).toArray();
    return wishes.length > 0 ? wishes.map(w => w.text) : [];
  } catch (error) {
    console.error('Error loading custom wishes:', error);
    return [];
  }
}

function getBirthdayWishMessage(birthdayPerson) {
  const defaultWishes = [
    `🎉🎂 HAPPY BIRTHDAY! 🎂🎉\n\nWishing you a day filled with happiness and a year filled with joy! 🎈✨`,
    `🎊 Happy Birthday to our amazing member! 🎊\n\nMay your special day be surrounded with happiness, filled with laughter, wrapped with pleasure and painted with fun! 🎨🎁`,
    `🌟 It's someone's Birthday! 🌟\n\n🎂 Another year older, another year wiser, another year more awesome! May all your dreams come true! ✨🎉`
  ];
  
  return new Promise(async (resolve) => {
    const customWishes = await getCustomWishes();
    const wishes = customWishes.length > 0 ? customWishes : defaultWishes;
    let message = wishes[Math.floor(Math.random() * wishes.length)];
    
    const age = calculateAge(birthdayPerson.birthday);
    if (age !== undefined) {
      message += `\n\n🎈 Celebrating ${age} wonderful years! 🎈`;
    }
    
    message += `\n\n💝 From your friends at GIST HQ! 💝`;
    resolve(message);
  });
}

function getReminderMessage(birthdayPerson, daysUntil) {
  const age = calculateAge(birthdayPerson.birthday);
  let message = daysUntil === 1
    ? `🎂 *BIRTHDAY REMINDER* 🎂\n\n📅 Tomorrow is ${birthdayPerson.name}'s birthday!\n\n🎁 Don't forget to wish them well! 🎉`
    : `🎂 *BIRTHDAY REMINDER* 🎂\n\n📅 ${birthdayPerson.name}'s birthday is in ${daysUntil} days!\n\n🗓️ Mark your calendar: ${birthdayPerson.birthday.displayDate} 🎉`;
  
  if (age !== undefined) {
    const upcomingAge = age + 1;
    message += `\n\n🎈 They'll be turning ${upcomingAge}! 🎈`;
  }
  
  return message;
}

async function sendBirthdayWishes(sock, dryRun = false) {
  if (!birthdaySettings.enableAutoWishes) {
    console.log('🎂 Auto wishes disabled, skipping...');
    return;
  }

  const health = await PluginHelpers.mongoHealthCheck();
  if (!health.healthy) {
    console.log('❌ MongoDB not healthy, skipping birthday wishes');
    return;
  }

  if (!isConnectionHealthy(sock)) {
    console.log('❌ WhatsApp connection not healthy, skipping birthday wishes');
    return;
  }

  const todaysBirthdays = await getTodaysBirthdays();
  if (todaysBirthdays.length === 0) return;

  console.log(`🎂 Found ${todaysBirthdays.length} birthday(s) today!`);
  const today = moment.tz('Africa/Lagos').format('YYYY-MM-DD');

  await PluginHelpers.safeDBOperation(async (db, collection) => {
    for (const birthdayPerson of todaysBirthdays) {
      const existingWish = await collection.findOne({ userId: birthdayPerson.userId, date: today });
      if (existingWish) {
        console.log(`⏭️ Already wished ${birthdayPerson.name} today`);
        continue;
      }

      // Mark as pending to prevent duplicates on restart
      await collection.insertOne({
        userId: birthdayPerson.userId,
        name: birthdayPerson.name,
        date: today,
        status: 'pending',
        timestamp: new Date()
      });

      const wishMessage = await getBirthdayWishMessage(birthdayPerson);
      let successfulSends = 0;

      if (birthdaySettings.enablePrivateWishes && !dryRun) {
        try {
          const privateMsg = `🎉 *HAPPY BIRTHDAY ${birthdayPerson.name}!* 🎉\n\nToday is your special day! 🎂\n\nWishing you all the happiness in the world! ✨🎈`;
          await safeSend(sock, birthdayPerson.userId, { text: privateMsg });
          successfulSends++;
          console.log(`✅ Sent private wish to ${birthdayPerson.name}`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
          console.error(`❌ Private wish failed for ${birthdayPerson.name}:`, error.message);
        }
      }

      if (birthdaySettings.enableGroupReminders && birthdaySettings.reminderGroups.length > 0 && !dryRun) {
        for (const groupId of birthdaySettings.reminderGroups) {
          if (!isConnectionHealthy(sock)) break;
          try {
            await safeSend(sock, groupId, { text: wishMessage, mentions: [birthdayPerson.userId] });
            successfulSends++;
            console.log(`✅ Sent group wish to ${groupId.split('@')[0]} for ${birthdayPerson.name}`);
            await new Promise(resolve => setTimeout(resolve, 8000));
          } catch (error) {
            console.error(`❌ Group wish failed for ${groupId.split('@')[0]}:`, error.message);
          }
        }
      }

      if (successfulSends > 0 || dryRun) {
        await collection.updateOne(
          { userId: birthdayPerson.userId, date: today, status: 'pending' },
          { $set: { status: 'sent', successfulSends, timestamp: new Date() } }
        );
        console.log(`✅ Birthday completed for ${birthdayPerson.name} (${successfulSends} sent)`);
      } else {
        await collection.deleteOne({ userId: birthdayPerson.userId, date: today, status: 'pending' });
      }

      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }, COLLECTIONS.BIRTHDAY_WISHES);
}

async function sendBirthdayReminders(sock, dryRun = false) {
  if (!birthdaySettings.enableReminders) return;

  const health = await PluginHelpers.mongoHealthCheck();
  if (!health.healthy) {
    console.log('❌ MongoDB not healthy, skipping reminders');
    return;
  }

  const today = moment.tz('Africa/Lagos').format('YYYY-MM-DD');
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    for (const daysAhead of birthdaySettings.reminderDays) {
      const upcomingBirthdays = await getUpcomingBirthdays(daysAhead);
      if (upcomingBirthdays.length === 0) continue;

      console.log(`📅 Found ${upcomingBirthdays.length} birthday(s) in ${daysAhead} days`);

      for (const birthdayPerson of upcomingBirthdays) {
        const reminderKey = `${today}-${birthdayPerson.userId}-${daysAhead}`;
        const existingReminder = await collection.findOne({ reminderKey });
        if (existingReminder) continue;

        await collection.insertOne({ reminderKey, userId: birthdayPerson.userId, daysAhead, date: today, status: 'pending', timestamp: new Date() });

        const reminderMessage = getReminderMessage(birthdayPerson, daysAhead);
        if (birthdaySettings.enableGroupReminders && birthdaySettings.reminderGroups.length > 0 && !dryRun) {
          for (const groupId of birthdaySettings.reminderGroups) {
            try {
              await safeSend(sock, groupId, { text: reminderMessage, mentions: [birthdayPerson.userId] });
              console.log(`✅ Sent ${daysAhead}-day reminder to group ${groupId} for ${birthdayPerson.name}`);
            } catch (error) {
              console.error(`Error sending reminder to group ${groupId}:`, error);
            }
          }
        }

        await collection.updateOne(
          { reminderKey, status: 'pending' },
          { $set: { status: 'sent', timestamp: new Date() } }
        );
      }
    }
  }, COLLECTIONS.BIRTHDAY_REMINDERS);
}

async function cleanupRecords() {
  await PluginHelpers.safeDBOperation(async (db) => {
    const cutoffDate = moment.tz('Africa/Lagos').subtract(30, 'days').toDate();
    await db.collection(COLLECTIONS.BIRTHDAY_WISHES).deleteMany({ timestamp: { $lt: cutoffDate } });
    await db.collection(COLLECTIONS.BIRTHDAY_REMINDERS).deleteMany({ timestamp: { $lt: cutoffDate } });
    console.log('✅ Birthday records cleanup completed');
  });
}

class BirthdayScheduler {
  constructor(sock) {
    this.sock = sock;
    this.tasks = [];
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('🎂 Birthday scheduler started');

    this.tasks.push(
      cron.schedule(`${birthdaySettings.wishTime.split(':')[1]} ${birthdaySettings.wishTime.split(':')[0]} * * *`, () => sendBirthdayWishes(this.sock)),
      cron.schedule(`${birthdaySettings.reminderTime.split(':')[1]} ${birthdaySettings.reminderTime.split(':')[0]} * * *`, () => sendBirthdayReminders(this.sock)),
      cron.schedule('0 0 * * *', cleanupRecords)
    );

    setTimeout(() => {
      const now = moment.tz('Africa/Lagos');
      if (now.format('HH:mm') === birthdaySettings.wishTime) sendBirthdayWishes(this.sock);
      if (now.format('HH:mm') === birthdaySettings.reminderTime) sendBirthdayReminders(this.sock);
    }, 5000);
  }

  stop() {
    this.running = false;
    this.tasks.forEach(task => task.stop());
    this.tasks = [];
    console.log('🎂 Birthday scheduler stopped');
  }

  restart() {
    this.stop();
    setTimeout(() => this.start(), 1000);
  }
}

let birthdayScheduler = null;

export function initializeBirthdayScheduler(sock) {
  birthdayScheduler = new BirthdayScheduler(sock);
  birthdayScheduler.start();
}

// Command handlers remain unchanged
async function handleBirthdayCommand(m, sock, config) {
  await loadSettings();
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;

  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  const senderId = m.key.participant || m.key.remoteJid;
  const from = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(from, { text }, { quoted: m });

  switch (command) {
    case 'birthday':
    case 'bday':
    case 'birthdays':
      if (args.length === 1) {
        await reply(
          `🎂 *BIRTHDAY SYSTEM* 🎂\n\n` +
          `📅 *Commands:*\n` +
          `• *today* - See today's birthdays\n` +
          `• *upcoming* - See upcoming birthdays\n` +
          `• *month [name]* - See birthdays in a month\n` +
          `• *all* - List all birthdays\n` +
          `• *settings* - View/modify settings (admin)\n` +
          `• *groups* - Manage reminder groups (admin)\n` +
          `• *test* - Test birthday system (admin)\n\n` +
          `💡 *Usage:* ${config.PREFIX}birthday [command]`
        );
      } else {
        switch (args[1].toLowerCase()) {
          case 'today':
            const todayBdays = await getTodaysBirthdays();
            let msg = todayBdays.length > 0
              ? `🎉 *Today's Birthdays* 🎉\n\n${todayBdays.map(b => `👤 ${b.name}: ${b.birthday.displayDate}${b.birthday.age ? ` (Age ${b.birthday.age})` : ''}`).join('\n')}`
              : '📅 No birthdays today!';
            await reply(msg);
            break;
          case 'upcoming':
            let upcomingMsg = `📅 *Upcoming Birthdays* 📅\n\n`;
            for (const days of birthdaySettings.reminderDays) {
              const upcoming = await getUpcomingBirthdays(days);
              if (upcoming.length > 0) {
                upcomingMsg += `🎂 *In ${days} days:*\n${upcoming.map(b => `👤 ${b.name}: ${b.birthday.displayDate}${b.birthday.age ? ` (Age ${b.birthday.age})` : ''}`).join('\n')}\n\n`;
              }
            }
            await reply(upcomingMsg || '📅 No upcoming birthdays in the next ' + birthdaySettings.reminderDays.join(', ') + ' days.');
            break;
          case 'month':
            const monthInput = args[2]?.toLowerCase();
            if (!monthInput) {
              await reply('⚠️ Please specify a month\n\nExample: *' + config.PREFIX + 'birthday month January*');
              return;
            }
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            const monthIndex = monthNames.findIndex(m => m.startsWith(monthInput));
            if (monthIndex === -1) {
              await reply('⚠️ Invalid month name.');
              return;
            }
            const monthName = monthNames[monthIndex];
            const monthKey = String(monthIndex + 1).padStart(2, '0');
            const bdays = await PluginHelpers.safeDBOperation(async (db, collection) => {
              return await collection.find({ 'birthday.searchKey': new RegExp(`^${monthKey}-`) }).toArray();
            }, COLLECTIONS.BIRTHDAYS);
            await reply(bdays.length > 0
              ? `🎂 *Birthdays in ${monthName}* 🎂\n\n${bdays.map(b => `👤 ${b.name}: ${b.birthday.displayDate}${b.birthday.age ? ` (Age ${b.birthday.age})` : ''}`).join('\n')}`
              : `📅 No birthdays in ${monthName}.`);
            break;
          case 'all':
            const allBdays = await getAllBirthdays();
            const sorted = Object.values(allBdays).sort((a, b) => {
              const dateA = moment(`${a.birthday.month}-${a.birthday.day}`, 'MM-DD');
              const dateB = moment(`${b.birthday.month}-${b.birthday.day}`, 'MM-DD');
              return dateA - dateB;
            });
            await reply(sorted.length > 0
              ? `🎂 *All Birthdays* 🎂\n\n${sorted.map(b => `👤 ${b.name}: ${b.birthday.displayDate}${b.birthday.age ? ` (Age ${b.birthday.age})` : ''}`).join('\n')}`
              : '📅 No birthdays recorded.');
            break;
          case 'settings':
            await handleSettings({ reply, senderId, sock, config }, args.slice(2));
            break;
          case 'groups':
            await handleGroups({ reply, senderId, m, sock, config }, args.slice(2));
            break;
          case 'test':
            await handleTest({ reply, senderId, sock, config }, args.slice(2));
            break;
          default:
            await reply(`❓ Unknown subcommand: *${args[1]}*\n\nUse *${config.PREFIX}birthday* to see available commands.`);
        }
      }
      break;
    case 'mybirthday':
    case 'mybday':
      const bdayData = await getBirthdayData(senderId);
      await reply(bdayData
        ? `🎂 *Your Birthday* 🎂\n\n👤 Name: ${bdayData.name}\n📅 Date: ${bdayData.birthday.displayDate}${bdayData.birthday.age ? `\n🎈 Age: ${bdayData.birthday.age}` : ''}`
        : '⚠️ Your birthday is not registered. Submit an attendance form with your D.O.B.');
      break;
  }
}

async function handleSettings(context, args) {
  const { reply, senderId, config } = context;
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
    case 'privatewishes':
      await togglePrivateWishes(reply, value, context);
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

async function showSettings(reply) {
  const settings = birthdaySettings;
  let message = `⚙️ *BIRTHDAY SETTINGS* ⚙️\n\n` +
                `🔔 *Reminders:* ${settings.enableReminders ? '✅ ON' : '❌ OFF'}\n` +
                `🎉 *Auto Wishes:* ${settings.enableAutoWishes ? '✅ ON' : '❌ OFF'}\n` +
                `💌 *Private Wishes:* ${settings.enablePrivateWishes ? '✅ ON' : '❌ OFF'}\n` +
                `👥 *Group Reminders:* ${settings.enableGroupReminders ? '✅ ON' : '❌ OFF'}\n` +
                `💬 *Private Reminders:* ${settings.enablePrivateReminders ? '✅ ON' : '❌ OFF'}\n\n` +
                `⏰ *Reminder Time:* ${settings.reminderTime}\n` +
                `🕐 *Wish Time:* ${settings.wishTime}\n` +
                `📅 *Reminder Days:* ${settings.reminderDays.join(', ')} days before\n\n` +
                `👥 *Configured Groups:* ${settings.reminderGroups.length}\n` +
                `👑 *Authorized Admins:* ${settings.adminNumbers.length}\n\n` +
                `🔧 *Change Settings:*\n` +
                `• *reminders on/off*\n• *wishes on/off*\n• *privatewishes on/off*\n• *remindertime HH:MM*\n` +
                `• *wishtime HH:MM*\n• *reminderdays 7,3,1*\n• *groupreminders on/off*\n• *privatereminders on/off*\n• *addadmin @user*\n• *removeadmin @user*`;
  await reply(message);
}

async function toggleReminders(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please specify: *on* or *off*\n\nExample: *${context.config.PREFIX}birthday settings reminders on*`);
    return;
  }
  const enable = value.toLowerCase() === 'on';
  birthdaySettings.enableReminders = enable;
  await saveSettings();
  if (birthdayScheduler) birthdayScheduler.restart();
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
  if (birthdayScheduler) birthdayScheduler.restart();
  await reply(`✅ Auto birthday wishes ${enable ? 'enabled' : 'disabled'} successfully!`);
}

async function togglePrivateWishes(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please specify: *on* or *off*\n\nExample: *${context.config.PREFIX}birthday settings privatewishes on*`);
    return;
  }
  const enable = value.toLowerCase() === 'on';
  birthdaySettings.enablePrivateWishes = enable;
  await saveSettings();
  await reply(`✅ Private birthday wishes ${enable ? 'enabled' : 'disabled'} successfully!`);
}

async function setReminderTime(reply, value, context) {
  if (!value || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
    await reply('⚠️ Invalid time format. Please use HH:MM (24-hour format)\n\nExample: 09:00, 14:30');
    return;
  }
  birthdaySettings.reminderTime = value;
  await saveSettings();
  if (birthdayScheduler) birthdayScheduler.restart();
  await reply(`✅ Reminder time set to *${value}* successfully!`);
}

async function setWishTime(reply, value, context) {
  if (!value || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
    await reply('⚠️ Invalid time format. Please use HH:MM (24-hour format)\n\nExample: 00:01, 12:00');
    return;
  }
  birthdaySettings.wishTime = value;
  await saveSettings();
  if (birthdayScheduler) birthdayScheduler.restart();
  await reply(`✅ Birthday wish time set to *${value}* successfully!`);
}

async function setReminderDays(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please specify days separated by commas\n\nExample: *${context.config.PREFIX}birthday settings reminderdays 7,3,1*`);
    return;
  }
  const days = value.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 1 && d <= 365);
  if (days.length === 0) {
    await reply('⚠️ Invalid days. Must be between 1 and 365.');
    return;
  }
  birthdaySettings.reminderDays = days.sort((a, b) => b - a);
  await saveSettings();
  if (birthdayScheduler) birthdayScheduler.restart();
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
    await reply(`⚠️ Please mention a user\n\nExample: *${context.config.PREFIX}birthday settings addadmin @user*`);
    return;
  }
  const phoneNumber = value.replace(/[@\s]/g, '');
  if (birthdaySettings.adminNumbers.includes(phoneNumber)) {
    await reply('⚠️ User is already a birthday admin.');
    return;
  }
  birthdaySettings.adminNumbers.push(phoneNumber);
  await saveSettings();
  await reply(`✅ Added ${phoneNumber} as birthday admin!`);
}

async function removeAdmin(reply, value, context) {
  if (!value) {
    await reply(`⚠️ Please mention a user\n\nExample: *${context.config.PREFIX}birthday settings removeadmin @user*`);
    return;
  }
  const phoneNumber = value.replace(/[@\s]/g, '');
  const index = birthdaySettings.adminNumbers.indexOf(phoneNumber);
  if (index === -1) {
    await reply('⚠️ User is not a birthday admin.');
    return;
  }
  birthdaySettings.adminNumbers.splice(index, 1);
  await saveSettings();
  await reply(`✅ Removed ${phoneNumber} from birthday admins!`);
}

async function reloadSettings(reply, context) {
  await loadSettings();
  if (birthdayScheduler) birthdayScheduler.restart();
  await reply('✅ Birthday settings reloaded successfully!');
}

async function handleTest(context, args) {
  const { reply, senderId, sock } = context;
  if (!isAuthorized(senderId)) {
    await reply('🚫 Only admins can run birthday tests.');
    return;
  }

  if (args.length === 0) {
    await reply(
      `🧪 *BIRTHDAY TEST COMMANDS*\n\n` +
      `• *wish* - Test birthday wish message\n` +
      `• *reminder* - Test reminder message\n` +
      `• *scheduler* - Test scheduler status\n` +
      `• *today* - Dry-run today's birthdays\n` +
      `• *cleanup* - Test cleanup function\n\n` +
      `Usage: *${context.config.PREFIX}birthday test [command]*`
    );
    return;
  }

  switch (args[0].toLowerCase()) {
    case 'wish':
      const testPerson = {
        name: 'Test User',
        userId: '1234567890@s.whatsapp.net',
        birthday: { month: 1, day: 1, monthName: 'January', displayDate: 'January 1', year: 1995 }
      };
      const wishMessage = await getBirthdayWishMessage(testPerson);
      await reply(`🧪 *BIRTHDAY WISH TEST*\n\n${wishMessage}`);
      break;
    case 'reminder':
      const testReminderPerson = {
        name: 'Test User',
        birthday: { month: 1, day: 1, monthName: 'January', displayDate: 'January 1', year: 1995 }
      };
      await reply(`🧪 *BIRTHDAY REMINDER TEST*\n\n${getReminderMessage(testReminderPerson, 3)}`);
      break;
    case 'scheduler':
      await reply(
        `🧪 *SCHEDULER STATUS TEST*\n\n` +
        `Status: ${birthdayScheduler?.running ? '✅ Running' : '❌ Stopped'}\n` +
        `Current Time: ${moment.tz('Africa/Lagos').format('YYYY-MM-DD HH:mm:ss')}\n` +
        `Wish Time: ${birthdaySettings.wishTime}\n` +
        `Reminder Time: ${birthdaySettings.reminderTime}\n` +
        `Tasks: ${birthdayScheduler?.tasks.length || 0}`
      );
      break;
    case 'today':
      await reply('🧪 *Testing today\'s birthdays (dry-run)*');
      await sendBirthdayWishes(sock, true);
      await reply('✅ Dry-run completed. Check logs for details.');
      break;
    case 'cleanup':
      await reply('🧪 *Testing cleanup function*');
      await cleanupRecords();
      await reply('✅ Cleanup test completed successfully!');
      break;
    default:
      await reply(`❓ Unknown test: *${args[0]}*\n\nUse *${context.config.PREFIX}birthday test* to see available tests.`);
  }
}

async function handleGroups(context, args) {
  const { reply, senderId, m, config } = context;
  if (!isAuthorized(senderId)) {
    await reply('🚫 Only admins can manage birthday groups.');
    return;
  }

  if (args.length === 0) {
    await showGroups(reply, context);
    return;
  }

  switch (args[0].toLowerCase()) {
    case 'add':
      await addGroup(reply, m, args[1], context);
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
      await reply(`❓ Unknown group action: *${args[0]}*\n\nUse *${config.PREFIX}birthday groups* to see available actions.`);
  }
}

async function showGroups(reply, context) {
  const groupCount = birthdaySettings.reminderGroups.length;
  let message = `👥 *BIRTHDAY REMINDER GROUPS* 👥\n\n` +
                (groupCount === 0
                  ? `📝 No groups configured for birthday reminders.\n\n`
                  : `📊 Total Groups: ${groupCount}\n\n${birthdaySettings.reminderGroups.map((id, i) => `${i + 1}. ${id.split('@')[0]}`).join('\n')}\n\n`) +
                `🔧 *Group Management:*\n` +
                `• *add [groupId]* - Add group (current if no ID)\n` +
                `• *remove [groupId]* - Remove group\n` +
                `• *list* - Show all groups\n` +
                `• *clear* - Remove all groups`;
  await reply(message);
}

async function addGroup(reply, message, groupIdArg, context) {
  const groupId = groupIdArg ? (groupIdArg.includes('@g.us') ? groupIdArg : `${groupIdArg}@g.us`) : message.key.remoteJid;
  if (!groupId.includes('@g.us')) {
    await reply('⚠️ Invalid group ID or not in a group.');
    return;
  }
  if (birthdaySettings.reminderGroups.includes(groupId)) {
    await reply('⚠️ This group is already configured for birthday reminders.');
    return;
  }
  birthdaySettings.reminderGroups.push(groupId);
  await saveSettings();
  await reply(`✅ Group *${groupId.split('@')[0]}* added for birthday reminders!`);
}

async function removeGroup(reply, groupIdArg, context) {
  if (!groupIdArg) {
    await reply(`⚠️ Please specify a group ID\n\nExample: *${context.config.PREFIX}birthday groups remove 1234567890*`);
    return;
  }
  const targetGroup = birthdaySettings.reminderGroups.find(id => id.includes(groupIdArg) || id.split('@')[0] === groupIdArg);
  if (!targetGroup) {
    await reply(`⚠️ Group not found: *${groupIdArg}*\n\nUse *${context.config.PREFIX}birthday groups list* to see configured groups.`);
    return;
  }
  birthdaySettings.reminderGroups.splice(birthdaySettings.reminderGroups.indexOf(targetGroup), 1);
  await saveSettings();
  await reply(`✅ Group *${targetGroup.split('@')[0]}* removed from birthday reminders!`);
}

async function clearGroups(reply, context) {
  if (birthdaySettings.reminderGroups.length === 0) {
    await reply('📝 No groups are currently configured for birthday reminders.');
    return;
  }
  const groupCount = birthdaySettings.reminderGroups.length;
  birthdaySettings.reminderGroups = [];
  await saveSettings();
  await reply(`✅ Cleared all ${groupCount} group(s) from birthday reminders!`);
}

export default handleBirthdayCommand;
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
