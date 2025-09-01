// plugins/Football_betting.js - REFACTORED VERSION with Dynamic Form, UI Update, Placed Bet Sharing & Command Aliases

import { MongoClient, ObjectId } from 'mongodb';
import moment from 'moment-timezone';

// Use the central manager to interact with user data
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Sports Betting System',
  version: '2.6.0', // Updated version with GG/NG terminology
  author: 'Alex Macksyn',
  description: 'Complete sports betting simulation with EPL, La Liga, Bundesliga, Serie A teams and multi-bet slips',
  commands: [
    { name: 'bet', aliases: ['sportbet', 'sportybet'], description: 'Access sports betting system (or share a placed bet)' },
    { name: 'fixtures', aliases: ['matches', 'games'], description: 'View upcoming matches' },
    { name: 'betslip', aliases: ['slip'], description: 'Manage your bet slip (add, remove, share, load)' },
    { name: 'mybets', aliases: ['bets'], description: 'View your active bets' },
    { name: 'bethistory', aliases: ['betlog'], description: 'View betting history' },
    { name: 'leagues', aliases: ['competitions'], description: 'View available leagues' },
    { name: 'results', aliases: ['recent', 'scores'], description: 'View recent match results' }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'whatsapp_bot';
const BET_COLLECTIONS = {
  MATCHES: 'betting_matches',
  BETS: 'betting_bets',
  BETSLIPS: 'betting_betslips',
};

// Local constant for currency display
const CURRENCY_SYMBOL = '₦';

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
    
    await db.collection(BET_COLLECTIONS.MATCHES).createIndex({ matchId: 1 }, { unique: true });
    await db.collection(BET_COLLECTIONS.BETS).createIndex({ userId: 1, timestamp: -1 });
    await db.collection(BET_COLLECTIONS.BETSLIPS).createIndex({ userId: 1 });
    await db.collection(BET_COLLECTIONS.BETSLIPS).createIndex({ shareCode: 1 });
    
    console.log('✅ Sports Betting MongoDB connected successfully');
    
    startAutoSimulation();
    
    return db;
  } catch (error) {
    console.error('❌ Sports Betting MongoDB connection failed:', error);
    throw error;
  }
}

// Team data for the 2025/2026 season
const TEAMS = {
  EPL: {
    name: 'English Premier League',
    teams: { 'Arsenal': { strength: 92, form: 90 }, 'Aston Villa': { strength: 80, form: 78 }, 'Bournemouth': { strength: 68, form: 65 }, 'Brentford': { strength: 70, form: 72 }, 'Brighton': { strength: 75, form: 78 }, 'Chelsea': { strength: 84, form: 80 }, 'Crystal Palace': { strength: 72, form: 70 }, 'Everton': { strength: 69, form: 66 }, 'Fulham': { strength: 71, form: 73 }, 'Ipswich Town': { strength: 62, form: 60 }, 'Leicester City': { strength: 73, form: 75 }, 'Liverpool': { strength: 91, form: 88 }, 'Manchester City': { strength: 96, form: 95 }, 'Manchester United': { strength: 85, form: 82 }, 'Newcastle United': { strength: 82, form: 80 }, 'Nottingham Forest': { strength: 67, form: 68 }, 'Southampton': { strength: 64, form: 62 }, 'Tottenham': { strength: 83, form: 81 }, 'West Ham': { strength: 78, form: 75 }, 'Wolves': { strength: 74, form: 72 } }
  },
  LALIGA: {
    name: 'Spanish La Liga',
    teams: { 'Real Madrid': { strength: 97, form: 95 }, 'Barcelona': { strength: 90, form: 88 }, 'Girona': { strength: 80, form: 82 }, 'Atletico Madrid': { strength: 88, form: 85 }, 'Athletic Bilbao': { strength: 82, form: 80 }, 'Real Sociedad': { strength: 81, form: 83 }, 'Real Betis': { strength: 79, form: 77 }, 'Villarreal': { strength: 78, form: 76 }, 'Valencia': { strength: 77, form: 75 }, 'Sevilla': { strength: 80, form: 78 } }
  },
  BUNDESLIGA: {
    name: 'German Bundesliga',
    teams: { 'Bayern Munich': { strength: 94, form: 92 }, 'Bayer Leverkusen': { strength: 91, form: 93 }, 'Borussia Dortmund': { strength: 88, form: 86 }, 'RB Leipzig': { strength: 87, form: 88 }, 'VfB Stuttgart': { strength: 84, form: 85 } }
  },
  SERIEA: {
    name: 'Italian Serie A',
    teams: { 'Inter Milan': { strength: 92, form: 90 }, 'AC Milan': { strength: 87, form: 85 }, 'Juventus': { strength: 86, form: 84 }, 'Atalanta': { strength: 83, form: 81 }, 'Napoli': { strength: 84, form: 82 } }
  }
};

// Maps user-friendly aliases to internal bet type keys
const betTypeAliases = {
    // Over/Under 1.5 -> All point to OVER15 or UNDER15
    'over1.5': 'OVER15', 'o1.5': 'OVER15', 'over15': 'OVER15',
    'under1.5': 'UNDER15', 'u1.5': 'UNDER15', 'under15': 'UNDER15',

    // Over/Under 2.5 -> All point to OVER25 or UNDER25
    'over2.5': 'OVER25', 'o2.5': 'OVER25', 'over25': 'OVER25',
    'under2.5': 'UNDER25', 'u2.5': 'UNDER25', 'under25': 'UNDER25',

    // Both Teams To Score -> All point to BTTS_YES or BTTS_NO
    'btts': 'BTTS_YES', 'gg': 'BTTS_YES', 'btts_yes': 'BTTS_YES',
    'nobtts': 'BTTS_NO', 'ng': 'BTTS_NO', 'btts_no': 'BTTS_NO',

    // Match Winner -> All point to HOME_WIN, DRAW, or AWAY_WIN
    '1': 'HOME_WIN', 'hw': 'HOME_WIN', 'home': 'HOME_WIN', 'homewin': 'HOME_WIN',
    'x': 'DRAW', 'd': 'DRAW',
    '2': 'AWAY_WIN', 'aw': 'AWAY_WIN', 'away': 'AWAY_WIN', 'awaywin': 'AWAY_WIN'
};

// NEW: Helper function to display user-friendly bet type names
function formatBetType(betTypeKey) {
    switch (betTypeKey) {
        case 'HOME_WIN': return 'Home Win (1)';
        case 'AWAY_WIN': return 'Away Win (2)';
        case 'DRAW': return 'Draw (X)';
        case 'OVER15': return 'Over 1.5 Goals';
        case 'UNDER15': return 'Under 1.5 Goals';
        case 'OVER25': return 'Over 2.5 Goals';
        case 'UNDER25': return 'Under 2.5 Goals';
        case 'BTTS_YES': return 'GG (Both Teams To Score)';
        case 'BTTS_NO': return 'NG (No Goal)';
        default: return betTypeKey.replace('_', ' ');
    }
}


function generateOdds(homeTeam, awayTeam, homeStrength, awayStrength, homeForm, awayForm) {
  const effectiveHomeStrength = (homeStrength * 0.8) + (homeForm * 0.2);
  const effectiveAwayStrength = (awayStrength * 0.8) + (awayForm * 0.2);
  const strengthDiff = effectiveHomeStrength - effectiveAwayStrength;
  const homeAdvantage = 5;
  const adjustedHomeStrength = effectiveHomeStrength + homeAdvantage;
  const totalStrength = adjustedHomeStrength + effectiveAwayStrength;
  const homeWinProb = (adjustedHomeStrength / totalStrength) * 0.6 + 0.2;
  const awayWinProb = (effectiveAwayStrength / totalStrength) * 0.6 + 0.2;
  const drawProb = 1 - homeWinProb - awayWinProb + 0.15;
  const total = homeWinProb + drawProb + awayWinProb;
  const normHome = homeWinProb / total;
  const normDraw = drawProb / total;
  const normAway = awayWinProb / total;
  const margin = 0.1;
  const odds = {
    HOME_WIN: Math.max(1.1, (1 / normHome) * (1 - margin)),
    DRAW: Math.max(2.5, (1 / normDraw) * (1 - margin)),
    AWAY_WIN: Math.max(1.1, (1 / normAway) * (1 - margin)),
    OVER15: Math.random() * 1.0 + 1.2,
    UNDER15: Math.random() * 1.5 + 2.0,
    OVER25: Math.random() * 1.5 + 1.4,
    UNDER25: Math.random() * 1.2 + 1.8,
    BTTS_YES: Math.random() * 1.0 + 1.6,
    BTTS_NO: Math.random() * 1.0 + 1.4
  };
  Object.keys(odds).forEach(key => {
    odds[key] = parseFloat(odds[key].toFixed(2));
  });
  return odds;
}

// Generate Match Function
async function generateMatches(db) { // Note: We now pass the 'db' object here
    const matches = [];
    const leagues = Object.keys(TEAMS);
    let matchId = 1; // This will be reset later, so it's fine

    // 1. Find all teams that are already in an upcoming match
    const upcomingFixtures = await db.collection(BET_COLLECTIONS.MATCHES).find(
        { status: 'upcoming' },
        { projection: { homeTeam: 1, awayTeam: 1, _id: 0 } }
    ).toArray();

    const busyTeams = new Set();
    upcomingFixtures.forEach(fixture => {
        busyTeams.add(fixture.homeTeam);
        busyTeams.add(fixture.awayTeam);
    });

    // 2. Generate matches for each league using only available teams
    leagues.forEach(league => {
        // Filter out teams that are already busy
        let availableTeams = Object.keys(TEAMS[league].teams).filter(team => !busyTeams.has(team));

        // Shuffle the available teams to create random fixtures
        for (let i = availableTeams.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableTeams[i], availableTeams[j]] = [availableTeams[j], availableTeams[i]];
        }

        const numMatches = league === 'EPL' ? 6 : 4;

        // Create pairs from the shuffled, available list
        for (let i = 0; i < numMatches * 2; i += 2) {
            if (!availableTeams[i] || !availableTeams[i + 1]) break; // Stop if we run out of teams

            const homeTeam = availableTeams[i];
            const awayTeam = availableTeams[i + 1];
            const homeStrength = TEAMS[league].teams[homeTeam].strength;
            const awayStrength = TEAMS[league].teams[awayTeam].strength;
            const homeForm = TEAMS[league].teams[homeTeam].form;
            const awayForm = TEAMS[league].teams[awayTeam].form;

            const odds = generateOdds(homeTeam, awayTeam, homeStrength, awayStrength, homeForm, awayForm);
            const matchTime = moment().add(Math.floor(Math.random() * 72) + 1, 'hours');

            matches.push({
                matchId: matchId++, // Temporary ID
                league: TEAMS[league].name,
                leagueCode: league,
                homeTeam, awayTeam, homeStrength, awayStrength, homeForm, awayForm,
                odds, matchTime: matchTime.toDate(), status: 'upcoming', result: null
            });
        }
    });
    return matches;
}

// Initialize Matches

async function initializeMatches() {
  try {
    const existingMatches = await db.collection(BET_COLLECTIONS.MATCHES).countDocuments({ status: 'upcoming' });
    if (existingMatches < 15) {
      // Pass the 'db' object to the updated function
      const newMatches = await generateMatches(db);

      if (newMatches.length > 0) {
        const lastMatch = await db.collection(BET_COLLECTIONS.MATCHES).findOne({}, { sort: { matchId: -1 } });
        let nextMatchId = lastMatch ? lastMatch.matchId + 1 : 1;
        newMatches.forEach(match => {
          match.matchId = nextMatchId++;
        });
        await db.collection(BET_COLLECTIONS.MATCHES).insertMany(newMatches);
        console.log(`✅ Generated ${newMatches.length} new matches`);
      }
    }
  } catch (error) {
    console.error('Error initializing matches:', error);
  }
}

function updateTeamForms(match) {
    try {
        if (!match || !match.leagueCode || !match.homeTeam || !match.awayTeam) return;
        const homeTeam = TEAMS[match.leagueCode].teams[match.homeTeam];
        const awayTeam = TEAMS[match.leagueCode].teams[match.awayTeam];

        if (match.result.result === 'HOME_WIN') {
            homeTeam.form = Math.min(100, homeTeam.form + 5);
            awayTeam.form = Math.max(0, awayTeam.form - 5);
        } else if (match.result.result === 'AWAY_WIN') {
            homeTeam.form = Math.max(0, homeTeam.form - 5);
            awayTeam.form = Math.min(100, awayTeam.form + 5);
        } else {
            homeTeam.form = Math.max(0, homeTeam.form - 2);
            awayTeam.form = Math.min(100, awayTeam.form + 2);
        }
    } catch (error) {
        console.error(`Error updating form for match ${match.matchId}:`, error);
    }
}

function simulateMatchResult(homeStrength, awayStrength, odds) {
  const rand = Math.random();
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
  let homeGoals, awayGoals;
  switch (result) {
    case 'HOME_WIN': homeGoals = Math.floor(Math.random() * 3) + 1; awayGoals = Math.floor(Math.random() * homeGoals); break;
    case 'AWAY_WIN': awayGoals = Math.floor(Math.random() * 3) + 1; homeGoals = Math.floor(Math.random() * awayGoals); break;
    case 'DRAW': const drawScore = Math.floor(Math.random() * 4); homeGoals = awayGoals = drawScore; break;
  }
  const totalGoals = homeGoals + awayGoals;
  return { result, homeGoals, awayGoals, totalGoals, over15: totalGoals > 1.5, over25: totalGoals > 2.5, btts: homeGoals > 0 && awayGoals > 0 };
}

function isAdmin(userId) {
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  return adminNumbers.includes(userId.split('@')[0]);
}

function isOwner(userId) {
  const ownerNumber = process.env.OWNER_NUMBER || '';
  return userId.split('@')[0] === ownerNumber;
}

export default async function bettingHandler(m, sock, config) {
  try {
    if (!m || !m.body || !m.body.startsWith(config.PREFIX)) return;
    const messageBody = m.body.slice(config.PREFIX.length).trim();
    if (!messageBody) return;
    const args = messageBody.split(' ').filter(arg => arg.length > 0);
    const command = args[0].toLowerCase();
    
    const commandInfo = info.commands.find(c => c.name === command || c.aliases.includes(c.name));
    if (!commandInfo) return;

    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    if (!senderId || !from) return;

    if (!db) {
      await initBettingDatabase();
      await initializeMatches();
    }

    await unifiedUserManager.initUser(senderId);

    const reply = async (text) => {
      try { await sock.sendMessage(from, { text }, { quoted: m }); } 
      catch (error) { console.error('❌ Error sending reply:', error.message); }
    };
    
    const context = { m, sock, config, senderId, from, reply };

    switch (command) {
        case 'bet': case 'sportbet': case 'sportybet':
            if (args.length === 1) { await showBettingMenu(reply, config.PREFIX); } 
            else { await handleBetCommand(context, args.slice(1)); }
            break;
        case 'fixtures': case 'matches': case 'games': await handleFixtures(context, args.slice(1)); break;
        case 'betslip': case 'slip': await handleBetSlip(context, args.slice(1)); break;
        case 'mybets': case 'bets': await handleMyBets(context); break;
        case 'bethistory': case 'betlog': await handleBetHistory(context); break;
        case 'leagues': case 'competitions': await handleLeagues(context); break;
        case 'results': case 'recent': case 'scores': await handleResults(context); break;
    }
  } catch (error) {
    console.error('❌ Betting plugin error:', error.message);
  }
}

async function showBettingMenu(reply, prefix) {
  const menuText = `⚽ *SPORTY BET* ⚽\n\n` +
                   `🎯 *Available Commands:*\n` +
                   `• *${prefix}fixtures* - View upcoming matches\n` +
                   `• *${prefix}leagues* - Available leagues\n` +
                   `• *${prefix}betslip* - Manage your bet slip\n` +
                   `• *${prefix}mybets* - View active bets\n` +
                   `• *${prefix}bethistory* - View bet history\n` +
                   `• *${prefix}results* - View recent match results\n\n` +
                   `🏆 *Leagues Available:*\n` +
                   `• 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League\n` + `• 🇪🇸 La Liga\n` + `• 🇩🇪 Bundesliga\n` + `• 🇮🇹 Serie A\n\n` +
                   `💡 *Start by viewing: ${prefix}fixtures*`;
  await reply(menuText);
}

async function handleFixtures(context, args) {
    const { reply, config } = context;
    try {
        let league = null;
        if (args.length > 0) {
            const leagueInput = args[0].toLowerCase();
            const leagueMap = {
                'epl': 'EPL', 'premier': 'EPL', 'laliga': 'LALIGA', 'liga': 'LALIGA',
                'bundesliga': 'BUNDESLIGA', 'german': 'BUNDESLIGA', 'seriea': 'SERIEA',
                'serie': 'SERIEA', 'italian': 'SERIEA'
            };
            league = leagueMap[leagueInput];
        }
        const query = league ? { leagueCode: league, status: 'upcoming' } : { status: 'upcoming' };
        const matches = await db.collection(BET_COLLECTIONS.MATCHES).find(query).sort({ matchTime: 1 }).limit(10).toArray();

        if (matches.length === 0) {
            await reply('⚽ *No upcoming matches found for this league.*');
            return;
        }

        let fixturesText = `⚽ *UPCOMING FIXTURES* ⚽\n\n`;
        matches.forEach((match, index) => {
            const matchTime = moment(match.matchTime).tz('Africa/Lagos').format('DD/MM HH:mm');
            fixturesText += `*${index + 1}. ${match.homeTeam} vs ${match.awayTeam}*\n`;
            fixturesText += `🏆 ${match.league}\n`;
            fixturesText += `📅 ${matchTime} WAT\n`;
            fixturesText += `💰 *Home:* ${match.odds.HOME_WIN} | *Draw:* ${match.odds.DRAW} | *Away:* ${match.odds.AWAY_WIN}\n`;
            fixturesText += `⚽ *Over1.5:* ${match.odds.OVER15} | *Under1.5:* ${match.odds.UNDER15}\n`;
            fixturesText += `⚽ *Over2.5:* ${match.odds.OVER25} | *Under2.5:* ${match.odds.UNDER25}\n`;
            fixturesText += `🎯 *GG/NG:* ${match.odds.BTTS_YES} | ${match.odds.BTTS_NO}\n`;
            fixturesText += `🆔 *ID:* ${match.matchId}\n\n`;
        });
        fixturesText += `💡 *Add to slip:* ${config.PREFIX}betslip add [matchId] [betType]`;
        await reply(fixturesText);
    } catch (error) {
        await reply('❌ *Error loading fixtures. Please try again.*');
        console.error('Fixtures error:', error);
    }
}

async function handleBetSlip(context, args) {
    const { reply, senderId, config } = context;
    try {
        if (!args || args.length === 0) {
            const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
            if (!betSlip || betSlip.selections.length === 0) {
                await reply(`📋 *Your bet slip is empty*\n\n💡 *Add bets:* ${config.PREFIX}betslip add [id] [type]\n` +
                            `🔁 *Load a slip:* ${config.PREFIX}betslip load [code]\n\n` +
                            `🎯 *Common Bet Types:*\n• *Winner:* 1 (Home), X (Draw), 2 (Away)\n• *Goals:* over1.5, under2.5\n• *Both Teams Score:* gg (Yes), ng (No)`);
                return;
            }
            let slipText = `📋 *YOUR BET SLIP* 📋\n\n`;
            let totalOdds = 1;
            for (let i = 0; i < betSlip.selections.length; i++) {
                const selection = betSlip.selections[i];
                const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId: selection.matchId });
                if (match) {
                    slipText += `*${i + 1}.* ${match.homeTeam} vs ${match.awayTeam}\n`;
                    slipText += `🎯 ${formatBetType(selection.betType)} @ ${selection.odds}\n\n`;
                    totalOdds *= selection.odds;
                }
            }
            slipText += `💰 *Total Odds:* ${totalOdds.toFixed(2)}\n`;
            slipText += `💵 *Stake:* ${CURRENCY_SYMBOL}${betSlip.stake || 0}\n`;
            slipText += `🏆 *Potential Win:* ${CURRENCY_SYMBOL}${((betSlip.stake || 0) * totalOdds).toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\n`;
            slipText += `⚙️ *Commands:*\n`;
            slipText += `• ${config.PREFIX}betslip stake [amount]\n`;
            slipText += `• ${config.PREFIX}betslip place\n`;
            slipText += `• ${config.PREFIX}betslip share\n`;
            slipText += `• ${config.PREFIX}betslip clear\n`;
            slipText += `• ${config.PREFIX}betslip remove [number]`;
            await reply(slipText);
            return;
        }
        const action = args[0].toLowerCase();
        switch (action) {
            case 'add': await handleAddToBetSlip(context, args.slice(1)); break;
            case 'remove': await handleRemoveFromBetSlip(context, args.slice(1)); break;
            case 'stake': await handleSetStake(context, args.slice(1)); break;
            case 'place': await handlePlaceBet(context); break;
            case 'clear': await handleClearBetSlip(context); break;
            case 'share': await handleShareBetSlip(context); break;
            case 'load': await handleLoadBetSlip(context, args.slice(1)); break;
            default: await reply(`❓ *Unknown bet slip command*\n\n📋 *Available:* add, remove, stake, place, clear, share, load`);
        }
    } catch (error) {
        await reply('❌ *Error managing bet slip. Please try again.*');
        console.error('Bet slip error:', error);
    }
}

async function handleAddToBetSlip(context, args) {
    const { reply, senderId, config } = context;
    try {
        if (args.length < 2) {
            await reply(`⚠️ *Usage:* ${config.PREFIX}betslip add [matchId] [betType]`);
            return;
        }
        const matchId = parseInt(args[0]);
        const userInputBetType = args[1].toLowerCase();
        const betType = betTypeAliases[userInputBetType] || userInputBetType.toUpperCase();

        if (isNaN(matchId)) {
            await reply('⚠️ *Please provide a valid match ID*');
            return;
        }
        const validBetTypes = Object.values(betTypeAliases);
        if (!validBetTypes.includes(betType)) {
            await reply(`⚠️ *Invalid bet type*.`);
            return;
        }
        const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId, status: 'upcoming' });
        if (!match) {
            await reply('❌ *Match not found or has already started*');
            return;
        }
        const odds = match.odds[betType];
        if (!odds) {
            await reply('❌ *Odds not available for this bet type*');
            return;
        }
        let betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
        if (!betSlip) {
            betSlip = { userId: senderId, selections: [], stake: 0, createdAt: new Date() };
        }
        const existingIndex = betSlip.selections.findIndex(s => s.matchId === matchId);
        const newSelection = { matchId, betType, odds, homeTeam: match.homeTeam, awayTeam: match.awayTeam, addedAt: new Date() };
        if (existingIndex !== -1) {
            betSlip.selections[existingIndex] = newSelection;
        } else {
            betSlip.selections.push(newSelection);
        }
        if (betSlip.selections.length > 10) {
            await reply('⚠️ *Maximum 10 selections allowed in a bet slip*');
            return;
        }
        await db.collection(BET_COLLECTIONS.BETSLIPS).replaceOne({ userId: senderId }, betSlip, { upsert: true });
        await reply(`✅ *Added to bet slip*\n\n⚽ ${match.homeTeam} vs ${match.awayTeam}\n🎯 ${formatBetType(betType)} @ ${odds}\n\n📋 *Selections:* ${betSlip.selections.length}/10`);
    } catch (error) {
        await reply('❌ *Error adding to bet slip. Please try again.*');
        console.error('Add to bet slip error:', error);
    }
}

async function handleRemoveFromBetSlip(context, args) {
    const { reply, senderId, config } = context;
    try {
        if (args.length === 0) {
            await reply(`⚠️ *Usage:* ${config.PREFIX}betslip remove [number]`);
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
        const removedSelection = betSlip.selections.splice(selectionNumber - 1, 1)[0];
        if (betSlip.selections.length === 0) {
            await db.collection(BET_COLLECTIONS.BETSLIPS).deleteOne({ userId: senderId });
            await reply('🗑️ *Last selection removed. Bet slip is now empty.*');
        } else {
            await db.collection(BET_COLLECTIONS.BETSLIPS).updateOne({ userId: senderId }, { $set: { selections: betSlip.selections, updatedAt: new Date() } });
            await reply(`✅ *Removed selection*\n\n❌ ${removedSelection.homeTeam} vs ${removedSelection.awayTeam}`);
        }
    } catch (error) {
        await reply('❌ *Error removing selection. Please try again.*');
        console.error('Remove selection error:', error);
    }
}

async function handleSetStake(context, args) {
  const { reply, senderId, config } = context;
  try {
    if (args.length === 0) {
      await reply(`⚠️ *Usage:* ${config.PREFIX}betslip stake [amount]`);
      return;
    }
    const stakeAmount = parseInt(args[0]);
    if (isNaN(stakeAmount) || stakeAmount <= 0) {
      await reply('⚠️ *Please provide a valid stake amount*');
      return;
    }
    const userData = await unifiedUserManager.getUserData(senderId);
    if (userData.balance < stakeAmount) {
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${CURRENCY_SYMBOL}${userData.balance.toLocaleString()}\n💸 *Required:* ${CURRENCY_SYMBOL}${stakeAmount.toLocaleString()}`);
      return;
    }
    const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    if (!betSlip || betSlip.selections.length === 0) {
      await reply('📋 *Your bet slip is empty. Add selections first!*');
      return;
    }
    await db.collection(BET_COLLECTIONS.BETSLIPS).updateOne({ userId: senderId }, { $set: { stake: stakeAmount, updatedAt: new Date() } });
    let totalOdds = 1;
    betSlip.selections.forEach(selection => { totalOdds *= selection.odds; });
    const potentialWin = stakeAmount * totalOdds;
    await reply(`💰 *Stake Set Successfully*\n\n💵 *Stake:* ${CURRENCY_SYMBOL}${stakeAmount.toLocaleString()}\n📊 *Total Odds:* ${totalOdds.toFixed(2)}\n🏆 *Potential Win:* ${CURRENCY_SYMBOL}${potentialWin.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\n✅ *Ready to place bet:* ${config.PREFIX}betslip place`);
  } catch (error) {
    await reply('❌ *Error setting stake. Please try again.*');
    console.error('Set stake error:', error);
  }
}

async function handlePlaceBet(context) {
  const { reply, senderId, sock, from, config } = context;
  try {
    const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    if (!betSlip || betSlip.selections.length === 0) {
      await reply('📋 *Your bet slip is empty*');
      return;
    }
    if (!betSlip.stake || betSlip.stake <= 0) {
      await reply(`💰 *Please set a stake first*\n\n💡 *Usage:* ${config.PREFIX}betslip stake [amount]`);
      return;
    }
    const userData = await unifiedUserManager.getUserData(senderId);
    if (userData.balance < betSlip.stake) {
      await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${CURRENCY_SYMBOL}${userData.balance.toLocaleString()}\n💸 *Required:* ${CURRENCY_SYMBOL}${betSlip.stake.toLocaleString()}`);
      return;
    }
    for (const selection of betSlip.selections) {
      const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId: selection.matchId, status: 'upcoming' });
      if (!match) {
        await reply(`❌ *Match ${selection.homeTeam} vs ${selection.awayTeam} is no longer available*. Please remove it.`);
        return;
      }
    }
    let totalOdds = 1;
    betSlip.selections.forEach(selection => { totalOdds *= selection.odds; });
    const potentialWin = betSlip.stake * totalOdds;
    const success = await unifiedUserManager.removeMoney(senderId, betSlip.stake, 'Sports bet stake');
    if (!success) {
      await reply('❌ Transaction failed. Please try again.');
      return;
    }
    const betRecord = {
      userId: senderId, betType: 'accumulator', selections: betSlip.selections,
      stake: betSlip.stake, totalOdds: totalOdds, potentialWin: potentialWin,
      status: 'pending', placedAt: new Date(), settledAt: null, result: null, payout: 0
    };
    const betResult = await db.collection(BET_COLLECTIONS.BETS).insertOne(betRecord);
    await db.collection(BET_COLLECTIONS.BETSLIPS).deleteOne({ userId: senderId });
    const updatedBalance = await unifiedUserManager.getUserData(senderId);
    let confirmText = `✅ *BET PLACED SUCCESSFULLY* ✅\n\n`;
    const betId = betResult.insertedId.toString().slice(-6).toUpperCase();
    confirmText += `🎫 *Bet ID:* ${betId}\n`;
    confirmText += `💰 *Stake:* ${CURRENCY_SYMBOL}${betSlip.stake.toLocaleString()}\n`;
    confirmText += `📊 *Total Odds:* ${totalOdds.toFixed(2)}\n`;
    confirmText += `🏆 *Potential Win:* ${CURRENCY_SYMBOL}${potentialWin.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\n`;
    confirmText += `📋 *Selections:*\n`;
    betSlip.selections.forEach((selection, index) => {
      confirmText += `${index + 1}. ${selection.homeTeam} vs ${selection.awayTeam}\n`;
      confirmText += `   🎯 ${formatBetType(selection.betType)} @ ${selection.odds}\n`;
    });
    confirmText += `\n💵 *New Balance:* ${CURRENCY_SYMBOL}${updatedBalance.balance.toLocaleString()}\n\n`;
    confirmText += `🍀 *Good luck!*`;
    await sock.sendMessage(from, { text: confirmText, mentions: [senderId] });
  } catch (error) {
    await reply('❌ *Error placing bet. Please try again.*');
    console.error('Place bet error:', error);
  }
}

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

async function handleShareBetSlip(context) {
    const { reply, senderId, config } = context;
    const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });

    if (!betSlip || betSlip.selections.length === 0) {
        return reply('📋 *Your bet slip is empty. Add some selections before sharing.*');
    }

    let shareCode = betSlip.shareCode;
    if (!shareCode) {
        shareCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        await db.collection(BET_COLLECTIONS.BETSLIPS).updateOne(
            { userId: senderId },
            { $set: { shareCode: shareCode } }
        );
    }

    await reply(`🎟️ *Your Bet Slip Code:* \n\n*${shareCode}*\n\n📲 Share this code with a friend! They can use \`${config.PREFIX}betslip load ${shareCode}\` to load your selections.`);
}

async function handleLoadBetSlip(context, args) {
    const { reply, senderId, config } = context;
    if (args.length === 0) {
        return reply(`⚠️ Please provide a bet slip code.\nUsage: \`${config.PREFIX}betslip load [code]\``);
    }
    const shareCode = args[0].toUpperCase();

    let originalSelections = null;
    let foundSource = null;

    const placedBet = await db.collection(BET_COLLECTIONS.BETS).findOne({ _id: { $regex: `${shareCode}$`, '$options' : 'i' } });

    if (placedBet) {
        originalSelections = placedBet.selections;
        foundSource = 'a placed bet';
    } else {
        const pendingSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ shareCode });
        if (pendingSlip) {
            originalSelections = pendingSlip.selections;
            foundSource = 'a pending slip';
        }
    }

    if (!originalSelections) {
        return reply(`❌ Code *${shareCode}* not found.`);
    }

    let newSelections = [];
    let expiredCount = 0;

    for (const selection of originalSelections) {
        const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId: selection.matchId, status: 'upcoming' });
        if (match) {
            newSelections.push(selection);
        } else {
            expiredCount++;
        }
    }

    if (newSelections.length === 0) {
        return reply(`❌ All matches from code *${shareCode}* have already started. Cannot load any selections.`);
    }

    await db.collection(BET_COLLECTIONS.BETSLIPS).replaceOne(
        { userId: senderId },
        { 
            userId: senderId, 
            selections: newSelections, 
            stake: 0, 
            createdAt: new Date(),
            loadedFrom: shareCode
        },
        { upsert: true }
    );

    let successMsg = `✅ *Bet Slip Loaded from ${foundSource} with code ${shareCode}!*\n\n*${newSelections.length} selection(s) were added to your slip.*`;
    if (expiredCount > 0) {
        successMsg += `\n\n⚠️ *${expiredCount} selection(s) were discarded because their matches have already started.*`;
    }
    successMsg += `\n\n💡 *View your new slip with:* \`${config.PREFIX}betslip\``;

    await reply(successMsg);
}

async function handleBetCommand(context, args) {
    const { reply, config, senderId } = context;
    try {
        if (args.length === 0) {
            await showBettingMenu(reply, config.PREFIX);
            return;
        }
        const subCommand = args[0].toLowerCase();
        
        switch(subCommand) {
            case 'simulate':
                const isAdminUser = isAdmin(senderId) || isOwner(senderId);
                if (!isAdminUser) {
                    return reply('🚫 *Only administrators can manually simulate matches*');
                }
                await handleSimulateBets(context);
                break;
            
            case 'share':
                await handleSharePlacedBet(context, args.slice(1));
                break;
            
            default:
                await reply(`❓ *Unknown bet command: ${subCommand}*\n\nUse *${config.PREFIX}bet* for help`);
        }
    } catch (error) {
        await reply('❌ *Error processing bet command. Please try again.*');
        console.error('Bet command error:', error);
    }
}

async function handleSharePlacedBet(context, args) {
    const { reply, senderId, config } = context;
    if (args.length === 0) {
        return reply(`⚠️ Please provide the ID of the bet you want to share.\nUsage: \`${config.PREFIX}bet share <bet_id>\``);
    }
    const betId = args[0].toUpperCase();

    // 1. Fetch all active (pending) bets for the user first.
    const activeBets = await db.collection(BET_COLLECTIONS.BETS).find({ 
        userId: senderId, 
        status: 'pending' 
    }).toArray();

    // 2. Now, find the correct bet in the results using JavaScript.
    const placedBet = activeBets.find(bet => 
        bet._id.toString().slice(-6).toUpperCase() === betId
    );

    if (!placedBet) {
        return reply(`❌ Bet ID *${betId}* not found in your active bets. Check your \`.mybets\` list.`);
    }

    // The rest of the function remains the same.
    const shareCode = placedBet._id.toString().slice(-6).toUpperCase();
    await reply(`🎟️ *Share Your Placed Bet!* \n\n*Code: ${shareCode}*\n\n📲 Your friends can now use \`.betslip load ${shareCode}\` to re-bet your exact selections.`);
}

async function handleMyBets(context) {
    const { reply, senderId, config } = context;
    try {
        const activeBets = await db.collection(BET_COLLECTIONS.BETS).find({ userId: senderId, status: 'pending' }).sort({ placedAt: -1 }).limit(10).toArray();
        if (activeBets.length === 0) {
            await reply(`📋 *No active bets*\n\n💡 *Place a bet:* ${config.PREFIX}fixtures`);
            return;
        }
        let betsText = `📋 *YOUR ACTIVE BETS* 📋\n\n`;
        activeBets.forEach((bet, index) => {
            const betId = bet._id.toString().slice(-6).toUpperCase();
            const placedTime = moment(bet.placedAt).tz('Africa/Lagos').format('DD/MM HH:mm');
            betsText += `*${index + 1}.* 🎫 ID: *${betId}*\n`;
            betsText += `💰 Stake: ${CURRENCY_SYMBOL}${bet.stake.toLocaleString()}\n`;
            betsText += `📊 Odds: ${bet.totalOdds.toFixed(2)}\n`;
            betsText += `🏆 Potential: ${CURRENCY_SYMBOL}${bet.potentialWin.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
            betsText += `📅 Placed: ${placedTime}\n`;
            betsText += `📋 Selections: ${bet.selections.length}\n\n`;
        });
        betsText += `💡 *Share a placed bet:* ${config.PREFIX}bet share [bet_id]`;
        await reply(betsText);
    } catch (error) {
        await reply('❌ *Error loading your bets. Please try again.*');
        console.error('My bets error:', error);
    }
}

async function handleBetHistory(context) {
    const { reply, senderId, config } = context;
    try {
        const betHistory = await db.collection(BET_COLLECTIONS.BETS).find({ userId: senderId }).sort({ placedAt: -1 }).limit(15).toArray();
        if (betHistory.length === 0) {
            await reply(`📋 *No betting history*\n\n💡 *Place your first bet:* ${config.PREFIX}fixtures`);
            return;
        }
        let historyText = `📊 *YOUR BETTING HISTORY* 📊\n\n`;
        let totalStaked = 0;
        let totalWon = 0;
        let wins = 0;
        let losses = 0;
        betHistory.forEach((bet) => {
            const betId = bet._id.toString().slice(-6).toUpperCase();
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
            historyText += `${statusIcon} ${betId} | ${CURRENCY_SYMBOL}${bet.stake.toLocaleString()} | ${bet.totalOdds.toFixed(2)} | ${placedTime}\n`;
        });
        const profit = totalWon - totalStaked;
        const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0;
        historyText += `\n📊 *STATISTICS*\n`;
        historyText += `💰 Total Staked: ${CURRENCY_SYMBOL}${totalStaked.toLocaleString()}\n`;
        historyText += `🏆 Total Won: ${CURRENCY_SYMBOL}${totalWon.toLocaleString()}\n`;
        historyText += `💸 P/L: ${profit >= 0 ? '🟢' : '🔴'} ${CURRENCY_SYMBOL}${Math.abs(profit).toLocaleString()}\n`;
        historyText += `📈 Win Rate: ${winRate}% (${wins}W/${losses}L)\n`;
        await reply(historyText);
    } catch (error) {
        await reply('❌ *Error loading betting history. Please try again.*');
        console.error('Bet history error:', error);
    }
}

async function handleLeagues(context) {
    const { reply, config } = context;
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
            leaguesText += `💡 View fixtures: ${config.PREFIX}fixtures ${code.toLowerCase()}\n\n`;
        });
        await reply(leaguesText);
    } catch (error) {
        await reply('❌ *Error loading leagues. Please try again.*');
        console.error('Leagues error:', error);
    }
}

let simulationInterval = null;

function startAutoSimulation() {
  if (simulationInterval) clearInterval(simulationInterval);
  simulationInterval = setInterval(autoSimulateMatches, 5 * 60 * 1000);
  console.log('✅ Auto match simulation started (checks every 5 minutes)');
}

function stopAutoSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    console.log('⏹️ Auto match simulation stopped');
  }
}

async function autoSimulateMatches() {
  try {
    if (!db) return;
    const now = new Date();
    const matchesToSimulate = await db.collection(BET_COLLECTIONS.MATCHES).find({ status: 'upcoming', matchTime: { $lte: now } }).toArray();
    if (matchesToSimulate.length === 0) return;
    
    console.log(`⚽ Auto-simulating ${matchesToSimulate.length} matches...`);
    
    for (const match of matchesToSimulate) {
      const result = simulateMatchResult(match.homeStrength, match.awayStrength, match.odds);
      
      const updatedMatchResult = await db.collection(BET_COLLECTIONS.MATCHES).findOneAndUpdate(
          { matchId: match.matchId }, 
          { $set: { status: 'completed', result: result, completedAt: new Date() } },
          { returnDocument: 'after' }
      );
      
      console.log(`✅ ${match.homeTeam} ${result.homeGoals}-${result.awayGoals} ${match.awayTeam}`);
      
      await settleBetsForMatch(match.matchId, result);
      
      if(updatedMatchResult.value) {
          updateTeamForms(updatedMatchResult.value);
      }
    }
    
    await initializeMatches();
    console.log(`✅ Auto-simulation complete. Settled bets for ${matchesToSimulate.length} matches`);
  } catch (error) {
    console.error('❌ Auto simulation error:', error);
  }
}

async function getRecentResults(limit = 8) {
  try {
    return await db.collection(BET_COLLECTIONS.MATCHES).find({ status: 'completed' }).sort({ completedAt: -1 }).limit(limit).toArray();
  } catch (error) {
    console.error('Error getting recent results:', error);
    return [];
  }
}

async function handleSimulateBets(context) {
    const { reply, senderId } = context;
    try {
        const isAdminUser = isAdmin(senderId) || isOwner(senderId);
        if (!isAdminUser) {
            await reply('🚫 *Only administrators can manually simulate matches*');
            return;
        }
        const upcomingMatches = await db.collection(BET_COLLECTIONS.MATCHES).find({ status: 'upcoming' }).limit(3).toArray();
        if (upcomingMatches.length === 0) {
            await reply('⚽ *No matches to simulate*');
            return;
        }
        let simulationText = `⚽ *MANUAL SIMULATION RESULTS* ⚽\n\n`;
        for (const match of upcomingMatches) {
            const result = simulateMatchResult(match.homeStrength, match.awayStrength, match.odds);
            const updatedMatchResult = await db.collection(BET_COLLECTIONS.MATCHES).findOneAndUpdate(
                { matchId: match.matchId }, 
                { $set: { status: 'completed', result: result, completedAt: new Date() } },
                { returnDocument: 'after' }
            );
            simulationText += `${match.homeTeam} ${result.homeGoals} - ${result.awayGoals} ${match.awayTeam}\n`;
            simulationText += `🏆 Result: ${result.result.replace('_', ' ')}\n`;
            simulationText += `⚽ Goals: ${result.totalGoals} | BTTS: ${result.btts ? 'Yes' : 'No'}\n\n`;
            await settleBetsForMatch(match.matchId, result);

            if(updatedMatchResult.value) {
                updateTeamForms(updatedMatchResult.value);
            }
        }
        simulationText += `✅ *All bets settled*\n🔄 *Generating new matches...*`;
        await reply(simulationText);
        await initializeMatches();
    } catch (error) {
        await reply('❌ *Error simulating matches. Please try again.*');
        console.error('Simulate bets error:', error);
    }
}

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
            resultsText += `📅 ${completedTime} WAT\n\n`;
        });
        await reply(resultsText);
    } catch (error) {
        await reply('❌ *Error loading results. Please try again.*');
        console.error('Results error:', error);
    }
}

async function settleBetsForMatch(matchId, matchResult) {
  try {
    const pendingBets = await db.collection(BET_COLLECTIONS.BETS).find({ "selections.matchId": matchId, status: 'pending' }).toArray();
    for (const bet of pendingBets) {
      let allMatchesCompleted = true;
      let betWon = true;

      for (const selection of bet.selections) {
        const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId: selection.matchId });
        if (!match || match.status !== 'completed') {
          allMatchesCompleted = false;
          break;
        }
        
        let selectionWon = false;
        const currentMatchResult = match.result;

        switch (selection.betType) {
            case 'HOME_WIN': selectionWon = currentMatchResult.result === 'HOME_WIN'; break;
            case 'AWAY_WIN': selectionWon = currentMatchResult.result === 'AWAY_WIN'; break;
            case 'DRAW': selectionWon = currentMatchResult.result === 'DRAW'; break;
            case 'OVER15': selectionWon = currentMatchResult.over15; break;
            case 'UNDER15': selectionWon = !currentMatchResult.over15; break;
            case 'OVER25': selectionWon = currentMatchResult.over25; break;
            case 'UNDER25': selectionWon = !currentMatchResult.over25; break;
            case 'BTTS_YES': selectionWon = currentMatchResult.btts; break;
            case 'BTTS_NO': selectionWon = !currentMatchResult.btts; break;
        }
        if (!selectionWon) {
          betWon = false;
          break;
        }
      }
      
      if (allMatchesCompleted) {
        if (betWon) {
          await unifiedUserManager.addMoney(bet.userId, bet.potentialWin, 'Sports bet win');
          await db.collection(BET_COLLECTIONS.BETS).updateOne({ _id: bet._id }, { $set: { status: 'won', payout: bet.potentialWin, settledAt: new Date() } });
        } else {
          await db.collection(BET_COLLECTIONS.BETS).updateOne({ _id: bet._id }, { $set: { status: 'lost', payout: 0, settledAt: new Date() } });
        }
      }
    }
  } catch (error) {
    console.error('Error settling bets:', error);
  }
}

// Graceful shutdown
function gracefulShutdown() {
    console.log('🛑 Shutting down sports betting plugin...');
    stopAutoSimulation();
    if (mongoClient) {
        mongoClient.close();
    }
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
