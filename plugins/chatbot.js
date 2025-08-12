// plugins/bingai_plugin.js - Bing AI plugin following economy_plugin structure

import { MongoClient } from 'mongodb';
import crypto from 'crypto';
import { WebSocket } from 'ws';
import https from 'https';

// Plugin information export
export const info = {
  name: 'Bing AI Chat',
  version: '1.0.0',
  author: 'Gemini',
  description: 'Integrates Bing AI conversational capabilities into the bot with MongoDB persistence.',
  commands: [
    {
      name: 'ask',
      aliases: ['bing', 'ai'],
      description: 'Ask Bing AI a question.',
      usage: '{PREFIX}ask [your question]'
    },
    {
      name: 'reset',
      aliases: [],
      description: 'Resets your current Bing AI conversation.',
      usage: '{PREFIX}reset'
    }
  ]
};

// =========================================================
//  MongoDB Configuration
//  Using the same URI and a new collection for conversations
// =========================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'whatsapp_bot';
const COLLECTIONS = {
  CONVERSATIONS: 'bingai_conversations'
};

// Database connection
let db = null;
let mongoClient = null;

// Initialize MongoDB connection
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    // Create an index on the userId for quick lookups
    await db.collection(COLLECTIONS.CONVERSATIONS).createIndex({ userId: 1 }, { unique: true });
    
    console.log('✅ MongoDB connected successfully for Bing AI plugin');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed for Bing AI plugin:', error);
    throw error;
  }
}

// =========================================================
//  Utility and core functions from bingai.js
//  These have been extracted and included here to make the plugin
//  self-contained and easily plug-and-play.
// =========================================================
const generateUUID = () => crypto.randomUUID();

const createNewConversation = () => {
  return Promise.resolve({
    conversationId: generateUUID(),
    encryptedConversationSignature: generateRandomString(64),
    clientId: generateUUID()
  });
};

const generateRandomString = (length) => [
  ...Array(length)
].map(() => Math.floor(0x10 * Math.random()).toString(0x10)).join('');

const cleanupWebSocket = (ws) => {
  clearInterval(ws.pingInterval);
  ws.close();
  ws.terminate();
};

const connectWebSocket = (signature, callback) => new Promise((resolve, reject) => {
  const ws = new WebSocket('wss://sydney.bing.com/sydney/ChatHub', {
    headers: callback
  });

  ws.on('error', reject);
  ws.on('open', () => {
    ws.send('{"protocol":"json","version":1}\x1e');
  });
  ws.on('close', () => {});
  ws.on('message', (data) => {
    const responses = data.toString().split('\x1e').map(msg => {
      try {
        return JSON.parse(msg);
      } catch (error) {
        return msg;
      }
    }).filter(msg => msg);

    if (responses.length === 0) return;

    if (responses[0] && typeof responses[0] === 'object' && Object.keys(responses[0]).length === 0) {
      ws.pingInterval = setInterval(() => {
        ws.send('{"type":6}\x1e');
      }, 15000);
      resolve(ws);
    }
  });
});

const buildMessageHistory = (messages, parentMessageId) => {
  const history = [];
  let currentId = parentMessageId;

  while (currentId) {
    const message = messages.find(msg => msg.id === currentId);
    if (!message) break;
    history.unshift(message);
    currentId = message.parentMessageId;
  }
  return history;
};

const sendMessage = async (message, options = {}, callback) => {
  let {
    jailbreakConversationId = false,
    conversationId,
    encryptedConversationSignature,
    clientId
  } = options;

  const {
    toneStyle = 'balanced',
    invocationId = 0,
    systemMessage,
    context,
    parentMessageId = generateUUID(),
    abortController = new AbortController()
  } = options;

  if (!encryptedConversationSignature || !conversationId || !clientId) {
    const newConversation = await createNewConversation();
    if (!newConversation.encryptedConversationSignature ||
        !newConversation.conversationId ||
        !newConversation.clientId) {

      const errorValue = newConversation.result?.value;
      if (errorValue) {
        const error = new Error(newConversation.result.message);
        error.code = errorValue;
        throw error;
      }
      throw new Error('Failed to create new conversation: ' + JSON.stringify(newConversation, null, 2));
    }
    ({ encryptedConversationSignature, conversationId, clientId } = newConversation);
  }

  let jailbreakPrompt = '';
  if (jailbreakConversationId) {
    const conversation = await db.collection(COLLECTIONS.CONVERSATIONS).findOne({ userId: jailbreakConversationId }) || {
      messages: [],
      createdAt: Date.now()
    };

    const messages = buildMessageHistory(conversation.messages, parentMessageId).map(msg => ({
      text: msg.message,
      author: msg.role === 'user' ? 'user' : 'bot'
    }));

    const contextMessages = invocationId === 0 ? [{
      text: systemMessage || 'You are a helpful assistant.',
      author: 'system'
    }, ...messages, {
      text: message,
      author: 'user'
    }] : undefined;

    jailbreakPrompt = contextMessages?.map(msg => {
      switch (msg.author) {
        case 'user':
          return `Human: ${msg.text}`;
        case 'bot':
          return `Assistant: ${msg.text}`;
        case 'system':
          return `System: ${msg.text}`;
        default:
          throw new Error(`Unknown author: ${msg.author}`);
      }
    }).join('\n\n');

    if (context) {
      jailbreakPrompt = context + '\n\n' + jailbreakPrompt;
    }
  }

  const userMessage = {
    id: generateUUID(),
    parentMessageId: parentMessageId,
    role: 'user',
    message: message
  };

  if (jailbreakConversationId) {
    const conversation = await db.collection(COLLECTIONS.CONVERSATIONS).findOne({ userId: jailbreakConversationId });
    if (conversation) {
      conversation.messages.push(userMessage);
      await db.collection(COLLECTIONS.CONVERSATIONS).updateOne(
        { userId: jailbreakConversationId },
        { $set: { messages: conversation.messages, updatedAt: new Date() } }
      );
    }
  }

  const ws = await connectWebSocket(encryptedConversationSignature, callback);

  let selectedToneStyle;
  switch (toneStyle) {
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
      traceId: generateRandomString(32),
      isStartOfSession: invocationId === 0,
      message: {
        author: 'user',
        text: jailbreakConversationId ? jailbreakPrompt : message,
        messageType: jailbreakConversationId ? 'Chat' : 'SearchQuery'
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

  if (jailbreakPrompt) {
    requestPayload.arguments[0].previousMessages.push({
      author: 'user',
      description: jailbreakPrompt,
      contextType: 'WebPage',
      messageType: 'Context',
      messageId: generateUUID()
    });
  }

  if (!jailbreakConversationId && context) {
    requestPayload.arguments[0].previousMessages.push({
      author: 'user',
      description: context,
      contextType: 'WebPage',
      messageType: 'Context',
      messageId: generateUUID()
    });
  }

  if (requestPayload.arguments[0].previousMessages.length === 0) {
    delete requestPayload.arguments[0].previousMessages;
  }

  const responsePromise = new Promise((resolve, reject) => {
    let responseText = '';
    let isComplete = false;

    const timeout = setTimeout(() => {
      cleanupWebSocket(ws);
      reject(new Error('Request timeout'));
    }, 300000);

    abortController.signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      cleanupWebSocket(ws);
      reject(new Error('Request aborted'));
    });

    ws.on('message', async (data) => {
      const messages = data.toString().split('\x1e').map(msg => {
        try {
          return JSON.parse(msg);
        } catch (error) {
          return msg;
        }
      }).filter(msg => msg);

      if (messages.length === 0) return;

      const message = messages[0];

      switch (message.type) {
        case 1: {
          if (isComplete) return;

          const messageContent = message?.arguments?.[0]?.messages;
          if (!messageContent?.length || messageContent[0].author !== 'bot') return;

          const text = messageContent[0].text;
          if (!text || text === responseText) return;

          text.startsWith(responseText.length);
          responseText = text.trim().endsWith('...') ?
              (isComplete = true, text.replace('...', '').trim()) :
              text;
          break;
        }
        case 2: {
          clearTimeout(timeout);
          cleanupWebSocket(ws);

          if (message.item?.result?.error) {
            return reject(new Error(message.item.result.error + ': ' + message.item.result.message));
          }

          const messages = message.item?.messages || [];
          let finalMessage = messages.length ? messages[messages.length - 1] : null;

          if (message.item?.result?.error) {
            return reject(new Error(message.item.result.error + ': ' + message.item.result.message));
          }

          if (finalMessage) {
            if (jailbreakConversationId && (
                isComplete ||
                message.item.messages[0].spokenTextResponse ||
                message.item.messages[0].author !== 'bot' ||
                message.item.messages.length > 1 &&
                message.item.messages[1].contentOrigin === 'Apology'
            )) {
              if (!responseText) responseText = 'I understand your request.';
              finalMessage.spokenTextResponse = responseText;
              finalMessage.text = responseText;
              delete finalMessage.contentOrigin;
            }

            return resolve({
              message: finalMessage,
              conversationExpiryTime: message?.item?.conversationExpiryTime
            });
          } else {
            return reject(new Error('No response message found'));
          }
        }
        case 7:
          clearTimeout(timeout);
          cleanupWebSocket(ws);
          return reject(new Error(message.error || 'Unknown error occurred'));
        default:
          if (message?.error) {
            clearTimeout(timeout);
            cleanupWebSocket(ws);
            return reject(new Error(`Error type ${message.type}: ${message.error}`));
          }
      }
    });
  });

  const requestString = JSON.stringify(requestPayload);
  ws.send(requestString + '\x1e');

  const { message: response, conversationExpiryTime } = await responsePromise;

  const botMessage = {
    id: generateUUID(),
    parentMessageId: userMessage.id,
    role: 'assistant',
    message: response.text,
    details: response
  };

  if (jailbreakConversationId) {
    const conversation = await db.collection(COLLECTIONS.CONVERSATIONS).findOne({ userId: jailbreakConversationId });
    if (conversation) {
      conversation.messages.push(botMessage);
      await db.collection(COLLECTIONS.CONVERSATIONS).updateOne(
        { userId: jailbreakConversationId },
        { $set: { messages: conversation.messages, updatedAt: new Date() } }
      );
    }
  }

  const result = {
    conversationId,
    encryptedConversationSignature,
    clientId,
    invocationId: invocationId + 1,
    conversationExpiryTime,
    response: response.text,
    details: response
  };

  if (jailbreakConversationId) {
    result.jailbreakConversationId = jailbreakConversationId;
    result.parentMessageId = botMessage.parentMessageId;
    result.messageId = botMessage.id;
  }
  return result;
};


// =========================================================
//  Main plugin run function
//  This is the entry point for the plugin's commands.
// =========================================================
export const run = async (context, args) => {
  const { from, sender, command, reply } = context;
  const userIdentifier = sender; 

  // Initialize the database connection first
  await initDatabase();

  try {
    if (command === 'reset') {
      await db.collection(COLLECTIONS.CONVERSATIONS).deleteOne({ userId: userIdentifier });
      await reply('✅ Your conversation with Bing AI has been reset.');
      return;
    }

    if (!args || args.length === 0) {
      await reply('⚠️ Please provide a message to send to Bing AI. Use `{PREFIX}ask [your question]`.');
      return;
    }

    const userMessage = args.join(' ');
    await reply('Thinking...');

    // Fetch the existing conversation from the database
    let userConversations = await db.collection(COLLECTIONS.CONVERSATIONS).findOne({ userId: userIdentifier });
    if (!userConversations) {
        // If no conversation exists, create a new one in the database
        userConversations = {
            userId: userIdentifier,
            messages: [],
            createdAt: new Date()
        };
        await db.collection(COLLECTIONS.CONVERSATIONS).insertOne(userConversations);
    }

    const {
      conversationId,
      encryptedConversationSignature,
      clientId,
      invocationId,
      response,
      messageId,
      parentMessageId
    } = await sendMessage(userMessage, {
      jailbreakConversationId: userIdentifier,
      conversationId: userConversations.conversationId,
      encryptedConversationSignature: userConversations.encryptedConversationSignature,
      clientId: userConversations.clientId,
      invocationId: userConversations.invocationId,
      parentMessageId: userConversations.parentMessageId
    });

    // Update the conversation state in the database
    await db.collection(COLLECTIONS.CONVERSATIONS).updateOne(
      { userId: userIdentifier },
      { $set: {
          conversationId,
          encryptedConversationSignature,
          clientId,
          invocationId,
          parentMessageId: messageId,
          updatedAt: new Date()
        }
      }
    );

    await reply(response);

  } catch (error) {
    console.error('Bing AI plugin error:', error);
    await reply('❌ An error occurred while communicating with Bing AI. Please try again later.');
  }
};
