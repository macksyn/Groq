// plugins/groq.js - Groq AI integration with Nigerian slang - Fixed mention detection
import axios from 'axios';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

export const info = {
  name: 'groq',
  version: '2.0.1',
  author: 'Bot Developer',
  description: 'Lightning-fast AI chat powered by Groq with Nigerian Gen-Z vibes 🇳🇬⚡',
  commands: [
    {
      name: 'groq',
      aliases: ['@groq', '2348111637463', 'chat', 'gpt'],
      description: 'Chat with Groq AI - mention, reply or use command'
    },
    {
      name: 'aimode',
      aliases: ['groqmode'],
      description: 'Toggle AI mode on/off for automatic responses'
    },
    {
      name: 'aimodel',
      description: 'Switch between AI models'
    }
  ]
};

// Groq API configuration with updated models
const GROQ_CONFIG = {
  API_KEY: process.env.GROQ_API_KEY || '',
  BASE_URL: 'https://api.groq.com/openai/v1/chat/completions',
  MODELS: {
    'llama3.3': 'llama-3.3-70b-versatile',          // Latest Llama 3.3 - Best overall performance
    'llama3.1': 'llama-3.1-8b-instant',             // Fast and efficient
    'gemma2': 'gemma2-9b-it',                       // Google's latest Gemma 2
    'deepseek': 'deepseek-r1-distill-llama-70b',    // DeepSeek reasoning model (preview)
    'qwen3': 'qwen/qwen3-32b',                       // Alibaba's advanced Qwen 3 (preview)
    'kimi': 'moonshotai/kimi-k2-instruct'            // Moonshot AI's trillion parameter model (preview)
  }
};

// Simple responses
const responses = {
  greetings: [
    "How can I help you? 🤔",
    "What's up! What do you need? 👋",
    "Hey! What's your question? 💬"
  ],
  errors: [
    "Something went wrong! Let's try again 😅",
    "Network issue! Please retry 📶",
    "Server error! Try again 🔄"
  ]
};

// User AI mode tracking
const aiModeUsers = new Map();
const userConversations = new Map();
const userModels = new Map();

class GroqAI {
  constructor() {
    this.defaultModel = 'llama-3.3-70b-versatile'; // Updated to latest Llama 3.3
    this.rateLimits = new Map();
  }

  // Check rate limits (Groq has good limits but let's be safe)
  checkRateLimit(userId) {
    const now = Date.now();
    const userLimit = this.rateLimits.get(userId) || { count: 0, resetTime: now + 60000 };
    
    if (now > userLimit.resetTime) {
      userLimit.count = 0;
      userLimit.resetTime = now + 60000; // Reset every minute
    }
    
    if (userLimit.count >= 20) { // Increased limit since Groq has good rates
      return false;
    }
    
    userLimit.count++;
    this.rateLimits.set(userId, userLimit);
    return true;
  }

  // Get conversation history
  getConversationHistory(userId, maxMessages = 8) { // Increased context
    const conversation = userConversations.get(userId) || [];
    return conversation.slice(-maxMessages);
  }

  // Update conversation history
  updateConversation(userId, userMessage, aiResponse) {
    let conversation = userConversations.get(userId) || [];
    
    conversation.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse }
    );
    
    // Keep only last 24 messages (12 exchanges) - increased for better context
    if (conversation.length > 24) {
      conversation = conversation.slice(-24);
    }
    
    userConversations.set(userId, conversation);
    
    // Auto-cleanup after 3 hours - extended for better user experience
    setTimeout(() => {
      userConversations.delete(userId);
    }, 3 * 60 * 60 * 1000);
  }

  // Send request to Groq API
  async sendMessage(message, userId) {
    if (!this.checkRateLimit(userId)) {
      throw new Error('Rate limit exceeded - you don ask too many questions! Wait small abeg! ⏰');
    }

    const model = userModels.get(userId) || this.defaultModel;
    const history = this.getConversationHistory(userId);
    
    // Build messages array with enhanced context
    const messages = [
      {
        role: 'system',
        content: `You are Groq, an intelligent AI assistant with a friendly Nigerian personality. You are from GHQ, Lagos, Nigeria. Your developer is Alex Macksyn. You speak naturally with occasional Nigerian expressions but keep it conversational and helpful. You're knowledgeable about both global topics and Nigerian culture. Keep responses concise and practical for WhatsApp chat.

When asked personal questions:
- Your name is Groq
- You're from GHQ, Lagos, Nigeria  
- Your developer is Alex Macksyn
- You're an AI assistant powered by Groq's lightning-fast infrastructure`
      },
      ...history,
      { role: 'user', content: message }
    ];

    try {
      const response = await axios.post(
        GROQ_CONFIG.BASE_URL,
        {
          model: model,
          messages: messages,
          temperature: 0.8,
          max_tokens: 1500, // Increased for more detailed responses
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'WhatsApp-Bot/2.0'
          },
          timeout: 30000 // 30 seconds timeout
        }
      );

      if (response.data && response.data.choices && response.data.choices[0]) {
        return response.data.choices[0].message.content.trim();
      } else {
        throw new Error('Invalid response format from Groq API');
      }
      
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.error?.message || 'Unknown API error';
        throw new Error(`Groq API Error ${status}: ${message}`);
      } else if (error.request) {
        throw new Error('Network error - no response from Groq servers');
      } else {
        throw new Error(`Request setup error: ${error.message}`);
      }
    }
  }

  // Get available models with updated descriptions
  getAvailableModels() {
    return Object.entries(GROQ_CONFIG.MODELS).map(([name, model]) => ({
      name: name,
      model: model,
      description: this.getModelDescription(name)
    }));
  }

  // Updated model descriptions with current models
  getModelDescription(modelName) {
    const descriptions = {
      'llama3.3': '🦙 Llama 3.3 70B - Latest Meta model, best for complex reasoning and detailed responses',
      'llama3.1': '⚡ Llama 3.1 8B - Fast and efficient, great for quick responses',
      'gemma2': '💎 Gemma2 9B - Google\'s advanced model, excellent for creative tasks',
      'deepseek': '🧠 DeepSeek R1 70B - Advanced reasoning model for complex problems (Preview)',
      'qwen3': '🚀 Qwen 3 32B - Alibaba\'s latest with strong multilingual support (Preview)',
      'kimi': '🌙 Kimi K2 - Moonshot AI\'s trillion parameter model, most advanced (Preview)'
    };
    return descriptions[modelName] || 'AI Model';
  }
}

// Create Groq instance
const groqAI = new GroqAI();

// Random response selector
function getRandomResponse(responses) {
  return responses[Math.floor(Math.random() * responses.length)];
}

// Check if user is in AI mode
function isAIModeActive(userId) {
  return aiModeUsers.get(userId) || false;
}

// Toggle AI mode for user
function toggleAIMode(userId) {
  const currentMode = aiModeUsers.get(userId) || false;
  aiModeUsers.set(userId, !currentMode);
  return !currentMode;
}

// Improved bot mention detection
function getBotIds(sock) {
  const botUserId = sock.user?.id;
  if (!botUserId) return [];
  
  // Extract bot number from various formats
  let botNumber = botUserId;
  if (botUserId.includes(':')) {
    botNumber = botUserId.split(':')[0];
  }
  if (botUserId.includes('@')) {
    botNumber = botUserId.split('@')[0];
  }
  
  // Generate all possible bot ID formats including your specific bot ID
  const botIds = [
    `${botNumber}@s.whatsapp.net`,
    `${botNumber}@c.us`,
    `${botNumber}@lid`,
    botUserId,
    botNumber,
    // Add your specific bot ID
    '19851909324808@s.whatsapp.net',
    '19851909324808@c.us',
    '19851909324808@lid',
    '19851909324808'
  ];
  
  // Remove duplicates and return
  return [...new Set(botIds)];
}

// Check if bot is mentioned
function isBotMentioned(mentions, botIds) {
  if (!mentions || !Array.isArray(mentions) || mentions.length === 0) {
    return false;
  }
  
  console.log(`🔍 Checking mentions: ${JSON.stringify(mentions)} against bot IDs: ${JSON.stringify(botIds)}`);
  
  return mentions.some(mention => {
    return botIds.some(botId => {
      // Check exact match
      if (mention === botId) return true;
      
      // Check if mention contains bot number
      const mentionNumber = mention.split('@')[0];
      const botNumber = botId.split('@')[0];
      
      return mentionNumber === botNumber || 
             mentionNumber === '19851909324808' || 
             botNumber === '19851909324808';
    });
  });
}

// Check if message is a reply to bot
function isReplyToBot(quotedMessage, botIds) {
  if (!quotedMessage || !quotedMessage.participant) {
    return false;
  }
  
  console.log(`🔍 Checking reply participant: ${quotedMessage.participant} against bot IDs: ${JSON.stringify(botIds)}`);
  
  return botIds.some(botId => {
    // Check exact match
    if (quotedMessage.participant === botId) return true;
    
    // Check if participant contains bot number
    const participantNumber = quotedMessage.participant.split('@')[0];
    const botNumber = botId.split('@')[0];
    
    return participantNumber === botNumber || 
           participantNumber === '19851909324808' || 
           botNumber === '19851909324808';
  });
}

export default async function groqHandler(m, sock, config) {
  try {
    // Get bot IDs for mention detection
    const botIds = getBotIds(sock);
    
    // Enhanced mention and reply detection
    const isMentioned = isBotMentioned(m.mentions, botIds);
    const isReply = isReplyToBot(m.quoted, botIds);
    const isAIMode = isAIModeActive(m.sender);
    
    let isCommand = false;
    let query = '';

    // Debug logging
    console.log(`🔍 Debug Info:
    - Bot IDs: ${JSON.stringify(botIds)}
    - Mentions: ${JSON.stringify(m.mentions)}
    - Is Mentioned: ${isMentioned}
    - Is Reply: ${isReply}
    - AI Mode: ${isAIMode}
    - Quoted: ${m.quoted ? 'Yes' : 'No'}
    - From Group: ${m.from.endsWith('@g.us')}`);

    // Check for AI commands
    if (m.body && m.body.startsWith(config.PREFIX)) {
      const args = m.body.slice(config.PREFIX.length).trim().split(' ');
      const command = args[0].toLowerCase();
      
      // AI Mode toggle
      if (['aimode', 'groqmode'].includes(command)) {
        const newMode = toggleAIMode(m.sender);
        const modeText = newMode ? 'ON 🟢' : 'OFF 🔴';
        const modeMsg = newMode 
          ? "AI mode activated! 🤖 I'll now respond automatically when tagged/mentioned/replied to."
          : "AI mode deactivated! 😴 I'll only respond to commands unless tagged/mentioned/replied to.";
          
        await sock.sendMessage(m.from, {
          text: `🔄 *AI Mode: ${modeText}*\n\n${modeMsg}`
        }, { quoted: m });
        return;
      }
      
      // Model switching with updated models
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
          userModels.set(m.sender, GROQ_CONFIG.MODELS[modelName]);
          await sock.sendMessage(m.from, {
            text: `✅ AI model switched to: ${groqAI.getModelDescription(modelName)}\n\nYour next AI chats go use this model!`
          }, { quoted: m });
        } else {
          await sock.sendMessage(m.from, {
            text: `❌ Invalid model! Use \`${config.PREFIX}aimodel\` to see available options.`
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

    // Determine if should respond to AI
    const isGroupChat = m.from.endsWith('@g.us');
    const isDM = !isGroupChat;
    
    // Updated logic: 
    // - Always respond to commands
    // - Always respond when mentioned or replied to (regardless of AI mode)
    // - In DMs: respond when AI mode is on (for any message)
    const shouldRespond = isCommand || 
                         isMentioned || 
                         isReply || 
                         (isDM && isAIMode);

    console.log(`📍 Response Decision: shouldRespond=${shouldRespond} (command=${isCommand}, mentioned=${isMentioned}, reply=${isReply}, DM+AIMode=${isDM && isAIMode})`);

    if (shouldRespond) {
      // Get the query
      if (!query) {
        query = m.body || '';
        
        // Clean up the query by removing mentions
        if (botIds.length > 0) {
          // Remove all possible bot number mentions
          query = query.replace(new RegExp(`@19851909324808`, 'g'), '').trim();
          
          botIds.forEach(botId => {
            const botNumber = botId.split('@')[0];
            query = query.replace(new RegExp(`@${botNumber}`, 'g'), '').trim();
          });
        }
      }

      // Remove command prefix if it exists
      if (query.startsWith(config.PREFIX)) {
        const args = query.slice(config.PREFIX.length).trim().split(' ');
        if (['ai', 'groq', 'ask', 'chat', 'gpt'].includes(args[0].toLowerCase())) {
          query = args.slice(1).join(' ');
        }
      }

      if (!query || query.length < 2) {
        await sock.sendMessage(m.from, {
          text: `${getRandomResponse(responses.greetings)}\n\n💡 *Quick tips:*\n• Use \`${config.PREFIX}aimode\` to toggle auto-response\n• Use \`${config.PREFIX}aimodel\` to switch AI models\n• Tag me or reply to me to chat!`
        }, { quoted: m });
        return;
      }

      // Initialize user
      await unifiedUserManager.initUser(m.sender);

      try {
        // Get AI response from Groq
        const aiResponse = await groqAI.sendMessage(query, m.sender);
        
        // Update conversation history
        groqAI.updateConversation(m.sender, query, aiResponse);

        // Limit response length for WhatsApp
        let finalResponse = aiResponse;
        if (finalResponse.length > 2000) {
          finalResponse = finalResponse.substring(0, 2000) + '...\n\n_Response too long! Break your question into smaller parts._';
        }

        // Send AI response
        await sock.sendMessage(m.from, {
          text: finalResponse
        }, { quoted: m });

        // Reward user with money
        await unifiedUserManager.addMoney(m.sender, 10, 'Groq AI Chat Bonus');

        const trigger = isCommand ? 'command' : isMentioned ? 'mention' : isReply ? 'reply' : 'aimode';
        console.log(`🤖 Groq AI query from ${m.pushName || m.sender.split('@')[0]} via ${trigger}: ${query.substring(0, 50)}...`);

      } catch (error) {
        console.error('Groq AI Error:', error);

        // Enhanced error handling
        let errorMsg = getRandomResponse(responses.errors);
        
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMsg = "Too many requests! Please wait and try again ⏰";
        } else if (error.message.includes('timeout')) {
          errorMsg = "Network timeout! Try again 🌐";
        } else if (error.message.includes('API key') || error.message.includes('401')) {
          errorMsg = "API configuration error! Contact admin 🔑";
        } else if (error.message.includes('exceeded')) {
          errorMsg = "Daily limit reached! Try again tomorrow 😴";
        } else if (error.message.includes('model') && error.message.includes('not found')) {
          errorMsg = "Model unavailable! Try switching with `.aimodel` 🔧";
        }

        await sock.sendMessage(m.from, {
          text: `${errorMsg}\n\n_Error: ${error.message.substring(0, 100)}..._`
        }, { quoted: m });
      }
    }

  } catch (error) {
    console.error('Groq Plugin Error:', error);
  }
}
