// plugins/welcome_goodbye.js
// Welcome and Goodbye plugin with customizable messages and DP support

import { PluginHelpers } from '../lib/pluginIntegration.js';

// ===== COLLECTIONS =====
const COLLECTIONS = {
  WELCOME_SETTINGS: 'welcome_settings'
};

// ===== DEFAULT SETTINGS =====
const defaultGroupSettings = {
  welcomeEnabled: false,
  goodbyeEnabled: false,
  welcomeMessage: '👋 Welcome to {groupName}, @{user}!\n\nWe\'re glad to have you here! 🎉',
  goodbyeMessage: '👋 Goodbye @{user}!\n\nWe\'ll miss you from {groupName}. Take care! 💙',
  dmOnLeave: false,
  dmMessage: 'Hi @{user}, we noticed you left {groupName}. We\'d love to know why you left. Feel free to share your feedback!',
  useProfilePic: false
};

// ===== SETTINGS MANAGEMENT =====
async function getGroupSettings(groupJid) {
  try {
    const settings = await PluginHelpers.safeDBOperation(async (db, collection) => {
      if (!collection) return null;
      const result = await collection.findOne({ groupJid });
      return result || null;
    }, COLLECTIONS.WELCOME_SETTINGS);

    return settings ? { ...defaultGroupSettings, ...settings.settings } : { ...defaultGroupSettings };
  } catch (error) {
    console.error('Error loading group settings:', error);
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
    }, COLLECTIONS.WELCOME_SETTINGS);
    return true;
  } catch (error) {
    console.error('Error saving group settings:', error);
    return false;
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

// ===== PROFILE PICTURE HELPER =====
async function getProfilePicture(sock, jid) {
  try {
    const ppUrl = await sock.profilePictureUrl(jid, 'image');
    return ppUrl;
  } catch (error) {
    // User might not have a profile picture
    return null;
  }
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

// ===== EVENT HANDLERS =====
async function handleWelcome(sock, groupJid, participants, logger) {
  try {
    const settings = await getGroupSettings(groupJid);
    
    if (!settings.welcomeEnabled) return;
    
    const groupMetadata = await sock.groupMetadata(groupJid);
    const groupName = groupMetadata.subject;
    
    for (const participant of participants) {
      const phone = participant.split('@')[0];
      const useAtToken = settings.welcomeMessage.includes('@{user}');
      const userReplacement = useAtToken ? phone : `@${phone}`;
      const message = formatMessage(settings.welcomeMessage, {
        user: userReplacement,
        groupName: groupName
      });
      
      if (settings.useProfilePic) {
        const ppUrl = await getProfilePicture(sock, participant);
        
        if (ppUrl) {
          await sock.sendMessage(groupJid, {
            image: { url: ppUrl },
            caption: message,
            mentions: [participant]
          });
        } else {
          await sock.sendMessage(groupJid, {
            text: message,
            mentions: [participant]
          });
        }
      } else {
        await sock.sendMessage(groupJid, {
          text: message,
          mentions: [participant]
        });
      }
      
      logger.info(`✅ Welcome message sent to ${userName} in ${groupName}`);
    }
  } catch (error) {
    logger.error('Error handling welcome:', error);
  }
}

async function handleGoodbye(sock, groupJid, participants, logger) {
  try {
    const settings = await getGroupSettings(groupJid);
    
    if (!settings.goodbyeEnabled) return;
    
    const groupMetadata = await sock.groupMetadata(groupJid);
    const groupName = groupMetadata.subject;
    
    for (const participant of participants) {
      const phone = participant.split('@')[0];
      const useAtToken = settings.goodbyeMessage.includes('@{user}');
      const userReplacement = useAtToken ? phone : `@${phone}`;
      const message = formatMessage(settings.goodbyeMessage, {
        user: userReplacement,
        groupName: groupName
      });
      
      // Send goodbye message in group
      if (settings.useProfilePic) {
        const ppUrl = await getProfilePicture(sock, participant);
        
        if (ppUrl) {
          await sock.sendMessage(groupJid, {
            image: { url: ppUrl },
            caption: message,
            mentions: [participant]
          });
        } else {
          await sock.sendMessage(groupJid, {
            text: message,
            mentions: [participant]
          });
        }
      } else {
        await sock.sendMessage(groupJid, {
          text: message,
          mentions: [participant]
        });
      }
      
      // Send DM if enabled
      if (settings.dmOnLeave) {
        try {
          const dmMessage = formatMessage(settings.dmMessage, {
            user: userName,
            groupName: groupName
          });
          
          await sock.sendMessage(participant, {
            text: dmMessage
          });
          
          logger.info(`✅ DM sent to ${userName} after leaving ${groupName}`);
        } catch (dmError) {
          logger.error(`Failed to send DM to ${userName}:`, dmError);
        }
      }
      
      logger.info(`✅ Goodbye message sent for ${userName} in ${groupName}`);
    }
  } catch (error) {
    logger.error('Error handling goodbye:', error);
  }
}

// ===== COMMAND HANDLERS =====
async function showMenu(m, sock, prefix) {
  const menuText = `👋 *WELCOME/GOODBYE SYSTEM*\n\n` +
    `📊 *Admin Commands:*\n` +
    `• *${prefix}welcome on/off* - Toggle welcome messages\n` +
    `• *${prefix}goodbye on/off* - Toggle goodbye messages\n` +
    `• *${prefix}welcomemsg [text]* - Set welcome message\n` +
    `• *${prefix}goodbyemsg [text]* - Set goodbye message\n` +
    `• *${prefix}dmonleave on/off* - Toggle DM on leave\n` +
    `• *${prefix}dmmsg [text]* - Set DM message\n` +
    `• *${prefix}usedp on/off* - Toggle profile picture\n` +
    `• *${prefix}welcometest* - Test welcome message\n` +
    `• *${prefix}goodbyetest* - Test goodbye message\n` +
    `• *${prefix}welcomestatus* - View current settings\n\n` +
    `💡 *Message Variables:*\n` +
    `• {user} - User's name\n` +
    `• {groupName} - Group name\n\n` +
    `📝 *Example:*\n` +
    `${prefix}welcomemsg Welcome @{user} to {groupName}! 🎉`;
  
  await sock.sendMessage(m.chat, { text: menuText }, { quoted: m });
}

async function handleToggleWelcome(m, sock, args, logger) {
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
  settings.welcomeEnabled = args[0].toLowerCase() === 'on';
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Welcome messages ${settings.welcomeEnabled ? 'enabled' : 'disabled'}`);
  logger.info(`Welcome toggled ${settings.welcomeEnabled ? 'on' : 'off'} in ${groupJid}`);
}

async function handleToggleGoodbye(m, sock, args, logger) {
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
  settings.goodbyeEnabled = args[0].toLowerCase() === 'on';
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Goodbye messages ${settings.goodbyeEnabled ? 'enabled' : 'disabled'}`);
  logger.info(`Goodbye toggled ${settings.goodbyeEnabled ? 'on' : 'off'} in ${groupJid}`);
}

async function handleSetWelcomeMessage(m, sock, args, logger) {
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
    return m.reply('⚠️ Please provide a welcome message.\n\nExample: Welcome @{user} to {groupName}!');
  }
  
  const settings = await getGroupSettings(groupJid);
  settings.welcomeMessage = message;
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Welcome message updated!\n\nNew message:\n${message}`);
  logger.info(`Welcome message updated in ${groupJid}`);
}

async function handleSetGoodbyeMessage(m, sock, args, logger) {
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
    return m.reply('⚠️ Please provide a goodbye message.\n\nExample: Goodbye @{user} from {groupName}!');
  }
  
  const settings = await getGroupSettings(groupJid);
  settings.goodbyeMessage = message;
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Goodbye message updated!\n\nNew message:\n${message}`);
  logger.info(`Goodbye message updated in ${groupJid}`);
}

async function handleToggleDM(m, sock, args, logger) {
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
  settings.dmOnLeave = args[0].toLowerCase() === 'on';
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ DM on leave ${settings.dmOnLeave ? 'enabled' : 'disabled'}`);
  logger.info(`DM on leave toggled ${settings.dmOnLeave ? 'on' : 'off'} in ${groupJid}`);
}

async function handleSetDMMessage(m, sock, args, logger) {
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
    return m.reply('⚠️ Please provide a DM message.\n\nExample: Hi @{user}, why did you leave {groupName}?');
  }
  
  const settings = await getGroupSettings(groupJid);
  settings.dmMessage = message;
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ DM message updated!\n\nNew message:\n${message}`);
  logger.info(`DM message updated in ${groupJid}`);
}

async function handleToggleDP(m, sock, args, logger) {
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
  settings.useProfilePic = args[0].toLowerCase() === 'on';
  
  await saveGroupSettings(groupJid, settings);
  
  await m.reply(`✅ Profile picture in messages ${settings.useProfilePic ? 'enabled' : 'disabled'}`);
  logger.info(`Profile picture toggled ${settings.useProfilePic ? 'on' : 'off'} in ${groupJid}`);
}

async function handleWelcomeTest(m, sock, logger) {
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
  const phone = senderId.split('@')[0];
  const useAtToken = settings.welcomeMessage.includes('@{user}');
  const userReplacement = useAtToken ? phone : `@${phone}`;

  const message = formatMessage(settings.welcomeMessage, {
    user: userReplacement,
    groupName: groupMetadata.subject
  });
  
  if (settings.useProfilePic) {
    const ppUrl = await getProfilePicture(sock, senderId);
    if (ppUrl) {
      await sock.sendMessage(groupJid, {
        image: { url: ppUrl },
        caption: `🧪 *Test Welcome Message:*\n\n${message}`,
        mentions: [senderId]
      });
    } else {
      await sock.sendMessage(groupJid, {
        text: `🧪 *Test Welcome Message:*\n\n${message}`,
        mentions: [senderId]
      });
    }
  } else {
    await sock.sendMessage(groupJid, {
      text: `🧪 *Test Welcome Message:*\n\n${message}`,
      mentions: [senderId]
    });
  }
  
  logger.info(`Test welcome message sent in ${groupJid}`);
}

async function handleGoodbyeTest(m, sock, logger) {
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
  const phone = senderId.split('@')[0];
  const useAtToken = settings.goodbyeMessage.includes('@{user}');
  const userReplacement = useAtToken ? phone : `@${phone}`;

  const message = formatMessage(settings.goodbyeMessage, {
    user: userReplacement,
    groupName: groupMetadata.subject
  });
  
  if (settings.useProfilePic) {
    const ppUrl = await getProfilePicture(sock, senderId);
    if (ppUrl) {
      await sock.sendMessage(groupJid, {
        image: { url: ppUrl },
        caption: `🧪 *Test Goodbye Message:*\n\n${message}`,
        mentions: [senderId]
      });
    } else {
      await sock.sendMessage(groupJid, {
        text: `🧪 *Test Goodbye Message:*\n\n${message}`,
        mentions: [senderId]
      });
    }
  } else {
    await sock.sendMessage(groupJid, {
      text: `🧪 *Test Goodbye Message:*\n\n${message}`,
      mentions: [senderId]
    });
  }
  
  logger.info(`Test goodbye message sent in ${groupJid}`);
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
  
  const statusText = `📊 *WELCOME/GOODBYE STATUS*\n` +
    `🏷️ Group: ${groupMetadata.subject}\n\n` +
    `👋 Welcome: ${settings.welcomeEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
    `💬 Welcome Message:\n${settings.welcomeMessage}\n\n` +
    `👋 Goodbye: ${settings.goodbyeEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
    `💬 Goodbye Message:\n${settings.goodbyeMessage}\n\n` +
    `📩 DM on Leave: ${settings.dmOnLeave ? '✅ Enabled' : '❌ Disabled'}\n` +
    `💬 DM Message:\n${settings.dmMessage}\n\n` +
    `📸 Use Profile Pic: ${settings.useProfilePic ? '✅ Yes' : '❌ No'}`;
  
  await sock.sendMessage(groupJid, { text: statusText }, { quoted: m });
  logger.info(`Status shown in ${groupJid}`);
}

// ===== V3 PLUGIN EXPORT =====
export default {
  name: 'Welcome/Goodbye System',
  version: '1.0.0',
  author: 'Alex Macksyn',
  description: 'Automatic welcome and goodbye messages with customization and DP support',
  category: 'group',

  commands: ['welcome', 'goodbye', 'welcomemsg', 'goodbyemsg', 'dmonleave', 'dmmsg', 'usedp', 'welcometest', 'goodbyetest', 'welcomestatus'],
  aliases: ['wel', 'bye'],
  ownerOnly: false,

  // Group event handlers
  groupEventHandlers: {
    'participants.add': async (sock, { id: groupJid, participants }, logger) => {
      await handleWelcome(sock, groupJid, participants, logger);
    },
    'participants.remove': async (sock, { id: groupJid, participants }, logger) => {
      await handleGoodbye(sock, groupJid, participants, logger);
    }
  },

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

      // Route commands
      switch (command.toLowerCase()) {
        case 'welcome':
        case 'wel':
          if (args.length === 0) {
            await showMenu(m, sock, config.PREFIX);
          } else {
            await handleToggleWelcome(m, sock, args, logger);
          }
          break;

        case 'goodbye':
        case 'bye':
          await handleToggleGoodbye(m, sock, args, logger);
          break;

        case 'welcomemsg':
          await handleSetWelcomeMessage(m, sock, args, logger);
          break;

        case 'goodbyemsg':
          await handleSetGoodbyeMessage(m, sock, args, logger);
          break;

        case 'dmonleave':
          await handleToggleDM(m, sock, args, logger);
          break;

        case 'dmmsg':
          await handleSetDMMessage(m, sock, args, logger);
          break;

        case 'usedp':
          await handleToggleDP(m, sock, args, logger);
          break;

        case 'welcometest':
          await handleWelcomeTest(m, sock, logger);
          break;

        case 'goodbyetest':
          await handleGoodbyeTest(m, sock, logger);
          break;

        case 'welcomestatus':
          await handleStatus(m, sock, logger);
          break;

        default:
          await showMenu(m, sock, config.PREFIX);
      }
    } catch (error) {
      logger.error('Error in Welcome/Goodbye plugin:', error);
      m.reply('❌ An error occurred while processing your request.');
    }
  }
};
