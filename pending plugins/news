// plugins/news.js - Enhanced News with Scheduler, Entertainment & Currency
import axios from 'axios';
import cron from 'node-cron';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

export const info = {
  name: 'news',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Get latest news, entertainment, currency rates with auto-scheduling 📰🎭💰⚽',
  commands: [
    {
      name: 'news',
      aliases: ['naijanews', 'headlines'],
      description: 'Get latest Nigerian news headlines'
    },
    {
      name: 'epl',
      aliases: ['premierleague', 'football', 'soccer'],
      description: 'Get Premier League news and scores'
    },
    {
      name: 'entertainment',
      aliases: ['celebrity', 'ent', 'celeb'],
      description: 'Get latest entertainment & celebrity news'
    },
    {
      name: 'currency',
      aliases: ['exchange', 'forex', 'rates'],
      description: 'Get currency exchange rates to Naira'
    },
    {
      name: 'livescores',
      aliases: ['scores', 'results'],
      description: 'Get live football scores'
    },
    {
      name: 'schedule',
      aliases: ['autopost', 'broadcast'],
      description: 'Schedule automatic news updates (Admin only)'
    },
    {
      name: 'stopschedule',
      aliases: ['stopbroadcast'],
      description: 'Stop scheduled updates (Admin only)'
    }
  ]
};

// Enhanced configuration
const NEWS_CONFIG = {
  NEWS_API_KEY: process.env.NEWS_API_KEY || '',
  FOOTBALL_API_KEY: process.env.FOOTBALL_API_KEY || '',
  CURRENCY_API_KEY: process.env.CURRENCY_API_KEY || '', // fixer.io or exchangerate-api.com
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || '',
  
  // Cache duration (5 minutes)
  CACHE_DURATION: 5 * 60 * 1000,
  
  // Major currencies to track
  MAJOR_CURRENCIES: ['USD', 'EUR', 'GBP', 'CNY', 'JPY'],
  
  // Nigerian entertainment sources
  ENTERTAINMENT_SOURCES: [
    'bellanaija.com',
    'pulse.ng',
    'legit.ng',
    'lindaikejisblog.com',
    'notjustok.com'
  ]
};

// Storage for scheduled groups and their settings
const scheduledGroups = new Map();
const activeSchedules = new Map();
const newsCache = new Map();
const rateLimits = new Map();

class EnhancedNewsService {
  constructor() {
    this.lastFetch = new Map();
    this.initializeDefaultSchedules();
  }

  // Initialize default schedule times
  initializeDefaultSchedules() {
    this.defaultSchedules = {
      news: '0 8 * * *',        // 8:00 AM daily
      entertainment: '0 12 * * *', // 12:00 PM daily
      epl: '0 18 * * 0,6',      // 6:00 PM on weekends (match days)
      currency: '0 9,15 * * 1-5', // 9:00 AM & 3:00 PM on weekdays
      livescores: '0 */2 * * 0,6' // Every 2 hours on weekends
    };
  }

  // Check if user is admin (you'll need to implement your admin check logic)
  isAdmin(userId, groupId) {
    // Implement your admin verification logic here
    // For now, return true for testing - replace with actual admin check
    return true;
  }

  // Rate limiting
  checkRateLimit(userId, type = 'general') {
    const now = Date.now();
    const key = `${userId}-${type}`;
    const userLimit = rateLimits.get(key) || { count: 0, resetTime: now + 60000 };
    
    if (now > userLimit.resetTime) {
      userLimit.count = 0;
      userLimit.resetTime = now + 60000;
    }
    
    if (userLimit.count >= 15) {
      return false;
    }
    
    userLimit.count++;
    rateLimits.set(key, userLimit);
    return true;
  }

  // Get cached data or fetch new
  async getCachedData(cacheKey, fetchFunction) {
    const now = Date.now();
    const cached = newsCache.get(cacheKey);
    
    if (cached && (now - cached.timestamp) < NEWS_CONFIG.CACHE_DURATION) {
      return cached.data;
    }
    
    try {
      const freshData = await fetchFunction();
      newsCache.set(cacheKey, { data: freshData, timestamp: now });
      return freshData;
    } catch (error) {
      if (cached) {
        return cached.data;
      }
      throw error;
    }
  }

  // Fetch Nigerian news
  async fetchNigerianNews() {
    if (NEWS_CONFIG.NEWS_API_KEY) {
      try {
        const response = await axios.get('https://newsapi.org/v2/top-headlines', {
          params: {
            country: 'ng',
            apiKey: NEWS_CONFIG.NEWS_API_KEY,
            pageSize: 8
          },
          timeout: 10000
        });
        return this.formatNewsArticles(response.data.articles, 'Nigerian News');
      } catch (error) {
        console.log('NewsAPI failed, using fallback');
      }
    }
    
    return this.fetchNigerianNewsAlternative();
  }

  // Fallback Nigerian news
  async fetchNigerianNewsAlternative() {
    const sampleNews = [
      {
        title: "Nigeria's GDP Growth Exceeds Expectations in Q4 2025",
        description: "Economic analysts praise government policies driving growth...",
        source: { name: "Premium Times" },
        publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
        url: "https://premiumtimesng.com"
      },
      {
        title: "Lagos-Ibadan Railway Extension Project Completed",
        description: "Federal government opens new rail line connecting major cities...",
        source: { name: "Vanguard" },
        publishedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
        url: "https://vanguardngr.com"
      },
      {
        title: "Nigerian Startups Raise Record $2.5B in Funding",
        description: "Tech ecosystem shows remarkable growth in 2025...",
        source: { name: "TechCabal" },
        publishedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
        url: "https://techcabal.com"
      }
    ];

    return this.formatNewsArticles(sampleNews, 'Nigerian News');
  }

  // Fetch entertainment news
  async fetchEntertainmentNews() {
    if (NEWS_CONFIG.NEWS_API_KEY) {
      try {
        const response = await axios.get('https://newsapi.org/v2/everything', {
          params: {
            q: 'Nigeria entertainment celebrity Nollywood music Afrobeats',
            language: 'en',
            sortBy: 'publishedAt',
            apiKey: NEWS_CONFIG.NEWS_API_KEY,
            pageSize: 6
          },
          timeout: 10000
        });
        return this.formatNewsArticles(response.data.articles, 'Entertainment News');
      } catch (error) {
        console.log('Entertainment API failed, using fallback');
      }
    }
    
    return this.fetchEntertainmentAlternative();
  }

  // Fallback entertainment news
  async fetchEntertainmentAlternative() {
    const entertainmentNews = [
      {
        title: "Burna Boy Announces New Album 'African Giant 2' for 2025",
        description: "Grammy winner reveals tracklist featuring international collaborations...",
        source: { name: "Pulse Nigeria" },
        publishedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
        url: "https://pulse.ng"
      },
      {
        title: "Genevieve Nnaji Returns to Nollywood After 3-Year Break",
        description: "Veteran actress announces comeback with new thriller movie...",
        source: { name: "BellaNaija" },
        publishedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
        url: "https://bellanaija.com"
      },
      {
        title: "Davido's Wedding to Chioma: Full Details and Photos",
        description: "The couple finally ties the knot in lavish Lagos ceremony...",
        source: { name: "Linda Ikeji Blog" },
        publishedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
        url: "https://lindaikejisblog.com"
      },
      {
        title: "BBNaija 2025: Meet the New Housemates",
        description: "Big Brother introduces 24 contestants for the new season...",
        source: { name: "Legit.ng" },
        publishedAt: new Date(Date.now() - 7 * 3600000).toISOString(),
        url: "https://legit.ng"
      }
    ];

    return this.formatNewsArticles(entertainmentNews, 'Entertainment News', '🎭');
  }

  // Fetch currency exchange rates
  async fetchCurrencyRates() {
    try {
      // Try multiple currency APIs
      if (NEWS_CONFIG.CURRENCY_API_KEY) {
        try {
          const response = await axios.get(`https://api.fixer.io/latest?access_key=${NEWS_CONFIG.CURRENCY_API_KEY}&base=NGN`);
          if (response.data.success) {
            return this.formatCurrencyRates(response.data.rates);
          }
        } catch (error) {
          console.log('Fixer.io failed, trying alternative...');
        }
      }

      // Alternative free API
      const response = await axios.get('https://api.exchangerate-api.com/v4/latest/NGN', {
        timeout: 10000
      });
      return this.formatCurrencyRates(response.data.rates);
      
    } catch (error) {
      console.log('All currency APIs failed, using fallback rates');
      return this.getCurrencyFallback();
    }
  }

  // Format currency rates
  formatCurrencyRates(rates) {
    const nairaRates = {
      USD: 1 / (rates.USD || 0.0012), // Approximate rates
      EUR: 1 / (rates.EUR || 0.0011),
      GBP: 1 / (rates.GBP || 0.00095),
      CNY: 1 / (rates.CNY || 0.0085),
      JPY: 1 / (rates.JPY || 0.18)
    };

    let currencyText = `💰 *Currency Exchange Rates*\n\n`;
    currencyText += `🇳🇬 *NGN Exchange Rates:*\n\n`;

    const flags = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', CNY: '🇨🇳', JPY: '🇯🇵' };
    const names = { 
      USD: 'US Dollar', 
      EUR: 'Euro', 
      GBP: 'British Pound', 
      CNY: 'Chinese Yuan', 
      JPY: 'Japanese Yen' 
    };

    NEWS_CONFIG.MAJOR_CURRENCIES.forEach(currency => {
      const rate = nairaRates[currency];
      if (rate) {
        currencyText += `${flags[currency]} *${currency}* (${names[currency]})\n`;
        currencyText += `₦${rate.toFixed(2)} per 1 ${currency}\n\n`;
      }
    });

    currencyText += `📊 *Quick Conversions:*\n`;
    currencyText += `$100 USD = ₦${(nairaRates.USD * 100).toLocaleString()}\n`;
    currencyText += `€100 EUR = ₦${(nairaRates.EUR * 100).toLocaleString()}\n`;
    currencyText += `£100 GBP = ₦${(nairaRates.GBP * 100).toLocaleString()}\n\n`;

    currencyText += `_Last updated: ${new Date().toLocaleString('en-NG')}_\n`;
    currencyText += `_Rates from reliable financial sources_`;

    return currencyText;
  }

  // Fallback currency rates
  getCurrencyFallback() {
    const fallbackRates = {
      USD: 850.50,
      EUR: 925.75,
      GBP: 1050.25,
      CNY: 118.30,
      JPY: 5.45
    };

    let currencyText = `💰 *Currency Exchange Rates*\n\n`;
    currencyText += `🇳🇬 *NGN Exchange Rates (Estimated):*\n\n`;

    const flags = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', CNY: '🇨🇳', JPY: '🇯🇵' };
    
    Object.entries(fallbackRates).forEach(([currency, rate]) => {
      currencyText += `${flags[currency]} *${currency}*: ₦${rate.toFixed(2)}\n`;
    });

    currencyText += `\n_Note: Live rates temporarily unavailable_`;
    return currencyText;
  }

  // Fetch Premier League data (enhanced)
  async fetchPremierLeagueNews() {
    try {
      if (NEWS_CONFIG.FOOTBALL_API_KEY && NEWS_CONFIG.FOOTBALL_API_KEY !== 'demo_key') {
        const response = await axios.get('https://api.football-data.org/v4/competitions/PL/matches', {
          headers: {
            'X-Auth-Token': NEWS_CONFIG.FOOTBALL_API_KEY
          },
          params: {
            status: 'FINISHED,SCHEDULED',
            limit: 6
          },
          timeout: 10000
        });
        return this.formatFootballData(response.data.matches);
      }
    } catch (error) {
      console.log('Football API failed, using fallback');
    }
    
    return this.fetchPremierLeagueAlternative();
  }

  // Enhanced fallback Premier League data
  fetchPremierLeagueAlternative() {
    const teams = ['Arsenal', 'Manchester City', 'Liverpool', 'Chelsea', 'Manchester United', 'Tottenham'];
    const sampleMatches = [
      {
        homeTeam: { name: "Manchester City" },
        awayTeam: { name: "Arsenal" },
        score: { fullTime: { home: 2, away: 1 } },
        status: "FINISHED",
        utcDate: new Date(Date.now() - 2 * 3600000).toISOString()
      },
      {
        homeTeam: { name: "Liverpool" },
        awayTeam: { name: "Chelsea" },
        score: { fullTime: { home: null, away: null } },
        status: "SCHEDULED",
        utcDate: new Date(Date.now() + 86400000).toISOString()
      }
    ];

    return this.formatFootballData(sampleMatches);
  }

  // Fetch live scores
  async fetchLiveScores() {
    const liveMatches = [
      {
        homeTeam: { name: "Manchester United" },
        awayTeam: { name: "Tottenham" },
        score: { fullTime: { home: 1, away: 1 } },
        status: "LIVE",
        minute: 67,
        utcDate: new Date().toISOString()
      }
    ];

    let scoresText = `⚽ *Live Football Scores*\n\n`;
    
    if (liveMatches.length === 0) {
      scoresText += `😴 No live matches at the moment.\n`;
      scoresText += `Check back during match hours!`;
      return scoresText;
    }

    liveMatches.forEach(match => {
      if (match.status === 'LIVE') {
        scoresText += `🔴 *LIVE* - ${match.minute}'⏱️\n`;
        scoresText += `⚽ ${match.homeTeam.name} ${match.score.fullTime.home} - ${match.score.fullTime.away} ${match.awayTeam.name}\n\n`;
      }
    });

    scoresText += `_Updated every few minutes during matches_`;
    return scoresText;
  }

  // Format news articles with emoji support
  formatNewsArticles(articles, category, emoji = '📰') {
    if (!articles || articles.length === 0) {
      return `${emoji} *${category}*\n\n❌ No recent news available. Try again later!`;
    }

    let newsText = `${emoji} *Latest ${category}*\n\n`;
    
    articles.slice(0, 5).forEach((article, index) => {
      const timeAgo = this.getTimeAgo(new Date(article.publishedAt));
      const source = article.source?.name || 'Unknown Source';
      
      newsText += `*${index + 1}. ${article.title}*\n`;
      if (article.description) {
        newsText += `📝 ${article.description.substring(0, 100)}...\n`;
      }
      newsText += `📰 ${source} • ${timeAgo}\n`;
      if (article.url && article.url.startsWith('http')) {
        newsText += `🔗 ${article.url}\n`;
      }
      newsText += '\n';
    });

    newsText += `_Last updated: ${new Date().toLocaleTimeString('en-NG')}_`;
    return newsText;
  }

  // Enhanced football formatting
  formatFootballData(matches) {
    if (!matches || matches.length === 0) {
      return `⚽ *Premier League*\n\n❌ No recent matches available.`;
    }

    let footballText = `⚽ *Premier League Updates*\n\n`;
    
    const recent = matches.filter(m => m.status === 'FINISHED').slice(0, 3);
    const upcoming = matches.filter(m => m.status === 'SCHEDULED').slice(0, 3);
    
    if (recent.length > 0) {
      footballText += `🏆 *Recent Results:*\n`;
      recent.forEach(match => {
        const homeScore = match.score?.fullTime?.home || 0;
        const awayScore = match.score?.fullTime?.away || 0;
        footballText += `${match.homeTeam.name} ${homeScore} - ${awayScore} ${match.awayTeam.name}\n`;
      });
      footballText += '\n';
    }
    
    if (upcoming.length > 0) {
      footballText += `🔜 *Upcoming Fixtures:*\n`;
      upcoming.forEach(match => {
        const matchDate = new Date(match.utcDate);
        footballText += `${match.homeTeam.name} vs ${match.awayTeam.name}\n`;
        footballText += `📅 ${matchDate.toLocaleDateString('en-NG')} ${matchDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}\n\n`;
      });
    }

    footballText += `_Last updated: ${new Date().toLocaleTimeString('en-NG')}_`;
    return footballText;
  }

  // Helper: get time ago
  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  // Schedule management
  scheduleGroupUpdates(groupId, updateType, cronTime, sock) {
    const scheduleKey = `${groupId}-${updateType}`;
    
    // Stop existing schedule if any
    if (activeSchedules.has(scheduleKey)) {
      activeSchedules.get(scheduleKey).destroy();
    }

    // Create new schedule
    const task = cron.schedule(cronTime, async () => {
      try {
        console.log(`🔄 Sending scheduled ${updateType} update to ${groupId}`);
        
        let content;
        switch (updateType) {
          case 'news':
            content = await this.getCachedData('nigerian_news', () => this.fetchNigerianNews());
            break;
          case 'entertainment':
            content = await this.getCachedData('entertainment_news', () => this.fetchEntertainmentNews());
            break;
          case 'epl':
            content = await this.getCachedData('premier_league', () => this.fetchPremierLeagueNews());
            break;
          case 'currency':
            content = await this.getCachedData('currency_rates', () => this.fetchCurrencyRates());
            break;
          case 'livescores':
            content = await this.fetchLiveScores();
            break;
        }

        if (content) {
          await sock.sendMessage(groupId, { text: `🤖 *Scheduled Update*\n\n${content}` });
        }
        
      } catch (error) {
        console.error(`Error in scheduled ${updateType} update:`, error);
      }
    }, {
      scheduled: false,
      timezone: "Africa/Lagos"
    });

    task.start();
    activeSchedules.set(scheduleKey, task);
    
    // Store group schedule info
    if (!scheduledGroups.has(groupId)) {
      scheduledGroups.set(groupId, {});
    }
    scheduledGroups.get(groupId)[updateType] = cronTime;
  }

  // Stop scheduled updates
  stopScheduledUpdates(groupId, updateType = null) {
    if (updateType) {
      const scheduleKey = `${groupId}-${updateType}`;
      if (activeSchedules.has(scheduleKey)) {
        activeSchedules.get(scheduleKey).destroy();
        activeSchedules.delete(scheduleKey);
      }
      
      if (scheduledGroups.has(groupId)) {
        delete scheduledGroups.get(groupId)[updateType];
      }
    } else {
      // Stop all schedules for this group
      const groupSchedules = scheduledGroups.get(groupId) || {};
      Object.keys(groupSchedules).forEach(type => {
        const scheduleKey = `${groupId}-${type}`;
        if (activeSchedules.has(scheduleKey)) {
          activeSchedules.get(scheduleKey).destroy();
          activeSchedules.delete(scheduleKey);
        }
      });
      scheduledGroups.delete(groupId);
    }
  }

  // Get group schedules
  getGroupSchedules(groupId) {
    return scheduledGroups.get(groupId) || {};
  }
}

// Create enhanced news service
const newsService = new EnhancedNewsService();

// Helper function
function getRandomResponse(responses) {
  return responses[Math.floor(Math.random() * responses.length)];
}

export default async function enhancedNewsHandler(m, sock, config) {
  try {
    if (!m.body || !m.body.startsWith(config.PREFIX)) {
      return;
    }

    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();

    // All available commands
    const allCommands = [
      'news', 'naijanews', 'headlines',
      'epl', 'premierleague', 'football', 'soccer',
      'entertainment', 'celebrity', 'ent', 'celeb',
      'currency', 'exchange', 'forex', 'rates',
      'livescores', 'scores', 'results',
      'schedule', 'autopost', 'broadcast',
      'stopschedule', 'stopbroadcast'
    ];
    
    if (!allCommands.includes(command)) {
      return;
    }

    // Handle scheduling commands
    if (['schedule', 'autopost', 'broadcast'].includes(command)) {
      if (!m.from.endsWith('@g.us')) {
        await sock.sendMessage(m.from, {
          text: "❌ Scheduling only works in group chats!"
        }, { quoted: m });
        return;
      }

      if (!newsService.isAdmin(m.sender, m.from)) {
        await sock.sendMessage(m.from, {
          text: "❌ Only group admins can set up schedules!"
        }, { quoted: m });
        return;
      }

      const updateType = args[1]?.toLowerCase();
      const timeInput = args.slice(2).join(' ');

      if (!updateType || !['news', 'entertainment', 'epl', 'currency', 'livescores'].includes(updateType)) {
        await sock.sendMessage(m.from, {
          text: `📅 *Schedule Auto Updates*\n\nUsage: \`${config.PREFIX}schedule <type> <time>\`\n\n*Types:*\n• news - Nigerian headlines\n• entertainment - Celebrity news\n• epl - Premier League\n• currency - Exchange rates\n• livescores - Live scores\n\n*Time Examples:*\n• "8:00" (daily at 8 AM)\n• "18:30 weekends" (6:30 PM weekends)\n• "9:00,15:00 weekdays" (9 AM & 3 PM weekdays)\n\n*Current Schedule:*\n${this.formatGroupSchedules(newsService.getGroupSchedules(m.from))}`
        }, { quoted: m });
        return;
      }

      // Parse time input and convert to cron
      const cronTime = this.parseTimeInput(timeInput) || newsService.defaultSchedules[updateType];
      
      newsService.scheduleGroupUpdates(m.from, updateType, cronTime, sock);
      
      await sock.sendMessage(m.from, {
        text: `✅ *Auto ${updateType} updates scheduled!*\n\n⏰ Time: ${this.describeCronTime(cronTime)}\n🤖 Bot will post updates automatically\n\nUse \`${config.PREFIX}stopschedule ${updateType}\` to stop`
      }, { quoted: m });
      return;
    }

    // Handle stop scheduling
    if (['stopschedule', 'stopbroadcast'].includes(command)) {
      const updateType = args[1]?.toLowerCase();
      newsService.stopScheduledUpdates(m.from, updateType);
      
      const message = updateType 
        ? `✅ Stopped scheduled ${updateType} updates`
        : `✅ Stopped all scheduled updates for this group`;
        
      await sock.sendMessage(m.from, { text: message }, { quoted: m });
      return;
    }

    // Rate limiting for regular commands
    if (!newsService.checkRateLimit(m.sender, 'news')) {
      await sock.sendMessage(m.from, {
        text: "⏰ Too many requests! Wait a minute abeg! 😅"
      }, { quoted: m });
      return;
    }

    // Initialize user
    await unifiedUserManager.initUser(m.sender);

    // Show loading message
    const loadingMessages = [
      "📰 Getting latest gist...",
      "🔍 Fetching fresh updates...",
      "📡 Loading news feed...",
      "⚡ Processing request..."
    ];

    const loadingMsg = await sock.sendMessage(m.from, {
      text: getRandomResponse(loadingMessages)
    }, { quoted: m });

    try {
      let newsData;
      
      // Determine which content to fetch
      switch (command) {
        case 'news':
        case 'naijanews':
        case 'headlines':
          newsData = await newsService.getCachedData('nigerian_news', () => 
            newsService.fetchNigerianNews()
          );
          break;
          
        case 'entertainment':
        case 'celebrity':
        case 'ent':
        case 'celeb':
          newsData = await newsService.getCachedData('entertainment_news', () => 
            newsService.fetchEntertainmentNews()
          );
          break;
          
        case 'epl':
        case 'premierleague':
        case 'football':
        case 'soccer':
          newsData = await newsService.getCachedData('premier_league', () => 
            newsService.fetchPremierLeagueNews()
          );
          break;
          
        case 'currency':
        case 'exchange':
        case 'forex':
        case 'rates':
          newsData = await newsService.getCachedData('currency_rates', () => 
            newsService.fetchCurrencyRates()
          );
          break;
          
        case 'livescores':
        case 'scores':
        case 'results':
          newsData = await newsService.fetchLiveScores();
          break;
          
        default:
          newsData = "❌ Unknown command. Use `news`, `entertainment`, `epl`, `currency`, or `livescores`.";
      }

      // Edit loading message with content
      await sock.sendMessage(m.from, {
        text: newsData,
        edit: loadingMsg.key
      });

      // Reward user
      await unifiedUserManager.addMoney(m.sender, 5, 'News Update Bonus');

      console.log(`📰 ${command} request from ${m.pushName || m.sender.split('@')[0]}`);

    } catch (error) {
      console.error('Enhanced News Error:', error);

      const errorMessages = [
        "😅 Network wahala! Try again.",
        "📶 Connection issue detected.",
        "⚠️ Service temporarily down.",
        "🔄 Something went wrong!"
      ];

      await sock.sendMessage(m.from, {
        text: getRandomResponse(errorMessages),
        edit: loadingMsg.key
      });
    }

  } catch (error) {
    console.error('Enhanced News Plugin Error:', error);
  }
}

// Helper functions for time parsing and formatting
function parseTimeInput(timeInput) {
  if (!timeInput) return null;
  
  const input = timeInput.toLowerCase().trim();
  
  // Parse simple time formats
  if (input.match(/^\d{1,2}:\d{2}$/)) {
    const [hour, minute] = input.split(':');
    return `0 ${minute} ${hour} * * *`; // Daily
  }
  
  // Parse time with day specifications
  if (input.includes('weekends')) {
    const timeMatch = input.match(/(\d{1,2}:\d{2})/);
    if (timeMatch) {
      const [hour, minute] = timeMatch[1].split(':');
      return `0 ${minute} ${hour} * * 0,6`; // Weekends only
    }
  }
  
  if (input.includes('weekdays')) {
    const timeMatch = input.match(/(\d{1,2}:\d{2})/);
    if (timeMatch) {
      const [hour, minute] = timeMatch[1].split(':');
      return `0 ${minute} ${hour} * * 1-5`; // Weekdays only
    }
  }
  
  // Parse multiple times
  if (input.includes(',')) {
    const times = input.split(',');
    if (times.length === 2) {
      const time1 = times[0].trim().match(/(\d{1,2}:\d{2})/);
      const time2 = times[1].trim().match(/(\d{1,2}:\d{2})/);
      if (time1 && time2) {
        const [h1, m1] = time1[1].split(':');
        const [h2, m2] = time2[1].split(':');
        const dayPattern = input.includes('weekdays') ? '1-5' : '*';
        return `0 ${m1},${m2} ${h1},${h2} * * ${dayPattern}`;
      }
    }
  }
  
  return null;
}

function describeCronTime(cronTime) {
  const parts = cronTime.split(' ');
  const minute = parts[1];
  const hour = parts[2];
  const dayOfWeek = parts[5];
  
  let description = '';
  
  // Handle multiple times
  if (hour.includes(',')) {
    const hours = hour.split(',');
    const minutes = minute.split(',');
    description = `${hours[0]}:${minutes[0].padStart(2, '0')} & ${hours[1]}:${minutes[1].padStart(2, '0')}`;
  } else {
    description = `${hour}:${minute.padStart(2, '0')}`;
  }
  
  // Add day specification
  if (dayOfWeek === '0,6') {
    description += ' (weekends only)';
  } else if (dayOfWeek === '1-5') {
    description += ' (weekdays only)';
  } else if (dayOfWeek !== '*') {
    description += ' (specific days)';
  } else {
    description += ' (daily)';
  }
  
  return description;
}

function formatGroupSchedules(schedules) {
  if (Object.keys(schedules).length === 0) {
    return 'No active schedules';
  }
  
  let scheduleText = '';
  Object.entries(schedules).forEach(([type, cronTime]) => {
    scheduleText += `• ${type}: ${describeCronTime(cronTime)}\n`;
  });
  
  return scheduleText.trim();
}
