import moment from 'moment-timezone';
import axios from 'axios';

// Time and date utilities
export const TimeHelpers = {
  // Format time with timezone
  formatTime: (timezone = 'Africa/Lagos', format = 'HH:mm:ss') => {
    return moment().tz(timezone).format(format);
  },

  // Format date
  formatDate: (timezone = 'Africa/Lagos', format = 'DD/MM/YYYY') => {
    return moment().tz(timezone).format(format);
  },

  // Get uptime in human readable format
  formatUptime: (seconds) => {
    return moment.duration(seconds, 'seconds').humanize();
  },

  // Sleep function
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Get time ago
  timeAgo: (date) => {
    return moment(date).fromNow();
  }
};

// ** ADD THIS NEW FUNCTION **
  formatDuration: (ms) => {
    if (ms < 0) ms = 0;

    // Get total minutes, rounded up, to ensure "1 minute" is shown for the last 60 seconds
    const totalMinutes = Math.ceil(ms / 60000);

    if (totalMinutes < 1) {
      return "less than a minute";
    }

    const days = Math.floor(totalMinutes / 1440); // 1440 minutes in a day
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days > 0) {
      parts.push(`${days} day${days > 1 ? 's' : ''}`);
    }
    if (hours > 0) {
      parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    }
    if (minutes > 0) {
      parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    }

    return parts.join(', ');
  }
};

// Permission checking utilities
export const PermissionHelpers = {
  // Check if user is owner
  isOwner: (userId, ownerId) => {
    const cleanUserId = userId.replace('@s.whatsapp.net', '');
    const cleanOwnerId = ownerId.replace('@s.whatsapp.net', '');
    return cleanUserId === cleanOwnerId;
  },

  // Check if user is group admin
  isGroupAdmin: async (sock, groupId, userId) => {
    try {
      const metadata = await sock.groupMetadata(groupId);
      const participant = metadata.participants.find(p => p.id === userId);
      return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch {
      return false;
    }
  },

  // Check if bot is group admin
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

// Text formatting utilities
export const TextHelpers = {
  // Capitalize first letter
  capitalize: (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  // Clean phone number
  cleanPhoneNumber: (phone) => {
    return phone.replace(/[^0-9]/g, '');
  },

  // Format phone number for WhatsApp
  formatWhatsAppNumber: (phone) => {
    const cleaned = TextHelpers.cleanPhoneNumber(phone);
    return cleaned.includes('@') ? cleaned : cleaned + '@s.whatsapp.net';
  },

  // Truncate text
  truncate: (text, length = 100) => {
    return text.length > length ? text.substring(0, length) + '...' : text;
  },

  // Remove mentions from text
  removeMentions: (text) => {
    return text.replace(/@\d+/g, '').trim();
  },

  // Extract mentions from text
  extractMentions: (text) => {
    const mentions = text.match(/@\d+/g) || [];
    return mentions.map(mention => mention.slice(1) + '@s.whatsapp.net');
  }
};

// Random utilities
export const RandomHelpers = {
  // Random choice from array
  choice: (array) => {
    return array[Math.floor(Math.random() * array.length)];
  },

  // Random number between min and max
  number: (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Random string
  string: (length = 10) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Shuffle array
  shuffle: (array) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }
};

// File and media utilities
export const FileHelpers = {
  // Get file extension
  getExtension: (filename) => {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  },

  // Format file size
  formatSize: (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  // Check if URL is valid
  isValidUrl: (string) => {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  },

  // Download file from URL
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

// System utilities
export const SystemHelpers = {
  // Get memory usage
  getMemoryUsage: () => {
    const usage = process.memoryUsage();
    return {
      used: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100
    };
  },

  // Get uptime
  getUptime: () => {
    return process.uptime();
  },

  // Get platform info
  getPlatformInfo: () => {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid
    };
  }
};

// Validation utilities
export const ValidationHelpers = {
  // Validate email
  isEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate phone number
  isPhone: (phone) => {
    const phoneRegex = /^\+?[\d\s-()]{10,}$/;
    return phoneRegex.test(phone);
  },

  // Validate URL
  isUrl: (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  // Check if string is numeric
  isNumeric: (str) => {
    return !isNaN(str) && !isNaN(parseFloat(str));
  }
};

// Rate limiting utilities
export const RateLimitHelpers = {
  // Simple in-memory rate limiter
  limits: new Map(),

  // Check if user is rate limited
  isLimited: (userId, command, maxUses = 5, windowMs = 60000) => {
    const key = `${userId}:${command}`;
    const now = Date.now();
    
    if (!RateLimitHelpers.limits.has(key)) {
      RateLimitHelpers.limits.set(key, { count: 1, resetTime: now + windowMs });
      return false;
    }
    
    const limit = RateLimitHelpers.limits.get(key);
    
    if (now > limit.resetTime) {
      RateLimitHelpers.limits.set(key, { count: 1, resetTime: now + windowMs });
      return false;
    }
    
    if (limit.count >= maxUses) {
      return true;
    }
    
    limit.count++;
    return false;
  },

  // Clear expired limits
  clearExpired: () => {
    const now = Date.now();
    for (const [key, limit] of RateLimitHelpers.limits.entries()) {
      if (now > limit.resetTime) {
        RateLimitHelpers.limits.delete(key);
      }
    }
  }
};

// Clean up expired rate limits every 5 minutes
setInterval(RateLimitHelpers.clearExpired, 5 * 60 * 1000);
