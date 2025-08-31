// plugins/Football_betting.js

import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Sports Betting System',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Complete sports betting simulation with EPL, La Liga, Bundesliga, Serie A teams and multi-bet slips',
  commands: [
    {
      name: 'bet',
      aliases: ['sportbet', 'sportsbet'],
      description: 'Access sports betting system'
    },
    {
      name: 'fixtures',
      aliases: ['matches', 'games'],
      description: 'View upcoming matches'
    },
    {
      name: 'betslip',
      aliases: ['slip'],
      description: 'Manage your bet slip'
    },
    {
      name: 'mybets',
      aliases: ['bets'],
      description: 'View your active bets'
    },
    {
      name: 'bethistory',
      aliases: ['betlog'],
      description: 'View betting history'
    },
    {
      name: 'leagues',
      aliases: ['competitions'],
      description: 'View available leagues'
    },
    {
      name: 'results',
      aliases: ['recent', 'scores'],
      description: 'View recent match results'
    }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'whatsapp_bot';
const BET_COLLECTIONS = {
  MATCHES: 'betting_matches',
  BETS: 'betting_bets',
  BETSLIPS: 'betting_betslips',
  TEAM_STATS: 'betting_team_stats'
};

// Economy collections (to interact with economy plugin)
const ECONOMY_COLLECTIONS = {
  USERS: 'economy_users',
  TRANSACTIONS: 'economy_transactions'
};

// Database connection
let db = null;
let mongoClient = null;

// Initialize betting database
async function initBettingDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    // Create indexes
    await db.collection(BET_COLLECTIONS.MATCHES).createIndex({ matchId: 1 }, { unique: true });
    await db.collection(BET_COLLECTIONS.BETS).createIndex({ userId: 1, timestamp: -1 });
    await db.collection(BET_COLLECTIONS.BETSLIPS).createIndex({ userId: 1 });
    await db.collection(ECONOMY_COLLECTIONS.USERS).createIndex({ userId: 1 }, { unique: true });
    
    console.log('✅ Sports Betting MongoDB connected successfully');
    
    // Start automatic match simulation
    startAutoSimulation();
    
    return db;
  } catch (error) {
    console.error('❌ Sports Betting MongoDB connection failed:', error);
    throw error;
  }
}

// Economy integration functions (self-contained)
const ecoSettings = {
  currency: '₦',
  startingBalance: 0,
  startingBankBalance: 0
};

// Initialize user in economy system
async function initEconomyUser(userId) {
  try {
    if (!db) {
      await initBettingDatabase();
    }
    
    const existingUser = await db.collection(ECONOMY_COLLECTIONS.USERS).findOne({ userId });
    
    if (!existingUser) {
      const newUser = {
        userId,
        balance: ecoSettings.startingBalance,
        bank: ecoSettings.startingBankBalance,
        inventory: [],
        clan: null,
        bounty: 0,
        rank: 'Newbie',
        lastAttendance: null,
        totalAttendances: 0,
        streak: 0,
        longestStreak: 0,
        birthdayData: null,
        lastDaily: null,
        lastWork: null,
        lastRob: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection(ECONOMY_COLLECTIONS.USERS).insertOne(newUser);
      return newUser;
    }
    
    return existingUser;
  } catch (error) {
    console.error('Error initializing economy user:', error);
    throw error;
  }
}

// Get user data from economy system
async function getEconomyUserData(userId) {
  try {
    if (!db) {
      await initBettingDatabase();
    }
    
    await initEconomyUser(userId);
    return await db.collection(ECONOMY_COLLECTIONS.USERS).findOne({ userId });
  } catch (error) {
    console.error('Error getting economy user data:', error);
    throw error;
  }
}

// Update user data in economy system
async function updateEconomyUserData(userId, data) {
  try {
    if (!db) {
      await initBettingDatabase();
    }
    
    const result = await db.collection(ECONOMY_COLLECTIONS.USERS).updateOne(
      { userId },
      { 
        $set: { 
          ...data, 
          updatedAt: new Date() 
        } 
      },
      { upsert: true }
    );
    return result;
  } catch (error) {
    console.error('Error updating economy user data:', error);
    throw error;
  }
}

// Add money to user balance
async function addMoneyToUser(userId, amount, reason = 'Sports bet win') {
  try {
    if (!db) {
      await initBettingDatabase();
    }
    
    const user = await getEconomyUserData(userId);
    const newBalance = user.balance + amount;
    
    await updateEconomyUserData(userId, { balance: newBalance });
    
    // Log transaction
    await db.collection(ECONOMY_COLLECTIONS.TRANSACTIONS).insertOne({
      userId,
      type: 'credit',
      amount,
      reason,
      balanceBefore: user.balance,
      balanceAfter: newBalance,
      timestamp: new Date()
    });
    
    console.log(`💰 Added ${ecoSettings.currency}${amount} to ${userId.split('@')[0]} (${reason})`);
    return newBalance;
  } catch (error) {
    console.error('Error adding money:', error);
    throw error;
  }
}

// Remove money from user balance
async function removeMoneyFromUser(userId, amount, reason = 'Sports bet stake') {
  try {
    if (!db) {
      await initBettingDatabase();
    }
    
    const user = await getEconomyUserData(userId);
    if (user.balance >= amount) {
      const newBalance = user.balance - amount;
      
      await updateEconomyUserData(userId, { balance: newBalance });
      
      // Log transaction
      await db.collection(ECONOMY_COLLECTIONS.TRANSACTIONS).insertOne({
        userId,
        type: 'debit',
        amount,
        reason,
        balanceBefore: user.balance,
        balanceAfter: newBalance,
        timestamp: new Date()
      });
      
      console.log(`💸 Removed ${ecoSettings.currency}${amount} from ${userId.split('@')[0]} (${reason})`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error removing money:', error);
    throw error;
  }
}

// Team data with realistic strengths (1-100 scale)
const TEAMS = {
  // Premier League (20 teams)
  EPL: {
    name: 'English Premier League',
    teams: {
      'Arsenal': { strength: 92, form: 90 },
      'Aston Villa': { strength: 80, form: 78 },
      'Bournemouth': { strength: 68, form: 65 },
      'Brentford': { strength: 70, form: 72 },
      'Brighton': { strength: 75, form: 78 },
      'Chelsea': { strength: 84, form: 80 },
      'Crystal Palace': { strength: 72, form: 70 },
      'Everton': { strength: 69, form: 66 },
      'Fulham': { strength: 71, form: 73 },
      'Ipswich Town': { strength: 62, form: 60 },
      'Leicester City': { strength: 73, form: 75 },
      'Liverpool': { strength: 91, form: 88 },
      'Manchester City': { strength: 96, form: 95 },
      'Manchester United': { strength: 85, form: 82 },
      'Newcastle United': { strength: 82, form: 80 },
      'Nottingham Forest': { strength: 67, form: 68 },
      'Southampton': { strength: 64, form: 62 },
      'Tottenham': { strength: 83, form: 81 },
      'West Ham': { strength: 78, form: 75 },
      'Wolves': { strength: 74, form: 72 },
    }
  },
  
  // La Liga (Top 10)
  LALIGA: {
    name: 'Spanish La Liga',
    teams: {
      'Real Madrid': { strength: 97, form: 95 },
      'Barcelona': { strength: 90, form: 88 },
      'Girona': { strength: 80, form: 82 },
      'Atletico Madrid': { strength: 88, form: 85 },
      'Athletic Bilbao': { strength: 82, form: 80 },
      'Real Sociedad': { strength: 81, form: 83 },
      'Real Betis': { strength: 79, form: 77 },
      'Villarreal': { strength: 78, form: 76 },
      'Valencia': { strength: 77, form: 75 },
      'Sevilla': { strength: 80, form: 78 },
    }
  },
  
  // Bundesliga (Top 5)
  BUNDESLIGA: {
    name: 'German Bundesliga',
    teams: {
      'Bayern Munich': { strength: 94, form: 92 },
      'Bayer Leverkusen': { strength: 91, form: 93 },
      'Borussia Dortmund': { strength: 88, form: 86 },
      'RB Leipzig': { strength: 87, form: 88 },
      'VfB Stuttgart': { strength: 84, form: 85 },
    }
  },
  
  // Serie A (Top 5)
  SERIEA: {
    name: 'Italian Serie A',
    teams: {
      'Inter Milan': { strength: 92, form: 90 },
      'AC Milan': { strength: 87, form: 85 },
      'Juventus': { strength: 86, form: 84 },
      'Atalanta': { strength: 83, form: 81 },
      'Napoli': { strength: 84, form: 82 },
    }
  }
};

// Bet types and their odds multipliers
const BET_TYPES = {
  WIN: { name: 'Match Winner', description: 'Predict the winner of the match' },
  DRAW: { name: 'Draw', description: 'Match ends in a draw' },
  OVER15: { name: 'Over 1.5 Goals', description: 'Total goals over 1.5' },
  UNDER15: { name: 'Under 1.5 Goals', description: 'Total goals under 1.5' },
  OVER25: { name: 'Over 2.5 Goals', description: 'Total goals over 2.5' },
  UNDER25: { name: 'Under 2.5 Goals', description: 'Total goals under 2.5' },
  BTTS_YES: { name: 'Both Teams to Score - Yes', description: 'Both teams score' },
  BTTS_NO: { name: 'Both Teams to Score - No', description: 'One or both teams fail to score' }
};

// Generate realistic odds based on team strengths
function generateOdds(homeTeam, awayTeam, homeStrength, awayStrength) {
  const strengthDiff = homeStrength - awayStrength;
  const homeAdvantage = 5; // Home team gets +5 strength bonus
  
  const adjustedHomeStrength = homeStrength + homeAdvantage;
  const totalStrength = adjustedHomeStrength + awayStrength;
  
  const homeWinProb = (adjustedHomeStrength / totalStrength) * 0.6 + 0.2; // 20-80% range
  const awayWinProb = (awayStrength / totalStrength) * 0.6 + 0.2;
  const drawProb = 1 - homeWinProb - awayWinProb + 0.15; // Boost draw probability
  
  // Normalize probabilities
  const total = homeWinProb + drawProb + awayWinProb;
  const normHome = homeWinProb / total;
  const normDraw = drawProb / total;
  const normAway = awayWinProb / total;
  
  // Convert to odds (with bookmaker margin)
  const margin = 0.1; // 10% bookmaker margin
  const odds = {
    HOME_WIN: Math.max(1.1, (1 / normHome) * (1 - margin)),
    DRAW: Math.max(2.5, (1 / normDraw) * (1 - margin)),
    AWAY_WIN: Math.max(1.1, (1 / normAway) * (1 - margin)),
    OVER15: Math.random() * 1.0 + 1.2, // 1.2 - 2.2
    UNDER15: Math.random() * 1.5 + 2.0, // 2.0 - 3.5
    OVER25: Math.random() * 1.5 + 1.4, // 1.4 - 2.9
    UNDER25: Math.random() * 1.2 + 1.8, // 1.8 - 3.0
    BTTS_YES: Math.random() * 1.0 + 1.6, // 1.6 - 2.6
    BTTS_NO: Math.random() * 1.0 + 1.4 // 1.4 - 2.4
  };
  
  // Round odds to 2 decimal places
  Object.keys(odds).forEach(key => {
    odds[key] = Math.round(odds[key] * 100) / 100;
  });
  
  return odds;
}

// Generate random matches
function generateMatches() {
  const matches = [];
  const leagues = Object.keys(TEAMS);
  let matchId = 1;
  
  leagues.forEach(league => {
    const teams = Object.keys(TEAMS[league].teams);
    const numMatches = league === 'EPL' ? 6 : 4; // More EPL matches
    
    for (let i = 0; i < numMatches; i++) {
      // Randomly select two different teams
      const homeTeamIndex = Math.floor(Math.random() * teams.length);
      let awayTeamIndex;
      do {
        awayTeamIndex = Math.floor(Math.random() * teams.length);
      } while (awayTeamIndex === homeTeamIndex);
      
      const homeTeam = teams[homeTeamIndex];
      const awayTeam = teams[awayTeamIndex];
      const homeStrength = TEAMS[league].teams[homeTeam].strength;
      const awayStrength = TEAMS[league].teams[awayTeam].strength;
      
      const odds = generateOdds(homeTeam, awayTeam, homeStrength, awayStrength);
      
      // Generate match time (next 3 days)
      const matchTime = moment().add(Math.floor(Math.random() * 72), 'hours');
      
      matches.push({
        matchId: matchId++,
        league: TEAMS[league].name,
        leagueCode: league,
        homeTeam,
        awayTeam,
        homeStrength,
        awayStrength,
        odds,
        matchTime: matchTime.toDate(),
        status: 'upcoming',
        result: null
      });
    }
  });
  
  return matches;
}

// Initialize matches in database
async function initializeMatches() {
  try {
    const existingMatches = await db.collection(BET_COLLECTIONS.MATCHES).countDocuments();
    
    if (existingMatches < 10) {
      const matches = generateMatches();
      await db.collection(BET_COLLECTIONS.MATCHES).deleteMany({}); // Clear old matches
      await db.collection(BET_COLLECTIONS.MATCHES).insertMany(matches);
      console.log(`✅ Generated ${matches.length} new matches`);
    }
  } catch (error) {
    console.error('Error initializing matches:', error);
  }
}

// Simulate match result
function simulateMatchResult(homeStrength, awayStrength, odds) {
  const rand = Math.random();
  const homeAdvantage = 5;
  const adjustedHome = homeStrength + homeAdvantage;
  
  // Determine winner based on probabilities
  const homeWinProb = 1 / odds.HOME_WIN;
  const drawProb = 1 / odds.DRAW;
  
  let result;
  if (rand < homeWinProb) {
    result = 'HOME_WIN';
  } else if (rand < homeWinProb + drawProb) {
    result = 'DRAW';
  } else {
    result = 'AWAY_WIN';
  }
  
  // Generate realistic score
  let homeGoals, awayGoals;
  switch (result) {
    case 'HOME_WIN':
      homeGoals = Math.floor(Math.random() * 3) + 1; // 1-3
      awayGoals = Math.floor(Math.random() * homeGoals); // 0 to homeGoals-1
      break;
    case 'AWAY_WIN':
      awayGoals = Math.floor(Math.random() * 3) + 1; // 1-3
      homeGoals = Math.floor(Math.random() * awayGoals); // 0 to awayGoals-1
      break;
    case 'DRAW':
      const drawScore = Math.floor(Math.random() * 4); // 0-3
      homeGoals = awayGoals = drawScore;
      break;
  }
  
  const totalGoals = homeGoals + awayGoals;
  const over15 = totalGoals > 1.5;
  const over25 = totalGoals > 2.5;
  const btts = homeGoals > 0 && awayGoals > 0;
  
  return {
    result,
    homeGoals,
    awayGoals,
    totalGoals,
    over15,
    over25,
    btts
  };
}

// Check if user is admin/owner (implement your admin check function)
function isAdmin(userId) {
  try {
    if (!userId || typeof userId !== 'string') return false;
    
    // Implement your admin check logic here
    const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
    return adminNumbers.includes(userId.split('@')[0]);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

function isOwner(userId) {
  try {
    if (!userId || typeof userId !== 'string') return false;
    
    // Implement your owner check logic here
    const ownerNumber = process.env.OWNER_NUMBER || '';
    return userId.split('@')[0] === ownerNumber;
  } catch (error) {
    console.error('Error checking owner status:', error);
    return false;
  }
}
  try {
    if (!m || !m.message) return null;

    // Check for mentions
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      return m.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    
    // Check for quoted message
    if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      return m.message.extendedTextMessage.contextInfo.participant;
    }
    
    // Extract from text input
    if (text && typeof text === 'string') {
      const phoneNumber = text.replace(/[^0-9]/g, '');
      if (phoneNumber.length >= 10) {
        return phoneNumber + '@s.whatsapp.net';
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting target user:', error);
    return null;
  }
}

// Main plugin handler function
export default async function bettingHandler(m, sock, config) {
  try {
    // Safety checks
    if (!m || !m.body || typeof m.body !== 'string') {
      return;
    }

    if (!config || !config.PREFIX || typeof config.PREFIX !== 'string') {
      console.error('❌ Betting plugin: Invalid config or PREFIX');
      return;
    }

    if (!m.body.startsWith(config.PREFIX)) {
      return;
    }

    // Process message
    let messageBody = '';
    try {
      messageBody = m.body.slice(config.PREFIX.length).trim();
      if (!messageBody) return;
    } catch (error) {
      console.error('❌ Error processing message body:', error.message);
      return;
    }

    // Parse arguments
    let args = [];
    let command = '';
    try {
      args = messageBody.split(' ').filter(arg => arg.length > 0);
      if (args.length === 0) return;
      command = args[0].toLowerCase();
    } catch (error) {
      console.error('❌ Error parsing arguments:', error.message);
      return;
    }

    // Extract user info
    let senderId = '';
    let from = '';
    try {
      if (!m.key || !m.key.remoteJid) {
        console.error('❌ Betting plugin: Invalid message key');
        return;
      }
      
      senderId = m.key.participant || m.key.remoteJid;
      from = m.key.remoteJid;
      
      if (!senderId || !from) {
        console.error('❌ Betting plugin: Could not determine sender or chat');
        return;
      }
    } catch (error) {
      console.error('❌ Error extracting message info:', error.message);
      return;
    }

    // Initialize database and user
    if (!db) {
      await initBettingDatabase();
      await initializeMatches();
    }

    // Initialize user in economy system
    await initEconomyUser(senderId);
    
    // Reply helper
    const reply = async (text) => {
      try {
        if (!text || typeof text !== 'string') {
          console.error('❌ Attempted to send empty reply');
          return;
        }
        await sock.sendMessage(from, { text }, { quoted: m });
      } catch (error) {
        console.error('❌ Error sending reply:', error.message);
      }
    };
    
    // Handle commands
    switch (command) {
      case 'bet':
      case 'sportbet':
      case 'sportsbet':
        if (args.length === 1) {
          await showBettingMenu(reply, config.PREFIX);
        } else {
          await handleBetCommand({ m, sock, config, senderId, from, reply }, args.slice(1));
        }
        break;
        
      case 'fixtures':
      case 'matches':
      case 'games':
        await handleFixtures({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'betslip':
      case 'slip':
        await handleBetSlip({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
        
      case 'mybets':
      case 'bets':
        await handleMyBets({ m, sock, config, senderId, from, reply });
        break;
        
      case 'bethistory':
      case 'betlog':
        await handleBetHistory({ m, sock, config, senderId, from, reply });
        break;
        
      case 'leagues':
      case 'competitions':
        await handleLeagues({ m, sock, config, senderId, from, reply });
        break;
        
      case 'results':
      case 'recent':
      case 'scores':
        await handleResults({ m, sock, config, senderId, from, reply });
        break;
        
      default:
        // Don't respond to unknown commands
        break;
    }
  } catch (error) {
    console.error('❌ Betting plugin error:', error.message);
  }
}

// Show betting menu
async function showBettingMenu(reply, prefix) {
  try {
    const menuText = `⚽ *SPORTS BETTING* ⚽\n\n` +
                    `🎯 *Available Commands:*\n` +
                    `• *${prefix}fixtures* - View upcoming matches\n` +
                    `• *${prefix}leagues* - Available leagues\n` +
                    `• *${prefix}betslip* - Manage your bet slip\n` +
                    `• *${prefix}mybets* - View active bets\n` +
                    `• *${prefix}bethistory* - View bet history\n` +
                    `• *${prefix}results* - View recent match results\n\n` +
                    `🏆 *Leagues Available:*\n` +
                    `• 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League (20 teams)\n` +
                    `• 🇪🇸 La Liga (Top 10 teams)\n` +
                    `• 🇩🇪 Bundesliga (Top 5 teams)\n` +
                    `• 🇮🇹 Serie A (Top 5 teams)\n\n` +
                    `💰 *Bet Types:*\n` +
                    `• Match Winner • Draw • Over/Under 1.5 Goals • Over/Under 2.5 Goals • Both Teams to Score\n\n` +
                    `💡 *Start by viewing: ${prefix}fixtures*`;
    
    await reply(menuText);
  } catch (error) {
    console.error('Error showing betting menu:', error);
  }
}

// Handle fixtures command
async function handleFixtures(context, args) {
  const { reply } = context;
  
  try {
    let league = null;
    if (args.length > 0) {
      const leagueInput = args[0].toLowerCase();
      const leagueMap = {
        'epl': 'EPL',
        'premier': 'EPL',
        'laliga': 'LALIGA',
        'liga': 'LALIGA',
        'bundesliga': 'BUNDESLIGA',
        'german': 'BUNDESLIGA',
        'seriea': 'SERIEA',
        'serie': 'SERIEA',
        'italian': 'SERIEA'
      };
      league = leagueMap[leagueInput];
    }
    
    const query = league ? { leagueCode: league } : {};
    const matches = await db.collection(BET_COLLECTIONS.MATCHES)
      .find({ ...query, status: 'upcoming' })
      .sort({ matchTime: 1 })
      .limit(10)
      .toArray();
    
    if (matches.length === 0) {
      await reply('⚽ *No upcoming matches found*\n\n🔄 Generating new fixtures...');
      await initializeMatches();
      return;
    }
    
    let fixturesText = `⚽ *UPCOMING FIXTURES* ⚽\n\n`;
    
    matches.forEach((match, index) => {
      const matchTime = moment(match.matchTime).tz('Africa/Lagos').format('DD/MM HH:mm');
      fixturesText += `*${index + 1}.* ${match.homeTeam} vs ${match.awayTeam}\n`;
      fixturesText += `🏆 ${match.league}\n`;
      fixturesText += `📅 ${matchTime} WAT\n`;
      fixturesText += `💰 Home: ${match.odds.HOME_WIN} | Draw: ${match.odds.DRAW} | Away: ${match.odds.AWAY_WIN}\n`;
      fixturesText += `⚽ O1.5: ${match.odds.OVER15} | U1.5: ${match.odds.UNDER15}\n`;
      fixturesText += `⚽ O2.5: ${match.odds.OVER25} | U2.5: ${match.odds.UNDER25}\n`;
      fixturesText += `🎯 BTTS: ${match.odds.BTTS_YES} | No BTTS: ${match.odds.BTTS_NO}\n`;
      fixturesText += `🆔 ID: ${match.matchId}\n\n`;
    });
    
    fixturesText += `💡 *Add to bet slip:* ${context.config.PREFIX}betslip add [matchId] [betType]`;
    
    await reply(fixturesText);
  } catch (error) {
    await reply('❌ *Error loading fixtures. Please try again.*');
    console.error('Fixtures error:', error);
  }
}

// Handle bet slip
async function handleBetSlip(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (!args || args.length === 0) {
      // Show current bet slip
      const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
      
      if (!betSlip || betSlip.selections.length === 0) {
        await reply(`📋 *Your bet slip is empty*\n\n💡 *Add bets:* ${context.config.PREFIX}betslip add [matchId] [betType]\n\n🎯 *Bet Types:*\n• HOME_WIN, AWAY_WIN, DRAW\n• OVER15, UNDER15, OVER25, UNDER25\n• BTTS_YES, BTTS_NO\n\n*Example:* ${context.config.PREFIX}betslip add 1 HOME_WIN`);
        return;
      }
      
      let slipText = `📋 *YOUR BET SLIP* 📋\n\n`;
      let totalOdds = 1;
      
      for (let i = 0; i < betSlip.selections.length; i++) {
        const selection = betSlip.selections[i];
        const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId: selection.matchId });
        
        if (match) {
          slipText += `*${i + 1}.* ${match.homeTeam} vs ${match.awayTeam}\n`;
          slipText += `🎯 ${selection.betType.replace('_', ' ')} @ ${selection.odds}\n`;
          slipText += `📅 ${moment(match.matchTime).tz('Africa/Lagos').format('DD/MM HH:mm')}\n\n`;
          totalOdds *= selection.odds;
        }
      }
      
      slipText += `💰 *Total Odds:* ${totalOdds.toFixed(2)}\n`;
      slipText += `💵 *Current Stake:* ${ecoSettings.currency}${betSlip.stake || 0}\n`;
      slipText += `🏆 *Potential Win:* ${ecoSettings.currency}${((betSlip.stake || 0) * totalOdds).toFixed(0)}\n\n`;
      slipText += `⚙️ *Commands:*\n`;
      slipText += `• ${context.config.PREFIX}betslip stake [amount]\n`;
      slipText += `• ${context.config.PREFIX}betslip place\n`;
      slipText += `• ${context.config.PREFIX}betslip clear\n`;
      slipText += `• ${context.config.PREFIX}betslip remove [number]`;
      
      await reply(slipText);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    switch (action) {
      case 'add':
        await handleAddToBetSlip(context, args.slice(1));
        break;
      case 'remove':
        await handleRemoveFromBetSlip(context, args.slice(1));
        break;
      case 'stake':
        await handleSetStake(context, args.slice(1));
        break;
      case 'place':
        await handlePlaceBet(context);
        break;
      case 'clear':
        await handleClearBetSlip(context);
        break;
      default:
        await reply(`❓ *Unknown bet slip command*\n\n📋 *Available:* add, remove, stake, place, clear`);
    }
  } catch (error) {
    await reply('❌ *Error managing bet slip. Please try again.*');
    console.error('Bet slip error:', error);
  }
}

// Add selection to bet slip
async function handleAddToBetSlip(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (args.length < 2) {
      await reply(`⚠️ *Usage:* ${context.config.PREFIX}betslip add [matchId] [betType]\n\n🎯 *Bet Types:* HOME_WIN, AWAY_WIN, DRAW, OVER25, UNDER25, BTTS_YES, BTTS_NO`);
      return;
    }
    
    const matchId = parseInt(args[0]);
    const betType = args[1].toUpperCase();
    
    if (isNaN(matchId)) {
      await reply('⚠️ *Please provide a valid match ID*');
      return;
    }
    
    const validBetTypes = ['HOME_WIN', 'AWAY_WIN', 'DRAW', 'OVER25', 'UNDER25', 'BTTS_YES', 'BTTS_NO'];
    if (!validBetTypes.includes(betType)) {
      await reply(`⚠️ *Invalid bet type*\n\n🎯 *Valid types:* ${validBetTypes.join(', ')}`);
      return;
    }
    
    const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId, status: 'upcoming' });
    if (!match) {
      await reply('❌ *Match not found or no longer available*');
      return;
    }
    
    const odds = match.odds[betType];
    if (!odds) {
      await reply('❌ *Odds not available for this bet type*');
      return;
    }
    
    // Get or create bet slip
    let betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    if (!betSlip) {
      betSlip = {
        userId: senderId,
        selections: [],
        stake: 0,
        createdAt: new Date()
      };
    }
    
    // Check if selection already exists
    const existingIndex = betSlip.selections.findIndex(s => s.matchId === matchId);
    if (existingIndex !== -1) {
      // Update existing selection
      betSlip.selections[existingIndex] = {
        matchId,
        betType,
        odds,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        addedAt: new Date()
      };
    } else {
      // Add new selection
      betSlip.selections.push({
        matchId,
        betType,
        odds,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        addedAt: new Date()
      });
    }
    
    // Limit to 10 selections
    if (betSlip.selections.length > 10) {
      await reply('⚠️ *Maximum 10 selections allowed in a bet slip*');
      return;
    }
    
    await db.collection(BET_COLLECTIONS.BETSLIPS).replaceOne(
      { userId: senderId },
      { ...betSlip, updatedAt: new Date() },
      { upsert: true }
    );
    
    await reply(`✅ *Added to bet slip*\n\n⚽ ${match.homeTeam} vs ${match.awayTeam}\n🎯 ${betType.replace('_', ' ')} @ ${odds}\n\n📋 *Selections:* ${betSlip.selections.length}/10\n💡 *View:* ${context.config.PREFIX}betslip`);
  } catch (error) {
    await reply('❌ *Error adding to bet slip. Please try again.*');
    console.error('Add to bet slip error:', error);
  }
}

// Set stake for bet slip
async function handleSetStake(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (args.length === 0) {
      await reply(`⚠️ *Usage:* ${context.config.PREFIX}betslip stake [amount]\n\n💡 *Example:* ${context.config.PREFIX}betslip stake 1000`);
      return;
    }
    
    const stakeAmount = parseInt(args[0]);
    if (isNaN(stakeAmount) || stakeAmount <= 0) {
      await reply('⚠️ *Please provide a valid stake amount*');
      return;
    }
    
    // Check user balance
    const userData = await getEconomyUserData(senderId);
    if (userData.balance < stakeAmount) {
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n💸 *Required:* ${ecoSettings.currency}${stakeAmount.toLocaleString()}`);
      return;
    }
    
    // Check if bet slip exists
    const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    if (!betSlip || betSlip.selections.length === 0) {
      await reply('📋 *Your bet slip is empty. Add some selections first!*');
      return;
    }
    
    // Update stake
    await db.collection(BET_COLLECTIONS.BETSLIPS).updateOne(
      { userId: senderId },
      { 
        $set: { 
          stake: stakeAmount, 
          updatedAt: new Date() 
        } 
      }
    );
    
    // Calculate potential winnings
    let totalOdds = 1;
    betSlip.selections.forEach(selection => {
      totalOdds *= selection.odds;
    });
    
    const potentialWin = stakeAmount * totalOdds;
    
    await reply(`💰 *Stake Set Successfully*\n\n💵 *Stake:* ${ecoSettings.currency}${stakeAmount.toLocaleString()}\n📊 *Total Odds:* ${totalOdds.toFixed(2)}\n🏆 *Potential Win:* ${ecoSettings.currency}${potentialWin.toFixed(0)}\n\n✅ *Ready to place bet:* ${context.config.PREFIX}betslip place`);
  } catch (error) {
    await reply('❌ *Error setting stake. Please try again.*');
    console.error('Set stake error:', error);
  }
}

// Place bet
async function handlePlaceBet(context) {
  const { reply, senderId, sock, from } = context;
  
  try {
    const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    
    if (!betSlip || betSlip.selections.length === 0) {
      await reply('📋 *Your bet slip is empty*');
      return;
    }
    
    if (!betSlip.stake || betSlip.stake <= 0) {
      await reply(`💰 *Please set a stake first*\n\n💡 *Usage:* ${context.config.PREFIX}betslip stake [amount]`);
      return;
    }
    
    // Check user balance
    const userData = await getEconomyUserData(senderId);
    if (userData.balance < betSlip.stake) {
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n💸 *Required:* ${ecoSettings.currency}${betSlip.stake.toLocaleString()}`);
      return;
    }
    
    // Validate all matches are still available
    for (const selection of betSlip.selections) {
      const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ 
        matchId: selection.matchId, 
        status: 'upcoming' 
      });
      
      if (!match) {
        await reply(`❌ *Match ${selection.homeTeam} vs ${selection.awayTeam} is no longer available*\n\n🔄 Please remove it from your bet slip`);
        return;
      }
    }
    
    // Calculate total odds
    let totalOdds = 1;
    betSlip.selections.forEach(selection => {
      totalOdds *= selection.odds;
    });
    
    const potentialWin = betSlip.stake * totalOdds;
    
    // Deduct stake from user balance
    await removeMoneyFromUser(senderId, betSlip.stake, 'Sports bet stake');
    
    // Create bet record
    const betRecord = {
      userId: senderId,
      betType: 'accumulator',
      selections: betSlip.selections,
      stake: betSlip.stake,
      totalOdds: totalOdds,
      potentialWin: potentialWin,
      status: 'pending',
      placedAt: new Date(),
      settledAt: null,
      result: null,
      payout: 0
    };
    
    const betResult = await db.collection(BET_COLLECTIONS.BETS).insertOne(betRecord);
    
    // Clear bet slip
    await db.collection(BET_COLLECTIONS.BETSLIPS).deleteOne({ userId: senderId });
    
    // Send confirmation
    let confirmText = `✅ *BET PLACED SUCCESSFULLY* ✅\n\n`;
    confirmText += `🎫 *Bet ID:* ${betResult.insertedId.toString().slice(-6)}\n`;
    confirmText += `💰 *Stake:* ${ecoSettings.currency}${betSlip.stake.toLocaleString()}\n`;
    confirmText += `📊 *Total Odds:* ${totalOdds.toFixed(2)}\n`;
    confirmText += `🏆 *Potential Win:* ${ecoSettings.currency}${potentialWin.toFixed(0)}\n\n`;
    confirmText += `📋 *Selections:*\n`;
    
    betSlip.selections.forEach((selection, index) => {
      confirmText += `${index + 1}. ${selection.homeTeam} vs ${selection.awayTeam}\n`;
      confirmText += `   🎯 ${selection.betType.replace('_', ' ')} @ ${selection.odds}\n`;
    });
    
    const updatedBalance = await getEconomyUserData(senderId);
    confirmText += `\n💵 *New Balance:* ${ecoSettings.currency}${updatedBalance.balance.toLocaleString()}\n\n`;
    confirmText += `🍀 *Good luck!*`;
    
    await sock.sendMessage(from, {
      text: confirmText,
      mentions: [senderId]
    });
  } catch (error) {
    await reply('❌ *Error placing bet. Please try again.*');
    console.error('Place bet error:', error);
  }
}

// Clear bet slip
async function handleClearBetSlip(context) {
  const { reply, senderId } = context;
  
  try {
    await db.collection(BET_COLLECTIONS.BETSLIPS).deleteOne({ userId: senderId });
    await reply('🗑️ *Bet slip cleared*');
  } catch (error) {
    await reply('❌ *Error clearing bet slip. Please try again.*');
    console.error('Clear bet slip error:', error);
  }
}

// Remove selection from bet slip
async function handleRemoveFromBetSlip(context, args) {
  const { reply, senderId } = context;
  
  try {
    if (args.length === 0) {
      await reply(`⚠️ *Usage:* ${context.config.PREFIX}betslip remove [number]\n\n💡 *Example:* ${context.config.PREFIX}betslip remove 1`);
      return;
    }
    
    const selectionNumber = parseInt(args[0]);
    if (isNaN(selectionNumber)) {
      await reply('⚠️ *Please provide a valid selection number*');
      return;
    }
    
    const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    if (!betSlip || betSlip.selections.length === 0) {
      await reply('📋 *Your bet slip is empty*');
      return;
    }
    
    if (selectionNumber < 1 || selectionNumber > betSlip.selections.length) {
      await reply(`⚠️ *Invalid selection number. Choose between 1 and ${betSlip.selections.length}*`);
      return;
    }
    
    const removedSelection = betSlip.selections[selectionNumber - 1];
    betSlip.selections.splice(selectionNumber - 1, 1);
    
    if (betSlip.selections.length === 0) {
      await db.collection(BET_COLLECTIONS.BETSLIPS).deleteOne({ userId: senderId });
      await reply('🗑️ *Last selection removed. Bet slip is now empty.*');
    } else {
      await db.collection(BET_COLLECTIONS.BETSLIPS).updateOne(
        { userId: senderId },
        { 
          $set: { 
            selections: betSlip.selections, 
            updatedAt: new Date() 
          } 
        }
      );
      
      await reply(`✅ *Removed selection*\n\n❌ ${removedSelection.homeTeam} vs ${removedSelection.awayTeam}\n📋 *Remaining:* ${betSlip.selections.length} selections`);
    }
  } catch (error) {
    await reply('❌ *Error removing selection. Please try again.*');
    console.error('Remove selection error:', error);
  }
}

// Handle bet command
async function handleBetCommand(context, args) {
  const { reply } = context;
  
  try {
    if (args.length === 0) {
      await showBettingMenu(reply, context.config.PREFIX);
      return;
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
      case 'simulate':
        await handleSimulateBets(context);
        break;
      default:
        await reply(`❓ *Unknown bet command: ${subCommand}*\n\nUse *${context.config.PREFIX}bet* for help`);
    }
  } catch (error) {
    await reply('❌ *Error processing bet command. Please try again.*');
    console.error('Bet command error:', error);
  }
}

// Handle my bets
async function handleMyBets(context) {
  const { reply, senderId } = context;
  
  try {
    const activeBets = await db.collection(BET_COLLECTIONS.BETS)
      .find({ userId: senderId, status: 'pending' })
      .sort({ placedAt: -1 })
      .limit(10)
      .toArray();
    
    if (activeBets.length === 0) {
      await reply(`📋 *No active bets*\n\n💡 *Place a bet:* ${context.config.PREFIX}fixtures`);
      return;
    }
    
    let betsText = `📋 *YOUR ACTIVE BETS* 📋\n\n`;
    
    for (let i = 0; i < activeBets.length; i++) {
      const bet = activeBets[i];
      const betId = bet._id.toString().slice(-6);
      const placedTime = moment(bet.placedAt).tz('Africa/Lagos').format('DD/MM HH:mm');
      
      betsText += `*${i + 1}.* 🎫 ID: ${betId}\n`;
      betsText += `💰 Stake: ${ecoSettings.currency}${bet.stake.toLocaleString()}\n`;
      betsText += `📊 Odds: ${bet.totalOdds.toFixed(2)}\n`;
      betsText += `🏆 Potential: ${ecoSettings.currency}${bet.potentialWin.toFixed(0)}\n`;
      betsText += `📅 Placed: ${placedTime}\n`;
      betsText += `📋 Selections: ${bet.selections.length}\n\n`;
    }
    
    betsText += `💡 *View history:* ${context.config.PREFIX}bethistory`;
    
    await reply(betsText);
  } catch (error) {
    await reply('❌ *Error loading your bets. Please try again.*');
    console.error('My bets error:', error);
  }
}

// Handle bet history
async function handleBetHistory(context) {
  const { reply, senderId } = context;
  
  try {
    const betHistory = await db.collection(BET_COLLECTIONS.BETS)
      .find({ userId: senderId })
      .sort({ placedAt: -1 })
      .limit(15)
      .toArray();
    
    if (betHistory.length === 0) {
      await reply(`📋 *No betting history*\n\n💡 *Place your first bet:* ${context.config.PREFIX}fixtures`);
      return;
    }
    
    let historyText = `📊 *YOUR BETTING HISTORY* 📊\n\n`;
    let totalStaked = 0;
    let totalWon = 0;
    let wins = 0;
    let losses = 0;
    
    betHistory.forEach((bet, index) => {
      const betId = bet._id.toString().slice(-6);
      const placedTime = moment(bet.placedAt).tz('Africa/Lagos').format('DD/MM');
      
      totalStaked += bet.stake;
      
      let statusIcon = '⏳';
      if (bet.status === 'won') {
        statusIcon = '✅';
        totalWon += bet.payout;
        wins++;
      } else if (bet.status === 'lost') {
        statusIcon = '❌';
        losses++;
      }
      
      historyText += `${statusIcon} ${betId} | ${ecoSettings.currency}${bet.stake} | ${bet.totalOdds.toFixed(2)} | ${placedTime}\n`;
    });
    
    const profit = totalWon - totalStaked;
    const winRate = betHistory.length > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0;
    
    historyText += `\n📊 *STATISTICS*\n`;
    historyText += `💰 Total Staked: ${ecoSettings.currency}${totalStaked.toLocaleString()}\n`;
    historyText += `🏆 Total Won: ${ecoSettings.currency}${totalWon.toLocaleString()}\n`;
    historyText += `💸 Profit/Loss: ${profit >= 0 ? '🟢' : '🔴'} ${ecoSettings.currency}${Math.abs(profit).toLocaleString()}\n`;
    historyText += `📈 Win Rate: ${winRate}% (${wins}W/${losses}L)\n`;
    historyText += `🎫 Total Bets: ${betHistory.length}`;
    
    await reply(historyText);
  } catch (error) {
    await reply('❌ *Error loading betting history. Please try again.*');
    console.error('Bet history error:', error);
  }
}

// Handle leagues
async function handleLeagues(context) {
  const { reply } = context;
  
  try {
    let leaguesText = `🏆 *AVAILABLE LEAGUES* 🏆\n\n`;
    
    Object.entries(TEAMS).forEach(([code, league]) => {
      const teamCount = Object.keys(league.teams).length;
      let flag = '';
      
      switch (code) {
        case 'EPL': flag = '🏴󠁧󠁢󠁥󠁮󠁧󠁿'; break;
        case 'LALIGA': flag = '🇪🇸'; break;
        case 'BUNDESLIGA': flag = '🇩🇪'; break;
        case 'SERIEA': flag = '🇮🇹'; break;
      }
      
      leaguesText += `${flag} *${league.name}*\n`;
      leaguesText += `👥 Teams: ${teamCount}\n`;
      leaguesText += `💡 View fixtures: ${context.config.PREFIX}fixtures ${code.toLowerCase()}\n\n`;
    });
    
    leaguesText += `⚽ *Top Teams by League:*\n`;
    leaguesText += `🏴󠁧󠁢󠁥󠁮󠁧󠁿 Man City, Arsenal, Liverpool\n`;
    leaguesText += `🇪🇸 Real Madrid, Barcelona, Atletico\n`;
    leaguesText += `🇩🇪 Bayern Munich, Dortmund, Leipzig\n`;
    leaguesText += `🇮🇹 Inter Milan, Juventus, AC Milan`;
    
    await reply(leaguesText);
  } catch (error) {
    await reply('❌ *Error loading leagues. Please try again.*');
    console.error('Leagues error:', error);
  }
}

// Automatic match simulation system
let simulationInterval = null;

// Start automatic match simulation
function startAutoSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
  }
  
  // Check every 5 minutes for matches that need to be simulated
  simulationInterval = setInterval(async () => {
    try {
      await autoSimulateMatches();
    } catch (error) {
      console.error('❌ Auto simulation error:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  console.log('✅ Auto match simulation started (checks every 5 minutes)');
}

// Stop automatic simulation
function stopAutoSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    console.log('⏹️ Auto match simulation stopped');
  }
}

// Auto simulate matches that have reached their scheduled time
async function autoSimulateMatches() {
  try {
    if (!db) return;
    
    const now = new Date();
    
    // Find matches that should have started but haven't been simulated yet
    const matchesToSimulate = await db.collection(BET_COLLECTIONS.MATCHES)
      .find({
        status: 'upcoming',
        matchTime: { $lte: now } // Match time has passed
      })
      .toArray();
    
    if (matchesToSimulate.length === 0) {
      return; // No matches to simulate
    }
    
    console.log(`⚽ Auto-simulating ${matchesToSimulate.length} matches...`);
    
    for (const match of matchesToSimulate) {
      const result = simulateMatchResult(match.homeStrength, match.awayStrength, match.odds);
      
      // Update match with result
      await db.collection(BET_COLLECTIONS.MATCHES).updateOne(
        { matchId: match.matchId },
        {
          $set: {
            status: 'completed',
            result: result,
            completedAt: new Date()
          }
        }
      );
      
      console.log(`✅ ${match.homeTeam} ${result.homeGoals}-${result.awayGoals} ${match.awayTeam}`);
      
      // Settle bets for this match
      await settleBetsForMatch(match.matchId, result);
    }
    
    // Check if we need to generate new matches
    const upcomingCount = await db.collection(BET_COLLECTIONS.MATCHES)
      .countDocuments({ status: 'upcoming' });
    
    if (upcomingCount < 15) { // Keep at least 15 upcoming matches
      await generateNewMatches();
    }
    
    console.log(`✅ Auto-simulation complete. Settled bets for ${matchesToSimulate.length} matches`);
  } catch (error) {
    console.error('❌ Auto simulation error:', error);
  }
}

// Generate new matches to replace completed ones
async function generateNewMatches() {
  try {
    const newMatches = generateMatches();
    
    // Get the highest existing match ID
    const lastMatch = await db.collection(BET_COLLECTIONS.MATCHES)
      .findOne({}, { sort: { matchId: -1 } });
    
    let nextMatchId = lastMatch ? lastMatch.matchId + 1 : 1;
    
    // Update match IDs to continue sequence
    newMatches.forEach(match => {
      match.matchId = nextMatchId++;
      // Set match times to be in the future (next 72 hours)
      const hoursFromNow = Math.floor(Math.random() * 72) + 1;
      match.matchTime = moment().add(hoursFromNow, 'hours').toDate();
    });
    
    await db.collection(BET_COLLECTIONS.MATCHES).insertMany(newMatches);
    console.log(`✅ Generated ${newMatches.length} new matches`);
  } catch (error) {
    console.error('❌ Error generating new matches:', error);
  }
}

// Get match results for display
async function getRecentResults(limit = 5) {
  try {
    const results = await db.collection(BET_COLLECTIONS.MATCHES)
      .find({ status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(limit)
      .toArray();
    
    return results;
  } catch (error) {
    console.error('Error getting recent results:', error);
    return [];
  }
}

// Manual simulation command (for testing or admin override)
async function handleSimulateBets(context) {
  const { reply, senderId } = context;
  
  try {
    // Check if user is admin
    const isAdminUser = isAdmin(senderId) || isOwner(senderId);
    
    if (!isAdminUser) {
      await reply('🚫 *Only administrators can manually simulate matches*\n\n💡 *Note: Matches simulate automatically when their time arrives*');
      return;
    }
    
    const upcomingMatches = await db.collection(BET_COLLECTIONS.MATCHES)
      .find({ status: 'upcoming' })
      .limit(3)
      .toArray();
    
    if (upcomingMatches.length === 0) {
      await reply('⚽ *No matches to simulate*');
      return;
    }
    
    let simulationText = `⚽ *MANUAL SIMULATION RESULTS* ⚽\n\n`;
    
    for (const match of upcomingMatches) {
      const result = simulateMatchResult(match.homeStrength, match.awayStrength, match.odds);
      
      // Update match with result
      await db.collection(BET_COLLECTIONS.MATCHES).updateOne(
        { matchId: match.matchId },
        {
          $set: {
            status: 'completed',
            result: result,
            completedAt: new Date()
          }
        }
      );
      
      simulationText += `${match.homeTeam} ${result.homeGoals} - ${result.awayGoals} ${match.awayTeam}\n`;
      simulationText += `🏆 Result: ${result.result.replace('_', ' ')}\n`;
      simulationText += `⚽ Goals: ${result.totalGoals} (O1.5: ${result.over15 ? 'Yes' : 'No'} | O2.5: ${result.over25 ? 'Yes' : 'No'})\n`;
      simulationText += `🎯 BTTS: ${result.btts ? 'Yes' : 'No'}\n\n`;
      
      // Settle bets for this match
      await settleBetsForMatch(match.matchId, result);
    }
    
    simulationText += `✅ *All bets have been settled*\n🔄 *Generating new matches...*`;
    await reply(simulationText);
    
    // Generate new matches
    await generateNewMatches();
  } catch (error) {
    await reply('❌ *Error simulating matches. Please try again.*');
    console.error('Simulate bets error:', error);
  }
}

// Add results command
async function handleResults(context) {
  const { reply } = context;
  
  try {
    const recentResults = await getRecentResults(8);
    
    if (recentResults.length === 0) {
      await reply('📊 *No recent results available*');
      return;
    }
    
    let resultsText = `📊 *RECENT RESULTS* 📊\n\n`;
    
    recentResults.forEach((match, index) => {
      const completedTime = moment(match.completedAt).tz('Africa/Lagos').format('DD/MM HH:mm');
      resultsText += `*${index + 1}.* ${match.homeTeam} ${match.result.homeGoals} - ${match.result.awayGoals} ${match.awayTeam}\n`;
      resultsText += `🏆 ${match.league}\n`;
      resultsText += `📅 ${completedTime} WAT\n`;
      resultsText += `⚽ Total Goals: ${match.result.totalGoals} | BTTS: ${match.result.btts ? 'Yes' : 'No'}\n\n`;
    });
    
    await reply(resultsText);
  } catch (error) {
    await reply('❌ *Error loading results. Please try again.*');
    console.error('Results error:', error);
  }
}

// Settle bets for a completed match
async function settleBetsForMatch(matchId, matchResult) {
  try {
    const pendingBets = await db.collection(BET_COLLECTIONS.BETS)
      .find({ status: 'pending' })
      .toArray();
    
    for (const bet of pendingBets) {
      let betWon = true;
      let relevantSelections = [];
      
      // Check each selection in the bet
      for (const selection of bet.selections) {
        if (selection.matchId === matchId) {
          relevantSelections.push(selection);
          
          // Check if this selection won
          let selectionWon = false;
          
          switch (selection.betType) {
            case 'HOME_WIN':
              selectionWon = matchResult.result === 'HOME_WIN';
              break;
            case 'AWAY_WIN':
              selectionWon = matchResult.result === 'AWAY_WIN';
              break;
            case 'DRAW':
              selectionWon = matchResult.result === 'DRAW';
              break;
            case 'OVER15':
              selectionWon = matchResult.over15;
              break;
            case 'UNDER15':
              selectionWon = !matchResult.over15;
              break;
            case 'OVER25':
              selectionWon = matchResult.over25;
              break;
            case 'UNDER25':
              selectionWon = !matchResult.over25;
              break;
            case 'BTTS_YES':
              selectionWon = matchResult.btts;
              break;
            case 'BTTS_NO':
              selectionWon = !matchResult.btts;
              break;
          }
          
          if (!selectionWon) {
            betWon = false;
          }
        }
      }
      
      // If this bet has selections from the completed match
      if (relevantSelections.length > 0) {
        // Check if all matches in the bet are completed
        let allMatchesCompleted = true;
        for (const selection of bet.selections) {
          const matchStatus = await db.collection(BET_COLLECTIONS.MATCHES)
            .findOne({ matchId: selection.matchId });
          
          if (!matchStatus || matchStatus.status !== 'completed') {
            allMatchesCompleted = false;
            break;
          }
        }
        
        // If all matches are completed, settle the bet
        if (allMatchesCompleted) {
          if (betWon) {
            // User won - pay out winnings
            await addMoneyToUser(bet.userId, bet.potentialWin, 'Sports bet win');
            await db.collection(BET_COLLECTIONS.BETS).updateOne(
              { _id: bet._id },
              {
                $set: {
                  status: 'won',
                  payout: bet.potentialWin,
                  settledAt: new Date()
                }
              }
            );
          } else {
            // User lost
            await db.collection(BET_COLLECTIONS.BETS).updateOne(
              { _id: bet._id },
              {
                $set: {
                  status: 'lost',
                  payout: 0,
                  settledAt: new Date()
                }
              }
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('Error settling bets:', error);
  }
}

// Graceful shutdown - stop auto simulation
process.on('SIGINT', () => {
  console.log('🛑 Shutting down sports betting plugin...');
  stopAutoSimulation();
  if (mongoClient) {
    mongoClient.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down sports betting plugin...');
  stopAutoSimulation();
  if (mongoClient) {
    mongoClient.close();
  }
  process.exit(0);
});

// Export for use by other plugins if needed
export { generateMatches, simulateMatchResult, TEAMS, startAutoSimulation, stopAutoSimulation };
