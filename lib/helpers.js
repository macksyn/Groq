// lib/helpers.js - Comprehensive utility functions for WhatsApp Bot
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// JID/LID Conversion and Management
// ============================================

/**
 * Convert LID to JID - Critical for group admin detection
 * WhatsApp uses LID (Local ID) in group metadata but JID for actual operations
 */
export function lidToJid(lid) {
  if (!lid) return null;
  
  // Already a JID format
  if (lid.includes('@s.whatsapp.net') || lid.includes('@g.us')) {
    return lid;
  }
  
  // Handle LID format (e.g., "1234567890:10@lid")
  if (lid.includes('@lid')) {
    // Extract the phone number part before the colon
    const phoneNumber = lid.split(':')[0];
    return phoneNumber + '@s.whatsapp.net';
  }
  
  // Handle plain number
  if (/^\d+$/.test(lid)) {
    return lid + '@s.whatsapp.net';
  }
  
  // Return as-is if we can't determine the format
  return lid;
}

/**
 * Normalize JID - Ensure consistent JID format
 */
export function normalizeJid(jid) {
  if (!jid) return null;
  
  // Remove any extra spaces
  jid = jid.trim();
  
  // Handle LID format
  if (jid.includes('@lid')) {
    return lidToJid(jid);
  }
  
  // Already normalized
  if (jid.includes('@s.whatsapp.net') || jid.includes('@g.us')) {
    return jid;
  }
  
  // Plain number - add suffix
  if (/^\d+$/.test(jid)) {
    return jid + '@s.whatsapp.net';
  }
  
  return jid;
}

/**
 * Extract phone number from JID
 */
export function extractNumber(jid) {
  if (!jid) return null;
  
  // Normalize first
  jid = normalizeJid(jid);
  
  // Extract number part
  return jid?.split('@')[0]?.split(':')[0] || null;
}

/**
 * Check if JID is a group
 */
export function isGroup(jid) {
  return jid?.includes('@g.us') || false;
}

/**
 * Get sender JID from message
 */
export function getSender(m) {
  if (!m) return null;
  
  // For group messages, get actual sender
  if (m.key?.participant) {
    return normalizeJid(m.key.participant);
  }
  
  // For direct messages
  if (m.key?.remoteJid) {
    return normalizeJid(m.key.remoteJid);
  }
  
  return null;
}

// ============================================
// Group Management Functions
// ============================================

/**
 * Get group metadata with proper admin detection
 */
export async function getGroupMetadata(sock, groupJid) {
  try {
    if (!isGroup(groupJid)) {
      throw new Error('Not a group JID');
    }
    
    const metadata = await sock.groupMetadata(groupJid);
    
    // Convert all participant IDs to proper JIDs
    if (metadata.participants) {
      metadata.participants = metadata.participants.map(participant => {
        // Convert LID to JID for proper comparison
        const jid = lidToJid(participant.id);
        
        return {
          ...participant,
          id: jid,
          originalId: participant.id, // Keep original for reference
          admin: participant.admin || participant.isAdmin || participant.isSuperAdmin || null,
          isSuperAdmin: participant.admin === 'superadmin' || participant.isSuperAdmin || false,
          isAdmin: participant.admin === 'admin' || participant.admin === 'superadmin' || 
                   participant.isAdmin || participant.isSuperAdmin || false
        };
      });
    }
    
    // Extract admin list with normalized JIDs
    metadata.admins = metadata.participants
      ?.filter(p => p.isAdmin)
      ?.map(p => p.id) || [];
    
    // Get owner/creator
    metadata.owner = metadata.participants
      ?.find(p => p.isSuperAdmin)?.id || metadata.owner;
    
    return metadata;
    
  } catch (error) {
    console.error(chalk.red('Error getting group metadata:'), error.message);
    throw error;
  }
}

/**
 * Check if user is group admin (handles LID conversion)
 */
export async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    const metadata = await getGroupMetadata(sock, groupJid);
    const normalizedUserJid = normalizeJid(userJid);
    
    // Check in admins array
    return metadata.admins.some(adminJid => 
      normalizeJid(adminJid) === normalizedUserJid
    );
    
  } catch (error) {
    console.error(chalk.red('Error checking admin status:'), error.message);
    return false;
  }
}

/**
 * Check if bot is group admin
 */
export async function isBotAdmin(sock, groupJid) {
  try {
    const botJid = sock.user?.id;
    if (!botJid) return false;
    
    return await isGroupAdmin(sock, groupJid, botJid);
    
  } catch (error) {
    console.error(chalk.red('Error checking bot admin status:'), error.message);
    return false;
  }
}

/**
 * Get group admins list with normalized JIDs
 */
export async function getGroupAdmins(sock, groupJid) {
  try {
    const metadata = await getGroupMetadata(sock, groupJid);
    return metadata.admins || [];
    
  } catch (error) {
    console.error(chalk.red('Error getting group admins:'), error.message);
    return [];
  }
}

/**
 * Get all groups where bot is present
 */
export async function getBotGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups);
    
  } catch (error) {
    console.error(chalk.red('Error fetching bot groups:'), error.message);
    return [];
  }
}

// ============================================
// Message Utility Functions
// ============================================

/**
 * Get quoted message from a message
 */
export function getQuotedMessage(m) {
  if (!m) return null;
  
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return null;
  
  return {
    message: quoted,
    sender: m.message?.extendedTextMessage?.contextInfo?.participant || null,
    stanzaId: m.message?.extendedTextMessage?.contextInfo?.stanzaId || null
  };
}

/**
 * Extract message text from various message types
 */
export function extractMessageText(m) {
  if (!m?.message) return '';
  
  const msg = m.message;
  
  return msg.conversation || 
         msg.extendedTextMessage?.text || 
         msg.imageMessage?.caption || 
         msg.videoMessage?.caption || 
         msg.documentMessage?.caption ||
         msg.buttonsResponseMessage?.selectedDisplayText ||
         msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
         msg.templateButtonReplyMessage?.selectedId ||
         '';
}

/**
 * Get message type
 */
export function getMessageType(m) {
  if (!m?.message) return null;
  
  const types = Object.keys(m.message);
  
  // Filter out metadata keys
  const messageType = types.find(type => 
    !['senderKeyDistributionMessage', 'messageContextInfo', 'protocolMessage'].includes(type)
  );
  
  return messageType || null;
}

/**
 * Check if message has media
 */
export function hasMedia(m) {
  const mediaTypes = [
    'imageMessage', 'videoMessage', 'audioMessage', 
    'documentMessage', 'stickerMessage'
  ];
  
  const messageType = getMessageType(m);
  return mediaTypes.includes(messageType);
}

// ============================================
// Permission & Authorization Functions
// ============================================

/**
 * Check if user is bot owner
 */
export function isOwner(userJid, config) {
  const userNumber = extractNumber(userJid);
  const ownerNumber = config.OWNER_NUMBER?.replace(/[^\d]/g, '');
  
  return userNumber === ownerNumber;
}

/**
 * Check if user is bot admin (from config)
 */
export function isBotAdminUser(userJid, config) {
  const userNumber = extractNumber(userJid);
  
  // Check owner first
  if (isOwner(userJid, config)) return true;
  
  // Check admin numbers
  const adminNumbers = config.ADMIN_NUMBERS || [];
  return adminNumbers.some(admin => {
    const adminNumber = admin.replace(/[^\d]/g, '');
    return userNumber === adminNumber;
  });
}

/**
 * Check command permissions
 */
export async function checkPermission(sock, m, config, requiredPermission) {
  const sender = getSender(m);
  const chatJid = m.key?.remoteJid;
  
  if (!sender || !chatJid) return false;
  
  switch (requiredPermission) {
    case 'owner':
      return isOwner(sender, config);
      
    case 'botAdmin':
      return isBotAdminUser(sender, config);
      
    case 'groupAdmin':
      if (!isGroup(chatJid)) return false;
      return await isGroupAdmin(sock, chatJid, sender);
      
    case 'group':
      return isGroup(chatJid);
      
    case 'private':
      return !isGroup(chatJid);
      
    default:
      return true;
  }
}

// ============================================
// Rate Limiting & Cooldown Functions
// ============================================

const cooldowns = new Map();

/**
 * Check if user is on cooldown
 */
export function isOnCooldown(userId, commandName, cooldownMs = 3000) {
  const key = `${userId}-${commandName}`;
  const now = Date.now();
  
  if (cooldowns.has(key)) {
    const expiry = cooldowns.get(key);
    if (now < expiry) {
      return true;
    }
  }
  
  cooldowns.set(key, now + cooldownMs);
  
  // Cleanup old cooldowns
  if (cooldowns.size > 1000) {
    for (const [k, v] of cooldowns.entries()) {
      if (v < now) cooldowns.delete(k);
    }
  }
  
  return false;
}

/**
 * Get remaining cooldown time
 */
export function getCooldownRemaining(userId, commandName) {
  const key = `${userId}-${commandName}`;
  const now = Date.now();
  
  if (cooldowns.has(key)) {
    const expiry = cooldowns.get(key);
    if (now < expiry) {
      return Math.ceil((expiry - now) / 1000);
    }
  }
  
  return 0;
}

// ============================================
// Media & File Handling Functions
// ============================================

/**
 * Download media from message
 */
export async function downloadMedia(m, sock) {
  try {
    const messageType = getMessageType(m);
    const mediaMessage = m.message?.[messageType];
    
    if (!mediaMessage) {
      throw new Error('No media in message');
    }
    
    // Download the media
    const buffer = await sock.downloadMediaMessage(m);
    
    return {
      buffer,
      mimetype: mediaMessage.mimetype,
      filename: mediaMessage.fileName || `media_${Date.now()}`,
      caption: mediaMessage.caption || null
    };
    
  } catch (error) {
    console.error(chalk.red('Error downloading media:'), error.message);
    throw error;
  }
}

/**
 * Save media to file
 */
export async function saveMedia(m, sock, outputPath) {
  try {
    const media = await downloadMedia(m, sock);
    await fs.writeFile(outputPath, media.buffer);
    return outputPath;
    
  } catch (error) {
    console.error(chalk.red('Error saving media:'), error.message);
    throw error;
  }
}

// ============================================
// Mention & Tag Functions
// ============================================

/**
 * Get mentioned users from message
 */
export function getMentions(m) {
  const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  return mentions.map(jid => normalizeJid(jid));
}

/**
 * Create mention text
 */
export function createMention(jid, displayName) {
  const number = extractNumber(jid);
  return `@${displayName || number}`;
}

/**
 * Parse mentions from text
 */
export function parseMentions(text) {
  const mentionRegex = /@(\d+)/g;
  const mentions = [];
  
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1] + '@s.whatsapp.net');
  }
  
  return mentions;
}

// ============================================
// Anti-Spam & Security Functions
// ============================================

const spamTracker = new Map();

/**
 * Check if message is spam
 */
export function isSpam(userId, threshold = 5, windowMs = 10000) {
  const now = Date.now();
  
  if (!spamTracker.has(userId)) {
    spamTracker.set(userId, []);
  }
  
  const userMessages = spamTracker.get(userId);
  
  // Remove old messages outside window
  const recentMessages = userMessages.filter(time => now - time < windowMs);
  
  // Add current message
  recentMessages.push(now);
  spamTracker.set(userId, recentMessages);
  
  // Cleanup if map gets too large
  if (spamTracker.size > 500) {
    for (const [key, times] of spamTracker.entries()) {
      const recent = times.filter(time => now - time < windowMs);
      if (recent.length === 0) {
        spamTracker.delete(key);
      } else {
        spamTracker.set(key, recent);
      }
    }
  }
  
  return recentMessages.length > threshold;
}

/**
 * Check if text contains links
 */
export function containsLink(text) {
  const linkRegex = /(https?:\/\/|www\.)[^\s]+/gi;
  return linkRegex.test(text);
}

/**
 * Check if text contains WhatsApp group invite
 */
export function containsGroupInvite(text) {
  const inviteRegex = /(chat\.whatsapp\.com|wa\.me|whatsapp\.com\/invite)/gi;
  return inviteRegex.test(text);
}

// ============================================
// Formatting & Display Functions
// ============================================

/**
 * Format file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration
 */
export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format date
 */
export function formatDate(date, timezone = 'Africa/Lagos') {
  const options = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone
  };
  
  return new Date(date).toLocaleString('en-US', options);
}

/**
 * Generate random ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sleep/delay function
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Export All Helper Functions
// ============================================

export default {
  // JID/LID Functions
  lidToJid,
  normalizeJid,
  extractNumber,
  isGroup,
  getSender,
  
  // Group Functions
  getGroupMetadata,
  isGroupAdmin,
  isBotAdmin,
  getGroupAdmins,
  getBotGroups,
  
  // Message Functions
  getQuotedMessage,
  extractMessageText,
  getMessageType,
  hasMedia,
  
  // Permission Functions
  isOwner,
  isBotAdminUser,
  checkPermission,
  
  // Rate Limiting
  isOnCooldown,
  getCooldownRemaining,
  
  // Media Functions
  downloadMedia,
  saveMedia,
  
  // Mention Functions
  getMentions,
  createMention,
  parseMentions,
  
  // Anti-Spam
  isSpam,
  containsLink,
  containsGroupInvite,
  
  // Formatting
  formatFileSize,
  formatDuration,
  formatDate,
  generateId,
  sleep
};
