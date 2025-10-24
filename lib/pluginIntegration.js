// Helper functions with null-safety
export async function getEconomyBalance(userId) {
  try {
    const user = await unifiedUserManager.getUserData(userId);
    if (!user) {
      // DB unavailable, return defaults
      return { wallet: 0, bank: 0, total: 0 };
    }
    return {
      wallet: user.balance || 0,
      bank: user.bank || 0,
      total: (user.balance || 0) + (user.bank || 0)
    };
  } catch (error) {
    logger.warn('Economy balance unavailable, using defaults');
    return { wallet: 0, bank: 0, total: 0 };
  }
}

// Update UnifiedUserManager
async initUser(userId) {
  // Check cache first
  if (this.userCache.has(userId)) {
    const cached = this.userCache.get(userId);
    if (Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.user;
    }
  }

  try {
    const result = await safeOperation(async (db, collection) => {
      if (!collection) return null; // DB unavailable
      
      const existingUser = await collection.findOne({ userId });
      // ... rest of your code
    }, this.collection, 2000); // 2 second timeout
    
    if (!result) {
      // DB unavailable, return in-memory default
      logger.debug(`Using in-memory user for ${userId}`);
      return {
        userId,
        balance: 0,
        bank: 0,
        inventory: [],
        // ... defaults
      };
    }
    
    return result;
  } catch (error) {
    logger.warn(`User init failed for ${userId}, using defaults`);
    return { userId, balance: 0 /* ... defaults */ };
  }
}
