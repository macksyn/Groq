/**
 * @name football-betting-interactive
 * @version 2.1.0
 * @description An interactive football betting simulation plugin for eWhatsapp-bot.
 * @author Macksyn
 *
 * v2.1.0: Converted to ES Module syntax (import/export) to support "type": "module" in package.json.
 * This major rewrite introduces a fully interactive UI using WhatsApp buttons and lists,
 * a more realistic minute-by-minute match simulation engine, dynamic team form,
 * performance optimizations like fixture caching and batch DB operations, and new features.
 */

// --- ES Module Imports ---
import {
    getEconomy,
    getPlugin,
    isUser,
    isGroup,
    isOwner,
} from '../lib/pluginIntegration.js'; // Note the '.js' extension is often needed in ESM
import {
    MessageType
} from '@whiskeysockets/baileys';
import {
    ObjectId
} from 'mongodb';

// --- Constants ---
const COLLECTIONS = {
    MATCHES: 'bet_matches',
    TEAMS: 'bet_teams',
    BETS: 'bet_slips',
    USERS: 'users' // Assuming economy plugin uses this
};
const MIN_BET = 100;
const MAX_BET = 10000;
const MAX_SELECTIONS = 10;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for fixture cache

// --- In-Memory Cache ---
const fixtureCache = {
    leagues: null,
    timestamp: 0,
};

// --- Main Plugin ---
const plugin = {
    name: 'football_betting',
    description: 'An interactive football betting simulation game.',
    isOwner: false,
    isGroup: true,
    isPrivate: false,
    isBotAdmin: false,
    isAdmin: false,
    command: 'bet',
    // We use a single entry point and handle sub-commands internally
    execute: async (message, {
        command,
        args,
        db
    }) => {
        const userId = message.sender;
        const economy = getEconomy(userId);
        const [subCommand, ...subArgs] = args;

        // --- INTERACTIVE MESSAGE ROUTER ---
        // Handles clicks on buttons and list items
        if (message.isInteractive) {
            const {
                listResponse,
                buttonResponse
            } = message.interactive;

            if (listResponse) {
                const [action, league] = listResponse.selectedRowId.split(':');
                if (action === 'show_league') {
                    return handleShowMatchesForLeague(message, db, league);
                }
            }

            if (buttonResponse) {
                const [action, ...params] = buttonResponse.selectedButtonId.split(':');
                switch (action) {
                    case 'add_bet':
                        return handleAddSelectionToSlip(message, db, params[0], params[1]);
                    case 'show_slip':
                        return handleShowSlip(message, db, economy);
                    case 'place_bet':
                        return handlePlaceBet(message, db, economy, params[0]);
                    case 'clear_slip':
                        return handleClearSlip(message, db);
                    case 'show_fixtures':
                        return handleShowFixtures(message, db);
                }
            }
            return;
        }


        // --- TEXT COMMAND ROUTER ---
        switch (command) {
            case 'bet':
                // The main '.bet' command now shows an interactive menu
                return sendMainMenu(message);
            case 'fixtures':
                return handleShowFixtures(message, db);
            case 'slip':
                return handleShowSlip(message, db, economy);

                // --- ADMIN COMMANDS ---
            case 'addmatch':
                if (!isOwner(userId)) return message.reply("🔒 This is an owner-only command.");
                return handleAddMatch(message, db, subArgs);
            case 'settlematch':
                if (!isOwner(userId)) return message.reply("🔒 This is an owner-only command.");
                return handleSimulateAndSettleMatch(message, db, subArgs[0]);
            case 'cancelmatch':
                if (!isOwner(userId)) return message.reply("🔒 This is an owner-only command.");
                return handleCancelMatch(message, db, subArgs[0]);
            case 'addteam':
                if (!isOwner(userId)) return message.reply("🔒 This is an owner-only command.");
                return handleAddTeam(message, db, subArgs);
        }
    }
};

// --- Use `export default` for ES Modules ---
export default plugin;


// --- UI & INTERACTIVE HANDLERS ---

/**
 * Sends the main betting menu with interactive buttons.
 */
async function sendMainMenu(message) {
    const buttons = [{
        buttonId: 'show_fixtures',
        buttonText: {
            displayText: '⚽ View Fixtures'
        },
        type: 1
    }, {
        buttonId: 'show_slip',
        buttonText: {
            displayText: '🧾 View Bet Slip'
        },
        type: 1
    }, ];

    const buttonMessage = {
        text: "Welcome to the Football Betting Arena! 🏟️\n\nWhat would you like to do?",
        footer: 'Select an option below',
        buttons: buttons,
        headerType: 1
    };
    await message.client.sendMessage(message.chat, buttonMessage);
}


/**
 * Fetches leagues and displays them in an interactive list.
 * Uses cache to improve performance.
 */
async function handleShowFixtures(message, db) {
    // Check cache first
    if (Date.now() - fixtureCache.timestamp < CACHE_TTL && fixtureCache.leagues) {
        return sendLeagueList(message, fixtureCache.leagues);
    }

    try {
        const leagues = await db.collection(COLLECTIONS.MATCHES).distinct('league', {
            status: 'upcoming'
        });
        if (!leagues || leagues.length === 0) {
            return message.reply("There are no upcoming matches available to bet on right now.");
        }

        // Update cache
        fixtureCache.leagues = leagues;
        fixtureCache.timestamp = Date.now();

        return sendLeagueList(message, leagues);
    } catch (error) {
        console.error("Error fetching leagues:", error);
        return message.reply("An error occurred while fetching the match fixtures.");
    }
}

/**
 * Sends a WhatsApp list message with available leagues.
 */
async function sendLeagueList(message, leagues) {
    const sections = [{
        title: "Available Leagues",
        rows: leagues.map(league => ({
            title: league,
            rowId: `show_league:${league.replace(/ /g, '_')}`, // Use a unique ID for the selection
            description: "View matches for this league"
        }))
    }];

    const listMessage = {
        text: "Please select a league to view fixtures.",
        footer: "Powered by Groq Betting",
        title: "🏆 Football Leagues",
        buttonText: "View Leagues",
        sections
    };

    await message.client.sendMessage(message.chat, listMessage);
}

/**
 * Displays matches for a selected league, each with betting buttons.
 */
async function handleShowMatchesForLeague(message, db, league) {
    const formattedLeague = league.replace(/_/g, ' ');
    const matches = await db.collection(COLLECTIONS.MATCHES).find({
        league: formattedLeague,
        status: 'upcoming'
    }).toArray();

    if (matches.length === 0) {
        return message.reply(`No upcoming matches found for ${formattedLeague}.`);
    }

    await message.reply(`*Upcoming Matches for ${formattedLeague}*`);

    for (const match of matches) {
        const odds = match.odds;
        const matchText = `*${match.homeTeam} vs ${match.awayTeam}*\n` +
            `🗓️ Date: ${new Date(match.date).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })}\n` +
            `🆔 Match ID: ${match.matchId}`;

        const buttons = [{
            buttonId: `add_bet:${match.matchId}:1`,
            buttonText: {
                displayText: `1 (${odds['1']})`
            },
            type: 1
        }, {
            buttonId: `add_bet:${match.matchId}:X`,
            buttonText: {
                displayText: `X (${odds['X']})`
            },
            type: 1
        }, {
            buttonId: `add_bet:${match.matchId}:2`,
            buttonText: {
                displayText: `2 (${odds['2']})`
            },
            type: 1
        }, ];

        const buttonMessage = {
            text: matchText,
            footer: 'Select Home(1), Draw(X), or Away(2)',
            buttons: buttons,
            headerType: 1
        };
        await message.client.sendMessage(message.chat, buttonMessage);
    }
}

/**
 * Shows the user's current bet slip with options to place or clear the bet.
 */
async function handleShowSlip(message, db, economy) {
    const userId = message.sender;
    const user = await db.collection(COLLECTIONS.USERS).findOne({
        id: userId
    });
    const betSlip = user?.betSlip || {
        selections: []
    };

    if (betSlip.selections.length === 0) {
        return message.reply("Your bet slip is empty. Click 'View Fixtures' to add selections.");
    }

    let slipText = "*--- Your Bet Slip ---*\n\n";
    let totalOdds = 1;

    for (const selection of betSlip.selections) {
        slipText += `*${selection.homeTeam} vs ${selection.awayTeam}*\n` +
            `  - Bet: ${selection.betType} @ ${selection.odds}\n\n`;
        totalOdds *= selection.odds;
    }

    slipText += `*Total Selections:* ${betSlip.selections.length}\n`;
    slipText += `*Total Odds:* ${totalOdds.toFixed(2)}\n\n`;
    slipText += `Reply with the amount you want to stake (e.g., .bet 500) or use the buttons below.`;


    const buttons = [{
            buttonId: `place_bet:500`, // Example stake
            buttonText: {
                displayText: `Bet ${economy.currency}500`
            },
            type: 1
        },
        {
            buttonId: `place_bet:1000`, // Example stake
            buttonText: {
                displayText: `Bet ${economy.currency}1000`
            },
            type: 1
        }, {
            buttonId: 'clear_slip',
            buttonText: {
                displayText: '🗑️ Clear Slip'
            },
            type: 1
        },
    ];

    const buttonMessage = {
        text: slipText,
        footer: 'Minimum bet: 100, Maximum: 10000',
        buttons: buttons,
        headerType: 1
    };

    await message.client.sendMessage(message.chat, buttonMessage);
}


// --- CORE BETTING LOGIC ---

/**
 * Adds a user's selection to their bet slip in the database.
 */
async function handleAddSelectionToSlip(message, db, matchId, betType) {
    const userId = message.sender;
    const match = await db.collection(COLLECTIONS.MATCHES).findOne({
        matchId,
        status: 'upcoming'
    });

    if (!match) {
        return message.reply("This match is no longer available for betting.");
    }

    const user = await db.collection(COLLECTIONS.USERS).findOne({
        id: userId
    });
    const betSlip = user?.betSlip || {
        selections: []
    };

    if (betSlip.selections.length >= MAX_SELECTIONS) {
        return message.reply(`You cannot have more than ${MAX_SELECTIONS} selections in your slip.`);
    }
    if (betSlip.selections.some(s => s.matchId === matchId)) {
        return message.reply("You have already made a selection for this match.");
    }

    const selection = {
        matchId: match.matchId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        betType: betType,
        odds: match.odds[betType],
        status: 'pending'
    };

    await db.collection(COLLECTIONS.USERS).updateOne({
        id: userId
    }, {
        $push: {
            'betSlip.selections': selection
        }
    }, {
        upsert: true
    });

    await message.reply(`✅ Added *${betType}* for *${match.homeTeam} vs ${match.awayTeam}* to your slip!`);
    // Optionally, show the updated slip right away
    const economy = getEconomy(userId);
    return handleShowSlip(message, db, economy);
}


/**
 * Places a bet using the user's current bet slip.
 * Uses batch DB operations for efficiency.
 */
async function handlePlaceBet(message, db, economy, stakeStr) {
    const userId = message.sender;
    const stake = parseInt(stakeStr, 10);

    if (isNaN(stake) || stake < MIN_BET || stake > MAX_BET) {
        return message.reply(`Invalid stake amount. Please enter a value between ${MIN_BET} and ${MAX_BET}.`);
    }

    const user = await db.collection(COLLECTIONS.USERS).findOne({
        id: userId
    });
    const betSlip = user?.betSlip;

    if (!betSlip || betSlip.selections.length === 0) {
        return message.reply("Your bet slip is empty.");
    }
    if (!(await economy.has(stake))) {
        return message.reply(`You do not have enough money. You need ${economy.currency}${stake}.`);
    }

    // --- Efficiently validate all matches at once ---
    const matchIds = betSlip.selections.map(s => s.matchId);
    const availableMatchesCount = await db.collection(COLLECTIONS.MATCHES).countDocuments({
        matchId: {
            $in: matchIds
        },
        status: 'upcoming'
    });

    if (availableMatchesCount !== matchIds.length) {
        await handleClearSlip(message, db); // Clear the invalid slip
        return message.reply("One or more matches in your slip have started or been cancelled. Your slip has been cleared.");
    }

    await economy.deduct(stake);

    const totalOdds = betSlip.selections.reduce((acc, s) => acc * s.odds, 1);
    const potentialWinnings = stake * totalOdds;

    const finalBet = {
        _id: new ObjectId(),
        ...betSlip,
        userId,
        stake,
        totalOdds: totalOdds.toFixed(2),
        potentialWinnings: potentialWinnings.toFixed(2),
        status: 'active',
        placedAt: new Date()
    };

    await db.collection(COLLECTIONS.BETS).insertOne(finalBet);
    await db.collection(COLLECTIONS.USERS).updateOne({
        id: userId
    }, {
        $set: {
            betSlip: {
                selections: []
            }
        }
    });

    return message.reply(
        `✅ Bet Placed Successfully!\n\n` +
        `*Stake:* ${economy.currency}${stake}\n` +
        `*Total Odds:* ${totalOdds.toFixed(2)}\n` +
        `*Potential Winnings:* ${economy.currency}${potentialWinnings.toFixed(2)}`
    );
}


/**
 * Clears all selections from the user's bet slip.
 */
async function handleClearSlip(message, db) {
    const userId = message.sender;
    await db.collection(COLLECTIONS.USERS).updateOne({
        id: userId
    }, {
        $set: {
            betSlip: {
                selections: []
            }
        }
    });
    return message.reply("Your bet slip has been cleared.");
}

// --- SIMULATION & SETTLEMENT ---

/**
 * Simulates a match and settles all bets related to it.
 */
async function handleSimulateAndSettleMatch(message, db, matchId) {
    const match = await db.collection(COLLECTIONS.MATCHES).findOne({
        matchId
    });
    if (!match) return message.reply("Match not found.");
    if (match.status !== 'upcoming') return message.reply("This match is not available for settlement.");

    await message.reply(`*Simulating ${match.homeTeam} vs ${match.awayTeam}...* ⏳`);

    const homeTeam = await db.collection(COLLECTIONS.TEAMS).findOne({
        name: match.homeTeam
    });
    const awayTeam = await db.collection(COLLECTIONS.TEAMS).findOne({
        name: match.awayTeam
    });

    if (!homeTeam || !awayTeam) {
        return message.reply("One or both teams could not be found for simulation.");
    }

    // The new, more realistic simulation
    const result = simulateMatchMinuteByMinute(homeTeam, awayTeam);

    await db.collection(COLLECTIONS.MATCHES).updateOne({
        matchId
    }, {
        $set: {
            status: 'finished',
            result
        }
    });

    // Update team forms based on result
    await updateTeamForms(db, homeTeam, awayTeam, result);

    await message.reply(
        `*Match Result:*\n` +
        `${match.homeTeam} ${result.homeScore} - ${result.awayScore} ${match.awayTeam}`
    );

    await settleBetsForMatch(message, db, matchId, result);
}


/**
 * Minute-by-minute match simulation for more realistic outcomes.
 */
function simulateMatchMinuteByMinute(homeTeam, awayTeam) {
    let homeScore = 0;
    let awayScore = 0;
    const HOME_ADVANTAGE = 0.002; // Small constant advantage for the home team

    // Base probability of a goal per minute, adjusted by team strength
    const baseHomeGoalProb = (homeTeam.strength / 100) * 0.015;
    const baseAwayGoalProb = (awayTeam.strength / 100) * 0.015;

    for (let minute = 1; minute <= 90; minute++) {
        // Adjust probability with form (form is a value e.g., -5 to +5)
        const homeProb = baseHomeGoalProb + (homeTeam.form / 1000) + HOME_ADVANTAGE;
        const awayProb = baseAwayGoalProb + (awayTeam.form / 1000);

        if (Math.random() < homeProb) {
            homeScore++;
        }
        if (Math.random() < awayProb) {
            awayScore++;
        }
    }

    return {
        homeScore,
        awayScore
    };
}

/**
 * Updates team form based on the last match result.
 * Form is a rolling average of the last 5 results (Win=3, Draw=1, Loss=0).
 */
async function updateTeamForms(db, homeTeam, awayTeam, result) {
    let homeResultPoints = result.homeScore > result.awayScore ? 3 : result.homeScore === result.awayScore ? 1 : 0;
    let awayResultPoints = result.awayScore > result.homeScore ? 3 : result.awayScore === result.homeScore ? 1 : 0;

    // Ensure formHistory is an array
    const homeFormHistory = homeTeam.formHistory || [];
    const awayFormHistory = awayTeam.formHistory || [];


    // Add new result and keep only the last 5
    homeFormHistory.push(homeResultPoints);
    if (homeFormHistory.length > 5) homeFormHistory.shift();

    awayFormHistory.push(awayResultPoints);
    if (awayFormHistory.length > 5) awayFormHistory.shift();

    // The new form is the sum of the history
    const newHomeForm = homeFormHistory.reduce((a, b) => a + b, 0);
    const newAwayForm = awayFormHistory.reduce((a, b) => a + b, 0);

    await db.collection(COLLECTIONS.TEAMS).updateOne({
        _id: homeTeam._id
    }, {
        $set: {
            form: newHomeForm,
            formHistory: homeFormHistory
        }
    });
    await db.collection(COLLECTIONS.TEAMS).updateOne({
        _id: awayTeam._id
    }, {
        $set: {
            form: newAwayForm,
            formHistory: awayFormHistory
        }
    });
}


/**
 * Settles all active bets containing the finished match.
 */
async function settleBetsForMatch(message, db, matchId, result) {
    const betsToUpdate = await db.collection(COLLECTIONS.BETS).find({
        status: 'active',
        'selections.matchId': matchId
    }).toArray();

    let settledCount = 0;

    for (const bet of betsToUpdate) {
        let allSelectionsFinished = true;
        let betLost = false;

        for (const selection of bet.selections) {
            if (selection.matchId === matchId) {
                const outcome = getOutcome(result);
                selection.status = (selection.betType === outcome) ? 'won' : 'lost';
                if (selection.status === 'lost') {
                    betLost = true;
                }
            }

            if (selection.status === 'pending') {
                allSelectionsFinished = false;
            }
        }

        let newBetStatus = bet.status;
        if (betLost) {
            newBetStatus = 'lost';
        } else if (allSelectionsFinished) {
            newBetStatus = 'won';
        }

        await db.collection(COLLECTIONS.BETS).updateOne({
            _id: bet._id
        }, {
            $set: {
                selections: bet.selections,
                status: newBetStatus
            }
        });

        if (newBetStatus === 'won') {
            const economy = getEconomy(bet.userId);
            await economy.add(parseFloat(bet.potentialWinnings));
            // Notify user of winnings
            await message.client.sendMessage(bet.userId, {
                text: `🎉 Congratulations! Your bet slip won! You've been credited ${economy.currency}${bet.potentialWinnings}.`
            });
            settledCount++;
        } else if (newBetStatus === 'lost') {
            await message.client.sendMessage(bet.userId, {
                text: `😔 Unlucky! Your bet slip lost.`
            });
            settledCount++;
        }
    }

    await message.reply(`Settled ${settledCount} bet slips related to this match.`);
}


/**
 * Determines the outcome of a match (1, X, 2).
 */
function getOutcome(result) {
    if (result.homeScore > result.awayScore) return '1';
    if (result.homeScore < result.awayScore) return '2';
    return 'X';
}


// --- ADMIN FUNCTIONS ---

async function handleAddTeam(message, db, args) {
    // .addteam <Team Name> <Strength (1-100)>
    const name = args[0]?.replace(/_/g, " ");
    const strength = parseInt(args[1], 10);

    if (!name || isNaN(strength) || strength < 1 || strength > 100) {
        return message.reply("Invalid format. Use: .addteam <Team_Name> <Strength (1-100)>");
    }

    const existingTeam = await db.collection(COLLECTIONS.TEAMS).findOne({
        name
    });
    if (existingTeam) {
        return message.reply(`Team "${name}" already exists.`);
    }

    await db.collection(COLLECTIONS.TEAMS).insertOne({
        name,
        strength,
        form: 0, // Initial form
        formHistory: [], // Stores last 5 match results (3 for W, 1 for D, 0 for L)
    });

    return message.reply(`Team "${name}" added with strength ${strength}.`);
}

async function handleAddMatch(message, db, args) {
    // .addmatch <HomeTeam> <AwayTeam> <League> <YYYY-MM-DDTHH:MM> <Odds1> <OddsX> <Odds2>
    const [homeTeam, awayTeam, league, dateStr, odds1, oddsX, odds2] = args;
    if (args.length < 7) {
        return message.reply("Invalid format. Use: .addmatch Home Away League YYYY-MM-DDTHH:MM Odds1 OddsX Odds2");
    }

    const matchId = `M${Date.now()}`;
    const newMatch = {
        matchId,
        homeTeam: homeTeam.replace(/_/g, " "),
        awayTeam: awayTeam.replace(/_/g, " "),
        league: league.replace(/_/g, " "),
        date: new Date(dateStr),
        status: 'upcoming',
        odds: {
            '1': parseFloat(odds1),
            'X': parseFloat(oddsX),
            '2': parseFloat(odds2),
        },
        result: null
    };

    await db.collection(COLLECTIONS.MATCHES).insertOne(newMatch);
    // Invalidate cache
    fixtureCache.timestamp = 0;
    return message.reply(`Match added with ID: ${matchId}`);
}

async function handleCancelMatch(message, db, matchId) {
    const result = await db.collection(COLLECTIONS.MATCHES).updateOne({
        matchId
    }, {
        $set: {
            status: 'cancelled'
        }
    });
    if (result.modifiedCount === 0) return message.reply("Match not found or already cancelled.");

    // TODO: Refund bets on this match
    // This requires finding all slips with this match, refunding the stake, and marking them as void.

    // Invalidate cache
    fixtureCache.timestamp = 0;
    return message.reply(`Match ${matchId} has been cancelled. Bets should be refunded.`);
}
