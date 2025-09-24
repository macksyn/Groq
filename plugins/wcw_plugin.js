// plugins/wcw.js - Woman Crush Wednesday Plugin (Completed & Integrated)
import { unifiedUserManager, getDatabase, safeOperation } from '../lib/pluginIntegration.js';
import sharp from 'sharp';
import moment from 'moment-timezone';
import cron from 'node-cron';
import chalk from 'chalk';

// Plugin information for your pluginManager
export const info = {
  name: 'Woman Crush Wednesday (WCW)',
  version: '2.2.0',
  author: 'System Rewrite',
  description: 'Weekly Woman Crush Wednesday contest with automated scheduling, rating system, and rewards.',
  commands: [
    { name: 'wcw', aliases: ['womancrush'], description: 'Access WCW system commands and settings' },
    { name: 'wcwstats', aliases: ['wcwhistory'], description: 'View WCW statistics and history' },
    { name: 'wcwtest', aliases: ['testwcw'], description: 'Test WCW rating validation' }
  ],
  scheduledTasks: [
    {
      name: 'wcwReminders',
      schedule: wcwSettings.reminderTimes.map(time => {
        const [h, m] = time.split(':');
        return `${m} ${h} * * 3`;
      }),
      handler: async () => {
        await sendWCWReminders(global.wcwSock);
      }
    },
    {
      name: 'wcwStartSession',
      schedule: [`${wcwSettings.startTime.split(':')[1]} ${wcwSettings.startTime.split(':')[0]} * * 3`],
      handler: async () => {
        for (const groupJid of wcwSettings.groupJids) {
          await startWCWSession(global.wcwSock, groupJid);
        }
      }
    },
    {
      name: 'wcwEndSession',
      schedule: [`${wcwSettings.endTime.split(':')[1]} ${wcwSettings.endTime.split(':')[0]} * * 3`],
      handler: async () => {
        for (const groupJid of wcwSettings.groupJids) {
          await endWCWSession(global.wcwSock, groupJid);
        }
      }
    }
  ]
};

// --- CONFIGURATION & SETUP ---

const COLLECTIONS = {
  WCW_RECORDS: 'wcw_records',
  WCW_SETTINGS: 'wcw_settings',
  WCW_SESSIONS: 'wcw_sessions',
  WCW_PARTICIPANTS: 'wcw_participants',
  WCW_RATINGS: 'wcw_ratings'
};

moment.tz.setDefault('Africa/Lagos');

const defaultSettings = {
  startTime: '20:00',
  endTime: '22:00',
  winnerReward: 12000,
  participationReward: 1000,
  enableParticipationReward: true,
  reminderTimes: ['10:00', '16:00'],
  autoStartEnabled: true,
  adminNumbers: [],
  groupJids: [],
  tagAllMembers: true,
  maxPhotosPerUser: 1,
  validRatingRange: { min: 1, max: 10 },
  allowSelfRating: false
};

let wcwSettings = { ...defaultSettings };
// Remove cronJobs object, as pluginManager will now track scheduled tasks
// let cronJobs = {
//   reminders: [],
//   startSession: null,
//   endSession: null
// };

// --- UTILITY & DATABASE FUNCTIONS ---

function getNigeriaTime() { return moment.tz('Africa/Lagos'); }
function getCurrentDate() { return getNigeriaTime().format('DD-MM-YYYY'); }
function isWednesday() { return getNigeriaTime().format('dddd').toLowerCase() === 'wednesday'; }
function getCurrentTime() { return getNigeriaTime().format('HH:mm'); }

async function initDatabase() {
  try {
    await safeOperation(async (db) => {
      await Promise.all([
        db.collection(COLLECTIONS.WCW_SESSIONS).createIndex({ date: 1, groupJid: 1 }, { unique: true }),
        db.collection(COLLECTIONS.WCW_PARTICIPANTS).createIndex({ sessionId: 1, userId: 1 }),
        db.collection(COLLECTIONS.WCW_RATINGS).createIndex({ sessionId: 1, raterId: 1, participantId: 1 }),
        db.collection(COLLECTIONS.WCW_RECORDS).createIndex({ date: -1 })
      ]);
    });
    console.log(chalk.green('✅ WCW MongoDB indexes created successfully'));
  } catch (error) {
    console.error(chalk.red('❌ WCW MongoDB initialization failed:'), error);
    throw error;
  }
}

async function loadSettings() {
  try {
    await safeOperation(async (db) => {
      const settings = await db.collection(COLLECTIONS.WCW_SETTINGS).findOne({ type: 'wcw_config' });
      if (settings) {
        wcwSettings = { ...defaultSettings, ...settings.data };
      }
    });
  } catch (error) {
    console.error('Error loading WCW settings:', error);
  }
}

async function saveSettings() {
  try {
    await safeOperation(async (db) => {
      await db.collection(COLLECTIONS.WCW_SETTINGS).replaceOne(
        { type: 'wcw_config' },
        { type: 'wcw_config', data: wcwSettings, updatedAt: new Date() },
        { upsert: true }
      );
    });
  } catch (error) {
    console.error('Error saving WCW settings:', error);
  }
}

// --- AUTHORIZATION ---

async function isAuthorized(sock, from, sender, config) {
  try {
    if (wcwSettings.adminNumbers.includes(sender.split('@')[0])) return true;
    if (sender.split('@')[0] === config.OWNER_NUMBER) return true;
    if (!from.endsWith('@g.us')) return false;

    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);
    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking authorization:', error);
    return false;
  }
}

// --- SESSION & RATING LOGIC ---

async function getCurrentSession(groupJid) {
  try {
    const today = getCurrentDate();
    return await safeOperation(db =>
      db.collection(COLLECTIONS.WCW_SESSIONS).findOne({
        date: today,
        groupJid: groupJid,
        status: 'active'
      })
    );
  } catch (error) {
    console.error('Error getting current session:', error);
    return null;
  }
}

function extractRating(text) {
  if (text.includes('1️⃣0️⃣')) {
      return 10;
  }

  const emojiToNumber = { '1️⃣': 1, '2️⃣': 2, '3️⃣': 3, '4️⃣': 4, '5️⃣': 5, '6️⃣': 6, '7️⃣': 7, '8️⃣': 8, '9️⃣': 9, '🔟': 10 };
  for (const [emoji, number] of Object.entries(emojiToNumber)) {
    if (text.includes(emoji)) return number;
  }
  const numbers = text.match(/\b([1-9]|10)\b/g);
  if (!numbers) return null;
  const rating = parseInt(numbers[0]);
  return (rating >= wcwSettings.validRatingRange.min && rating <= wcwSettings.validRatingRange.max) ? rating : null;
}

// --- MESSAGE HANDLERS (for photos and ratings) ---

async function handlePhotoSubmission(m, sock) {
  try {
    const groupJid = m.from;
    const senderId = m.sender;
    
    if (!isWednesday() || !groupJid.endsWith('@g.us')) return false;

    const session = await getCurrentSession(groupJid);
    if (!session) return false;

    // EDITED: Check for two valid entry methods: replying to the start message OR using a keyword.
    const quotedMessageId = m.message?.imageMessage?.contextInfo?.stanzaId;
    const isReplyingToStartMessage = session.startMessageKey && quotedMessageId === session.startMessageKey.id;
    
    const caption = m.message?.imageMessage?.caption || '';
    const keywords = ['wcw', 'rate', 'crush'];
    const hasKeyword = keywords.some(keyword => new RegExp(`\\b${keyword}\\b`, 'i').test(caption));

    // If it's neither a reply to the start message nor contains a keyword, ignore it.
    if (!isReplyingToStartMessage && !hasKeyword) {
        return false;
    }

    const existingParticipant = await safeOperation(db =>
      db.collection(COLLECTIONS.WCW_PARTICIPANTS).findOne({ sessionId: session.sessionId, userId: senderId })
    );

    if (existingParticipant) {
      await m.react('❌');
      await sock.sendMessage(groupJid, {
        text: `🚫 @${senderId.split('@')[0]} - You already submitted your photo! Only one entry is allowed.`,
        mentions: [senderId]
      });
      return true;
    }

    const participantData = {
      sessionId: session.sessionId,
      userId: senderId,
      userPhone: senderId.split('@')[0],
      messageKey: m.key,
      photoSubmittedAt: new Date(),
      totalRating: 0,
      averageRating: 0,
      ratingCount: 0
    };

    await safeOperation(async (db) => {
      await db.collection(COLLECTIONS.WCW_PARTICIPANTS).insertOne(participantData);
      await db.collection(COLLECTIONS.WCW_SESSIONS).updateOne({ sessionId: session.sessionId }, { $push: { participants: senderId } });
    });

    await m.react('✅');
    if (wcwSettings.enableParticipationReward) {
        await unifiedUserManager.addMoney(senderId, wcwSettings.participationReward, 'WCW participation');
    }
    console.log(chalk.green(`📸 WCW photo submitted by ${senderId.split('@')[0]}`));
    return true;

  } catch (error) {
    console.error('Error handling photo submission:', error);
    return false;
  }
}

async function handleRatingSubmission(m, sock) {
  try {
    const groupJid = m.from;
    const raterId = m.sender;
    const participantId = m.quoted.sender;

    if (!isWednesday() || !groupJid.endsWith('@g.us') || !participantId) return false;

    const session = await getCurrentSession(groupJid);
    if (!session) return false;

    const participant = await safeOperation(db =>
      db.collection(COLLECTIONS.WCW_PARTICIPANTS).findOne({ sessionId: session.sessionId, userId: participantId })
    );
    if (!participant) return false;

    if (!wcwSettings.allowSelfRating && raterId === participantId) {
      await m.react('🚫');
      return true;
    }

    const rating = extractRating(m.body || '');
    if (!rating) {
      return false;
    }
    
    await safeOperation(async (db) => {
      await db.collection(COLLECTIONS.WCW_RATINGS).updateOne(
          { sessionId: session.sessionId, raterId: raterId, participantId: participantId },
          { $set: { rating: rating, updatedAt: new Date() } },
          { upsert: true }
      );
    });
    
    updateParticipantRatings(session.sessionId, participantId);

    await m.react('✅');
    console.log(chalk.cyan(`⭐ WCW rating ${rating} given by ${raterId.split('@')[0]} to ${participantId.split('@')[0]}`));
    return true;

  } catch (error) {
    console.error('Error handling rating submission:', error);
    return false;
  }
}

async function updateParticipantRatings(sessionId, participantId) {
  try {
    await safeOperation(async (db) => {
      const ratings = await db.collection(COLLECTIONS.WCW_RATINGS).find({ sessionId, participantId }).toArray();
      const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
      const ratingCount = ratings.length;
      const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;
      
      await db.collection(COLLECTIONS.WCW_PARTICIPANTS).updateOne(
        { sessionId, userId: participantId },
        { $set: { totalRating, averageRating: Math.round(averageRating * 100) / 100, ratingCount, updatedAt: new Date() } }
      );
    });
  } catch (error) {
    console.error('Error updating participant ratings:', error);
  }
}

// --- CORE EVENT WORKFLOW (START, END, WINNER) ---

async function startWCWSession(sock, groupJid) {
    // EDITED: Updated the rules to include the new "reply to enter" method.
    const startMessage = `💃 *WCW IS NOW LIVE!* 💃\n\n` +
         `🔴 LIVE NOW - LIVE NOW 🔴\n\n` +
         `*HOW TO PARTICIPATE:*\n` +
         `1. *REPLY TO THIS MESSAGE* with your best photo.\n` +
         `*OR*\n` +
         `2. Send a photo with a caption like "WCW", "Rate Me", or "My Crush".\n\n` +
         `👨‍💼 *GENTLEMEN:* Rate the ladies from 1-10!\n\n` +
         `⏰ Competition ends at ${wcwSettings.endTime}\n` +
         `💰 Winner: ₦${wcwSettings.winnerReward.toLocaleString()}\n` +
         `🎁 Participation: ₦${wcwSettings.participationReward.toLocaleString()}\n\n` +
         `💄 Let the glamour begin! 💄\n#WCWLive`;

    const groupMetadata = await sock.groupMetadata(groupJid);
    const sentMessage = await sock.sendMessage(groupJid, { text: startMessage, mentions: groupMetadata.participants.map(p => p.id) });

    // EDITED: Store the key of the announcement message in the session.
    const sessionData = {
        sessionId: `wcw_${getCurrentDate()}_${groupJid}`,
        date: getCurrentDate(),
        groupJid,
        status: 'active',
        startedAt: new Date(),
        startMessageKey: sentMessage.key 
    };
    await safeOperation(db => db.collection(COLLECTIONS.WCW_SESSIONS).insertOne(sessionData));

    console.log(chalk.green(`✅ WCW session started for ${groupJid}`));
}

async function endWCWSession(sock, groupJid) {
  const session = await getCurrentSession(groupJid);
  if (!session) return false;

  await sock.sendMessage(groupJid, { text: `⏰ WCW HAS OFFICIALLY ENDED! ⏰\n\n🔒 No more submissions or ratings accepted!\n\n📊 Counting votes...\n⏳ Results in 1 minute!\n🎭 The suspense is real! 🎭` });
  
  const participants = await safeOperation(db => db.collection(COLLECTIONS.WCW_PARTICIPANTS).find({ sessionId: session.sessionId }).toArray());
  participants.sort((a, b) => b.totalRating - a.totalRating || b.averageRating - a.averageRating);
  
  setTimeout(async () => {
    let resultsMessage = `🎭 WCW PAGEANT RESULTS 🎭\n\n✨ The scores are in! Here are tonight's final standings:\n\n`;
    if (participants.length > 0) {
        participants.forEach((p, i) => {
          const emoji = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
          resultsMessage += `${emoji} ${i + 1}. @${p.userPhone}\n   ⭐ Average: ${p.averageRating.toFixed(1)}/10 (${p.ratingCount} ratings)\n   📊 Total Points: ${p.totalRating}\n\n`;
        });
    } else {
        resultsMessage += "No participants this week.\n\n";
    }
    await sock.sendMessage(groupJid, { text: resultsMessage, mentions: participants.map(p => p.userId) });

    setTimeout(async () => {
      const winner = participants.length > 0 && participants[0].ratingCount > 0 ? participants[0] : null;
      if (winner) {
        await declareWinner(sock, groupJid, winner);
      } else {
        await sock.sendMessage(groupJid, { text: `🤷‍♀️ No winner could be determined this week.` });
      }
      
      setTimeout(() => sock.sendMessage(groupJid, { text: `💄 THANK YOU FOR AN AMAZING WCW! 💄\n\nSee you next Wednesday for another chance to shine!\n#WomanCrushWednesday` }), 15000);
    }, 7000);
  }, 60000);

  await saveSessionRecord(session, participants);
  return true;
}

async function declareWinner(sock, groupJid, winner) {
    await unifiedUserManager.addMoney(winner.userId, wcwSettings.winnerReward, 'WCW Winner');
    let framedBuffer = null;
    try {
        const quotedMsg = await sock.loadMessage(winner.messageKey.remoteJid, winner.messageKey.id);
        const stream = await sock.downloadMediaMessage(quotedMsg);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        framedBuffer = await frameWinnerPhoto(Buffer.concat(chunks));
    } catch (err) {
      console.error('Error processing winner photo:', err);
    }
    
    const winnerMessage = `👑 AND THE CROWN GOES TO... 👑\n\n` +
                         `🎉 Congratulations @${winner.userPhone}! You are tonight's Woman Crush Queen! 🎉\n\n` +
                         `💰 Prize: ₦${wcwSettings.winnerReward.toLocaleString()} 💰\n` +
                         `⭐ Total Points: ${winner.totalRating}\n` +
                         `📊 Average Rating: ${winner.averageRating.toFixed(1)}/10\n` +
                         `🗳️ Based on ${winner.ratingCount} ratings\n\n` +
                         `#WCWWinner #QueenCrowned`;

    const messagePayload = framedBuffer 
      ? { image: framedBuffer, caption: winnerMessage, mentions: [winner.userId] }
      : { text: winnerMessage, mentions: [winner.userId] };
    await sock.sendMessage(groupJid, messagePayload);
}

async function frameWinnerPhoto(photoBuffer) {
  try {
    // Get input image metadata to determine dimensions and aspect ratio
    const metadata = await sharp(photoBuffer).metadata();
    const inputWidth = metadata.width;
    const inputHeight = metadata.height;
    
    // Calculate target size: max dimension of 800px, preserving aspect ratio
    const maxDimension = 800;
    let targetWidth, targetHeight;
    if (inputWidth > inputHeight) {
      targetWidth = maxDimension;
      targetHeight = Math.round((inputHeight / inputWidth) * maxDimension);
    } else {
      targetHeight = maxDimension;
      targetWidth = Math.round((inputWidth / inputHeight) * maxDimension);
    }

    // Calculate dynamic margin (5% of the larger dimension)
    const margin = Math.round(Math.max(targetWidth, targetHeight) * 0.05);
    
    // Calculate final canvas size (image + border)
    const canvasWidth = targetWidth + margin * 2;
    const canvasHeight = targetHeight + margin * 2;

    // Resize the input image while preserving aspect ratio
    const resizedImage = await sharp(photoBuffer)
      .resize(targetWidth, targetHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    // Create a gold border canvas
    const border = await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 255, g: 215, b: 0, alpha: 1 } // Gold color
      }
    }).png().toBuffer();

    // Composite the resized image onto the border
    const composite = await sharp(border)
      .composite([{ input: resizedImage, top: margin, left: margin }])
      .png()
      .toBuffer();

    // Add text overlay with dynamic font size (5% of canvas height)
    const fontSize = Math.round(canvasHeight * 0.05);
    const svgText = `
      <svg width="${canvasWidth}" height="${canvasHeight}">
        <text x="50%" y="95%" font-size="${fontSize}" font-family="Impact" 
              fill="white" stroke="black" stroke-width="2" text-anchor="middle">
          🏆 WCW WINNER 🏆
        </text>
      </svg>`;

    // Composite the text onto the image
    return await sharp(composite)
      .composite([{ input: Buffer.from(svgText) }])
      .png()
      .toBuffer();
  } catch (error) {
    console.error('Error framing photo:', error);
    return photoBuffer; // Fallback to original image on error
  }
}

async function saveSessionRecord(session, participants) {
    const winner = participants.length > 0 && participants[0].ratingCount > 0 ? participants[0] : null;
    const recordData = {
      date: getCurrentDate(),
      groupJid: session.groupJid,
      sessionId: session.sessionId,
      totalParticipants: participants.length,
      winner: winner ? { userId: winner.userId, userPhone: winner.userPhone, averageRating: winner.averageRating, totalRating: winner.totalRating, ratingCount: winner.ratingCount, prizeAwarded: wcwSettings.winnerReward } : null,
      participants: participants.map(p => ({ userId: p.userId, totalRating: p.totalRating, ratingCount: p.ratingCount })),
    };
    await safeOperation(db => db.collection(COLLECTIONS.WCW_RECORDS).insertOne(recordData));
    await safeOperation(db => db.collection(COLLECTIONS.WCW_SESSIONS).updateOne({ sessionId: session.sessionId }, { $set: { status: 'ended', endedAt: new Date(), winnerDeclared: !!winner } }));
}

// --- SCHEDULING (CRON JOBS) ---

async function sendWCWReminders(sock) {
  if (!isWednesday()) return;
  const startTime = moment.tz(`${getCurrentDate()} ${wcwSettings.startTime}`, 'DD-MM-YYYY HH:mm', 'Africa/Lagos');
  if (getNigeriaTime().isSameOrAfter(startTime)) return;
  
  const timeUntil = moment.duration(startTime.diff(getNigeriaTime())).humanize();
  const reminderMessage = `💃 WCW ALERT! 💃\n\n✨ Get ready ladies! Woman Crush Wednesday is starting in ${timeUntil}! ✨\n\n💰 Winner gets ₦${wcwSettings.winnerReward.toLocaleString()}!\n⏰ Starting at ${wcwSettings.startTime} sharp!`;

  for (const groupJid of wcwSettings.groupJids) {
    try {
      const groupMetadata = await sock.groupMetadata(groupJid);
      await sock.sendMessage(groupJid, { text: reminderMessage, mentions: groupMetadata.participants.map(p => p.id) });
      console.log(chalk.blue(`✅ WCW reminder sent to ${groupJid}`));
    } catch (error) {
      console.error(`Error sending WCW reminder to ${groupJid}:`, error);
    }
  }
}

function setupWCWCronJobs(sock) {
  stopAllCronJobs();
  wcwSettings.reminderTimes.forEach(time => {
    const [h, m] = time.split(':');
    const job = cron.schedule(`${m} ${h} * * 3`, () => sendWCWReminders(sock), { timezone: 'Africa/Lagos' });
    cronJobs.reminders.push(job);
  });
  
  const [startH, startM] = wcwSettings.startTime.split(':');
  cronJobs.startSession = cron.schedule(`${startM} ${startH} * * 3`, () => {
    if (!wcwSettings.autoStartEnabled) return;
    wcwSettings.groupJids.forEach(groupJid => startWCWSession(sock, groupJid).catch(e => console.error(e)));
  }, { timezone: 'Africa/Lagos' });

  const [endH, endM] = wcwSettings.endTime.split(':');
  cronJobs.endSession = cron.schedule(`${endM} ${endH} * * 3`, () => {
    wcwSettings.groupJids.forEach(groupJid => endWCWSession(sock, groupJid).catch(e => console.error(e)));
  }, { timezone: 'Africa/Lagos' });

  console.log(chalk.green(`✅ WCW cron jobs scheduled. Reminders: ${wcwSettings.reminderTimes.join(', ')}. Session: ${wcwSettings.startTime}-${wcwSettings.endTime}.`));
}

function stopAllCronJobs() {
  Object.values(cronJobs).flat().forEach(job => job?.destroy());
  cronJobs = { reminders: [], startSession: null, endSession: null };
  console.log(chalk.yellow('🟡 All WCW cron jobs stopped'));
}

// --- COMMAND HANDLERS ---

async function handleWCWCommand(m, sock, args, config) {
  const from = m.from;
  const sender = m.sender;
  
  if (args.length === 0) {
    const session = await getCurrentSession(from);
    let statusMessage = `💃 *Woman Crush Wednesday System* 💃\n\n` +
      `*Status:* ${session ? '🔴 Live' : '⚫ Offline'}\n` +
      `*Schedule:* ${wcwSettings.startTime} - ${wcwSettings.endTime}\n\n` +
      `Use *${config.PREFIX}wcwstats* to view history.\n` +
      (await isAuthorized(sock, from, sender, config) ? `*Admin:* Use *${config.PREFIX}wcw help* for commands.` : '');
    await sock.sendMessage(from, { text: statusMessage });
    return;
  }

  const subCommand = args[0].toLowerCase();
  if (!await isAuthorized(sock, from, sender, config)) {
      return m.reply('🚫 You are not authorized to use admin commands.');
  }

  switch (subCommand) {
    case 'start':
      if (!isWednesday()) return m.reply('📅 WCW can only be started on Wednesdays!');
      if (await getCurrentSession(from)) return m.reply('⚠️ A session is already active!');
      await startWCWSession(sock, from);
      break;
    case 'end':
      if (!await getCurrentSession(from)) return m.reply('⚠️ No active session to end.');
      await endWCWSession(sock, from);
      break;
    case 'addgroup':
      if (wcwSettings.groupJids.includes(from)) return m.reply('⚠️ This group is already in the WCW system!');
      wcwSettings.groupJids.push(from);
      await saveSettings();
      m.reply('✅ This group has been added to the WCW system!');
      break;
    case 'removegroup':
        wcwSettings.groupJids = wcwSettings.groupJids.filter(id => id !== from);
        await saveSettings();
        m.reply('✅ This group has been removed from the WCW system!');
        break;
    case 'setprize':
        const prize = parseInt(args[1]);
        if (isNaN(prize) || prize < 0) return m.reply('❌ Invalid amount.');
        wcwSettings.winnerReward = prize;
        await saveSettings();
        m.reply(`✅ Winner prize set to ₦${prize.toLocaleString()}!`);
        break;
    // Add other admin commands here...
    default:
        m.reply(`*WCW Admin Help*\n\nCommands:\n- start\n- end\n- addgroup\n- removegroup\n- setprize <amount>`);
  }
}

async function handleWCWStatsCommand(m, sock, args, config) {
    const from = m.from;
    const statsData = await safeOperation(db => db.collection(COLLECTIONS.WCW_RECORDS).find({ groupJid: from }).sort({ date: -1 }).limit(5).toArray());
    if (statsData.length === 0) return m.reply('📜 No WCW history found for this group yet.');

    let statsMessage = `📜 *Recent WCW History*\n\n`;
    statsData.forEach(session => {
        statsMessage += `*📅 Date:* ${session.date}\n` +
                      `*👥 Participants:* ${session.totalParticipants}\n` +
                      `*👑 Winner:* ${session.winner ? `@${session.winner.userPhone}` : 'None'}\n\n`;
    });
    await sock.sendMessage(from, { text: statsMessage, mentions: statsData.map(s => s.winner?.userId).filter(Boolean) });
}

// --- MAIN PLUGIN LIFECYCLE ---

export async function init(sock) {
  try {
    console.log(chalk.blue('🚀 Initializing WCW Plugin...'));
    await initDatabase();
    await loadSettings();
    setupWCWCronJobs(sock); // Pass sock to scheduler
    console.log(chalk.green('✅ WCW Plugin initialized successfully'));
  } catch (error) {
    console.error(chalk.red('❌ WCW Plugin initialization failed:'), error);
  }
}

export async function cleanup() {
  console.log(chalk.yellow('🧹 Cleaning up WCW Plugin...'));
  stopAllCronJobs();
  console.log(chalk.green('✅ WCW Plugin cleanup completed'));
}

// Default export that your pluginManager will call for every message
export default async function wcwPlugin(m, sock, config) {
  try {
    // Non-command message handling (photos, ratings)
    if (!m.body?.startsWith(config.PREFIX)) {
      if (m.message?.imageMessage) {
        await handlePhotoSubmission(m, sock);
        return;
      }
      if (m.quoted?.imageMessage) {
        await handleRatingSubmission(m, sock);
        return;
      }
    }

    // Command handling
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    const args = m.body.slice(config.PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    
    const commandMap = {
      'wcw': handleWCWCommand,
      'womancrush': handleWCWCommand,
      'wcwstats': handleWCWStatsCommand,
      'wcwhistory': handleWCWStatsCommand,
    };
    
    if (commandMap[command]) {
      await commandMap[command](m, sock, args, config);
    }
  } catch (error) {
    console.error(chalk.red('❌ Error in WCW Plugin main handler:'), error);
  }
}
