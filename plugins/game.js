// plugins/connect_four.js - Multiplayer Connect Four Game with Economy Integration
import chalk from 'chalk';
import { PluginHelpers, safeOperation } from '../lib/pluginIntegration.js';

// ===================================
// ===== CONSTANTS & CONFIGURATION =====
// ===================================

const GAMES_COLLECTION = 'connect4_games';
const STATS_COLLECTION = 'connect4_stats';

const GAME_CONFIG = {
  ROWS: 6,
  COLS: 7,
  JOIN_TIMEOUT: 60000, // 60 seconds
  TURN_TIMEOUT: 120000, // 2 minutes
  MIN_WAGER: 10,
  MAX_WAGER: 10000,
  WIN_MULTIPLIER: 1.9, // Winner gets 1.9x the wager (10% house fee)
};

const EMOJIS = {
  EMPTY: '⚪',
  PLAYER1: '🔴',
  PLAYER2: '🟡',
  WIN: '✨',
  NUMBERS: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣']
};

// ===================================
// ===== GAME LOGIC CLASS =====
// ===================================

class Connect4Game {
  constructor(gameId, player1Id, wager, chatId) {
    this.gameId = gameId;
    this.player1 = { id: player1Id, disc: EMOJIS.PLAYER1 };
    this.player2 = null;
    this.wager = wager;
    this.chatId = chatId;
    this.board = this.createBoard();
    this.currentTurn = 1; // 1 or 2
    this.status = 'waiting'; // waiting, active, finished
    this.winner = null;
    this.createdAt = new Date();
    this.joinTimeout = null;
    this.turnTimeout = null;
    this.lastMove = null;
    this.moveHistory = [];
  }

  createBoard() {
    return Array(GAME_CONFIG.ROWS).fill(null).map(() => 
      Array(GAME_CONFIG.COLS).fill(0)
    );
  }

  async join(player2Id) {
    if (this.status !== 'waiting') {
      return { success: false, message: 'Game already started or finished' };
    }

    if (this.player1.id === player2Id) {
      return { success: false, message: 'You cannot play against yourself!' };
    }

    this.player2 = { id: player2Id, disc: EMOJIS.PLAYER2 };
    this.status = 'active';
    this.lastMove = new Date();

    return { success: true };
  }

  makeMove(playerId, column) {
    // Validate game state
    if (this.status !== 'active') {
      return { success: false, message: 'Game is not active' };
    }

    // Validate player turn
    const currentPlayer = this.currentTurn === 1 ? this.player1 : this.player2;
    if (currentPlayer.id !== playerId) {
      return { success: false, message: 'Not your turn!' };
    }

    // Validate column
    if (column < 0 || column >= GAME_CONFIG.COLS) {
      return { success: false, message: 'Invalid column' };
    }

    // Find the lowest empty row in the column
    let row = -1;
    for (let r = GAME_CONFIG.ROWS - 1; r >= 0; r--) {
      if (this.board[r][column] === 0) {
        row = r;
        break;
      }
    }

    if (row === -1) {
      return { success: false, message: 'Column is full!' };
    }

    // Place the disc
    this.board[row][column] = this.currentTurn;
    this.moveHistory.push({ player: this.currentTurn, row, column, time: new Date() });
    this.lastMove = new Date();

    // Check for win
    if (this.checkWin(row, column)) {
      this.status = 'finished';
      this.winner = this.currentTurn;
      return { success: true, win: true, row, column };
    }

    // Check for draw
    if (this.isBoardFull()) {
      this.status = 'finished';
      this.winner = 0; // Draw
      return { success: true, draw: true, row, column };
    }

    // Switch turns
    this.currentTurn = this.currentTurn === 1 ? 2 : 1;

    return { success: true, row, column };
  }

  checkWin(row, col) {
    const player = this.board[row][col];

    // Check horizontal
    if (this.checkDirection(row, col, 0, 1, player)) return true;

    // Check vertical
    if (this.checkDirection(row, col, 1, 0, player)) return true;

    // Check diagonal (/)
    if (this.checkDirection(row, col, 1, 1, player)) return true;

    // Check diagonal (\)
    if (this.checkDirection(row, col, 1, -1, player)) return true;

    return false;
  }

  checkDirection(row, col, rowDir, colDir, player) {
    let count = 1; // Count the placed disc

    // Check in positive direction
    for (let i = 1; i < 4; i++) {
      const r = row + (rowDir * i);
      const c = col + (colDir * i);

      if (r < 0 || r >= GAME_CONFIG.ROWS || c < 0 || c >= GAME_CONFIG.COLS) break;
      if (this.board[r][c] !== player) break;

      count++;
    }

    // Check in negative direction
    for (let i = 1; i < 4; i++) {
      const r = row - (rowDir * i);
      const c = col - (colDir * i);

      if (r < 0 || r >= GAME_CONFIG.ROWS || c < 0 || c >= GAME_CONFIG.COLS) break;
      if (this.board[r][c] !== player) break;

      count++;
    }

    return count >= 4;
  }

  isBoardFull() {
    return this.board[0].every(cell => cell !== 0);
  }

  getBoardString() {
    let boardStr = '\n';

    // Column numbers
    boardStr += '  ' + EMOJIS.NUMBERS.join(' ') + '\n';

    // Board rows
    for (let row = 0; row < GAME_CONFIG.ROWS; row++) {
      boardStr += '  ';
      for (let col = 0; col < GAME_CONFIG.COLS; col++) {
        const cell = this.board[row][col];
        if (cell === 0) boardStr += EMOJIS.EMPTY;
        else if (cell === 1) boardStr += EMOJIS.PLAYER1;
        else boardStr += EMOJIS.PLAYER2;
        boardStr += ' ';
      }
      boardStr += '\n';
    }

    return boardStr;
  }

  getCurrentPlayerName(getName) {
    const currentPlayer = this.currentTurn === 1 ? this.player1 : this.player2;
    return getName(currentPlayer.id);
  }

  toJSON() {
    return {
      gameId: this.gameId,
      player1: this.player1,
      player2: this.player2,
      wager: this.wager,
      chatId: this.chatId,
      board: this.board,
      currentTurn: this.currentTurn,
      status: this.status,
      winner: this.winner,
      createdAt: this.createdAt,
      lastMove: this.lastMove,
      moveHistory: this.moveHistory
    };
  }

  static fromJSON(data) {
    const game = new Connect4Game(data.gameId, data.player1.id, data.wager, data.chatId);
    game.player2 = data.player2;
    game.board = data.board;
    game.currentTurn = data.currentTurn;
    game.status = data.status;
    game.winner = data.winner;
    game.createdAt = new Date(data.createdAt);
    game.lastMove = data.lastMove ? new Date(data.lastMove) : null;
    game.moveHistory = data.moveHistory || [];
    return game;
  }
}

// ===================================
// ===== GAME MANAGER CLASS =====
// ===================================

class Connect4Manager {
  constructor() {
    this.activeGames = new Map();
    this.timeouts = new Map();
  }

  // Helper methods to interact with economy plugin's database
  async getUserBalance(userId) {
    try {
      return await safeOperation(async (db, collection) => {
        let user = await collection.findOne({ userId });

        // Initialize user if doesn't exist
        if (!user) {
          console.log(chalk.yellow(`⚠️ User ${userId} not found in economy_users, initializing...`));
          user = {
            userId,
            balance: 0,
            bank: 0,
            frozen: false,
            inventory: [],
            activeEffects: {},
            stats: {
              totalEarned: 0,
              totalSpent: 0,
              workCount: 0,
              dailyStreak: 0
            },
            achievements: [],
            investments: {
              stocks: {},
              crypto: {},
              businesses: []
            },
            createdAt: new Date(),
            updatedAt: new Date()
          };
          await collection.insertOne(user);
        }

        console.log(chalk.cyan(`💰 User ${userId.split('@')[0]} balance: ₦${user.balance}`));
        return user || { balance: 0, bank: 0 };
      }, 'economy_users');
    } catch (error) {
      console.error(chalk.red('Error getting user balance:'), error.message);
      return { balance: 0, bank: 0 };
    }
  }

  async deductMoney(userId, amount, reason) {
    try {
      return await safeOperation(async (db, collection) => {
        const user = await collection.findOne({ userId });

        if (!user) {
          console.error(chalk.red(`❌ User ${userId} not found when trying to deduct money`));
          return { success: false, message: 'User not found in economy system' };
        }

        console.log(chalk.cyan(`💸 Attempting to deduct ₦${amount} from ${userId.split('@')[0]}`));
        console.log(chalk.cyan(`   Current balance: ₦${user.balance}`));

        if (user.balance < amount) {
          console.error(chalk.red(`❌ Insufficient balance: has ₦${user.balance}, needs ₦${amount}`));
          return { success: false, message: `Insufficient balance: you have ₦${user.balance}, need ₦${amount}` };
        }

        // Check if account is frozen
        if (user.frozen) {
          console.error(chalk.red(`❌ Account ${userId} is frozen`));
          return { success: false, message: 'Account is frozen' };
        }

        const newBalance = user.balance - amount;

        await collection.updateOne(
          { userId },
          { 
            $set: { 
              balance: newBalance,
              updatedAt: new Date() 
            } 
          }
        );

        // Log transaction
        const transactionsCollection = db.collection('economy_transactions');
        await transactionsCollection.insertOne({
          userId,
          type: 'debit',
          amount,
          reason,
          balanceBefore: user.balance,
          balanceAfter: newBalance,
          timestamp: new Date()
        });

        console.log(chalk.green(`✅ Deducted ₦${amount}. New balance: ₦${newBalance}`));
        return { success: true, newBalance };
      }, 'economy_users');
    } catch (error) {
      console.error(chalk.red('Error deducting money:'), error.message);
      return { success: false, message: 'Transaction failed: ' + error.message };
    }
  }

  async addMoney(userId, amount, reason) {
    try {
      return await safeOperation(async (db, collection) => {
        const user = await collection.findOne({ userId });

        if (!user) {
          return { success: false, message: 'User not found' };
        }

        const newBalance = user.balance + amount;

        await collection.updateOne(
          { userId },
          { 
            $set: { 
              balance: newBalance,
              updatedAt: new Date() 
            } 
          }
        );

        // Log transaction
        const transactionsCollection = db.collection('economy_transactions');
        await transactionsCollection.insertOne({
          userId,
          type: 'credit',
          amount,
          reason,
          balanceBefore: user.balance,
          balanceAfter: newBalance,
          timestamp: new Date()
        });

        return { success: true, newBalance };
      }, 'economy_users');
    } catch (error) {
      console.error(chalk.red('Error adding money:'), error.message);
      return { success: false, message: 'Transaction failed' };
    }
  }

  async initialize() {
    try {
      // Load active games from database
      const games = await safeOperation(async (db, collection) => {
        return await collection.find({ status: { $in: ['waiting', 'active'] } }).toArray();
      }, GAMES_COLLECTION);

      if (games && games.length > 0) {
        for (const gameData of games) {
          const game = Connect4Game.fromJSON(gameData);
          this.activeGames.set(game.gameId, game);

          // Cancel old games
          if (game.status === 'waiting') {
            const elapsed = Date.now() - new Date(game.createdAt).getTime();
            if (elapsed > GAME_CONFIG.JOIN_TIMEOUT) {
              await this.cancelGame(game.gameId, 'timeout');
            }
          }
        }
        console.log(chalk.green(`✅ Loaded ${this.activeGames.size} active Connect4 games`));
      }

      return true;
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize Connect4 manager:'), error.message);
      return false;
    }
  }

  generateGameId() {
    return `c4_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async createGame(player1Id, wager, chatId) {
    // Check if player already has an active game
    const existingGame = Array.from(this.activeGames.values()).find(g => 
      (g.player1.id === player1Id || (g.player2 && g.player2.id === player1Id)) && 
      g.status !== 'finished'
    );

    if (existingGame) {
      return { 
        success: false, 
        message: 'You already have an active game! Finish it first or use `.c4cancel` to cancel.' 
      };
    }

    // Validate wager
    if (wager < GAME_CONFIG.MIN_WAGER || wager > GAME_CONFIG.MAX_WAGER) {
      return { 
        success: false, 
        message: `Wager must be between ₦${GAME_CONFIG.MIN_WAGER} and ₦${GAME_CONFIG.MAX_WAGER}` 
      };
    }

    // Check balance using economy plugin's system
    const userData = await this.getUserBalance(player1Id);
    if (!userData || userData.balance < wager) {
      return { 
        success: false, 
        message: `Insufficient balance! You have ₦${userData ? userData.balance : 0}, need ₦${wager}` 
      };
    }

    // Deduct wager from player1 using economy plugin's system
    const deducted = await this.deductMoney(player1Id, wager, 'Connect4 game wager');
    if (!deducted.success) {
      return { success: false, message: deducted.message || 'Failed to deduct wager from your account' };
    }

    // Create game
    const gameId = this.generateGameId();
    const game = new Connect4Game(gameId, player1Id, wager, chatId);
    this.activeGames.set(gameId, game);

    // Save to database
    await this.saveGame(game);

    // Set join timeout
    const timeout = setTimeout(async () => {
      await this.cancelGame(gameId, 'timeout');
    }, GAME_CONFIG.JOIN_TIMEOUT);

    this.timeouts.set(gameId, timeout);

    // Update stats
    await this.updateStats(player1Id, 'gamesCreated');

    return { success: true, game };
  }

  async joinGame(gameId, player2Id) {
    const game = this.activeGames.get(gameId);

    if (!game) {
      return { success: false, message: 'Game not found!' };
    }

    // Check balance using economy plugin's system
    const userData = await this.getUserBalance(player2Id);
    if (!userData || userData.balance < game.wager) {
      return { 
        success: false, 
        message: `Insufficient balance! You need ₦${game.wager} to join` 
      };
    }

    // Attempt to join
    const joinResult = game.join(player2Id);
    if (!joinResult.success) {
      return joinResult;
    }

    // Deduct wager from player2 using economy plugin's system
    const deducted = await this.deductMoney(player2Id, game.wager, 'Connect4 game wager');
    if (!deducted.success) {
      game.player2 = null;
      game.status = 'waiting';
      return { success: false, message: deducted.message || 'Failed to deduct wager from your account' };
    }

    // Clear join timeout
    const timeout = this.timeouts.get(gameId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(gameId);
    }

    // Set turn timeout
    this.setTurnTimeout(gameId);

    // Save to database
    await this.saveGame(game);

    // Update stats
    await this.updateStats(player2Id, 'gamesJoined');

    return { success: true, game };
  }

  async makeMove(gameId, playerId, column) {
    const game = this.activeGames.get(gameId);

    if (!game) {
      return { success: false, message: 'Game not found!' };
    }

    // Make the move
    const result = game.makeMove(playerId, column);

    if (!result.success) {
      return result;
    }

    // Reset turn timeout if game is still active
    if (game.status === 'active') {
      this.setTurnTimeout(gameId);
    } else {
      // Game finished
      this.clearTimeouts(gameId);
    }

    // Save to database
    await this.saveGame(game);

    // Handle game end
    if (game.status === 'finished') {
      await this.handleGameEnd(game);
    }

    return { success: true, game, result };
  }

  async handleGameEnd(game) {
    if (game.winner === 0) {
      // Draw - refund both players
      await this.addMoney(game.player1.id, game.wager, 'Connect4 draw refund');
      await this.addMoney(game.player2.id, game.wager, 'Connect4 draw refund');

      await this.updateStats(game.player1.id, 'draws');
      await this.updateStats(game.player2.id, 'draws');
    } else {
      // Someone won
      const winnerId = game.winner === 1 ? game.player1.id : game.player2.id;
      const loserId = game.winner === 1 ? game.player2.id : game.player1.id;

      const winnings = Math.floor(game.wager * 2 * GAME_CONFIG.WIN_MULTIPLIER);
      await this.addMoney(winnerId, winnings, 'Connect4 win');

      await this.updateStats(winnerId, 'wins');
      await this.updateStats(winnerId, 'totalWinnings', winnings);
      await this.updateStats(loserId, 'losses');
    }

    // Update play count
    await this.updateStats(game.player1.id, 'gamesPlayed');
    await this.updateStats(game.player2.id, 'gamesPlayed');
  }

  async cancelGame(gameId, reason = 'manual') {
    const game = this.activeGames.get(gameId);

    if (!game) {
      return { success: false, message: 'Game not found!' };
    }

    if (game.status === 'finished') {
      return { success: false, message: 'Game already finished!' };
    }

    // Refund player1
    await this.addMoney(game.player1.id, game.wager, 'Connect4 cancelled - refund');

    // Refund player2 if they joined
    if (game.player2) {
      await this.addMoney(game.player2.id, game.wager, 'Connect4 cancelled - refund');
    }

    // Clear timeouts
    this.clearTimeouts(gameId);

    // Update status
    game.status = 'cancelled';
    await this.saveGame(game);

    // Remove from active games
    this.activeGames.delete(gameId);

    return { success: true, game, reason };
  }

  setTurnTimeout(gameId) {
    // Clear existing timeout
    const existing = this.timeouts.get(gameId);
    if (existing) clearTimeout(existing);

    // Set new timeout
    const timeout = setTimeout(async () => {
      const game = this.activeGames.get(gameId);
      if (game && game.status === 'active') {
        // Current player loses by timeout
        game.status = 'finished';
        game.winner = game.currentTurn === 1 ? 2 : 1;

        await this.handleGameEnd(game);
        await this.saveGame(game);

        console.log(chalk.yellow(`⏱️ Game ${gameId} ended by turn timeout`));
      }
    }, GAME_CONFIG.TURN_TIMEOUT);

    this.timeouts.set(gameId, timeout);
  }

  clearTimeouts(gameId) {
    const timeout = this.timeouts.get(gameId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(gameId);
    }
  }

  async saveGame(game) {
    try {
      await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { gameId: game.gameId },
          { $set: { ...game.toJSON(), updatedAt: new Date() } },
          { upsert: true }
        );
      }, GAMES_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error saving game:'), error.message);
    }
  }

  async updateStats(userId, field, value = 1) {
    try {
      await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { userId },
          { 
            $inc: { [field]: value },
            $set: { updatedAt: new Date() }
          },
          { upsert: true }
        );
      }, STATS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error updating stats:'), error.message);
    }
  }

  async getStats(userId) {
    try {
      return await safeOperation(async (db, collection) => {
        const stats = await collection.findOne({ userId });
        return stats || {
          userId,
          gamesPlayed: 0,
          gamesCreated: 0,
          gamesJoined: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          totalWinnings: 0
        };
      }, STATS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error getting stats:'), error.message);
      return null;
    }
  }

  async getLeaderboard(limit = 10) {
    try {
      return await safeOperation(async (db, collection) => {
        return await collection
          .find({ gamesPlayed: { $gt: 0 } })
          .sort({ wins: -1, totalWinnings: -1 })
          .limit(limit)
          .toArray();
      }, STATS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error getting leaderboard:'), error.message);
      return [];
    }
  }

  getActiveGamesForChat(chatId) {
    return Array.from(this.activeGames.values()).filter(g => g.chatId === chatId);
  }

  getPlayerGame(playerId) {
    return Array.from(this.activeGames.values()).find(g => 
      (g.player1.id === playerId || (g.player2 && g.player2.id === playerId)) && 
      g.status !== 'finished'
    );
  }
}

// Create singleton instance
const gameManager = new Connect4Manager();

// ===================================
// ===== HELPER FUNCTIONS =====
// ===================================

function getPlayerName(userId) {
  return '@' + userId.split('@')[0];
}

function formatGameInfo(game) {
  const p1Name = getPlayerName(game.player1.id);
  const p2Name = game.player2 ? getPlayerName(game.player2.id) : 'Waiting...';

  let info = `🎮 *Connect Four Game*\n\n`;
  info += `${EMOJIS.PLAYER1} Player 1: ${p1Name}\n`;
  info += `${EMOJIS.PLAYER2} Player 2: ${p2Name}\n`;
  info += `💰 Wager: ₦${game.wager}\n`;
  info += `🏆 Prize: ₦${Math.floor(game.wager * 2 * GAME_CONFIG.WIN_MULTIPLIER)}\n\n`;

  if (game.status === 'waiting') {
    info += `⏳ Waiting for opponent...\n`;
    info += `Type \`.c4join ${game.gameId}\` to join!\n`;
  } else if (game.status === 'active') {
    const currentPlayer = game.currentTurn === 1 ? game.player1 : game.player2;
    info += `🎯 Current turn: ${getPlayerName(currentPlayer.id)} ${currentPlayer.disc}\n\n`;
    info += game.getBoardString();
    info += `\nType \`.c4move <column>\" to play (1-7)`;
  }

  return info;
}

// ===================================
// ===== V3 PLUGIN EXPORT =====
// ===================================

export default {
  name: 'Connect Four',
  version: '1.0.0',
  author: 'Alex Macksyn',
  description: 'Multiplayer Connect Four game with economy integration',
  category: 'games',

  commands: ['c4', 'connect4', 'c4join', 'c4move', 'c4cancel', 'c4stats', 'c4help', 'c4board', 'c4leaderboard'],
  aliases: ['cfg'],

  // CRITICAL: This flag allows the plugin to execute on ALL messages (not just commands)
  executeOnAllMessages: true,

  async init(context) {
    const { logger } = context;
    await gameManager.initialize();
    logger.info('✅ Connect Four game plugin initialized');
    logger.info(`💰 Min wager: ₦${GAME_CONFIG.MIN_WAGER}, Max wager: ₦${GAME_CONFIG.MAX_WAGER}`);
    logger.info(`⏱️ Join timeout: ${GAME_CONFIG.JOIN_TIMEOUT/1000}s, Turn timeout: ${GAME_CONFIG.TURN_TIMEOUT/1000}s`);
  },

  async run(context) {
    const { msg: m, sock, config, logger, command, args, text } = context;

    try {
      const sender = m.sender;
      const chatId = m.from;
      const isGroup = m.isGroup;

      if (!sender) {
        logger.warn('⚠️ No sender found in message');
        return;
      }

      const reply = async (text) => {
        if (typeof m.reply === 'function') {
          await m.reply(text);
        } else {
          await sock.sendMessage(chatId, { text }, { quoted: m });
        }
      };

      // Get the raw message text (for non-prefix commands during active games)
      const rawText = (m.body || '').trim().toLowerCase();

      // Check if there's an active game in this chat
      const activeGamesInChat = gameManager.getActiveGamesForChat(chatId);
      const activeGame = activeGamesInChat.find(g => g.status === 'waiting' || g.status === 'active');

      // ===== HANDLE NON-PREFIX COMMANDS DURING ACTIVE SESSION =====

      // Handle "join" without prefix when game is waiting
      if (activeGame && activeGame.status === 'waiting' && rawText === 'join') {
        await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

        const result = await gameManager.joinGame(activeGame.gameId, sender);

        if (!result.success) {
          await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
          await reply(`❌ ${result.message}`);
          return;
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });

        const gameInfo = formatGameInfo(result.game);
        await reply(
          `✅ *Game Started!*\n\n` + 
          gameInfo +
          `\n\n${EMOJIS.PLAYER1} ${getPlayerName(result.game.player1.id)} goes first!` +
          `\n\n💡 _Type a number (1-7) to drop your disc in that column!_`
        );
        return;
      }

      // Handle numeric input (1-7) during active game without prefix
      if (activeGame && activeGame.status === 'active') {
        const playerGame = gameManager.getPlayerGame(sender);

        // Only process if sender is in this game
        if (playerGame && playerGame.gameId === activeGame.gameId) {
          // Check if message is just a number 1-7
          if (/^[1-7]$/.test(rawText)) {
            const column = parseInt(rawText) - 1; // Convert to 0-indexed

            await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

            const result = await gameManager.makeMove(activeGame.gameId, sender, column);

            if (!result.success) {
              await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
              await reply(`❌ ${result.message}`);
              return;
            }

            const moveResult = result.result;

            if (moveResult.win) {
              await sock.sendMessage(chatId, { react: { text: '🎉', key: m.key } });

              const winner = result.game.winner === 1 ? result.game.player1 : result.game.player2;
              const winnings = Math.floor(result.game.wager * 2 * GAME_CONFIG.WIN_MULTIPLIER);

              await reply(
                `${EMOJIS.WIN} *CONNECT FOUR!* ${EMOJIS.WIN}\n\n` +
                result.game.getBoardString() +
                `\n🏆 Winner: ${getPlayerName(winner.id)} ${winner.disc}\n` +
                `💰 Prize: ₦${winnings}\n\n` +
                `Congratulations! 🎊`
              );
            } else if (moveResult.draw) {
              await sock.sendMessage(chatId, { react: { text: '🤝', key: m.key } });

              await reply(
                `🤝 *DRAW!*\n\n` +
                result.game.getBoardString() +
                `\nThe board is full with no winner!\n` +
                `💰 Both players refunded: ₦${result.game.wager}`
              );
            } else {
              await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });

              const nextPlayer = result.game[`player${result.game.currentTurn}`];
              await reply(
                `✅ *Move Made!*\n\n` +
                result.game.getBoardString() +
                `\n🎯 Next turn: ${getPlayerName(nextPlayer.id)} ${nextPlayer.disc}\n\n` +
                `💡 _Type a number (1-7) to play_`
              );
            }
            return;
          }
        }
      }

      // ===== HANDLE NORMAL PREFIX COMMANDS =====
      // Only process prefix commands if command is defined
      if (!command) {
        return; // Not a command, ignore
      }

      // ===== COMMAND ROUTING =====

      // Create new game: .c4 <wager> or .cfg <wager>
      if (command === 'c4' || command === 'cfg' || command === 'connect4') {
        if (args.length === 0) {
          await reply(
            `🎮 *Connect Four Game*\n\n` +
            `Create a new game:\n` +
            `${config.PREFIX}c4 <wager>\n\n` +
            `Example: ${config.PREFIX}c4 100\n\n` +
            `Min wager: ₦${GAME_CONFIG.MIN_WAGER}\n` +
            `Max wager: ₦${GAME_CONFIG.MAX_WAGER}\n\n` +
            `Type ${config.PREFIX}c4help for all commands`
          );
          return;
        }

        const wager = parseInt(args[0]);
        if (isNaN(wager)) {
          await reply('❌ Invalid wager amount. Please provide a number.');
          return;
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

        const result = await gameManager.createGame(sender, wager, chatId);

        if (!result.success) {
          await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
          await reply(`❌ ${result.message}`);
          return;
        }

        await sock.sendMessage(chatId, { react: { text: '🎮', key: m.key } });

        const gameInfo = formatGameInfo(result.game);
        await reply(
          gameInfo + 
          `\n\n⏱️ Game will expire in ${GAME_CONFIG.JOIN_TIMEOUT/1000} seconds if no one joins.` +
          `\n\n*Game ID:* \`${result.game.gameId}\`` +
          `\n\n💡 _Anyone can type "join" (without prefix) to join this game!_`
        );
        return;
      }

      // Join a game: .c4join <gameId> (keeping this for backwards compatibility with gameId)
      if (command === 'c4join') {
        if (args.length === 0) {
          // Show available games in this chat
          const availableGames = gameManager.getActiveGamesForChat(chatId).filter(g => g.status === 'waiting');

          if (availableGames.length === 0) {
            await reply('❌ No games available to join in this chat!\n\nCreate one with `.c4 <wager>`');
            return;
          }

          let list = `🎮 *Available Games*\n\n`;
          availableGames.forEach((game, i) => {
            const creator = getPlayerName(game.player1.id);
            list += `${i + 1}. ${creator} - ₦${game.wager}\n`;
            list += `   ID: \`${game.gameId}\`\n\n`;
          });
          list += `Type \`.c4join <gameId>\` to join\n`;
          list += `💡 _Or just type "join" to join the active game!_`;

          await reply(list);
          return;
        }

        const gameId = args[0];

        await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

        const result = await gameManager.joinGame(gameId, sender);

        if (!result.success) {
          await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
          await reply(`❌ ${result.message}`);
          return;
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });

        const gameInfo = formatGameInfo(result.game);
        await reply(
          `✅ *Game Started!*\n\n` + 
          gameInfo +
          `\n\n${EMOJIS.PLAYER1} ${getPlayerName(result.game.player1.id)} goes first!` +
          `\n\n💡 _Just type a number (1-7) to drop your disc!_`
        );
        return;
      }

      // Make a move: .c4move <column> (keeping this for backwards compatibility)
      if (command === 'c4move') {
        if (args.length === 0) {
          await reply('❌ Please specify a column (1-7)\n\nExample: `.c4move 4`\n\n💡 _During an active game, you can also just type the number without prefix!_');
          return;
        }

        const game = gameManager.getPlayerGame(sender);

        if (!game) {
          await reply('❌ You are not in an active game!');
          return;
        }

        const column = parseInt(args[0]) - 1; // Convert to 0-indexed

        if (isNaN(column)) {
          await reply('❌ Invalid column. Please provide a number between 1 and 7.');
          return;
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

        const result = await gameManager.makeMove(game.gameId, sender, column);

        if (!result.success) {
          await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
          await reply(`❌ ${result.message}`);
          return;
        }

        const moveResult = result.result;

        if (moveResult.win) {
          await sock.sendMessage(chatId, { react: { text: '🎉', key: m.key } });

          const winner = result.game.winner === 1 ? result.game.player1 : result.game.player2;
          const winnings = Math.floor(result.game.wager * 2 * GAME_CONFIG.WIN_MULTIPLIER);

          await reply(
            `${EMOJIS.WIN} *CONNECT FOUR!* ${EMOJIS.WIN}\n\n` +
            result.game.getBoardString() +
            `\n🏆 Winner: ${getPlayerName(winner.id)} ${winner.disc}\n` +
            `💰 Prize: ₦${winnings}\n\n` +
            `Congratulations! 🎊`
          );
        } else if (moveResult.draw) {
          await sock.sendMessage(chatId, { react: { text: '🤝', key: m.key } });

          await reply(
            `🤝 *DRAW!*\n\n` +
            result.game.getBoardString() +
            `\nThe board is full with no winner!\n` +
            `💰 Both players refunded: ₦${result.game.wager}`
          );
        } else {
          await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } });

          const nextPlayer = result.game[`player${result.game.currentTurn}`];
          await reply(
            `✅ *Move Made!*\n\n` +
            result.game.getBoardString() +
            `\n🎯 Next turn: ${getPlayerName(nextPlayer.id)} ${nextPlayer.disc}\n\n` +
            `💡 _Type a number (1-7) to play_`
          );
        }
        return;
      }

      // Cancel game: .c4cancel
      if (command === 'c4cancel') {
        const game = gameManager.getPlayerGame(sender);

        if (!game) {
          await reply('❌ You are not in an active game!');
          return;
        }

        // Only allow cancel if waiting or if player created the game
        if (game.status === 'active' && game.player1.id !== sender) {
          await reply('❌ Only the game creator can cancel an active game!\n\nOr wait for turn timeout.');
          return;
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: m.key } });

        const result = await gameManager.cancelGame(game.gameId, 'manual');

        if (!result.success) {
          await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } });
          await reply(`❌ ${result.message}`);
          return;
        }

        await sock.sendMessage(chatId, { react: { text: '🚫', key: m.key } });

        await reply(
          `🚫 *Game Cancelled*\n\n` +
          `Game ID: \`${game.gameId}\`\n` +
          `💰 Wagers refunded to all players`
        );
        return;
      }

      // Show current game board: .c4board
      if (command === 'c4board') {
        const game = gameManager.getPlayerGame(sender);

        if (!game) {
          await reply('❌ You are not in an active game!');
          return;
        }

        const gameInfo = formatGameInfo(game);
        await reply(gameInfo);
        return;
      }

      // Show player stats: .c4stats [mention]
      if (command === 'c4stats') {
        let targetId = sender;

        // Check if someone was mentioned
        const mentionedJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentionedJids.length > 0) {
          targetId = mentionedJids[0];
        }

        const stats = await gameManager.getStats(targetId);

        if (!stats) {
          await reply('❌ Failed to fetch stats');
          return;
        }

        const winRate = stats.gamesPlayed > 0 
          ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1)
          : 0;

        await reply(
          `📊 *Connect Four Stats*\n` +
          `👤 Player: ${getPlayerName(targetId)}\n\n` +
          `🎮 Games Played: ${stats.gamesPlayed}\n` +
          `🏆 Wins: ${stats.wins}\n` +
          `💔 Losses: ${stats.losses}\n` +
          `🤝 Draws: ${stats.draws}\n` +
          `📈 Win Rate: ${winRate}%\n\n` +
          `💰 Total Winnings: ₦${stats.totalWinnings}\n` +
          `🎯 Games Created: ${stats.gamesCreated}\n` +
          `🤝 Games Joined: ${stats.gamesJoined}`
        );
        return;
      }

      // Show leaderboard: .c4leaderboard
      if (command === 'c4leaderboard') {
        const leaderboard = await gameManager.getLeaderboard(10);

        if (leaderboard.length === 0) {
          await reply('📊 *Leaderboard*\n\nNo games played yet!');
          return;
        }

        let leaderboardText = `🏆 *Connect Four Leaderboard*\n\n`;

        leaderboard.forEach((player, index) => {
          const rank = index + 1;
          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
          const winRate = player.gamesPlayed > 0 
            ? ((player.wins / player.gamesPlayed) * 100).toFixed(1)
            : 0;

          leaderboardText += `${medal} ${getPlayerName(player.userId)}\n`;
          leaderboardText += `   🏆 ${player.wins}W ${player.losses}L ${player.draws}D (${winRate}%)\n`;
          leaderboardText += `   💰 ₦${player.totalWinnings}\n\n`;
        });

        await reply(leaderboardText);
        return;
      }

      // Show help: .c4help
      if (command === 'c4help') {
        await reply(
          `🎮 *Connect Four - Help*\n\n` +
          `*How to Play:*\n` +
          `Drop colored discs into a 7-column, 6-row grid. The first player to get four discs in a row (horizontal, vertical, or diagonal) wins!\n\n` +
          `*Commands:*\n` +
          `• \`${config.PREFIX}c4 <wager>\` - Create a new game\n` +
          `• \`join\` - Join active game (no prefix!)\n` +
          `• \`1-7\` - Drop disc in column (no prefix!)\n` +
          `• \`${config.PREFIX}c4board\` - Show current board\n` +
          `• \`${config.PREFIX}c4cancel\` - Cancel your game\n` +
          `• \`${config.PREFIX}c4stats\` - View your stats\n` +
          `• \`${config.PREFIX}c4leaderboard\` - Top players\n\n` +
          `*Rules:*\n` +
          `• Wager: ₦${GAME_CONFIG.MIN_WAGER} - ₦${GAME_CONFIG.MAX_WAGER}\n` +
          `• Winner gets ${(GAME_CONFIG.WIN_MULTIPLIER * 100).toFixed(0)}% of pot\n` +
          `• ${((1 - GAME_CONFIG.WIN_MULTIPLIER) * 100).toFixed(0)}% house fee\n` +
          `• Join timeout: ${GAME_CONFIG.JOIN_TIMEOUT/1000}s\n` +
          `• Turn timeout: ${GAME_CONFIG.TURN_TIMEOUT/1000}s\n` +
          `• Draws refund both players\n\n` +
          `💡 *Pro Tip:* During an active game, just type "join" or numbers (1-7) without any prefix!\n\n` +
          `${EMOJIS.PLAYER1} = Player 1 | ${EMOJIS.PLAYER2} = Player 2`
        );
        return;
      }

    } catch (error) {
      logger.error(error, `❌ ${this.name} plugin error`);
      try {
        const reply = async (text) => {
          if (typeof m.reply === 'function') {
            await m.reply(text);
          } else {
            await sock.sendMessage(m.from, { text }, { quoted: m });
          }
        };
        await reply(`❌ *Plugin Error*\n\nAn unexpected error occurred. Please try again.\n\n_Error: ${error.message}_`);
      } catch (replyError) {
        logger.error(replyError, 'Failed to send error message');
      }
    }
  }
};