// plugins/ai_chat.js - AI Chat with memory, mentions, and replies support
import { unifiedUserManager } from '../lib/pluginIntegration.js';

export const info = {
  name: 'ai_chat',
  version: '3.0.0',
  author: 'Bot Developer',
  description: 'AI-powered chat with memory, mentions, replies and Naija vibes',
  commands: [
    {
      name: 'ai',
      aliases: ['ask', 'chat', 'gpt'],
      description: 'Chat with AI assistant'
    },
    {
      name: 'remember',
      aliases: ['save', 'memo'],
      description: 'Make bot remember something'
    },
    {
      name: 'forget',
      aliases: ['clear'],
      description: 'Clear bot memory'
    },
    {
      name: 'memory',
      aliases: ['recall'],
      description: 'Show what bot remembers'
    }
  ]
};

class AIChat {
  constructor() {
    this.conversationHistory = new Map();
    this.userMemories = new Map(); // Personal memories for each user
    this.groupMemories = new Map(); // Group-specific memories
    this.lastInteraction = new Map(); // Track last interaction time
    
    this.naijaVibes = [
      'abeg', 'oga', 'wetin', 'sha', 'na so', 'my guy', 'no wahala', 
      'sabi', 'chop knuckle', 'e no easy', 'for real', 'no be small thing',
      'make we dey go', 'i hail o', 'correct person', 'sharp sharp',
      'e don set', 'you try well well', 'na you sabi pass', 'e be like say'
    ];
    
    this.responses = {
      greetings: [
        'How far my guy! 🤝 I remember say you be correct person!',
        'Wetin dey happen na! 😊 You don show again!',
        'My oga! How body? 💪 Long time no see!',
        'E ku aro o! (Good morning!) ✨ Hope say you sleep well?'
      ],
      thanks: [
        'No wahala at all my guy! 🙌',
        'Na my pleasure jare! 😊 Anytime you need me!',
        'E no be anything! 💯 I dey here for you!',
        'You welcome sha! 🤝 Make we dey help each other!'
      ],
      memory_saved: [
        'I don save am for my head o! 🧠',
        'E don enter my memory bank sharp sharp! 💾',
        'Roger that! I no go forget am again! ✅',
        'Information received and stored! 📝'
      ],
      memory_cleared: [
        'My memory don clear finish! 🧹',
        'Everything wipe clean clean! ✨',
        'Fresh start my guy! 🔄',
        'Memory reset complete! 💫'
      ]
    };
    
    // Initialize memories from database
    this.loadMemoriesFromDB();
  }

  // Load memories from MongoDB
  async loadMemoriesFromDB() {
    try {
      const db = await unifiedUserManager.init();
      
      // Load user memories
      const userMems = await db.collection('ai_user_memories').find({}).toArray();
      userMems.forEach(mem => {
        this.userMemories.set(mem.userId, mem.memories || []);
      });
      
      // Load group memories
      const groupMems = await db.collection('ai_group_memories').find({}).toArray();
      groupMems.forEach(mem => {
        this.groupMemories.set(mem.groupId, mem.memories || []);
      });
      
      console.log('✅ AI memories loaded from database');
    } catch (error) {
      console.log('⚠️ Could not load AI memories:', error.message);
    }
  }

  // Save memories to MongoDB
  async saveMemoriesToDB(userId, groupId = null) {
    try {
      const db = await unifiedUserManager.init();
      
      // Save user memories
      if (this.userMemories.has(userId)) {
        await db.collection('ai_user_memories').updateOne(
          { userId },
          { 
            $set: { 
              memories: this.userMemories.get(userId),
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );
      }
      
      // Save group memories
      if (groupId && this.groupMemories.has(groupId)) {
        await db.collection('ai_group_memories').updateOne(
          { groupId },
          { 
            $set: { 
              memories: this.groupMemories.get(groupId),
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );
      }
      
    } catch (error) {
      console.log('⚠️ Could not save AI memories:', error.message);
    }
  }

  // Add memory for user
  async addUserMemory(userId, memory, groupId = null) {
    if (!this.userMemories.has(userId)) {
      this.userMemories.set(userId, []);
    }
    
    const userMems = this.userMemories.get(userId);
    userMems.push({
      content: memory,
      timestamp: new Date(),
      type: 'user'
    });
    
    // Keep only last 50 memories per user
    if (userMems.length > 50) {
      userMems.splice(0, userMems.length - 50);
    }
    
    await this.saveMemoriesToDB(userId, groupId);
  }

  // Add group memory
  async addGroupMemory(groupId, memory, userId) {
    if (!this.groupMemories.has(groupId)) {
      this.groupMemories.set(groupId, []);
    }
    
    const groupMems = this.groupMemories.get(groupId);
    groupMems.push({
      content: memory,
      userId: userId,
      timestamp: new Date(),
      type: 'group'
    });
    
    // Keep only last 100 memories per group
    if (groupMems.length > 100) {
      groupMems.splice(0, groupMems.length - 100);
    }
    
    await this.saveMemoriesToDB(userId, groupId);
  }

  // Get relevant memories
  getRelevantMemories(userId, groupId = null, query = '') {
    let memories = [];
    
    // Get user memories
    const userMems = this.userMemories.get(userId) || [];
    memories = memories.concat(userMems);
    
    // Get group memories
    if (groupId) {
      const groupMems = this.groupMemories.get(groupId) || [];
      memories = memories.concat(groupMems);
    }
    
    // Filter by relevance if query provided
    if (query) {
      const keywords = query.toLowerCase().split(' ');
      memories = memories.filter(mem => 
        keywords.some(keyword => 
          mem.content.toLowerCase().includes(keyword)
        )
      );
    }
    
    // Sort by timestamp (most recent first)
    memories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Return last 10 relevant memories
    return memories.slice(0, 10);
  }

  // Check if message is a mention, tag, or reply
  isBotMentioned(m, sock) {
    const botNumber = sock.user.id.split(':')[0];
    const botMentions = [
      `@${botNumber}`,
      botNumber,
      sock.user.name?.toLowerCase(),
      'bot'
    ].filter(Boolean);
    
    // Check mentions in quoted/replied message
    if (m.quotedMsg) {
      const quotedSender = m.quotedMsg.key?.participant || m.quotedMsg.key?.remoteJid;
      if (quotedSender && quotedSender.includes(botNumber)) {
        return true;
      }
    }
    
    // Check direct mentions
    const messageText = m.body?.toLowerCase() || '';
    return botMentions.some(mention => messageText.includes(mention.toLowerCase()));
  }

  // Add Naija vibes to responses
  addNaijaVibes(text) {
    const vibes = this.naijaVibes[Math.floor(Math.random() * this.naijaVibes.length)];
    const endings = [' sha!', ' o!', ' abeg!', ' my guy!', ' oo!', ' na!'];
    const ending = endings[Math.floor(Math.random() * endings.length)];
    
    // 40% chance to add vibes
    if (Math.random() < 0.4) {
      if (Math.random() < 0.5) {
        return `${vibes}, ${text.toLowerCase()}${ending}`;
      } else {
        return `${text} ${vibes}${ending}`;
      }
    }
    
    return text;
  }

  // Get conversation context with memories
  buildContext(userId, groupId = null, currentMessage = '') {
    const memories = this.getRelevantMemories(userId, groupId, currentMessage);
    const history = this.conversationHistory.get(userId) || [];
    
    let context = '';
    
    // Add memories to context
    if (memories.length > 0) {
      context += "What I remember:\n";
      memories.forEach(mem => {
        const timeAgo = this.getTimeAgo(mem.timestamp);
        context += `- ${mem.content} (${timeAgo})\n`;
      });
      context += "\n";
    }
    
    // Add recent conversation
    if (history.length > 0) {
      context += "Recent conversation:\n";
      history.slice(-5).forEach(h => {
        context += `User: ${h.user}\nMe: ${h.bot}\n`;
      });
    }
    
    return context;
  }

  // Helper to get time ago
  getTimeAgo(timestamp) {
    const now = new Date();
    const diff = now - new Date(timestamp);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  // Query AI with enhanced context
  async queryAI(prompt, userId, groupId = null) {
    try {
      const context = this.buildContext(userId, groupId, prompt);
      
      // Enhanced prompt with Nigerian context
      const enhancedPrompt = `
You are a helpful AI assistant with Nigerian urban vibes. You remember conversations and can reference past interactions.

${context}

Current message: ${prompt}

Respond naturally with a mix of good English and casual Nigerian expressions. Be helpful, friendly, and remember what users tell you.`;

      // Try Hugging Face API
      const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-large', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_TOKEN || 'hf_demo'}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: enhancedPrompt,
          parameters: {
            max_new_tokens: 200,
            temperature: 0.8,
            do_sample: true,
            return_full_text: false,
            repetition_penalty: 1.1
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data[0] && data[0].generated_text) {
          return data[0].generated_text.trim();
        }
      }
      
      // Fallback to local response
      return this.getLocalResponse(prompt, userId, groupId);
      
    } catch (error) {
      console.log('AI API failed:', error.message);
      return this.getLocalResponse(prompt, userId, groupId);
    }
  }

  // Enhanced local responses with memory
  getLocalResponse(prompt, userId, groupId = null) {
    const lowerPrompt = prompt.toLowerCase();
    const memories = this.getRelevantMemories(userId, groupId, prompt);
    
    // Memory-based responses
    if (memories.length > 0 && (lowerPrompt.includes('remember') || lowerPrompt.includes('recall'))) {
      const recentMemory = memories[0];
      return `I remember say ${recentMemory.content} (from ${this.getTimeAgo(recentMemory.timestamp)}) ${this.addNaijaVibes('Hope that helps')}`;
    }
    
    // Greeting with memory
    if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi') || lowerPrompt.includes('hey')) {
      const greeting = this.responses.greetings[Math.floor(Math.random() * this.responses.greetings.length)];
      if (memories.length > 0) {
        return `${greeting} I still remember our last talk about ${memories[0].content.substring(0, 30)}...`;
      }
      return greeting;
    }
    
    // Thank you with personality
    if (lowerPrompt.includes('thank') || lowerPrompt.includes('thanks')) {
      return this.responses.thanks[Math.floor(Math.random() * this.responses.thanks.length)];
    }
    
    // Question patterns with memory context
    if (lowerPrompt.includes('what') || lowerPrompt.includes('how') || lowerPrompt.includes('why')) {
      const responses = [
        "That's a deep question my guy! 🤔 Based on what I know...",
        "Wetin you wan know exactly? From our previous talks, I think...",
        "Interesting question sha! Let me check my memory...",
        "My oga, that one serious o! From what I remember..."
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Personal responses
    if (lowerPrompt.includes('you') && (lowerPrompt.includes('are') || lowerPrompt.includes('do'))) {
      const responses = [
        "I be AI wey dey try help people o! I get good memory and I like to yarn with una!",
        "Me? I'm your friendly neighborhood AI! I dey remember things and I sabi small small about everything!",
        "Na AI I be, but I get personality sha! I dey learn from our conversations!",
        "I be bot wey get brain! I fit remember wetin we talk before and I dey try my best to help!"
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Default with memory hint
    const defaults = [
      "I hear you loud and clear! 👂",
      "Abeg talk more about am...",
      "Interesting! Tell me more so I fit remember am...",
      "My guy, that one concern me o! 🤔"
    ];
    
    return defaults[Math.floor(Math.random() * defaults.length)];
  }

  // Save conversation with memory extraction
  async saveConversation(userId, userMessage, botResponse, groupId = null) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }
    
    const history = this.conversationHistory.get(userId);
    history.push({
      user: userMessage,
      bot: botResponse,
      timestamp: new Date()
    });
    
    // Keep only last 20 messages
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
    
    // Extract important information for memory
    await this.extractAndSaveMemory(userId, userMessage, groupId);
  }

  // Extract important info from conversation
  async extractAndSaveMemory(userId, message, groupId = null) {
    const lowerMessage = message.toLowerCase();
    
    // Patterns that indicate something to remember
    const memoryPatterns = [
      /my name is ([\w\s]+)/i,
      /i am ([\w\s]+)/i,
      /i live in ([\w\s]+)/i,
      /i work as ([\w\s]+)/i,
      /i like ([\w\s]+)/i,
      /i hate ([\w\s]+)/i,
      /remember that ([\w\s]+)/i,
      /don't forget ([\w\s]+)/i,
      /i have ([\w\s]+)/i,
      /my birthday is ([\w\s]+)/i
    ];
    
    for (const pattern of memoryPatterns) {
      const match = message.match(pattern);
      if (match) {
        await this.addUserMemory(userId, match[0], groupId);
        break;
      }
    }
    
    // Save interesting statements
    if (message.length > 20 && !lowerMessage.includes('?') && 
        (lowerMessage.includes('i') || lowerMessage.includes('my'))) {
      await this.addUserMemory(userId, message, groupId);
    }
  }
}

const aiChat = new AIChat();

export default async function aiChatHandler(m, sock, config) {
  try {
    // Skip if no text message
    if (!m.body) return;
    
    const isCommand = m.body.startsWith(config.PREFIX);
    const args = isCommand ? m.body.slice(config.PREFIX.length).trim().split(' ') : [];
    const command = isCommand ? args[0].toLowerCase() : '';
    
    // Handle memory commands
    if (isCommand) {
      if (command === 'remember' || command === 'save' || command === 'memo') {
        const memory = args.slice(1).join(' ');
        
        if (!memory) {
          await sock.sendMessage(m.from, { 
            text: `Wetin you wan make I remember? 🤔\n\nUsage: *${config.PREFIX}remember your info here*` 
          });
          return;
        }
        
        await aiChat.addUserMemory(m.sender, memory, m.from);
        const response = aiChat.responses.memory_saved[Math.floor(Math.random() * aiChat.responses.memory_saved.length)];
        
        await sock.sendMessage(m.from, { text: response });
        return;
      }
      
      if (command === 'forget' || command === 'clear') {
        aiChat.userMemories.delete(m.sender);
        if (m.isGroup) {
          aiChat.groupMemories.delete(m.from);
        }
        
        await aiChat.saveMemoriesToDB(m.sender, m.from);
        const response = aiChat.responses.memory_cleared[Math.floor(Math.random() * aiChat.responses.memory_cleared.length)];
        
        await sock.sendMessage(m.from, { text: response });
        return;
      }
      
      if (command === 'memory' || command === 'recall') {
        const memories = aiChat.getRelevantMemories(m.sender, m.from);
        
        if (memories.length === 0) {
          await sock.sendMessage(m.from, { text: "I never save anything about you yet o! 🤷‍♂️" });
          return;
        }
        
        let memoryText = "🧠 *Wetin I Remember About You:*\n\n";
        memories.slice(0, 5).forEach((mem, index) => {
          const timeAgo = aiChat.getTimeAgo(mem.timestamp);
          memoryText += `${index + 1}. ${mem.content}\n   _(${timeAgo})_\n\n`;
        });
        
        memoryText += `Total memories: ${memories.length}`;
        
        await sock.sendMessage(m.from, { text: memoryText });
        return;
      }
      
      // Handle AI chat commands
      if (['ai', 'ask', 'chat', 'gpt'].includes(command)) {
        const prompt = args.slice(1).join(' ');
        
        if (!prompt) {
          await sock.sendMessage(m.from, { 
            text: `Wetin you wan talk about? 🤔\n\nUsage: *${config.PREFIX}ai your question here*` 
          });
          return;
        }

        await sock.sendMessage(m.from, { text: "Make I check my memory... 🤔" });
        
        const response = await aiChat.queryAI(prompt, m.sender, m.from);
        const finalResponse = aiChat.addNaijaVibes(response);
        
        await aiChat.saveConversation(m.sender, prompt, finalResponse, m.from);
        
        await sock.sendMessage(m.from, { text: finalResponse });
        return;
      }
    }
    
    // Auto-reply when mentioned, tagged, or replied to
    const isMentioned = aiChat.isBotMentioned(m, sock);
    
    if (isMentioned) {
      // Clean the message
      const botNumber = sock.user.id.split(':')[0];
      let cleanMessage = m.body
        .replace(`@${botNumber}`, '')
        .replace(/bot/gi, '')
        .trim();
      
      if (cleanMessage.length < 3) {
        cleanMessage = "Hello!";
      }
      
      // Rate limiting: max once per 10 seconds per user
      const now = Date.now();
      const lastTime = aiChat.lastInteraction.get(m.sender) || 0;
      
      if (now - lastTime < 10000) {
        return; // Skip if too frequent
      }
      
      aiChat.lastInteraction.set(m.sender, now);
      
      // Show typing indicator
      await sock.sendMessage(m.from, { text: "Let me think... 💭" });
      
      // Get AI response with full context and memory
      const response = await aiChat.queryAI(cleanMessage, m.sender, m.from);
      let finalResponse = aiChat.addNaijaVibes(response);
      
      // Add random emoji for personality
      const emojis = ['😊', '🤔', '💯', '🔥', '✨', '👍', '😎', '🤗', '💪'];
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      finalResponse += ` ${emoji}`;
      
      // Save conversation with memory extraction
      await aiChat.saveConversation(m.sender, cleanMessage, finalResponse, m.from);
      
      await sock.sendMessage(m.from, { text: finalResponse });
    }
    
  } catch (error) {
    console.error('AI Chat error:', error);
    await sock.sendMessage(m.from, { 
      text: `Something spoil for my head o! 😵 My memory still dey work sha, try again...` 
    });
  }
}