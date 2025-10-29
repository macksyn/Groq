// src/utils/rateLimiter.js
import NodeCache from 'node-cache';
import logger from './logger.js';

const MAX_REQUESTS = 10;
const WINDOW_SEC = 60;

/**
 * Main cache for tracking request counts
 * Keys auto-expire after 60 seconds (stdTTL)
 */
const limiterCache = new NodeCache({ stdTTL: WINDOW_SEC, checkperiod: 120 });

/**
 * Cache for tracking if we've already notified a user
 * Prevents spam notifications. Keys expire after 60 seconds.
 */
const notificationCache = new NodeCache({ stdTTL: WINDOW_SEC, checkperiod: 120 });

logger.info(`✅ Rate limiter initialized (Max: ${MAX_REQUESTS} req / ${WINDOW_SEC}s)`);

/**
 * Checks if a user is rate limited.
 * @param {string} userId - The unique user identifier (e.g., m.sender)
 * @returns {object} - { limited: boolean, shouldNotify: boolean, remaining: number }
 */
export function checkLimit(userId) {
  const data = limiterCache.get(userId);

  if (!data) {
    // First request in this window
    limiterCache.set(userId, { count: 1 });
    return { 
      limited: false, 
      shouldNotify: false,
      remaining: MAX_REQUESTS - 1
    };
  }

  // User is in the cache
  if (data.count < MAX_REQUESTS) {
    // Under the limit
    data.count++;
    limiterCache.set(userId, data);
    return { 
      limited: false, 
      shouldNotify: false,
      remaining: MAX_REQUESTS - data.count
    };
  }

  // User is at or over the limit
  logger.warn(`⚠️ Rate limit exceeded for user: ${userId}`);

  // Check if we've already notified this user in this window
  const alreadyNotified = notificationCache.get(userId);
  const shouldNotify = !alreadyNotified;

  if (shouldNotify) {
    // Mark that we've notified them
    notificationCache.set(userId, true);
  }

  return { 
    limited: true, 
    shouldNotify: shouldNotify,
    remaining: 0
  };
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use checkLimit() instead for better control
 */
export function isLimited(userId) {
  const result = checkLimit(userId);
  return result.limited;
}