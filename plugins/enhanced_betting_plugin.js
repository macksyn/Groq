// Enhanced Football Betting Plugin v3.0.0
// Improved performance, UI, and realistic betting experience

import { MongoClient, ObjectId } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin Configuration
export const info = {
  name: 'Enhanced Sports Betting',
  version: '3.0.0',
  author: 'Enhanced by Claude',
  description: 'Advanced sports betting simulation with enhanced UI and realistic odds',
  commands: [
    { name: 'bet', aliases: ['sportbet', 'sportybet'], description: 'Access enhanced betting system' },
    { name: 'fixtures', aliases: ['matches', 'games', 'fix'], description: 'View live odds and fixtures' },
    { name: 'betslip', aliases: ['slip', 'bs'], description: 'Interactive bet slip management' },
    { name: 'mybets', aliases: ['bets', 'mb'], description: 'Track active bets with live updates' },
    { name: 'bethistory', aliases: ['history', 'bh'], description: 'Detailed betting analytics' },
    { name: 'leagues', aliases: ['competitions', 'lg'], description: 'League standings and stats' },
    { name: 'results', aliases: ['recent', 'scores', 'res'], description: 'Live results feed' },
    { name: 'quickbet', aliases: ['qb'], description: 'Quick single bet placement' },
    { name: 'tipster', aliases: ['tips'], description: 'AI betting recommendations' }
  ]
};

// Enhanced Configuration
const CONFIG = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  DATABASE_NAME: 'enhanced_sportsbet',
  CURRENCY: '₦',
  TIMEZONE: 'Africa/Lagos',
  MAX_SLIP_SELECTIONS: 15,
  MIN_ODDS: 1.01,
  MAX_ODDS: 999.99,
  SIMULATION_INTERVAL: 3 * 60 * 1000, // 3 minutes
  CONNECTION_POOL_SIZE: 10
};

const COLLECTIONS = {
  MATCHES: 'matches',
  BETS: 'bets',
  BETSLIPS: 'betslips',
  ANALYTICS: 'analytics',
  ODDS_HISTORY: 'odds_history'
};

// Enhanced Team Data with Market Values and Recent Form
const LEAGUES = {
  EPL: {
    name: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League',
    priority: 1,
    teams: {
      'Arsenal': { strength: 92, form: 90, marketValue: 1200, homeForm: 95, awayForm: 85 },
      'Manchester City': { strength: 96, form: 95, marketValue: 1500, homeForm: 98, awayForm: 94 },
      'Liverpool': { strength: 91, form: 88, marketValue: 1100, homeForm: 93, awayForm: 86 },
      'Chelsea': { strength: 84, form: 80, marketValue: 900, homeForm: 87, awayForm: 77 },
      'Manchester United': { strength: 85, form: 82, marketValue: 950, homeForm: 88, awayForm: 79 },
      'Tottenham': { strength: 83, form: 81, marketValue: 850, homeForm: 86, awayForm: 78 },
      'Newcastle United': { strength: 82, form: 80, marketValue: 700, homeForm: 85, awayForm: 75 },
      'Aston Villa': { strength: 80, form: 78, marketValue: 650, homeForm: 83, awayForm: 73 },
      'Brighton': { strength: 75, form: 78, marketValue: 500, homeForm: 80, awayForm: 76 },
      'West Ham': { strength: 78, form: 75, marketValue: 550, homeForm: 81, awayForm: 71 },
      'Fulham': { strength: 71, form: 73, marketValue: 400, homeForm: 75, awayForm: 68 },
      'Wolves': { strength: 74, form: 72, marketValue: 450, homeForm: 77, awayForm: 69 },
      'Crystal Palace': { strength: 72, form: 70, marketValue: 420, homeForm: 75, awayForm: 67 },
      'Leicester City': { strength: 73, form: 75, marketValue: 480, homeForm: 76, awayForm: 72 },
      'Everton': { strength: 69, form: 66, marketValue: 380, homeForm: 72, awayForm: 63 },
      'Brentford': { strength: 70, form: 72, marketValue: 350, homeForm: 74, awayForm: 68 },
      'Bournemouth': { strength: 68, form: 65, marketValue: 320, homeForm: 71, awayForm: 62 },
      'Nottingham Forest': { strength: 67, form: 68, marketValue: 300, homeForm: 70, awayForm: 64 },
      'Southampton': { strength: 64, form: 62, marketValue: 250, homeForm: 67, awayForm: 59 },
      'Ipswich Town': { strength: 62, form: 60, marketValue: 200, homeForm: 65, awayForm: 57 }
    }
  },
  LALIGA: {
    name: '🇪🇸 La Liga',
    priority: 2,
    teams: {
      'Real Madrid': { strength: 97, form: 95, marketValue: 1600, homeForm: 99, awayForm: 93 },
      'Barcelona': { strength: 90, form: 88, marketValue: 1300, homeForm: 93, awayForm: 85 },
      'Atletico Madrid': { strength: 88, form: 85, marketValue: 900, homeForm: 91, awayForm: 82 },
      'Real Sociedad': { strength: 81, form: 83, marketValue: 600, homeForm: 84, awayForm: 78 },
      'Athletic Bilbao': { strength: 82, form: 80, marketValue: 550, homeForm: 85, awayForm: 77 },
      'Villarreal': { strength: 78, form: 76, marketValue: 500, homeForm: 81, awayForm: 73 },
      'Real Betis': { strength: 79, form: 77, marketValue: 480, homeForm: 82, awayForm: 74 },
      'Valencia': { strength: 77, form: 75, marketValue: 450, homeForm: 80, awayForm: 72 },
      'Sevilla': { strength: 80, form: 78, marketValue: 520, homeForm: 83, awayForm: 75 },
      'Girona': { strength: 80, form: 82, marketValue: 400, homeForm: 83, awayForm: 79 }
    }
  },
  BUNDESLIGA: {
    name: '🇩🇪 Bundesliga',
    priority: 3,
    teams: {
      'Bayern Munich': { strength: 94, form: 92, marketValue: 1400, homeForm: 97, awayForm: 89 },
      'Bayer Leverkusen': { strength: 91, form: 93, marketValue: 800, homeForm: 94, awayForm: 90 },
      'Borussia Dortmund': { strength: 88, form: 86, marketValue: 750, homeForm: 91, awayForm: 83 },
      'RB Leipzig': { strength: 87, form: 88, marketValue: 700, homeForm: 90, awayForm: 84 },
      'VfB Stuttgart': { strength: 84, form: 85, marketValue: 550, homeForm: 87, awayForm: 81 }
    }
  },
  SERIEA: {
    name: '🇮🇹 Serie A',
    priority: 4,
    teams: {
      'Inter Milan': { strength: 92, form: 90, marketValue: 1000, homeForm: 95, awayForm: 87 },
      'AC Milan': { strength: 87, form: 85, marketValue: 850, homeForm: 90, awayForm: 82 },
      'Juventus': { strength: 86, form: 84, marketValue: 900, homeForm: 89, awayForm: 81 },
      'Napoli': { strength: 84, form: 82, marketValue: 750, homeForm: 87, awayForm: 79 },
      'Atalanta': { strength: 83, form: 81, marketValue: 650, homeForm: 86, awayForm: 78 }
    }
  }
};

// Enhanced Bet Types with Better Odds
const BET_TYPES = {
  // Match Result
  HOME_WIN: { name: 'Home Win', category: 'result', priority: 1 },
  DRAW: { name: 'Draw', category: 'result', priority: 2 },
  AWAY_WIN: { name: 'Away Win', category: 'result', priority: 3 },
  
  // Goals - Over/Under 0.5
  OVER05: { name: 'Over 0.5 Goals', category: 'goals', priority: 4 },
  UNDER05: { name: 'Under 0.5 Goals', category: 'goals', priority: 5 },
  
  // Goals - Over/Under 1.5
  OVER15: { name: 'Over 1.5 Goals', category: 'goals', priority: 6 },
  UNDER15: { name: 'Under 1.5 Goals', category: 'goals', priority: 7 },
  
  // Goals - Over/Under 2.5
  OVER25: { name: 'Over 2.5 Goals', category: 'goals', priority: 8 },
  UNDER25: { name: 'Under 2.5 Goals', category: 'goals', priority: 9 },
  
  // Goals - Over/Under 3.5
  OVER35: { name: 'Over 3.5 Goals', category: 'goals', priority: 10 },
  UNDER35: { name: 'Under 3.5 Goals', category: 'goals', priority: 11 },
  
  // Goals - Over/Under 4.5
  OVER45: { name: 'Over 4.5 Goals', category: 'goals', priority: 12 },
  UNDER45: { name: 'Under 4.5 Goals', category: 'goals', priority: 13 },
  
  // Both Teams to Score
  BTTS_YES: { name: 'GG (Both Score)', category: 'btts', priority: 14 },
  BTTS_NO: { name: 'NG (Not Both Score)', category: 'btts', priority: 15 },
  
  // Double Chance
  HOME_DRAW: { name: 'Home or Draw', category: 'double', priority: 16 },
  AWAY_DRAW: { name: 'Away or Draw', category: 'double', priority: 17 },
  HOME_AWAY: { name: 'Home or Away', category: 'double', priority: 18 },
  
  // Handicap
  HOME_MINUS1: { name: 'Home -1', category: 'handicap', priority: 19 },
  HOME_PLUS1: { name: 'Home +1', category: 'handicap', priority: 20 },
  AWAY_MINUS1: { name: 'Away -1', category: 'handicap', priority: 21 },
  AWAY_PLUS1: { name: 'Away +1', category: 'handicap', priority: 22 }
};

// Enhanced Bet Type Aliases
const BET_ALIASES = {
  // Match Result
  'home': 'HOME_WIN', 'homewin': 'HOME_WIN', 'hw': 'HOME_WIN',
  'draw': 'DRAW', 'd': 'DRAW',
  'away': 'AWAY_WIN', 'awaywin': 'AWAY_WIN', 'aw': 'AWAY_WIN',
  
  // Goals - Over/Under 0.5
  'over0.5': 'OVER05', 'over05': 'OVER05', 'o0.5': 'OVER05', 'o05': 'OVER05',
  'under0.5': 'UNDER05', 'under05': 'UNDER05', 'u0.5': 'UNDER05', 'u05': 'UNDER05',
  
  // Goals - Over/Under 1.5
  'over1.5': 'OVER15', 'over15': 'OVER15', 'o1.5': 'OVER15', 'o15': 'OVER15',
  'under1.5': 'UNDER15', 'under15': 'UNDER15', 'u1.5': 'UNDER15', 'u15': 'UNDER15',
  
  // Goals - Over/Under 2.5
  'over2.5': 'OVER25', 'over25': 'OVER25', 'o2.5': 'OVER25', 'o25': 'OVER25',
  'under2.5': 'UNDER25', 'under25': 'UNDER25', 'u2.5': 'UNDER25', 'u25': 'UNDER25',
  
  // Goals - Over/Under 3.5
  'over3.5': 'OVER35', 'over35': 'OVER35', 'o3.5': 'OVER35', 'o35': 'OVER35',
  'under3.5': 'UNDER35', 'under35': 'UNDER35', 'u3.5': 'UNDER35', 'u35': 'UNDER35',
  
  // Goals - Over/Under 4.5
  'over4.5': 'OVER45', 'over45': 'OVER45', 'o4.5': 'OVER45', 'o45': 'OVER45',
  'under4.5': 'UNDER45', 'under45': 'UNDER45', 'u4.5': 'UNDER45', 'u45': 'UNDER45',
  
  // BTTS
  'gg': 'BTTS_YES', 'btts': 'BTTS_YES', 'bothscore': 'BTTS_YES',
  'ng': 'BTTS_NO', 'nobtts': 'BTTS_NO', 'nobothscore': 'BTTS_NO',
  
  // Double Chance
  'homedraw': 'HOME_DRAW', 'homeordraw': 'HOME_DRAW', 'hd': 'HOME_DRAW',
  'awaydraw': 'AWAY_DRAW', 'awayordraw': 'AWAY_DRAW', 'ad': 'AWAY_DRAW',
  'homeaway': 'HOME_AWAY', 'homeoraway': 'HOME_AWAY', 'ha': 'HOME_AWAY',
  
  // Handicap
  'home-1': 'HOME_MINUS1', 'h-1': 'HOME_MINUS1',
  'home+1': 'HOME_PLUS1', 'h+1': 'HOME_PLUS1',
  'away-1': 'AWAY_MINUS1', 'a-1': 'AWAY_MINUS1',
  'away+1': 'AWAY_PLUS1', 'a+1': 'AWAY_PLUS1'
};

// Database Connection Pool
class DatabaseManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return this.db;
    
    try {
      this.client = new MongoClient(CONFIG.MONGODB_URI, {
        maxPoolSize: CONFIG.CONNECTION_POOL_SIZE,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxIdleTimeMS: 30000,
        connectTimeoutMS: 10000
      });
      
      await this.client.connect();
      this.db = this.client.db(CONFIG.DATABASE_NAME);
      await this.createIndexes();
      this.isConnected = true;
      
      console.log('✅ Enhanced Betting Database connected with connection pool');
      return this.db;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async createIndexes() {
    try {
      // Compound indexes for better query performance
      await Promise.all([
        this.db.collection(COLLECTIONS.MATCHES).createIndex({ status: 1, matchTime: 1 }),
        this.db.collection(COLLECTIONS.MATCHES).createIndex({ leagueCode: 1, status: 1 }),
        this.db.collection(COLLECTIONS.MATCHES).createIndex({ matchId: 1 }, { unique: true }),
        this.db.collection(COLLECTIONS.BETS).createIndex({ userId: 1, status: 1, placedAt: -1 }),
        this.db.collection(COLLECTIONS.BETS).createIndex({ "selections.matchId": 1, status: 1 }),
        this.db.collection(COLLECTIONS.BETSLIPS).createIndex({ userId: 1 }, { unique: true }),
        this.db.collection(COLLECTIONS.BETSLIPS).createIndex({ shareCode: 1 }),
        this.db.collection(COLLECTIONS.ANALYTICS).createIndex({ userId: 1, date: -1 })
      ]);
    } catch (error) {
      console.error('Index creation error:', error);
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('📤 Database disconnected');
    }
  }
}

// Enhanced Odds Calculator with Market Simulation
class OddsCalculator {
  static calculateRealisticOdds(homeTeam, awayTeam, league) {
    const home = league.teams[homeTeam];
    const away = league.teams[awayTeam];
    
    // Advanced strength calculation considering home advantage and form
    const homeAdvantage = 3;
    const formWeight = 0.3;
    const strengthWeight = 0.7;
    
    const effectiveHome = (home.homeForm * formWeight + home.strength * strengthWeight) + homeAdvantage;
    const effectiveAway = away.awayForm * formWeight + away.strength * strengthWeight;
    
    // Market value influence (financial strength)
    const marketInfluence = Math.log(home.marketValue / away.marketValue) * 2;
    const adjustedHome = effectiveHome + marketInfluence;
    
    // Calculate probabilities using Poisson distribution simulation
    const totalStrength = adjustedHome + effectiveAway + 30; // 30 base for draw probability
    const homeProb = Math.max(0.15, Math.min(0.70, adjustedHome / totalStrength));
    const awayProb = Math.max(0.15, Math.min(0.70, effectiveAway / totalStrength));
    const drawProb = Math.max(0.15, 1 - homeProb - awayProb);
    
    // Normalize probabilities
    const total = homeProb + drawProb + awayProb;
    const normHome = homeProb / total;
    const normDraw = drawProb / total;
    const normAway = awayProb / total;
    
    // Apply realistic bookmaker margins (5-8%)
    const margin = 0.06 + Math.random() * 0.02;
    
    // Generate odds with market fluctuation
    const fluctuation = () => 0.95 + Math.random() * 0.1; // ±5% fluctuation
    
    const odds = {
      // Main markets
      HOME_WIN: Math.max(1.01, (1 / normHome) * (1 + margin) * fluctuation()),
      DRAW: Math.max(2.80, (1 / normDraw) * (1 + margin) * fluctuation()),
      AWAY_WIN: Math.max(1.01, (1 / normAway) * (1 + margin) * fluctuation()),
      
      // Goal markets (more sophisticated calculation)
      OVER05: this.calculateGoalOdds(effectiveHome, effectiveAway, 0.5, true),
      UNDER05: this.calculateGoalOdds(effectiveHome, effectiveAway, 0.5, false),
      OVER15: this.calculateGoalOdds(effectiveHome, effectiveAway, 1.5, true),
      UNDER15: this.calculateGoalOdds(effectiveHome, effectiveAway, 1.5, false),
      OVER25: this.calculateGoalOdds(effectiveHome, effectiveAway, 2.5, true),
      UNDER25: this.calculateGoalOdds(effectiveHome, effectiveAway, 2.5, false),
      OVER35: this.calculateGoalOdds(effectiveHome, effectiveAway, 3.5, true),
      UNDER35: this.calculateGoalOdds(effectiveHome, effectiveAway, 3.5, false),
      OVER45: this.calculateGoalOdds(effectiveHome, effectiveAway, 4.5, true),
      UNDER45: this.calculateGoalOdds(effectiveHome, effectiveAway, 4.5, false),
      
      // BTTS calculation
      BTTS_YES: this.calculateBTTSOdds(home, away, true),
      BTTS_NO: this.calculateBTTSOdds(home, away, false),
      
      // Double chance
      HOME_DRAW: Math.max(1.15, 1 / (normHome + normDraw) * (1 + margin * 0.5)),
      AWAY_DRAW: Math.max(1.15, 1 / (normAway + normDraw) * (1 + margin * 0.5)),
      HOME_AWAY: Math.max(1.10, 1 / (normHome + normAway) * (1 + margin * 0.5)),
      
      // Asian Handicap
      HOME_MINUS1: this.calculateHandicapOdds(normHome, normDraw, normAway, -1, true),
      HOME_PLUS1: this.calculateHandicapOdds(normHome, normDraw, normAway, 1, true),
      AWAY_MINUS1: this.calculateHandicapOdds(normHome, normDraw, normAway, -1, false),
      AWAY_PLUS1: this.calculateHandicapOdds(normHome, normDraw, normAway, 1, false)
    };
    
    // Round and validate odds
    Object.keys(odds).forEach(key => {
      odds[key] = Math.max(CONFIG.MIN_ODDS, Math.min(CONFIG.MAX_ODDS, parseFloat(odds[key].toFixed(2))));
    });
    
    return odds;
  }
  
  static calculateGoalOdds(homeStrength, awayStrength, threshold, isOver) {
    const avgGoals = (homeStrength + awayStrength) / 40; // Normalize to realistic goal expectation
    const goalProb = isOver ? 
      Math.max(0.1, 1 - Math.exp(-avgGoals + threshold)) :
      Math.min(0.9, Math.exp(-avgGoals + threshold));
    
    return Math.max(1.01, (1 / goalProb) * (1.05 + Math.random() * 0.03));
  }
  
  static calculateBTTSOdds(home, away, bothScore) {
    const homeAttack = (home.strength + home.form) / 2;
    const awayAttack = (away.strength + away.form) / 2;
    const avgAttack = (homeAttack + awayAttack) / 2;
    
    const bttsProb = bothScore ?
      Math.max(0.3, Math.min(0.8, avgAttack / 100)) :
      1 - Math.max(0.3, Math.min(0.8, avgAttack / 100));
    
    return Math.max(1.20, (1 / bttsProb) * (1.04 + Math.random() * 0.02));
  }
  
  static calculateHandicapOdds(homeProb, drawProb, awayProb, handicap, isHome) {
    const adjustedProb = isHome ?
      homeProb + (handicap > 0 ? drawProb * 0.5 : -drawProb * 0.3) :
      awayProb + (handicap > 0 ? drawProb * 0.5 : -drawProb * 0.3);
    
    return Math.max(1.10, (1 / Math.max(0.1, Math.min(0.9, adjustedProb))) * 1.05);
  }
}

// Enhanced Match Simulator
class MatchSimulator {
  static simulateMatch(homeTeam, awayTeam, odds) {
    const homeStrength = homeTeam.homeForm || homeTeam.form;
    const awayStrength = awayTeam.awayForm || awayTeam.form;
    
    // Determine result based on realistic probabilities
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
    
    // Simulate realistic score using Poisson distribution
    const { homeGoals, awayGoals } = this.generateRealisticScore(homeStrength, awayStrength, result);
    const totalGoals = homeGoals + awayGoals;
    
    return {
      result,
      homeGoals,
      awayGoals,
      totalGoals,
      over05: totalGoals > 0.5,
      under05: totalGoals <= 0.5,
      over15: totalGoals > 1.5,
      under15: totalGoals <= 1.5,
      over25: totalGoals > 2.5,
      under25: totalGoals <= 2.5,
      over45: totalGoals > 4.5,
      under45: totalGoals <= 4.5,
      btts: homeGoals > 0 && awayGoals > 0,
      homeWinHandicap: this.checkHandicap(homeGoals, awayGoals, -1),
      awayWinHandicap: this.checkHandicap(awayGoals, homeGoals, -1)
    };
  }
  
  static generateRealisticScore(homeStrength, awayStrength, result) {
    const baseHomeGoals = homeStrength / 30;
    const baseAwayGoals = awayStrength / 30;
    
    switch (result) {
      case 'HOME_WIN':
        return {
          homeGoals: Math.max(1, Math.floor(Math.random() * 3) + 1),
          awayGoals: Math.floor(Math.random() * 2)
        };
      case 'AWAY_WIN':
        return {
          homeGoals: Math.floor(Math.random() * 2),
          awayGoals: Math.max(1, Math.floor(Math.random() * 3) + 1)
        };
      default: // DRAW
        const drawScore = Math.floor(Math.random() * 4);
        return { homeGoals: drawScore, awayGoals: drawScore };
    }
  }
  
  static checkHandicap(team1Goals, team2Goals, handicap) {
    return (team1Goals + handicap) > team2Goals;
  }
}

// Database Manager Instance
const dbManager = new DatabaseManager();

// Enhanced UI Components
class UIFormatter {
  static formatFixtures(matches, prefix) {
    if (!matches.length) return '⚽ *No fixtures available*\n\n🔄 Generating new matches...';
    
    let text = '⚽ *LIVE BETTING ODDS* ⚽\n\n';
    
    // Group by league
    const byLeague = matches.reduce((acc, match) => {
      if (!acc[match.leagueCode]) acc[match.leagueCode] = [];
      acc[match.leagueCode].push(match);
      return acc;
    }, {});
    
    Object.entries(byLeague).forEach(([code, leagueMatches]) => {
      const league = LEAGUES[code];
      text += `${league.name}\n${'═'.repeat(25)}\n\n`;
      
      leagueMatches.forEach((match, idx) => {
        const kickoff = moment(match.matchTime).tz(CONFIG.TIMEZONE).format('DD/MM HH:mm');
        const isToday = moment(match.matchTime).tz(CONFIG.TIMEZONE).isSame(moment(), 'day');
        
        text += `${idx + 1}. *${match.homeTeam}* vs *${match.awayTeam}*\n`;
        text += `🕐 ${kickoff}${isToday ? ' 🔴 TODAY' : ''}\n`;
        text += `📊 Home: ${match.odds.HOME_WIN} | Draw: ${match.odds.DRAW} | Away: ${match.odds.AWAY_WIN}\n`;
        text += `⚽ Over2.5: ${match.odds.OVER25} | Under2.5: ${match.odds.UNDER25}\n`;
        text += `🎲 Over1.5: ${match.odds.OVER15} | Under1.5: ${match.odds.UNDER15}\n`;
        text += `🎯 GG: ${match.odds.BTTS_YES} | NG: ${match.odds.BTTS_NO}\n`;
        text += `🆔 *${match.matchId}*\n\n`;
      });
    });
    
    text += `💡 *Quick Bet:* ${prefix}quickbet [id] [type] [stake]\n`;
    text += `📋 *Add to Slip:* ${prefix}betslip add [id] [type]\n`;
    text += `🎯 *Example:* ${prefix}quickbet 123 over2.5 1000`;
    
    return text;
  }
  
  static formatBetSlip(betSlip, prefix) {
    if (!betSlip?.selections?.length) {
      return `📋 *EMPTY BET SLIP*\n\n` +
             `🎯 *Quick Actions:*\n` +
             `• ${prefix}fixtures - View odds\n` +
             `• ${prefix}quickbet [id] [type] [stake]\n` +
             `• ${prefix}betslip load [code]\n\n` +
             `💰 *Popular Markets:*\n` +
             `• Match Result: home, draw, away\n` +
             `• Goals: over2.5, under2.5, over1.5, under1.5\n` +
             `• Over/Under: 0.5, 1.5, 2.5, 3.5, 4.5\n` +
             `• Both Score: gg, ng`;
    }
    
    let text = '📋 *YOUR BET SLIP* 📋\n\n';
    let totalOdds = 1;
    
    betSlip.selections.forEach((selection, idx) => {
      totalOdds *= selection.odds;
      const betTypeName = BET_TYPES[selection.betType]?.name || selection.betType;
      
      text += `${idx + 1}. *${selection.homeTeam}* vs *${selection.awayTeam}*\n`;
      text += `   🎯 ${betTypeName} @ ${selection.odds}\n`;
      text += `   ⏰ ${moment(selection.matchTime).tz(CONFIG.TIMEZONE).format('DD/MM HH:mm')}\n\n`;
    });
    
    const stake = betSlip.stake || 0;
    const potential = stake * totalOdds;
    
    text += `${'─'.repeat(30)}\n`;
    text += `📊 *${betSlip.selections.length} Selections* | Odds: *${totalOdds.toFixed(2)}*\n`;
    text += `💰 Stake: ${CONFIG.CURRENCY}${stake.toLocaleString()}\n`;
    text += `🏆 Potential: ${CONFIG.CURRENCY}${potential.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\n`;
    
    text += `⚡ *Quick Actions:*\n`;
    text += `• ${prefix}betslip stake [amount]\n`;
    text += `• ${prefix}betslip place\n`;
    text += `• ${prefix}betslip share | clear\n`;
    text += `• ${prefix}betslip remove [number]`;
    
    return text;
  }
  
  static formatActiveBets(bets, prefix) {
    if (!bets.length) {
      return `📋 *NO ACTIVE BETS*\n\n💡 Place your first bet: ${prefix}fixtures`;
    }
    
    let text = `📋 *ACTIVE BETS* 📋\n\n`;
    let totalStaked = 0;
    let totalPotential = 0;
    
    bets.forEach((bet, idx) => {
      const betId = bet._id.toString().slice(-6).toUpperCase();
      const timeAgo = moment(bet.placedAt).tz(CONFIG.TIMEZONE).fromNow();
      totalStaked += bet.stake;
      totalPotential += bet.potentialWin;
      
      text += `${idx + 1}. 🎫 *${betId}*\n`;
      text += `💰 ${CONFIG.CURRENCY}${bet.stake.toLocaleString()} @ ${bet.totalOdds.toFixed(2)}\n`;
      text += `🏆 Potential: ${CONFIG.CURRENCY}${bet.potentialWin.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
      text += `📅 ${timeAgo} | 📋 ${bet.selections.length} picks\n`;
      
      // Show bet status with live tracking
      const completedSelections = bet.selections.filter(s => s.status === 'completed').length;
      const wonSelections = bet.selections.filter(s => s.won === true).length;
      
      if (completedSelections > 0) {
        text += `📊 Progress: ${wonSelections}/${completedSelections} won`;
        if (completedSelections < bet.selections.length) {
          text += ` | ${bet.selections.length - completedSelections} pending`;
        }
        text += '\n';
      }
      text += '\n';
    });
    
    text += `${'─'.repeat(30)}\n`;
    text += `💼 *Portfolio:* ${bets.length} active bets\n`;
    text += `💰 *Total Staked:* ${CONFIG.CURRENCY}${totalStaked.toLocaleString()}\n`;
    text += `🎯 *Total Potential:* ${CONFIG.CURRENCY}${totalPotential.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\n`;
    text += `💡 *Share bet:* ${prefix}bet share [bet_id]`;
    
    return text;
  }
  
  static formatBetHistory(history) {
    if (!history.length) return '📊 *No betting history*';
    
    let text = `📊 *BETTING ANALYTICS* 📊\n\n`;
    
    // Calculate statistics
    const stats = this.calculateBettingStats(history);
    
    text += `📈 *Performance Overview:*\n`;
    text += `🎯 Win Rate: ${stats.winRate}% (${stats.wins}W/${stats.losses}L)\n`;
    text += `💰 Total Staked: ${CONFIG.CURRENCY}${stats.totalStaked.toLocaleString()}\n`;
    text += `🏆 Total Won: ${CONFIG.CURRENCY}${stats.totalWon.toLocaleString()}\n`;
    text += `📊 P&L: ${stats.profit >= 0 ? '🟢' : '🔴'} ${CONFIG.CURRENCY}${Math.abs(stats.profit).toLocaleString()}\n`;
    text += `🔥 Best Win: ${CONFIG.CURRENCY}${stats.bestWin.toLocaleString()}\n`;
    text += `📉 ROI: ${stats.roi}%\n\n`;
    
    text += `📋 *Recent Bets:*\n`;
    history.slice(0, 8).forEach(bet => {
      const betId = bet._id.toString().slice(-4);
      const date = moment(bet.placedAt).tz(CONFIG.TIMEZONE).format('DD/MM');
      const statusIcon = bet.status === 'won' ? '✅' : bet.status === 'lost' ? '❌' : '⏳';
      
      text += `${statusIcon} ${betId} | ${CONFIG.CURRENCY}${bet.stake} @ ${bet.totalOdds.toFixed(2)} | ${date}\n`;
    });
    
    return text;
  }
  
  static calculateBettingStats(history) {
    const stats = {
      totalStaked: 0,
      totalWon: 0,
      wins: 0,
      losses: 0,
      pending: 0,
      bestWin: 0,
      profit: 0,
      roi: 0,
      winRate: 0
    };
    
    history.forEach(bet => {
      stats.totalStaked += bet.stake;
      
      if (bet.status === 'won') {
        stats.wins++;
        stats.totalWon += bet.payout;
        stats.bestWin = Math.max(stats.bestWin, bet.payout);
      } else if (bet.status === 'lost') {
        stats.losses++;
      } else {
        stats.pending++;
      }
    });
    
    stats.profit = stats.totalWon - stats.totalStaked;
    stats.roi = stats.totalStaked > 0 ? ((stats.profit / stats.totalStaked) * 100).toFixed(1) : 0;
    stats.winRate = (stats.wins + stats.losses) > 0 ? 
      ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) : 0;
    
    return stats;
  }
  
  static formatMatchResults(results) {
    if (!results.length) return '📊 *No recent results*';
    
    let text = `📊 *LIVE RESULTS* 📊\n\n`;
    
    results.forEach((match, idx) => {
      const completedTime = moment(match.completedAt).tz(CONFIG.TIMEZONE).fromNow();
      const isRecent = moment().diff(moment(match.completedAt), 'hours') < 6;
      
      text += `${idx + 1}. ${match.homeTeam} *${match.result.homeGoals}-${match.result.awayGoals}* ${match.awayTeam}\n`;
      text += `🏆 ${LEAGUES[match.leagueCode].name}\n`;
      text += `⏰ ${completedTime}${isRecent ? ' 🔥' : ''}\n`;
      
      // Add result insights
      const insights = [];
      if (match.result.totalGoals > 2.5) insights.push('High Scoring');
      if (match.result.btts) insights.push('BTTS ✅');
      if (match.result.totalGoals === 0) insights.push('Boring Draw');
      
      if (insights.length) text += `📈 ${insights.join(' | ')}\n`;
      text += '\n';
    });
    
    return text;
  }
}

// Enhanced Match Generator
class MatchGenerator {
  static async generateMatches(db) {
    const matches = [];
    const now = moment();
    
    // Get busy teams
    const busyTeams = await this.getBusyTeams(db);
    
    // Generate matches for each league
    for (const [leagueCode, league] of Object.entries(LEAGUES)) {
      const availableTeams = Object.keys(league.teams).filter(team => !busyTeams.has(team));
      const matchCount = this.getMatchCountForLeague(leagueCode);
      
      const leagueMatches = this.createLeagueFixtures(
        availableTeams, 
        league, 
        leagueCode, 
        matchCount,
        now
      );
      
      matches.push(...leagueMatches);
    }
    
    return this.assignMatchIds(matches, db);
  }
  
  static async getBusyTeams(db) {
    const upcoming = await db.collection(COLLECTIONS.MATCHES).find(
      { status: 'upcoming' },
      { projection: { homeTeam: 1, awayTeam: 1 } }
    ).toArray();
    
    const busy = new Set();
    upcoming.forEach(match => {
      busy.add(match.homeTeam);
      busy.add(match.awayTeam);
    });
    
    return busy;
  }
  
  static getMatchCountForLeague(leagueCode) {
    const counts = { EPL: 8, LALIGA: 6, BUNDESLIGA: 4, SERIEA: 4 };
    return counts[leagueCode] || 4;
  }
  
  static createLeagueFixtures(teams, league, leagueCode, count, baseTime) {
    const matches = [];
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < Math.min(count * 2, shuffled.length - 1); i += 2) {
      if (!shuffled[i] || !shuffled[i + 1]) break;
      
      const homeTeam = shuffled[i];
      const awayTeam = shuffled[i + 1];
      const matchTime = this.generateMatchTime(baseTime);
      const odds = OddsCalculator.calculateRealisticOdds(homeTeam, awayTeam, league);
      
      matches.push({
        league: league.name,
        leagueCode,
        homeTeam,
        awayTeam,
        matchTime: matchTime.toDate(),
        odds,
        status: 'upcoming',
        priority: league.priority,
        createdAt: new Date(),
        lastOddsUpdate: new Date()
      });
    }
    
    return matches;
  }
  
  static generateMatchTime(baseTime) {
    // Generate matches spread over next 48-96 hours with realistic kick-off times
    const hours = Math.floor(Math.random() * 48) + 24;
    const matchTime = baseTime.clone().add(hours, 'hours');
    
    // Adjust to realistic kick-off times (12:30, 15:00, 17:30, 20:00)
    const kickOffTimes = ['12:30', '15:00', '17:30', '20:00'];
    const selectedTime = kickOffTimes[Math.floor(Math.random() * kickOffTimes.length)];
    const [hour, minute] = selectedTime.split(':');
    
    return matchTime.hour(parseInt(hour)).minute(parseInt(minute)).second(0);
  }
  
  static async assignMatchIds(matches, db) {
    try {
      const lastMatch = await db.collection(COLLECTIONS.MATCHES).findOne(
        {}, 
        { sort: { matchId: -1 }, projection: { matchId: 1 } }
      );
      
      let nextId = (lastMatch?.matchId || 0) + 1;
      matches.forEach(match => {
        match.matchId = nextId++;
      });
      
      return matches;
    } catch (error) {
      console.error('Error assigning match IDs:', error);
      return matches;
    }
  }
}

// Enhanced Betting System
class BettingSystem {
  constructor(db) {
    this.db = db;
  }
  
  async initializeSystem() {
    await this.ensureMatches();
    this.startServices();
  }
  
  async ensureMatches() {
    try {
      const upcomingCount = await this.db.collection(COLLECTIONS.MATCHES).countDocuments({ 
        status: 'upcoming' 
      });
      
      if (upcomingCount < 20) {
        const newMatches = await MatchGenerator.generateMatches(this.db);
        
        if (newMatches.length > 0) {
          await this.db.collection(COLLECTIONS.MATCHES).insertMany(newMatches);
          console.log(`✅ Generated ${newMatches.length} new matches`);
        }
      }
    } catch (error) {
      console.error('Error ensuring matches:', error);
    }
  }
  
  startServices() {
    // Auto simulation with staggered intervals
    this.simulationInterval = setInterval(() => this.autoSimulate(), CONFIG.SIMULATION_INTERVAL);
    
    // Odds fluctuation service
    this.oddsInterval = setInterval(() => this.updateLiveOdds(), 2 * 60 * 1000);
    
    console.log('✅ Enhanced betting services started');
  }
  
  async autoSimulate() {
    try {
      const now = new Date();
      const matches = await this.db.collection(COLLECTIONS.MATCHES).find({
        status: 'upcoming',
        matchTime: { $lte: now }
      }).toArray();
      
      if (!matches.length) return;
      
      console.log(`⚽ Simulating ${matches.length} matches...`);
      
      for (const match of matches) {
        await this.simulateAndSettleMatch(match);
      }
      
      await this.ensureMatches();
    } catch (error) {
      console.error('Auto simulation error:', error);
    }
  }
  
  async simulateAndSettleMatch(match) {
    try {
      const homeTeam = LEAGUES[match.leagueCode].teams[match.homeTeam];
      const awayTeam = LEAGUES[match.leagueCode].teams[match.awayTeam];
      const result = MatchSimulator.simulateMatch(homeTeam, awayTeam, match.odds);
      
      // Update match with result
      await this.db.collection(COLLECTIONS.MATCHES).updateOne(
        { matchId: match.matchId },
        { 
          $set: { 
            status: 'completed', 
            result, 
            completedAt: new Date() 
          } 
        }
      );
      
      // Settle all bets for this match
      await this.settleBetsForMatch(match.matchId, result);
      
      // Update team forms
      this.updateTeamForms(match, result);
      
      console.log(`✅ ${match.homeTeam} ${result.homeGoals}-${result.awayGoals} ${match.awayTeam}`);
      
    } catch (error) {
      console.error(`Error simulating match ${match.matchId}:`, error);
    }
  }
  
  async updateLiveOdds() {
    try {
      // Simulate live odds movement for upcoming matches
      const upcomingMatches = await this.db.collection(COLLECTIONS.MATCHES).find({
        status: 'upcoming',
        matchTime: { $gte: new Date() }
      }).limit(20).toArray();
      
      const bulkOps = upcomingMatches.map(match => {
        const league = LEAGUES[match.leagueCode];
        const newOdds = OddsCalculator.calculateRealisticOdds(
          match.homeTeam, 
          match.awayTeam, 
          league
        );
        
        return {
          updateOne: {
            filter: { matchId: match.matchId },
            update: { 
              $set: { 
                odds: newOdds, 
                lastOddsUpdate: new Date() 
              } 
            }
          }
        };
      });
      
      if (bulkOps.length > 0) {
        await this.db.collection(COLLECTIONS.MATCHES).bulkWrite(bulkOps);
      }
      
    } catch (error) {
      console.error('Error updating live odds:', error);
    }
  }
  
  async settleBetsForMatch(matchId, matchResult) {
    try {
      const affectedBets = await this.db.collection(COLLECTIONS.BETS).find({
        "selections.matchId": matchId,
        status: 'pending'
      }).toArray();
      
      for (const bet of affectedBets) {
        const updatedSelections = bet.selections.map(selection => {
          if (selection.matchId === matchId) {
            const won = this.checkSelectionResult(selection, matchResult);
            return { ...selection, status: 'completed', won, result: matchResult };
          }
          return selection;
        });
        
        // Check if all selections are completed
        const allCompleted = updatedSelections.every(s => s.status === 'completed');
        const allWon = updatedSelections.every(s => s.won === true);
        
        if (allCompleted) {
          const finalStatus = allWon ? 'won' : 'lost';
          const payout = allWon ? bet.potentialWin : 0;
          
          await this.db.collection(COLLECTIONS.BETS).updateOne(
            { _id: bet._id },
            {
              $set: {
                status: finalStatus,
                payout,
                settledAt: new Date(),
                selections: updatedSelections
              }
            }
          );
          
          if (allWon) {
            await unifiedUserManager.addMoney(bet.userId, payout, 'Sports bet win');
          }
          
          // Log analytics
          await this.logBetAnalytics(bet, finalStatus, payout);
          
        } else {
          // Just update selections
          await this.db.collection(COLLECTIONS.BETS).updateOne(
            { _id: bet._id },
            { $set: { selections: updatedSelections } }
          );
        }
      }
      
    } catch (error) {
      console.error('Error settling bets for match:', error);
    }
  }
  
  checkSelectionResult(selection, matchResult) {
    switch (selection.betType) {
      case 'HOME_WIN': return matchResult.result === 'HOME_WIN';
      case 'AWAY_WIN': return matchResult.result === 'AWAY_WIN';
      case 'DRAW': return matchResult.result === 'DRAW';
      case 'OVER05': return matchResult.over05;
      case 'UNDER05': return matchResult.under05;
      case 'OVER15': return matchResult.over15;
      case 'UNDER15': return matchResult.under15;
      case 'OVER25': return matchResult.over25;
      case 'UNDER25': return matchResult.under25;
      case 'OVER45': return matchResult.over45;
      case 'UNDER45': return matchResult.under45;
      case 'BTTS_YES': return matchResult.btts;
      case 'BTTS_NO': return !matchResult.btts;
      case 'HOME_DRAW': return ['HOME_WIN', 'DRAW'].includes(matchResult.result);
      case 'AWAY_DRAW': return ['AWAY_WIN', 'DRAW'].includes(matchResult.result);
      case 'HOME_AWAY': return ['HOME_WIN', 'AWAY_WIN'].includes(matchResult.result);
      case 'HOME_MINUS1': return matchResult.homeWinHandicap;
      case 'AWAY_MINUS1': return matchResult.awayWinHandicap;
      default: return false;
    }
  }
  
  updateTeamForms(match, result) {
    try {
      const league = LEAGUES[match.leagueCode];
      const homeTeam = league.teams[match.homeTeam];
      const awayTeam = league.teams[match.awayTeam];
      
      if (!homeTeam || !awayTeam) return;
      
      const formChange = this.calculateFormChange(result, match);
      
      // Update forms with decay
      homeTeam.form = Math.max(0, Math.min(100, homeTeam.form + formChange.home));
      awayTeam.form = Math.max(0, Math.min(100, awayTeam.form + formChange.away));
      
      // Update home/away specific forms
      if (homeTeam.homeForm) {
        homeTeam.homeForm = Math.max(0, Math.min(100, homeTeam.homeForm + formChange.home * 1.2));
      }
      if (awayTeam.awayForm) {
        awayTeam.awayForm = Math.max(0, Math.min(100, awayTeam.awayForm + formChange.away * 1.2));
      }
      
    } catch (error) {
      console.error('Error updating team forms:', error);
    }
  }
  
  calculateFormChange(result, match) {
    const goalDiff = result.homeGoals - result.awayGoals;
    let homeChange = 0;
    let awayChange = 0;
    
    if (result.result === 'HOME_WIN') {
      homeChange = 3 + Math.min(3, goalDiff);
      awayChange = -2 - Math.min(2, Math.abs(goalDiff));
    } else if (result.result === 'AWAY_WIN') {
      awayChange = 3 + Math.min(3, Math.abs(goalDiff));
      homeChange = -2 - Math.min(2, goalDiff);
    } else {
      homeChange = result.homeGoals > 2 ? 1 : 0;
      awayChange = result.awayGoals > 2 ? 1 : 0;
    }
    
    return { home: homeChange, away: awayChange };
  }
  
  async logBetAnalytics(bet, status, payout) {
    try {
      const analytics = {
        userId: bet.userId,
        betId: bet._id,
        status,
        stake: bet.stake,
        payout,
        profit: payout - bet.stake,
        odds: bet.totalOdds,
        selectionsCount: bet.selections.length,
        date: moment().tz(CONFIG.TIMEZONE).format('YYYY-MM-DD'),
        timestamp: new Date()
      };
      
      await this.db.collection(COLLECTIONS.ANALYTICS).insertOne(analytics);
    } catch (error) {
      console.error('Error logging analytics:', error);
    }
  }
}

// Enhanced Command Handlers
class CommandHandlers {
  constructor(bettingSystem) {
    this.system = bettingSystem;
    this.db = bettingSystem.db;
  }
  
  async handleFixtures(context, args) {
    const { reply, config } = context;
    
    try {
      let query = { status: 'upcoming' };
      let limit = 12;
      
      if (args.length > 0) {
        const leagueInput = args[0].toLowerCase();
        const leagueMap = {
          'epl': 'EPL', 'premier': 'EPL', 'english': 'EPL',
          'laliga': 'LALIGA', 'liga': 'LALIGA', 'spanish': 'LALIGA',
          'bundesliga': 'BUNDESLIGA', 'german': 'BUNDESLIGA',
          'seriea': 'SERIEA', 'serie': 'SERIEA', 'italian': 'SERIEA'
        };
        
        if (leagueMap[leagueInput]) {
          query.leagueCode = leagueMap[leagueInput];
          limit = 8;
        }
      }
      
      const matches = await this.db.collection(COLLECTIONS.MATCHES)
        .find(query)
        .sort({ priority: 1, matchTime: 1 })
        .limit(limit)
        .toArray();
      
      const formattedText = UIFormatter.formatFixtures(matches, config.PREFIX);
      await reply(formattedText);
      
    } catch (error) {
      await reply('❌ *Error loading fixtures*');
      console.error('Fixtures error:', error);
    }
  }
  
  async handleQuickBet(context, args) {
    const { reply, senderId, config } = context;
    
    if (args.length < 3) {
      await reply(`⚡ *Quick Bet Usage:*\n${config.PREFIX}quickbet [matchId] [betType] [stake]\n\n*Example:* ${config.PREFIX}quickbet 123 1 1000`);
      return;
    }
    
    try {
      const matchId = parseInt(args[0]);
      const betTypeInput = args[1].toLowerCase();
      const stake = parseInt(args[2]);
      
      // Validate inputs
      if (isNaN(matchId) || isNaN(stake) || stake <= 0) {
        await reply('⚠️ *Invalid input. Check match ID and stake amount.*');
        return;
      }
      
      const betType = BET_ALIASES[betTypeInput] || betTypeInput.toUpperCase();
      if (!BET_TYPES[betType]) {
        await reply('⚠️ *Invalid bet type. Use: home, draw, away, over2.5, under2.5, gg, ng*');
        return;
      }
      
      // Check user balance
      const userData = await unifiedUserManager.getUserData(senderId);
      if (userData.balance < stake) {
        await reply(`🚫 *Insufficient balance*\n💰 Available: ${CONFIG.CURRENCY}${userData.balance.toLocaleString()}`);
        return;
      }
      
      // Get match
      const match = await this.db.collection(COLLECTIONS.MATCHES).findOne({
        matchId,
        status: 'upcoming'
      });
      
      if (!match) {
        await reply('❌ *Match not found or already started*');
        return;
      }
      
      const odds = match.odds[betType];
      if (!odds) {
        await reply('❌ *Odds not available for this market*');
        return;
      }
      
      // Place bet directly
      const potentialWin = stake * odds;
      const success = await unifiedUserManager.removeMoney(senderId, stake, 'Quick sports bet');
      
      if (!success) {
        await reply('❌ *Transaction failed*');
        return;
      }
      
      const bet = {
        userId: senderId,
        betType: 'single',
        selections: [{
          matchId,
          betType,
          odds,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          matchTime: match.matchTime,
          status: 'pending'
        }],
        stake,
        totalOdds: odds,
        potentialWin,
        status: 'pending',
        placedAt: new Date()
      };
      
      const result = await this.db.collection(COLLECTIONS.BETS).insertOne(bet);
      const betId = result.insertedId.toString().slice(-6).toUpperCase();
      
      let confirmText = `⚡ *QUICK BET PLACED* ⚡\n\n`;
      confirmText += `🎫 Bet ID: *${betId}*\n`;
      confirmText += `⚽ ${match.homeTeam} vs ${match.awayTeam}\n`;
      confirmText += `🎯 ${BET_TYPES[betType].name} @ ${odds}\n`;
      confirmText += `💰 Stake: ${CONFIG.CURRENCY}${stake.toLocaleString()}\n`;
      confirmText += `🏆 Potential: ${CONFIG.CURRENCY}${potentialWin.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
      confirmText += `⏰ Kickoff: ${moment(match.matchTime).tz(CONFIG.TIMEZONE).format('DD/MM HH:mm')}\n\n`;
      confirmText += `🍀 *Good luck!*`;
      
      await reply(confirmText);
      
    } catch (error) {
      await reply('❌ *Error placing quick bet*');
      console.error('Quick bet error:', error);
    }
  }
  
  async handleTipster(context, args) {
    const { reply, config } = context;
    
    try {
      const upcomingMatches = await this.db.collection(COLLECTIONS.MATCHES)
        .find({ status: 'upcoming' })
        .sort({ matchTime: 1 })
        .limit(8)
        .toArray();
      
      if (!upcomingMatches.length) {
        await reply('🤖 *No matches available for analysis*');
        return;
      }
      
      const tips = this.generateAITips(upcomingMatches);
      let tipText = `🤖 *AI TIPSTER RECOMMENDATIONS* 🤖\n\n`;
      
      tips.forEach((tip, idx) => {
        const confidence = tip.confidence > 80 ? '🔥' : tip.confidence > 60 ? '⭐' : '💡';
        
        tipText += `${confidence} *Tip ${idx + 1}* (${tip.confidence}% confidence)\n`;
        tipText += `⚽ ${tip.match.homeTeam} vs ${tip.match.awayTeam}\n`;
        tipText += `🎯 ${tip.betType} @ ${tip.odds}\n`;
        tipText += `📝 ${tip.reasoning}\n`;
        tipText += `💰 Suggested stake: ${CONFIG.CURRENCY}${tip.suggestedStake}\n\n`;
      });
      
      tipText += `⚡ *Quick bet:* ${config.PREFIX}quickbet [id] [type] [stake]\n`;
      tipText += `🤖 *Disclaimer:* AI tips for entertainment only`;
      
      await reply(tipText);
      
    } catch (error) {
      await reply('❌ *Error generating tips*');
      console.error('Tipster error:', error);
    }
  }
  
  generateAITips(matches) {
    const tips = [];
    
    matches.slice(0, 3).forEach(match => {
      const league = LEAGUES[match.leagueCode];
      const homeTeam = league.teams[match.homeTeam];
      const awayTeam = league.teams[match.awayTeam];
      
      // Analyze best value bets
      const analysis = this.analyzeMatch(match, homeTeam, awayTeam);
      
      if (analysis.confidence > 55) {
        tips.push({
          match,
          betType: analysis.betType,
          odds: analysis.odds,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          suggestedStake: this.calculateSuggestedStake(analysis.confidence)
        });
      }
    });
    
    return tips.sort((a, b) => b.confidence - a.confidence);
  }
  
  analyzeMatch(match, homeTeam, awayTeam) {
    const formDiff = homeTeam.form - awayTeam.form;
    const strengthDiff = homeTeam.strength - awayTeam.strength;
    const marketDiff = Math.log(homeTeam.marketValue / awayTeam.marketValue);
    
    // Find value bets
    const analyses = [];
    
    // Home win analysis
    if (formDiff > 10 && strengthDiff > 5 && match.odds.HOME_WIN > 2.0) {
      analyses.push({
        betType: 'HOME_WIN',
        odds: match.odds.HOME_WIN,
        confidence: Math.min(85, 60 + formDiff + strengthDiff),
        reasoning: `Strong home form advantage (${homeTeam.form} vs ${awayTeam.form})`
      });
    }
    
    // Over 2.5 goals analysis
    const avgStrength = (homeTeam.strength + awayTeam.strength) / 2;
    if (avgStrength > 80 && match.odds.OVER25 > 1.8) {
      analyses.push({
        betType: 'OVER25',
        odds: match.odds.OVER25,
        confidence: Math.min(80, 50 + avgStrength / 3),
        reasoning: `High-quality attacking teams (avg strength: ${avgStrength.toFixed(0)})`
      });
    }
    
    // BTTS analysis
    if (homeTeam.form > 75 && awayTeam.form > 75 && match.odds.BTTS_YES > 1.6) {
      analyses.push({
        betType: 'BTTS_YES',
        odds: match.odds.BTTS_YES,
        confidence: 70,
        reasoning: `Both teams in good attacking form`
      });
    }
    
    // Return best analysis or default
    return analyses.length > 0 ? 
      analyses.sort((a, b) => b.confidence - a.confidence)[0] :
      { betType: 'HOME_WIN', odds: match.odds.HOME_WIN, confidence: 50, reasoning: 'Standard pick' };
  }
  
  calculateSuggestedStake(confidence) {
    if (confidence > 80) return 5000;
    if (confidence > 70) return 3000;
    if (confidence > 60) return 2000;
    return 1000;
  }
}

// Main Plugin Handler
export default async function enhancedBettingHandler(m, sock, config) {
  try {
    if (!m?.body?.startsWith(config.PREFIX)) return;
    
    const messageBody = m.body.slice(config.PREFIX.length).trim();
    if (!messageBody) return;
    
    const args = messageBody.split(' ').filter(arg => arg.length > 0);
    const command = args[0].toLowerCase();
    
    // Check if command belongs to this plugin
    const commandInfo = info.commands.find(c => 
      c.name === command || c.aliases.includes(command)
    );
    if (!commandInfo) return;
    
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    if (!senderId || !from) return;
    
    // Initialize database and system
    const db = await dbManager.connect();
    const bettingSystem = new BettingSystem(db);
    await bettingSystem.initializeSystem();
    
    // Initialize user
    await unifiedUserManager.initUser(senderId);
    
    const reply = async (text, options = {}) => {
      try {
        await sock.sendMessage(from, { text, ...options }, { quoted: m });
      } catch (error) {
        console.error('❌ Reply error:', error.message);
      }
    };
    
    const context = { m, sock, config, senderId, from, reply, db };
    const handlers = new CommandHandlers(bettingSystem);
    
    // Route commands
    switch (command) {
      case 'bet': case 'sportbet': case 'sportybet':
        if (args.length === 1) {
          await showEnhancedMenu(reply, config.PREFIX);
        } else {
          await handleBetCommand(context, args.slice(1), handlers);
        }
        break;
        
      case 'fixtures': case 'matches': case 'games': case 'fix':
        await handlers.handleFixtures(context, args.slice(1));
        break;
        
      case 'betslip': case 'slip': case 'bs':
        await handleEnhancedBetSlip(context, args.slice(1));
        break;
        
      case 'mybets': case 'bets': case 'mb':
        await handleEnhancedMyBets(context);
        break;
        
      case 'bethistory': case 'history': case 'bh':
        await handleEnhancedHistory(context);
        break;
        
      case 'leagues': case 'competitions': case 'lg':
        await handleEnhancedLeagues(context);
        break;
        
      case 'results': case 'recent': case 'scores': case 'res':
        await handleEnhancedResults(context);
        break;
        
      case 'quickbet': case 'qb':
        await handlers.handleQuickBet(context, args.slice(1));
        break;
        
      case 'tipster': case 'tips':
        await handlers.handleTipster(context, args.slice(1));
        break;
    }
    
  } catch (error) {
    console.error('❌ Enhanced betting plugin error:', error);
  }
}

async function showEnhancedMenu(reply, prefix) {
  const menuText = `⚽ *ENHANCED SPORTY BET* ⚽\n\n` +
    `🔥 *Quick Start:*\n` +
    `• ${prefix}fixtures - Live odds & matches\n` +
    `• ${prefix}quickbet [id] [type] [stake] - Instant bet\n` +
    `• ${prefix}tipster - AI recommendations\n\n` +
    
    `📋 *Bet Management:*\n` +
    `• ${prefix}betslip - Interactive slip\n` +
    `• ${prefix}mybets - Track active bets\n` +
    `• ${prefix}bethistory - Detailed analytics\n\n` +
    
    `🏆 *Leagues & Info:*\n` +
    `• ${prefix}leagues - League standings\n` +
    `• ${prefix}results - Live results\n\n` +
    
    `⚡ *Enhanced Features:*\n` +
    `🎯 20+ Bet Types | 🔴 Live Odds\n` +
    `🤖 AI Tips | 📊 Advanced Analytics\n` +
    `⚡ Quick Bets | 🎟️ Bet Sharing\n\n` +
    
    `💡 *Start betting:* ${prefix}fixtures`;
    
  await reply(menuText);
}

async function handleBetCommand(context, args, handlers) {
  const { reply, senderId, config } = context;
  
  try {
    if (!args.length) {
      await showEnhancedMenu(reply, config.PREFIX);
      return;
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
      case 'simulate':
        if (!isAdmin(senderId) && !isOwner(senderId)) {
          await reply('🚫 *Admin only command*');
          return;
        }
        await handleManualSimulation(context);
        break;
        
      case 'share':
        await handleSharePlacedBet(context, args.slice(1));
        break;
        
      case 'stats':
        await handlePersonalStats(context);
        break;
        
      case 'leaderboard':
        await handleLeaderboard(context);
        break;
        
      default:
        await reply(`❓ *Unknown command: ${subCommand}*\n\nUse *${config.PREFIX}bet* for menu`);
    }
  } catch (error) {
    await reply('❌ *Error processing command*');
    console.error('Bet command error:', error);
  }
}

async function handleEnhancedBetSlip(context, args) {
  const { reply, senderId, config, db } = context;
  
  try {
    if (!args || args.length === 0) {
      const betSlip = await db.collection(COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
      const formattedSlip = UIFormatter.formatBetSlip(betSlip, config.PREFIX);
      await reply(formattedSlip);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    switch (action) {
      case 'add':
        await handleAddToSlip(context, args.slice(1));
        break;
      case 'remove':
        await handleRemoveFromSlip(context, args.slice(1));
        break;
      case 'stake':
        await handleSetStake(context, args.slice(1));
        break;
      case 'place':
        await handlePlaceAccumulator(context);
        break;
      case 'clear':
        await handleClearSlip(context);
        break;
      case 'share':
        await handleShareSlip(context);
        break;
      case 'load':
        await handleLoadSlip(context, args.slice(1));
        break;
      case 'optimize':
        await handleOptimizeSlip(context);
        break;
      default:
        await reply(`❓ *Unknown action: ${action}*\n\n📋 Available: add, remove, stake, place, clear, share, load, optimize`);
    }
  } catch (error) {
    await reply('❌ *Error managing bet slip*');
    console.error('Bet slip error:', error);
  }
}

async function handleAddToSlip(context, args) {
  const { reply, senderId, config, db } = context;
  
  if (args.length < 2) {
    await reply(`⚠️ *Usage:* ${config.PREFIX}betslip add [matchId] [betType]\n\n*Example:* ${config.PREFIX}betslip add 123 o2.5`);
    return;
  }
  
  try {
    const matchId = parseInt(args[0]);
    const betTypeInput = args[1].toLowerCase();
    const betType = BET_ALIASES[betTypeInput] || betTypeInput.toUpperCase();
    
    if (isNaN(matchId)) {
      await reply('⚠️ *Invalid match ID*');
      return;
    }
    
    if (!BET_TYPES[betType]) {
      await reply(`⚠️ *Invalid bet type*\n\n🎯 *Available:* home, draw, away, over2.5, under2.5, over1.5, under1.5, gg, ng`);
      return;
    }
    
    const match = await db.collection(COLLECTIONS.MATCHES).findOne({
      matchId,
      status: 'upcoming'
    });
    
    if (!match) {
      await reply('❌ *Match not found or already started*');
      return;
    }
    
    const odds = match.odds[betType];
    if (!odds) {
      await reply('❌ *Odds not available for this market*');
      return;
    }
    
    // Get or create bet slip
    let betSlip = await db.collection(COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    if (!betSlip) {
      betSlip = {
        userId: senderId,
        selections: [],
        stake: 0,
        createdAt: new Date()
      };
    }
    
    // Check for duplicates
    const existingIndex = betSlip.selections.findIndex(s => 
      s.matchId === matchId && s.betType === betType
    );
    
    if (existingIndex !== -1) {
      // Update existing selection with latest odds
      betSlip.selections[existingIndex] = {
        ...betSlip.selections[existingIndex],
        odds,
        updatedAt: new Date()
      };
    } else {
      // Add new selection
      if (betSlip.selections.length >= CONFIG.MAX_SLIP_SELECTIONS) {
        await reply(`⚠️ *Maximum ${CONFIG.MAX_SLIP_SELECTIONS} selections allowed*`);
        return;
      }
      
      betSlip.selections.push({
        matchId,
        betType,
        odds,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        matchTime: match.matchTime,
        addedAt: new Date()
      });
    }
    
    await db.collection(COLLECTIONS.BETSLIPS).replaceOne(
      { userId: senderId },
      { ...betSlip, updatedAt: new Date() },
      { upsert: true }
    );
    
    const totalOdds = betSlip.selections.reduce((acc, sel) => acc * sel.odds, 1);
    
    let confirmText = `✅ *ADDED TO SLIP*\n\n`;
    confirmText += `⚽ ${match.homeTeam} vs ${match.awayTeam}\n`;
    confirmText += `🎯 ${BET_TYPES[betType].name} @ ${odds}\n`;
    confirmText += `📋 Selections: ${betSlip.selections.length}/${CONFIG.MAX_SLIP_SELECTIONS}\n`;
    confirmText += `📊 Total Odds: ${totalOdds.toFixed(2)}\n\n`;
    confirmText += `⚡ *Quick:* ${config.PREFIX}betslip stake [amount]`;
    
    await reply(confirmText);
    
  } catch (error) {
    await reply('❌ *Error adding to slip*');
    console.error('Add to slip error:', error);
  }
}

async function handlePlaceAccumulator(context) {
  const { reply, senderId, db, sock, from } = context;
  
  try {
    const betSlip = await db.collection(COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    
    if (!betSlip?.selections?.length) {
      await reply('📋 *Bet slip is empty*');
      return;
    }
    
    if (!betSlip.stake || betSlip.stake <= 0) {
      await reply('💰 *Please set stake first*');
      return;
    }
    
    // Validate user balance
    const userData = await unifiedUserManager.getUserData(senderId);
    if (userData.balance < betSlip.stake) {
      await reply(`🚫 *Insufficient balance*\n💰 Available: ${CONFIG.CURRENCY}${userData.balance.toLocaleString()}`);
      return;
    }
    
    // Validate all matches are still available
    for (const selection of betSlip.selections) {
      const match = await db.collection(COLLECTIONS.MATCHES).findOne({
        matchId: selection.matchId,
        status: 'upcoming'
      });
      
      if (!match) {
        await reply(`❌ *Match ${selection.homeTeam} vs ${selection.awayTeam} no longer available*`);
        return;
      }
      
      // Update with latest odds
      selection.odds = match.odds[selection.betType];
      selection.matchTime = match.matchTime;
    }
    
    const totalOdds = betSlip.selections.reduce((acc, sel) => acc * sel.odds, 1);
    const potentialWin = betSlip.stake * totalOdds;
    
    // Deduct stake
    const success = await unifiedUserManager.removeMoney(senderId, betSlip.stake, 'Accumulator bet');
    if (!success) {
      await reply('❌ *Transaction failed*');
      return;
    }
    
    // Create bet record
    const bet = {
      userId: senderId,
      betType: 'accumulator',
      selections: betSlip.selections.map(sel => ({ ...sel, status: 'pending' })),
      stake: betSlip.stake,
      totalOdds,
      potentialWin,
      status: 'pending',
      placedAt: new Date(),
      shareCode: Math.random().toString(36).substring(2, 8).toUpperCase()
    };
    
    const result = await db.collection(COLLECTIONS.BETS).insertOne(bet);
    const betId = result.insertedId.toString().slice(-6).toUpperCase();
    
    // Clear bet slip
    await db.collection(COLLECTIONS.BETSLIPS).deleteOne({ userId: senderId });
    
    // Send confirmation
    let confirmText = `🎉 *ACCUMULATOR PLACED* 🎉\n\n`;
    confirmText += `🎫 Bet ID: *${betId}*\n`;
    confirmText += `💰 Stake: ${CONFIG.CURRENCY}${betSlip.stake.toLocaleString()}\n`;
    confirmText += `📊 Total Odds: ${totalOdds.toFixed(2)}\n`;
    confirmText += `🏆 Potential Win: ${CONFIG.CURRENCY}${potentialWin.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\n`;
    
    confirmText += `📋 *Your ${betSlip.selections.length} Selections:*\n`;
    betSlip.selections.forEach((sel, idx) => {
      confirmText += `${idx + 1}. ${sel.homeTeam} vs ${sel.awayTeam}\n`;
      confirmText += `   🎯 ${BET_TYPES[sel.betType].name} @ ${sel.odds}\n`;
    });
    
    const updatedBalance = await unifiedUserManager.getUserData(senderId);
    confirmText += `\n💵 New Balance: ${CONFIG.CURRENCY}${updatedBalance.balance.toLocaleString()}\n`;
    confirmText += `🎟️ Share Code: *${bet.shareCode}*\n\n`;
    confirmText += `🍀 *Best of luck!*`;
    
    await sock.sendMessage(from, { text: confirmText, mentions: [senderId] });
    
  } catch (error) {
    await reply('❌ *Error placing accumulator*');
    console.error('Place accumulator error:', error);
  }
}

async function handleEnhancedMyBets(context) {
  const { reply, senderId, config, db } = context;
  
  try {
    const activeBets = await db.collection(COLLECTIONS.BETS)
      .find({ userId: senderId, status: 'pending' })
      .sort({ placedAt: -1 })
      .limit(15)
      .toArray();
    
    const formattedBets = UIFormatter.formatActiveBets(activeBets, config.PREFIX);
    await reply(formattedBets);
    
  } catch (error) {
    await reply('❌ *Error loading active bets*');
    console.error('Active bets error:', error);
  }
}

async function handleEnhancedHistory(context) {
  const { reply, senderId, db } = context;
  
  try {
    const history = await db.collection(COLLECTIONS.BETS)
      .find({ userId: senderId })
      .sort({ placedAt: -1 })
      .limit(20)
      .toArray();
    
    const formattedHistory = UIFormatter.formatBetHistory(history);
    await reply(formattedHistory);
    
  } catch (error) {
    await reply('❌ *Error loading bet history*');
    console.error('Bet history error:', error);
  }
}

async function handleEnhancedResults(context) {
  const { reply, db } = context;
  
  try {
    const results = await db.collection(COLLECTIONS.MATCHES)
      .find({ status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(12)
      .toArray();
    
    const formattedResults = UIFormatter.formatMatchResults(results);
    await reply(formattedResults);
    
  } catch (error) {
    await reply('❌ *Error loading results*');
    console.error('Results error:', error);
  }
}

async function handleEnhancedLeagues(context) {
  const { reply, config, db } = context;
  
  try {
    let text = `🏆 *ENHANCED LEAGUES* 🏆\n\n`;
    
    for (const [code, league] of Object.entries(LEAGUES)) {
      const upcomingCount = await db.collection(COLLECTIONS.MATCHES).countDocuments({
        leagueCode: code,
        status: 'upcoming'
      });
      
      const recentResults = await db.collection(COLLECTIONS.MATCHES).countDocuments({
        leagueCode: code,
        status: 'completed',
        completedAt: { $gte: moment().subtract(24, 'hours').toDate() }
      });
      
      text += `${league.name}\n`;
      text += `👥 ${Object.keys(league.teams).length} teams\n`;
      text += `⚽ ${upcomingCount} upcoming | 📊 ${recentResults} recent\n`;
      text += `🎯 View: ${config.PREFIX}fixtures ${code.toLowerCase()}\n\n`;
    }
    
    text += `💡 *All fixtures:* ${config.PREFIX}fixtures`;
    await reply(text);
    
  } catch (error) {
    await reply('❌ *Error loading leagues*');
    console.error('Leagues error:', error);
  }
}

async function handleSetStake(context, args) {
  const { reply, senderId, config, db } = context;
  
  if (!args.length) {
    await reply(`⚠️ *Usage:* ${config.PREFIX}betslip stake [amount]`);
    return;
  }
  
  try {
    const stakeAmount = parseInt(args[0]);
    
    if (isNaN(stakeAmount) || stakeAmount <= 0) {
      await reply('⚠️ *Invalid stake amount*');
      return;
    }
    
    if (stakeAmount > 1000000) {
      await reply('⚠️ *Maximum stake: ₦1,000,000*');
      return;
    }
    
    const userData = await unifiedUserManager.getUserData(senderId);
    if (userData.balance < stakeAmount) {
      await reply(`🚫 *Insufficient balance*\n💰 Available: ${CONFIG.CURRENCY}${userData.balance.toLocaleString()}`);
      return;
    }
    
    const betSlip = await db.collection(COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    if (!betSlip?.selections?.length) {
      await reply('📋 *Add selections to slip first*');
      return;
    }
    
    await db.collection(COLLECTIONS.BETSLIPS).updateOne(
      { userId: senderId },
      { $set: { stake: stakeAmount, updatedAt: new Date() } }
    );
    
    const totalOdds = betSlip.selections.reduce((acc, sel) => acc * sel.odds, 1);
    const potentialWin = stakeAmount * totalOdds;
    
    let confirmText = `💰 *STAKE SET* 💰\n\n`;
    confirmText += `💵 Stake: ${CONFIG.CURRENCY}${stakeAmount.toLocaleString()}\n`;
    confirmText += `📊 Total Odds: ${totalOdds.toFixed(2)}\n`;
    confirmText += `🏆 Potential Win: ${CONFIG.CURRENCY}${potentialWin.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
    confirmText += `📋 Selections: ${betSlip.selections.length}\n\n`;
    confirmText += `✅ *Place bet:* ${config.PREFIX}betslip place`;
    
    await reply(confirmText);
    
  } catch (error) {
    await reply('❌ *Error setting stake*');
    console.error('Set stake error:', error);
  }
}

async function handleOptimizeSlip(context) {
  const { reply, senderId, db } = context;
  
  try {
    const betSlip = await db.collection(COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    
    if (!betSlip?.selections?.length) {
      await reply('📋 *No selections to optimize*');
      return;
    }
    
    // Analyze slip for optimization suggestions
    const analysis = analyzeSlipForOptimization(betSlip);
    
    let optimizationText = `🔍 *SLIP ANALYSIS* 🔍\n\n`;
    optimizationText += `📊 Current Odds: ${analysis.totalOdds.toFixed(2)}\n`;
    optimizationText += `🎯 Risk Level: ${analysis.riskLevel}\n`;
    optimizationText += `💡 Success Probability: ~${analysis.successProb}%\n\n`;
    
    optimizationText += `💭 *Suggestions:*\n`;
    analysis.suggestions.forEach((suggestion, idx) => {
      optimizationText += `${idx + 1}. ${suggestion}\n`;
    });
    
    await reply(optimizationText);
    
  } catch (error) {
    await reply('❌ *Error analyzing slip*');
    console.error('Optimization error:', error);
  }
}

function analyzeSlipForOptimization(betSlip) {
  const totalOdds = betSlip.selections.reduce((acc, sel) => acc * sel.odds, 1);
  const avgOdds = Math.pow(totalOdds, 1 / betSlip.selections.length);
  
  let riskLevel = 'Low';
  if (totalOdds > 50) riskLevel = 'Very High';
  else if (totalOdds > 20) riskLevel = 'High';
  else if (totalOdds > 5) riskLevel = 'Medium';
  
  const successProb = Math.max(1, (1 / totalOdds * 100)).toFixed(1);
  
  const suggestions = [];
  
  if (betSlip.selections.length > 8) {
    suggestions.push('Consider reducing selections for better win chances');
  }
  
  if (avgOdds > 3) {
    suggestions.push('Some high-risk selections detected - consider safer alternatives');
  }
  
  if (betSlip.selections.length < 3) {
    suggestions.push('Add more selections for higher potential returns');
  }
  
  const hasConflicting = betSlip.selections.some((sel, idx) => 
    betSlip.selections.slice(idx + 1).some(other => 
      sel.matchId === other.matchId && areConflictingBets(sel.betType, other.betType)
    )
  );
  
  if (hasConflicting) {
    suggestions.push('⚠️ Conflicting bets detected on same match');
  }
  
  if (suggestions.length === 0) {
    suggestions.push('✅ Your slip looks well-balanced!');
  }
  
  return {
    totalOdds,
    riskLevel,
    successProb,
    suggestions
  };
}

function areConflictingBets(type1, type2) {
  const conflicts = [
    ['OVER25', 'UNDER25'],
    ['OVER15', 'UNDER15'],
    ['BTTS_YES', 'BTTS_NO'],
    ['HOME_WIN', 'AWAY_WIN'],
    ['HOME_WIN', 'AWAY_DRAW'],
    ['AWAY_WIN', 'HOME_DRAW']
  ];
  
  return conflicts.some(([a, b]) => 
    (type1 === a && type2 === b) || (type1 === b && type2 === a)
  );
}

async function handleSharePlacedBet(context, args) {
  const { reply, senderId, config, db } = context;
  
  if (!args.length) {
    await reply(`⚠️ *Usage:* ${config.PREFIX}bet share [bet_id]`);
    return;
  }
  
  try {
    const betId = args[0].toUpperCase();
    
    const bet = await db.collection(COLLECTIONS.BETS).findOne({
      userId: senderId,
      status: 'pending'
    });
    
    const foundBet = await db.collection(COLLECTIONS.BETS).findOne({
      userId: senderId,
      status: 'pending',
      $expr: {
        $eq: [
          { $substr: [{ $toString: '$_id' }, -6, 6] },
          betId
        ]
      }
    });
    
    if (!foundBet) {
      await reply(`❌ *Bet ${betId} not found in your active bets*`);
      return;
    }
    
    const shareCode = foundBet.shareCode || betId;
    
    let shareText = `🎟️ *SHARE YOUR BET* 🎟️\n\n`;
    shareText += `📱 *Code:* ${shareCode}\n\n`;
    shareText += `🎯 ${foundBet.selections.length} selections\n`;
    shareText += `📊 Total Odds: ${foundBet.totalOdds.toFixed(2)}\n`;
    shareText += `💰 Stake: ${CONFIG.CURRENCY}${foundBet.stake.toLocaleString()}\n`;
    shareText += `🏆 Potential: ${CONFIG.CURRENCY}${foundBet.potentialWin.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\n`;
    shareText += `📲 *Friends can copy with:*\n${config.PREFIX}betslip load ${shareCode}`;
    
    await reply(shareText);
    
  } catch (error) {
    await reply('❌ *Error sharing bet*');
    console.error('Share bet error:', error);
  }
}

async function handlePersonalStats(context) {
  const { reply, senderId, db } = context;
  
  try {
    const [history, analytics] = await Promise.all([
      db.collection(COLLECTIONS.BETS).find({ userId: senderId }).toArray(),
      db.collection(COLLECTIONS.ANALYTICS).find({ userId: senderId }).sort({ date: -1 }).limit(30).toArray()
    ]);
    
    if (!history.length) {
      await reply('📊 *No betting data available*');
      return;
    }
    
    const stats = UIFormatter.calculateBettingStats(history);
    
    let statsText = `📊 *YOUR BETTING PROFILE* 📊\n\n`;
    
    // Overall performance
    statsText += `🎯 *Performance Metrics:*\n`;
    statsText += `🏆 Win Rate: ${stats.winRate}%\n`;
    statsText += `💰 Total Wagered: ${CONFIG.CURRENCY}${stats.totalStaked.toLocaleString()}\n`;
    statsText += `📈 P&L: ${stats.profit >= 0 ? '🟢' : '🔴'} ${CONFIG.CURRENCY}${Math.abs(stats.profit).toLocaleString()}\n`;
    statsText += `📊 ROI: ${stats.roi}%\n\n`;
    
    // Betting patterns
    const patterns = analyzeBettingPatterns(history);
    statsText += `🎲 *Betting Patterns:*\n`;
    statsText += `🎯 Favorite Market: ${patterns.favoriteMarket}\n`;
    statsText += `💵 Avg Stake: ${CONFIG.CURRENCY}${patterns.avgStake.toLocaleString()}\n`;
    statsText += `📊 Avg Odds: ${patterns.avgOdds.toFixed(2)}\n`;
    statsText += `🔥 Best Streak: ${patterns.bestStreak} wins\n\n`;
    
    // Recent form
    const recentForm = calculateRecentForm(history.slice(0, 10));
    statsText += `📈 *Recent Form (Last 10):*\n`;
    statsText += `${recentForm.visual}\n`;
    statsText += `Trend: ${recentForm.trend}\n\n`;
    
    statsText += `💡 *Improve your game with AI tips!*`;
    
    await reply(statsText);
    
  } catch (error) {
    await reply('❌ *Error loading stats*');
    console.error('Personal stats error:', error);
  }
}

function analyzeBettingPatterns(history) {
  if (!history.length) return {};
  
  const marketCounts = {};
  let totalStake = 0;
  let totalOdds = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  
  history.forEach(bet => {
    totalStake += bet.stake;
    totalOdds += bet.totalOdds;
    
    // Count market preferences
    bet.selections.forEach(sel => {
      const category = BET_TYPES[sel.betType]?.category || 'other';
      marketCounts[category] = (marketCounts[category] || 0) + 1;
    });
    
    // Calculate streaks
    if (bet.status === 'won') {
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else if (bet.status === 'lost') {
      currentStreak = 0;
    }
  });
  
  const favoriteMarket = Object.entries(marketCounts).reduce((a, b) => 
    marketCounts[a[0]] > marketCounts[b[0]] ? a : b
  )[0];
  
  return {
    favoriteMarket: formatMarketName(favoriteMarket),
    avgStake: Math.round(totalStake / history.length),
    avgOdds: totalOdds / history.length,
    bestStreak
  };
}

function formatMarketName(category) {
  const names = {
    'result': 'Match Results',
    'goals': 'Goal Markets',
    'btts': 'Both Teams Score',
    'double': 'Double Chance',
    'handicap': 'Handicap'
  };
  return names[category] || category;
}

function calculateRecentForm(recentBets) {
  if (!recentBets.length) return { visual: 'No recent bets', trend: 'Unknown' };
  
  const results = recentBets.reverse().map(bet => {
    if (bet.status === 'won') return '✅';
    if (bet.status === 'lost') return '❌';
    return '⏳';
  });
  
  const wins = results.filter(r => r === '✅').length;
  const losses = results.filter(r => r === '❌').length;
  
  let trend;
  if (wins > losses * 1.5) trend = '📈 Hot Streak';
  else if (losses > wins * 1.5) trend = '📉 Cold Spell';
  else trend = '➡️ Steady';
  
  return {
    visual: results.join(' '),
    trend
  };
}

async function handleLeaderboard(context) {
  const { reply, db } = context;
  
  try {
    // Get top performers from analytics
    const topPerformers = await db.collection(COLLECTIONS.ANALYTICS).aggregate([
      {
        $group: {
          _id: '$userId',
          totalProfit: { $sum: '$profit' },
          totalBets: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
          totalStaked: { $sum: '$stake' }
        }
      },
      {
        $match: {
          totalBets: { $gte: 5 } // Minimum 5 bets to qualify
        }
      },
      {
        $addFields: {
          winRate: { $multiply: [{ $divide: ['$wins', '$totalBets'] }, 100] },
          roi: { 
            $multiply: [
              { $divide: ['$totalProfit', '$totalStaked'] }, 
              100
            ] 
          }
        }
      },
      { $sort: { totalProfit: -1 } },
      { $limit: 10 }
    ]).toArray();
    
    if (!topPerformers.length) {
      await reply('🏆 *No qualifying bettors yet*\n\n💡 *Minimum 5 settled bets required*');
      return;
    }
    
    let leaderboardText = `🏆 *BETTING LEADERBOARD* 🏆\n\n`;
    
    topPerformers.forEach((player, idx) => {
      const position = idx + 1;
      const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
      const userId = player._id.split('@')[0].slice(-4);
      
      leaderboardText += `${medal} Player ${userId}\n`;
      leaderboardText += `💰 Profit: ${CONFIG.CURRENCY}${player.totalProfit.toLocaleString()}\n`;
      leaderboardText += `📊 ROI: ${player.roi.toFixed(1)}% | Win Rate: ${player.winRate.toFixed(1)}%\n`;
      leaderboardText += `🎯 Bets: ${player.totalBets}\n\n`;
    });
    
    leaderboardText += `💡 *Climb the leaderboard with smart betting!*`;
    
    await reply(leaderboardText);
    
  } catch (error) {
    await reply('❌ *Error loading leaderboard*');
    console.error('Leaderboard error:', error);
  }
}

async function handleManualSimulation(context) {
  const { reply, senderId, db } = context;
  
  try {
    const upcomingMatches = await db.collection(COLLECTIONS.MATCHES)
      .find({ status: 'upcoming' })
      .sort({ matchTime: 1 })
      .limit(5)
      .toArray();
    
    if (!upcomingMatches.length) {
      await reply('⚽ *No matches to simulate*');
      return;
    }
    
    let simText = `⚽ *MANUAL SIMULATION* ⚽\n\n`;
    const bettingSystem = new BettingSystem(db);
    
    for (const match of upcomingMatches) {
      await bettingSystem.simulateAndSettleMatch(match);
      
      const updatedMatch = await db.collection(COLLECTIONS.MATCHES).findOne({
        matchId: match.matchId
      });
      
      if (updatedMatch?.result) {
        simText += `${match.homeTeam} *${updatedMatch.result.homeGoals}-${updatedMatch.result.awayGoals}* ${match.awayTeam}\n`;
        simText += `🏆 ${match.league}\n`;
        
        const insights = [];
        if (updatedMatch.result.over25) insights.push('Over 2.5 ✅');
        if (updatedMatch.result.btts) insights.push('BTTS ✅');
        if (updatedMatch.result.totalGoals === 0) insights.push('Clean Sheets');
        
        if (insights.length) simText += `📈 ${insights.join(' | ')}\n`;
        simText += '\n';
      }
    }
    
    simText += `✅ *All bets settled automatically*\n🔄 *New matches generated*`;
    await reply(simText);
    
    // Generate new matches
    await bettingSystem.ensureMatches();
    
  } catch (error) {
    await reply('❌ *Error running simulation*');
    console.error('Manual simulation error:', error);
  }
}

// Utility Functions
function isAdmin(userId) {
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  return adminNumbers.includes(userId.split('@')[0]);
}

function isOwner(userId) {
  const ownerNumber = process.env.OWNER_NUMBER || '';
  return userId.split('@')[0] === ownerNumber;
}

// Enhanced Error Handler
function handleError(error, context, fallbackMessage = 'An error occurred') {
  console.error('Enhanced Betting Error:', {
    error: error.message,
    stack: error.stack,
    context: {
      command: context.command,
      userId: context.senderId?.split('@')[0],
      timestamp: new Date().toISOString()
    }
  });
  
  return fallbackMessage;
}

// Performance Monitoring
class PerformanceMonitor {
  static timers = new Map();
  
  static start(operation) {
    this.timers.set(operation, Date.now());
  }
  
  static end(operation) {
    const start = this.timers.get(operation);
    if (start) {
      const duration = Date.now() - start;
      this.timers.delete(operation);
      
      if (duration > 1000) {
        console.warn(`⚠️ Slow operation: ${operation} took ${duration}ms`);
      }
      
      return duration;
    }
    return 0;
  }
}

// Enhanced remaining handlers with better error handling and performance
async function handleClearSlip(context) {
  const { reply, senderId, db } = context;
  
  try {
    PerformanceMonitor.start('clearSlip');
    
    const result = await db.collection(COLLECTIONS.BETSLIPS).deleteOne({ userId: senderId });
    
    if (result.deletedCount > 0) {
      await reply('🗑️ *Bet slip cleared successfully*');
    } else {
      await reply('📋 *Bet slip was already empty*');
    }
    
    PerformanceMonitor.end('clearSlip');
    
  } catch (error) {
    await reply(handleError(error, context, '❌ *Error clearing bet slip*'));
  }
}

async function handleShareSlip(context) {
  const { reply, senderId, config, db } = context;
  
  try {
    const betSlip = await db.collection(COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    
    if (!betSlip?.selections?.length) {
      await reply('📋 *Cannot share empty bet slip*');
      return;
    }
    
    let shareCode = betSlip.shareCode;
    if (!shareCode) {
      shareCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      await db.collection(COLLECTIONS.BETSLIPS).updateOne(
        { userId: senderId },
        { $set: { shareCode, sharedAt: new Date() } }
      );
    }
    
    const totalOdds = betSlip.selections.reduce((acc, sel) => acc * sel.odds, 1);
    
    let shareText = `🎟️ *SHARE BET SLIP* 🎟️\n\n`;
    shareText += `📱 *Code:* ${shareCode}\n`;
    shareText += `📋 ${betSlip.selections.length} selections\n`;
    shareText += `📊 Total Odds: ${totalOdds.toFixed(2)}\n\n`;
    shareText += `📲 *Friends can load with:*\n${config.PREFIX}betslip load ${shareCode}\n\n`;
    shareText += `⏰ *Code expires in 24 hours*`;
    
    await reply(shareText);
    
  } catch (error) {
    await reply('❌ *Error sharing slip*');
    console.error('Share slip error:', error);
  }
}

async function handleLoadSlip(context, args) {
  const { reply, senderId, config, db } = context;
  
  if (!args.length) {
    await reply(`⚠️ *Usage:* ${config.PREFIX}betslip load [code]`);
    return;
  }
  
  try {
    const shareCode = args[0].toUpperCase();
    
    // Search in both active slips and placed bets
    const [pendingSlip, placedBet] = await Promise.all([
      db.collection(COLLECTIONS.BETSLIPS).findOne({ shareCode }),
      db.collection(COLLECTIONS.BETS).findOne({ shareCode, status: 'pending' })
    ]);
    
    let sourceSelections = null;
    let sourceType = null;
    
    if (pendingSlip) {
      sourceSelections = pendingSlip.selections;
      sourceType = 'pending slip';
    } else if (placedBet) {
      sourceSelections = placedBet.selections;
      sourceType = 'placed bet';
    }
    
    if (!sourceSelections) {
      await reply(`❌ *Code ${shareCode} not found or expired*`);
      return;
    }
    
    // Validate and update selections with current odds
    let validSelections = [];
    let expiredCount = 0;
    
    for (const selection of sourceSelections) {
      const match = await db.collection(COLLECTIONS.MATCHES).findOne({
        matchId: selection.matchId,
        status: 'upcoming'
      });
      
      if (match && match.odds[selection.betType]) {
        validSelections.push({
          matchId: selection.matchId,
          betType: selection.betType,
          odds: match.odds[selection.betType], // Use current odds
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          matchTime: match.matchTime,
          addedAt: new Date()
        });
      } else {
        expiredCount++;
      }
    }
    
    if (!validSelections.length) {
      await reply(`❌ *All selections from code ${shareCode} have expired*`);
      return;
    }
    
    // Replace user's bet slip
    await db.collection(COLLECTIONS.BETSLIPS).replaceOne(
      { userId: senderId },
      {
        userId: senderId,
        selections: validSelections,
        stake: 0,
        createdAt: new Date(),
        loadedFrom: shareCode,
        sourceType
      },
      { upsert: true }
    );
    
    const totalOdds = validSelections.reduce((acc, sel) => acc * sel.odds, 1);
    
    let loadText = `✅ *BET SLIP LOADED* ✅\n\n`;
    loadText += `🎟️ From: ${sourceType} (${shareCode})\n`;
    loadText += `📋 Loaded: ${validSelections.length} selections\n`;
    loadText += `📊 Total Odds: ${totalOdds.toFixed(2)}\n`;
    
    if (expiredCount > 0) {
      loadText += `⚠️ Expired: ${expiredCount} selections\n`;
    }
    
    loadText += `\n💡 *Set stake:* ${config.PREFIX}betslip stake [amount]`;
    
    await reply(loadText);
    
  } catch (error) {
    await reply('❌ *Error loading bet slip*');
    console.error('Load slip error:', error);
  }
}

async function handleRemoveFromSlip(context, args) {
  const { reply, senderId, config, db } = context;
  
  if (!args.length) {
    await reply(`⚠️ *Usage:* ${config.PREFIX}betslip remove [number]`);
    return;
  }
  
  try {
    const selectionNumber = parseInt(args[0]);
    
    if (isNaN(selectionNumber) || selectionNumber < 1) {
      await reply('⚠️ *Invalid selection number*');
      return;
    }
    
    const betSlip = await db.collection(COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    
    if (!betSlip?.selections?.length) {
      await reply('📋 *Bet slip is empty*');
      return;
    }
    
    if (selectionNumber > betSlip.selections.length) {
      await reply(`⚠️ *Selection ${selectionNumber} not found. You have ${betSlip.selections.length} selections.*`);
      return;
    }
    
    const removed = betSlip.selections.splice(selectionNumber - 1, 1)[0];
    
    if (betSlip.selections.length === 0) {
      await db.collection(COLLECTIONS.BETSLIPS).deleteOne({ userId: senderId });
      await reply('🗑️ *Last selection removed. Bet slip cleared.*');
    } else {
      await db.collection(COLLECTIONS.BETSLIPS).updateOne(
        { userId: senderId },
        { 
          $set: { 
            selections: betSlip.selections, 
            updatedAt: new Date() 
          } 
        }
      );
      
      const newTotalOdds = betSlip.selections.reduce((acc, sel) => acc * sel.odds, 1);
      
      let removeText = `✅ *SELECTION REMOVED*\n\n`;
      removeText += `❌ ${removed.homeTeam} vs ${removed.awayTeam}\n`;
      removeText += `📋 Remaining: ${betSlip.selections.length} selections\n`;
      removeText += `📊 New Total Odds: ${newTotalOdds.toFixed(2)}`;
      
      await reply(removeText);
    }
    
  } catch (error) {
    await reply('❌ *Error removing selection*');
    console.error('Remove selection error:', error);
  }
}

// System Lifecycle Management
class SystemManager {
  static instance = null;
  
  static getInstance() {
    if (!this.instance) {
      this.instance = new SystemManager();
    }
    return this.instance;
  }
  
  async initialize() {
    try {
      const db = await dbManager.connect();
      this.bettingSystem = new BettingSystem(db);
      await this.bettingSystem.initializeSystem();
      
      // Setup graceful shutdown
      this.setupShutdownHandlers();
      
      console.log('🚀 Enhanced Betting System initialized successfully');
      
    } catch (error) {
      console.error('❌ System initialization failed:', error);
      throw error;
    }
  }
  
  setupShutdownHandlers() {
    const gracefulShutdown = async (signal) => {
      console.log(`📤 Received ${signal}. Shutting down Enhanced Betting System...`);
      
      try {
        // Stop all intervals
        if (this.bettingSystem?.simulationInterval) {
          clearInterval(this.bettingSystem.simulationInterval);
        }
        if (this.bettingSystem?.oddsInterval) {
          clearInterval(this.bettingSystem.oddsInterval);
        }
        
        // Disconnect database
        await dbManager.disconnect();
        
        console.log('✅ Enhanced Betting System shutdown complete');
        process.exit(0);
        
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught exception:', error);
      gracefulShutdown('uncaughtException');
    });
  }
}

// Cache Manager for Performance
class CacheManager {
  static cache = new Map();
  static TTL = 5 * 60 * 1000; // 5 minutes
  
  static set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
  
  static get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  static clear() {
    this.cache.clear();
  }
}

// Initialize system on plugin load
const systemManager = SystemManager.getInstance();
systemManager.initialize().catch(console.error);

// Export enhanced odds calculator for external use
export { OddsCalculator, MatchSimulator, UIFormatter };

// Cleanup function for testing
export const cleanup = async () => {
  await dbManager.disconnect();
  CacheManager.clear();
};
