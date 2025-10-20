// src/utils/rateLimiter.js
import NodeCache from 'node-cache';
import logger from './logger.js'; // Use your centralized logger

// Use the exact settings you wanted: 10 requests / 60 seconds
const MAX_REQUESTS = 10;
const WINDOW_SEC = 60; // 60 seconds (from your 60000ms)

/**
 * We create a cache where each user's ID is a key.
 * The key automatically expires after 60 seconds (stdTTL).
 * checkperiod runs every 120s to clear out expired keys.
 */
const limiterCache = new NodeCache({ stdTTL: WINDOW_SEC, checkperiod: 120 });

logger.info(`✅ Rate limiter initialized (Max: ${MAX_REQUESTS} req / ${WINDOW_SEC}s)`);

/**
 * Checks if a user is rate limited.
 * @param {string} userId - The unique user identifier (e.g., m.sender)
 * @returns {boolean} - True if limited, false if not.
 */
export function isLimited(userId) {
  const data = limiterCache.get(userId);

  if (!data) {
    // Not in cache. This is their first request in this window.
    // Set them in the cache with a count of 1.
    // The key will auto-expire in 60 seconds (stdTTL).
    limiterCache.set(userId, { count: 1 });
    return false; // Not limited
  }

  // User is in the cache
  if (data.count < MAX_REQUESTS) {
    // User is under the limit. Increment and update.
    data.count++;
    limiterCache.set(userId, data); // 'set' refreshes the TTL
    return false; // Not limited
  }

  // User is at or over the limit
  logger.warn(`Rate limit exceeded for user: ${userId}`);
  return true; // IS limited
}