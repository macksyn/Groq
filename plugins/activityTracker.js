// plugins/activityTracker.js
// Silent background tracker - monitors activity only in enabled groups

import moment from 'moment-timezone';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// ===== V3 PLUGIN EXPORT =====
export default {
  // ============================================================
  // REQUIRED PLUGIN METADATA
  // ============================================================
  name: 'Activity Tracker (Background)',
  version: '1.0.0',
  author: 'Your Bot',
  description: 'Silent background tracker for group activity - only runs in enabled groups',
  category: 'utility',

  // ============================================================
  // NO COMMANDS - This is a silent tracker
  // ============================================================
  commands: [],
  aliases: [],
  ownerOnly: false,

  // ============================================================
  // CRITICAL: Enable background execution
  // ============================================================
  executeOnAllMessages: true,

  // ============================================================
  // SCHEDULED TASKS
  // ============================================================
  scheduledTasks: [
    {
      name: 'activity-cache-cleanup',
      description: 'Clean up activity cache to prevent memory leaks',
      schedule: '*/30 * * * *', // Every 30 minutes
      async handler(context) {
        const { logger } = context;
        try {
          const beforeSize = activityCache.size;
          
          const now = Date.now();
          for (const [key, data] of activityCache.entries()) {
            if (now - data.timestamp > cacheTimeout) {
              activityCache.delete(key);
            }
          }
          
          const afterSize = activityCache.size;
          logger.info(`🧹 Activity cache cleanup: ${beforeSize} → ${afterSize} entries`);
        } catch (error) {
          logger.error(error, '❌ Cache cleanup failed');
        }
      }
    },
    {
      name: 'monthly-reset-notification',
      description: 'Log monthly reset event',
      schedule: '0 0 1 * *', // First day of every month at midnight
      async handler(context) {
        const { logger } = context;
        try {
          const lastMonth = moment.tz('Africa/Lagos').subtract(1, 'month').format('MMMM YYYY');
          const newMonth = moment.tz('Africa/Lagos').format('MMMM YYYY');
          
          logger.info(`🎉 Monthly activity period ended: ${lastMonth}`);
          logger.info(`🎉 New monthly period started: ${newMonth}`);
          logger.info('📊 Leaderboard has been reset - fresh start!');
        } catch (error) {
          logger.error(error, '❌ Monthly reset notification failed');
        }
      }
    }
  ],

  // ============================================================
  // MAIN EXECUTION HANDLER
  // ============================================================
  async run(context) {
    const { msg: m } = context;

    // ============================================================
    // BACKGROUND TRACKING - Runs silently on every message
    // ============================================================
    
    try {
      // Track activity (function handles all validation internally)
      await trackActivity(m);
    } catch (error) {
      // Silent fail - don't log to avoid spam
      // Only log if it's a critical error
      if (error.message.includes('database')) {
        console.error('Critical activity tracking error:', error);
      }
    }
  }
};

// ===== EXPORT ALL FUNCTIONS FOR activityCommands.js =====

// ===== COLLECTIONS =====
const COLLECTIONS = {
  ACTIVITY_DATA: 'activity_tracking',
  ACTIVITY_SETTINGS: 'activity_settings',
  ENABLED_GROUPS: 'activity_enabled_groups'
};

// ===== TIMEZONE =====
moment.tz.setDefault('Africa/Lagos');

// ===== DEFAULT SETTINGS =====
const defaultSettings = {
  pointsPerMessage: 1,
  pointsPerSticker: 2,
  pointsPerVideo: 5,
  pointsPerVoiceNote: 3,
  pointsPerPoll: 5,
  pointsPerPhoto: 3,
  pointsPerAttendance: 10
};

// ===== IN-MEMORY CACHES =====
const activityCache = new Map();
const enabledGroupsCache = new Set();
const settingsCache = { data: null, timestamp: 0 };
const cacheTimeout = 60 * 1000; // 1 minute for real-time updates

// Cache cleanup to prevent memory leaks
function startCacheCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of activityCache.entries()) {
      if (now - data.timestamp > cacheTimeout) {
        activityCache.delete(userId);
      }
    }
  }, 60000); // Cleanup every minute
}

startCacheCleanup();

// ===== GROUP ENABLE/DISABLE =====
export async function isGroupEnabled(groupId) {
  // Check cache first
  if (enabledGroupsCache.has(groupId)) {
    return true;
  }

  try {
    const result = await PluginHelpers.safeDBOperation(async (db, collection) => {
      const group = await collection.findOne({ groupId, enabled: true });
      return !!group;
    }, COLLECTIONS.ENABLED_GROUPS);

    if (result) {
      enabledGroupsCache.add(groupId);
    }

    return result;
  } catch (error) {
    console.error('Error checking group status:', error);
    return false;
  }
}

export async function enableGroupTracking(groupId, groupName = '') {
  try {
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.updateOne(
        { groupId },
        { 
          $set: { 
            groupId,
            groupName,
            enabled: true,
            enabledAt: new Date(),
            updatedAt: new Date()
          } 
        },
        { upsert: true }
      );
    }, COLLECTIONS.ENABLED_GROUPS);

    enabledGroupsCache.add(groupId);
    console.log(`✅ Activity tracking enabled for group: ${groupId}`);
    return { success: true };
  } catch (error) {
    console.error('Error enabling group tracking:', error);
    return { success: false, error: error.message };
  }
}

export async function disableGroupTracking(groupId) {
  try {
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.updateOne(
        { groupId },
        { 
          $set: { 
            enabled: false,
            disabledAt: new Date(),
            updatedAt: new Date()
          } 
        }
      );
    }, COLLECTIONS.ENABLED_GROUPS);

    enabledGroupsCache.delete(groupId);
    console.log(`❌ Activity tracking disabled for group: ${groupId}`);
    return { success: true };
  } catch (error) {
    console.error('Error disabling group tracking:', error);
    return { success: false, error: error.message };
  }
}

export async function getEnabledGroups() {
  try {
    return await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.find({ enabled: true }).toArray();
    }, COLLECTIONS.ENABLED_GROUPS);
  } catch (error) {
    console.error('Error getting enabled groups:', error);
    return [];
  }
}

// ===== SETTINGS MANAGEMENT =====
export async function getSettings() {
  // Check cache first (5 minute cache)
  const now = Date.now();
  if (settingsCache.data && now - settingsCache.timestamp < cacheTimeout) {
    return settingsCache.data;
  }

  try {
    const finalSettings = await PluginHelpers.safeDBOperation(async (db, collection) => {
      const settings = await collection.findOne({ type: 'activity_tracker' });
      return settings ? { ...defaultSettings, ...settings.data } : { ...defaultSettings };
    }, COLLECTIONS.ACTIVITY_SETTINGS);
    
    // Update cache
    settingsCache.data = finalSettings;
    settingsCache.timestamp = now;
    
    return finalSettings;
  } catch (error) {
    console.error('Error loading activity settings:', error);
    return { ...defaultSettings };
  }
}

export async function saveSettings(settings) {
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.replaceOne(
      { type: 'activity_tracker' },
      { type: 'activity_tracker', data: settings, updatedAt: new Date() },
      { upsert: true }
    );
  }, COLLECTIONS.ACTIVITY_SETTINGS);

  // Invalidate cache
  settingsCache.data = null;
  settingsCache.timestamp = 0;
}

// ===== USER ACTIVITY MANAGEMENT =====
async function initUserActivity(userId, groupId) {
  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    if (!collection) return null;

    const currentMonth = moment.tz('Africa/Lagos').format('YYYY-MM');
    const activityId = `${userId}_${groupId}_${currentMonth}`;

    const existing = await collection.findOne({ activityId });

    if (!existing) {
      const newActivity = {
        activityId,
        userId,
        groupId,
        month: currentMonth,
        stats: {
          messages: 0,
          stickers: 0,
          videos: 0,
          voiceNotes: 0,
          polls: 0,
          photos: 0,
          attendance: 0
        },
        points: 0,
        lastSeen: new Date(),
        firstSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await collection.insertOne(newActivity);
      return newActivity;
    }

    return existing;
  }, COLLECTIONS.ACTIVITY_DATA);
}

export async function getUserActivity(userId, groupId, month = null) {
  const targetMonth = month || moment.tz('Africa/Lagos').format('YYYY-MM');
  const activityId = `${userId}_${groupId}_${targetMonth}`;

  // Check cache first
  if (activityCache.has(activityId)) {
    const cached = activityCache.get(activityId);
    if (Date.now() - cached.timestamp < cacheTimeout) {
      return cached.activity;
    }
  }

  const activity = await initUserActivity(userId, groupId);
  
  if (activity) {
    activityCache.set(activityId, {
      activity,
      timestamp: Date.now()
    });
  }

  return activity;
}

// Fresh query from database - used for stats display (no cache)
export async function getUserActivityFresh(userId, groupId, month = null) {
  const targetMonth = month || moment.tz('Africa/Lagos').format('YYYY-MM');
  const activityId = `${userId}_${groupId}_${targetMonth}`;

  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    let activity = await collection.findOne({ activityId });
    
    if (!activity) {
      // Initialize if doesn't exist
      activity = await initUserActivity(userId, groupId);
    }
    
    return activity;
  }, COLLECTIONS.ACTIVITY_DATA);
}
async function updateUserActivity(userId, groupId, updates) {
  const currentMonth = moment.tz('Africa/Lagos').format('YYYY-MM');
  const activityId = `${userId}_${groupId}_${currentMonth}`;

  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.updateOne(
      { activityId },
      { 
        $set: { 
          ...updates, 
          lastSeen: new Date(),
          updatedAt: new Date() 
        } 
      },
      { upsert: true }
    );

    // Invalidate cache
    activityCache.delete(activityId);
  }, COLLECTIONS.ACTIVITY_DATA);
}

// ===== MESSAGE TYPE DETECTION =====
function detectMessageType(m) {
  try {
    const message = m.message;
    if (!message) return null;

    if (message.imageMessage) return 'photo';
    if (message.videoMessage) return 'video';
    if (message.stickerMessage) return 'sticker';
    if (message.audioMessage && message.audioMessage.ptt) return 'voiceNote';
    if (message.pollCreationMessage || message.pollCreationMessageV2 || message.pollCreationMessageV3) return 'poll';
    if (message.conversation || message.extendedTextMessage) return 'message';

    return null;
  } catch (error) {
    return null;
  }
}

// ===== POINTS CALCULATION =====
function calculatePoints(activityType, settings) {
  switch (activityType) {
    case 'message': return settings.pointsPerMessage;
    case 'sticker': return settings.pointsPerSticker;
    case 'video': return settings.pointsPerVideo;
    case 'voiceNote': return settings.pointsPerVoiceNote;
    case 'poll': return settings.pointsPerPoll;
    case 'photo': return settings.pointsPerPhoto;
    case 'attendance': return settings.pointsPerAttendance;
    default: return 0;
  }
}

// ===== MAIN TRACKING LOGIC =====
async function trackActivity(m) {
  try {
    const chatId = m.key.remoteJid;
    
    // CRITICAL: Only track in groups
    if (!chatId.endsWith('@g.us')) return;

    // CRITICAL: Only track in enabled groups (CPU saver)
    const enabled = await isGroupEnabled(chatId);
    if (!enabled) return;

    const senderId = m.key.participant || m.key.remoteJid;
    
    // Don't track bot messages
    if (senderId.includes('bot')) return;

    const messageType = detectMessageType(m);
    if (!messageType) return;

    // Get current settings
    const settings = await getSettings();

    // Get current activity data
    const activity = await getUserActivity(senderId, chatId);
    if (!activity) return;

    // Update statistics
    const stats = { ...activity.stats };
    const statsKey = {
      'message': 'messages',
      'sticker': 'stickers',
      'video': 'videos',
      'voiceNote': 'voiceNotes',
      'poll': 'polls',
      'photo': 'photos'
    }[messageType];

    if (statsKey) {
      stats[statsKey] = (stats[statsKey] || 0) + 1;
    }

    // Calculate new points
    const pointsEarned = calculatePoints(messageType, settings);
    const newPoints = (activity.points || 0) + pointsEarned;

    // Update activity
    await updateUserActivity(senderId, chatId, {
      stats,
      points: newPoints
    });

  } catch (error) {
    // Silent fail - don't spam logs
    console.error('Activity tracking error:', error);
  }
}

// ===== ATTENDANCE INTEGRATION =====
export async function recordAttendance(userId, groupId) {
  try {
    // Check if group tracking is enabled
    const enabled = await isGroupEnabled(groupId);
    if (!enabled) return;

    const settings = await getSettings();
    const activity = await getUserActivity(userId, groupId);
    if (!activity) return;

    const stats = { ...activity.stats };
    stats.attendance = (stats.attendance || 0) + 1;

    const pointsEarned = calculatePoints('attendance', settings);
    const newPoints = (activity.points || 0) + pointsEarned;

    await updateUserActivity(userId, groupId, {
      stats,
      points: newPoints
    });

    console.log(`✅ Attendance tracked for ${userId.split('@')[0]} (+${pointsEarned} points)`);
  } catch (error) {
    console.error('Error recording attendance:', error);
  }
}

// ===== LEADERBOARD FUNCTIONS =====
export async function getMonthlyLeaderboard(groupId, month = null, limit = 10) {
  const targetMonth = month || moment.tz('Africa/Lagos').format('YYYY-MM');

  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    const leaderboard = await collection
      .find({ groupId, month: targetMonth })
      .sort({ points: -1 })
      .limit(limit)
      .toArray();

    return leaderboard;
  }, COLLECTIONS.ACTIVITY_DATA);
}

export async function getUserRank(userId, groupId) {
  const currentMonth = moment.tz('Africa/Lagos').format('YYYY-MM');

  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    const allUsers = await collection
      .find({ groupId, month: currentMonth })
      .sort({ points: -1 })
      .toArray();

    const userIndex = allUsers.findIndex(u => u.userId === userId);
    const userActivity = allUsers[userIndex];

    return {
      rank: userIndex + 1,
      totalUsers: allUsers.length,
      activity: userActivity
    };
  }, COLLECTIONS.ACTIVITY_DATA);
}

export async function getInactiveMembers(groupId, limit = 10) {
  const currentMonth = moment.tz('Africa/Lagos').format('YYYY-MM');

  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    const inactives = await collection
      .find({ groupId, month: currentMonth })
      .sort({ points: 1, 'stats.messages': 1 })
      .limit(limit)
      .toArray();

    return inactives;
  }, COLLECTIONS.ACTIVITY_DATA);
}
