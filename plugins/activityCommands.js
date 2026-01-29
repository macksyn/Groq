// plugins/activityCommands.js
// Command interface for activity tracking system
// ===== V3 PLUGIN EXPORT =====
import moment from 'moment-timezone';
import { TimeHelpers } from '../lib/helpers.js';
import {
  getUserActivity,
  getUserActivityFresh,
  getUserRank,
  getMonthlyLeaderboard,
  getInactiveMembers,
  enableGroupTracking,
  disableGroupTracking,
  getEnabledGroups,
  getSettings,
  saveSettings,
  isGroupEnabled
} from './activityTracker.js';

export default {
  // ============================================================
  // REQUIRED PLUGIN METADATA
  // ============================================================
  name: 'Activity Commands',
  version: '1.0.0',
  author: 'Your Bot',
  description: 'Command interface for activity tracking system',
  category: 'utility',

  // ============================================================
  // COMMAND REGISTRATION
  // ============================================================
  commands: ['activity', 'leaderboard'],
  aliases: ['act', 'rank'],
  ownerOnly: false,

  // ============================================================
  // MAIN EXECUTION HANDLER
  // ============================================================
  async run(context) {
    const { msg: m, args, command, sock, config } = context;

    try {
      // ============================================================
      // COMMAND ROUTING
      // ============================================================

      switch (command.toLowerCase()) {
        case 'activity':
        case 'act':
          if (args.length === 0) {
            await showActivityMenu(async (text) => {
              await sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
            }, config.PREFIX);
          } else {
            await handleSubCommand(args[0], args.slice(1), context);
          }
          break;

        case 'leaderboard':
          await handleLeaderboard(context);
          break;

        case 'rank':
          await handleRank(context);
          break;

        default:
          // Should not reach here due to command mapping
          break;
      }
    } catch (error) {
      console.error('Activity command error:', error);
      const chatId = m.key.remoteJid;
      await sock.sendMessage(chatId, { 
        text: '❌ An error occurred while processing your command.' 
      }, { quoted: m });
    }
  }
};

// ===== AUTHORIZATION =====
async function isAuthorized(sock, from, sender) {
  const bareNumber = sender.split('@')[0];
  
  const ownerNumber = process.env.OWNER_NUMBER || '';
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  if (bareNumber === ownerNumber || adminNumbers.includes(bareNumber)) return true;
  
  if (!from.endsWith('@g.us')) return false;
  
  try {
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);
    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking group admin:', error);
    return false;
  }
}

// ===== COMMAND HANDLERS =====
async function showActivityMenu(reply, prefix) {
  await reply(
    `📊 *ACTIVITY TRACKER* 📊\n\n` +
    `👤 *User Commands:*\n` +
    `• *stats* - View your activity stats\n` +
    `• *rank* - Check your current rank\n` +
    `• *leaderboard* - View top 10 members\n` +
    `• *inactives* - View least active members\n` +
    `• *points* - View point values\n\n` +
    `👑 *Admin Commands:*\n` +
    `• *enable* - Enable tracking in this group\n` +
    `• *disable* - Disable tracking in this group\n` +
    `• *status* - Check if tracking is enabled\n` +
    `• *settings* - Configure point values\n` +
    `• *groups* - List all enabled groups (owner only)\n\n` +
    `🤖 *Auto-Tracking:*\n` +
    `All activities tracked automatically in enabled groups!\n\n` +
    `💡 *Usage:* ${prefix}activity [command]`
  );
}

async function handleStats(context) {
  const { msg: m, sock } = context;
  const senderId = m.key.participant || m.key.remoteJid;
  const chatId = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: m });

  if (!chatId.endsWith('@g.us')) {
    return reply('❌ This command only works in groups.');
  }

  // Check if tracking is enabled
  const enabled = await isGroupEnabled(chatId);
  if (!enabled) {
    return reply('❌ Activity tracking is not enabled in this group.\n\n💡 Admins can enable it with: .activity enable');
  }

  try {
      const activity = await getUserActivityFresh(senderId, chatId);
    
    if (!activity) {
      return reply('❌ No activity data found. Start interacting to get tracked!');
    }

    const currentMonth = moment.tz('Africa/Lagos').format('MMMM YYYY');
    const stats = activity.stats;

    // Calculate total messages as sum of all activity types
    const totalMessages = (stats.messages || 0) + (stats.stickers || 0) + (stats.videos || 0) + 
                         (stats.voiceNotes || 0) + (stats.polls || 0) + (stats.photos || 0) + 
                         (stats.attendance || 0);

    // Estimate last seen: if last message within 10 minutes, show 'Online'
    // Otherwise show relative time like "25 minutes ago" or "5h 34m ago"
    let lastSeenText = 'N/A';
    try {
      if (activity.lastSeen) {
        const lastSeenDate = new Date(activity.lastSeen);
        const diffMs = Date.now() - lastSeenDate.getTime();
        const TEN_MINUTES = 10 * 60 * 1000;
        if (diffMs <= TEN_MINUTES) {
          lastSeenText = '🟢 Online';
        } else {
          // Use formatDuration to show relative time
          const relativeTime = TimeHelpers.formatDuration(diffMs);
          lastSeenText = `${relativeTime} ago`;
        }
      }
    } catch (e) {
      lastSeenText = 'N/A';
    }

    let statsMessage = `📊 *YOUR ACTIVITY STATS* 📊\n\n` +
                      `📅 Month: ${currentMonth}\n` +
                      `⭐ Total Points: ${activity.points || 0}\n` +
                      `📝 Total Messages: ${totalMessages}\n\n` +
                      `   Text msgs: ${stats.messages || 0}\n` +
                      `   🎨 Stickers: ${stats.stickers || 0}\n` +
                      `   🎥 Videos: ${stats.videos || 0}\n` +
                      `   🎤 Voice Notes: ${stats.voiceNotes || 0}\n` +
                      `   📊 Polls: ${stats.polls || 0}\n` +
                      `   📸 Photos: ${stats.photos || 0}\n` +
                      `   ✅ Attendance: ${stats.attendance || 0}\n\n` +
                      `👁️ Last Seen: ${lastSeenText}\n` +
                      `📅 First Seen: ${moment(activity.firstSeen).tz('Africa/Lagos').format('DD/MM/YYYY')}`;

    await reply(statsMessage);
  } catch (error) {
    console.error('Stats error:', error);
    await reply('❌ Error loading stats. Please try again.');
  }
}

async function handleRank(context) {
  const { msg: m, sock } = context;
  const senderId = m.key.participant || m.key.remoteJid;
  const chatId = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: m });

  if (!chatId.endsWith('@g.us')) {
    return reply('❌ This command only works in groups.');
  }

  // Check if tracking is enabled
  const enabled = await isGroupEnabled(chatId);
  if (!enabled) {
    return reply('❌ Activity tracking is not enabled in this group.\n\n💡 Admins can enable it with: .activity enable');
  }

  try {
      const rankData = await getUserRank(senderId, chatId);
    
    if (!rankData || !rankData.activity) {
      return reply('❌ No ranking data available yet.');
    }

    const currentMonth = moment.tz('Africa/Lagos').format('MMMM YYYY');

    let rankMessage = `🏆 *YOUR RANK* 🏆\n\n` +
                     `📅 Month: ${currentMonth}\n` +
                     `🥇 Rank: #${rankData.rank} out of ${rankData.totalUsers}\n` +
                     `⭐ Points: ${rankData.activity.points || 0}\n\n`;

    if (rankData.rank === 1) {
      rankMessage += `🎉 *You're #1! Keep it up!*`;
    } else if (rankData.rank <= 3) {
      rankMessage += `🔥 *You're in top 3! Great job!*`;
    } else if (rankData.rank <= 10) {
      rankMessage += `💪 *You're in top 10! Keep climbing!*`;
    } else {
      rankMessage += `📈 *Keep participating to climb the ranks!*`;
    }

    await reply(rankMessage);
  } catch (error) {
    console.error('Rank error:', error);
    await reply('❌ Error loading rank. Please try again.');
  }
}

async function handleLeaderboard(context) {
  const { msg: m, sock } = context;
  const chatId = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: m });

  if (!chatId.endsWith('@g.us')) {
    return reply('❌ This command only works in groups.');
  }

  // Check if tracking is enabled
  const enabled = await isGroupEnabled(chatId);
  if (!enabled) {
    return reply('❌ Activity tracking is not enabled in this group.\n\n💡 Admins can enable it with: .activity enable');
  }

  try {
    const leaderboard = await getMonthlyLeaderboard(chatId);
    
    if (!leaderboard || leaderboard.length === 0) {
      return reply('❌ No leaderboard data available yet.');
    }

    const currentMonth = moment.tz('Africa/Lagos').format('MMMM YYYY');

    let leaderboardMessage = `🏆 *MONTHLY LEADERBOARD* 🏆\n\n` +
                            `📅 Month: ${currentMonth}\n\n`;

    const mentions = leaderboard.map(u => u.userId);

    leaderboard.forEach((user, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const phone = user.userId.split('@')[0];
      
      // Calculate total messages as sum of all activity types
      const totalMessages = (user.stats.messages || 0) + (user.stats.stickers || 0) + 
                           (user.stats.videos || 0) + (user.stats.voiceNotes || 0) + 
                           (user.stats.polls || 0) + (user.stats.photos || 0) + 
                           (user.stats.attendance || 0);
      
      leaderboardMessage += `${medal} @${phone}\n` +
                           `   ⭐ ${user.points} pts | 📝 ${totalMessages} total | ✅ ${user.stats.attendance || 0} att\n\n`;
    });

    leaderboardMessage += `💡 *Use .activity stats to see your detailed stats*`;

    await sock.sendMessage(chatId, { text: leaderboardMessage, mentions }, { quoted: m });
  } catch (error) {
    console.error('Leaderboard error:', error);
    await reply('❌ Error loading leaderboard. Please try again.');
  }
}

async function handleInactives(context, args) {
  const { msg: m, sock } = context;
  const chatId = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: m });

  if (!chatId.endsWith('@g.us')) {
    return reply('❌ This command only works in groups.');
  }

  // Check if tracking is enabled
  const enabled = await isGroupEnabled(chatId);
  if (!enabled) {
    return reply('❌ Activity tracking is not enabled in this group.\n\n💡 Admins can enable it with: .activity enable');
  }

  try {
    // Parse limit from args, default to 10, max 50
    let limit = 10;
    if (args && args[0]) {
      const parsedLimit = parseInt(args[0]);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 50);
      }
    }

    // Fetch all group members from WhatsApp
    let allGroupMembers = [];
    try {
      const groupMetadata = await sock.groupMetadata(chatId);
      allGroupMembers = groupMetadata.participants.map(p => p.id);
    } catch (error) {
      console.error('Error fetching group metadata:', error);
      return reply('❌ Unable to fetch group members. Please try again.');
    }

    // Get ALL members with activity records from DB (not limited)
    const allActivityMembers = await getInactiveMembers(chatId, 1000);
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    // Build inactivity data: only members inactive for 7+ days
    const inactivityData = [];

    allActivityMembers.forEach(member => {
      if (!member.lastSeen) return; // Skip if no lastSeen
      
      const lastSeenDate = new Date(member.lastSeen);
      const daysInactive = (Date.now() - lastSeenDate.getTime()) / (24 * 60 * 60 * 1000);

      // Only include if inactive for 7+ days
      if (daysInactive >= 7) {
        inactivityData.push({
          ...member,
          daysInactive,
          isSilent: false
        });
      }
    });

    // Add completely silent members (never chatted)
    const activeMemberIds = new Set(allActivityMembers.map(m => m.userId));
    const silentMembers = allGroupMembers.filter(memberId => !activeMemberIds.has(memberId));
    
    silentMembers.forEach(userId => {
      inactivityData.push({
        userId,
        points: 0,
        stats: { messages: 0, stickers: 0, videos: 0, voiceNotes: 0, polls: 0, photos: 0, attendance: 0 },
        daysInactive: Infinity, // Sort to top
        isSilent: true,
        lastSeen: null
      });
    });

    // Sort by days inactive (descending - longest inactive first)
    inactivityData.sort((a, b) => b.daysInactive - a.daysInactive);

    const inactives = inactivityData.slice(0, limit);

    if (inactives.length === 0) {
      return reply('✅ Great! All members have been active within the last 7 days.');
    }

    const currentMonth = moment.tz('Africa/Lagos').format('MMMM YYYY');

    let inactivesMessage = `😴 *INACTIVE MEMBERS (7+ DAYS)* 😴\n\n` +
                          `📅 Month: ${currentMonth}\n` +
                          `📊 Showing ${inactives.length} members\n\n`;

    const mentions = inactives.map(u => u.userId);

    inactives.forEach((user, index) => {
      let badge, durationText;
      
      if (user.isSilent) {
        badge = '⚫'; // Black for silent members (never chatted)
        durationText = '(Never chatted)';
      } else {
        // Color based on days inactive
        const days = Math.floor(user.daysInactive);
        if (days >= 30) {
          badge = '⚫'; // Black: 30+ days (more than a month)
          durationText = `(${days} days ago)`;
        } else if (days >= 21) {
          badge = '🔴'; // Red: 3+ weeks (21-30 days)
          durationText = `(${days} days ago)`;
        } else if (days >= 14) {
          badge = '🟠'; // Orange: 2+ weeks (14-21 days)
          durationText = `(${days} days ago)`;
        } else {
          badge = '🟡'; // Yellow: 1-2 weeks (7-14 days)
          durationText = `(${days} days ago)`;
        }
      }
      
      const phone = user.userId.split('@')[0];
      
      // Calculate total messages as sum of all activity types
      const totalMessages = (user.stats.messages || 0) + (user.stats.stickers || 0) + 
                           (user.stats.videos || 0) + (user.stats.voiceNotes || 0) + 
                           (user.stats.polls || 0) + (user.stats.photos || 0) + 
                           (user.stats.attendance || 0);
      
      inactivesMessage += `${badge} @${phone} ${durationText}\n` +
                         `   📝 ${totalMessages} total | ⭐ ${user.points} pts\n\n`;
    });

    inactivesMessage += `\n📌 *Legend:* 🟡 7-14 days | 🟠 2-3 weeks | 🔴 3-4 weeks | ⚫ 1+ month or never chatted\n` +
                       `💡 *Use .activity stats to see full details*`;

    await sock.sendMessage(chatId, { text: inactivesMessage, mentions }, { quoted: m });
  } catch (error) {
    console.error('Inactives error:', error);
    await reply('❌ Error loading inactives. Please try again.');
  }
}

async function handlePoints(context) {
  const { msg: m, sock } = context;
  const chatId = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: m });

  const settings = await getSettings();

  let pointsMessage = `⭐ *POINT VALUES* ⭐\n\n` +
                     `📝 Message: ${settings.pointsPerMessage} pt\n` +
                     `🎨 Sticker: ${settings.pointsPerSticker} pts\n` +
                     `🎥 Video: ${settings.pointsPerVideo} pts\n` +
                     `🎤 Voice Note: ${settings.pointsPerVoiceNote} pts\n` +
                     `📊 Poll: ${settings.pointsPerPoll} pts\n` +
                     `📸 Photo: ${settings.pointsPerPhoto} pts\n` +
                     `✅ Attendance: ${settings.pointsPerAttendance} pts\n\n` +
                     `💡 *Admins can modify these values with .activity settings*`;

  await reply(pointsMessage);
}

async function handleEnable(context) {
  const { msg: m, sock } = context;
  const senderId = m.key.participant || m.key.remoteJid;
  const chatId = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: m });

  if (!chatId.endsWith('@g.us')) {
    return reply('❌ This command only works in groups.');
  }

  if (!(await isAuthorized(sock, chatId, senderId))) {
    return reply('🚫 Only admins can use this command.');
  }

  try {
    // Check if already enabled
    const enabled = await isGroupEnabled(chatId);
    if (enabled) {
      return reply('✅ Activity tracking is already enabled in this group.');
    }

    // Get group name
    let groupName = 'Unknown Group';
    try {
      const groupMetadata = await sock.groupMetadata(chatId);
      groupName = groupMetadata.subject;
    } catch (error) {
      console.error('Error getting group name:', error);
    }

    // Enable tracking
    const result = await enableGroupTracking(chatId, groupName);

    if (result.success) {
      await reply(
        `✅ *Activity tracking enabled!*\n\n` +
        `📊 From now on, all group activities will be tracked:\n` +
        `• Messages, stickers, photos\n` +
        `• Videos, voice notes, polls\n` +
        `• Attendance records\n\n` +
        `💡 Use *.activity stats* to view your progress!`
      );
    } else {
      await reply(`❌ Failed to enable tracking: ${result.error}`);
    }
  } catch (error) {
    console.error('Enable error:', error);
    await reply('❌ An error occurred while enabling tracking.');
  }
}

async function handleDisable(context) {
  const { msg: m, sock } = context;
  const senderId = m.key.participant || m.key.remoteJid;
  const chatId = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: m });

  if (!chatId.endsWith('@g.us')) {
    return reply('❌ This command only works in groups.');
  }

  if (!(await isAuthorized(sock, chatId, senderId))) {
    return reply('🚫 Only admins can use this command.');
  }

  try {
    // Check if already disabled
    const enabled = await isGroupEnabled(chatId);
    if (!enabled) {
      return reply('❌ Activity tracking is already disabled in this group.');
    }

    // Disable tracking
    const result = await disableGroupTracking(chatId);

    if (result.success) {
      await reply(
        `❌ *Activity tracking disabled.*\n\n` +
        `📊 Tracking has stopped. Existing data is preserved.\n\n` +
        `💡 Re-enable anytime with *.activity enable*`
      );
    } else {
      await reply(`❌ Failed to disable tracking: ${result.error}`);
    }
  } catch (error) {
    console.error('Disable error:', error);
    await reply('❌ An error occurred while disabling tracking.');
  }
}

async function handleStatus(context) {
  const { msg: m, sock } = context;
  const chatId = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: m });

  if (!chatId.endsWith('@g.us')) {
    return reply('❌ This command only works in groups.');
  }

  try {
    const enabled = await isGroupEnabled(chatId);

    if (enabled) {
      await reply(
        `✅ *Activity tracking is ENABLED*\n\n` +
        `📊 All activities are being tracked.\n\n` +
        `💡 Use *.activity stats* to view your progress!`
      );
    } else {
      await reply(
        `❌ *Activity tracking is DISABLED*\n\n` +
        `📊 No activities are being tracked.\n\n` +
        `💡 Admins can enable with *.activity enable*`
      );
    }
  } catch (error) {
    console.error('Status error:', error);
    await reply('❌ An error occurred while checking status.');
  }
}

async function handleGroups(context) {
  const { msg: m, sock, config, helpers } = context;
  const senderId = m.key.participant || m.key.remoteJid;
  const chatId = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: m });

  // Owner only
  const { PermissionHelpers } = helpers;
  const isOwner = PermissionHelpers.isOwner(senderId, config.OWNER_NUMBER + '@s.whatsapp.net');
  
  if (!isOwner) {
    return reply('🚫 This command is for the bot owner only.');
  }

  try {
    const enabledGroups = await getEnabledGroups();

    if (!enabledGroups || enabledGroups.length === 0) {
      return reply('❌ No groups have activity tracking enabled yet.');
    }

    let groupList = `📊 *ACTIVITY TRACKING ENABLED GROUPS* 📊\n\n`;
    groupList += `Total: ${enabledGroups.length} groups\n\n`;

    enabledGroups.forEach((group, index) => {
      groupList += `${index + 1}. ${group.groupName || 'Unknown'}\n`;
      groupList += `   ID: ${group.groupId}\n`;
      groupList += `   Enabled: ${moment(group.enabledAt).tz('Africa/Lagos').format('DD/MM/YYYY')}\n\n`;
    });

    await reply(groupList);
  } catch (error) {
    console.error('Groups error:', error);
    await reply('❌ An error occurred while fetching groups.');
  }
}

async function handleSettings(context, args) {
  const { msg: m, sock } = context;
  const senderId = m.key.participant || m.key.remoteJid;
  const chatId = m.key.remoteJid;

  const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: m });

  if (!(await isAuthorized(sock, chatId, senderId))) {
    return reply('🚫 Only admins can use this command.');
  }

  const settings = await getSettings();

  if (args.length === 0) {
    let settingsMessage = `⚙️ *ACTIVITY SETTINGS* ⚙️\n\n` +
                         `📝 Message: ${settings.pointsPerMessage} pt\n` +
                         `🎨 Sticker: ${settings.pointsPerSticker} pts\n` +
                         `🎥 Video: ${settings.pointsPerVideo} pts\n` +
                         `🎤 Voice Note: ${settings.pointsPerVoiceNote} pts\n` +
                         `📊 Poll: ${settings.pointsPerPoll} pts\n` +
                         `📸 Photo: ${settings.pointsPerPhoto} pts\n` +
                         `✅ Attendance: ${settings.pointsPerAttendance} pts\n\n` +
                         `🔧 *Change Settings:*\n` +
                         `• *message [points]*\n• *sticker [points]*\n` +
                         `• *video [points]*\n• *voicenote [points]*\n` +
                         `• *poll [points]*\n• *photo [points]*\n• *attendance [points]*`;
    return reply(settingsMessage);
  }

  const setting = args[0].toLowerCase();
  const value = parseInt(args[1]);

  if (isNaN(value) || value < 0) {
    return reply('⚠️ Please specify a valid point value (0 or higher).');
  }

  const settingMap = {
    'message': 'pointsPerMessage',
    'sticker': 'pointsPerSticker',
    'video': 'pointsPerVideo',
    'voicenote': 'pointsPerVoiceNote',
    'poll': 'pointsPerPoll',
    'photo': 'pointsPerPhoto',
    'attendance': 'pointsPerAttendance'
  };

  if (settingMap[setting]) {
    settings[settingMap[setting]] = value;
    await saveSettings(settings);
    await reply(`✅ ${setting} points set to ${value}`);
  } else {
    await reply(`❓ Unknown setting: *${setting}*`);
  }
}

async function handleSubCommand(subCommand, args, context) {
  switch (subCommand.toLowerCase()) {
    case 'stats':
      await handleStats(context);
      break;
    case 'rank':
      await handleRank(context);
      break;
    case 'top':
    case 'leaderboard':
      await handleLeaderboard(context);
      break;
    case 'inactives':
    case 'inactive':
      await handleInactives(context, args);
      break;
    case 'points':
      await handlePoints(context);
      break;
    case 'enable':
      await handleEnable(context);
      break;
    case 'disable':
      await handleDisable(context);
      break;
    case 'status':
      await handleStatus(context);
      break;
    case 'groups':
      await handleGroups(context);
      break;
    case 'settings':
      await handleSettings(context, args);
      break;
    case 'help':
      await showActivityMenu(async (text) => {
        await context.sock.sendMessage(context.msg.key.remoteJid, { text }, { quoted: context.msg });
      }, context.config.PREFIX);
      break;
    default:
      const chatId = context.msg.key.remoteJid;
      await context.sock.sendMessage(chatId, { 
        text: `❓ Unknown activity command: *${subCommand}*\n\nUse *${context.config.PREFIX}activity help* to see available commands.` 
      }, { quoted: context.msg });
  }
}