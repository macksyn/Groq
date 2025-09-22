// plugins/wcw.js - Woman Crush Wednesday Plugin
import moment from 'moment-timezone';
import cron from 'node-cron';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Woman Crush Wednesday (WCW)',
  version: '1.2.0',
  author: 'Alex Macksyn',
  description: 'Weekly Woman Crush Wednesday contest where ladies post pictures and guys rate them from 1-10. Automatic scheduling with node-cron, winner declaration based on total points, and rewards system.',
  commands: [
    {
      name: 'wcw',
      aliases: ['womancrush'],
      description: 'Access WCW system commands and settings'
    },
    {
      name: 'wcwstats',
      aliases: ['wcwhistory'],
      description: 'View WCW statistics and history'
    },
    {
      name: 'wcwtest',
      aliases: ['testwcw'],
      description: 'Test WCW rating validation'
    }
  ]
};

// MongoDB Configuration
const COLLECTIONS = {
  WCW_RECORDS: 'wcw_records',
  WCW_SETTINGS: 'wcw_settings',
  WCW_SESSIONS: 'wcw_sessions',
  WCW_PARTICIPANTS: 'wcw_participants',
  WCW_RATINGS: 'wcw_ratings',
  USERS: 'economy_users' // Updated to match unified user collection
};

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default WCW settings
const defaultSettings = {
  startTime: '20:00', // 8 PM
  endTime: '22:00',   // 10 PM
  winnerReward: 12000, // ₦12,000 for winner
  participationReward: 1000, // ₦1,000 for participation
  enableParticipationReward: true,
  reminderTimes: ['10:00', '16:00'], // Two reminders
  autoStartEnabled: true,
  adminNumbers: [],
  groupJids: [],
  tagAllMembers: false,
  maxPhotosPerUser: 1,
  validRatingRange: { min: 1, max: 10 },
  allowSelfRating: false
};

let wcwSettings = { ...defaultSettings };

// Cron jobs storage
let cronJobs = {
  reminders: [],
  startSession: null,
  endSession: null
};

// Initialize indexes
async function ensureIndexes() {
  await PluginHelpers.safeDBOperation(async (db) => {
    await db.collection(COLLECTIONS.WCW_SESSIONS).createIndex({ date: 1, groupJid: 1 }, { unique: true });
    await db.collection(COLLECTIONS.WCW_PARTICIPANTS).createIndex({ sessionId: 1, userId: 1 });
    await db.collection(COLLECTIONS.WCW_RATINGS).createIndex({ sessionId: 1, raterId: 1, participantId: 1 });
    await db.collection(COLLECTIONS.WCW_RECORDS).createIndex({ date: -1 });
    await db.collection(COLLECTIONS.USERS).createIndex({ userId: 1 }, { unique: true });
  });
}

async function loadSettings() {
  try {
    const collection = await PluginHelpers.getCollection(COLLECTIONS.WCW_SETTINGS);
    const settings = await collection.findOne({ type: 'wcw_config' });
    if (settings) {
      wcwSettings = { ...defaultSettings, ...settings.data };
    }
    await ensureIndexes();
  } catch (error) {
    console.error('Error loading WCW settings:', error);
  }
}

async function saveSettings() {
  try {
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.replaceOne(
        { type: 'wcw_config' },
        { type: 'wcw_config', data: wcwSettings, updatedAt: new Date() },
        { upsert: true }
      );
    }, COLLECTIONS.WCW_SETTINGS);
  } catch (error) {
    console.error('Error saving WCW settings:', error);
  }
}

function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('YYYY-MM-DD');
}

function isWednesday() {
  return getNigeriaTime().day() === 3; // 3 = Wednesday
}

async function getGroupMembers(sock, groupJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    return groupMetadata.participants.map(participant => ({
      id: participant.id,
      admin: participant.admin || null
    }));
  } catch (error) {
    console.error('Error getting group members:', error);
    return [];
  }
}

async function isAuthorized(sock, from, sender) {
  if (wcwSettings.adminNumbers.includes(sender.split('@')[0])) return true;
  const ownerNumber = process.env.OWNER_NUMBER || '';
  if (sender.split('@')[0] === ownerNumber) return true;
  
  try {
    if (!from.endsWith('@g.us')) return false;
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);
    return groupAdmins.includes(sender);
  } catch (error) {
    return false;
  }
}

// Economy functions
async function initUser(userId) {
  try {
    await PluginHelpers.initUser(userId);
  } catch (error) {
    console.error('Error initializing user:', error);
  }
}

async function addMoney(userId, amount, reason) {
  try {
    await PluginHelpers.addMoney(userId, amount, reason);
  } catch (error) {
    console.error('Error adding money:', error);
  }
}

async function getUserData(userId) {
  try {
    return await PluginHelpers.getUserData(userId) || { balance: 0 };
  } catch (error) {
    console.error('Error getting user data:', error);
    return { balance: 0 };
  }
}

// WCW SESSION MANAGEMENT
async function createWCWSession(groupJid) {
  try {
    const today = getCurrentDate();
    const sessionId = `wcw_${today}_${groupJid}`;
    
    const existingSession = await PluginHelpers.safeDBOperation(async (db, collection) => 
      await collection.findOne({ date: today, groupJid })
    , COLLECTIONS.WCW_SESSIONS);
    
    if (existingSession) {
      console.log(`WCW session already exists for ${today}`);
      return existingSession;
    }
    
    const sessionData = {
      sessionId,
      date: today,
      groupJid,
      status: 'active',
      startedAt: new Date(),
      endedAt: null,
      participants: [],
      totalRatings: 0,
      winnerDeclared: false,
      createdAt: new Date()
    };
    
    await PluginHelpers.safeDBOperation(async (db, collection) => 
      await collection.insertOne(sessionData)
    , COLLECTIONS.WCW_SESSIONS);
    console.log(`✅ WCW session created for ${today}`);
    return sessionData;
  } catch (error) {
    console.error('Error creating WCW session:', error);
    throw error;
  }
}

async function getCurrentSession(groupJid) {
  try {
    const today = getCurrentDate();
    return await PluginHelpers.safeDBOperation(async (db, collection) => 
      await collection.findOne({ date: today, groupJid, status: 'active' })
    , COLLECTIONS.WCW_SESSIONS);
  } catch (error) {
    console.error('Error getting current session:', error);
    return null;
  }
}

async function cancelWCWSession(groupJid) {
  try {
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    await PluginHelpers.safeDBOperation(async (db, collection) => 
      await collection.updateOne(
        { sessionId: session.sessionId },
        { $set: { status: 'cancelled', endedAt: new Date() } }
      )
    , COLLECTIONS.WCW_SESSIONS);
    return true;
  } catch (error) {
    console.error('Error cancelling WCW session:', error);
    return false;
  }
}

// WCW ANNOUNCEMENTS AND REMINDERS
function formatReminderMessage(timeUntil) {
  const messages = [
    `🔥 *WCW COUNTDOWN IS ON!* 🔥\n\nLadies and gentlemen, welcome to the ultimate glamour showdown! 💃✨\n\nIn just ${timeUntil}, the spotlight turns on for WOMAN CRUSH WEDNESDAY!\n\n👑 *Ladies:* Prepare to dazzle with your fierce photos – the guys are waiting to crown the queen!\n👀 *Guys:* Get your ratings ready – 1 to 10, make it count!\n\n💥 Epic prizes: Winner grabs ₦${wcwSettings.winnerReward.toLocaleString()} + bragging rights!\n🎉 Participation vibe: ₦${wcwSettings.participationReward.toLocaleString()} just for joining the fun!\n\nTune in at 8:00 PM sharp – this is YOUR stage! 📺\n#WCWSpotlight #GlamourNight #RateTheQueens`,
    `🎤 *WCW IS STARTING SOON!* 🎤\n\nThe clock is ticking... ${timeUntil} until the red carpet rolls out for WOMAN CRUSH WEDNESDAY! 🌟\n\n💄 *Ladies, it's showtime:* Strike a pose, upload your slay-worthy pic, and let the ratings pour in!\n🕺 *Gentlemen, you're the judges:* From 1-10, vote for the ultimate crush!\n\n🏆 Grand prize alert: ₦${wcwSettings.winnerReward.toLocaleString()} for the top diva!\n🎁 Everyone wins: ₦${wcwSettings.participationReward.toLocaleString()} for stepping into the arena!\n\nDon't miss the glamour, the drama, and the declarations at 8:00 PM! 📣\n#WCWLiveEvent #GlamBattle #TuneInNow`
  ];
  
  return messages[Math.floor(Math.random() * messages.length)];
}

function formatWCWStartMessage() {
  return `🚨 *BREAKING: WCW IS LIVE ON AIR!* 🚨\n\nWelcome to the most electrifying show in town: *WOMAN CRUSH WEDNESDAY!* 🎉\n\n💃 *Ladies:* Drop your stunning photos NOW – it’s time to shine!\n👨‍⚖️ *Guys:* Rate those pics from 1-10 – make your votes count!\n\n🏆 *Prizes:*\n• Winner: ₦${wcwSettings.winnerReward.toLocaleString()} + eternal glory\n• Participants: ₦${wcwSettings.participationReward.toLocaleString()} for joining the vibe\n\n⏰ Ends at ${wcwSettings.endTime} – get those entries in!\n#WCWLive #SlayQueens #RateNow`;
}

async function sendWCWAnnouncement(sock, groupJid, message, mentions = []) {
  try {
    await sock.sendMessage(groupJid, { text: message, mentions });
    console.log(`✅ Sent WCW announcement to ${groupJid}`);
  } catch (error) {
    console.error(`Error sending announcement to ${groupJid}:`, error);
  }
}

async function sendWCWReminders(sock) {
  if (!wcwSettings.autoStartEnabled || !isWednesday()) return;
  
  for (const groupJid of wcwSettings.groupJids) {
    const timeUntil = moment.tz(`20:00`, 'HH:mm', 'Africa/Lagos').fromNow();
    const message = formatReminderMessage(timeUntil);
    const mentions = wcwSettings.tagAllMembers ? (await getGroupMembers(sock, groupJid)).map(m => m.id) : [];
    await sendWCWAnnouncement(sock, groupJid, message, mentions);
  }
}

async function startWCWSession(sock) {
  if (!wcwSettings.autoStartEnabled || !isWednesday()) return;
  
  for (const groupJid of wcwSettings.groupJids) {
    const session = await createWCWSession(groupJid);
    const message = formatWCWStartMessage();
    const mentions = wcwSettings.tagAllMembers ? (await getGroupMembers(sock, groupJid)).map(m => m.id) : [];
    await sendWCWAnnouncement(sock, groupJid, message, mentions);
  }
}

async function endWCWSession(sock) {
  if (!wcwSettings.autoStartEnabled || !isWednesday()) return;
  
  for (const groupJid of wcwSettings.groupJids) {
    const session = await getCurrentSession(groupJid);
    if (!session) continue;
    
    const participants = await PluginHelpers.safeDBOperation(async (db, collection) => 
      await collection.find({ sessionId: session.sessionId }).toArray()
    , COLLECTIONS.WCW_PARTICIPANTS);
    
    const ratings = await PluginHelpers.safeDBOperation(async (db, collection) => 
      await collection.find({ sessionId: session.sessionId }).toArray()
    , COLLECTIONS.WCW_RATINGS);
    
    const scores = participants.map(participant => {
      const participantRatings = ratings.filter(r => r.participantId === participant.userId);
      const totalScore = participantRatings.reduce((sum, r) => sum + r.rating, 0);
      const averageScore = participantRatings.length > 0 ? (totalScore / participantRatings.length).toFixed(2) : 0;
      return { ...participant, totalScore, averageScore, ratingCount: participantRatings.length };
    });
    
    scores.sort((a, b) => b.totalScore - a.totalScore || b.ratingCount - a.ratingCount);
    
    let winnerMessage = `🎉 *WCW RESULTS!* 🎉\n\nThe votes are in, and the queens have slayed! 👑\n\n🏆 *Leaderboard:*\n`;
    let hasParticipants = scores.length > 0;
    
    for (const [index, participant] of scores.entries()) {
      winnerMessage += `${index + 1}. ${participant.displayName || participant.userId.split('@')[0]} - Score: ${participant.averageScore} (${participant.ratingCount} votes)\n`;
      if (wcwSettings.enableParticipationReward) {
        await addMoney(participant.userId, wcwSettings.participationReward, 'WCW participation');
      }
    }
    
    if (hasParticipants && scores[0].ratingCount > 0) {
      const winner = scores[0];
      winnerMessage += `\n👑 *Winner:* ${winner.displayName || winner.userId.split('@')[0]} with ${winner.averageScore} points!\n💰 Reward: ₦${wcwSettings.winnerReward.toLocaleString()}\n`;
      await addMoney(winner.userId, wcwSettings.winnerReward, 'WCW winner');
    } else {
      winnerMessage += `\n😔 No winner this time – not enough votes or participants.\n`;
    }
    
    winnerMessage += `\nThanks for making WCW epic! See you next Wednesday! 💃 #WCWResults`;
    
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.updateOne(
        { sessionId: session.sessionId },
        { $set: { status: 'ended', endedAt: new Date(), winnerDeclared: true } }
      );
      await collection.collection(COLLECTIONS.WCW_RECORDS).insertOne({
        date: session.date,
        groupJid,
        participants: scores,
        winner: hasParticipants && scores[0].ratingCount > 0 ? scores[0] : null,
        timestamp: new Date()
      });
    }, COLLECTIONS.WCW_SESSIONS);
    
    await sendWCWAnnouncement(sock, groupJid, winnerMessage);
  }
}

function stopAllCronJobs() {
  if (cronJobs.startSession) cronJobs.startSession.destroy();
  if (cronJobs.endSession) cronJobs.endSession.destroy();
  cronJobs.reminders.forEach(job => job.destroy());
  cronJobs = { reminders: [], startSession: null, endSession: null };
}

async function setupWCWCronJobs(sock) {
  stopAllCronJobs();
  
  if (!wcwSettings.autoStartEnabled) return;
  
  cronJobs.startSession = cron.schedule(`0 ${wcwSettings.startTime.split(':')[1]} ${wcwSettings.startTime.split(':')[0]} * * 3`, () => startWCWSession(sock));
  cronJobs.endSession = cron.schedule(`0 ${wcwSettings.endTime.split(':')[1]} ${wcwSettings.endTime.split(':')[0]} * * 3`, () => endWCWSession(sock));
  
  for (const time of wcwSettings.reminderTimes) {
    const [hour, minute] = time.split(':');
    cronJobs.reminders.push(cron.schedule(`0 ${minute} ${hour} * * 3`, () => sendWCWReminders(sock)));
  }
  
  console.log('✅ WCW cron jobs scheduled');
}

// WCW PHOTO AND RATING HANDLING
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

function extractRating(messageText) {
  if (!messageText) return null;
  
  const ratingMatch = messageText.match(/(?:^|\s)(\d{1,2})(?:\/10)?(?:\s|$)/) ||
                    messageText.match(/(?:^|\s)([1-9]️⃣|🔟)(?:\s|$)/);
  
  if (!ratingMatch) return null;
  
  let rating;
  if (ratingMatch[1].includes('️⃣')) {
    rating = ratingMatch[1] === '🔟' ? 10 : parseInt(ratingMatch[1][0]);
  } else {
    rating = parseInt(ratingMatch[1]);
  }
  
  if (rating < wcwSettings.validRatingRange.min || rating > wcwSettings.validRatingRange.max) return null;
  return rating;
}

async function handlePhotoSubmission(m, sock) {
  if (!hasImage(m) || !isWednesday() || !wcwSettings.groupJids.includes(m.key.remoteJid)) return false;
  
  const session = await getCurrentSession(m.key.remoteJid);
  if (!session) return false;
  
  const userId = m.key.participant || m.key.remoteJid;
  const existingParticipant = await PluginHelpers.safeDBOperation(async (db, collection) => 
    await collection.findOne({ sessionId: session.sessionId, userId })
  , COLLECTIONS.WCW_PARTICIPANTS);
  
  if (existingParticipant) {
    await sock.sendMessage(m.key.remoteJid, { text: `⚠️ You've already submitted a photo for this WCW session.` }, { quoted: m });
    return true;
  }
  
  if ((await PluginHelpers.safeDBOperation(async (db, collection) => 
    await collection.countDocuments({ sessionId: session.sessionId })
  , COLLECTIONS.WCW_PARTICIPANTS)) >= wcwSettings.maxPhotosPerUser) {
    await sock.sendMessage(m.key.remoteJid, { text: `⚠️ Maximum photos reached for this session.` }, { quoted: m });
    return true;
  }
  
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.insertOne({
      sessionId: session.sessionId,
      userId,
      displayName: m.pushName || userId.split('@')[0],
      photoMessageId: m.key.id,
      timestamp: new Date()
    });
    await collection.collection(COLLECTIONS.WCW_SESSIONS).updateOne(
      { sessionId: session.sessionId },
      { $push: { participants: userId }, $inc: { totalParticipants: 1 } }
    );
  }, COLLECTIONS.WCW_PARTICIPANTS);
  
  await sock.sendMessage(m.key.remoteJid, { text: `✅ Photo submitted for WCW! Guys, rate this from 1-10!` }, { quoted: m });
  return true;
}

async function handleRatingSubmission(m, sock) {
  if (!isWednesday() || !wcwSettings.groupJids.includes(m.key.remoteJid)) return false;
  
  const session = await getCurrentSession(m.key.remoteJid);
  if (!session) return false;
  
  const rating = extractRating(m.body);
  if (!rating) return false;
  
  const raterId = m.key.participant || m.key.remoteJid;
  const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const participantId = quotedMessage ? m.message.extendedTextMessage.contextInfo.participant : null;
  
  if (!participantId || !hasImage({ message: quotedMessage })) {
    await sock.sendMessage(m.key.remoteJid, { text: `⚠️ Please reply to a participant's photo to rate.` }, { quoted: m });
    return true;
  }
  
  if (!wcwSettings.allowSelfRating && raterId === participantId) {
    await sock.sendMessage(m.key.remoteJid, { text: `⚠️ You cannot rate your own photo.` }, { quoted: m });
    return true;
  }
  
  const existingRating = await PluginHelpers.safeDBOperation(async (db, collection) => 
    await collection.findOne({ sessionId: session.sessionId, raterId, participantId })
  , COLLECTIONS.WCW_RATINGS);
  
  if (existingRating) {
    await sock.sendMessage(m.key.remoteJid, { text: `⚠️ You've already rated this participant's photo.` }, { quoted: m });
    return true;
  }
  
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.insertOne({
      sessionId: session.sessionId,
      raterId,
      participantId,
      rating,
      messageId: m.key.id,
      timestamp: new Date()
    });
    await collection.collection(COLLECTIONS.WCW_SESSIONS).updateOne(
      { sessionId: session.sessionId },
      { $inc: { totalRatings: 1 } }
    );
  }, COLLECTIONS.WCW_RATINGS);
  
  await sock.sendMessage(m.key.remoteJid, { text: `✅ Rating ${rating}/10 recorded!` }, { quoted: m });
  return true;
}

// WCW COMMANDS
async function showWCWMenu(reply, prefix) {
  await reply(
    `💃 *WOMAN CRUSH WEDNESDAY* 💃\n\n` +
    `📅 Runs every Wednesday from ${wcwSettings.startTime} to ${wcwSettings.endTime}\n` +
    `💰 Winner: ₦${wcwSettings.winnerReward.toLocaleString()}\n` +
    `🎁 Participation: ₦${wcwSettings.participationReward.toLocaleString()}\n\n` +
    `📸 *Ladies:* Post your photo during the session\n` +
    `⭐ *Guys:* Reply to photos with a rating (1-10)\n\n` +
    `📜 *Commands:*\n` +
    `• *${prefix}wcw start* - Start session (admin)\n` +
    `• *${prefix}wcw end* - End session (admin)\n` +
    `• *${prefix}wcw cancel* - Cancel session (admin)\n` +
    `• *${prefix}wcw current* - View current session\n` +
    `• *${prefix}wcw stats* - Your stats\n` +
    `• *${prefix}wcw history [limit]* - View history\n` +
    `• *${prefix}wcw leaderboard* - Top winners\n` +
    `• *${prefix}wcw settings* - View/modify settings (admin)\n` +
    `• *${prefix}wcw reschedule* - Reschedule cron (admin)\n` +
    `• *${prefix}wcw addgroup* - Add group (admin)\n` +
    `• *${prefix}wcw removegroup* - Remove group (admin)\n` +
    `• *${prefix}wcw addadmin <number>* - Add admin\n` +
    `• *${prefix}wcw removeadmin <number>* - Remove admin\n` +
    `• *${prefix}wcw test [message]* - Test rating\n` +
    `• *${prefix}wcwstats* - Quick stats\n` +
    `• *${prefix}wcwtest [message]* - Test rating`
  );
}

async function handleWCWStart(context) {
  const { reply, senderId, sock, from } = context;
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can start sessions.');
  
  if (!isWednesday()) return reply('⚠️ WCW runs only on Wednesdays.');
  
  const session = await getCurrentSession(from);
  if (session) return reply('⚠️ A WCW session is already active.');
  
  await createWCWSession(from);
  const message = formatWCWStartMessage();
  const mentions = wcwSettings.tagAllMembers ? (await getGroupMembers(sock, from)).map(m => m.id) : [];
  await sendWCWAnnouncement(sock, from, message, mentions);
  await reply('✅ WCW session started!');
}

async function handleWCWEnd(context) {
  const { reply, senderId, sock, from } = context;
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can end sessions.');
  
  const session = await getCurrentSession(from);
  if (!session) return reply('⚠️ No active WCW session.');
  
  await endWCWSession(sock);
  await reply('✅ WCW session ended and results announced!');
}

async function handleWCWCancel(context) {
  const { reply, senderId, sock, from } = context;
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can cancel sessions.');
  
  const success = await cancelWCWSession(from);
  if (!success) return reply('⚠️ No active WCW session to cancel.');
  
  await sendWCWAnnouncement(sock, from, `❌ *WCW CANCELLED* ❌\n\nSorry, this week's WCW has been cancelled. See you next Wednesday!`);
  await reply('✅ WCW session cancelled.');
}

async function handleWCWCurrent(context) {
  const { reply, from } = context;
  const session = await getCurrentSession(from);
  if (!session) return reply('📅 No active WCW session.');
  
  const participants = await PluginHelpers.safeDBOperation(async (db, collection) => 
    await collection.find({ sessionId: session.sessionId }).toArray()
  , COLLECTIONS.WCW_PARTICIPANTS);
  
  let message = `📸 *CURRENT WCW SESSION* 📸\n\n` +
               `📅 Date: ${session.date}\n` +
               `⏰ Started: ${moment(session.startedAt).format('HH:mm')}\n` +
               `👥 Participants: ${participants.length}\n` +
               `⭐ Total Ratings: ${session.totalRatings || 0}\n` +
               `🏆 Ends: ${wcwSettings.endTime}\n\n` +
               `📋 *Participants:*\n${participants.map(p => p.displayName || p.userId.split('@')[0]).join('\n') || 'None'}`;
  await reply(message);
}

async function handleWCWStats(context) {
  const { senderId, reply } = context;
  const userData = await getUserData(senderId);
  const participations = await PluginHelpers.safeDBOperation(async (db, collection) => 
    await collection.find({ userId: senderId }).count()
  , COLLECTIONS.WCW_PARTICIPANTS);
  
  const wins = await PluginHelpers.safeDBOperation(async (db, collection) => 
    await collection.find({ 'winner.userId': senderId }).count()
  , COLLECTIONS.WCW_RECORDS);
  
  await reply(
    `📊 *YOUR WCW STATS* 📊\n\n` +
    `📸 Participations: ${participations}\n` +
    `🏆 Wins: ${wins}\n` +
    `💰 Balance: ₦${userData.balance.toLocaleString()}`
  );
}

async function handleWCWHistory(context, args) {
  const { reply, senderId } = context;
  const limit = Math.min(parseInt(args[0]) || 5, 20);
  
  const records = await PluginHelpers.safeDBOperation(async (db, collection) => 
    await collection.find({ $or: [{ 'participants.userId': senderId }, { 'winner.userId': senderId }] })
      .sort({ date: -1 })
      .limit(limit)
      .toArray()
  , COLLECTIONS.WCW_RECORDS);
  
  if (records.length === 0) return reply('📜 No WCW history found.');
  
  let message = `📜 *WCW HISTORY* 📜\n\nShowing last ${records.length} sessions:\n\n`;
  for (const record of records) {
    const userParticipant = record.participants.find(p => p.userId === senderId);
    const isWinner = record.winner?.userId === senderId;
    message += `📅 ${record.date}\n`;
    message += `👥 Participants: ${record.participants.length}\n`;
    if (userParticipant) {
      message += `⭐ Your Score: ${userParticipant.averageScore} (${userParticipant.ratingCount} votes)\n`;
    }
    if (isWinner) {
      message += `🏆 You won! 💰 ₦${wcwSettings.winnerReward.toLocaleString()}\n`;
    }
    message += '\n';
  }
  
  await reply(message);
}

async function handleWCWLeaderboard(context) {
  const { reply } = context;
  const records = await PluginHelpers.safeDBOperation(async (db, collection) => 
    await collection.find({ 'winner.userId': { $exists: true } })
      .sort({ date: -1 })
      .limit(50)
      .toArray()
  , COLLECTIONS.WCW_RECORDS);
  
  const leaderboard = {};
  records.forEach(record => {
    if (record.winner) {
      const userId = record.winner.userId;
      leaderboard[userId] = leaderboard[userId] || { count: 0, displayName: record.winner.displayName || userId.split('@')[0] };
      leaderboard[userId].count += 1;
    }
  });
  
  const sorted = Object.entries(leaderboard)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5);
  
  let message = `🏆 *WCW LEADERBOARD* 🏆\n\nTop winners:\n\n`;
  if (sorted.length === 0) {
    message += 'No winners yet.';
  } else {
    sorted.forEach(([userId, data], index) => {
      message += `${index + 1}. ${data.displayName} - ${data.count} win${data.count > 1 ? 's' : ''}\n`;
    });
  }
  
  await reply(message);
}

async function handleWCWSettings(context, args) {
  const { reply, senderId, sock, from, config } = context;
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can modify settings.');
  
  if (args.length === 0) {
    await reply(
      `⚙️ *WCW SETTINGS* ⚙️\n\n` +
      `💰 Winner Prize: ₦${wcwSettings.winnerReward.toLocaleString()}\n` +
      `🎁 Participation: ₦${wcwSettings.participationReward.toLocaleString()} (${wcwSettings.enableParticipationReward ? 'On' : 'Off'})\n` +
      `⏰ Start Time: ${wcwSettings.startTime}\n` +
      `⏰ End Time: ${wcwSettings.endTime}\n` +
      `🤖 Auto Start: ${wcwSettings.autoStartEnabled ? 'On' : 'Off'}\n` +
      `📸 Max Photos: ${wcwSettings.maxPhotosPerUser}\n` +
      `⭐ Self Rating: ${wcwSettings.allowSelfRating ? 'Allowed' : 'Not Allowed'}\n` +
      `👥 Tag All: ${wcwSettings.tagAllMembers ? 'On' : 'Off'}\n` +
      `👑 Admins: ${wcwSettings.adminNumbers.length}\n` +
      `👥 Groups: ${wcwSettings.groupJids.length}\n\n` +
      `🔧 *Modify:*\n` +
      `• ${config.PREFIX}wcw settings prize <amount>\n` +
      `• ${config.PREFIX}wcw settings participation <amount>\n` +
      `• ${config.PREFIX}wcw settings starttime HH:MM\n` +
      `• ${config.PREFIX}wcw settings endtime HH:MM\n` +
      `• ${config.PREFIX}wcw settings autostart on/off\n` +
      `• ${config.PREFIX}wcw settings parreward on/off\n` +
      `• ${config.PREFIX}wcw settings selfrating on/off\n` +
      `• ${config.PREFIX}wcw settings tagall on/off`
    );
    return;
  }
  
  const setting = args[0].toLowerCase();
  const value = args.slice(1).join(' ').toLowerCase();
  let responseText = '';
  let needsReschedule = false;
  
  try {
    switch (setting) {
      case 'prize':
        const prize = parseInt(value);
        if (isNaN(prize) || prize < 0) return reply('⚠️ Invalid prize amount.');
        wcwSettings.winnerReward = prize;
        responseText = `✅ Winner prize: ₦${prize.toLocaleString()}`;
        break;
        
      case 'participation':
        const participation = parseInt(value);
        if (isNaN(participation) || participation < 0) return reply('⚠️ Invalid participation amount.');
        wcwSettings.participationReward = participation;
        responseText = `✅ Participation reward: ₦${participation.toLocaleString()}`;
        break;
        
      case 'starttime':
        if (!/^\d{2}:\d{2}$/.test(args[1])) return reply(`⚠️ Invalid. Use: ${config.PREFIX}wcw settings starttime 20:00`);
        wcwSettings.startTime = args[1];
        needsReschedule = true;
        responseText = `✅ Start time: ${args[1]}. Rescheduling cron.`;
        break;
        
      case 'endtime':
        if (!/^\d{2}:\d{2}$/.test(args[1])) return reply(`⚠️ Invalid. Use: ${config.PREFIX}wcw settings endtime 22:30`);
        wcwSettings.endTime = args[1];
        needsReschedule = true;
        responseText = `✅ End time: ${args[1]}. Rescheduling cron.`;
        break;
        
      case 'autostart':
        if (['on', 'true', 'enable'].includes(value)) {
          wcwSettings.autoStartEnabled = true;
          responseText = "✅ Auto-start enabled.";
          needsReschedule = true;
        } else if (['off', 'false', 'disable'].includes(value)) {
          wcwSettings.autoStartEnabled = false;
          responseText = "✅ Auto-start disabled.";
          needsReschedule = true;
        } else {
          responseText = `⚠️ Use: on/off`;
        }
        break;
        
      case 'parreward':
        if (['on', 'true', 'enable'].includes(value)) {
          wcwSettings.enableParticipationReward = true;
          responseText = "✅ Participation rewards enabled.";
        } else if (['off', 'false', 'disable'].includes(value)) {
          wcwSettings.enableParticipationReward = false;
          responseText = "✅ Participation rewards disabled.";
        } else {
          responseText = `⚠️ Use: on/off`;
        }
        break;
        
      case 'selfrating':
        if (['on', 'true', 'enable'].includes(value)) {
          wcwSettings.allowSelfRating = true;
          responseText = "✅ Self-rating enabled.";
        } else if (['off', 'false', 'disable'].includes(value)) {
          wcwSettings.allowSelfRating = false;
          responseText = "✅ Self-rating disabled.";
        } else {
          responseText = `⚠️ Use: on/off`;
        }
        break;
        
      case 'tagall':
        if (['on', 'true', 'enable'].includes(value)) {
          wcwSettings.tagAllMembers = true;
          responseText = "✅ Tag all members enabled.";
        } else if (['off', 'false', 'disable'].includes(value)) {
          wcwSettings.tagAllMembers = false;
          responseText = "✅ Tag all members disabled.";
        } else {
          responseText = `⚠️ Use: on/off`;
        }
        break;
        
      default:
        responseText = `⚠️ Unknown: ${setting}\nAvailable: prize, participation, starttime, endtime, autostart, parreward, selfrating, tagall`;
    }
    
    await saveSettings();
    await reply(responseText);
    
    if (needsReschedule && context.sock) {
      await setupWCWCronJobs(context.sock);
    }
    
  } catch (error) {
    await reply('❌ Error updating settings.');
    console.error('WCW settings error:', error);
  }
}

async function handleWCWReschedule(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can reschedule.');
  
  try {
    await setupWCWCronJobs(sock);
    await reply('✅ Cron jobs rescheduled!');
  } catch (error) {
    await reply('❌ Error rescheduling.');
    console.error('WCW reschedule error:', error);
  }
}

async function handleWCWAddGroup(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can add groups.');
  
  if (!from.endsWith('@g.us')) return reply('❌ Use in group.');
  
  if (wcwSettings.groupJids.includes(from)) return reply('✅ Group already added.');
  
  wcwSettings.groupJids.push(from);
  await saveSettings();
  await reply('✅ Group added to WCW!');
}

async function handleWCWRemoveGroup(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can remove groups.');
  
  if (!from.endsWith('@g.us')) return reply('❌ Use in group.');
  
  const index = wcwSettings.groupJids.indexOf(from);
  if (index === -1) return reply('❌ Group not in WCW.');
  
  wcwSettings.groupJids.splice(index, 1);
  await saveSettings();
  await reply('✅ Group removed from WCW.');
}

async function handleWCWAddAdmin(context, args) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can add admins.');
  
  const number = args[0]?.replace(/\D/g, '');
  if (!number) return reply('⚠️ Use: addadmin <number>');
  
  if (wcwSettings.adminNumbers.includes(number)) return reply('✅ Already admin.');
  
  wcwSettings.adminNumbers.push(number);
  await saveSettings();
  await reply(`✅ Admin added: ${number}`);
}

async function handleWCWRemoveAdmin(context, args) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can remove admins.');
  
  const number = args[0]?.replace(/\D/g, '');
  if (!number) return reply('⚠️ Use: removeadmin <number>');
  
  const index = wcwSettings.adminNumbers.indexOf(number);
  if (index === -1) return reply('❌ Not an admin.');
  
  wcwSettings.adminNumbers.splice(index, 1);
  await saveSettings();
  await reply(`✅ Admin removed: ${number}`);
}

async function handleWCWTest(context, args) {
  const { reply, config } = context;
  
  const testText = args.join(' ');
  if (!testText) return reply(`🔍 *WCW RATING VALIDATOR* 🔍\n\n*Usage:* ${config.PREFIX}wcwtest [message]\n\n*Examples:*\n• ${config.PREFIX}wcwtest "She looks amazing! 9"\n• ${config.PREFIX}wcwtest "8️⃣ beautiful"\n• ${config.PREFIX}wcwtest "🔟 stunning queen!"`);
  
  try {
    const rating = extractRating(testText);
    
    let result = `🔍 *RESULTS* 🔍\n\n`;
    result += `📝 Message: "${testText}"\n\n`;
    
    if (rating) {
      result += `✅ *VALID!*\n`;
      result += `⭐ Rating: ${rating}/10\n`;
    } else {
      result += `❌ *INVALID*\n\n`;
      result += `💡 *Formats:*\n`;
      result += `• Numbers: "9", "10", "She's a perfect 8"\n`;
      result += `• Emojis: "9️⃣", "🔟", "Beautiful 1️⃣0️⃣"\n`;
      result += `• Range: 1-10`;
    }
    
    await reply(result);
    
  } catch (error) {
    await reply('❌ Error testing.');
    console.error('WCW test error:', error);
  }
}

// MAIN PLUGIN HANDLER AND INIT
export async function init(sock) {
  await loadSettings();
  await setupWCWCronJobs(sock);
  console.log('✅ WCW plugin initialized');
}

export default async function wcwHandler(m, sock, config) {
  try {
    // Handle non-command
    if (m.body && !m.body.startsWith(config.PREFIX)) {
      if (await handlePhotoSubmission(m, sock)) return;
      if (await handleRatingSubmission(m, sock)) return;
    }
    
    // Handle commands
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args.shift().toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const reply = async (text) => sock.sendMessage(from, { text }, { quoted: m });
    
    if (['wcw', 'womancrush'].includes(command)) {
      if (args.length === 0) return await showWCWMenu(reply, config.PREFIX);
      await handleWCWSubCommand(args[0], args.slice(1), { m, sock, config, senderId, from, reply });
    } else if (['wcwstats', 'wcwhistory'].includes(command)) {
      await handleWCWStats({ senderId, reply });
    } else if (['wcwtest', 'testwcw'].includes(command)) {
      await handleWCWTest({ reply, config }, args);
    }
    
  } catch (error) {
    console.error('❌ WCW plugin error:', error);
  }
}

export { 
  setupWCWCronJobs,
  stopAllCronJobs,
  wcwSettings
};
