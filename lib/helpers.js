// src/utils/helpers.js - Utility functions for WhatsApp bot
import chalk from 'chalk';
import axios from 'axios';
import { jidNormalizedUser, areJidsSameUser } from '@whiskeysockets/baileys';

/**
 * Convert LID (Lidded ID) to standard JID
 * LID format: 123456789:10@lid or 123456789@lid
 * JID format: 123456789@s.whatsapp.net
 */
export function lidToJid(lid) {
  if (!lid) return null;
  
  try {
    // If already a standard JID, return as-is
    if (lid.includes('@s.whatsapp.net') || lid.includes('@g.us')) {
      return lid;
    }
    
    // Handle LID format
    if (lid.includes('@lid')) {
      // Extract the number part (before : or @)
      const numberPart = lid.split(':')[0].split('@')[0];
      return `${numberPart}@s.whatsapp.net`;
    }
    
    // If just a number, convert to JID
    if (/^\d+$/.test(lid)) {
      return `${lid}@s.whatsapp.net`;
    }
    
    return lid;
  } catch (error) {
    console.error(chalk.red('❌ Error converting LID to JID:'), error.message);
    return lid;
  }
}

/**
 * Convert JID to LID format
 */
export function jidToLid(jid) {
  if (!jid) return null;
  
  try {
    if (jid.includes('@lid')) return jid;
    
    const number = jid.split('@')[0];
    return `${number}@lid`;
  } catch (error) {
    console.error(chalk.red('❌ Error converting JID to LID:'), error.message);
    return jid;
  }
}

/**
 * Normalize JID to standard format
 */
export function normalizeJid(jid) {
  if (!jid) return null;
  
  try {
    return jidNormalizedUser(jid);
  } catch (error) {
    return lidToJid(jid);
  }
}

/**
 * Extract phone number from JID
 */
export function getNumberFromJid(jid) {
  if (!jid) return null;
  
  try {
    const normalized = normalizeJid(jid);
    return normalized.split('@')[0].split(':')[0];
  } catch (error) {
    return jid.split('@')[0].split(':')[0];
  }
}

/**
 * Check if two JIDs are the same user
 */
export function isSameJid(jid1, jid2) {
  try {
    return areJidsSameUser(jid1, jid2);
  } catch (error) {
    // Fallback comparison
    const num1 = getNumberFromJid(jid1);
    const num2 = getNumberFromJid(jid2);
    return num1 === num2;
  }
}

/**
 * Check if JID is a group
 */
export function isGroup(jid) {
  return jid && jid.endsWith('@g.us');
}

/**
 * Check if JID is a user
 */
export function isUser(jid) {
  return jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
}

/**
 * Format phone number for display
 */
export function formatPhoneNumber(number) {
  if (!number) return 'Unknown';
  
  const cleaned = number.replace(/\D/g, '');
  
  if (cleaned.length === 13 && cleaned.startsWith('234')) {
    return `+234 ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`;
  }
  
  if (cleaned.length > 10) {
    return `+${cleaned.slice(0, -10)} ${cleaned.slice(-10, -7)} ${cleaned.slice(-7, -4)} ${cleaned.slice(-4)}`;
  }
  
  return `+${cleaned}`;
}

/**
 * Get group metadata with caching
 */
const groupMetadataCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getGroupMetadata(sock, groupJid, useCache = true) {
  if (!sock || !groupJid || !isGroup(groupJid)) {
    return null;
  }
  
  try {
    // Check cache first
    if (useCache && groupMetadataCache.has(groupJid)) {
      const cached = groupMetadataCache.get(groupJid);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }
    }
    
    // Fetch fresh metadata
    const metadata = await sock.groupMetadata(groupJid);
    
    // Cache it
    groupMetadataCache.set(groupJid, {
      data: metadata,
      timestamp: Date.now()
    });
    
    return metadata;
  } catch (error) {
    console.error(chalk.red(`❌ Failed to fetch group metadata for ${groupJid}:`), error.message);
    return null;
  }
}

/**
 * Clear group metadata cache
 */
export function clearGroupMetadataCache(groupJid = null) {
  if (groupJid) {
    groupMetadataCache.delete(groupJid);
  } else {
    groupMetadataCache.clear();
  }
}

/**
 * Get group admins with proper JID conversion
 */
export async function getGroupAdmins(sock, groupJid) {
  try {
    const metadata = await getGroupMetadata(sock, groupJid);
    if (!metadata || !metadata.participants) return [];
    
    const admins = metadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => normalizeJid(p.id));
    
    return admins;
  } catch (error) {
    console.error(chalk.red('❌ Failed to get group admins:'), error.message);
    return [];
  }
}

/**
 * Check if user is group admin (handles LID/JID conversion)
 */
export async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    const admins = await getGroupAdmins(sock, groupJid);
    const normalizedUser = normalizeJid(userJid);
    
    return admins.some(admin => isSameJid(admin, normalizedUser));
  } catch (error) {
    console.error(chalk.red('❌ Failed to check admin status:'), error.message);
    return false;
  }
}

/**
 * Check if bot is group admin
 */
export async function isBotGroupAdmin(sock, groupJid) {
  try {
    const botJid = sock.user?.id;
    if (!botJid) return false;
    
    return await isGroupAdmin(sock, groupJid, botJid);
  } catch (error) {
    console.error(chalk.red('❌ Failed to check bot admin status:'), error.message);
    return false;
  }
}

/**
 * Extract mentions from message text
 */
export function extractMentions(text) {
  if (!text) return [];
  
  const mentionRegex = /@(\d+)/g;
  const matches = text.matchAll(mentionRegex);
  const mentions = [];
  
  for (const match of matches) {
    mentions.push(`${match[1]}@s.whatsapp.net`);
  }
  
  return mentions;
}

/**
 * Format uptime
 */
export function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Sleep/delay function
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse command from message
 */
export function parseCommand(text, prefix) {
  if (!text || !text.startsWith(prefix)) return null;
  
  const args = text.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();
  
  return { command, args, fullArgs: args.join(' ') };
}

/**
 * Download media from message
 */
export async function downloadMediaMessage(message) {
  try {
    const buffer = await downloadContentFromMessage(
      message,
      message.imageMessage ? 'image' : 
      message.videoMessage ? 'video' : 
      message.audioMessage ? 'audio' : 
      message.documentMessage ? 'document' : 'image'
    );
    
    const chunks = [];
    for await (const chunk of buffer) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    console.error(chalk.red('❌ Failed to download media:'), error.message);
    throw error;
  }
}

/**
 * Fetch with retry logic
 */
export async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios({
        url,
        timeout: 30000,
        ...options
      });
      return response.data;
    } catch (error) {
      if (i === retries - 1) throw error;
      
      console.log(chalk.yellow(`⚠️ Fetch attempt ${i + 1} failed, retrying...`));
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
}

/**
 * Validate URL
 */
export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize string for file name
 */
export function sanitizeFileName(name) {
  return name.replace(/[^a-z0-9_\-\.]/gi, '_').toLowerCase();
}

/**
 * Generate random string
 */
export function randomString(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Check if user is bot owner
 */
export function isBotOwner(userJid, config) {
  const userNumber = getNumberFromJid(userJid);
  return userNumber === config.OWNER_NUMBER;
}

/**
 * Check if user is bot admin
 */
export function isBotAdmin(userJid, config) {
  const userNumber = getNumberFromJid(userJid);
  return config.ADMIN_NUMBERS?.includes(userNumber) || isBotOwner(userJid, config);
}

/**
 * Get user mention string
 */
export function getUserMention(jid) {
  const number = getNumberFromJid(jid);
  return `@${number}`;
}

/**
 * Chunk array into smaller arrays
 */
export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get time ago string
 */
export function timeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
}

/**
 * Escape markdown special characters
 */
export function escapeMarkdown(text) {
  return text.replace(/([*_~`])/g, '\\$1');
}

/**
 * Truncate text
 */
export function truncateText(text, maxLength = 100) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Rate limiter class
 */
export class RateLimiter {
  constructor(maxRequests = 5, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }
  
  check(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    
    // Filter out old requests
    const recentRequests = userRequests.filter(time => now - time < this.windowMs);
    
    if (recentRequests.length >= this.maxRequests) {
      return false; // Rate limited
    }
    
    recentRequests.push(now);
    this.requests.set(userId, recentRequests);
    return true; // Allowed
  }
  
  reset(userId) {
    this.requests.delete(userId);
  }
  
  cleanup() {
    const now = Date.now();
    for (const [userId, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(time => now - time < this.windowMs);
      if (recentRequests.length === 0) {
        this.requests.delete(userId);
      } else {
        this.requests.set(userId, recentRequests);
      }
    }
  }
}

/**
 * Command cooldown manager
 */
export class CooldownManager {
  constructor() {
    this.cooldowns = new Map();
  }
  
  setCooldown(userId, command, durationMs) {
    const key = `${userId}_${command}`;
    this.cooldowns.set(key, Date.now() + durationMs);
  }
  
  isOnCooldown(userId, command) {
    const key = `${userId}_${command}`;
    const cooldownEnd = this.cooldowns.get(key);
    
    if (!cooldownEnd) return false;
    
    const now = Date.now();
    if (now >= cooldownEnd) {
      this.cooldowns.delete(key);
      return false;
    }
    
    return true;
  }
  
  getRemainingTime(userId, command) {
    const key = `${userId}_${command}`;
    const cooldownEnd = this.cooldowns.get(key);
    
    if (!cooldownEnd) return 0;
    
    const remaining = cooldownEnd - Date.now();
    return Math.max(0, remaining);
  }
  
  clearCooldown(userId, command) {
    const key = `${userId}_${command}`;
    this.cooldowns.delete(key);
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, cooldownEnd] of this.cooldowns.entries()) {
      if (now >= cooldownEnd) {
        this.cooldowns.delete(key);
      }
    }
  }
}

// Auto cleanup for rate limiter and cooldown manager
setInterval(() => {
  // This will be cleaned up by instances
}, 5 * 60 * 1000);

export default {
  lidToJid,
  jidToLid,
  normalizeJid,
  getNumberFromJid,
  isSameJid,
  isGroup,
  isUser,
  formatPhoneNumber,
  getGroupMetadata,
  clearGroupMetadataCache,
  getGroupAdmins,
  isGroupAdmin,
  isBotGroupAdmin,
  extractMentions,
  formatUptime,
  formatBytes,
  sleep,
  parseCommand,
  downloadMediaMessage,
  fetchWithRetry,
  isValidUrl,
  sanitizeFileName,
  randomString,
  isBotOwner,
  isBotAdmin,
  getUserMention,
  chunkArray,
  timeAgo,
  escapeMarkdown,
  truncateText,
  RateLimiter,
  CooldownManager
};
