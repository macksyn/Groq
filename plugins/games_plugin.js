// plugins/games.js - Enhanced production-ready games plugin
import axios from 'axios';
import chalk from 'chalk';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// ============================================
// GAME STATE MANAGEMENT (In-Memory Storage)
// ============================================
const gameStates = {
  numberGuess: new Map(),
  connectFour: new Map(),
  hiddenCard: new Map(),
  wordChain: new Map(),
  ticTacToe: new Map(),
  capital: new Map(),
  guessAnime: new Map()
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
const utils = {
  // Clean phone number
  cleanPhone: (jid) => jid?.split('@')[0] || 'unknown',
  
  // Check if user is owner or admin
  isPrivileged: (sender, config) => {
    const senderNum = sender?.replace('@s.whatsapp.net', '');
    const ownerNum = config.OWNER_NUMBER?.replace('@s.whatsapp.net', '');
    
    if (senderNum === ownerNum) return true;
    
    if (config.ADMIN_NUMBERS) {
      const admins = Array.isArray(config.ADMIN_NUMBERS) 
        ? config.ADMIN_NUMBERS 
        : config.ADMIN_NUMBERS.split(',').map(n => n.trim());
      
      return admins.some(admin => admin.replace('@s.whatsapp.net', '') === senderNum);
    }
    
    return false;
  },
  
  // Format currency
  formatMoney: (amount) => `₦${amount.toLocaleString()}`,
  
  // Get random element
  random: (array) => array[Math.floor(Math.random() * array.length)],
  
  // Sleep function
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// ============================================
// GAME CLASSES
// ============================================

// Number Guessing Game
class NumberGuessingGame {
  constructor(player, mode) {
    this.player = player;
    this.mode = mode;
    this.attempts = 0;
    this.randomNumber = this.generateNumber(mode);
    this.startTime = Date.now();
  }
  
  generateNumber(mode) {
    switch(mode.toLowerCase()) {
      case 'easy': return Math.floor(Math.random() * 100) + 1;
      case 'medium': return Math.floor(Math.random() * 1000) + 1;
      case 'hard': return Math.floor(Math.random() * 10000) + 1;
      default: return Math.floor(Math.random() * 100) + 1;
    }
  }
  
  getRange() {
    switch(this.mode.toLowerCase()) {
      case 'easy': return '1-100';
      case 'medium': return '1-1000';
      case 'hard': return '1-10000';
      default: return '1-100';
    }
  }
  
  guess(number) {
    this.attempts++;
    
    if (number < this.randomNumber) return 'low';
    if (number > this.randomNumber) return 'high';
    return 'correct';
  }
  
  getStats() {
    const timeTaken = Math.floor((Date.now() - this.startTime) / 1000);
    return {
      attempts: this.attempts,
      timeTaken,
      number: this.randomNumber
    };
  }
}

// Connect Four Game
class ConnectFourGame {
  constructor(player1, player2) {
    this.player1 = player1;
    this.player2 = player2;
    this.currentPlayer = player1;
    this.board = Array(6).fill().map(() => Array(7).fill('⚪'));
    this.gameOver = false;
    this.winner = null;
    this.moves = 0;
  }
  
  dropPiece(column) {
    if (column < 0 || column >= 7) return false;
    
    // Find lowest available row
    for (let row = 5; row >= 0; row--) {
      if (this.board[row][column] === '⚪') {
        this.board[row][column] = this.currentPlayer === this.player1 ? '🔵' : '🔴';
        this.moves++;
        return true;
      }
    }
    return false;
  }
  
  checkWin() {
    const piece = this.currentPlayer === this.player1 ? '🔵' : '🔴';
    
    // Check horizontal
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 4; col++) {
        if (this.board[row][col] === piece &&
            this.board[row][col+1] === piece &&
            this.board[row][col+2] === piece &&
            this.board[row][col+3] === piece) {
          return true;
        }
      }
    }
    
    // Check vertical
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row < 3; row++) {
        if (this.board[row][col] === piece &&
            this.board[row+1][col] === piece &&
            this.board[row+2][col] === piece &&
            this.board[row+3][col] === piece) {
          return true;
        }
      }
    }
    
    // Check diagonal (positive slope)
    for (let row = 3; row < 6; row++) {
      for (let col = 0; col < 4; col++) {
        if (this.board[row][col] === piece &&
            this.board[row-1][col+1] === piece &&
            this.board[row-2][col+2] === piece &&
            this.board[row-3][col+3] === piece) {
          return true;
        }
      }
    }
    
    // Check diagonal (negative slope)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        if (this.board[row][col] === piece &&
            this.board[row+1][col+1] === piece &&
            this.board[row+2][col+2] === piece &&
            this.board[row+3][col+3] === piece) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  checkDraw() {
    return this.moves >= 42;
  }
  
  getBoardString() {
    let str = '\n';
    for (let row of this.board) {
      str += '│ ' + row.join(' │ ') + ' │\n';
    }
    str += '  1   2   3   4   5   6   7\n';
    return str;
  }
  
  switchPlayer() {
    this.currentPlayer = this.currentPlayer === this.player1 ? this.player2 : this.player1;
  }
}

// Tic Tac Toe Game
class TicTacToeGame {
  constructor(playerX, playerO) {
    this.playerX = playerX;
    this.playerO = playerO;
    this.currentTurn = playerX;
    this.board = Array(9).fill(null);
    this.winner = null;
  }
  
  render() {
    return this.board.map((cell, i) => {
      if (cell === 'X') return 'X';
      if (cell === 'O') return 'O';
      return (i + 1).toString();
    });
  }
  
  turn(isO, position) {
    if (this.board[position] !== null) return -1; // Position taken
    if (this.winner) return -3; // Game over
    
    this.board[position] = isO ? 'O' : 'X';
    
    // Check for winner
    const winPatterns = [
      [0,1,2], [3,4,5], [6,7,8], // Rows
      [0,3,6], [1,4,7], [2,5,8], // Columns
      [0,4,8], [2,4,6]           // Diagonals
    ];
    
    for (let pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (this.board[a] && 
          this.board[a] === this.board[b] && 
          this.board[a] === this.board[c]) {
        this.winner = this.board[a] === 'X' ? this.playerX : this.playerO;
        return 1;
      }
    }
    
    // Check for draw
    if (!this.board.includes(null)) {
      this.winner = 'draw';
      return 1;
    }
    
    // Switch turn
    this.currentTurn = this.currentTurn === this.playerX ? this.playerO : this.playerX;
    return 1;
  }
}

// Capital Quiz Game
class CapitalQuizGame {
  constructor(player) {
    this.player = player;
    this.attempts = 0;
    this.maxAttempts = 3;
    this.countries = this.getCountries();
    const country = utils.random(Object.keys(this.countries));
    this.country = country;
    this.capital = this.countries[country];
    this.startTime = Date.now();
    this.timeout = null;
  }
  
  getCountries() {
    return {
      'Nigeria': 'Abuja',
      'Ghana': 'Accra',
      'Kenya': 'Nairobi',
      'Egypt': 'Cairo',
      'South Africa': 'Pretoria',
      'Morocco': 'Rabat',
      'Ethiopia': 'Addis Ababa',
      'Tanzania': 'Dodoma',
      'Uganda': 'Kampala',
      'France': 'Paris',
      'Germany': 'Berlin',
      'Italy': 'Rome',
      'Spain': 'Madrid',
      'United Kingdom': 'London',
      'United States': 'Washington',
      'Canada': 'Ottawa',
      'Brazil': 'Brasília',
      'Argentina': 'Buenos Aires',
      'Japan': 'Tokyo',
      'China': 'Beijing',
      'India': 'New Delhi',
      'Australia': 'Canberra',
      'Russia': 'Moscow'
    };
  }
  
  checkAnswer(answer) {
    this.attempts++;
    return answer.toLowerCase().trim() === this.capital.toLowerCase().trim();
  }
  
  hasAttemptsLeft() {
    return this.attempts < this.maxAttempts;
  }
  
  getStats() {
    const timeTaken = Math.floor((Date.now() - this.startTime) / 1000);
    return {
      attempts: this.attempts,
      timeTaken
    };
  }
}

// ============================================
// COMMAND HANDLERS
// ============================================

const commands = {
  // Guess Name Commands
  guessage: async (m, sock, config) => {
    const name = m.body.split(' ').slice(1).join(' ').trim();
    
    if (!name) {
      return await m.reply('❌ Please provide a name!\n\nExample: .guessage John');
    }
    
    try {
      const response = await axios.get(`https://api.agify.io/?name=${name}`);
      const { count, age } = response.data;
      
      const message = `
🎂 *AGE ESTIMATION*

👤 *Name:* ${name}
🔢 *Estimated Age:* ${age || 'Unknown'}
📊 *Sample Size:* ${count || 0}

_Note: This is an estimation based on statistical data_
      `.trim();
      
      await m.reply(message);
    } catch (error) {
      console.error(chalk.red('❌ Guess age error:'), error.message);
      await m.reply('❌ Failed to estimate age. Please try again later.');
    }
  },
  
  guesscountry: async (m, sock, config) => {
    const name = m.body.split(' ').slice(1).join(' ').trim();
    
    if (!name) {
      return await m.reply('❌ Please provide a name!\n\nExample: .guesscountry Michael');
    }
    
    try {
      const response = await axios.get(`https://api.nationalize.io/?name=${name}`);
      const { count, country } = response.data;
      
      if (!country || country.length === 0) {
        return await m.reply(`No country data found for name: ${name}`);
      }
      
      let message = `
🌍 *COUNTRY ESTIMATION*

👤 *Name:* ${name}
📊 *Sample Size:* ${count || 0}

*Likely Countries:*
`;
      
      country.slice(0, 5).forEach((c, index) => {
        message += `${index + 1}. ${c.country_id} - ${(c.probability * 100).toFixed(1)}%\n`;
      });
      
      message += '\n_Based on statistical analysis_';
      
      await m.reply(message.trim());
    } catch (error) {
      console.error(chalk.red('❌ Guess country error:'), error.message);
      await m.reply('❌ Failed to estimate country. Please try again later.');
    }
  },
  
  guessgender: async (m, sock, config) => {
    const name = m.body.split(' ').slice(1).join(' ').trim();
    
    if (!name) {
      return await m.reply('❌ Please provide a name!\n\nExample: .guessgender David');
    }
    
    try {
      const response = await axios.get(`https://api.genderize.io/?name=${name}`);
      const { count, gender, probability } = response.data;
      
      const genderEmoji = gender === 'male' ? '♂️' : gender === 'female' ? '♀️' : '⚧️';
      
      const message = `
${genderEmoji} *GENDER ESTIMATION*

👤 *Name:* ${name}
${genderEmoji} *Estimated Gender:* ${gender || 'Unknown'}
📊 *Confidence:* ${(probability * 100).toFixed(1)}%
📈 *Sample Size:* ${count || 0}

_Note: This is a statistical estimation_
      `.trim();
      
      await m.reply(message);
    } catch (error) {
      console.error(chalk.red('❌ Guess gender error:'), error.message);
      await m.reply('❌ Failed to estimate gender. Please try again later.');
    }
  },
  
  // Number Guessing Game
  guess: async (m, sock, config) => {
    const args = m.body.toLowerCase().split(' ').slice(1);
    const chatId = m.from;
    const sender = m.sender;
    
    // Check if game exists
    let game = gameStates.numberGuess.get(chatId);
    
    // Handle end command
    if (args[0] === 'end') {
      if (!game) {
        return await m.reply('❌ No active game to end!');
      }
      
      if (game.player !== sender && !utils.isPrivileged(sender, config)) {
        return await m.reply('❌ Only the player or admin can end the game!');
      }
      
      gameStates.numberGuess.delete(chatId);
      return await m.reply('✅ Number guessing game ended!');
    }
    
    // Check if game already running
    if (game && game.player === sender) {
      return await m.reply('❌ You already have an active game! Type a number to guess or .guess end to quit.');
    }
    
    // Start new game
    const mode = args[0] || 'easy';
    
    if (!['easy', 'medium', 'hard'].includes(mode)) {
      return await m.reply(`
🎮 *NUMBER GUESSING GAME*

Choose a difficulty:
• *Easy* - Numbers 1-100
• *Medium* - Numbers 1-1000  
• *Hard* - Numbers 1-10000

Example: .guess easy
      `.trim());
    }
    
    game = new NumberGuessingGame(sender, mode);
    gameStates.numberGuess.set(chatId, game);
    
    await m.reply(`
🎮 *NUMBER GUESSING GAME STARTED*

*Mode:* ${mode.toUpperCase()}
*Range:* ${game.getRange()}
*Player:* @${utils.cleanPhone(sender)}

I'm thinking of a number between ${game.getRange()}
Type your guess to start!

_Type .guess end to quit_
    `.trim(), { mentions: [sender] });
  },
  
  // Connect Four Game
  cfg: async (m, sock, config) => {
    const chatId = m.from;
    const sender = m.sender;
    let game = gameStates.connectFour.get(chatId);
    
    // End game command
    if (m.body.toLowerCase().includes('end')) {
      if (!game) {
        return await m.reply('❌ No active Connect Four game!');
      }
      
      if (![game.player1, game.player2].includes(sender) && !utils.isPrivileged(sender, config)) {
        return await m.reply('❌ Only players or admin can end the game!');
      }
      
      gameStates.connectFour.delete(chatId);
      return await m.reply('✅ Connect Four game ended!');
    }
    
    // Check if game exists
    if (game && game.player1 && game.player2) {
      return await m.reply(`
❌ A game is already in progress!

*Players:*
🔵 @${utils.cleanPhone(game.player1)}
🔴 @${utils.cleanPhone(game.player2)}

Type .delcfg to end the game
      `.trim(), { mentions: [game.player1, game.player2] });
    }
    
    // Get opponent
    const opponent = m.quoted?.sender || m.mentionedJid?.[0] || null;
    
    // Create or join game
    if (!game) {
      if (opponent && opponent !== sender) {
        // Start game immediately with mentioned player
        game = new ConnectFourGame(sender, opponent);
        gameStates.connectFour.set(chatId, game);
        
        await m.reply(`
🎮 *CONNECT FOUR STARTED*

${game.getBoardString()}

*Current Turn:* 🔵 @${utils.cleanPhone(game.currentPlayer)}
*Next:* 🔴 @${utils.cleanPhone(game.player2)}

Type a number (1-7) to drop your piece!
        `.trim(), { mentions: [game.player1, game.player2] });
      } else {
        // Create waiting room
        game = new ConnectFourGame(sender, null);
        gameStates.connectFour.set(chatId, game);
        
        await m.reply(`
🎮 *CONNECT FOUR WAITING*

*Player 1:* 🔵 @${utils.cleanPhone(sender)} joined!

Waiting for Player 2...
Type .cfg to join!
        `.trim(), { mentions: [sender] });
      }
    } else if (!game.player2 && sender !== game.player1) {
      // Join existing game
      game.player2 = sender;
      
      await m.reply(`
🎮 *CONNECT FOUR STARTED*

${game.getBoardString()}

*Current Turn:* 🔵 @${utils.cleanPhone(game.player1)}
*Next:* 🔴 @${utils.cleanPhone(game.player2)}

Type a number (1-7) to drop your piece!
      `.trim(), { mentions: [game.player1, game.player2] });
    }
  },
  
  delcfg: async (m, sock, config) => {
    const chatId = m.from;
    const sender = m.sender;
    const game = gameStates.connectFour.get(chatId);
    
    if (!game) {
      return await m.reply('❌ No active Connect Four game!');
    }
    
    if (![game.player1, game.player2].includes(sender) && !utils.isPrivileged(sender, config)) {
      return await m.reply('❌ Only players or admin can delete the game!');
    }
    
    gameStates.connectFour.delete(chatId);
    await m.reply('✅ Connect Four game deleted!');
  },
  
  // Tic Tac Toe
  ttt: async (m, sock, config) => {
    const chatId = m.from;
    const sender = m.sender;
    let game = gameStates.ticTacToe.get(chatId);
    
    // Check if game exists
    if (game && game.playerX && game.playerO) {
      return await m.reply('❌ A Tic Tac Toe game is already in progress!');
    }
    
    // Get opponent
    const opponent = m.quoted?.sender || m.mentionedJid?.[0] || null;
    
    if (!game) {
      if (opponent && opponent !== sender) {
        // Start game immediately
        game = new TicTacToeGame(sender, opponent);
        gameStates.ticTacToe.set(chatId, game);
        
        const board = game.render();
        await m.reply(`
🎮 *TIC TAC TOE STARTED*

${board[0]} │ ${board[1]} │ ${board[2]}
───┼───┼───
${board[3]} │ ${board[4]} │ ${board[5]}
───┼───┼───
${board[6]} │ ${board[7]} │ ${board[8]}

❌ @${utils.cleanPhone(game.playerX)}
⭕ @${utils.cleanPhone(game.playerO)}

*Current Turn:* @${utils.cleanPhone(game.currentTurn)}
Type a number (1-9) to make your move!
        `.trim(), { mentions: [game.playerX, game.playerO, game.currentTurn] });
      } else {
        // Create waiting room
        game = new TicTacToeGame(sender, null);
        gameStates.ticTacToe.set(chatId, game);
        
        await m.reply(`
🎮 *TIC TAC TOE WAITING*

*Player X:* @${utils.cleanPhone(sender)} joined!

Waiting for Player O...
Type .ttt to join!
        `.trim(), { mentions: [sender] });
      }
    } else if (!game.playerO && sender !== game.playerX) {
      // Join existing game
      game.playerO = sender;
      
      const board = game.render();
      await m.reply(`
🎮 *TIC TAC TOE STARTED*

${board[0]} │ ${board[1]} │ ${board[2]}
───┼───┼───
${board[3]} │ ${board[4]} │ ${board[5]}
───┼───┼───
${board[6]} │ ${board[7]} │ ${board[8]}

❌ @${utils.cleanPhone(game.playerX)}
⭕ @${utils.cleanPhone(game.playerO)}

*Current Turn:* @${utils.cleanPhone(game.currentTurn)}
Type a number (1-9) to make your move!
      `.trim(), { mentions: [game.playerX, game.playerO, game.currentTurn] });
    }
  },
  
  delttt: async (m, sock, config) => {
    const chatId = m.from;
    const sender = m.sender;
    const game = gameStates.ticTacToe.get(chatId);
    
    if (!game) {
      return await m.reply('❌ No active Tic Tac Toe game!');
    }
    
    if (![game.playerX, game.playerO].includes(sender) && !utils.isPrivileged(sender, config)) {
      return await m.reply('❌ Only players or admin can delete the game!');
    }
    
    gameStates.ticTacToe.delete(chatId);
    await m.reply('✅ Tic Tac Toe game deleted!');
  },
  
  // Capital Quiz
  capital: async (m, sock, config) => {
    const chatId = m.from;
    const sender = m.sender;
    
    // Check if player already has active game
    if (gameStates.capital.has(sender)) {
      return await m.reply('❌ You already have an active capital quiz! Answer it first.');
    }
    
    const game = new CapitalQuizGame(sender);
    gameStates.capital.set(sender, game);
    
    // Set timeout to end game after 30 seconds
    game.timeout = setTimeout(() => {
      if (gameStates.capital.has(sender)) {
        gameStates.capital.delete(sender);
        m.reply(`
⏰ *TIME'S UP!*

The capital of *${game.country}* is *${game.capital}*

Better luck next time!
        `.trim());
      }
    }, 30000);
    
    await m.reply(`
🌍 *CAPITAL QUIZ*

*What is the capital of ${game.country}?*

You have 3 attempts and 30 seconds!
Type your answer now!
    `.trim());
  },
  
  // Dice Roll
  dice: async (m, sock, config) => {
    const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const numbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
    
    const rolled = Math.floor(Math.random() * 6);
    
    await m.reply(`
🎲 *DICE ROLL*

${diceEmojis[rolled]}

You rolled: ${numbers[rolled]}
    `.trim());
  },
  
  // Game Stats
  gamestats: async (m, sock, config) => {
    const stats = {
      numberGuess: gameStates.numberGuess.size,
      connectFour: gameStates.connectFour.size,
      ticTacToe: gameStates.ticTacToe.size,
      capital: gameStates.capital.size,
      total: 0
    };
    
    stats.total = stats.numberGuess + stats.connectFour + stats.ticTacToe + stats.capital;
    
    await m.reply(`
📊 *ACTIVE GAMES*

🎮 Number Guess: ${stats.numberGuess}
🔴 Connect Four: ${stats.connectFour}
❌ Tic Tac Toe: ${stats.ticTacToe}
🌍 Capital Quiz: ${stats.capital}

*Total Active:* ${stats.total}
    `.trim());
  }
};

// ============================================
// MESSAGE HANDLER FOR GAME MOVES
// ============================================
async function handleGameMove(m, sock, config) {
  const text = m.body?.trim();
  if (!text || text.startsWith(config.PREFIX)) return;
  
  const chatId = m.from;
  const sender = m.sender;
  
  // Check for number input (game moves)
  const num = parseInt(text);
  if (isNaN(num)) {
    // Check for capital quiz answer
    const capitalGame = gameStates.capital.get(sender);
    if (capitalGame) {
      const isCorrect = capitalGame.checkAnswer(text);
      
      if (isCorrect) {
        const stats = capitalGame.getStats();
        clearTimeout(capitalGame.timeout);
        gameStates.capital.delete(sender);
        
        // Award money
        try {
          await PluginHelpers.addMoney(sender, 500, 'Capital Quiz Win');
        } catch (error) {
          console.error('Failed to add money:', error.message);
        }
        
        await m.reply(`
✅ *CORRECT!*

The capital of *${capitalGame.country}* is *${capitalGame.capital}*

*Stats:*
• Attempts: ${stats.attempts}
• Time: ${stats.timeTaken}s
• Reward: ₦500

Well done! 🎉
        `.trim());
      } else if (capitalGame.hasAttemptsLeft()) {
        await m.reply(`
❌ *INCORRECT!*

You have ${capitalGame.maxAttempts - capitalGame.attempts} attempts left.
Try again!
        `.trim());
      } else {
        clearTimeout(capitalGame.timeout);
        gameStates.capital.delete(sender);
        
        await m.reply(`
❌ *GAME OVER!*

The capital of *${capitalGame.country}* is *${capitalGame.capital}*

Better luck next time!
        `.trim());
      }
    }
    return;
  }
  
  // Handle Number Guessing
  const guessGame = gameStates.numberGuess.get(chatId);
  if (guessGame && guessGame.player === sender) {
    const result = guessGame.guess(num);
    
    if (result === 'correct') {
      const stats = guessGame.getStats();
      gameStates.numberGuess.delete(chatId);
      
      // Award money based on difficulty
      const rewards = { easy: 100, medium: 300, hard: 1000 };
      const reward = rewards[guessGame.mode.toLowerCase()] || 100;
      
      try {
        await PluginHelpers.addMoney(sender, reward, 'Number Guess Win');
      } catch (error) {
        console.error('Failed to add money:', error.message);
      }
      
      await m.reply(`
🎉 *CONGRATULATIONS!*

You guessed the correct number: *${stats.number}*

*Stats:*
• Mode: ${guessGame.mode.toUpperCase()}
• Attempts: ${stats.attempts}
• Time: ${stats.timeTaken}s
• Reward: ${utils.formatMoney(reward)}

Excellent work! 🏆
      `.trim(), { mentions: [sender] });
    } else {
      const hint = result === 'low' ? 'higher ⬆️' : 'lower ⬇️';
      await m.reply(`
${result === 'low' ? '📈' : '📉'} *TRY ${hint.toUpperCase()}*

Your guess *${num}* is too ${result}!
Attempt: ${guessGame.attempts}

Keep guessing!
      `.