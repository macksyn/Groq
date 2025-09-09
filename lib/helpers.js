// Enhanced helpers.js with better memory management
import moment from 'moment-timezone';
import axios from 'axios';

// Time and date utilities (keeping your existing ones)
export const TimeHelpers = {
  formatTime: (timezone = 'Africa/Lagos', format = 'HH:mm:ss') => {
    return moment().tz(timezone).format(format);
  },

  formatDate: (timezone = 'Africa/Lagos', format = 'DD/MM/YYYY') => {
    return moment().tz(timezone).format(format);
  },

  formatUptime: (seconds) => {
    return moment.duration(seconds, 'seconds').humanize();
  },

  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  timeAgo: (date) => {
    return moment(date).fromNow();
  },

  formatDuration: (ms) => {
    if (ms < 0) ms = 0;
    const totalMinutes = Math.ceil(ms / 60000);
    if (totalMinutes < 1) return "less than a minute";

    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);

    return parts.join(', ');
  },

  formatFutureTime: (timestamp, timezone = 'Africa/Lagos') => {
    const now = moment().tz(timezone);
    const future = moment(timestamp).tz(timezone);

    if (future.isSame(now, 'day')) {
      return `today at ${future.format('h:mm A')}`;
    } else if (future.isSame(now.clone().add(1, 'day'), 'day')) {
      return `tomorrow at ${future.format('h:mm A')}`;
    } else {
      return `on ${future.format('MMM D [at] h:mm A')}`;
    }
  }
};

// Permission checking utilities (keeping existing)
export const PermissionHelpers = {
  isOwner: (userId, ownerId) => {
    const cleanUserId = userId.replace('@s.whatsapp.net', '');
    const cleanOwnerId = ownerId.replace('@s.whatsapp.net', '');
    return cleanUserId === cleanOwnerId;
  },

  isGroupAdmin: async (sock, groupId, userId) => {
    try {
      const metadata = await sock.groupMetadata(groupId);
      const participant = metadata.participants.find(p => p.id === userId);
      return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch {
      return false;
    }
  },

  isBotAdmin: async (sock, groupId) => {
    try {
      const metadata = await sock.groupMetadata(groupId);
      const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const participant = metadata.participants.find(p => p.id === botId);
      return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch {
      return false;
    }
  }
};

// ENHANCED: Rate limiting with better memory management
export const RateLimitHelpers = {
  limits: new Map(),
  maxCacheSize: 10000, // Prevent unlimited growth

  // Enhanced rate limiting with automatic cleanup
  isLimited: (userId, command, maxUses = 5, windowMs = 60000) => {
    const key = `${userId}:${command}`;
    const now = Date.now();
    
    // Periodic cleanup to prevent memory leaks
    if (RateLimitHelpers.limits.size > RateLimitHelpers.maxCacheSize) {
      RateLimitHelpers.clearExpired();
    }
    
    if (!RateLimitHelpers.limits.has(key)) {
      RateLimitHelpers.limits.set(key, { 
        count: 1, 
        resetTime: now + windowMs,
        lastAccess: now 
      });
      return false;
    }
    
    const limit = RateLimitHelpers.limits.get(key);
    limit.lastAccess = now;
    
    if (now > limit.resetTime) {
      RateLimitHelpers.limits.set(key, { 
        count: 1, 
        resetTime: now + windowMs,
        lastAccess: now 
      });
      return false;
    }
    
    if (limit.count >= maxUses) {
      return true;
    }
    
    limit.count++;
    return false;
  },

  // Enhanced cleanup with LRU eviction
  clearExpired: () => {
    const now = Date.now();
    let removed = 0;
    
    // Remove expired entries
    for (const [key, limit] of RateLimitHelpers.limits.entries()) {
      if (now > limit.resetTime) {
        RateLimitHelpers.limits.delete(key);
        removed++;
      }
    }
    
    // If still too many entries, remove oldest accessed ones
    if (RateLimitHelpers.limits.size > RateLimitHelpers.maxCacheSize * 0.8) {
      const entries = Array.from(RateLimitHelpers.limits.entries())
        .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
      
      const toRemove = RateLimitHelpers.limits.size - Math.floor(RateLimitHelpers.maxCacheSize * 0.7);
      
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        RateLimitHelpers.limits.delete(entries[i][0]);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`🧹 Cleaned ${removed} rate limit entries`);
    }
  },

  // Get current cache statistics
  getStats: () => {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    
    for (const [, limit] of RateLimitHelpers.limits.entries()) {
      if (now > limit.resetTime) {
        expired++;
      } else {
        active++;
      }
    }
    
    return {
      total: RateLimitHelpers.limits.size,
      active,
      expired,
      memoryUsage: RateLimitHelpers.limits.size * 100 // Rough estimate in bytes
    };
  }
};

// Enhanced cleanup - run more frequently and with better logic
setInterval(() => {
  RateLimitHelpers.clearExpired();
}, 2 * 60 * 1000); // Every 2 minutes instead of 5

// Additional cleanup every 30 minutes for thorough cleaning
setInterval(() => {
  const stats = RateLimitHelpers.getStats();
  if (stats.expired > stats.active * 0.5) {
    console.log(`🧹 Performing thorough rate limit cleanup. Stats:`, stats);
    RateLimitHelpers.clearExpired();
  }
}, 30 * 60 * 1000);

// Keep all your existing helper functions
export const TextHelpers = {
  capitalize: (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  cleanPhoneNumber: (phone) => {
    return phone.replace(/[^0-9]/g, '');
  },

  formatWhatsAppNumber: (phone) => {
    const cleaned = TextHelpers.cleanPhoneNumber(phone);
    return cleaned.includes('@') ? cleaned : cleaned + '@s.whatsapp.net';
  },

  truncate: (text, length = 100) => {
    return text.length > length ? text.substring(0, length) + '...' : text;
  },

  removeMentions: (text) => {
    return text.replace(/@\d+/g, '').trim();
  },

  extractMentions: (text) => {
    const mentions = text.match(/@\d+/g) || [];
    return mentions.map(mention => mention.slice(1) + '@s.whatsapp.net');
  }
};

export const RandomHelpers = {
  choice: (array) => {
    return array[Math.floor(Math.random() * array.length)];
  },

  number: (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  string: (length = 10) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  shuffle: (array) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }
};

export const FileHelpers = {
  getExtension: (filename) => {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  },

  formatSize: (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  isValidUrl: (string) => {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  },

  downloadFile: async (url, options = {}) => {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        ...options
      });
      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }
};

export const SystemHelpers = {
  getMemoryUsage: () => {
    const usage = process.memoryUsage();
    return {
      used: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100
    };
  },

  getUptime: () => {
    return process.uptime();
  },

  getPlatformInfo: () => {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid
    };
  }
};

export const ValidationHelpers = {
  isEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  isPhone: (phone) => {
    const phoneRegex = /^\+?[\d\s-()]{10,}$/;
    return phoneRegex.test(phone);
  },

  isUrl: (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  isNumeric: (str) => {
    return !isNaN(str) && !isNaN(parseFloat(str));
  }
};
