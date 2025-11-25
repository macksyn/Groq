// plugins/word_chain.js - Multiplayer Word Chain (Shiritori) Game
import chalk from 'chalk';
import fs from 'fs';
import https from 'https';
import { PluginHelpers, safeOperation } from '../lib/pluginIntegration.js';

// ===================================
// ===== CONFIGURATION =====
// ===================================

const GAMES_COLLECTION = 'wordchain_games';
const STATS_COLLECTION = 'wordchain_stats';
const TRANSACTIONS_COLLECTION = 'economy_transactions';
const WORD_FILE_PATH = './words.json'; 
const DICTIONARY_URL = 'https://raw.githubusercontent.com/jesstess/Scrabble/master/scrabble/sowpods.txt';

const GAME_CONFIG = {
  START_TIME: 45000,     // 45 seconds initial time
  MIN_TIME: 10000,       // Never go below 10 seconds
  TIME_DECREMENT: 2000,  // Reduce by 2 seconds each round

  START_LENGTH: 3,       // Initial minimum word length
  LENGTH_INCREMENT_RATE: 5, // Increase min length every 5 rounds
  MAX_LENGTH: 8,         // Cap min length at 8

  JOIN_TIMEOUT: 60000,   // 60 seconds to join
  MIN_WAGER: 1000,
  MAX_WAGER: 1000000,
  WIN_MULTIPLIER: 1.9,
};

const EMOJIS = {
  P1: '🔴',
  P2: '🔵',
  TIME: '⏳',
  WIN: '🏆',
  DEAD: '💀',
  CHAIN: '🔗'
};

// Global Word Set
let VALID_WORDS = new Set();
const FALLBACK_WORDS = ['APPLE', 'BANANA', 'CAT', 'DOG', 'EGG', 'FISH', 'GOOD', 'HELLO', 'ICE', 'JUMP'];

// ===================================
// ===== GAME LOGIC CLASS =====
// ===================================

class WordChainGame {
  constructor(gameId, player1Id, wager, chatId) {
    this.gameId = gameId;
    this.player1 = { id: player1Id, tag: EMOJIS.P1, name: 'P1', score: 0 };
    this.player2 = null;
    this.wager = wager;
    this.chatId = chatId;

    this.status = 'waiting';
    this.currentTurn = 1; // 1 or 2

    // Game State
    this.currentTimeLimit = GAME_CONFIG.START_TIME;
    this.currentMinLength = GAME_CONFIG.START_LENGTH;
    this.roundCount = 0;

    this.targetLetter = null; // The letter the current player MUST start with
    this.lastWord = null;     // The word that was just played
    this.usedWords = new Set();
    this.winner = null;
    this.createdAt = new Date();
  }

  join(player2Id) {
    if (this.status !== 'waiting') return { success: false, message: 'Game started/finished' };
    if (this.player1.id === player2Id) return { success: false, message: 'Cannot play self' };

    this.player2 = { id: player2Id, tag: EMOJIS.P2, name: 'P2', score: 0 };
    this.status = 'active';

    // Initialize First Turn
    this.startFirstRound();
    return { success: true };
  }

  startFirstRound() {
    this.roundCount = 1;
    // Pick a random starting letter
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    this.targetLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  submitWord(playerId, word) {
    if (this.status !== 'active') return { success: false };

    // 1. Validate Turn
    const currentPlayer = this.currentTurn === 1 ? this.player1 : this.player2;
    if (currentPlayer.id !== playerId) return { success: false, message: 'Not your turn' };

    const cleanWord = word.trim().toUpperCase();

    // 2. Validate Word Rules

    // Rule A: Must start with Target Letter
    if (!cleanWord.startsWith(this.targetLetter)) {
      return { success: false, reason: `Word must start with '${this.targetLetter}'` };
    }

    // Rule B: Minimum Length
    if (cleanWord.length < this.currentMinLength) {
      return { success: false, reason: `Word too short! Min length: ${this.currentMinLength}` };
    }

    // Rule C: No Duplicates
    if (this.usedWords.has(cleanWord)) {
      return { success: false, reason: `Word '${cleanWord}' already used!` };
    }

    // Rule D: Dictionary Check
    if (VALID_WORDS.size > 0 && !VALID_WORDS.has(cleanWord)) {
      return { success: false, reason: `Not a valid English word!` };
    }

    // --- SUCCESSFUL MOVE ---

    // Update Stats
    this.usedWords.add(cleanWord);
    currentPlayer.score++;
    this.lastWord = cleanWord;

    // Calculate Next State
    // The next target letter is the LAST letter of the submitted word
    this.targetLetter = cleanWord.charAt(cleanWord.length - 1);

    // Increase difficulty
    this.advanceDifficulty();

    // Switch Turn
    this.currentTurn = this.currentTurn === 1 ? 2 : 1;

    return { 
      success: true, 
      word: cleanWord,
      nextLetter: this.targetLetter,
      nextTime: this.currentTimeLimit,
      nextLength: this.currentMinLength
    };
  }

  advanceDifficulty() {
    this.roundCount++;

    // Decrease Time
    if (this.roundCount > 1) {
      this.currentTimeLimit = Math.max(
        GAME_CONFIG.MIN_TIME, 
        this.currentTimeLimit - GAME_CONFIG.TIME_DECREMENT
      );
    }

    // Increase Length every X rounds
    if (this.roundCount > 1 && this.roundCount % GAME_CONFIG.LENGTH_INCREMENT_RATE === 0) {
      this.currentMinLength = Math.min(
        GAME_CONFIG.MAX_LENGTH, 
        this.currentMinLength + 1
      );
    }
  }

  toJSON() {
    return {
      gameId: this.gameId,
      player1: this.player1,
      player2: this.player2,
      wager: this.wager,
      chatId: this.chatId,
      status: this.status,
      currentTurn: this.currentTurn,
      currentTimeLimit: this.currentTimeLimit,
      currentMinLength: this.currentMinLength,
      targetLetter: this.targetLetter,
      lastWord: this.lastWord,
      usedWords: Array.from(this.usedWords),
      winner: this.winner,
      createdAt: this.createdAt
    };
  }

  static fromJSON(data) {
    const game = new WordChainGame(data.gameId, data.player1.id, data.wager, data.chatId);
    game.player1 = data.player1;
    game.player2 = data.player2;
    game.status = data.status;
    game.currentTurn = data.currentTurn;
    game.currentTimeLimit = data.currentTimeLimit;
    game.currentMinLength = data.currentMinLength;
    game.targetLetter = data.targetLetter;
    game.lastWord = data.lastWord;
    game.usedWords = new Set(data.usedWords);
    game.winner = data.winner;
    game.createdAt = new Date(data.createdAt);
    return game;
  }
}

// ===================================
// ===== MANAGER CLASS =====
// ===================================

class WordChainManager {
  constructor() {
    this.activeGames = new Map();
    this.timeouts = new Map();
  }

  // --- Economy Helpers ---
  async getUserBalance(userId) {
    try {
      const user = await PluginHelpers.getUserData(userId);
      return user || { balance: 0 };
    } catch (e) { return { balance: 0 }; }
  }

  async deductMoney(userId, amount, reason) {
    try {
      const user = await PluginHelpers.getUserData(userId);
      if (!user || user.balance < amount) return { success: false, message: 'Insufficient balance' };
      const newBal = user.balance - amount;
      await PluginHelpers.updateUser(userId, { balance: newBal });
      await safeOperation(async (db, col) => {
        await col.insertOne({ userId, type: 'debit', amount, reason, timestamp: new Date() });
      }, TRANSACTIONS_COLLECTION);
      return { success: true, newBalance: newBal };
    } catch (e) { return { success: false, message: e.message }; }
  }

  async addMoney(userId, amount, reason) {
    try { await PluginHelpers.addMoney(userId, amount, reason); } catch (e) {}
  }

  // --- Initialization ---
  async initialize() {
    // 1. Download Dictionary if missing
    if (!fs.existsSync(WORD_FILE_PATH)) {
      console.log(chalk.yellow('⬇️ [WC] Dictionary missing. Downloading SOWPODS...'));
      try { await this.downloadDictionary(); } catch (err) { console.error('Failed to download dict:', err.message); }
    }

    // 2. Load Dictionary
    try {
      if (fs.existsSync(WORD_FILE_PATH)) {
        const rawData = fs.readFileSync(WORD_FILE_PATH, 'utf8');
        const wordsArray = JSON.parse(rawData);
        VALID_WORDS = new Set(wordsArray.map(w => w.toUpperCase().trim()));
        console.log(chalk.green(`✅ [WC] Loaded ${VALID_WORDS.size} words.`));
      } else {
        VALID_WORDS = new Set(FALLBACK_WORDS);
        console.log(chalk.yellow(`⚠️ [WC] Using fallback word list.`));
      }
    } catch (err) {
      VALID_WORDS = new Set(FALLBACK_WORDS);
    }

    // 3. Restore Games
    try {
      const games = await safeOperation(async (db, col) => {
        return await col.find({ status: { $in: ['waiting', 'active'] } }).toArray();
      }, GAMES_COLLECTION);

      if (games) {
        games.forEach(g => {
          const game = WordChainGame.fromJSON(g);
          this.activeGames.set(game.gameId, game);
          // Clean up expired waiting games
          if (game.status === 'waiting' && Date.now() - game.createdAt > GAME_CONFIG.JOIN_TIMEOUT) {
             this.cancelGame(game.gameId, 'timeout');
          }
        });
      }
    } catch (e) { console.error('WC Init Error', e); }
  }

  downloadDictionary() {
    return new Promise((resolve, reject) => {
      https.get(DICTIONARY_URL, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`Status ${res.statusCode}`));
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const words = data.split(/\r?\n/).map(w => w.trim().toUpperCase()).filter(w => w.length >= 3);
            fs.writeFileSync(WORD_FILE_PATH, JSON.stringify(words));
            resolve();
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  generateId() { return `wc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`; }

  // --- Game Lifecycle ---

  createGame(player1Id, wager, chatId, reminderCallback) {
    const existing = Array.from(this.activeGames.values()).find(g => 
      (g.player1.id === player1Id || (g.player2 && g.player2.id === player1Id)) && 
      g.status !== 'finished'
    );
    if (existing) return Promise.resolve({ success: false, message: 'You have an active game!' });
    if (wager < GAME_CONFIG.MIN_WAGER || wager > GAME_CONFIG.MAX_WAGER) 
       return Promise.resolve({ success: false, message: `Bet range: ${GAME_CONFIG.MIN_WAGER}-${GAME_CONFIG.MAX_WAGER}` });

    return (async () => {
      const bal = await this.getUserBalance(player1Id);
      if (bal.balance < wager) return { success: false, message: 'Insufficient funds' };

      const ded = await this.deductMoney(player1Id, wager, 'WC Wager');
      if (!ded.success) return { success: false, message: 'Transaction failed' };

      const gameId = this.generateId();
      const game = new WordChainGame(gameId, player1Id, wager, chatId);
      this.activeGames.set(gameId, game);
      await this.saveGame(game);

      // Join Timeout
      const timers = [];
      const notify = (m) => { if(reminderCallback) reminderCallback(m).catch(()=>{}); };
      timers.push(setTimeout(() => notify(`⏳ *30s* left to join Word Chain!`), 30000));
      timers.push(setTimeout(async () => {
        await this.cancelGame(gameId, 'timeout');
        notify(`🚫 *Word Chain Expired* - Refunded.`);
      }, GAME_CONFIG.JOIN_TIMEOUT));

      this.timeouts.set(gameId, timers);
      return { success: true, game };
    })();
  }

  async joinGame(gameId, player2Id, notifyCallback) {
    const game = this.activeGames.get(gameId);
    if (!game) return { success: false, message: 'Game not found' };

    const bal = await this.getUserBalance(player2Id);
    if (bal.balance < game.wager) return { success: false, message: 'Insufficient funds' };

    const res = game.join(player2Id);
    if (!res.success) return res;

    const ded = await this.deductMoney(player2Id, game.wager, 'WC Wager');
    if (!ded.success) {
       game.player2 = null; game.status = 'waiting';
       return { success: false, message: 'Transaction failed' };
    }

    this.clearTimeouts(gameId);
    this.startTurnTimer(gameId, notifyCallback);
    await this.saveGame(game);

    return { success: true, game };
  }

  async playTurn(gameId, playerId, word, notifyCallback) {
    const game = this.activeGames.get(gameId);
    if (!game) return { success: false };

    const res = game.submitWord(playerId, word);

    if (res.success) {
      this.clearTimeouts(gameId);
      this.startTurnTimer(gameId, notifyCallback);
      await this.saveGame(game);
    }

    return { success: true, game, result: res };
  }

  startTurnTimer(gameId, notifyCallback) {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    const timer = setTimeout(async () => {
      const g = this.activeGames.get(gameId);
      if (g && g.status === 'active') {
        // Player timed out -> They lose
        const loser = g.currentTurn === 1 ? g.player1 : g.player2;
        const winner = g.currentTurn === 1 ? g.player2 : g.player1;

        g.status = 'finished';
        g.winner = g.currentTurn === 1 ? 2 : 1;

        await this.handleWin(g);
        await this.saveGame(g);

        if (notifyCallback) {
          notifyCallback(
            `${EMOJIS.DEAD} *TIME UP!*\n\n` +
            `${getPlayerName(loser.id)} couldn't find a word starting with *${g.targetLetter}*!\n\n` +
            `${EMOJIS.WIN} Winner: ${getPlayerName(winner.id)}\n` +
            `💰 Prize: ₦${Math.floor(g.wager * 2 * GAME_CONFIG.WIN_MULTIPLIER).toLocaleString()}`,
            [loser.id, winner.id]
          );
        }
      }
    }, game.currentTimeLimit);

    this.timeouts.set(gameId, [timer]);
  }

  async handleWin(game) {
    const winnerId = game.winner === 1 ? game.player1.id : game.player2.id;
    const prize = Math.floor(game.wager * 2 * GAME_CONFIG.WIN_MULTIPLIER);
    await this.addMoney(winnerId, prize, 'WC Win');
    this.activeGames.delete(game.gameId);
  }

  async cancelGame(gameId) {
    const game = this.activeGames.get(gameId);
    if (!game) return { success: false };

    await this.addMoney(game.player1.id, game.wager, 'WC Refund');
    if (game.player2) await this.addMoney(game.player2.id, game.wager, 'WC Refund');

    this.clearTimeouts(gameId);
    this.activeGames.delete(gameId);
    return { success: true };
  }

  clearTimeouts(id) {
    const ts = this.timeouts.get(id);
    if (ts) { ts.forEach(clearTimeout); this.timeouts.delete(id); }
  }

  async saveGame(game) {
    try { await safeOperation(async (db, col) => col.updateOne({ gameId: game.gameId }, { $set: game.toJSON() }, { upsert: true }), GAMES_COLLECTION); } catch(e){}
  }

  getActiveGame(chatId) {
    return Array.from(this.activeGames.values()).find(g => g.chatId === chatId);
  }
}

const manager = new WordChainManager();

// ===================================
// ===== HELPERS =====
// ===================================

function getPlayerName(id) { return '@' + (id ? id.split('@')[0] : 'Unknown'); }
function getMentions(g) { return [g.player1.id, g.player2?.id].filter(Boolean); }

function formatStatus(game) {
  const p1 = game.player1;
  const p2 = game.player2;
  const curr = game.currentTurn === 1 ? p1 : p2;

  // Previous word info
  let prevInfo = "";
  if (game.lastWord) {
    const prevPlayer = game.currentTurn === 1 ? p2 : p1;
    prevInfo = `\n⏮️ ${prevPlayer.tag} played: *${game.lastWord}*`;
  }

  let txt = `🔗 *WORD CHAIN*\n`;
  txt += `${prevInfo}\n\n`;
  txt += `📝 Target: Starts with *${game.targetLetter}*\n`;
  txt += `📏 Min Length: *${game.currentMinLength}*\n`;
  txt += `${EMOJIS.TIME} Time Limit: *${game.currentTimeLimit/1000}s*\n\n`;
  txt += `👉 Turn: ${curr.tag} ${getPlayerName(curr.id)}\n`;
  return txt;
}

// ===================================
// ===== PLUGIN EXPORT =====
// ===================================

export default {
  name: 'Word Chain',
  version: '1.0.0',
  description: 'Multiplayer Shiritori Game',
  commands: ['wc', 'wcjoin', 'wccancel', 'wchelp'],
  executeOnAllMessages: true,

  async init(context) {
    await manager.initialize();
    context.logger.info('✅ Word Chain loaded');
  },

  async run(context) {
    const { msg: m, sock, config, logger, command, args } = context;
    const sender = m.key.participant || m.key.remoteJid || m.sender;
    const chatId = m.from;
    if (!sender) return;

    const reply = async (text, mentions = []) => sock.sendMessage(chatId, { text, mentions }, { quoted: m });
    const notify = async (text, mentions = []) => sock.sendMessage(chatId, { text, mentions });

    const activeGame = manager.getActiveGame(chatId);
    const body = (m.body || '').trim();

    // 1. Join
    if (activeGame && activeGame.status === 'waiting' && body.toLowerCase() === 'join') {
       await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });
       const res = await manager.joinGame(activeGame.gameId, sender, notify);
       if (!res.success) return reply(`❌ ${res.message}`);

       await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });
       await reply(
         `🔥 *CHAIN STARTED!* 🔥\n\n` + formatStatus(res.game), 
         getMentions(res.game)
       );
       return;
    }

    // 2. Play Turn
    if (activeGame && activeGame.status === 'active') {
      const currentPlayerId = activeGame.currentTurn === 1 ? activeGame.player1.id : activeGame.player2.id;

      if (sender === currentPlayerId) {
         const res = await manager.playTurn(activeGame.gameId, sender, body, notify);

         if (res.result && res.result.success) {
           await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });

           // Notify next
           await reply(
             `✅ *Valid!* Chain continues... ${EMOJIS.CHAIN}\n` +
             `Last Word: *${res.result.word}*\n` +
             `Next Letter: *${res.result.nextLetter}*\n\n` +
             `👉 Next Turn: ${getPlayerName(activeGame.currentTurn === 1 ? activeGame.player1.id : activeGame.player2.id)}`,
             getMentions(activeGame)
           );
         } else if (res.result && !res.result.success) {
           await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
           await reply(`❌ ${res.result.reason}`);
         }
         return;
      }
    }

    // 3. Commands
    if (command === 'wc') {
      if (activeGame) return reply('⚠️ Game already active here!');
      const wager = parseInt(args[0]);
      if (isNaN(wager)) return reply(`Usage: .wc <amount>`);

      const res = await manager.createGame(sender, wager, chatId, notify);
      if (!res.success) return reply(`❌ ${res.message}`);

      reply(
        `🔗 *Word Chain Created*\n` +
        `💰 Bet: ₦${wager.toLocaleString()}\n` +
        `📜 Rule: Your word must start with the LAST letter of the previous word.\n\n` +
        `👉 Type *JOIN* to play!`,
        [sender]
      );
    }

    else if (command === 'wccancel') {
      if (!activeGame) return reply('No game to cancel.');
      if (activeGame.player1.id !== sender && activeGame.player2?.id !== sender) return reply('Not your game.');
      await manager.cancelGame(activeGame.gameId);
      reply('✅ Game cancelled.');
    }

    else if (command === 'wchelp') {
      reply(
        `🔗 *Word Chain Rules*\n\n` +
        `1. Start with a random letter.\n` +
        `2. Player 1 types a word (e.g., "APPLE").\n` +
        `3. Player 2 MUST type a word starting with 'E' (e.g., "EGG").\n` +
        `4. Player 1 MUST type a word starting with 'G'.\n` +
        `5. Time limit decreases every round.\n` +
        `6. No duplicate words allowed.\n\n` +
        `Commands: .wc <bet>, .wccancel`
      );
    }
  }
};