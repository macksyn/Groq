// plugins/wcw_plugin_enhanced.js - Enhanced Woman Crush Wednesday Plugin
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import cron from 'node-cron';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Woman Crush Wednesday (WCW) - Enhanced',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Enhanced WCW with smart photo recognition and TV show experience. Only recognizes WCW/Rate captions and provides live glamour show atmosphere.',
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
      description: 'Test WCW caption and rating validation'
    }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
const COLLECTIONS = {
  WCW_RECORDS: 'wcw_records',
  WCW_SETTINGS: 'wcw_settings',
  WCW_SESSIONS: 'wcw_sessions',
  WCW_PARTICIPANTS: 'wcw_participants',
  WCW_RATINGS: 'wcw_ratings'
};

// Database connection
let db = null;
let mongoClient = null;

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default WCW settings
const defaultSettings = {
  startTime: '20:00', // 8 PM
  endTime: '22:00',   // 10 PM
  winnerReward: 12000, // ₦12,000 for winner (slightly higher than MCM)
  participationReward: 1000, // ₦1,000 for participation
  enableParticipationReward: true,
  reminderTimes: ['10:00', '16:00'], // Two reminders
  autoStartEnabled: true,
  adminNumbers: [],
  groupJids: [],
  tagAllMembers: true,
  maxPhotosPerUser: 1,
  validRatingRange: { min: 1, max: 10 },
  allowSelfRating: false,
  // New TV Show settings
  countdownDelay: 60000, // 1 minute delay before results
  resultDelay: 3000, // 3 seconds between result messages
  requireCaptionKeywords: true, // Only accept photos with WCW/Rate keywords
  captionKeywords: ['wcw', 'woman crush wednesday', 'rate me', 'rate', 'crush', 'wednesday', 'queen', 'beauty'] // Keywords to look for
};

let wcwSettings = { ...defaultSettings };

// Cron jobs storage
let cronJobs = {
  reminders: [],
  startSession: null,
  endSession: null
};

// Initialize MongoDB connection
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    // Create indexes for better performance
    await db.collection(COLLECTIONS.WCW_SESSIONS).createIndex({ date: 1, groupJid: 1 }, { unique: true });
    await db.collection(COLLECTIONS.WCW_PARTICIPANTS).createIndex({ sessionId: 1, userId: 1 });
    await db.collection(COLLECTIONS.WCW_RATINGS).createIndex({ sessionId: 1, raterId: 1, participantId: 1 });
    await db.collection(COLLECTIONS.WCW_RECORDS).createIndex({ date: -1 });
    
    console.log('✅ MongoDB connected successfully for Enhanced WCW');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed for Enhanced WCW:', error);
    throw error;
  }
}

async function loadSettings() {
  try {
    const settings = await db.collection(COLLECTIONS.WCW_SETTINGS).findOne({ type: 'wcw_config' });
    if (settings) {
      wcwSettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading WCW settings:', error);
  }
}

async function saveSettings() {
  try {
    await db.collection(COLLECTIONS.WCW_SETTINGS).replaceOne(
      { type: 'wcw_config' },
      { type: 'wcw_config', data: wcwSettings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving WCW settings:', error);
  }
}

function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

function isWednesday() {
  return getNigeriaTime().format('dddd').toLowerCase() === 'wednesday';
}

function getCurrentTime() {
  return getNigeriaTime().format('HH:mm');
}

// =======================================================================
// SMART PHOTO RECOGNITION SYSTEM
// =======================================================================

function hasValidWCWCaption(caption) {
  if (!wcwSettings.requireCaptionKeywords) return true;
  if (!caption || typeof caption !== 'string') return false;
  
  const lowerCaption = caption.toLowerCase();
  
  // Check if any of the required keywords are present
  return wcwSettings.captionKeywords.some(keyword => 
    lowerCaption.includes(keyword.toLowerCase())
  );
}

function extractCaptionFromMessage(m) {
  // Check various message types for caption
  if (m.message.imageMessage?.caption) {
    return m.message.imageMessage.caption;
  }
  
  if (m.message.extendedTextMessage?.text) {
    return m.message.extendedTextMessage.text;
  }
  
  if (m.body) {
    return m.body;
  }
  
  return '';
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
    
    const existingSession = await db.collection(COLLECTIONS.WCW_SESSIONS).findOne({
      date: today,
      groupJid: groupJid
    });
    
    if (existingSession) {
      console.log(`WCW session already exists for ${today}`);
      return existingSession;
    }
    
    const sessionData = {
      sessionId: sessionId,
      date: today,
      groupJid: groupJid,
      status: 'active', // active, ending, ended, cancelled
      startedAt: new Date(),
      endedAt: null,
      participants: [],
      totalRatings: 0,
      winnerDeclared: false,
      countdownStarted: false,
      resultsShown: false,
      createdAt: new Date()
    };
    
    await db.collection(COLLECTIONS.WCW_SESSIONS).insertOne(sessionData);
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
    return await db.collection(COLLECTIONS.WCW_SESSIONS).findOne({
      date: today,
      groupJid: groupJid,
      status: { $in: ['active', 'ending'] }
    });
  } catch (error) {
    console.error('Error getting current session:', error);
    return null;
  }
}

// =======================================================================
// ENHANCED PHOTO SUBMISSION HANDLING
// =======================================================================

async function handlePhotoSubmission(m, sock) {
  try {
    if (!isWednesday()) return false;
    
    const currentTime = getCurrentTime();
    const startTime = wcwSettings.startTime;
    const endTime = wcwSettings.endTime;
    
    // Check if WCW is active
    if (currentTime < startTime || currentTime >= endTime) return false;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const groupJid = m.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) return false;
    
    // Check if message contains image
    if (!m.message.imageMessage) return false;
    
    const session = await getCurrentSession(groupJid);
    if (!session || session.status !== 'active') return false;
    
    // Extract caption from message
    const caption = extractCaptionFromMessage(m);
    
    // Check if caption contains WCW-related keywords
    if (!hasValidWCWCaption(caption)) {
      console.log(`📸 Photo rejected - No WCW keywords in caption: "${caption}"`);
      return false; // Silently ignore photos without WCW keywords
    }
    
    // Check if user already submitted a photo
    const existingParticipant = await db.collection(COLLECTIONS.WCW_PARTICIPANTS).findOne({
      sessionId: session.sessionId,
      userId: senderId
    });
    
    if (existingParticipant) {
      // React with ❌ for duplicate submission
      await sock.sendMessage(groupJid, {
        react: { text: '❌', key: m.key }
      });
      
      await sock.sendMessage(groupJid, {
        text: `🚫 @${senderId.split('@')[0]} - You already submitted your WCW photo! Only your first photo counts.`,
        mentions: [senderId]
      }, { quoted: m });
      
      return true;
    }
    
    // Add participant with caption
    const participantData = {
      sessionId: session.sessionId,
      userId: senderId,
      userPhone: senderId.split('@')[0],
      messageKey: m.key,
      caption: caption,
      photoSubmittedAt: new Date(),
      ratings: [],
      totalRating: 0,
      averageRating: 0,
      ratingCount: 0
    };
    
    await db.collection(COLLECTIONS.WCW_PARTICIPANTS).insertOne(participantData);
    
    // Update session participants list
    await db.collection(COLLECTIONS.WCW_SESSIONS).updateOne(
      { sessionId: session.sessionId },
      { $push: { participants: senderId } }
    );
    
    // React with ✅ for successful submission
    await sock.sendMessage(groupJid, {
      react: { text: '✅', key: m.key }
    });
    
    // Send confirmation message
    await sock.sendMessage(groupJid, {
      text: `💃 @${senderId.split('@')[0]} has entered the WCW glamour show! ✨\n\nGentlemen, rate this beautiful lady from 1-10! ⭐`,
      mentions: [senderId]
    }, { quoted: m });
    
    // Initialize user in economy system and give participation reward
    await unifiedUserManager.initUser(senderId);
    if (wcwSettings.enableParticipationReward) {
      await unifiedUserManager.addMoney(senderId, wcwSettings.participationReward, 'WCW participation');
    }
    
    console.log(`📸 WCW photo accepted by ${senderId.split('@')[0]} with caption: "${caption}"`);
    return true;
    
  } catch (error) {
    console.error('Error handling photo submission:', error);
    return false;
  }
}

// =======================================================================
// ENHANCED RATING SYSTEM WITH EMOJI SUPPORT
// =======================================================================

function extractRating(text) {
  // First check for emoji numbers
  const emojiToNumber = {
    '1️⃣': 1,
    '2️⃣': 2, 
    '3️⃣': 3,
    '4️⃣': 4,
    '5️⃣': 5,
    '6️⃣': 6,
    '7️⃣': 7,
    '8️⃣': 8,
    '9️⃣': 9,
    '🔟': 10
  };
  
  // Check for emoji numbers first
  for (const [emoji, number] of Object.entries(emojiToNumber)) {
    if (text.includes(emoji)) {
      return number;
    }
  }
  
  // Fallback to regular numbers 1-10 in the message
  const numbers = text.match(/\b([1-9]|10)\b/g);
  if (!numbers) return null;
  
  // Get the first valid rating
  const rating = parseInt(numbers[0]);
  if (rating >= wcwSettings.validRatingRange.min && rating <= wcwSettings.validRatingRange.max) {
    return rating;
  }
  
  return null;
}

async function handleRatingSubmission(m, sock) {
  try {
    if (!isWednesday()) return false;
    
    const currentTime = getCurrentTime();
    const startTime = wcwSettings.startTime;
    const endTime = wcwSettings.endTime;
    
    // Check if WCW is active
    if (currentTime < startTime || currentTime >= endTime) return false;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const groupJid = m.key.remoteJid;
    
    if (!groupJid.endsWith('@g.us')) return false;
    if (!m.message.extendedTextMessage?.contextInfo?.quotedMessage) return false;
    
    // Check if quoted message has an image (WCW photo)
    if (!m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage) return false;
    
    const quotedKey = m.message.extendedTextMessage.contextInfo.stanzaId;
    const participantId = m.message.extendedTextMessage.contextInfo.participant;
    
    if (!participantId || !quotedKey) return false;
    
    const session = await getCurrentSession(groupJid);
    if (!session || session.status !== 'active') return false;
    
    // Check if quoted message is from a WCW participant
    const participant = await db.collection(COLLECTIONS.WCW_PARTICIPANTS).findOne({
      sessionId: session.sessionId,
      userId: participantId
    });
    
    if (!participant) return false;
    
    // Check for self-rating
    if (!wcwSettings.allowSelfRating && senderId === participantId) {
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
    const existingRating = await db.collection(COLLECTIONS.WCW_RATINGS).findOne({
      sessionId: session.sessionId,
      raterId: senderId,
      participantId: participantId
    });
    
    if (existingRating) {
      // Update existing rating
      await db.collection(COLLECTIONS.WCW_RATINGS).updateOne(
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
      
      await db.collection(COLLECTIONS.WCW_RATINGS).insertOne(ratingData);
    }
    
    // Update participant's rating stats
    await updateParticipantRatings(participant.sessionId, participantId);
    
    // React with ✅ for successful rating
    await sock.sendMessage(groupJid, {
      react: { text: '✅', key: m.key }
    });
    
    console.log(`⭐ WCW rating ${rating} given by ${senderId.split('@')[0]} to ${participantId.split('@')[0]}`);
    return true;
    
  } catch (error) {
    console.error('Error handling rating submission:', error);
    return false;
  }
}

async function updateParticipantRatings(sessionId, participantId) {
  try {
    // Calculate new rating statistics
    const ratings = await db.collection(COLLECTIONS.WCW_RATINGS).find({
      sessionId: sessionId,
      participantId: participantId
    }).toArray();
    
    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    const ratingCount = ratings.length;
    const averageRating = ratingCount > 0 ? (totalRating / ratingCount) : 0;
    
    // Update participant document
    await db.collection(COLLECTIONS.WCW_PARTICIPANTS).updateOne(
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
// TV SHOW EXPERIENCE - ENHANCED END SEQUENCE
// =======================================================================

async function startEndSequence(sock, groupJid) {
  try {
    const session = await getCurrentSession(groupJid);
    if (!session || session.countdownStarted) return false;
    
    // Mark countdown as started
    await db.collection(COLLECTIONS.WCW_SESSIONS).updateOne(
      { sessionId: session.sessionId },
      {
        $set: {
          status: 'ending',
          countdownStarted: true
        }
      }
    );
    
    // Send initial ending announcement
    const endMessage = `🚨 *WCW GLAMOUR SHOW TIME IS UP!* 🚨\n\n` +
                      `📺 *LIVE TV ANNOUNCEMENT* 📺\n\n` +
                      `💃 The beauty contest has officially ended!\n` +
                      `📊 Our panel of judges is counting all the ratings...\n` +
                      `⏰ Results will be revealed in 1 minute!\n\n` +
                      `✨ Stay tuned for the glamorous results! ✨\n` +
                      `#WCWResults #GlamourShow`;
    
    await sock.sendMessage(groupJid, {
      text: endMessage
    });
    
    // Wait for countdown delay (1 minute)
    setTimeout(async () => {
      await showLiveResults(sock, groupJid, session.sessionId);
    }, wcwSettings.countdownDelay);
    
    return true;
    
  } catch (error) {
    console.error('Error starting end sequence:', error);
    return false;
  }
}

async function showLiveResults(sock, groupJid, sessionId) {
  try {
    // Get all participants with their ratings
    const participants = await db.collection(COLLECTIONS.WCW_PARTICIPANTS).find({
      sessionId: sessionId
    }).sort({ averageRating: -1, totalRating: -1 }).toArray();
    
    if (participants.length === 0) {
      await sock.sendMessage(groupJid, {
        text: `💃 *WCW FINAL RESULTS* 💃\n\n❌ No contestants participated today!\n\nBetter luck next Wednesday! 💪\n\n#WCWResults`
      });
      
      await markSessionEnded(sessionId, null);
      return;
    }
    
    // Send "Counting Complete" message
    const countingMessage = `⚡ *VOTES COUNTED!* ⚡\n\n` +
                           `📊 All ratings have been tallied!\n` +
                           `🎯 Total contestants: ${participants.length}\n` +
                           `⭐ Total votes received: ${participants.reduce((sum, p) => sum + p.ratingCount, 0)}\n\n` +
                           `🥁 *Drumroll for our beautiful contestants...* 🥁`;
    
    await sock.sendMessage(groupJid, {
      text: countingMessage
    });
    
    // Wait before showing results
    setTimeout(async () => {
      await showDetailedResults(sock, groupJid, participants, sessionId);
    }, wcwSettings.resultDelay);
    
  } catch (error) {
    console.error('Error showing live results:', error);
  }
}

async function showDetailedResults(sock, groupJid, participants, sessionId) {
  try {
    // Build detailed results message
    let resultsMessage = `👑 *WCW FINAL STANDINGS - ${getCurrentDate()}* 👑\n\n`;
    resultsMessage += `💃 *LIVE GLAMOUR SHOW RESULTS* 💃\n\n`;
    resultsMessage += `📊 *OFFICIAL BEAUTY RANKINGS:*\n\n`;
    
    // List all participants with their ratings
    participants.forEach((participant, index) => {
      const position = index + 1;
      const emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      const avgRating = participant.averageRating > 0 ? participant.averageRating.toFixed(1) : '0.0';
      
      resultsMessage += `${emoji} *${position}. @${participant.userPhone}*\n`;
      resultsMessage += `   ⭐ Average: ${avgRating}/10\n`;
      resultsMessage += `   📊 Total Points: ${participant.totalRating}\n`;
      resultsMessage += `   👥 Votes: ${participant.ratingCount}\n\n`;
    });
    
    const mentions = participants.map(p => p.userId);
    
    await sock.sendMessage(groupJid, {
      text: resultsMessage,
      mentions: mentions
    });
    
    // Wait before queen announcement
    setTimeout(async () => {
      await announceQueen(sock, groupJid, participants, sessionId);
    }, wcwSettings.resultDelay * 2); // Longer delay for suspense
    
  } catch (error) {
    console.error('Error showing detailed results:', error);
  }
}

async function announceQueen(sock, groupJid, participants, sessionId) {
  try {
    const winner = participants[0];
    const hasValidRatings = winner && winner.ratingCount > 0;
    
    if (!hasValidRatings) {
      const noWinnerMessage = `🤷‍♀️ *NO QUEEN CROWNED TODAY* 🤷‍♀️\n\n` +
                             `❌ Unfortunately, no ratings were received today!\n` +
                             `📅 Better participation expected next Wednesday!\n\n` +
                             `💄 Keep shining, beautiful ladies! 💄\n` +
                             `#WCWNoQueen`;
      
      await sock.sendMessage(groupJid, {
        text: noWinnerMessage
      });
      
      await markSessionEnded(sessionId, null);
      return;
    }
    
    // Epic queen announcement
    const queenMessage = `🎉👑 *WCW QUEEN ANNOUNCEMENT* 👑🎉\n\n` +
                        `✨ *CONGRATULATIONS!* ✨\n\n` +
                        `👑 *OUR REIGNING QUEEN IS: @${winner.userPhone}* 👑\n\n` +
                        `⭐ Final Score: ${winner.averageRating.toFixed(1)}/10\n` +
                        `📊 Total Points: ${winner.totalRating}\n` +
                        `👥 Total Votes: ${winner.ratingCount}\n\n` +
                        `💰 *PRIZE WON: ₦${wcwSettings.winnerReward.toLocaleString()}* 💰\n\n` +
                        `💃 Absolutely stunning performance! 💃\n` +
                        `#WCWQueen #BeautyQueen`;
    
    await sock.sendMessage(groupJid, {
      text: queenMessage,
      mentions: [winner.userId]
    });
    
    // Wait then show queen's photo with special message
    setTimeout(async () => {
      await showQueenPhoto(sock, groupJid, winner);
    }, wcwSettings.resultDelay);
    
    // Award winner prize
    await unifiedUserManager.initUser(winner.userId);
    await unifiedUserManager.addMoney(winner.userId, wcwSettings.winnerReward, 'WCW Queen');
    
    // Save to records and mark session ended
    await saveSessionRecord(sessionId, participants, winner);
    await markSessionEnded(sessionId, winner);
    
  } catch (error) {
    console.error('Error announcing queen:', error);
  }
}

async function showQueenPhoto(sock, groupJid, winner) {
  try {
    const queenPhotoMessage = `📸 *BEHOLD OUR QUEEN'S WINNING PHOTO* 📸\n\n` +
                             `👑 @${winner.userPhone} - WCW Beauty Queen! 👑\n\n` +
                             `🎯 This is the stunning photo that won ₦${wcwSettings.winnerReward.toLocaleString()}!\n` +
                             `⭐ Rated ${winner.averageRating.toFixed(1)}/10 by our gentlemen!\n\n` +
                             `📅 *Next WCW: Wednesday 8:00 PM*\n` +
                             `💄 *Thank you all for the glamorous show!* 💄\n\n` +
                             `#WCWQueen #WinningPhoto #BeautyQueen`;
    
    // Try to resend the winner's photo
    if (winner.messageKey) {
      try {
        await sock.sendMessage(groupJid, {
          text: queenPhotoMessage,
          mentions: [winner.userId]
        });
      } catch (error) {
        console.error('Could not resend queen photo:', error);
      }
    }
    
  } catch (error) {
    console.error('Error showing queen photo:', error);
  }
}

async function saveSessionRecord(sessionId, participants, winner) {
  try {
    const recordData = {
      date: getCurrentDate(),
      sessionId: sessionId,
      totalParticipants: participants.length,
      winner: winner ? {
        userId: winner.userId,
        userPhone: winner.userPhone,
        averageRating: winner.averageRating,
        totalRating: winner.totalRating,
        ratingCount: winner.ratingCount,
        prizeAwarded: wcwSettings.winnerReward,
        caption: winner.caption || ''
      } : null,
      participants: participants,
      createdAt: new Date()
    };
    
    await db.collection(COLLECTIONS.WCW_RECORDS).insertOne(recordData);
    console.log('✅ WCW session record saved');
  } catch (error) {
    console.error('Error saving session record:', error);
  }
}

async function markSessionEnded(sessionId, winner) {
  try {
    await db.collection(COLLECTIONS.WCW_SESSIONS).updateOne(
      { sessionId: sessionId },
      {
        $set: {
          status: 'ended',
          endedAt: new Date(),
          winnerDeclared: true,
          resultsShown: true
        }
      }
    );
    console.log('✅ WCW session marked as ended');
  } catch (error) {
    console.error('Error marking session as ended:', error);
  }
}

// =======================================================================
// ENHANCED CRON SCHEDULING SYSTEM
// =======================================================================

async function setupWCWCronJobs(sock) {
  try {
    // Clear existing cron jobs
    stopAllCronJobs();
    
    // Setup reminder cron jobs for each reminder time
    wcwSettings.reminderTimes.forEach((reminderTime, index) => {
      const [hours, minutes] = reminderTime.split(':');
      
      // Every Wednesday at the specified time
      const cronPattern = `${minutes} ${hours} * * 3`; // 3 = Wednesday
      
      const cronJob = cron.schedule(cronPattern, async () => {
        console.log(`⏰ WCW Reminder ${index + 1} triggered at ${reminderTime}`);
        await sendWCWReminders(sock);
      }, {
        scheduled: false,
        timezone: 'Africa/Lagos'
      });
      
      cronJobs.reminders.push(cronJob);
      cronJob.start();
      
      console.log(`✅ WCW Reminder ${index + 1} scheduled for Wednesdays at ${reminderTime}`);
    });
    
    // Setup start session cron job
    if (wcwSettings.autoStartEnabled) {
      const [startHours, startMinutes] = wcwSettings.startTime.split(':');
      const startCronPattern = `${startMinutes} ${startHours} * * 3`; // Every Wednesday
      
      cronJobs.startSession = cron.schedule(startCronPattern, async () => {
        console.log(`💃 WCW Auto-start triggered at ${wcwSettings.startTime}`);
        
        for (const groupJid of wcwSettings.groupJids) {
          try {
            const existingSession = await getCurrentSession(groupJid);
            if (!existingSession) {
              await startWCWSession(sock, groupJid);
            }
          } catch (error) {
            console.error(`Error auto-starting WCW for ${groupJid}:`, error);
          }
        }
      }, {
        scheduled: false,
        timezone: 'Africa/Lagos'
      });
      
      cronJobs.startSession.start();
      console.log(`✅ WCW Auto-start scheduled for Wednesdays at ${wcwSettings.startTime}`);
    }
    
    // Setup end session cron job with TV show experience
    const [endHours, endMinutes] = wcwSettings.endTime.split(':');
    const endCronPattern = `${endMinutes} ${endHours} * * 3`; // Every Wednesday
    
    cronJobs.endSession = cron.schedule(endCronPattern, async () => {
      console.log(`🏁 WCW Auto-end triggered at ${wcwSettings.endTime}`);
      
      for (const groupJid of wcwSettings.groupJids) {
        try {
          const session = await getCurrentSession(groupJid);
          if (session && session.status === 'active' && !session.countdownStarted) {
            await startEndSequence(sock, groupJid);
          }
        } catch (error) {
          console.error(`Error auto-ending WCW for ${groupJid}:`, error);
        }
      }
    }, {
      scheduled: false,
      timezone: 'Africa/Lagos'
    });
    
    cronJobs.endSession.start();
    console.log(`✅ WCW Auto-end with TV show experience scheduled for Wednesdays at ${wcwSettings.endTime}`);
    
    console.log('🎯 All enhanced WCW cron jobs setup successfully');
    
  } catch (error) {
    console.error('Error setting up WCW cron jobs:', error);
  }
}

function stopAllCronJobs() {
  // Stop reminder cron jobs
  cronJobs.reminders.forEach(job => {
    if (job) {
      job.stop();
      job.destroy();
    }
  });
  cronJobs.reminders = [];
  
  // Stop start session cron job
  if (cronJobs.startSession) {
    cronJobs.startSession.stop();
    cronJobs.startSession.destroy();
    cronJobs.startSession = null;
  }
  
  // Stop end session cron job
  if (cronJobs.endSession) {
    cronJobs.endSession.stop();
    cronJobs.endSession.destroy();
    cronJobs.endSession = null;
  }
  
  console.log('🔄 All WCW cron jobs stopped');
}

// =======================================================================
// ENHANCED ANNOUNCEMENTS AND REMINDERS
// =======================================================================

function formatReminderMessage(timeUntil) {
  const messages = [
    `💃 *WCW ALERT!* 💃\n\n✨ Get ready ladies! Woman Crush Wednesday starts in ${timeUntil}! ✨\n\n📸 *How to Participate:*\n• Post your stunning photo with "WCW" or "Rate Me" caption\n• Gentlemen will rate you from 1-10\n• Queen gets ₦${wcwSettings.winnerReward.toLocaleString()}!\n\n⏰ *Starting at 8:00 PM sharp!*\n💡 *Remember: Caption must include WCW/Rate keywords!*\n\n#WCW #GistHQ #WomanCrushWednesday`,
    
    `⚡ *LADIES, IT'S ALMOST TIME!* ⚡\n\n🕰️ WCW glamour show starts in ${timeUntil}!\n\n🎬 *Tonight's Beauty Contest:*\n📸 Post photos with "WCW" caption\n🌟 Guys rate from 1-10\n👑 Queen takes ₦${wcwSettings.winnerReward.toLocaleString()}\n📺 Live results at 10 PM!\n\n🔑 *Caption Keywords Required:* WCW, Rate Me, Queen, Beauty\n#WCWCountdown`
  ];
  
  return messages[Math.floor(Math.random() * messages.length)];
}

function formatWCWStartMessage() {
  return `💃 *WOMAN CRUSH WEDNESDAY IS NOW LIVE!* 💃\n\n` +
         `🔴 *LIVE NOW - LIVE NOW - LIVE NOW* 🔴\n\n` +
         `👩‍💼 *LADIES:* Post your most stunning photo with WCW caption NOW!\n` +
         `👨‍💼 *GENTLEMEN:* Rate the beautiful ladies from 1-10!\n\n` +
         `📋 *IMPORTANT RULES:*\n` +
         `• Ladies: Photo must have "WCW", "Rate Me", or similar caption\n` +
         `• Gentlemen: Rate 1-10 only (quote the photo to rate)\n` +
         `• No self-rating allowed\n` +
         `• Only 1 photo per contestant\n\n` +
         `⏰ *Competition ends at 10:00 PM*\n` +
         `💰 *Queen takes home ₦${wcwSettings.winnerReward.toLocaleString()}*\n` +
         `🎁 *Participation reward: ₦${wcwSettings.participationReward.toLocaleString()}*\n\n` +
         `🔑 *Valid Caption Examples:*\n` +
         `• "Rate me for WCW! ✨"\n` +
         `• "Woman Crush Wednesday vibes 💃"\n` +
         `• "WCW queen contestant here!"\n` +
         `• "Beauty contest ready! 👑"\n\n` +
         `📺 *Live glamour show results at 10:00 PM!* 📺\n` +
         `💄 *Let the beauty contest begin!* 💄\n\n` +
         `#WCWLive #WomanCrushWednesday #GlamourShow`;
}

async function sendWCWReminders(sock) {
  try {
    if (!isWednesday()) return;
    
    const startTime = moment.tz(`${getCurrentDate()} ${wcwSettings.startTime}`, 'DD-MM-YYYY HH:mm', 'Africa/Lagos');
    const now = getNigeriaTime();
    
    // Only send reminder if WCW hasn't started yet
    if (now.isSameOrAfter(startTime)) return;
    
    const timeUntil = moment.duration(startTime.diff(now)).humanize();
    const reminderMessage = formatReminderMessage(timeUntil);
    
    for (const groupJid of wcwSettings.groupJids) {
      try {
        const members = await getGroupMembers(sock, groupJid);
        const mentions = members.map(m => m.id);
        
        await sock.sendMessage(groupJid, {
          text: reminderMessage,
          mentions: mentions
        });
        
        console.log(`✅ WCW reminder sent to ${groupJid}`);
      } catch (error) {
        console.error(`Error sending WCW reminder to ${groupJid}:`, error);
      }
    }
  } catch (error) {
    console.error('Error sending WCW reminders:', error);
  }
}

async function startWCWSession(sock, groupJid) {
  try {
    const session = await createWCWSession(groupJid);
    const startMessage = formatWCWStartMessage();
    
    const members = await getGroupMembers(sock, groupJid);
    const mentions = members.map(m => m.id);
    
    await sock.sendMessage(groupJid, {
      text: startMessage,
      mentions: mentions
    });
    
    console.log(`✅ WCW session started for ${groupJid}`);
    return session;
  } catch (error) {
    console.error('Error starting WCW session:', error);
    throw error;
  }
}

async function setGroupJid(groupJid) {
  if (!wcwSettings.groupJids.includes(groupJid)) {
    wcwSettings.groupJids.push(groupJid);
    await saveSettings();
    console.log(`📝 Group JID added for Enhanced WCW: ${groupJid}`);
  }
}

// =======================================================================
// ENHANCED COMMAND HANDLERS
// =======================================================================

async function showWCWMenu(reply, prefix) {
  const nextWCW = moment.tz('Africa/Lagos').startOf('week').add(1, 'week').add(3, 'days').format('dddd, MMMM DD, YYYY'); // Next Wednesday
  
  const menuText = `💃 *WOMAN CRUSH WEDNESDAY (WCW) - ENHANCED* 💃\n\n` +
                  `📊 *User Commands:*\n` +
                  `• *current* - View current WCW status\n` +
                  `• *stats* - View your WCW statistics\n` +
                  `• *history* - View WCW history\n` +
                  `• *leaderboard* - View all-time queens\n\n` +
                  `👑 *Admin Commands:*\n` +
                  `• *start* - Start WCW manually\n` +
                  `• *end* - Start end sequence manually\n` +
                  `• *settings* - System settings\n` +
                  `• *reschedule* - Update cron schedules\n\n` +
                  `⏰ *Enhanced Schedule (Node-Cron):*\n` +
                  `• Every Wednesday 8:00 PM - 10:00 PM\n` +
                  `• Smart photo recognition with keywords\n` +
                  `• TV glamour show style results at 10:00 PM\n` +
                  `• Auto-start and dramatic end sequence\n\n` +
                  `🔑 *New Features:*\n` +
                  `• Only accepts photos with WCW/Rate captions\n` +
                  `• Live TV glamour show experience\n` +
                  `• Enhanced queen announcement\n` +
                  `• Countdown and suspense elements\n` +
                  `• Emoji rating support (8️⃣, 🔟)\n\n` +
                  `💰 *Rewards:*\n` +
                  `• Queen: ₦${wcwSettings.winnerReward.toLocaleString()}\n` +
                  `• Participation: ₦${wcwSettings.participationReward.toLocaleString()}\n\n` +
                  `📅 *Next WCW: ${nextWCW} 8:00 PM*\n\n` +
                  `💡 *Usage:* ${prefix}wcw [command]`;
  
  await reply(menuText);
}

async function handleWCWStart(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can start WCW manually.');
  }
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ WCW can only be started in groups.');
  }
  
  try {
    const existingSession = await getCurrentSession(from);
    if (existingSession) {
      return reply('💃 WCW session is already active!');
    }
    
    await startWCWSession(sock, from);
    await reply('✅ *WCW glamour show started manually!*');
    
  } catch (error) {
    await reply('❌ *Error starting WCW session.*');
    console.error('WCW start error:', error);
  }
}

async function handleWCWEnd(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can trigger the end sequence manually.');
  }
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ WCW end sequence can only be triggered in groups.');
  }
  
  try {
    const session = await getCurrentSession(from);
    if (!session) {
      return reply('❌ *No active WCW session found.*');
    }
    
    if (session.status === 'ending' || session.countdownStarted) {
      return reply('🎬 *End sequence already in progress!*');
    }
    
    const success = await startEndSequence(sock, from);
    if (success) {
      await reply('✅ *WCW end sequence started! Check the group for the glamour show experience.*');
    } else {
      await reply('❌ *Error starting end sequence.*');
    }
    
  } catch (error) {
    await reply('❌ *Error triggering end sequence.*');
    console.error('WCW end error:', error);
  }
}

async function handleWCWCurrent(context) {
  const { reply, from } = context;
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ WCW status can only be checked in groups.');
  }
  
  try {
    const session = await getCurrentSession(from);
    
    if (!session) {
      const nextWCW = isWednesday() 
        ? `Today at ${wcwSettings.startTime}`
        : moment.tz('Africa/Lagos').startOf('week').add(1, 'week').add(3, 'days').format('dddd, MMMM DD') + ` at ${wcwSettings.startTime}`;
      
      return reply(`📅 *No active WCW session*\n\n💃 *Next WCW:* ${nextWCW}\n💰 *Queen Prize:* ₦${wcwSettings.winnerReward.toLocaleString()}\n\n🔑 *Remember:* Photos must have WCW/Rate captions!`);
    }
    
    const participants = await db.collection(COLLECTIONS.WCW_PARTICIPANTS).find({
      sessionId: session.sessionId
    }).sort({ averageRating: -1, totalRating: -1 }).toArray();
    
    const totalRatings = await db.collection(COLLECTIONS.WCW_RATINGS).countDocuments({
      sessionId: session.sessionId
    });
    
    let statusMessage = `💃 *WCW LIVE STATUS* 💃\n\n`;
    statusMessage += `📅 Date: ${session.date}\n`;
    statusMessage += `🎭 Status: ${session.status === 'active' ? '🔴 LIVE' : session.status === 'ending' ? '🎬 ENDING' : '✅ ENDED'}\n`;
    statusMessage += `🕐 Started: ${moment(session.startedAt).tz('Africa/Lagos').format('HH:mm')}\n`;
    statusMessage += `⏰ Ends: ${wcwSettings.endTime}\n\n`;
    statusMessage += `👥 Contestants: ${participants.length}\n`;
    statusMessage += `⭐ Total Ratings: ${totalRatings}\n\n`;
    
    if (participants.length > 0) {
      statusMessage += `📊 *Current Standings:*\n`;
      participants.slice(0, 5).forEach((participant, index) => {
        const position = index + 1;
        const emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
        const avgRating = participant.averageRating > 0 ? participant.averageRating.toFixed(1) : '0.0';
        
        statusMessage += `${emoji} ${position}. +${participant.userPhone} - ${avgRating}/10 (${participant.ratingCount} votes)\n`;
      });
      
      if (participants.length > 5) {
        statusMessage += `... and ${participants.length - 5} more contestants\n`;
      }
    } else {
      statusMessage += `❌ *No contestants yet!*\n`;
      statusMessage += `🔑 *Remember:* Photos must include WCW/Rate keywords in caption\n`;
    }
    
    statusMessage += `\n💰 *Queen gets ₦${wcwSettings.winnerReward.toLocaleString()}!*`;
    
    if (session.status === 'ending') {
      statusMessage += `\n\n🎬 *Glamour show ending sequence in progress! Stay tuned!* 🎬`;
    }
    
    await reply(statusMessage);
    
  } catch (error) {
    await reply('❌ *Error loading WCW status.*');
    console.error('WCW current error:', error);
  }
}

async function handleWCWStats(context) {
  const { reply, senderId } = context;
  
  try {
    // Get user's WCW history
    const userRecords = await db.collection(COLLECTIONS.WCW_RECORDS).find({
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
    
    let statsMessage = `📊 *YOUR WCW STATISTICS* 📊\n\n`;
    statsMessage += `💃 *Participation Record:*\n`;
    statsMessage += `• Total participations: ${participationCount}\n`;
    statsMessage += `• Queens crowned: ${winsCount} 👑\n`;
    statsMessage += `• Win rate: ${winRate}%\n\n`;
    statsMessage += `⭐ *Rating Statistics:*\n`;
    statsMessage += `• Total ratings received: ${totalRatingsReceived}\n`;
    statsMessage += `• Average rating: ${averageRating}/10\n`;
    statsMessage += `• Best rating: ${bestRating.toFixed(1)}/10\n\n`;
    statsMessage += `💰 *Financial:*\n`;
    statsMessage += `• Current balance: ₦${(userData.balance || 0).toLocaleString()}\n`;
    statsMessage += `• WCW winnings: ₦${(winsCount * wcwSettings.winnerReward).toLocaleString()}`;
    
    await reply(statsMessage);
    
  } catch (error) {
    await reply('❌ *Error loading your WCW statistics.*');
    console.error('WCW stats error:', error);
  }
}

async function handleWCWTest(context, args) {
  const { reply, config } = context;
  
  if (args.length === 0) {
    return reply(`🔍 *WCW VALIDATION TESTER* 🔍\n\n*Usage:*\n• ${config.PREFIX}wcwtest caption [your_caption]\n• ${config.PREFIX}wcwtest rating [your_rating]\n\n*Examples:*\n• ${config.PREFIX}wcwtest caption "Rate me for WCW! ✨"\n• ${config.PREFIX}wcwtest rating "9️⃣ gorgeous queen!"\n• ${config.PREFIX}wcwtest rating "She's a perfect 10"`);
  }
  
  const testType = args[0].toLowerCase();
  const testContent = args.slice(1).join(' ');
  
  try {
    if (testType === 'caption') {
      const isValid = hasValidWCWCaption(testContent);
      
      let result = `🔍 *CAPTION VALIDATION RESULTS* 🔍\n\n`;
      result += `📝 Test caption: "${testContent}"\n\n`;
      
      if (isValid) {
        result += `✅ *VALID WCW CAPTION!*\n`;
        result += `🎯 Status: Would be accepted for WCW\n`;
        result += `🔑 Keywords detected: ${wcwSettings.captionKeywords.filter(keyword => 
          testContent.toLowerCase().includes(keyword.toLowerCase())
        ).join(', ')}`;
      } else {
        result += `❌ *INVALID WCW CAPTION*\n`;
        result += `🎯 Status: Would be rejected\n\n`;
        result += `💡 *Required Keywords (any one):*\n`;
        result += wcwSettings.captionKeywords.map(keyword => `• "${keyword}"`).join('\n');
      }
      
      await reply(result);
      
    } else if (testType === 'rating') {
      const rating = extractRating(testContent);
      
      let result = `🔍 *RATING VALIDATION RESULTS* 🔍\n\n`;
      result += `📝 Test message: "${testContent}"\n\n`;
      
      if (rating) {
        result += `✅ *VALID RATING DETECTED!*\n`;
        result += `⭐ Rating: ${rating}/10\n`;
        result += `🎯 Status: Would be accepted ✅`;
      } else {
        result += `❌ *NO VALID RATING FOUND*\n`;
        result += `🎯 Status: Would be rejected ❌\n\n`;
        result += `💡 *Valid Rating Formats:*\n`;
        result += `• Regular numbers: "9", "10", "She's a perfect 8"\n`;
        result += `• Emoji numbers: "9️⃣", "🔟", "Beautiful 1️⃣0️⃣"\n`;
        result += `• Valid range: 1-10 only`;
      }
      
      await reply(result);
      
    } else {
      await reply(`❓ Unknown test type: *${testType}*\n\nAvailable: caption, rating`);
    }
    
  } catch (error) {
    await reply('❌ *Error testing WCW validation.*');
    console.error('WCW test error:', error);
  }
}

async function handleWCWSettings(context, args) {
  const { reply, senderId, sock, from, config } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can access WCW settings.');
  }
  
  try {
    if (args.length === 0) {
      let settingsMessage = `⚙️ *WCW SYSTEM SETTINGS* ⚙️\n\n`;
      settingsMessage += `🕐 *Schedule (Node-Cron):*\n`;
      settingsMessage += `• Start time: ${wcwSettings.startTime}\n`;
      settingsMessage += `• End time: ${wcwSettings.endTime}\n`;
      settingsMessage += `• Auto-start: ${wcwSettings.autoStartEnabled ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `• Reminder times: ${wcwSettings.reminderTimes.join(', ')}\n\n`;
      settingsMessage += `💰 *Rewards:*\n`;
      settingsMessage += `• Queen prize: ₦${wcwSettings.winnerReward.toLocaleString()}\n`;
      settingsMessage += `• Participation reward: ₦${wcwSettings.participationReward.toLocaleString()}\n`;
      settingsMessage += `• Participation rewards: ${wcwSettings.enableParticipationReward ? 'Enabled ✅' : 'Disabled ❌'}\n\n`;
      settingsMessage += `🔑 *Caption Recognition:*\n`;
      settingsMessage += `• Keywords required: ${wcwSettings.requireCaptionKeywords ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `• Keywords: ${wcwSettings.captionKeywords.join(', ')}\n\n`;
      settingsMessage += `🔧 *Available Commands:*\n`;
      settingsMessage += `• \`${config.PREFIX}wcw settings prize 15000\`\n`;
      settingsMessage += `• \`${config.PREFIX}wcw settings participation 1500\`\n`;
      settingsMessage += `• \`${config.PREFIX}wcw settings starttime 20:30\`\n`;
      settingsMessage += `• \`${config.PREFIX}wcw settings endtime 22:30\`\n`;
      settingsMessage += `• \`${config.PREFIX}wcw settings keywords on/off\`\n`;
      settingsMessage += `• \`${config.PREFIX}wcw reschedule\` (restart cron jobs)`;
      
      await reply(settingsMessage);
      return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args[1];
    let responseText = "";
    let needsReschedule = false;
    
    switch (setting) {
      case 'prize':
      case 'queen':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid amount. Use: ${config.PREFIX}wcw settings prize 15000`;
        } else {
          wcwSettings.winnerReward = parseInt(value);
          await saveSettings();
          responseText = `✅ Queen prize set to ₦${parseInt(value).toLocaleString()}`;
        }
        break;
        
      case 'participation':
      case 'participate':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid amount. Use: ${config.PREFIX}wcw settings participation 1500`;
        } else {
          wcwSettings.participationReward = parseInt(value);
          await saveSettings();
          responseText = `✅ Participation reward set to ₦${parseInt(value).toLocaleString()}`;
        }
        break;
        
      case 'starttime':
      case 'start':
        if (!value || !/^\d{2}:\d{2}$/.test(value)) {
          responseText = `⚠️ Invalid time format. Use: ${config.PREFIX}wcw settings starttime 20:30`;
        } else {
          wcwSettings.startTime = value;
          await saveSettings();
          needsReschedule = true;
          responseText = `✅ WCW start time set to ${value}. Cron jobs will be rescheduled.`;
        }
        break;
        
      case 'endtime':
      case 'end':
        if (!value || !/^\d{2}:\d{2}$/.test(value)) {
          responseText = `⚠️ Invalid time format. Use: ${config.PREFIX}wcw settings endtime 22:30`;
        } else {
          wcwSettings.endTime = value;
          await saveSettings();
          needsReschedule = true;
          responseText = `✅ WCW end time set to ${value}. Cron jobs will be rescheduled.`;
        }
        break;
        
      case 'keywords':
      case 'caption':
        if (['on', 'true', '1', 'enable'].includes(value?.toLowerCase())) {
          wcwSettings.requireCaptionKeywords = true;
          await saveSettings();
          responseText = "✅ Caption keyword requirement enabled 🔑";
        } else if (['off', 'false', '0', 'disable'].includes(value?.toLowerCase())) {
          wcwSettings.requireCaptionKeywords = false;
          await saveSettings();
          responseText = "✅ Caption keyword requirement disabled";
        } else {
          responseText = `⚠️ Invalid value. Use: on/off`;
        }
        break;
        
      default:
        responseText = `⚠️ Unknown setting: *${setting}*\n\nAvailable: prize, participation, starttime, endtime, keywords`;
    }
    
    await reply(responseText);
    
    // Reschedule cron jobs if needed
    if (needsReschedule && context.sock) {
      setTimeout(() => {
        setupWCWCronJobs(context.sock);
      }, 1000);
    }
    
  } catch (error) {
    await reply('❌ *Error updating WCW settings.*');
    console.error('WCW settings error:', error);
  }
}

async function handleWCWReschedule(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can reschedule WCW cron jobs.');
  }
  
  try {
    await setupWCWCronJobs(sock);
    await reply('✅ *WCW cron jobs rescheduled successfully!*\n\nAll reminder, start, and end schedules have been updated with current settings and TV show experience.');
  } catch (error) {
    await reply('❌ *Error rescheduling WCW cron jobs.*');
    console.error('WCW reschedule error:', error);
  }
}

// =======================================================================
// MAIN PLUGIN HANDLER
// =======================================================================

export default async function enhancedWcwHandler(m, sock, config) {
  try {
    // Initialize database and settings
    if (!db) {
      await initDatabase();
      await loadSettings();
      // Setup enhanced cron jobs with TV show experience
      await setupWCWCronJobs(sock);
    }
    
    // Register group for WCW if it's a group chat
    if (m.key.remoteJid.endsWith('@g.us')) {
      await setGroupJid(m.key.remoteJid);
    }
    
    // Handle photo submissions and ratings (non-command messages)
    if (m.body && !m.body.startsWith(config.PREFIX)) {
      // Check for photo submission with smart caption recognition
      if (await handlePhotoSubmission(m, sock)) return;
      
      // Check for rating submission with emoji support
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
      case 'wcw':
      case 'womancrush':
        if (args.length === 1) {
          await showWCWMenu(reply, config.PREFIX);
        } else {
          await handleWCWSubCommand(args[1], args.slice(2), { m, sock, config, senderId, from, reply });
        }
        break;
        
      case 'wcwstats':
      case 'wcwhistory':
        await handleWCWStats({ senderId, reply });
        break;
        
      case 'wcwtest':
      case 'testwcw':
        await handleWCWTest({ reply, config }, args.slice(1));
        break;
    }
    
  } catch (error) {
    console.error('❌ Enhanced WCW plugin error:', error);
  }
}

async function handleWCWSubCommand(subCommand, args, context) {
  switch (subCommand.toLowerCase()) {
    case 'start':
      await handleWCWStart(context);
      break;
    case 'end':
      await handleWCWEnd(context);
      break;
    case 'current':
    case 'status':
      await handleWCWCurrent(context);
      break;
    case 'stats':
      await handleWCWStats(context);
      break;
    case 'history':
      await handleWCWHistory(context, args);
      break;
    case 'leaderboard':
    case 'leaders':
      await handleWCWLeaderboard(context);
      break;
    case 'settings':
      await handleWCWSettings(context, args);
      break;
    case 'reschedule':
      await handleWCWReschedule(context);
      break;
    case 'test':
      await handleWCWTest(context, args);
      break;
    case 'help':
      await showWCWMenu(context.reply, context.config.PREFIX);
      break;
    default:
      await context.reply(`❓ Unknown WCW command: *${subCommand}*\n\nUse *${context.config.PREFIX}wcw help* for available commands.`);
  }
}

// Export functions for external use
export { 
  setupWCWCronJobs,
  stopAllCronJobs,
  setGroupJid,
  wcwSettings,
  hasValidWCWCaption,
  startEndSequence
};
