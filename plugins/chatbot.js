// plugins/groq.js - Enhanced Groq AI with group conversation awareness
import axios from 'axios';
import { getCollection, safeOperation } from '../lib/mongoManager.js';

export const info = {
  name: 'groq',
  version: '3.0.0',
  author: 'Alex Macksyn',
  description: 'Smart AI that participates naturally in group conversations 🇳🇬⚡',
  commands: [
    {
      name: 'groq',
      aliases: ['@groq', '2348111637463', 'chat', 'gpt'],
      description: 'Chat with Groq AI - mention, reply or use command'
    },
    {
      name: 'aimode',
      aliases: ['groqmode'],
      description: 'Toggle AI mode: off/mentions/smart/active'
    },
    {
      name: 'aimodel',
      description: 'Switch between AI models'
    },
    {
      name: 'groupmemory',
      description: 'Toggle group memory and context awareness'
    }
  ]
};

// Enhanced AI modes
const AI_MODES = {
  OFF: 'off',           // Only responds to direct commands
  MENTIONS: 'mentions', // Only mentions and replies (default)
  SMART: 'smart',       // Contextual participation in conversations
  ACTIVE: 'active'      // Actively participates when relevant
};

// Groq API configuration
const GROQ_CONFIG = {
  API_KEY: process.env.GROQ_API_KEY || '',
  BASE_URL: 'https://api.groq.com/openai/v1/chat/completions',
  MODELS: {
    'llama3.3': 'llama-3.3-70b-versatile',
    'llama3.1': 'llama-3.1-8b-instant',
    'gemma2': 'gemma2-9b-it',
    'deepseek': 'deepseek-r1-distill-llama-70b',
    'qwen3': 'qwen/qwen3-32b',
    'kimi': 'moonshotai/kimi-k2-instruct'
  }
};

// Enhanced storage with MongoDB integration
const aiModeUsers = new Map();
const userConversations = new Map();
const userModels = new Map();
const groupMemory = new Map();
const groupMemberProfiles = new Map();
const conversationContext = new Map();

// MongoDB User Management Functions
async function initUser(userId) {
  try {
    return await safeOperation(async (db, collection) => {
      const users = db.collection('users');
      const existingUser = await users.findOne({ userId });
      
      if (!existingUser) {
        const newUser = {
          userId,
          balance: 1000,
          totalEarned: 0,
          joinedAt: new Date(),
          lastActive: new Date(),
          aiInteractions: 0,
          settings: {
            aiMode: 'mentions',
            preferredModel: 'llama-3.3-70b-versatile'
          }
        };
        await users.insertOne(newUser);
        return newUser;
      }
      
      // Update last active
      await users.updateOne(
        { userId },
        { $set: { lastActive: new Date() } }
      );
      return existingUser;
    });
  } catch (error) {
    console.error('Error initializing user:', error);
    return null;
  }
}

async function addMoney(userId, amount, reason = 'AI Chat Bonus') {
  try {
    return await safeOperation(async (db, collection) => {
      const users = db.collection('users');
      const result = await users.updateOne(
        { userId },
        { 
          $inc: { 
            balance: amount, 
            totalEarned: amount,
            aiInteractions: 1
          },
          $set: { lastActive: new Date() },
          $push: {
            transactions: {
              $each: [{
                type: 'earn',
                amount,
                reason,
                timestamp: new Date()
              }],
              $slice: -50 // Keep last 50 transactions
            }
          }
        },
        { upsert: false }
      );
      return result.matchedCount > 0;
    });
  } catch (error) {
    console.error('Error adding money:', error);
    return false;
  }
}

async function getUserAISettings(userId) {
  try {
    return await safeOperation(async (db, collection) => {
      const users = db.collection('users');
      const user = await users.findOne({ userId });
      return user?.settings || { aiMode: 'mentions', preferredModel: 'llama-3.3-70b-versatile' };
    });
  } catch (error) {
    console.error('Error getting user AI settings:', error);
    return { aiMode: 'mentions', preferredModel: 'llama-3.3-70b-versatile' };
  }
}

async function updateUserAISettings(userId, settings) {
  try {
    return await safeOperation(async (db, collection) => {
      const users = db.collection('users');
      const result = await users.updateOne(
        { userId },
        { 
          $set: { 
            'settings.aiMode': settings.aiMode || 'mentions',
            'settings.preferredModel': settings.preferredModel || 'llama-3.3-70b-versatile',
            lastActive: new Date()
          }
        },
        { upsert: true }
      );
      return result.matchedCount > 0 || result.upsertedCount > 0;
    });
  } catch (error) {
    console.error('Error updating user AI settings:', error);
    return false;
  }
}

async function saveGroupContext(groupId, context) {
  try {
    return await safeOperation(async (db, collection) => {
      const groups = db.collection('groupContexts');
      await groups.updateOne(
        { groupId },
        { 
          $set: { 
            context: context.slice(-30), // Keep last 30 messages
            lastUpdated: new Date()
          }
        },
        { upsert: true }
      );
    });
  } catch (error) {
    console.error('Error saving group context:', error);
  }
}

async function getGroupContext(groupId) {
  try {
    return await safeOperation(async (db, collection) => {
      const groups = db.collection('groupContexts');
      const group = await groups.findOne({ groupId });
      return group?.context || [];
    });
  } catch (error) {
    console.error('Error getting group context:', error);
    return [];
  }
}

class EnhancedGroqAI {
  constructor() {
    this.defaultModel = 'llama-3.3-70b-versatile';
    this.rateLimits = new Map();
    this.contextualKeywords = [
      // Questions about people
      'who is', 'who\'s', 'tell me about', 'what about', 'how is', 'where is',
      // Group dynamics
      'everyone', 'somebody', 'anyone', 'people here', 'members', 'guys',
      // Conversational hooks
      'what do you think', 'your opinion', 'thoughts', 'agree', 'disagree',
      // Nigerian expressions
      'wetin', 'how far', 'which kain', 'abeg', 'oya', 'sha', 'make we',
      // General engagement
      'funny', 'interesting', 'cool', 'nice', 'good', 'bad', 'problem'
    ];
  }

  // Enhanced rate limiting for different interaction types
  checkRateLimit(userId, interactionType = 'normal') {
    const now = Date.now();
    const limits = {
      normal: { max: 20, window: 60000 },     // 20 per minute for direct
      contextual: { max: 8, window: 300000 }, // 8 per 5 minutes for smart
      active: { max: 12, window: 600000 }     // 12 per 10 minutes for active
    };
    
    const limit = limits[interactionType] || limits.normal;
    const userLimit = this.rateLimits.get(`${userId}_${interactionType}`) || 
                     { count: 0, resetTime: now + limit.window };
    
    if (now > userLimit.resetTime) {
      userLimit.count = 0;
      userLimit.resetTime = now + limit.window;
    }
    
    if (userLimit.count >= limit.max) {
      return false;
    }
    
    userLimit.count++;
    this.rateLimits.set(`${userId}_${interactionType}`, userLimit);
    return true;
  }

  // Store group member information
  updateGroupMember(groupId, userId, memberInfo) {
    if (!groupMemberProfiles.has(groupId)) {
      groupMemberProfiles.set(groupId, new Map());
    }
    
    const groupMembers = groupMemberProfiles.get(groupId);
    const existing = groupMembers.get(userId) || {};
    
    groupMembers.set(userId, {
      ...existing,
      ...memberInfo,
      lastSeen: Date.now(),
      messageCount: (existing.messageCount || 0) + 1
    });
  }

  // Enhanced group context with MongoDB persistence
  async getGroupContext(groupId, maxMessages = 10) {
    // Try memory first for speed
    if (conversationContext.has(groupId)) {
      return conversationContext.get(groupId).slice(-maxMessages);
    }
    
    // Fall back to database
    const context = await getGroupContext(groupId);
    conversationContext.set(groupId, context);
    return context.slice(-maxMessages);
  }

  // Enhanced group context update with MongoDB persistence
  async updateGroupContext(groupId, message) {
    let context = conversationContext.get(groupId) || [];
    context.push({
      ...message,
      timestamp: Date.now()
    });
    
    // Keep last 30 messages in memory
    if (context.length > 30) {
      context = context.slice(-30);
    }
    
    conversationContext.set(groupId, context);
    
    // Persist to database every 5 messages or every 10 minutes
    const shouldPersist = context.length % 5 === 0 || 
                         !this._lastPersist || 
                         Date.now() - this._lastPersist > 600000;
    
    if (shouldPersist) {
      await saveGroupContext(groupId, context);
      this._lastPersist = Date.now();
    }
    
    // Auto-cleanup memory after 2 hours
    setTimeout(() => {
      const currentContext = conversationContext.get(groupId) || [];
      const recentContext = currentContext.filter(msg => 
        Date.now() - msg.timestamp < 2 * 60 * 60 * 1000
      );
      conversationContext.set(groupId, recentContext);
    }, 2 * 60 * 60 * 1000);
  }

  // Enhanced contextual response detection
  shouldRespondContextually(message, groupContext, aiMode) {
    if (aiMode === AI_MODES.OFF || aiMode === AI_MODES.MENTIONS) {
      return false;
    }

    const messageText = (message.body || '').toLowerCase();
    
    // Don't respond to commands contextually
    if (messageText.startsWith('.') || messageText.startsWith('/') || messageText.startsWith('!')) {
      return false;
    }
    
    // Smart mode - respond to contextual cues
    if (aiMode === AI_MODES.SMART) {
      // Prioritize natural questions
      if (isNaturalQuestion(message.body)) {
        return true;
      }
      
      // Check for contextual keywords
      const hasKeywords = this.contextualKeywords.some(keyword => 
        messageText.includes(keyword)
      );
      
      // Check if conversation is asking for opinions or thoughts
      const isAsking = /\b(what|how|why|when|where|should|would|could|can)\b/.test(messageText) &&
                      /\b(think|opinion|feel|say|do|about)\b/.test(messageText);
      
      // Check if it's a question to the group
      const isGroupQuestion = messageText.includes('?') && 
                             (messageText.includes('anyone') || 
                              messageText.includes('everybody') || 
                              messageText.includes('someone') ||
                              messageText.includes('guys'));
      
      return hasKeywords || isAsking || isGroupQuestion;
    }

    // Active mode - more liberal participation
    if (aiMode === AI_MODES.ACTIVE) {
      // Prioritize natural questions
      if (isNaturalQuestion(message.body)) {
        return true;
      }
      
      // Questions, discussions, or interesting topics
      const hasQuestion = messageText.includes('?');
      const hasDiscussion = /\b(discuss|talk|chat|share|think|opinion|what|how|why)\b/.test(messageText);
      const hasEmotionalCue = /\b(funny|interesting|cool|amazing|terrible|good|bad|nice|awesome)\b/.test(messageText);
      
      // Check recent conversation flow
      const recentMessages = groupContext.slice(-3);
      const isOngoingConversation = recentMessages.length >= 2 &&
        recentMessages.every(msg => Date.now() - msg.timestamp < 120000); // Within 2 minutes
      
      return hasQuestion || hasDiscussion || hasEmotionalCue || 
             (isOngoingConversation && Math.random() < 0.3); // 30% chance in ongoing convos
    }

    return false;
  }

  // Enhanced message generation with group context
  async sendMessage(message, userId, groupId = null, contextType = 'direct') {
    const interactionType = contextType === 'direct' ? 'normal' : 
                           contextType === 'smart' ? 'contextual' : 'active';
    
    if (!this.checkRateLimit(userId, interactionType)) {
      throw new Error('Rate limit exceeded - small break first! ⏰');
    }

    const model = await getUserModel(userId);
    const history = this.getConversationHistory(userId);
    
    // Build enhanced context for groups
    let systemPrompt = `You are Groq, an intelligent AI assistant with a friendly Nigerian personality. You are from GHQ, Lagos, Nigeria. Your developer is Alex Macksyn.`;
    
    if (groupId) {
      const groupContext = await this.getGroupContext(groupId);
      const groupMembers = groupMemberProfiles.get(groupId);
      
      if (contextType === 'smart' || contextType === 'active') {
        systemPrompt += ` You're participating in a WhatsApp group chat. Be conversational and natural.`;
        
        if (groupContext.length > 0) {
          systemPrompt += ` Recent conversation context:\n`;
          groupContext.slice(-5).forEach(ctx => {
            const memberName = ctx.pushName || ctx.sender.split('@')[0];
            systemPrompt += `${memberName}: ${ctx.body}\n`;
          });
        }
        
        if (contextType === 'smart') {
          systemPrompt += `\nRespond naturally but only when you have something valuable to add. Keep it brief and relevant.`;
        } else {
          systemPrompt += `\nYou can participate actively in the conversation. Be engaging but not overwhelming.`;
        }
      }
    }

    systemPrompt += `\n\nKeep responses concise for WhatsApp. Use occasional Nigerian expressions naturally but stay helpful and friendly.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message }
    ];

    try {
      const response = await axios.post(
        GROQ_CONFIG.BASE_URL,
        {
          model: model,
          messages: messages,
          temperature: contextType === 'direct' ? 0.8 : 0.9,
          max_tokens: contextType === 'direct' ? 1500 : 800,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content.trim();
      } else {
        throw new Error('Invalid response format from Groq API');
      }
      
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.error?.message || 'Unknown API error';
        throw new Error(`Groq API Error ${status}: ${message}`);
      }
      throw new Error(`Request error: ${error.message}`);
    }
  }

  // Keep existing methods for backward compatibility
  getConversationHistory(userId, maxMessages = 8) {
    const conversation = userConversations.get(userId) || [];
    return conversation.slice(-maxMessages);
  }

  updateConversation(userId, userMessage, aiResponse) {
    let conversation = userConversations.get(userId) || [];
    conversation.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse }
    );
    
    if (conversation.length > 24) {
      conversation = conversation.slice(-24);
    }
    
    userConversations.set(userId, conversation);
    
    setTimeout(() => {
      userConversations.delete(userId);
    }, 3 * 60 * 60 * 1000);
  }

  getAvailableModels() {
    return Object.entries(GROQ_CONFIG.MODELS).map(([name, model]) => ({
      name: name,
      model: model,
      description: this.getModelDescription(name)
    }));
  }

  getModelDescription(modelName) {
    const descriptions = {
      'llama3.3': '🦙 Llama 3.3 70B - Latest Meta model, best for complex reasoning',
      'llama3.1': '⚡ Llama 3.1 8B - Fast and efficient for quick responses',
      'gemma2': '💎 Gemma2 9B - Google\'s model, great for creative tasks',
      'deepseek': '🧠 DeepSeek R1 70B - Advanced reasoning model (Preview)',
      'qwen3': '🚀 Qwen 3 32B - Strong multilingual support (Preview)',
      'kimi': '🌙 Kimi K2 - Most advanced trillion parameter model (Preview)'
    };
    return descriptions[modelName] || 'AI Model';
  }
}

// Enhanced AI mode management with MongoDB persistence
async function getAIMode(userId) {
  // Check memory first
  if (aiModeUsers.has(userId)) {
    return aiModeUsers.get(userId);
  }
  
  // Get from database
  const settings = await getUserAISettings(userId);
  const mode = settings.aiMode || AI_MODES.MENTIONS;
  aiModeUsers.set(userId, mode);
  return mode;
}

async function setAIMode(userId, mode) {
  if (!Object.values(AI_MODES).includes(mode)) {
    mode = AI_MODES.MENTIONS;
  }
  
  // Update memory
  aiModeUsers.set(userId, mode);
  
  // Update database
  await updateUserAISettings(userId, { aiMode: mode });
  return mode;
}

async function cycleAIMode(userId) {
  const currentMode = await getAIMode(userId);
  const modes = Object.values(AI_MODES);
  const currentIndex = modes.indexOf(currentMode);
  const nextMode = modes[(currentIndex + 1) % modes.length];
  return await setAIMode(userId, nextMode);
}

async function getUserModel(userId) {
  // Check memory first
  if (userModels.has(userId)) {
    return userModels.get(userId);
  }
  
  // Get from database
  const settings = await getUserAISettings(userId);
  const model = settings.preferredModel || 'llama-3.3-70b-versatile';
  userModels.set(userId, model);
  return model;
}

async function setUserModel(userId, model) {
  // Update memory
  userModels.set(userId, model);
  
  // Update database
  await updateUserAISettings(userId, { preferredModel: model });
  return model;
}

// MISSING UTILITY FUNCTIONS - These were causing the error
function isMessageACommand(messageBody, config) {
  if (!messageBody || typeof messageBody !== 'string') return false;
  
  // Check if message starts with command prefix
  if (messageBody.startsWith(config.PREFIX)) {
    return true;
  }
  
  // Check for other command patterns (adapt based on your bot's command structure)
  const commandPatterns = [
    /^[.!\/]/,  // Commands starting with ., !, or /
    /^@\w+/,    // Mentions that might be commands
  ];
  
  return commandPatterns.some(pattern => pattern.test(messageBody));
}

function isQuotedMessageACommand(quotedMessage, config) {
  if (!quotedMessage?.body) return false;
  return isMessageACommand(quotedMessage.body, config);
}

function isNaturalQuestion(messageBody) {
  if (!messageBody || typeof messageBody !== 'string') return false;
  
  const text = messageBody.toLowerCase().trim();
  
  // Direct questions
  if (text.includes('?')) return true;
  
  // Question words
  const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'whose'];
  const startsWithQuestion = questionWords.some(word => 
    text.startsWith(word + ' ') || text.startsWith(word + "'")
  );
  
  // Nigerian question patterns
  const nigerianQuestions = ['wetin', 'how far', 'which kain', 'na wetin'];
  const hasNigerianQuestion = nigerianQuestions.some(phrase => text.includes(phrase));
  
  // Help requests
  const helpPatterns = ['help me', 'can you', 'please', 'i need', 'tell me'];
  const isHelpRequest = helpPatterns.some(phrase => text.includes(phrase));
  
  return startsWithQuestion || hasNigerianQuestion || isHelpRequest;
}

export default async function groqHandler(m, sock, config) {
  // Create enhanced Groq instance
  const groqAI = new EnhancedGroqAI();

  // Enhanced utility functions (keeping existing ones)
  function getRandomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  function getBotIds(sock) {
    const botUserId = sock.user?.id;
    if (!botUserId) return [];
    
    let botNumber = botUserId;
    if (botUserId.includes(':')) botNumber = botUserId.split(':')[0];
    if (botUserId.includes('@')) botNumber = botUserId.split('@')[0];
    
    return [...new Set([
      `${botNumber}@s.whatsapp.net`,
      `${botNumber}@c.us`,
      `${botNumber}@lid`,
      botUserId,
      botNumber,
      '19851909324808@s.whatsapp.net',
      '19851909324808@c.us',
      '19851909324808@lid',
      '19851909324808'
    ])];
  }

  function isTextMention(messageBody, botIds) {
    if (!messageBody || typeof messageBody !== 'string') return false;
    
    if (messageBody.includes('@19851909324808')) return true;
    
    return botIds.some(botId => {
      const botNumber = botId.split('@')[0];
      const mentionRegex = new RegExp(`@${botNumber}(?:\\s|$)`, 'i');
      return mentionRegex.test(messageBody);
    });
  }

  function isBotMentioned(mentions, botIds) {
    if (!mentions || !Array.isArray(mentions) || mentions.length === 0) return false;
    
    return mentions.some(mention => {
      return botIds.some(botId => {
        if (mention === botId) return true;
        const mentionNumber = mention.split('@')[0];
        const botNumber = botId.split('@')[0];
        return mentionNumber === botNumber || mentionNumber === '19851909324808';
      });
    });
  }

  function isReplyToBot(quotedMessage, botIds) {
    if (!quotedMessage?.participant) return false;
    
    return botIds.some(botId => {
      if (quotedMessage.participant === botId) return true;
      const participantNumber = quotedMessage.participant.split('@')[0];
      const botNumber = botId.split('@')[0];
      return participantNumber === botNumber || participantNumber === '19851909324808';
    });
  }

  try {
    const botIds = getBotIds(sock);
    const isMentioned = isBotMentioned(m.mentions, botIds) || isTextMention(m.body, botIds);
    const isReply = isReplyToBot(m.quoted, botIds);
    const aiMode = await getAIMode(m.sender);
    const isGroupChat = m.from.endsWith('@g.us');
    
    // FIXED: Enhanced command and question detection with proper function definitions
    const isCurrentMessageCommand = isMessageACommand(m.body, config);
    const isQuotedMessageCommand = isQuotedMessageACommand(m.quoted, config);
    const isNaturalQuestionMessage = isNaturalQuestion(m.body);
    
    // Update group context and member info
    if (isGroupChat) {
      await groqAI.updateGroupContext(m.from, {
        sender: m.sender,
        pushName: m.pushName,
        body: m.body,
        type: m.type
      });
      
      groqAI.updateGroupMember(m.from, m.sender, {
        pushName: m.pushName,
        lastMessage: m.body
      });
    }

    let isCommand = false;
    let query = '';

    console.log(`🔍 Enhanced Message Analysis:
    - Is Current Command: ${isCurrentMessageCommand}
    - Is Quoted Command: ${isQuotedMessageCommand}
    - Is Natural Question: ${isNaturalQuestionMessage}
    - Is Mentioned: ${isMentioned}
    - Is Reply: ${isReply}
    - Message: "${m.body?.substring(0, 50)}..."
    - Quoted: "${m.quoted?.body?.substring(0, 30)}..."`);

    // Handle commands
    if (m.body?.startsWith(config.PREFIX)) {
      const args = m.body.slice(config.PREFIX.length).trim().split(' ');
      const command = args[0].toLowerCase();
      
      // Enhanced AI mode toggle
      if (['aimode', 'groqmode'].includes(command)) {
        const modeArg = args[1]?.toLowerCase();
        let newMode;
        
        if (modeArg && Object.values(AI_MODES).includes(modeArg)) {
          newMode = await setAIMode(m.sender, modeArg);
        } else {
          newMode = await cycleAIMode(m.sender);
        }
        
        const modeDescriptions = {
          [AI_MODES.OFF]: 'OFF 🔴 - Only commands',
          [AI_MODES.MENTIONS]: 'MENTIONS 🟡 - Only when tagged/replied',
          [AI_MODES.SMART]: 'SMART 🟢 - Contextual participation',
          [AI_MODES.ACTIVE]: 'ACTIVE 🔵 - Active group participation'
        };
        
        const modeExplanations = {
          [AI_MODES.OFF]: 'I\'ll only respond to direct commands.',
          [AI_MODES.MENTIONS]: 'I\'ll respond when mentioned, replied to, or commanded.',
          [AI_MODES.SMART]: 'I\'ll join conversations when I have something valuable to add.',
          [AI_MODES.ACTIVE]: 'I\'ll actively participate in ongoing discussions.'
        };
        
        await sock.sendMessage(m.from, {
          text: `🤖 *AI Mode: ${modeDescriptions[newMode]}*\n\n${modeExplanations[newMode]}\n\n💡 Use \`${config.PREFIX}aimode [off/mentions/smart/active]\` to set specific mode.`
        }, { quoted: m });
        return;
      }
      
      // Model switching (keep existing logic)
      if (command === 'aimodel') {
        const modelName = args[1]?.toLowerCase();
        
        if (!modelName) {
          const models = groqAI.getAvailableModels();
          const currentModel = userModels.get(m.sender) || 'llama-3.3-70b-versatile';
          
          let modelList = '*🤖 Available AI Models:*\n\n';
          models.forEach(model => {
            const current = GROQ_CONFIG.MODELS[model.name] === currentModel ? ' ✅' : '';
            const previewTag = ['deepseek', 'qwen3', 'kimi'].includes(model.name) ? ' 🧪' : '';
            modelList += `${model.description}${current}${previewTag}\nCommand: \`${config.PREFIX}aimodel ${model.name}\`\n\n`;
          });
          
          modelList += '_🧪 Preview models may be discontinued without notice_';
          await sock.sendMessage(m.from, { text: modelList }, { quoted: m });
          return;
        }
        
        if (GROQ_CONFIG.MODELS[modelName]) {
          await setUserModel(m.sender, GROQ_CONFIG.MODELS[modelName]);
          await sock.sendMessage(m.from, {
            text: `✅ AI model switched to: ${groqAI.getModelDescription(modelName)}`
          }, { quoted: m });
        } else {
          await sock.sendMessage(m.from, {
            text: `❌ Invalid model! Use \`${config.PREFIX}aimodel\` to see options.`
          }, { quoted: m });
        }
        return;
      }
      
      // AI chat commands
      if (['ai', 'groq', 'ask', 'chat', 'gpt'].includes(command)) {
        isCommand = true;
        query = args.slice(1).join(' ');
      }
    }

    // Enhanced response logic with smart command filtering
    const groupContext = isGroupChat ? await groqAI.getGroupContext(m.from) : [];
    const shouldRespondContextually = isGroupChat && 
      groqAI.shouldRespondContextually(m, groupContext, aiMode);
    
    // ENHANCED: Don't respond to replies if the quoted message was a non-AI command
    const isValidReply = isReply && !isQuotedMessageCommand;
    
    // ENHANCED: Allow AI commands but filter out other commands in contextual responses
    const shouldRespond = isCommand ||           // Our AI commands always work
                         (isMentioned && !isCurrentMessageCommand) ||  // Mentions (unless it's a non-AI command)
                         isValidReply ||         // Valid replies (not to non-AI commands)
                         (!isGroupChat && aiMode !== AI_MODES.OFF && !isCurrentMessageCommand) || // DM (non-commands)
                         shouldRespondContextually; // Contextual group participation

    console.log(`📍 Enhanced Response Decision:
    - Mode: ${aiMode}
    - AI Command: ${isCommand}
    - Mentioned: ${isMentioned}
    - Valid Reply: ${isValidReply} (isReply=${isReply}, quotedCmd=${isQuotedMessageCommand})
    - Contextual: ${shouldRespondContextually}
    - Should Respond: ${shouldRespond}
    - Current Message is Non-AI Command: ${isCurrentMessageCommand}`);

    if (shouldRespond) {
      // Don't respond contextually to non-AI command-like messages
      if (shouldRespondContextually && isCurrentMessageCommand) {
        console.log(`🚫 Ignoring contextual response to non-AI command: ${m.body}`);
        return;
      }
      
      // Process query
      if (!query) {
        query = m.body || '';
        
        // Clean up mentions from query
        if (botIds.length > 0) {
          query = query.replace(new RegExp(`@19851909324808\\s*`, 'g'), '').trim();
          botIds.forEach(botId => {
            const botNumber = botId.split('@')[0];
            query = query.replace(new RegExp(`@${botNumber}\\s*`, 'g'), '').trim();
          });
          query = query.replace(/^@\w+\s*/, '').trim();
        }
      }

      if (!query || query.length < 2) {
        const modeText = {
          [AI_MODES.OFF]: 'OFF 🔴',
          [AI_MODES.MENTIONS]: 'MENTIONS 🟡',
          [AI_MODES.SMART]: 'SMART 🟢', 
          [AI_MODES.ACTIVE]: 'ACTIVE 🔵'
        };
        
        await sock.sendMessage(m.from, {
          text: `${getRandomResponse(['How can I help? 🤔', 'What\'s up! 👋', 'Wetin you need? 💬'])}\n\n💡 *Commands:*\n• \`${config.PREFIX}aimode\` - Toggle participation level\n• \`${config.PREFIX}aimodel\` - Switch AI models\n\n🤖 Current Mode: ${modeText[aiMode]}`
        }, { quoted: m });
        return;
      }

      await initUser(m.sender);

      try {
        // Determine context type for response
        let contextType = 'direct';
        if (shouldRespondContextually) {
          contextType = aiMode === AI_MODES.SMART ? 'smart' : 'active';
        }
        
        const aiResponse = await groqAI.sendMessage(
          query, 
          m.sender, 
          isGroupChat ? m.from : null, 
          contextType
        );
        
        groqAI.updateConversation(m.sender, query, aiResponse);

        // Limit response length
        let finalResponse = aiResponse;
        const maxLength = contextType === 'direct' ? 2000 : 1200;
        if (finalResponse.length > maxLength) {
          finalResponse = finalResponse.substring(0, maxLength) + 
                         '...\n\n_Response trimmed for chat flow_';
        }

        await sock.sendMessage(m.from, {
          text: finalResponse
        }, { quoted: m });

        // Reward user
        const bonusAmount = contextType === 'direct' ? 10 : 5;
        await addMoney(m.sender, bonusAmount, 'AI Chat Bonus');

        const trigger = isCommand ? 'command' : 
                       isMentioned ? 'mention' : 
                       isValidReply ? 'reply' : 
                       isNaturalQuestionMessage ? 'question' :
                       contextType;
        
        console.log(`🤖 Groq response via ${trigger}: ${query.substring(0, 50)}...`);

      } catch (error) {
        console.error('Groq AI Error:', error);

        let errorMsg = 'Something went wrong! Try again 😅';
        if (error.message.includes('rate limit')) {
          errorMsg = "Slow down small! Too many messages ⏰";
        } else if (error.message.includes('timeout')) {
          errorMsg = "Network slow! Try again 🌐";
        }

        await sock.sendMessage(m.from, {
          text: `${errorMsg}\n\n_${error.message.substring(0, 100)}..._`
        }, { quoted: m });
      }
    }

  } catch (error) {
    console.error('Enhanced Groq Plugin Error:', error);
  }
}
