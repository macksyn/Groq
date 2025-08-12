// plugins/groq.js - Groq AI integration with Nigerian slang
import axios from 'axios';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

export const info = {
  name: 'groq',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Lightning-fast AI chat powered by Groq with Nigerian Gen-Z vibes 🇳🇬⚡',
  commands: [
    {
      name: 'ai',
      aliases: ['groq', 'ask', 'chat', 'gpt'],
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

// Groq API configuration
const GROQ_CONFIG = {
  API_KEY: process.env.GROQ_API_KEY || '',
  BASE_URL: 'https://api.groq.com/openai/v1/chat/completions',
  MODELS: {
    'mixtral': 'mixtral-8x7b-32768',
    'llama': 'llama3-70b-8192',
    'gemma': 'gemma-7b-it'
  }
};

// Nigerian slang responses
const naijaResponses = {
  thinking: [
    "Abeg make I think this thing well well... 🤔",
    "Groq dey compute your matter oh... ⚡",
    "Make I ask my AI brain... 🧠",
    "Processing at lightning speed... 🚀",
    "E dey load for my system... 💻"
  ],
  greetings: [
    "Wetin dey happen boss! 🔥",
    "How far na! You get question for me? 👋",
    "Omo see serious question! 🤯",
    "You don come with gist oh! 💬",
    "Na wetin be this your matter sef? 😅"
  ],
  errors: [
    "Omo, Groq don catch error small! 😅 Make we try again!",
    "Network wahala don show face! One more time abeg! 📶",
    "AI server dey form attitude! But we go retry! 💪",
    "Something just happen for backend! Try again nah! 🔄"
  ],
  success: [
    "Oya! Groq don answer your question! 🎯",
    "See am oh! Na this be the correct gist! ✨",
    "Perfect! Make I break am down for you! 📝",
    "Groq talk say make I tell you say... 🤖"
  ]
};

// User AI mode tracking
const aiModeUsers = new Map();
const userConversations = new Map();
const userModels = new Map();

class GroqAI {
  constructor() {
    this.defaultModel = 'mixtral-8x7b-32768';
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
    
    if (userLimit.count >= 15) { // Max 15 requests per minute
      return false;
    }
    
    userLimit.count++;
    this.rateLimits.set(userId, userLimit);
    return true;
  }

  // Get conversation history
  getConversationHistory(userId, maxMessages = 6) {
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
    
    // Keep only last 20 messages (10 exchanges)
    if (conversation.length > 20) {
      conversation = conversation.slice(-20);
    }
    
    userConversations.set(userId, conversation);
    
    // Auto-cleanup after 2 hours
    setTimeout(() => {
      userConversations.delete(userId);
    }, 2 * 60 * 60 * 1000);
  }

  // Send request to Groq API
  async sendMessage(message, userId) {
    if (!this.checkRateLimit(userId)) {
      throw new Error('Rate limit exceeded - too many requests!');
    }

    const model = userModels.get(userId) || this.defaultModel;
    const history = this.getConversationHistory(userId);
    
    // Build messages array with context
    const messages = [
      {
        role: 'system',
        content: `You are an intelligent AI assistant with Nigerian Gen-Z personality. You speak with authentic Nigerian urban slang mixed with proper English. You're witty, helpful, and knowledgeable about both global topics and Nigerian culture. Keep responses conversational, engaging, and not too long for WhatsApp. Use Nigerian expressions naturally but ensure your advice is practical and helpful. You understand Nigerian context, challenges, and opportunities.`
      },
      ...history,
      { role: 'user', content: message }
    ];

    const response = await axios.post(
      GROQ_CONFIG.BASE_URL,
      {
        model: model,
        messages: messages,
        temperature: 0.8,
        max_tokens: 1000,
        top_p: 0.9,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      }
    );

    return response.data.choices[0].message.content.trim();
  }

  // Get available models
  getAvailableModels() {
    return Object.entries(GROQ_CONFIG.MODELS).map(([name, model]) => ({
      name: name,
      model: model,
      description: this.getModelDescription(name)
    }));
  }

  // Get model description
  getModelDescription(modelName) {
    const descriptions = {
      'mixtral': '🧠 Mixtral - Best for complex reasoning and detailed explanations',
      'llama': '🦙 Llama3 - Great for general chat and creative tasks',
      'gemma': '💎 Gemma - Fast and efficient for quick responses'
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

export default async function groqHandler(m, sock, config) {
  try {
    // Check if message mentions the bot, is a reply to bot, or uses AI command
    const botNumber = sock.user.id.split(':')[0];
    const isMentioned = m.mentionedJid?.includes(`${botNumber}@s.whatsapp.net`);
    const isReply = m.quoted && m.quoted.participant === `${botNumber}@s.whatsapp.net`;
    const isAIMode = isAIModeActive(m.sender);
    
    let isCommand = false;
    let query = '';

    // Check for AI commands
    if (m.body && m.body.startsWith(config.PREFIX)) {
      const args = m.body.slice(config.PREFIX.length).trim().split(' ');
      const command = args[0].toLowerCase();
      
      // AI Mode toggle
      if (['aimode', 'groqmode'].includes(command)) {
        const newMode = toggleAIMode(m.sender);
        const modeText = newMode ? 'ON 🟢' : 'OFF 🔴';
        const modeMsg = newMode 
          ? "AI mode don dey active! 🤖 Now I go respond to all your messages automatically! Type the command again to turn off."
          : "AI mode don off! 😴 Now I go only respond when you mention me or use AI commands.";
          
        await sock.sendMessage(m.from, {
          text: `🔄 *AI Mode: ${modeText}*\n\n${modeMsg}`
        }, { quoted: m });
        return;
      }
      
      // Model switching
      if (command === 'aimodel') {
        const modelName = args[1]?.toLowerCase();
        
        if (!modelName) {
          const models = groqAI.getAvailableModels();
          const currentModel = userModels.get(m.sender) || 'mixtral-8x7b-32768';
          
          let modelList = '*Available AI Models:*\n\n';
          models.forEach(model => {
            const current = GROQ_CONFIG.MODELS[model.name] === currentModel ? ' ✅' : '';
            modelList += `${model.description}${current}\nCommand: \`${config.PREFIX}aimodel ${model.name}\`\n\n`;
          });
          
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
    const shouldRespond = isMentioned || isReply || isCommand || isAIMode;

    if (shouldRespond) {
      // Get the query
      if (!query) {
        query = m.body?.replace(`@${botNumber}`, '').trim() || '';
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
          text: `${getRandomResponse(naijaResponses.greetings)} Wetin you wan ask me? 🤔\n\n💡 *Quick tips:*\n• Use \`${config.PREFIX}aimode\` to toggle auto-response\n• Use \`${config.PREFIX}aimodel\` to switch AI models`
        }, { quoted: m });
        return;
      }

      // Initialize user
      await unifiedUserManager.initUser(m.sender);

      // Send thinking message
      const thinkingMsg = await sock.sendMessage(m.from, {
        text: getRandomResponse(naijaResponses.thinking)
      }, { quoted: m });

      try {
        // Get AI response from Groq
        const aiResponse = await groqAI.sendMessage(query, m.sender);
        
        // Update conversation history
        groqAI.updateConversation(m.sender, query, aiResponse);

        // Limit response length for WhatsApp
        let finalResponse = aiResponse;
        if (finalResponse.length > 1800) {
          finalResponse = finalResponse.substring(0, 1800) + '...\n\n_Abeg the response long pass! For full gist, break your question into smaller parts! 😅_';
        }

        // Delete thinking message
        try {
          await sock.sendMessage(m.from, { delete: thinkingMsg.key });
        } catch (error) {
          // Silent fail
        }

        // Send AI response
        const modelName = Object.keys(GROQ_CONFIG.MODELS).find(
          key => GROQ_CONFIG.MODELS[key] === (userModels.get(m.sender) || 'mixtral-8x7b-32768')
        ) || 'mixtral';

        await sock.sendMessage(m.from, {
          text: `${getRandomResponse(naijaResponses.success)}\n\n${finalResponse}\n\n_⚡ Powered by Groq ${modelName.toUpperCase()} | Lightning fast AI! 🇳🇬🤖_`
        }, { quoted: m });

        // Reward user with money
        await unifiedUserManager.addMoney(m.sender, 7, 'Groq AI Chat Bonus');

        console.log(`🤖 Groq AI query from ${m.pushName || m.sender.split('@')[0]}: ${query.substring(0, 50)}...`);

      } catch (error) {
        console.error('Groq AI Error:', error);

        // Delete thinking message
        try {
          await sock.sendMessage(m.from, { delete: thinkingMsg.key });
        } catch (e) {
          // Silent fail
        }

        // Better error handling
        let errorMsg = getRandomResponse(naijaResponses.errors);
        
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMsg = "Omo, too many people dey use AI now! 😅 Wait small make traffic reduce, then try again! ⏰";
        } else if (error.message.includes('timeout')) {
          errorMsg = "Network dey slow like snail! 🐌 Make we try again with better connection!";
        } else if (error.message.includes('API key') || error.message.includes('401')) {
          errorMsg = "API key get problem oh! 🔑 Make admin check the configuration!";
        } else if (error.message.includes('exceeded')) {
          errorMsg = "You don ask me too many questions today! 😴 Try again tomorrow or wait small!";
        }

        await sock.sendMessage(m.from, {
          text: `${errorMsg}\n\n_Error details: ${error.message.substring(0, 100)}..._`
        }, { quoted: m });
      }
    }

  } catch (error) {
    console.error('Groq Plugin Error:', error);
  }
}

// Add Groq methods to the class
Object.assign(groqAI, {
  // Send message to Groq API
  async sendMessage(message, userId) {
    if (!this.checkRateLimit(userId)) {
      throw new Error('Rate limit exceeded - you don ask too many questions! Wait small abeg! ⏰');
    }

    const model = userModels.get(userId) || this.defaultModel;
    const history = this.getConversationHistory(userId);
    
    // Build messages array with Nigerian context
    const messages = [
      {
        role: 'system',
        content: `You are a highly intelligent AI assistant with authentic Nigerian Gen-Z personality. You speak with natural Nigerian urban slang mixed with proper English. You're witty, helpful, streetwise, and knowledgeable about both global topics and Nigerian culture. 

Key traits:
- Use Nigerian expressions naturally (abeg, omo, sha, oh, nah, etc.)
- Reference Nigerian context when relevant (Naija economy, culture, challenges)
- Be conversational and engaging, not formal or robotic
- Give practical advice that works for Nigerian environment
- Use appropriate emojis but don't overdo it
- Keep responses WhatsApp-friendly (not too long)
- Be encouraging and positive while being realistic

Speak like a smart Nigerian youth who's well-educated but still connected to the streets. Help with any topic but always maintain that authentic Naija vibe!`
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
          max_tokens: 1200,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'WhatsApp-Bot/1.0'
          },
          timeout: 25000 // 25 seconds timeout
        }
      );

      if (response.data && response.data.choices && response.data.choices[0]) {
        return response.data.choices[0].message.content.trim();
      } else {
        throw new Error('Invalid response format from Groq API');
      }
      
    } catch (error) {
      if (error.response) {
        // API error
        const status = error.response.status;
        const message = error.response.data?.error?.message || 'Unknown API error';
        throw new Error(`Groq API Error ${status}: ${message}`);
      } else if (error.request) {
        // Network error
        throw new Error('Network error - no response from Groq servers');
      } else {
        // Other error
        throw new Error(`Request setup error: ${error.message}`);
      }
    }
  },

  // Get conversation history for user
  getConversationHistory(userId, maxMessages = 6) {
    const conversation = userConversations.get(userId) || [];
    return conversation.slice(-maxMessages);
  },

  // Update conversation history
  updateConversation(userId, userMessage, aiResponse) {
    let conversation = userConversations.get(userId) || [];
    
    conversation.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse }
    );
    
    // Keep only last 20 messages (10 exchanges)
    if (conversation.length > 20) {
      conversation = conversation.slice(-20);
    }
    
    userConversations.set(userId, conversation);
    
    // Auto-cleanup after 2 hours
    setTimeout(() => {
      userConversations.delete(userId);
    }, 2 * 60 * 60 * 1000);
  },

  // Check rate limits
  checkRateLimit(userId) {
    const now = Date.now();
    const userLimit = this.rateLimits.get(userId) || { count: 0, resetTime: now + 60000 };
    
    if (now > userLimit.resetTime) {
      userLimit.count = 0;
      userLimit.resetTime = now + 60000;
    }
    
    if (userLimit.count >= 20) { // Groq has good limits, so we can be generous
      return false;
    }
    
    userLimit.count++;
    this.rateLimits.set(userId, userLimit);
    return true;
  }
});
