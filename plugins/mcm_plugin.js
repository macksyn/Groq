// plugins/mcm.js - Man Crush Monday Plugin
import { getDatabase, getCollection, safeOperation } from '../lib/mongoManager.js';
import moment from 'moment-timezone';
import cron from 'node-cron';

// Plugin information export
export const info = {
  name: 'Man Crush Monday (MCM)',
  version: '1.0.0',
  author: 'Alex Macksyn',
  description: 'Weekly Man Crush Monday contest where gentlemen post pictures and ladies rate them from 1-10. Automatic scheduling with node-cron, winner declaration based on total points, and rewards system.',
  commands: [
    {
      name: 'mcm',
      aliases: ['mancrush'],
      description: 'Access MCM system commands and settings'
    },
    {
      name: 'mcmstats',
      aliases: ['mcmhistory'],
      description: 'View MCM statistics and history'
    },
    {
      name: 'mcmtest',
      aliases: ['testmcm'],
      description: 'Test MCM rating validation'
    }
  ]
};

// MongoDB Configuration
const COLLECTIONS = {
  MCM_RECORDS: 'mcm_records',
  MCM_SETTINGS: 'mcm_settings',
  MCM_SESSIONS: 'mcm_sessions',
  MCM_PARTICIPANTS: 'mcm_participants',
  MCM_RATINGS: 'mcm_ratings',
  USERS: 'users'
};

// Database reference
let db = null;

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default MCM settings
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

let mcmSettings = { ...defaultSettings };

// Cron jobs storage
let cronJobs = {
  reminders: [],
  startSession: null,
  endSession: null
};

// Initialize database and settings
async function initDatabase() {
  try {
    db = await getDatabase();
    await safeOperation(async (db) => {
      await db.collection(COLLECTIONS.MCM_SESSIONS).createIndex({ date: 1, groupJid: 1 }, { unique: true });
      await db.collection(COLLECTIONS.MCM_PARTICIPANTS).createIndex({ sessionId: 1, userId: 1 });
      await db.collection(COLLECTIONS.MCM_RATINGS).createIndex({ sessionId: 1, raterId: 1, participantId: 1 });
      await db.collection(COLLECTIONS.MCM_RECORDS).createIndex({ date: -1 });
      await db.collection(COLLECTIONS.USERS).createIndex({ userId: 1 }, { unique: true });
    });
    console.log('✅ MongoDB initialized for MCM');
  } catch (error) {
    console.error('❌ MongoDB init failed for MCM:', error);
    throw error;
  }
}

async function loadSettings() {
  try {
    const settings = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_SETTINGS).findOne({ type: 'mcm_config' })
    );
    if (settings) {
      mcmSettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading MCM settings:', error);
  }
}

async function saveSettings() {
  try {
    await safeOperation(async (db) => {
      await db.collection(COLLECTIONS.MCM_SETTINGS).replaceOne(
        { type: 'mcm_config' },
        { type: 'mcm_config', data: mcmSettings, updatedAt: new Date() },
        { upsert: true }
      );
    });
  } catch (error) {
    console.error('Error saving MCM settings:', error);
  }
}

function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('YYYY-MM-DD');
}

function isMonday() {
  return getNigeriaTime().day() === 1; // 1 = Monday
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
  if (mcmSettings.adminNumbers.includes(sender.split('@')[0])) return true;
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
    await safeOperation(async (db) => {
      await db.collection(COLLECTIONS.USERS).updateOne(
        { userId },
        { $setOnInsert: { balance: 0, transactions: [] } },
        { upsert: true }
      );
    });
  } catch (error) {
    console.error('Error initializing user:', error);
  }
}

async function addMoney(userId, amount, reason) {
  try {
    await safeOperation(async (db) => {
      await db.collection(COLLECTIONS.USERS).updateOne(
        { userId },
        {
          $inc: { balance: amount },
          $push: { transactions: { amount, reason, date: new Date() } }
        }
      );
    });
  } catch (error) {
    console.error('Error adding money:', error);
  }
}

async function getUserData(userId) {
  try {
    return await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.USERS).findOne({ userId }) || { balance: 0 }
    );
  } catch (error) {
    console.error('Error getting user data:', error);
    return { balance: 0 };
  }
}

// MCM SESSION MANAGEMENT
async function createMCMSession(groupJid) {
  try {
    const today = getCurrentDate();
    const sessionId = `mcm_${today}_${groupJid}`;
    
    const existingSession = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_SESSIONS).findOne({ date: today, groupJid })
    );
    
    if (existingSession) {
      console.log(`MCM session already exists for ${today}`);
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
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_SESSIONS).insertOne(sessionData)
    );
    console.log(`✅ MCM session created for ${today}`);
    return sessionData;
  } catch (error) {
    console.error('Error creating MCM session:', error);
    throw error;
  }
}

async function getCurrentSession(groupJid) {
  try {
    const today = getCurrentDate();
    return await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_SESSIONS).findOne({ date: today, groupJid, status: 'active' })
    );
  } catch (error) {
    console.error('Error getting current session:', error);
    return null;
  }
}

async function cancelMCMSession(groupJid) {
  try {
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_SESSIONS).updateOne(
        { sessionId: session.sessionId },
        { $set: { status: 'cancelled', endedAt: new Date() } }
      )
    );
    return true;
  } catch (error) {
    console.error('Error cancelling MCM session:', error);
    return false;
  }
}

// MCM ANNOUNCEMENTS AND REMINDERS
function formatReminderMessage(timeUntil) {
  const messages = [
    `🔥 *MCM COUNTDOWN IS ON!* 🔥\n\nLadies and gentlemen, welcome to the ultimate charm showdown! 🕺✨\n\nIn just ${timeUntil}, the spotlight turns on for MAN CRUSH MONDAY!\n\n👑 *Gentlemen:* Prepare to impress with your sharp photos – the ladies are waiting to crown the king!\n👀 *Ladies:* Get your ratings ready – 1 to 10, make it count!\n\n💥 Epic prizes: Winner grabs ₦${mcmSettings.winnerReward.toLocaleString()} + bragging rights!\n🎉 Participation vibe: ₦${mcmSettings.participationReward.toLocaleString()} just for joining the fun!\n\nTune in at 8:00 PM sharp – this is YOUR stage! 📺\n#MCMSpotlight #CharmNight #RateTheKings`,

    `🎤 *LIVE FROM GIST HQ: MCM PRE-SHOW HYPE!* 🎤\n\nThe clock is ticking... ${timeUntil} until the red carpet rolls out for MAN CRUSH MONDAY! 🌟\n\n💪 *Gentlemen, it's showtime:* Strike a pose, upload your dapper pic, and let the ratings pour in!\n👩‍⚖️ *Ladies, you're the judges:* From 1-10, vote for the ultimate crush!\n\n🏆 Grand prize alert: ₦${mcmSettings.winnerReward.toLocaleString()} for the top gent!\n🎁 Everyone wins: ₦${mcmSettings.participationReward.toLocaleString()} for stepping into the arena!\n\nDon't miss the charisma, the charm, and the declarations at 8:00 PM! 📣\n#MCMLiveEvent #CharmBattle #TuneInNow`
  ];
  
  return messages[Math.floor(Math.random() * messages.length)];
}

function formatMCMStartMessage() {
  return `🚨 *BREAKING: MCM IS LIVE ON AIR!* 🚨\n\nWelcome to the most electrifying night of the week – MAN CRUSH MONDAY! 📺💥\n\n🕺 *Gentlemen, take center stage:* Drop your jaw-dropping photo NOW and steal the show!\n👩‍⚖️ *Ladies, the power is yours:* Rate from 1-10 – who will you crown?\n\n⏳ The clock is ticking until 10:00 PM – make every second count!\n💰 Jackpot: Winner scores ₦${mcmSettings.winnerReward.toLocaleString()}!\n🎉 Bonus: ₦${mcmSettings.participationReward.toLocaleString()} for all stars who shine!\n\n📜 *Rules of the Game:*\n• One photo per gent (duplicates? No spotlight!)\n• Ratings 1-10 only – keep it real!\n• Self-rating: ${mcmSettings.allowSelfRating ? 'Go for it!' : 'Hands off your own!'}\n\n💡 *Pro Tip:* Use "8", "He's a 10", or emojis like 🔟 for ratings!\n\nLet the charisma, charm, and votes explode! 🌟\n#MCMLive #GistHQShowdown #CrushHour`;
}

// ENHANCED RATING SYSTEM WITH EMOJI SUPPORT
function extractRating(text) {
  if (text.includes('1️⃣0️⃣')) {
    return 10;
  }
  
  const emojiToNumber = {
    '🔟': 10,
    '9️⃣': 9,
    '8️⃣': 8,
    '7️⃣': 7,
    '6️⃣': 6,
    '5️⃣': 5,
    '4️⃣': 4,
    '3️⃣': 3,
    '2️⃣': 2,
    '1️⃣': 1
  };
  
  for (const [emoji, number] of Object.entries(emojiToNumber).reverse()) {
    if (text.includes(emoji)) {
      return number;
    }
  }
  
  const numbers = text.match(/\b([1-9]|10)\b/g);
  if (!numbers) return null;
  
  const rating = parseInt(numbers[numbers.length - 1]);
  if (rating >= mcmSettings.validRatingRange.min && rating <= mcmSettings.validRatingRange.max) {
    return rating;
  }
  
  return null;
}

// NODE-CRON SCHEDULING SYSTEM
async function setupMCMCronJobs(sock) {
  try {
    stopAllCronJobs();
    
    mcmSettings.reminderTimes.forEach((reminderTime, index) => {
      const [hours, minutes] = reminderTime.split(':');
      const cronPattern = `${minutes} ${hours} * * 1`; // Monday
      
      const cronJob = cron.schedule(cronPattern, async () => {
        console.log(`⏰ MCM Reminder ${index + 1} triggered at ${reminderTime}`);
        await sendMCMReminders(sock);
      }, {
        scheduled: false,
        timezone: 'Africa/Lagos'
      });
      
      cronJobs.reminders.push(cronJob);
      cronJob.start();
      console.log(`✅ MCM Reminder ${index + 1} scheduled`);
    });
    
    if (mcmSettings.autoStartEnabled) {
      const [startHours, startMinutes] = mcmSettings.startTime.split(':');
      const startCronPattern = `${startMinutes} ${startHours} * * 1`;
      
      cronJobs.startSession = cron.schedule(startCronPattern, async () => {
        console.log(`🎬 MCM Auto-start at ${mcmSettings.startTime}`);
        for (const groupJid of mcmSettings.groupJids) {
          try {
            if (!await getCurrentSession(groupJid)) {
              await startMCMSession(sock, groupJid);
            }
          } catch (error) {
            console.error(`Error auto-starting for ${groupJid}:`, error);
          }
        }
      }, {
        scheduled: false,
        timezone: 'Africa/Lagos'
      });
      
      cronJobs.startSession.start();
      console.log(`✅ MCM Auto-start scheduled`);
    }
    
    const [endHours, endMinutes] = mcmSettings.endTime.split(':');
    const endCronPattern = `${endMinutes} ${endHours} * * 1`;
    
    cronJobs.endSession = cron.schedule(endCronPattern, async () => {
      console.log(`🏁 MCM Auto-end at ${mcmSettings.endTime}`);
      for (const groupJid of mcmSettings.groupJids) {
        try {
          await endMCMSession(sock, groupJid);
        } catch (error) {
          console.error(`Error auto-ending for ${groupJid}:`, error);
        }
      }
    }, {
      scheduled: false,
      timezone: 'Africa/Lagos'
    });
    
    cronJobs.endSession.start();
    console.log(`✅ MCM Auto-end scheduled`);
    
    console.log('🎯 All MCM cron jobs setup');
    
  } catch (error) {
    console.error('Error setting up MCM cron jobs:', error);
  }
}

function stopAllCronJobs() {
  cronJobs.reminders.forEach(job => job && job.stop());
  cronJobs.reminders = [];
  
  if (cronJobs.startSession) {
    cronJobs.startSession.stop();
    cronJobs.startSession = null;
  }
  
  if (cronJobs.endSession) {
    cronJobs.endSession.stop();
    cronJobs.endSession = null;
  }
  
  console.log('🔄 All MCM cron jobs stopped');
}

async function sendMCMReminders(sock) {
  try {
    if (!isMonday()) return;
    
    const startMoment = moment(`${getCurrentDate()} ${mcmSettings.startTime}`, 'YYYY-MM-DD HH:mm');
    const now = getNigeriaTime();
    
    if (now.isSameOrAfter(startMoment)) return;
    
    const timeUntil = moment.duration(startMoment.diff(now)).humanize();
    const reminderMessage = formatReminderMessage(timeUntil);
    
    for (const groupJid of mcmSettings.groupJids) {
      try {
        const members = await getGroupMembers(sock, groupJid);
        const mentions = mcmSettings.tagAllMembers ? members.map(m => m.id) : [];
        
        await sock.sendMessage(groupJid, {
          text: reminderMessage,
          mentions
        });
        console.log(`✅ MCM reminder sent to ${groupJid}`);
      } catch (error) {
        console.error(`Error sending reminder to ${groupJid}:`, error);
      }
    }
  } catch (error) {
    console.error('Error sending reminders:', error);
  }
}

async function startMCMSession(sock, groupJid) {
  try {
    const session = await createMCMSession(groupJid);
    const startMessage = formatMCMStartMessage();
    
    const members = await getGroupMembers(sock, groupJid);
    const mentions = mcmSettings.tagAllMembers ? members.map(m => m.id) : [];
    
    const sentMessage = await sock.sendMessage(groupJid, {
      text: startMessage,
      mentions
    });
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_SESSIONS).updateOne(
        { sessionId: session.sessionId },
        { $set: { startMessageKey: sentMessage.key } }
      )
    );
    
    console.log(`✅ MCM session started for ${groupJid}`);
    return session;
  } catch (error) {
    console.error('Error starting MCM session:', error);
    throw error;
  }
}

// PHOTO SUBMISSION HANDLING
async function handlePhotoSubmission(m, sock) {
  try {
    if (!isMonday()) return false;
    
    const now = getNigeriaTime();
    const startMoment = moment(`${getCurrentDate()} ${mcmSettings.startTime}`, 'YYYY-MM-DD HH:mm');
    const endMoment = moment(`${getCurrentDate()} ${mcmSettings.endTime}`, 'YYYY-MM-DD HH:mm');
    
    if (now.isBefore(startMoment) || now.isSameOrAfter(endMoment)) return false;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const groupJid = m.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) return false;
    
    if (!m.message.imageMessage) return false;
    
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    const existingParticipant = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_PARTICIPANTS).findOne({ sessionId: session.sessionId, userId: senderId })
    );
    
    if (existingParticipant) {
      await sock.sendMessage(groupJid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(groupJid, {
        text: `🚫 @${senderId.split('@')[0]} - You already submitted your photo! Only your first photo counts for MCM.`,
        mentions: [senderId]
      }, { quoted: m });
      return true;
    }
    
    const participantData = {
      sessionId: session.sessionId,
      userId: senderId,
      userPhone: senderId.split('@')[0],
      messageKey: m.key,
      photoSubmittedAt: new Date(),
      ratings: [],
      totalRating: 0,
      averageRating: 0,
      ratingCount: 0
    };
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_PARTICIPANTS).insertOne(participantData)
    );
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_SESSIONS).updateOne(
        { sessionId: session.sessionId },
        { $push: { participants: senderId } }
      )
    );
    
    await sock.sendMessage(groupJid, { react: { text: '✅', key: m.key } });
    
    await initUser(senderId);
    
    console.log(`📸 MCM photo submitted by ${senderId.split('@')[0]}`);
    return true;
    
  } catch (error) {
    console.error('Error handling photo submission:', error);
    return false;
  }
}

// RATING SUBMISSION HANDLING
async function handleRatingSubmission(m, sock) {
  try {
    if (!isMonday()) return false;
    
    const now = getNigeriaTime();
    const startMoment = moment(`${getCurrentDate()} ${mcmSettings.startTime}`, 'YYYY-MM-DD HH:mm');
    const endMoment = moment(`${getCurrentDate()} ${mcmSettings.endTime}`, 'YYYY-MM-DD HH:mm');
    
    if (now.isBefore(startMoment) || now.isSameOrAfter(endMoment)) return false;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const groupJid = m.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) return false;
    if (!m.message.extendedTextMessage?.contextInfo?.quotedMessage) return false;
    
    if (!m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage) return false;
    
    const participantId = m.message.extendedTextMessage.contextInfo.participant;
    
    if (!participantId) return false;
    
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    const participant = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_PARTICIPANTS).findOne({ sessionId: session.sessionId, userId: participantId })
    );
    
    if (!participant) return false;
    
    if (!mcmSettings.allowSelfRating && senderId === participantId) {
      await sock.sendMessage(groupJid, { react: { text: '🚫', key: m.key } });
      await sock.sendMessage(groupJid, {
        text: `🚫 @${senderId.split('@')[0]} - Self-rating is not allowed!`,
        mentions: [senderId]
      }, { quoted: m });
      return true;
    }
    
    const ratingText = m.body || '';
    
    // Check if the message contains a potential rating (numbers or emojis)
    const hasRatingAttempt = ratingText.match(/\b([1-9]|10)\b/) || 
                            Object.keys(emojiToNumber).some(emoji => ratingText.includes(emoji)) || 
                            ratingText.includes('1️⃣0️⃣');
    
    if (!hasRatingAttempt) {
      return false;
    }
    
    const rating = extractRating(ratingText);
    
    if (!rating) {
      await sock.sendMessage(groupJid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(groupJid, {
        text: `❌ @${senderId.split('@')[0]} - Invalid rating! Please use a number or emoji between 1-10 (e.g., "8", "🔟").`,
        mentions: [senderId]
      }, { quoted: m });
      return true;
    }
    
    const existingRating = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_RATINGS).findOne({
        sessionId: session.sessionId,
        raterId: senderId,
        participantId: participantId
      })
    );
    
    if (existingRating) {
      await safeOperation(async (db) => 
        await db.collection(COLLECTIONS.MCM_RATINGS).updateOne(
          { _id: existingRating._id },
          { $set: { rating, updatedAt: new Date() } }
        )
      );
    } else {
      const ratingData = {
        sessionId: session.sessionId,
        raterId: senderId,
        raterPhone: senderId.split('@')[0],
        participantId: participantId,
        participantPhone: participantId.split('@')[0],
        rating,
        createdAt: new Date()
      };
      
      await safeOperation(async (db) => 
        await db.collection(COLLECTIONS.MCM_RATINGS).insertOne(ratingData)
      );
    }
    
    await updateParticipantRatings(session.sessionId, participantId);
    
    await sock.sendMessage(groupJid, { react: { text: '✅', key: m.key } });
    
    console.log(`⭐ MCM rating ${rating} by ${senderId.split('@')[0]} to ${participantId.split('@')[0]}`);
    return true;
    
  } catch (error) {
    console.error('Error handling rating:', error);
    return false;
  }
}

async function updateParticipantRatings(sessionId, participantId) {
  try {
    const ratings = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_RATINGS).find({ sessionId, participantId }).toArray()
    );
    
    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    const ratingCount = ratings.length;
    const averageRating = ratingCount > 0 ? (totalRating / ratingCount) : 0;
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_PARTICIPANTS).updateOne(
        { sessionId, userId: participantId },
        {
          $set: {
            totalRating,
            averageRating: Math.round(averageRating * 100) / 100,
            ratingCount,
            updatedAt: new Date()
          }
        }
      )
    );
    
  } catch (error) {
    console.error('Error updating ratings:', error);
  }
}

// Utility for delays
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// END MCM SESSION AND DECLARE WINNER
async function endMCMSession(sock, groupJid) {
  try {
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    const participants = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_PARTICIPANTS).find({ sessionId: session.sessionId })
        .sort({ totalRating: -1, ratingCount: -1 }).toArray()
    );
    
    if (participants.length === 0) {
      await sock.sendMessage(groupJid, { text: `🕺 *MCM SESSION ENDED* 🕺\n\n❌ No participants today!\n\nBetter luck next Monday! 💪` });
      
      await safeOperation(async (db) => 
        await db.collection(COLLECTIONS.MCM_SESSIONS).updateOne(
          { sessionId: session.sessionId },
          { $set: { status: 'ended', endedAt: new Date(), winnerDeclared: true } }
        )
      );
      
      return true;
    }
    
    if (mcmSettings.enableParticipationReward) {
      for (const participant of participants) {
        await addMoney(participant.userId, mcmSettings.participationReward, 'MCM participation');
      }
    }
    
    const maxTotal = participants[0].totalRating;
    const winners = participants.filter(p => p.totalRating === maxTotal);
    
    const hasValidRatings = winners[0].ratingCount > 0;
    
    const members = await getGroupMembers(sock, groupJid);
    const mentions = mcmSettings.tagAllMembers ? members.map(m => m.id) : [];
    const participantMentions = participants.map(p => p.userId);
    
    await sock.sendMessage(groupJid, {
      text: `🎬 *AND THAT'S A WRAP ON TONIGHT'S MCM!* 🎬\n\nLadies and gentlemen, what a thrilling episode! The votes are in, the charisma has peaked... now sit back, grab some popcorn 🍿, as our judges tally the ratings in the control room!\n\nStay tuned – results dropping in just a moment! 📊🔥\n#MCMFinale #GistHQAfterShow`,
      mentions
    });
    
    await delay(60000);
    
    let resultsMessage = `📣 *OFFICIAL MCM SCOREBOARD – ${getCurrentDate()}* 📣\n\nFrom the Gist HQ studios, here are the final tallies for tonight's charm extravaganza! 🌟\n\n📊 *COMPLETE STANDINGS (Total Points):*\n\n`;
    
    participants.forEach((participant, index) => {
      const position = index + 1;
      const emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      const avgRating = participant.averageRating > 0 ? participant.averageRating.toFixed(1) : '0.0';
      
      resultsMessage += `${emoji} #${position} @${participant.userPhone}\n`;
      resultsMessage += `   ⭐ Total Points: ${participant.totalRating} (${participant.ratingCount} votes, avg ${avgRating}/10)\n\n`;
    });
    
    await sock.sendMessage(groupJid, {
      text: resultsMessage,
      mentions: participantMentions
    });
    
    await delay(5000);
    
    if (hasValidRatings) {
      let winnerMessage = `🥁 *DRUMROLL PLEASE... THE MOMENT YOU'VE BEEN WAITING FOR!* 🥁\n\nFrom the edge-of-your-seat ratings, emerging victorious in tonight's MCM showdown...\n\n`;
      
      if (winners.length > 1) {
        winnerMessage += `🎉 *IT'S A TIE FOR THE CROWN!* 👑\n\nOur co-kings of the night:\n`;
        for (const winner of winners) {
          winnerMessage += `• @${winner.userPhone} with an epic ${winner.totalRating} points! 🌟\n`;
        }
        winnerMessage += `\nWhat a nail-biter! Congrats to our tied champions – you owned the stage! 🕺🔥\n\n`;
        
        await sock.sendMessage(groupJid, {
          text: winnerMessage,
          mentions: winners.map(w => w.userId)
        });
        
        for (const winner of winners) {
          await sock.sendMessage(groupJid, {
            text: `👏 Spotlight on our winner @${winner.userPhone}! Here's the photo that stole the show: 📸`,
            mentions: [winner.userId]
          }, { quoted: { key: winner.messageKey, message: { imageMessage: {} } } });
          await delay(2000);
        }
      } else {
        const winner = winners[0];
        winnerMessage += `👑 *THE UNDISPUTED MCM CHAMPION: @${winner.userPhone} with ${winner.totalRating} points!* 👑\n\nWhat a performance! You owned the night – congrats on your well-deserved victory! 🎊💥\n\n`;
        
        await sock.sendMessage(groupJid, {
          text: winnerMessage,
          mentions: [winner.userId]
        });
        
        await sock.sendMessage(groupJid, {
          text: `📸 Relive the winning glow! Here's @${winner.userPhone}'s stunning entry that captured hearts: ✨`,
          mentions: [winner.userId]
        }, { quoted: { key: winner.messageKey, message: { imageMessage: {} } } });
      }
      
      await delay(5000);
      
      const prizePerWinner = mcmSettings.winnerReward / winners.length;
      let rewardMessage = `💰 *PRIZE TIME FROM GIST HQ!* 💰\n\n`;
      if (winners.length > 1) {
        rewardMessage += `Our tied winners each take home ₦${prizePerWinner.toLocaleString()} – split the glory and the gold! 🏆\n\n`;
      } else {
        rewardMessage += `Our champion @${winners[0].userPhone} pockets ₦${mcmSettings.winnerReward.toLocaleString()} – treat yourself, king! 👑\n\n`;
      }
      rewardMessage += `Plus, shoutout to all participants for the ₦${mcmSettings.participationReward.toLocaleString()} vibe check! 🎁\n\nWhat a payout!`;
      
      await sock.sendMessage(groupJid, {
        text: rewardMessage,
        mentions: winners.map(w => w.userId)
      });
    } else {
      await sock.sendMessage(groupJid, {
        text: `😔 *NO RATINGS TONIGHT – THE CROWN STAYS VACANT!* 😔\n\nWhat a twist! Better luck next time, stars. No winner declared, but thanks for the energy! 🌟`
      });
    }
    
    await delay(60000);
    
    await sock.sendMessage(groupJid, {
      text: `🙌 *THAT'S ALL FROM MCM TONIGHT!* 🙌\n\nFrom the Gist HQ team: A massive thank you to all our dashing participants, sharp-eyed raters, and everyone who tuned in! You made this episode legendary! 🎉\n\nSame time next Monday at 8:00 PM – get ready for more charisma, more charm, more crushes! Until then, keep shining! ✨\n#MCMSignOff #SeeYouNextWeek #GistHQForever`,
      mentions
    });
    
    const recordData = {
      date: getCurrentDate(),
      groupJid,
      sessionId: session.sessionId,
      totalParticipants: participants.length,
      winners: hasValidRatings ? winners.map(w => ({
        userId: w.userId,
        userPhone: w.userPhone,
        totalRating: w.totalRating,
        averageRating: w.averageRating,
        ratingCount: w.ratingCount,
        prizeAwarded: mcmSettings.winnerReward / winners.length
      })) : [],
      participants,
      createdAt: new Date()
    };
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_RECORDS).insertOne(recordData)
    );
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_SESSIONS).updateOne(
        { sessionId: session.sessionId },
        { $set: { status: 'ended', endedAt: new Date(), winnerDeclared: true } }
      )
    );
    
    console.log(`✅ MCM session ended for ${groupJid}`);
    return true;
    
  } catch (error) {
    console.error('Error ending MCM session:', error);
    return false;
  }
}

// COMMAND HANDLERS
async function showMCMMenu(reply, prefix) {
  const nextMCM = moment().startOf('week').add(1, 'days').format('dddd, MMMM DD, YYYY');
  
  const menuText = `🕺 *MAN CRUSH MONDAY (MCM)* 🕺\n\n` +
                  `📊 *User Commands:*\n` +
                  `• *current* - View current MCM status\n` +
                  `• *stats* - View your MCM statistics\n` +
                  `• *history* - View MCM history\n` +
                  `• *leaderboard* - View all-time winners\n\n` +
                  `👑 *Admin Commands:*\n` +
                  `• *start* - Start MCM manually\n` +
                  `• *end* - End current MCM\n` +
                  `• *cancel* - Cancel current MCM\n` +
                  `• *addgroup* - Add current group to MCM\n` +
                  `• *removegroup* - Remove current group from MCM\n` +
                  `• *addadmin <number>* - Add admin\n` +
                  `• *removeadmin <number>* - Remove admin\n` +
                  `• *settings* - System settings\n` +
                  `• *reschedule* - Update cron schedules\n\n` +
                  `⏰ *Schedule (Node-Cron):*\n` +
                  `• Every Monday 8:00 PM - 10:00 PM\n` +
                  `• Reminders: 10:00 AM & 4:00 PM\n\n` +
                  `💰 *Rewards:*\n` +
                  `• Winner: ₦${mcmSettings.winnerReward.toLocaleString()}\n` +
                  `• Participation: ₦${mcmSettings.participationReward.toLocaleString()}\n\n` +
                  `📅 *Next MCM: ${nextMCM} 8:00 PM*\n\n` +
                  `💡 *Usage:* ${prefix}mcm [command]`;
  
  await reply(menuText);
}

async function handleMCMStart(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can start MCM.');
  
  if (!from.endsWith('@g.us')) return reply('❌ MCM in groups only.');
  
  try {
    if (await getCurrentSession(from)) return reply('🕺 MCM already active!');
    
    await startMCMSession(sock, from);
    await reply('✅ MCM started manually!');
  } catch (error) {
    await reply('❌ Error starting MCM.');
    console.error('MCM start error:', error);
  }
}

async function handleMCMEnd(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can end MCM.');
  
  if (!from.endsWith('@g.us')) return reply('❌ MCM in groups only.');
  
  try {
    const success = await endMCMSession(sock, from);
    if (success) return reply('✅ MCM ended and results declared!');
    return reply('❌ No active MCM session.');
  } catch (error) {
    await reply('❌ Error ending MCM.');
    console.error('MCM end error:', error);
  }
}

async function handleMCMCancel(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can cancel MCM.');
  
  if (!from.endsWith('@g.us')) return reply('❌ MCM in groups only.');
  
  try {
    const success = await cancelMCMSession(from);
    if (success) {
      await sock.sendMessage(from, { text: '❌ MCM session cancelled!' });
      return reply('✅ MCM cancelled.');
    }
    return reply('❌ No active MCM session.');
  } catch (error) {
    await reply('❌ Error cancelling MCM.');
    console.error('MCM cancel error:', error);
  }
}

async function handleMCMCurrent(context) {
  const { reply, from } = context;
  
  if (!from.endsWith('@g.us')) return reply('❌ MCM status in groups only.');
  
  try {
    const session = await getCurrentSession(from);
    
    if (!session) {
      const nextMCM = isMonday() 
        ? `Today at ${mcmSettings.startTime}`
        : moment().startOf('week').add(1, 'week').add(1, 'days').format('dddd, MMMM DD') + ` at ${mcmSettings.startTime}`;
      return reply(`📅 *No active MCM*\n\n🕺 *Next:* ${nextMCM}\n💰 *Winner:* ₦${mcmSettings.winnerReward.toLocaleString()}`);
    }
    
    const participants = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_PARTICIPANTS).find({ sessionId: session.sessionId })
        .sort({ totalRating: -1, ratingCount: -1 }).toArray()
    );
    
    const totalRatings = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_RATINGS).countDocuments({ sessionId: session.sessionId })
    );
    
    let statusMessage = `🕺 *MCM LIVE STATUS* 🕺\n\n`;
    statusMessage += `📅 Date: ${session.date}\n`;
    statusMessage += `🕐 Started: ${moment(session.startedAt).format('HH:mm')}\n`;
    statusMessage += `⏰ Ends: ${mcmSettings.endTime}\n\n`;
    statusMessage += `👥 Participants: ${participants.length}\n`;
    statusMessage += `⭐ Total Ratings: ${totalRatings}\n\n`;
    
    if (participants.length > 0) {
      statusMessage += `📊 *Current Standings (Total Points):*\n`;
      participants.slice(0, 5).forEach((p, i) => {
        const pos = i + 1;
        const emoji = pos === 1 ? '👑' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏅';
        const avg = p.averageRating > 0 ? p.averageRating.toFixed(1) : '0.0';
        
        statusMessage += `${emoji} ${pos}. +${p.userPhone} - ${p.totalRating} pts (${p.ratingCount} ratings, avg ${avg})\n`;
      });
      if (participants.length > 5) statusMessage += `... and ${participants.length - 5} more\n`;
    } else {
      statusMessage += `❌ *No participants yet!*\n`;
    }
    
    statusMessage += `\n💰 *Winner gets ₦${mcmSettings.winnerReward.toLocaleString()}!*`;
    
    await reply(statusMessage);
    
  } catch (error) {
    await reply('❌ Error loading status.');
    console.error('MCM current error:', error);
  }
}

async function handleMCMStats(context) {
  const { reply, senderId } = context;
  
  try {
    const stats = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_RECORDS).aggregate([
        { $unwind: '$participants' },
        { $match: { 'participants.userId': senderId } },
        { $group: {
            _id: null,
            participationCount: { $sum: 1 },
            totalRatingsReceived: { $sum: '$participants.ratingCount' },
            totalPoints: { $sum: '$participants.totalRating' },
            bestRating: { $max: '$participants.averageRating' }
          } }
      ]).toArray()
    );
    
    const winStats = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_RECORDS).aggregate([
        { $unwind: '$winners' },
        { $match: { 'winners.userId': senderId } },
        { $group: { _id: null, winsCount: { $sum: 1 } } }
      ]).toArray()
    );
    
    const { participationCount = 0, totalRatingsReceived = 0, totalPoints = 0, bestRating = 0 } = stats[0] || {};
    const { winsCount = 0 } = winStats[0] || {};
    const averageRating = totalRatingsReceived > 0 ? (totalPoints / totalRatingsReceived).toFixed(1) : '0.0';
    const winRate = participationCount > 0 ? ((winsCount / participationCount) * 100).toFixed(1) : '0.0';
    
    const userData = await getUserData(senderId);
    
    let statsMessage = `📊 *YOUR MCM STATISTICS* 📊\n\n`;
    statsMessage += `🕺 *Participation:*\n`;
    statsMessage += `• Total: ${participationCount}\n`;
    statsMessage += `• Wins: ${winsCount} 👑\n`;
    statsMessage += `• Win rate: ${winRate}%\n\n`;
    statsMessage += `⭐ *Ratings:*\n`;
    statsMessage += `• Total received: ${totalRatingsReceived}\n`;
    statsMessage += `• Average: ${averageRating}/10\n`;
    statsMessage += `• Best: ${bestRating.toFixed(1)}/10\n\n`;
    statsMessage += `💰 *Financial:*\n`;
    statsMessage += `• Balance: ₦${(userData.balance || 0).toLocaleString()}\n`;
    statsMessage += `• MCM winnings: ₦${(winsCount * mcmSettings.winnerReward).toLocaleString()}`;
    
    await reply(statsMessage);
    
  } catch (error) {
    await reply('❌ Error loading stats.');
    console.error('MCM stats error:', error);
  }
}

async function handleMCMHistory(context, args) {
  const { reply } = context;
  
  try {
    const limit = args[0] ? Math.min(parseInt(args[0]), 10) : 5;
    
    const records = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_RECORDS).find({})
        .sort({ date: -1 })
        .limit(limit)
        .toArray()
    );
    
    if (records.length === 0) return reply('📅 *No MCM history.*');
    
    let historyMessage = `📚 *MCM HISTORY (Last ${records.length})* 📚\n\n`;
    
    records.forEach((record, i) => {
      historyMessage += `${i + 1}. 📅 ${record.date}\n`;
      if (record.winners && record.winners.length > 0) {
        historyMessage += `   👑 Winners:\n`;
        record.winners.forEach(w => {
          historyMessage += `     • +${w.userPhone} (${w.totalRating} pts)\n`;
        });
        historyMessage += `   💰 Prize each: ₦${record.winners[0].prizeAwarded.toLocaleString()}\n`;
      } else {
        historyMessage += `   🤷‍♂️ No winner\n`;
      }
      historyMessage += `   👥 Participants: ${record.totalParticipants}\n\n`;
    });
    
    historyMessage += `💡 Use *mcm history [number]* for more`;
    
    await reply(historyMessage);
    
  } catch (error) {
    await reply('❌ Error loading history.');
    console.error('MCM history error:', error);
  }
}

async function handleMCMLeaderboard(context) {
  const { reply } = context;
  
  try {
    const leaders = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.MCM_RECORDS).aggregate([
        { $unwind: '$winners' },
        { $group: {
            _id: '$winners.userId',
            userPhone: { $first: '$winners.userPhone' },
            wins: { $sum: 1 },
            totalEarnings: { $sum: '$winners.prizeAwarded' },
            bestRating: { $max: '$winners.averageRating' },
            totalRatings: { $sum: '$winners.ratingCount' }
          } },
        { $sort: { wins: -1, bestRating: -1 } },
        { $limit: 10 }
      ]).toArray()
    );
    
    if (leaders.length === 0) return reply('🏆 *No MCM winners yet!*\n\nBe the first! 💪');
    
    let leaderboardMessage = `🏆 *MCM HALL OF FAME* 🏆\n\n`;
    leaderboardMessage += `👑 *ALL-TIME LEADERBOARD:*\n\n`;
    
    leaders.forEach((leader, i) => {
      const pos = i + 1;
      const emoji = pos === 1 ? '👑' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏅';
      
      leaderboardMessage += `${emoji} ${pos}. +${leader.userPhone}\n`;
      leaderboardMessage += `   🏆 Wins: ${leader.wins}\n`;
      leaderboardMessage += `   ⭐ Best: ${leader.bestRating.toFixed(1)}/10\n`;
      leaderboardMessage += `   💰 Earned: ₦${leader.totalEarnings.toLocaleString()}\n\n`;
    });
    
    leaderboardMessage += `🕺 *Can you top the leaderboard?*\n`;
    leaderboardMessage += `Next MCM: Every Monday 8:00 PM!`;
    
    await reply(leaderboardMessage);
    
  } catch (error) {
    await reply('❌ Error loading leaderboard.');
    console.error('MCM leaderboard error:', error);
  }
}

async function handleMCMSettings(context, args) {
  const { reply, senderId, sock, from, config } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can access settings.');
  
  try {
    if (args.length === 0) {
      let settingsMessage = `⚙️ *MCM SETTINGS* ⚙️\n\n`;
      settingsMessage += `🕐 *Schedule:*\n`;
      settingsMessage += `• Start: ${mcmSettings.startTime}\n`;
      settingsMessage += `• End: ${mcmSettings.endTime}\n`;
      settingsMessage += `• Auto-start: ${mcmSettings.autoStartEnabled ? '✅' : '❌'}\n`;
      settingsMessage += `• Reminders: ${mcmSettings.reminderTimes.join(', ')}\n\n`;
      settingsMessage += `💰 *Rewards:*\n`;
      settingsMessage += `• Winner: ₦${mcmSettings.winnerReward.toLocaleString()}\n`;
      settingsMessage += `• Participation: ₦${mcmSettings.participationReward.toLocaleString()}\n`;
      settingsMessage += `• Participation: ${mcmSettings.enableParticipationReward ? '✅' : '❌'}\n\n`;
      settingsMessage += `🔧 *Other:*\n`;
      settingsMessage += `• Self-rating: ${mcmSettings.allowSelfRating ? '✅' : '❌'}\n`;
      settingsMessage += `• Tag all: ${mcmSettings.tagAllMembers ? '✅' : '❌'}\n\n`;
      settingsMessage += `🔧 *Commands:*\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings prize 15000\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings participation 1500\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings starttime 20:30\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings endtime 22:30\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings autostart on/off\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings parreward on/off\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings selfrating on/off\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings tagall on/off\`\n`;
      
      await reply(settingsMessage);
      return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args[1]?.toLowerCase();
    let responseText = "";
    let needsReschedule = false;
    
    switch (setting) {
      case 'prize':
      case 'winner':
        const prizeAmount = parseInt(args[1]);
        if (isNaN(prizeAmount)) return reply(`⚠️ Invalid. Use: ${config.PREFIX}mcm settings prize 15000`);
        mcmSettings.winnerReward = prizeAmount;
        responseText = `✅ Winner prize: ₦${prizeAmount.toLocaleString()}`;
        break;
        
      case 'participation':
        const partAmount = parseInt(args[1]);
        if (isNaN(partAmount)) return reply(`⚠️ Invalid. Use: ${config.PREFIX}mcm settings participation 1500`);
        mcmSettings.participationReward = partAmount;
        responseText = `✅ Participation: ₦${partAmount.toLocaleString()}`;
        break;
        
      case 'starttime':
        if (!/^\d{2}:\d{2}$/.test(args[1])) return reply(`⚠️ Invalid. Use: ${config.PREFIX}mcm settings starttime 20:30`);
        mcmSettings.startTime = args[1];
        needsReschedule = true;
        responseText = `✅ Start time: ${args[1]}. Rescheduling cron.`;
        break;
        
      case 'endtime':
        if (!/^\d{2}:\d{2}$/.test(args[1])) return reply(`⚠️ Invalid. Use: ${config.PREFIX}mcm settings endtime 22:30`);
        mcmSettings.endTime = args[1];
        needsReschedule = true;
        responseText = `✅ End time: ${args[1]}. Rescheduling cron.`;
        break;
        
      case 'autostart':
        if (['on', 'true', 'enable'].includes(value)) {
          mcmSettings.autoStartEnabled = true;
          responseText = "✅ Auto-start enabled.";
          needsReschedule = true;
        } else if (['off', 'false', 'disable'].includes(value)) {
          mcmSettings.autoStartEnabled = false;
          responseText = "✅ Auto-start disabled.";
          needsReschedule = true;
        } else {
          responseText = `⚠️ Use: on/off`;
        }
        break;
        
      case 'parreward':
        if (['on', 'true', 'enable'].includes(value)) {
          mcmSettings.enableParticipationReward = true;
          responseText = "✅ Participation rewards enabled.";
        } else if (['off', 'false', 'disable'].includes(value)) {
          mcmSettings.enableParticipationReward = false;
          responseText = "✅ Participation rewards disabled.";
        } else {
          responseText = `⚠️ Use: on/off`;
        }
        break;
        
      case 'selfrating':
        if (['on', 'true', 'enable'].includes(value)) {
          mcmSettings.allowSelfRating = true;
          responseText = "✅ Self-rating enabled.";
        } else if (['off', 'false', 'disable'].includes(value)) {
          mcmSettings.allowSelfRating = false;
          responseText = "✅ Self-rating disabled.";
        } else {
          responseText = `⚠️ Use: on/off`;
        }
        break;
        
      case 'tagall':
        if (['on', 'true', 'enable'].includes(value)) {
          mcmSettings.tagAllMembers = true;
          responseText = "✅ Tag all members enabled.";
        } else if (['off', 'false', 'disable'].includes(value)) {
          mcmSettings.tagAllMembers = false;
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
      setupMCMCronJobs(context.sock);
    }
    
  } catch (error) {
    await reply('❌ Error updating settings.');
    console.error('MCM settings error:', error);
  }
}

async function handleMCMReschedule(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can reschedule.');
  
  try {
    await setupMCMCronJobs(sock);
    await reply('✅ Cron jobs rescheduled!');
  } catch (error) {
    await reply('❌ Error rescheduling.');
    console.error('MCM reschedule error:', error);
  }
}

async function handleMCMAddGroup(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can add groups.');
  
  if (!from.endsWith('@g.us')) return reply('❌ Use in group.');
  
  if (mcmSettings.groupJids.includes(from)) return reply('✅ Group already added.');
  
  mcmSettings.groupJids.push(from);
  await saveSettings();
  await reply('✅ Group added to MCM!');
}

async function handleMCMRemoveGroup(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can remove groups.');
  
  if (!from.endsWith('@g.us')) return reply('❌ Use in group.');
  
  const index = mcmSettings.groupJids.indexOf(from);
  if (index === -1) return reply('❌ Group not in MCM.');
  
  mcmSettings.groupJids.splice(index, 1);
  await saveSettings();
  await reply('✅ Group removed from MCM.');
}

async function handleMCMAddAdmin(context, args) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can add admins.');
  
  const number = args[0]?.replace(/\D/g, '');
  if (!number) return reply('⚠️ Use: addadmin <number>');
  
  if (mcmSettings.adminNumbers.includes(number)) return reply('✅ Already admin.');
  
  mcmSettings.adminNumbers.push(number);
  await saveSettings();
  await reply(`✅ Admin added: ${number}`);
}

async function handleMCMRemoveAdmin(context, args) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can remove admins.');
  
  const number = args[0]?.replace(/\D/g, '');
  if (!number) return reply('⚠️ Use: removeadmin <number>');
  
  const index = mcmSettings.adminNumbers.indexOf(number);
  if (index === -1) return reply('❌ Not an admin.');
  
  mcmSettings.adminNumbers.splice(index, 1);
  await saveSettings();
  await reply(`✅ Admin removed: ${number}`);
}

async function handleMCMTest(context, args) {
  const { reply, config } = context;
  
  const testText = args.join(' ');
  if (!testText) return reply(`🔍 *MCM RATING VALIDATOR* 🔍\n\n*Usage:* ${config.PREFIX}mcmtest [message]\n\n*Examples:*\n• ${config.PREFIX}mcmtest "He looks amazing! 9"\n• ${config.PREFIX}mcmtest "8️⃣ handsome"\n• ${config.PREFIX}mcmtest "🔟 stunning king!"`);
  
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
      result += `• Numbers: "9", "10", "He's a perfect 8"\n`;
      result += `• Emojis: "9️⃣", "🔟", "Handsome 1️⃣0️⃣"\n`;
      result += `• Range: 1-10`;
    }
    
    await reply(result);
    
  } catch (error) {
    await reply('❌ Error testing.');
    console.error('MCM test error:', error);
  }
}

// MAIN PLUGIN HANDLER AND INIT
export async function init(sock) {
  await initDatabase();
  await loadSettings();
  await setupMCMCronJobs(sock);
  console.log('✅ MCM plugin initialized');
}

export default async function mcmHandler(m, sock, config) {
  try {
    if (!db) await initDatabase();
    
    if (m.body && !m.body.startsWith(config.PREFIX)) {
      if (await handlePhotoSubmission(m, sock)) return;
      if (await handleRatingSubmission(m, sock)) return;
    }
    
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args.shift().toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const reply = async (text) => sock.sendMessage(from, { text }, { quoted: m });
    
    if (['mcm', 'mancrush'].includes(command)) {
      if (args.length === 0) return await showMCMMenu(reply, config.PREFIX);
      await handleMCMSubCommand(args[0], args.slice(1), { m, sock, config, senderId, from, reply });
    } else if (['mcmstats', 'mcmhistory'].includes(command)) {
      await handleMCMStats({ senderId, reply });
    } else if (['mcmtest', 'testmcm'].includes(command)) {
      await handleMCMTest({ reply, config }, args);
    }
    
  } catch (error) {
    console.error('❌ MCM plugin error:', error);
  }
}

async function handleMCMSubCommand(subCommand, args, context) {
  switch (subCommand.toLowerCase()) {
    case 'start':
      await handleMCMStart(context);
      break;
    case 'end':
      await handleMCMEnd(context);
      break;
    case 'cancel':
      await handleMCMCancel(context);
      break;
    case 'current':
    case 'status':
      await handleMCMCurrent(context);
      break;
    case 'stats':
      await handleMCMStats(context);
      break;
    case 'history':
      await handleMCMHistory(context, args);
      break;
    case 'leaderboard':
    case 'leaders':
      await handleMCMLeaderboard(context);
      break;
    case 'settings':
      await handleMCMSettings(context, args);
      break;
    case 'reschedule':
      await handleMCMReschedule(context);
      break;
    case 'addgroup':
      await handleMCMAddGroup(context);
      break;
    case 'removegroup':
      await handleMCMRemoveGroup(context);
      break;
    case 'addadmin':
      await handleMCMAddAdmin(context, args);
      break;
    case 'removeadmin':
      await handleMCMRemoveAdmin(context, args);
      break;
    case 'test':
      await handleMCMTest(context, args);
      break;
    case 'help':
      await showMCMMenu(context.reply, context.config.PREFIX);
      break;
    default:
      await context.reply(`❓ Unknown: *${subCommand}*\n\nUse *${context.config.PREFIX}mcm help*`);
  }
}

export { 
  setupMCMCronJobs,
  stopAllCronJobs,
  mcmSettings
};