// plugins/movie_downloader.js
import axios from 'axios';
import chalk from 'chalk';
import { PluginHelpers, safeOperation } from '../lib/pluginIntegration.js';

// --- Constants ---
const SETTINGS_COLLECTION = 'movie_settings';
const USAGE_COLLECTION = 'movie_usage';
const MOVIE_API_BASE = 'https://movieapi.giftedtech.co.ke/api';

const DEFAULT_SETTINGS = {
  premiumEnabled: false,
  downloadCost: 50,
  rateLimitFree: 10,
  rateLimitCooldown: 24 * 60 * 60 * 1000, // 24 hours
  maxSearchResults: 5, // Max results to show in search
  allowGroups: true,
  allowPrivate: true,
  allowedGroups: [], // Specific group IDs that are allowed. Empty array means all are allowed.
  updatedAt: new Date(),
  updatedBy: 'system'
};

// --- Utility Helpers ---

/**
 * Formats bytes into a human-readable string.
 * @param {number} bytes - The number of bytes.
 * @param {number} [decimals=2] - Number of decimal places.
 * @returns {string} - Formatted string (e.g., "1.23 MB").
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Extracts the year from a YYYY-MM-DD date string.
 * @param {string} dateString - The date string.
 * @returns {string} - The year or 'N/A'.
 */
function getYearFromDate(dateString) {
    if (!dateString) return 'N/A';
    return dateString.split('-')[0] || 'N/A';
}

// --- Movie API Helpers ---

/**
 * Searches for movies using the provided API.
 * @param {string} query - The movie title to search for.
 * @returns {Promise<object>} - The API search results.
 */
async function searchMoviesAPI(query) {
  try {
    const response = await axios.get(
      `${MOVIE_API_BASE}/search/${encodeURIComponent(query)}`
    );
    if (response.data?.success !== "true") {
      throw new Error('API did not return a successful search');
    }
    return response.data;
  } catch (error) {
    console.error(chalk.red('[MovieAPI] Search Error:'), error.message);
    throw new Error(`Failed to search for "${query}".`);
  }
}

/**
 * Gets detailed info for a specific movie ID.
 * @param {string} movieId - The movie's subject ID.
 * @returns {Promise<object>} - The API movie info.
 */
async function getMovieInfoAPI(movieId) {
  try {
    const response = await axios.get(`${MOVIE_API_BASE}/info/${movieId}`);
    if (response.data?.success !== "true") {
      throw new Error('API did not return successful info');
    }
    return response.data;
  } catch (error) {
    console.error(chalk.red('[MovieAPI] Info Error:'), error.message);
    throw new Error(`Failed to get info for ID "${movieId}".`);
  }
}

/**
 * Gets download sources for a specific movie ID.
 * @param {string} movieId - The movie's subject ID.
 * @param {string} [season] - The season number (for TV shows).
 * @param {string} [episode] - The episode number (for TV shows).
 * @returns {Promise<object>} - The API download sources.
 */
async function getDownloadSourcesAPI(movieId, season, episode) {
  try {
    let url = `${MOVIE_API_BASE}/sources/${movieId}`;
    if (season && episode) {
      url += `?season=${season}&episode=${episode}`;
    }
    
    const response = await axios.get(url);
    if (response.data?.success !== "true") {
      throw new Error('API did not return successful sources');
    }
    return response.data;
  } catch (error) {
    console.error(chalk.red('[MovieAPI] Sources Error:'), error.message);
    throw new Error(`Failed to get sources for ID "${movieId}".`);
  }
}

// --- MovieDownloader Class (Modeled after SocialMediaDownloader) ---
class MovieDownloader {
  constructor() {
    this.settings = null;
    this.activeRequests = new Map();
    this.statsCache = null;
    this.statsCacheTime = 0;
    this.statsCacheDuration = 5 * 60 * 1000; // 5 minutes
    this.userSearchResults = new Map(); // Stores last search results { userId: [movies] }
  }

  async initialize() {
    try {
      this.settings = await this.loadSettings();
      console.log(chalk.green('✅ Movie settings loaded from database'));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Failed to load movie settings:'), error.message);
      this.settings = { ...DEFAULT_SETTINGS };
      return false;
    }
  }

  async loadSettings() {
    try {
      return await safeOperation(async (db, collection) => {
        let settings = await collection.findOne({ _id: 'main_settings' });
        
        if (!settings) {
          settings = { _id: 'main_settings', ...DEFAULT_SETTINGS };
          await collection.insertOne(settings);
          console.log(chalk.cyan('📝 Created default movie settings'));
        }
        
        return settings;
      }, SETTINGS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error loading movie settings:'), error.message);
      return { ...DEFAULT_SETTINGS };
    }
  }

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
        
        this.settings = await this.loadSettings();
        
        console.log(chalk.green('✅ Movie settings updated'));
        return result;
      }, SETTINGS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error saving movie settings:'), error.message);
      throw error;
    }
  }

  getSettings() {
    return this.settings || { ...DEFAULT_SETTINGS };
  }

  isAdmin(userId) {
    const adminNumber = process.env.OWNER_NUMBER || process.env.ADMIN_NUMBER;
    if (!adminNumber) return false;
    
    const userNumber = userId.split('@')[0];
    return adminNumber === userNumber || adminNumber.includes(userNumber);
  }

  /**
   * Checks if the plugin is allowed to run in a specific group.
   * @param {string} groupId - The group's JID.
   * @returns {boolean} - True if allowed, false otherwise.
   */
  isGroupAllowed(groupId) {
    const settings = this.getSettings();
    if (!settings.allowGroups) {
      return false; // Master switch is off
    }
    if (settings.allowedGroups.length === 0) {
      return true; // List is empty, so all groups are allowed
    }
    return settings.allowedGroups.includes(groupId); // Check if this specific group is in the list
  }

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
            totalGets: 0,
            lastGet: null,
            createdAt: new Date()
          };
          await collection.insertOne(usage);
        }
        
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
      console.error(chalk.red('Error getting movie usage:'), error.message);
      return { count: 0, resetTime: Date.now() + this.getSettings().rateLimitCooldown };
    }
  }

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

  async incrementUsage(userId, movieTitle, movieId) {
    try {
      return await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { userId },
          { 
            $inc: { count: 1, totalGets: 1 },
            $set: { lastGet: new Date() },
            $push: { 
              history: { 
                $each: [{ title: movieTitle, id: movieId, timestamp: new Date() }],
                $slice: -50 // Keep only last 50
              }
            }
          },
          { upsert: true }
        );
      }, USAGE_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error incrementing movie usage:'), error.message);
    }
  }

  async logMovieGet(userId, movieTitle, isPremium) {
    try {
      await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { _id: 'stats' },
          { 
            $inc: { 
              totalGets: 1,
              [isPremium ? 'premiumGets' : 'freeGets']: 1
            },
            $set: { 
                lastGet: new Date(),
                lastMovie: movieTitle 
            }
          },
          { upsert: true }
        );
      }, SETTINGS_COLLECTION);
    } catch (error)
      {
      console.error(chalk.red('Error logging movie get:'), error.message);
    }
  }

  async getRemainingGets(userId) {
    const settings = this.getSettings();
    if (settings.premiumEnabled) return 'Unlimited (Premium)';

    const usage = await this.getUserUsage(userId);
    return Math.max(0, settings.rateLimitFree - usage.count);
  }

  /**
   * Searches for a movie and returns a formatted string.
   * @param {string} query - The search query.
   * @param {string} userId - The user's JID.
   * @returns {Promise<object>} - { success: true, message: string } or { error: string }
   */
  async search(query, userId) {
    const settings = this.getSettings();
    try {
      const data = await searchMoviesAPI(query);
      const results = data.results?.items || [];
      
      if (results.length === 0) {
        return { error: `Cound not find any movies matching "${query}".` };
      }

      const limitedResults = results.slice(0, settings.maxSearchResults);
      
      // Store results for .movieget command
      this.userSearchResults.set(userId, limitedResults);
      
      let replyText = `*🎬 Search Results for "${query}"*\n\nFound ${results.length} results. Showing top ${limitedResults.length}:\n\n`;
      
      limitedResults.forEach((movie, index) => {
        const year = getYearFromDate(movie.releaseDate);
        const typeLabel = movie.subjectType === 1 ? '' : ' (TV Series)';
        replyText += `*${index + 1}. ${movie.title}* (${year})${typeLabel}\n`;
        replyText += `   ID: \`\`\`${movie.subjectId}\`\`\`\n`;
      });
      
      replyText += `\nTo get download links, reply with:\n*.movieget <ID>*\n\n`;
      replyText += `_For TV shows, this will list seasons. Then use:_\n`;
      replyText += `_.movieget <ID> <season> <episode>_`;
      
      return { success: true, message: replyText };

    } catch (error) {
      console.error(chalk.red('Movie search error:'), error.message);
      return { error: `An error occurred during search: ${error.message}` };
    }
  }

  /**
   * Gets movie info and download links. This is the "chargeable" action.
   * @param {string} movieId - The movie's subject ID.
   * @param {string} userId - The user's JID.
   * @param {boolean} isGroup - Whether the message is from a group.
   * @param {string} groupId - The group's JID (if in a group).
   * @param {string} [season] - The season number (for TV shows).
   * @param {string} [episode] - The episode number (for TV shows).
   * @returns {Promise<object>} - Success or error object.
   */
  async getLinks(movieId, userId, isGroup, groupId, season, episode) {
    const requestId = `${userId}_${Date.now()}`;
    const settings = this.getSettings();
    
    // Check permissions
    if (isGroup && !settings.allowGroups) {
      return { error: '⚠️ Movie commands are currently disabled in groups by admin.' };
    }
    if (isGroup && !this.isGroupAllowed(groupId)) {
        return { error: '⚠️ Movie commands are not enabled for this specific group.' };
    }
    if (!isGroup && !settings.allowPrivate) {
      return { error: '⚠️ Movie commands are currently disabled in private chat by admin.' };
    }

    if (this.activeRequests.has(userId)) {
      return { error: 'You already have a request in progress. Please wait.' };
    }

    try {
      this.activeRequests.set(userId, requestId);

      // --- Get Movie Info First (cheap call) ---
      let movieInfo;
      try {
        movieInfo = await getMovieInfoAPI(movieId);
      } catch (error) {
        return { error: `❌ *Failed to Get Info*\n\nCould not retrieve details for ID \`\`\`${movieId}\`\`\`.\n\n*Error:* ${error.message}` };
      }

      const movie = movieInfo.results?.subject;
      if (!movie) {
        return { error: `❌ No movie data found for ID \`\`\`${movieId}\`\`\`.` };
      }

      const movieTitle = movie.title || 'Unknown Movie';
      const isTvShow = movie.subjectType !== 1;
      const isDownloadAttempt = isTvShow ? (season && episode) : true;

      // --- Case 1: TV Show, but no season/episode provided (Show Info) ---
      if (isTvShow && !isDownloadAttempt) {
        const seasons = movieInfo.results?.resource?.seasons || [];
        const formattedSeasons = seasons.map(s => `• Season ${s.se} (${s.epNum || s.maxEp} episodes)`);
        
        return {
          success: false, // Not a download success
          isTvShowInfo: true,
          title: movie.title,
          plot: movie.description,
          poster: movie.cover?.url,
          year: getYearFromDate(movie.releaseDate),
          rating: movie.imdbRatingValue,
          seasons: formattedSeasons,
          movieId: movie.subjectId
        };
      }

      // --- Case 2: Movie Download or TV Episode Download ---
      if (isDownloadAttempt) {
        // Check rate limits
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

        // Check economy balance if premium
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

        // --- Get Download Sources (expensive call) ---
        let downloadSources;
        try {
          downloadSources = await getDownloadSourcesAPI(movieId, season, episode);
        } catch (error) {
          console.error(chalk.red(`❌ Movie get failed for ID ${movieId}`), error.message);
          return { 
            error: `❌ *Failed to Get Links*\n\n` +
                   `Could not retrieve download links.\n` +
                   `• The ID/Season/Episode might be incorrect.\n` +
                   `• The API may be temporarily unavailable.\n\n` +
                   `*Error:* ${error.message}`
          };
        }
        
        // --- Charge User / Increment Usage ---
        const chargeTitle = isTvShow ? `${movieTitle} S${season}E${episode}` : movieTitle;
        if (settings.premiumEnabled) {
          await PluginHelpers.removeMoney(userId, settings.downloadCost, `Movie get: ${chargeTitle}`);
        } else {
          await this.incrementUsage(userId, chargeTitle, movieId);
        }
        await this.logMovieGet(userId, chargeTitle, settings.premiumEnabled);

        // --- Format and Return Success ---
        const sources = (downloadSources.results || []).map(s => ({
            quality: s.quality,
            url: s.download_url,
            size: s.size
        }));

        return {
          success: true,
          isTvShow: isTvShow,
          title: movie.title,
          year: getYearFromDate(movie.releaseDate),
          rating: movie.imdbRatingValue,
          poster: movie.cover?.url,
          plot: movie.description,
          sources: sources,
          season: season,
          episode: episode
        };
      }

    } catch (error) {
      console.error(chalk.red('Get links error:'), error.message);
      return { error: `An unexpected error occurred: ${error.message}` };
    } finally {
      this.activeRequests.delete(userId);
    }
  }

  async getStats() {
    const now = Date.now();
    
    if (this.statsCache && (now - this.statsCacheTime < this.statsCacheDuration)) {
      return this.statsCache;
    }

    try {
      const stats = await safeOperation(async (db, collection) => {
        const globalStats = await collection.findOne({ _id: 'stats' }) || {
          totalGets: 0,
          freeGets: 0,
          premiumGets: 0,
          lastMovie: 'None'
        };
        return globalStats;
      }, SETTINGS_COLLECTION);

      const usageStats = await safeOperation(async (db, collection) => {
        const totalUsers = await collection.countDocuments();
        const activeUsers = await collection.countDocuments({ 
          lastGet: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
        });
        
        return { totalUsers, activeUsers };
      }, USAGE_COLLECTION);

      const settings = this.getSettings();

      const result = {
        ...stats,
        ...usageStats,
        activeRequests: this.activeRequests.size,
        settings: {
          premiumEnabled: settings.premiumEnabled,
          downloadCost: settings.downloadCost,
          rateLimitFree: settings.rateLimitFree,
          maxSearchResults: settings.maxSearchResults,
          allowGroups: settings.allowGroups,
          allowPrivate: settings.allowPrivate,
          allowedGroupsCount: settings.allowedGroups.length
        },
        lastUpdated: new Date()
      };

      this.statsCache = result;
      this.statsCacheTime = now;

      return result;
    } catch (error) {
      console.error(chalk.red('Error getting movie stats:'), error.message);
      return {
        totalGets: 0,
        activeRequests: this.activeRequests.size,
        error: error.message
      };
    }
  }

  async getUserHistory(userId, limit = 10) {
    try {
      return await safeOperation(async (db, collection) => {
        const usage = await collection.findOne({ userId });
        return usage?.history?.slice(-limit).reverse() || [];
      }, USAGE_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error getting movie history:'), error.message);
      return [];
    }
  }
}

// --- Create Singleton Instance ---
const downloader = new MovieDownloader();

// --- Command Handlers (To be called from 'run') ---

async function handleMovieSettings(reply, downloaderInstance, config, sender, args) {
  const settings = downloaderInstance.getSettings();

  if (args.length === 0) {
    await reply(
      `*⚙️ Movie Downloader Settings*\n\n` +
      `*Premium Mode:* ${settings.premiumEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `*Download Cost:* ₦${settings.downloadCost}\n` +
      `*Free Limit:* ${settings.rateLimitFree} per day\n` +
      `*Cooldown:* ${settings.rateLimitCooldown / (60 * 60 * 1000)}h\n\n` +
      `*Search Limit:* ${settings.maxSearchResults} results\n` +
      `*Allow Groups:* ${settings.allowGroups ? '✅' : '❌'}\n` +
      `*Allow Private:* ${settings.allowPrivate ? '✅' : '❌'}\n` +
      `*Specific Groups:* ${settings.allowedGroups.length > 0 ? settings.allowedGroups.length + ' groups' : 'All'}\n\n` +
      `*Last Updated:* ${new Date(settings.updatedAt).toLocaleString()}\n` +
      `*Updated By:* ${settings.updatedBy}\n\n` +
      `*Commands:*\n` +
      `${config.PREFIX}moviesettings premium on/off\n` +
      `${config.PREFIX}moviesettings cost <amount>\n` +
      `${config.PREFIX}moviesettings limit <number>\n` +
      `${config.PREFIX}moviesettings searchlimit <number>\n` +
      `${config.PREFIX}moviesettings groups on/off\n` +
      `${config.PREFIX}moviesettings private on/off\n` +
      `${config.PREFIX}moviesettings addgroup <groupId>\n` +
      `${config.PREFIX}moviesettings delgroup <groupId>\n` +
      `${config.PREFIX}moviesettings listgroups`
    );
    return;
  }

  const action = args[0];
  const value = args[1];
  const updates = {};

  try {
    switch (action) {
      case 'premium':
        if (value === 'on' || value === 'off') {
          updates.premiumEnabled = value === 'on';
          await downloaderInstance.saveSettings(updates, sender);
          await reply(`✅ Premium mode ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: .moviesettings premium on/off');
        }
        break;
      case 'cost':
        const cost = parseInt(value);
        if (!isNaN(cost) && cost >= 0) {
          updates.downloadCost = cost;
          await downloaderInstance.saveSettings(updates, sender);
          await reply(`✅ Download cost set to ₦${cost}`);
        } else {
          await reply('❌ Invalid cost. Usage: .moviesettings cost <number>');
        }
        break;
      case 'limit':
        const limit = parseInt(value);
        if (!isNaN(limit) && limit > 0) {
          updates.rateLimitFree = limit;
          await downloaderInstance.saveSettings(updates, sender);
          await reply(`✅ Free get limit set to ${limit} per day`);
        } else {
          await reply('❌ Invalid limit. Usage: .moviesettings limit <number>');
        }
        break;
      case 'searchlimit':
        const searchLimit = parseInt(value);
        if (!isNaN(searchLimit) && searchLimit > 0 && searchLimit <= 20) {
          updates.maxSearchResults = searchLimit;
          await downloaderInstance.saveSettings(updates, sender);
          await reply(`✅ Max search results set to ${searchLimit}`);
        } else {
          await reply('❌ Invalid limit. Usage: .moviesettings searchlimit <1-20>');
        }
        break;
      case 'groups':
        if (value === 'on' || value === 'off') {
          updates.allowGroups = value === 'on';
          await downloaderInstance.saveSettings(updates, sender);
          await reply(`✅ Group commands ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: .moviesettings groups on/off');
        }
        break;
      case 'private':
        if (value === 'on' || value === 'off') {
          updates.allowPrivate = value === 'on';
          await downloaderInstance.saveSettings(updates, sender);
          await reply(`✅ Private commands ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: .moviesettings private on/off');
        }
        break;
      case 'addgroup':
        if (value) {
          const groups = [...settings.allowedGroups];
          if (!groups.includes(value)) {
            groups.push(value);
            updates.allowedGroups = groups;
            await downloaderInstance.saveSettings(updates, sender);
            await reply(`✅ Group ${value} added to allowed list.`);
          } else {
            await reply('⚠️ Group is already in the list.');
          }
        } else {
          await reply('❌ Usage: .moviesettings addgroup <groupId>');
        }
        break;
      case 'delgroup':
        if (value) {
          let groups = [...settings.allowedGroups];
          const index = groups.indexOf(value);
          if (index > -1) {
            groups.splice(index, 1);
            updates.allowedGroups = groups;
            await downloaderInstance.saveSettings(updates, sender);
            await reply(`✅ Group ${value} removed from allowed list.`);
          } else {
            await reply('⚠️ Group not found in the list.');
          }
        } else {
          await reply('❌ Usage: .moviesettings delgroup <groupId>');
        }
        break;
      case 'listgroups':
        if (settings.allowedGroups.length === 0) {
            await reply('📋 Allowed Groups List is empty. All groups are allowed (if .moviesettings groups on).');
        } else {
            await reply(`*📋 Allowed Groups:*\n\n` + settings.allowedGroups.join('\n'));
        }
        break;
      default:
        await reply(`❌ Unknown setting: ${action}\n\nUse ${config.PREFIX}moviesettings to see available commands`);
    }
  } catch (error) {
     console.error(chalk.red('Error updating movie setting:'), error.message);
     await reply(`❌ Error updating setting: ${error.message}`);
  }
}

async function handleMovieSearch(reply, downloaderInstance, config, sock, m, sender, isGroup, groupId, query) {
  if (isGroup && !downloaderInstance.isGroupAllowed(groupId)) {
      await reply('⚠️ Movie commands are not enabled for this specific group.');
      return;
  }
    
  if (!query) {
    const remaining = await downloaderInstance.getRemainingGets(sender);
    const settings = downloaderInstance.getSettings();
    
    let replyText = `*🎬 Movie & TV Show Downloader*\n\n`;
    replyText += `*Usage:* ${config.PREFIX}movie <search term>\n`;
    replyText += `*Example:* ${config.PREFIX}movie Black Panther\n\n`;
    replyText += `After searching, use:\n*.movieget <ID>* (for movies or TV show info)\n`;
    replyText += `*.movieget <ID> <season> <episode>* (for TV episodes)\n\n`;
    replyText += `*Your Status:*\n`;
    if (settings.premiumEnabled) {
      replyText += `💎 Premium: ₦${settings.downloadCost} per movie/episode\n`;
    } else {
      replyText += `🆓 Free: ${remaining}/${settings.rateLimitFree} remaining today\n`;
    }
    
    await reply(replyText);
    return;
  }

  await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
  const result = await downloaderInstance.search(query, sender);
  
  if (result.error) {
    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
    await reply(result.error);
    return;
  }

  if (result.success) {
    await sock.sendMessage(m.from, { react: { text: '✅', key: m.key } });
    await reply(result.message);
  }
}

async function handleMovieGet(reply, downloaderInstance, config, sock, m, sender, isGroup, bot, groupId, args) {
  if (isGroup && !downloaderInstance.isGroupAllowed(groupId)) {
      await reply('⚠️ Movie commands are not enabled for this specific group.');
      return;
  }
  
  const [movieId, season, episode] = args;

  if (!movieId) {
    await reply(`Please provide a Movie ID.\n\n*Usage:* ${config.PREFIX}movieget <ID> [season] [episode]\n\nGet the ID by searching first with *.movie <name>*`);
    return;
  }

  await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
  const result = await downloaderInstance.getLinks(movieId, sender, isGroup, groupId, season, episode);
  
  if (result.error) {
    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
    await reply(result.error);
    return;
  }
  
  // --- Handle TV Show Info Response ---
  if (result.isTvShowInfo) {
    await sock.sendMessage(m.from, { react: { text: 'ℹ️', key: m.key } });
    
    let caption = `*📺 ${result.title} (${result.year})*\n`;
    caption += `⭐ Rating: ${result.rating}\n\n`;
    caption += `*Plot:* ${result.plot}\n\n`;
    
    if (result.seasons.length > 0) {
        caption += `*Available Seasons:*\n${result.seasons.join('\n')}\n\n`;
    } else {
        caption += `*No seasons found for this series.*\n\n`;
    }
    caption += `*Usage:* ${config.PREFIX}movieget ${result.movieId} <season> <episode>`;

    try {
      await sock.sendMessage(m.from, {
        image: { url: result.poster },
        caption: caption
      }, { quoted: m });
    } catch (sendError) {
      await reply(`(Failed to send poster)\n\n${caption}`);
    }
    return;
  }

  // --- Handle Download Success Response (Movie or TV Episode) ---
  if (result.success) {
    const settings = downloaderInstance.getSettings();
    const remaining = await downloaderInstance.getRemainingGets(sender);
    
    let caption = result.isTvShow 
      ? `*📺 ${result.title} (S${result.season}E${result.episode})*\n`
      : `*🎬 ${result.title} (${result.year})*\n`;
      
    caption += `⭐ Rating: ${result.rating}\n\n`;
    caption += `*Plot:* ${result.plot}\n\n`;
    caption += `*🔗 Download Links:*\n`;
    
    if (result.sources.length === 0) {
        caption += `No download sources found.\n`;
    } else {
        result.sources.forEach(source => {
            caption += `• *${source.quality}* (${formatBytes(source.size)}): ${source.url}\n`;
        });
    }

    caption += `\n`;
    
    if (settings.premiumEnabled) {
      caption += `💳 Charged: ₦${settings.downloadCost}\n`;
    } else {
      caption += `🆓 Remaining: ${remaining}/${settings.rateLimitFree}\n`;
    }
    caption += `\n⚡ Powered by ${bot?.name || 'Groq'}`;

    try {
      await sock.sendMessage(m.from, {
        image: { url: result.poster },
        caption: caption
      }, { quoted: m });

      await sock.sendMessage(m.from, { react: { text: '✅', key: m.key } });
      
    } catch (sendError) {
      console.error(chalk.red('Error sending movie info:'), sendError.message);
      await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
      // Send text-only fallback
      await reply(`✅ *Download Links Ready*\n\n(Failed to send poster)\n\n${caption}`);
    }
  }
}


async function handleMovieStats(reply, downloaderInstance) {
  const stats = await downloaderInstance.getStats();
  
  await reply(
    `*📊 Movie Downloader Statistics*\n\n` +
    `*Total Gets:* ${stats.totalGets || 0}\n` +
    `*Free Gets:* ${stats.freeGets || 0}\n` +
    `*Premium Gets:* ${stats.premiumGets || 0}\n` +
    `*Active Requests:* ${stats.activeRequests}\n\n` +
    `*Last Get:* ${stats.lastMovie || 'None'}\n\n` +
    `*Users:*\n` +
    `• Total: ${stats.totalUsers || 0}\n` +
    `• Active (7d): ${stats.activeUsers || 0}\n\n` +
    `*Settings:*\n` +
    `• Mode: ${stats.settings?.premiumEnabled ? '💎 Premium' : '🆓 Free'}\n` +
    `• Cost: ₦${stats.settings?.downloadCost || 0}\n` +
    `• Daily Limit: ${stats.settings?.rateLimitFree || 0}\n` +
    `• Groups Allowed: ${stats.settings?.allowGroups ? '✅' : '❌'}\n` +
    `• Specific Groups: ${stats.settings?.allowedGroupsCount}\n\n` +
    `*Last Updated:* ${new Date(stats.lastUpdated).toLocaleString()}`
  );
}

async function handleMovieHistory(reply, downloaderInstance, sender) {
  const history = await downloaderInstance.getUserHistory(sender, 10);
  
  if (history.length === 0) {
    await reply(`📜 *Your Movie History*\n\nNo movies or episodes retrieved yet!`);
    return;
  }

  const historyText = history.map((item, i) => 
    `${i + 1}. ${item.title}\n   ${new Date(item.timestamp).toLocaleString()}`
  ).join('\n\n');

  await reply(`📜 *Your Movie History*\n\n${historyText}\n\n_Showing last ${history.length} items_`);
}

// ===================================
// ===== V3 PLUGIN EXPORT OBJECT =====
// ===================================

export default {
  name: 'Movie Downloader',
  version: '1.1.0', // Updated version
  author: 'Your Name (Adapted from A. Macksyn)',
  description: 'Search and get download links for movies & TV shows with economy integration',
  category: 'media',
  
  commands: ['movie', 'movieget', 'moviesettings', 'moviestats', 'moviehistory'],
  aliases: [],

  /**
   * V3 init function.
   */
  async init(context) {
    const { logger } = context;
    await downloader.initialize();
    
    const settings = downloader.getSettings();
    logger.info('✅ Movie Downloader V1.1 initialized');
    logger.info(`Mode: ${settings.premiumEnabled ? '💎 Premium' : '🆓 Free'}`);
  },

  /**
   * V3 Main run function.
   */
  async run(context) {
    const { msg: m, sock, config, bot, logger, command, args, text } = context;

    try {
      // Ensure initialization
      if (!downloader.settings) {
        await downloader.initialize();
      }

      const sender = m.sender;
      const from = m.from;
      const isGroup = m.isGroup;
      
      if (!sender) {
        logger.warn('⚠️ No sender found in message (from V3 context)');
        return;
      }
      
      const isAdmin = downloader.isAdmin(sender);
      
      const reply = async (text) => {
        if (typeof m.reply === 'function') {
            await m.reply(text);
        } else {
            await sock.sendMessage(from, { text }, { quoted: m });
        }
      };

      // --- Command Routing ---

      // Admin Settings: .moviesettings
      if (command === 'moviesettings') {
        if (!isAdmin) {
          await reply('⛔ *Access Denied*\n\nThis command is only available to administrators.');
          return;
        }
        await handleMovieSettings(reply, downloader, config, sender, args);
        return;
      }

      // Search Command: .movie <query>
      if (command === 'movie') {
        const query = text; // 'text' is the full string after the command
        await handleMovieSearch(reply, downloader, config, sock, m, sender, isGroup, from, query);
        return;
      }

      // Get Links Command: .movieget <id> [season] [episode]
      if (command === 'movieget') {
        // 'args' is the array of arguments: [id, season, episode]
        await handleMovieGet(reply, downloader, config, sock, m, sender, isGroup, bot, from, args);
        return;
      }

      // Statistics Command: .moviestats
      if (command === 'moviestats') {
        if (!isAdmin) {
          await reply('⛔ *Access Denied*\n\nThis command is only available to administrators.');
          return;
        }
        await handleMovieStats(reply, downloader);
        return;
      }

      // User History Command: .moviehistory
      if (command === 'moviehistory') {
        await handleMovieHistory(reply, downloader, sender);
        return;
      }

    } catch (error) {
      logger.error(error, `❌ ${this.name} plugin error`);
      try {
        const reply = (msg) => sock.sendMessage(m.from, { text: msg }, { quoted: m });
        await reply(`❌ *Plugin Error*\n\nAn unexpected error occurred in the movie plugin. Please try again or contact admin.\n\n_Error: ${error.message}_`);
      } catch (replyError) {
        logger.error(replyError, 'Failed to send error message');
      }
    }
  }
};
