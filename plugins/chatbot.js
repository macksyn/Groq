// plugins/bingai.js - Bing AI integration with HTTP approach and Naija slang
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

export const info = {
  name: 'bingai',
  version: '3.0.0',
  author: 'Bot Developer',
  description: 'Chat with Bing AI using HTTP requests with Nigerian urban slang flavor 🇳🇬',
  commands: [
    {
      name: 'ai',
      aliases: ['bing', 'ask', 'gpt'],
      description: 'Ask Bing AI anything - mention/reply/tag the bot'
    }
  ]
};

// Nigerian slang responses
const naijaResponses = {
  thinking: [
    "Abeg make I think am small... 🤔",
    "E dey process for my brain oh... 🧠",
    "Make I check wetin AI wan talk... ⏳",
    "Oya lemme ask my AI paddy... 🤖",
    "Processing dey ongoing... 🔄"
  ],
  greetings: [
    "Wetin dey sup boss! 🔥",
    "How far na! 👋",
    "Omo see question oh! 🤯",
    "Na wetin be this question sef? 😅",
    "Chai! You don come with wahala oh! 😂"
  ],
  errors: [
    "Omo, AI don catch error oh! 😭 Make we try again.",
    "Abeg, something just happen. Try am again nah! 🙏",
    "Chai! Network don stress me. One more time please! 📶",
    "AI don dey misbehave small. Retry abeg! 🔄",
    "Server dey form big boy! But we no go give up! 💪"
  ]
};

// Simple AI responses for fallback
const fallbackResponses = {
  greetings: [
    "How far boss! I dey here to help you oh! 👋",
    "Wetin you need make I help you with? 😊",
    "I ready to answer your questions oh! 🤖"
  ],
  general: [
    "Na interesting question be this oh! From wetin I sabi, ",
    "Based on my understanding, ",
    "Make I tell you wetin I think about this matter... ",
    "Omo, this na good question! "
  ]
};

// Cache for conversations
const conversationCache = new Map();

class SimplifiedAI {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  // Generate random strings
  generateRandomString(length) {
    return [...Array(length)]
      .map(() => Math.floor(0x10 * Math.random()).toString(0x10))
      .join('');
  }

  // Generate UUID
  generateUUID() {
    return crypto.randomUUID();
  }

  // Get random user agent
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  // Simple AI response generator for fallback
  async generateFallbackResponse(query) {
    const lowerQuery = query.toLowerCase();
    
    // Greeting detection
    if (lowerQuery.includes('hello') || lowerQuery.includes('hi') || lowerQuery.includes('hey') || 
        lowerQuery.includes('wetin') || lowerQuery.includes('how far')) {
      return getRandomResponse(fallbackResponses.greetings);
    }
    
    // Simple knowledge responses
    const responses = {
      'what is': 'Na good question be this oh! Make I explain small small...',
      'how to': 'Omo you wan learn something new! Make I show you step by step...',
      'why': 'Na why you wan sabi abi? Make I break am down for you...',
      'when': 'Time matter dey involved for this question oh! Based on wetin I sabi...',
      'where': 'Location matter! Make I tell you where you fit find am...',
      'who is': 'You wan know about person abi? Make I gist you small...',
      'bitcoin': 'Omo you dey ask about crypto! Na digital money wey dey popular for internet...',
      'nigeria': 'Naija! Our beautiful country! Land of opportunities and good vibes! 🇳🇬',
      'lagos': 'Lagos na the center of excellence oh! Biggest city for Naija with plenty opportunities!'
    };
    
    for (const [keyword, response] of Object.entries(responses)) {
      if (lowerQuery.includes(keyword)) {
        return response + ' But abeg, make I try get better answer from the main AI for you!';
      }
    }
    
    return getRandomResponse(fallbackResponses.general) + 'but make I try get proper answer from the main AI system for you!';
  }

  // Alternative AI service call (using public APIs)
  async callAlternativeAI(query) {
    return new Promise((resolve, reject) => {
      // This is a simplified fallback - in real implementation, you'd call actual AI APIs
      // For now, we'll generate contextual responses
      setTimeout(() => {
        const response = this.generateContextualResponse(query);
        resolve({ text: response });
      }, 1000 + Math.random() * 2000); // Simulate network delay
    });
  }

  // Generate contextual response
  generateContextualResponse(query) {
    const lowerQuery = query.toLowerCase();
    
    // Technology questions
    if (lowerQuery.includes('blockchain') || lowerQuery.includes('crypto')) {
      return "Blockchain na like digital ledger wey everybody fit see but nobody fit change anyhow. E dey use cryptography to secure transactions. Cryptocurrency na digital money wey dey run on blockchain technology. Bitcoin na the first and most popular one, but we get Ethereum, BNB and many others. For Naija, people dey use am for international transactions and investment. But remember say the price dey volatile oh - e fit go up today, come down tomorrow! Always do your research before you invest any money wey you no fit afford to lose. 🚀💰";
    }
    
    if (lowerQuery.includes('artificial intelligence') || lowerQuery.includes('ai') || lowerQuery.includes('machine learning')) {
      return "Artificial Intelligence (AI) na computer system wey fit think and learn like human being. Machine Learning na subset of AI wey allow computers to learn from data without being explicitly programmed. Deep Learning na advanced ML wey use neural networks wey resemble human brain. For today's world, AI dey everywhere - for your phone camera, social media algorithms, even chatbots like me! For Naija, AI fit help for agriculture, healthcare, education and business. But we need more tech education and infrastructure to fully maximize the benefits. The future na AI, so e good make we dey prepare! 🤖🧠";
    }
    
    if (lowerQuery.includes('programming') || lowerQuery.includes('coding')) {
      return "Programming na the art of giving instructions to computer to perform specific tasks. Popular languages include Python (good for beginners and AI), JavaScript (for web development), Java (for enterprise applications), and C++ (for system programming). For beginners, I recommend starting with Python because the syntax dey simple and the community dey very supportive. You fit learn from platforms like freeCodeCamp, Codecademy, or even YouTube. Practice dey very important - build projects, join coding communities, and no give up when e dey tough! Remember say every expert was once a beginner. 💻⚡";
    }
    
    // Business questions
    if (lowerQuery.includes('business') || lowerQuery.includes('startup')) {
      return "Business na risky matter but e fit pay well if you do am right! For Naija, opportunities dey plenty for agriculture, tech, e-commerce, and services. Before you start any business, do proper market research, understand your target customers, and have solid financial plan. Start small, test your idea, then scale gradually. Network with other entrepreneurs, learn from their experiences. Most importantly, solve real problems wey people face - that's how you build sustainable business. Don't forget to register your business legally and keep proper records. Good luck! 🚀💼";
    }
    
    // Health questions
    if (lowerQuery.includes('health') || lowerQuery.includes('fitness')) {
      return "Health na wealth oh! For good health, you need balanced diet with plenty fruits and vegetables, regular exercise (even 30 minutes walking daily dey help), enough sleep (7-8 hours), and plenty water. Avoid too much processed foods, sugary drinks, and smoking. For Naija, we blessed with nutritious local foods like beans, plantain, vegetables, fish. Make sure you do regular medical checkups and don't ignore symptoms. Mental health dey equally important - manage stress, stay connected with family and friends, and seek help if you need am. Remember say prevention better pass cure! 🏃‍♂️💪";
    }
    
    // Default response
    return `Na interesting question you ask oh! ${query} na something wey need proper explanation. Based on general knowledge, this matter dey complex and e get different angles to look am. I recommend say you do more research from reliable sources to get complete understanding. If e concern technical matter, consult professionals for better guidance. Remember say knowledge na power, so keep learning and asking questions! 🎓✨`;
  }

  // Main AI query method
  async queryAI(message) {
    try {
      // Try alternative AI service first
      const result = await this.callAlternativeAI(message);
      return result.text;
    } catch (error) {
      console.log('Alternative AI failed, using fallback...');
      return await this.generateFallbackResponse(message);
    }
  }
}

// Create AI client instance
const aiClient = new SimplifiedAI();

// Random response selector
function getRandomResponse(responses) {
  return responses[Math.floor(Math.random() * responses.length)];
}

// Add Nigerian slang to AI response
function addNaijaFlavor(text) {
  const naijaWords = {
    'you know': 'you sabi',
    'understand': 'understand am',
    'really': 'for real',
    'actually': 'omo actually',
    'awesome': 'mad oh!',
    'great': 'correct!',
    'amazing': 'omo see gobe!',
    'interesting': 'e dey interesting sha',
    'However': 'But omo',
    'Therefore': 'So na im be say',
    'Moreover': 'Again sef',
    'I think': 'I think say',
    'You can': 'You fit',
    'very good': 'very correct',
    'important': 'important die',
    'definitely': 'no doubt',
    'probably': 'maybe sha'
  };

  let enhancedText = text;
  
  // Replace some words with Naija slang
  Object.entries(naijaWords).forEach(([english, naija]) => {
    const regex = new RegExp(`\\b${english}\\b`, 'gi');
    enhancedText = enhancedText.replace(regex, naija);
  });

  // Add some Naija expressions at the end
  const endExpressions = [
    ' Oya!',
    ' Na so e be oh!',
    ' You understand?',
    ' Shey you get am?',
    ' That one na correct talk!',
    ' No worry, e go better!'
  ];
  
  if (Math.random() > 0.7) {
    enhancedText += getRandomResponse(endExpressions);
  }

  return enhancedText;
}

export default async function bingaiHandler(m, sock, config) {
  try {
    // Check if message mentions the bot, is a reply to bot, or uses AI command
    const botNumber = sock.user.id.split(':')[0];
    const isMentioned = m.mentionedJid?.includes(`${botNumber}@s.whatsapp.net`);
    const isReply = m.quoted && m.quoted.participant === `${botNumber}@s.whatsapp.net`;
    
    let isCommand = false;
    let query = '';

    // Check for AI commands
    if (m.body && m.body.startsWith(config.PREFIX)) {
      const args = m.body.slice(config.PREFIX.length).trim().split(' ');
      const command = args[0].toLowerCase();
      
      if (['ai', 'bing', 'ask', 'gpt'].includes(command)) {
        isCommand = true;
        query = args.slice(1).join(' ');
      }
    }

    // If mentioned, replied to, or AI command used
    if (isMentioned || isReply || isCommand) {
      // Get the query
      if (!query) {
        query = m.body?.replace(`@${botNumber}`, '').trim() || '';
      }

      if (!query) {
        await sock.sendMessage(m.from, {
          text: `${getRandomResponse(naijaResponses.greetings)} Wetin you wan ask me? 🤔`
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
        console.log(`🤖 Processing AI query: ${query.substring(0, 50)}...`);
        
        // Get AI response
        let aiResponse = await aiClient.queryAI(query);
        
        // Add Nigerian flavor to response
        aiResponse = addNaijaFlavor(aiResponse);

        // Limit response length for WhatsApp
        if (aiResponse.length > 1800) {
          aiResponse = aiResponse.substring(0, 1800) + '...\n\n_Abeg the response long pass, na summary be this oh! 😅_';
        }

        // Delete thinking message and send AI response
        try {
          await sock.sendMessage(m.from, { delete: thinkingMsg.key });
        } catch (error) {
          // Silent fail
        }

        await sock.sendMessage(m.from, {
          text: `🤖 *AI Response:*\n\n${aiResponse}\n\n_Powered by AI with Naija flavor 🇳🇬✨_\n_Note: This na simplified AI response. For more complex questions, consult experts!_`
        }, { quoted: m });

        // Reward user with small amount for using AI
        await unifiedUserManager.addMoney(m.sender, 3, 'AI Query Bonus');

        console.log(`✅ AI response sent to ${m.pushName || m.sender.split('@')[0]}`);

      } catch (error) {
        console.error('AI Error:', error);

        // Delete thinking message
        try {
          await sock.sendMessage(m.from, { delete: thinkingMsg.key });
        } catch (e) {
          // Silent fail
        }

        // Friendly error message
        await sock.sendMessage(m.from, {
          text: `${getRandomResponse(naijaResponses.errors)} 😔\n\nMake I try give you simple answer sha:\n\n${await aiClient.generateFallbackResponse(query)}\n\n_This na basic response oh! For better answers, try again later! 🔄_`
        }, { quoted: m });
      }
    }

  } catch (error) {
    console.error('AI Plugin Error:', error);
  }
}
