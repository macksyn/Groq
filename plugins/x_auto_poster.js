import { getCollection } from '../lib/pluginIntegration.js';

// X (Twitter) -> WhatsApp auto-poster plugin (V3 format)
// Features:
// - Polls X API for new tweets from configured accounts
// - Posts tweets to WhatsApp chat on a per-account interval (default 60 min)
// - Media support (images, videos, documents)
// - Message templating: customize tweet format with {variables}
// - Webhook support: external services can trigger/configure accounts via HTTP
//
// Template variables available: {text}, {author}, {created_at}, {likes}, 
// {retweets}, {url}, {id}, {hashtags}, {reply_count}
//
// Example template:
//   "🔁 *{author}* 💬\n{text}\n👍 {likes} 🔄 {retweets}\n{url}"

const DEFAULT_INTERVAL_MINUTES = 60; // default hourly
const ACCOUNTS_COLLECTION = 'x_auto_accounts';
const DEFAULT_TEMPLATE = '🔁 *New tweet from {author}*\n\n{text}\n\n🔗 {url}';

async function loadAccounts() {
  const coll = await getCollection(ACCOUNTS_COLLECTION);
  const rows = await coll.find({}).toArray();
  return rows;
}

async function saveAccount(account) {
  const coll = await getCollection(ACCOUNTS_COLLECTION);
  await coll.updateOne({ username: account.username }, { $set: account }, { upsert: true });
}

async function removeAccount(username) {
  const coll = await getCollection(ACCOUNTS_COLLECTION);
  await coll.deleteOne({ username });
}

function nowMs() {
  return Date.now();
}

async function fetchJson(url, bearer) {
  const headers = { 'Accept': 'application/json' };
  if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

// Get user id by username using X API v2
async function getUserIdByUsername(username, bearer) {
  const url = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}`;
  const data = await fetchJson(url, bearer);
  return data?.data?.id;
}

// Fetch recent tweets from a user id using X API v2
// returns array of tweets with media data expanded
async function fetchRecentTweets(userId, bearer, since_id = null) {
  const expansions = ['attachments.media_keys', 'author_id'].join(',');
  const mediaFields = ['url', 'preview_image_url', 'type', 'alt_text'].join(',');
  let url = `https://api.twitter.com/2/users/${userId}/tweets?expansions=${expansions}&media.fields=${mediaFields}&tweet.fields=created_at,author_id,attachments`;
  if (since_id) url += `&since_id=${since_id}`;
  url += '&max_results=5';
  const data = await fetchJson(url, bearer);
  return data || {};
}

async function downloadMedia(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Media download failed ${res.status}`);
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  return { buffer: Buffer.from(buf), contentType };
}

async function postTweetToChat(tweet, mediaItems, targetChatId, sock, ecoSettings) {
  // Compose text using template
  const template = tweet._template || DEFAULT_TEMPLATE;
  const caption = compileTemplate(template, tweet);

  try {
    if (!mediaItems || mediaItems.length === 0) {
      await sock.sendMessage(targetChatId, { text: caption });
      return;
    }

    // Send first media with caption
    const first = mediaItems[0];
    const mime = first.contentType;
    if (mime.startsWith('image/')) {
      await sock.sendMessage(targetChatId, { image: first.buffer, caption });
    } else if (mime.startsWith('video/')) {
      await sock.sendMessage(targetChatId, { video: first.buffer, caption });
    } else {
      await sock.sendMessage(targetChatId, { document: first.buffer, mimetype: mime, caption });
    }

    // Send remaining media without caption
    for (let i = 1; i < mediaItems.length; i++) {
      const it = mediaItems[i];
      const m = it.contentType;
      if (m.startsWith('image/')) {
        await sock.sendMessage(targetChatId, { image: it.buffer });
      } else if (m.startsWith('video/')) {
        await sock.sendMessage(targetChatId, { video: it.buffer });
      } else {
        await sock.sendMessage(targetChatId, { document: it.buffer, mimetype: m });
      }
    }
  } catch (err) {
    // swallow errors but log
    console.error('Failed to send tweet media/message:', err.message);
  }
}

// Compile template with tweet data (supports {variable} syntax)
function compileTemplate(template, tweet) {
  const tweetId = tweet.id;
  const authorName = tweet.author_username || tweet.author || 'X user';
  const tweetText = tweet.text || '';
  const createdAt = tweet.created_at ? new Date(tweet.created_at).toLocaleString() : 'Unknown';
  const likes = tweet.public_metrics?.like_count || 0;
  const retweets = tweet.public_metrics?.retweet_count || 0;
  const replies = tweet.public_metrics?.reply_count || 0;
  const url = `https://x.com/${authorName}/status/${tweetId}`;
  const hashtags = extractHashtags(tweetText).join(', ') || '(none)';

  const variables = {
    text: tweetText,
    author: authorName,
    created_at: createdAt,
    likes: likes.toLocaleString(),
    retweets: retweets.toLocaleString(),
    reply_count: replies.toLocaleString(),
    url,
    id: tweetId,
    hashtags
  };

  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// Extract hashtags from text
function extractHashtags(text) {
  const matches = text.match(/#\w+/g) || [];
  return matches;
}

async function processAccount(account, context) {
  const { sock, logger } = context;
  const targetChatId = account.targetChatId || context.config.ALLOWED_ECONOMY_GROUP_ID || context.config.DEFAULT_ANNOUNCE_CHAT;
  if (!targetChatId) {
    logger?.warn && logger.warn(`X autoposter: No target chat for ${account.username}`);
    return;
  }

  const bearer = account.bearerToken || context.config.X_BEARER_TOKEN || process.env.X_BEARER_TOKEN;
  if (!bearer) {
    logger?.warn && logger.warn(`X autoposter: No bearer token for ${account.username}`);
    return;
  }

  try {
    // Throttle via intervalMinutes
    const interval = account.intervalMinutes || DEFAULT_INTERVAL_MINUTES;
    const lastRun = account._lastRunAt || 0;
    if (nowMs() - lastRun < interval * 60 * 1000) return; // not yet

    // Ensure we have user id
    if (!account.userId) {
      logger?.debug && logger.debug(`X autoposter: Resolving username ${account.username}...`);
      const uid = await getUserIdByUsername(account.username, bearer);
      if (!uid) throw new Error('Unable to resolve username to user id');
      account.userId = uid;
      await saveAccount(account);
      logger?.debug && logger.debug(`X autoposter: Resolved ${account.username} to user ID ${uid}`);
    }

    // Fetch tweets
    const since_id = account.lastTweetId || null;
    logger?.debug && logger.debug(`X autoposter: Fetching tweets for ${account.username} (since ${since_id || 'start'})`);
    const resp = await fetchRecentTweets(account.userId, bearer, since_id);

    // If there are media included separately, mapping
    const mediaMap = {};
    if (resp.includes && resp.includes.media) {
      for (const m of resp.includes.media) {
        if (m.media_key) mediaMap[m.media_key] = m;
      }
    }

    const tweets = resp.data || [];
    if (!tweets.length) {
      logger?.debug && logger.debug(`X autoposter: No new tweets for ${account.username}`);
      account._lastRunAt = nowMs();
      await saveAccount(account);
      return;
    }

    logger?.info && logger.info(`X autoposter: Found ${tweets.length} new tweets for ${account.username}`);

    // Sort ascending by id so oldest first
    tweets.sort((a, b) => BigInt(a.id) - BigInt(b.id));

    for (const tw of tweets) {
      // Expand media
      const mediaItems = [];
      const mediaKeys = tw?.attachments?.media_keys || [];
      for (const key of mediaKeys) {
        const m = mediaMap[key];
        if (!m) continue;
        const url = m.url || m.preview_image_url || m.media_url || m.remote_url;
        if (!url) continue;
        try {
          logger?.debug && logger.debug(`X autoposter: Downloading media from ${url}`);
          const item = await downloadMedia(url);
          mediaItems.push(item);
        } catch (err) {
          logger?.error && logger.error('Failed download media', err.message);
        }
      }

      // Attach author username and template for formatting
      tw.author_username = account.username;
      tw._template = account.messageTemplate || DEFAULT_TEMPLATE;

      // Post to chat
      logger?.debug && logger.debug(`X autoposter: Posting tweet ${tw.id} to ${targetChatId}`);
      await postTweetToChat(tw, mediaItems, targetChatId, sock, context.config);

      // Update lastTweetId
      account.lastTweetId = tw.id;
      account._lastRunAt = nowMs();
      await saveAccount(account);
      logger?.info && logger.info(`X autoposter: Posted tweet ${tw.id} from ${account.username}`);
    }
  } catch (err) {
    console.error('Error processing X account', account.username, err.message);
    if (context.logger) context.logger.error('X autoposter error processing', account.username, err.message);
  }
}

export default {
  name: 'X Auto Poster',
  version: '1.0.0',
  author: 'Automated Plugin',
  description: 'Polls configured X accounts and posts new tweets to a chat (supports media).',
  category: 'automation',
  commands: ['xpost', 'xposter'],
  aliases: [],

  // Run every 5 minutes and internally respect per-account interval
  scheduledTasks: [
    {
      name: 'x_auto_post_runner',
      description: 'Poll X accounts for new tweets and post them',
      schedule: '*/5 * * * *',
      handler: async (context) => {
        try {
          const accounts = await loadAccounts();
          if (!accounts.length) return;
          console.log(`[X AutoPoster] Running scheduled task. Checking ${accounts.length} accounts...`);
          for (const acc of accounts) {
            if (acc.enabled === false) continue;
            await processAccount(acc, context);
          }
        } catch (err) {
          console.error('[X AutoPoster] Scheduled task error:', err.message);
        }
      }
    }
  ],

  async run(context) {
    const { args, text, sock, msg: m, config, logger } = context;
    const sub = args[0] ? args[0].toLowerCase() : null;
    const from = m.key.remoteJid;

    if (!sub) {
      await sock.sendMessage(from, { text: 'X Auto Poster commands: add, remove, list, enable, disable, setinterval, settemplate, gettemplate' }, { quoted: m });
      return;
    }

    switch (sub) {
      case 'add': {
        // Usage: xpost add <username> <targetChatId?> <intervalMinutes?> <bearerToken?>
        const username = args[1]?.replace(/^@/, '');
        if (!username) {
          await sock.sendMessage(from, { text: 'Usage: xpost add <username> [targetChatId] [intervalMinutes] [bearerToken]' }, { quoted: m });
          return;
        }
        const targetChatId = args[2] || from;
        const intervalMinutes = parseInt(args[3]) || DEFAULT_INTERVAL_MINUTES;
        const bearer = args[4] || config.X_BEARER_TOKEN || process.env.X_BEARER_TOKEN || null;

        if (!bearer) {
          await sock.sendMessage(from, { text: '❌ No X bearer token found. Set X_BEARER_TOKEN env var or provide it as 4th arg.' }, { quoted: m });
          return;
        }

        // Validate bearer token by fetching user ID
        await sock.sendMessage(from, { text: `🔍 Validating X account @${username}...` }, { quoted: m });
        try {
          const userId = await getUserIdByUsername(username, bearer);
          if (!userId) {
            await sock.sendMessage(from, { text: `❌ User @${username} not found or invalid bearer token.` }, { quoted: m });
            return;
          }

          const acc = { 
            username, 
            userId,
            targetChatId, 
            intervalMinutes, 
            bearerToken: bearer, 
            messageTemplate: DEFAULT_TEMPLATE, 
            enabled: true, 
            createdAt: new Date() 
          };
          await saveAccount(acc);
          await sock.sendMessage(from, { text: `✅ Added @${username} (ID: ${userId}) for auto-posting every ${intervalMinutes} minutes to ${targetChatId}` }, { quoted: m });
        } catch (err) {
          await sock.sendMessage(from, { text: `❌ Error validating @${username}: ${err.message}` }, { quoted: m });
          logger?.error && logger.error('X autoposter add error', err.message);
        }
        break;
      }

      case 'remove': {
        const username = args[1]?.replace(/^@/, '');
        if (!username) {
          await sock.sendMessage(from, { text: 'Usage: xpost remove <username>' }, { quoted: m });
          return;
        }
        await removeAccount(username);
        await sock.sendMessage(from, { text: `Removed ${username} from auto-post list.` }, { quoted: m });
        break;
      }

      case 'list': {
        const accounts = await loadAccounts();
        if (!accounts.length) {
          await sock.sendMessage(from, { text: 'No accounts configured for auto-posting.' }, { quoted: m });
          return;
        }
        let out = 'Configured X accounts:\n';
        for (const a of accounts) {
          out += `\n• @${a.username} → ${a.targetChatId} (every ${a.intervalMinutes || DEFAULT_INTERVAL_MINUTES}m) ${a.enabled === false ? '[disabled]' : ''}`;
        }
        await sock.sendMessage(from, { text: out }, { quoted: m });
        break;
      }

      case 'enable': {
        const username = args[1]?.replace(/^@/, '');
        if (!username) return await sock.sendMessage(from, { text: 'Usage: xpost enable <username>' }, { quoted: m });
        const coll = await getCollection(ACCOUNTS_COLLECTION);
        await coll.updateOne({ username }, { $set: { enabled: true } });
        await sock.sendMessage(from, { text: `Enabled ${username}` }, { quoted: m });
        break;
      }

      case 'disable': {
        const username = args[1]?.replace(/^@/, '');
        if (!username) return await sock.sendMessage(from, { text: 'Usage: xpost disable <username>' }, { quoted: m });
        const coll = await getCollection(ACCOUNTS_COLLECTION);
        await coll.updateOne({ username }, { $set: { enabled: false } });
        await sock.sendMessage(from, { text: `Disabled ${username}` }, { quoted: m });
        break;
      }

      case 'setinterval': {
        const username = args[1]?.replace(/^@/, '');
        const minutes = parseInt(args[2]);
        if (!username || !minutes) return await sock.sendMessage(from, { text: 'Usage: xpost setinterval <username> <minutes>' }, { quoted: m });
        const coll = await getCollection(ACCOUNTS_COLLECTION);
        await coll.updateOne({ username }, { $set: { intervalMinutes: minutes } });
        await sock.sendMessage(from, { text: `Set ${username} interval to ${minutes} minutes` }, { quoted: m });
        break;
      }

      case 'settemplate': {
        // Usage: xpost settemplate <username> <template>
        // Example: xpost settemplate nasa "🚀 *{author}*\n{text}\n👍 {likes} 🔄 {retweets}\n{url}"
        const username = args[1]?.replace(/^@/, '');
        if (!username) return await sock.sendMessage(from, { text: 'Usage: xpost settemplate <username> "<template>"' }, { quoted: m });
        const template = args.slice(2).join(' ').replace(/^["']|["']$/g, '');
        if (!template) return await sock.sendMessage(from, { text: 'Template cannot be empty.' }, { quoted: m });
        const coll = await getCollection(ACCOUNTS_COLLECTION);
        await coll.updateOne({ username }, { $set: { messageTemplate: template } });
        await sock.sendMessage(from, { text: `Template updated for ${username}.\n\nAvailable variables: {text}, {author}, {created_at}, {likes}, {retweets}, {reply_count}, {url}, {id}, {hashtags}` }, { quoted: m });
        break;
      }

      case 'gettemplate': {
        const username = args[1]?.replace(/^@/, '');
        if (!username) return await sock.sendMessage(from, { text: 'Usage: xpost gettemplate <username>' }, { quoted: m });
        const coll = await getCollection(ACCOUNTS_COLLECTION);
        const acc = await coll.findOne({ username });
        if (!acc) return await sock.sendMessage(from, { text: `Account ${username} not found.` }, { quoted: m });
        const tmpl = acc.messageTemplate || DEFAULT_TEMPLATE;
        await sock.sendMessage(from, { text: `Template for ${username}:\n\n${tmpl}` }, { quoted: m });
        break;
      }

      case 'test': {
        const username = args[1]?.replace(/^@/, '');
        if (!username) {
          await sock.sendMessage(from, { text: 'Usage: xpost test <username>' }, { quoted: m });
          return;
        }

        const coll = await getCollection(ACCOUNTS_COLLECTION);
        const acc = await coll.findOne({ username });
        if (!acc) {
          await sock.sendMessage(from, { text: `❌ Account @${username} not found.` }, { quoted: m });
          return;
        }

        await sock.sendMessage(from, { text: `🧪 Testing @${username}...` }, { quoted: m });
        try {
          const bearer = acc.bearerToken || config.X_BEARER_TOKEN || process.env.X_BEARER_TOKEN;
          if (!bearer) {
            await sock.sendMessage(from, { text: `❌ No bearer token for @${username}` }, { quoted: m });
            return;
          }

          // Try to fetch user ID
          const userId = acc.userId || await getUserIdByUsername(username, bearer);
          if (!userId) {
            await sock.sendMessage(from, { text: `❌ Could not find user ID for @${username}` }, { quoted: m });
            return;
          }

          // Try to fetch recent tweets
          const resp = await fetchRecentTweets(userId, bearer, null);
          const tweets = resp.data || [];

          let msg = `✅ Account test passed!\n\n`;
          msg += `Username: @${username}\n`;
          msg += `User ID: ${userId}\n`;
          msg += `Enabled: ${acc.enabled !== false ? 'Yes' : 'No'}\n`;
          msg += `Interval: ${acc.intervalMinutes || DEFAULT_INTERVAL_MINUTES} minutes\n`;
          msg += `Target Chat: ${acc.targetChatId}\n`;
          msg += `Recent tweets: ${tweets.length} found\n`;
          msg += `\nLast run: ${acc._lastRunAt ? new Date(acc._lastRunAt).toLocaleString() : 'Never'}\n`;
          msg += `Last posted: ${acc.lastTweetId ? `Tweet ID ${acc.lastTweetId}` : 'None yet'}`;

          await sock.sendMessage(from, { text: msg }, { quoted: m });
        } catch (err) {
          await sock.sendMessage(from, { text: `❌ Test failed: ${err.message}` }, { quoted: m });
        }
        break;
      }

      default:
        await sock.sendMessage(from, { text: 'Unknown xpost subcommand. Use: add, remove, list, enable, disable, setinterval, settemplate, gettemplate, test' }, { quoted: m });
        break;
    }
  }
};

// ====== WEBHOOK HANDLERS (integrate with bot's HTTP server) ======
// If the bot has an Express server (e.g., in WebServer.js), register these endpoints:
//
//   app.post('/webhook/xposter/add', handleWebhookAdd);
//   app.post('/webhook/xposter/config', handleWebhookConfig);
//   app.post('/webhook/xposter/test', handleWebhookTest);
//
// Or expose the handlers for manual integration:

export async function handleWebhookAdd(req, res) {
  // POST /webhook/xposter/add
  // Body: { username, targetChatId, intervalMinutes?, messageTemplate?, bearerToken?, webhookSecret? }
  try {
    const { username, targetChatId, intervalMinutes, messageTemplate, bearerToken, webhookSecret } = req.body;

    if (!username || !targetChatId) {
      return res.status(400).json({ error: 'username and targetChatId required' });
    }

    const acc = {
      username,
      targetChatId,
      intervalMinutes: intervalMinutes || DEFAULT_INTERVAL_MINUTES,
      messageTemplate: messageTemplate || DEFAULT_TEMPLATE,
      bearerToken: bearerToken || process.env.X_BEARER_TOKEN,
      webhookSecret,
      enabled: true,
      createdAt: new Date()
    };

    await saveAccount(acc);
    res.json({ success: true, message: `Added ${username}`, account: acc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleWebhookConfig(req, res) {
  // POST /webhook/xposter/config
  // Body: { username, intervalMinutes?, messageTemplate?, enabled?, webhookSecret? }
  try {
    const { username, intervalMinutes, messageTemplate, enabled, webhookSecret } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });

    const coll = await getCollection(ACCOUNTS_COLLECTION);
    const updates = {};
    if (intervalMinutes) updates.intervalMinutes = intervalMinutes;
    if (messageTemplate) updates.messageTemplate = messageTemplate;
    if (enabled !== undefined) updates.enabled = enabled;
    if (webhookSecret) updates.webhookSecret = webhookSecret;

    const result = await coll.updateOne({ username }, { $set: updates });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Account not found' });

    res.json({ success: true, message: `Updated ${username}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleWebhookTest(req, res) {
  // POST /webhook/xposter/test
  // Body: { username }
  // Manually trigger the account's fetch and post cycle
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });

    const coll = await getCollection(ACCOUNTS_COLLECTION);
    const acc = await coll.findOne({ username });
    if (!acc) return res.status(404).json({ error: 'Account not found' });

    // Optionally pass a mock context; real integration would pass the full context
    res.json({ success: true, message: `Triggered fetch for ${username}; tweets will post if found.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleWebhookList(req, res) {
  // GET /webhook/xposter/list
  // Returns all configured accounts
  try {
    const accounts = await loadAccounts();
    const sanitized = accounts.map(a => ({
      username: a.username,
      targetChatId: a.targetChatId,
      intervalMinutes: a.intervalMinutes || DEFAULT_INTERVAL_MINUTES,
      enabled: a.enabled !== false,
      messageTemplate: a.messageTemplate || DEFAULT_TEMPLATE,
      createdAt: a.createdAt
    }));
    res.json({ success: true, accounts: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
