// plugins/wcw.js - Woman Crush Wednesday Plugin (Unified Database)
import { getDatabase, safeOperation, unifiedUserManager } from '../lib/pluginIntegration.js';
import moment from 'moment-timezone';
import cron from 'node-cron';

// Plugin information export
export const info = {
  name: 'Woman Crush Wednesday (WCW)',
  version: '1.3.0', // Version updated for unified DB
  author: 'Alex Macksyn',
  description: 'Weekly Woman Crush Wednesday contest where ladies post pictures and guys rate them from 1-10. Now with unified database and economy.',
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
  WCW_RATINGS: 'wcw_ratings'
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
  tagAllMembers: false, // Changed to false to avoid spam
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

// Initialize settings
async function loadSettings() {
  try {
    const settings = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_SETTINGS).findOne({ type: 'wcw_config' })
    );
    if (settings) {
      wcwSettings = { ...defaultSettings, ...settings.data };
    }
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

function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('YYYY-MM-DD'); // Fixed to ISO format
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

// =======================================================================
// WCW SESSION MANAGEMENT
// =======================================================================

async function createWCWSession(groupJid) {
  try {
    const today = getCurrentDate();
    const sessionId = `wcw_${today}_${groupJid}`;
    
    const existingSession = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_SESSIONS).findOne({ date: today, groupJid })
    );
    
    if (existingSession) {
      console.log(`WCW session already exists for ${today}`);
      return existingSession;
    }
    
    const sessionData = {
      sessionId,
      date: today,
      groupJid,
      status: 'active', // active, ended, cancelled
      startedAt: new Date(),
      endedAt: null,
      participants: [],
      totalRatings: 0,
      winnerDeclared: false,
      createdAt: new Date()
    };
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_SESSIONS).insertOne(sessionData)
    );
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
    return await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_SESSIONS).findOne({ date: today, groupJid, status: 'active' })
    );
  } catch (error) {
    console.error('Error getting current session:', error);
    return null;
  }
}

async function cancelWCWSession(groupJid) {
  try {
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_SESSIONS).updateOne(
        { sessionId: session.sessionId },
        { $set: { status: 'cancelled', endedAt: new Date() } }
      )
    );
    return true;
  } catch (error) {
    console.error('Error cancelling WCW session:', error);
    return false;
  }
}

// =======================================================================
// WCW ANNOUNCEMENTS AND REMINDERS
// =======================================================================

function formatReminderMessage(timeUntil) {
  const messages = [
    `🔥 *WCW COUNTDOWN IS ON!* 🔥\n\nLadies and gentlemen, welcome to the ultimate glamour showdown! 💃✨\n\nIn just ${timeUntil}, the spotlight turns on for WOMAN CRUSH WEDNESDAY!\n\n👑 *Ladies:* Prepare to dazzle with your fierce photos – the guys are waiting to crown the queen!\n👀 *Guys:* Get your ratings ready – 1 to 10, make it count!\n\n💥 Epic prizes: Winner grabs ₦${wcwSettings.winnerReward.toLocaleString()} + bragging rights!\n🎉 Participation vibe: ₦${wcwSettings.participationReward.toLocaleString()} just for joining the fun!\n\nTune in at 8:00 PM sharp – this is YOUR stage! 📺\n#WCWSpotlight #GlamourNight #RateTheQueens`,

    `🎤 *WCW IS STARTING SOON!* 🎤\n\nThe clock is ticking... ${timeUntil} until the red carpet rolls out for WOMAN CRUSH WEDNESDAY! 🌟\n\n💄 *Ladies, it's showtime:* Strike a pose, upload your slay-worthy pic, and let the ratings pour in!\n🕺 *Gentlemen, you're the judges:* From 1-10, vote for the ultimate crush!\n\n🏆 Grand prize alert: ₦${wcwSettings.winnerReward.toLocaleString()} for the top diva!\n🎁 Everyone wins: ₦${wcwSettings.participationReward.toLocaleString()} for stepping into the arena!\n\nDon't miss the drama, the dazzle, and the declarations at 8:00 PM! 📣\n#WCWLiveEvent #BeautyBattle #TuneInNow`
  ];
  
  return messages[Math.floor(Math.random() * messages.length)];
}

function formatWCWStartMessage() {
  return `🚨 *BREAKING: WCW IS LIVE ON AIR!* 🚨\n\nWelcome to the most electrifying night of the week – WOMAN CRUSH WEDNESDAY! 📺💥\n\n👩‍🎤 *Ladies, take center stage:* Drop your jaw-dropping photo NOW and steal the show!\n👨‍⚖️ *Gentlemen, the power is yours:* Rate from 1-10 – who will you crown?\n\n⏳ The clock is ticking until 10:00 PM – make every second count!\n💰 Jackpot: Winner scores ₦${wcwSettings.winnerReward.toLocaleString()}!\n🎉 Bonus: ₦${wcwSettings.participationReward.toLocaleString()} for all stars who shine!\n\n📜 *Rules of the Game:*\n• One photo per diva (duplicates? No spotlight!)\n• Ratings 1-10 only – keep it real!\n• Self-rating: ${wcwSettings.allowSelfRating ? 'Go for it!' : 'Hands off your own!'}\n\n💡 *Pro Tip:* Use "8", "She's a 10", or emojis like 🔟 for ratings!\n\nLet the glamour, drama, and votes explode! 🌟\n#WCWLive #GistHQShowdown #CrushHour`;
}

// =======================================================================
// ENHANCED RATING SYSTEM WITH EMOJI SUPPORT
// =======================================================================

function extractRating(text) {
  if (text.includes('1️⃣0️⃣')) return 10;
  
  const emojiToNumber = { '🔟': 10, '9️⃣': 9, '8️⃣': 8, '7️⃣': 7, '6️⃣': 6, '5️⃣': 5, '4️⃣': 4, '3️⃣': 3, '2️⃣': 2, '1️⃣': 1 };
  
  for (const [emoji, number] of Object.entries(emojiToNumber).reverse()) {
    if (text.includes(emoji)) return number;
  }
  
  const numbers = text.match(/\b([1-9]|10)\b/g);
  if (!numbers) return null;
  
  const rating = parseInt(numbers[numbers.length - 1]);
  if (rating >= wcwSettings.validRatingRange.min && rating <= wcwSettings.validRatingRange.max) return rating;
  
  return null;
}

// =======================================================================
// NODE-CRON SCHEDULING SYSTEM
// =======================================================================

async function setupWCWCronJobs(sock) {
  try {
    stopAllCronJobs();
    
    wcwSettings.reminderTimes.forEach((reminderTime, index) => {
      const [hours, minutes] = reminderTime.split(':');
      const cronPattern = `${minutes} ${hours} * * 3`; // Wednesday
      
      const cronJob = cron.schedule(cronPattern, async () => {
        console.log(`⏰ WCW Reminder ${index + 1} triggered at ${reminderTime}`);
        await sendWCWReminders(sock);
      }, { scheduled: false, timezone: 'Africa/Lagos' });
      
      cronJobs.reminders.push(cronJob);
      cronJob.start();
      console.log(`✅ WCW Reminder ${index + 1} scheduled`);
    });
    
    if (wcwSettings.autoStartEnabled) {
      const [startHours, startMinutes] = wcwSettings.startTime.split(':');
      const startCronPattern = `${startMinutes} ${startHours} * * 3`;
      
      cronJobs.startSession = cron.schedule(startCronPattern, async () => {
        console.log(`🎬 WCW Auto-start at ${wcwSettings.startTime}`);
        for (const groupJid of wcwSettings.groupJids) {
          try {
            if (!await getCurrentSession(groupJid)) {
              await startWCWSession(sock, groupJid);
            }
          } catch (error) {
            console.error(`Error auto-starting for ${groupJid}:`, error);
          }
        }
      }, { scheduled: false, timezone: 'Africa/Lagos' });
      
      cronJobs.startSession.start();
      console.log(`✅ WCW Auto-start scheduled`);
    }
    
    const [endHours, endMinutes] = wcwSettings.endTime.split(':');
    const endCronPattern = `${endMinutes} ${endHours} * * 3`;
    
    cronJobs.endSession = cron.schedule(endCronPattern, async () => {
      console.log(`🏁 WCW Auto-end at ${wcwSettings.endTime}`);
      for (const groupJid of wcwSettings.groupJids) {
        try {
          await endWCWSession(sock, groupJid);
        } catch (error) {
          console.error(`Error auto-ending for ${groupJid}:`, error);
        }
      }
    }, { scheduled: false, timezone: 'Africa/Lagos' });
    
    cronJobs.endSession.start();
    console.log(`✅ WCW Auto-end scheduled`);
    console.log('🎯 All WCW cron jobs setup');
    
  } catch (error) {
    console.error('Error setting up WCW cron jobs:', error);
  }
}

function stopAllCronJobs() {
  cronJobs.reminders.forEach(job => job && job.stop());
  cronJobs.reminders = [];
  if (cronJobs.startSession) { cronJobs.startSession.stop(); cronJobs.startSession = null; }
  if (cronJobs.endSession) { cronJobs.endSession.stop(); cronJobs.endSession = null; }
  console.log('🔄 All WCW cron jobs stopped');
}

async function sendWCWReminders(sock) {
  try {
    if (!isWednesday()) return;
    
    const startMoment = moment(`${getCurrentDate()} ${wcwSettings.startTime}`, 'YYYY-MM-DD HH:mm');
    const now = getNigeriaTime();
    
    if (now.isSameOrAfter(startMoment)) return;
    
    const timeUntil = moment.duration(startMoment.diff(now)).humanize();
    const reminderMessage = formatReminderMessage(timeUntil);
    
    for (const groupJid of wcwSettings.groupJids) {
      try {
        const members = await getGroupMembers(sock, groupJid);
        const mentions = wcwSettings.tagAllMembers ? members.map(m => m.id) : [];
        
        await sock.sendMessage(groupJid, { text: reminderMessage, mentions });
        console.log(`✅ WCW reminder sent to ${groupJid}`);
      } catch (error) {
        console.error(`Error sending reminder to ${groupJid}:`, error);
      }
    }
  } catch (error) {
    console.error('Error sending reminders:', error);
  }
}

async function startWCWSession(sock, groupJid) {
  try {
    const session = await createWCWSession(groupJid);
    const startMessage = formatWCWStartMessage();
    
    const members = await getGroupMembers(sock, groupJid);
    const mentions = wcwSettings.tagAllMembers ? members.map(m => m.id) : [];
    
    const sentMessage = await sock.sendMessage(groupJid, { text: startMessage, mentions });
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_SESSIONS).updateOne(
        { sessionId: session.sessionId },
        { $set: { startMessageKey: sentMessage.key } }
      )
    );
    
    console.log(`✅ WCW session started for ${groupJid}`);
    return session;
  } catch (error) {
    console.error('Error starting WCW session:', error);
    throw error;
  }
}

// =======================================================================
// PHOTO SUBMISSION HANDLING
// =======================================================================

async function handlePhotoSubmission(m, sock) {
  try {
    if (!isWednesday()) return false;
    
    const now = getNigeriaTime();
    const startMoment = moment(`${getCurrentDate()} ${wcwSettings.startTime}`, 'YYYY-MM-DD HH:mm');
    const endMoment = moment(`${getCurrentDate()} ${wcwSettings.endTime}`, 'YYYY-MM-DD HH:mm');
    
    if (now.isBefore(startMoment) || now.isSameOrAfter(endMoment)) return false;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const groupJid = m.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us') || !m.message.imageMessage) return false;
    
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    const existingParticipant = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_PARTICIPANTS).findOne({ sessionId: session.sessionId, userId: senderId })
    );
    
    if (existingParticipant) {
      await sock.sendMessage(groupJid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(groupJid, {
        text: `🚫 @${senderId.split('@')[0]} - You already submitted your photo! Only your first photo counts for WCW.`,
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
      await db.collection(COLLECTIONS.WCW_PARTICIPANTS).insertOne(participantData)
    );
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_SESSIONS).updateOne(
        { sessionId: session.sessionId },
        { $push: { participants: senderId } }
      )
    );
    
    await sock.sendMessage(groupJid, { react: { text: '✅', key: m.key } });
    await unifiedUserManager.initUser(senderId); // Use unified user manager
    
    console.log(`📸 WCW photo submitted by ${senderId.split('@')[0]}`);
    return true;
    
  } catch (error) {
    console.error('Error handling photo submission:', error);
    return false;
  }
}

// =======================================================================
// RATING SUBMISSION HANDLING
// =======================================================================

async function handleRatingSubmission(m, sock) {
  try {
    if (!isWednesday()) return false;
    
    const now = getNigeriaTime();
    const startMoment = moment(`${getCurrentDate()} ${wcwSettings.startTime}`, 'YYYY-MM-DD HH:mm');
    const endMoment = moment(`${getCurrentDate()} ${wcwSettings.endTime}`, 'YYYY-MM-DD HH:mm');
    
    if (now.isBefore(startMoment) || now.isSameOrAfter(endMoment)) return false;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const groupJid = m.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us') || !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) return false;
    
    const participantId = m.message.extendedTextMessage.contextInfo.participant;
    if (!participantId) return false;
    
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    const participant = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_PARTICIPANTS).findOne({ sessionId: session.sessionId, userId: participantId })
    );
    
    if (!participant) return false;
    
    if (!wcwSettings.allowSelfRating && senderId === participantId) {
      await sock.sendMessage(groupJid, { react: { text: '🚫', key: m.key } });
      await sock.sendMessage(groupJid, {
        text: `🚫 @${senderId.split('@')[0]} - Self-rating is not allowed!`,
        mentions: [senderId]
      }, { quoted: m });
      return true;
    }
    
    const ratingText = m.body || '';
    const emojiToNumber = { '🔟': 10, '9️⃣': 9, '8️⃣': 8, '7️⃣': 7, '6️⃣': 6, '5️⃣': 5, '4️⃣': 4, '3️⃣': 3, '2️⃣': 2, '1️⃣': 1 };
    const hasRatingAttempt = ratingText.match(/\b([1-9]|10)\b/) || Object.keys(emojiToNumber).some(emoji => ratingText.includes(emoji)) || ratingText.includes('1️⃣0️⃣');
    
    if (!hasRatingAttempt) return false;
    
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
      await db.collection(COLLECTIONS.WCW_RATINGS).findOne({ sessionId: session.sessionId, raterId: senderId, participantId: participantId })
    );
    
    if (existingRating) {
      await safeOperation(async (db) => 
        await db.collection(COLLECTIONS.WCW_RATINGS).updateOne({ _id: existingRating._id }, { $set: { rating, updatedAt: new Date() } })
      );
    } else {
      const ratingData = { sessionId: session.sessionId, raterId: senderId, raterPhone: senderId.split('@')[0], participantId: participantId, participantPhone: participantId.split('@')[0], rating, createdAt: new Date() };
      await safeOperation(async (db) => await db.collection(COLLECTIONS.WCW_RATINGS).insertOne(ratingData));
    }
    
    await updateParticipantRatings(session.sessionId, participantId);
    await sock.sendMessage(groupJid, { react: { text: '✅', key: m.key } });
    
    console.log(`⭐ WCW rating ${rating} by ${senderId.split('@')[0]} to ${participantId.split('@')[0]}`);
    return true;
    
  } catch (error) {
    console.error('Error handling rating:', error);
    return false;
  }
}

async function updateParticipantRatings(sessionId, participantId) {
  try {
    const ratings = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_RATINGS).find({ sessionId, participantId }).toArray()
    );
    
    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    const ratingCount = ratings.length;
    const averageRating = ratingCount > 0 ? (totalRating / ratingCount) : 0;
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_PARTICIPANTS).updateOne(
        { sessionId, userId: participantId },
        { $set: { totalRating, averageRating: Math.round(averageRating * 100) / 100, ratingCount, updatedAt: new Date() } }
      )
    );
  } catch (error) {
    console.error('Error updating ratings:', error);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =======================================================================
// END WCW SESSION AND DECLARE WINNER
// =======================================================================

async function endWCWSession(sock, groupJid) {
  try {
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    const participants = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.WCW_PARTICIPANTS).find({ sessionId: session.sessionId })
        .sort({ totalRating: -1, ratingCount: -1 }).toArray()
    );
    
    if (participants.length === 0) {
      await sock.sendMessage(groupJid, { text: `💃 *WCW SESSION ENDED* 💃\n\n❌ No participants today!\n\nBetter luck next Wednesday! 💪` });
      await safeOperation(async (db) => 
        await db.collection(COLLECTIONS.WCW_SESSIONS).updateOne({ sessionId: session.sessionId }, { $set: { status: 'ended', endedAt: new Date(), winnerDeclared: true } })
      );
      return true;
    }
    
    if (wcwSettings.enableParticipationReward) {
      for (const participant of participants) {
        await unifiedUserManager.addMoney(participant.userId, wcwSettings.participationReward, 'WCW participation');
      }
    }
    
    const maxTotal = participants[0].totalRating;
    const winners = participants.filter(p => p.totalRating === maxTotal);
    const hasValidRatings = winners.length > 0 && winners[0].ratingCount > 0;
    
    const members = await getGroupMembers(sock, groupJid);
    const mentions = wcwSettings.tagAllMembers ? members.map(m => m.id) : [];
    const participantMentions = participants.map(p => p.userId);
    
    await sock.sendMessage(groupJid, {
      text: `🎬 *AND THAT'S A WRAP ON TONIGHT'S WCW!* 🎬\n\nLadies and gentlemen, what a thrilling episode! The votes are in, the drama has peaked... now sit back, grab some popcorn 🍿, as our judges tally the ratings in the control room!\n\nStay tuned – results dropping in just a moment! 📊🔥\n#WCWFinale #GistHQAfterShow`,
      mentions
    });
    
    await delay(60000);
    
    let resultsMessage = `📣 *OFFICIAL WCW SCOREBOARD – ${getCurrentDate()}* 📣\n\nFrom the Gist HQ studios, here are the final tallies for tonight's glamour extravaganza! 🌟\n\n📊 *COMPLETE STANDINGS (Total Points):*\n\n`;
    participants.forEach((p, i) => {
      const pos = i + 1;
      const emoji = pos === 1 ? '👑' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏅';
      const avg = p.averageRating > 0 ? p.averageRating.toFixed(1) : '0.0';
      resultsMessage += `${emoji} #${pos} @${p.userPhone}\n   ⭐ Total Points: ${p.totalRating} (${p.ratingCount} votes, avg ${avg}/10)\n\n`;
    });
    await sock.sendMessage(groupJid, { text: resultsMessage, mentions: participantMentions });
    
    await delay(5000);
    
    if (hasValidRatings) {
      let winnerMessage = `🥁 *DRUMROLL PLEASE... THE MOMENT YOU'VE BEEN WAITING FOR!* 🥁\n\nFrom the edge-of-your-seat ratings, emerging victorious in tonight's WCW showdown...\n\n`;
      if (winners.length > 1) {
        winnerMessage += `🎉 *IT'S A TIE FOR THE CROWN!* 👑\n\nOur co-queens of the night:\n`;
        winners.forEach(w => { winnerMessage += `• @${w.userPhone} with an epic ${w.totalRating} points! 🌟\n`; });
        winnerMessage += `\nWhat a nail-biter! Congrats to our tied champions – you slayed the stage! 💃🔥\n\n`;
        await sock.sendMessage(groupJid, { text: winnerMessage, mentions: winners.map(w => w.userId) });
        for (const winner of winners) {
          await sock.sendMessage(groupJid, { text: `👏 Spotlight on our winner @${winner.userPhone}! Here's the photo that stole the show: 📸`, mentions: [winner.userId] }, { quoted: { key: winner.messageKey, message: { imageMessage: {} } } });
          await delay(2000);
        }
      } else {
        const winner = winners[0];
        winnerMessage += `👑 *THE UNDISPUTED WCW CHAMPION: @${winner.userPhone} with ${winner.totalRating} points!* 👑\n\nWhat a performance! You owned the night – congrats on your well-deserved victory! 🎊💥\n\n`;
        await sock.sendMessage(groupJid, { text: winnerMessage, mentions: [winner.userId] });
        await sock.sendMessage(groupJid, { text: `📸 Relive the winning glow! Here's @${winner.userPhone}'s stunning entry that captured hearts: ✨`, mentions: [winner.userId] }, { quoted: { key: winner.messageKey, message: { imageMessage: {} } } });
      }
      
      await delay(5000);
      
      const prizePerWinner = wcwSettings.winnerReward / winners.length;
      let rewardMessage = `💰 *PRIZE TIME FROM GIST HQ!* 💰\n\n`;
      if (winners.length > 1) {
        rewardMessage += `Our tied winners each take home ₦${prizePerWinner.toLocaleString()} – split the glory and the gold! 🏆\n\n`;
      } else {
        rewardMessage += `Our champion @${winners[0].userPhone} pockets ₦${wcwSettings.winnerReward.toLocaleString()} – treat yourself, queen! 👸\n\n`;
      }
      rewardMessage += `Plus, shoutout to all participants for the ₦${wcwSettings.participationReward.toLocaleString()} vibe check! 🎁\n\nWhat a payout!`;
      await sock.sendMessage(groupJid, { text: rewardMessage, mentions: winners.map(w => w.userId) });
    } else {
      await sock.sendMessage(groupJid, { text: `😔 *NO RATINGS TONIGHT – THE CROWN STAYS VACANT!* 😔\n\nWhat a twist! Better luck next time, stars. No winner declared, but thanks for the energy! 🌟` });
    }
    
    await delay(60000);
    
    await sock.sendMessage(groupJid, {
      text: `🙌 *THAT'S ALL FROM WCW TONIGHT!* 🙌\n\nFrom the Gist HQ team: A massive thank you to all our dazzling participants, sharp-eyed raters, and everyone who tuned in! You made this episode legendary! 🎉\n\nSame time next Wednesday at 8:00 PM – get ready for more glamour, more drama, more crushes! Until then, keep shining! ✨\n#WCWSignOff #SeeYouNextWeek #GistHQForever`,
      mentions
    });
    
    const recordData = {
      date: getCurrentDate(), groupJid, sessionId: session.sessionId, totalParticipants: participants.length,
      winners: hasValidRatings ? winners.map(w => ({ userId: w.userId, userPhone: w.userPhone, totalRating: w.totalRating, averageRating: w.averageRating, ratingCount: w.ratingCount, prizeAwarded: wcwSettings.winnerReward / winners.length })) : [],
      participants, createdAt: new Date()
    };
    
    await safeOperation(async (db) => await db.collection(COLLECTIONS.WCW_RECORDS).insertOne(recordData));
    await safeOperation(async (db) => await db.collection(COLLECTIONS.WCW_SESSIONS).updateOne({ sessionId: session.sessionId }, { $set: { status: 'ended', endedAt: new Date(), winnerDeclared: true } }));
    
    console.log(`✅ WCW session ended for ${groupJid}`);
    return true;
    
  } catch (error) {
    console.error('Error ending WCW session:', error);
    return false;
  }
}

// =======================================================================
// COMMAND HANDLERS
// =======================================================================

async function showWCWMenu(reply, prefix) {
  const nextWCW = moment().day(3).isBefore(moment()) ? moment().day(3).add(1, 'week').format('dddd, MMMM DD, YYYY') : moment().day(3).format('dddd, MMMM DD, YYYY');
  
  const menuText = `💃 *WOMAN CRUSH WEDNESDAY (WCW)* 💃\n\n` +
                  `📊 *User Commands:*\n` +
                  `• *current* - View current WCW status\n` +
                  `• *stats* - View your WCW statistics\n` +
                  `• *history* - View WCW history\n` +
                  `• *leaderboard* - View all-time winners\n\n` +
                  `👑 *Admin Commands:*\n` +
                  `• *start* - Start WCW manually\n` +
                  `• *end* - End current WCW\n` +
                  `• *cancel* - Cancel current WCW\n` +
                  `• *addgroup* - Add current group to WCW\n` +
                  `• *removegroup* - Remove current group\n` +
                  `• *addadmin <number>* - Add admin\n` +
                  `• *removeadmin <number>* - Remove admin\n` +
                  `• *settings* - System settings\n` +
                  `• *reschedule* - Update cron schedules\n\n` +
                  `⏰ *Schedule (Node-Cron):*\n` +
                  `• Every Wednesday 8:00 PM - 10:00 PM\n` +
                  `• Reminders: 10:00 AM & 4:00 PM\n\n` +
                  `💰 *Rewards:*\n` +
                  `• Winner: ₦${wcwSettings.winnerReward.toLocaleString()}\n` +
                  `• Participation: ₦${wcwSettings.participationReward.toLocaleString()}\n\n` +
                  `📅 *Next WCW: ${nextWCW} 8:00 PM*\n\n` +
                  `💡 *Usage:* ${prefix}wcw [command]`;
  
  await reply(menuText);
}

async function handleWCWStart(context) {
  const { reply, senderId, sock, from } = context;
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can start WCW.');
  if (!from.endsWith('@g.us')) return reply('❌ WCW in groups only.');
  try {
    if (await getCurrentSession(from)) return reply('💃 WCW already active!');
    await startWCWSession(sock, from);
    await reply('✅ WCW started manually!');
  } catch (error) {
    await reply('❌ Error starting WCW.');
    console.error('WCW start error:', error);
  }
}

async function handleWCWEnd(context) {
  const { reply, senderId, sock, from } = context;
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can end WCW.');
  if (!from.endsWith('@g.us')) return reply('❌ WCW in groups only.');
  try {
    const success = await endWCWSession(sock, from);
    if (success) return reply('✅ WCW ended and results declared!');
    return reply('❌ No active WCW session.');
  } catch (error) {
    await reply('❌ Error ending WCW.');
    console.error('WCW end error:', error);
  }
}

async function handleWCWCancel(context) {
  const { reply, senderId, sock, from } = context;
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can cancel WCW.');
  if (!from.endsWith('@g.us')) return reply('❌ WCW in groups only.');
  try {
    const success = await cancelWCWSession(from);
    if (success) {
      await sock.sendMessage(from, { text: '❌ WCW session cancelled!' });
      return reply('✅ WCW cancelled.');
    }
    return reply('❌ No active WCW session.');
  } catch (error) {
    await reply('❌ Error cancelling WCW.');
    console.error('WCW cancel error:', error);
  }
}

async function handleWCWCurrent(context) {
  const { reply, from } = context;
  if (!from.endsWith('@g.us')) return reply('❌ WCW status in groups only.');
  try {
    const session = await getCurrentSession(from);
    if (!session) {
      const nextWCW = isWednesday() ? `Today at ${wcwSettings.startTime}` : moment().day(3).add(1, 'week').format('dddd, MMMM DD') + ` at ${wcwSettings.startTime}`;
      return reply(`📅 *No active WCW*\n\n💃 *Next:* ${nextWCW}\n💰 *Winner:* ₦${wcwSettings.winnerReward.toLocaleString()}`);
    }
    const participants = await safeOperation(async (db) => await db.collection(COLLECTIONS.WCW_PARTICIPANTS).find({ sessionId: session.sessionId }).sort({ totalRating: -1, ratingCount: -1 }).toArray());
    const totalRatings = await safeOperation(async (db) => await db.collection(COLLECTIONS.WCW_RATINGS).countDocuments({ sessionId: session.sessionId }));
    let statusMessage = `💃 *WCW LIVE STATUS* 💃\n\n📅 Date: ${session.date}\n🕐 Started: ${moment(session.startedAt).format('HH:mm')}\n⏰ Ends: ${wcwSettings.endTime}\n\n👥 Participants: ${participants.length}\n⭐ Total Ratings: ${totalRatings}\n\n`;
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
    statusMessage += `\n💰 *Winner gets ₦${wcwSettings.winnerReward.toLocaleString()}!*`;
    await reply(statusMessage);
  } catch (error) {
    await reply('❌ Error loading status.');
    console.error('WCW current error:', error);
  }
}

async function handleWCWStats(context) {
  const { reply, senderId } = context;
  try {
    const stats = await safeOperation(async (db) => await db.collection(COLLECTIONS.WCW_RECORDS).aggregate([{ $unwind: '$participants' }, { $match: { 'participants.userId': senderId } }, { $group: { _id: null, participationCount: { $sum: 1 }, totalRatingsReceived: { $sum: '$participants.ratingCount' }, totalPoints: { $sum: '$participants.totalRating' }, bestRating: { $max: '$participants.averageRating' } } }]).toArray());
    const winStats = await safeOperation(async (db) => await db.collection(COLLECTIONS.WCW_RECORDS).aggregate([{ $unwind: '$winners' }, { $match: { 'winners.userId': senderId } }, { $group: { _id: null, winsCount: { $sum: 1 } } }]).toArray());
    const { participationCount = 0, totalRatingsReceived = 0, totalPoints = 0, bestRating = 0 } = stats[0] || {};
    const { winsCount = 0 } = winStats[0] || {};
    const averageRating = totalRatingsReceived > 0 ? (totalPoints / totalRatingsReceived).toFixed(1) : '0.0';
    const winRate = participationCount > 0 ? ((winsCount / participationCount) * 100).toFixed(1) : '0.0';
    const userData = await unifiedUserManager.getUserData(senderId);
    let statsMessage = `📊 *YOUR WCW STATISTICS* 📊\n\n💃 *Participation:*\n• Total: ${participationCount}\n• Wins: ${winsCount} 👑\n• Win rate: ${winRate}%\n\n⭐ *Ratings:*\n• Total received: ${totalRatingsReceived}\n• Average: ${averageRating}/10\n• Best: ${bestRating.toFixed(1)}/10\n\n💰 *Financial:*\n• Balance: ₦${(userData.balance || 0).toLocaleString()}\n• WCW winnings: ₦${(winsCount * wcwSettings.winnerReward).toLocaleString()}`;
    await reply(statsMessage);
  } catch (error) {
    await reply('❌ Error loading stats.');
    console.error('WCW stats error:', error);
  }
}

async function handleWCWHistory(context, args) {
  const { reply } = context;
  try {
    const limit = args[0] ? Math.min(parseInt(args[0]), 10) : 5;
    const records = await safeOperation(async (db) => await db.collection(COLLECTIONS.WCW_RECORDS).find({}).sort({ date: -1 }).limit(limit).toArray());
    if (records.length === 0) return reply('📅 *No WCW history.*');
    let historyMessage = `📚 *WCW HISTORY (Last ${records.length})* 📚\n\n`;
    records.forEach((record, i) => {
      historyMessage += `${i + 1}. 📅 ${record.date}\n`;
      if (record.winners && record.winners.length > 0) {
        historyMessage += `   👑 Winners:\n`;
        record.winners.forEach(w => { historyMessage += `     • +${w.userPhone} (${w.totalRating} pts)\n`; });
        historyMessage += `   💰 Prize each: ₦${record.winners[0].prizeAwarded.toLocaleString()}\n`;
      } else {
        historyMessage += `   🤷‍♀️ No winner\n`;
      }
      historyMessage += `   👥 Participants: ${record.totalParticipants}\n\n`;
    });
    historyMessage += `💡 Use *wcw history [number]* for more`;
    await reply(historyMessage);
  } catch (error) {
    await reply('❌ Error loading history.');
    console.error('WCW history error:', error);
  }
}

async function handleWCWLeaderboard(context) {
  const { reply } = context;
  try {
    const leaders = await safeOperation(async (db) => await db.collection(COLLECTIONS.WCW_RECORDS).aggregate([{ $unwind: '$winners' }, { $group: { _id: '$winners.userId', userPhone: { $first: '$winners.userPhone' }, wins: { $sum: 1 }, totalEarnings: { $sum: '$winners.prizeAwarded' }, bestRating: { $max: '$winners.averageRating' }, totalRatings: { $sum: '$winners.ratingCount' } } }, { $sort: { wins: -1, bestRating: -1 } }, { $limit: 10 }]).toArray());
    if (leaders.length === 0) return reply('🏆 *No WCW winners yet!*\n\nBe the first! 💪');
    let leaderboardMessage = `🏆 *WCW HALL OF FAME* 🏆\n\n👑 *ALL-TIME LEADERBOARD:*\n\n`;
    leaders.forEach((leader, i) => {
      const pos = i + 1;
      const emoji = pos === 1 ? '👑' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏅';
      leaderboardMessage += `${emoji} ${pos}. +${leader.userPhone}\n   🏆 Wins: ${leader.wins}\n   ⭐ Best: ${leader.bestRating.toFixed(1)}/10\n   💰 Earned: ₦${leader.totalEarnings.toLocaleString()}\n\n`;
    });
    leaderboardMessage += `💃 *Can you top the leaderboard?*\nNext WCW: Every Wednesday 8:00 PM!`;
    await reply(leaderboardMessage);
  } catch (error) {
    await reply('❌ Error loading leaderboard.');
    console.error('WCW leaderboard error:', error);
  }
}

async function handleWCWSettings(context, args) {
  const { reply, senderId, sock, from, config } = context;
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can access settings.');
  try {
    if (args.length === 0) {
      let settingsMessage = `⚙️ *WCW SETTINGS* ⚙️\n\n` +
        `🕐 *Schedule:*\n• Start: ${wcwSettings.startTime}\n• End: ${wcwSettings.endTime}\n• Auto-start: ${wcwSettings.autoStartEnabled ? '✅' : '❌'}\n• Reminders: ${wcwSettings.reminderTimes.join(', ')}\n\n` +
        `💰 *Rewards:*\n• Winner: ₦${wcwSettings.winnerReward.toLocaleString()}\n• Participation: ₦${wcwSettings.participationReward.toLocaleString()}\n• Participation: ${wcwSettings.enableParticipationReward ? '✅' : '❌'}\n\n` +
        `🔧 *Other:*\n• Self-rating: ${wcwSettings.allowSelfRating ? '✅' : '❌'}\n• Tag all: ${wcwSettings.tagAllMembers ? '✅' : '❌'}\n\n` +
        `🔧 *Commands:*\n• \`${config.PREFIX}wcw settings prize 15000\`\n• \`${config.PREFIX}wcw settings participation 1500\`\n• \`${config.PREFIX}wcw settings starttime 20:30\`\n• \`${config.PREFIX}wcw settings endtime 22:30\`\n• \`${config.PREFIX}wcw settings autostart on/off\`\n` +
        `• \`${config.PREFIX}wcw settings parreward on/off\`\n• \`${config.PREFIX}wcw settings selfrating on/off\`\n• \`${config.PREFIX}wcw settings tagall on/off\``;
      await reply(settingsMessage);
      return;
    }
    const setting = args[0].toLowerCase();
    const value = args[1]?.toLowerCase();
    let responseText = "";
    let needsReschedule = false;
    switch (setting) {
      case 'prize': case 'winner':
        const prize = parseInt(args[1]);
        if (isNaN(prize)) return reply(`⚠️ Invalid. Use: ${config.PREFIX}wcw settings prize 15000`);
        wcwSettings.winnerReward = prize;
        responseText = `✅ Winner prize: ₦${prize.toLocaleString()}`;
        break;
      case 'participation':
        const part = parseInt(args[1]);
        if (isNaN(part)) return reply(`⚠️ Invalid. Use: ${config.PREFIX}wcw settings participation 1500`);
        wcwSettings.participationReward = part;
        responseText = `✅ Participation: ₦${part.toLocaleString()}`;
        break;
      case 'starttime':
        if (!/^\d{2}:\d{2}$/.test(args[1])) return reply(`⚠️ Invalid. Use: ${config.PREFIX}wcw settings starttime 20:30`);
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
      case 'autostart': case 'parreward': case 'selfrating': case 'tagall':
        const flag = ['on', 'true', 'enable'].includes(value);
        const keyMap = { autostart: 'autoStartEnabled', parreward: 'enableParticipationReward', selfrating: 'allowSelfRating', tagall: 'tagAllMembers' };
        const settingKey = keyMap[setting];
        if (settingKey) {
            wcwSettings[settingKey] = flag;
            responseText = `✅ ${setting} ${flag ? 'enabled' : 'disabled'}.`;
            if (setting === 'autostart') needsReschedule = true;
        } else {
            responseText = `⚠️ Use: on/off`;
        }
        break;
      default:
        responseText = `⚠️ Unknown: ${setting}\nAvailable: prize, participation, starttime, endtime, autostart, parreward, selfrating, tagall`;
    }
    await saveSettings();
    await reply(responseText);
    if (needsReschedule && context.sock) setupWCWCronJobs(context.sock);
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
    let result = `🔍 *RESULTS* 🔍\n\n📝 Message: "${testText}"\n\n`;
    if (rating) {
      result += `✅ *VALID!*\n⭐ Rating: ${rating}/10\n`;
    } else {
      result += `❌ *INVALID*\n\n💡 *Formats:*\n• Numbers: "9", "10", "She's a perfect 8"\n• Emojis: "9️⃣", "🔟", "Beautiful 1️⃣0️⃣"\n• Range: 1-10`;
    }
    await reply(result);
  } catch (error) {
    await reply('❌ Error testing.');
    console.error('WCW test error:', error);
  }
}

// =======================================================================
// MAIN PLUGIN HANDLER AND INIT
// =======================================================================

export async function init(sock) {
  await loadSettings();
  await setupWCWCronJobs(sock);
  console.log('✅ WCW plugin initialized');
}

export default async function wcwHandler(m, sock, config) {
  try {
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

async function handleWCWSubCommand(subCommand, args, context) {
  switch (subCommand.toLowerCase()) {
    case 'start': await handleWCWStart(context); break;
    case 'end': await handleWCWEnd(context); break;
    case 'cancel': await handleWCWCancel(context); break;
    case 'current': case 'status': await handleWCWCurrent(context); break;
    case 'stats': await handleWCWStats(context); break;
    case 'history': await handleWCWHistory(context, args); break;
    case 'leaderboard': case 'leaders': await handleWCWLeaderboard(context); break;
    case 'settings': await handleWCWSettings(context, args); break;
    case 'reschedule': await handleWCWReschedule(context); break;
    case 'addgroup': await handleWCWAddGroup(context); break;
    case 'removegroup': await handleWCWRemoveGroup(context); break;
    case 'addadmin': await handleWCWAddAdmin(context, args); break;
    case 'removeadmin': await handleWCWRemoveAdmin(context, args); break;
    case 'test': await handleWCWTest(context, args); break;
    case 'help': await showWCWMenu(context.reply, context.config.PREFIX); break;
    default: await context.reply(`❓ Unknown: *${subCommand}*\n\nUse *${context.config.PREFIX}wcw help*`);
  }
}

export { 
  setupWCWCronJobs,
  stopAllCronJobs,
  wcwSettings
};
