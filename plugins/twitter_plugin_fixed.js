// plugins/twitter_plugin.js
// A complete, from-scratch Twitter (X) monitoring plugin for a WhatsApp bot.
// Version: 2.0.0
// Author: Gemini

// =================================================================
// 📚 IMPORTS & DEPENDENCIES
// =================================================================
// Make sure to install these packages: npm install mongodb axios file-type
import { MongoClient } from 'mongodb';
import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';

// =================================================================
// 📝 PLUGIN METADATA
// =================================================================
export const info = {
  name: 'Twitter Monitor',
  version: '2.0.0',
  author: 'Gemini',
  description: 'Monitors Twitter accounts and sends new tweets, including media, to WhatsApp chats.',
  commands: [
    { name: 'twitter', aliases: ['tw'], description: 'Main command for Twitter monitoring.' },
    { name: 'twadd', description: 'Alias to add a Twitter account.' },
    { name: 'twremove', description: 'Alias to remove a Twitter account.' },
    { name: 'twlist', description: 'Alias to list monitored accounts.' },
  ],
};

// =================================================================
// 🔑 CONFIGURATION
// Load credentials and settings from a .env file in your project's root.
// =================================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN || '';
const ADMIN_NUMBERS = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];

const COLLECTIONS = {
  ACCOUNTS: 'twitter_monitored_accounts',
  SENT_TWEETS: 'twitter_sent_tweets',
  SETTINGS: 'twitter_settings',
};

// =================================================================
// ⚙️ GLOBAL STATE & DATABASE
// =================================================================
let db = null;
let mongoClient = null;
let monitoringInterval = null;

// Default settings for the plugin. These can be overridden by an admin.
const defaultSettings = {
  checkInterval: 900000, // 15 minutes
  maxTweetsPerCheck: 10,  // A safe, valid number (API range: 5-100)
  includeReplies: false,
  includeRetweets: false,
  enableMedia: true,
  adminOnly: true,
  rateLimitDelay: 2000, // 2-second delay between checking different accounts
  retryDelay: 900000,   // 15-minute wait time if rate-limited
  maxRetries: 3,
};

// Initialize settings with default values. This will be updated from DB on startup.
let settings = { ...defaultSettings };

/**
 * Initializes the connection to the MongoDB database and creates necessary indexes.
 */
async function initDatabase() {
  if (db) return;
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);

    // Indexes ensure faster lookups and prevent duplicate data.
    await db.collection(COLLECTIONS.ACCOUNTS).createIndex({ username: 1 }, { unique: true });
    await db.collection(COLLECTIONS.SENT_TWEETS).createIndex({ tweetId: 1, chatId: 1 }, { unique: true });
    
    console.log('✅ Twitter Plugin: MongoDB connection successful.');
  } catch (error) {
    console.error('❌ Twitter Plugin: MongoDB connection failed.', error);
    throw error; // Propagate error to stop initialization if DB fails
  }
}

/**
 * Loads plugin settings from the database, falling back to defaults if none are found.
 */
async function loadSettings() {
  const savedSettings = await db.collection(COLLECTIONS.SETTINGS).findOne({ _id: 'twitter_main' });
  if (savedSettings) {
    settings = { ...defaultSettings, ...savedSettings.config };
  }
}

/**
 * Saves the current settings configuration to the database.
 */
async function saveSettings() {
  await db.collection(COLLECTIONS.SETTINGS).updateOne(
    { _id: 'twitter_main' },
    { $set: { config: settings, updatedAt: new Date() } },
    { upsert: true }
  );
}

// =================================================================
// 🐦 TWITTER API FUNCTIONS
// =================================================================

/**
 * A robust function to make requests to the Twitter API v2.
 * It handles authentication, rate limiting, and retries automatically.
 * @param {string} endpoint - The API endpoint (e.g., '/users/by/username/elonmusk').
 * @param {object} params - Query parameters for the request.
 * @returns {Promise<object>} The JSON response from the API.
 */
async function makeTwitterRequest(endpoint, params = {}) {
  if (!TWITTER_BEARER_TOKEN) {
    throw new Error('Twitter Bearer Token is not configured in .env file.');
  }

  const url = new URL(`https://api.twitter.com/2${endpoint}`);
  // Clean up params to avoid sending empty values
  Object.keys(params).forEach(key => (params[key] === null || params[key] === '') && delete params[key]);
  url.search = new URLSearchParams(params).toString();

  for (let attempt = 1; attempt <= settings.maxRetries; attempt++) {
    try {
      console.log(`🔍 Twitter API Request (Attempt ${attempt}): ${url.toString()}`);
      const response = await axios.get(url.toString(), {
        headers: {
          'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
          'User-Agent': 'WhatsAppBot/2.0 (TwitterPlugin)',
        },
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        // Handle rate limiting (HTTP 429)
        if (error.response.status === 429) {
          console.warn(`⏰ Twitter API rate limit hit. Waiting ${settings.retryDelay / 1000}s...`);
          if (attempt < settings.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, settings.retryDelay));
            continue; // Retry the request
          }
        }
        // For other API errors, provide a detailed message
        const errorData = error.response.data;
        throw new Error(`Twitter API Error: ${error.response.status} - ${errorData.detail || errorData.title}`);
      }
      // Handle network errors (e.g., no internet)
      throw error;
    }
  }
  throw new Error(`Twitter API request failed after ${settings.maxRetries} attempts.`);
}

/**
 * Fetches a Twitter user's profile information, including their ID.
 * @param {string} username - The Twitter handle (without '@').
 * @returns {Promise<object>} The user data object from the API.
 */
async function getUserIdByUsername(username) {
  const response = await makeTwitterRequest(`/users/by/username/${username}`, {
    'user.fields': 'id,name,username,verified',
  });
  if (!response.data) {
    throw new Error(`User @${username} not found or account is private.`);
  }
  return response.data;
}

/**
 * Fetches the latest tweets for a given user ID.
 * @param {string} userId - The numerical ID of the Twitter user.
 * @param {string|null} sinceId - The ID of the last tweet fetched, to get only newer ones.
 * @returns {Promise<object>} An object containing tweets and associated media.
 */
async function getUserTweets(userId, sinceId = null) {
  const excludeParams = [];
  if (!settings.includeReplies) excludeParams.push('replies');
  if (!settings.includeRetweets) excludeParams.push('retweets');

  const params = {
    'tweet.fields': 'id,text,created_at,attachments',
    'max_results': settings.maxTweetsPerCheck, // Uses the configurable, validated setting
    'exclude': excludeParams.join(','),
    'since_id': sinceId,
  };

  // Only request media fields if media is enabled, saving API quota.
  if (settings.enableMedia) {
    params.expansions = 'attachments.media_keys';
    params['media.fields'] = 'type,url,preview_image_url';
  }

  const data = await makeTwitterRequest(`/users/${userId}/tweets`, params);
  return {
    tweets: data.data || [],
    media: data.includes?.media || [],
  };
}

// =================================================================
// 💬 WHATSAPP & MEDIA HANDLING
// =================================================================

/**
 * Downloads media from a URL into a buffer for sending.
 * @param {string} url - The URL of the image or video.
 * @returns {Promise<Buffer>} The downloaded media file as a buffer.
 */
async function downloadMedia(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data, 'binary');
}

/**
 * Formats a tweet and sends it to a WhatsApp chat, including any media.
 * @param {object} sock - The Baileys socket connection object.
 * @param {string} chatId - The ID of the WhatsApp chat to send to.
 * @param {object} tweet - The tweet data object.
 * @param {object} account - The monitored account's data from the DB.
 * @param {Array} media - An array of media objects associated with the tweet.
 */
async function formatAndSendTweet(sock, chatId, tweet, account, media) {
  const tweetUrl = `https://x.com/${account.username}/status/${tweet.id}`;
  const messageText = `🐦 *New Tweet from @${account.username}*\n\n${tweet.text}\n\n🔗 ${tweetUrl}`;

  // 1. Send the main text message of the tweet first.
  await sock.sendMessage(chatId, { text: messageText });

  // 2. If media is enabled and exists, download and send each item.
  if (settings.enableMedia && media.length > 0) {
    for (const mediaItem of media) {
      try {
        const downloadUrl = mediaItem.url || mediaItem.preview_image_url;
        if (!downloadUrl) continue; // Skip if no URL is available

        const buffer = await downloadMedia(downloadUrl);
        const caption = `Media from @${account.username}`;
        let messagePayload = {};

        if (mediaItem.type === 'photo') {
          messagePayload = { image: buffer, caption };
        } else if (mediaItem.type === 'video' || mediaItem.type === 'animated_gif') {
          messagePayload = { video: buffer, caption, gifPlayback: mediaItem.type === 'animated_gif' };
        }
        
        if (Object.keys(messagePayload).length > 0) {
          await sock.sendMessage(chatId, messagePayload);
        }
      } catch (mediaError) {
        console.error(`❌ Failed to send media for tweet ${tweet.id}.`, mediaError.message);
        // Send a fallback message if a specific media item fails to send
        await sock.sendMessage(chatId, { text: `❗️ Could not send an attached media file from @${account.username}.` });
      }
    }
  }
}

// =================================================================
// 🔄 MONITORING ENGINE
// =================================================================

/**
 * The main loop that checks for new tweets for all monitored accounts.
 * @param {object} sock - The Baileys socket connection object.
 */
async function checkForNewTweets(sock) {
  console.log('🔄 Starting new tweet check cycle...');
  const accounts = await db.collection(COLLECTIONS.ACCOUNTS).find({ active: true }).toArray();

  if (accounts.length === 0) {
    console.log('No active accounts to monitor.');
    return;
  }

  for (const account of accounts) {
    try {
      const { tweets, media } = await getUserTweets(account.userId, account.lastTweetId);

      if (tweets.length > 0) {
        console.log(`✅ Found ${tweets.length} new tweet(s) for @${account.username}.`);
        // Sort tweets from oldest to newest to send them in chronological order.
        const sortedTweets = tweets.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        for (const tweet of sortedTweets) {
          for (const chatId of account.chatIds) {
            // Check if this specific tweet has already been sent to this chat
            const sent = await db.collection(COLLECTIONS.SENT_TWEETS).findOne({ tweetId: tweet.id, chatId });
            if (!sent) {
              const tweetMedia = media.filter(m => tweet.attachments?.media_keys?.includes(m.media_key));
              await formatAndSendTweet(sock, chatId, tweet, account, tweetMedia);
              // Mark as sent to prevent duplicates
              await db.collection(COLLECTIONS.SENT_TWEETS).insertOne({
                tweetId: tweet.id,
                chatId,
                sentAt: new Date(),
              });
            }
          }
        }
        
        // Update the account with the ID of the newest tweet to avoid re-fetching it.
        const newLastTweetId = sortedTweets[sortedTweets.length - 1].id;
        await db.collection(COLLECTIONS.ACCOUNTS).updateOne(
          { _id: account._id },
          { $set: { lastTweetId: newLastTweetId, lastChecked: new Date() } }
        );
      } else {
        console.log(`No new tweets for @${account.username}.`);
      }
    } catch (error) {
      console.error(`❌ Error checking tweets for @${account.username}:`, error.message);
    }
    // Polite delay between checking different accounts to avoid hitting rate limits too quickly.
    await new Promise(resolve => setTimeout(resolve, settings.rateLimitDelay));
  }
  console.log('✅ Tweet check cycle finished.');
}

// =================================================================
// 🔐 AUTHORIZATION & COMMAND HANDLERS
// =================================================================

/**
 * Checks if a user is an admin based on the ADMIN_NUMBERS in the .env file.
 * @param {string} senderId - The user's JID (e.g., '23480..._@s.whatsapp.net').
 * @returns {boolean} True if the user is an admin.
 */
function isAuthorized(senderId) {
  const userNumber = senderId.split('@')[0];
  return ADMIN_NUMBERS.includes(userNumber);
}

/**
 * Command handler to add a Twitter account for monitoring.
 */
async function handleAdd(sock, m, args) {
  if (!settings.adminOnly || isAuthorized(m.sender)) {
    const username = args[0]?.replace('@', '').trim();
    if (!username) return m.reply('Please provide a Twitter username. Usage: `!twadd @username`');
    
    try {
      m.reply(`⏳ Verifying and adding @${username}...`);
      const user = await getUserIdByUsername(username);
      
      await db.collection(COLLECTIONS.ACCOUNTS).updateOne(
        { userId: user.id },
        {
          $set: { username: user.username, name: user.name, active: true },
          $addToSet: { chatIds: m.chat }, // Adds the chat ID to the list if it's not already there
        },
        { upsert: true }
      );
      
      m.reply(`✅ @${user.username} is now being monitored in this chat.`);
    } catch (error) {
      m.reply(`❌ Error adding account: ${error.message}`);
    }
  } else {
    m.reply('🚫 You are not authorized to add accounts.');
  }
}

/**
 * Command handler to remove a Twitter account from a chat.
 */
async function handleRemove(sock, m, args) {
  if (!settings.adminOnly || isAuthorized(m.sender)) {
    const username = args[0]?.replace('@', '').trim();
    if (!username) return m.reply('Please provide a Twitter username. Usage: `!twremove @username`');

    try {
      const result = await db.collection(COLLECTIONS.ACCOUNTS).updateOne(
        { username: username },
        { $pull: { chatIds: m.chat } } // Removes this chat from the monitoring list
      );
      
      if (result.modifiedCount > 0) {
        m.reply(`✅ @${username} will no longer be monitored in this chat.`);
        // If the account is no longer monitored in any chat, deactivate it.
        const account = await db.collection(COLLECTIONS.ACCOUNTS).findOne({ username: username });
        if (account && account.chatIds.length === 0) {
          await db.collection(COLLECTIONS.ACCOUNTS).updateOne({ username: username }, { $set: { active: false } });
          console.log(`Deactivated @${username} as it has no more chats to notify.`);
        }
      } else {
        m.reply(`🤔 @${username} was not being monitored in this chat.`);
      }
    } catch (error) {
      m.reply(`❌ Error removing account: ${error.message}`);
    }
  } else {
    m.reply('🚫 You are not authorized to remove accounts.');
  }
}

/**
 * Command handler to list all accounts monitored in the current chat.
 */
async function handleList(sock, m) {
  const accounts = await db.collection(COLLECTIONS.ACCOUNTS).find({ chatIds: m.chat, active: true }).toArray();
  
  if (accounts.length === 0) {
    return m.reply('No Twitter accounts are being monitored in this chat.');
  }
  
  let replyText = '📋 *Monitored Twitter Accounts in this Chat:*\n\n';
  accounts.forEach(acc => {
    replyText += `• @${acc.username} (${acc.name})\n`;
  });
  
  m.reply(replyText);
}

/**
 * Command handler for viewing and changing plugin settings.
 */
async function handleSettings(sock, m, args) {
    if (isAuthorized(m.sender)) {
        const [key, value] = args;
        if (!key) {
            // Display current settings if no key is provided
            let status = `⚙️ *Current Twitter Plugin Settings*\n\n`;
            for (const [prop, val] of Object.entries(settings)) {
                status += `• *${prop}:* ${val}\n`;
            }
            status += `\nUsage: \`!twitter settings <key> <value>\``;
            return m.reply(status);
        }

        if (key in settings) {
            let parsedValue = value;
            if (typeof settings[key] === 'number') parsedValue = parseInt(value, 10);
            if (typeof settings[key] === 'boolean') parsedValue = ['true', 'on', '1'].includes(value.toLowerCase());

            // THE CRITICAL FIX: Validate maxTweetsPerCheck value on change
            if (key === 'maxTweetsPerCheck' && (isNaN(parsedValue) || parsedValue < 5 || parsedValue > 100)) {
                return m.reply('❌ Invalid value! `maxTweetsPerCheck` must be a number between 5 and 100.');
            }

            settings[key] = parsedValue;
            await saveSettings();
            m.reply(`✅ Setting *${key}* has been updated to *${parsedValue}*.`);
            
            // If the check interval is changed, restart the monitoring loop with the new value.
            if (key === 'checkInterval') {
                stopMonitoring();
                startMonitoring(sock);
            }
        } else {
            m.reply(`❌ Unknown setting: *${key}*`);
        }
    } else {
        m.reply('🚫 Only admins can view or change settings.');
    }
}

/**
 * Displays the help menu for the plugin.
 */
function showHelpMenu(m, prefix) {
  const menu = `*🐦 Twitter Monitor Plugin Help 🐦*

*Commands:*
• \`${prefix}twadd @username\`
  Adds a Twitter account to monitor in this chat.

• \`${prefix}twremove @username\`
  Removes an account from this chat.

• \`${prefix}twlist\`
  Lists all accounts monitored in this chat.

*Admin Commands:*
• \`${prefix}twitter settings\`
  View current plugin settings.

• \`${prefix}twitter settings <key> <value>\`
  Change a setting (e.g., \`${prefix}twitter settings checkInterval 600000\`).
`;
  m.reply(menu);
}

// =================================================================
// 🚀 PLUGIN ENTRY POINT & LIFECYCLE
// =================================================================

/**
 * The main handler function for the plugin.
 * It's called for every message the bot receives to check for commands.
 */
export default async function handler(m, sock, config) {
  if (!m.body) return;
  const prefix = config.PREFIX || '!';
  if (!m.body.startsWith(prefix)) return;

  const args = m.body.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  // Create a consistent message context object for easier handling in functions
  const mContext = {
      ...m,
      chat: m.key.remoteJid,
      sender: m.key.participant || m.key.remoteJid,
      reply: (text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m }),
  };

  switch (command) {
    case 'twadd':
      await handleAdd(sock, mContext, args);
      break;
    case 'twremove':
      await handleRemove(sock, mContext, args);
      break;
    case 'twlist':
      await handleList(sock, mContext);
      break;
    case 'twitter':
    case 'tw':
        const subCommand = args[0]?.toLowerCase();
        if (subCommand === 'settings') {
            await handleSettings(sock, mContext, args.slice(1));
        } else {
            showHelpMenu(mContext, prefix);
        }
      break;
  }
}

/**
 * Starts the periodic monitoring process.
 * @param {object} sock - The Baileys socket connection object.
 */
function startMonitoring(sock) {
  if (monitoringInterval) clearInterval(monitoringInterval);
  console.log(`🤖 Twitter monitoring started. Checking every ${settings.checkInterval / 60000} minutes.`);
  // Perform an initial check shortly after startup to get recent tweets.
  setTimeout(() => checkForNewTweets(sock), 5000);
  monitoringInterval = setInterval(() => checkForNewTweets(sock), settings.checkInterval);
}

/**
 * Stops the monitoring interval.
 */
function stopMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
        console.log('🛑 Twitter monitoring stopped.');
    }
}

/**
 * Initializes the plugin when the bot starts up.
 */
export async function initPlugin(sock) {
  console.log('🔧 Initializing Twitter Plugin...');
  if (!TWITTER_BEARER_TOKEN) {
    console.error('⚠️ TWITTER_BEARER_TOKEN not found in .env. Plugin will be disabled.');
    return;
  }
  await initDatabase();
  await loadSettings();
  startMonitoring(sock);
}

/**
 * Cleans up resources (like the database connection) when the bot shuts down.
 */
export async function cleanupPlugin() {
  stopMonitoring();
  if (mongoClient) {
    await mongoClient.close();
  }
  console.log('🧹 Twitter Plugin cleaned up successfully.');
}
