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

  export const isLimited = (key, type = 'default') => {
  const now = Date.now();
  const { limit, window } = config[type] || config.default;

  if (!userRequests.has(key)) {
    userRequests.set(key, []);
  }

  const timestamps = userRequests.get(key);
  
  // Clear old timestamps
  const recentTimestamps = timestamps.filter(ts => now - ts < window);
  userRequests.set(key, recentTimestamps);

  if (recentTimestamps.length >= limit) {
    // User is limited
    const timeLeft = Math.ceil((recentTimestamps[0] + window - now) / 1000);
    logger.warn(`Rate limit hit for ${key} (Type: ${type}). Cooldown: ${timeLeft}s`);
    
    // <<< CHANGE HERE: Return an object with timeLeft, not just true
    return { limited: true, timeLeft: timeLeft };
  }

  // User is not limited, add new timestamp
  recentTimestamps.push(now);
  userRequests.set(key, recentTimestamps);

  // <<< CHANGE HERE: Return a standard object, not just false
  return { limited: false, timeLeft: 0 };
}
