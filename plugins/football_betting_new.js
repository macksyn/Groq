// plugins/Football_betting_interactive.js - REFACTORED INTERACTIVE UI VERSION

import { MongoClient, ObjectId } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Sports Betting System',
  version: '3.0.0', // Interactive UI Version
  author: 'Alex Macksyn & Gemini',
  description: 'Interactive sports betting simulation with an intelligent, button-driven UI.',
  commands: [
    { name: 'bet', aliases: ['sportbet', 'sportybet'], description: 'Access the interactive sports betting menu' },
    { name: 'fixtures', aliases: ['matches', 'games'], description: 'View upcoming matches' },
    { name: 'betslip', aliases: ['slip'], description: 'Manage your bet slip' },
    { name: 'mybets', aliases: ['bets'], description: 'View your active bets' },
    { name: 'bethistory', aliases: ['betlog'], description: 'View betting history' },
    { name: 'leagues', aliases: ['competitions'], description: 'View available leagues' },
    { name: 'results', aliases: ['recent', 'scores'], description: 'View recent match results' }
  ]
};

// --- CONFIGURATION ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'whatsapp_bot';
const BET_COLLECTIONS = {
  MATCHES: 'betting_matches',
  BETS: 'betting_bets',
  BETSLIPS: 'betting_betslips',
};
const CURRENCY_SYMBOL = '₦';
const FIXTURES_PER_PAGE = 4; // Number of matches to show per page

// --- STATE MANAGEMENT ---
// In-memory state manager for multi-step interactions
const userState = {}; // Key: senderId, Value: { action: string, data: any }

// --- DATABASE CONNECTION ---
let db = null;
let mongoClient = null;

async function initBettingDatabase() {
    if (db) return db;
    try {
        mongoClient = new MongoClient(MONGODB_URI);
        await mongoClient.connect();
        db = mongoClient.db(DATABASE_NAME);

        await db.collection(BET_COLLECTIONS.MATCHES).createIndex({ matchId: 1 }, { unique: true });
        await db.collection(BET_COLLECTIONS.BETS).createIndex({ userId: 1, timestamp: -1 });
        await db.collection(BET_COLLECTIONS.BETSLIPS).createIndex({ userId: 1 });
        await db.collection(BET_COLLECTIONS.BETSLIPS).createIndex({ shareCode: 1 }, { unique: true, sparse: true });

        console.log('✅ Interactive Sports Betting MongoDB connected successfully');
        startAutoSimulation();
        return db;
    } catch (error) {
        console.error('❌ Sports Betting MongoDB connection failed:', error);
        throw error;
    }
}


// --- TEAM & ODDS LOGIC (Largely Unchanged) ---
const TEAMS = {
    EPL: { name: 'English Premier League', teams: { 'Arsenal': { strength: 92, form: 90 }, 'Aston Villa': { strength: 80, form: 78 }, 'Bournemouth': { strength: 68, form: 65 }, 'Brentford': { strength: 70, form: 72 }, 'Brighton': { strength: 75, form: 78 }, 'Chelsea': { strength: 84, form: 80 }, 'Crystal Palace': { strength: 72, form: 70 }, 'Everton': { strength: 69, form: 66 }, 'Fulham': { strength: 71, form: 73 }, 'Ipswich Town': { strength: 62, form: 60 }, 'Leicester City': { strength: 73, form: 75 }, 'Liverpool': { strength: 91, form: 88 }, 'Manchester City': { strength: 96, form: 95 }, 'Manchester United': { strength: 85, form: 82 }, 'Newcastle United': { strength: 82, form: 80 }, 'Nottingham Forest': { strength: 67, form: 68 }, 'Southampton': { strength: 64, form: 62 }, 'Tottenham': { strength: 83, form: 81 }, 'West Ham': { strength: 78, form: 75 }, 'Wolves': { strength: 74, form: 72 } } },
    LALIGA: { name: 'Spanish La Liga', teams: { 'Real Madrid': { strength: 97, form: 95 }, 'Barcelona': { strength: 90, form: 88 }, 'Girona': { strength: 80, form: 82 }, 'Atletico Madrid': { strength: 88, form: 85 }, 'Athletic Bilbao': { strength: 82, form: 80 }, 'Real Sociedad': { strength: 81, form: 83 }, 'Real Betis': { strength: 79, form: 77 }, 'Villarreal': { strength: 78, form: 76 }, 'Valencia': { strength: 77, form: 75 }, 'Sevilla': { strength: 80, form: 78 } } },
    BUNDESLIGA: { name: 'German Bundesliga', teams: { 'Bayern Munich': { strength: 94, form: 92 }, 'Bayer Leverkusen': { strength: 91, form: 93 }, 'Borussia Dortmund': { strength: 88, form: 86 }, 'RB Leipzig': { strength: 87, form: 88 }, 'VfB Stuttgart': { strength: 84, form: 85 } } },
    SERIEA: { name: 'Italian Serie A', teams: { 'Inter Milan': { strength: 92, form: 90 }, 'AC Milan': { strength: 87, form: 85 }, 'Juventus': { strength: 86, form: 84 }, 'Atalanta': { strength: 83, form: 81 }, 'Napoli': { strength: 84, form: 82 } } }
};

const betTypeAliases = {
    'over1.5': 'OVER15', 'o1.5': 'OVER15', 'over15': 'OVER15', 'under1.5': 'UNDER15', 'u1.5': 'UNDER15', 'under15': 'UNDER15',
    'over2.5': 'OVER25', 'o2.5': 'OVER25', 'over25': 'OVER25', 'under2.5': 'UNDER25', 'u2.5': 'UNDER25', 'under25': 'UNDER25',
    'btts': 'BTTS_YES', 'gg': 'BTTS_YES', 'btts_yes': 'BTTS_YES', 'nobtts': 'BTTS_NO', 'ng': 'BTTS_NO', 'btts_no': 'BTTS_NO',
    '1': 'HOME_WIN', 'hw': 'HOME_WIN', 'home': 'HOME_WIN', 'homewin': 'HOME_WIN', 'x': 'DRAW', 'd': 'DRAW',
    '2': 'AWAY_WIN', 'aw': 'AWAY_WIN', 'away': 'AWAY_WIN', 'awaywin': 'AWAY_WIN'
};

function formatBetType(betTypeKey) {
    const map = {
        'HOME_WIN': 'Home Win (1)', 'AWAY_WIN': 'Away Win (2)', 'DRAW': 'Draw (X)',
        'OVER15': 'Over 1.5 Goals', 'UNDER15': 'Under 1.5 Goals',
        'OVER25': 'Over 2.5 Goals', 'UNDER25': 'Under 2.5 Goals',
        'BTTS_YES': 'GG (Both Teams Score)', 'BTTS_NO': 'NG (No Goal)'
    };
    return map[betTypeKey] || betTypeKey.replace(/_/g, ' ');
}

function generateOdds(homeTeam, awayTeam, homeStrength, awayStrength, homeForm, awayForm) {
    const effectiveHomeStrength = (homeStrength * 0.8) + (homeForm * 0.2);
    const effectiveAwayStrength = (awayStrength * 0.8) + (awayForm * 0.2);
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
        OVER15: Math.random() * 1.0 + 1.2, UNDER15: Math.random() * 1.5 + 2.0,
        OVER25: Math.random() * 1.5 + 1.4, UNDER25: Math.random() * 1.2 + 1.8,
        BTTS_YES: Math.random() * 1.0 + 1.6, BTTS_NO: Math.random() * 1.0 + 1.4
    };
    return Object.fromEntries(Object.entries(odds).map(([k, v]) => [k, parseFloat(v.toFixed(2))]));
}


// --- MATCH GENERATION & SIMULATION (Largely Unchanged) ---
async function generateMatches(db) {
    const matches = [];
    const leagues = Object.keys(TEAMS);
    const upcomingFixtures = await db.collection(BET_COLLECTIONS.MATCHES).find({ status: 'upcoming' }, { projection: { homeTeam: 1, awayTeam: 1, _id: 0 } }).toArray();
    const busyTeams = new Set(upcomingFixtures.flatMap(f => [f.homeTeam, f.awayTeam]));

    for (const league of leagues) {
        let availableTeams = Object.keys(TEAMS[league].teams).filter(team => !busyTeams.has(team));
        availableTeams.sort(() => 0.5 - Math.random()); // Shuffle

        const numMatches = league === 'EPL' ? 6 : 4;
        for (let i = 0; i < numMatches * 2 && i + 1 < availableTeams.length; i += 2) {
            const homeTeam = availableTeams[i], awayTeam = availableTeams[i + 1];
            const { strength: homeStrength, form: homeForm } = TEAMS[league].teams[homeTeam];
            const { strength: awayStrength, form: awayForm } = TEAMS[league].teams[awayTeam];
            const odds = generateOdds(homeTeam, awayTeam, homeStrength, awayStrength, homeForm, awayForm);
            const matchTime = moment().add(Math.floor(Math.random() * 72) + 1, 'hours');
            matches.push({
                league: TEAMS[league].name, leagueCode: league, homeTeam, awayTeam,
                odds, matchTime: matchTime.toDate(), status: 'upcoming', result: null
            });
        }
    }
    return matches;
}

async function initializeMatches() {
    try {
        const existingMatches = await db.collection(BET_COLLECTIONS.MATCHES).countDocuments({ status: 'upcoming' });
        if (existingMatches < 15) {
            const newMatches = await generateMatches(db);
            if (newMatches.length > 0) {
                const lastMatch = await db.collection(BET_COLLECTIONS.MATCHES).findOne({}, { sort: { matchId: -1 } });
                let nextMatchId = lastMatch ? lastMatch.matchId + 1 : 1;
                newMatches.forEach(match => { match.matchId = nextMatchId++; });
                await db.collection(BET_COLLECTIONS.MATCHES).insertMany(newMatches);
                console.log(`✅ Generated ${newMatches.length} new matches`);
            }
        }
    } catch (error) {
        console.error('Error initializing matches:', error);
    }
}

function simulateMatchResult(odds) {
    const rand = Math.random();
    const homeWinProb = 1 / odds.HOME_WIN;
    const drawProb = 1 / odds.DRAW;
    let result = rand < homeWinProb ? 'HOME_WIN' : (rand < homeWinProb + drawProb ? 'DRAW' : 'AWAY_WIN');
    let homeGoals, awayGoals;
    switch (result) {
        case 'HOME_WIN': homeGoals = Math.floor(Math.random() * 3) + 1; awayGoals = Math.floor(Math.random() * homeGoals); break;
        case 'AWAY_WIN': awayGoals = Math.floor(Math.random() * 3) + 1; homeGoals = Math.floor(Math.random() * awayGoals); break;
        case 'DRAW': const drawScore = Math.floor(Math.random() * 4); homeGoals = awayGoals = drawScore; break;
    }
    const totalGoals = homeGoals + awayGoals;
    return { result, homeGoals, awayGoals, totalGoals, over15: totalGoals > 1.5, over25: totalGoals > 2.5, btts: homeGoals > 0 && awayGoals > 0 };
}


// --- MAIN PLUGIN HANDLER ---
export default async function bettingHandler(m, sock, config) {
    try {
        if (!m || !m.body) return;

        const senderId = m.key.participant || m.key.remoteJid;
        const from = m.key.remoteJid;
        if (!senderId || !from) return;

        if (!db) {
            await initBettingDatabase();
            await initializeMatches();
        }

        const context = { m, sock, config, senderId, from, db, userState };

        // Check for interactive replies first
        const buttonId = m.message?.buttonsResponseMessage?.selectedButtonId;
        const listId = m.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
        const interactiveId = buttonId || listId;

        if (interactiveId) {
            await handleInteractiveReply(context, interactiveId);
            return;
        }

        // Process text commands
        if (!m.body.startsWith(config.PREFIX)) return;
        const args = m.body.slice(config.PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        const commandInfo = info.commands.find(c => c.name === command || c.aliases.includes(command));
        if (!commandInfo) return;
        
        await unifiedUserManager.initUser(senderId); // Ensure user exists

        switch (commandInfo.name) {
            case 'bet': await showBettingMenu(context); break;
            case 'fixtures': await handleFixtures(context, 1); break;
            case 'betslip': await handleBetSlip(context); break;
            case 'mybets': await handleMyBets(context); break;
            case 'bethistory': await handleBetHistory(context); break;
            case 'leagues': await handleLeagues(context); break;
            case 'results': await handleResults(context); break;
        }
    } catch (error) {
        console.error('❌ Betting plugin root error:', error);
        // Optional: send an error message to the user
        // if (context?.from) await sock.sendMessage(context.from, { text: 'An unexpected error occurred.' });
    }
}


// --- INTERACTIVE REPLY HANDLER ---
async function handleInteractiveReply(context, interactiveId) {
    const { senderId } = context;
    const [action, ...params] = interactiveId.split(':');

    // Clear state after use
    const state = userState[senderId];
    delete userState[senderId];

    switch (action) {
        case 'menu': await handleMenuSelection(context, params[0]); break;
        case 'fixtures_page': await handleFixtures(context, parseInt(params[0])); break;
        case 'select_match': await showBettingOptions(context, parseInt(params[0])); break;
        case 'add_bet': await handleAddToBetSlip(context, parseInt(params[0]), params[1]); break;
        case 'betslip_action': await handleBetSlipAction(context, params[0]); break;
        case 'remove_selection_prompt': await showRemoveSelectionList(context); break;
        case 'remove_selection_confirm': await handleRemoveFromBetSlip(context, parseInt(params[0])); break;
    }
}

// --- MENU & NAVIGATION ---
async function showBettingMenu(context) {
    const { sock, from } = context;
    const buttons = [
        { buttonId: 'menu:fixtures', buttonText: { displayText: '⚽ View Fixtures' }, type: 1 },
        { buttonId: 'menu:betslip', buttonText: { displayText: '📋 Manage Betslip' }, type: 1 },
        { buttonId: 'menu:mybets', buttonText: { displayText: '🎫 My Active Bets' }, type: 1 },
    ];
    const buttonMessage = {
        text: "⚽ *SPORTY BET* ⚽\n\nWelcome! What would you like to do?",
        footer: 'Select an option below',
        buttons: buttons,
        headerType: 1
    };
    await sock.sendMessage(from, buttonMessage);
}

async function handleMenuSelection(context, selection) {
    switch (selection) {
        case 'fixtures': await handleFixtures(context, 1); break;
        case 'betslip': await handleBetSlip(context); break;
        case 'mybets': await handleMyBets(context); break;
    }
}


// --- FIXTURES & BETTING OPTIONS ---
async function handleFixtures(context, page) {
    const { sock, from } = context;
    const matches = await db.collection(BET_COLLECTIONS.MATCHES).find({ status: 'upcoming' }).sort({ matchTime: 1 }).toArray();
    
    if (matches.length === 0) {
        await sock.sendMessage(from, { text: '⚽ *No upcoming matches found.*' });
        return;
    }

    const totalPages = Math.ceil(matches.length / FIXTURES_PER_PAGE);
    page = Math.max(1, Math.min(page, totalPages));
    const startIndex = (page - 1) * FIXTURES_PER_PAGE;
    const pageMatches = matches.slice(startIndex, startIndex + FIXTURES_PER_PAGE);

    let fixturesText = `⚽ *UPCOMING FIXTURES* (Page ${page}/${totalPages})\n\n`;
    pageMatches.forEach((match, index) => {
        const matchTime = moment(match.matchTime).tz('Africa/Lagos').format('DD/MM HH:mm');
        fixturesText += `*${match.homeTeam} vs ${match.awayTeam}*\n`;
        fixturesText += `🏆 ${match.league}\n`;
        fixturesText += `📅 ${matchTime} WAT | 🆔 ${match.matchId}\n\n`;
    });

    const buttons = pageMatches.map(match => ({
        buttonId: `select_match:${match.matchId}`,
        buttonText: { displayText: `${match.homeTeam.slice(0, 10)} vs ${match.awayTeam.slice(0, 10)}` },
        type: 1
    }));

    const navigationButtons = [];
    if (page > 1) navigationButtons.push({ buttonId: `fixtures_page:${page - 1}`, buttonText: { displayText: '⬅️ Previous' }, type: 1 });
    if (page < totalPages) navigationButtons.push({ buttonId: `fixtures_page:${page + 1}`, buttonText: { displayText: 'Next ➡️' }, type: 1 });

    const message = {
        text: fixturesText,
        footer: 'Tap a match to see betting options',
        buttons: [...buttons, ...navigationButtons],
        headerType: 1
    };
    await sock.sendMessage(from, message);
}

async function showBettingOptions(context, matchId) {
    const { sock, from } = context;
    const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId, status: 'upcoming' });

    if (!match) {
        await sock.sendMessage(from, { text: '❌ Match not found or has already started.' });
        return;
    }

    const sections = [
        {
            title: "Match Winner (1X2)",
            rows: [
                { title: `Home Win (1) - ${match.odds.HOME_WIN}`, rowId: `add_bet:${matchId}:HOME_WIN` },
                { title: `Draw (X) - ${match.odds.DRAW}`, rowId: `add_bet:${matchId}:DRAW` },
                { title: `Away Win (2) - ${match.odds.AWAY_WIN}`, rowId: `add_bet:${matchId}:AWAY_WIN` },
            ]
        },
        {
            title: "Goals Over/Under",
            rows: [
                { title: `Over 1.5 - ${match.odds.OVER15}`, rowId: `add_bet:${matchId}:OVER15` },
                { title: `Under 1.5 - ${match.odds.UNDER15}`, rowId: `add_bet:${matchId}:UNDER15` },
                { title: `Over 2.5 - ${match.odds.OVER25}`, rowId: `add_bet:${matchId}:OVER25` },
                { title: `Under 2.5 - ${match.odds.UNDER25}`, rowId: `add_bet:${matchId}:UNDER25` },
            ]
        },
        {
            title: "Both Teams To Score (GG/NG)",
            rows: [
                { title: `Yes (GG) - ${match.odds.BTTS_YES}`, rowId: `add_bet:${matchId}:BTTS_YES` },
                { title: `No (NG) - ${match.odds.BTTS_NO}`, rowId: `add_bet:${matchId}:BTTS_NO` },
            ]
        }
    ];

    const listMessage = {
        text: `*${match.homeTeam} vs ${match.awayTeam}*\n\nSelect a bet type from the list below.`,
        footer: `Match ID: ${matchId}`,
        title: "🎯 BETTING OPTIONS",
        buttonText: "Choose Bet",
        sections
    };
    await sock.sendMessage(from, listMessage);
}


// --- BETSLIP MANAGEMENT ---
async function handleBetSlip(context) {
    const { sock, from, senderId } = context;
    const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });

    if (!betSlip || betSlip.selections.length === 0) {
        await sock.sendMessage(from, { text: `📋 *Your bet slip is empty*\n\nStart by viewing fixtures.` });
        await showBettingMenu(context); // Guide user back to menu
        return;
    }

    let slipText = `📋 *YOUR BET SLIP* 📋\n\n`;
    let totalOdds = 1;
    for (const [index, selection] of betSlip.selections.entries()) {
        const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId: selection.matchId });
        if (match) {
            slipText += `*${index + 1}.* ${match.homeTeam} vs ${match.awayTeam}\n`;
            slipText += `   🎯 ${formatBetType(selection.betType)} @ ${selection.odds}\n`;
            totalOdds *= selection.odds;
        }
    }
    slipText += `\n💰 *Total Odds:* ${totalOdds.toFixed(2)}\n`;
    slipText += `💵 *Stake:* ${CURRENCY_SYMBOL}${betSlip.stake || 0}\n`;
    slipText += `🏆 *Potential Win:* ${CURRENCY_SYMBOL}${((betSlip.stake || 0) * totalOdds).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

    const buttons = [
        { buttonId: 'betslip_action:place', buttonText: { displayText: '✅ Place Bet' }, type: 1 },
        { buttonId: 'betslip_action:stake', buttonText: { displayText: '💵 Set Stake' }, type: 1 },
        { buttonId: 'remove_selection_prompt', buttonText: { displayText: '❌ Remove Selection' }, type: 1 },
        { buttonId: 'betslip_action:clear', buttonText: { displayText: '🗑️ Clear All' }, type: 1 },
    ];
    
    await sock.sendMessage(from, { text: slipText, footer: "Choose an action", buttons, headerType: 1 });
}

async function handleBetSlipAction(context, action) {
     const { reply, senderId, sock, from } = context;
    switch (action) {
        case 'place': await handlePlaceBet(context); break;
        case 'stake':
            userState[senderId] = { action: 'awaiting_stake' };
            await sock.sendMessage(from, { text: "Please type the amount you want to stake." });
            break;
        case 'clear': await handleClearBetSlip(context); break;
    }
}

async function handleAddToBetSlip(context, matchId, betType) {
    const { sock, from, senderId } = context;
    try {
        const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId, status: 'upcoming' });
        if (!match) {
            await sock.sendMessage(from, { text: '❌ Match not found or has already started.' });
            return;
        }
        const odds = match.odds[betType];
        if (!odds) {
            await sock.sendMessage(from, { text: '❌ Odds not available for this bet type.' });
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
            if (betSlip.selections.length >= 10) {
                 await sock.sendMessage(from, { text: '⚠️ Maximum 10 selections allowed in a bet slip.' });
                 return;
            }
            betSlip.selections.push(newSelection);
        }

        await db.collection(BET_COLLECTIONS.BETSLIPS).replaceOne({ userId: senderId }, betSlip, { upsert: true });

        const confirmationText = `✅ *Added to bet slip*\n\n⚽ ${match.homeTeam} vs ${match.awayTeam}\n🎯 ${formatBetType(betType)} @ ${odds}\n\n📋 *Selections:* ${betSlip.selections.length}/10`;
        const buttons = [
            { buttonId: 'menu:fixtures', buttonText: { displayText: '➕ Add More Bets' }, type: 1 },
            { buttonId: 'menu:betslip', buttonText: { displayText: '📋 View Betslip' }, type: 1 },
        ];
        await sock.sendMessage(from, { text: confirmationText, buttons, footer: "What's next?", headerType: 1 });

    } catch (error) {
        console.error('Add to bet slip error:', error);
        await sock.sendMessage(from, { text: '❌ Error adding to bet slip. Please try again.' });
    }
}

async function showRemoveSelectionList(context) {
    const { sock, from, senderId } = context;
    const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });

    if (!betSlip || betSlip.selections.length === 0) {
        await sock.sendMessage(from, { text: "Your betslip is already empty." });
        return;
    }

    const rows = betSlip.selections.map((selection, index) => ({
        title: `${selection.homeTeam} vs ${selection.awayTeam}`,
        description: `Your bet: ${formatBetType(selection.betType)}`,
        rowId: `remove_selection_confirm:${index}`
    }));

    const listMessage = {
        text: "Select the bet you wish to remove from your slip.",
        footer: "Your slip will be updated automatically.",
        title: "🗑️ REMOVE SELECTION",
        buttonText: "Choose to Remove",
        sections: [{ title: "Current Selections", rows }]
    };
    await sock.sendMessage(from, listMessage);
}

async function handleRemoveFromBetSlip(context, selectionIndex) {
    const { sock, from, senderId } = context;
    try {
        const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
        if (!betSlip || !betSlip.selections[selectionIndex]) {
            await sock.sendMessage(from, { text: '⚠️ Invalid selection. Please try again.' });
            return;
        }

        const removed = betSlip.selections.splice(selectionIndex, 1)[0];
        await db.collection(BET_COLLECTIONS.BETSLIPS).updateOne({ userId: senderId }, { $set: { selections: betSlip.selections } });
        
        await sock.sendMessage(from, { text: `✅ *Removed selection*\n\n❌ ${removed.homeTeam} vs ${removed.awayTeam}` });

        // Show updated betslip
        await handleBetSlip(context);

    } catch (error) {
        console.error('Remove from slip error:', error);
        await sock.sendMessage(from, { text: '❌ Error removing selection.' });
    }
}


// --- CORE BETTING ACTIONS (PLACE, STAKE, ETC.) ---

// This function now needs to be called from the main handler when a stake amount is typed
async function handleSetStake(context, amount) {
    // Implementation remains similar to original, but called differently
    const { sock, from, senderId } = context;
    const stakeAmount = parseInt(amount);
     if (isNaN(stakeAmount) || stakeAmount <= 0) {
      await sock.sendMessage(from, { text: '⚠️ Please provide a valid, positive number for your stake.'});
      return;
    }
    const userData = await unifiedUserManager.getUserData(senderId);
    if (userData.balance < stakeAmount) {
      await sock.sendMessage(from, { text: `🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${CURRENCY_SYMBOL}${userData.balance.toLocaleString()}\n💸 *Required:* ${CURRENCY_SYMBOL}${stakeAmount.toLocaleString()}`});
      return;
    }
    const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
    if (!betSlip || betSlip.selections.length === 0) {
      await sock.sendMessage(from, {text: '📋 *Your bet slip is empty. Add selections first!*'});
      return;
    }
    await db.collection(BET_COLLECTIONS.BETSLIPS).updateOne({ userId: senderId }, { $set: { stake: stakeAmount, updatedAt: new Date() } });
    
    await sock.sendMessage(from, { text: `💰 Stake set to ${CURRENCY_SYMBOL}${stakeAmount.toLocaleString()}` });
    await handleBetSlip(context); // Show updated betslip
}


async function handlePlaceBet(context) {
    const { sock, from, senderId } = context;
    try {
        const betSlip = await db.collection(BET_COLLECTIONS.BETSLIPS).findOne({ userId: senderId });
        if (!betSlip || betSlip.selections.length === 0) {
            await sock.sendMessage(from, { text: '📋 Your bet slip is empty.' });
            return;
        }
        if (!betSlip.stake || betSlip.stake <= 0) {
            userState[senderId] = { action: 'awaiting_stake_before_place' };
            await sock.sendMessage(from, { text: "💰 Please set a stake first. Type the amount you want to stake." });
            return;
        }
        
        // Final balance check
        const userData = await unifiedUserManager.getUserData(senderId);
        if (userData.balance < betSlip.stake) {
            await sock.sendMessage(from, { text: `🚫 Insufficient balance. Your balance is ${CURRENCY_SYMBOL}${userData.balance.toLocaleString()}.` });
            return;
        }
        
        // Check if all matches are still available
        for (const selection of betSlip.selections) {
            const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId: selection.matchId, status: 'upcoming' });
            if (!match) {
                await sock.sendMessage(from, { text: `❌ Match ${selection.homeTeam} vs ${selection.awayTeam} is no longer available. Please remove it from your slip.` });
                return;
            }
        }

        const totalOdds = betSlip.selections.reduce((acc, s) => acc * s.odds, 1);
        const potentialWin = betSlip.stake * totalOdds;

        const success = await unifiedUserManager.removeMoney(senderId, betSlip.stake, 'Sports bet stake');
        if (!success) {
            await sock.sendMessage(from, { text: '❌ Transaction failed. Please try again.' });
            return;
        }

        const betRecord = {
            userId: senderId, betType: 'accumulator', selections: betSlip.selections,
            stake: betSlip.stake, totalOdds, potentialWin,
            status: 'pending', placedAt: new Date(),
        };

        const betResult = await db.collection(BET_COLLECTIONS.BETS).insertOne(betRecord);
        await db.collection(BET_COLLECTIONS.BETSLIPS).deleteOne({ userId: senderId });
        
        const updatedBalance = await unifiedUserManager.getUserData(senderId);
        const betId = betResult.insertedId.toString().slice(-6).toUpperCase();
        
        let confirmText = `✅ *BET PLACED SUCCESSFULLY* ✅\n\n`;
        confirmText += `🎫 *Bet ID:* ${betId}\n`;
        confirmText += `💰 *Stake:* ${CURRENCY_SYMBOL}${betSlip.stake.toLocaleString()}\n`;
        confirmText += `📊 *Total Odds:* ${totalOdds.toFixed(2)}\n`;
        confirmText += `🏆 *Potential Win:* ${CURRENCY_SYMBOL}${potentialWin.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\n`;
        confirmText += `💵 *New Balance:* ${CURRENCY_SYMBOL}${updatedBalance.balance.toLocaleString()}\n\n`;
        confirmText += `🍀 *Good luck!*`;
        
        await sock.sendMessage(from, { text: confirmText, mentions: [senderId] });

    } catch (error) {
        console.error('Place bet error:', error);
        await sock.sendMessage(from, { text: '❌ Error placing bet. Please try again.' });
    }
}

async function handleClearBetSlip(context) {
    const { sock, from, senderId } = context;
    try {
        await db.collection(BET_COLLECTIONS.BETSLIPS).deleteOne({ userId: senderId });
        await sock.sendMessage(from, { text: '🗑️ Your bet slip has been cleared.' });
    } catch (error) {
        console.error('Clear bet slip error:', error);
        await sock.sendMessage(from, { text: '❌ Error clearing bet slip.' });
    }
}


// --- OTHER COMMANDS (HISTORY, LEAGUES, ETC.) ---
async function handleMyBets(context) {
    const { sock, from, senderId } = context;
    const activeBets = await db.collection(BET_COLLECTIONS.BETS).find({ userId: senderId, status: 'pending' }).sort({ placedAt: -1 }).limit(10).toArray();
    if (activeBets.length === 0) {
        await sock.sendMessage(from, { text: `📋 *No active bets found.*` });
        return;
    }
    let betsText = `📋 *YOUR ACTIVE BETS* 📋\n\n`;
    activeBets.forEach((bet, index) => {
        const betId = bet._id.toString().slice(-6).toUpperCase();
        const placedTime = moment(bet.placedAt).tz('Africa/Lagos').format('DD/MM HH:mm');
        betsText += `*${index + 1}.* 🎫 ID: *${betId}*\n`;
        betsText += `   💰 Stake: ${CURRENCY_SYMBOL}${bet.stake.toLocaleString()}\n`;
        betsText += `   📊 Odds: ${bet.totalOdds.toFixed(2)}\n`;
        betsText += `   🏆 Potential: ${CURRENCY_SYMBOL}${bet.potentialWin.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
        betsText += `   📅 Placed: ${placedTime}\n\n`;
    });
    await sock.sendMessage(from, { text: betsText });
}

async function handleBetHistory(context) {
    const { sock, from, senderId } = context;
    const betHistory = await db.collection(BET_COLLECTIONS.BETS).find({ userId: senderId, status: { $in: ['won', 'lost'] } }).sort({ settledAt: -1 }).limit(15).toArray();
    if (betHistory.length === 0) {
        await sock.sendMessage(from, { text: `📊 *No betting history found.*` });
        return;
    }
    let historyText = `📊 *YOUR BETTING HISTORY* 📊\n\n`;
    let totalStaked = 0;
    let totalWon = 0;
    betHistory.forEach((bet) => {
        totalStaked += bet.stake;
        totalWon += bet.payout;
        const statusIcon = bet.status === 'won' ? '✅' : '❌';
        historyText += `${statusIcon} Bet ID ${bet._id.toString().slice(-6).toUpperCase()} | Stake: ${CURRENCY_SYMBOL}${bet.stake.toLocaleString()} | Payout: ${CURRENCY_SYMBOL}${bet.payout.toLocaleString()}\n`;
    });
     const profit = totalWon - totalStaked;
    historyText += `\n*Overall P/L:* ${profit >= 0 ? '🟢' : '🔴'} ${CURRENCY_SYMBOL}${Math.abs(profit).toLocaleString()}\n`;

    await sock.sendMessage(from, { text: historyText });
}

async function handleLeagues(context) {
    const { sock, from } = context;
    let leaguesText = `🏆 *AVAILABLE LEAGUES* 🏆\n\n`;
    Object.entries(TEAMS).forEach(([code, league]) => {
        const flag = { EPL: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', LALIGA: '🇪🇸', BUNDESLIGA: '🇩🇪', SERIEA: '🇮🇹' }[code] || '⚽';
        leaguesText += `${flag} *${league.name}*\n`;
    });
    await sock.sendMessage(from, { text: leaguesText });
}

async function handleResults(context) {
    const { sock, from } = context;
    const recentResults = await db.collection(BET_COLLECTIONS.MATCHES).find({ status: 'completed' }).sort({ completedAt: -1 }).limit(8).toArray();
    if (recentResults.length === 0) {
        await sock.sendMessage(from, { text: '📊 *No recent results available.*' });
        return;
    }
    let resultsText = `📊 *RECENT RESULTS* 📊\n\n`;
    recentResults.forEach(match => {
        resultsText += `*${match.homeTeam} ${match.result.homeGoals} - ${match.result.awayGoals} ${match.awayTeam}*\n`;
        resultsText += `🏆 ${match.league}\n\n`;
    });
    await sock.sendMessage(from, { text: resultsText });
}


// --- AUTO SIMULATION & BETTLEMENT (Unchanged) ---
let simulationInterval = null;

function startAutoSimulation() {
    if (simulationInterval) clearInterval(simulationInterval);
    simulationInterval = setInterval(autoSimulateMatches, 5 * 60 * 1000); // Every 5 minutes
    console.log('✅ Auto match simulation started');
}

async function autoSimulateMatches() {
    try {
        if (!db) return;
        const now = new Date();
        const matchesToSimulate = await db.collection(BET_COLLECTIONS.MATCHES).find({ status: 'upcoming', matchTime: { $lte: now } }).toArray();
        if (matchesToSimulate.length === 0) return;

        console.log(`⚽ Auto-simulating ${matchesToSimulate.length} matches...`);
        for (const match of matchesToSimulate) {
            const result = simulateMatchResult(match.odds);
            await db.collection(BET_COLLECTIONS.MATCHES).updateOne({ matchId: match.matchId }, { $set: { status: 'completed', result, completedAt: new Date() } });
            await settleBetsForMatch(match.matchId);
        }
        await initializeMatches();
    } catch (error) {
        console.error('❌ Auto simulation error:', error);
    }
}

async function settleBetsForMatch(settledMatchId) {
    try {
        const pendingBets = await db.collection(BET_COLLECTIONS.BETS).find({ "selections.matchId": settledMatchId, status: 'pending' }).toArray();
        
        for (const bet of pendingBets) {
            let allSelectionsFinal = true;
            let betResult = 'won'; // Assume won until a loss is found

            for (const selection of bet.selections) {
                const match = await db.collection(BET_COLLECTIONS.MATCHES).findOne({ matchId: selection.matchId });
                if (match.status !== 'completed') {
                    allSelectionsFinal = false;
                    break; // This bet is not ready to be settled yet
                }
                
                // Evaluate this specific selection
                const res = match.result;
                let selectionWon = false;
                switch (selection.betType) {
                    case 'HOME_WIN': selectionWon = res.result === 'HOME_WIN'; break;
                    case 'AWAY_WIN': selectionWon = res.result === 'AWAY_WIN'; break;
                    case 'DRAW': selectionWon = res.result === 'DRAW'; break;
                    case 'OVER15': selectionWon = res.over15; break;
                    case 'UNDER15': selectionWon = !res.over15; break;
                    case 'OVER25': selectionWon = res.over25; break;
                    case 'UNDER25': selectionWon = !res.over25; break;
                    case 'BTTS_YES': selectionWon = res.btts; break;
                    case 'BTTS_NO': selectionWon = !res.btts; break;
                }
                
                if (!selectionWon) {
                    betResult = 'lost';
                    break; // One lost selection means the whole bet is lost
                }
            }

            if (allSelectionsFinal) {
                const payout = (betResult === 'won') ? bet.potentialWin : 0;
                if (payout > 0) {
                    await unifiedUserManager.addMoney(bet.userId, payout, 'Sports bet win');
                }
                await db.collection(BET_COLLECTIONS.BETS).updateOne(
                    { _id: bet._id },
                    { $set: { status: betResult, payout, settledAt: new Date() } }
                );
            }
        }
    } catch (error) {
        console.error(`Error settling bets for match ${settledMatchId}:`, error);
    }
}
