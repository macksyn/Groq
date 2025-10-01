// plugins/announcement_plugin.js - Announcement System compatible with PluginManager
// ✅ REFACTORED: Removed direct MongoClient import
import moment from 'moment-timezone';
// ✅ REFACTORED: Import the new helper for database access
import { getCollection } from '../lib/pluginIntegration.js';


// Plugin information export (UNCHANGED)
export const info = {
  name: 'Announcement System',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Official announcement system with silent member notifications and special formatting',
  commands: [
    {
      name: 'announce',
      aliases: ['announcement', 'ann'],
      description: 'Post an official announcement (Admin only)'
    },
    {
      name: 'announcehistory',
      aliases: ['annhistory'],
      description: 'View announcement history (Admin only)'
    },
    {
      name: 'announcesettings',
      aliases: ['annsettings'],
      description: 'Manage announcement settings (Admin only)'
    },
    {
      name: 'setmaingroup',
      aliases: ['settargetgroup'],
      description: 'Set target group for cross-group announcements (Admin only)'
    }
  ]
};

// ❌ REMOVED: Old MongoDB Configuration and connection variables
// const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
// const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
// let db = null;
// let mongoClient = null;

// ✅ REFACTORED: Collection names are kept for local use
const COLLECTIONS = {
  ANNOUNCEMENTS: 'announcements',
  SETTINGS: 'announcement_settings',
  SETUP_CODES: 'setup_codes' // Added for clarity
};


// ❌ REMOVED: The old initDatabase function is no longer needed.

// ✅ REFACTORED: handleSetMainGroup now uses getCollection
async function handleSetMainGroup(context, args) {
  const { reply, senderId, sock, from } = context;
  
  if (!from.endsWith('@g.us')) {
    await reply('❌ This command can only be used in groups.');
    return;
  }
  
  const isAdminUser = await isAuthorized(sock, from, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can set the target group.');
    return;
  }
  
  try {
    const settings = await loadGroupSettings(from);
    
    if (args.length === 0) {
      let helpMessage = `🎯 *Cross-Group Announcement Setup*\n\n`;
      
      if (settings.targetGroupJid) {
        try {
          const targetGroupMetadata = await sock.groupMetadata(settings.targetGroupJid);
          helpMessage += `*Current Target:* ${targetGroupMetadata.subject} ✅\n\n`;
        } catch (error) {
          helpMessage += `*Current Target:* Set but inaccessible ⚠️\n\n`;
        }
      } else {
        helpMessage += `*Current Target:* Same group (default) 📍\n\n`;
      }
      
      helpMessage += `*📋 Instructions:*\n`;
      helpMessage += `1. Add the bot to your main group\n`;
      helpMessage += `2. In the main group, type: \`${context.config.PREFIX}setmaingroup accept\`\n`;
      helpMessage += `3. The bot will provide a setup code\n`;
      helpMessage += `4. Come back here and use: \`${context.config.PREFIX}setmaingroup [setup-code]\`\n\n`;
      helpMessage += `*🔧 Other Commands:*\n`;
      helpMessage += `• \`${context.config.PREFIX}setmaingroup clear\` - Remove target group\n`;
      helpMessage += `• \`${context.config.PREFIX}setmaingroup status\` - Check current setup`;
      
      await reply(helpMessage);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    if (action === 'accept') {
      const setupCode = Math.random().toString(36).substr(2, 8).toUpperCase();
      
      const setupData = {
        groupJid: from,
        setupCode: setupCode,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      };
      
      const setupCodesCollection = await getCollection(COLLECTIONS.SETUP_CODES);
      await setupCodesCollection.insertOne(setupData);
      
      await reply(`🎯 *Target Group Setup*\n\n✅ This group is ready to receive announcements!\n\n🔑 *Setup Code:* \`${setupCode}\`\n\n📝 *Instructions:*\nGo to your admin group and use:\n\`${context.config.PREFIX}setmaingroup ${setupCode}\`\n\n⏰ Code expires in 10 minutes.`);
      return;
    }
    
    if (action === 'clear' || action === 'remove') {
      settings.targetGroupJid = null;
      await saveGroupSettings(from, settings);
      await reply('✅ Target group cleared. Announcements will now post to the same group.');
      return;
    }
    
    if (action === 'status') {
      let statusMessage = `🎯 *Cross-Group Status*\n\n`;
      
      if (settings.targetGroupJid) {
        try {
          const targetGroupMetadata = await sock.groupMetadata(settings.targetGroupJid);
          statusMessage += `✅ Target group is set to: *${targetGroupMetadata.subject}*\n\n`;
          statusMessage += `📤 Announcements from this admin group will be posted to the target group with silent mentions for all members.`;
        } catch (error) {
          statusMessage += `⚠️ Target group is set but cannot be accessed.\nThe group may have been deleted or the bot was removed.\n\n`;
          statusMessage += `Use \`${context.config.PREFIX}setmaingroup clear\` to reset.`;
        }
      } else {
        statusMessage += `📍 No target group set. Announcements post to the same group.\n\n`;
        statusMessage += `Use \`${context.config.PREFIX}setmaingroup\` to see setup instructions.`;
      }
      
      await reply(statusMessage);
      return;
    }
    
    const setupCode = action.toUpperCase();
    const setupCodesCollection = await getCollection(COLLECTIONS.SETUP_CODES);
    const setupData = await setupCodesCollection.findOne({
      setupCode: setupCode,
      expiresAt: { $gt: new Date() }
    });
    
    if (!setupData) {
      await reply('❌ Invalid or expired setup code. Please generate a new one from the target group.');
      return;
    }
    
    try {
      const targetGroupMetadata = await sock.groupMetadata(setupData.groupJid);
      
      settings.targetGroupJid = setupData.groupJid;
      await saveGroupSettings(from, settings);
      
      await setupCodesCollection.deleteOne({ _id: setupData._id });
      
      await reply(`✅ Target group set successfully!\n\n🎯 *Target:* ${targetGroupMetadata.subject}\n📤 Announcements from this group will now be posted to the target group.\n\n💡 Use \`${context.config.PREFIX}announce [message]\` to post cross-group announcements.`);
      
    } catch (error) {
      await reply('❌ Cannot access the target group. Make sure the bot is still in that group and try again.');
    }
    
  } catch (error) {
    await reply('❌ Error setting up target group. Please try again.');
    console.error('Set main group error:', error);
  }
}

// Set Nigeria timezone (UNCHANGED)
moment.tz.setDefault('Africa/Lagos');

// Default announcement settings (UNCHANGED)
const defaultSettings = {
  enabled: true,
  maxAnnouncementsPerDay: 10,
  cooldownMinutes: 5,
  includeTimestamp: true,
  includeFooter: true,
  customHeader: '📊 OFFICIAL ANNOUNCEMENT 📊',
  customFooter: '━━━━━━━━━━━━━━━━━━━━━\n🏢 GIST HQ Management',
  silentNotifications: true,
  saveHistory: true,
  targetGroupJid: null // For cross-group announcements
};

// Get current Nigeria time (UNCHANGED)
function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

// Get current date in Nigeria timezone (UNCHANGED)
function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

// Get all group members for silent tagging (UNCHANGED)
async function getGroupMembers(sock, groupJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    return groupMetadata.participants.map(participant => participant.id);
  } catch (error) {
    console.error('Error getting group members:', error);
    return [];
  }
}

// Check if user is authorized (admin or group admin) (UNCHANGED)
async function isAuthorized(sock, from, sender) {
  // Check owner/admin from environment
  const ownerNumber = process.env.OWNER_NUMBER || '';
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  
  if (sender.split('@')[0] === ownerNumber || adminNumbers.includes(sender.split('@')[0])) {
    return true;
  }
  
  // Check if user is group admin
  try {
    if (!from.endsWith('@g.us')) return false;
    
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(participant => participant.admin === 'admin' || participant.admin === 'superadmin')
      .map(participant => participant.id);

    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking group admin:', error);
    return false;
  }
}

// ✅ REFACTORED: Uses getCollection for safe, shared database access.
async function loadGroupSettings(groupJid) {
  try {
    const collection = await getCollection(COLLECTIONS.SETTINGS);
    const settings = await collection.findOne({ groupJid: groupJid });
    if (settings) {
      return { ...defaultSettings, ...settings.data };
    }
    return defaultSettings;
  } catch (error) {
    console.error('Error loading group settings:', error);
    return defaultSettings;
  }
}

// ✅ REFACTORED: Uses getCollection for safe, shared database access.
async function saveGroupSettings(groupJid, settings) {
  try {
    const collection = await getCollection(COLLECTIONS.SETTINGS);
    await collection.replaceOne(
      { groupJid: groupJid },
      { 
        groupJid: groupJid,
        data: settings, 
        updatedAt: new Date() 
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving group settings:', error);
  }
}

// ✅ REFACTORED: Uses getCollection for safe, shared database access.
async function checkLimits(groupJid, senderId, settings) {
  try {
    const now = new Date();
    const today = getCurrentDate();
    const announcementsCollection = await getCollection(COLLECTIONS.ANNOUNCEMENTS);
    
    // Check daily limit
    const todayCount = await announcementsCollection.countDocuments({
      groupJid: groupJid,
      date: today
    });
    
    if (todayCount >= settings.maxAnnouncementsPerDay) {
      return {
        allowed: false,
        reason: `Daily limit reached (${settings.maxAnnouncementsPerDay} announcements per day)`
      };
    }
    
    // Check cooldown
    const cooldownMs = settings.cooldownMinutes * 60 * 1000;
    const lastAnnouncement = await announcementsCollection.findOne(
      { groupJid: groupJid },
      { sort: { createdAt: -1 } }
    );
    
    if (lastAnnouncement && (now - lastAnnouncement.createdAt) < cooldownMs) {
      const remainingMinutes = Math.ceil((cooldownMs - (now - lastAnnouncement.createdAt)) / (1000 * 60));
      return {
        allowed: false,
        reason: `Please wait ${remainingMinutes} more minute(s) before next announcement`
      };
    }
    
    return { allowed: true };
  } catch (error) {
    console.error('Error checking limits:', error);
    return { allowed: true }; // Allow on error
  }
}

// Format announcement message (UNCHANGED)
function formatAnnouncementMessage(content, settings, groupName = null) {
  const nigeriaTime = getNigeriaTime();
  const timeStr = nigeriaTime.format('MMMM DD, YYYY [at] h:mm A');
  
  let message = '';
  
  // Header
  message += `${settings.customHeader}\n\n`;
  
  // Main content
  message += `📢 ${content}\n\n`;
  
  // Timestamp (without notification line)
  if (settings.includeTimestamp) {
    message += `📅 Posted: ${timeStr}\n\n`;
  }
  
  // Footer
  if (settings.includeFooter) {
    message += settings.customFooter;
  }
  
  return message;
}

// ✅ REFACTORED: Uses getCollection for safe, shared database access.
async function postAnnouncement(sock, sourceGroupJid, content, senderId, senderName = null, targetGroupJid = null) {
  try {
    const finalTargetJid = targetGroupJid || sourceGroupJid;
    
    const settings = await loadGroupSettings(sourceGroupJid);
    
    if (!settings.enabled) {
      return {
        success: false,
        message: '❌ Announcements are disabled for this group'
      };
    }
    
    const limitCheck = await checkLimits(finalTargetJid, senderId, settings);
    if (!limitCheck.allowed) {
      return {
        success: false,
        message: `⏰ ${limitCheck.reason}`
      };
    }
    
    let groupName = 'Group';
    try {
      const groupMetadata = await sock.groupMetadata(finalTargetJid);
      groupName = groupMetadata.subject;
    } catch (error) {
      console.log('Could not get target group name');
    }
    
    const announcementMessage = formatAnnouncementMessage(content, settings, groupName);
    
    let mentions = [];
    if (settings.silentNotifications) {
      mentions = await getGroupMembers(sock, finalTargetJid);
    }
    
    await sock.sendMessage(finalTargetJid, {
      text: announcementMessage,
      mentions: mentions // Silent notifications
    });
    
    if (settings.saveHistory) {
      const announcementDoc = {
        groupJid: finalTargetJid,
        groupName: groupName,
        sourceGroupJid: sourceGroupJid,
        content: content,
        senderId: senderId,
        senderName: senderName,
        formattedMessage: announcementMessage,
        memberCount: mentions.length,
        date: getCurrentDate(),
        createdAt: new Date()
      };
      
      const announcementsCollection = await getCollection(COLLECTIONS.ANNOUNCEMENTS);
      await announcementsCollection.insertOne(announcementDoc);
    }
    
    const { toWhatsAppJID } = await import('../lib/helpers.js');
    const logMessage = sourceGroupJid === finalTargetJid 
      ? `📢 Announcement posted to ${groupName} by ${toWhatsAppJID(senderId)}`
      : `📢 Cross-group announcement posted from ${toWhatsAppJID(sourceGroupJid)} to ${groupName} by ${toWhatsAppJID(senderId)}`;
    
    console.log(logMessage);
    
    return {
      success: true,
      message: null, 
      targetGroup: groupName,
      memberCount: mentions.length
    };
    
  } catch (error) {
    console.error('Error posting announcement:', error);
    return {
      success: false,
      message: '❌ Failed to post announcement. Please try again.'
    };
  }
}

// ✅ REFACTORED: Uses getCollection for safe, shared database access.
async function getAnnouncementHistory(groupJid, limit = 10) {
  try {
    const announcementsCollection = await getCollection(COLLECTIONS.ANNOUNCEMENTS);
    const announcements = await announcementsCollection
      .find({ groupJid: groupJid })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    
    return announcements;
  } catch (error) {
    console.error('Error getting announcement history:', error);
    return [];
  }
}

// =======================
// 🎯 COMMAND HANDLERS
// =======================

// ✅ REFACTORED: Main plugin handler no longer inits database.
export default async function announcementHandler(m, sock, config) {
  try {
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    
    const reply = async (text) => {
      await sock.sendMessage(from, { text }, { quoted: m });
    };
    
    switch (command) {
      case 'announce':
      case 'announcement':
      case 'ann':
        await handleAnnouncement({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'announcehistory':
      case 'annhistory':
        await handleAnnouncementHistory({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'announcesettings':
      case 'annsettings':
        await handleAnnouncementSettings({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'setmaingroup':
      case 'settargetgroup':
        await handleSetMainGroup({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
    }
  } catch (error) {
    console.error('❌ Announcement plugin error:', error);
  }
}

// All subsequent command handlers (handleAnnouncement, handleAnnouncementHistory, etc.)
// remain UNCHANGED. They already use the refactored helper functions, so no
// further changes are needed in them.

async function handleAnnouncement(context, args) {
  const { reply, senderId, sock, from } = context;
  
  if (!from.endsWith('@g.us')) {
    await reply('❌ Announcements can only be posted in groups.');
    return;
  }
  
  const isAdminUser = await isAuthorized(sock, from, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can post announcements.');
    return;
  }
  
  if (args.length === 0) {
    const settings = await loadGroupSettings(from);
    let helpMessage = `📢 *Announcement System*\n\nUsage: \`${context.config.PREFIX}announce [message]\`\n\nExample: \`${context.config.PREFIX}announce Please remember that our weekly meeting is tomorrow at 3 PM\`\n\n💡 This will notify all group members silently.`;
    
    if (settings.targetGroupJid) {
      try {
        const targetGroupMetadata = await sock.groupMetadata(settings.targetGroupJid);
        helpMessage += `\n\n🎯 *Target Group Set:* ${targetGroupMetadata.subject}\n📤 Announcements from this group will be posted to the target group.`;
      } catch (error) {
        helpMessage += `\n\n⚠️ Target group is set but cannot be accessed. Use \`${context.config.PREFIX}setmaingroup\` to update.`;
      }
    }
    
    await reply(helpMessage);
    return;
  }
  
  const content = args.join(' ');
  
  if (content.length < 5) {
    await reply('⚠️ Announcement content is too short. Please provide a meaningful message.');
    return;
  }
  
  if (content.length > 1000) {
    await reply('⚠️ Announcement content is too long. Please keep it under 1000 characters.');
    return;
  }
  
  let senderName = 'Admin';
  try {
    const contact = await sock.onWhatsApp(senderId);
    if (contact && contact[0] && contact[0].name) {
      senderName = contact[0].name;
    }
  } catch (error) {
    console.log('Could not get sender name');
  }
  
  const settings = await loadGroupSettings(from);
  const targetGroupJid = settings.targetGroupJid;
  
  const result = await postAnnouncement(sock, from, content, senderId, senderName, targetGroupJid);
  
  if (result.message) {
    await reply(result.message);
  } else if (targetGroupJid && result.success) {
    await reply(`✅ Announcement posted successfully to *${result.targetGroup}*!\n👥 ${result.memberCount} members notified`);
  }
}

async function handleAnnouncementHistory(context, args) {
  const { reply, senderId, sock, from } = context;
  
  if (!from.endsWith('@g.us')) {
    await reply('❌ This command can only be used in groups.');
    return;
  }
  
  const isAdminUser = await isAuthorized(sock, from, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can view announcement history.');
    return;
  }
  
  try {
    const limit = args[0] ? Math.min(Math.max(parseInt(args[0]), 1), 20) : 10;
    const announcements = await getAnnouncementHistory(from, limit);
    
    if (announcements.length === 0) {
      await reply('📜 *No announcement history found for this group.*');
      return;
    }
    
    let historyMessage = `📜 *ANNOUNCEMENT HISTORY* 📜\n\n`;
    historyMessage += `📊 Showing last ${announcements.length} announcements:\n\n`;
    
    announcements.forEach((ann, index) => {
      const timeAgo = moment(ann.createdAt).tz('Africa/Lagos').fromNow();
      const senderPhone = ann.senderId.split('@')[0];
      
      historyMessage += `${index + 1}. 📅 ${ann.date} (${timeAgo})\n`;
      historyMessage += `   👤 By: +${senderPhone}\n`;
      historyMessage += `   📢 "${ann.content.substring(0, 80)}${ann.content.length > 80 ? '...' : ''}"\n`;
      historyMessage += `   👥 Notified: ${ann.memberCount} members\n\n`;
    });
    
    historyMessage += `💡 Use: \`${context.config.PREFIX}announcehistory [number]\` to show more/less (max 20)`;
    
    await reply(historyMessage);
  } catch (error) {
    await reply('❌ Error loading announcement history. Please try again.');
    console.error('Announcement history error:', error);
  }
}

async function handleAnnouncementSettings(context, args) {
  const { reply, senderId, sock, from } = context;
  
  if (!from.endsWith('@g.us')) {
    await reply('❌ This command can only be used in groups.');
    return;
  }
  
  const isAdminUser = await isAuthorized(sock, from, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can manage announcement settings.');
    return;
  }
  
  try {
    const settings = await loadGroupSettings(from);
    
    if (args.length === 0) {
      let settingsMessage = `⚙️ *ANNOUNCEMENT SETTINGS* ⚙️\n\n`;
      settingsMessage += `📢 Status: ${settings.enabled ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `📊 Daily Limit: ${settings.maxAnnouncementsPerDay} announcements\n`;
      settingsMessage += `⏰ Cooldown: ${settings.cooldownMinutes} minutes\n`;
      settingsMessage += `🔔 Silent Notifications: ${settings.silentNotifications ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `📅 Include Timestamp: ${settings.includeTimestamp ? 'Yes ✅' : 'No ❌'}\n`;
      settingsMessage += `📝 Save History: ${settings.saveHistory ? 'Yes ✅' : 'No ❌'}\n`;
      
      if (settings.targetGroupJid) {
        try {
          const targetGroupMetadata = await sock.groupMetadata(settings.targetGroupJid);
          settingsMessage += `🎯 Target Group: ${targetGroupMetadata.subject} ✅\n`;
        } catch (error) {
          settingsMessage += `🎯 Target Group: Set but inaccessible ⚠️\n`;
        }
      } else {
        settingsMessage += `🎯 Target Group: Same group (default) 📍\n`;
      }
      
      settingsMessage += `\n`;
      
      settingsMessage += `🎨 *Current Header:*\n${settings.customHeader}\n\n`;
      settingsMessage += `🎨 *Current Footer:*\n${settings.customFooter}\n\n`;
      
      settingsMessage += `*📋 Available Commands:*\n`;
      settingsMessage += `• \`${context.config.PREFIX}annsettings enable/disable\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}annsettings limit [number]\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}annsettings cooldown [minutes]\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}annsettings notifications on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}annsettings timestamp on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}annsettings history on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}annsettings header [text]\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}annsettings footer [text]\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}annsettings reset\`\n\n`;
      settingsMessage += `*🎯 Cross-Group Commands:*\n`;
      settingsMessage += `• \`${context.config.PREFIX}setmaingroup\` - Set target group for announcements`;
      
      await reply(settingsMessage);
      return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args.slice(1).join(' ');
    
    let responseText = "";
    
    switch (setting) {
      case 'enable':
        settings.enabled = true;
        await saveGroupSettings(from, settings);
        responseText = "✅ Announcements enabled for this group";
        break;
        
      case 'disable':
        settings.enabled = false;
        await saveGroupSettings(from, settings);
        responseText = "❌ Announcements disabled for this group";
        break;
        
      case 'limit':
        if (!value || isNaN(value) || parseInt(value) < 1 || parseInt(value) > 50) {
          responseText = `⚠️ Invalid limit. Use: ${context.config.PREFIX}annsettings limit [1-50]`;
        } else {
          settings.maxAnnouncementsPerDay = parseInt(value);
          await saveGroupSettings(from, settings);
          responseText = `✅ Daily announcement limit set to ${parseInt(value)}`;
        }
        break;
        
      case 'cooldown':
        if (!value || isNaN(value) || parseInt(value) < 0 || parseInt(value) > 60) {
          responseText = `⚠️ Invalid cooldown. Use: ${context.config.PREFIX}annsettings cooldown [0-60] minutes`;
        } else {
          settings.cooldownMinutes = parseInt(value);
          await saveGroupSettings(from, settings);
          responseText = `✅ Announcement cooldown set to ${parseInt(value)} minutes`;
        }
        break;
        
      case 'notifications':
        if (value === 'on' || value === 'true' || value === 'yes') {
          settings.silentNotifications = true;
          await saveGroupSettings(from, settings);
          responseText = "✅ Silent notifications enabled 🔔\n\n*All members will be notified of announcements*";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          settings.silentNotifications = false;
          await saveGroupSettings(from, settings);
          responseText = "✅ Silent notifications disabled\n\n*Members won't receive notification alerts*";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}annsettings notifications on/off`;
        }
        break;
        
      case 'timestamp':
        if (value === 'on' || value === 'true' || value === 'yes') {
          settings.includeTimestamp = true;
          await saveGroupSettings(from, settings);
          responseText = "✅ Timestamps will be included in announcements";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          settings.includeTimestamp = false;
          await saveGroupSettings(from, settings);
          responseText = "✅ Timestamps will not be included in announcements";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}annsettings timestamp on/off`;
        }
        break;
        
      case 'history':
        if (value === 'on' || value === 'true' || value === 'yes') {
          settings.saveHistory = true;
          await saveGroupSettings(from, settings);
          responseText = "✅ Announcement history will be saved";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          settings.saveHistory = false;
          await saveGroupSettings(from, settings);
          responseText = "✅ Announcement history will not be saved";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}annsettings history on/off`;
        }
        break;
        
      case 'header':
        if (!value || value.length < 5) {
          responseText = `⚠️ Header too short. Use: ${context.config.PREFIX}annsettings header [your custom header]`;
        } else if (value.length > 100) {
          responseText = "⚠️ Header too long (max 100 characters)";
        } else {
          settings.customHeader = value;
          await saveGroupSettings(from, settings);
          responseText = `✅ Custom header updated:\n\n${value}`;
        }
        break;
        
      case 'footer':
        if (!value || value.length < 5) {
          responseText = `⚠️ Footer too short. Use: ${context.config.PREFIX}annsettings footer [your custom footer]`;
        } else if (value.length > 200) {
          responseText = "⚠️ Footer too long (max 200 characters)";
        } else {
          settings.customFooter = value;
          await saveGroupSettings(from, settings);
          responseText = `✅ Custom footer updated:\n\n${value}`;
        }
        break;
        
      case 'reset':
        await saveGroupSettings(from, defaultSettings);
        responseText = "✅ All announcement settings reset to default values";
        break;
        
      case 'cleartarget':
      case 'removetarget':
        settings.targetGroupJid = null;
        await saveGroupSettings(from, settings);
        responseText = "✅ Target group cleared. Announcements will now post to the same group.";
        break;
        
      default:
        responseText = "⚠️ Unknown setting. Use the command without arguments to see available options.";
    }
    
    await reply(responseText);
  } catch (error) {
    await reply('❌ Error updating announcement settings. Please try again.');
    console.error('Announcement settings error:', error);
  }
}

// ❌ REMOVED: initializePlugin is no longer needed.

// Export functions for external use (UNCHANGED)
export { 
  postAnnouncement,
  getAnnouncementHistory
};
