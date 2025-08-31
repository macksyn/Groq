// plugins/Football_betting.js - FIXED VERSION with realistic fixtures and corrected odds

import { MongoClient, ObjectId } from 'mongodb';
import moment from 'moment-timezone';

// Use the central manager to interact with user data
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Sports Betting System',
  version: '2.7.0',
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

// Team data for the 2025/2026 season
const TEAMS = {
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
      'Wolves': { strength: 74, form: 72 } 
    }
  },
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
      'Sevilla': { strength: 80, form: 78 } 
    }
  },
  BUNDESLIGA: {
    name: 'German Bundesliga',
    teams: { 
      'Bayern Munich': { strength: 94, form: 92 }, 
      'Bayer Leverkusen': { strength: 91, form: 93 }, 
      'Borussia Dortmund': { strength: 88, form: 86 }, 
      'RB Leipzig': { strength: 87, form: 88 }, 
      'VfB Stuttgart': { strength: 84, form: 85 } 
    }
  },
  SERIEA: {
    name: 'Italian Serie A',
    teams: { 
      'Inter Milan': { strength: 92, form: 90 }, 
      'AC Milan': { strength: 87, form: 85 }, 
      'Juventus': { strength: 86, form: 84 }, 
      'Atalanta': { strength: 83, form: 81 }, 
      'Napoli': { strength: 84, form: 82 } 
    }
  }
};

// FIXED: Corrected bet type aliases to match odds object keys
const betTypeAliases = {
    'over1.5': 'OVER15', 'o1.5': 'OVER15', 'over15': 'OVER15',
    'under1.5': 'UNDER15', 'u1.5': 'UNDER15', 'under15': 'UNDER15',
    'over2.5': 'OVER25', 'o2.5': 'OVER25', 'over25': 'OVER25',
    'under2.5': 'UNDER25', 'u2.5': 'UNDER25', 'under25': 'UNDER25',
    'btts': 'BTTS_YES', 'gg': 'BTTS_YES', 'btts_yes': 'BTTS_YES',
    'nobtts': 'BTTS_NO', 'ng': 'BTTS_NO', 'btts_no': 'BTTS_NO',
    '1': 'HOME_WIN', 'hw': 'HOME_WIN', 'home': 'HOME_WIN', 'homewin': 'HOME_WIN',
    'x': 'DRAW', 'd': 'DRAW',
    '2': 'AWAY_WIN', 'aw': 'AWAY_WIN', 'away': 'AWAY_WIN', 'awaywin': 'AWAY_WIN'
};

// Helper function to display user-friendly bet type names
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
  // Ensure all odds are properly formatted
  Object.keys(odds).forEach(key => {
    odds[key] = parseFloat(odds[key].toFixed(2));
  });
  return odds;
}

// FIXED: More robust match generation with better team distribution
function generateMatches() {
    const matches = [];
    const leagues = Object.keys(TEAMS);
    let matchId = 1;
    
    leagues.forEach(league => {
        const teamNames = Object.keys(TEAMS[league].teams);
        const usedTeams = new Set();
        const numMatches = league === 'EPL' ? 6 : 4;
        let generatedMatches = 0;
        let attempts = 0;
        const maxAttempts = 100;
        
        // Shuffle team names for better randomization
        const shuffledTeams = [...teamNames];
        for (let i = shuffledTeams.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledTeams[i], shuffledTeams[j]] = [shuffledTeams[j], shuffledTeams[i]];
        }
        
        while (generatedMatches < numMatches && attempts < maxAttempts) {
            attempts++;
            
            const availableTeams = shuffledTeams.filter(team => !usedTeams.has(team));
            
            if (availableTeams.length < 2) {
                break;
            }
            
            const homeTeam = availableTeams[0];
            const awayTeam = availableTeams[1];
            
            usedTeams.add(homeTeam);
            usedTeams.add(awayTeam);
            
            const homeStrength = TEAMS[league].teams[homeTeam].strength;
            const awayStrength = TEAMS[league].teams[awayTeam].strength;
            const homeForm = TEAMS[league].teams[homeTeam].form;
            const awayForm = TEAMS[league].teams[awayTeam].form;
            const odds = generateOdds(homeTeam, awayTeam, homeStrength, awayStrength, homeForm, awayForm);
            
            const baseHours = Math.floor(Math.random() * 72) + 1;
            const matchTime = moment().add(baseHours, 'hours');
            
            matches.push({
                matchId: matchId++,
                league: TEAMS[league].name,
                leagueCode: league,
                homeTeam, 
                awayTeam, 
                homeStrength, 
                awayStrength, 
                homeForm, 
                awayForm,
                odds, 
                matchTime: matchTime.toDate(), 
                status: 'upcoming', 
                result: null
            });
            
            generatedMatches++;
        }
        
        console.log(`✅ Generated ${generatedMatches} matches for ${league}`);
    });
    
    return matches;
}

async function initializeMatches() {
  try {
    const existingMatches = await db.collection(BET_COLLECTIONS.MATCHES).countDocuments({ status: 'upcoming' });
    if (existingMatches < 15) {
      const newMatches = generateMatches();
      const lastMatch = await db.collection(BET_COLLECTIONS.MATCHES).findOne({}, { sort: { matchId: -1 } });
      let nextMatchId = lastMatch ? lastMatch.matchId + 1 : 1;
      newMatches.forEach(match => {
        match.matchId = nextMatchId++;
      });
      await db.collection(BET_COLLECTIONS.MATCHES).insertMany(newMatches);
      console.log(`✅ Generated ${newMatches.length} new matches`);
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
    case 'HOME_WIN': 
      homeGoals = Math.floor(Math.random() * 3) + 1; 
      awayGoals = Math.floor(Math.random() * homeGoals); 
      break;
    case 'AWAY_WIN': 
      awayGoals = Math.floor(Math.random() * 3) + 1; 
      homeGoals = Math.floor(Math.random() * awayGoals); 
      break;
    case 'DRAW': 
      const drawScore = Math.floor(Math.random() * 4); 
      homeGoals = awayGoals = drawScore; 
      break;
  }
, $options: 'i' } 
    });

    if (!placedBet) {
        return reply(`❌ Bet ID *${betId}* not found in your active bets. Check your ${config.PREFIX}mybets list.`);
    }

    const shareCode = placedBet._id.toString().slice(-6).toUpperCase();

    await reply(`🎟️ *Share Your Placed Bet!* \n\n*Code: ${shareCode}*\n\n📲 Your friends can now use ${config.PREFIX}betslip load ${shareCode} to re-bet your exact selections.`);
}

async function handleMyBets(context) {
    const { reply, senderId, config } = context;
    try {
        const activeBets = await db.collection(BET_COLLECTIONS.BETS).find({ 
          userId: senderId, 
          status: 'pending' 
        }).sort({ placedAt: -1 }).limit(10).toArray();
        
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
    const matchesToSimulate = await db.collection(BET_COLLECTIONS.MATCHES).find({ 
      status: 'upcoming', 
      matchTime: { $lte: now } 
    }).toArray();
    
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
    const pendingBets = await db.collection(BET_COLLECTIONS.BETS).find({ 
      "selections.matchId": matchId, 
      status: 'pending' 
    }).toArray();
    
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
            case 'HOME_WIN': 
                selectionWon = currentMatchResult.result === 'HOME_WIN'; 
                break;
            case 'AWAY_WIN': 
                selectionWon = currentMatchResult.result === 'AWAY_WIN'; 
                break;
            case 'DRAW': 
                selectionWon = currentMatchResult.result === 'DRAW'; 
                break;
            case 'OVER15': 
                selectionWon = currentMatchResult.over15; 
                break;
            case 'UNDER15': 
                selectionWon = !currentMatchResult.over15; 
                break;
            case 'OVER25': 
                selectionWon = currentMatchResult.over25; 
                break;
            case 'UNDER25': 
                selectionWon = !currentMatchResult.over25; 
                break;
            case 'BTTS_YES': 
                selectionWon = currentMatchResult.btts; 
                break;
            case 'BTTS_NO': 
                selectionWon = !currentMatchResult.btts; 
                break;
        }
        if (!selectionWon) {
          betWon = false;
          break;
        }
      }
      
      if (allMatchesCompleted) {
        if (betWon) {
          await unifiedUserManager.addMoney(bet.userId, bet.potentialWin, 'Sports bet win');
          await db.collection(BET_COLLECTIONS.BETS).updateOne({ _id: bet._id }, { 
            $set: { status: 'won', payout: bet.potentialWin, settledAt: new Date() } 
          });
        } else {
          await db.collection(BET_COLLECTIONS.BETS).updateOne({ _id: bet._id }, { 
            $set: { status: 'lost', payout: 0, settledAt: new Date() } 
          });
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
