// plugins/wcw.js - Woman Crush Wednesday Plugin - MongoDB Edition
import chalk from 'chalk';
import moment from 'moment-timezone';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// Plugin metadata for the pluginManager
export const info = {
  name: 'WCW Plugin',
  version: '3.0.0',
  author: 'Alex Macksyn',
  description: 'Woman Crush Wednesday - Share and celebrate amazing women every Wednesday with MongoDB persistence',
  category: 'social',
  commands: [
    { cmd: 'wcw', desc: 'Add/view WCW posts or manage WCW system (admin only)' },
    { cmd: 'wcwlist', desc: 'List all WCW posts' },
    { cmd: 'wcwdel', desc: 'Delete WCW post (admin only)' },
    { cmd: 'wcwclear', desc: 'Clear all WCW posts (owner only)' },
    { cmd: 'wcwstats', desc: 'View WCW statistics' },
    { cmd: 'wcwstart', desc: 'Start WCW session (admin only)' },
    { cmd: 'wcwend', desc: 'End WCW session (admin only)' },
    { cmd: 'wcwhistory', desc: 'View WCW winner history' },
    { cmd: 'wcwleaderboard', desc: 'View all-time WCW leaderboard' }
  ],
  scheduledTasks: [
    {
      name: 'wcw_reminder',
      schedule: '0 9 * * 3', // Every Wednesday at 9 AM
      description: 'Send WCW reminder to groups',
      handler: async () => {
        await sendWCWReminder();
      }
    },
    {
      name: 'wcw_auto_start',
      schedule: '0 20 * * 3', // Every Wednesday at 8 PM
      description: 'Auto start WCW session',
      handler: async () => {
        await autoStartWCW();
      }
    },
    {
      name: 'wcw_auto_end',
      schedule: '0 22 * * 3', // Every Wednesday at 10 PM
      description: 'Auto end WCW session',
      handler: async () => {
        await autoEndWCW();
      }
    }
  ]
};

// MongoDB Collections
const WCW_SESSIONS_COLLECTION = 'wcw_sessions';
const WCW_PARTICIPANTS_COLLECTION = 'wcw_participants';
const WCW_RATINGS_COLLECTION = 'wcw_ratings';
const WCW_WINNERS_COLLECTION = 'wcw_winners';
const WCW_SETTINGS_COLLECTION = 'wcw_settings';

// WCW Settings (stored in MongoDB)
let wcwSettings = {
  winnerReward: 12000,
  participationReward: 1000,
  enableParticipationReward: true,
  enabledGroups: [],
  autoStart: true,
  startTime: '20:00',
  endTime: '22:00',
  validRatingRange: { min: 1, max: 10 },
  allowSelfRating: false,
  maxPhotosPerUser: 1,
  minimumRatingsToWin: 3
};

// Beautiful WCW responses
const wcwResponses = [
  "💖 What a beautiful WCW! She's absolutely stunning! ✨",
  "🌟 Amazing choice for Woman Crush Wednesday! 😍",
  "💕 She's gorgeous! Perfect WCW selection! 🔥",
  "✨ Wow! What a queen for WCW! 👑",
  "💖 Absolutely stunning WCW! She's beautiful! 🌹",
  "🔥 What a gorgeous woman for WCW! Amazing! 💫",
  "👑 Queen energy! Perfect WCW choice! ✨",
  "💕 She's absolutely beautiful! Great WCW! 🌟"
];

const wcwEmojis = ['💖', '✨', '🌟', '💕', '👑', '🔥', '💫', '🌹'];

// Initialize plugin - register with plugin communicator
PluginHelpers.registerPlugin('wcw', {
  version: '3.0.0',
  collections: [
    WCW_SESSIONS_COLLECTION,
    WCW_PARTICIPANTS_COLLECTION,
    WCW_RATINGS_COLLECTION,
    WCW_WINNERS_COLLECTION,
    WCW_SETTINGS_COLLECTION
  ],
  capabilities: ['rewards', 'persistence', 'leaderboards']
});

// Helper Functions
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

// Permission helpers
function isOwner(senderId, ownerNumber) {
  const senderPhone = senderId.replace('@s.whatsapp.net', '');
  const ownerPhone = ownerNumber.replace('@s.whatsapp.net', '');
  return senderPhone === ownerPhone;
}

function isConfigAdmin(senderId, adminNumbers) {
  if (!adminNumbers || adminNumbers.length === 0) return false;
  
  const senderPhone = senderId.replace('@s.whatsapp.net', '');
  return adminNumbers.some(adminNum => {
    const cleanAdminNum = adminNum.replace('@s.whatsapp.net', '');
    return senderPhone === cleanAdminNum;
  });
}

async function isGroupAdmin(sock, groupJid, senderId) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    const groupAdmins = groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);
    return groupAdmins.includes(senderId);
  } catch (error) {
    console.log(chalk.yellow('⚠️ Error checking group admin status:', error.message));
    return false;
  }
}

async function isAuthorized(sock, m, config) {
  const senderId = m.sender || '';
  const groupJid = m.from;
  
  if (isOwner(senderId, config.OWNER_NUMBER + '@s.whatsapp.net')) {
    return true;
  }
  
  if (isConfigAdmin(senderId, config.ADMIN_NUMBERS)) {
    return true;
  }
  
  if (groupJid.endsWith('@g.us')) {
    return await isGroupAdmin(sock, groupJid, senderId);
  }
  
  return false;
}

// MongoDB Operations
async function loadWCWSettings() {
  try {
    return await PluginHelpers.safeDBOperation(async (db, collection) => {
      const settings = await collection.findOne({ _id: 'wcw_settings' });
      
      if (!settings) {
        // Create default settings
        const defaultSettings = {
          _id: 'wcw_settings',
          ...wcwSettings,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await collection.insertOne(defaultSettings);
        return defaultSettings;
      }
      
      return settings;
    }, WCW_SETTINGS_COLLECTION);
  } catch (error) {
    console.error(chalk.red('❌ Error loading WCW settings:'), error.message);
    return wcwSettings; // Return defaults if DB fails
  }
}

async function saveWCWSettings(newSettings) {
  try {
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.updateOne(
        { _id: 'wcw_settings' },
        { 
          $set: { 
            ...newSettings,
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );
    }, WCW_SETTINGS_COLLECTION);
    
    wcwSettings = { ...wcwSettings, ...newSettings };
    console.log(chalk.green('✅ WCW settings saved'));
  } catch (error) {
    console.error(chalk.red('❌ Error saving WCW settings:'), error.message);
  }
}

async function isWCWActive(groupJid) {
  try {
    return await PluginHelpers.safeDBOperation(async (db, collection) => {
      const session = await collection.findOne({
        groupJid,
        date: getCurrentDate(),
        active: true
      });
      
      return !!session;
    }, WCW_SESSIONS_COLLECTION);
  } catch (error) {
    console.error(chalk.red('❌ Error checking WCW status:'), error.message);
    return false;
  }
}

async function getCurrentWCWSession(groupJid) {
  try {
    return await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.findOne({
        groupJid,
        date: getCurrentDate(),
        active: true
      });
    }, WCW_SESSIONS_COLLECTION);
  } catch (error) {
    console.error(chalk.red('❌ Error getting WCW session:'), error.message);
    return null;
  }
}

// Rating extraction function
function extractRating(text) {
  const emojiToNumber = {
    '1️⃣': 1, '2️⃣': 2, '3️⃣': 3, '4️⃣': 4, '5️⃣': 5,
    '6️⃣': 6, '7️⃣': 7, '8️⃣': 8, '9️⃣': 9, '🔟': 10
  };
  
  // Check for emoji numbers first
  for (const [emoji, number] of Object.entries(emojiToNumber)) {
    if (text.includes(emoji)) {
      return number;
    }
  }
  
  // Check for regular numbers 1-10
  const numbers = text.match(/\b([1-9]|10)\b/g);
  if (!numbers) return null;
  
  const rating = parseInt(numbers[0]);
  if (rating >= wcwSettings.validRatingRange.min && rating <= wcwSettings.validRatingRange.max) {
    return rating;
  }
  
  return null;
}

// WCW Session Management
async function createWCWSession(groupJid) {
  try {
    const sessionId = `wcw_${getCurrentDate()}_${groupJid}`;
    const sessionData = {
      sessionId,
      groupJid,
      date: getCurrentDate(),
      active: true,
      startTime: new Date(),
      endTime: null,
      winner: null,
      totalParticipants: 0,
      totalRatings: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    return await PluginHelpers.safeDBOperation(async (db, collection) => {
      const result = await collection.insertOne(sessionData);
      return { ...sessionData, _id: result.insertedId };
    }, WCW_SESSIONS_COLLECTION);
    
  } catch (error) {
    console.error(chalk.red('❌ Error creating WCW session:'), error.message);
    return null;
  }
}

async function startWCWSession(sock, groupJid) {
  try {
    if (!isWednesday()) {
      console.log(chalk.yellow('⚠️ Attempted to start WCW on non-Wednesday'));
      return false;
    }
    
    if (await isWCWActive(groupJid)) {
      console.log(chalk.yellow('⚠️ WCW session already active'));
      return false;
    }
    
    const session = await createWCWSession(groupJid);
    if (!session) return false;
    
    const startMessage = `🎉 WOMAN CRUSH WEDNESDAY IS NOW LIVE! 🎉\n\n` +
                        `💃 Ladies: Post your most stunning photo NOW!\n` +
                        `🕺 Gentlemen: Rate the beautiful ladies from 1-10!\n\n` +
                        `⏰ Competition ends at 10:00 PM\n` +
                        `💰 Winner takes home ₦${wcwSettings.winnerReward.toLocaleString()}\n` +
                        `🎁 Participation reward: ₦${wcwSettings.participationReward.toLocaleString()}\n\n` +
                        `📋 RULES:\n` +
                        `• Ladies: 1 photo only (extras will be ignored)\n` +
                        `• Gentlemen: Rate 1-10 only\n` +
                        `• No self-rating allowed\n` +
                        `• Minimum ${wcwSettings.minimumRatingsToWin} ratings to qualify for winner\n\n` +
                        `💄 Let the glamour begin! 💄\n` +
                        `#WCWLive #WomanCrushWednesday`;
    
    try {
      const groupMetadata = await sock.groupMetadata(groupJid);
      const mentions = groupMetadata.participants.map(p => p.id);
      
      await sock.sendMessage(groupJid, {
        text: startMessage,
        mentions: mentions
      });
    } catch (error) {
      await sock.sendMessage(groupJid, { text: startMessage });
    }
    
    console.log(chalk.green(`✅ WCW session started for ${groupJid}`));
    
    // Emit event for other plugins
    await PluginHelpers.emitEvent('wcw_session_started', {
      groupJid,
      sessionId: session.sessionId,
      startTime: new Date()
    });
    
    return true;
    
  } catch (error) {
    console.log(chalk.red('❌ Error starting WCW session:', error.message));
    return false;
  }
}

async function endWCWSession(sock, groupJid) {
  try {
    const session = await getCurrentWCWSession(groupJid);
    if (!session) {
      return false;
    }
    
    // Get participants with their ratings
    const participants = await getWCWParticipants(session.sessionId);
    
    if (participants.length === 0) {
      await sock.sendMessage(groupJid, {
        text: `⏰ WCW HAS ENDED!\n\n🤷‍♀️ No participants this time - Better luck next Wednesday!`
      });
      
      // Mark session as ended
      await PluginHelpers.safeDBOperation(async (db, collection) => {
        await collection.updateOne(
          { sessionId: session.sessionId },
          { 
            $set: { 
              active: false, 
              endTime: new Date(),
              updatedAt: new Date()
            } 
          }
        );
      }, WCW_SESSIONS_COLLECTION);
      
      return true;
    }
    
    // Calculate final scores
    for (const participant of participants) {
      const ratings = await getParticipantRatings(participant._id);
      participant.ratings = ratings;
      participant.totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
      participant.averageRating = ratings.length > 0 ? participant.totalRating / ratings.length : 0;
      participant.ratingCount = ratings.length;
    }
    
    // Sort participants by total rating, then by average
    participants.sort((a, b) => {
      if (b.totalRating === a.totalRating) {
        return b.averageRating - a.averageRating;
      }
      return b.totalRating - a.totalRating;
    });
    
    const winner = participants.find(p => p.ratingCount >= wcwSettings.minimumRatingsToWin) || participants[0];
    
    // Show results
    let resultsMessage = `🎭 WCW PAGEANT RESULTS 🎭\n\n`;
    resultsMessage += `✨ The scores are in! Here are tonight's final standings:\n\n`;
    
    participants.slice(0, 10).forEach((participant, index) => {
      const position = index + 1;
      const emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      const avgRating = participant.averageRating > 0 ? participant.averageRating.toFixed(1) : '0.0';
      const userPhone = participant.userId.replace('@s.whatsapp.net', '');
      resultsMessage += `${emoji} ${position}. @${userPhone}\n`;
      resultsMessage += `   ⭐ Average: ${avgRating}/10 (${participant.ratingCount} ratings)\n`;
      resultsMessage += `   📊 Total Points: ${participant.totalRating}\n\n`;
    });
    
    const mentions = participants.slice(0, 10).map(p => p.userId);
    
    await sock.sendMessage(groupJid, {
      text: resultsMessage,
      mentions: mentions
    });
    
    // Process rewards and declare winner
    if (winner && winner.ratingCount >= wcwSettings.minimumRatingsToWin) {
      // Award winner prize
      await PluginHelpers.addMoney(winner.userId, wcwSettings.winnerReward, 'WCW Winner Prize');
      
      // Award participation rewards
      if (wcwSettings.enableParticipationReward) {
        for (const participant of participants) {
          if (participant.userId !== winner.userId) {
            await PluginHelpers.addMoney(participant.userId, wcwSettings.participationReward, 'WCW Participation Reward');
          }
        }
      }
      
      // Save winner record
      await saveWCWWinner(session.sessionId, groupJid, winner);
      
      const winnerMessage = `👑 AND THE CROWN GOES TO... 👑\n\n` +
                           `🎉 Congratulations @${winner.userId.replace('@s.whatsapp.net', '')}! You are tonight's Woman Crush Queen! 🎉\n\n` +
                           `💰 Prize: ₦${wcwSettings.winnerReward.toLocaleString()} 💰\n` +
                           `⭐ Total Points: ${winner.totalRating}\n` +
                           `📊 Average Rating: ${winner.averageRating.toFixed(1)}/10\n` +
                           `🗳️ Based on ${winner.ratingCount} ratings\n\n` +
                           `${wcwSettings.enableParticipationReward ? `🎁 All participants received ₦${wcwSettings.participationReward.toLocaleString()} participation reward!\n\n` : ''}` +
                           `#WCWWinner #QueenCrowned #WomanCrushWednesday`;
      
      await sock.sendMessage(groupJid, {
        text: winnerMessage,
        mentions: [winner.userId]
      });
      
      // Update session with winner
      await PluginHelpers.safeDBOperation(async (db, collection) => {
        await collection.updateOne(
          { sessionId: session.sessionId },
          { 
            $set: { 
              active: false, 
              endTime: new Date(),
              winner: winner.userId,
              totalParticipants: participants.length,
              totalRatings: participants.reduce((sum, p) => sum + p.ratingCount, 0),
              updatedAt: new Date()
            } 
          }
        );
      }, WCW_SESSIONS_COLLECTION);
      
    } else {
      await sock.sendMessage(groupJid, {
        text: `😔 No winner this time! The top participant didn't meet the minimum requirement of ${wcwSettings.minimumRatingsToWin} ratings.\n\nBetter luck next Wednesday! 💪`
      });
      
      // Still mark session as ended
      await PluginHelpers.safeDBOperation(async (db, collection) => {
        await collection.updateOne(
          { sessionId: session.sessionId },
          { 
            $set: { 
              active: false, 
              endTime: new Date(),
              totalParticipants: participants.length,
              totalRatings: participants.reduce((sum, p) => sum + p.ratingCount, 0),
              updatedAt: new Date()
            } 
          }
        );
      }, WCW_SESSIONS_COLLECTION);
    }
    
    console.log(chalk.green(`✅ WCW session ended for ${groupJid}`));
    
    // Emit event for other plugins
    await PluginHelpers.emitEvent('wcw_session_ended', {
      groupJid,
      sessionId: session.sessionId,
      winner: winner?.userId || null,
      participants: participants.length,
      endTime: new Date()
    });
    
    return true;
    
  } catch (error) {
    console.log(chalk.red('❌ Error ending WCW session:', error.message));
    return false;
  }
}

async function getWCWParticipants(sessionId) {
  try {
    return await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.find({ sessionId }).toArray();
    }, WCW_PARTICIPANTS_COLLECTION);
  } catch (error) {
    console.error(chalk.red('❌ Error getting participants:'), error.message);
    return [];
  }
}

async function getParticipantRatings(participantId) {
  try {
    return await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.find({ participantId }).toArray();
    }, WCW_RATINGS_COLLECTION);
  } catch (error) {
    console.error(chalk.red('❌ Error getting ratings:'), error.message);
    return [];
  }
}

async function saveWCWWinner(sessionId, groupJid, winner) {
  try {
    const winnerData = {
      sessionId,
      groupJid,
      userId: winner.userId,
      userPhone: winner.userId.replace('@s.whatsapp.net', ''),
      date: getCurrentDate(),
      totalRating: winner.totalRating,
      averageRating: winner.averageRating,
      ratingCount: winner.ratingCount,
      prize: wcwSettings.winnerReward,
      createdAt: new Date()
    };
    
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.insertOne(winnerData);
    }, WCW_WINNERS_COLLECTION);
    
    console.log(chalk.green(`🏆 WCW winner saved: ${winner.userId.replace('@s.whatsapp.net', '')}`));
    
  } catch (error) {
    console.error(chalk.red('❌ Error saving WCW winner:'), error.message);
  }
}

// Photo submission handler
async function handlePhotoSubmission(m, sock) {
  try {
    if (!isWednesday() || !m.isGroup) return false;
    
    const session = await getCurrentWCWSession(m.from);
    if (!session) return false;
    
    const senderId = m.sender;
    const senderPhone = senderId.replace('@s.whatsapp.net', '');
    
    // Check if user already participated
    const existingParticipant = await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.findOne({
        sessionId: session.sessionId,
        userId: senderId
      });
    }, WCW_PARTICIPANTS_COLLECTION);
    
    if (existingParticipant) {
      await m.react('❌');
      await sock.sendMessage(m.from, {
        text: `🚫 @${senderPhone} - You already submitted your photo! Only your first photo counts for WCW.`,
        mentions: [senderId]
      });
      return true;
    }
    
    // Initialize user in economy system
    await PluginHelpers.getUserData(senderId);
    
    // Add participant to database
    const participantData = {
      sessionId: session.sessionId,
      groupJid: m.from,
      userId: senderId,
      userPhone: senderPhone,
      messageKey: m.key,
      submissionTime: new Date(),
      photoCount: 1
    };
    
    const participant = await PluginHelpers.safeDBOperation(async (db, collection) => {
      const result = await collection.insertOne(participantData);
      return { ...participantData, _id: result.insertedId };
    }, WCW_PARTICIPANTS_COLLECTION);
    
    if (!participant) {
      await m.react('❌');
      return false;
    }
    
    // React and respond
    await m.react('✅');
    
    const response = wcwResponses[Math.floor(Math.random() * wcwResponses.length)];
    const emoji = wcwEmojis[Math.floor(Math.random() * wcwEmojis.length)];
    
    await sock.sendMessage(m.from, {
      text: `${response} ${emoji}`,
      mentions: [senderId]
    });
    
    console.log(chalk.green(`📸 WCW photo submitted by ${senderPhone}`));
    
    // Emit event
    await PluginHelpers.emitEvent('wcw_photo_submitted', {
      sessionId: session.sessionId,
      userId: senderId,
      groupJid: m.from,
      submissionTime: new Date()
    });
    
    return true;
    
  } catch (error) {
    console.log(chalk.red('❌ Error handling photo submission:', error.message));
    return false;
  }
}

// Rating submission handler
async function handleRatingSubmission(m, sock) {
  try {
    if (!isWednesday() || !m.isGroup) return false;
    
    const session = await getCurrentWCWSession(m.from);
    if (!session) return false;
    
    if (!m.quoted || !m.quoted.imageMessage) return false;
    
    const raterId = m.sender;
    const participantId = m.quoted.sender;
    
    if (!participantId) return false;
    
    // Get participant from database
    const participant = await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.findOne({
        sessionId: session.sessionId,
        userId: participantId
      });
    }, WCW_PARTICIPANTS_COLLECTION);
    
    if (!participant) return false;
    
    // Check self-rating
    if (!wcwSettings.allowSelfRating && raterId === participantId) {
      await m.react('🚫');
      return true;
    }
    
    const rating = extractRating(m.body || '');
    if (!rating) {
      await m.react('❌');
      return true;
    }
    
    // Initialize rater in economy system
    await PluginHelpers.getUserData(raterId);
    
    // Update or add rating
    const ratingData = {
      participantId: participant._id,
      sessionId: session.sessionId,
      raterId,
      raterPhone: raterId.replace('@s.whatsapp.net', ''),
      rating,
      timestamp: new Date()
    };
    
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      // Remove existing rating from same rater to same participant
      await collection.deleteOne({
        participantId: participant._id,
        raterId
      });
      
      // Insert new rating
      await collection.insertOne(ratingData);
    }, WCW_RATINGS_COLLECTION);
    
    await m.react('✅');
    
    console.log(chalk.green(`⭐ WCW rating ${rating} given by ${raterId.replace('@s.whatsapp.net', '')} to ${participant.userPhone}`));
    
    // Emit event
    await PluginHelpers.emitEvent('wcw_rating_submitted', {
      sessionId: session.sessionId,
      participantId: participant._id,
      raterId,
      rating,
      timestamp: new Date()
    });
    
    return true;
    
  } catch (error) {
    console.log(chalk.red('❌ Error handling rating submission:', error.message));
    return false;
  }
}

// Scheduled task handlers
async function sendWCWReminder() {
  try {
    if (!isWednesday()) return;
    
    console.log(chalk.blue('📢 Sending WCW reminders...'));
    
    // This would need access to sock instance - handled by scheduler
    // Implementation depends on how your scheduler works
    
  } catch (error) {
    console.log(chalk.red('❌ Error sending WCW reminders:', error.message));
  }
}

async function autoStartWCW() {
  try {
    if (!wcwSettings.autoStart || !isWednesday()) return;
    
    console.log(chalk.blue('🚀 Auto-starting WCW sessions...'));
    
    // This would need access to sock instance - handled by scheduler
    // Implementation depends on how your scheduler works
    
  } catch (error) {
    console.log(chalk.red('❌ Error in auto-start WCW:', error.message));
  }
}

async function autoEndWCW() {
  try {
    if (!wcwSettings.autoStart || !isWednesday()) return;
    
    console.log(chalk.blue('🛑 Auto-ending WCW sessions...'));
    
    // This would need access to sock instance - handled by scheduler
    // Implementation depends on how your scheduler works
    
  } catch (error) {
    console.log(chalk.red('❌ Error in auto-end WCW:', error.message));
  }
}

// Main plugin handler function (required by pluginManager)
export default async function wcwPlugin(m, sock, config) {
  try {
    // Load settings on first run
    if (!wcwSettings.loaded) {
      const loadedSettings = await loadWCWSettings();
      if (loadedSettings) {
        wcwSettings = { ...wcwSettings, ...loadedSettings };
      }
      wcwSettings.loaded = true;
    }
    
    // Handle photo submissions
    if (m.message && m.message.imageMessage && !m.body?.startsWith(config.PREFIX)) {
      const handled = await handlePhotoSubmission(m, sock);
      if (handled) return;
    }
    
    // Handle rating submissions (quoted messages)
    if (m.quoted && m.quoted.imageMessage && !m.body?.startsWith(config.PREFIX)) {
      const handled = await handleRatingSubmission(m, sock);
      if (handled) return;
    }
    
    // Handle commands
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    
    if (!command) return;
    
    switch (command) {
      case 'wcw':
        await handleWCWCommand(m, sock, config, args);
        break;
        
      case 'wcwstart':
        await handleWCWStartCommand(m, sock, config);
        break;
        
      case 'wcwend':
        await handleWCWEndCommand(m, sock, config);
        break;
        
      case 'wcwstats':
        await handleWCWStatsCommand(m, sock, config);
        break;
        
      case 'wcwlist':
        await handleWCWListCommand(m, sock, config);
        break;
        
      case 'wcwdel':
        await handleWCWDeleteCommand(m, sock, config, args);
        break;
        
      case 'wcwclear':
        await handleWCWClearCommand(m, sock, config);
        break;
        
      case 'wcwhistory':
        await handleWCWHistoryCommand(m, sock, config, args);
        break;
        
      case 'wcwleaderboard':
        await handleWCWLeaderboardCommand(m, sock, config);
        break;
    }
    
  } catch (error) {
    console.log(chalk.red('❌ WCW Plugin error:', error.message));
    
    // Record operation failure for monitoring
    PluginHelpers.recordOperation(false, 0);
  }
}

// Command handlers
async function handleWCWCommand(m, sock, config, args) {
  if (!args.length) {
    const session = await getCurrentWCWSession(m.from);
    const isActive = !!session;
    
    let statusMessage = `💃 WOMAN CRUSH WEDNESDAY SYSTEM 💃\n\n`;
    statusMessage += `📅 Today: ${getCurrentDate()}\n`;
    statusMessage += `🗓️ Is Wednesday: ${isWednesday() ? 'Yes ✅' : 'No ❌'}\n`;
    statusMessage += `⏰ Current Time: ${getCurrentTime()}\n`;
    statusMessage += `🔴 Session Active: ${isActive ? 'Yes ✅' : 'No ❌'}\n`;
    statusMessage += `🎯 Schedule: ${wcwSettings.startTime} - ${wcwSettings.endTime}\n\n`;
    
    if (isActive && session) {
      const participants = await getWCWParticipants(session.sessionId);
      statusMessage += `👥 Current Participants: ${participants.length}\n`;
      statusMessage += `💰 Winner Prize: ₦${wcwSettings.winnerReward.toLocaleString()}\n`;
      statusMessage += `🎁 Participation Prize: ₦${wcwSettings.participationReward.toLocaleString()}\n`;
      statusMessage += `📊 Min Ratings to Win: ${wcwSettings.minimumRatingsToWin}\n\n`;
      statusMessage += `📱 Commands:\n`;
      statusMessage += `• Post photo to participate\n`;
      statusMessage += `• Reply with rating 1-10 to rate\n`;
      statusMessage += `• ${config.PREFIX}wcwstats - View current statistics\n`;
      statusMessage += `• ${config.PREFIX}wcwlist - View all participants\n`;
    } else {
      statusMessage += `📱 Available Commands:\n`;
      statusMessage += `• ${config.PREFIX}wcwstats - View statistics\n`;
      statusMessage += `• ${config.PREFIX}wcwhistory - View winner history\n`;
      statusMessage += `• ${config.PREFIX}wcwleaderboard - All-time leaderboard\n\n`;
      statusMessage += `👑 Admin Commands:\n`;
      statusMessage += `• ${config.PREFIX}wcwstart - Start WCW session\n`;
      statusMessage += `• ${config.PREFIX}wcwend - End WCW session\n`;
      statusMessage += `• ${config.PREFIX}wcw enable - Enable for this group\n`;
      statusMessage += `• ${config.PREFIX}wcw disable - Disable for this group\n`;
    }
    
    await sock.sendMessage(m.from, { text: statusMessage });
    return;
  }
  
  const subCommand = args[0].toLowerCase();
  
  switch (subCommand) {
    case 'enable':
      if (!(await isAuthorized(sock, m, config))) {
        await sock.sendMessage(m.from, { text: '🚫 Only admins can modify WCW settings!' });
        return;
      }
      
      const enabledGroups = [...wcwSettings.enabledGroups];
      if (!enabledGroups.includes(m.from)) {
        enabledGroups.push(m.from);
        await saveWCWSettings({ enabledGroups });
        await sock.sendMessage(m.from, { text: '✅ WCW enabled for this group!' });
      } else {
        await sock.sendMessage(m.from, { text: '⚠️ WCW is already enabled for this group!' });
      }
      break;
      
    case 'disable':
      if (!(await isAuthorized(sock, m, config))) {
        await sock.sendMessage(m.from, { text: '🚫 Only admins can modify WCW settings!' });
        return;
      }
      
      const filteredGroups = wcwSettings.enabledGroups.filter(g => g !== m.from);
      await saveWCWSettings({ enabledGroups: filteredGroups });
      await sock.sendMessage(m.from, { text: '❌ WCW disabled for this group!' });
      break;
      
    case 'config':
      if (!(await isAuthorized(sock, m, config))) {
        await sock.sendMessage(m.from, { text: '🚫 Only admins can view WCW config!' });
        return;
      }
      
      let configMessage = `⚙️ WCW CONFIGURATION ⚙️\n\n`;
      configMessage += `💰 Winner Reward: ₦${wcwSettings.winnerReward.toLocaleString()}\n`;
      configMessage += `🎁 Participation Reward: ₦${wcwSettings.participationReward.toLocaleString()}\n`;
      configMessage += `🎁 Participation Enabled: ${wcwSettings.enableParticipationReward ? 'Yes' : 'No'}\n`;
      configMessage += `🚀 Auto Start: ${wcwSettings.autoStart ? 'Yes' : 'No'}\n`;
      configMessage += `⏰ Start Time: ${wcwSettings.startTime}\n`;
      configMessage += `⏰ End Time: ${wcwSettings.endTime}\n`;
      configMessage += `📊 Rating Range: ${wcwSettings.validRatingRange.min}-${wcwSettings.validRatingRange.max}\n`;
      configMessage += `🚫 Self Rating: ${wcwSettings.allowSelfRating ? 'Allowed' : 'Blocked'}\n`;
      configMessage += `📸 Max Photos: ${wcwSettings.maxPhotosPerUser}\n`;
      configMessage += `🏆 Min Ratings to Win: ${wcwSettings.minimumRatingsToWin}\n`;
      configMessage += `👥 Enabled Groups: ${wcwSettings.enabledGroups.length}`;
      
      await sock.sendMessage(m.from, { text: configMessage });
      break;
      
    default:
      await sock.sendMessage(m.from, { 
        text: `❌ Unknown subcommand: ${subCommand}\n\nAvailable: enable, disable, config` 
      });
  }
}

async function handleWCWStartCommand(m, sock, config) {
  if (!(await isAuthorized(sock, m, config))) {
    await sock.sendMessage(m.from, { text: '🚫 Only admins can start WCW sessions!' });
    return;
  }
  
  if (!m.isGroup) {
    await sock.sendMessage(m.from, { text: '❌ WCW can only be used in groups!' });
    return;
  }
  
  const success = await startWCWSession(sock, m.from);
  if (success) {
    await sock.sendMessage(m.from, { text: '✅ WCW session started successfully!' });
  } else {
    const isActive = await isWCWActive(m.from);
    if (isActive) {
      await sock.sendMessage(m.from, { text: '⚠️ WCW session is already running!' });
    } else if (!isWednesday()) {
      await sock.sendMessage(m.from, { text: '❌ WCW can only be started on Wednesdays!' });
    } else {
      await sock.sendMessage(m.from, { text: '❌ Failed to start WCW session!' });
    }
  }
}

async function handleWCWEndCommand(m, sock, config) {
  if (!(await isAuthorized(sock, m, config))) {
    await sock.sendMessage(m.from, { text: '🚫 Only admins can end WCW sessions!' });
    return;
  }
  
  if (!m.isGroup) {
    await sock.sendMessage(m.from, { text: '❌ WCW can only be used in groups!' });
    return;
  }
  
  const success = await endWCWSession(sock, m.from);
  if (success) {
    await sock.sendMessage(m.from, { text: '✅ WCW session ended successfully!' });
  } else {
    await sock.sendMessage(m.from, { text: '❌ No active WCW session to end!' });
  }
}

async function handleWCWStatsCommand(m, sock, config) {
  try {
    const session = await getCurrentWCWSession(m.from);
    
    let statsMessage = `📊 WCW STATISTICS 📊\n\n`;
    
    if (session) {
      const participants = await getWCWParticipants(session.sessionId);
      
      statsMessage += `🔴 CURRENT SESSION:\n`;
      statsMessage += `👥 Participants: ${participants.length}\n`;
      statsMessage += `⏰ Started: ${session.startTime.toLocaleTimeString('en-NG', {timeZone: 'Africa/Lagos'})}\n\n`;
      
      if (participants.length > 0) {
        // Get ratings for each participant and calculate scores
        const participantsWithScores = [];
        
        for (const participant of participants) {
          const ratings = await getParticipantRatings(participant._id);
          const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
          const averageRating = ratings.length > 0 ? totalRating / ratings.length : 0;
          
          participantsWithScores.push({
            ...participant,
            totalRating,
            averageRating,
            ratingCount: ratings.length
          });
        }
        
        // Sort by total rating, then by average
        participantsWithScores.sort((a, b) => {
          if (b.totalRating === a.totalRating) {
            return b.averageRating - a.averageRating;
          }
          return b.totalRating - a.totalRating;
        });
        
        statsMessage += `🏆 CURRENT LEADERBOARD:\n`;
        participantsWithScores.slice(0, 5).forEach((participant, index) => {
          const position = index + 1;
          const emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
          const avgRating = participant.averageRating > 0 ? participant.averageRating.toFixed(1) : '0.0';
          const qualifies = participant.ratingCount >= wcwSettings.minimumRatingsToWin ? '✅' : '⏳';
          
          statsMessage += `${emoji} ${position}. @${participant.userPhone} ${qualifies}\n`;
          statsMessage += `   ⭐ Avg: ${avgRating}/10 (${participant.ratingCount} votes)\n`;
          statsMessage += `   📊 Total: ${participant.totalRating} points\n\n`;
        });
        
        const mentions = participantsWithScores.slice(0, 5).map(p => p.userId);
        
        await sock.sendMessage(m.from, { 
          text: statsMessage,
          mentions: mentions
        });
        return;
      }
    }
    
    // Show general stats if no active session
    const groupStats = await getGroupWCWStats(m.from);
    const allTimeStats = await getAllTimeWCWStats();
    
    statsMessage += `❌ No active WCW session\n\n`;
    statsMessage += `📈 THIS GROUP STATS:\n`;
    statsMessage += `🏆 Total Sessions: ${groupStats.totalSessions}\n`;
    statsMessage += `👥 Total Participants: ${groupStats.totalParticipants}\n`;
    statsMessage += `🎯 Total Ratings: ${groupStats.totalRatings}\n`;
    
    if (groupStats.lastWinner) {
      statsMessage += `👑 Last Winner: @${groupStats.lastWinner.userPhone}\n`;
      statsMessage += `📅 Won on: ${groupStats.lastWinner.date}\n`;
    }
    
    statsMessage += `\n🌍 GLOBAL STATS:\n`;
    statsMessage += `🏆 Total Sessions: ${allTimeStats.totalSessions}\n`;
    statsMessage += `👥 Total Participants: ${allTimeStats.totalParticipants}\n`;
    statsMessage += `💰 Total Prizes: ₦${allTimeStats.totalPrizes.toLocaleString()}\n`;
    
    const mentions = groupStats.lastWinner ? [groupStats.lastWinner.userId] : [];
    
    await sock.sendMessage(m.from, { 
      text: statsMessage,
      mentions: mentions
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Error in WCW stats:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Error retrieving WCW statistics!' });
  }
}

async function getGroupWCWStats(groupJid) {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const sessionsCollection = db.collection(WCW_SESSIONS_COLLECTION);
      const participantsCollection = db.collection(WCW_PARTICIPANTS_COLLECTION);
      const ratingsCollection = db.collection(WCW_RATINGS_COLLECTION);
      const winnersCollection = db.collection(WCW_WINNERS_COLLECTION);
      
      const [sessions, participants, ratings, lastWinner] = await Promise.all([
        sessionsCollection.countDocuments({ groupJid }),
        participantsCollection.countDocuments({ groupJid }),
        ratingsCollection.countDocuments({}),
        winnersCollection.findOne({ groupJid }, { sort: { createdAt: -1 } })
      ]);
      
      return {
        totalSessions: sessions,
        totalParticipants: participants,
        totalRatings: ratings,
        lastWinner
      };
    });
  } catch (error) {
    console.error(chalk.red('❌ Error getting group stats:'), error.message);
    return { totalSessions: 0, totalParticipants: 0, totalRatings: 0, lastWinner: null };
  }
}

async function getAllTimeWCWStats() {
  try {
    return await PluginHelpers.safeDBOperation(async (db) => {
      const sessionsCollection = db.collection(WCW_SESSIONS_COLLECTION);
      const participantsCollection = db.collection(WCW_PARTICIPANTS_COLLECTION);
      const winnersCollection = db.collection(WCW_WINNERS_COLLECTION);
      
      const [sessions, participants, winners] = await Promise.all([
        sessionsCollection.countDocuments(),
        participantsCollection.countDocuments(),
        winnersCollection.find().toArray()
      ]);
      
      const totalPrizes = winners.reduce((sum, winner) => sum + (winner.prize || wcwSettings.winnerReward), 0);
      
      return {
        totalSessions: sessions,
        totalParticipants: participants,
        totalWinners: winners.length,
        totalPrizes
      };
    });
  } catch (error) {
    console.error(chalk.red('❌ Error getting all-time stats:'), error.message);
    return { totalSessions: 0, totalParticipants: 0, totalWinners: 0, totalPrizes: 0 };
  }
}

async function handleWCWListCommand(m, sock, config) {
  try {
    const session = await getCurrentWCWSession(m.from);
    
    if (!session) {
      await sock.sendMessage(m.from, { text: '❌ No active WCW session!' });
      return;
    }
    
    const participants = await getWCWParticipants(session.sessionId);
    
    if (participants.length === 0) {
      await sock.sendMessage(m.from, { text: '📝 No participants yet!' });
      return;
    }
    
    let listMessage = `📝 WCW PARTICIPANTS LIST 📝\n\n`;
    listMessage += `👥 Total Participants: ${participants.length}\n`;
    listMessage += `📊 Minimum ratings to win: ${wcwSettings.minimumRatingsToWin}\n\n`;
    
    // Get ratings for each participant
    const participantsWithRatings = [];
    
    for (const participant of participants) {
      const ratings = await getParticipantRatings(participant._id);
      participantsWithRatings.push({
        ...participant,
        ratingCount: ratings.length,
        averageRating: ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : 0
      });
    }
    
    // Sort by rating count, then by average rating
    participantsWithRatings.sort((a, b) => {
      if (b.ratingCount === a.ratingCount) {
        return b.averageRating - a.averageRating;
      }
      return b.ratingCount - a.ratingCount;
    });
    
    participantsWithRatings.forEach((participant, index) => {
      const qualifies = participant.ratingCount >= wcwSettings.minimumRatingsToWin ? '✅' : '⏳';
      listMessage += `${index + 1}. @${participant.userPhone} ${qualifies}\n`;
      
      if (participant.ratingCount > 0) {
        listMessage += `   ⭐ ${participant.averageRating.toFixed(1)}/10 (${participant.ratingCount} ratings)\n`;
      } else {
        listMessage += `   ⏳ No ratings yet\n`;
      }
      
      listMessage += `   🕐 ${participant.submissionTime.toLocaleTimeString('en-NG', {timeZone: 'Africa/Lagos'})}\n\n`;
    });
    
    listMessage += `✅ = Qualifies for winner\n⏳ = Needs more ratings`;
    
    const mentions = participantsWithRatings.map(p => p.userId);
    
    await sock.sendMessage(m.from, { 
      text: listMessage,
      mentions: mentions
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Error in WCW list:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Error retrieving participant list!' });
  }
}

async function handleWCWDeleteCommand(m, sock, config, args) {
  if (!(await isAuthorized(sock, m, config))) {
    await sock.sendMessage(m.from, { text: '🚫 Only admins can delete WCW entries!' });
    return;
  }
  
  const session = await getCurrentWCWSession(m.from);
  
  if (!session) {
    await sock.sendMessage(m.from, { text: '❌ No active WCW session!' });
    return;
  }
  
  if (!args.length) {
    await sock.sendMessage(m.from, { 
      text: `❌ Usage: ${config.PREFIX}wcwdel @user\nExample: ${config.PREFIX}wcwdel @2348123456789` 
    });
    return;
  }
  
  const targetUser = args[0].replace('@', '') + '@s.whatsapp.net';
  
  try {
    const deleted = await PluginHelpers.safeDBOperation(async (db) => {
      const participantsCollection = db.collection(WCW_PARTICIPANTS_COLLECTION);
      const ratingsCollection = db.collection(WCW_RATINGS_COLLECTION);
      
      // Find participant
      const participant = await participantsCollection.findOne({
        sessionId: session.sessionId,
        userId: targetUser
      });
      
      if (!participant) return null;
      
      // Delete participant and their ratings
      await Promise.all([
        participantsCollection.deleteOne({ _id: participant._id }),
        ratingsCollection.deleteMany({ participantId: participant._id })
      ]);
      
      return participant;
    });
    
    if (deleted) {
      await sock.sendMessage(m.from, { 
        text: `✅ Removed @${deleted.userPhone} from WCW session!`,
        mentions: [targetUser]
      });
    } else {
      await sock.sendMessage(m.from, { text: '❌ User not found in current WCW session!' });
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error deleting WCW entry:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Error deleting WCW entry!' });
  }
}

async function handleWCWClearCommand(m, sock, config) {
  const senderId = m.sender || '';
  
  if (!isOwner(senderId, config.OWNER_NUMBER + '@s.whatsapp.net')) {
    await sock.sendMessage(m.from, { text: '🚫 Only the bot owner can clear all WCW data!' });
    return;
  }
  
  try {
    const cleared = await PluginHelpers.safeDBOperation(async (db) => {
      const collections = [
        WCW_SESSIONS_COLLECTION,
        WCW_PARTICIPANTS_COLLECTION,
        WCW_RATINGS_COLLECTION,
        WCW_WINNERS_COLLECTION
      ];
      
      const results = [];
      
      for (const collectionName of collections) {
        const collection = db.collection(collectionName);
        const result = await collection.deleteMany({ groupJid: m.from });
        results.push({ collection: collectionName, deleted: result.deletedCount });
      }
      
      return results;
    });
    
    const totalDeleted = cleared.reduce((sum, r) => sum + r.deleted, 0);
    
    await sock.sendMessage(m.from, { 
      text: `✅ Cleared ${totalDeleted} WCW records for this group!\n\n` +
            cleared.map(r => `${r.collection}: ${r.deleted} records`).join('\n')
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Error clearing WCW data:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Error clearing WCW data!' });
  }
}

async function handleWCWHistoryCommand(m, sock, config, args) {
  try {
    const page = args[0] ? parseInt(args[0]) : 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    const history = await PluginHelpers.safeDBOperation(async (db, collection) => {
      const [winners, totalCount] = await Promise.all([
        collection.find({ groupJid: m.from })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        collection.countDocuments({ groupJid: m.from })
      ]);
      
      return { winners, totalCount, totalPages: Math.ceil(totalCount / limit) };
    }, WCW_WINNERS_COLLECTION);
    
    if (history.winners.length === 0) {
      await sock.sendMessage(m.from, { text: '📜 No WCW winner history for this group!' });
      return;
    }
    
    let historyMessage = `📜 WCW WINNER HISTORY 📜\n`;
    historyMessage += `📄 Page ${page}/${history.totalPages} (${history.totalCount} total winners)\n\n`;
    
    history.winners.forEach((winner, index) => {
      const position = skip + index + 1;
      const emoji = position === 1 ? '👑' : position <= 3 ? '🏆' : '🎖️';
      
      historyMessage += `${emoji} ${position}. @${winner.userPhone}\n`;
      historyMessage += `   📅 Date: ${winner.date}\n`;
      historyMessage += `   ⭐ Average: ${winner.averageRating.toFixed(1)}/10\n`;
      historyMessage += `   🗳️ Ratings: ${winner.ratingCount}\n`;
      historyMessage += `   💰 Prize: ₦${winner.prize.toLocaleString()}\n\n`;
    });
    
    if (history.totalPages > 1) {
      historyMessage += `📖 Use ${config.PREFIX}wcwhistory <page> to view other pages`;
    }
    
    const mentions = history.winners.map(w => w.userId);
    
    await sock.sendMessage(m.from, { 
      text: historyMessage,
      mentions: mentions
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Error getting WCW history:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Error retrieving WCW history!' });
  }
}

async function handleWCWLeaderboardCommand(m, sock, config) {
  try {
    const leaderboard = await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.aggregate([
        { $group: {
          _id: '$userId',
          userPhone: { $first: '$userPhone' },
          totalWins: { $sum: 1 },
          totalPrizes: { $sum: '$prize' },
          avgRating: { $avg: '$averageRating' },
          lastWin: { $max: '$createdAt' }
        }},
        { $sort: { totalWins: -1, avgRating: -1 } },
        { $limit: 20 }
      ]).toArray();
    }, WCW_WINNERS_COLLECTION);
    
    if (leaderboard.length === 0) {
      await sock.sendMessage(m.from, { text: '🏆 No WCW winners yet! Be the first to make history!' });
      return;
    }
    
    let leaderMessage = `🏆 WCW ALL-TIME LEADERBOARD 🏆\n`;
    leaderMessage += `👑 Greatest Queens of All Time\n\n`;
    
    leaderboard.forEach((queen, index) => {
      const position = index + 1;
      const emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      
      leaderMessage += `${emoji} ${position}. @${queen.userPhone}\n`;
      leaderMessage += `   🏆 Wins: ${queen.totalWins}\n`;
      leaderMessage += `   ⭐ Avg Rating: ${queen.avgRating.toFixed(1)}/10\n`;
      leaderMessage += `   💰 Total Prizes: ₦${queen.totalPrizes.toLocaleString()}\n`;
      leaderMessage += `   📅 Last Win: ${new Date(queen.lastWin).toLocaleDateString()}\n\n`;
    });
    
    leaderMessage += `👑 Hall of Fame - Top 20 WCW Queens!`;
    
    const mentions = leaderboard.map(q => q._id);
    
    await sock.sendMessage(m.from, { 
      text: leaderMessage,
      mentions: mentions
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Error getting WCW leaderboard:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Error retrieving WCW leaderboard!' });
  }