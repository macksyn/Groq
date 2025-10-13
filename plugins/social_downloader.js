// plugins/socialMediaDownloader.js
import axios from 'axios';
import chalk from 'chalk';
import { PluginHelpers, safeOperation } from '../lib/pluginIntegration.js';

// Collection name for settings
const SETTINGS_COLLECTION = 'downloader_settings';
const USAGE_COLLECTION = 'downloader_usage';

// Default settings (used when no DB settings exist)
const DEFAULT_SETTINGS = {
  premiumEnabled: false,
  downloadCost: 50,
  rateLimitFree: 10,
  rateLimitCooldown: 24 * 60 * 60 * 1000, // 24 hours
  enabledPlatforms: ['facebook', 'tiktok', 'twitter', 'instagram', 'spotify'],
  maxFileSize: 100, // MB
  allowGroups: true,
  allowPrivate: true,
  updatedAt: new Date(),
  updatedBy: 'system'
};

// Supported platforms with regex patterns
const PLATFORMS = {
  FACEBOOK: {
    name: 'Facebook',
    key: 'facebook',
    patterns: [
      /(?:https?:\/\/)?(?:www\.|m\.|web\.|mbasic\.)?facebook\.com\/(?:watch\/?\?v=|[\w-]+\/videos?\/|reel\/|share\/r\/|groups\/[\w-]+\/permalink\/|[\w-]+\/posts\/|story\.php\?story_fbid=|permalink\.php\?story_fbid=)[\w\d-]+/gi,
      /(?:https?:\/\/)?fb\.watch\/[\w-]+/gi
    ],
    icon: '𝐟'
  },
  TIKTOK: {
    name: 'TikTok',
    key: 'tiktok',
    patterns: [
      /(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/(?:@[\w.-]+\/video\/|v\/|t\/)?\w+/gi,
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/gi
    ],
    icon: '🎵'
  },
  TWITTER: {
    name: 'Twitter/X',
    key: 'twitter',
    patterns: [
      /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter|x)\.com\/[\w]+\/status\/\d+/gi,
      /(?:https?:\/\/)?t\.co\/[\w]+/gi
    ],
    icon: '𝕏'
  },
  INSTAGRAM: {
    name: 'Instagram',
    key: 'instagram',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[\w-]+/gi,
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\/[\w.-]+\/\d+/gi
    ],
    icon: '🅾'
  },
  SPOTIFY: {
    name: 'Spotify',
    key: 'spotify',
    patterns: [
      /(?:https?:\/\/)?open\.spotify\.com\/track\/[\w]+/gi,
      /(?:https?:\/\/)?open\.spotify\.com\/album\/[\w]+/gi
    ],
    icon: '🎵'
  }
};

// Platform-specific API configurations
const PLATFORM_APIS = {
  tiktok: {
    endpoint: 'https://delirius-apiofc.vercel.app/download/tiktok',
    buildUrl: (url) => `https://delirius-apiofc.vercel.app/download/tiktok?url=${encodeURIComponent(url)}`,
    extractData: (response) => {
      const data = response.data?.data;
      if (!data || !data.meta?.media?.[0]) {
        throw new Error('Invalid TikTok response format');
      }
      
      const media = data.meta.media[0];
      return {
        url: media.hd || media.org || media.wm,
        thumbnail: null,
        title: data.title || 'TikTok Video',
        duration: data.duration || null,
        author: data.author?.nickname || data.author?.username || 'Unknown'
      };
    }
  },
  instagram: {
    endpoint: 'https://delirius-apiofc.vercel.app/download/instagram',
    buildUrl: (url) => `https://delirius-apiofc.vercel.app/download/instagram?url=${encodeURIComponent(url)}`,
    extractData: (response) => {
      const data = response.data?.data;
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('Invalid Instagram response format');
      }
      
      // Get first media item (could be image or video)
      const media = data[0];
      return {
        url: media.url,
        thumbnail: null,
        title: 'Instagram Media',
        duration: null,
        type: media.type || 'image'
      };
    }
  },
  facebook: {
    endpoint: 'https://delirius-apiofc.vercel.app/download/facebook',
    buildUrl: (url) => `https://delirius-apiofc.vercel.app/download/facebook?url=${encodeURIComponent(url)}`,
    extractData: (response) => {
      const data = response.data;
      if (!data || !data.urls || data.urls.length === 0) {
        throw new Error('Invalid Facebook response format');
      }
      
      // Prefer HD quality
      const videoUrl = data.urls[0].hd || data.urls[1]?.sd;
      if (!videoUrl) {
        throw new Error('No video URL found in Facebook response');
      }
      
      return {
        url: videoUrl,
        thumbnail: null,
        title: data.title || 'Facebook Video',
        duration: null,
        isHd: data.isHdAvailable || false
      };
    }
  },
  spotify: {
    endpoint: 'https://delirius-apiofc.vercel.app/download/spotifydlv2',
    buildUrl: (url) => `https://delirius-apiofc.vercel.app/download/spotifydlv2?url=${encodeURIComponent(url)}`,
    extractData: (response) => {
      const data = response.data?.data;
      if (!data || !data.url) {
        throw new Error('Invalid Spotify response format');
      }
      
      return {
        url: data.url,
        thumbnail: data.image || null,
        title: data.title || 'Spotify Track',
        duration: data.duration || null,
        artist: data.artist || 'Unknown Artist',
        album: data.album || null
      };
    }
  },
  twitter: {
    // Fallback Twitter API (using existing method)
    buildUrl: (url) => `https://twitsave.com/info?url=${encodeURIComponent(url)}`,
    extractData: (response) => {
      // Parse HTML response to extract video URL
      const videoMatch = response.data.match(/https?:\/\/[^\s<>"]+\.mp4/);
      if (!videoMatch) {
        throw new Error('No video URL found in Twitter response');
      }
      
      return {
        url: videoMatch[0],
        thumbnail: null,
        title: 'Twitter Video',
        duration: null
      };
    }
  }
};

class SocialMediaDownloader {
  constructor() {
    this.settings = null;
    this.activeDownloads = new Map();
    this.statsCache = null;
    this.statsCacheTime = 0;
    this.statsCacheDuration = 5 * 60 * 1000; // 5 minutes
  }

  // Initialize and load settings from MongoDB
  async initialize() {
    try {
      this.settings = await this.loadSettings();
      console.log(chalk.green('✅ Downloader settings loaded from database'));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Failed to load downloader settings:'), error.message);
      this.settings = { ...DEFAULT_SETTINGS };
      return false;
    }
  }

  // Load settings from MongoDB
  async loadSettings() {
    try {
      return await safeOperation(async (db, collection) => {
        let settings = await collection.findOne({ _id: 'main_settings' });
        
        if (!settings) {
          // Create default settings
          settings = { _id: 'main_settings', ...DEFAULT_SETTINGS };
          await collection.insertOne(settings);
          console.log(chalk.cyan('📝 Created default downloader settings'));
        }
        
        return settings;
      }, SETTINGS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error loading settings:'), error.message);
      return { ...DEFAULT_SETTINGS };
    }
  }

  // Save settings to MongoDB
  async saveSettings(updates, updatedBy = 'system') {
    try {
      return await safeOperation(async (db, collection) => {
        const updateData = {
          ...updates,
          updatedAt: new Date(),
          updatedBy
        };
        
        const result = await collection.updateOne(
          { _id: 'main_settings' },
          { $set: updateData },
          { upsert: true }
        );
        
        // Update local cache
        this.settings = await this.loadSettings();
        
        console.log(chalk.green('✅ Downloader settings updated'));
        return result;
      }, SETTINGS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error saving settings:'), error.message);
      throw error;
    }
  }

  // Get current settings
  getSettings() {
    return this.settings || { ...DEFAULT_SETTINGS };
  }

  // Check if user is admin (from ENV)
  isAdmin(userId) {
    const adminNumber = process.env.OWNER_NUMBER || process.env.ADMIN_NUMBER;
    if (!adminNumber) return false;
    
    const userNumber = userId.split('@')[0];
    return adminNumber === userNumber || adminNumber.includes(userNumber);
  }

  // Detect platform from URL
  detectPlatform(url) {
    for (const [platform, config] of Object.entries(PLATFORMS)) {
      for (const pattern of config.patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(url)) {
          return { platform, config };
        }
      }
    }
    return null;
  }

  // Check if platform is enabled
  isPlatformEnabled(platformKey) {
    const settings = this.getSettings();
    return settings.enabledPlatforms?.includes(platformKey) ?? true;
  }

  // Get user usage data from MongoDB
  async getUserUsage(userId) {
    try {
      return await safeOperation(async (db, collection) => {
        const now = Date.now();
        let usage = await collection.findOne({ userId });
        
        if (!usage) {
          usage = {
            userId,
            count: 0,
            resetTime: now + this.getSettings().rateLimitCooldown,
            totalDownloads: 0,
            lastDownload: null,
            createdAt: new Date()
          };
          await collection.insertOne(usage);
        }
        
        // Reset if cooldown expired
        if (now > usage.resetTime) {
          await collection.updateOne(
            { userId },
            { 
              $set: { 
                count: 0, 
                resetTime: now + this.getSettings().rateLimitCooldown 
              } 
            }
          );
          usage.count = 0;
          usage.resetTime = now + this.getSettings().rateLimitCooldown;
        }
        
        return usage;
      }, USAGE_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error getting user usage:'), error.message);
      return { count: 0, resetTime: Date.now() + this.getSettings().rateLimitCooldown };
    }
  }

  // Check rate limits
  async checkRateLimit(userId) {
    const settings = this.getSettings();
    if (settings.premiumEnabled) return true;

    const usage = await this.getUserUsage(userId);
    const now = Date.now();

    if (usage.count >= settings.rateLimitFree) {
      const hoursLeft = Math.ceil((usage.resetTime - now) / (60 * 60 * 1000));
      return { limited: true, hoursLeft, current: usage.count, limit: settings.rateLimitFree };
    }

    return true;
  }

  // Increment usage counter in MongoDB
  async incrementUsage(userId, platform, url) {
    try {
      return await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { userId },
          { 
            $inc: { count: 1, totalDownloads: 1 },
            $set: { lastDownload: new Date() },
            $push: { 
              downloads: { 
                $each: [{ platform, url, timestamp: new Date() }],
                $slice: -50 // Keep only last 50 downloads
              }
            }
          },
          { upsert: true }
        );
      }, USAGE_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error incrementing usage:'), error.message);
    }
  }

  // Download with platform-specific API
  async downloadWithPlatformAPI(url, platformKey) {
    try {
      const apiConfig = PLATFORM_APIS[platformKey];
      if (!apiConfig) {
        throw new Error(`No API configuration found for platform: ${platformKey}`);
      }

      console.log(chalk.cyan(`🔄 Downloading from ${platformKey} API: ${url}`));
      
      const apiUrl = apiConfig.buildUrl(url);
      console.log(chalk.cyan(`API URL: ${apiUrl}`));
      
      const response = await axios.get(apiUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      console.log(chalk.green(`✅ ${platformKey} API response received`));

      // Check if API returned error
      if (response.data.status === false) {
        throw new Error(response.data.message || 'API returned error status');
      }

      // Extract data using platform-specific extractor
      const extractedData = apiConfig.extractData(response);
      
      return {
        ...extractedData,
        source: platformKey
      };
    } catch (error) {
      console.error(chalk.red(`${platformKey} API error:`), error.message);
      
      // Log more details for debugging
      if (error.response) {
        console.error(chalk.red('Response status:'), error.response.status);
        console.error(chalk.red('Response data:'), JSON.stringify(error.response.data, null, 2));
      }
      
      throw error;
    }
  }

  // Main download function
  async download(url, userId, isGroup) {
    const downloadId = `${userId}_${Date.now()}`;
    const settings = this.getSettings();
    
    // Check if groups/private are allowed
    if (isGroup && !settings.allowGroups) {
      return { error: '⚠️ Group downloads are currently disabled by admin.' };
    }
    if (!isGroup && !settings.allowPrivate) {
      return { error: '⚠️ Private downloads are currently disabled by admin.' };
    }

    // Prevent duplicate downloads
    if (this.activeDownloads.has(userId)) {
      return { error: 'You already have a download in progress. Please wait.' };
    }

    try {
      this.activeDownloads.set(userId, downloadId);

      // Detect platform
      const detection = this.detectPlatform(url);
      if (!detection) {
        return { error: 'Unsupported URL. Please provide a valid social media link.' };
      }

      const { platform, config } = detection;

      // Check if platform is enabled
      if (!this.isPlatformEnabled(config.key)) {
        return { error: `${config.name} downloads are currently disabled by admin.` };
      }

      // Check rate limits (free tier)
      const rateLimitCheck = await this.checkRateLimit(userId);
      if (rateLimitCheck.limited) {
        return { 
          error: `📊 *Daily Limit Reached!*\n\n` +
                 `Current: ${rateLimitCheck.current}/${rateLimitCheck.limit}\n` +
                 `Reset in: ${rateLimitCheck.hoursLeft} hours\n\n` +
                 `_Contact admin to upgrade to premium_`,
          limited: true
        };
      }

      // Check balance for premium mode
      if (settings.premiumEnabled) {
        const balance = await PluginHelpers.getBalance(userId);
        if (balance.wallet < settings.downloadCost) {
          return { 
            error: `💳 *Insufficient Balance!*\n\n` +
                   `Required: ₦${settings.downloadCost}\n` +
                   `Your balance: ₦${balance.wallet}\n\n` +
                   `_Use economy commands to earn money_`,
            insufficientBalance: true
          };
        }
      }

      // Attempt download with platform-specific API
      let result;
      
      try {
        result = await this.downloadWithPlatformAPI(url, config.key);
      } catch (error) {
        console.error(chalk.red(`❌ ${config.name} download failed`));
        
        return { 
          error: `❌ *Download Failed*\n\n` +
                 `The ${config.name} content couldn't be downloaded. Possible reasons:\n` +
                 `• The link is invalid or expired\n` +
                 `• The content is private/protected\n` +
                 `• The API is temporarily unavailable\n\n` +
                 `*Error:* ${error.message}\n\n` +
                 `_Try a different link or contact admin_`
        };
      }

      // Charge user if premium mode
      if (settings.premiumEnabled) {
        await PluginHelpers.removeMoney(userId, settings.downloadCost, `${config.name} download`);
      } else {
        // Increment usage counter
        await this.incrementUsage(userId, config.name, url);
      }

      // Log download to stats
      await this.logDownload(userId, config.name, settings.premiumEnabled);

      return {
        success: true,
        platform: config.name,
        icon: config.icon,
        ...result
      };

    } catch (error) {
      console.error(chalk.red('Download error:'), error.message);
      return { error: `An unexpected error occurred: ${error.message}` };
    } finally {
      this.activeDownloads.delete(userId);
    }
  }

  // Log download statistics
  async logDownload(userId, platform, isPremium) {
    try {
      await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { _id: 'stats' },
          { 
            $inc: { 
              totalDownloads: 1,
              [`platforms.${platform}`]: 1,
              [isPremium ? 'premiumDownloads' : 'freeDownloads']: 1
            },
            $set: { lastDownload: new Date() }
          },
          { upsert: true }
        );
      }, SETTINGS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error logging download:'), error.message);
    }
  }

  // Get remaining downloads for user
  async getRemainingDownloads(userId) {
    const settings = this.getSettings();
    if (settings.premiumEnabled) return 'Unlimited (Premium)';

    const usage = await this.getUserUsage(userId);
    return Math.max(0, settings.rateLimitFree - usage.count);
  }

  // Get comprehensive statistics
  async getStats() {
    const now = Date.now();
    
    // Return cached stats if available and fresh
    if (this.statsCache && (now - this.statsCacheTime < this.statsCacheDuration)) {
      return this.statsCache;
    }

    try {
      const stats = await safeOperation(async (db, collection) => {
        const globalStats = await collection.findOne({ _id: 'stats' }) || {
          totalDownloads: 0,
          freeDownloads: 0,
          premiumDownloads: 0,
          platforms: {}
        };
        
        return globalStats;
      }, SETTINGS_COLLECTION);

      const usageStats = await safeOperation(async (db, collection) => {
        const totalUsers = await collection.countDocuments();
        const activeUsers = await collection.countDocuments({ 
          lastDownload: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
        });
        
        return { totalUsers, activeUsers };
      }, USAGE_COLLECTION);

      const settings = this.getSettings();

      const result = {
        ...stats,
        ...usageStats,
        activeDownloads: this.activeDownloads.size,
        settings: {
          premiumEnabled: settings.premiumEnabled,
          downloadCost: settings.downloadCost,
          rateLimitFree: settings.rateLimitFree,
          enabledPlatforms: settings.enabledPlatforms,
          allowGroups: settings.allowGroups,
          allowPrivate: settings.allowPrivate
        },
        lastUpdated: new Date()
      };

      // Cache the results
      this.statsCache = result;
      this.statsCacheTime = now;

      return result;
    } catch (error) {
      console.error(chalk.red('Error getting stats:'), error.message);
      return {
        totalDownloads: 0,
        activeDownloads: this.activeDownloads.size,
        error: error.message
      };
    }
  }

  // Get user's download history
  async getUserHistory(userId, limit = 10) {
    try {
      return await safeOperation(async (db, collection) => {
        const usage = await collection.findOne({ userId });
        return usage?.downloads?.slice(-limit).reverse() || [];
      }, USAGE_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error getting user history:'), error.message);
      return [];
    }
  }
}

// Create singleton instance
const downloader = new SocialMediaDownloader();

// Main plugin handler
export default async function socialMediaDownloader(m, sock, config, bot) {
  try {
    // Initialize if not already done
    if (!downloader.settings) {
      await downloader.initialize();
    }

    // Skip if no body or doesn't start with prefix
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;

    // Extract message details matching your bot's structure
    const messageBody = m.body.slice(config.PREFIX.length).trim();
    const args = messageBody.split(' ');
    const command = args[0].toLowerCase();
    const sender = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    
    if (!sender) {
      console.log(chalk.yellow('⚠️ No sender found in message'));
      return;
    }
    
    const isAdmin = downloader.isAdmin(sender);
    
    // Reply helper
    const reply = async (text) => {
      await sock.sendMessage(from, { text }, { quoted: m });
    };

    // Admin Settings Command: .dlsettings
    if (command === 'dlsettings') {
      if (!isAdmin) {
        await reply('⛔ *Access Denied*\n\nThis command is only available to administrators.');
        return;
      }

      const settingArgs = args.slice(1);
      
      if (settingArgs.length === 0) {
        // Show current settings
        const settings = downloader.getSettings();
        const adminNum = process.env.OWNER_NUMBER || process.env.ADMIN_NUMBER || 'Not configured';
        
        await reply(
          `*⚙️ Downloader Settings*\n\n` +
          `*Admin Number:* ${adminNum}\n\n` +
          `*Premium Mode:* ${settings.premiumEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
          `*Download Cost:* ₦${settings.downloadCost}\n` +
          `*Free Limit:* ${settings.rateLimitFree} per day\n` +
          `*Cooldown:* ${settings.rateLimitCooldown / (60 * 60 * 1000)}h\n\n` +
          `*Enabled Platforms:*\n${settings.enabledPlatforms.map(p => `• ${p}`).join('\n')}\n\n` +
          `*Allow Groups:* ${settings.allowGroups ? '✅' : '❌'}\n` +
          `*Allow Private:* ${settings.allowPrivate ? '✅' : '❌'}\n\n` +
          `*Last Updated:* ${new Date(settings.updatedAt).toLocaleString()}\n` +
          `*Updated By:* ${settings.updatedBy}\n\n` +
          `*Commands:*\n` +
          `${config.PREFIX}dlsettings premium on/off\n` +
          `${config.PREFIX}dlsettings cost <amount>\n` +
          `${config.PREFIX}dlsettings limit <number>\n` +
          `${config.PREFIX}dlsettings platform <name> on/off\n` +
          `${config.PREFIX}dlsettings groups on/off\n` +
          `${config.PREFIX}dlsettings private on/off`
        );
        return;
      }

      const action = settingArgs[0];
      const value = settingArgs[1];
      const updates = {};

      switch (action) {
        case 'premium':
          if (value === 'on' || value === 'off') {
            updates.premiumEnabled = value === 'on';
            await downloader.saveSettings(updates, sender);
            await reply(`✅ Premium mode ${value === 'on' ? 'enabled' : 'disabled'}`);
          } else {
            await reply('❌ Usage: .dlsettings premium on/off');
          }
          break;

        case 'cost':
          const cost = parseInt(value);
          if (!isNaN(cost) && cost >= 0) {
            updates.downloadCost = cost;
            await downloader.saveSettings(updates, sender);
            await reply(`✅ Download cost set to ₦${cost}`);
          } else {
            await reply('❌ Invalid cost. Usage: .dlsettings cost <number>');
          }
          break;

        case 'limit':
          const limit = parseInt(value);
          if (!isNaN(limit) && limit > 0) {
            updates.rateLimitFree = limit;
            await downloader.saveSettings(updates, sender);
            await reply(`✅ Free download limit set to ${limit} per day`);
          } else {
            await reply('❌ Invalid limit. Usage: .dlsettings limit <number>');
          }
          break;

        case 'platform':
          const platform = value?.toLowerCase();
          const state = settingArgs[2];
          if (platform && (state === 'on' || state === 'off')) {
            const settings = downloader.getSettings();
            const platforms = [...settings.enabledPlatforms] || [];
            
            if (state === 'on' && !platforms.includes(platform)) {
              platforms.push(platform);
            } else if (state === 'off') {
              const index = platforms.indexOf(platform);
              if (index > -1) platforms.splice(index, 1);
            }
            
            updates.enabledPlatforms = platforms;
            await downloader.saveSettings(updates, sender);
            await reply(`✅ ${platform} ${state === 'on' ? 'enabled' : 'disabled'}`);
          } else {
            await reply('❌ Usage: .dlsettings platform <facebook|tiktok|twitter|instagram|spotify> on/off');
          }
          break;

        case 'groups':
          if (value === 'on' || value === 'off') {
            updates.allowGroups = value === 'on';
            await downloader.saveSettings(updates, sender);
            await reply(`✅ Group downloads ${value === 'on' ? 'enabled' : 'disabled'}`);
          } else {
            await reply('❌ Usage: .dlsettings groups on/off');
          }
          break;

        case 'private':
          if (value === 'on' || value === 'off') {
            updates.allowPrivate = value === 'on';
            await downloader.saveSettings(updates, sender);
            await reply(`✅ Private downloads ${value === 'on' ? 'enabled' : 'disabled'}`);
          } else {
            await reply('❌ Usage: .dlsettings private on/off');
          }
          break;

        default:
          await reply(`❌ Unknown setting: ${action}\n\nUse ${config.PREFIX}dlsettings to see available commands`);
      }
      return;
    }

    // Download Command: .dl <url> or .download <url>
    if (command === 'dl' || command === 'download') {
      // Get URL from remaining args
      const url = args.slice(1).join(' ').trim();

      if (!url) {
        const remaining = await downloader.getRemainingDownloads(sender);
        const settings = downloader.getSettings();
        
        let replyText = `*📥 Social Media Downloader*\n\n`;
        replyText += `*Supported Platforms:*\n`;
        replyText += `${settings.enabledPlatforms.map(p => {
          const plat = Object.values(PLATFORMS).find(pl => pl.key === p);
          return plat ? `${plat.icon} ${plat.name}` : '';
        }).filter(Boolean).join('\n')}\n\n`;
        replyText += `*Your Status:*\n`;
        if (settings.premiumEnabled) {
          replyText += `💎 Premium: ₦${settings.downloadCost} per download\n\n`;
        } else {
          replyText += `🆓 Free: ${remaining}/${settings.rateLimitFree} remaining today\n\n`;
        }
        replyText += `*Usage:* ${config.PREFIX}dl <url>\n`;
        replyText += `*Example:* ${config.PREFIX}dl https://tiktok.com/@user/video/123`;
        
        await reply(replyText);
        return;
      }

      // Send processing message
      const processingMsg = await sock.sendMessage(from, {
        text: `⏳ *Processing Download...*\n\nPlease wait while we fetch your media.`
      }, { quoted: m });

      // Attempt download
      const result = await downloader.download(url, sender, isGroup);

      if (result.error) {
        // Edit the processing message with error
        await sock.sendMessage(from, {
          text: result.error,
          edit: processingMsg.key
        });
        return;
      }

      if (result.success) {
        const settings = downloader.getSettings();
        const remaining = await downloader.getRemainingDownloads(sender);
        
        let caption = `${result.icon} *${result.platform} Download*\n\n`;
        
        // Add title/artist info
        if (result.artist) {
          caption += `🎤 ${result.artist}\n`;
        }
        if (result.title && result.title !== 'media') {
          caption += `📝 ${result.title}\n`;
        }
        if (result.album) {
          caption += `💿 ${result.album}\n`;
        }
        if (result.author) {
          caption += `👤 ${result.author}\n`;
        }
        
        // Add cost/remaining info
        if (settings.premiumEnabled) {
          caption += `💳 Charged: ₦${settings.downloadCost}\n`;
        } else {
          caption += `🆓 Remaining: ${remaining}/${settings.rateLimitFree}\n`;
        }
        caption += `\n⚡ Powered by ${bot?.name || 'Groq'}`;

        try {
          // Determine media type based on platform
          const isAudio = result.platform === 'Spotify';
          const isImage = result.type === 'image';
          
          if (isAudio) {
            // Send audio for Spotify
            await sock.sendMessage(from, {
              audio: { url: result.url },
              mimetype: 'audio/mpeg',
              ptt: false,
              fileName: `${result.title}.mp3`
            }, { quoted: m });
            
            // Send caption separately
            await sock.sendMessage(from, { text: caption }, { quoted: m });
          } else if (isImage) {
            // Send image for Instagram
            await sock.sendMessage(from, {
              image: { url: result.url },
              caption: caption
            }, { quoted: m });
          } else {
            // Send video for other platforms
            await sock.sendMessage(from, {
              video: { url: result.url },
              caption: caption,
              mimetype: 'video/mp4'
            }, { quoted: m });
          }

          // Delete processing message after successful send
          await sock.sendMessage(from, {
            delete: processingMsg.key
          });
        } catch (sendError) {
          console.error(chalk.red('Error sending media:'), sendError.message);
          
          // If sending fails, update the processing message with error and direct link
          await sock.sendMessage(from, {
            text: `❌ *Send Failed*\n\nThe media was downloaded but couldn't be sent. This might be due to:\n• File size too large\n• Network issues\n• WhatsApp restrictions\n\nDirect link: ${result.url}`,
            edit: processingMsg.key
          });
        }
      }
      return;
    }

    // Statistics Command
    if (command === 'dlstats') {
      if (!isAdmin) {
        await reply('⛔ *Access Denied*\n\nThis command is only available to administrators.');
        return;
      }

      const stats = await downloader.getStats();
      
      await reply(
        `*📊 Downloader Statistics*\n\n` +
        `*Total Downloads:* ${stats.totalDownloads || 0}\n` +
        `*Free Downloads:* ${stats.freeDownloads || 0}\n` +
        `*Premium Downloads:* ${stats.premiumDownloads || 0}\n` +
        `*Active Downloads:* ${stats.activeDownloads}\n\n` +
        `*Users:*\n` +
        `• Total: ${stats.totalUsers || 0}\n` +
        `• Active (7d): ${stats.activeUsers || 0}\n\n` +
        `*Platforms:*\n` +
        `${Object.entries(stats.platforms || {}).map(([p, count]) => `• ${p}: ${count}`).join('\n') || 'No data'}\n\n` +
        `*Settings:*\n` +
        `• Mode: ${stats.settings?.premiumEnabled ? '💎 Premium' : '🆓 Free'}\n` +
        `• Cost: ₦${stats.settings?.downloadCost || 0}\n` +
        `• Daily Limit: ${stats.settings?.rateLimitFree || 0}\n\n` +
        `*Last Updated:* ${new Date(stats.lastUpdated).toLocaleString()}`
      );
      return;
    }

    // User History Command
    if (command === 'dlhistory') {
      const history = await downloader.getUserHistory(sender, 10);
      
      if (history.length === 0) {
        await reply(`📜 *Your Download History*\n\nNo downloads yet!`);
        return;
      }

      const historyText = history.map((item, i) => 
        `${i + 1}. ${item.platform}\n   ${new Date(item.timestamp).toLocaleString()}`
      ).join('\n\n');

      await reply(`📜 *Your Download History*\n\n${historyText}\n\n_Showing last ${history.length} downloads_`);
      return;
    }

  } catch (error) {
    console.error(chalk.red('Social media downloader plugin error:'), error.message);
    console.error(chalk.red('Stack:'), error.stack);
    
    // Try to send error message to user
    try {
      await sock.sendMessage(m.key.remoteJid, {
        text: `❌ *Plugin Error*\n\nAn unexpected error occurred. Please try again or contact admin.\n\n_Error: ${error.message}_`
      }, { quoted: m });
    } catch (replyError) {
      console.error(chalk.red('Failed to send error message:'), replyError.message);
    }
  }
}

// Plugin info
export const info = {
  name: 'Social Media Downloader',
  version: '3.0.0',
  author: 'Alex Macksyn',
  description: 'Download videos/audio from social media with platform-specific APIs',
  category: 'media',
  commands: [
    {
      command: '.dl <url>',
      alias: ['.download'],
      description: 'Download media from supported platforms',
      usage: '.dl https://tiktok.com/@user/video/123'
    },
    {
      command: '.dlsettings',
      description: 'Manage downloader settings (admin only)',
      usage: '.dlsettings [option] [value]'
    },
    {
      command: '.dlstats',
      description: 'View statistics (admin only)',
      usage: '.dlstats'
    },
    {
      command: '.dlhistory',
      description: 'View your download history',
      usage: '.dlhistory'
    }
  ],
  features: [
    'Multi-platform support (Facebook, TikTok, Twitter, Instagram, Spotify)',
    'Platform-specific API routing',
    'Admin settings via commands',
    'MongoDB persistence',
    'Premium mode with economy integration',
    'Rate limiting with daily reset',
    'Download history tracking',
    'Comprehensive statistics',
    'Audio support for Spotify',
    'Image support for Instagram',
    'Automatic media type detection'
  ],
  changelog: {
    '3.0.0': [
      'Removed Cobalt API completely',
      'Added platform-specific APIs (TikTok, Instagram, Facebook, Spotify)',
      'Automatic API routing based on detected platform',
      'Added Spotify music download support',
      'Improved media type detection (video/audio/image)',
      'Enhanced error handling per platform',
      'Better metadata extraction (artist, album, author)',
      'Optimized response parsing for each API'
    ]
  }
};

// Initialize function
export async function initialize(config) {
  await downloader.initialize();
  
  const settings = downloader.getSettings();
  console.log(chalk.green('✅ Social Media Downloader v3.0 initialized'));
  console.log(chalk.cyan(`Mode: ${settings.premiumEnabled ? '💎 Premium' : '🆓 Free'}`));
  console.log(chalk.cyan(`Admin: ${process.env.OWNER_NUMBER || process.env.ADMIN_NUMBERS || '12026411790542'}`));
  console.log(chalk.cyan(`Supported: TikTok, Instagram, Facebook, Twitter, Spotify`));
  
  if (settings.premiumEnabled) {
    console.log(chalk.cyan(`Cost: ₦${settings.downloadCost} per download`));
  } else {
    console.log(chalk.cyan(`Free limit: ${settings.rateLimitFree} downloads per day`));
  }
}
