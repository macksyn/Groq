// plugins/mcm.js - Fresh Man Crush Monday Plugin
import { safeOperation, unifiedUserManager, PluginHelpers } from '../lib/pluginIntegration.js';
import moment from 'moment-timezone';
import chalk from 'chalk';

// Plugin metadata for plugin manager recognition
export const info = {
  name: 'Man Crush Monday (MCM)',
  version: '2.0.0',
  author: 'Fresh Implementation',
  description: 'Weekly Man Crush Monday contest where guys post pictures and ladies rate them from 1-10',
  category: 'entertainment',
  commands: [
    {
      name: 'mcm',
      aliases: ['mancrush'],
      description: 'Main MCM command hub'
    },
    {
      name: 'mcmstats',
      description: 'View MCM statistics'
    },
    {
      name: 'mcmleader',
      description: 'View MCM leaderboard'
    }
  ]
};

// Collections used by MCM
const COLLECTIONS = {
  SETTINGS: 'mcm_settings',
  SESSIONS: 'mcm_sessions', 
  PARTICIPANTS: 'mcm_participants',
  RATINGS: 'mcm_ratings',
  RECORDS: 'mcm_records'
};

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  autoStartEnabled: true,
  startTime: '20:00', // 8 PM
  endTime: '22:00',   // 10 PM
  winnerReward: 12000,
  participationReward: 1000,
  enableParticipationReward: true,
  reminderTimes: ['10:00', '16:00'],
  adminNumbers: [],
  groupJids: [],
  tagAllMembers: false,
  allowSelfRating: false,
  validRatingRange: { min: 1, max: 10 },
  maxPhotosPerUser: 1,
  timezone: 'Africa/Lagos'
};

let mcmSettings = { ...DEFAULT_SETTINGS };
let isInitialized = false;

// Store sock instance for scheduled tasks
let sockInstance = null;

// Nigeria timezone helper
moment.tz.setDefault('Africa/Lagos');

// =======================================================================
// CORE UTILITY FUNCTIONS
// =======================================================================

function getCurrentDate() {
  return moment().tz('Africa/Lagos').format('YYYY-MM-DD');
}

function isMonday() {
  return moment().tz('Africa/Lagos').day() === 1;
}

function getNigeriaTime() {
  return moment().tz('Africa/Lagos');
}

async function loadSettings() {
  try {
    const settings = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.SETTINGS).findOne({ type: 'mcm_config' })
    );
    
    if (settings) {
      mcmSettings = { ...DEFAULT_SETTINGS, ...settings.data };
      // Ensure admin numbers are strings
      mcmSettings.adminNumbers = mcmSettings.adminNumbers.map(num => String(num));
    }
    
    console.log(chalk.green('✅ MCM settings loaded'));
  } catch (error) {
    console.error(chalk.red('❌ Error loading MCM settings:'), error);
  }
}

async function saveSettings() {
  try {
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.SETTINGS).replaceOne(
        { type: 'mcm_config' },
        { type: 'mcm_config', data: mcmSettings, updatedAt: new Date() },
        { upsert: true }
      )
    );
    console.log(chalk.green('✅ MCM settings saved'));
  } catch (error) {
    console.error(chalk.red('❌ Error saving MCM settings:'), error);
  }
}

// =======================================================================
// AUTHORIZATION SYSTEM
// =======================================================================

async function isAuthorized(sock, from, sender) {
  try {
    const senderPhone = sender.split('@')[0];
    
    // Check configured admin numbers
    if (mcmSettings.adminNumbers.includes(senderPhone)) {
      console.log(chalk.cyan(`✅ MCM Admin: ${senderPhone}`));
      return true;
    }
    
    // Check owner from environment
    const ownerNumber = process.env.OWNER_NUMBER || '';
    if (senderPhone === ownerNumber) {
      console.log(chalk.cyan(`✅ MCM Owner: ${senderPhone}`));
      return true;
    }
    
    // Check group admins
    if (from.endsWith('@g.us')) {
      const groupMetadata = await sock.groupMetadata(from);
      const groupAdmins = groupMetadata.participants
        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
        .map(p => p.id);
      
      if (groupAdmins.includes(sender)) {
        console.log(chalk.cyan(`✅ MCM Group Admin: ${senderPhone}`));
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(chalk.red('❌ Authorization check failed:'), error);
    return false;
  }
}

// =======================================================================
// SESSION MANAGEMENT
// =======================================================================

async function createSession(groupJid) {
  try {
    const today = getCurrentDate();
    const sessionId = `mcm_${today}_${groupJid}`;
    
    const existingSession = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.SESSIONS).findOne({ date: today, groupJid, status: 'active' })
    );
    
    if (existingSession) {
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
      winnerDeclared: false
    };
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.SESSIONS).insertOne(sessionData)
    );
    
    console.log(chalk.green(`✅ MCM session created: ${sessionId}`));
    return sessionData;
  } catch (error) {
    console.error(chalk.red('❌ Error creating session:'), error);
    throw error;
  }
}

async function getCurrentSession(groupJid) {
  try {
    const today = getCurrentDate();
    return await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.SESSIONS).findOne({ 
        date: today, 
        groupJid, 
        status: 'active' 
      })
    );
  } catch (error) {
    console.error(chalk.red('❌ Error getting current session:'), error);
    return null;
  }
}

async function endSession(sock, groupJid) {
  try {
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    // Get all participants sorted by total rating
    const participants = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.PARTICIPANTS)
        .find({ sessionId: session.sessionId })
        .sort({ totalRating: -1, ratingCount: -1 })
        .toArray()
    );
    
    if (participants.length === 0) {
      await sock.sendMessage(groupJid, { 
        text: `🕺 *MCM SESSION ENDED* 🕺\n\n❌ No participants today!\n\nBetter luck next Monday! 💪` 
      });
      
      await safeOperation(async (db) => 
        await db.collection(COLLECTIONS.SESSIONS).updateOne(
          { sessionId: session.sessionId },
          { $set: { status: 'ended', endedAt: new Date(), winnerDeclared: true } }
        )
      );
      return true;
    }
    
    // Award participation rewards
    if (mcmSettings.enableParticipationReward) {
      for (const participant of participants) {
        await unifiedUserManager.addMoney(
          participant.userId, 
          mcmSettings.participationReward, 
          'MCM participation'
        );
      }
    }
    
    // Determine winners
    const maxRating = participants[0].totalRating;
    const winners = participants.filter(p => p.totalRating === maxRating && p.ratingCount > 0);
    
    // Announce results
    await announceResults(sock, groupJid, participants, winners, session);
    
    // Save to records
    await saveSessionRecord(session, participants, winners);
    
    // Mark session as ended
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.SESSIONS).updateOne(
        { sessionId: session.sessionId },
        { $set: { status: 'ended', endedAt: new Date(), winnerDeclared: true } }
      )
    );
    
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Error ending session:'), error);
    return false;
  }
}

// =======================================================================
// PHOTO AND RATING HANDLERS
// =======================================================================

async function handlePhotoSubmission(m, sock) {
  try {
    // Only on Mondays during MCM hours
    if (!isMonday()) return false;
    
    const now = getNigeriaTime();
    const startTime = moment(`${getCurrentDate()} ${mcmSettings.startTime}`, 'YYYY-MM-DD HH:mm');
    const endTime = moment(`${getCurrentDate()} ${mcmSettings.endTime}`, 'YYYY-MM-DD HH:mm');
    
    if (now.isBefore(startTime) || now.isSameOrAfter(endTime)) return false;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const groupJid = m.key.remoteJid;
    
    // Must be group message with image
    if (!groupJid.endsWith('@g.us') || !m.message.imageMessage) return false;
    
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    // Check for existing submission
    const existing = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.PARTICIPANTS).findOne({
        sessionId: session.sessionId,
        userId: senderId
      })
    );
    
    if (existing) {
      await sock.sendMessage(groupJid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(groupJid, {
        text: `🚫 @${senderId.split('@')[0]} - You already submitted your photo! Only one entry per person.`,
        mentions: [senderId]
      }, { quoted: m });
      return true;
    }
    
    // Create participant record
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
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.PARTICIPANTS).insertOne(participantData)
    );
    
    // Update session
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.SESSIONS).updateOne(
        { sessionId: session.sessionId },
        { $push: { participants: senderId } }
      )
    );
    
    // Initialize user in unified system
    await unifiedUserManager.initUser(senderId);
    
    // React with success
    await sock.sendMessage(groupJid, { react: { text: '✅', key: m.key } });
    
    console.log(chalk.green(`📸 MCM photo submitted by ${senderId.split('@')[0]}`));
    return true;
    
  } catch (error) {
    console.error(chalk.red('❌ Error handling photo:'), error);
    return false;
  }
}

async function handleRatingSubmission(m, sock) {
  try {
    // Only on Mondays during MCM hours
    if (!isMonday()) return false;
    
    const now = getNigeriaTime();
    const startTime = moment(`${getCurrentDate()} ${mcmSettings.startTime}`, 'YYYY-MM-DD HH:mm');
    const endTime = moment(`${getCurrentDate()} ${mcmSettings.endTime}`, 'YYYY-MM-DD HH:mm');
    
    if (now.isBefore(startTime) || now.isSameOrAfter(endTime)) return false;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const groupJid = m.key.remoteJid;
    
    // Must be group message quoting an image
    if (!groupJid.endsWith('@g.us') || 
        !m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
      return false;
    }
    
    const participantId = m.message.extendedTextMessage.contextInfo.participant;
    if (!participantId) return false;
    
    const session = await getCurrentSession(groupJid);
    if (!session) return false;
    
    // Check if participant exists
    const participant = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.PARTICIPANTS).findOne({
        sessionId: session.sessionId,
        userId: participantId
      })
    );
    
    if (!participant) return false;
    
    // Check self-rating
    if (!mcmSettings.allowSelfRating && senderId === participantId) {
      await sock.sendMessage(groupJid, { react: { text: '🚫', key: m.key } });
      await sock.sendMessage(groupJid, {
        text: `🚫 @${senderId.split('@')[0]} - Self-rating is not allowed!`,
        mentions: [senderId]
      }, { quoted: m });
      return true;
    }
    
    // Extract rating from message
    const rating = extractRating(m.body || '');
    
    if (!rating) {
      // Check if message looks like rating attempt
      if (hasRatingAttempt(m.body || '')) {
        await sock.sendMessage(groupJid, { react: { text: '❌', key: m.key } });
        await sock.sendMessage(groupJid, {
          text: `❌ @${senderId.split('@')[0]} - Invalid rating! Use 1-10 (e.g., "8", "🔟").`,
          mentions: [senderId]
        }, { quoted: m });
        return true;
      }
      return false;
    }
    
    // Save or update rating
    const existingRating = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.RATINGS).findOne({
        sessionId: session.sessionId,
        raterId: senderId,
        participantId: participantId
      })
    );
    
    if (existingRating) {
      await safeOperation(async (db) => 
        await db.collection(COLLECTIONS.RATINGS).updateOne(
          { _id: existingRating._id },
          { $set: { rating, updatedAt: new Date() } }
        )
      );
    } else {
      await safeOperation(async (db) => 
        await db.collection(COLLECTIONS.RATINGS).insertOne({
          sessionId: session.sessionId,
          raterId: senderId,
          raterPhone: senderId.split('@')[0],
          participantId: participantId,
          participantPhone: participantId.split('@')[0],
          rating,
          createdAt: new Date()
        })
      );
    }
    
    // Update participant ratings
    await updateParticipantRatings(session.sessionId, participantId);
    
    // React with success
    await sock.sendMessage(groupJid, { react: { text: '✅', key: m.key } });
    
    console.log(chalk.green(`⭐ MCM rating ${rating}/10 from ${senderId.split('@')[0]} to ${participantId.split('@')[0]}`));
    return true;
    
  } catch (error) {
    console.error(chalk.red('❌ Error handling rating:'), error);
    return false;
  }
}

function extractRating(text) {
  // Handle special emoji combinations
  if (text.includes('1️⃣0️⃣')) return 10;
  
  // Emoji to number mapping
  const emojiMap = {
    '🔟': 10, '9️⃣': 9, '8️⃣': 8, '7️⃣': 7, '6️⃣': 6,
    '5️⃣': 5, '4️⃣': 4, '3️⃣': 3, '2️⃣': 2, '1️⃣': 1
  };
  
  // Check for emoji ratings
  for (const [emoji, value] of Object.entries(emojiMap)) {
    if (text.includes(emoji)) return value;
  }
  
  // Extract numbers from text
  const numbers = text.match(/\b([1-9]|10)\b/g);
  if (!numbers) return null;
  
  const rating = parseInt(numbers[numbers.length - 1]);
  return (rating >= 1 && rating <= 10) ? rating : null;
}

function hasRatingAttempt(text) {
  return /\b([1-9]|10)\b/.test(text) || 
         /[🔟9️⃣8️⃣7️⃣6️⃣5️⃣4️⃣3️⃣2️⃣1️⃣]/.test(text) ||
         text.includes('1️⃣0️⃣');
}

async function updateParticipantRatings(sessionId, participantId) {
  try {
    const ratings = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.RATINGS)
        .find({ sessionId, participantId })
        .toArray()
    );
    
    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    const ratingCount = ratings.length;
    const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.PARTICIPANTS).updateOne(
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
    console.error(chalk.red('❌ Error updating ratings:'), error);
  }
}

// =======================================================================
// ANNOUNCEMENT SYSTEM
// =======================================================================

async function sendReminders() {
  try {
    if (!sockInstance || !isMonday() || !mcmSettings.enabled) return;
    
    const now = getNigeriaTime();
    const startTime = moment(`${getCurrentDate()} ${mcmSettings.startTime}`, 'YYYY-MM-DD HH:mm');
    
    if (now.isSameOrAfter(startTime)) return;
    
    const timeUntil = moment.duration(startTime.diff(now)).humanize();
    const message = `🔥 *MCM COUNTDOWN!* 🔥\n\nGet ready for MAN CRUSH MONDAY in ${timeUntil}!\n\n👑 Guys: Prepare your best photos!\n👀 Ladies: Get ready to rate!\n\n💰 Winner: ₦${mcmSettings.winnerReward.toLocaleString()}\n🎉 Participation: ₦${mcmSettings.participationReward.toLocaleString()}\n\nStarting at 8:00 PM sharp! ⏰`;
    
    for (const groupJid of mcmSettings.groupJids) {
      try {
        await sockInstance.sendMessage(groupJid, { text: message });
        console.log(chalk.cyan(`📢 Reminder sent to ${groupJid}`));
      } catch (error) {
        console.error(chalk.red(`❌ Failed to send reminder to ${groupJid}:`), error);
      }
    }
  } catch (error) {
    console.error(chalk.red('❌ Error sending reminders:'), error);
  }
}

async function autoStartSessions() {
  try {
    if (!sockInstance || !isMonday() || !mcmSettings.enabled || !mcmSettings.autoStartEnabled) return;
    
    console.log(chalk.blue('🎬 Auto-starting MCM sessions...'));
    
    for (const groupJid of mcmSettings.groupJids) {
      try {
        const existing = await getCurrentSession(groupJid);
        if (!existing) {
          await startSession(sockInstance, groupJid);
        }
      } catch (error) {
        console.error(chalk.red(`❌ Failed to auto-start ${groupJid}:`), error);
      }
    }
  } catch (error) {
    console.error(chalk.red('❌ Error in auto-start:'), error);
  }
}

async function autoEndSessions() {
  try {
    if (!sockInstance || !isMonday() || !mcmSettings.enabled) return;
    
    console.log(chalk.blue('🏁 Auto-ending MCM sessions...'));
    
    for (const groupJid of mcmSettings.groupJids) {
      try {
        await endSession(sockInstance, groupJid);
      } catch (error) {
        console.error(chalk.red(`❌ Failed to auto-end ${groupJid}:`), error);
      }
    }
  } catch (error) {
    console.error(chalk.red('❌ Error in auto-end:'), error);
  }
}

async function startSession(sock, groupJid) {
  try {
    const session = await createSession(groupJid);
    
    const startMessage = `🚨 *MCM IS LIVE!* 🚨\n\nWelcome to MAN CRUSH MONDAY! 🕺💥\n\n🤵 *Guys:* Drop your best photo NOW!\n👩‍⚖️ *Ladies:* Rate from 1-10!\n\n⏰ Ends at 10:00 PM\n💰 Winner: ₦${mcmSettings.winnerReward.toLocaleString()}\n🎉 Participation: ₦${mcmSettings.participationReward.toLocaleString()}\n\n📋 *Rules:*\n• One photo per person\n• Rate by replying to photos with 1-10\n• Self-rating: ${mcmSettings.allowSelfRating ? 'Allowed' : 'Not allowed'}\n\nLet the contest begin! 🌟`;
    
    await sock.sendMessage(groupJid, { text: startMessage });
    
    console.log(chalk.green(`✅ MCM started for ${groupJid}`));
    return session;
  } catch (error) {
    console.error(chalk.red('❌ Error starting session:'), error);
    throw error;
  }
}

async function announceResults(sock, groupJid, participants, winners, session) {
  try {
    // Results announcement
    let resultsMsg = `📣 *MCM RESULTS - ${getCurrentDate()}* 📣\n\n📊 *Final Standings:*\n\n`;
    
    participants.forEach((p, i) => {
      const pos = i + 1;
      const emoji = pos === 1 ? '👑' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏅';
      const avg = p.averageRating > 0 ? p.averageRating.toFixed(1) : '0.0';
      resultsMsg += `${emoji} #${pos} @${p.userPhone}\n   ⭐ ${p.totalRating} pts (${p.ratingCount} votes, avg ${avg}/10)\n\n`;
    });
    
    await sock.sendMessage(groupJid, { 
      text: resultsMsg,
      mentions: participants.map(p => p.userId)
    });
    
    // Winner announcement
    if (winners.length > 0) {
      const prizePerWinner = mcmSettings.winnerReward / winners.length;
      
      let winnerMsg = `🎉 *CONGRATULATIONS!* 🎉\n\n`;
      if (winners.length > 1) {
        winnerMsg += `👑 *Tied Champions:*\n`;
        winners.forEach(w => {
          winnerMsg += `• @${w.userPhone} - ${w.totalRating} points! 🌟\n`;
        });
        winnerMsg += `\nEach winner gets ₦${prizePerWinner.toLocaleString()}! 🏆`;
      } else {
        winnerMsg += `👑 *MCM Champion: @${winners[0].userPhone}!*\n\n🏆 Prize: ₦${mcmSettings.winnerReward.toLocaleString()}`;
      }
      
      await sock.sendMessage(groupJid, {
        text: winnerMsg,
        mentions: winners.map(w => w.userId)
      });
      
      // Award prizes
      for (const winner of winners) {
        await unifiedUserManager.addMoney(winner.userId, prizePerWinner, 'MCM winner prize');
      }
    } else {
      await sock.sendMessage(groupJid, { 
        text: `😔 *No winner today* - No ratings received!\n\nBetter luck next Monday! 🌟` 
      });
    }
    
    // Thank you message
    await sock.sendMessage(groupJid, { 
      text: `🙌 *Thank you all!* 🙌\n\nSee you next Monday at 8:00 PM for more MCM action! ✨\n#MCM #SeeYouNextWeek` 
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Error announcing results:'), error);
  }
}

async function saveSessionRecord(session, participants, winners) {
  try {
    const record = {
      date: getCurrentDate(),
      groupJid: session.groupJid,
      sessionId: session.sessionId,
      totalParticipants: participants.length,
      totalRatings: participants.reduce((sum, p) => sum + p.ratingCount, 0),
      winners: winners.map(w => ({
        userId: w.userId,
        userPhone: w.userPhone,
        totalRating: w.totalRating,
        averageRating: w.averageRating,
        ratingCount: w.ratingCount,
        prizeAwarded: mcmSettings.winnerReward / winners.length
      })),
      participants: participants.map(p => ({
        userId: p.userId,
        userPhone: p.userPhone,
        totalRating: p.totalRating,
        averageRating: p.averageRating,
        ratingCount: p.ratingCount
      })),
      createdAt: new Date()
    };
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.RECORDS).insertOne(record)
    );
    
    console.log(chalk.green(`✅ MCM record saved: ${record.sessionId}`));
  } catch (error) {
    console.error(chalk.red('❌ Error saving record:'), error);
  }
}

// =======================================================================
// COMMAND HANDLERS
// =======================================================================

async function handleMCMCommand(m, sock, config) {
  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args.shift().toLowerCase();
  const subCommand = args[0]?.toLowerCase();
  
  const senderId = m.key.participant || m.key.remoteJid;
  const from = m.key.remoteJid;
  const reply = (text) => sock.sendMessage(from, { text }, { quoted: m });
  
  const context = { m, sock, config, senderId, from, reply, args: args.slice(1) };
  
  switch (command) {
    case 'mcm':
    case 'mancrush':
      if (!subCommand) {
        return await showMCMMenu(context);
      }
      return await handleSubCommand(subCommand, context);
      
    case 'mcmstats':
      return await handleStats(context);
      
    case 'mcmleader':
      return await handleLeaderboard(context);
      
    default:
      return false;
  }
}

async function showMCMMenu(context) {
  const { reply, config } = context;
  const nextMCM = moment().day(1).isBefore(moment()) 
    ? moment().day(1).add(1, 'week').format('dddd, MMMM DD, YYYY')
    : moment().day(1).format('dddd, MMMM DD, YYYY');
  
  const menu = `🕺 *MAN CRUSH MONDAY* 🕺\n\n` +
    `📊 *Commands:*\n` +
    `• ${config.PREFIX}mcm current - Current status\n` +
    `• ${config.PREFIX}mcm stats - Your statistics\n` +
    `• ${config.PREFIX}mcm history - Recent history\n` +
    `• ${config.PREFIX}mcmleader - Hall of fame\n\n` +
    `👑 *Admin:*\n` +
    `• ${config.PREFIX}mcm start - Start MCM\n` +
    `• ${config.PREFIX}mcm end - End MCM\n` +
    `• ${config.PREFIX}mcm addgroup - Add group\n` +
    `• ${config.PREFIX}mcm settings - Configure\n\n` +
    `⏰ *Schedule:* Mondays 8PM-10PM\n` +
    `💰 *Winner:* ₦${mcmSettings.winnerReward.toLocaleString()}\n` +
    `🎉 *Participation:* ₦${mcmSettings.participationReward.toLocaleString()}\n\n` +
    `📅 *Next MCM:* ${nextMCM}`;
    
  await reply(menu);
}

async function handleSubCommand(subCommand, context) {
  switch (subCommand) {
    case 'current': case 'status': return await handleCurrent(context);
    case 'start': return await handleStart(context);
    case 'end': return await handleEnd(context);
    case 'cancel': return await handleCancel(context);
    case 'stats': return await handleStats(context);
    case 'history': return await handleHistory(context);
    case 'addgroup': return await handleAddGroup(context);
    case 'removegroup': return await handleRemoveGroup(context);
    case 'settings': return await handleSettings(context);
    case 'addadmin': return await handleAddAdmin(context);
    case 'removeadmin': return await handleRemoveAdmin(context);
    case 'help': return await showMCMMenu(context);
    default:
      await context.reply(`❓ Unknown command: *${subCommand}*\n\nUse *${context.config.PREFIX}mcm help* for available commands.`);
  }
}

async function handleCurrent(context) {
  const { reply, from } = context;
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ MCM status is only available in groups.');
  }
  
  try {
    const session = await getCurrentSession(from);
    
    if (!session) {
      const nextMCM = isMonday() 
        ? `Today at ${mcmSettings.startTime}` 
        : moment().day(1).add(1, 'week').format('dddd, MMMM DD') + ` at ${mcmSettings.startTime}`;
      
      return reply(`📅 *No Active MCM*\n\n🕺 *Next:* ${nextMCM}\n💰 *Winner Prize:* ₦${mcmSettings.winnerReward.toLocaleString()}\n🎉 *Participation:* ₦${mcmSettings.participationReward.toLocaleString()}`);
    }
    
    // Get session statistics
    const participants = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.PARTICIPANTS)
        .find({ sessionId: session.sessionId })
        .sort({ totalRating: -1, ratingCount: -1 })
        .toArray()
    );
    
    const totalRatings = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.RATINGS).countDocuments({ sessionId: session.sessionId })
    );
    
    let statusMsg = `🕺 *MCM LIVE STATUS* 🕺\n\n`;
    statusMsg += `📅 Date: ${session.date}\n`;
    statusMsg += `🕐 Started: ${moment(session.startedAt).format('HH:mm')}\n`;
    statusMsg += `⏰ Ends: ${mcmSettings.endTime}\n\n`;
    statusMsg += `👥 Participants: ${participants.length}\n`;
    statusMsg += `⭐ Total Ratings: ${totalRatings}\n\n`;
    
    if (participants.length > 0) {
      statusMsg += `📊 *Current Standings:*\n`;
      participants.slice(0, 5).forEach((p, i) => {
        const pos = i + 1;
        const emoji = pos === 1 ? '👑' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏅';
        const avg = p.averageRating > 0 ? p.averageRating.toFixed(1) : '0.0';
        statusMsg += `${emoji} ${pos}. +${p.userPhone} - ${p.totalRating} pts (${p.ratingCount} votes, avg ${avg}/10)\n`;
      });
      if (participants.length > 5) {
        statusMsg += `... and ${participants.length - 5} more participants\n`;
      }
    } else {
      statusMsg += `❌ *No participants yet!*\n`;
    }
    
    statusMsg += `\n💰 *Winner gets ₦${mcmSettings.winnerReward.toLocaleString()}!*`;
    
    await reply(statusMsg);
  } catch (error) {
    console.error(chalk.red('❌ Error handling current:'), error);
    await reply('❌ Error loading current status.');
  }
}

async function handleStart(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can start MCM manually.');
  }
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ MCM can only be started in groups.');
  }
  
  try {
    const existing = await getCurrentSession(from);
    if (existing) {
      return reply('🕺 MCM is already active in this group!');
    }
    
    await startSession(sock, from);
    await reply('✅ MCM started manually! Let the contest begin!');
  } catch (error) {
    console.error(chalk.red('❌ Error starting MCM:'), error);
    await reply('❌ Error starting MCM. Please try again.');
  }
}

async function handleEnd(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can end MCM manually.');
  }
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ MCM can only be ended in groups.');
  }
  
  try {
    const success = await endSession(sock, from);
    if (success) {
      await reply('✅ MCM session ended and results announced!');
    } else {
      await reply('❌ No active MCM session to end.');
    }
  } catch (error) {
    console.error(chalk.red('❌ Error ending MCM:'), error);
    await reply('❌ Error ending MCM. Please try again.');
  }
}

async function handleCancel(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can cancel MCM.');
  }
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ MCM can only be cancelled in groups.');
  }
  
  try {
    const session = await getCurrentSession(from);
    if (!session) {
      return reply('❌ No active MCM session to cancel.');
    }
    
    await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.SESSIONS).updateOne(
        { sessionId: session.sessionId },
        { $set: { status: 'cancelled', endedAt: new Date() } }
      )
    );
    
    await sock.sendMessage(from, { 
      text: '❌ MCM session has been cancelled by admin.' 
    });
    
    await reply('✅ MCM session cancelled successfully.');
  } catch (error) {
    console.error(chalk.red('❌ Error cancelling MCM:'), error);
    await reply('❌ Error cancelling MCM. Please try again.');
  }
}

async function handleStats(context) {
  const { reply, senderId } = context;
  
  try {
    // Get user participation stats
    const participationStats = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.RECORDS).aggregate([
        { $unwind: '$participants' },
        { $match: { 'participants.userId': senderId } },
        { $group: {
          _id: null,
          participationCount: { $sum: 1 },
          totalRatingsReceived: { $sum: '$participants.ratingCount' },
          totalPoints: { $sum: '$participants.totalRating' },
          bestRating: { $max: '$participants.averageRating' }
        }}
      ]).toArray()
    );
    
    // Get win stats
    const winStats = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.RECORDS).aggregate([
        { $unwind: '$winners' },
        { $match: { 'winners.userId': senderId } },
        { $group: {
          _id: null,
          winsCount: { $sum: 1 },
          totalEarnings: { $sum: '$winners.prizeAwarded' }
        }}
      ]).toArray()
    );
    
    const participation = participationStats[0] || {};
    const wins = winStats[0] || {};
    
    const {
      participationCount = 0,
      totalRatingsReceived = 0,
      totalPoints = 0,
      bestRating = 0
    } = participation;
    
    const { winsCount = 0, totalEarnings = 0 } = wins;
    
    const averageRating = totalRatingsReceived > 0 ? (totalPoints / totalRatingsReceived).toFixed(1) : '0.0';
    const winRate = participationCount > 0 ? ((winsCount / participationCount) * 100).toFixed(1) : '0.0';
    
    // Get current balance
    const userData = await unifiedUserManager.getUserData(senderId);
    
    const statsMsg = `📊 *YOUR MCM STATISTICS* 📊\n\n` +
      `🕺 *Participation:*\n` +
      `• Total Contests: ${participationCount}\n` +
      `• Wins: ${winsCount} 👑\n` +
      `• Win Rate: ${winRate}%\n\n` +
      `⭐ *Performance:*\n` +
      `• Ratings Received: ${totalRatingsReceived}\n` +
      `• Average Rating: ${averageRating}/10\n` +
      `• Best Rating: ${bestRating.toFixed(1)}/10\n\n` +
      `💰 *Earnings:*\n` +
      `• Current Balance: ₦${(userData.balance || 0).toLocaleString()}\n` +
      `• MCM Winnings: ₦${totalEarnings.toLocaleString()}\n` +
      `• Participation Rewards: ₦${(participationCount * mcmSettings.participationReward).toLocaleString()}`;
    
    await reply(statsMsg);
  } catch (error) {
    console.error(chalk.red('❌ Error handling stats:'), error);
    await reply('❌ Error loading statistics. Please try again.');
  }
}

async function handleHistory(context) {
  const { reply, args } = context;
  
  try {
    const limit = args[0] ? Math.min(parseInt(args[0]), 10) : 5;
    
    const records = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.RECORDS)
        .find({})
        .sort({ date: -1 })
        .limit(limit)
        .toArray()
    );
    
    if (records.length === 0) {
      return reply('📅 *No MCM history found.*');
    }
    
    let historyMsg = `📚 *MCM HISTORY (Last ${records.length})* 📚\n\n`;
    
    records.forEach((record, i) => {
      historyMsg += `${i + 1}. 📅 ${record.date}\n`;
      
      if (record.winners && record.winners.length > 0) {
        historyMsg += `   👑 Winners:\n`;
        record.winners.forEach(w => {
          historyMsg += `     • +${w.userPhone} (${w.totalRating} pts)\n`;
        });
        historyMsg += `   💰 Prize: ₦${record.winners[0].prizeAwarded.toLocaleString()} each\n`;
      } else {
        historyMsg += `   🤷‍♂️ No winner declared\n`;
      }
      
      historyMsg += `   👥 Participants: ${record.totalParticipants}\n`;
      historyMsg += `   ⭐ Total Ratings: ${record.totalRatings}\n\n`;
    });
    
    historyMsg += `💡 Use *mcm history [number]* to see more records`;
    
    await reply(historyMsg);
  } catch (error) {
    console.error(chalk.red('❌ Error handling history:'), error);
    await reply('❌ Error loading history. Please try again.');
  }
}

async function handleLeaderboard(context) {
  const { reply } = context;
  
  try {
    const leaders = await safeOperation(async (db) => 
      await db.collection(COLLECTIONS.RECORDS).aggregate([
        { $unwind: '$winners' },
        { $group: {
          _id: '$winners.userId',
          userPhone: { $first: '$winners.userPhone' },
          wins: { $sum: 1 },
          totalEarnings: { $sum: '$winners.prizeAwarded' },
          bestRating: { $max: '$winners.averageRating' },
          totalRatings: { $sum: '$winners.ratingCount' },
          averagePoints: { $avg: '$winners.totalRating' }
        }},
        { $sort: { wins: -1, bestRating: -1 } },
        { $limit: 10 }
      ]).toArray()
    );
    
    if (leaders.length === 0) {
      return reply('🏆 *No MCM winners yet!*\n\nBe the first champion! 💪');
    }
    
    let leaderboardMsg = `🏆 *MCM HALL OF FAME* 🏆\n\n👑 *Top 10 Champions:*\n\n`;
    
    leaders.forEach((leader, i) => {
      const pos = i + 1;
      const emoji = pos === 1 ? '👑' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏅';
      
      leaderboardMsg += `${emoji} ${pos}. +${leader.userPhone}\n`;
      leaderboardMsg += `   🏆 Wins: ${leader.wins}\n`;
      leaderboardMsg += `   ⭐ Best Rating: ${leader.bestRating.toFixed(1)}/10\n`;
      leaderboardMsg += `   💰 Total Earned: ₦${leader.totalEarnings.toLocaleString()}\n`;
      leaderboardMsg += `   📊 Avg Points: ${Math.round(leader.averagePoints)}\n\n`;
    });
    
    leaderboardMsg += `🕺 *Think you can make it to the top?*\nNext MCM: Every Monday 8:00 PM!`;
    
    await reply(leaderboardMsg);
  } catch (error) {
    console.error(chalk.red('❌ Error handling leaderboard:'), error);
    await reply('❌ Error loading leaderboard. Please try again.');
  }
}

async function handleAddGroup(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can add groups to MCM.');
  }
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ This command can only be used in groups.');
  }
  
  if (mcmSettings.groupJids.includes(from)) {
    return reply('✅ This group is already registered for MCM.');
  }
  
  mcmSettings.groupJids.push(from);
  await saveSettings();
  
  await reply('✅ Group successfully added to MCM!\n\nMCM will now run automatically every Monday at 8:00 PM in this group.');
}

async function handleRemoveGroup(context) {
  const { reply, senderId, sock, from } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can remove groups from MCM.');
  }
  
  if (!from.endsWith('@g.us')) {
    return reply('❌ This command can only be used in groups.');
  }
  
  const index = mcmSettings.groupJids.indexOf(from);
  if (index === -1) {
    return reply('❌ This group is not registered for MCM.');
  }
  
  mcmSettings.groupJids.splice(index, 1);
  await saveSettings();
  
  await reply('✅ Group removed from MCM.\n\nMCM will no longer run automatically in this group.');
}

async function handleSettings(context) {
  const { reply, senderId, sock, from, args, config } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can access MCM settings.');
  }
  
  if (args.length === 0) {
    const settingsMsg = `⚙️ *MCM SETTINGS* ⚙️\n\n` +
      `🕐 *Schedule:*\n` +
      `• Start Time: ${mcmSettings.startTime}\n` +
      `• End Time: ${mcmSettings.endTime}\n` +
      `• Auto Start: ${mcmSettings.autoStartEnabled ? '✅' : '❌'}\n` +
      `• Reminders: ${mcmSettings.reminderTimes.join(', ')}\n\n` +
      `💰 *Rewards:*\n` +
      `• Winner Prize: ₦${mcmSettings.winnerReward.toLocaleString()}\n` +
      `• Participation: ₦${mcmSettings.participationReward.toLocaleString()}\n` +
      `• Participation Enabled: ${mcmSettings.enableParticipationReward ? '✅' : '❌'}\n\n` +
      `🔧 *Rules:*\n` +
      `• Self Rating: ${mcmSettings.allowSelfRating ? '✅' : '❌'}\n` +
      `• Tag All Members: ${mcmSettings.tagAllMembers ? '✅' : '❌'}\n` +
      `• Enabled: ${mcmSettings.enabled ? '✅' : '❌'}\n\n` +
      `📊 *Status:*\n` +
      `• Admin Numbers: ${mcmSettings.adminNumbers.length}\n` +
      `• Registered Groups: ${mcmSettings.groupJids.length}\n\n` +
      `📝 *Commands:*\n` +
      `• ${config.PREFIX}mcm settings prize 15000\n` +
      `• ${config.PREFIX}mcm settings participation 2000\n` +
      `• ${config.PREFIX}mcm settings starttime 20:30\n` +
      `• ${config.PREFIX}mcm settings endtime 22:30\n` +
      `• ${config.PREFIX}mcm settings autostart on/off\n` +
      `• ${config.PREFIX}mcm settings enable on/off`;
    
    return reply(settingsMsg);
  }
  
  const setting = args[0].toLowerCase();
  const value = args[1];
  
  try {
    switch (setting) {
      case 'prize':
      case 'winner':
        const prize = parseInt(value);
        if (isNaN(prize) || prize < 0) {
          return reply(`⚠️ Invalid amount. Use: ${config.PREFIX}mcm settings prize 15000`);
        }
        mcmSettings.winnerReward = prize;
        await saveSettings();
        return reply(`✅ Winner prize updated to ₦${prize.toLocaleString()}`);
        
      case 'participation':
        const partReward = parseInt(value);
        if (isNaN(partReward) || partReward < 0) {
          return reply(`⚠️ Invalid amount. Use: ${config.PREFIX}mcm settings participation 2000`);
        }
        mcmSettings.participationReward = partReward;
        await saveSettings();
        return reply(`✅ Participation reward updated to ₦${partReward.toLocaleString()}`);
        
      case 'starttime':
        if (!/^\d{2}:\d{2}$/.test(value)) {
          return reply(`⚠️ Invalid time format. Use: ${config.PREFIX}mcm settings starttime 20:30`);
        }
        mcmSettings.startTime = value;
        await saveSettings();
        return reply(`✅ Start time updated to ${value}`);
        
      case 'endtime':
        if (!/^\d{2}:\d{2}$/.test(value)) {
          return reply(`⚠️ Invalid time format. Use: ${config.PREFIX}mcm settings endtime 22:30`);
        }
        mcmSettings.endTime = value;
        await saveSettings();
        return reply(`✅ End time updated to ${value}`);
        
      case 'autostart':
        const autostart = ['on', 'true', 'enable', 'yes'].includes(value?.toLowerCase());
        mcmSettings.autoStartEnabled = autostart;
        await saveSettings();
        return reply(`✅ Auto-start ${autostart ? 'enabled' : 'disabled'}`);
        
      case 'enable':
        const enabled = ['on', 'true', 'enable', 'yes'].includes(value?.toLowerCase());
        mcmSettings.enabled = enabled;
        await saveSettings();
        return reply(`✅ MCM ${enabled ? 'enabled' : 'disabled'}`);
        
      case 'selfrating':
        const selfRating = ['on', 'true', 'enable', 'yes'].includes(value?.toLowerCase());
        mcmSettings.allowSelfRating = selfRating;
        await saveSettings();
        return reply(`✅ Self-rating ${selfRating ? 'enabled' : 'disabled'}`);
        
      case 'tagall':
        const tagAll = ['on', 'true', 'enable', 'yes'].includes(value?.toLowerCase());
        mcmSettings.tagAllMembers = tagAll;
        await saveSettings();
        return reply(`✅ Tag all members ${tagAll ? 'enabled' : 'disabled'}`);
        
      case 'parreward':
        const parEnabled = ['on', 'true', 'enable', 'yes'].includes(value?.toLowerCase());
        mcmSettings.enableParticipationReward = parEnabled;
        await saveSettings();
        return reply(`✅ Participation rewards ${parEnabled ? 'enabled' : 'disabled'}`);
        
      default:
        return reply(`⚠️ Unknown setting: ${setting}\n\nAvailable: prize, participation, starttime, endtime, autostart, enable, selfrating, tagall, parreward`);
    }
  } catch (error) {
    console.error(chalk.red('❌ Error updating settings:'), error);
    await reply('❌ Error updating settings. Please try again.');
  }
}

async function handleAddAdmin(context) {
  const { reply, senderId, sock, from, args } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can add other admins.');
  }
  
  const number = args[0]?.replace(/\D/g, '');
  if (!number) {
    return reply('⚠️ Please provide a phone number.\n\nUsage: mcm addadmin 2348123456789');
  }
  
  if (mcmSettings.adminNumbers.includes(number)) {
    return reply('✅ This number is already an MCM admin.');
  }
  
  mcmSettings.adminNumbers.push(number);
  await saveSettings();
  
  await reply(`✅ Admin added successfully: ${number}\n\nThey can now manage MCM in all groups.`);
}

async function handleRemoveAdmin(context) {
  const { reply, senderId, sock, from, args } = context;
  
  if (!await isAuthorized(sock, from, senderId)) {
    return reply('🚫 Only admins can remove other admins.');
  }
  
  const number = args[0]?.replace(/\D/g, '');
  if (!number) {
    return reply('⚠️ Please provide a phone number.\n\nUsage: mcm removeadmin 2348123456789');
  }
  
  const index = mcmSettings.adminNumbers.indexOf(number);
  if (index === -1) {
    return reply('❌ This number is not an MCM admin.');
  }
  
  mcmSettings.adminNumbers.splice(index, 1);
  await saveSettings();
  
  await reply(`✅ Admin removed successfully: ${number}`);
}

// =======================================================================
// MAIN PLUGIN HANDLER 
// =======================================================================

export default async function mcmPlugin(m, sock, config) {
  try {
    // Handle non-command messages (photo submissions and ratings)
    if (!m.body || !m.body.startsWith(config.PREFIX)) {
      // Try to handle photo submission
      if (await handlePhotoSubmission(m, sock)) return;
      
      // Try to handle rating submission  
      if (await handleRatingSubmission(m, sock)) return;
      
      return;
    }
    
    // Handle command messages
    const success = await handleMCMCommand(m, sock, config);
    if (!success) return;
    
  } catch (error) {
    console.error(chalk.red('❌ MCM Plugin Error:'), error.message);
  }
}

// =======================================================================
// PLUGIN INITIALIZATION - Called by Plugin Manager
// =======================================================================

export async function init(sock) {
  try {
    console.log(chalk.blue('🔄 Initializing MCM Plugin...'));
    
    // Store sock instance for scheduled tasks
    sockInstance = sock;
    
    // Load settings from database
    await loadSettings();
    
    // Mark as initialized
    isInitialized = true;
    
    console.log(chalk.green('✅ MCM Plugin initialized successfully'));
    console.log(chalk.cyan(`📊 Settings: ${mcmSettings.groupJids.length} groups, ${mcmSettings.adminNumbers.length} admins`));
    console.log(chalk.cyan(`⏰ Schedule: ${mcmSettings.startTime}-${mcmSettings.endTime} on Mondays`));
    
    // Register with plugin communicator if available
    try {
      const { pluginCommunicator } = await import('../lib/pluginIntegration.js');
      pluginCommunicator.registerPlugin('mcm', {
        name: 'Man Crush Monday',
        version: info.version,
        status: mcmSettings.enabled ? 'active' : 'disabled',
        groups: mcmSettings.groupJids.length,
        admins: mcmSettings.adminNumbers.length
      });
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Could not register with plugin communicator'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ MCM Plugin initialization failed:'), error);
    throw error;
  }
}

// =======================================================================
// SCHEDULED TASK HANDLERS - For Plugin Manager
// =======================================================================

export const scheduledTasks = {
  // Send reminders at 10 AM and 4 PM on Mondays
  reminder1: {
    name: 'mcm_reminder_morning',
    description: 'Send morning MCM reminder',
    schedule: '0 10 * * 1', // 10:00 AM every Monday
    timezone: 'Africa/Lagos',
    handler: sendReminders
  },
  
  reminder2: {
    name: 'mcm_reminder_afternoon', 
    description: 'Send afternoon MCM reminder',
    schedule: '0 16 * * 1', // 4:00 PM every Monday
    timezone: 'Africa/Lagos',
    handler: sendReminders
  },
  
  // Auto start MCM at 8 PM on Mondays
  autoStart: {
    name: 'mcm_auto_start',
    description: 'Automatically start MCM sessions',
    schedule: '0 20 * * 1', // 8:00 PM every Monday
    timezone: 'Africa/Lagos',
    handler: autoStartSessions
  },
  
  // Auto end MCM at 10 PM on Mondays
  autoEnd: {
    name: 'mcm_auto_end',
    description: 'Automatically end MCM sessions',
    schedule: '0 22 * * 1', // 10:00 PM every Monday
    timezone: 'Africa/Lagos', 
    handler: autoEndSessions
  }
};

// Export scheduled tasks in the format expected by plugin manager
export { scheduledTasks as tasks };

// Plugin health check
export function healthCheck() {
  return {
    healthy: isInitialized && sockInstance !== null,
    settings: mcmSettings.enabled,
    groups: mcmSettings.groupJids.length,
    admins: mcmSettings.adminNumbers.length,
    sockAvailable: !!sockInstance,
    lastCheck: new Date()
  };
}