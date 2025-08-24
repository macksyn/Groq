// plugins/daily_task.js - Daily Task System compatible with PluginManager
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Daily Task System',
  version: '1.0.0',
  author: 'Bot Developer',
  description: 'Daily quiz task system with themed questions, streaks, and MongoDB persistence',
  commands: [
    {
      name: 'task',
      aliases: ['dailytask', 'dt'],
      description: 'Access the daily task system'
    },
    {
      name: 'taskstats',
      aliases: ['mystats'],
      description: 'View your task statistics'
    },
    {
      name: 'testtask',
      aliases: ['testdt'],
      description: 'Test task answer validation'
    }
  ]
};

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'whatsapp_bot';
const COLLECTIONS = {
  USERS: 'task_users',
  TASK_RECORDS: 'task_records',
  QUESTIONS: 'task_questions',
  SETTINGS: 'task_settings',
  DAILY_TASKS: 'daily_tasks'
};

// Database connection
let db = null;
let mongoClient = null;

// Initialize MongoDB connection
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    // Create indexes for better performance
    await db.collection(COLLECTIONS.USERS).createIndex({ userId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.TASK_RECORDS).createIndex({ userId: 1, date: -1 });
    await db.collection(COLLECTIONS.TASK_RECORDS).createIndex({ date: -1 });
    await db.collection(COLLECTIONS.QUESTIONS).createIndex({ category: 1 });
    await db.collection(COLLECTIONS.DAILY_TASKS).createIndex({ date: 1 }, { unique: true });
    
    console.log('✅ MongoDB connected successfully for Daily Tasks');
    
    // Initialize question database if empty
    await initializeQuestionDatabase();
    
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed for Daily Tasks:', error);
    throw error;
  }
}

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default task settings
const defaultSettings = {
  baseReward: 300, // Reduced base reward for hybrid system
  correctnessBonus: 50, // Bonus per correct answer
  enableStreakBonus: true,
  streakBonusMultiplier: 1.5,
  minStreakForBonus: 3,
  autoPostTime: '08:00', // 8:00 AM Nigeria time
  autoPostEnabled: true,
  questionCount: 5,
  submissionDeadline: '23:59', // 11:59 PM
  adminNumbers: [],
  groupJids: [], // Support multiple groups
  tagAllMembers: true,
  minAnswerLength: 2, // Minimum answer length
  showCorrectAnswers: false, // Don't show correct answers immediately
  themes: {
    monday: 'Business Ideas & Entrepreneurship',
    tuesday: 'General Knowledge',
    wednesday: 'Hygiene & Health',
    thursday: 'Current Affairs & News',
    friday: 'Science & Technology',
    saturday: 'Fun Facts & Entertainment',
    sunday: 'Mixed Topics'
  }
};

// Load settings from database
let taskSettings = { ...defaultSettings };

async function loadSettings() {
  try {
    const settings = await db.collection(COLLECTIONS.SETTINGS).findOne({ type: 'daily_task' });
    if (settings) {
      taskSettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading task settings:', error);
  }
}

// Save settings to database
async function saveSettings() {
  try {
    await db.collection(COLLECTIONS.SETTINGS).replaceOne(
      { type: 'daily_task' },
      { type: 'daily_task', data: taskSettings, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving task settings:', error);
  }
}

// =======================
// 📚 QUESTION DATABASE
// =======================
const questionDatabase = {
  business: [
    { question: "What business can you start with just ₦20,000?", type: "open", category: "business", correctAnswer: "Any small retail business, food vending, digital services, etc." },
    { question: "Name one skill you can monetize online", type: "open", category: "business", correctAnswer: "Writing, graphic design, programming, tutoring, etc." },
    { question: "What does ROI stand for in business?", type: "open", category: "business", correctAnswer: "Return on Investment" },
    { question: "Which social media platform is best for business marketing in Nigeria?", type: "open", category: "business", correctAnswer: "Instagram, Facebook, WhatsApp, etc." },
    { question: "What is the first step in starting any business?", type: "open", category: "business", correctAnswer: "Market research, business planning, identifying target audience, etc." },
    { question: "Name one way to fund your startup business", type: "open", category: "business", correctAnswer: "Personal savings, loans, investors, grants, etc." },
    { question: "What is a business plan?", type: "open", category: "business", correctAnswer: "A detailed document outlining business goals and strategies" },
    { question: "How can you identify your target market?", type: "open", category: "business", correctAnswer: "Market research, surveys, demographics analysis, etc." },
    { question: "What is the difference between profit and revenue?", type: "open", category: "business", correctAnswer: "Revenue is total income, profit is revenue minus expenses" },
    { question: "Name one digital skill that's in high demand", type: "open", category: "business", correctAnswer: "Web development, digital marketing, data analysis, etc." },
    { question: "What does 'minimum viable product' (MVP) mean?", type: "open", category: "business", correctAnswer: "Basic version of product with essential features" },
    { question: "How can you market your business for free?", type: "open", category: "business", correctAnswer: "Social media, word of mouth, networking, content marketing, etc." },
    { question: "What is customer retention?", type: "open", category: "business", correctAnswer: "Keeping existing customers engaged and loyal" },
    { question: "Name one way to reduce business costs", type: "open", category: "business", correctAnswer: "Automation, bulk purchasing, remote work, etc." },
    { question: "What is the importance of networking in business?", type: "open", category: "business", correctAnswer: "Building relationships, finding opportunities, partnerships, etc." }
  ],
  
  general: [
    { question: "What is the capital of Nigeria?", type: "open", category: "general", correctAnswer: "Abuja" },
    { question: "How many states are in Nigeria?", type: "open", category: "general", correctAnswer: "36" },
    { question: "What year did Nigeria gain independence?", type: "open", category: "general", correctAnswer: "1960" },
    { question: "What is the largest continent in the world?", type: "open", category: "general", correctAnswer: "Asia" },
    { question: "How many days are in a leap year?", type: "open", category: "general", correctAnswer: "366" },
    { question: "What is the currency of Ghana?", type: "open", category: "general", correctAnswer: "Cedi" },
    { question: "Who wrote the Nigerian national anthem?", type: "open", category: "general", correctAnswer: "Benedict Elide Odiase" },
    { question: "What does www stand for?", type: "open", category: "general", correctAnswer: "World Wide Web" },
    { question: "How many minutes are in a full day?", type: "open", category: "general", correctAnswer: "1440" },
    { question: "What is the smallest country in the world?", type: "open", category: "general", correctAnswer: "Vatican City" },
    { question: "How many sides does a triangle have?", type: "open", category: "general", correctAnswer: "3" },
    { question: "What is the largest ocean in the world?", type: "open", category: "general", correctAnswer: "Pacific Ocean" },
    { question: "In which year was WhatsApp founded?", type: "open", category: "general", correctAnswer: "2009" },
    { question: "What does GPS stand for?", type: "open", category: "general", correctAnswer: "Global Positioning System" },
    { question: "How many hours are in a week?", type: "open", category: "general", correctAnswer: "168" }
  ],
  
  hygiene: [
    { question: "How many times should you brush your teeth daily?", type: "open", category: "hygiene", correctAnswer: "2" },
    { question: "How long should you wash your hands to kill germs?", type: "open", category: "hygiene", correctAnswer: "20 seconds" },
    { question: "How often should you change your toothbrush?", type: "open", category: "hygiene", correctAnswer: "Every 3 months" },
    { question: "What is the recommended time for daily exercise?", type: "open", category: "hygiene", correctAnswer: "30 minutes" },
    { question: "How many glasses of water should you drink daily?", type: "open", category: "hygiene", correctAnswer: "8" },
    { question: "How often should you wash your hair?", type: "open", category: "hygiene", correctAnswer: "2-3 times per week" },
    { question: "What should you do before eating?", type: "open", category: "hygiene", correctAnswer: "Wash your hands" },
    { question: "How many hours of sleep do adults need daily?", type: "open", category: "hygiene", correctAnswer: "7-9" },
    { question: "Name one benefit of regular bathing", type: "open", category: "hygiene", correctAnswer: "Removes dirt, prevents odor, maintains health, etc." },
    { question: "What is the best way to prevent body odor?", type: "open", category: "hygiene", correctAnswer: "Regular bathing, deodorant, clean clothes, etc." },
    { question: "How often should you clip your nails?", type: "open", category: "hygiene", correctAnswer: "Weekly" },
    { question: "Why is it important to wash fruits before eating?", type: "open", category: "hygiene", correctAnswer: "Remove germs, dirt, chemicals, etc." },
    { question: "What should you cover your mouth with when coughing?", type: "open", category: "hygiene", correctAnswer: "Elbow, tissue, handkerchief, etc." },
    { question: "How often should you change your bed sheets?", type: "open", category: "hygiene", correctAnswer: "Weekly" },
    { question: "Name one way to maintain oral hygiene", type: "open", category: "hygiene", correctAnswer: "Brushing, flossing, mouthwash, etc." }
  ],
  
  current_affairs: [
    { question: "Who is the current President of Nigeria?", type: "open", category: "current_affairs", correctAnswer: "Bola Ahmed Tinubu" },
    { question: "What is the current minimum wage in Nigeria?", type: "open", category: "current_affairs", correctAnswer: "₦70,000" },
    { question: "Which year was the new naira notes introduced?", type: "open", category: "current_affairs", correctAnswer: "2022" },
    { question: "What does CBN stand for?", type: "open", category: "current_affairs", correctAnswer: "Central Bank of Nigeria" },
    { question: "Name Nigeria's current Vice President", type: "open", category: "current_affairs", correctAnswer: "Kashim Shettima" },
    { question: "What is the current exchange rate trend of Naira to Dollar?", type: "open", category: "current_affairs", correctAnswer: "Rising, volatile, fluctuating, etc." },
    { question: "Which state recently conducted local government elections?", type: "open", category: "current_affairs", correctAnswer: "Various states (accept any recent)" },
    { question: "What major tech company recently invested in Nigeria?", type: "open", category: "current_affairs", correctAnswer: "Google, Microsoft, Meta, etc." },
    { question: "Name one current challenge facing Nigerian youth", type: "open", category: "current_affairs", correctAnswer: "Unemployment, inflation, education, etc." },
    { question: "What is the current fuel price per liter in Nigeria?", type: "open", category: "current_affairs", correctAnswer: "₦600-700 (varies)" },
    { question: "Which Nigerian state is known for oil production?", type: "open", category: "current_affairs", correctAnswer: "Rivers, Delta, Akwa Ibom, etc." },
    { question: "What does NYSC stand for?", type: "open", category: "current_affairs", correctAnswer: "National Youth Service Corps" },
    { question: "Name one major road project currently ongoing in Nigeria", type: "open", category: "current_affairs", correctAnswer: "Lagos-Ibadan expressway, 2nd Niger Bridge, etc." },
    { question: "What is the current population estimate of Nigeria?", type: "open", category: "current_affairs", correctAnswer: "220+ million" },
    { question: "Which Nigerian bank was recently recapitalized?", type: "open", category: "current_affairs", correctAnswer: "Various banks (accept reasonable answers)" }
  ],
  
  science: [
    { question: "What gas do plants absorb from the atmosphere?", type: "open", category: "science", correctAnswer: "Carbon dioxide" },
    { question: "Which planet is closest to the Sun?", type: "open", category: "science", correctAnswer: "Mercury" },
    { question: "What does DNA stand for?", type: "open", category: "science", correctAnswer: "Deoxyribonucleic acid" },
    { question: "How many bones are in the human body?", type: "open", category: "science", correctAnswer: "206" },
    { question: "What is the chemical symbol for water?", type: "open", category: "science", correctAnswer: "H2O" },
    { question: "Which organ pumps blood through the human body?", type: "open", category: "science", correctAnswer: "Heart" },
    { question: "What is the speed of light?", type: "open", category: "science", correctAnswer: "300,000 km/s" },
    { question: "How many chambers does a human heart have?", type: "open", category: "science", correctAnswer: "4" },
    { question: "What is the largest organ in the human body?", type: "open", category: "science", correctAnswer: "Skin" },
    { question: "Which gas makes up most of Earth's atmosphere?", type: "open", category: "science", correctAnswer: "Nitrogen" },
    { question: "What is photosynthesis?", type: "open", category: "science", correctAnswer: "Plants making food using sunlight" },
    { question: "How many teeth does an adult human have?", type: "open", category: "science", correctAnswer: "32" },
    { question: "What is the hardest natural substance on Earth?", type: "open", category: "science", correctAnswer: "Diamond" },
    { question: "Which blood type is considered universal donor?", type: "open", category: "science", correctAnswer: "O negative" },
    { question: "What does CPU stand for in computers?", type: "open", category: "science", correctAnswer: "Central Processing Unit" }
  ],
  
  fun_facts: [
    { question: "Which animal is known as the King of the Jungle?", type: "open", category: "fun_facts", correctAnswer: "Lion" },
    { question: "How many legs does a spider have?", type: "open", category: "fun_facts", correctAnswer: "8" },
    { question: "What is the tallest building in the world?", type: "open", category: "fun_facts", correctAnswer: "Burj Khalifa" },
    { question: "Which country has the most time zones?", type: "open", category: "fun_facts", correctAnswer: "France" },
    { question: "What is the most spoken language in the world?", type: "open", category: "fun_facts", correctAnswer: "Mandarin Chinese" },
    { question: "How many strings does a guitar have?", type: "open", category: "fun_facts", correctAnswer: "6" },
    { question: "Which fruit is known as the king of fruits?", type: "open", category: "fun_facts", correctAnswer: "Mango" },
    { question: "What is the fastest land animal?", type: "open", category: "fun_facts", correctAnswer: "Cheetah" },
    { question: "How many colors are in a rainbow?", type: "open", category: "fun_facts", correctAnswer: "7" },
    { question: "Which planet is known as the Red Planet?", type: "open", category: "fun_facts", correctAnswer: "Mars" },
    { question: "What is the largest mammal in the world?", type: "open", category: "fun_facts", correctAnswer: "Blue whale" },
    { question: "How many players are on a football team on the field?", type: "open", category: "fun_facts", correctAnswer: "11" },
    { question: "Which bird can't fly but can run very fast?", type: "open", category: "fun_facts", correctAnswer: "Ostrich" },
    { question: "What is the hottest planet in our solar system?", type: "open", category: "fun_facts", correctAnswer: "Venus" },
    { question: "How many lives are cats said to have?", type: "open", category: "fun_facts", correctAnswer: "9" }
  ]
};

// Initialize question database
async function initializeQuestionDatabase() {
  try {
    const existingQuestions = await db.collection(COLLECTIONS.QUESTIONS).countDocuments();
    
    if (existingQuestions === 0) {
      console.log('🔄 Initializing question database...');
      
      const allQuestions = [];
      Object.entries(questionDatabase).forEach(([category, questions]) => {
        questions.forEach(question => {
          allQuestions.push({
            ...question,
            createdAt: new Date(),
            addedBy: 'system',
            active: true
          });
        });
      });
      
      await db.collection(COLLECTIONS.QUESTIONS).insertMany(allQuestions);
      console.log(`✅ Initialized ${allQuestions.length} questions in database`);
    }
  } catch (error) {
    console.error('Error initializing question database:', error);
  }
}

// =======================
// 🎯 TASK FUNCTIONS
// =======================

// Get current Nigeria time
function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

// Get current date in Nigeria timezone
function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

// Get theme for current day
function getCurrentTheme() {
  const today = getNigeriaTime().format('dddd').toLowerCase();
  return taskSettings.themes[today] || taskSettings.themes.sunday;
}

// Get category for current day
function getCurrentCategory() {
  const today = getNigeriaTime().format('dddd').toLowerCase();
  const categoryMap = {
    monday: 'business',
    tuesday: 'general',
    wednesday: 'hygiene',
    thursday: 'current_affairs',
    friday: 'science',
    saturday: 'fun_facts',
    sunday: 'general' // mixed - use general as default
  };
  
  return categoryMap[today] || 'general';
}

// Get random questions from database
async function getRandomQuestions(category, count = 5) {
  try {
    let questions;
    
    if (category === 'mixed') {
      // For mixed, get questions from all categories
      questions = await db.collection(COLLECTIONS.QUESTIONS)
        .aggregate([
          { $match: { active: true } },
          { $sample: { size: count } }
        ])
        .toArray();
    } else {
      // Get questions from specific category
      questions = await db.collection(COLLECTIONS.QUESTIONS)
        .aggregate([
          { $match: { category: category, active: true } },
          { $sample: { size: count } }
        ])
        .toArray();
      
      // If not enough questions in category, supplement with general questions
      if (questions.length < count) {
        const needed = count - questions.length;
        const supplementQuestions = await db.collection(COLLECTIONS.QUESTIONS)
          .aggregate([
            { $match: { category: 'general', active: true } },
            { $sample: { size: needed } }
          ])
          .toArray();
        
        questions = [...questions, ...supplementQuestions];
      }
    }
    
    return questions.slice(0, count);
  } catch (error) {
    console.error('Error getting random questions:', error);
    return [];
  }
}

// Create daily task
async function createDailyTask(groupJid) {
  try {
    const today = getCurrentDate();
    const theme = getCurrentTheme();
    const category = getCurrentCategory();
    
    // Check if task already exists for today
    const existingTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    if (existingTask) {
      return existingTask;
    }
    
    // Get random questions
    const questions = await getRandomQuestions(category, taskSettings.questionCount);
    
    if (questions.length === 0) {
      throw new Error('No questions available');
    }
    
    // Create task document
    const taskData = {
      date: today,
      groupJid: groupJid,
      theme: theme,
      category: category,
      questions: questions,
      completions: [],
      postedAt: new Date(),
      deadline: taskSettings.submissionDeadline
    };
    
    await db.collection(COLLECTIONS.DAILY_TASKS).insertOne(taskData);
    console.log(`✅ Daily task created for ${today}`);
    
    return taskData;
  } catch (error) {
    console.error('Error creating daily task:', error);
    throw error;
  }
}

// Format daily task message
function formatDailyTaskMessage(taskData) {
  const nigeriaTime = getNigeriaTime();
  const dayName = nigeriaTime.format('dddd');
  const dateStr = nigeriaTime.format('MMMM DD, YYYY');
  
  let message = `🏢 *GIST HQ - DAILY TASK CHALLENGE* 🏢\n\n`;
  message += `📅 ${dayName}, ${dateStr}\n`;
  message += `🎯 *Today's Theme:* ${taskData.theme.toUpperCase()}\n\n`;
  message += `📝 *Answer all ${taskData.questions.length} questions to earn your reward!*\n`;
  message += `⏰ *Deadline:* ${taskData.deadline} today\n\n`;
  
  // Add questions
  taskData.questions.forEach((q, index) => {
    message += `${index + 1}️⃣ ${q.question}\n\n`;
  });
  
  message += `💰 *Reward:* ₦${taskSettings.baseReward.toLocaleString()} for completion\n`;
  
  if (taskSettings.enableStreakBonus) {
    const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
    message += `🔥 *Streak Bonus:* +${bonusPercent}% after ${taskSettings.minStreakForBonus} consecutive days\n`;
  }
  
  message += `\n📋 *Reply format:* 1. [answer] 2. [answer] 3. [answer] 4. [answer] 5. [answer]\n`;
  message += `✨ *Good luck, GIST HQ family!* ✨`;
  
  return message;
}

// Get all group members (for silent tagging)
async function getGroupMembers(sock, groupJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    return groupMetadata.participants.map(participant => participant.id);
  } catch (error) {
    console.error('Error getting group members:', error);
    return [];
  }
}

// Post daily task with silent member tagging
async function postDailyTask(sock, groupJid) {
  try {
    // Create or get today's task
    const taskData = await createDailyTask(groupJid);
    
    // Format message
    const message = formatDailyTaskMessage(taskData);
    
    // Get group members for silent tagging
    let mentions = [];
    if (taskSettings.tagAllMembers) {
      mentions = await getGroupMembers(sock, groupJid);
    }
    
    // Send message with silent mentions
    await sock.sendMessage(groupJid, {
      text: message,
      mentions: mentions // This creates silent notifications without visible @mentions
    });
    
    console.log(`✅ Daily task posted to group ${groupJid}`);
    return true;
  } catch (error) {
    console.error('Error posting daily task:', error);
    return false;
  }
}

// Validate answer format and check if answers are actual responses (not questions)
function validateAnswerFormat(text) {
  // Look for numbered answers (1. answer 2. answer etc.)
  const answerPattern = /(\d+)\.\s*([^0-9]+?)(?=\s*\d+\.|$)/g;
  const answers = [];
  let match;
  
  // Keywords that indicate questions rather than answers
  const questionKeywords = [
    'what', 'how', 'when', 'where', 'why', 'which', 'who',
    'can you', 'do you', 'is it', 'are you', 'does it',
    'business can you start', 'skill you can monetize',
    'social media platform', 'first step in starting',
    'gas do plants absorb', 'planet is closest',
    'times should you', 'glasses of water',
    'current president', 'minimum wage',
    'animal is known', 'legs does a spider',
    'stand for', 'many', '?'
  ];
  
  while ((match = answerPattern.exec(text)) !== null) {
    const questionNum = parseInt(match[1]);
    let answer = match[2].trim();
    
    if (answer.length > 2) { // At least 3 characters
      // Remove question part if user copied question and added answer
      // Look for patterns like "Question? Answer" or "Question Answer"
      const sentences = answer.split(/[?.!]/);
      if (sentences.length > 1) {
        // Take the last meaningful sentence as the answer
        const lastSentence = sentences[sentences.length - 1].trim();
        if (lastSentence.length > 2) {
          answer = lastSentence;
        }
      }
      
      // Check if this still looks like a question rather than an answer
      const lowerAnswer = answer.toLowerCase();
      const isQuestion = questionKeywords.some(keyword => 
        lowerAnswer.includes(keyword) || 
        lowerAnswer.endsWith('?') ||
        lowerAnswer.startsWith('what ') ||
        lowerAnswer.startsWith('how ') ||
        lowerAnswer.startsWith('which ') ||
        lowerAnswer.startsWith('when ') ||
        lowerAnswer.startsWith('where ')
      );
      
      // Only accept if it doesn't look like a question
      if (!isQuestion) {
        answers[questionNum - 1] = answer;
      }
    }
  }
  
  return answers;
}

// Update user streak
function updateTaskStreak(userId, userData, today) {
  const yesterday = moment.tz('Africa/Lagos').subtract(1, 'day').format('DD-MM-YYYY');

  if (userData.lastTaskCompletion === yesterday) {
    userData.taskStreak = (userData.taskStreak || 0) + 1;
  } else if (userData.lastTaskCompletion !== today) {
    userData.taskStreak = 1;
  }

  if (userData.taskStreak > (userData.longestTaskStreak || 0)) {
    userData.longestTaskStreak = userData.taskStreak;
  }

  return userData.taskStreak;
}

// Add money to user balance
async function addMoney(userId, amount, reason = 'Daily task reward') {
  try {
    return await unifiedUserManager.addMoney(userId, amount, reason);
  } catch (error) {
    console.error('Error adding money:', error);
    throw error;
  }
}

// Get user data
async function getUserData(userId) {
  try {
    return await unifiedUserManager.getUserData(userId);
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
}

// Update user data
async function updateUserData(userId, data) {
  try {
    return await unifiedUserManager.updateUserData(userId, data);
  } catch (error) {
    console.error('Error updating user data:', error);
    throw error;
  }
}

// Initialize user
async function initUser(userId) {
  try {
    return await unifiedUserManager.initUser(userId);
  } catch (error) {
    console.error('Error initializing user:', error);
    throw error;
  }
}

// Process task submission with correctness checking
async function processTaskSubmission(m, sock, config) {
  try {
    const messageText = m.body || '';
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const today = getCurrentDate();
    
    // Check if this looks like task answers (contains numbered answers)
    const answers = validateAnswerFormat(messageText);
    if (answers.length < taskSettings.questionCount) {
      return false; // Not a valid task submission
    }
    
    console.log(`📝 Task submission detected from ${senderId}`);
    
    // Get today's task
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    if (!todayTask) {
      await sock.sendMessage(from, {
        text: `❌ *No active task found for today.*\n\nUse *${config.PREFIX}task* to check current status.`
      }, { quoted: m });
      return true;
    }
    
    // Check if user already completed today's task
    const hasCompleted = todayTask.completions.some(completion => completion.userId === senderId);
    if (hasCompleted) {
      await sock.sendMessage(from, {
        text: `📝 *You've already completed today's task!*\n\nCome back tomorrow for the next challenge. 🚀`
      }, { quoted: m });
      return true;
    }
    
    // Initialize user
    await initUser(senderId);
    const userData = await getUserData(senderId);
    
    // Check answers and calculate correctness
    let correctCount = 0;
    const answerResults = [];
    
    for (let i = 0; i < todayTask.questions.length; i++) {
      const question = todayTask.questions[i];
      const userAnswer = answers[i] || '';
      const isCorrect = checkAnswerCorrectness(userAnswer, question.correctAnswer, question.question);
      
      if (isCorrect) correctCount++;
      
      answerResults.push({
        questionNumber: i + 1,
        question: question.question,
        userAnswer: userAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect: isCorrect
      });
    }
    
    // Update streak
    const currentStreak = updateTaskStreak(senderId, userData, today);
    
    // Calculate hybrid reward
    let baseReward = taskSettings.baseReward;
    let correctnessBonus = correctCount * taskSettings.correctnessBonus;
    let streakBonus = 0;
    
    // Apply streak bonus to base reward only
    if (taskSettings.enableStreakBonus && currentStreak >= taskSettings.minStreakForBonus) {
      const originalBase = baseReward;
      baseReward = Math.floor(baseReward * taskSettings.streakBonusMultiplier);
      streakBonus = baseReward - originalBase;
    }
    
    const finalReward = baseReward + correctnessBonus;
    
    // Add money to user's wallet
    await addMoney(senderId, finalReward, 'Daily task completion');
    
    // Update user data
    await updateUserData(senderId, {
      lastTaskCompletion: today,
      totalTaskCompletions: (userData.totalTaskCompletions || 0) + 1,
      taskStreak: currentStreak,
      longestTaskStreak: userData.longestTaskStreak,
      totalCorrectAnswers: (userData.totalCorrectAnswers || 0) + correctCount
    });
    
    // Add completion to today's task
    const completionData = {
      userId: senderId,
      userPhone: senderId.split('@')[0],
      answers: answers,
      answerResults: answerResults,
      correctCount: correctCount,
      submittedAt: new Date(),
      baseReward: baseReward,
      correctnessBonus: correctnessBonus,
      totalReward: finalReward,
      streak: currentStreak
    };
    
    await db.collection(COLLECTIONS.DAILY_TASKS).updateOne(
      { date: today },
      { $push: { completions: completionData } }
    );
    
    // Save individual task record
    await db.collection(COLLECTIONS.TASK_RECORDS).insertOne({
      userId: senderId,
      date: today,
      answers: answers,
      answerResults: answerResults,
      correctCount: correctCount,
      baseReward: baseReward,
      correctnessBonus: correctnessBonus,
      totalReward: finalReward,
      streak: currentStreak,
      submittedAt: new Date()
    });
    
    // Get updated user data
    const updatedUserData = await getUserData(senderId);
    
    // Build success message
    let successMessage = `✅ *TASK COMPLETED!* ✅\n\n`;
    successMessage += `📊 Score: ${correctCount}/${todayTask.questions.length} correct\n\n`;
    successMessage += `💰 *Rewards:*\n`;
    successMessage += `• Base: ₦${taskSettings.baseReward.toLocaleString()}\n`;
    
    if (streakBonus > 0) {
      const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
      successMessage += `• Streak: +₦${streakBonus.toLocaleString()} (${bonusPercent}%)\n`;
    }
    
    successMessage += `• Correct: +₦${correctnessBonus.toLocaleString()}\n`;
    successMessage += `• *Total: ₦${finalReward.toLocaleString()}*\n\n`;
    successMessage += `💸 Balance: ₦${(updatedUserData.balance || 0).toLocaleString()}\n`;
    successMessage += `🔥 Streak: ${currentStreak} days\n\n`;
    
    // Simple right/wrong indicators only (no correct answers shown)
    successMessage += `📝 Results: `;
    answerResults.forEach((result, index) => {
      successMessage += result.isCorrect ? '✅' : '❌';
    });
    
    successMessage += `\n\n🎉 Great work! 🚀`;
    
    await sock.sendMessage(from, {
      text: successMessage
    }, { quoted: m });
    
    // Update and send completion list
    await sendCompletionUpdate(sock, from, today);
    
    return true;
  } catch (error) {
    console.error('Error processing task submission:', error);
    return false;
  }
}

// Send completion update with member mentions
async function sendCompletionUpdate(sock, groupJid, date = null) {
  try {
    const targetDate = date || getCurrentDate();
    
    // Get today's task with completions
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: targetDate });
    if (!todayTask) return;
    
    const completions = todayTask.completions || [];
    const totalMembers = await getGroupMembers(sock, groupJid);
    
    let updateMessage = `📊 *GIST HQ - TASK COMPLETION STATUS* 📊\n\n`;
    updateMessage += `📅 Date: ${targetDate}\n`;
    updateMessage += `🎯 Theme: ${todayTask.theme}\n\n`;
    
    if (completions.length === 0) {
      updateMessage += `❌ *No completions yet today*\n`;
      updateMessage += `💪 Be the first to complete today's task!`;
    } else {
      updateMessage += `✅ *COMPLETED TODAY (${completions.length}/${totalMembers.length} members):*\n\n`;
      
      // Create mentions array for completed users
      const mentions = [];
      
      completions.forEach((completion, index) => {
        const userJid = completion.userId;
        const userPhone = userJid.split('@')[0];
        mentions.push(userJid);
        
        updateMessage += `${index + 1}. @${userPhone}`;
        
        if (completion.streak > 1) {
          updateMessage += ` - 🔥 Streak: ${completion.streak} days`;
        }
        
        updateMessage += '\n';
      });
      
      const remaining = totalMembers.length - completions.length;
      updateMessage += `\n💪 *Keep it up! ${remaining} members still pending...*`;
      
      // Send with mentions
      await sock.sendMessage(groupJid, {
        text: updateMessage,
        mentions: mentions
      });
      
      return;
    }
    
    // Send without mentions for no completions
    await sock.sendMessage(groupJid, {
      text: updateMessage
    });
    
  } catch (error) {
    console.error('Error sending completion update:', error);
  }
}

// Check if user is authorized (admin or group admin)
async function isAuthorized(sock, from, sender) {
  // Check if user is in admin list
  if (taskSettings.adminNumbers.includes(sender.split('@')[0])) {
    return true;
  }
  
  // Check owner/admin from environment
  const ownerNumber = process.env.OWNER_NUMBER || '';
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  
  if (sender.split('@')[0] === ownerNumber || adminNumbers.includes(sender.split('@')[0])) {
    return true;
  }
  
  // Check if user is group admin
  try {
    if (!from.endsWith('@g.us')) return false;
    
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(participant => participant.admin === 'admin' || participant.admin === 'superadmin')
      .map(participant => participant.id);

    return groupAdmins.includes(sender);
  } catch (error) {
    console.error('Error checking group admin:', error);
    return false;
  }
}

// =======================
// 🤖 MAIN PLUGIN HANDLER
// =======================

// Main plugin handler function
export default async function dailyTaskHandler(m, sock, config) {
  try {
    // Initialize database connection
    if (!db) {
      await initDatabase();
      await loadSettings();
    }
    
    // Set group JID for auto-posting if this is a group message
    if (m.key.remoteJid.endsWith('@g.us')) {
      await setGroupJid(m.key.remoteJid);
    }
    
    // Auto-detect task submissions (not starting with prefix)
    if (m.body && !m.body.startsWith(config.PREFIX)) {
      const handled = await processTaskSubmission(m, sock, config);
      if (handled) return; // Submission was processed, exit early
    }
    
    // Handle commands
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    
    // Helper function for sending replies
    const reply = async (text) => {
      await sock.sendMessage(from, { text }, { quoted: m });
    };
    
    // Handle different commands
    switch (command) {
      case 'task':
      case 'dailytask':
      case 'dt':
        if (args.length === 1) {
          await showTaskMenu(reply, config.PREFIX);
        } else {
          await handleSubCommand(args[1], args.slice(2), { m, sock, config, senderId, from, reply });
        }
        break;
        
      case 'taskstats':
      case 'mystats':
        await handleTaskStats({ m, sock, config, senderId, from, reply });
        break;
        
      case 'testtask':
      case 'testdt':
        await handleTestTask({ m, sock, config, senderId, from, reply }, args.slice(1));
        break;
    }
  } catch (error) {
    console.error('❌ Daily Task plugin error:', error);
  }
}

// Handle subcommands for the main task command
async function handleSubCommand(subCommand, args, context) {
  switch (subCommand.toLowerCase()) {
    case 'post':
      await handlePostTask(context, args);
      break;
    case 'current':
      await handleCurrentTask(context);
      break;
    case 'stats':
      await handleTaskStats(context);
      break;
    case 'settings':
      await handleTaskSettings(context, args);
      break;
    case 'questions':
      await handleQuestionsManager(context, args);
      break;
    case 'completions':
      await handleCompletionsView(context, args);
      break;
    case 'records':
      await handleTaskRecords(context, args);
      break;
    case 'help':
      await showTaskMenu(context.reply, context.config.PREFIX);
      break;
    default:
      await context.reply(`❓ Unknown task command: *${subCommand}*\n\nUse *${context.config.PREFIX}task help* to see available commands.`);
  }
}

// Show task menu
async function showTaskMenu(reply, prefix) {
  const menuText = `🎯 *DAILY TASK SYSTEM* 🎯\n\n` +
                  `📊 *User Commands:*\n` +
                  `• *current* - View today's task\n` +
                  `• *stats* - View your task statistics\n` +
                  `• *records* - View your completion history\n` +
                  `• *completions* - See who completed today's task\n\n` +
                  `👑 *Admin Commands:*\n` +
                  `• *post* - Post today's task manually\n` +
                  `• *settings* - View/modify system settings\n` +
                  `• *questions* - Manage question database\n\n` +
                  `🤖 *Auto-Detection:*\n` +
                  `Just send your answers in format: 1. answer 2. answer 3. answer...\n\n` +
                  `📅 *Daily Themes:*\n` +
                  `Mon: Business • Tue: General • Wed: Hygiene\n` +
                  `Thu: Current Affairs • Fri: Science • Sat: Fun Facts • Sun: Mixed\n\n` +
                  `💡 *Usage:* ${prefix}task [command]`;
  
  await reply(menuText);
}

// Handle post task command
async function handlePostTask(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  const isAdminUser = await isAuthorized(sock, from, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can manually post daily tasks.');
    return;
  }
  
  try {
    if (!from.endsWith('@g.us')) {
      await reply('❌ This command can only be used in groups.');
      return;
    }
    
    const success = await postDailyTask(sock, from);
    
    if (success) {
      await reply('✅ *Daily task posted successfully!*\n\n🎯 Task has been shared with all group members.');
    } else {
      await reply('❌ *Failed to post daily task. Please try again.*');
    }
  } catch (error) {
    await reply('❌ *Error posting task. Please try again.*');
    console.error('Post task error:', error);
  }
}

// Handle current task command
async function handleCurrentTask(context) {
  const { reply } = context;
  
  try {
    const today = getCurrentDate();
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    
    if (!todayTask) {
      await reply(`📅 *No task available for today.*\n\nTasks are usually posted automatically at ${taskSettings.autoPostTime} daily.\n\nAdmins can post manually using: *${context.config.PREFIX}task post*`);
      return;
    }
    
    const nigeriaTime = getNigeriaTime();
    const timeLeft = moment.tz(`${today} ${taskSettings.submissionDeadline}`, 'DD-MM-YYYY HH:mm', 'Africa/Lagos');
    const isExpired = nigeriaTime.isAfter(timeLeft);
    
    let taskMessage = `🎯 *TODAY'S TASK* 🎯\n\n`;
    taskMessage += `📅 Date: ${today}\n`;
    taskMessage += `🏷️ Theme: ${todayTask.theme}\n`;
    taskMessage += `⏰ Deadline: ${taskSettings.submissionDeadline}\n`;
    taskMessage += `📊 Completions: ${todayTask.completions.length}\n`;
    
    if (isExpired) {
      taskMessage += `\n❌ *Task deadline has passed*\n`;
      taskMessage += `Come back tomorrow for the next challenge!`;
    } else {
      taskMessage += `\n📝 *Questions:*\n\n`;
      
      todayTask.questions.forEach((q, index) => {
        taskMessage += `${index + 1}️⃣ ${q.question}\n\n`;
      });
      
      taskMessage += `💰 *Reward:* ₦${taskSettings.baseReward.toLocaleString()}\n`;
      
      if (taskSettings.enableStreakBonus) {
        const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
        taskMessage += `🔥 *Streak Bonus:* +${bonusPercent}% after ${taskSettings.minStreakForBonus} days\n`;
      }
      
      taskMessage += `\n📋 *Reply format:* 1. [answer] 2. [answer] 3. [answer]...`;
    }
    
    await reply(taskMessage);
  } catch (error) {
    await reply('❌ *Error loading current task. Please try again.*');
    console.error('Current task error:', error);
  }
}

// Handle task stats command
async function handleTaskStats(context) {
  const { reply, senderId } = context;
  
  try {
    await initUser(senderId);
    const userData = await getUserData(senderId);
    const today = getCurrentDate();
    
    // Check if completed today's task
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    const completedToday = todayTask ? todayTask.completions.some(c => c.userId === senderId) : false;
    
    let statsMessage = `📊 *YOUR TASK STATISTICS* 📊\n\n`;
    statsMessage += `📅 Last completion: ${userData.lastTaskCompletion || 'Never'}\n`;
    statsMessage += `📋 Total completions: ${userData.totalTaskCompletions || 0}\n`;
    statsMessage += `🔥 Current streak: ${userData.taskStreak || 0} days\n`;
    statsMessage += `🏆 Longest streak: ${userData.longestTaskStreak || 0} days\n`;
    statsMessage += `✅ Today's status: ${completedToday ? 'Completed ✅' : 'Pending ❌'}\n`;
    statsMessage += `💰 Current balance: ₦${(userData.balance || 0).toLocaleString()}\n`;
    
    const streak = userData.taskStreak || 0;
    if (streak >= 7) {
      statsMessage += `\n🌟 *Amazing! You're on a ${streak}-day streak!*`;
    } else if (streak >= 3) {
      statsMessage += `\n🔥 *Great job! Keep the streak alive!*`;
    } else {
      statsMessage += `\n💪 *Complete daily tasks to build your streak!*`;
    }
    
    await reply(statsMessage);
  } catch (error) {
    await reply('❌ *Error loading stats. Please try again.*');
    console.error('Task stats error:', error);
  }
}

// Handle task settings command
async function handleTaskSettings(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  const isAdminUser = await isAuthorized(sock, from, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can access task settings.');
    return;
  }
  
  try {
    if (args.length === 0) {
      let settingsMessage = `⚙️ *TASK SYSTEM SETTINGS* ⚙️\n\n`;
      settingsMessage += `💰 Base Reward: ₦${taskSettings.baseReward.toLocaleString()}\n`;
      settingsMessage += `🔥 Streak Bonus: ${taskSettings.enableStreakBonus ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `📈 Streak Multiplier: ${taskSettings.streakBonusMultiplier}x\n`;
      settingsMessage += `🎯 Min Streak for Bonus: ${taskSettings.minStreakForBonus} days\n`;
      settingsMessage += `⏰ Auto Post Time: ${taskSettings.autoPostTime}\n`;
      settingsMessage += `🤖 Auto Post: ${taskSettings.autoPostEnabled ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `📝 Questions per Task: ${taskSettings.questionCount}\n`;
      settingsMessage += `⏳ Submission Deadline: ${taskSettings.submissionDeadline}\n`;
      settingsMessage += `🏷️ Silent Member Tags: ${taskSettings.tagAllMembers ? 'Enabled ✅' : 'Disabled ❌'}\n\n`;
      settingsMessage += `*📋 Usage Commands:*\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings reward 1000\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings streak on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings multiplier 2.0\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings minstreak 3\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings autopost on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings posttime 08:00\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings questions 5\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings deadline 23:59\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings tags on/off\``;
      
      await reply(settingsMessage);
      return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args[1];
    
    let responseText = "";
    
    switch (setting) {
      case 'reward':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid reward amount. Use: ${context.config.PREFIX}task settings reward 1000`;
        } else {
          taskSettings.baseReward = parseInt(value);
          await saveSettings();
          responseText = `✅ Base task reward set to ₦${parseInt(value).toLocaleString()}`;
        }
        break;
        
      case 'streak':
        if (value === 'on' || value === 'true' || value === 'yes') {
          taskSettings.enableStreakBonus = true;
          await saveSettings();
          responseText = "✅ Streak bonus enabled 🔥\n\n*Users will get bonus rewards for maintaining streaks.*";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          taskSettings.enableStreakBonus = false;
          await saveSettings();
          responseText = "✅ Streak bonus disabled\n\n*No more streak bonuses will be applied.*";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}task settings streak on/off`;
        }
        break;
        
      case 'multiplier':
        if (!value || isNaN(value) || parseFloat(value) <= 1) {
          responseText = `⚠️ Invalid multiplier. Use: ${context.config.PREFIX}task settings multiplier 2.0`;
        } else {
          taskSettings.streakBonusMultiplier = parseFloat(value);
          await saveSettings();
          responseText = `✅ Streak bonus multiplier set to ${parseFloat(value)}x`;
        }
        break;
        
      case 'minstreak':
        if (!value || isNaN(value) || parseInt(value) < 1) {
          responseText = `⚠️ Invalid streak requirement. Use: ${context.config.PREFIX}task settings minstreak 3`;
        } else {
          taskSettings.minStreakForBonus = parseInt(value);
          await saveSettings();
          responseText = `✅ Minimum streak for bonus set to ${parseInt(value)} days`;
        }
        break;
        
      case 'autopost':
        if (value === 'on' || value === 'true' || value === 'yes') {
          taskSettings.autoPostEnabled = true;
          await saveSettings();
          responseText = `✅ Auto-posting enabled 🤖\n\n*Tasks will be posted automatically at ${taskSettings.autoPostTime} daily.*`;
        } else if (value === 'off' || value === 'false' || value === 'no') {
          taskSettings.autoPostEnabled = false;
          await saveSettings();
          responseText = "✅ Auto-posting disabled\n\n*Tasks must be posted manually.*";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}task settings autopost on/off`;
        }
        break;
        
      case 'posttime':
        if (!value || !/^\d{2}:\d{2}$/.test(value)) {
          responseText = `⚠️ Invalid time format. Use: ${context.config.PREFIX}task settings posttime 08:00`;
        } else {
          taskSettings.autoPostTime = value;
          await saveSettings();
          responseText = `✅ Auto-post time set to ${value} (Nigeria time)`;
        }
        break;
        
      case 'questions':
        if (!value || isNaN(value) || parseInt(value) < 1 || parseInt(value) > 10) {
          responseText = `⚠️ Invalid question count (1-10). Use: ${context.config.PREFIX}task settings questions 5`;
        } else {
          taskSettings.questionCount = parseInt(value);
          await saveSettings();
          responseText = `✅ Questions per task set to ${parseInt(value)}`;
        }
        break;
        
      case 'deadline':
        if (!value || !/^\d{2}:\d{2}$/.test(value)) {
          responseText = `⚠️ Invalid time format. Use: ${context.config.PREFIX}task settings deadline 23:59`;
        } else {
          taskSettings.submissionDeadline = value;
          await saveSettings();
          responseText = `✅ Submission deadline set to ${value} daily`;
        }
        break;
        
      case 'tags':
        if (value === 'on' || value === 'true' || value === 'yes') {
          taskSettings.tagAllMembers = true;
          await saveSettings();
          responseText = "✅ Silent member tagging enabled 🏷️\n\n*All members will be notified when tasks are posted.*";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          taskSettings.tagAllMembers = false;
          await saveSettings();
          responseText = "✅ Silent member tagging disabled\n\n*No notifications when tasks are posted.*";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}task settings tags on/off`;
        }
        break;
        
      default:
        responseText = "⚠️ Unknown setting. Available options:\n• reward\n• streak\n• multiplier\n• minstreak\n• autopost\n• posttime\n• questions\n• deadline\n• tags";
    }
    
    await reply(responseText);
  } catch (error) {
    await reply('❌ *Error updating settings. Please try again.*');
    console.error('Task settings error:', error);
  }
}

// Handle questions manager command
async function handleQuestionsManager(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  const isAdminUser = await isAuthorized(sock, from, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can manage questions.');
    return;
  }
  
  try {
    if (args.length === 0) {
      // Show question statistics
      const stats = await db.collection(COLLECTIONS.QUESTIONS).aggregate([
        { $match: { active: true } },
        { $group: { _id: "$category", count: { $sum: 1 } } }
      ]).toArray();
      
      let statsMessage = `📚 *QUESTION DATABASE STATISTICS* 📚\n\n`;
      
      const totalQuestions = await db.collection(COLLECTIONS.QUESTIONS).countDocuments({ active: true });
      statsMessage += `📊 *Total Active Questions:* ${totalQuestions}\n\n`;
      
      statsMessage += `📋 *By Category:*\n`;
      const categories = ['business', 'general', 'hygiene', 'current_affairs', 'science', 'fun_facts'];
      
      for (const category of categories) {
        const categoryStats = stats.find(s => s._id === category);
        const count = categoryStats ? categoryStats.count : 0;
        const categoryName = category.replace('_', ' ').toUpperCase();
        statsMessage += `• ${categoryName}: ${count} questions\n`;
      }
      
      statsMessage += `\n*📋 Management Commands:*\n`;
      statsMessage += `• \`${context.config.PREFIX}task questions add [category] [question]\`\n`;
      statsMessage += `• \`${context.config.PREFIX}task questions list [category]\`\n`;
      statsMessage += `• \`${context.config.PREFIX}task questions remove [id]\`\n`;
      statsMessage += `• \`${context.config.PREFIX}task questions categories\`\n\n`;
      statsMessage += `*Available categories:* business, general, hygiene, current_affairs, science, fun_facts`;
      
      await reply(statsMessage);
      return;
    }
    
    const action = args[0].toLowerCase();
    
    switch (action) {
      case 'add':
        await handleAddQuestion(context, args.slice(1));
        break;
      case 'list':
        await handleListQuestions(context, args.slice(1));
        break;
      case 'remove':
        await handleRemoveQuestion(context, args.slice(1));
        break;
      case 'categories':
        await handleShowCategories(context);
        break;
      default:
        await reply(`❓ Unknown questions command: *${action}*\n\nUse *${context.config.PREFIX}task questions* to see available options.`);
    }
  } catch (error) {
    await reply('❌ *Error managing questions. Please try again.*');
    console.error('Questions manager error:', error);
  }
}

// Handle add question
async function handleAddQuestion(context, args) {
  const { reply } = context;
  
  if (args.length < 2) {
    await reply(`⚠️ *Invalid format*\n\nUsage: ${context.config.PREFIX}task questions add [category] [question]\n\nExample: ${context.config.PREFIX}task questions add business What is your business idea?`);
    return;
  }
  
  const category = args[0].toLowerCase();
  const question = args.slice(1).join(' ');
  
  const validCategories = ['business', 'general', 'hygiene', 'current_affairs', 'science', 'fun_facts'];
  if (!validCategories.includes(category)) {
    await reply(`⚠️ *Invalid category*\n\nValid categories: ${validCategories.join(', ')}`);
    return;
  }
  
  try {
    const questionDoc = {
      question: question,
      type: 'open',
      category: category,
      createdAt: new Date(),
      addedBy: 'admin',
      active: true
    };
    
    const result = await db.collection(COLLECTIONS.QUESTIONS).insertOne(questionDoc);
    
    await reply(`✅ *Question added successfully!*\n\n📝 *Question:* ${question}\n🏷️ *Category:* ${category.toUpperCase()}\n📊 *ID:* ${result.insertedId}`);
  } catch (error) {
    await reply('❌ *Error adding question. Please try again.*');
    console.error('Add question error:', error);
  }
}

// Handle list questions
async function handleListQuestions(context, args) {
  const { reply } = context;
  
  if (args.length === 0) {
    await reply(`⚠️ *Category required*\n\nUsage: ${context.config.PREFIX}task questions list [category]\n\nValid categories: business, general, hygiene, current_affairs, science, fun_facts`);
    return;
  }
  
  const category = args[0].toLowerCase();
  
  try {
    const questions = await db.collection(COLLECTIONS.QUESTIONS)
      .find({ category: category, active: true })
      .limit(20)
      .toArray();
    
    if (questions.length === 0) {
      await reply(`📝 *No questions found in category: ${category.toUpperCase()}*`);
      return;
    }
    
    let listMessage = `📚 *${category.toUpperCase()} QUESTIONS* 📚\n\n`;
    listMessage += `📊 Showing ${questions.length} questions:\n\n`;
    
    questions.forEach((q, index) => {
      listMessage += `${index + 1}. ${q.question}\n`;
      listMessage += `   🆔 ID: ${q._id}\n\n`;
    });
    
    if (questions.length === 20) {
      listMessage += `\n*Note: Only showing first 20 questions*`;
    }
    
    await reply(listMessage);
  } catch (error) {
    await reply('❌ *Error listing questions. Please try again.*');
    console.error('List questions error:', error);
  }
}

// Handle remove question
async function handleRemoveQuestion(context, args) {
  const { reply } = context;
  
  if (args.length === 0) {
    await reply(`⚠️ *Question ID required*\n\nUsage: ${context.config.PREFIX}task questions remove [id]\n\nGet question ID from the list command.`);
    return;
  }
  
  const questionId = args[0];
  
  try {
    const { ObjectId } = await import('mongodb');
    const result = await db.collection(COLLECTIONS.QUESTIONS).updateOne(
      { _id: new ObjectId(questionId) },
      { $set: { active: false, removedAt: new Date() } }
    );
    
    if (result.matchedCount === 0) {
      await reply('❌ *Question not found with that ID.*');
    } else {
      await reply('✅ *Question removed successfully!*\n\n*Note: Question is marked as inactive, not permanently deleted.*');
    }
  } catch (error) {
    await reply('❌ *Invalid question ID or error removing question.*');
    console.error('Remove question error:', error);
  }
}

// Handle show categories
async function handleShowCategories(context) {
  const { reply } = context;
  
  let categoriesMessage = `🗂️ *QUESTION CATEGORIES & THEMES* 🗂️\n\n`;
  
  const categoryInfo = {
    business: { name: 'Business Ideas & Entrepreneurship', day: 'Monday', icon: '💼' },
    general: { name: 'General Knowledge', day: 'Tuesday', icon: '🧠' },
    hygiene: { name: 'Hygiene & Health', day: 'Wednesday', icon: '🧼' },
    current_affairs: { name: 'Current Affairs & News', day: 'Thursday', icon: '📰' },
    science: { name: 'Science & Technology', day: 'Friday', icon: '🔬' },
    fun_facts: { name: 'Fun Facts & Entertainment', day: 'Saturday', icon: '🎉' }
  };
  
  Object.entries(categoryInfo).forEach(([key, info]) => {
    categoriesMessage += `${info.icon} *${key.toUpperCase()}*\n`;
    categoriesMessage += `   📅 Theme Day: ${info.day}\n`;
    categoriesMessage += `   📝 ${info.name}\n\n`;
  });
  
  categoriesMessage += `📅 *Sunday:* Mixed Topics (random from all categories)\n\n`;
  categoriesMessage += `💡 *Add questions to any category to expand the database!*`;
  
  await reply(categoriesMessage);
}

// Handle completions view
async function handleCompletionsView(context, args) {
  const { reply } = context;
  
  try {
    const date = args[0] || getCurrentDate();
    
    const task = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: date });
    
    if (!task) {
      await reply(`📅 *No task found for date: ${date}*\n\nUse format: DD-MM-YYYY`);
      return;
    }
    
    let completionMessage = `📊 *TASK COMPLETIONS* 📊\n\n`;
    completionMessage += `📅 Date: ${date}\n`;
    completionMessage += `🎯 Theme: ${task.theme}\n`;
    completionMessage += `📋 Total Completions: ${task.completions.length}\n\n`;
    
    if (task.completions.length === 0) {
      completionMessage += `❌ *No completions yet*\n`;
      completionMessage += `💪 Be the first to complete this task!`;
    } else {
      completionMessage += `✅ *Completed Members:*\n\n`;
      
      task.completions.forEach((completion, index) => {
        const userPhone = completion.userId.split('@')[0];
        const submittedTime = moment(completion.submittedAt).tz('Africa/Lagos').format('HH:mm');
        
        completionMessage += `${index + 1}. +${userPhone}\n`;
        completionMessage += `   ⏰ ${submittedTime} • 🔥 Streak: ${completion.streak} • 💰 ₦${completion.reward.toLocaleString()}\n\n`;
      });
      
      completionMessage += `🎉 *Great participation from the GIST HQ family!*`;
    }
    
    await reply(completionMessage);
  } catch (error) {
    await reply('❌ *Error loading completions. Please try again.*');
    console.error('Completions view error:', error);
  }
}

// Handle task records command
async function handleTaskRecords(context, args) {
  const { reply, senderId } = context;
  
  try {
    const limit = args[0] ? parseInt(args[0]) : 10;
    const limitValue = Math.min(Math.max(limit, 1), 50); // Between 1 and 50
    
    const records = await db.collection(COLLECTIONS.TASK_RECORDS)
      .find({ userId: senderId })
      .sort({ submittedAt: -1 })
      .limit(limitValue)
      .toArray();
    
    if (records.length === 0) {
      await reply(`📋 *No Task Records*\n\nYou haven't completed any tasks yet. Join today's challenge and start building your streak!`);
      return;
    }
    
    let recordsText = `📋 *YOUR TASK COMPLETION HISTORY* 📋\n\n`;
    recordsText += `📊 Showing last ${records.length} completions:\n\n`;
    
    records.forEach((record, index) => {
      recordsText += `${index + 1}. 📅 ${record.date}\n`;
      recordsText += `   💰 Reward: ₦${record.reward.toLocaleString()}\n`;
      recordsText += `   🔥 Streak: ${record.streak} days\n`;
      recordsText += `   ⏰ ${moment(record.submittedAt).tz('Africa/Lagos').format('DD/MM/YYYY HH:mm')}\n\n`;
    });
    
    recordsText += `💡 *Use: ${context.config.PREFIX}task records [number]* to show more/less records (max 50)`;
    
    await reply(recordsText);
  } catch (error) {
    await reply('❌ *Error loading task records. Please try again.*');
    console.error('Task records error:', error);
  }
}

// Handle test task command
async function handleTestTask(context, args) {
  const { reply } = context;
  const testAnswers = args.join(' ');
  
  if (!testAnswers) {
    await reply(`🔍 *Task Answer Test*\n\nUsage: ${context.config.PREFIX}task test [your answers]\n\nExample: ${context.config.PREFIX}task test 1. Lagos 2. 36 states 3. 1960 4. Africa 5. 366 days\n\nThis will validate your answer format without submitting.`);
    return;
  }
  
  try {
    const answers = validateAnswerFormat(testAnswers);
    
    let result = `🔍 *Answer Format Test Results:*\n\n`;
    result += `📝 *Input:* "${testAnswers}"\n\n`;
    result += `📊 *Detected Answers:* ${answers.length}/${taskSettings.questionCount}\n\n`;
    
    if (answers.length > 0) {
      result += `✅ *Parsed Answers:*\n`;
      answers.forEach((answer, index) => {
        if (answer) {
          result += `${index + 1}. ${answer}\n`;
        } else {
          result += `${index + 1}. ❌ *Missing*\n`;
        }
      });
    }
    
    if (answers.length >= taskSettings.questionCount) {
      result += `\n🎉 *Format is valid!* ✅\n`;
      result += `💰 *Potential reward:* ₦${taskSettings.baseReward.toLocaleString()}\n`;
      result += `🔥 *Plus streak bonus if applicable*\n\n`;
      result += `✨ *Ready to submit your real answers!*`;
    } else {
      result += `\n❌ *Incomplete format*\n`;
      result += `📋 *Required:* ${taskSettings.questionCount} answers\n`;
      result += `📊 *Found:* ${answers.length} answers\n\n`;
      result += `💡 *Correct format:*\n`;
      result += `1. First answer\n`;
      result += `2. Second answer\n`;
      result += `3. Third answer\n`;
      result += `... and so on`;
    }
    
    await reply(result);
  } catch (error) {
    await reply('❌ *Error testing answer format. Please try again.*');
    console.error('Test task error:', error);
  }
}

// =======================
// 🕐 SCHEDULED FUNCTIONS
// =======================

// Function to check and post daily tasks (to be called by scheduler)
async function checkAndPostDailyTask(sock) {
  try {
    if (!taskSettings.autoPostEnabled) {
      console.log('⏸️ Auto-posting is disabled');
      return;
    }
    
    const now = getNigeriaTime();
    const currentTime = now.format('HH:mm');
    
    if (currentTime !== taskSettings.autoPostTime) {
      return; // Not time to post yet
    }
    
    const today = getCurrentDate();
    
    // Check if task already posted today
    const existingTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    if (existingTask) {
      console.log(`📅 Task already posted for ${today}`);
      return;
    }
    
    // Get all registered group JIDs
    if (!taskSettings.groupJids || taskSettings.groupJids.length === 0) {
      console.log('⚠️ No group JIDs registered for auto-posting');
      return;
    }
    
    // Post daily task to all registered groups
    for (const groupJid of taskSettings.groupJids) {
      try {
        const success = await postDailyTask(sock, groupJid);
        if (success) {
          console.log(`✅ Daily task auto-posted to ${groupJid} at ${currentTime}`);
        } else {
          console.log(`❌ Failed to auto-post daily task to ${groupJid}`);
        }
      } catch (error) {
        console.error(`Error posting to group ${groupJid}:`, error);
      }
    }
    
  } catch (error) {
    console.error('Error in checkAndPostDailyTask:', error);
  }
}

// Set group JID for auto-posting (called when plugin is first used in a group)
async function setGroupJid(groupJid) {
  if (!taskSettings.groupJids.includes(groupJid)) {
    taskSettings.groupJids.push(groupJid);
    await saveSettings();
    console.log(`📝 Group JID added for auto-posting: ${groupJid}`);
  }
}

// Initialize plugin when first loaded
async function initializePlugin() {
  try {
    await initDatabase();
    await loadSettings();
    console.log('✅ Daily Task Plugin initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Daily Task Plugin:', error);
  }
}

// Export functions for use by other plugins or scheduler
export { 
  checkAndPostDailyTask,
  setGroupJid,
  initializePlugin,
  taskSettings
};
