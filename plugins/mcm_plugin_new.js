// plugins/mcm.js - Man Crush Monday Plugin
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Man Crush Monday (MCM)',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Weekly Man Crush Monday contest where guys post pictures and ladies rate them from 1-10. Automatic scheduling, winner declaration, and rewards system.',
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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
const COLLECTIONS = {
  MCM_RECORDS: 'mcm_records',
  MCM_SETTINGS: 'mcm_settings',
  MCM_SESSIONS: 'mcm_sessions',
  MCM_PARTICIPANTS: 'mcm_participants',
  MCM_RATINGS: 'mcm_ratings'
};

// Database connection
let db = null;
let mongoClient = null;

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default MCM settings
const defaultSettings = {
  startTime: '20:00', // 8 PM
  endTime: '22:00',   // 10 PM
  winnerReward: 10000, // ₦10,000 for winner
  participationReward: 1000, // ₦1,000 for participation
  enableParticipationReward: true,
  reminderTimes: ['10:00', '16:00'], // Two reminders
  autoStartEnabled: true,
  adminNumbers: [],
  groupJids: [],
  tagAllMembers: true,
  maxPhotosPerUser: 1,
  validRatingRange: { min: 1, max: 10 },
  allowSelfRating: false
};

let mcmSettings = { ...defaultSettings };

// Initialize MongoDB connection
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    // Create indexes for better performance
    await db.collection(COLLECTIONS.MCM_SESSIONS).createIndex({ date: 1, groupJid: 1 }, { unique: true });
    await db.collection(COLLECTIONS.MCM_PARTICIPANTS).createIndex({ sessionId: 1, userId: 1 });
    await db.collection(COLLECTIONS.MCM_RATINGS).createIndex({ sessionId: 1, raterId: 1, participantId: 1 });
    await db.collection(COLLECTIONS.MCM_RECORDS).createIndex({ date: -1 });
    
    console.log('✅ MongoDB connected successfully for MCM');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed for MCM:', error);
    throw error;
  }
}

async function loadSettings() {
  try {
    const settings = await db.collection(COLLECTIONS.MCM_SETTINGS).findOne({ type: 'mcm_config' });
    if (settings) {
      mcmSettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading MCM settings:', error);
  }
}

async function saveSettings() {
  try {
    await db.collection(COLLECTIONS.MCM_SETTINGS).replaceOne(
      { type: 'mcm_config' },
      { type: 'mcm_config', data: mcmSettings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving MCM settings:', error);
  }
}

function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

function isMonday() {
  return getNigeriaTime().format('dddd').toLowerCase() === 'monday';
}

function getCurrentTime() {
  return getNigeriaTime().format('HH:mm');
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

// =======================================================================
// MCM SESSION MANAGEMENT
// =======================================================================

async function createMCMSession(groupJid) {
  try {
    const today = getCurrentDate();
    const sessionId = `mcm_${today}_${groupJid}`;
    
    const existingSession = await db.collection(COLLECTIONS.MCM_SESSIONS).findOne({
      date: today,
      groupJid: groupJid
    });
    
    if (existingSession) {
      console.log(`MCM session already exists for ${today}`);
      return existingSession;
    }
    
    const sessionData = {
      sessionId: sessionId,
      date: today,
      groupJid: groupJid,
      status: 'active', // active, ended, cancelled
      startedAt: new Date(),
      endedAt: null,
      participants: [],
      totalRatings: 0,
      winnerDeclared: false,
      createdAt: new Date()
    };
    
    await db.collection(COLLECTIONS.MCM_SESSIONS).insertOne(sessionData);
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
    return await db.collection(COLLECTIONS.MCM_SESSIONS).findOne({
      date: today,
      groupJid: groupJid,
      status: 'active'
    });
  } catch (error) {
    console.error('Error getting current session:', error);
    return null;
  }
}

// =======================================================================
// MCM ANNOUNCEMENTS AND REMINDERS
// =======================================================================

function formatReminderMessage(timeUntil) {
  const messages = [
    `🚨 *MCM ALERT!* 🚨\n\n🔥 Get ready guys! Man Crush Monday is starting in ${timeUntil}! 🔥\n\n📸 *Preparation Checklist:*\n• Find your best photo\n• Charge your confidence\n• Get ready to charm the ladies\n\n💰 *Winner gets ₦${mcmSettings.winnerReward.toLocaleString()}!*\n⏰ *Starting at 8:00 PM sharp!*\n\n#MCM #GistHQ #ManCrushMonday`,
    
    `⚡ *FINAL CALL!* ⚡\n\n🕰️ MCM starts in ${timeUntil}!\n\n🎬 *Tonight's Show:*\n📸 Guys post their best shots\n🌟 Ladies rate from 1-10\n👑 Winner takes ₦${mcmSettings.winnerReward.toLocaleString()}\n\n🎭 *Let the games begin soon!*\n#MCMCountdown`
  ];
  
  return messages[Math.floor(Math.random() * messages.length)];
}

function formatMCMStartMessage() {
  return `🎬 *MAN CRUSH MONDAY IS NOW LIVE!* 🎬\n\n` +
         `🔴 *LIVE NOW - LIVE NOW - LIVE NOW* 🔴\n\n` +
         `👨‍💼 *GENTLEMEN:* Post your best photo NOW!\n` +
         `👩‍💼 *LADIES:* Rate the gentlemen from 1-10!\n\n` +
         `⏰ *Competition ends at 10:00 PM*\n` +
         `💰 *Winner takes home ₦${mcmSettings.winnerReward.toLocaleString()}*\n` +
         `🎁 *Participation reward: ₦${mcmSettings.participationReward.toLocaleString()}*\n\n` +
         `📋 *RULES:*\n` +
         `• Guys: 1 photo only (extras will be ignored)\n` +
         `• Ladies: Rate 1-10 only (higher ratings invalid)\n` +
         `• No self-rating allowed\n\n` +
         `💡 *Rating Formats Accepted:*\n` +
         `• Regular: "8", "10", "He's a 7"\n` +
         `• Emoji: "8️⃣", "🔟", "Perfect 1️⃣0️⃣"\n\n` +
         `🎭 *Let the competition begin!* 🎭\n` +
         `#MCMLive #ManCrushMonday`;
}

async function sendMCMReminders(sock) {
  try {
    if (!isMonday()) return;
    
    const currentTime = getCurrentTime();
    if (!mcmSettings.reminderTimes.includes(currentTime)) return;
    
    const startTime = moment.tz(`${getCurrentDate()} ${mcmSettings.startTime}`, 'DD-MM-YYYY HH:mm', 'Africa/Lagos');
    const now = getNigeriaTime();
    const timeUntil = moment.duration(startTime.diff(now)).humanize();
    
    const reminderMessage = formatReminderMessage(timeUntil);
    
    for (const groupJid of mcmSettings.groupJids) {
      try {
        const members = await getGroupMembers(sock, groupJid);
        const mentions = members.map(m => m.id);
        
        await sock.sendMessage(groupJid, {
          text: reminderMessage,
          mentions: mentions
        });
        
        console.log(`✅ MCM reminder sent to ${groupJid}`);
      } catch (error) {
        console.error(`Error sending reminder to ${groupJid}:`, error);
      }
    }
  } catch (error) {
    console.error('Error sending MCM reminders:', error);
  }
}

async function startMCMSession(sock, groupJid) {
  try {
    const session = await createMCMSession(groupJid);
    const startMessage = formatMCMStartMessage();
    
    const members = await getGroupMembers(sock, groupJid);
    const mentions = members.map(m => m.id);
    
    await sock.sendMessage(groupJid, {
      text: startMessage,
      mentions: mentions
    });
    
    console.log(`✅ MCM session started for ${groupJid}`);
    return session;
  } catch (error) {
    console.error('Error starting MCM session:', error);
    throw error;
  }
}

// =======================================================================
// PHOTO SUBMISSION HANDLING
// =======================================================================

async function handlePhotoSubmission(m, sock) {
  try {
    if (!isMonday()) return false;
    
    const currentTime = getCurrentTime();
    const startTime = mcmSettings.startTime;
    const endTime = mcmSettings.endTime;
    
    // Check if MCM is active
    if (currentTime < startTime || currentTime >= endTime) return false;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const groupJid = m.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) return false;
    
    // Check if message contains image
    if (!m.message.imageMessage) return false;
    
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    // Check if user already submitted a photo
    const existingParticipant = await db.collection(COLLECTIONS.MCM_PARTICIPANTS).findOne({
      sessionId: session.sessionId,
      userId: senderId
    });
    
    if (existingParticipant) {
      // React with ❌ for duplicate submission
      await sock.sendMessage(groupJid, {
        react: { text: '❌', key: m.key }
      });
      
      await sock.sendMessage(groupJid, {
        text: `🚫 @${senderId.split('@')[0]} - You already submitted your photo! Only your first photo counts for MCM.`,
        mentions: [senderId]
      }, { quoted: m });
      
      return true;
    }
    
    // Add participant
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
    
    await db.collection(COLLECTIONS.MCM_PARTICIPANTS).insertOne(participantData);
    
    // Update session participants list
    await db.collection(COLLECTIONS.MCM_SESSIONS).updateOne(
      { sessionId: session.sessionId },
      { $push: { participants: senderId } }
    );
    
    // React with ✅ for successful submission
    await sock.sendMessage(groupJid, {
      react: { text: '✅', key: m.key }
    });
    
    // Initialize user in economy system and give participation reward
    await unifiedUserManager.initUser(senderId);
    if (mcmSettings.enableParticipationReward) {
      await unifiedUserManager.addMoney(senderId, mcmSettings.participationReward, 'MCM participation');
    }
    
    console.log(`📸 MCM photo submitted by ${senderId.split('@')[0]}`);
    return true;
    
  } catch (error) {
    console.error('Error handling photo submission:', error);
    return false;
  }
}

// =======================================================================
// RATING SYSTEM
// =======================================================================

function extractRating(text) {
  // Look for numbers 1-10 in the message
  const numbers = text.match(/\b([1-9]|10)\b/g);
  if (!numbers) return null;
  
  // Get the first valid rating
  const rating = parseInt(numbers[0]);
  if (rating >= mcmSettings.validRatingRange.min && rating <= mcmSettings.validRatingRange.max) {
    return rating;
  }
  
  return null;
}

async function handleRatingSubmission(m, sock) {
  try {
    if (!isMonday()) return false;
    
    const currentTime = getCurrentTime();
    const startTime = mcmSettings.startTime;
    const endTime = mcmSettings.endTime;
    
    // Check if MCM is active
    if (currentTime < startTime || currentTime >= endTime) return false;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const groupJid = m.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) return false;
    if (!m.message.extendedTextMessage?.contextInfo?.quotedMessage) return false;
    
    // Check if quoted message has an image (MCM photo)
    if (!m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage) return false;
    
    const quotedKey = m.message.extendedTextMessage.contextInfo.stanzaId;
    const participantId = m.message.extendedTextMessage.contextInfo.participant;
    
    if (!participantId || !quotedKey) return false;
    
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    // Check if quoted message is from an MCM participant
    const participant = await db.collection(COLLECTIONS.MCM_PARTICIPANTS).findOne({
      sessionId: session.sessionId,
      userId: participantId
    });
    
    if (!participant) return false;
    
    // Check for self-rating
    if (!mcmSettings.allowSelfRating && senderId === participantId) {
      await sock.sendMessage(groupJid, {
        react: { text: '🚫', key: m.key }
      });
      return true;
    }
    
    const ratingText = m.body || '';
    const rating = extractRating(ratingText);
    
    if (!rating) {
      // Invalid rating - react with ❌
      await sock.sendMessage(groupJid, {
        react: { text: '❌', key: m.key }
      });
      return true;
    }
    
    // Check if user already rated this participant
    const existingRating = await db.collection(COLLECTIONS.MCM_RATINGS).findOne({
      sessionId: session.sessionId,
      raterId: senderId,
      participantId: participantId
    });
    
    if (existingRating) {
      // Update existing rating
      await db.collection(COLLECTIONS.MCM_RATINGS).updateOne(
        { _id: existingRating._id },
        { 
          $set: { 
            rating: rating, 
            updatedAt: new Date() 
          } 
        }
      );
    } else {
      // Create new rating
      const ratingData = {
        sessionId: session.sessionId,
        raterId: senderId,
        raterPhone: senderId.split('@')[0],
        participantId: participantId,
        participantPhone: participantId.split('@')[0],
        rating: rating,
        createdAt: new Date()
      };
      
      await db.collection(COLLECTIONS.MCM_RATINGS).insertOne(ratingData);
    }
    
    // Update participant's rating stats
    await updateParticipantRatings(participant.sessionId, participantId);
    
    // React with ✅ for successful rating
    await sock.sendMessage(groupJid, {
      react: { text: '✅', key: m.key }
    });
    
    console.log(`⭐ MCM rating ${rating} given by ${senderId.split('@')[0]} to ${participantId.split('@')[0]}`);
    return true;
    
  } catch (error) {
    console.error('Error handling rating submission:', error);
    return false;
  }
}

async function updateParticipantRatings(sessionId, participantId) {
  try {
    // Calculate new rating statistics
    const ratings = await db.collection(COLLECTIONS.MCM_RATINGS).find({
      sessionId: sessionId,
      participantId: participantId
    }).toArray();
    
    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    const ratingCount = ratings.length;
    const averageRating = ratingCount > 0 ? (totalRating / ratingCount) : 0;
    
    // Update participant document
    await db.collection(COLLECTIONS.MCM_PARTICIPANTS).updateOne(
      { sessionId: sessionId, userId: participantId },
      {
        $set: {
          totalRating: totalRating,
          averageRating: averageRating,
          ratingCount: ratingCount,
          updatedAt: new Date()
        }
      }
    );
    
  } catch (error) {
    console.error('Error updating participant ratings:', error);
  }
}

// =======================================================================
// END MCM SESSION AND DECLARE WINNER
// =======================================================================

async function endMCMSession(sock, groupJid) {
  try {
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    // Get all participants with their ratings
    const participants = await db.collection(COLLECTIONS.MCM_PARTICIPANTS).find({
      sessionId: session.sessionId
    }).sort({ averageRating: -1, totalRating: -1 }).toArray();
    
    if (participants.length === 0) {
      await sock.sendMessage(groupJid, {
        text: `🎭 *MCM SESSION ENDED* 🎭\n\n❌ No participants today!\n\nBetter luck next Monday! 💪`
      });
      
      // Mark session as ended
      await db.collection(COLLECTIONS.MCM_SESSIONS).updateOne(
        { sessionId: session.sessionId },
        {
          $set: {
            status: 'ended',
            endedAt: new Date(),
            winnerDeclared: true
          }
        }
      );
      
      return true;
    }
    
    // Determine winner (highest average rating, then highest total rating)
    const winner = participants[0];
    const hasValidRatings = winner.ratingCount > 0;
    
    // Build results message
    let resultsMessage = `🏆 *MCM RESULTS - ${getCurrentDate()}* 🏆\n\n`;
    resultsMessage += `🎬 *Tonight's Show Has Ended!* 🎬\n\n`;
    resultsMessage += `📊 *FINAL STANDINGS:*\n\n`;
    
    // List all participants with their ratings
    participants.forEach((participant, index) => {
      const position = index + 1;
      const emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      const avgRating = participant.averageRating > 0 ? participant.averageRating.toFixed(1) : '0.0';
      
      resultsMessage += `${emoji} ${position}. @${participant.userPhone}\n`;
      resultsMessage += `   ⭐ Average: ${avgRating}/10 (${participant.ratingCount} ratings)\n`;
      resultsMessage += `   📊 Total Points: ${participant.totalRating}\n\n`;
    });
    
    if (hasValidRatings) {
      resultsMessage += `🎉 *WINNER: @${winner.userPhone}* 🎉\n`;
      resultsMessage += `💰 *Prize: ₦${mcmSettings.winnerReward.toLocaleString()}* 💰\n\n`;
      
      // Award winner prize
      await unifiedUserManager.initUser(winner.userId);
      await unifiedUserManager.addMoney(winner.userId, mcmSettings.winnerReward, 'MCM Winner');
    } else {
      resultsMessage += `🤷‍♂️ *No ratings received - No winner declared*\n\n`;
    }
    
    resultsMessage += `📅 *Next MCM: Monday 8:00 PM*\n`;
    resultsMessage += `🎭 *Thank you all for participating!*\n\n`;
    resultsMessage += `#MCMResults #ManCrushMonday #GistHQ`;
    
    // Get mentions for all participants
    const mentions = participants.map(p => p.userId);
    
    await sock.sendMessage(groupJid, {
      text: resultsMessage,
      mentions: mentions
    });
    
    // Save to records
    const recordData = {
      date: getCurrentDate(),
      groupJid: groupJid,
      sessionId: session.sessionId,
      totalParticipants: participants.length,
      winner: hasValidRatings ? {
        userId: winner.userId,
        userPhone: winner.userPhone,
        averageRating: winner.averageRating,
        totalRating: winner.totalRating,
        ratingCount: winner.ratingCount,
        prizeAwarded: mcmSettings.winnerReward
      } : null,
      participants: participants,
      createdAt: new Date()
    };
    
    await db.collection(COLLECTIONS.MCM_RECORDS).insertOne(recordData);
    
    // Mark session as ended
    await db.collection(COLLECTIONS.MCM_SESSIONS).updateOne(
      { sessionId: session.sessionId },
      {
        $set: {
          status: 'ended',
          endedAt: new Date(),
          winnerDeclared: true
        }
      }
    );
    
    console.log(`✅ MCM session ended and winner declared for ${groupJid}`);
    return true;
    
  } catch (error) {
    console.error('Error ending MCM session:', error);
    return false;
  }
}

// =======================================================================
// AUTOMATIC SCHEDULING SYSTEM
// =======================================================================

async function checkAndRunMCMSchedule(sock) {
  try {
    if (!isMonday()) return;
    
    const currentTime = getCurrentTime();
    
    // Send reminders
    if (mcmSettings.reminderTimes.includes(currentTime)) {
      await sendMCMReminders(sock);
    }
    
    // Start MCM session
    if (currentTime === mcmSettings.startTime && mcmSettings.autoStartEnabled) {
      for (const groupJid of mcmSettings.groupJids) {
        const existingSession = await getCurrentSession(groupJid);
        if (!existingSession) {
          await startMCMSession(sock, groupJid);
        }
      }
    }
    
    // End MCM session
    if (currentTime === mcmSettings.endTime) {
      for (const groupJid of mcmSettings.groupJids) {
        await endMCMSession(sock, groupJid);
      }
    }
    
  } catch (error) {
    console.error('Error in MCM scheduler:', error);
  }
}

class MCMScheduler {
  constructor(sock) {
    this.sock = sock;
    this.interval = null;
    this.running = false;
  }
  
  start() {
    if (this.running) return;
    this.running = true;
    console.log('⏰ MCM scheduler started');
    this.interval = setInterval(() => checkAndRunMCMSchedule(this.sock), 60000); // Check every minute
  }
  
  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('⏰ MCM scheduler stopped');
  }
}

let mcmScheduler = null;

function initializeMCMScheduler(sock) {
  if (mcmScheduler) mcmScheduler.stop();
  mcmScheduler = new MCMScheduler(sock);
  mcmScheduler.start();
  return mcmScheduler;
}

async function setGroupJid(groupJid) {
  if (!mcmSettings.groupJids.includes(groupJid)) {
    mcmSettings.groupJids.push(groupJid);
    await saveSettings();
    console.log(`📝 Group JID added for MCM: ${groupJid}`);
  }
}

// =======================================================================
// COMMAND HANDLERS
// =======================================================================

async function showMCMMenu(reply, prefix) {
  const nextMCM = moment.tz('Africa/Lagos').startOf('week').add(1, 'week').format('dddd, MMMM DD, YYYY');
  
  const menuText = `🎭 *MAN CRUSH MONDAY (MCM)* 🎭\n\n` +
                  `📊 *User Commands:*\n` +
                  `• *current* - View current MCM status\n` +
                  `• *stats* - View your MCM statistics\n` +
                  `• *history* - View MCM history\n` +
                  `• *leaderboard* - View all-time winners\n\n` +
                  `👑 *Admin Commands:*\n` +
                  `• *start* - Start MCM manually\n` +
                  `• *end* - End current MCM\n` +
                  `• *settings* - System settings\n\n` +
                  `⏰ *Schedule:*\n` +
                  `• Every Monday 8:00 PM - 10:00 PM\n` +
                  `• Two reminders: 10:00 AM & 4:00 PM\n` +
                  `• Auto-start and auto-end\n\n` +
                  `💰 *Rewards:*\n` +
                  `• Winner: ₦${mcmSettings.winnerReward.toLocaleString()}\n` +
                  `• Participation: ₦${mcmSettings.participationReward.toLocaleString()}\n\n` +
                  `📅 *Next MCM: ${nextMCM} 8:00 PM*\n\n` +
                  `💡 *Usage:* ${prefix}mcm [command]`;
  
  await reply(menuText);
}

async function handleMCMStart(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can start MCM manually.');
  }
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ MCM can only be started in groups.');
  }
  
  try {
    const existingSession = await getCurrentSession(from);
    if (existingSession) {
      return reply('🎭 MCM session is already active!');
    }
    
    await startMCMSession(sock, from);
    await reply('✅ *MCM session started manually!*');
    
  } catch (error) {
    await reply('❌ *Error starting MCM session.*');
    console.error('MCM start error:', error);
  }
}

async function handleMCMEnd(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can end MCM manually.');
  }
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ MCM can only be ended in groups.');
  }
  
  try {
    const success = await endMCMSession(sock, from);
    if (success) {
      await reply('✅ *MCM session ended and winner declared!*');
    } else {
      await reply('❌ *No active MCM session found.*');
    }
    
  } catch (error) {
    await reply('❌ *Error ending MCM session.*');
    console.error('MCM end error:', error);
  }
}

async function handleMCMCurrent(context) {
  const { reply, from } = context;
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ MCM status can only be checked in groups.');
  }
  
  try {
    const session = await getCurrentSession(from);
    
    if (!session) {
      const nextMCM = isMonday() 
        ? `Today at ${mcmSettings.startTime}`
        : moment.tz('Africa/Lagos').startOf('week').add(1, 'week').format('dddd, MMMM DD') + ` at ${mcmSettings.startTime}`;
      
      return reply(`📅 *No active MCM session*\n\n🎭 *Next MCM:* ${nextMCM}\n💰 *Winner Prize:* ₦${mcmSettings.winnerReward.toLocaleString()}`);
    }
    
    const participants = await db.collection(COLLECTIONS.MCM_PARTICIPANTS).find({
      sessionId: session.sessionId
    }).sort({ averageRating: -1, totalRating: -1 }).toArray();
    
    const totalRatings = await db.collection(COLLECTIONS.MCM_RATINGS).countDocuments({
      sessionId: session.sessionId
    });
    
    let statusMessage = `🎬 *MCM LIVE STATUS* 🎬\n\n`;
    statusMessage += `📅 Date: ${session.date}\n`;
    statusMessage += `🕐 Started: ${moment(session.startedAt).tz('Africa/Lagos').format('HH:mm')}\n`;
    statusMessage += `⏰ Ends: ${mcmSettings.endTime}\n\n`;
    statusMessage += `👥 Participants: ${participants.length}\n`;
    statusMessage += `⭐ Total Ratings: ${totalRatings}\n\n`;
    
    if (participants.length > 0) {
      statusMessage += `📊 *Current Standings:*\n`;
      participants.slice(0, 5).forEach((participant, index) => {
        const position = index + 1;
        const emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
        const avgRating = participant.averageRating > 0 ? participant.averageRating.toFixed(1) : '0.0';
        
        statusMessage += `${emoji} ${position}. +${participant.userPhone} - ${participant.totalRating} pts (${participant.ratingCount} ratings)\n`;
      });
      
      if (participants.length > 5) {
        statusMessage += `... and ${participants.length - 5} more participants\n`;
      }
    } else {
      statusMessage += `❌ *No participants yet!*\n`;
    }
    
    statusMessage += `\n💰 *Winner gets ₦${mcmSettings.winnerReward.toLocaleString()}!*`;
    
    await reply(statusMessage);
    
  } catch (error) {
    await reply('❌ *Error loading MCM status.*');
    console.error('MCM current error:', error);
  }
}

async function handleMCMStats(context) {
  const { reply, senderId } = context;
  
  try {
    // Get user's MCM history
    const userRecords = await db.collection(COLLECTIONS.MCM_RECORDS).find({
      'participants.userId': senderId
    }).toArray();
    
    const participationCount = userRecords.length;
    let winsCount = 0;
    let totalRatingsReceived = 0;
    let bestRating = 0;
    let totalPoints = 0;
    
    userRecords.forEach(record => {
      const userParticipant = record.participants.find(p => p.userId === senderId);
      if (userParticipant) {
        totalRatingsReceived += userParticipant.ratingCount || 0;
        totalPoints += userParticipant.totalRating || 0;
        if (userParticipant.averageRating > bestRating) {
          bestRating = userParticipant.averageRating;
        }
      }
      
      if (record.winner && record.winner.userId === senderId) {
        winsCount++;
      }
    });
    
    const averageRating = totalRatingsReceived > 0 ? (totalPoints / totalRatingsReceived).toFixed(1) : '0.0';
    const winRate = participationCount > 0 ? ((winsCount / participationCount) * 100).toFixed(1) : '0.0';
    
    // Get user's economic data
    const userData = await unifiedUserManager.getUserData(senderId);
    
    let statsMessage = `📊 *YOUR MCM STATISTICS* 📊\n\n`;
    statsMessage += `🎭 *Participation Record:*\n`;
    statsMessage += `• Total participations: ${participationCount}\n`;
    statsMessage += `• Wins: ${winsCount} 👑\n`;
    statsMessage += `• Win rate: ${winRate}%\n\n`;
    statsMessage += `⭐ *Rating Statistics:*\n`;
    statsMessage += `• Total ratings received: ${totalRatingsReceived}\n`;
    statsMessage += `• Average rating: ${averageRating}/10\n`;
    statsMessage += `• Best rating: ${bestRating.toFixed(1)}/10\n\n`;
    statsMessage += `💰 *Financial:*\n`;
    statsMessage += `• Current balance: ₦${(userData.balance || 0).toLocaleString()}\n`;
    statsMessage += `• MCM winnings: ₦${(winsCount * mcmSettings.winnerReward).toLocaleString()}`;
    
    await reply(statsMessage);
    
  } catch (error) {
    await reply('❌ *Error loading your MCM statistics.*');
    console.error('MCM stats error:', error);
  }
}

async function handleMCMHistory(context, args) {
  const { reply } = context;
  
  try {
    const limit = args[0] ? Math.min(parseInt(args[0]), 10) : 5;
    
    const records = await db.collection(COLLECTIONS.MCM_RECORDS).find({})
      .sort({ date: -1 })
      .limit(limit)
      .toArray();
    
    if (records.length === 0) {
      return reply('📅 *No MCM history found.*');
    }
    
    let historyMessage = `📚 *MCM HISTORY (Last ${records.length})* 📚\n\n`;
    
    records.forEach((record, index) => {
      historyMessage += `${index + 1}. 📅 ${record.date}\n`;
      if (record.winner) {
        historyMessage += `   👑 Winner: +${record.winner.userPhone}\n`;
        historyMessage += `   ⭐ Rating: ${record.winner.averageRating.toFixed(1)}/10\n`;
        historyMessage += `   💰 Prize: ₦${record.winner.prizeAwarded.toLocaleString()}\n`;
      } else {
        historyMessage += `   🤷‍♂️ No winner (no ratings)\n`;
      }
      historyMessage += `   👥 Participants: ${record.totalParticipants}\n\n`;
    });
    
    historyMessage += `💡 Use *mcm history [number]* for more records`;
    
    await reply(historyMessage);
    
  } catch (error) {
    await reply('❌ *Error loading MCM history.*');
    console.error('MCM history error:', error);
  }
}

async function handleMCMLeaderboard(context) {
  const { reply } = context;
  
  try {
    // Get all winners from MCM records
    const records = await db.collection(COLLECTIONS.MCM_RECORDS).find({
      winner: { $exists: true, $ne: null }
    }).toArray();
    
    if (records.length === 0) {
      return reply('🏆 *No MCM winners yet!*\n\nBe the first to win MCM! 💪');
    }
    
    // Count wins per user
    const winCounts = {};
    const userStats = {};
    
    records.forEach(record => {
      const winner = record.winner;
      const userId = winner.userId;
      const userPhone = winner.userPhone;
      
      if (!winCounts[userId]) {
        winCounts[userId] = 0;
        userStats[userId] = {
          userPhone: userPhone,
          wins: 0,
          totalEarnings: 0,
          bestRating: 0,
          totalRatings: 0
        };
      }
      
      winCounts[userId]++;
      userStats[userId].wins++;
      userStats[userId].totalEarnings += winner.prizeAwarded || 0;
      userStats[userId].totalRatings += winner.ratingCount || 0;
      
      if (winner.averageRating > userStats[userId].bestRating) {
        userStats[userId].bestRating = winner.averageRating;
      }
    });
    
    // Sort by wins, then by best rating
    const sortedLeaders = Object.values(userStats).sort((a, b) => {
      if (b.wins === a.wins) {
        return b.bestRating - a.bestRating;
      }
      return b.wins - a.wins;
    });
    
    let leaderboardMessage = `🏆 *MCM HALL OF FAME* 🏆\n\n`;
    leaderboardMessage += `👑 *ALL-TIME LEADERBOARD:*\n\n`;
    
    sortedLeaders.slice(0, 10).forEach((leader, index) => {
      const position = index + 1;
      const emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      
      leaderboardMessage += `${emoji} ${position}. +${leader.userPhone}\n`;
      leaderboardMessage += `   🏆 Wins: ${leader.wins}\n`;
      leaderboardMessage += `   ⭐ Best: ${leader.bestRating.toFixed(1)}/10\n`;
      leaderboardMessage += `   💰 Earned: ₦${leader.totalEarnings.toLocaleString()}\n\n`;
    });
    
    if (sortedLeaders.length > 10) {
      leaderboardMessage += `... and ${sortedLeaders.length - 10} more champions\n\n`;
    }
    
    leaderboardMessage += `🎭 *Think you can make it to the top?*\n`;
    leaderboardMessage += `Next MCM: Every Monday 8:00 PM!`;
    
    await reply(leaderboardMessage);
    
  } catch (error) {
    await reply('❌ *Error loading MCM leaderboard.*');
    console.error('MCM leaderboard error:', error);
  }
}

async function handleMCMSettings(context, args) {
  const { reply, senderId, sock, from, config } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can access MCM settings.');
  }
  
  try {
    if (args.length === 0) {
      let settingsMessage = `⚙️ *MCM SYSTEM SETTINGS* ⚙️\n\n`;
      settingsMessage += `🕐 *Schedule:*\n`;
      settingsMessage += `• Start time: ${mcmSettings.startTime}\n`;
      settingsMessage += `• End time: ${mcmSettings.endTime}\n`;
      settingsMessage += `• Auto-start: ${mcmSettings.autoStartEnabled ? 'Enabled ✅' : 'Disabled ❌'}\n\n`;
      settingsMessage += `💰 *Rewards:*\n`;
      settingsMessage += `• Winner prize: ₦${mcmSettings.winnerReward.toLocaleString()}\n`;
      settingsMessage += `• Participation reward: ₦${mcmSettings.participationReward.toLocaleString()}\n`;
      settingsMessage += `• Participation rewards: ${mcmSettings.enableParticipationReward ? 'Enabled ✅' : 'Disabled ❌'}\n\n`;
      settingsMessage += `🔧 *Available Commands:*\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings prize 15000\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings participation 1500\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings starttime 20:30\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings endtime 22:30\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings autostart on/off\`\n`;
      settingsMessage += `• \`${config.PREFIX}mcm settings parreward on/off\``;
      
      await reply(settingsMessage);
      return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args[1];
    let responseText = "";
    
    switch (setting) {
      case 'prize':
      case 'winner':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid amount. Use: ${config.PREFIX}mcm settings prize 15000`;
        } else {
          mcmSettings.winnerReward = parseInt(value);
          await saveSettings();
          responseText = `✅ Winner prize set to ₦${parseInt(value).toLocaleString()}`;
        }
        break;
        
      case 'participation':
      case 'participate':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid amount. Use: ${config.PREFIX}mcm settings participation 1500`;
        } else {
          mcmSettings.participationReward = parseInt(value);
          await saveSettings();
          responseText = `✅ Participation reward set to ₦${parseInt(value).toLocaleString()}`;
        }
        break;
        
      case 'starttime':
      case 'start':
        if (!value || !/^\d{2}:\d{2}$/.test(value)) {
          responseText = `⚠️ Invalid time format. Use: ${config.PREFIX}mcm settings starttime 20:30`;
        } else {
          mcmSettings.startTime = value;
          await saveSettings();
          responseText = `✅ MCM start time set to ${value}`;
        }
        break;
        
      case 'endtime':
      case 'end':
        if (!value || !/^\d{2}:\d{2}$/.test(value)) {
          responseText = `⚠️ Invalid time format. Use: ${config.PREFIX}mcm settings endtime 22:30`;
        } else {
          mcmSettings.endTime = value;
          await saveSettings();
          responseText = `✅ MCM end time set to ${value}`;
        }
        break;
        
      case 'autostart':
      case 'auto':
        if (['on', 'true', '1', 'enable'].includes(value?.toLowerCase())) {
          mcmSettings.autoStartEnabled = true;
          await saveSettings();
          responseText = "✅ Auto-start enabled 🤖";
        } else if (['off', 'false', '0', 'disable'].includes(value?.toLowerCase())) {
          mcmSettings.autoStartEnabled = false;
          await saveSettings();
          responseText = "✅ Auto-start disabled";
        } else {
          responseText = `⚠️ Invalid value. Use: on/off`;
        }
        break;
        
      case 'parreward':
      case 'participation-reward':
        if (['on', 'true', '1', 'enable'].includes(value?.toLowerCase())) {
          mcmSettings.enableParticipationReward = true;
          await saveSettings();
          responseText = "✅ Participation rewards enabled 💰";
        } else if (['off', 'false', '0', 'disable'].includes(value?.toLowerCase())) {
          mcmSettings.enableParticipationReward = false;
          await saveSettings();
          responseText = "✅ Participation rewards disabled";
        } else {
          responseText = `⚠️ Invalid value. Use: on/off`;
        }
        break;
        
      default:
        responseText = `⚠️ Unknown setting: *${setting}*\n\nAvailable: prize, participation, starttime, endtime, autostart, parreward`;
    }
    
    await reply(responseText);
    
  } catch (error) {
    await reply('❌ *Error updating MCM settings.*');
    console.error('MCM settings error:', error);
  }
}

async function handleMCMTest(context, args) {
  const { reply, config } = context;
  
  const testText = args.join(' ');
  if (!testText) {
    return reply(`🔍 *MCM RATING VALIDATOR*\n\n*Usage:* ${config.PREFIX}mcmtest [your_rating_message]\n\n*Example:* ${config.PREFIX}mcmtest "This guy looks great! 8"`);
  }
  
  try {
    const rating = extractRating(testText);
    
    let result = `🔍 *RATING VALIDATION RESULTS* 🔍\n\n`;
    result += `📝 Test message: "${testText}"\n\n`;
    
    if (rating) {
      result += `✅ *VALID RATING DETECTED!*\n`;
      result += `⭐ Rating: ${rating}/10\n`;
      result += `🎯 Status: Would be accepted`;
    } else {
      result += `❌ *NO VALID RATING FOUND*\n`;
      result += `🎯 Status: Would be rejected\n\n`;
      result += `💡 *Tips:*\n`;
      result += `• Include a number from 1-10\n`;
      result += `• Examples: "8", "10/10", "He's a solid 7"`;
    }
    
    await reply(result);
    
  } catch (error) {
    await reply('❌ *Error testing rating format.*');
    console.error('MCM test error:', error);
  }
}

// =======================================================================
// MAIN PLUGIN HANDLER
// =======================================================================

export default async function mcmHandler(m, sock, config) {
  try {
    // Initialize database and settings
    if (!db) {
      await initDatabase();
      await loadSettings();
      if (!mcmScheduler) {
        initializeMCMScheduler(sock);
      }
    }
    
    // Register group for MCM if it's a group chat
    if (m.key.remoteJid.endsWith('@g.us')) {
      await setGroupJid(m.key.remoteJid);
    }
    
    // Handle photo submissions and ratings (non-command messages)
    if (m.body && !m.body.startsWith(config.PREFIX)) {
      // Check for photo submission
      if (await handlePhotoSubmission(m, sock)) return;
      
      // Check for rating submission
      if (await handleRatingSubmission(m, sock)) return;
    }
    
    // Handle commands
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const reply = async (text) => sock.sendMessage(from, { text }, { quoted: m });
    
    switch (command) {
      case 'mcm':
      case 'mancrush':
        if (args.length === 1) {
          await showMCMMenu(reply, config.PREFIX);
        } else {
          await handleMCMSubCommand(args[1], args.slice(2), { m, sock, config, senderId, from, reply });
        }
        break;
        
      case 'mcmstats':
      case 'mcmhistory':
        await handleMCMStats({ senderId, reply });
        break;
        
      case 'mcmtest':
      case 'testmcm':
        await handleMCMTest({ reply, config }, args.slice(1));
        break;
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
    case 'test':
      await handleMCMTest(context, args);
      break;
    case 'help':
      await showMCMMenu(context.reply, context.config.PREFIX);
      break;
    default:
      await context.reply(`❓ Unknown MCM command: *${subCommand}*\n\nUse *${context.config.PREFIX}mcm help* for available commands.`);
  }
}

// Export functions for external use
export { 
  checkAndRunMCMSchedule,
  setGroupJid,
  mcmSettings,
  initializeMCMScheduler
};
