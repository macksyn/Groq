// plugins/bingai.js - Bing AI integration with Naija slang
import { WebSocket } from 'ws';
import crypto from 'crypto';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

export const info = {
  name: 'bingai',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Chat with Bing AI with Nigerian urban slang flavor 🇳🇬',
  commands: [
    {
      name: 'ai',
      aliases: ['bing', 'ask'],
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
    "Oya lemme ask my AI paddy... 🤖"
  ],
  greetings: [
    "Wetin dey sup boss! 🔥",
    "How far na! 👋",
    "Omo see question oh! 🤯",
    "Na wetin be this question sef? 😅"
  ],
  errors: [
    "Omo, AI don catch error oh! 😭 Make we try again.",
    "Abeg, something just happen. Try am again nah! 🙏",
    "Chai! Network don stress me. One more time please! 📶",
    "AI don dey misbehave small. Retry abeg! 🔄"
  ]
};

// Cache for conversations
const conversationCache = new Map();

class BingAIClient {
  constructor() {
    this.conversations = new Map();
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

  // Create new conversation
  async createNewConversation() {
    return {
      conversationId: this.generateUUID(),
      encryptedConversationSignature: this.generateRandomString(64),
      clientId: this.generateUUID()
    };
  }

  // Connect to WebSocket
  connectWebSocket(signature) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('wss://sydney.bing.com/sydney/ChatHub', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      ws.on('open', () => {
        ws.send('{"protocol":"json","version":1}\x1e');
      });

      ws.on('message', (data) => {
        const responses = data.toString().split('\x1e')
          .map(msg => {
            try {
              return JSON.parse(msg);
            } catch {
              return msg;
            }
          })
          .filter(msg => msg);

        if (responses.length === 0) return;

        if (responses[0] && typeof responses[0] === 'object' && Object.keys(responses[0]).length === 0) {
          clearTimeout(timeout);
          // Setup ping interval
          ws.pingInterval = setInterval(() => {
            ws.send('{"type":6}\x1e');
          }, 15000);
          resolve(ws);
        }
      });
    });
  }

  // Send message to Bing AI
  async sendMessage(message, options = {}) {
    const {
      conversationId,
      encryptedConversationSignature,
      clientId,
      invocationId = 0,
      toneStyle = 'balanced'
    } = options;

    // Determine tone style
    let selectedToneStyle;
    switch (toneStyle.toLowerCase()) {
      case 'creative':
        selectedToneStyle = 'Creative';
        break;
      case 'balanced':
        selectedToneStyle = 'Balanced';
        break;
      case 'precise':
        selectedToneStyle = 'Precise';
        break;
      default:
        selectedToneStyle = 'Balanced';
    }

    // Connect to WebSocket
    const ws = await this.connectWebSocket(encryptedConversationSignature);

    return new Promise((resolve, reject) => {
      let responseText = '';
      
      const timeout = setTimeout(() => {
        this.cleanupWebSocket(ws);
        reject(new Error('Request timeout'));
      }, 120000); // 2 minutes timeout

      ws.on('message', (data) => {
        const messages = data.toString().split('\x1e')
          .map(msg => {
            try {
              return JSON.parse(msg);
            } catch {
              return msg;
            }
          })
          .filter(msg => msg);

        if (messages.length === 0) return;

        const message = messages[0];

        switch (message.type) {
          case 1: {
            // Streaming response
            const messageContent = message?.arguments?.[0]?.messages;
            if (!messageContent?.length || messageContent[0].author !== 'bot') return;

            const text = messageContent[0].text;
            if (!text || text === responseText) return;

            responseText = text;
            break;
          }

          case 2: {
            // Final response
            clearTimeout(timeout);
            this.cleanupWebSocket(ws);

            if (message.item?.result?.error) {
              return reject(new Error(message.item.result.error + ': ' + message.item.result.message));
            }

            const messages = message.item?.messages || [];
            const finalMessage = messages.length ? messages[messages.length - 1] : null;

            if (finalMessage) {
              resolve({
                message: finalMessage,
                conversationExpiryTime: message?.item?.conversationExpiryTime
              });
            } else {
              reject(new Error('No response message found'));
            }
            break;
          }

          case 7:
            clearTimeout(timeout);
            this.cleanupWebSocket(ws);
            reject(new Error(message.error || 'Unknown error occurred'));
            break;

          default:
            if (message?.error) {
              clearTimeout(timeout);
              this.cleanupWebSocket(ws);
              reject(new Error(`Error type ${message.type}: ${message.error}`));
            }
        }
      });

      // Build request payload
      const requestPayload = {
        arguments: [{
          source: 'cib',
          optionsSets: [
            'nlu_direct_response_filter',
            'deepleo',
            'disable_emoji_spoken_text',
            'responsible_ai_policy_235',
            'enablemm',
            selectedToneStyle,
            'dtappid',
            'cricinfo',
            'cricinfov2',
            'dv3sugg',
            'nojbfedge'
          ],
          sliceIds: [
            'chk1cf',
            'nopreloadsscf',
            'winlongmsg2tf'
          ],
          traceId: this.generateRandomString(32),
          isStartOfSession: invocationId === 0,
          message: {
            author: 'user',
            text: message,
            messageType: 'Chat'
          },
          encryptedConversationSignature: encryptedConversationSignature,
          participant: { id: clientId },
          conversationId: conversationId,
          previousMessages: []
        }],
        invocationId: invocationId.toString(),
        target: 'chat',
        type: 4
      };

      // Send the request
      ws.send(JSON.stringify(requestPayload) + '\x1e');
    });
  }

  // Cleanup WebSocket
  cleanupWebSocket(ws) {
    if (ws.pingInterval) {
      clearInterval(ws.pingInterval);
    }
    ws.close();
    ws.terminate();
  }
}

// Create Bing AI client instance
const bingAI = new BingAIClient();

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
    'Moreover': 'Again sef'
  };

  let enhancedText = text;
  
  // Replace some words with Naija slang
  Object.entries(naijaWords).forEach(([english, naija]) => {
    const regex = new RegExp(`\\b${english}\\b`, 'gi');
    enhancedText = enhancedText.replace(regex, naija);
  });

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
      
      if (['ai', 'bing', 'ask'].includes(command)) {
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
        // Get or create conversation for this user
        let conversation = conversationCache.get(m.sender);
        
        if (!conversation) {
          conversation = await bingAI.createNewConversation();
          conversation.invocationId = 0;
          conversationCache.set(m.sender, conversation);
          
          // Clear old conversations after 30 minutes
          setTimeout(() => {
            conversationCache.delete(m.sender);
          }, 30 * 60 * 1000);
        }

        // Send message to Bing AI
        const result = await bingAI.sendMessage(query, {
          conversationId: conversation.conversationId,
          encryptedConversationSignature: conversation.encryptedConversationSignature,
          clientId: conversation.clientId,
          invocationId: conversation.invocationId,
          toneStyle: 'balanced'
        });

        // Update conversation
        conversation.invocationId++;

        let aiResponse = result.message.text;
        
        // Add Nigerian flavor to response
        aiResponse = addNaijaFlavor(aiResponse);

        // Limit response length for WhatsApp
        if (aiResponse.length > 1500) {
          aiResponse = aiResponse.substring(0, 1500) + '...\n\n_Abeg the response long pass, na summary be this oh! 😅_';
        }

        // Delete thinking message and send AI response
        try {
          await sock.sendMessage(m.from, { delete: thinkingMsg.key });
        } catch (error) {
          // Silent fail - message might have been deleted already
        }

        await sock.sendMessage(m.from, {
          text: `🤖 *Bing AI Response:*\n\n${aiResponse}\n\n_Powered by Bing AI with Naija flavor 🇳🇬✨_`
        }, { quoted: m });

        // Reward user with small amount for using AI
        await unifiedUserManager.addMoney(m.sender, 5, 'AI Query Bonus');

        console.log(`🤖 AI query from ${m.pushName || m.sender.split('@')[0]}: ${query.substring(0, 50)}...`);

      } catch (error) {
        console.error('Bing AI Error:', error);

        // Delete thinking message
        try {
          await sock.sendMessage(m.from, { delete: thinkingMsg.key });
        } catch (e) {
          // Silent fail
        }

        await sock.sendMessage(m.from, {
          text: `${getRandomResponse(naijaResponses.errors)} 😔\n\n_Error: ${error.message}_`
        }, { quoted: m });
      }
    }

  } catch (error) {
    console.error('Bing AI Plugin Error:', error);
  }
}
