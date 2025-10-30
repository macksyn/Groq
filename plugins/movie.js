// plugins/movie_downloader.js
import axios from 'axios';
import chalk from 'chalk';
import { PluginHelpers, safeOperation } from '../lib/pluginIntegration.js';

// ========================================
// CONSTANTS & CONFIGURATION
// ========================================

const SETTINGS_COLLECTION = 'movie_settings';
const USAGE_COLLECTION = 'movie_usage';
const FAVORITES_COLLECTION = 'movie_favorites';
const SEARCH_CACHE_COLLECTION = 'movie_search_cache';

const DEFAULT_SETTINGS = {
  premiumEnabled: false,
  downloadCost: 100,
  searchCost: 10,
  rateLimitFree: 5,
  rateLimitCooldown: 24 * 60 * 60 * 1000,
  allowedQualities: ['360p', '480p', '720p'],
  defaultQuality: '720p',
  maxSearchResults: 10,
  allowGroups: true,
  allowPrivate: true,
  enableCache: true,
  cacheExpiry: 7 * 24 * 60 * 60 * 1000,
  maxFileSize: 500,
  allowTvShows: true,
  allowMovies: true,
  updatedAt: new Date(),
  updatedBy: 'system'
};

const API_CONFIG = {
  baseUrl: 'https://movieapi.giftedtech.co.ke/api',
  timeout: 30000,
  endpoints: {
    search: '/search',
    info: '/info',
    sources: '/sources',
    download: '/download'
  }
};

const QUALITY_INFO = {
  '360p': { label: '360p SD', size: '~300MB', icon: '📱' },
  '480p': { label: '480p HD', size: '~600MB', icon: '💻' },
  '720p': { label: '720p Full HD', size: '~1GB', icon: '📺' }
};

// ========================================
// MOVIE DOWNLOADER CLASS
// ========================================

class MovieDownloader {
  constructor() {
    this.settings = null;
    this.activeDownloads = new Map();
    this.activeSearches = new Map();
    this.statsCache = null;
    this.statsCacheTime = 0;
    this.statsCacheDuration = 5 * 60 * 1000;
  }

  async initialize() {
    try {
      this.settings = await this.loadSettings();
      console.log(chalk.green('✅ Movie downloader settings loaded from database'));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Failed to load movie downloader settings:'), error.message);
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
          console.log(chalk.cyan('📝 Created default movie downloader settings'));
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

        console.log(chalk.green('✅ Movie downloader settings updated'));
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

  async getUserUsage(userId) {
    try {
      return await safeOperation(async (db, collection) => {
        const now = Date.now();
        let usage = await collection.findOne({ userId });

        if (!usage) {
          usage = {
            userId,
            count: 0,
            searchCount: 0,
            resetTime: now + this.getSettings().rateLimitCooldown,
            totalDownloads: 0,
            totalSearches: 0,
            lastDownload: null,
            lastSearch: null,
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
                searchCount: 0,
                resetTime: now + this.getSettings().rateLimitCooldown 
              } 
            }
          );
          usage.count = 0;
          usage.searchCount = 0;
          usage.resetTime = now + this.getSettings().rateLimitCooldown;
        }

        return usage;
      }, USAGE_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error getting user usage:'), error.message);
      return { 
        count: 0, 
        searchCount: 0,
        resetTime: Date.now() + this.getSettings().rateLimitCooldown 
      };
    }
  }

  async checkRateLimit(userId, type = 'download') {
    const settings = this.getSettings();
    if (settings.premiumEnabled) return true;

    const usage = await this.getUserUsage(userId);
    const now = Date.now();
    const limitKey = type === 'search' ? 'searchCount' : 'count';
    const currentCount = usage[limitKey] || 0;

    if (currentCount >= settings.rateLimitFree) {
      const hoursLeft = Math.ceil((usage.resetTime - now) / (60 * 60 * 1000));
      return { 
        limited: true, 
        hoursLeft, 
        current: currentCount, 
        limit: settings.rateLimitFree,
        type 
      };
    }

    return true;
  }

  async incrementUsage(userId, type = 'download', movieData = {}) {
    try {
      return await safeOperation(async (db, collection) => {
        const updateFields = {
          lastDownload: new Date()
        };

        if (type === 'download') {
          updateFields.totalDownloads = 1;
          updateFields.count = 1;
        } else if (type === 'search') {
          updateFields.totalSearches = 1;
          updateFields.searchCount = 1;
          updateFields.lastSearch = new Date();
        }

        const historyItem = {
          type,
          timestamp: new Date(),
          ...movieData
        };

        await collection.updateOne(
          { userId },
          { 
            $inc: updateFields,
            $push: { 
              history: { 
                $each: [historyItem],
                $slice: -50
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

  async getRemainingDownloads(userId) {
    const settings = this.getSettings();
    if (settings.premiumEnabled) return 'Unlimited (Premium)';

    const usage = await this.getUserUsage(userId);
    return Math.max(0, settings.rateLimitFree - (usage.count || 0));
  }

  async searchMovies(query, userId) {
    const searchId = `${userId}_${Date.now()}`;

    if (this.activeSearches.has(userId)) {
      return { error: 'You already have a search in progress. Please wait.' };
    }

    try {
      this.activeSearches.set(userId, searchId);

      if (this.getSettings().enableCache) {
        const cached = await this.getSearchCache(query);
        if (cached) {
          console.log(chalk.cyan(`📦 Using cached search results for: ${query}`));
          return { success: true, results: cached, fromCache: true };
        }
      }

      const rateLimitCheck = await this.checkRateLimit(userId, 'search');
      if (rateLimitCheck.limited) {
        return { 
          error: `📊 *Search Limit Reached!*\n\nCurrent: ${rateLimitCheck.current}/${rateLimitCheck.limit}\nReset in: ${rateLimitCheck.hoursLeft} hours\n\n_Contact admin to upgrade to premium_`,
          limited: true
        };
      }

      console.log(chalk.cyan(`🔍 Searching for: ${query}`));
      const response = await axios.get(
        `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.search}/${encodeURIComponent(query)}`,
        {
          timeout: API_CONFIG.timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );

      if (response.data.status !== 200 || !response.data.success) {
        throw new Error(response.data.message || 'Search failed');
      }

      const results = response.data.results?.items || [];

      if (results.length === 0) {
        return { 
          error: `❌ *No Results Found*\n\nNo movies or TV shows found for "${query}"\n\n_Try different keywords_` 
        };
      }

      const limitedResults = results.slice(0, this.getSettings().maxSearchResults);

      if (this.getSettings().enableCache) {
        await this.saveSearchCache(query, limitedResults);
      }

      await this.incrementUsage(userId, 'search', { query, resultsCount: limitedResults.length });

      console.log(chalk.green(`✅ Found ${limitedResults.length} results for: ${query}`));

      return {
        success: true,
        results: limitedResults,
        query,
        total: results.length,
        showing: limitedResults.length
      };

    } catch (error) {
      console.error(chalk.red('Search error:'), error.message);
      return { 
        error: `❌ *Search Failed*\n\n${error.message}\n\n_Try again later or contact admin_` 
      };
    } finally {
      this.activeSearches.delete(userId);
    }
  }

  async getMovieInfo(movieId) {
    try {
      console.log(chalk.cyan(`ℹ️ Getting info for movie ID: ${movieId}`));
      const response = await axios.get(
        `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.info}/${movieId}`,
        {
          timeout: API_CONFIG.timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );

      if (response.data.status !== 200 || !response.data.success) {
        throw new Error(response.data.message || 'Failed to get movie info');
      }

      const movieData = response.data.results?.subject;
      if (!movieData) {
        throw new Error('Invalid movie data received');
      }

      console.log(chalk.green(`✅ Got info for: ${movieData.name}`));
      return { success: true, data: movieData };

    } catch (error) {
      console.error(chalk.red('Movie info error:'), error.message);
      return { 
        error: `❌ *Failed to Get Movie Info*\n\n${error.message}` 
      };
    }
  }

  async getDownloadSources(movieId, season = null, episode = null) {
    try {
      let url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.sources}/${movieId}`;

      if (season && episode) {
        url += `?season=${season}&episode=${episode}`;
        console.log(chalk.cyan(`📺 Getting sources for S${season}E${episode}`));
      } else {
        console.log(chalk.cyan(`🎬 Getting sources for movie ID: ${movieId}`));
      }

      const response = await axios.get(url, {
        timeout: API_CONFIG.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.data.status !== 200 || !response.data.success) {
        throw new Error(response.data.message || 'Failed to get download sources');
      }

      const sources = response.data.results;
      if (!sources || sources.length === 0) {
        throw new Error('No download sources available');
      }

      console.log(chalk.green(`✅ Found ${sources.length} download sources`));
      return { success: true, sources };

    } catch (error) {
      console.error(chalk.red('Download sources error:'), error.message);
      return { 
        error: `❌ *Failed to Get Download Links*\n\n${error.message}` 
      };
    }
  }

  async downloadMovie(movieId, quality, userId, isGroup, season = null, episode = null) {
    const downloadId = `${userId}_${Date.now()}`;
    const settings = this.getSettings();

    if (isGroup && !settings.allowGroups) {
      return { error: '⚠️ Group downloads are currently disabled by admin.' };
    }
    if (!isGroup && !settings.allowPrivate) {
      return { error: '⚠️ Private downloads are currently disabled by admin.' };
    }

    if (this.activeDownloads.has(userId)) {
      return { error: 'You already have a download in progress. Please wait.' };
    }

    try {
      this.activeDownloads.set(userId, downloadId);

      if (!settings.allowedQualities.includes(quality)) {
        return { 
          error: `❌ Quality "${quality}" is not allowed.\n\nAvailable: ${settings.allowedQualities.join(', ')}` 
        };
      }

      const rateLimitCheck = await this.checkRateLimit(userId, 'download');
      if (rateLimitCheck.limited) {
        return { 
          error: `📊 *Daily Download Limit Reached!*\n\nCurrent: ${rateLimitCheck.current}/${rateLimitCheck.limit}\nReset in: ${rateLimitCheck.hoursLeft} hours\n\n_Contact admin to upgrade to premium_`,
          limited: true
        };
      }

      if (settings.premiumEnabled) {
        const balance = await PluginHelpers.getBalance(userId);
        if (balance.wallet < settings.downloadCost) {
          return { 
            error: `💳 *Insufficient Balance!*\n\nRequired: ₦${settings.downloadCost}\nYour balance: ₦${balance.wallet}\n\n_Use economy commands to earn money_`,
            insufficientBalance: true
          };
        }
      }

      const infoResult = await this.getMovieInfo(movieId);
      if (infoResult.error) {
        return infoResult;
      }

      const movieData = infoResult.data;
      const isTvShow = movieData.category === 8;

      if (isTvShow && (!season || !episode)) {
        return { 
          error: `📺 *TV Show Detected*\n\nPlease specify season and episode.\n\nUsage: .movie dl ${movieId} ${quality} <season> <episode>` 
        };
      }

      if (isTvShow && !settings.allowTvShows) {
        return { error: '⚠️ TV show downloads are currently disabled by admin.' };
      }

      if (!isTvShow && !settings.allowMovies) {
        return { error: '⚠️ Movie downloads are currently disabled by admin.' };
      }

      const sourcesResult = await this.getDownloadSources(movieId, season, episode);
      if (sourcesResult.error) {
        return sourcesResult;
      }

      const source = sourcesResult.sources.find(s => s.quality === quality);
      if (!source) {
        const availableQualities = sourcesResult.sources.map(s => s.quality).join(', ');
        return { 
          error: `❌ Quality "${quality}" not available.\n\nAvailable: ${availableQualities}` 
        };
      }

      const fileSizeMB = parseInt(source.size) / (1024 * 1024);
      if (fileSizeMB > settings.maxFileSize) {
        return { 
          error: `❌ File too large (${fileSizeMB.toFixed(0)}MB)\n\nMax allowed: ${settings.maxFileSize}MB` 
        };
      }

      if (settings.premiumEnabled) {
        await PluginHelpers.removeMoney(userId, settings.downloadCost, 'Movie download');
      } else {
        await this.incrementUsage(userId, 'download', {
          movieId,
          title: movieData.name,
          quality,
          season,
          episode
        });
      }

      await this.logDownload(userId, movieData, quality, isTvShow);

      return {
        success: true,
        downloadUrl: source.download_url,
        movieData,
        quality: source.quality,
        size: source.size,
        format: source.format,
        isTvShow,
        season,
        episode
      };

    } catch (error) {
      console.error(chalk.red('Download error:'), error.message);
      return { error: `An unexpected error occurred: ${error.message}` };
    } finally {
      this.activeDownloads.delete(userId);
    }
  }

  async getSearchCache(query) {
    try {
      return await safeOperation(async (db, collection) => {
        const cached = await collection.findOne({ query: query.toLowerCase() });

        if (!cached) return null;

        const now = Date.now();
        const age = now - new Date(cached.timestamp).getTime();

        if (age > this.getSettings().cacheExpiry) {
          await collection.deleteOne({ query: query.toLowerCase() });
          return null;
        }

        return cached.results;
      }, SEARCH_CACHE_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error getting search cache:'), error.message);
      return null;
    }
  }

  async saveSearchCache(query, results) {
    try {
      return await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { query: query.toLowerCase() },
          { 
            $set: { 
              query: query.toLowerCase(),
              results,
              timestamp: new Date()
            } 
          },
          { upsert: true }
        );

        console.log(chalk.cyan(`💾 Cached search results for: ${query}`));
      }, SEARCH_CACHE_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error saving search cache:'), error.message);
    }
  }

  async clearSearchCache() {
    try {
      return await safeOperation(async (db, collection) => {
        const result = await collection.deleteMany({});
        console.log(chalk.green(`🗑️ Cleared ${result.deletedCount} cached searches`));
        return result.deletedCount;
      }, SEARCH_CACHE_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error clearing cache:'), error.message);
      return 0;
    }
  }

  async addFavorite(userId, movieData) {
    try {
      return await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { userId },
          {
            $addToSet: {
              favorites: {
                movieId: movieData.subjectId,
                name: movieData.name,
                posterUrl: movieData.posterUrl,
                releaseDate: movieData.releaseDate,
                category: movieData.category,
                addedAt: new Date()
              }
            }
          },
          { upsert: true }
        );

        console.log(chalk.green(`⭐ Added favorite for ${userId}: ${movieData.name}`));
        return true;
      }, FAVORITES_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error adding favorite:'), error.message);
      return false;
    }
  }

  async removeFavorite(userId, movieId) {
    try {
      return await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { userId },
          { $pull: { favorites: { movieId } } }
        );

        console.log(chalk.green(`🗑️ Removed favorite for ${userId}: ${movieId}`));
        return true;
      }, FAVORITES_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error removing favorite:'), error.message);
      return false;
    }
  }

  async getFavorites(userId) {
    try {
      return await safeOperation(async (db, collection) => {
        const doc = await collection.findOne({ userId });
        return doc?.favorites || [];
      }, FAVORITES_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error getting favorites:'), error.message);
      return [];
    }
  }

  async logDownload(userId, movieData, quality, isTvShow) {
    try {
      await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { _id: 'stats' },
          { 
            $inc: { 
              totalDownloads: 1,
              [`qualities.${quality}`]: 1,
              [isTvShow ? 'tvShowDownloads' : 'movieDownloads']: 1
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

  async getStats() {
    const now = Date.now();

    if (this.statsCache && (now - this.statsCacheTime < this.statsCacheDuration)) {
      return this.statsCache;
    }

    try {
      const stats = await safeOperation(async (db, collection) => {
        const globalStats = await collection.findOne({ _id: 'stats' }) || {
          totalDownloads: 0,
          movieDownloads: 0,
          tvShowDownloads: 0,
          qualities: {}
        };

        return globalStats;
      }, SETTINGS_COLLECTION);

      const usageStats = await safeOperation(async (db, collection) => {
        const totalUsers = await collection.countDocuments();
        const activeUsers = await collection.countDocuments({ 
          lastDownload: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
        });

        const totalSearches = await collection.aggregate([
          { $group: { _id: null, total: { $sum: '$totalSearches' } } }
        ]).toArray();

        return { 
          totalUsers, 
          activeUsers,
          totalSearches: totalSearches[0]?.total || 0
        };
      }, USAGE_COLLECTION);

      const cacheStats = await safeOperation(async (db, collection) => {
        const count = await collection.countDocuments();
        return { cachedSearches: count };
      }, SEARCH_CACHE_COLLECTION);

      const settings = this.getSettings();

      const result = {
        ...stats,
        ...usageStats,
        ...cacheStats,
        activeDownloads: this.activeDownloads.size,
        activeSearches: this.activeSearches.size,
        settings: {
          premiumEnabled: settings.premiumEnabled,
          downloadCost: settings.downloadCost,
          searchCost: settings.searchCost,
          rateLimitFree: settings.rateLimitFree,
          allowedQualities: settings.allowedQualities,
          allowGroups: settings.allowGroups,
          allowPrivate: settings.allowPrivate,
          allowTvShows: settings.allowTvShows,
          allowMovies: settings.allowMovies
        },
        lastUpdated: new Date()
      };

      this.statsCache = result;
      this.statsCacheTime = now;

      return result;
    } catch (error) {
      console.error(chalk.red('Error getting stats:'), error.message);
      return {
        totalDownloads: 0,
        activeDownloads: this.activeDownloads.size,
        activeSearches: this.activeSearches.size,
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
      console.error(chalk.red('Error getting user history:'), error.message);
      return [];
    }
  }
}

const movieDownloader = new MovieDownloader();

async function handleMovieSettings(reply, downloader, config, sender, args) {
  const settings = downloader.getSettings();

  if (args.length === 0) {
    await reply(
      `*⚙️ Movie Downloader Settings*\n\n` +
      `*Premium Mode:* ${settings.premiumEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `*Download Cost:* ₦${settings.downloadCost}\n` +
      `*Search Cost:* ₦${settings.searchCost}\n` +
      `*Free Limit:* ${settings.rateLimitFree} per day\n` +
      `*Cooldown:* ${settings.rateLimitCooldown / (60 * 60 * 1000)}h\n\n` +
      `*Allowed Qualities:*\n${settings.allowedQualities.map(q => `• ${q}`).join('\n')}\n` +
      `*Default Quality:* ${settings.defaultQuality}\n` +
      `*Max Search Results:* ${settings.maxSearchResults}\n` +
      `*Max File Size:* ${settings.maxFileSize}MB\n\n` +
      `*Features:*\n` +
      `• Groups: ${settings.allowGroups ? '✅' : '❌'}\n` +
      `• Private: ${settings.allowPrivate ? '✅' : '❌'}\n` +
      `• Movies: ${settings.allowMovies ? '✅' : '❌'}\n` +
      `• TV Shows: ${settings.allowTvShows ? '✅' : '❌'}\n` +
      `• Cache: ${settings.enableCache ? '✅' : '❌'}\n\n` +
      `*Last Updated:* ${new Date(settings.updatedAt).toLocaleString()}\n` +
      `*Updated By:* ${settings.updatedBy}\n\n` +
      `*Commands:*\n` +
      `${config.PREFIX}moviesettings premium on/off\n` +
      `${config.PREFIX}moviesettings cost <amount>\n` +
      `${config.PREFIX}moviesettings limit <number>\n` +
      `${config.PREFIX}moviesettings quality <360p|480p|720p> on/off\n` +
      `${config.PREFIX}moviesettings groups on/off\n` +
      `${config.PREFIX}moviesettings movies on/off\n` +
      `${config.PREFIX}moviesettings tvshows on/off`
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
          await downloader.saveSettings(updates, sender);
          await reply(`✅ Premium mode ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: .moviesettings premium on/off');
        }
        break;
      case 'cost':
        const cost = parseInt(value);
        if (!isNaN(cost) && cost >= 0) {
          updates.downloadCost = cost;
          await downloader.saveSettings(updates, sender);
          await reply(`✅ Download cost set to ₦${cost}`);
        } else {
          await reply('❌ Invalid cost. Usage: .moviesettings cost <number>');
        }
        break;
      case 'limit':
        const limit = parseInt(value);
        if (!isNaN(limit) && limit > 0) {
          updates.rateLimitFree = limit;
          await downloader.saveSettings(updates, sender);
          await reply(`✅ Free download limit set to ${limit} per day`);
        } else {
          await reply('❌ Invalid limit. Usage: .moviesettings limit <number>');
        }
        break;
      case 'quality':
        const quality = value;
        const qualityState = args[2];
        if (['360p', '480p', '720p'].includes(quality) && (qualityState === 'on' || qualityState === 'off')) {
          const qualities = [...settings.allowedQualities] || [];

          if (qualityState === 'on' && !qualities.includes(quality)) {
            qualities.push(quality);
          } else if (qualityState === 'off') {
            const index = qualities.indexOf(quality);
            if (index > -1) qualities.splice(index, 1);
          }

          updates.allowedQualities = qualities;
          await downloader.saveSettings(updates, sender);
          await reply(`✅ Quality ${quality} ${qualityState === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: .moviesettings quality <360p|480p|720p> on/off');
        }
        break;
      case 'groups':
        if (value === 'on' || value === 'off') {
          updates.allowGroups = value === 'on';
          await downloader.saveSettings(updates, sender);
          await reply(`✅ Group downloads ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: .moviesettings groups on/off');
        }
        break;
      case 'private':
        if (value === 'on' || value === 'off') {
          updates.allowPrivate = value === 'on';
          await downloader.saveSettings(updates, sender);
          await reply(`✅ Private downloads ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: .moviesettings private on/off');
        }
        break;
      case 'movies':
        if (value === 'on' || value === 'off') {
          updates.allowMovies = value === 'on';
          await downloader.saveSettings(updates, sender);
          await reply(`✅ Movie downloads ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: .moviesettings movies on/off');
        }
        break;
      case 'tvshows':
        if (value === 'on' || value === 'off') {
          updates.allowTvShows = value === 'on';
          await downloader.saveSettings(updates, sender);
          await reply(`✅ TV show downloads ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: .moviesettings tvshows on/off');
        }
        break;
      case 'cache':
        if (value === 'on' || value === 'off') {
          updates.enableCache = value === 'on';
          await downloader.saveSettings(updates, sender);
          await reply(`✅ Search cache ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else if (value === 'clear') {
          const cleared = await downloader.clearSearchCache();
          await reply(`✅ Cleared ${cleared} cached search results`);
        } else {
          await reply('❌ Usage: .moviesettings cache on/off/clear');
        }
        break;
      case 'maxsize':
        const maxSize = parseInt(value);
        if (!isNaN(maxSize) && maxSize > 0) {
          updates.maxFileSize = maxSize;
          await downloader.saveSettings(updates, sender);
          await reply(`✅ Max file size set to ${maxSize}MB`);
        } else {
          await reply('❌ Invalid size. Usage: .moviesettings maxsize <number>');
        }
        break;
      case 'maxresults':
        const maxResults = parseInt(value);
        if (!isNaN(maxResults) && maxResults > 0 && maxResults <= 20) {
          updates.maxSearchResults = maxResults;
          await downloader.saveSettings(updates, sender);
          await reply(`✅ Max search results set to ${maxResults}`);
        } else {
          await reply('❌ Invalid number. Usage: .moviesettings maxresults <1-20>');
        }
        break;
      default:
        await reply(`❌ Unknown setting: ${action}\n\nUse ${config.PREFIX}moviesettings to see available commands`);
    }
  } catch (error) {
    console.error(chalk.red('Error updating setting:'), error.message);
    await reply(`❌ Error updating setting: ${error.message}`);
  }
}

async function handleMovieSearch(reply, downloader, config, sender, query) {
  if (!query) {
    await reply(
      `*🔍 Movie Search*\n\n` +
      `Search for movies and TV shows\n\n` +
      `*Usage:* ${config.PREFIX}movie search <query>\n` +
      `*Example:* ${config.PREFIX}movie search Black Panther`
    );
    return;
  }

  const result = await downloader.searchMovies(query, sender);

  if (result.error) {
    await reply(result.error);
    return;
  }

  if (result.success) {
    const settings = downloader.getSettings();
    let message = `*🔍 Search Results for "${result.query}"*\n\n`;
    message += `Found ${result.total} results, showing ${result.showing}\n`;
    if (result.fromCache) {
      message += `📦 _Loaded from cache_\n`;
    }
    message += `\n`;

    result.results.forEach((item, index) => {
      const type = item.category === 8 ? '📺 TV Show' : '🎬 Movie';
      const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'N/A';

      message += `*${index + 1}. ${item.name}* ${type}\n`;
      message += `   ID: \`${item.subjectId}\`\n`;
      message += `   Year: ${year}\n`;
      if (item.quality) {
        message += `   Quality: ${item.quality}\n`;
      }
      message += `\n`;
    });

    message += `*Next Steps:*\n`;
    message += `• Get info: ${config.PREFIX}movie info <id>\n`;
    message += `• Download: ${config.PREFIX}movie dl <id> <quality>\n`;
    message += `• Add favorite: ${config.PREFIX}movie fav add <id>\n\n`;
    message += `_Use the ID from the search results_`;

    await reply(message);
  }
}

async function handleMovieInfo(reply, downloader, config, movieId) {
  if (!movieId) {
    await reply(
      `*ℹ️ Movie Info*\n\n` +
      `Get detailed information about a movie or TV show\n\n` +
      `*Usage:* ${config.PREFIX}movie info <id>\n` +
      `*Example:* ${config.PREFIX}movie info 5099284245269335848`
    );
    return;
  }

  const result = await downloader.getMovieInfo(movieId);

  if (result.error) {
    await reply(result.error);
    return;
  }

  if (result.success) {
    const data = result.data;
    const type = data.category === 8 ? '📺 TV Show' : '🎬 Movie';
    const year = data.releaseDate ? new Date(data.releaseDate).getFullYear() : 'N/A';

    let message = `${type} *${data.name}*\n\n`;
    message += `*ID:* \`${data.subjectId}\`\n`;
    message += `*Year:* ${year}\n`;

    if (data.areaList && data.areaList.length > 0) {
      message += `*Region:* ${data.areaList.map(a => a.name).join(', ')}\n`;
    }

    if (data.score) {
      message += `*Rating:* ⭐ ${data.score}/10\n`;
    }

    if (data.tagList && data.tagList.length > 0) {
      message += `*Tags:* ${data.tagList.slice(0, 5).map(t => t.name).join(', ')}\n`;
    }

    if (data.introduction) {
      message += `\n*Synopsis:*\n${data.introduction.substring(0, 200)}${data.introduction.length > 200 ? '...' : ''}\n`;
    }

    message += `\n*Download:*\n`;
    message += `${config.PREFIX}movie dl ${data.subjectId} <quality>\n\n`;
    message += `*Available Qualities:*\n`;
    const settings = downloader.getSettings();
    settings.allowedQualities.forEach(q => {
      const info = QUALITY_INFO[q];
      message += `• ${info.icon} ${info.label} (${info.size})\n`;
    });

    if (data.category === 8) {
      message += `\n_For TV shows, add season and episode:_\n`;
      message += `${config.PREFIX}movie dl ${data.subjectId} 720p 1 1`;
    }

    await reply(message);
  }
}

async function handleMovieDownload(reply, downloader, config, sock, m, sender, isGroup, args) {
  const settings = downloader.getSettings();

  if (args.length === 0) {
    await reply(
      `*📥 Movie Download*\n\n` +
      `Download movies and TV shows in multiple qualities\n\n` +
      `*Usage:*\n` +
      `• Movie: ${config.PREFIX}movie dl <id> <quality>\n` +
      `• TV Show: ${config.PREFIX}movie dl <id> <quality> <season> <episode>\n\n` +
      `*Examples:*\n` +
      `${config.PREFIX}movie dl 5099284245269335848 720p\n` +
      `${config.PREFIX}movie dl 9028867555875774472 480p 1 1\n\n` +
      `*Available Qualities:*\n` +
      `${settings.allowedQualities.map(q => {
        const info = QUALITY_INFO[q];
        return `${info.icon} ${info.label} - ${info.size}`;
      }).join('\n')}\n\n` +
      `${settings.premiumEnabled ? `💎 Cost: ₦${settings.downloadCost} per download` : `🆓 Free downloads available`}`
    );
    return;
  }

  const movieId = args[0];
  const quality = args[1] || settings.defaultQuality;
  const season = args[2] ? parseInt(args[2]) : null;
  const episode = args[3] ? parseInt(args[3]) : null;

  await sock.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

  const result = await downloader.downloadMovie(movieId, quality, sender, isGroup, season, episode);

  await sock.sendMessage(m.from, { react: { text: '', key: m.key } });

  if (result.error) {
    await sock.sendMessage(m.from, { react: { text: '❌', key: m.key } });
    await reply(result.error);
    return;
  }

  if (result.success) {
    const remaining = await downloader.getRemainingDownloads(sender);
    const sizeMB = (parseInt(result.size) / (1024 * 1024)).toFixed(0);

    let caption = `${result.isTvShow ? '📺' : '🎬'} *${result.movieData.name}*\n\n`;

    if (result.isTvShow) {
      caption += `*Season:* ${result.season} | *Episode:* ${result.episode}\n`;
    }

    caption += `*Quality:* ${result.quality}\n`;
    caption += `*Size:* ${sizeMB}MB\n`;
    caption += `*Format:* ${result.format}\n\n`;

    if (settings.premiumEnabled) {
      caption += `💳 *Charged:* ₦${settings.downloadCost}\n`;
    } else {
      caption += `🆓 *Remaining:* ${remaining}/${settings.rateLimitFree}\n`;
    }

    caption += `\n⚡ Powered by GiftedTech API`;

    try {
      await sock.sendMessage(m.from, {
        document: { url: result.downloadUrl },
        mimetype: 'video/mp4',
        fileName: `${result.movieData.name}${result.isTvShow ? ` S${result.season}E${result.episode}` : ''} [${result.quality}].${result.format}`,
        caption: caption
      }, { quoted: m });

      await sock.sendMessage(m.from, {
        react: { text: '✅', key: m.key }
      });

    } catch (sendError) {
      console.error(chalk.red('Error sending movie:'), sendError.message);

      await sock.sendMessage(m.from, {
        react: { text: '❌', key: m.key }
      });

      await reply(
        `❌ *Send Failed*\n\n` +
        `The movie was processed but couldn't be sent. This might be due to:\n` +
        `• File size too large for WhatsApp\n` +
        `• Network issues\n` +
        `• WhatsApp restrictions\n\n` +
        `*Direct Download Link:*\n${result.downloadUrl}\n\n` +
        `_Link expires in 24 hours_`
      );
    }
  }
}

async function handleMovieStats(reply, downloader) {
  const stats = await downloader.getStats();

  let message = `*📊 Movie Downloader Statistics*\n\n`;
  message += `*Downloads:*\n`;
  message += `• Total: ${stats.totalDownloads || 0}\n`;
  message += `• Movies: ${stats.movieDownloads || 0}\n`;
  message += `• TV Shows: ${stats.tvShowDownloads || 0}\n`;
  message += `• Active: ${stats.activeDownloads}\n\n`;

  message += `*Users:*\n`;
  message += `• Total: ${stats.totalUsers || 0}\n`;
  message += `• Active (7d): ${stats.activeUsers || 0}\n`;
  message += `• Total Searches: ${stats.totalSearches || 0}\n\n`;

  if (stats.qualities && Object.keys(stats.qualities).length > 0) {
    message += `*Quality Distribution:*\n`;
    Object.entries(stats.qualities).forEach(([quality, count]) => {
      const info = QUALITY_INFO[quality];
      message += `• ${info?.icon || '📹'} ${quality}: ${count}\n`;
    });
    message += `\n`;
  }

  message += `*System:*\n`;
  message += `• Active Searches: ${stats.activeSearches}\n`;
  message += `• Cached Searches: ${stats.cachedSearches || 0}\n\n`;

  message += `*Settings:*\n`;
  message += `• Mode: ${stats.settings?.premiumEnabled ? '💎 Premium' : '🆓 Free'}\n`;
  message += `• Download Cost: ₦${stats.settings?.downloadCost || 0}\n`;
  message += `• Daily Limit: ${stats.settings?.rateLimitFree || 0}\n`;
  message += `• Movies: ${stats.settings?.allowMovies ? '✅' : '❌'}\n`;
  message += `• TV Shows: ${stats.settings?.allowTvShows ? '✅' : '❌'}\n\n`;

  message += `*Last Updated:* ${new Date(stats.lastUpdated).toLocaleString()}`;

  await reply(message);
}

async function handleMovieHistory(reply, downloader, sender) {
  const history = await downloader.getUserHistory(sender, 15);

  if (history.length === 0) {
    await reply(`📜 *Your Movie History*\n\nNo activity yet!`);
    return;
  }

  let message = `📜 *Your Movie History*\n\n`;

  history.forEach((item, i) => {
    const icon = item.type === 'search' ? '🔍' : '📥';
    const date = new Date(item.timestamp).toLocaleDateString();

    if (item.type === 'search') {
      message += `${i + 1}. ${icon} Search: "${item.query}"\n`;
      message += `   ${date} • ${item.resultsCount || 0} results\n\n`;
    } else {
      message += `${i + 1}. ${icon} ${item.title}\n`;
      message += `   ${date} • ${item.quality}`;
      if (item.season && item.episode) {
        message += ` • S${item.season}E${item.episode}`;
      }
      message += `\n\n`;
    }
  });

  message += `_Showing last ${history.length} activities_`;

  await reply(message);
}

async function handleMovieFavorites(reply, downloader, sender, action, movieId) {
  if (!action) {
    const favorites = await downloader.getFavorites(sender);

    if (favorites.length === 0) {
      await reply(`⭐ *Your Favorites*\n\nNo favorites yet!\n\nAdd favorites with:\n.movie fav add <movie_id>`);
      return;
    }

    let message = `⭐ *Your Favorites* (${favorites.length})\n\n`;

    favorites.forEach((fav, i) => {
      const type = fav.category === 8 ? '📺' : '🎬';
      const year = fav.releaseDate ? new Date(fav.releaseDate).getFullYear() : 'N/A';

      message += `${i + 1}. ${type} *${fav.name}*\n`;
      message += `   ID: \`${fav.movieId}\`\n`;
      message += `   Year: ${year}\n`;
      message += `   Added: ${new Date(fav.addedAt).toLocaleDateString()}\n\n`;
    });

    message += `*Commands:*\n`;
    message += `• Remove: .movie fav remove <id>\n`;
    message += `• Download: .movie dl <id> <quality>`;

    await reply(message);
    return;
  }

  if (action === 'add') {
    if (!movieId) {
      await reply(`❌ Usage: .movie fav add <movie_id>`);
      return;
    }

    const infoResult = await downloader.getMovieInfo(movieId);
    if (infoResult.error) {
      await reply(infoResult.error);
      return;
    }

    const success = await downloader.addFavorite(sender, infoResult.data);
    if (success) {
      await reply(`✅ Added "${infoResult.data.name}" to favorites!`);
    } else {
      await reply(`❌ Failed to add favorite. Try again later.`);
    }
    return;
  }

  if (action === 'remove') {
    if (!movieId) {
      await reply(`❌ Usage: .movie fav remove <movie_id>`);
      return;
    }

    const success = await downloader.removeFavorite(sender, movieId);
    if (success) {
      await reply(`✅ Removed from favorites!`);
    } else {
      await reply(`❌ Failed to remove favorite. Try again later.`);
    }
    return;
  }

  await reply(`❌ Invalid action. Use: add, remove, or no action to list favorites`);
}

export default {
  name: 'Movie Downloader',
  version: '3.0.0',
  author: 'Alex Macksyn',
  description: 'Search and download movies and TV shows with multiple quality options',
  category: 'media',

  commands: ['movie', 'moviesettings', 'moviestats'],
  aliases: ['mov', 'film'],

  async init(context) {
    const { logger } = context;
    await movieDownloader.initialize();

    const settings = movieDownloader.getSettings();
    logger.info('✅ Movie Downloader V3 initialized');
    logger.info(`Mode: ${settings.premiumEnabled ? '💎 Premium' : '🆓 Free'}`);
    logger.info(`Qualities: ${settings.allowedQualities.join(', ')}`);
    logger.info(`Movies: ${settings.allowMovies ? '✅' : '❌'} | TV Shows: ${settings.allowTvShows ? '✅' : '❌'}`);
  },

  async run(context) {
    const { msg: m, sock, config, bot, logger, command, args, text } = context;

    try {
      if (!movieDownloader.settings) {
        await movieDownloader.initialize();
      }

      const sender = m.sender;
      const from = m.from;
      const isGroup = m.isGroup;

      if (!sender) {
        logger.warn('⚠️ No sender found in message');
        return;
      }

      const isAdmin = movieDownloader.isAdmin(sender);

      const reply = async (text) => {
        if (typeof m.reply === 'function') {
          await m.reply(text);
        } else {
          await sock.sendMessage(from, { text }, { quoted: m });
        }
      };

      if (command === 'moviesettings') {
        if (!isAdmin) {
          await reply('⛔ *Access Denied*\n\nThis command is only available to administrators.');
          return;
        }
        await handleMovieSettings(reply, movieDownloader, config, sender, args);
        return;
      }

      if (command === 'moviestats') {
        if (!isAdmin) {
          await reply('⛔ *Access Denied*\n\nThis command is only available to administrators.');
          return;
        }
        await handleMovieStats(reply, movieDownloader);
        return;
      }

      if (command === 'movie' || command === 'mov' || command === 'film') {
        const subCommand = args[0]?.toLowerCase();

        if (!subCommand) {
          const remaining = await movieDownloader.getRemainingDownloads(sender);
          const settings = movieDownloader.getSettings();

          await reply(
            `*🎬 Movie Downloader*\n\n` +
            `*Features:*\n` +
            `🔍 Search movies and TV shows\n` +
            `📥 Download in multiple qualities\n` +
            `⭐ Save favorites\n` +
            `📜 View history\n\n` +
            `*Your Status:*\n` +
            `${settings.premiumEnabled ? `💎 Premium: ₦${settings.downloadCost}/download` : `🆓 Free: ${remaining}/${settings.rateLimitFree} remaining`}\n\n` +
            `*Commands:*\n` +
            `• ${config.PREFIX}movie search <query>\n` +
            `• ${config.PREFIX}movie info <id>\n` +
            `• ${config.PREFIX}movie dl <id> <quality>\n` +
            `• ${config.PREFIX}movie fav [add/remove] <id>\n` +
            `• ${config.PREFIX}movie history\n\n` +
            `*Examples:*\n` +
            `${config.PREFIX}movie search Avatar\n` +
            `${config.PREFIX}movie dl 123456 720p\n` +
            `${config.PREFIX}movie dl 789012 480p 1 1\n\n` +
            `_TV shows require season & episode_`
          );
          return;
        }

        if (subCommand === 'search' || subCommand === 's') {
          const query = args.slice(1).join(' ');
          await handleMovieSearch(reply, movieDownloader, config, sender, query);
          return;
        }

        if (subCommand === 'info' || subCommand === 'i') {
          const movieId = args[1];
          await handleMovieInfo(reply, movieDownloader, config, movieId);
          return;
        }

        if (subCommand === 'dl' || subCommand === 'download' || subCommand === 'd') {
          const downloadArgs = args.slice(1);
          await handleMovieDownload(reply, movieDownloader, config, sock, m, sender, isGroup, downloadArgs);
          return;
        }

        if (subCommand === 'fav' || subCommand === 'favorite' || subCommand === 'f') {
          const action = args[1];
          const movieId = args[2];
          await handleMovieFavorites(reply, movieDownloader, sender, action, movieId);
          return;
        }

        if (subCommand === 'history' || subCommand === 'h') {
          await handleMovieHistory(reply, movieDownloader, sender);
          return;
        }

        await reply(
          `❌ Unknown subcommand: ${subCommand}\n\n` +
          `Use ${config.PREFIX}movie to see all available commands`
        );
      }

    } catch (error) {
      logger.error(error, `❌ ${this.name} plugin error`);
      try {
        const reply = (msg) => sock.sendMessage(m.from, { text: msg }, { quoted: m });
        await reply(
          `❌ *Plugin Error*\n\n` +
          `An unexpected error occurred in the movie downloader. Please try again or contact admin.\n\n` +
          `_Error: ${error.message}_`
        );
      } catch (replyError) {
        logger.error(replyError, 'Failed to send error message');
      }
    }
  }
};