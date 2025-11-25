// plugins/word_game.js - Multiplayer Word Scramble Game with Economy Integration
import chalk from 'chalk';
import { PluginHelpers, safeOperation } from '../lib/pluginIntegration.js';

// ===================================
// ===== CONSTANTS & CONFIGURATION =====
// ===================================

const GAMES_COLLECTION = 'word_games';
const STATS_COLLECTION = 'word_game_stats';
const TRANSACTIONS_COLLECTION = 'economy_transactions';

const GAME_CONFIG = {
  POINTS_TO_WIN: 3, // First to 3 points wins
  JOIN_TIMEOUT: 60000, // 60 seconds to join
  ROUND_TIMEOUT: 30000, // 30 seconds per word
  MIN_WAGER: 1000,
  MAX_WAGER: 1000000,
  WIN_MULTIPLIER: 1.9, // Winner gets 1.9x (10% fee)
};

const EMOJIS = {
  PLAYER1: '🔴',
  PLAYER2: '🔵',
  CORRECT: '✅',
  WIN: '🏆',
  TIME: '⏳'
};

// Simple internal dictionary for the game
const WORD_LIST = [
  'ACTION', 'ADVICE', 'AGREEMENT', 'ALCOHOL', 'ANIMAL', 'ANSWER', 'ARTIST', 'BAKERY', 
  'BALLOON', 'BANANA', 'BATTERY', 'BEAUTY', 'BEDROOM', 'CAMERA', 'CANDLE', 'CARPET', 
  'CASTLE', 'CHANCE', 'CHANGE', 'CHANNEL', 'CHEESE', 'CHICKEN', 'CHURCH', 'CIRCLE', 
  'COFFEE', 'COMFORT', 'COUNTRY', 'DAMAGE', 'DANGER', 'DAUGHTER', 'DEGREE', 'DESIGN', 
  'DESIRE', 'DEVICE', 'DINNER', 'DOCTOR', 'DRIVER', 'EFFECT', 'ENERGY', 'ENGINE', 
  'EXPERT', 'FAMILY', 'FATHER', 'FIGURE', 'FINGER', 'FLIGHT', 'FLOWER', 'FOREST', 
  'FRIEND', 'FUTURE', 'GARDEN', 'GROUND', 'GROWTH', 'GUITAR', 'HEALTH', 'HEAVEN', 
  'HEIGHT', 'HORROR', 'HUNGER', 'INCOME', 'INSECT', 'ISLAND', 'JACKET', 'JUNGLE', 
  'KITCHEN', 'LAWYER', 'LEADER', 'LESSON', 'LETTER', 'LIQUOR', 'LISTEN', 'LIZARD', 
  'MACHINE', 'MAGAZINE', 'MARKET', 'MASTER', 'MEMORY', 'MINUTE', 'MIRROR', 'MOMENT', 
  'MONKEY', 'MORNING', 'MOTHER', 'MOTION', 'MOUNTAIN', 'MUSCLE', 'MUSEUM', 'NATION', 
  'NATURE', 'NUMBER', 'OBJECT', 'OFFICE', 'ORANGE', 'OWNER', 'PARENT', 'PARROT', 
  'PARTY', 'PASSION', 'PASTRY', 'PAYMENT', 'PERSON', 'PIRATE', 'PLANET', 'POCKET', 
  'POETRY', 'POLICE', 'POTATO', 'POWDER', 'POWER', 'PRAYER', 'PRISON', 'PUBLIC', 
  'PURPLE', 'PUZZLE', 'RABBIT', 'RECORD', 'REPAIR', 'REPORT', 'RESULT', 'REWARD', 
  'RHYTHM', 'RIVER', 'ROCKET', 'SAFETY', 'SALAD', 'SAMPLE', 'SCHOOL', 'SCREEN', 
  'SEASON', 'SECOND', 'SECRET', 'SECTOR', 'SENIOR', 'SERIES', 'SHADOW', 'SHOWER', 
  'SIGNAL', 'SILENT', 'SILVER', 'SISTER', 'SKETCH', 'SNAKE', 'SOCCER', 'SOCIAL', 
  'SOCIETY', 'SOLDIER', 'SOURCE', 'SPIRIT', 'SPRING', 'SQUARE', 'STATUE', 'STORM', 
  'STREET', 'STUDENT', 'STUDIO', 'SUGAR', 'SUMMER', 'SUNDAY', 'SUPPLY', 'SYSTEM', 
  'TARGET', 'TASTE', 'TEACHER', 'TENNIS', 'THEORY', 'THOUGHT', 'TOMATO', 'TONGUE', 
  'TOOTH', 'TRAVEL', 'TROUBLE', 'TUNNEL', 'TURTLE', 'UNCLE', 'UNIQUE', 'VALLEY', 
  'VARIETY', 'VEHICLE', 'VESSEL', 'VICTIM', 'VICTORY', 'VILLAGE', 'VISION', 'VOLUME', 
  'WALKER', 'WARNING', 'WEALTH', 'WEAPON', 'WEATHER', 'WEDDING', 'WEIGHT', 'WINDOW', 
  'WINTER', 'WORKER', 'WRITER', 'YELLOW', 'ZOMBIE'
];

// ===================================
// ===== GAME LOGIC CLASS =====
// ===================================

class RandomWordGame {
  constructor(gameId, player1Id, wager, chatId) {
    this.gameId = gameId;
    this.player1 = { id: player1Id, score: 0, tag: EMOJIS.PLAYER1 };
    this.player2 = null; // { id, score, tag }
    this.wager = wager;
    this.chatId = chatId;

    this.status = 'waiting'; // waiting, active, finished
    this.currentWord = null;
    this.scrambledWord = null;
    this.roundStartTime = null;
    this.roundCount = 0;

    this.winner = null;
    this.createdAt = new Date();
  }

  // Synchronous join logic
  join(player2Id) {
    if (this.status !== 'waiting') {
      return { success: false, message: 'Game already started or finished' };
    }

    if (this.player1.id === player2Id) {
      return { success: false, message: 'You cannot play against yourself!' };
    }

    this.player2 = { id: player2Id, score: 0, tag: EMOJIS.PLAYER2 };
    this.status = 'active';

    // Start first round immediately
    this.startNewRound();

    return { success: true };
  }

  startNewRound() {
    // Pick random word
    const randomIndex = Math.floor(Math.random() * WORD_LIST.length);
    this.currentWord = WORD_LIST[randomIndex];
    this.scrambledWord = this.scramble(this.currentWord);
    this.roundStartTime = Date.now();
    this.roundCount++;
    return this.scrambledWord;
  }

  scramble(word) {
    const arr = word.split('');
    // Fisher-Yates Shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Ensure it's not the same as original (simple check)
    const scrambled = arr.join('');
    return scrambled === word ? this.scramble(word) : scrambled;
  }

  submitGuess(playerId, guess) {
    if (this.status !== 'active') return { success: false, message: 'Game not active' };

    const cleanGuess = guess.toUpperCase().trim();

    // Check if guess matches current word
    if (cleanGuess === this.currentWord) {
      // Determine who guessed it
      const scorer = (this.player1.id === playerId) ? this.player1 : this.player2;
      scorer.score++;

      // Check win condition
      if (scorer.score >= GAME_CONFIG.POINTS_TO_WIN) {
        this.status = 'finished';
        this.winner = (this.player1.id === playerId) ? 1 : 2;
        return { 
          success: true, 
          correct: true, 
          gameWon: true, 
          scorerId: scorer.id,
          word: this.currentWord 
        };
      }

      // Prepare next round
      const oldWord = this.currentWord;
      const nextScramble = this.startNewRound();

      return { 
        success: true, 
        correct: true, 
        gameWon: false, 
        scorerId: scorer.id,
        word: oldWord,
        nextScramble: nextScramble
      };
    }

    return { success: true, correct: false };
  }

  toJSON() {
    return {
      gameId: this.gameId,
      player1: this.player1,
      player2: this.player2,
      wager: this.wager,
      chatId: this.chatId,
      status: this.status,
      currentWord: this.currentWord,
      scrambledWord: this.scrambledWord,
      roundCount: this.roundCount,
      winner: this.winner,
      createdAt: this.createdAt
    };
  }

  static fromJSON(data) {
    const game = new RandomWordGame(data.gameId, data.player1.id, data.wager, data.chatId);
    game.player1 = data.player1;
    game.player2 = data.player2;
    game.status = data.status;
    game.currentWord = data.currentWord;
    game.scrambledWord = data.scrambledWord;
    game.roundCount = data.roundCount;
    game.winner = data.winner;
    game.createdAt = new Date(data.createdAt);
    return game;
  }
}

// ===================================
// ===== GAME MANAGER CLASS =====
// ===================================

class WordGameManager {
  constructor() {
    this.activeGames = new Map();
    this.timeouts = new Map(); // Stores array of timeouts [joinTimer, roundTimer]
  }

  // --- Economy Helpers ---

  async getUserBalance(userId) {
    try {
      const user = await PluginHelpers.getUserData(userId);
      return user || { balance: 0, bank: 0 };
    } catch (error) {
      console.error(chalk.red('Error getting user balance:'), error.message);
      return { balance: 0, bank: 0 };
    }
  }

  async deductMoney(userId, amount, reason) {
    try {
      const user = await PluginHelpers.getUserData(userId);
      if (!user) return { success: false, message: 'User not found' };
      if (user.balance < amount) return { success: false, message: 'Insufficient balance' };

      const newBalance = user.balance - amount;
      await PluginHelpers.updateUser(userId, { balance: newBalance });

      await safeOperation(async (db, collection) => {
        await collection.insertOne({
          userId, type: 'debit', amount, reason, timestamp: new Date()
        });
      }, TRANSACTIONS_COLLECTION);

      return { success: true, newBalance };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async addMoney(userId, amount, reason) {
    try {
      return await PluginHelpers.addMoney(userId, amount, reason);
    } catch (error) {
      return { success: false, message: 'Transaction failed' };
    }
  }

  // --- Game Lifecycle ---

  async initialize() {
    try {
      // Load active games from DB (in case of restart)
      const games = await safeOperation(async (db, collection) => {
        return await collection.find({ status: { $in: ['waiting', 'active'] } }).toArray();
      }, GAMES_COLLECTION);

      if (games && games.length > 0) {
        for (const gameData of games) {
          const game = RandomWordGame.fromJSON(gameData);
          this.activeGames.set(game.gameId, game);
          // If waiting, check expiry
          if (game.status === 'waiting') {
             const elapsed = Date.now() - new Date(game.createdAt).getTime();
             if (elapsed > GAME_CONFIG.JOIN_TIMEOUT) {
               await this.cancelGame(game.gameId, 'timeout');
             }
          }
        }
        console.log(chalk.green(`✅ Loaded ${this.activeGames.size} active Word Games`));
      }
    } catch (error) {
      console.error('Failed to init Word Game manager:', error);
    }
  }

  generateGameId() {
    return `rwg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  createGame(player1Id, wager, chatId, reminderCallback) {
    // 1. Check existing
    const existing = Array.from(this.activeGames.values()).find(g => 
      (g.player1.id === player1Id || (g.player2 && g.player2.id === player1Id)) && 
      g.status !== 'finished'
    );
    if (existing) return Promise.resolve({ success: false, message: 'You already have an active game.' });

    // 2. Validate Wager
    if (wager < GAME_CONFIG.MIN_WAGER || wager > GAME_CONFIG.MAX_WAGER) {
      return Promise.resolve({ success: false, message: `Wager must be ₦${GAME_CONFIG.MIN_WAGER} - ₦${GAME_CONFIG.MAX_WAGER}` });
    }

    return (async () => {
      // 3. Economy Check
      const userData = await this.getUserBalance(player1Id);
      if (userData.balance < wager) return { success: false, message: 'Insufficient balance.' };

      const deducted = await this.deductMoney(player1Id, wager, 'Word Game Wager');
      if (!deducted.success) return { success: false, message: deducted.message };

      // 4. Create Game
      const gameId = this.generateGameId();
      const game = new RandomWordGame(gameId, player1Id, wager, chatId);
      this.activeGames.set(gameId, game);
      await this.saveGame(game);

      // 5. Set Join Timeout & Reminders
      const timers = [];
      const notify = (msg) => { if(reminderCallback) reminderCallback(msg).catch(() => {}); };

      timers.push(setTimeout(() => notify(`⏳ *30s Remaining* to join Word Game!`), 30000));
      timers.push(setTimeout(async () => {
        await this.cancelGame(gameId, 'timeout');
        notify(`🚫 *Word Game Expired* - Wager refunded.`);
      }, GAME_CONFIG.JOIN_TIMEOUT));

      this.timeouts.set(gameId, timers);
      await this.updateStats(player1Id, 'gamesCreated');

      return { success: true, game };
    })();
  }

  async joinGame(gameId, player2Id, notificationCallback) {
    const game = this.activeGames.get(gameId);
    if (!game) return { success: false, message: 'Game not found.' };

    const userData = await this.getUserBalance(player2Id);
    if (userData.balance < game.wager) return { success: false, message: 'Insufficient balance.' };

    const joinRes = game.join(player2Id);
    if (!joinRes.success) return joinRes;

    const deducted = await this.deductMoney(player2Id, game.wager, 'Word Game Wager');
    if (!deducted.success) {
      // Rollback logic would go here ideally, but simplified:
      game.player2 = null; game.status = 'waiting';
      return { success: false, message: 'Transaction failed.' };
    }

    this.clearTimeouts(gameId); // Clear join timers

    // Start Round Timer for the first word
    this.setRoundTimeout(gameId, notificationCallback);

    await this.saveGame(game);
    await this.updateStats(player2Id, 'gamesJoined');

    return { success: true, game };
  }

  async processGuess(gameId, playerId, word, notificationCallback) {
    const game = this.activeGames.get(gameId);
    if (!game) return { success: false };

    const result = game.submitGuess(playerId, word);

    if (result.correct) {
      this.clearTimeouts(gameId); // Stop timer for this round

      if (result.gameWon) {
        await this.handleGameEnd(game);
      } else {
        // Start timer for the NEXT round
        this.setRoundTimeout(gameId, notificationCallback);
      }

      await this.saveGame(game);
    }

    return { success: true, game, result };
  }

  async handleGameEnd(game) {
    const winnerId = game.winner === 1 ? game.player1.id : game.player2.id;
    const loserId = game.winner === 1 ? game.player2.id : game.player1.id;

    const winnings = Math.floor(game.wager * 2 * GAME_CONFIG.WIN_MULTIPLIER);

    await this.addMoney(winnerId, winnings, 'Word Game Win');

    await this.updateStats(winnerId, 'wins');
    await this.updateStats(winnerId, 'totalWinnings', winnings);
    await this.updateStats(loserId, 'losses');

    // Stats
    await this.updateStats(game.player1.id, 'gamesPlayed');
    await this.updateStats(game.player2.id, 'gamesPlayed');
  }

  async cancelGame(gameId, reason = 'manual') {
    const game = this.activeGames.get(gameId);
    if (!game) return { success: false, message: 'Game not found' };
    if (game.status === 'finished') return { success: false, message: 'Already finished' };

    await this.addMoney(game.player1.id, game.wager, 'Word Game Refund');
    if (game.player2) await this.addMoney(game.player2.id, game.wager, 'Word Game Refund');

    this.clearTimeouts(gameId);
    game.status = 'cancelled';
    await this.saveGame(game);
    this.activeGames.delete(gameId);

    return { success: true, game, reason };
  }

  // --- Timeout Logic ---

  setRoundTimeout(gameId, notificationCallback) {
    this.clearTimeouts(gameId);

    const timer = setTimeout(async () => {
      const game = this.activeGames.get(gameId);
      if (game && game.status === 'active') {
        // Timeout means no one guessed it.
        // We can either skip the word or end game. 
        // Let's SKIP the word and give no points, starting new round.

        const oldWord = game.currentWord;
        const newScramble = game.startNewRound();

        await this.saveGame(game);

        // Reset timer for the NEW word
        this.setRoundTimeout(gameId, notificationCallback);

        if (notificationCallback) {
          notificationCallback(
            `⏰ *Time Up!*\n` +
            `The word was: *${oldWord}*\n\n` +
            `🔄 *New Round*\n` +
            `Unscramble: *${newScramble}*`
          );
        }
      }
    }, GAME_CONFIG.ROUND_TIMEOUT);

    this.timeouts.set(gameId, [timer]);
  }

  clearTimeouts(gameId) {
    const timers = this.timeouts.get(gameId);
    if (timers) {
      timers.forEach(t => clearTimeout(t));
      this.timeouts.delete(gameId);
    }
  }

  // --- DB Helpers ---
  async saveGame(game) {
    try {
      await safeOperation(async (db, col) => {
        await col.updateOne({ gameId: game.gameId }, { $set: { ...game.toJSON() } }, { upsert: true });
      }, GAMES_COLLECTION);
    } catch (e) { console.error('Error saving game', e); }
  }

  async updateStats(userId, field, value = 1) {
    try {
      await safeOperation(async (db, col) => {
        await col.updateOne({ userId }, { $inc: { [field]: value } }, { upsert: true });
      }, STATS_COLLECTION);
    } catch (e) { console.error('Error updating stats', e); }
  }

  async getLeaderboard() {
    return await safeOperation(async (db, col) => {
      return await col.find({ gamesPlayed: { $gt: 0 } }).sort({ wins: -1 }).limit(10).toArray();
    }, STATS_COLLECTION) || [];
  }

  async getStats(userId) {
     return await safeOperation(async (db, col) => {
        return await col.findOne({ userId });
     }, STATS_COLLECTION);
  }

  getActiveGamesForChat(chatId) {
    return Array.from(this.activeGames.values()).filter(g => g.chatId === chatId);
  }
}

const gameManager = new WordGameManager();

// ===================================
// ===== HELPERS =====
// ===================================

function getPlayerName(id) { return '@' + (id ? id.split('@')[0] : 'Unknown'); }

function getMentions(game) {
  const m = [];
  if(game.player1?.id) m.push(game.player1.id);
  if(game.player2?.id) m.push(game.player2.id);
  return m;
}

function formatGameStatus(game) {
  const p1 = game.player1;
  const p2 = game.player2;

  let txt = `🧩 *Word Scramble* (First to ${GAME_CONFIG.POINTS_TO_WIN})\n\n`;
  txt += `${p1.tag} ${getPlayerName(p1.id)}: ${p1.score}\n`;
  txt += `${p2.tag} ${getPlayerName(p2.id)}: ${p2.score}\n\n`;

  if (game.status === 'active') {
    txt += `🔤 Scramble: *${game.scrambledWord}*\n`;
    txt += `⏱️ Time: 30s`;
  }

  return txt;
}

// ===================================
// ===== PLUGIN EXPORT =====
// ===================================

export default {
  name: 'Word Scramble',
  version: '1.0.0',
  author: 'BotDev',
  description: 'Multiplayer Word Scramble Wagering Game',
  category: 'games',
  commands: ['rwg', 'rwgjoin', 'rwgcancel', 'rwgstats', 'rwghelp', 'rwgleaderboard'],

  executeOnAllMessages: true,

  async init(context) {
    await gameManager.initialize();
    context.logger.info('✅ Word Game initialized');
  },

  async run(context) {
    const { msg: m, sock, config, logger, command, args } = context;
    const sender = m.key.participant || m.key.remoteJid || m.sender;
    const chatId = m.from;

    if (!sender) return;

    // Helper to reply
    const reply = async (text, mentions = []) => {
      await sock.sendMessage(chatId, { text, mentions }, { quoted: m });
    };

    // Notification callback for async events
    const notify = async (text, mentions = []) => {
      await sock.sendMessage(chatId, { text, mentions });
    };

    const rawText = (m.body || '').trim();
    const activeGames = gameManager.getActiveGamesForChat(chatId);
    const activeGame = activeGames.find(g => g.status === 'waiting' || g.status === 'active');

    // 1. Handle "JOIN" keyword for waiting games
    if (activeGame && activeGame.status === 'waiting' && rawText.toLowerCase() === 'join') {
      await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });
      const res = await gameManager.joinGame(activeGame.gameId, sender, notify);

      if (!res.success) {
        await reply(`❌ ${res.message}`);
        return;
      }

      await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
      await reply(
        `✅ *Game Started!*\n\n` +
        formatGameStatus(res.game) + 
        `\n\n💡 _Unscramble the word quickly!_`,
        getMentions(res.game)
      );
      return;
    }

    // 2. Handle Guesses (Word matching)
    if (activeGame && activeGame.status === 'active') {
       // Only allow players to guess
       if (sender === activeGame.player1.id || sender === activeGame.player2.id) {
         // Check if it's the correct word (case insensitive check done in logic)
         // We do a pre-check here to avoid spamming the manager logic if it's obviously chat
         // But the manager logic handles the check safely.

         const res = await gameManager.processGuess(activeGame.gameId, sender, rawText, notify);

         if (res.result?.correct) {
           await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });

           if (res.result.gameWon) {
             const winner = res.game.winner === 1 ? res.game.player1 : res.game.player2;
             const prize = Math.floor(res.game.wager * 2 * GAME_CONFIG.WIN_MULTIPLIER);

             await reply(
               `🏆 *WE HAVE A WINNER!*\n\n` +
               `The word was: *${res.result.word}*\n\n` +
               `🥇 ${getPlayerName(winner.id)} wins ₦${prize.toLocaleString()}!\n\n` +
               `Final Score:\n` +
               `${res.game.player1.score} - ${res.game.player2.score}`,
               getMentions(res.game)
             );
           } else {
             // Round won, next round
             await reply(
               `✨ *Correct!* ${getPlayerName(sender)} got it!\n` +
               `Word: *${res.result.word}*\n\n` +
               `🔄 *Next Round*\n` +
               `Score: ${res.game.player1.score} - ${res.game.player2.score}\n\n` +
               `🔤 Scramble: *${res.result.nextScramble}*`,
               getMentions(res.game)
             );
           }
           return;
         }
       }
    }

    // 3. Commands
    if (command === 'rwg') {
      if (activeGame) {
         return reply(`⚠️ A game is already active in this chat. Please wait or join it.`);
      }
      if (!args[0]) return reply(`Please specify a wager.\nExample: ${config.PREFIX}rwg 1000`);

      const wager = parseInt(args[0]);
      if (isNaN(wager)) return reply('Invalid wager.');

      const res = await gameManager.createGame(sender, wager, chatId, notify);
      if (!res.success) return reply(`❌ ${res.message}`);

      await reply(
        `🧩 *Random Word Game Created*\n\n` +
        `💰 Bet: ₦${wager.toLocaleString()}\n` +
        `🏆 Win Condition: First to 3 Points\n` +
        `⏳ Waiting for player...\n\n` +
        `👉 Type *JOIN* to play!`,
        [sender]
      );
    }

    else if (command === 'rwgcancel') {
      const game = activeGames.find(g => (g.player1.id === sender || g.player2?.id === sender));
      if (!game) return reply('You are not in a game.');

      const res = await gameManager.cancelGame(game.gameId);
      if (res.success) reply('✅ Game cancelled and refunded.');
    }

    else if (command === 'rwgleaderboard') {
       const lb = await gameManager.getLeaderboard();
       let txt = `🏆 *Top Word Masters*\n\n`;
       lb.forEach((u, i) => txt += `${i+1}. ${getPlayerName(u.userId)} - ${u.wins} Wins\n`);
       reply(txt);
    }

    else if (command === 'rwghelp') {
      reply(
        `🧩 *Word Game Help*\n\n` +
        `Unscramble words faster than your opponent!\n` +
        `• First to 3 points wins.\n` +
        `• 30 seconds per word.\n\n` +
        `Commands:\n` +
        `.rwg <amount> - Start\n` +
        `.rwgcancel - Cancel\n` +
        `Type *JOIN* to enter a pending game.`
      );
    }
  }
};