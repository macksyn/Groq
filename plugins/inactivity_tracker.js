// plugins/inactivity_tracker.js
// Tracks user activity and sends DMs to inactive members

import { PluginHelpers } from '../lib/pluginIntegration.js';

// ===== COLLECTIONS =====
const COLLECTIONS = {
  USER_ACTIVITY: 'user_activity',
  INACTIVITY_SETTINGS: 'inactivity_settings'
};

// ===== DEFAULT SETTINGS =====
const defaultGroupSettings = {
  enabled: false,
  inactiveDays: 7, // Days of inactivity before sending DM
  dmMessage: 'Hi @{user}! 👋\n\nWe noticed you haven\'t been active in {groupName} for {days} days. We miss you! 💙\n\nIs everything okay? Feel free to jump back in anytime!',
  checkInterval: 24, // Hours between checks (default: daily)
  maxReminders: 3, // Maximum reminders per user
  reminderInterval: 7, // Days between reminders
  excludeAdmins: false
};

// ===== SETTINGS MANAGEMENT =====
async function getGroupSettings(groupJid) {
  try {
    const settings = await PluginHelpers.safeDBOperation(async (db, collection) => {
      if (!collection) return null;
      const result = await collection.findOne({ groupJid });
      return result || null;
    }, COLLECTIONS.INACTIVITY_SETTINGS);

    return settings ? { ...defaultGroupSettings, ...settings.settings } : { ...defaultGroupSettings };
  } catch (error) {
    console.error('Error loading inactivity settings:', error);
    return { ...defaultGroupSettings };
  }
}

async function saveGroupSettings(groupJid, settings) {
  try {
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      if (!collection) return null;
      await collection.replaceOne(
        { groupJid },
        { 
          groupJid, 
          settings,
          updatedAt: new Date() 
        },
        { upsert: true }
      );
      return true;
    }, COLLECTIONS.INACTIVITY_SETTINGS);
    return true;
  } catch (error) {
    console.error('Error saving inactivity settings:', error);
    return false;
  }
}

// ===== ACTIVITY TRACKING =====
async function updateUserActivity(groupJid, userJid) {
  try {
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      if (!collection) return null;
      
      const activityKey = `${groupJid}:${userJid}`;
      
      await collection.updateOne(
        { activityKey },
        {
          $set: {
            groupJid,
            userJid,
            lastActivity: new Date(),
            updatedAt: new Date()
          },
          $setOnInsert: {
            firstSeen: new Date(),
            remindersSent: 0,
            lastReminderSent: null
          }
        },
        { upsert: true }
      );
      
      return true;
    }, COLLECTIONS.USER_ACTIVITY);
  } catch (error) {
    console.error('Error updating user activity:', error);
  }
}

async function getUserActivity(groupJid, userJid) {
  try {
    const activity = await PluginHelpers.safeDBOperation(async (db, collection) => {
      if (!collection) return null;
      
      const activityKey = `${groupJid}:${userJid}`;
      const result = await collection.findOne({ activityKey });
      
      return result;
    }, COLLECTIONS.USER_ACTIVITY);
    
    return activity;
  } catch (error) {
    console.error('Error getting user activity:', error);
    return null;
  }
}

async function getInactiveUsers(groupJid, inactiveDays) {
  try {
    const inactiveUsers = await PluginHelpers.safeDBOperation(async (db, collection) => {
      if (!collection) return [];
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);
      
      const results = await collection.find({
        groupJid,
        lastActivity: { $lt: cutoffDate }
      }).toArray();
      
      return results;
    }, COLLECTIONS.USER_ACTIVITY);
    
    return inactiveUsers || [];
  } catch (error) {
    console.error('Error getting inactive users:', error);
    return [];
  }
}

async function updateReminderSent(groupJid, userJid) {
  try {
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      if (!collection) return null;
      
      const activityKey = `${groupJid}:${userJid}`;
      
      await collection.updateOne(
        { activityKey },
        {
          $inc: { remindersSent: 1 },
          $set: { 
            lastReminderSent: new Date(),
            updatedAt: new Date()
          }
        }
      );
      
      return true;
    }, COLLECTIONS.USER_ACTIVITY);
  } catch (error) {
    console.error('Error updating reminder count:', error);
  }
}

// ===== MESSAGE FORMATTING =====
function formatMessage(template, replacements) {
  let message = template;
  for (const [key, value] of Object.entries(replacements)) {
    message = message.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  return message;
}

// ===== AUTHORIZATION CHECK =====
async function isAuthorized(sock, groupJid, userJid) {
  try {
    const ownerNumber = process.env.OWNER_NUMBER || '';
    const bareNumber = userJid.split('@')[0];
    
    // Check if owner
    if (bareNumber === ownerNumber) return true;
    
    // Check if group admin
    const groupMetadata = await sock.groupMetadata(groupJid);
    const participant = groupMetadata.participants.find(p => p.id === userJid);
    
    return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
  } catch (error) {
    console.error('Error checking authorization:', error);
    return false;
  }
}

async function isUserAdmin(sock, groupJid, userJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    const participant = groupMetadata.participants.find(p => p.id === userJid);
    
    return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
  } catch (error) {
    console.error('Error checking if user is admin:', error);
    return false;
  }
}

// ===== INACTIVITY CHECK HANDLER =====
async function checkInactiveUsers(sock, logger) {
  try {
    logger.info('🔍 Starting inactivity check...');
    
    // Get all groups with inactivity tracking enabled
    const allSettings = await PluginHelpers.safeDBOperation(async (db, collection) => {
      if (!collection) return [];
      return await collection.find({ 'settings.enabled': true }).toArray();
    }, COLLECTIONS.INACTIVITY_SETTINGS);
    
    if (!allSettings || allSettings.length === 0) {
      logger.info('No groups have inactivity tracking enabled.');
      return;
    }
    
    let totalDMsSent = 0;
    
    for (const groupConfig of allSettings) {
      const { groupJid, settings } = groupConfig;
      
      try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(groupJid);
        const groupName = groupMetadata.subject;
        
        // Get inactive users
        const inactiveUsers = await getInactiveUsers(groupJid, settings.inactiveDays);
        
        logger.info(`Found ${inactiveUsers.length} inactive users in ${groupName}`);
        
        for (const activity of inactiveUsers) {
          const { userJid, remindersSent, lastReminderSent, lastActivity } = activity;
          
          // Check if max reminders reached
          if (remindersSent >= settings.maxReminders) {
            logger.info(`Max reminders reached for ${userJid.split('@')[0]} in ${groupName}`);
            continue;
          }
          
          // Check if enough time has passed since last reminder
          if (lastReminderSent) {
            const daysSinceLastReminder = Math.floor((Date.now() - new Date(lastReminderSent).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceLastReminder < settings.reminderInterval) {
              logger.info(`Too soon to remind ${userJid.split('@')[0]} in ${groupName} (${daysSinceLastReminder} days since last reminder)`);
              continue;
            }
          }
          
          // Check if user is admin and should be excluded
          if (settings.excludeAdmins) {
            const isAdmin = await isUserAdmin(sock, groupJid, userJid);
            if (isAdmin) {
              logger.info(`Skipping admin ${userJid.split('@')[0]} in ${groupName}`);
              continue;
            }
          }
          
          // Calculate days inactive
          const daysInactive = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
          
          // Format and send DM
          const userName = userJid.split('@')[0];
          const message = formatMessage(settings.dmMessage, {
            user: userName,
            groupName: groupName,
            days: daysInactive
          });
          
          try {
            await sock.sendMessage(userJid, {
              text: message
            });
            
            // Update reminder count
            await updateReminderSent(groupJid, userJid);
            
            totalDMsSent++;
            logger.info(`✅ Sent inactivity DM to ${userName} (${daysInactive} days inactive in ${groupName})`);
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
          } catch (dmError) {
            logger.error(`Failed to send DM to ${userName}:`, dmError);
          }
        }
        
      } catch (groupError) {
        logger.error(`Error processing group ${groupJid}:`, groupError);
      }
    }
    
    logger.info(`✅ Inactivity check complete. Sent ${totalDMsSent} DMs.`);
    
  } catch (error) {
    logger.error('Error in inactivity check:', error);
  }
}

// ===== COMMAND HANDLERS =====
async function showMenu(m, sock, prefix) {
  const menuText = `💤 *INACTIVITY TRACKER*\n\n` +
    `📊 *Admin Commands:*\n` +
    `• *${prefix}inactive on/off* - Toggle tracking\n` +
    `• *${prefix}inactivedays [number]* - Set inactive days threshold\n` +
    `• *${prefix}inactivemsg [text]* - Set DM message\n` +
    `• *${prefix}maxreminders [number]* - Set max reminders per user\n` +
    `• *${prefix}reminderinterval [days]* - Days between reminders\n` +
    `• *${prefix}excludeadmins on/off* - Exclude admins from tracking\n` +
    `• *${prefix}inactivestats* - View inactive users\n` +
    `• *${prefix}inactivestatus* - View current settings\n` +
    `• *${prefix}resetinactive @user* - Reset user's activity\n` +
    `• *${prefix}checkinactive* - Manual inactivity check\n\n` +
    `💡 *Message Variables:*\n` +
    `• {user} - User's name\n` +
    `• {groupName} - Group name\n` +
    `• {days} - Days inactive\n\n` +
    `📝 *Example:*\n` +
    `${prefix}inactivemsg Hi @{user}! We miss you in {groupName}! 💙`;
  
  await sock.sendMessage(m.chat, { text: menuText }, { quoted: m });
}

async function handleToggleInactive(m, sock, args, logger) {
  const groupJid = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;
  
  if (!groupJid.endsWith('@g.us')) {
    return m.reply('❌ This command only works in groups.');
  }
  
  if (!(await isAuthorized(sock, groupJid, senderId))) {
    return m.reply('🔒 Only group admins can use this command.');
  }
  
  if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
    return m.reply('⚠️ Usage: Use *on* or *off*');
  }
  
  const settings = await getGroupSettings(groupJid);
  settings.enabled = args[0].toLowerCase() === 'on';
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Inactivity tracking ${settings.enabled ? 'enabled' : 'disabled'}`);
  logger.info(`Inactivity tracking toggled ${settings.enabled ? 'on' : 'off'} in ${groupJid}`);
}

async function handleSetInactiveDays(m, sock, args, logger) {
  const groupJid = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;
  
  if (!groupJid.endsWith('@g.us')) {
    return m.reply('❌ This command only works in groups.');
  }
  
  if (!(await isAuthorized(sock, groupJid, senderId))) {
    return m.reply('🔒 Only group admins can use this command.');
  }
  
  const days = parseInt(args[0]);
  if (isNaN(days) || days < 1) {
    return m.reply('⚠️ Please provide a valid number of days (minimum 1).');
  }
  
  const settings = await getGroupSettings(groupJid);
  settings.inactiveDays = days;
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Inactivity threshold set to ${days} days`);
  logger.info(`Inactivity days set to ${days} in ${groupJid}`);
}

async function handleSetInactiveMessage(m, sock, args, logger) {
  const groupJid = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;
  
  if (!groupJid.endsWith('@g.us')) {
    return m.reply('❌ This command only works in groups.');
  }
  
  if (!(await isAuthorized(sock, groupJid, senderId))) {
    return m.reply('🔒 Only group admins can use this command.');
  }
  
  const message = args.join(' ');
  if (!message) {
    return m.reply('⚠️ Please provide a DM message.\n\nExample: Hi @{user}! We miss you in {groupName}!');
  }
  
  const settings = await getGroupSettings(groupJid);
  settings.dmMessage = message;
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Inactivity DM message updated!\n\nNew message:\n${message}`);
  logger.info(`Inactivity message updated in ${groupJid}`);
}

async function handleSetMaxReminders(m, sock, args, logger) {
  const groupJid = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;
  
  if (!groupJid.endsWith('@g.us')) {
    return m.reply('❌ This command only works in groups.');
  }
  
  if (!(await isAuthorized(sock, groupJid, senderId))) {
    return m.reply('🔒 Only group admins can use this command.');
  }
  
  const max = parseInt(args[0]);
  if (isNaN(max) || max < 1) {
    return m.reply('⚠️ Please provide a valid number (minimum 1).');
  }
  
  const settings = await getGroupSettings(groupJid);
  settings.maxReminders = max;
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Maximum reminders set to ${max} per user`);
  logger.info(`Max reminders set to ${max} in ${groupJid}`);
}

async function handleSetReminderInterval(m, sock, args, logger) {
  const groupJid = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;
  
  if (!groupJid.endsWith('@g.us')) {
    return m.reply('❌ This command only works in groups.');
  }
  
  if (!(await isAuthorized(sock, groupJid, senderId))) {
    return m.reply('🔒 Only group admins can use this command.');
  }
  
  const days = parseInt(args[0]);
  if (isNaN(days) || days < 1) {
    return m.reply('⚠️ Please provide a valid number of days (minimum 1).');
  }
  
  const settings = await getGroupSettings(groupJid);
  settings.reminderInterval = days;
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Reminder interval set to ${days} days`);
  logger.info(`Reminder interval set to ${days} in ${groupJid}`);
}

async function handleToggleExcludeAdmins(m, sock, args, logger) {
  const groupJid = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;
  
  if (!groupJid.endsWith('@g.us')) {
    return m.reply('❌ This command only works in groups.');
  }
  
  if (!(await isAuthorized(sock, groupJid, senderId))) {
    return m.reply('🔒 Only group admins can use this command.');
  }
  
  if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
    return m.reply('⚠️ Usage: Use *on* or *off*');
  }
  
  const settings = await getGroupSettings(groupJid);
  settings.excludeAdmins = args[0].toLowerCase() === 'on';
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Exclude admins ${settings.excludeAdmins ? 'enabled' : 'disabled'}`);
  logger.info(`Exclude admins toggled ${settings.excludeAdmins ? 'on' : 'off'} in ${groupJid}`);
}

async function handleInactiveStats(m, sock, logger) {
  const groupJid = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;
  
  if (!groupJid.endsWith('@g.us')) {
    return m.reply('❌ This command only works in groups.');
  }
  
  if (!(await isAuthorized(sock, groupJid, senderId))) {
    return m.reply('🔒 Only group admins can use this command.');
  }
  
  const settings = await getGroupSettings(groupJid);
  const inactiveUsers = await getInactiveUsers(groupJid, settings.inactiveDays);
  
  if (inactiveUsers.length === 0) {
    return m.reply(`✅ No inactive users found!\n\nAll members have been active within the last ${settings.inactiveDays} days.`);
  }
  
  let statsText = `💤 *INACTIVE USERS REPORT*\n\n`;
  statsText += `📊 Found ${inactiveUsers.length} inactive user(s):\n\n`;
  
  for (let i = 0; i < Math.min(inactiveUsers.length, 20); i++) {
    const activity = inactiveUsers[i];
    const userName = activity.userJid.split('@')[0];
    const daysInactive = Math.floor((Date.now() - new Date(activity.lastActivity).getTime()) / (1000 * 60 * 60 * 24));
    const reminders = activity.remindersSent || 0;
    
    statsText += `${i + 1}. @${userName}\n`;
    statsText += `   📅 Last active: ${daysInactive} days ago\n`;
    statsText += `   📧 Reminders sent: ${reminders}/${settings.maxReminders}\n\n`;
  }
  
  if (inactiveUsers.length > 20) {
    statsText += `\n... and ${inactiveUsers.length - 20} more`;
  }
  
  await sock.sendMessage(groupJid, { 
    text: statsText,
    mentions: inactiveUsers.slice(0, 20).map(a => a.userJid)
  }, { quoted: m });
  
  logger.info(`Inactive stats shown in ${groupJid}`);
}

async function handleStatus(m, sock, logger) {
  const groupJid = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;
  
  if (!groupJid.endsWith('@g.us')) {
    return m.reply('❌ This command only works in groups.');
  }
  
  if (!(await isAuthorized(sock, groupJid, senderId))) {
    return m.reply('🔒 Only group admins can use this command.');
  }
  
  const settings = await getGroupSettings(groupJid);
  const groupMetadata = await sock.groupMetadata(groupJid);
  
  const statusText = `📊 *INACTIVITY TRACKER STATUS*\n` +
    `🏷️ Group: ${groupMetadata.subject}\n\n` +
    `💤 Tracking: ${settings.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
    `📅 Inactive threshold: ${settings.inactiveDays} days\n` +
    `📧 Max reminders: ${settings.maxReminders} per user\n` +
    `⏰ Reminder interval: ${settings.reminderInterval} days\n` +
    `👑 Exclude admins: ${settings.excludeAdmins ? '✅ Yes' : '❌ No'}\n\n` +
    `💬 DM Message:\n${settings.dmMessage}`;
  
  await sock.sendMessage(groupJid, { text: statusText }, { quoted: m });
  logger.info(`Status shown in ${groupJid}`);
}

async function handleResetInactive(m, sock, logger) {
  const groupJid = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;
  
  if (!groupJid.endsWith('@g.us')) {
    return m.reply('❌ This command only works in groups.');
  }
  
  if (!(await isAuthorized(sock, groupJid, senderId))) {
    return m.reply('🔒 Only group admins can use this command.');
  }
  
  const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentionedJid) {
    return m.reply('⚠️ Please mention a user to reset their activity.\n\nExample: resetinactive @user');
  }
  
  await updateUserActivity(groupJid, mentionedJid);
  
  // Reset reminder count
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    if (!collection) return null;
    
    const activityKey = `${groupJid}:${mentionedJid}`;
    
    await collection.updateOne(
      { activityKey },
      {
        $set: { 
          remindersSent: 0,
          lastReminderSent: null,
          updatedAt: new Date()
        }
      }
    );
    
    return true;
  }, COLLECTIONS.USER_ACTIVITY);
  
  const userName = mentionedJid.split('@')[0];
  await m.reply(`✅ Activity reset for @${userName}`);
  logger.info(`Activity reset for ${userName} in ${groupJid}`);
}

async function handleManualCheck(m, sock, logger) {
  const groupJid = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;
  
  if (!groupJid.endsWith('@g.us')) {
    return m.reply('❌ This command only works in groups.');
  }
  
  if (!(await isAuthorized(sock, groupJid, senderId))) {
    return m.reply('🔒 Only group admins can use this command.');
  }
  
  await m.reply('🔍 Starting manual inactivity check...');
  
  await checkInactiveUsers(sock, logger);
  
  await m.reply('✅ Manual inactivity check completed!');
  logger.info(`Manual check triggered in ${groupJid}`);
}

// ===== V3 PLUGIN EXPORT =====
export default {
  name: 'Inactivity Tracker',
  version: '1.0.0',
  author: 'Alex Macksyn',
  description: 'Tracks user activity and sends DMs to inactive members',
  category: 'group',

  commands: ['inactive', 'inactivedays', 'inactivemsg', 'maxreminders', 'reminderinterval', 'excludeadmins', 'inactivestats', 'inactivestatus', 'resetinactive', 'checkinactive'],
  aliases: ['inact'],
  ownerOnly: false,

  // Enable tracking on all messages
  executeOnAllMessages: true,

  // Scheduled task for automatic checks
  scheduledTasks: [
    {
      name: 'inactivity-check',
      description: 'Check for inactive users and send DMs',
      schedule: '0 */24 * * *', // Every 24 hours
      async handler(context) {
        const { sock, logger } = context;
        try {
          logger.info('🔍 Running scheduled inactivity check...');
          await checkInactiveUsers(sock, logger);
          logger.info('✅ Scheduled inactivity check completed');
        } catch (error) {
          logger.error(error, '❌ Scheduled inactivity check failed');
        }
      }
    }
  ],

  async run(context) {
    const { msg: m, args, command, sock, logger, config } = context;

    try {
      // Add compatibility properties
      if (!m.sender) {
        m.sender = m.key.participant || m.key.remoteJid;
      }
      if (!m.chat) {
        m.chat = m.key.remoteJid;
      }

      // Track activity for all group messages (when no command)
      if (!command || !m.body?.startsWith(config.PREFIX)) {
        const groupJid = m.key.remoteJid;
        const userJid = m.key.participant || m.key.remoteJid;
        
        // Only track in groups
        if (groupJid.endsWith('@g.us')) {
          const settings = await getGroupSettings(groupJid);
          
          if (settings.enabled) {
            await updateUserActivity(groupJid, userJid);
          }
        }
        
        return; // Don't process further if no command
      }

      // Route commands
      switch (command.toLowerCase()) {
        case 'inactive':
        case 'inact':
          if (args.length === 0) {
            await showMenu(m, sock, config.PREFIX);
          } else {
            await handleToggleInactive(m, sock, args, logger);
          }
          break;

        case 'inactivedays':
          await handleSetInactiveDays(m, sock, args, logger);
          break;

        case 'inactivemsg':
          await handleSetInactiveMessage(m, sock, args, logger);
          break;

        case 'maxreminders':
          await handleSetMaxReminders(m, sock, args, logger);
          break;

        case 'reminderinterval':
          await handleSetReminderInterval(m, sock, args, logger);
          break;

        case 'excludeadmins':
          await handleToggleExcludeAdmins(m, sock, args, logger);
          break;

        case 'inactivestats':
          await handleInactiveStats(m, sock, logger);
          break;

        case 'inactivestatus':
          await handleStatus(m, sock, logger);
          break;

        case 'resetinactive':
          await handleResetInactive(m, sock, logger);
          break;

        case 'checkinactive':
          await handleManualCheck(m, sock, logger);
          break;

        default:
          await showMenu(m, sock, config.PREFIX);
      }
    } catch (error) {
      logger.error('Error in Inactivity Tracker plugin:', error);
      m.reply('❌ An error occurred while processing your request.');
    }
  }
};
