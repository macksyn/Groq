// plugins/connect4_game.js
import chalk from 'chalk';
import { PluginHelpers, safeOperation } from '../lib/pluginIntegration.js';

// ================================================================
// CONSTANTS & CONFIGURATION
// ================================================================

const SETTINGS_COLLECTION = 'connect4_settings';
const GAMES_COLLECTION = 'connect4_games';
const STATS_COLLECTION = 'connect4_stats';
const LEADERBOARD_COLLECTION = 'connect4_leaderboard';
const PENDING_GAMES_COLLECTION = 'connect4_pending_games';

const DEFAULT_SETTINGS = {
  enabled: true,
  allowBetting: true,
  minBet: 100,
  maxBet: 100000,
  defaultBet: 1000,
  allowGroups: true,
  allowPrivate: true,
  gameTimeout: 5 * 60 * 1000, // 5 minutes
  maxActiveGames: 50,
  allowAIOpponent: true,
  boardRows: 6,
  boardCols: 7,
  winCondition: 4,
  updatedAt: new Date(),
  updatedBy: 'system'
};

const GAME_EMOJIS = {
  EMPTY: '⚪',
  PLAYER1: '🔴',
  PLAYER2: '🟡',
  WINNING: '⭐',
  POINTER: '👇'
};

const AI_DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
};

// ================================================================
// CONNECT FOUR GAME ENGINE
// ================================================================

class Connect4Engine {
  constructor(rows = 6, cols = 7, winCondition = 4) {
    this.rows = rows;
    this.cols = cols;
    this.winCondition = winCondition;
    this.board = this.createEmptyBoard();
    this.currentPlayer = 1;
    this.lastMove = null;
    this.winningCells = [];
    this.moveHistory = [];
  }

  createEmptyBoard() {
    return Array(this.rows).fill(null).map(() => Array(this.cols).fill(0));
  }

  isValidMove(col) {
    if (col < 0 || col >= this.cols) return false;
    return this.board[0][col] === 0;
  }

  makeMove(col) {
    if (!this.isValidMove(col)) return false;

    for (let row = this.rows - 1; row >= 0; row--) {
      if (this.board[row][col] === 0) {
        this.board[row][col] = this.currentPlayer;
        this.lastMove = { row, col };
        this.moveHistory.push({ player: this.currentPlayer, row, col });
        return true;
      }
    }
    return false;
  }

  checkWin() {
    if (!this.lastMove) return false;

    const { row, col } = this.lastMove;
    const player = this.currentPlayer;

    // Check horizontal
    if (this.checkDirection(row, col, 0, 1, player)) return true;
    // Check vertical
    if (this.checkDirection(row, col, 1, 0, player)) return true;
    // Check diagonal (top-left to bottom-right)
    if (this.checkDirection(row, col, 1, 1, player)) return true;
    // Check diagonal (top-right to bottom-left)
    if (this.checkDirection(row, col, 1, -1, player)) return true;

    return false;
  }

  checkDirection(row, col, rowDir, colDir, player) {
    let count = 1;
    const cells = [{ row, col }];

    // Check forward direction
    for (let i = 1; i < this.winCondition; i++) {
      const newRow = row + i * rowDir;
      const newCol = col + i * colDir;
      if (this.isInBounds(newRow, newCol) && this.board[newRow][newCol] === player) {
        count++;
        cells.push({ row: newRow, col: newCol });
      } else {
        break;
      }
    }

    // Check backward direction
    for (let i = 1; i < this.winCondition; i++) {
      const newRow = row - i * rowDir;
      const newCol = col - i * colDir;
      if (this.isInBounds(newRow, newCol) && this.board[newRow][newCol] === player) {
        count++;
        cells.push({ row: newRow, col: newCol });
      } else {
        break;
      }
    }

    if (count >= this.winCondition) {
      this.winningCells = cells;
      return true;
    }

    return false;
  }

  isInBounds(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  isBoardFull() {
    return this.board[0].every(cell => cell !== 0);
  }

  switchPlayer() {
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
  }

  getAvailableColumns() {
    const available = [];
    for (let col = 0; col < this.cols; col++) {
      if (this.isValidMove(col)) {
        available.push(col);
      }
    }
    return available;
  }

  // AI Move Logic
  getAIMove(difficulty = 'medium') {
    const availableCols = this.getAvailableColumns();
    if (availableCols.length === 0) return null;

    switch (difficulty) {
      case 'easy':
        return this.getRandomMove(availableCols);
      case 'medium':
        return this.getMediumMove(availableCols);
      case 'hard':
        return this.getHardMove(availableCols);
      default:
        return this.getRandomMove(availableCols);
    }
  }

  getRandomMove(availableCols) {
    return availableCols[Math.floor(Math.random() * availableCols.length)];
  }

  getMediumMove(availableCols) {
    // Try to win
    const winMove = this.findWinningMove(this.currentPlayer, availableCols);
    if (winMove !== null) return winMove;

    // Block opponent's winning move
    const opponent = this.currentPlayer === 1 ? 2 : 1;
    const blockMove = this.findWinningMove(opponent, availableCols);
    if (blockMove !== null) return blockMove;

    // Random move
    return this.getRandomMove(availableCols);
  }

  getHardMove(availableCols) {
    // Try to win
    const winMove = this.findWinningMove(this.currentPlayer, availableCols);
    if (winMove !== null) return winMove;

    // Block opponent's winning move
    const opponent = this.currentPlayer === 1 ? 2 : 1;
    const blockMove = this.findWinningMove(opponent, availableCols);
    if (blockMove !== null) return blockMove;

    // Try center column (strategic)
    const centerCol = Math.floor(this.cols / 2);
    if (availableCols.includes(centerCol)) {
      return centerCol;
    }

    // Prefer columns near center
    const sortedCols = [...availableCols].sort((a, b) => {
      return Math.abs(a - centerCol) - Math.abs(b - centerCol);
    });

    return sortedCols[0];
  }

  findWinningMove(player, availableCols) {
    for (const col of availableCols) {
      // Simulate move
      const tempBoard = JSON.parse(JSON.stringify(this.board));
      const tempPlayer = this.currentPlayer;
      const tempLastMove = this.lastMove;

      this.currentPlayer = player;
      this.makeMove(col);

      const isWin = this.checkWin();

      // Restore state
      this.board = tempBoard;
      this.currentPlayer = tempPlayer;
      this.lastMove = tempLastMove;

      if (isWin) return col;
    }
    return null;
  }

  renderBoard(highlightWinning = false) {
    const winningSet = new Set(
      this.winningCells.map(cell => `${cell.row},${cell.col}`)
    );

    let board = '```\n';

    // Column numbers
    board += '  ';
    for (let col = 0; col < this.cols; col++) {
      board += ` ${col + 1} `;
    }
    board += '\n';

    // Board rows
    for (let row = 0; row < this.rows; row++) {
      board += '  ';
      for (let col = 0; col < this.cols; col++) {
        const cell = this.board[row][col];
        const isWinning = highlightWinning && winningSet.has(`${row},${col}`);

        let emoji;
        if (cell === 0) {
          emoji = GAME_EMOJIS.EMPTY;
        } else if (isWinning) {
          emoji = GAME_EMOJIS.WINNING;
        } else if (cell === 1) {
          emoji = GAME_EMOJIS.PLAYER1;
        } else {
          emoji = GAME_EMOJIS.PLAYER2;
        }

        board += emoji + ' ';
      }
      board += '\n';
    }

    board += '```';
    return board;
  }

  getGameState() {
    return {
      board: this.board,
      currentPlayer: this.currentPlayer,
      lastMove: this.lastMove,
      winningCells: this.winningCells,
      moveHistory: this.moveHistory
    };
  }

  loadGameState(state) {
    this.board = state.board;
    this.currentPlayer = state.currentPlayer;
    this.lastMove = state.lastMove;
    this.winningCells = state.winningCells || [];
    this.moveHistory = state.moveHistory || [];
  }
}

// ================================================================
// CONNECT FOUR MANAGER
// ================================================================

class Connect4Manager {
  constructor() {
    this.settings = null;
    this.activeGames = new Map();
    this.pendingGames = new Map(); // For games waiting for opponent
    this.statsCache = null;
    this.statsCacheTime = 0;
    this.statsCacheDuration = 5 * 60 * 1000; // 5 minutes
  }

  async initialize() {
    try {
      this.settings = await this.loadSettings();
      await this.loadActiveGames();
      console.log(chalk.green('✅ Connect Four settings loaded from database'));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Failed to load Connect Four settings:'), error.message);
      this.settings = { ...DEFAULT_SETTINGS };
      return false;
    }
  }

  async loadSettings() {
    try {
      return await safeOperation(async (db, collection) => {
        let settings = await collection.findOne({ _id: 'main_settings' });

        if (!settings) {
          settings = { _id: 'main_settings', ...DEFAULT_SETTINGS };
          await collection.insertOne(settings);
          console.log(chalk.cyan('📝 Created default Connect Four settings'));
        }

        return settings;
      }, SETTINGS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error loading settings:'), error.message);
      return { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(updates, updatedBy = 'system') {
    try {
      return await safeOperation(async (db, collection) => {
        const updateData = {
          ...updates,
          updatedAt: new Date(),
          updatedBy
        };

        await collection.updateOne(
          { _id: 'main_settings' },
          { $set: updateData },
          { upsert: true }
        );

        this.settings = await this.loadSettings();

        console.log(chalk.green('✅ Connect Four settings updated'));
      }, SETTINGS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error saving settings:'), error.message);
      throw error;
    }
  }

  async loadActiveGames() {
    try {
      const games = await safeOperation(async (db, collection) => {
        return await collection.find({ status: 'active' }).toArray();
      }, GAMES_COLLECTION);

      if (games && games.length > 0) {
        games.forEach(game => {
          this.activeGames.set(game.gameId, game);
        });
        console.log(chalk.cyan(`📥 Loaded ${games.length} active games`));
      }

      // Load pending games
      const pendingGames = await safeOperation(async (db, collection) => {
        return await collection.find({ status: 'pending' }).toArray();
      }, PENDING_GAMES_COLLECTION);

      if (pendingGames && pendingGames.length > 0) {
        pendingGames.forEach(game => {
          this.pendingGames.set(game.chatId, game);
        });
        console.log(chalk.cyan(`📥 Loaded ${pendingGames.length} pending games`));
      }
    } catch (error) {
      console.error(chalk.red('Error loading active games:'), error.message);
    }
  }

  getSettings() {
    return this.settings || { ...DEFAULT_SETTINGS };
  }

  isAdmin(userId) {
    const adminNumber = process.env.OWNER_NUMBER || process.env.ADMIN_NUMBERS;
    if (!adminNumber) return false;

    const userNumber = userId.split('@')[0];
    return adminNumber === userNumber || adminNumber.includes(userNumber);
  }

  async createPendingGame(hostId, chatId, isGroup, betAmount = 0) {
    const settings = this.getSettings();

    if (!settings.enabled) {
      return { error: '🚫 *Connect Four is currently disabled*' };
    }

    if (isGroup && !settings.allowGroups) {
      return { error: '⚠️ *Group games are currently disabled*' };
    }

    if (!isGroup && !settings.allowPrivate) {
      return { error: '⚠️ *Private games are currently disabled*' };
    }

    // Check if chat already has a pending game
    if (this.pendingGames.has(chatId)) {
      return { error: '⚠️ *There is already a pending game in this chat!*\n\nType "join" to join it or wait for it to start.' };
    }

    // Check if host already has active game
    const existingGame = this.findPlayerGame(hostId);
    if (existingGame) {
      return { error: '⚠️ *You already have an active game!*\n\nFinish or forfeit your current game first.' };
    }

    // Validate bet amount
    if (betAmount > 0) {
      if (!settings.allowBetting) {
        return { error: '🚫 *Betting is currently disabled*' };
      }

      if (betAmount < settings.minBet) {
        return { error: `⚠️ *Minimum bet is ₦${settings.minBet.toLocaleString()}*` };
      }

      if (betAmount > settings.maxBet) {
        return { error: `⚠️ *Maximum bet is ₦${settings.maxBet.toLocaleString()}*` };
      }

      // Check host balance
      const hostBalance = await PluginHelpers.getBalance(hostId);
      if (hostBalance.wallet < betAmount) {
        return { error: `💳 *Insufficient Balance!*\n\nRequired: ₦${betAmount.toLocaleString()}\nYour balance: ₦${hostBalance.wallet.toLocaleString()}` };
      }

      // Deduct host's bet immediately
      await PluginHelpers.removeMoney(hostId, betAmount, 'Connect Four bet (host)');
    }

    // Create pending game
    const pendingGame = {
      chatId,
      hostId,
      isGroup,
      betAmount,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes to join
    };

    this.pendingGames.set(chatId, pendingGame);

    // Save to database
    await this.savePendingGame(pendingGame);

    return { success: true, pendingGame };
  }

  async savePendingGame(game) {
    try {
      await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { chatId: game.chatId },
          { $set: game },
          { upsert: true }
        );
      }, PENDING_GAMES_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error saving pending game:'), error.message);
    }
  }

  async joinPendingGame(playerId, chatId) {
    const pendingGame = this.pendingGames.get(chatId);

    if (!pendingGame) {
      return { error: '❌ *No pending game found in this chat*' };
    }

    // Check if player is the host
    if (pendingGame.hostId === playerId) {
      return { error: '❌ *You cannot join your own game!*' };
    }

    // Check if player already has active game
    const existingGame = this.findPlayerGame(playerId);
    if (existingGame) {
      return { error: '⚠️ *You already have an active game!*\n\nFinish or forfeit your current game first.' };
    }

    // Check player balance and deduct bet
    if (pendingGame.betAmount > 0) {
      const playerBalance = await PluginHelpers.getBalance(playerId);
      if (playerBalance.wallet < pendingGame.betAmount) {
        return { error: `💳 *Insufficient Balance!*\n\nRequired: ₦${pendingGame.betAmount.toLocaleString()}\nYour balance: ₦${playerBalance.wallet.toLocaleString()}` };
      }

      // Deduct player's bet
      await PluginHelpers.removeMoney(playerId, pendingGame.betAmount, 'Connect Four bet (joined)');
    }

    // Create actual game
    const gameId = `${chatId}_${Date.now()}`;
    const settings = this.getSettings();
    const engine = new Connect4Engine(settings.boardRows, settings.boardCols, settings.winCondition);

    const game = {
      gameId,
      chatId: pendingGame.chatId,
      isGroup: pendingGame.isGroup,
      player1: { id: pendingGame.hostId, disc: GAME_EMOJIS.PLAYER1 },
      player2: { id: playerId, disc: GAME_EMOJIS.PLAYER2 },
      isAI: false,
      aiDifficulty: null,
      currentPlayer: 1,
      betAmount: pendingGame.betAmount,
      status: 'active',
      gameState: engine.getGameState(),
      createdAt: new Date(),
      lastMoveAt: new Date(),
      expiresAt: new Date(Date.now() + settings.gameTimeout)
    };

    this.activeGames.set(gameId, game);
    await this.saveGame(game);

    // Remove pending game
    this.pendingGames.delete(chatId);
    await this.removePendingGame(chatId);

    return { success: true, game, engine };
  }

  async removePendingGame(chatId) {
    try {
      await safeOperation(async (db, collection) => {
        await collection.deleteOne({ chatId });
      }, PENDING_GAMES_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error removing pending game:'), error.message);
    }
  }

  async cancelPendingGame(chatId, hostId) {
    const pendingGame = this.pendingGames.get(chatId);

    if (!pendingGame) {
      return { error: '❌ *No pending game found in this chat*' };
    }

    if (pendingGame.hostId !== hostId) {
      return { error: '❌ *Only the host can cancel the pending game*' };
    }

    // Refund host's bet
    if (pendingGame.betAmount > 0) {
      await PluginHelpers.addMoney(hostId, pendingGame.betAmount, 'Connect Four bet refund (cancelled)', false);
    }

    // Remove pending game
    this.pendingGames.delete(chatId);
    await this.removePendingGame(chatId);

    return { success: true };
  }

  async createGame(player1Id, player2Id, chatId, isGroup, betAmount = 0, isAI = false, aiDifficulty = 'medium') {
    const settings = this.getSettings();

    if (!settings.enabled) {
      return { error: '🚫 *Connect Four is currently disabled*' };
    }

    if (isGroup && !settings.allowGroups) {
      return { error: '⚠️ *Group games are currently disabled*' };
    }

    if (!isGroup && !settings.allowPrivate) {
      return { error: '⚠️ *Private games are currently disabled*' };
    }

    if (this.activeGames.size >= settings.maxActiveGames) {
      return { error: '🚫 *Maximum active games reached. Please wait for others to finish.*' };
    }

    // Check if players already have active games
    const existingGame = this.findPlayerGame(player1Id);
    if (existingGame) {
      return { error: '⚠️ *You already have an active game!*\n\nFinish or forfeit your current game first.' };
    }

    if (!isAI) {
      const opponentGame = this.findPlayerGame(player2Id);
      if (opponentGame) {
        return { error: '⚠️ *Your opponent already has an active game!*\n\nWait for them to finish.' };
      }
    }

    // Handle betting - Already deducted for pending games, only needed for AI
    if (isAI && betAmount > 0) {
      if (!settings.allowBetting) {
        return { error: '🚫 *Betting is currently disabled*' };
      }

      if (betAmount < settings.minBet) {
        return { error: `⚠️ *Minimum bet is ₦${settings.minBet.toLocaleString()}*` };
      }

      if (betAmount > settings.maxBet) {
        return { error: `⚠️ *Maximum bet is ₦${settings.maxBet.toLocaleString()}*` };
      }
    }

    // Create game
    const gameId = `${chatId}_${Date.now()}`;
    const engine = new Connect4Engine(settings.boardRows, settings.boardCols, settings.winCondition);

    const game = {
      gameId,
      chatId,
      isGroup,
      player1: { id: player1Id, disc: GAME_EMOJIS.PLAYER1 },
      player2: { id: player2Id, disc: GAME_EMOJIS.PLAYER2 },
      isAI,
      aiDifficulty: isAI ? aiDifficulty : null,
      currentPlayer: 1,
      betAmount,
      status: 'active',
      gameState: engine.getGameState(),
      createdAt: new Date(),
      lastMoveAt: new Date(),
      expiresAt: new Date(Date.now() + settings.gameTimeout)
    };

    this.activeGames.set(gameId, game);

    // Save to database
    await this.saveGame(game);

    return { success: true, game, engine };
  }

    if (isGroup && !settings.allowGroups) {
      return { error: '⚠️ *Group games are currently disabled*' };
    }

    if (!isGroup && !settings.allowPrivate) {
      return { error: '⚠️ *Private games are currently disabled*' };
    }

    if (this.activeGames.size >= settings.maxActiveGames) {
      return { error: '🚫 *Maximum active games reached. Please wait for others to finish.*' };
    }

    // Check if players already have active games
    const existingGame = this.findPlayerGame(player1Id);
    if (existingGame) {
      return { error: '⚠️ *You already have an active game!*\n\nFinish or forfeit your current game first.' };
    }

    if (!isAI) {
      const opponent Game = this.findPlayerGame(player2Id);
      if (opponentGame) {
        return { error: '⚠️ *Your opponent already has an active game!*\n\nWait for them to finish.' };
      }
    }

    // Handle betting
    if (betAmount > 0) {
      if (!settings.allowBetting) {
        return { error: '🚫 *Betting is currently disabled*' };
      }

      if (betAmount < settings.minBet) {
        return { error: `⚠️ *Minimum bet is ₦${settings.minBet.toLocaleString()}*` };
      }

      if (betAmount > settings.maxBet) {
        return { error: `⚠️ *Maximum bet is ₦${settings.maxBet.toLocaleString()}*` };
      }

      // Check player balances
      const player1Balance = await PluginHelpers.getBalance(player1Id);
      if (player1Balance.wallet < betAmount) {
        return { error: `💳 *Insufficient Balance!*\n\nRequired: ₦${betAmount.toLocaleString()}\nYour balance: ₦${player1Balance.wallet.toLocaleString()}` };
      }

      if (!isAI) {
        const player2Balance = await PluginHelpers.getBalance(player2Id);
        if (player2Balance.wallet < betAmount) {
          return { error: `💳 *Opponent has insufficient balance!*\n\nRequired: ₦${betAmount.toLocaleString()}\nTheir balance: ₦${player2Balance.wallet.toLocaleString()}` };
        }
      }

      // Deduct bets
      await PluginHelpers.removeMoney(player1Id, betAmount, 'Connect Four bet');
      if (!isAI) {
        await PluginHelpers.removeMoney(player2Id, betAmount, 'Connect Four bet');
      }
    }

    // Create game
    const gameId = `${chatId}_${Date.now()}`;
    const engine = new Connect4Engine(settings.boardRows, settings.boardCols, settings.winCondition);

    const game = {
      gameId,
      chatId,
      isGroup,
      player1: { id: player1Id, disc: GAME_EMOJIS.PLAYER1 },
      player2: { id: player2Id, disc: GAME_EMOJIS.PLAYER2 },
      isAI,
      aiDifficulty: isAI ? aiDifficulty : null,
      currentPlayer: 1,
      betAmount,
      status: 'active',
      gameState: engine.getGameState(),
      createdAt: new Date(),
      lastMoveAt: new Date(),
      expiresAt: new Date(Date.now() + settings.gameTimeout)
    };

    this.activeGames.set(gameId, game);

    // Save to database
    await this.saveGame(game);

    return { success: true, game, engine };
  }

  async saveGame(game) {
    try {
      await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { gameId: game.gameId },
          { $set: game },
          { upsert: true }
        );
      }, GAMES_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error saving game:'), error.message);
    }
  }

  findPlayerGame(playerId) {
    for (const game of this.activeGames.values()) {
      if (game.status === 'active' && (game.player1.id === playerId || game.player2.id === playerId)) {
        return game;
      }
    }
    return null;
  }

  getPlayerGame(playerId) {
    const game = this.findPlayerGame(playerId);
    if (!game) return null;

    const engine = new Connect4Engine(
      this.settings.boardRows,
      this.settings.boardCols,
      this.settings.winCondition
    );
    engine.loadGameState(game.gameState);

    return { game, engine };
  }

  async makeMove(playerId, column) {
    const gameData = this.getPlayerGame(playerId);
    if (!gameData) {
      return { error: '❌ *You don\'t have an active game*' };
    }

    const { game, engine } = gameData;

    // Check if it's player's turn
    const isPlayer1 = game.player1.id === playerId;
    const playerNumber = isPlayer1 ? 1 : 2;

    if (engine.currentPlayer !== playerNumber) {
      return { error: '⚠️ *Not your turn!*' };
    }

    // Validate and make move
    const col = parseInt(column) - 1; // Convert to 0-indexed

    if (!engine.isValidMove(col)) {
      return { error: '❌ *Invalid move!* Column is full or out of range.' };
    }

    engine.makeMove(col);

    // Check for win or draw
    const hasWon = engine.checkWin();
    const isDraw = engine.isBoardFull();

    if (hasWon || isDraw) {
      return await this.endGame(game, engine, hasWon ? playerNumber : 0);
    }

    // Switch player and update game
    engine.switchPlayer();
    game.gameState = engine.getGameState();
    game.currentPlayer = engine.currentPlayer;
    game.lastMoveAt = new Date();
    game.expiresAt = new Date(Date.now() + this.settings.gameTimeout);

    await this.saveGame(game);

    // Handle AI move if applicable
    if (game.isAI && engine.currentPlayer === 2) {
      return await this.makeAIMove(game, engine);
    }

    return { success: true, game, engine };
  }

  async makeAIMove(game, engine) {
    // Small delay for realism
    await new Promise(resolve => setTimeout(resolve, 1000));

    const aiColumn = engine.getAIMove(game.aiDifficulty);
    if (aiColumn === null) {
      return { error: '❌ *AI move error*' };
    }

    engine.makeMove(aiColumn);

    // Check for win or draw
    const hasWon = engine.checkWin();
    const isDraw = engine.isBoardFull();

    if (hasWon || isDraw) {
      return await this.endGame(game, engine, hasWon ? 2 : 0);
    }

    // Switch back to player
    engine.switchPlayer();
    game.gameState = engine.getGameState();
    game.currentPlayer = engine.currentPlayer;
    game.lastMoveAt = new Date();

    await this.saveGame(game);

    return { success: true, game, engine, aiMove: aiColumn + 1 };
  }

  async endGame(game, engine, winner) {
    game.status = 'completed';
    game.winner = winner;
    game.gameState = engine.getGameState();
    game.completedAt = new Date();

    // Handle payouts
    if (game.betAmount > 0 && winner !== 0) {
      const winnerId = winner === 1 ? game.player1.id : game.player2.id;
      const payout = game.isAI ? game.betAmount * 2 : game.betAmount * 2;

      await PluginHelpers.addMoney(winnerId, payout, 'Connect Four win', false);
    } else if (winner === 0 && game.betAmount > 0) {
      // Draw - refund both players
      await PluginHelpers.addMoney(game.player1.id, game.betAmount, 'Connect Four draw refund', false);
      if (!game.isAI) {
        await PluginHelpers.addMoney(game.player2.id, game.betAmount, 'Connect Four draw refund', false);
      }
    }

    // Update stats
    await this.updateStats(game, winner);

    // Save final game state
    await this.saveGame(game);

    // Remove from active games
    this.activeGames.delete(game.gameId);

    return { success: true, game, engine, winner };
  }

  async forfeitGame(playerId) {
    const gameData = this.getPlayerGame(playerId);
    if (!gameData) {
      return { error: '❌ *You don\'t have an active game to forfeit*' };
    }

    const { game, engine } = gameData;
    const isPlayer1 = game.player1.id === playerId;
    const winner = isPlayer1 ? 2 : 1;

    return await this.endGame(game, engine, winner);
  }

  async updateStats(game, winner) {
    try {
      await safeOperation(async (db, collection) => {
        // Global stats
        await collection.updateOne(
          { _id: 'global' },
          {
            $inc: {
              totalGames: 1,
              gamesWithBets: game.betAmount > 0 ? 1 : 0,
              totalBetAmount: game.betAmount * (game.isAI ? 1 : 2),
              [winner === 0 ? 'draws' : 'wins']: 1
            },
            $set: { lastGame: new Date() }
          },
          { upsert: true }
        );

        // Player stats
        const updatePlayerStats = async (playerId, won, lost, draw) => {
          await collection.updateOne(
            { _id: playerId },
            {
              $inc: {
                gamesPlayed: 1,
                wins: won ? 1 : 0,
                losses: lost ? 1 : 0,
                draws: draw ? 1 : 0,
                totalWagered: game.betAmount,
                totalWinnings: won && game.betAmount > 0 ? game.betAmount * 2 : 0
              },
              $set: { lastPlayed: new Date() }
            },
            { upsert: true }
          );

          // Update leaderboard
          if (won) {
            await db.collection(LEADERBOARD_COLLECTION).updateOne(
              { userId: playerId },
              {
                $inc: { wins: 1, score: 10 },
                $set: { lastWin: new Date() }
              },
              { upsert: true }
            );
          }
        };

        await updatePlayerStats(game.player1.id, winner === 1, winner === 2, winner === 0);
        if (!game.isAI) {
          await updatePlayerStats(game.player2.id, winner === 2, winner === 1, winner === 0);
        }
      }, STATS_COLLECTION);

      // Clear stats cache
      this.statsCache = null;
    } catch (error) {
      console.error(chalk.red('Error updating stats:'), error.message);
    }
  }

  async getStats() {
    const now = Date.now();

    if (this.statsCache && (now - this.statsCacheTime < this.statsCacheDuration)) {
      return this.statsCache;
    }

    try {
      const stats = await safeOperation(async (db, collection) => {
        const global = await collection.findOne({ _id: 'global' }) || {
          totalGames: 0,
          gamesWithBets: 0,
          totalBetAmount: 0,
          wins: 0,
          draws: 0
        };

        return global;
      }, STATS_COLLECTION);

      const result = {
        ...stats,
        activeGames: this.activeGames.size,
        settings: this.getSettings(),
        lastUpdated: new Date()
      };

      this.statsCache = result;
      this.statsCacheTime = now;

      return result;
    } catch (error) {
      console.error(chalk.red('Error getting stats:'), error.message);
      return {
        totalGames: 0,
        activeGames: this.activeGames.size,
        error: error.message
      };
    }
  }

  async getLeaderboard(limit = 10) {
    try {
      return await safeOperation(async (db, collection) => {
        return await collection
          .find({})
          .sort({ wins: -1, score: -1 })
          .limit(limit)
          .toArray();
      }, LEADERBOARD_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error getting leaderboard:'), error.message);
      return [];
    }
  }

  async getUserStats(userId) {
    try {
      return await safeOperation(async (db, collection) => {
        return await collection.findOne({ _id: userId }) || {
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          totalWagered: 0,
          totalWinnings: 0
        };
      }, STATS_COLLECTION);
    } catch (error) {
      console.error(chalk.red('Error getting user stats:'), error.message);
      return null;
    }
  }

  async cleanupExpiredGames() {
    const now = Date.now();
    const expiredGames = [];
    const expiredPending = [];

    // Cleanup active games
    for (const [gameId, game] of this.activeGames.entries()) {
      if (game.expiresAt && new Date(game.expiresAt).getTime() < now) {
        expiredGames.push(gameId);
      }
    }

    for (const gameId of expiredGames) {
      const game = this.activeGames.get(gameId);

      // Refund bets if game timed out
      if (game.betAmount > 0) {
        await PluginHelpers.addMoney(game.player1.id, game.betAmount, 'Connect Four timeout refund', false);
        if (!game.isAI) {
          await PluginHelpers.addMoney(game.player2.id, game.betAmount, 'Connect Four timeout refund', false);
        }
      }

      game.status = 'expired';
      await this.saveGame(game);
      this.activeGames.delete(gameId);

      console.log(chalk.yellow(`⏰ Game ${gameId} expired and cleaned up`));
    }

    // Cleanup pending games
    for (const [chatId, pendingGame] of this.pendingGames.entries()) {
      if (pendingGame.expiresAt && new Date(pendingGame.expiresAt).getTime() < now) {
        expiredPending.push(chatId);
      }
    }

    for (const chatId of expiredPending) {
      const pendingGame = this.pendingGames.get(chatId);

      // Refund host's bet
      if (pendingGame.betAmount > 0) {
        await PluginHelpers.addMoney(pendingGame.hostId, pendingGame.betAmount, 'Connect Four bet refund (expired)', false);
      }

      this.pendingGames.delete(chatId);
      await this.removePendingGame(chatId);

      console.log(chalk.yellow(`⏰ Pending game in ${chatId} expired and cleaned up`));
    }

    return expiredGames.length + expiredPending.length;
  }
}

// ================================================================
// CREATE MANAGER INSTANCE
// ================================================================

const gameManager = new Connect4Manager();

// Cleanup expired games every minute
setInterval(async () => {
  const cleaned = await gameManager.cleanupExpiredGames();
  if (cleaned > 0) {
    console.log(chalk.cyan(`🧹 Cleaned up ${cleaned} expired Connect Four games`));
  }
}, 60 * 1000);

// ================================================================
// COMMAND HANDLERS
// ================================================================

async function handleCfgSettings(reply, sender, args, config) {
  const settings = gameManager.getSettings();

  if (args.length === 0) {
    await reply(
      `*⚙️ Connect Four Settings*\n\n` +
      `*Game Status:* ${settings.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `*Betting:* ${settings.allowBetting ? '✅ Enabled' : '❌ Disabled'}\n` +
      `*Min Bet:* ₦${settings.minBet.toLocaleString()}\n` +
      `*Max Bet:* ₦${settings.maxBet.toLocaleString()}\n` +
      `*Default Bet:* ₦${settings.defaultBet.toLocaleString()}\n\n` +
      `*Board Size:* ${settings.boardRows}x${settings.boardCols}\n` +
      `*Win Condition:* ${settings.winCondition} in a row\n` +
      `*Game Timeout:* ${settings.gameTimeout / 60000} minutes\n` +
      `*Max Active Games:* ${settings.maxActiveGames}\n\n` +
      `*Allow Groups:* ${settings.allowGroups ? '✅' : '❌'}\n` +
      `*Allow Private:* ${settings.allowPrivate ? '✅' : '❌'}\n` +
      `*AI Opponent:* ${settings.allowAIOpponent ? '✅' : '❌'}\n\n` +
      `*Last Updated:* ${new Date(settings.updatedAt).toLocaleString()}\n` +
      `*Updated By:* ${settings.updatedBy}\n\n` +
      `*Commands:*\n` +
      `${config.PREFIX}cfgsettings enable/disable\n` +
      `${config.PREFIX}cfgsettings betting on/off\n` +
      `${config.PREFIX}cfgsettings minbet <amount>\n` +
      `${config.PREFIX}cfgsettings maxbet <amount>\n` +
      `${config.PREFIX}cfgsettings timeout <minutes>\n` +
      `${config.PREFIX}cfgsettings groups on/off\n` +
      `${config.PREFIX}cfgsettings private on/off\n` +
      `${config.PREFIX}cfgsettings ai on/off`
    );
    return;
  }

  const action = args[0].toLowerCase();
  const value = args[1];
  const updates = {};

  try {
    switch (action) {
      case 'enable':
        updates.enabled = true;
        await gameManager.saveSettings(updates, sender);
        await reply('✅ Connect Four game enabled');
        break;

      case 'disable':
        updates.enabled = false;
        await gameManager.saveSettings(updates, sender);
        await reply('❌ Connect Four game disabled');
        break;

      case 'betting':
        if (value === 'on' || value === 'off') {
          updates.allowBetting = value === 'on';
          await gameManager.saveSettings(updates, sender);
          await reply(`✅ Betting ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: cfgsettings betting on/off');
        }
        break;

      case 'minbet':
        const minBet = parseInt(value);
        if (!isNaN(minBet) && minBet >= 0) {
          updates.minBet = minBet;
          await gameManager.saveSettings(updates, sender);
          await reply(`✅ Minimum bet set to ₦${minBet.toLocaleString()}`);
        } else {
          await reply('❌ Invalid amount. Usage: cfgsettings minbet <number>');
        }
        break;

      case 'maxbet':
        const maxBet = parseInt(value);
        if (!isNaN(maxBet) && maxBet > 0) {
          updates.maxBet = maxBet;
          await gameManager.saveSettings(updates, sender);
          await reply(`✅ Maximum bet set to ₦${maxBet.toLocaleString()}`);
        } else {
          await reply('❌ Invalid amount. Usage: cfgsettings maxbet <number>');
        }
        break;

      case 'timeout':
        const timeout = parseInt(value);
        if (!isNaN(timeout) && timeout > 0) {
          updates.gameTimeout = timeout * 60 * 1000;
          await gameManager.saveSettings(updates, sender);
          await reply(`✅ Game timeout set to ${timeout} minutes`);
        } else {
          await reply('❌ Invalid timeout. Usage: cfgsettings timeout <minutes>');
        }
        break;

      case 'groups':
        if (value === 'on' || value === 'off') {
          updates.allowGroups = value === 'on';
          await gameManager.saveSettings(updates, sender);
          await reply(`✅ Group games ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: cfgsettings groups on/off');
        }
        break;

      case 'private':
        if (value === 'on' || value === 'off') {
          updates.allowPrivate = value === 'on';
          await gameManager.saveSettings(updates, sender);
          await reply(`✅ Private games ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: cfgsettings private on/off');
        }
        break;

      case 'ai':
        if (value === 'on' || value === 'off') {
          updates.allowAIOpponent = value === 'on';
          await gameManager.saveSettings(updates, sender);
          await reply(`✅ AI opponent ${value === 'on' ? 'enabled' : 'disabled'}`);
        } else {
          await reply('❌ Usage: cfgsettings ai on/off');
        }
        break;

      default:
        await reply(`❌ Unknown setting: ${action}\n\nUse ${config.PREFIX}cfgsettings to see available commands`);
    }
  } catch (error) {
    console.error(chalk.red('Error updating setting:'), error.message);
    await reply(`❌ Error updating setting: ${error.message}`);
  }
}

async function handleCfgStart(reply, sender, m, chatId, isGroup, args, config, sock) {
  const settings = gameManager.getSettings();

  if (!settings.enabled) {
    await reply('🚫 *Connect Four is currently disabled*');
    return;
  }

  // Parse bet amount from args
  let betAmount = 0;

  if (args[0]) {
    // Check for AI opponent
    if (args[0].toLowerCase() === 'ai' || args[0].toLowerCase() === 'bot') {
      // Handle AI game (original logic)
      if (!settings.allowAIOpponent) {
        await reply('🚫 *AI opponent is currently disabled*');
        return;
      }

      const opponent = 'AI_OPPONENT';
      let aiDifficulty = 'medium';

      // Check for difficulty
      if (args[1] && ['easy', 'medium', 'hard'].includes(args[1].toLowerCase())) {
        aiDifficulty = args[1].toLowerCase();
        // Bet amount would be in args[2]
        if (args[2]) {
          betAmount = parseInt(args[2]);
        }
      } else if (args[1]) {
        betAmount = parseInt(args[1]);
      }

      // Check player balance
      if (betAmount > 0) {
        const playerBalance = await PluginHelpers.getBalance(sender);
        if (playerBalance.wallet < betAmount) {
          await reply(`💳 *Insufficient Balance!*\n\nRequired: ₦${betAmount.toLocaleString()}\nYour balance: ₦${playerBalance.wallet.toLocaleString()}`);
          return;
        }

        // Deduct bet
        await PluginHelpers.removeMoney(sender, betAmount, 'Connect Four bet (AI game)');
      }

      // Create AI game immediately
      const isAI = true;
      const opponent = 'AI_OPPONENT';

      const result = await gameManager.createGame(
        sender,
        opponent,
        chatId,
        isGroup,
        betAmount,
        isAI,
        aiDifficulty
      );

      if (result.error) {
        // Refund if game creation failed
        if (betAmount > 0) {
          await PluginHelpers.addMoney(sender, betAmount, 'Connect Four bet refund (failed)', false);
        }
        await reply(result.error);
        return;
      }

      const { game, engine } = result;

      let gameText = `🎮 *CONNECT FOUR STARTED!* 🎮\n\n`;
      gameText += `${GAME_EMOJIS.PLAYER1} *Player 1:* @${game.player1.id.split('@')[0]}\n`;
      gameText += `${GAME_EMOJIS.PLAYER2} *Player 2:* AI (${aiDifficulty})\n\n`;

      if (betAmount > 0) {
        gameText += `💰 *Bet:* ₦${betAmount.toLocaleString()}\n`;
        gameText += `🏆 *Prize:* ₦${(betAmount * 2).toLocaleString()}\n\n`;
      }

      gameText += `${engine.renderBoard()}\n\n`;
      gameText += `👇 *@${game.player1.id.split('@')[0]}'s turn* (${GAME_EMOJIS.PLAYER1})\n\n`;
      gameText += `*Make a move:* Just type a number (1-7)\n`;
      gameText += `*Forfeit:* ${config.PREFIX}cfgforfeit`;

      await sock.sendMessage(chatId, {
        text: gameText,
        mentions: [game.player1.id]
      }, { quoted: m });
      return;
    }

    // Parse as bet amount
    betAmount = parseInt(args[0]);
    if (isNaN(betAmount) || betAmount < 0) {
      betAmount = 0;
    }
  }

  // Create pending game for other players to join
  const result = await gameManager.createPendingGame(sender, chatId, isGroup, betAmount);

  if (result.error) {
    await reply(result.error);
    return;
  }

  const { pendingGame } = result;

  let pendingText = `🎮 *CONNECT FOUR - WAITING FOR OPPONENT* 🎮\n\n`;
  pendingText += `👤 *Host:* @${sender.split('@')[0]}\n`;

  if (betAmount > 0) {
    pendingText += `💰 *Wager:* ₦${betAmount.toLocaleString()} per player\n`;
    pendingText += `🏆 *Prize Pool:* ₦${(betAmount * 2).toLocaleString()}\n\n`;
  } else {
    pendingText += `💰 *Wager:* Free game (no bet)\n\n`;
  }

  pendingText += `⏰ *Expires in:* 5 minutes\n\n`;
  pendingText += `👥 *To join this game, type:* join\n`;
  pendingText += `❌ *To cancel:* ${config.PREFIX}cfgcancel`;

  await sock.sendMessage(chatId, {
    text: pendingText,
    mentions: [sender]
  }, { quoted: m });
}

async function handleCfgMove(reply, sender, args, config, sock, m) {
  if (!args[0] || isNaN(parseInt(args[0]))) {
    await reply(`❌ *Invalid move!*\n\nJust type a number between 1 and 7`);
    return;
  }

  const column = parseInt(args[0]);

  if (column < 1 || column > 7) {
    await reply('❌ *Column must be between 1 and 7!*');
    return;
  }

  const result = await gameManager.makeMove(sender, column);

  if (result.error) {
    await reply(result.error);
    return;
  }

  const { game, engine, winner, aiMove } = result;

  // Game ended
  if (winner !== undefined) {
    let endText = `🎮 *GAME OVER!* 🎮\n\n`;
    endText += `${engine.renderBoard(true)}\n\n`;

    if (winner === 0) {
      endText += `🤝 *It's a DRAW!*\n\n`;
      if (game.betAmount > 0) {
        endText += `💰 *Bets refunded:* ₦${game.betAmount.toLocaleString()} each`;
      }
    } else {
      const winnerId = winner === 1 ? game.player1.id : game.player2.id;
      const winnerDisc = winner === 1 ? GAME_EMOJIS.PLAYER1 : GAME_EMOJIS.PLAYER2;

      endText += `🏆 *WINNER:* @${winnerId.split('@')[0]} ${winnerDisc}\n\n`;

      if (game.betAmount > 0) {
        const payout = game.betAmount * 2;
        endText += `💰 *Prize won:* ₦${payout.toLocaleString()}`;
      }
    }

    const mentions = [game.player1.id];
    if (!game.isAI) mentions.push(game.player2.id);

    await sock.sendMessage(game.chatId, {
      text: endText,
      mentions: mentions
    }, { quoted: m });
    return;
  }

  // Game continues
  let moveText = '';

  if (aiMove) {
    moveText = `🤖 *AI moved in column ${aiMove}*\n\n`;
  }

  moveText += `${engine.renderBoard()}\n\n`;

  const currentPlayerId = game.currentPlayer === 1 ? game.player1.id : game.player2.id;
  const currentDisc = game.currentPlayer === 1 ? GAME_EMOJIS.PLAYER1 : GAME_EMOJIS.PLAYER2;

  if (game.isAI && game.currentPlayer === 2) {
    moveText += `🤖 *AI is thinking...*`;
  } else {
    moveText += `👇 *@${currentPlayerId.split('@')[0]}'s turn* ${currentDisc}\n\n`;
    moveText += `*Make a move:* Type a number (1-7)`;
  }

  const mentions = [game.player1.id];
  if (!game.isAI) mentions.push(game.player2.id);

  await sock.sendMessage(game.chatId, {
    text: moveText,
    mentions: mentions
  }, { quoted: m });
}

async function handleCfgStatus(reply, sender, sock, m) {
  const gameData = gameManager.getPlayerGame(sender);

  if (!gameData) {
    await reply('❌ *You don\'t have an active game*');
    return;
  }

  const { game, engine } = gameData;

  let statusText = `🎮 *GAME STATUS* 🎮\n\n`;
  statusText += `${GAME_EMOJIS.PLAYER1} *Player 1:* @${game.player1.id.split('@')[0]}\n`;

  if (game.isAI) {
    statusText += `${GAME_EMOJIS.PLAYER2} *Player 2:* AI (${game.aiDifficulty})\n\n`;
  } else {
    statusText += `${GAME_EMOJIS.PLAYER2} *Player 2:* @${game.player2.id.split('@')[0]}\n\n`;
  }

  if (game.betAmount > 0) {
    statusText += `💰 *Bet:* ₦${game.betAmount.toLocaleString()} each\n`;
    statusText += `🏆 *Prize:* ₦${(game.betAmount * 2).toLocaleString()}\n\n`;
  }

  statusText += `${engine.renderBoard()}\n\n`;

  const currentPlayerId = game.currentPlayer === 1 ? game.player1.id : game.player2.id;
  const currentDisc = game.currentPlayer === 1 ? GAME_EMOJIS.PLAYER1 : GAME_EMOJIS.PLAYER2;

  statusText += `👇 *Current turn:* @${currentPlayerId.split('@')[0]} ${currentDisc}\n\n`;
  statusText += `*Moves made:* ${engine.moveHistory.length}\n`;
  statusText += `*Time remaining:* ${Math.ceil((new Date(game.expiresAt) - Date.now()) / 60000)} minutes`;

  const mentions = [game.player1.id];
  if (!game.isAI) mentions.push(game.player2.id);

  await sock.sendMessage(game.chatId, {
    text: statusText,
    mentions: mentions
  }, { quoted: m });
}

async function handleCfgForfeit(reply, sender, sock, m) {
  const result = await gameManager.forfeitGame(sender);

  if (result.error) {
    await reply(result.error);
    return;
  }

  const { game, winner } = result;
  const winnerId = winner === 1 ? game.player1.id : game.player2.id;
  const loserId = winner === 1 ? game.player2.id : game.player1.id;

  let forfeitText = `🏳️ *GAME FORFEITED!* 🏳️\n\n`;
  forfeitText += `❌ *@${loserId.split('@')[0]}* forfeited the game\n`;
  forfeitText += `🏆 *@${winnerId.split('@')[0]}* wins by forfeit!\n\n`;

  if (game.betAmount > 0) {
    forfeitText += `💰 *Prize:* ₦${(game.betAmount * 2).toLocaleString()}`;
  }

  const mentions = [game.player1.id];
  if (!game.isAI) mentions.push(game.player2.id);

  await sock.sendMessage(game.chatId, {
    text: forfeitText,
    mentions: mentions
  }, { quoted: m });
}

async function handleCfgStats(reply, sender) {
  const stats = await gameManager.getStats();
  const userStats = await gameManager.getUserStats(sender);

  let statsText = `*📊 Connect Four Statistics*\n\n`;

  // Global stats
  statsText += `*Global Stats:*\n`;
  statsText += `• Total Games: ${stats.totalGames || 0}\n`;
  statsText += `• Games with Bets: ${stats.gamesWithBets || 0}\n`;
  statsText += `• Total Wagered: ₦${(stats.totalBetAmount || 0).toLocaleString()}\n`;
  statsText += `• Total Wins: ${stats.wins || 0}\n`;
  statsText += `• Total Draws: ${stats.draws || 0}\n`;
  statsText += `• Active Games: ${stats.activeGames}\n\n`;

  // User stats
  if (userStats) {
    const winRate = userStats.gamesPlayed > 0 
      ? ((userStats.wins / userStats.gamesPlayed) * 100).toFixed(1)
      : 0;

    const netProfit = userStats.totalWinnings - userStats.totalWagered;

    statsText += `*Your Stats:*\n`;
    statsText += `• Games Played: ${userStats.gamesPlayed}\n`;
    statsText += `• Wins: ${userStats.wins}\n`;
    statsText += `• Losses: ${userStats.losses}\n`;
    statsText += `• Draws: ${userStats.draws}\n`;
    statsText += `• Win Rate: ${winRate}%\n`;
    statsText += `• Total Wagered: ₦${userStats.totalWagered.toLocaleString()}\n`;
    statsText += `• Total Winnings: ₦${userStats.totalWinnings.toLocaleString()}\n`;
    statsText += `• Net Profit: ${netProfit >= 0 ? '+' : ''}₦${netProfit.toLocaleString()}`;
  }

  await reply(statsText);
}

async function handleCfgLeaderboard(reply, sock, m) {
  const leaderboard = await gameManager.getLeaderboard(10);

  if (leaderboard.length === 0) {
    await reply('📊 *Leaderboard is empty*\n\nBe the first to play!');
    return;
  }

  let lbText = `*🏆 Connect Four Leaderboard*\n\n`;

  const medals = ['🥇', '🥈', '🥉'];

  leaderboard.forEach((player, index) => {
    const rank = index < 3 ? medals[index] : `${index + 1}.`;
    const userName = player.userId.split('@')[0];

    lbText += `${rank} @${userName}\n`;
    lbText += `   • Wins: ${player.wins}\n`;
    lbText += `   • Score: ${player.score}\n\n`;
  });

  const mentions = leaderboard.map(p => p.userId);

  await sock.sendMessage(m.from, {
    text: lbText,
    mentions: mentions
  }, { quoted: m });
}

async function handleC4Help(reply, config) {
  const settings = gameManager.getSettings();

  const helpText = `*🎮 Connect Four Game Guide*\n\n` +
    `*How to Play:*\n` +
    `Connect 4 of your discs in a row (horizontal, vertical, or diagonal) to win!\n\n` +
    `*Commands:*\n` +
    `• ${config.PREFIX}c4 @player [bet] - Challenge a player\n` +
    `• ${config.PREFIX}c4 ai [easy/medium/hard] [bet] - Play vs AI\n` +
    `• *Just type 1-7* - Make a move in your game\n` +
    `• ${config.PREFIX}c4status - Check current game\n` +
    `• ${config.PREFIX}c4forfeit - Forfeit current game\n` +
    `• ${config.PREFIX}c4stats - View statistics\n` +
    `• ${config.PREFIX}c4leaderboard - Top players\n` +
    `• ${config.PREFIX}c4help - This help message\n\n` +
    `*Betting:*\n` +
    `• Min Bet: ₦${settings.minBet.toLocaleString()}\n` +
    `• Max Bet: ₦${settings.maxBet.toLocaleString()}\n` +
    `• Winner takes all!\n\n` +
    `*Examples:*\n` +
    `${config.PREFIX}c4 @john\n` +
    `${config.PREFIX}c4 @john 5000\n` +
    `${config.PREFIX}c4 ai hard 2000\n` +
    `_Then just type: 4_ (to drop in column 4)\n\n` +
    `*Tips:*\n` +
    `• Control the center columns\n` +
    `• Think ahead several moves\n` +
    `• Block opponent's winning moves\n` +
    `• Create multiple winning threats\n\n` +
    `Good luck! 🍀`;

  await reply(helpText);
}

// ================================================================
// V3 PLUGIN EXPORT
// ================================================================

export default {
  // Metadata
  name: 'Connect Four Game',
  version: '3.0.0',
  author: 'Alex Macksyn',
  description: 'Full-featured Connect Four game with betting, AI opponent, and leaderboard',
  category: 'games',

  // Commands
  commands: ['cfg', 'connect4', 'cfgstatus', 'cfgforfeit', 'cfgstats', 'cfgleaderboard', 'cfghelp', 'cfgsettings', 'cfgcancel'],
  aliases: ['cfgstart'],

  // Execute on all messages (not just commands) to detect number inputs
  executeOnAllMessages: true,

  /**
   * Initialize plugin
   */
  async init(context) {
    const { logger } = context;
    await gameManager.initialize();

    const settings = gameManager.getSettings();
    logger.info('✅ Connect Four Game V3 initialized');
    logger.info(`Status: ${settings.enabled ? 'Enabled' : 'Disabled'}`);
    logger.info(`Betting: ${settings.allowBetting ? 'Enabled' : 'Disabled'}`);
    logger.info(`AI Opponent: ${settings.allowAIOpponent ? 'Available' : 'Disabled'}`);
  },

  /**
   * Main command handler
   */
  async run(context) {
    const { msg: m, sock, config, logger, command, args, text } = context;

    try {
      // Ensure initialization
      if (!gameManager.settings) {
        await gameManager.initialize();
      }

      const sender = m.sender;
      const chatId = m.from;
      const isGroup = m.isGroup;

      if (!sender) {
        logger.warn('⚠️ No sender found in message');
        return;
      }

      const isAdmin = gameManager.isAdmin(sender);

      // Reply helper
      const reply = async (text) => {
        if (typeof m.reply === 'function') {
          await m.reply(text);
        } else {
          await sock.sendMessage(chatId, { text }, { quoted: m });
        }
      };

      // Check if player has an active game and message is just a number (1-7)
      const messageBody = m.body?.trim();
      if (messageBody && /^[1-7]$/.test(messageBody)) {
        const gameData = gameManager.getPlayerGame(sender);

        if (gameData) {
          // Player has active game and sent a number - treat as move
          await handleCfgMove(reply, sender, [messageBody], config, sock, m);
          return;
        }
        // No active game, ignore the number (could be part of normal conversation)
        return;
      }

      // Check for "join" message to join pending games
      if (messageBody && messageBody.toLowerCase() === 'join') {
        const pendingGame = gameManager.pendingGames.get(chatId);
        if (pendingGame) {
          await handleJoinGame(reply, sender, chatId, sock, m);
          return;
        }
        // No pending game, ignore
        return;
      }

      // Command routing
      switch (command) {
        case 'cfgsettings':
          if (!isAdmin) {
            await reply('⛔ *Access Denied*\n\nThis command is only available to administrators.');
            return;
          }
          await handleCfgSettings(reply, sender, args, config);
          break;

        case 'cfg':
        case 'connect4':
        case 'cfgstart':
          await handleCfgStart(reply, sender, m, chatId, isGroup, args, config, sock);
          break;

        case 'cfgstatus':
          await handleCfgStatus(reply, sender, sock, m);
          break;

        case 'cfgforfeit':
          await handleCfgForfeit(reply, sender, sock, m);
          break;

        case 'cfgcancel':
          await handleCancelGame(reply, sender, chatId);
          break;

        case 'cfgstats':
          await handleCfgStats(reply, sender);
          break;

        case 'cfgleaderboard':
          await handleCfgLeaderboard(reply, sock, m);
          break;

        case 'cfghelp':
          await handleCfgHelp(reply, config);
          break;

        default:
          // Unknown command or non-command message - ignore
          return;
      }

    } catch (error) {
      logger.error(error, `❌ ${this.name} plugin error`);
      try {
        const reply = (msg) => sock.sendMessage(m.from, { text: msg }, { quoted: m });
        await reply(`❌ *Game Error*\n\nAn unexpected error occurred. Please try again or contact admin.\n\n_Error: ${error.message}_`);
      } catch (replyError) {
        logger.error(replyError, 'Failed to send error message');
      }
    }
  }
};