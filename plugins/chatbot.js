// plugins/memory-efficient-groq.js - Smart AI with Optimized Memory Management
import axios from 'axios';
import { getCollection, safeOperation } from '../lib/mongoManager.js';

export const info = {
  name: 'memory-efficient-groq',
  version: '4.0.0',
  author: 'Alex Macksyn',
  description: 'Ultra-smart group AI with optimized memory usage 🧠⚡',
  commands: [
    {
      name: 'groq',
      aliases: ['@groq', '2348111637463', 'chat', 'gpt'],
      description: 'Chat with memory-efficient smart AI'
    },
    {
      name: 'aimode',
      description: 'Toggle AI mode: off/mentions/smart/genius'
    },
    {
      name: 'groupiq',
      description: 'View group intelligence (cached efficiently)'
    },
    {
      name: 'memberprofile',
      description: 'View member profile (on-demand loading)'
    },
    {
      name: 'clearaicache',
      description: 'Clear AI memory cache to free RAM'
    }
  ]
};

// MEMORY OPTIMIZATION STRATEGY:
// 1. Lazy loading - only load data when needed
// 2. LRU Cache with size limits
// 3. Automatic cleanup of old data
// 4. Batch processing to reduce DB calls
// 5. Streaming analysis instead of bulk loading

// Enhanced AI modes
const AI_MODES = {
  OFF: 'off',
  MENTIONS: 'mentions', 
  SMART: 'smart',
  GENIUS: 'genius'
};

// Memory-efficient caching with LRU and size limits
class MemoryEfficientCache {
  constructor(maxSize = 100, maxAge = 30 * 60 * 1000) { // 100 items, 30 minutes
    this.cache = new Map();
    this.maxSize = maxSize;
    this.maxAge = maxAge;
    this.accessOrder = new Map(); // Track access times for LRU
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // Check if expired
    if (Date.now() - item.timestamp > this.maxAge) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return null;
    }
    
    // Update access time for LRU
    this.accessOrder.set(key, Date.now());
    return item.data;
  }

  set(key, data) {
    // Remove oldest items if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, { data, timestamp: Date.now() });
    this.accessOrder.set(key, Date.now());
  }

  evictOldest() {
    // Find least recently used item
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }

  clear() {
    this.cache.clear();
    this.accessOrder.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Lightweight streaming analyzers (process data without storing everything in memory)
class StreamingAnalyzer {
  constructor() {
    // Only store aggregated results, not raw data
    this.wordFrequency = new Map();
    this.sentimentRunningAvg = { sum: 0, count: 0 };
    this.personalityScores = new Map();
    this.topicCounts = new Map();
    this.maxItems = 1000; // Limit stored items
  }

  // Process message and update lightweight stats
  processMessage(messageBody, userId) {
    const words = messageBody.toLowerCase().split(/\s+/).slice(0, 50); // Limit words processed
    const sentiment = this.quickSentimentAnalysis(messageBody);
    const personality = this.quickPersonalityAnalysis(words);
    const topics = this.extractTopTopics(messageBody, 3); // Only top 3 topics

    // Update running averages instead of storing all data
    this.updateRunningAverage(this.sentimentRunningAvg, sentiment);
    this.updatePersonalityScores(userId, personality);
    this.updateTopicCounts(topics);
    this.updateWordFrequency(words.slice(0, 10)); // Only first 10 words
  }

  quickSentimentAnalysis(text) {
    const positive = ['good', 'great', 'nice', 'awesome', 'love', 'best', 'happy'];
    const negative = ['bad', 'terrible', 'hate', 'worst', 'sad', 'angry'];
    
    let score = 0;
    const words = text.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (positive.includes(word)) score += 1;
      if (negative.includes(word)) score -= 1;
    });
    
    return score / Math.max(words.length, 1);
  }

  updateRunningAverage(avg, value) {
    avg.sum += value;
    avg.count += 1;
    
    // Prevent infinite growth - reset every 10000 samples
    if (avg.count > 10000) {
      avg.sum = avg.sum / 2;
      avg.count = avg.count / 2;
    }
  }

  updatePersonalityScores(userId, scores) {
    if (!this.personalityScores.has(userId)) {
      this.personalityScores.set(userId, {});
    }
    
    const userScores = this.personalityScores.get(userId);
    Object.entries(scores).forEach(([trait, score]) => {
      if (!userScores[trait]) {
        userScores[trait] = { sum: 0, count: 0 };
      }
      this.updateRunningAverage(userScores[trait], score);
    });

    // Limit users tracked
    if (this.personalityScores.size > 200) {
      // Remove random user to make space
      const randomKey = this.personalityScores.keys().next().value;
      this.personalityScores.delete(randomKey);
    }
  }

  quickPersonalityAnalysis(words) {
    const scores = {};
    
    // Simplified personality detection
    const extraversionWords = ['party', 'social', 'people', 'talk', 'excited'];
    const conscientiousnessWords = ['organized', 'plan', 'schedule', 'work', 'responsible'];
    
    scores.extraversion = words.filter(w => extraversionWords.includes(w)).length / words.length;
    scores.conscientiousness = words.filter(w => conscientiousnessWords.includes(w)).length / words.length;
    
    return scores;
  }
}

// Main memory-efficient class
class MemoryEfficientGroqAI {
  constructor() {
    // Use small caches instead of large Maps
    this.profileCache = new MemoryEfficientCache(50, 15 * 60 * 1000); // 50 profiles, 15 min
    this.contextCache = new MemoryEfficientCache(20, 10 * 60 * 1000);  // 20 contexts, 10 min
    this.dynamicsCache = new MemoryEfficientCache(10, 60 * 60 * 1000); // 10 groups, 1 hour
    
    // Lightweight streaming analyzer
    this.streamingAnalyzer = new StreamingAnalyzer();
    
    // Rate limiting (keep in memory as it's small)
    this.rateLimits = new Map();
    
    // Auto-cleanup timer
    setInterval(() => this.performMaintenance(), 5 * 60 * 1000); // Every 5 minutes
  }

  // Get member profile with lazy loading and caching
  async getMemberProfile(groupId, userId) {
    const cacheKey = `${groupId}:${userId}`;
    let profile = this.profileCache.get(cacheKey);
    
    if (!profile) {
      // Load from database only when needed
      profile = await this.loadMemberProfileFromDB(groupId, userId);
      if (profile) {
        // Store only essential data in cache
        const lightProfile = this.createLightProfile(profile);
        this.profileCache.set(cacheKey, lightProfile);
        return lightProfile;
      }
    }
    
    return profile;
  }

  createLightProfile(fullProfile) {
    // Only keep essential data in memory
    return {
      userId: fullProfile.userId,
      pushName: fullProfile.pushName,
      totalMessages: fullProfile.totalMessages || 0,
      lastActive: fullProfile.lastActive,
      // Summarized personality (not full history)
      personalitySummary: this.summarizePersonality(fullProfile.personalityTraits),
      // Top 3 interests only
      topInterests: (fullProfile.interests || []).slice(0, 3),
      // Recent mood (not full history)
      recentMood: this.getRecentMood(fullProfile.moodHistory),
      // Simplified communication style
      communicationStyle: this.simplifyCommunicationStyle(fullProfile.communicationStyle)
    };
  }

  // Batch process multiple profiles efficiently
  async batchLoadProfiles(groupId, userIds) {
    const uncachedUsers = userIds.filter(userId => 
      !this.profileCache.get(`${groupId}:${userId}`)
    );
    
    if (uncachedUsers.length === 0) {
      return userIds.map(userId => this.profileCache.get(`${groupId}:${userId}`));
    }

    // Load multiple profiles in one DB query
    const profiles = await safeOperation(async (db) => {
      return await db.collection('memberProfiles')
        .find({ 
          groupId, 
          userId: { $in: uncachedUsers } 
        })
        .limit(50) // Prevent huge loads
        .toArray();
    });

    // Cache loaded profiles
    profiles.forEach(profile => {
      const lightProfile = this.createLightProfile(profile);
      this.profileCache.set(`${groupId}:${profile.userId}`, lightProfile);
    });

    // Return all requested profiles
    return userIds.map(userId => this.profileCache.get(`${groupId}:${userId}`)).filter(Boolean);
  }

  // Efficient group context with size limits
  async getGroupContext(groupId, maxMessages = 10) {
    let context = this.contextCache.get(groupId);
    
    if (!context) {
      // Load limited context from DB
      context = await safeOperation(async (db) => {
        return await db.collection('groupContexts')
          .findOne({ groupId }, { 
            projection: { 
              context: { $slice: -maxMessages } // Only get last N messages
            } 
          });
      });
      
      context = context?.context || [];
      this.contextCache.set(groupId, context);
    }
    
    return context.slice(-maxMessages);
  }

  // Update context with memory limits
  async updateGroupContext(groupId, message) {
    let context = this.contextCache.get(groupId) || [];
    
    // Add new message
    context.push({
      sender: message.sender,
      body: message.body?.slice(0, 200) || '', // Limit message length stored
      timestamp: Date.now(),
      type: message.type
    });
    
    // Keep only recent messages in memory
    if (context.length > 15) {
      context = context.slice(-15);
    }
    
    this.contextCache.set(groupId, context);
    
    // Update streaming analyzer without storing raw data
    if (message.body) {
      this.streamingAnalyzer.processMessage(message.body, message.sender);
    }
    
    // Batch save to DB periodically (not every message)
    if (Math.random() < 0.2) { // 20% chance
      this.saveBatchContextToDB(groupId, context);
    }
  }

  // Efficient batch save to reduce DB calls
  async saveBatchContextToDB(groupId, context) {
    try {
      await safeOperation(async (db) => {
        await db.collection('groupContexts').updateOne(
          { groupId },
          { 
            $set: { 
              context: context.slice(-30), // Save more in DB than memory
              lastUpdated: new Date()
            }
          },
          { upsert: true }
        );
      });
    } catch (error) {
      console.error('Error saving context batch:', error);
    }
  }

  // Generate smart response with efficient context building
  async generateSmartResponse(query, userId, groupId, aiMode) {
    // Build minimal context based on AI mode
    let contextSize = aiMode === 'genius' ? 10 : 5;
    const context = await this.getGroupContext(groupId, contextSize);
    const userProfile = await this.getMemberProfile(groupId, userId);
    
    // Build efficient system prompt
    const systemPrompt = this.buildEfficientSystemPrompt(context, userProfile, aiMode);
    
    return await this.callGroqAPI(query, systemPrompt, userId);
  }

  buildEfficientSystemPrompt(context, userProfile, aiMode) {
    let prompt = `You are Groq, an intelligent Nigerian AI assistant from Lagos. Be helpful and conversational.`;
    
    if (aiMode === 'smart' || aiMode === 'genius') {
      if (userProfile) {
        prompt += `\n\nUser Info: ${userProfile.pushName || 'User'} - ${userProfile.totalMessages} messages`;
        
        if (userProfile.topInterests?.length) {
          prompt += `\nInterests: ${userProfile.topInterests.map(i => i.topic).join(', ')}`;
        }
        
        if (userProfile.personalitySummary) {
          prompt += `\nStyle: ${userProfile.personalitySummary}`;
        }
      }
      
      if (context?.length) {
        prompt += `\n\nRecent chat:\n`;
        context.slice(-3).forEach(msg => {
          const name = msg.sender?.split('@')[0] || 'User';
          prompt += `${name}: ${msg.body}\n`;
        });
      }
    }
    
    return prompt + `\n\nKeep responses concise and natural for WhatsApp.`;
  }

  // Rate limiting (keep existing logic but optimize)
  checkRateLimit(userId, type = 'normal') {
    const now = Date.now();
    const key = `${userId}:${type}`;
    const limit = type === 'genius' ? 5 : type === 'smart' ? 8 : 15; // requests per minute
    
    let userLimit = this.rateLimits.get(key);
    if (!userLimit || now - userLimit.reset > 60000) {
      userLimit = { count: 0, reset: now + 60000 };
    }
    
    if (userLimit.count >= limit) return false;
    
    userLimit.count++;
    this.rateLimits.set(key, userLimit);
    
    // Cleanup old rate limit entries
    if (this.rateLimits.size > 1000) {
      const oldEntries = Array.from(this.rateLimits.entries())
        .filter(([, data]) => now - data.reset > 300000) // 5 min old
        .slice(0, 100); // Remove up to 100 old entries
      
      oldEntries.forEach(([key]) => this.rateLimits.delete(key));
    }
    
    return true;
  }

  // Maintenance to prevent memory leaks
  performMaintenance() {
    const now = Date.now();
    
    console.log(`🧹 Memory maintenance - Caches: Profile(${this.profileCache.size()}) Context(${this.contextCache.size()}) Dynamics(${this.dynamicsCache.size()})`);
    
    // Clean up old rate limits
    for (const [key, data] of this.rateLimits) {
      if (now - data.reset > 600000) { // 10 minutes old
        this.rateLimits.delete(key);
      }
    }
    
    // Reset streaming analyzer if it gets too big
    if (this.streamingAnalyzer.wordFrequency.size > 5000) {
      console.log('🔄 Resetting streaming analyzer to prevent memory bloat');
      this.streamingAnalyzer = new StreamingAnalyzer();
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  // Simplified model management (reuse from original)
  async getUserModel(userId) {
    return 'llama-3.3-70b-versatile'; // Default for now, can optimize with cache later
  }

  // Memory-efficient conversation history
  getConversationHistory(userId, maxMessages = 6) {
    // Don't store full conversation history in memory
    // This would normally come from a cache or be rebuilt as needed
    return []; // Simplified for memory efficiency
  }
}

// Main handler with memory optimization
export default async function memoryEfficientGroqHandler(m, sock, config) {
  try {
    const groqAI = new MemoryEfficientGroqAI();
    const botIds = getBotIds(sock);
    const isMentioned = isBotMentioned(m.mentions, botIds) || isTextMention(m.body, botIds);
    const isReply = isReplyToBot(m.quoted, botIds);
    const isGroupChat = m.from.endsWith('@g.us');

    // Get AI mode efficiently (with fallback)
    const aiMode = await getAIModeEfficient(m.sender) || AI_MODES.MENTIONS;

    // Update group context efficiently (only for groups)
    if (isGroupChat && m.body && m.body.length < 500) { // Limit processed message length
      await groqAI.updateGroupContext(m.from, {
        sender: m.sender,
        body: m.body,
        type: m.type,
        timestamp: Date.now()
      });
    }

    // Handle commands efficiently
    if (m.body?.startsWith(config.PREFIX)) {
      const args = m.body.slice(config.PREFIX.length).trim().split(' ');
      const command = args[0].toLowerCase();

      // Memory status command
      if (command === 'clearaicache') {
        groqAI.profileCache.clear();
        groqAI.contextCache.clear();
        groqAI.dynamicsCache.clear();
        
        await sock.sendMessage(m.from, {
          text: `🧹 *AI Cache Cleared!*\n\nMemory freed up. The AI will rebuild knowledge as needed.`
        }, { quoted: m });
        return;
      }

      // Quick group IQ (cached data only)
      if (command === 'groupiq') {
        const quickStats = await generateQuickGroupStats(m.from, groqAI);
        await sock.sendMessage(m.from, { text: quickStats }, { quoted: m });
        return;
      }

      // AI mode toggle (efficient)
      if (['aimode', 'groqmode'].includes(command)) {
        const newMode = await cycleAIModeEfficient(m.sender);
        await sock.sendMessage(m.from, {
          text: `🤖 AI Mode: *${newMode.toUpperCase()}*\n\n${getAIModeDescription(newMode)}`
        }, { quoted: m });
        return;
      }

      // AI commands
      if (['ai', 'groq', 'ask', 'chat', 'gpt'].includes(command)) {
        const query = args.slice(1).join(' ');
        if (query && query.length > 2) {
          await processAIQuery(query, m, sock, groqAI, aiMode, isGroupChat);
        }
        return;
      }
    }

    // Smart response logic (optimized)
    const shouldRespond = shouldRespondToMessage(m, botIds, aiMode, isMentioned, isReply, isGroupChat);
    
    if (shouldRespond) {
      const query = cleanQuery(m.body, botIds);
      if (query && query.length > 1) {
        await processAIQuery(query, m, sock, groqAI, aiMode, isGroupChat);
      }
    }

  } catch (error) {
    console.error('Memory Efficient Groq Error:', error);
    
    // Minimal error response
    try {
      await sock.sendMessage(m.from, {
        text: '🚨 AI briefly unavailable. Try again!'
      }, { quoted: m });
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }
}

// Efficient helper functions
async function processAIQuery(query, m, sock, groqAI, aiMode, isGroupChat) {
  const interactionType = aiMode === 'genius' ? 'genius' : 'normal';
  
  if (!groqAI.checkRateLimit(m.sender, interactionType)) {
    await sock.sendMessage(m.from, {
      text: '⏰ Slow down small! Too many requests.'
    }, { quoted: m });
    return;
  }

  try {
    const response = await groqAI.generateSmartResponse(
      query,
      m.sender,
      isGroupChat ? m.from : null,
      aiMode
    );

    // Limit response length to prevent spam
    let finalResponse = response;
    if (finalResponse.length > 1500) {
      finalResponse = finalResponse.substring(0, 1500) + '\n\n_Response trimmed for chat flow_';
    }

    await sock.sendMessage(m.from, {
      text: finalResponse
    }, { quoted: m });

    console.log(`🤖 Efficient AI response: ${query.substring(0, 30)}...`);

  } catch (error) {
    console.error('AI Query Error:', error);
    await sock.sendMessage(m.from, {
      text: `😅 ${getRandomErrorMessage()}\n\n_${error.message.substring(0, 50)}..._`
    }, { quoted: m });
  }
}

// Efficient AI mode management
async function getAIModeEfficient(userId) {
  try {
    return await safeOperation(async (db) => {
      const user = await db.collection('users').findOne(
        { userId },
        { projection: { 'settings.aiMode': 1 } } // Only get what we need
      );
      return user?.settings?.aiMode || AI_MODES.MENTIONS;
    });
  } catch (error) {
    return AI_MODES.MENTIONS; // Fallback
  }
}

async function cycleAIModeEfficient(userId) {
  const currentMode = await getAIModeEfficient(userId);
  const modes = Object.values(AI_MODES);
  const currentIndex = modes.indexOf(currentMode);
  const nextMode = modes[(currentIndex + 1) % modes.length];
  
  try {
    await safeOperation(async (db) => {
      await db.collection('users').updateOne(
        { userId },
        { $set: { 'settings.aiMode': nextMode, lastActive: new Date() } },
        { upsert: true }
      );
    });
  } catch (error) {
    console.error('Error updating AI mode:', error);
  }
  
  return nextMode;
}

function getAIModeDescription(mode) {
  const descriptions = {
    [AI_MODES.OFF]: 'Only responds to direct commands',
    [AI_MODES.MENTIONS]: 'Responds when mentioned or replied to',
    [AI_MODES.SMART]: 'Contextual participation in conversations',
    [AI_MODES.GENIUS]: 'Advanced group awareness and proactive insights'
  };
  return descriptions[mode] || 'Smart AI assistance';
}

async function generateQuickGroupStats(groupId, groqAI) {
  const context = await groqAI.getGroupContext(groupId, 5);
  const cacheStats = `Profile: ${groqAI.profileCache.size()}, Context: ${groqAI.contextCache.size()}`;
  
  return `🧠 *Quick Group Stats*

💬 Recent messages: ${context.length}
🗂️ AI Cache: ${cacheStats}
📊 Streaming analysis: Active
⚡ Memory usage: Optimized

_Full analysis available in GENIUS mode_`;
}

// Utility functions (keep minimal)
function shouldRespondToMessage(m, botIds, aiMode, isMentioned, isReply, isGroupChat) {
  if (aiMode === AI_MODES.OFF) return false;
  if (isMentioned || isReply) return true;
  if (!isGroupChat && aiMode !== AI_MODES.OFF) return true;
  
  if (isGroupChat && (aiMode === AI_MODES.SMART || aiMode === AI_MODES.GENIUS)) {
    return isNaturalQuestion(m.body) || Math.random() < 0.1; // 10% chance
  }
  
  return false;
}

function cleanQuery(body, botIds) {
  if (!body) return '';
  
  let query = body;
  botIds.forEach(botId => {
    const botNumber = botId.split('@')[0];
    query = query.replace(new RegExp(`@${botNumber}\\s*`, 'g'), '');
  });
  
  return query.replace(/^@\w+\s*/, '').trim();
}

function getRandomErrorMessage() {
  const messages = ['Something went wrong!', 'Network issue!', 'Try again shortly!', 'AI hiccup!'];
  return messages[Math.floor(Math.random() * messages.length)];
}

function isNaturalQuestion(body) {
  if (!body) return false;
  const text = body.toLowerCase();
  return text.includes('?') || 
         /^(what|how|why|when|where|who|which)/.test(text) ||
         text.includes('wetin') || text.includes('how far');
}

// Helper functions from original (minimal versions)
function getBotIds(sock) {
  const botUserId = sock.user?.id;
  if (!botUserId) return [];
  
  const botNumber = botUserId.split(':')[0] || botUserId.split('@')[0];
  return [`${botNumber}@s.whatsapp.net`, '19851909324808@s.whatsapp.net'];
}

function isBotMentioned(mentions, botIds) {
  if (!mentions?.length) return false;
  return mentions.some(mention => 
    botIds.some(botId => mention === botId || mention.split('@')[0] === botId.split('@')[0])
  );
}

function isTextMention(body, botIds) {
  if (!body) return false;
  return botIds.some(botId => body.includes(`@${botId.split('@')[0]}`));
}

function isReplyToBot(quoted, botIds) {
  if (!quoted?.participant) return false;
  return botIds.some(botId => quoted.participant === botId);
}

// Cleanup on exit
process.on('SIGTERM', () => {
  console.log('🧹 Cleaning up memory-efficient Groq plugin...');
});

console.log('✅ Memory-Efficient Smart Groq AI loaded - RAM optimized!');
