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

  // Get proper headers for Bing
  getBingHeaders() {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': '*/*',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
      'Sec-WebSocket-Version': '13',
      'Origin': 'https://www.bing.com'
    };
  }

  // Connect to WebSocket with better error handling
  connectWebSocket(signature) {
    return new Promise((resolve, reject) => {
      let connectionAttempts = 0;
      const maxAttempts = 3;
      
      const attemptConnection = () => {
        connectionAttempts++;
        console.log(`🔌 Attempting Bing connection... (${connectionAttempts}/${maxAttempts})`);
        
        const ws = new WebSocket('wss://sydney.bing.com/sydney/ChatHub', {
          headers: this.getBingHeaders()
        });

        const timeout = setTimeout(() => {
          ws.close();
          if (connectionAttempts < maxAttempts) {
            console.log('⏰ Connection timeout, retrying...');
            setTimeout(attemptConnection, 2000);
          } else {
            reject(new Error('Connection timeout after multiple attempts'));
          }
        }, 15000);

        ws.on('error', (error) => {
          clearTimeout(timeout);
          console.log('❌ WebSocket error:', error.message);
          
          if (connectionAttempts < maxAttempts) {
            setTimeout(attemptConnection, 2000);
          } else {
            reject(new Error(`Connection failed: ${error.message}`));
          }
        });

        ws.on('open', () => {
          console.log('✅ WebSocket connection opened');
          try {
            ws.send('{"protocol":"json","version":1}\x1e');
          } catch (error) {
            clearTimeout(timeout);
            reject(new Error('Failed to send handshake'));
          }
        });

        ws.on('message', (data) => {
          try {
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

            // Handle handshake response
            if (responses[0] && typeof responses[0] === 'object' && Object.keys(responses[0]).length === 0) {
              clearTimeout(timeout);
              console.log('🤝 Handshake successful');
              
              // Setup ping interval
              ws.pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send('{"type":6}\x1e');
                }
              }, 15000);
              
              resolve(ws);
            }
          } catch (error) {
            clearTimeout(timeout);
            reject(new Error('Handshake parsing failed'));
          }
        });

        ws.on('close', (code, reason) => {
          clearTimeout(timeout);
          console.log(`🔌 Connection closed: ${code} - ${reason}`);
        });
      };
      
      attemptConnection();
    });
  }

  // Send message to Bing AI with better error handling
  async sendMessage(message, options = {}) {
    const {
      conversationId,
      encryptedConversationSignature,
      clientId,
      invocationId = 0,
      toneStyle = 'balanced'
    } = options;

    let ws;
    try {
      // Connect to WebSocket with retries
      ws = await this.connectWebSocket(encryptedConversationSignature);
    } catch (error) {
      throw new Error(`Connection failed: ${error.message}`);
    }

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

    return new Promise((resolve, reject) => {
      let responseText = '';
      let hasResponded = false;
      
      const timeout = setTimeout(() => {
        if (!hasResponded) {
          hasResponded = true;
          this.cleanupWebSocket(ws);
          reject(new Error('AI response timeout'));
        }
      }, 90000); // 90 seconds timeout

      ws.on('error', (error) => {
        if (!hasResponded) {
          hasResponded = true;
          clearTimeout(timeout);
          this.cleanupWebSocket(ws);
          reject(new Error(`WebSocket error: ${error.message}`));
        }
      });

      ws.on('close', (code, reason) => {
        if (!hasResponded) {
          hasResponded = true;
          clearTimeout(timeout);
          reject(new Error(`Connection closed unexpectedly: ${code} - ${reason}`));
        }
      });

      ws.on('message', (data) => {
        try {
          const messages = data.toString().split('\x1e')
            .map(msg => {
              try {
                return JSON.parse(msg);
              } catch {
                return null;
              }
            })
            .filter(msg => msg);

          if (messages.length === 0) return;

          for (const message of messages) {
            if (hasResponded) break;

            switch (message.type) {
              case 1: {
                // Streaming response
                const messageContent = message?.arguments?.[0]?.messages;
                if (!messageContent?.length || messageContent[0].author !== 'bot') continue;

                const text = messageContent[0].text;
                if (text && text !== responseText && text.length > responseText.length) {
                  responseText = text;
                }
                break;
              }

              case 2: {
                // Final response
                if (hasResponded) break;
                hasResponded = true;
                clearTimeout(timeout);
                this.cleanupWebSocket(ws);

                // Check for errors first
                if (message.item?.result?.error) {
                  return reject(new Error(`Bing AI Error: ${message.item.result.message || message.item.result.error}`));
                }

                const messages = message.item?.messages || [];
                let finalMessage = null;

                // Find the bot's response
                for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i].author === 'bot' && messages[i].text) {
                    finalMessage = messages[i];
                    break;
                  }
                }

                if (finalMessage && finalMessage.text) {
                  resolve({
                    message: finalMessage,
                    conversationExpiryTime: message?.item?.conversationExpiryTime
                  });
                } else if (responseText) {
                  // Use streaming response as fallback
                  resolve({
                    message: { text: responseText, author: 'bot' },
                    conversationExpiryTime: message?.item?.conversationExpiryTime
                  });
                } else {
                  reject(new Error('No valid response received from Bing AI'));
                }
                break;
              }

              case 7:
                if (hasResponded) break;
                hasResponded = true;
                clearTimeout(timeout);
                this.cleanupWebSocket(ws);
                reject(new Error(message.error || 'Bing AI service error'));
                break;

              default:
                if (message?.error) {
                  if (hasResponded) break;
                  hasResponded = true;
                  clearTimeout(timeout);
                  this.cleanupWebSocket(ws);
                  reject(new Error(`Bing Error (Type ${message.type}): ${message.error}`));
                }
            }
          }
        } catch (parseError) {
          if (!hasResponded) {
            hasResponded = true;
            clearTimeout(timeout);
            this.cleanupWebSocket(ws);
            reject(new Error(`Response parsing error: ${parseError.message}`));
          }
        }
      });

      // Build request payload with current timestamp
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
            'dv3sugg'
          ],
          sliceIds: [
            'winmuid3tf',
            'osbsdusgreccf',
            'ttstmout',
            'crchatrev',
            'winlongmsg2tf'
          ],
          traceId: this.generateRandomString(32),
          isStartOfSession: invocationId === 0,
          message: {
            author: 'user',
            inputMethod: 'Keyboard',
            text: message,
            messageType: 'Chat',
            timestamp: new Date().toISOString()
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
      try {
        const requestString = JSON.stringify(requestPayload) + '\x1e';
        ws.send(requestString);
        console.log('📤 Request sent to Bing AI');
      } catch (sendError) {
        if (!hasResponded) {
          hasResponded = true;
          clearTimeout(timeout);
          this.cleanupWebSocket(ws);
          reject(new Error(`Failed to send request: ${sendError.message}`));
        }
      }
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
        
        if (!conversation || Date.now() - conversation.createdAt > 20 * 60 * 1000) {
          // Create new conversation or refresh if older than 20 minutes
          console.log('🔄 Creating new Bing conversation...');
          conversation = await bingAI.createNewConversation();
          conversation.invocationId = 0;
          conversation.createdAt = Date.now();
          conversationCache.set(m.sender, conversation);
          
          // Clear old conversations after 30 minutes
          setTimeout(() => {
            conversationCache.delete(m.sender);
          }, 30 * 60 * 1000);
        }

        // Send message to Bing AI with retry logic
        let result;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            result = await bingAI.sendMessage(query, {
              conversationId: conversation.conversationId,
              encryptedConversationSignature: conversation.encryptedConversationSignature,
              clientId: conversation.clientId,
              invocationId: conversation.invocationId,
              toneStyle: 'balanced'
            });
            break; // Success, exit retry loop
          } catch (error) {
            retryCount++;
            console.log(`🔄 Retry attempt ${retryCount}/${maxRetries} due to: ${error.message}`);
            
            if (retryCount <= maxRetries) {
              // Create fresh conversation for retry
              conversation = await bingAI.createNewConversation();
              conversation.invocationId = 0;
              conversation.createdAt = Date.now();
              conversationCache.set(m.sender, conversation);
              
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
              throw error; // All retries failed
            }
          }
        }

        // Update conversation
        conversation.invocationId++;

        let aiResponse = result.message.text;
        
        // Clean up response
        aiResponse = aiResponse
          .replace(/\[.*?\]/g, '') // Remove citation brackets
          .replace(/\*\*(.*?)\*\*/g, '*$1*') // Convert bold formatting
          .trim();

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

        // Better error messages based on error type
        let errorResponse = getRandomResponse(naijaResponses.errors);
        
        if (error.message.includes('timeout')) {
          errorResponse = "Omo, AI don slow oh! Network dey drag like okada for go-slow. Try again abeg! 🚗💨";
        } else if (error.message.includes('Connection')) {
          errorResponse = "Connection dey shakara oh! Make we try again nah! 🌐";
        } else if (error.message.includes('response: 200')) {
          errorResponse = "AI server dey form big boy oh! But we go try again sharp sharp! 💪";
        }

        await sock.sendMessage(m.from, {
          text: `${errorResponse}\n\n_Error details: ${error.message.substring(0, 100)}..._`
        }, { quoted: m });
      }
    }

  } catch (error) {
    console.error('Bing AI Plugin Error:', error);
  }
}
