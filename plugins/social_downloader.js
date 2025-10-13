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
  enabledPlatforms: ['facebook', 'tiktok', 'twitter', 'instagram'],
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
    icon: 'FB'
  },
  TIKTOK: {
    name: 'TikTok',
    key: 'tiktok',
    patterns: [
      /(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/(?:@[\w.-]+\/video\/|v\/|t\/)?\w+/gi,
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/gi
    ],
    icon: 'TT'
  },
  TWITTER: {
    name: 'Twitter/X',
    key: 'twitter',
    patterns: [
      /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter|x)\.com\/[\w]+\/status\/\d+/gi,
      /(?:https?:\/\/)?t\.co\/[\w]+/gi
    ],
    icon: 'X'
  },
  INSTAGRAM: {
    name: 'Instagram',
    key: 'instagram',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[\w-]+/gi,
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\/[\w.-]+\/\d+/gi
    ],
    icon: 'IG'
  }
};

// Updated API services with working alternatives
const API_SERVICES = {
  // Primary APIs by platform
  tiktok: [
    'https://api.tiklydown.eu.org/api/download',
    'https://api.tikmate.app/api/download'
  ],
  twitter: [
    'https://twitsave.com/api/info',
    'https://ssstwitter.com/api/info'
  ],
  instagram: [
    'https://api.downloadgram.org/media'
  ],
  facebook: [
    'https://api.saveform.com/download'
  ],
  // Generic fallback
  generic: [
    'https://api.cobalt.tools/api/json'
  ]
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

  // FIXED: Check if user is admin (improved logic)
  isAdmin(userId) {
    try {
      const adminNumber = process.env.OWNER_NUMBER || process.env.ADMIN_NUMBER;
      if (!adminNumber) {
        console.log(chalk.yellow('⚠️ No admin number configured in ENV'));
        return false;
      }
      
      // Extract just the phone number from userId (remove @s.whatsapp.net or @g.us)
      const userNumber = userId.split('@')[0];
      
      // Support comma-separated admin numbers
      const adminNumbers = adminNumber.split(',').map(n => n.trim());
      
      const isAdminUser = adminNumbers.some(admin => 
        admin === userNumber || userNumber === admin
      );
      
      console.log(chalk.cyan(`Admin check: ${userNumber} -> ${isAdminUser ? 'YES' : 'NO'}`));
      return isAdminUser;
    } catch (error) {
      console.error(chalk.red('Error checking admin:'), error.message);
      return false;
    }
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

  // FIXED: Download with multiple API fallbacks
  async downloadMedia(url, platformKey) {
    const apis = API_SERVICES[platformKey] || API_SERVICES.generic;
    let lastError = null;

    // Try each API for this platform
    for (const apiUrl of apis) {
      try {
        console.log(chalk.cyan(`🔄 Trying API: ${apiUrl}`));
        
        // Platform-specific download logic
        if (platformKey === 'tiktok') {
          const result = await this.downloadTikTok(url, apiUrl);
          if (result) return result;
        } else if (platformKey === 'twitter') {
          const result = await this.downloadTwitter(url, apiUrl);
          if (result) return result;
        } else if (platformKey === 'instagram') {
          const result = await this.downloadInstagram(url, apiUrl);
          if (result) return result;
        } else if (platformKey === 'facebook') {
          const result = await this.downloadFacebook(url, apiUrl);
          if (result) return result;
        }
        
        // Try generic Cobalt API as last resort
        const result = await this.downloadWithCobalt(url);
        if (result) return result;
        
      } catch (error) {
        console.error(chalk.yellow(`⚠️ API ${apiUrl} failed:`, error.message));
        lastError = error;
        continue;
      }
    }

    throw lastError || new Error('All download methods failed');
  }

  // Download with Cobalt API (generic fallback)
  async downloadWithCobalt(url) {
    try {
      const response = await axios.post('https://api.cobalt.tools/api/json', {
        url: url,
        vCodec: 'h264',
        vQuality: '720',
        aFormat: 'mp3',
        filenamePattern: 'basic',
        isAudioOnly: false
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data.status === 'error' || response.data.status === 'rate-limit') {
        throw new Error(response.data.text || 'Download failed');
      }

      if (response.data.status === 'redirect' || response.data.status === 'tunnel') {
        return {
          url: response.data.url,
          thumbnail: response.data.thumb || null,
          title: response.data.filename || 'media',
          source: 'cobalt'
        };
      }

      if (response.data.status === 'picker' && response.data.picker?.length > 0) {
        return {
          url: response.data.picker[0].url,
          thumbnail: response.data.thumb || null,
          title: response.data.filename || 'media',
          source: 'cobalt'
        };
      }

      return {
        url: response.data.url,
        thumbnail: response.data.thumb || null,
        title: response.data.filename || 'media',
        source: 'cobalt'
      };
    } catch (error) {
      console.error(chalk.red('Cobalt API error:'), error.message);
      throw error;
    }
  }

  // TikTok-specific download
  async downloadTikTok(url, apiUrl) {
    try {
      const response = await axios.post(apiUrl, { url }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000
      });

      if (response.data.video || response.data.data?.video) {
        const videoUrl = response.data.video || response.data.data.video;
        return {
          url: videoUrl,
          thumbnail: response.data.thumbnail || response.data.data?.thumbnail || null,
          title: response.data.title || response.data.data?.title || 'TikTok Video',
          source: 'tiktok-api'
        };
      }
      
      throw new Error('No video URL in response');
    } catch (error) {
      throw error;
    }
  }

  // Twitter-specific download
  async downloadTwitter(url, apiUrl) {
    try {
      const response = await axios.get(`${apiUrl}?url=${encodeURIComponent(url)}`, {
        timeout: 20000
      });

      // Different API responses
      if (response.data.data && Array.isArray(response.data.data)) {
        const videos = response.data.data.filter(item => item.type === 'video');
        if (videos.length > 0) {
          return {
            url: videos[0].url,
            thumbnail: videos[0].thumbnail || null,
            title: 'Twitter Video',
            source: 'twitter-api'
          };
        }
      }

      if (response.data.url) {
        return {
          url: response.data.url,
          thumbnail: response.data.thumbnail || null,
          title: 'Twitter Video',
          source: 'twitter-api'
        };
      }

      throw new Error('No video URL in response');
    } catch (error) {
      throw error;
    }
  }

  // Instagram-specific download
  async downloadInstagram(url, apiUrl) {
    try {
      const response = await axios.post(apiUrl, { url }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000
      });

      if (response.data.video_url || response.data.data?.video_url) {
        return {
          url: response.data.video_url || response.data.data.video_url,
          thumbnail: response.data.thumbnail || response.data.data?.thumbnail || null,
          title: 'Instagram Video',
          source: 'instagram-api'
        };
      }

      throw new Error('No video URL in response');
    } catch (error) {
      throw error;
    }
  }

  // Facebook-specific download
  async downloadFacebook(url, apiUrl) {
    try {
      const response = await axios.post(apiUrl, { url }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000
      });

      if (response.data.video || response.data.data?.video) {
        return {
          url: response.data.video || response.data.data.video,
          thumbnail: response.data.thumbnail || response.data.data?.thumbnail || null,
          title: 'Facebook Video',
          source: 'facebook-api'
        };
      }

      throw new Error('No video URL in response');
    } catch (error) {
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

      // Attempt download with improved fallback system
      const result = await this.downloadMedia(url, config.key);

      if (!result) {
        return { 
          error: `❌ *Download Failed*\n\n` +
                 `The video couldn't be downloaded. Possible reasons:\n` +
                 `• The link is invalid or expired\n` +
                 `• The content is private/protected\n` +
                 `• The platform is temporarily unavailable\n\n` +
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
      return { 
        error: `❌ Download failed: ${error.message}\n\n_All available APIs are currently unavailable. Please try again later._` 
      };
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
        const adminNum = process.env.OWNER_NUMBER || process.env.ADMIN_NUMBER || 'Not Set';
        
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
            await reply('❌ Usage: .dlsettings platform <facebook|tiktok|twitter|instagram> on/off');
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

      // FIXED: Send processing message and keep the message key
      const processingMsg = await sock.sendMessage(from, {
        text: `⏳ *Processing Download...*\n\nPlease wait while we fetch your media.`
      }, { quoted: m });

      // Attempt download
      const result = await downloader.download(url, sender, isGroup);

      if (result.error) {
        // FIXED: Edit the processing message instead of sending new one
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
        if (result.title && result.title !== 'media') {
          caption += `📝 ${result.title}\n`;
        }
        if (settings.premiumEnabled) {
          caption += `💳 Charged: ₦${settings.downloadCost}\n`;
        } else {
          caption += `🆓 Remaining: ${remaining}/${settings.rateLimitFree}\n`;
        }
        caption += `\n⚡ Powered by ${bot?.name || 'Groq Bot'}`;

        try {
          // Send video with caption
          await sock.sendMessage(from, {
            video: { url: result.url },
            caption: caption,
            mimetype: 'video/mp4'
          }, { quoted: m });

          // FIXED: Delete processing message after successful send
          await sock.sendMessage(from, {
            delete: processingMsg.key
          });
        } catch (sendError) {
          console.error(chalk.red('Error sending video:'), sendError.message);
          
          // If sending fails, update the processing message with error
          await sock.sendMessage(from, {
            text: `❌ *Send Failed*\n\nThe video was downloaded but couldn't be sent. This might be due to:\n• File size too large\n• Network issues\n• WhatsApp restrictions\n\nDirect link: ${result.url}`,
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
  version: '2.1.0',
  author: 'Alex Macksyn',
  description: 'Download videos from social media with admin settings and MongoDB persistence',
  category: 'media',
  commands: [
    {
      command: '.dl <url>',
      alias: ['.download'],
      description: 'Download video from supported platforms',
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
    'Multi-platform support (Facebook, TikTok, Twitter, Instagram)',
    'Admin settings via commands (no code editing required)',
    'MongoDB persistence for settings and usage tracking',
    'Premium mode with economy wallet integration',
    'Rate limiting with daily reset',
    'Download history tracking',
    'Comprehensive statistics',
    'Group/private chat controls',
    'Platform enable/disable controls',
    'Multiple API fallbacks for reliability',
    'Improved error handling and user feedback'
  ],
  changelog: {
    '2.1.0': [
      'Fixed admin command authentication',
      'Improved message editing (no more delete, just edit)',
      'Added multiple API fallbacks per platform',
      'Replaced unicode symbols with standard text',
      'Enhanced error handling and user feedback',
      'Better admin number checking (supports multiple admins)',
      'Improved download reliability with platform-specific APIs'
    ]
  }
};

// Initialize function
export async function initialize(config) {
  await downloader.initialize();
  
  const settings = downloader.getSettings();
  console.log(chalk.green('✅ Social Media Downloader plugin initialized'));
  console.log(chalk.cyan(`Mode: ${settings.premiumEnabled ? '💎 Premium' : '🆓 Free'}`));
  console.log(chalk.cyan(`Admin: ${process.env.OWNER_NUMBER || process.env.ADMIN_NUMBER || 'Not configured'}`));
  
  if (settings.premiumEnabled) {
    console.log(chalk.cyan(`Cost: ₦${settings.downloadCost} per download`));
  } else {
    console.log(chalk.cyan(`Free limit: ${settings.rateLimitFree} downloads per day`));
  }
  
  console.log(chalk.yellow('⚠️ Note: Some APIs may have rate limits or require keys'));
}
