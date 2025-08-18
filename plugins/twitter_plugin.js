// plugins/twitter_plugin.js - Fixed version
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Add these imports for media handling
import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';

// Plugin information export
export const info = {
  name: 'Twitter Integration',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Automatically sends tweets from monitored X (Twitter) accounts to WhatsApp chats',
  commands: [
    {
      name: 'twitter',
      aliases: ['tw', 'x'],
      description: 'Manage Twitter monitoring'
    },
    {
      name: 'twitteradd',
      aliases: ['twadd'],
      description: 'Add Twitter account to monitor'
    },
    {
      name: 'twitterremove',
      aliases: ['twremove'],
      description: 'Remove Twitter account from monitoring'
    },
    {
      name: 'twitterlist',
      aliases: ['twlist'],
      description: 'List monitored Twitter accounts'
    }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
const COLLECTIONS = {
  TWITTER_ACCOUNTS: 'twitter_accounts',
  SENT_TWEETS: 'sent_tweets',
  TWITTER_SETTINGS: 'twitter_settings'
};

// Twitter API Configuration
const TWITTER_CONFIG = {
  apiKey: process.env.TWITTER_API_KEY || '',
  apiSecret: process.env.TWITTER_API_SECRET || '',
  bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
  baseUrl: 'https://api.twitter.com/2'
};

// Database connection
let db = null;
let mongoClient = null;

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// FIXED: Define defaultSettings BEFORE using it
const defaultSettings = {
  checkInterval: 900000, // 15 minutes (safer for rate limits)
  maxTweetsPerCheck: 5, // Reduced to avoid rate limits
  includeReplies: false,
  includeRetweets: true,
  messageTemplate: '🐦 *New tweet from @{username}*\n\n{content}\n\n🔗 {url}',
  enableImages: true,
  enableVideos: true,
  maxMessageLength: 1000,
  enableFilters: true,
  adminOnly: true,
  rateLimitDelay: 5000, // 5 seconds between API calls
  retryDelay: 60000, // 1 minute retry delay on rate limit
  maxRetries: 3,
  // Enhanced media settings
  maxImageSize: 5 * 1024 * 1024, // 5MB
  maxVideoSize: 16 * 1024 * 1024, // 16MB (WhatsApp limit)
  downloadTimeout: 30000, // 30 seconds
  maxMediaItems: 4, // Max media items per tweet
  sendMediaAsDocument: false, // Send large media as documents
  compressImages: true, // Compress images if too large
  skipFailedMedia: true // Continue sending other media if one fails
};

// Initialize settings with default values
let twitterSettings = { ...defaultSettings };

// Initialize MongoDB connection
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    // Create indexes for better performance
    await db.collection(COLLECTIONS.TWITTER_ACCOUNTS).createIndex({ username: 1 }, { unique: true });
    await db.collection(COLLECTIONS.SENT_TWEETS).createIndex({ tweetId: 1, targetChat: 1 }, { unique: true });
    await db.collection(COLLECTIONS.SENT_TWEETS).createIndex({ createdAt: -1 });
    await db.collection(COLLECTIONS.TWITTER_ACCOUNTS).createIndex({ lastChecked: 1 });
    
    console.log('✅ MongoDB connected successfully for Twitter Plugin');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed for Twitter Plugin:', error);
    throw error;
  }
}

// Load settings from database
async function loadSettings() {
  try {
    const settings = await db.collection(COLLECTIONS.TWITTER_SETTINGS).findOne({ type: 'twitter' });
    if (settings) {
      twitterSettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading Twitter settings:', error);
  }
}

// Save settings to database
async function saveSettings() {
  try {
    await db.collection(COLLECTIONS.TWITTER_SETTINGS).replaceOne(
      { type: 'twitter' },
      { type: 'twitter', data: twitterSettings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving Twitter settings:', error);
  }
}

// =======================
// 🐦 TWITTER API FUNCTIONS
// =======================

// Make authenticated request to Twitter API with retry logic
async function makeTwitterRequest(endpoint, params = {}) {
  let retries = 0;
  
  while (retries <= twitterSettings.maxRetries) {
    try {
      if (!TWITTER_CONFIG.bearerToken) {
        throw new Error('Twitter Bearer Token not configured');
      }

      const url = new URL(`${TWITTER_CONFIG.baseUrl}${endpoint}`);
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, params[key]);
        }
      });

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${TWITTER_CONFIG.bearerToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 429) {
        const resetTime = response.headers.get('x-rate-limit-reset');
        const resetMs = resetTime ? (parseInt(resetTime) * 1000) - Date.now() : twitterSettings.retryDelay;
        const waitTime = Math.max(resetMs, twitterSettings.retryDelay);
        
        console.log(`⏰ Rate limited. Waiting ${Math.ceil(waitTime / 1000)}s before retry ${retries + 1}/${twitterSettings.maxRetries}`);
        
        if (retries < twitterSettings.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        } else {
          throw new Error(`Rate limit exceeded. Max retries (${twitterSettings.maxRetries}) reached.`);
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Twitter API Error: ${response.status} - ${errorData.detail || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error.message.includes('Rate limit exceeded') || retries >= twitterSettings.maxRetries) {
        throw error;
      }
      
      console.error(`Twitter API request failed (attempt ${retries + 1}):`, error.message);
      retries++;
      
      if (retries <= twitterSettings.maxRetries) {
        console.log(`⏳ Retrying in ${twitterSettings.retryDelay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, twitterSettings.retryDelay));
      }
    }
  }
}

// Get user ID by username
async function getUserId(username) {
  try {
    const cleanUsername = username.replace('@', '');
    const data = await makeTwitterRequest('/users/by/username/' + cleanUsername, {
      'user.fields': 'id,name,username,public_metrics,verified'
    });
    
    return data.data;
  } catch (error) {
    console.error(`Error getting user ID for ${username}:`, error);
    throw error;
  }
}

// Get user tweets
async function getUserTweets(userId, sinceId = null) {
  try {
    const params = {
      'tweet.fields': 'id,text,created_at,public_metrics,attachments,referenced_tweets,context_annotations',
      'media.fields': 'type,url,preview_image_url,duration_ms,height,width',
      'expansions': 'attachments.media_keys,referenced_tweets.id',
      'max_results': twitterSettings.maxTweetsPerCheck,
      'exclude': []
    };

    if (!twitterSettings.includeReplies) {
      params.exclude.push('replies');
    }
    if (!twitterSettings.includeRetweets) {
      params.exclude.push('retweets');
    }

    if (params.exclude.length > 0) {
      params.exclude = params.exclude.join(',');
    } else {
      delete params.exclude;
    }

    if (sinceId) {
      params.since_id = sinceId;
    }

    const data = await makeTwitterRequest(`/users/${userId}/tweets`, params);
    
    return {
      tweets: data.data || [],
      media: data.includes?.media || [],
      referencedTweets: data.includes?.tweets || []
    };
  } catch (error) {
    console.error(`Error getting tweets for user ${userId}:`, error);
    throw error;
  }
}

// =======================
// 🗄️ DATABASE FUNCTIONS
// =======================

async function getMonitoredAccounts() {
  try {
    return await db.collection(COLLECTIONS.TWITTER_ACCOUNTS)
      .find({ active: true })
      .toArray();
  } catch (error) {
    console.error('Error getting monitored accounts:', error);
    return [];
  }
}

async function addMonitoredAccount(username, targetChats, options = {}) {
  try {
    const cleanUsername = username.replace('@', '');
    const userInfo = await getUserId(cleanUsername);
    
    const accountData = {
      username: cleanUsername,
      userId: userInfo.id,
      displayName: userInfo.name,
      verified: userInfo.verified || false,
      targetChats: Array.isArray(targetChats) ? targetChats : [targetChats],
      filters: options.filters || [],
      excludeKeywords: options.excludeKeywords || [],
      active: true,
      lastChecked: new Date(),
      lastTweetId: null,
      totalTweetsSent: 0,
      createdAt: new Date(),
      addedBy: options.addedBy || 'system'
    };

    await db.collection(COLLECTIONS.TWITTER_ACCOUNTS).replaceOne(
      { username: cleanUsername },
      accountData,
      { upsert: true }
    );

    return { success: true, data: accountData };
  } catch (error) {
    console.error('Error adding monitored account:', error);
    return { success: false, error: error.message };
  }
}

async function removeMonitoredAccount(username) {
  try {
    const cleanUsername = username.replace('@', '');
    const result = await db.collection(COLLECTIONS.TWITTER_ACCOUNTS).updateOne(
      { username: cleanUsername },
      { 
        $set: { 
          active: false, 
          deactivatedAt: new Date() 
        } 
      }
    );
    return result.matchedCount > 0;
  } catch (error) {
    console.error('Error removing monitored account:', error);
    return false;
  }
}

async function isTweetSent(tweetId, targetChat) {
  try {
    const existing = await db.collection(COLLECTIONS.SENT_TWEETS).findOne({
      tweetId,
      targetChat
    });
    return !!existing;
  } catch (error) {
    console.error('Error checking if tweet was sent:', error);
    return false;
  }
}

async function markTweetSent(tweetId, targetChat, username, tweetData) {
  try {
    await db.collection(COLLECTIONS.SENT_TWEETS).insertOne({
      tweetId,
      targetChat,
      username,
      tweetText: tweetData.text?.substring(0, 200) || '',
      createdAt: new Date(tweetData.created_at),
      sentAt: new Date()
    });
    return true;
  } catch (error) {
    console.error('Error marking tweet as sent:', error);
    return false;
  }
}

// =======================
// 📱 MEDIA FUNCTIONS
// =======================

// Enhanced media download with retry
async function downloadMediaWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: twitterSettings.downloadTimeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*,video/*,*/*'
        }
      });
      
      return Buffer.from(response.data);
    } catch (error) {
      console.error(`Media download attempt ${i + 1} failed:`, error.message);
      
      if (i === maxRetries - 1) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
}

// Function to get best media URL
function getMediaDownloadUrl(mediaItem) {
  if (mediaItem.type === 'photo' && mediaItem.url) {
    return mediaItem.url.split('?')[0] + '?format=jpg&name=large';
  }
  
  if (mediaItem.type === 'video') {
    return mediaItem.url || mediaItem.preview_image_url;
  }
  
  return mediaItem.url;
}

// Send individual media item
async function sendMediaItem(sock, targetChat, mediaItem, username) {
  try {
    let mediaUrl = getMediaDownloadUrl(mediaItem);
    let caption = `📸 From @${username}`;

    switch (mediaItem.type) {
      case 'photo':
        if (!twitterSettings.enableImages) return;
        caption = `📸 Image from @${username}`;
        break;
        
      case 'video':
        if (!twitterSettings.enableVideos) return;
        caption = `🎥 Video from @${username}`;
        if (!mediaUrl && mediaItem.preview_image_url) {
          mediaUrl = mediaItem.preview_image_url;
          caption = `🎥 Video preview from @${username}`;
        }
        break;
        
      case 'animated_gif':
        if (!twitterSettings.enableVideos) return;
        caption = `🎬 GIF from @${username}`;
        break;
        
      default:
        console.log(`Unknown media type: ${mediaItem.type}`);
        return;
    }

    if (!mediaUrl) {
      console.log('No media URL found');
      return;
    }

    console.log(`📥 Downloading media: ${mediaUrl}`);
    const buffer = await downloadMediaWithRetry(mediaUrl);
    
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty media file received');
    }

    const fileType = await fileTypeFromBuffer(buffer);
    if (!fileType) {
      throw new Error('Could not detect file type');
    }

    const fileName = `twitter_media_${Date.now()}.${fileType.ext}`;
    let messageData = {};

    if (fileType.mime.startsWith('image/')) {
      messageData = {
        image: buffer,
        caption: caption,
        fileName: fileName
      };
    } else if (fileType.mime.startsWith('video/') || fileType.ext === 'mp4') {
      if (buffer.length > twitterSettings.maxVideoSize) {
        throw new Error('Video file too large for WhatsApp');
      }
      
      messageData = {
        video: buffer,
        caption: caption,
        fileName: fileName
      };
    } else if (fileType.ext === 'gif') {
      messageData = {
        video: buffer,
        caption: caption,
        fileName: fileName.replace('.gif', '.mp4'),
        gifPlayback: true
      };
    } else {
      messageData = {
        document: buffer,
        fileName: fileName,
        caption: caption,
        mimetype: fileType.mime
      };
    }

    await sock.sendMessage(targetChat, messageData);
    console.log(`✅ Sent ${fileType.mime} media to ${targetChat}`);

  } catch (error) {
    console.error('Error sending media item:', error);
    if (!twitterSettings.skipFailedMedia) {
      throw error;
    }
  }
}

// Enhanced message formatting and sending
async function formatAndSendTweetMessage(sock, targetChat, tweet, username, userDisplayName, media = []) {
  try {
    let content = tweet.text || '';
    
    if (content.length > twitterSettings.maxMessageLength) {
      content = content.substring(0, twitterSettings.maxMessageLength - 3) + '...';
    }

    const tweetUrl = `https://x.com/${username}/status/${tweet.id}`;

    let message = twitterSettings.messageTemplate
      .replace('{username}', username)
      .replace('{displayname}', userDisplayName)
      .replace('{content}', content)
      .replace('{url}', tweetUrl)
      .replace('{date}', moment(tweet.created_at).tz('Africa/Lagos').format('DD/MM/YYYY HH:mm'));

    if (tweet.public_metrics) {
      const metrics = tweet.public_metrics;
      message += `\n\n📊 ${metrics.like_count || 0} ❤️ | ${metrics.retweet_count || 0} 🔄 | ${metrics.reply_count || 0} 💬`;
    }

    // Send the text message first
    await sock.sendMessage(targetChat, { text: message });

    // Handle media if available
    if (media && media.length > 0) {
      const mediaToSend = media.slice(0, twitterSettings.maxMediaItems);
      
      for (const mediaItem of mediaToSend) {
        try {
          await sendMediaItem(sock, targetChat, mediaItem, username);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error sending media item:`, error);
          if (!twitterSettings.skipFailedMedia) {
            await sock.sendMessage(targetChat, { 
              text: `📎 Media: ${mediaItem.url || 'Media not available'}` 
            });
          }
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error formatting and sending tweet message:', error);
    
    // Fallback: send simple message
    const fallbackMessage = `🐦 New tweet from @${username}\n\n${tweet.text}\n\n${tweetUrl}`;
    await sock.sendMessage(targetChat, { text: fallbackMessage });
    return false;
  }
}

// =======================
// 📝 MESSAGE FORMATTING (Legacy function for compatibility)
// =======================

function formatTweetMessage(tweet, username, userDisplayName, media = []) {
  try {
    let content = tweet.text || '';
    
    if (content.length > twitterSettings.maxMessageLength) {
      content = content.substring(0, twitterSettings.maxMessageLength - 3) + '...';
    }

    const tweetUrl = `https://x.com/${username}/status/${tweet.id}`;

    let message = twitterSettings.messageTemplate
      .replace('{username}', username)
      .replace('{displayname}', userDisplayName)
      .replace('{content}', content)
      .replace('{url}', tweetUrl)
      .replace('{date}', moment(tweet.created_at).tz('Africa/Lagos').format('DD/MM/YYYY HH:mm'));

    if (media && media.length > 0 && twitterSettings.enableImages) {
      const imageMedia = media.filter(m => m.type === 'photo');
      const videoMedia = media.filter(m => m.type === 'video');
      
      if (imageMedia.length > 0) {
        message += `\n📸 ${imageMedia.length} image(s) attached`;
      }
      if (videoMedia.length > 0 && twitterSettings.enableVideos) {
        message += `\n🎥 ${videoMedia.length} video(s) attached`;
      }
    }

    if (tweet.public_metrics) {
      const metrics = tweet.public_metrics;
      message += `\n\n📊 ${metrics.like_count || 0} ❤️ | ${metrics.retweet_count || 0} 🔄 | ${metrics.reply_count || 0} 💬`;
    }

    return message;
  } catch (error) {
    console.error('Error formatting tweet message:', error);
    return `🐦 New tweet from @${username}\n\n${tweet.text}\n\nhttps://x.com/${username}/status/${tweet.id}`;
  }
}

function matchesFilters(tweet, filters, excludeKeywords) {
  try {
    const text = tweet.text?.toLowerCase() || '';
    
    if (excludeKeywords && excludeKeywords.length > 0) {
      const hasExcluded = excludeKeywords.some(keyword => 
        text.includes(keyword.toLowerCase())
      );
      if (hasExcluded) return false;
    }

    if (filters && filters.length > 0) {
      const hasRequired = filters.some(filter => 
        text.includes(filter.toLowerCase())
      );
      if (!hasRequired) return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking filters:', error);
    return true;
  }
}

// =======================
// 🔄 MONITORING FUNCTIONS
// =======================

async function checkForNewTweets(sock) {
  try {
    const accounts = await getMonitoredAccounts();
    
    if (accounts.length === 0) {
      return;
    }

    console.log(`🔍 Checking tweets for ${accounts.length} accounts...`);

    for (const account of accounts) {
      try {
        await new Promise(resolve => setTimeout(resolve, twitterSettings.rateLimitDelay));
        await checkAccountTweets(sock, account);
      } catch (error) {
        if (error.message.includes('Rate limit exceeded')) {
          console.error(`🚫 Rate limit hit while checking @${account.username}. Skipping remaining accounts for this cycle.`);
          break;
        }
        console.error(`Error checking tweets for @${account.username}:`, error.message);
        continue;
      }
    }
  } catch (error) {
    console.error('Error in checkForNewTweets:', error);
  }
}

// FIXED: Updated checkAccountTweets to use the enhanced media sending
async function checkAccountTweets(sock, account) {
  try {
    const { tweets, media } = await getUserTweets(account.userId, account.lastTweetId);
    
    if (!tweets || tweets.length === 0) {
      return;
    }

    console.log(`📝 Found ${tweets.length} new tweets for @${account.username}`);

    const sortedTweets = tweets.sort((a, b) => 
      new Date(a.created_at) - new Date(b.created_at)
    );

    for (const tweet of sortedTweets) {
      try {
        if (!matchesFilters(tweet, account.filters, account.excludeKeywords)) {
          console.log(`⏭️ Tweet ${tweet.id} filtered out`);
          continue;
        }

        for (const targetChat of account.targetChats) {
          try {
            if (await isTweetSent(tweet.id, targetChat)) {
              continue;
            }

            const tweetMedia = media?.filter(m => 
              tweet.attachments?.media_keys?.includes(m.media_key)
            ) || [];

            // Use the enhanced formatting and sending function
            await formatAndSendTweetMessage(
              sock, 
              targetChat, 
              tweet, 
              account.username, 
              account.displayName, 
              tweetMedia
            );

            await markTweetSent(tweet.id, targetChat, account.username, tweet);

            console.log(`✅ Sent tweet ${tweet.id} to ${targetChat} with ${tweetMedia.length} media items`);

            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            console.error(`Error sending tweet to ${targetChat}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error processing tweet ${tweet.id}:`, error);
      }
    }

    await db.collection(COLLECTIONS.TWITTER_ACCOUNTS).updateOne(
      { username: account.username },
      {
        $set: {
          lastChecked: new Date(),
          lastTweetId: sortedTweets[sortedTweets.length - 1].id
        },
        $inc: { totalTweetsSent: sortedTweets.length }
      }
    );

  } catch (error) {
    console.error(`Error checking account tweets for @${account.username}:`, error);
  }
}

let monitoringInterval = null;

function startMonitoring(sock) {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  console.log(`🤖 Starting Twitter monitoring (checking every ${twitterSettings.checkInterval / 1000}s)`);

  monitoringInterval = setInterval(() => {
    checkForNewTweets(sock);
  }, twitterSettings.checkInterval);

  setTimeout(() => checkForNewTweets(sock), 5000);
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('🛑 Twitter monitoring stopped');
  }
}

// =======================
// 🔐 AUTHORIZATION
// =======================

async function isAuthorized(sock, from, sender) {
  const ownerNumber = process.env.OWNER_NUMBER || '';
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  
  if (sender.split('@')[0] === ownerNumber || adminNumbers.includes(sender.split('@')[0])) {
    return true;
  }
  
  if (!twitterSettings.adminOnly) {
    return true;
  }
  
  try {
    if (!from.endsWith('@g.us')) return false;
    
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(participant => participant.admin === 'admin' || participant.admin === 'superadmin')
      .map(participant => participant.id);

    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking group admin:', error);
    return false;
  }
}

// =======================
// 📋 COMMAND HANDLERS (Keep all existing command handlers - they don't need changes)
// =======================

// Main plugin handler function
export default async function twitterHandler(m, sock, config) {
  try {
    if (!db) {
      await initDatabase();
      await loadSettings();
      
      if (TWITTER_CONFIG.bearerToken) {
        startMonitoring(sock);
      } else {
        console.log('⚠️ Twitter Bearer Token not configured - monitoring disabled');
      }
    }
    
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    
    const reply = async (text) => {
      await sock.sendMessage(from, { text }, { quoted: m });
    };
    
    switch (command) {
      case 'twitter':
      case 'tw':
      case 'x':
        if (args.length === 1) {
          await showTwitterMenu(reply, config.PREFIX);
        } else {
          await handleSubCommand(args[1], args.slice(2), { m, sock, config, senderId, from, reply });
        }
        break;
        
      case 'twitteradd':
      case 'twadd':
        await handleAddAccount({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'twitterremove':
      case 'twremove':
        await handleRemoveAccount({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'twitterlist':
      case 'twlist':
        await handleListAccounts({ m, sock, config, senderId, from, reply });
        break;
    }
  } catch (error) {
    console.error('❌ Twitter plugin error:', error);
  }
}

// All the command handler functions remain the same - just keeping them for completeness
async function handleSubCommand(subCommand, args, context) {
  switch (subCommand.toLowerCase()) {
    case 'add':
      await handleAddAccount(context, args);
      break;
    case 'remove':
    case 'delete':
      await handleRemoveAccount(context, args);
      break;
    case 'list':
      await handleListAccounts(context);
      break;
    case 'settings':
      await handleSettings(context, args);
      break;
    case 'status':
      await handleStatus(context);
      break;
    case 'test':
      await handleTest(context, args);
      break;
    case 'help':
      await showTwitterMenu(context.reply, context.config.PREFIX);
      break;
    default:
      await context.reply(`❓ Unknown Twitter command: *${subCommand}*\n\nUse *${context.config.PREFIX}twitter help* to see available commands.`);
  }
}

async function showTwitterMenu(reply, prefix) {
  const menuText = `🐦 *TWITTER INTEGRATION* 🐦\n\n` +
                  `📊 *User Commands:*\n` +
                  `• *add @username* - Monitor Twitter account\n` +
                  `• *remove @username* - Stop monitoring account\n` +
                  `• *list* - View monitored accounts\n` +
                  `• *status* - Check monitoring status\n\n` +
                  `👑 *Admin Commands:*\n` +
                  `• *settings* - View/modify settings\n` +
                  `• *test @username* - Test account monitoring\n\n` +
                  `🤖 *Auto-Monitoring:*\n` +
                  `New tweets from monitored accounts will be automatically sent to this chat!\n\n` +
                  `💡 *Usage:* ${prefix}twitter [command]`;
  
  await reply(menuText);
}

async function handleAddAccount(context, args) {
  const { reply, senderId, sock, from } = context;
  
  const isAuthorizedUser = await isAuthorized(sock, from, senderId);
  if (!isAuthorizedUser) {
    await reply('🚫 Only admins can add Twitter accounts to monitor.');
    return;
  }
  
  if (args.length === 0) {
    await reply(`📝 *Add Twitter Account*\n\nUsage: ${context.config.PREFIX}twitter add @username\n\nExample: ${context.config.PREFIX}twitter add @elonmusk\n\n💡 The account will be monitored for new tweets in this chat.`);
    return;
  }
  
  const username = args[0].replace('@', '');
  
  try {
    await reply(`⏳ Adding @${username} to monitoring list...`);
    
    const result = await addMonitoredAccount(username, [from], {
      addedBy: senderId
    });
    
    if (result.success) {
      const account = result.data;
      let successMessage = `✅ *Successfully added @${account.username}*\n\n`;
      successMessage += `👤 Display Name: ${account.displayName}\n`;
      successMessage += `✅ Verified: ${account.verified ? 'Yes' : 'No'}\n`;
      successMessage += `📍 Target Chat: This chat\n`;
      successMessage += `📊 Status: Active\n\n`;
      successMessage += `🤖 *New tweets will be automatically sent here!*`;
      
      await reply(successMessage);
    } else {
      await reply(`❌ *Failed to add @${username}*\n\nError: ${result.error}\n\n💡 Make sure the username is correct and the account exists.`);
    }
  } catch (error) {
    await reply(`❌ *Error adding Twitter account*\n\nPlease try again later.`);
    console.error('Add account error:', error);
  }
}

async function handleRemoveAccount(context, args) {
  const { reply, senderId, sock, from } = context;
  
  const isAuthorizedUser = await isAuthorized(sock, from, senderId);
  if (!isAuthorizedUser) {
    await reply('🚫 Only admins can remove Twitter accounts from monitoring.');
    return;
  }
  
  if (args.length === 0) {
    await reply(`📝 *Remove Twitter Account*\n\nUsage: ${context.config.PREFIX}twitter remove @username\n\nExample: ${context.config.PREFIX}twitter remove @elonmusk`);
    return;
  }
  
  const username = args[0].replace('@', '');
  
  try {
    const success = await removeMonitoredAccount(username);
    
    if (success) {
      await reply(`✅ *Successfully removed @${username}*\n\n🚫 This account is no longer being monitored.`);
    } else {
      await reply(`❌ *Account @${username} not found*\n\nUse *${context.config.PREFIX}twitter list* to see monitored accounts.`);
    }
  } catch (error) {
    await reply(`❌ *Error removing Twitter account*\n\nPlease try again later.`);
    console.error('Remove account error:', error);
  }
}

async function handleListAccounts(context) {
  const { reply } = context;
  
  try {
    const accounts = await getMonitoredAccounts();
    
    if (accounts.length === 0) {
      await reply(`📋 *No Twitter Accounts Monitored*\n\nUse *${context.config.PREFIX}twitter add @username* to start monitoring accounts.`);
      return;
    }
    
    let listMessage = `📋 *MONITORED TWITTER ACCOUNTS* 📋\n\n`;
    listMessage += `📊 Total accounts: ${accounts.length}\n\n`;
    
    accounts.forEach((account, index) => {
      listMessage += `${index + 1}. @${account.username}\n`;
      listMessage += `   👤 ${account.displayName}\n`;
      listMessage += `   ✅ Verified: ${account.verified ? 'Yes' : 'No'}\n`;
      listMessage += `   📊 Tweets sent: ${account.totalTweetsSent || 0}\n`;
      listMessage += `   ⏰ Last checked: ${moment(account.lastChecked).tz('Africa/Lagos').format('DD/MM/YYYY HH:mm')}\n`;
      listMessage += `   📍 Chats: ${account.targetChats.length}\n\n`;
    });
    
    listMessage += `💡 *Use ${context.config.PREFIX}twitter remove @username to stop monitoring*`;
    
    await reply(listMessage);
  } catch (error) {
    await reply(`❌ *Error loading monitored accounts*\n\nPlease try again later.`);
    console.error('List accounts error:', error);
  }
}

async function handleSettings(context, args) {
  const { reply, senderId, sock, from } = context;
  
  const isAuthorizedUser = await isAuthorized(sock, from, senderId);
  if (!isAuthorizedUser) {
    await reply('🚫 Only admins can modify Twitter settings.');
    return;
  }
  
  try {
    if (args.length === 0) {
      let settingsMessage = `⚙️ *TWITTER SETTINGS* ⚙️\n\n`;
      settingsMessage += `⏰ Check Interval: ${twitterSettings.checkInterval / 1000}s\n`;
      settingsMessage += `📊 Max Tweets/Check: ${twitterSettings.maxTweetsPerCheck}\n`;
      settingsMessage += `💬 Include Replies: ${twitterSettings.includeReplies ? 'Yes ✅' : 'No ❌'}\n`;
      settingsMessage += `🔄 Include Retweets: ${twitterSettings.includeRetweets ? 'Yes ✅' : 'No ❌'}\n`;
      settingsMessage += `📸 Enable Images: ${twitterSettings.enableImages ? 'Yes ✅' : 'No ❌'}\n`;
      settingsMessage += `🎥 Enable Videos: ${twitterSettings.enableVideos ? 'Yes ✅' : 'No ❌'}\n`;
      settingsMessage += `📏 Max Message Length: ${twitterSettings.maxMessageLength}\n`;
      settingsMessage += `👑 Admin Only: ${twitterSettings.adminOnly ? 'Yes ✅' : 'No ❌'}\n\n`;
      settingsMessage += `*📋 Setting Commands:*\n`;
      settingsMessage += `• \`${context.config.PREFIX}twitter settings interval 300\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}twitter settings replies on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}twitter settings retweets on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}twitter settings adminonly on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}twitter settings maxlength 1000\``;
      
      await reply(settingsMessage);
      return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args[1];
    
    let responseText = "";
    
    switch (setting) {
      case 'interval':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid interval. Use: ${context.config.PREFIX}twitter settings interval 900`;
        } else {
          const seconds = parseInt(value);
          if (seconds < 300) {
            responseText = `⚠️ Minimum interval is 300 seconds (5 minutes) to avoid rate limits. Recommended: 900s (15 min).`;
          } else {
            twitterSettings.checkInterval = seconds * 1000;
            await saveSettings();
            responseText = `✅ Check interval set to ${seconds} seconds`;
            
            if (monitoringInterval) {
              stopMonitoring();
              startMonitoring(context.sock);
            }
          }
        }
        break;
        
      case 'replies':
        if (value === 'on' || value === 'true' || value === 'yes') {
          twitterSettings.includeReplies = true;
          await saveSettings();
          responseText = "✅ Reply tweets will now be included";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          twitterSettings.includeReplies = false;
          await saveSettings();
          responseText = "✅ Reply tweets will be excluded";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}twitter settings replies on/off`;
        }
        break;
        
      case 'retweets':
        if (value === 'on' || value === 'true' || value === 'yes') {
          twitterSettings.includeRetweets = true;
          await saveSettings();
          responseText = "✅ Retweets will now be included";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          twitterSettings.includeRetweets = false;
          await saveSettings();
          responseText = "✅ Retweets will be excluded";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}twitter settings retweets on/off`;
        }
        break;
        
      case 'adminonly':
        if (value === 'on' || value === 'true' || value === 'yes') {
          twitterSettings.adminOnly = true;
          await saveSettings();
          responseText = "✅ Admin-only mode enabled\n\n*Only admins can add/remove Twitter accounts.*";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          twitterSettings.adminOnly = false;
          await saveSettings();
          responseText = "✅ Admin-only mode disabled\n\n*All users can now add/remove Twitter accounts.*";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}twitter settings adminonly on/off`;
        }
        break;
        
      case 'maxlength':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid length. Use: ${context.config.PREFIX}twitter settings maxlength 1000`;
        } else {
          const length = parseInt(value);
          if (length < 100 || length > 4000) {
            responseText = `⚠️ Message length must be between 100 and 4000 characters.`;
          } else {
            twitterSettings.maxMessageLength = length;
            await saveSettings();
            responseText = `✅ Maximum message length set to ${length} characters`;
          }
        }
        break;
        
      case 'maxtweets':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid number. Use: ${context.config.PREFIX}twitter settings maxtweets 10`;
        } else {
          const count = parseInt(value);
          if (count < 1 || count > 50) {
            responseText = `⚠️ Max tweets must be between 1 and 50.`;
          } else {
            twitterSettings.maxTweetsPerCheck = count;
            await saveSettings();
            responseText = `✅ Maximum tweets per check set to ${count}`;
          }
        }
        break;
        
      default:
        responseText = "⚠️ Unknown setting. Available options:\n• interval\n• replies\n• retweets\n• adminonly\n• maxlength\n• maxtweets";
    }
    
    await reply(responseText);
  } catch (error) {
    await reply('❌ *Error updating settings. Please try again.*');
    console.error('Settings error:', error);
  }
}

async function handleStatus(context) {
  const { reply } = context;
  
  try {
    const accounts = await getMonitoredAccounts();
    const totalSentTweets = await db.collection(COLLECTIONS.SENT_TWEETS).countDocuments();
    
    let statusMessage = `📊 *TWITTER MONITORING STATUS* 📊\n\n`;
    statusMessage += `🤖 Monitoring: ${monitoringInterval ? 'Active ✅' : 'Inactive ❌'}\n`;
    statusMessage += `📋 Monitored accounts: ${accounts.length}\n`;
    statusMessage += `📊 Total tweets sent: ${totalSentTweets}\n`;
    statusMessage += `⏰ Check interval: ${twitterSettings.checkInterval / 1000}s\n`;
    statusMessage += `🔑 API configured: ${TWITTER_CONFIG.bearerToken ? 'Yes ✅' : 'No ❌'}\n`;
    statusMessage += `📸 Images enabled: ${twitterSettings.enableImages ? 'Yes ✅' : 'No ❌'}\n`;
    statusMessage += `🎥 Videos enabled: ${twitterSettings.enableVideos ? 'Yes ✅' : 'No ❌'}\n\n`;
    
    if (!TWITTER_CONFIG.bearerToken) {
      statusMessage += `⚠️ *Twitter API not configured*\n`;
      statusMessage += `Please set TWITTER_BEARER_TOKEN environment variable.`;
    } else if (accounts.length === 0) {
      statusMessage += `💡 *No accounts being monitored*\n`;
      statusMessage += `Use *${context.config.PREFIX}twitter add @username* to start monitoring.`;
    } else {
      statusMessage += `🎉 *Everything is working properly!*\n`;
      statusMessage += `📱 *Media files will be sent directly to chat!*`;
    }
    
    await reply(statusMessage);
  } catch (error) {
    await reply('❌ *Error loading status. Please try again.*');
    console.error('Status error:', error);
  }
}

async function handleTest(context, args) {
  const { reply, senderId, sock, from } = context;
  
  const isAuthorizedUser = await isAuthorized(sock, from, senderId);
  if (!isAuthorizedUser) {
    await reply('🚫 Only admins can test Twitter monitoring.');
    return;
  }
  
  if (args.length === 0) {
    await reply(`🔍 *Test Twitter Account*\n\nUsage: ${context.config.PREFIX}twitter test @username\n\nThis will fetch the latest tweets from the account without sending them to chat.`);
    return;
  }
  
  const username = args[0].replace('@', '');
  
  try {
    await reply(`⏳ Testing @${username}...`);
    
    const userInfo = await getUserId(username);
    const { tweets, media } = await getUserTweets(userInfo.id);
    
    let testMessage = `🔍 *Test Results for @${username}* 🔍\n\n`;
    testMessage += `👤 Display Name: ${userInfo.name}\n`;
    testMessage += `✅ Verified: ${userInfo.verified ? 'Yes' : 'No'}\n`;
    testMessage += `📊 Recent tweets found: ${tweets?.length || 0}\n`;
    testMessage += `📸 Media items found: ${media?.length || 0}\n\n`;
    
    if (tweets && tweets.length > 0) {
      testMessage += `📝 *Latest Tweet:*\n`;
      const latestTweet = tweets[0];
      const tweetMedia = media?.filter(m => 
        latestTweet.attachments?.media_keys?.includes(m.media_key)
      ) || [];
      
      const formattedMessage = formatTweetMessage(latestTweet, username, userInfo.name, tweetMedia);
      testMessage += `\n${formattedMessage}\n\n`;
      
      if (tweetMedia.length > 0) {
        testMessage += `📱 *Media found:*\n`;
        tweetMedia.forEach((mediaItem, index) => {
          testMessage += `${index + 1}. ${mediaItem.type} - ${mediaItem.url ? 'URL available' : 'No URL'}\n`;
        });
        testMessage += `\n✅ *Account has media content that will be sent directly!*`;
      } else {
        testMessage += `✅ *Account is accessible and has recent tweets.*`;
      }
    } else {
      testMessage += `⚠️ *No recent tweets found.*\nThis might be a private account or has no recent activity.`;
    }
    
    await reply(testMessage);
  } catch (error) {
    await reply(`❌ *Test failed for @${username}*\n\nError: ${error.message}\n\n💡 Make sure the username is correct and the account exists.`);
    console.error('Test error:', error);
  }
}

// =======================
// 🔄 PLUGIN LIFECYCLE
// =======================

export async function initPlugin(sock) {
  try {
    await initDatabase();
    await loadSettings();
    
    if (TWITTER_CONFIG.bearerToken) {
      startMonitoring(sock);
      console.log('✅ Twitter plugin initialized successfully with enhanced media support');
    } else {
      console.log('⚠️ Twitter plugin loaded but API not configured');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Twitter plugin:', error);
  }
}

export async function cleanupPlugin() {
  try {
    stopMonitoring();
    
    if (mongoClient) {
      await mongoClient.close();
      mongoClient = null;
      db = null;
    }
    
    console.log('✅ Twitter plugin cleaned up successfully');
  } catch (error) {
    console.error('❌ Error cleaning up Twitter plugin:', error);
  }
}

// Export functions for use by other plugins
export { 
  addMonitoredAccount,
  removeMonitoredAccount,
  getMonitoredAccounts,
  twitterSettings,
  checkForNewTweets,
  startMonitoring,
  stopMonitoring,
  formatAndSendTweetMessage,
  sendMediaItem
};
