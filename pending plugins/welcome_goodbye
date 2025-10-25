// plugins/welcome_goodbye.js - Handles member join/leave events and data reset.
import { getSharedDatabase, initSharedDatabase } from '../lib/pluginIntegration.js';

// --- PLUGIN INFORMATION ---
export const info = {
  name: 'Welcome & Goodbye Manager',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Manages welcome/goodbye messages and automatically resets user data upon leaving.',
  commands: [
    { name: 'welcome', description: 'Configure the welcome message.' },
    { name: 'goodbye', description: 'Configure the goodbye message and data reset.' }
  ]
};

// --- DATABASE CONFIGURATION ---
const COLLECTIONS = {
  // Core Economy Data
  ECONOMY_USERS: 'economy_users',
  ECONOMY_TRANSACTIONS: 'economy_transactions',
  // Rental Plugin Data
  RENTAL_TENANTS: 'tenants',
  RENTAL_PAYMENT_HISTORY: 'payment_history',
  // This Plugin's Settings
  WELCOME_SETTINGS: 'welcome_settings'
};

// Default settings for a new group
const defaultSettings = {
  welcomeEnabled: true,
  goodbyeEnabled: true,
  dataResetEnabled: true, // IMPORTANT: Controls the data wipe feature
  welcomeMessage: '👋 Welcome to *{groupName}*, @{user}!',
  goodbyeMessage: '👋 Goodbye @{user}, we hope to see you again!'
};

// Settings cache to reduce database calls
let settingsCache = {};

// --- CORE LOGIC ---

/**
 * Main handler for group participant update events.
 * This function is called by the bot's main event listener.
 * @param {object} event - The group update event object from the bot library.
 * @param {object} sock - The socket instance for sending messages.
 */
export async function groupParticipantsUpdateHandler(event, sock) {
  const { id, participants, action } = event;
  if (!id || !participants || !action) return;

  try {
    const db = await initSharedDatabase();
    if (!db) {
      console.error('❌ Welcome Plugin: Database not available.');
      return;
    }

    const settings = await loadSettings(id);

    if (action === 'add') {
      await handleWelcome(sock, id, participants, settings);
    } else if (action === 'remove') {
      await handleGoodbye(sock, id, participants, settings);
    }
  } catch (error) {
    console.error('❌ Error in groupParticipantsUpdateHandler:', error);
  }
}

/**
 * Handles sending a welcome message to new members.
 * @param {object} sock - The socket instance.
 * @param {string} groupId - The ID of the group.
 * @param {string[]} newMembers - An array of new member JIDs.
 * @param {object} settings - The group's settings.
 */
async function handleWelcome(sock, groupId, newMembers, settings) {
  if (!settings.welcomeEnabled) return;

  const groupMetadata = await sock.groupMetadata(groupId);
  const groupName = groupMetadata.subject;

  for (const memberId of newMembers) {
    const userMention = memberId.split('@')[0];
    const message = settings.welcomeMessage
      .replace('{user}', `@${userMention}`)
      .replace('{groupName}', groupName);

    console.log(`👋 Welcoming ${userMention} to ${groupName}`);
    await sock.sendMessage(groupId, { text: message, mentions: [memberId] });
  }
}

/**
 * Handles sending a goodbye message and resetting user data.
 * @param {object} sock - The socket instance.
 * @param {string} groupId - The ID of the group.
 * @param {string[]} removedMembers - An array of removed member JIDs.
 * @param {object} settings - The group's settings.
 */
async function handleGoodbye(sock, groupId, removedMembers, settings) {
  for (const memberId of removedMembers) {
    const userMention = memberId.split('@')[0];

    // --- Main Goal: Data Reset Logic ---
    if (settings.dataResetEnabled) {
      console.log(`🗑️ Resetting data for user ${userMention} from group ${groupId}`);
      await resetUserData(memberId, groupId);
    }

    // --- Send Goodbye Message ---
    if (settings.goodbyeEnabled) {
      const message = settings.goodbyeMessage.replace('{user}', `@${userMention}`);
      console.log(`👋 Saying goodbye to ${userMention} from ${groupId}`);
      await sock.sendMessage(groupId, { text: message, mentions: [memberId] });
    }
  }
}

/**
 * Deletes all known data for a specific user from MongoDB.
 * @param {string} userId - The JID of the user to reset.
 * @param {string} groupId - The ID of the group they left from.
 */
async function resetUserData(userId, groupId) {
  try {
    const db = getSharedDatabase();
    if (!db) throw new Error('Database connection is not available for data reset.');

    console.log(`[Data Reset] Starting data wipe for ${userId}`);

    // 1. Delete the main user document from the unified economy system
    const economyResult = await db.collection(COLLECTIONS.ECONOMY_USERS).deleteOne({ userId: userId });
    if (economyResult.deletedCount > 0) {
      console.log(`[Data Reset] Deleted user from ${COLLECTIONS.ECONOMY_USERS}.`);
    }

    // 2. Delete all transaction history for the user
    const transactionResult = await db.collection(COLLECTIONS.ECONOMY_TRANSACTIONS).deleteMany({ userId: userId });
    if (transactionResult.deletedCount > 0) {
      console.log(`[Data Reset] Deleted ${transactionResult.deletedCount} transactions from ${COLLECTIONS.ECONOMY_TRANSACTIONS}.`);
    }

    // 3. Delete the user's tenant record from the rental plugin
    const rentalResult = await db.collection(COLLECTIONS.RENTAL_TENANTS).deleteOne({ tenantId: userId, groupId: groupId });
    if (rentalResult.deletedCount > 0) {
      console.log(`[Data Reset] Deleted user from ${COLLECTIONS.RENTAL_TENANTS} for group ${groupId}.`);
    }

    // 4. Delete the user's rental payment history from the rental plugin
    const rentHistoryResult = await db.collection(COLLECTIONS.RENTAL_PAYMENT_HISTORY).deleteMany({ tenantId: userId, groupId: groupId });
    if (rentHistoryResult.deletedCount > 0) {
      console.log(`[Data Reset] Deleted ${rentHistoryResult.deletedCount} payment records from ${COLLECTIONS.RENTAL_PAYMENT_HISTORY}.`);
    }

    console.log(`[Data Reset] Successfully completed data wipe for ${userId}`);
  } catch (error) {
    console.error(`❌ Critical error during data reset for ${userId}:`, error);
  }
}


// --- COMMAND HANDLER ---

/**
 * Handles admin commands for configuring the plugin.
 * @param {object} m - The message object.
 * @param {object} sock - The socket instance.
 * @param {object} config - The bot's main config.
 */
export default async function welcomeGoodbyeCommandHandler(m, sock, config) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;

  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  const subCommand = args[1]?.toLowerCase();
  const text = args.slice(2).join(' ');

  if (!['welcome', 'goodbye'].includes(command)) return;

  const senderId = m.key.participant || m.key.remoteJid;
  const from = m.key.remoteJid;

  if (!from.endsWith('@g.us')) {
      return sock.sendMessage(from, { text: 'This command can only be used in groups.' }, { quoted: m });
  }

  // Admin check
  const groupMetadata = await sock.groupMetadata(from);
  const groupAdmins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
  if (!groupAdmins.includes(senderId)) {
    return sock.sendMessage(from, { text: '🚫 Only group admins can use this command.' }, { quoted: m });
  }

  const settings = await loadSettings(from);
  let replyMessage = '';

  if (command === 'welcome') {
    switch (subCommand) {
      case 'on':
        settings.welcomeEnabled = true;
        replyMessage = '✅ Welcome messages are now **ON**.';
        break;
      case 'off':
        settings.welcomeEnabled = false;
        replyMessage = '❌ Welcome messages are now **OFF**.';
        break;
      case 'message':
        if (!text) {
          replyMessage = `⚠️ Please provide a message.\n\n*Placeholders:*\n• *{user}* - Mentions the user\n• *{groupName}* - The group's name`;
        } else {
          settings.welcomeMessage = text;
          replyMessage = `✅ Welcome message updated successfully!`;
        }
        break;
      default:
        replyMessage = `⚙️ *Welcome Settings*\n\n• *Status:* ${settings.welcomeEnabled ? 'ON' : 'OFF'}\n• *Current Message:* ${settings.welcomeMessage}\n\n*Usage:*\n• \`${config.PREFIX}welcome on|off\`\n• \`${config.PREFIX}welcome message <your message>\``;
    }
  }

  if (command === 'goodbye') {
    switch (subCommand) {
      case 'on':
        settings.goodbyeEnabled = true;
        replyMessage = '✅ Goodbye messages are now **ON**.';
        break;
      case 'off':
        settings.goodbyeEnabled = false;
        replyMessage = '❌ Goodbye messages are now **OFF**.';
        break;
      case 'message':
        if (!text) {
          replyMessage = `⚠️ Please provide a message.\n\n*Placeholder:*\n• *{user}* - Mentions the user`;
        } else {
          settings.goodbyeMessage = text;
          replyMessage = `✅ Goodbye message updated successfully!`;
        }
        break;
      case 'reset':
        if (args[2]?.toLowerCase() === 'on') {
          settings.dataResetEnabled = true;
          replyMessage = '🗑️ **Data Reset is ON**. User data will be wiped when they leave.';
        } else if (args[2]?.toLowerCase() === 'off') {
          settings.dataResetEnabled = false;
          replyMessage = '🔒 **Data Reset is OFF**. User data will be preserved.';
        } else {
          replyMessage = '⚠️ Please specify `on` or `off` for the reset feature.';
        }
        break;
      default:
        replyMessage = `⚙️ *Goodbye Settings*\n\n• *Status:* ${settings.goodbyeEnabled ? 'ON' : 'OFF'}\n• *Data Reset:* ${settings.dataResetEnabled ? 'ON' : 'OFF'}\n• *Current Message:* ${settings.goodbyeMessage}\n\n*Usage:*\n• \`${config.PREFIX}goodbye on|off\`\n• \`${config.PREFIX}goodbye message <your message>\`\n• \`${config.PREFIX}goodbye reset on|off\``;
    }
  }

  if (replyMessage) {
    await saveSettings(from, settings);
    await sock.sendMessage(from, { text: replyMessage }, { quoted: m });
  }
}


// --- SETTINGS MANAGEMENT ---

/**
 * Loads settings for a specific group from the cache or database.
 * @param {string} groupId - The ID of the group.
 * @returns {Promise<object>} The settings object.
 */
async function loadSettings(groupId) {
  if (settingsCache[groupId]) {
    return settingsCache[groupId];
  }
  try {
    const db = getSharedDatabase();
    const settings = await db.collection(COLLECTIONS.WELCOME_SETTINGS).findOne({ groupId });
    settingsCache[groupId] = { ...defaultSettings, ...(settings?.data || {}) };
    return settingsCache[groupId];
  } catch (error) {
    console.error(`Error loading settings for ${groupId}:`, error);
    return { ...defaultSettings }; // Return defaults on error
  }
}

/**
 * Saves settings for a specific group to the database and updates the cache.
 * @param {string} groupId - The ID of the group.
 * @param {object} data - The settings data to save.
 */
async function saveSettings(groupId, data) {
  try {
    settingsCache[groupId] = data; // Update cache immediately
    const db = getSharedDatabase();
    await db.collection(COLLECTIONS.WELCOME_SETTINGS).replaceOne(
      { groupId },
      { groupId, data, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error(`Error saving settings for ${groupId}:`, error);
  }
}
