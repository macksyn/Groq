// lib/helpers.js - V2 (Corrected)
import moment from 'moment-timezone';
import axios from 'axios';
import { getCollection, safeOperation } from './mongoManager.js'; // Use safeOperation
import logger from '../src/utils/logger.js';
import { isLimited as checkLimit } from '../src/utils/rateLimiter.js';

// --- Time Helpers ---
export const TimeHelpers = {
  formatTime: (timezone = 'Africa/Lagos', format = 'HH:mm:ss') => moment().tz(timezone).format(format),
  formatDate: (timezone = 'Africa/Lagos', format = 'DD/MM/YYYY') => moment().tz(timezone).format(format),
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  // (You can add your other time helpers back here)
};

// --- Permission Helpers ---
export const PermissionHelpers = {
  isOwner: (sender, ownerNumber) => {
    if (!sender || !ownerNumber) return false;
    return sender.split('@')[0] === ownerNumber.split('@')[0];
  },
  // (Add isGroupAdmin, isBotAdmin, etc. here)
};

// --- V2 Rate Limiter ---
export const RateLimitHelpers = {
  isLimited: (key) => {
    return checkLimit(key);
  }
};

// --- Owner Helpers (V2) ---
export const OwnerHelpers = {
  getAdmins: async () => {
    return safeOperation(async (db) => {
      return await db.collection('admin_users').find({}).toArray();
    });
  },
  isBotPublic: async () => {
    try {
      const settings = await safeOperation(async (db) => {
        return await db.collection('bot_settings').findOne({ _id: 'general' });
      });
      return settings?.mode === 'public' || !settings;
    } catch (error) {
      logger.error(error, 'Error fetching bot mode');
      return true; // Default to public on error
    }
  },
  // (Add banUser, setBotMode, etc. here)
};

// --- Other Helper Objects ---
export const TextHelpers = {
  capitalize: (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(),
};
export const RandomHelpers = {};
export const FileHelpers = {};
export const SystemHelpers = {};
export const ValidationHelpers = {};