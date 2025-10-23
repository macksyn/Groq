// plugins/wordchain_plugin.js - Word Chain Game Plugin with Staking
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';
import fs from 'fs/promises';

// Plugin information export
export const info = {
  name: 'Word Chain Game',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Staked multiplayer word chain game where players compete for a prize pool.',
  commands: [
    {
      name: 'wcg',
      aliases: ['wordchain'],
      description: 'Start a word chain game with stakes.'
    }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
const COLLECTIONS = {
  GAME_ROOMS: 'wordchain_rooms',
  GAME_HISTORY: 'wordchain_history',
  GAME_SETTINGS: 'wordchain_settings'
};

// Database connection
let db = null;
let mongoClient = null;

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Game configuration
const GAME_CONFIG = {
  WAITING_TIME: 60, // seconds to wait for players
  INITIAL_TURN_TIME: 40, // starting time per turn
  FINAL_TURN_TIME: 20, // minimum time per turn
  INITIAL_MIN_LENGTH: 3, // starting minimum word length
  MAX_MIN_LENGTH: 14, // maximum minimum word length
  MAX_PLAYERS: 10,
  MIN_PLAYERS: 2,
  DEFAULT_STAKE: 1000, // default stake amount
  MIN_STAKE: 500,
  MAX_STAKE: 50000,
  DIFFICULTY_SETTINGS: {
    // Rounds where difficulty increases
    LENGTH_INCREASE_ROUNDS: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], // Increase word length every 5 rounds
    TIME_DECREASE_ROUNDS: [8, 16, 24, 32, 40, 48], // Decrease time every 8 rounds
    TIME_DECREASE_AMOUNT: 3 // Seconds to decrease each time
  }
};

// Comprehensive word list for random selection
let WORD_LIST = [];
let RANDOM_WORDS = [];

// Initialize word list
async function loadWordList() {
  try {
    try {
      const wordsFile = await fs.readFile('./data/words.txt', 'utf8');
      const words = wordsFile.split('\n').map(word => word.trim().toLowerCase()).filter(word => word.length >= 3);
      WORD_LIST = words;
      RANDOM_WORDS = words.filter(word => word.length >= 4 && word.length <= 8); // Good for random selection
      console.log(`📖 Loaded ${WORD_LIST.length} words from file`);
    } catch (fileError) {
      // Fallback word list
      const basicWords = [
        'apple', 'elephant', 'tiger', 'rabbit', 'tree', 'eagle', 'train', 'ninja', 'arrow', 'water',
        'radio', 'ocean', 'nature', 'energy', 'yellow', 'window', 'world', 'dream', 'magic', 'chair',
        'river', 'robot', 'table', 'earth', 'house', 'event', 'tower', 'round', 'dance', 'computer',
        'rainbow', 'wonder', 'rescue', 'engine', 'expert', 'travel', 'lesson', 'number', 'record',
        'doctor', 'reason', 'nation', 'normal', 'lumber', 'render', 'random', 'member', 'rubber',
        'riddle', 'energy', 'yogurt', 'turkey', 'yearly', 'winner', 'bridge', 'strong', 'flower',
        'market', 'office', 'school', 'friend', 'family', 'planet', 'animal', 'forest', 'garden',
        'castle', 'dragon', 'knight', 'battle', 'prince', 'queen', 'royal', 'crown', 'sword',
        'shield', 'armor', 'power', 'magic', 'spell', 'potion', 'crystal', 'treasure', 'adventure'
      ];
      WORD_LIST = basicWords;
      RANDOM_WORDS = basicWords;
      console.log(`📖 Using basic word list with ${WORD_LIST.length} words`);
    }
  } catch (error) {
    console.error('Error loading word list:', error);
    WORD_LIST = ['apple', 'elephant', 'tiger', 'rabbit', 'train'];
    RANDOM_WORDS = WORD_LIST;
  }
}

// Initialize MongoDB connection
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    // Create indexes
    await db.collection(COLLECTIONS.GAME_ROOMS).createIndex({ roomId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.GAME_HISTORY).createIndex({ roomId: 1, timestamp: -1 });
    await db.collection(COLLECTIONS.GAME_SETTINGS).createIndex({ groupId: 1 }, { unique: true });
    
    console.log('✅ MongoDB connected successfully for Word Chain Game');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed for Word Chain Game:', error);
    throw error;
  }
}

// Utility functions
const sanitizeWord = (word = '') => word.replace(/[^a-zA-Z]/g, '').toLowerCase();

function isValidWord(word) {
  return WORD_LIST.includes(word.toLowerCase());
}

function getRandomWord() {
  return RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Game settings management
async function getGameSettings(groupId) {
  try {
    const settings = await db.collection(COLLECTIONS.GAME_SETTINGS).findOne({ groupId });
    return settings ? settings.data : { stake: GAME_CONFIG.DEFAULT_STAKE };
  } catch (error) {
    console.error('Error loading game settings:', error);
    return { stake: GAME_CONFIG.DEFAULT_STAKE };
  }
}

async function saveGameSettings(groupId, settings) {
  try {
    await db.collection(COLLECTIONS.GAME_SETTINGS).replaceOne(
      { groupId },
      { groupId, data: settings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving game settings:', error);
  }
}

// Game state management
class WordChainGame {
  constructor(roomId, creatorId, stake) {
    this.roomId = roomId;
    this.creatorId = creatorId;
    this.stake = stake;
    this.state = 'waiting'; // 'waiting', 'active', 'finished'
    this.players = new Map();
    this.playerOrder = [];
    this.currentPlayerIndex = 0;
    this.usedWords = new Set();
    this.currentWord = '';
    this.lastLetter = '';
    this.prizePool = 0;
    this.roundNumber = 1; // Track current round for difficulty scaling
    this.currentMinLength = GAME_CONFIG.INITIAL_MIN_LENGTH; // Current minimum word length
    this.currentTurnTime = GAME_CONFIG.INITIAL_TURN_TIME; // Current turn time
    this.turnTimeLeft = 0;
    this.waitingTimeLeft = GAME_CONFIG.WAITING_TIME;
    this.gameStartTime = new Date();
    this.turnTimer = null;
    this.waitingTimer = null;
    this.eliminatedPlayers = new Set();
    
    // Add creator as first player
    this.players.set(creatorId, {
      id: creatorId,
      staked: false,
      eliminated: false,
      joinTime: new Date()
    });
    
    this.startWaitingPeriod();
  }

  startWaitingPeriod() {
    this.waitingTimer = setInterval(() => {
      this.waitingTimeLeft--;
      if (this.waitingTimeLeft <= 0) {
        this.startGame();
      }
    }, 1000);
  }

  async addPlayer(userId, sock) {
    if (this.players.size >= GAME_CONFIG.MAX_PLAYERS) return { success: false, error: 'Game is full' };
    if (this.players.has(userId)) return { success: false, error: 'Already joined' };
    if (this.state !== 'waiting') return { success: false, error: 'Game already started' };

    // Check if user has sufficient balance
    const userData = await unifiedUserManager.getUserData(userId);
    if (!userData || userData.balance < this.stake) {
      return { success: false, error: 'insufficient_funds', balance: userData?.balance || 0 };
    }

    // Deduct stake from user's balance
    const deductSuccess = await unifiedUserManager.removeMoney(userId, this.stake, 'Word Chain Game stake');
    if (!deductSuccess) {
      return { success: false, error: 'Failed to deduct stake' };
    }

    // Add player
    this.players.set(userId, {
      id: userId,
      staked: true,
      eliminated: false,
      joinTime: new Date()
    });
    
    this.prizePool += this.stake;
    return { success: true };
  }

  async startGame() {
    if (this.waitingTimer) {
      clearInterval(this.waitingTimer);
      this.waitingTimer = null;
    }

    // Check if creator staked
    const creator = this.players.get(this.creatorId);
    if (!creator.staked) {
      this.players.delete(this.creatorId);
    }

    // Remove players who didn't stake
    const stakedPlayers = [];
    for (const [userId, player] of this.players.entries()) {
      if (player.staked) {
        stakedPlayers.push(userId);
      } else {
        this.players.delete(userId);
      }
    }

    if (stakedPlayers.length < GAME_CONFIG.MIN_PLAYERS) {
      this.state = 'finished';
      // Refund all players
      for (const userId of stakedPlayers) {
        await unifiedUserManager.addMoney(userId, this.stake, 'Word Chain Game refund - insufficient players');
      }
      return false;
    }

    this.state = 'active';
    this.playerOrder = [...stakedPlayers].sort(() => Math.random() - 0.5); // Shuffle
    this.currentPlayerIndex = 0;
    
    // Start with a random word
    this.currentWord = getRandomWord();
    this.lastLetter = this.currentWord.slice(-1);
    this.usedWords.add(this.currentWord);
    
    this.startTurn();
    return true;
  }

  // Update difficulty based on round number
  updateDifficulty() {
    // Increase minimum word length
    if (GAME_CONFIG.DIFFICULTY_SETTINGS.LENGTH_INCREASE_ROUNDS.includes(this.roundNumber)) {
      if (this.currentMinLength < GAME_CONFIG.MAX_MIN_LENGTH) {
        this.currentMinLength++;
      }
    }
    
    // Decrease turn time
    if (GAME_CONFIG.DIFFICULTY_SETTINGS.TIME_DECREASE_ROUNDS.includes(this.roundNumber)) {
      const newTime = this.currentTurnTime - GAME_CONFIG.DIFFICULTY_SETTINGS.TIME_DECREASE_AMOUNT;
      if (newTime >= GAME_CONFIG.FINAL_TURN_TIME) {
        this.currentTurnTime = newTime;
      }
    }
  }

  startTurn() {
    if (this.state !== 'active' || this.playerOrder.length <= 1) {
      this.endGame();
      return;
    }
    
    // Update difficulty for new round
    this.updateDifficulty();
    
    this.turnTimeLeft = this.currentTurnTime;
    
    if (this.turnTimer) {
      clearInterval(this.turnTimer);
    }
    
    this.turnTimer = setInterval(() => {
      this.turnTimeLeft--;
      if (this.turnTimeLeft <= 0) {
        this.eliminateCurrentPlayer();
      }
    }, 1000);
  }

  async submitWord(userId, word) {
    if (this.state !== 'active') return { success: false, error: 'Game not active' };
    if (this.getCurrentPlayer() !== userId) return { success: false, error: 'Not your turn' };
    if (this.eliminatedPlayers.has(userId)) return { success: false, error: 'You are eliminated' };
    
    const cleanWord = sanitizeWord(word);
    
    // Validate word against CURRENT difficulty requirements
    if (cleanWord.length < this.currentMinLength) {
      return { success: false, error: `Word must be at least ${this.currentMinLength} letters long (Round ${this.roundNumber} difficulty)` };
    }
    
    if (!cleanWord.startsWith(this.lastLetter.toLowerCase())) {
      return { success: false, error: `Word must start with '${this.lastLetter.toUpperCase()}'` };
    }
    
    if (this.usedWords.has(cleanWord)) {
      return { success: false, error: 'Word already used' };
    }
    
    if (!isValidWord(cleanWord)) {
      return { success: false, error: 'Not a valid word' };
    }
    
    // Word is valid!
    this.usedWords.add(cleanWord);
    this.currentWord = cleanWord;
    this.lastLetter = cleanWord.slice(-1);
    
    // Next turn
    this.nextTurn();
    
    return { success: true, word: cleanWord };
  }

  eliminateCurrentPlayer() {
    const currentPlayer = this.getCurrentPlayer();
    this.eliminatedPlayers.add(currentPlayer);
    this.playerOrder = this.playerOrder.filter(id => id !== currentPlayer);
    
    if (this.currentPlayerIndex >= this.playerOrder.length) {
      this.currentPlayerIndex = 0;
    }
    
    if (this.playerOrder.length <= 1) {
      this.endGame();
      return;
    }
    
    this.startTurn();
  }

  nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length;
    
    // Check if we completed a full round (all players had a turn)
    if (this.currentPlayerIndex === 0) {
      this.roundNumber++;
    }
    
    this.startTurn();
  }

  getCurrentPlayer() {
    return this.playerOrder[this.currentPlayerIndex];
  }

  getWinner() {
    return this.playerOrder.length === 1 ? this.playerOrder[0] : null;
  }

  async endGame() {
    this.state = 'finished';
    
    if (this.turnTimer) {
      clearInterval(this.turnTimer);
      this.turnTimer = null;
    }

    const winner = this.getWinner();
    if (winner && this.prizePool > 0) {
      await unifiedUserManager.addMoney(winner, this.prizePool, 'Word Chain Game winner');
    }
    
    return winner;
  }
}

// Active games storage
const activeGames = new Map();

// Extract mentions from message
function extractMentions(message) {
  const mentions = [];
  if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    mentions.push(...message.message.extendedTextMessage.contextInfo.mentionedJid);
  }
  return mentions;
}

// =======================
// 📋 COMMAND HANDLERS
// =======================

export default async function wordchainHandler(m, sock, config) {
  try {
    if (!db) await initDatabase();
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const reply = async (text, mentions = []) => await sock.sendMessage(from, { text, mentions }, { quoted: m });
    const context = { m, sock, config, senderId, from, reply };

    // Handle wcg command (start game)
    if (command === 'wcg') {
      await handleStartGame(context, args.slice(1));
      return;
    }

    // Handle join command
    if (command === 'join' && activeGames.has(from)) {
      await handleJoin(context);
      return;
    }

    // Handle word submissions (any other word)
    if (activeGames.has(from)) {
      const game = activeGames.get(from);
      if (game.state === 'active' && command.length >= 3) {
        await handleWordSubmission(context, command);
        return;
      }
    }

    // Handle settings and info commands
    if (['wordchain'].includes(command)) {
      const subCommand = args[1]?.toLowerCase() || 'help';
      await handleSubCommand(subCommand, args.slice(2), context);
    }

  } catch (error) {
    console.error('❌ Word Chain Game plugin error:', error);
  }
}

async function handleSubCommand(subCommand, args, context) {
  switch (subCommand) {
    case 'help': await showHelpMenu(context); break;
    case 'setstake': await handleSetStake(context, args); break;
    case 'settings': await handleSettings(context); break;
    case 'history': await handleHistory(context); break;
    default: 
      await context.reply(`❓ Unknown command. Use *${context.config.PREFIX}wordchain help* for options.`);
  }
}

async function showHelpMenu(context) {
  const { reply, config, from } = context;
  const prefix = config.PREFIX;
  const settings = await getGameSettings(from);
  
  const menu = `🎮 *WORD CHAIN GAME* 🎮\n\n` +
               `*💰 Current Stake:* ₦${settings.stake.toLocaleString()}\n\n` +
               `*🎯 How to Play:*\n` +
               `• *${prefix}wcg* - Start a new game (60s to join)\n` +
               `• *join* - Join the game during waiting period\n` +
               `• Type valid words that start with the last letter\n` +
               `• Last player standing wins the prize pool!\n\n` +
               `*📈 Progressive Difficulty:*\n` +
               `• Starts: ${GAME_CONFIG.INITIAL_MIN_LENGTH}+ letters, ${GAME_CONFIG.INITIAL_TURN_TIME}s per turn\n` +
               `• Increases: Word length every 5 rounds\n` +
               `• Decreases: Turn time every 8 rounds\n` +
               `• Maximum: ${GAME_CONFIG.MAX_MIN_LENGTH}+ letters, ${GAME_CONFIG.FINAL_TURN_TIME}s per turn\n\n` +
               `*⚙️ Settings:*\n` +
               `• *${prefix}wordchain setstake <amount>* - Set game stake\n` +
               `• *${prefix}wordchain settings* - View current settings\n` +
               `• *${prefix}wordchain history* - View recent games\n\n` +
               `*📝 Rules:*\n` +
               `• Progressive difficulty increases challenge\n` +
               `• No repeated words allowed\n` +
               `• Must be valid dictionary words\n` +
               `• Winner takes all stakes!`;
  
  await reply(menu);
}

async function handleStartGame(context, args) {
  const { reply, from, senderId, config } = context;
  
  if (activeGames.has(from)) {
    const game = activeGames.get(from);
    if (game.state === 'waiting') {
      return reply(`⏳ A game is already starting! You have ${game.waitingTimeLeft}s to join.\nType *join* to participate!`);
    } else if (game.state === 'active') {
      return reply('🎮 A game is currently in progress! Wait for it to finish.');
    }
  }
  
  const settings = await getGameSettings(from);
  let stake = settings.stake;
  
  // Allow custom stake for this game
  if (args[0] && !isNaN(parseInt(args[0]))) {
    const customStake = parseInt(args[0]);
    if (customStake < GAME_CONFIG.MIN_STAKE || customStake > GAME_CONFIG.MAX_STAKE) {
      return reply(`❌ Stake must be between ₦${GAME_CONFIG.MIN_STAKE.toLocaleString()} and ₦${GAME_CONFIG.MAX_STAKE.toLocaleString()}`);
    }
    stake = customStake;
  }
  
  // Check creator's balance
  const userData = await unifiedUserManager.getUserData(senderId);
  if (!userData || userData.balance < stake) {
    return reply(`❌ Insufficient balance!\n\nRequired: ₦${stake.toLocaleString()}\nYour balance: ₦${userData?.balance?.toLocaleString() || 0}`);
  }
  
  const game = new WordChainGame(from, senderId, stake);
  activeGames.set(from, game);
  
  await reply(`🎮 *WORD CHAIN GAME STARTED!* 🎮\n\n` +
             `💰 Stake: *₦${stake.toLocaleString()}* per player\n` +
             `👤 Started by: @${senderId.split('@')[0]}\n` +
             `⏰ Time to join: *${GAME_CONFIG.WAITING_TIME} seconds*\n` +
             `👥 Players: 1/${GAME_CONFIG.MAX_PLAYERS}\n\n` +
             `💡 Type *join* to participate!\n` +
             `🏆 Winner takes all stakes in the prize pool!`, [senderId]);
  
  // Start countdown updates
  setTimeout(() => updateWaitingStatus(context, game), 10000);
}

async function handleJoin(context) {
  const { reply, from, senderId } = context;
  
  const game = activeGames.get(from);
  if (!game) {
    return reply('❌ No active game. Start one with *wcg*');
  }
  
  if (game.state !== 'waiting') {
    return reply('❌ Cannot join - game has already started!');
  }
  
  const result = await game.addPlayer(senderId, context.sock);
  
  if (!result.success) {
    if (result.error === 'insufficient_funds') {
      return reply(`❌ Insufficient balance!\n\nRequired: ₦${game.stake.toLocaleString()}\nYour balance: ₦${result.balance?.toLocaleString() || 0}`);
    } else if (result.error === 'Already joined') {
      return reply('❌ You have already joined this game!');
    } else if (result.error === 'Game is full') {
      return reply('❌ Game is full! Maximum players reached.');
    } else {
      return reply(`❌ ${result.error}`);
    }
  }
  
  await reply(`✅ @${senderId.split('@')[0]} joined the game!\n\n` +
             `💰 Stake paid: ₦${game.stake.toLocaleString()}\n` +
             `🏆 Prize pool: ₦${game.prizePool.toLocaleString()}\n` +
             `👥 Players: ${game.players.size}/${GAME_CONFIG.MAX_PLAYERS}\n` +
             `⏰ Time left: ${game.waitingTimeLeft}s`, [senderId]);
}

async function updateWaitingStatus(context, game) {
  if (!activeGames.has(context.from) || game.state !== 'waiting') return;
  
  if (game.waitingTimeLeft <= 0) {
    // Game should start
    const started = await game.startGame();
    
    if (!started) {
      activeGames.delete(context.from);
      await context.reply(`❌ Game cancelled - not enough players joined.\n\nMinimum ${GAME_CONFIG.MIN_PLAYERS} players required.`);
      return;
    }
    
    const currentPlayer = game.getCurrentPlayer();
    await reply(`🎮 *GAME STARTED!* 🎮\n\n` +
               `📝 Starting word: *${game.currentWord}*\n` +
               `🎯 Next word must start with: *${game.lastLetter.toUpperCase()}*\n` +
               `📏 Minimum word length: *${game.currentMinLength} letters*\n\n` +
               `👤 Current turn: @${currentPlayer.split('@')[0]}\n` +
               `⏰ Time limit: *${game.currentTurnTime}s*\n` +
               `🔢 Round: *${game.roundNumber}*\n` +
               `🏆 Prize pool: ₦${game.prizePool.toLocaleString()}\n\n` +
               `Type your word to play!`, [currentPlayer]);
    
    // Start turn updates
    setTimeout(() => updateGameStatus(context, game), 10000);
    return;
  }
  
  // Continue waiting updates
  if (game.waitingTimeLeft % 15 === 0 || game.waitingTimeLeft <= 10) {
    await context.reply(`⏳ *${game.waitingTimeLeft}s left to join!*\n\n` +
                       `💰 Stake: ₦${game.stake.toLocaleString()}\n` +
                       `👥 Players: ${game.players.size}/${GAME_CONFIG.MAX_PLAYERS}\n` +
                       `🏆 Prize pool: ₦${game.prizePool.toLocaleString()}\n\n` +
                       `Type *join* to participate!`);
  }
  
  setTimeout(() => updateWaitingStatus(context, game), 5000);
}

async function handleWordSubmission(context, word) {
  const { reply, from, senderId } = context;
  
  const game = activeGames.get(from);
  if (!game) return;
  
  const result = await game.submitWord(senderId, word);
  
  if (!result.success) {
    let errorMsg;
    switch (result.error) {
      case 'Not your turn':
        const currentPlayer = game.getCurrentPlayer();
        errorMsg = `❌ Not your turn! Current player: @${currentPlayer.split('@')[0]}`;
        await reply(errorMsg, [currentPlayer]);
        return;
      case 'Word too short':
        errorMsg = `❌ Word must be at least ${GAME_CONFIG.MIN_WORD_LENGTH} letters!`;
        break;
      case 'Word already used':
        errorMsg = `❌ "${word}" has already been used!`;
        break;
      case 'Not a valid word':
        errorMsg = `❌ "${word}" is not a valid word!`;
        break;
      default:
        errorMsg = `❌ ${result.error}`;
    }
    await reply(errorMsg);
    return;
  }
  
  // Check if game ended
  if (game.state === 'finished') {
    const winner = game.getWinner();
    if (winner) {
      await reply(`🎉 *GAME OVER!* 🎉\n\n` +
                 `🏆 Winner: @${winner.split('@')[0]}\n` +
                 `💰 Prize won: ₦${game.prizePool.toLocaleString()}\n` +
                 `📝 Final word: *${result.word}*\n` +
                 `🔢 Rounds completed: ${game.roundNumber}\n` +
                 `📏 Final difficulty: ${game.currentMinLength}+ letters, ${game.currentTurnTime}s\n` +
                 `🎯 Total words played: ${game.usedWords.size}\n\n` +
                 `Congratulations! 🎊`, [winner]);
      
      // Save game to history
      try {
        await db.collection(COLLECTIONS.GAME_HISTORY).insertOne({
          roomId: from,
          winner: winner,
          prizePool: game.prizePool,
          stake: game.stake,
          players: [...game.players.keys()],
          totalWords: game.usedWords.size,
          finalWord: result.word,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Error saving game history:', error);
      }
    } else {
      await reply('🏁 Game ended with no winner.');
    }
    
    setTimeout(() => activeGames.delete(from), 30000);
  } else {
    // Continue game
    const currentPlayer = game.getCurrentPlayer();
    await reply(`✅ *${result.word}* accepted!\n\n` +
               `🎯 Next word must start with: *${game.lastLetter.toUpperCase()}*\n` +
               `👤 Current turn: @${currentPlayer.split('@')[0]}\n` +
               `⏰ Time: ${formatTime(game.turnTimeLeft)}\n` +
               `👥 Players left: ${game.playerOrder.length}`, [currentPlayer]);
  }
}

async function updateGameStatus(context, game) {
  if (game.state !== 'active' || !activeGames.has(context.from)) return;
  
  // Send time warnings with current difficulty
  if (game.turnTimeLeft === 10 || game.turnTimeLeft === 5) {
    const currentPlayer = game.getCurrentPlayer();
    await context.reply(`⚠️ *${game.turnTimeLeft}s left!*\n\n` +
                       `👤 @${currentPlayer.split('@')[0]} - Your turn!\n` +
                       `🎯 Word must start with: *${game.lastLetter.toUpperCase()}*\n` +
                       `📏 Min ${game.currentMinLength} letters required!`, [currentPlayer]);
  }
  
  // Continue updates
  if (game.state === 'active') {
    setTimeout(() => updateGameStatus(context, game), 5000);
  }
}

async function handleSetStake(context, args) {
  const { reply, from, senderId } = context;
  
  // Check if user is admin (optional - you can remove this check)
  // const isAdmin = await isAuthorized(context.sock, from, senderId);
  // if (!isAdmin) return reply('🚫 Only admins can change game settings.');
  
  if (args.length === 0) {
    return reply(`❌ Please specify stake amount.\nUsage: *wordchain setstake <amount>*\n\nExample: *wordchain setstake 2000*`);
  }
  
  const stake = parseInt(args[0]);
  if (isNaN(stake) || stake < GAME_CONFIG.MIN_STAKE || stake > GAME_CONFIG.MAX_STAKE) {
    return reply(`❌ Invalid stake amount.\nMust be between ₦${GAME_CONFIG.MIN_STAKE.toLocaleString()} and ₦${GAME_CONFIG.MAX_STAKE.toLocaleString()}`);
  }
  
  await saveGameSettings(from, { stake });
  await reply(`✅ Game stake updated to ₦${stake.toLocaleString()}\n\nThis will apply to new games created in this group.`);
}

async function handleSettings(context) {
  const { reply, from } = context;
  const settings = await getGameSettings(from);
  
  const settingsMsg = `⚙️ *WORD CHAIN SETTINGS* ⚙️\n\n` +
                     `💰 Current stake: *₦${settings.stake.toLocaleString()}*\n` +
                     `⏰ Waiting time: *${GAME_CONFIG.WAITING_TIME}s*\n` +
                     `📈 Starting difficulty: *${GAME_CONFIG.INITIAL_MIN_LENGTH}+ letters, ${GAME_CONFIG.INITIAL_TURN_TIME}s*\n` +
                     `📊 Final difficulty: *${GAME_CONFIG.MAX_MIN_LENGTH}+ letters, ${GAME_CONFIG.FINAL_TURN_TIME}s*\n` +
                     `👥 Max players: *${GAME_CONFIG.MAX_PLAYERS}*\n\n` +
                     `*📈 Difficulty Progression:*\n` +
                     `• Word length increases every 5 rounds\n` +
                     `• Turn time decreases every 8 rounds\n` +
                     `• Difficulty caps at round ${Math.max(...GAME_CONFIG.DIFFICULTY_SETTINGS.LENGTH_INCREASE_ROUNDS)}\n\n` +
                     `*💡 To change stake:*\n` +
                     `\`wordchain setstake <amount>\``;
  
  await reply(settingsMsg);
}

async function handleHistory(context) {
  const { reply, from } = context;
  
  try {
    const recentGames = await db.collection(COLLECTIONS.GAME_HISTORY)
      .find({ roomId: from })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    
    if (recentGames.length === 0) {
      return reply('📊 No game history found in this group.\n\nStart a game with *wcg* to create some history!');
    }
    
    let historyMsg = `📊 *RECENT GAMES* 📊\n\n`;
    
    recentGames.forEach((game, index) => {
      const timeAgo = moment(game.timestamp).fromNow();
      historyMsg += `${index + 1}. 🏆 @${game.winner.split('@')[0]}\n`;
      historyMsg += `   💰 Won: ₦${game.prizePool.toLocaleString()}\n`;
      historyMsg += `   👥 ${game.players.length} players\n`;
      historyMsg += `   📝 ${game.totalWords} words\n`;
      historyMsg += `   🕐 ${timeAgo}\n\n`;
    });
    
    await reply(historyMsg);
    
  } catch (error) {
    console.error('Error fetching game history:', error);
    await reply('❌ Error fetching game history.');
  }
}

// Check if user is authorized (admin) - optional function
async function isAuthorized(sock, from, sender) {
  if (!from.endsWith('@g.us')) return false;
  try {
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking group admin status:', error);
    return false;
  }
}

// Clean up inactive games and handle eliminations
function cleanupGames() {
  const now = Date.now();
  const toRemove = [];
  
  for (const [roomId, game] of activeGames.entries()) {
    const timeSinceStart = now - game.gameStartTime.getTime();
    
    // Remove games that have been waiting too long
    if (game.state === 'waiting' && timeSinceStart > 5 * 60 * 1000) { // 5 minutes
      toRemove.push(roomId);
    }
    
    // Remove finished games
    if (game.state === 'finished' && timeSinceStart > 2 * 60 * 1000) { // 2 minutes
      toRemove.push(roomId);
    }
    
    // Handle turn timeouts for active games
    if (game.state === 'active' && game.turnTimeLeft <= 0) {
      game.eliminateCurrentPlayer();
    }
  }
  
  toRemove.forEach(roomId => {
    console.log(`🧹 Cleaning up inactive game in ${roomId}`);
    const game = activeGames.get(roomId);
    if (game) {
      game.endGame();
      activeGames.delete(roomId);
    }
  });
}

// Monitor games for timeouts and eliminations
let gameMonitorInterval = null;

function startGameMonitoring() {
  if (gameMonitorInterval) clearInterval(gameMonitorInterval);
  
  gameMonitorInterval = setInterval(() => {
    cleanupGames();
  }, 5000); // Check every 5 seconds
}

function stopGameMonitoring() {
  if (gameMonitorInterval) {
    clearInterval(gameMonitorInterval);
    gameMonitorInterval = null;
  }
}

// Handle player elimination due to timeout
async function handlePlayerElimination(roomId, eliminatedPlayer, sock) {
  const game = activeGames.get(roomId);
  if (!game) return;
  
  try {
    await sock.sendMessage(roomId, {
      text: `⏰ *TIME'S UP!* ⏰\n\n❌ @${eliminatedPlayer.split('@')[0]} has been eliminated!\n\n👥 Players remaining: ${game.playerOrder.length}\n\n${game.playerOrder.length > 1 ? `🎯 Next word must start with: *${game.lastLetter.toUpperCase()}*\n👤 Current turn: @${game.getCurrentPlayer().split('@')[0]}` : '🏆 Game ending...'}`,
      mentions: game.playerOrder.length > 1 ? [eliminatedPlayer, game.getCurrentPlayer()] : [eliminatedPlayer]
    });
  } catch (error) {
    console.error('Error sending elimination message:', error);
  }
}

// =======================
// 🔄 PLUGIN LIFECYCLE
// =======================

export async function initPlugin(sock) {
  try {
    console.log('🔧 Initializing Word Chain Game plugin...');
    
    await initDatabase();
    await loadWordList();
    
    startGameMonitoring();
    
    // Enhanced cleanup every 2 minutes
    setInterval(cleanupGames, 2 * 60 * 1000);
    
    console.log('✅ Word Chain Game plugin initialized successfully.');
    console.log(`📖 Loaded ${WORD_LIST.length} words for validation`);
    console.log(`🎲 ${RANDOM_WORDS.length} words available for random selection`);
    
  } catch (error) {
    console.error('❌ Failed to initialize Word Chain Game plugin:', error);
  }
}

export async function cleanupPlugin() {
  try {
    // End all active games and refund players
    for (const [roomId, game] of activeGames.entries()) {
      if (game.state === 'waiting' || game.state === 'active') {
        // Refund all staked players
        for (const [userId, player] of game.players.entries()) {
          if (player.staked) {
            await unifiedUserManager.addMoney(userId, game.stake, 'Word Chain Game refund - server shutdown');
          }
        }
      }
      game.endGame();
    }
    activeGames.clear();
    
    // Stop monitoring
    stopGameMonitoring();
    
    // Close database connection
    if (mongoClient) {
      await mongoClient.close();
      mongoClient = null;
      db = null;
    }
    
    console.log('✅ Word Chain Game plugin cleaned up successfully.');
  } catch (error) {
    console.error('❌ Error cleaning up Word Chain Game plugin:', error);
  }
}

// Export utility functions for other plugins
export const gameUtils = {
  isValidWord,
  sanitizeWord,
  getRandomWord,
  getActiveGames: () => activeGames,
  getWordListSize: () => WORD_LIST.length,
  getGameConfig: () => GAME_CONFIG
};