// plugins/mcm_plugin.js - Man Crush Monday Plugin (COMPLETE WITH RESTART RECOVERY)
import { unifiedUserManager, getDatabase, safeOperation } from '../lib/pluginIntegration.js';
import sharp from 'sharp';
import moment from 'moment-timezone';
import cron from 'node-cron';
import chalk from 'chalk';

// Plugin information for your pluginManager
export const info = {
  name: 'Man Crush Monday (MCM)',
  version: '2.4.0',
  author: 'System Rewrite (Complete with Restart Recovery)',
  description: 'Weekly Man Crush Monday contest with automated scheduling, rating system, rewards, and restart recovery.',
  commands: [
    { name: 'mcm', aliases: ['mancrush'], description: 'Access MCM system commands and settings' },
    { name: 'mcmstats', aliases: ['mcmhistory'], description: 'View MCM statistics and history' },
  ]
};

// --- CONFIGURATION & SETUP ---

const COLLECTIONS = {
  MCM_RECORDS: 'mcm_records',
  MCM_SETTINGS: 'mcm_settings',
  MCM_SESSIONS: 'mcm_sessions',
  MCM_PARTICIPANTS: 'mcm_participants',
  MCM_RATINGS: 'mcm_ratings'
};

const defaultSettings = {
  startTime: '20:00',
  endTime: '22:00',
  winnerReward: 12000,
  participationReward: 1000,
  enableParticipationReward: true,
  reminderTimes: ['10:00', '16:00'],
  autoStartEnabled: true,
  adminNumbers: ['2348089782988'],
  groupJids: [],
  tagAllMembers: true,
  maxPhotosPerUser: 1,
  validRatingRange: { min: 1, max: 10 },
  allowSelfRating: false
};

// Moved to the top to prevent initialization errors
let mcmSettings = { ...defaultSettings };

let cronJobs = {
  reminders: [],
  startSession: null,
  endSession: null
};

// Flag to ensure initialization only runs once.
let isInitialized = false;

moment.tz.setDefault('Africa/Lagos');

// --- UTILITY & DATABASE FUNCTIONS ---

function getNigeriaTime() { return moment.tz('Africa/Lagos'); }
function getCurrentDate() { return getNigeriaTime().format('DD-MM-YYYY'); }
function isMonday() { return getNigeriaTime().format('dddd').toLowerCase() === 'monday'; }

async function initDatabase() {
  try {
    await safeOperation(async (db) => {
      await Promise.all([
        db.collection(COLLECTIONS.MCM_SESSIONS).createIndex({ date: 1, groupJid: 1 }, { unique: true }),
        db.collection(COLLECTIONS.MCM_PARTICIPANTS).createIndex({ sessionId: 1, userId: 1 }),
        db.collection(COLLECTIONS.MCM_RATINGS).createIndex({ sessionId: 1, raterId: 1, participantId: 1 }),
        db.collection(COLLECTIONS.MCM_RECORDS).createIndex({ date: -1 })
      ]);
    });
    console.log(chalk.green('✅ MCM MongoDB indexes created successfully'));
  } catch (error) {
    console.error(chalk.red('❌ MCM MongoDB initialization failed:'), error);
    throw error;
  }
}

async function loadSettings() {
  try {
    await safeOperation(async (db) => {
      const settings = await db.collection(COLLECTIONS.MCM_SETTINGS).findOne({ type: 'mcm_config' });
      if (settings) {
        mcmSettings = { ...defaultSettings, ...settings.data };
      }
    });
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

// Database operation with retry mechanism
async function safeOperationWithRetry(operation, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await safeOperation(operation);
    } catch (error) {
      console.error(`Database operation failed (attempt ${i + 1}):`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
}

// --- AUTHORIZATION ---

async function isAuthorized(sock, from, sender, config) {
  try {
    // Check admin numbers first
    const senderNumber = sender.split('@')[0];
    if (mcmSettings.adminNumbers.includes(senderNumber)) return true;
    if (senderNumber === config.OWNER_NUMBER) return true;
    
    // Only check group admin if it's a group
    if (!from.endsWith('@g.us')) return false;

    // ✅ FIX: Add timeout and error handling for group metadata
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 5000)
    );
    
    const groupMetadata = await Promise.race([
      sock.groupMetadata(from),
      timeout
    ]);
    
    const groupAdmins = groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);
    
    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking authorization:', error);
    // ✅ FIX: Default to checking if user is in admin numbers only
    return mcmSettings.adminNumbers.includes(sender.split('@')[0]) || 
           sender.split('@')[0] === config.OWNER_NUMBER;
  }
}

// --- SESSION & RATING LOGIC ---

async function getCurrentSession(groupJid) {
  try {
    const today = getCurrentDate();
    return await safeOperation(db =>
      db.collection(COLLECTIONS.MCM_SESSIONS).findOne({
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

// ✅ FIXED: Rating extraction function - simplified and more reliable
function extractRating(text) {
  if (!text) return null;
  
  // ✅ FIX: Handle 10 emojis properly (check this first)
  if (text.includes('1️⃣0️⃣')) {
    return 10;
  }
  
  // ✅ Check for single digit emojis
  const emojiToNumber = { 
    '1️⃣': 1, '2️⃣': 2, '3️⃣': 3, '4️⃣': 4, '5️⃣': 5, 
    '6️⃣': 6, '7️⃣': 7, '8️⃣': 8, '9️⃣': 9, '🔟': 10 
  };
  
  for (const [emoji, number] of Object.entries(emojiToNumber)) {
    if (text.includes(emoji)) return number;
  }
  
  // ✅ FIX: Better regex for number extraction (handles 10 properly)
  const numbers = text.match(/\b(10|[1-9])\b/g);
  if (!numbers) return null;
  
  const rating = parseInt(numbers[0]);
  return (rating >= mcmSettings.validRatingRange.min && rating <= mcmSettings.validRatingRange.max) ? rating : null;
}

// --- SESSION RECOVERY FUNCTIONS ---

async function checkAndRecoverActiveSessions(sock) {
  try {
    if (!isMonday()) return;

    const today = getCurrentDate();
    const activeSessions = await safeOperation(db => 
      db.collection(COLLECTIONS.MCM_SESSIONS).find({
        date: today,
        status: 'active'
      }).toArray()
    );

    if (activeSessions.length === 0) {
      console.log(chalk.yellow('No active MCM sessions found to recover'));
      return;
    }

    const currentTime = getNigeriaTime();
    const endTime = moment.tz(`${today} ${mcmSettings.endTime}`, 'DD-MM-YYYY HH:mm', 'Africa/Lagos');

    for (const session of activeSessions) {
      console.log(chalk.blue(`🔄 Recovering MCM session: ${session.sessionId}`));
      
      // Check if session should have already ended
      if (currentTime.isAfter(endTime)) {
        console.log(chalk.orange(`⏰ Session ${session.sessionId} should have ended, ending now...`));
        await endMCMSession(sock, session.groupJid);
        continue;
      }

      // Notify groups that bot is back online
      try {
        await sock.sendMessage(session.groupJid, {
          text: `🤖 *Bot Reconnected!* 🤖\n\n` +
                `✅ Your MCM session is still ACTIVE!\n` +
                `⏰ Ends at: ${mcmSettings.endTime}\n` +
                `📸 Keep submitting photos and ratings!\n\n` +
                `*Session recovered successfully* 🔄`
        });
        
        console.log(chalk.green(`✅ Notified group ${session.groupJid} of session recovery`));
      } catch (error) {
        console.error(`Error notifying group ${session.groupJid}:`, error);
      }

      // Set up dynamic end job for this specific session
      setupDynamicEndJob(sock, session);
    }

    console.log(chalk.green(`✅ Recovered ${activeSessions.length} active MCM sessions`));
  } catch (error) {
    console.error(chalk.red('❌ Error recovering active sessions:'), error);
  }
}

function setupDynamicEndJob(sock, session) {
  try {
    const today = getCurrentDate();
    const endTime = moment.tz(`${today} ${mcmSettings.endTime}`, 'DD-MM-YYYY HH:mm', 'Africa/Lagos');
    const currentTime = getNigeriaTime();
    
    if (currentTime.isAfter(endTime)) {
      // Should have already ended
      endMCMSession(sock, session.groupJid).catch(console.error);
      return;
    }

    const timeUntilEnd = endTime.diff(currentTime);
    console.log(chalk.blue(`⏰ Setting dynamic end job for session ${session.sessionId} in ${moment.duration(timeUntilEnd).humanize()}`));

    setTimeout(() => {
      endMCMSession(sock, session.groupJid).catch(error => {
        console.error(`Error in dynamic end job for ${session.groupJid}:`, error);
      });
    }, timeUntilEnd);

  } catch (error) {
    console.error('Error setting up dynamic end job:', error);
  }
}

// --- MESSAGE HANDLERS ---

// ✅ FIXED: Photo submission validation
async function handlePhotoSubmission(m, sock) {
  try {
    const groupJid = m.from;
    const senderId = m.sender;
    
    if (!isMonday() || !groupJid.endsWith('@g.us')) {
      console.log(`Photo submission rejected: isMonday=${isMonday()}, isGroup=${groupJid.endsWith('@g.us')}`);
      return false;
    }

    const session = await getCurrentSession(groupJid);
    if (!session) {
      console.log('No active MCM session found');
      return false;
    }

    // ✅ FIX: The original logic was flawed - it required BOTH reply AND keyword
    const quotedMessageId = m.message?.imageMessage?.contextInfo?.stanzaId;
    const isReplyingToStartMessage = session.startMessageKey && quotedMessageId === session.startMessageKey.id;
    
    const caption = m.message?.imageMessage?.caption || '';
    const keywords = ['mcm', 'rate', 'crush', 'man', 'monday'];
    const hasKeyword = keywords.some(keyword => new RegExp(`\\b${keyword}\\b`, 'i').test(caption));

    // ✅ Should be OR condition, not AND
    if (!isReplyingToStartMessage && !hasKeyword) {
      console.log(`Photo not qualifying: reply=${isReplyingToStartMessage}, hasKeyword=${hasKeyword}, caption="${caption}"`);
      return false;
    }

    const existingParticipant = await safeOperation(db =>
      db.collection(COLLECTIONS.MCM_PARTICIPANTS).findOne({ 
        sessionId: session.sessionId, 
        userId: senderId 
      })
    );

    if (existingParticipant) {
      await m.react('❌');
      await sock.sendMessage(groupJid, { 
        text: `🚫 @${senderId.split('@')[0]} - You already submitted your photo!`, 
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

    // ✅ FIX: Better error handling for database operations
    const insertResult = await safeOperation(async (db) => {
      const result = await db.collection(COLLECTIONS.MCM_PARTICIPANTS).insertOne(participantData);
      await db.collection(COLLECTIONS.MCM_SESSIONS).updateOne(
        { sessionId: session.sessionId }, 
        { $push: { participants: senderId } }
      );
      return result;
    });

    if (!insertResult) {
      console.error('Failed to insert participant data');
      await m.react('❌');
      return false;
    }

    await m.react('✅');
    if (mcmSettings.enableParticipationReward) {
      try {
        await unifiedUserManager.addMoney(senderId, mcmSettings.participationReward, 'MCM participation');
      } catch (error) {
        console.error('Failed to add participation reward:', error);
        // Don't fail the submission just because reward failed
      }
    }
    
    console.log(chalk.green(`📸 MCM photo submitted by ${senderId.split('@')[0]}`));
    return true;

  } catch (error) {
    console.error('Error handling photo submission:', error);
    await m.react('❌');
    return false;
  }
}

// ✅ FIXED: Rating submission handler
async function handleRatingSubmission(m, sock) {
  try {
    const groupJid = m.from;
    const raterId = m.sender;
    
    // ✅ Add proper validation
    if (!m.quoted || !m.quoted.sender) {
      console.log('No quoted message or sender found for rating');
      return false;
    }
    
    const participantId = m.quoted.sender;

    if (!isMonday() || !groupJid.endsWith('@g.us') || !participantId) {
      console.log(`Rating conditions not met: isMonday=${isMonday()}, isGroup=${groupJid.endsWith('@g.us')}, hasParticipant=${!!participantId}`);
      return false;
    }

    const session = await getCurrentSession(groupJid);
    if (!session) {
      console.log('No active MCM session found for rating');
      return false;
    }

    const participant = await safeOperation(db => 
      db.collection(COLLECTIONS.MCM_PARTICIPANTS).findOne({ 
        sessionId: session.sessionId, 
        userId: participantId 
      })
    );
    
    if (!participant) {
      console.log(`Participant ${participantId.split('@')[0]} not found in current session`);
      return false;
    }

    if (!mcmSettings.allowSelfRating && raterId === participantId) {
      await m.react('🚫');
      console.log(`Self-rating blocked for ${raterId.split('@')[0]}`);
      return true;
    }

    const rating = extractRating(m.body || '');
    if (!rating) {
      console.log(`No valid rating found in message: "${m.body}"`);
      return false;
    }
    
    // ✅ Add better error handling for database operations
    const ratingResult = await safeOperation(async (db) => {
      const result = await db.collection(COLLECTIONS.MCM_RATINGS).updateOne(
        { sessionId: session.sessionId, raterId, participantId },
        { 
          $set: { 
            rating, 
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );
      return result;
    });

    if (!ratingResult) {
      console.error('Failed to save rating to database');
      await m.react('❌');
      return true;
    }

    // ✅ Await the rating update
    await updateParticipantRatings(session.sessionId, participantId);
    await m.react('✅');
    
    console.log(chalk.cyan(`⭐ MCM rating ${rating} by ${raterId.split('@')[0]} to ${participantId.split('@')[0]}`));
    return true;

  } catch (error) {
    console.error('Error handling rating submission:', error);
    await m.react('❌');
    return false;
  }
}

// ✅ FIXED: Rating update function with better error handling
async function updateParticipantRatings(sessionId, participantId) {
  try {
    await safeOperation(async (db) => {
      const ratings = await db.collection(COLLECTIONS.MCM_RATINGS)
        .find({ sessionId, participantId })
        .toArray();
      
      const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
      const ratingCount = ratings.length;
      const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;
      
      const updateResult = await db.collection(COLLECTIONS.MCM_PARTICIPANTS).updateOne(
        { sessionId, userId: participantId },
        { 
          $set: { 
            totalRating, 
            averageRating: Math.round(averageRating * 100) / 100, 
            ratingCount, 
            updatedAt: new Date() 
          } 
        }
      );
      
      console.log(`Updated ratings for ${participantId.split('@')[0]}: ${averageRating.toFixed(1)}/10 (${ratingCount} ratings)`);
      return updateResult;
    });
  } catch (error) {
    console.error('Error updating participant ratings:', error);
    throw error; // Re-throw so caller knows it failed
  }
}

// --- CORE EVENT WORKFLOW ---

async function startMCMSession(sock, groupJid) {
  try {
    // Check if session already exists (restart scenario)
    const existingSession = await getCurrentSession(groupJid);
    if (existingSession) {
      console.log(chalk.yellow(`Session already exists for ${groupJid}, skipping start`));
      return;
    }

    const startMessage = `💪 MAN CRUSH MONDAY IS NOW LIVE! 💪\n\n` +
         `🔴 LIVE NOW - LIVE NOW - LIVE NOW 🔴\n\n` +
         `*HOW TO PARTICIPATE:*\n` +
         `1. *REPLY TO THIS MESSAGE* with your best photo.\n` +
         `*OR*\n` +
         `2. Send a photo with a caption like "MCM", "Rate Me", or "My Crush".\n\n` +
         `👩‍💼 *LADIES:* Rate the gentlemen from 1-10!\n\n` +
         `⏰ Ends: ${mcmSettings.endTime}\n` +
         `💰 Winner: ₦${mcmSettings.winnerReward.toLocaleString()}\n` +
         `🎁 Participation: ₦${mcmSettings.participationReward.toLocaleString()}\n\n` +
         `💪 Let the competition begin! 💪\n#MCMLive`;

    const groupMetadata = await sock.groupMetadata(groupJid);
    const sentMessage = await sock.sendMessage(groupJid, { 
      text: startMessage, 
      mentions: groupMetadata.participants.map(p => p.id) 
    });

    const sessionData = { 
      sessionId: `mcm_${getCurrentDate()}_${groupJid}`, 
      date: getCurrentDate(), 
      groupJid, 
      status: 'active', 
      startedAt: new Date(), 
      startMessageKey: sentMessage.key,
      participants: [],
      botRestartRecoverable: true // Flag to help with recovery
    };

    await safeOperation(db => db.collection(COLLECTIONS.MCM_SESSIONS).insertOne(sessionData));
    console.log(chalk.green(`✅ MCM session started for ${groupJid}`));

    // Set up dynamic end job for this session
    setupDynamicEndJob(sock, { groupJid, sessionId: sessionData.sessionId });

  } catch (error) {
    console.error('Error starting MCM session:', error);
    throw error;
  }
}

async function endMCMSession(sock, groupJid) {
  const session = await getCurrentSession(groupJid);
  if (!session) return false;

  await sock.sendMessage(groupJid, { text: `⏰ MCM HAS OFFICIALLY ENDED! ⏰\n\n🔒 No more entries or ratings!\n\n📊 Counting votes...\n⏳ Results in 1 minute!\n🎭 The suspense is real! 🎭` });
  
  const participants = await safeOperation(db => db.collection(COLLECTIONS.MCM_PARTICIPANTS).find({ sessionId: session.sessionId }).toArray());
  participants.sort((a, b) => b.totalRating - a.totalRating || b.averageRating - a.averageRating);
  
  setTimeout(async () => {
    let resultsMessage = `🎭 MCM COMPETITION RESULTS 🎭\n\n✨ The scores are in! Here are today's final standings:\n\n`;
    participants.forEach((p, i) => {
      const emoji = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
      resultsMessage += `${emoji} ${i + 1}. @${p.userPhone}\n   ⭐ Avg: ${p.averageRating.toFixed(1)}/10 (${p.ratingCount} ratings)\n   📊 Total: ${p.totalRating}\n\n`;
    });
    await sock.sendMessage(groupJid, { text: resultsMessage, mentions: participants.map(p => p.userId) });

    setTimeout(async () => {
      const winner = participants.find(p => p.ratingCount > 0);
      if (winner) await declareWinner(sock, groupJid, winner);
      else await sock.sendMessage(groupJid, { text: `🤷‍♂️ No winner could be determined.` });
      
      setTimeout(() => sock.sendMessage(groupJid, { text: `💪 THANK YOU FOR AN AMAZING MCM! 💪\n\nSee you next Monday!\n#ManCrushMonday` }), 15000);
    }, 7000);
  }, 60000);

  await saveSessionRecord(session, participants);
  return true;
}

// ✅ FIXED: Winner declaration with better error handling
async function declareWinner(sock, groupJid, winner) {
  await unifiedUserManager.addMoney(winner.userId, mcmSettings.winnerReward, 'MCM Winner');
  
  let framedBuffer = null;
  try {
    // ✅ FIX: Better error handling for message loading
    if (winner.messageKey && winner.messageKey.remoteJid && winner.messageKey.id) {
      const quotedMsg = await sock.loadMessage(winner.messageKey.remoteJid, winner.messageKey.id);
      if (quotedMsg && quotedMsg.message?.imageMessage) {
        const stream = await sock.downloadMediaMessage(quotedMsg);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        framedBuffer = await frameWinnerPhoto(Buffer.concat(chunks));
      }
    }
  } catch (err) {
    console.error('Error processing winner photo:', err);
    // Continue without framed photo
  }
  
  const winnerMessage = `👑 AND THE CROWN GOES TO... 👑\n\n` +
                       `🎉 Congratulations @${winner.userPhone}! You are today's Man Crush King! 🎉\n\n` +
                       `💰 Prize: ₦${mcmSettings.winnerReward.toLocaleString()} 💰\n` +
                       `⭐ Total Points: ${winner.totalRating}\n` +
                       `📊 Average Rating: ${winner.averageRating.toFixed(1)}/10\n` +
                       `🗳️ Based on ${winner.ratingCount} ratings\n\n` +
                       `#MCMWinner #KingCrowned`;

  const messagePayload = framedBuffer 
    ? { image: framedBuffer, caption: winnerMessage, mentions: [winner.userId] }
    : { text: winnerMessage, mentions: [winner.userId] };
    
  await sock.sendMessage(groupJid, messagePayload);
}

async function frameWinnerPhoto(photoBuffer) {
  try {
    const size = 800, margin = 30;
    const base = await sharp(photoBuffer).resize(size - (margin * 2), size - (margin * 2), { fit: 'cover' }).toBuffer();
    const border = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 123, b: 255, alpha: 1 } } }).png().toBuffer();
    const composite = await sharp(border).composite([{ input: base, top: margin, left: margin }]).png().toBuffer();
    const svgText = `<svg width="${size}" height="${size}"><text x="50%" y="95%" font-size="42" font-family="Impact" fill="white" stroke="black" stroke-width="3" text-anchor="middle">🏆 MCM WINNER 🏆</text></svg>`;
    return await sharp(composite).composite([{ input: Buffer.from(svgText) }]).png().toBuffer();
  } catch (error) {
    console.error('Error framing photo:', error);
    return photoBuffer;
  }
}

async function saveSessionRecord(session, participants) {
    const winner = participants.find(p => p.ratingCount > 0);
    const recordData = { date: getCurrentDate(), groupJid: session.groupJid, sessionId: session.sessionId, totalParticipants: participants.length, winner: winner ? { userId: winner.userId, userPhone: winner.userPhone, averageRating: winner.averageRating, totalRating: winner.totalRating, ratingCount: winner.ratingCount, prizeAwarded: mcmSettings.winnerReward } : null, participants: participants.map(p => ({ userId: p.userId, totalRating: p.totalRating, ratingCount: p.ratingCount })) };
    await safeOperation(db => db.collection(COLLECTIONS.MCM_RECORDS).insertOne(recordData));
    await safeOperation(db => db.collection(COLLECTIONS.MCM_SESSIONS).updateOne({ sessionId: session.sessionId }, { $set: { status: 'ended', endedAt: new Date(), winnerDeclared: !!winner } }));
}

// --- SCHEDULING (CRON JOBS) ---

async function sendMCMReminders(sock) {
  if (!isMonday()) return;
  const startTime = moment.tz(`${getCurrentDate()} ${mcmSettings.startTime}`, 'DD-MM-YYYY HH:mm', 'Africa/Lagos');
  if (getNigeriaTime().isSameOrAfter(startTime)) return;
  const timeUntil = moment.duration(startTime.diff(getNigeriaTime())).humanize();
  const reminderMessage = `💪 MCM ALERT! 💪\n\n✨ Get ready! MCM starts in ${timeUntil}! ✨\n\n💰 Winner gets ₦${mcmSettings.winnerReward.toLocaleString()}!\n⏰ Starting at ${mcmSettings.startTime} sharp!`;
  for (const groupJid of mcmSettings.groupJids) {
    try {
      const groupMetadata = await sock.groupMetadata(groupJid);
      await sock.sendMessage(groupJid, { text: reminderMessage, mentions: groupMetadata.participants.map(p => p.id) });
      console.log(chalk.blue(`✅ MCM reminder sent to ${groupJid}`));
    } catch (error) { console.error(`Error sending MCM reminder to ${groupJid}:`, error); }
  }
}

// ✅ FIXED: Cron job setup with restart awareness
function setupMCMCronJobs(sock) {
  try {
    stopAllCronJobs();
    
    // ✅ FIX: Validate time format before creating cron jobs
    const validateTime = (timeString) => {
      const [h, m] = timeString.split(':');
      const hour = parseInt(h);
      const minute = parseInt(m);
      return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
    };
    
    if (!validateTime(mcmSettings.startTime) || !validateTime(mcmSettings.endTime)) {
      console.error('Invalid time format in MCM settings');
      return;
    }
    
    // Set up reminder jobs (Monday = 1 in cron)
    mcmSettings.reminderTimes.forEach(time => {
      if (validateTime(time)) {
        const [h, m] = time.split(':');
        cronJobs.reminders.push(cron.schedule(`${m} ${h} * * 1`, () => {
          sendMCMReminders(sock).catch(console.error);
        }, { timezone: 'Africa/Lagos' }));
      }
    });
    
    // 🔄 ENHANCED: Start session job with restart awareness
    const [startH, startM] = mcmSettings.startTime.split(':');
    cronJobs.startSession = cron.schedule(`${startM} ${startH} * * 1`, async () => {
      if (!mcmSettings.autoStartEnabled) return;
      
      // Check for existing active sessions before starting new ones
      for (const groupJid of mcmSettings.groupJids) {
        try {
          const existingSession = await getCurrentSession(groupJid);
          if (existingSession) {
            console.log(chalk.yellow(`Skipping start for ${groupJid} - session already active`));
            continue;
          }
          await startMCMSession(sock, groupJid);
        } catch (error) {
          console.error(`Error starting MCM session in ${groupJid}:`, error);
        }
      }
    }, { timezone: 'Africa/Lagos' });
    
    // 🔄 ENHANCED: End session job with better recovery
    const [endH, endM] = mcmSettings.endTime.split(':');
    cronJobs.endSession = cron.schedule(`${endM} ${endH} * * 1`, async () => {
      // End all active sessions for today
      const today = getCurrentDate();
      const activeSessions = await safeOperation(db => 
        db.collection(COLLECTIONS.MCM_SESSIONS).find({
          date: today,
          status: 'active'
        }).toArray()
      );

      for (const session of activeSessions) {
        try {
          await endMCMSession(sock, session.groupJid);
        } catch (error) {
          console.error(`Error ending MCM session in ${session.groupJid}:`, error);
        }
      }
    }, { timezone: 'Africa/Lagos' });
    
    console.log(chalk.green(`✅ MCM cron jobs scheduled. Session: ${mcmSettings.startTime}-${mcmSettings.endTime}.`));
  } catch (error) {
    console.error('Error setting up MCM cron jobs:', error);
  }
}

function stopAllCronJobs() {
  Object.values(cronJobs).flat().forEach(job => job?.destroy());
  cronJobs = { reminders: [], startSession: null, endSession: null };
}

// --- COMMAND HANDLERS ---

async function handleMCMCommand(m, sock, args, config) {
  const { from, sender } = m;
  if (args.length === 0) {
    const session = await getCurrentSession(from);
    let statusMessage = `💪 *Man Crush Monday System* 💪\n\n` + 
      `*Status:* ${session ? '🔴 Live' : '⚫ Offline'}\n` + 
      `*Schedule:* ${mcmSettings.startTime} - ${mcmSettings.endTime}\n\n` + 
      `Use *${config.PREFIX}mcmstats* to view history.\n` + 
      ((await isAuthorized(sock, from, sender, config)) ? `*Admin:* Use *${config.PREFIX}mcm help* for commands.` : '');
    return sock.sendMessage(from, { text: statusMessage });
  }
  
  if (!await isAuthorized(sock, from, sender, config)) {
    return m.reply('🚫 You are not authorized to use admin commands.');
  }
  
  const subCommand = args[0].toLowerCase();
  
  switch (subCommand) {
    case 'start':
      if (!isMonday()) return m.reply('📅 MCM can only be started on Mondays!');
      if (await getCurrentSession(from)) return m.reply('⚠️ A session is already active!');
      await startMCMSession(sock, from);
      break;
      
    case 'end':
      if (!await getCurrentSession(from)) return m.reply('⚠️ No active session to end.');
      await endMCMSession(sock, from);
      break;
      
    case 'recover':
      // 🔄 NEW: Manual recovery command
      await m.reply('🔄 Checking for active sessions to recover...');
      await checkAndRecoverActiveSessions(sock);
      await m.reply('✅ Session recovery check completed!');
      break;
      
    case 'status':
      // 🔄 NEW: Detailed status command
      const session = await getCurrentSession(from);
      if (!session) {
        return m.reply('📊 No active MCM session in this group.');
      }
      
      const participants = await safeOperation(db => 
        db.collection(COLLECTIONS.MCM_PARTICIPANTS)
          .find({ sessionId: session.sessionId })
          .toArray()
      );
      
      const totalRatings = await safeOperation(db => 
        db.collection(COLLECTIONS.MCM_RATINGS)
          .countDocuments({ sessionId: session.sessionId })
      );
      
      const statusMsg = `📊 *MCM Session Status*\n\n` +
        `🆔 Session: ${session.sessionId}\n` +
        `📅 Started: ${moment(session.startedAt).format('HH:mm')}\n` +
        `👥 Participants: ${participants.length}\n` +
        `⭐ Total Ratings: ${totalRatings}\n` +
        `⏰ Ends: ${mcmSettings.endTime}`;
      
      await m.reply(statusMsg);
      break;
      
    case 'addgroup':
      if (mcmSettings.groupJids.includes(from)) return m.reply('⚠️ This group is already in the MCM system!');
      mcmSettings.groupJids.push(from);
      await saveSettings();
      m.reply('✅ This group has been added to the MCM system!');
      break;
      
    case 'removegroup':
      mcmSettings.groupJids = mcmSettings.groupJids.filter(id => id !== from);
      await saveSettings();
      m.reply('✅ This group has been removed from the MCM system!');
      break;
      
    case 'setprize':
      const prize = parseInt(args[1]);
      if (isNaN(prize) || prize < 0) return m.reply('❌ Invalid amount.');
      mcmSettings.winnerReward = prize;
      await saveSettings();
      m.reply(`✅ Winner prize set to ₦${prize.toLocaleString()}!`);
      break;
      
    default:
      m.reply(`*MCM Admin Help*\n\n*Commands:*\n- start\n- end\n- recover\n- status\n- addgroup\n- removegroup\n- setprize <amount>`);
  }
}

async function handleMCMStatsCommand(m) {
  const from = m.from;
  const statsData = await safeOperation(db => db.collection(COLLECTIONS.MCM_RECORDS).find({ groupJid: from }).sort({ date: -1 }).limit(5).toArray());
  if (statsData.length === 0) return m.reply('📜 No MCM history found for this group yet.');
  let statsMessage = `📜 *Recent MCM History*\n\n`;
  statsData.forEach(session => {
    statsMessage += `*📅 Date:* ${session.date}\n` + `*👥 Participants:* ${session.totalParticipants}\n` + `*👑 Winner:* ${session.winner ? `@${session.winner.userPhone}` : 'None'}\n\n`;
  });
  await m.sock.sendMessage(from, { text: statsMessage, mentions: statsData.map(s => s.winner?.userId).filter(Boolean) });
}

// --- MAIN PLUGIN INITIALIZER AND HANDLER ---

async function initializePlugin(sock) {
    if (isInitialized) return;
    console.log(chalk.blue('🚀 Initializing MCM Plugin...'));
    try {
        await initDatabase();
        await loadSettings();
        
        // 🔄 NEW: Check for active sessions before setting up cron jobs
        await checkAndRecoverActiveSessions(sock);
        
        setupMCMCronJobs(sock);
        isInitialized = true;
        console.log(chalk.green('✅ MCM Plugin initialized successfully'));
    } catch (error) {
        console.error(chalk.red('❌ MCM Plugin initialization failed:'), error);
    }
}

// ✅ FIXED: Main handler with improved message flow
export default async function mcmPlugin(m, sock, config) {
  try {
    // One-time initialization on first message.
    if (!isInitialized) {
      await initializePlugin(sock);
    }

    // ✅ FIX: Handle non-command messages first (photos and ratings)
    if (!m.body?.startsWith(config.PREFIX)) {
      let handled = false;
      
      // Check for photo submissions
      if (m.message?.imageMessage) {
        handled = await handlePhotoSubmission(m, sock);
        if (handled) return; // Exit early if photo was processed
      }
      
      // Check for rating submissions (only if not a photo)
      if (!handled && m.quoted?.message?.imageMessage) {
        handled = await handleRatingSubmission(m, sock);
      }
      
      return; // Exit for all non-command messages
    }

    // Handle commands
    const args = m.body.slice(config.PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    
    const commandMap = {
      'mcm': (m, sock, args, config) => handleMCMCommand(m, sock, args, config),
      'mancrush': (m, sock, args, config) => handleMCMCommand(m, sock, args, config),
      'mcmstats': (m) => handleMCMStatsCommand(m),
      'mcmhistory': (m) => handleMCMStatsCommand(m),
    };
    
    if (commandMap[command]) {
      await commandMap[command](m, sock, args, config);
    }
  } catch (error) {
    console.error(chalk.red('❌ Error in MCM Plugin main handler:'), error);
  }
}