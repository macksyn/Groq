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
  baseReward: 500,
  enableStreakBonus: true,
  streakBonusMultiplier: 1.5,
  minStreakForBonus: 3,
  autoPostTime: '08:00', // 8:00 AM Nigeria time
  autoPostEnabled: true,
  questionCount: 5,
  submissionDeadline: '23:59', // 11:59 PM
  adminNumbers: [],
  groupJid: '', // Will be set when first used
  tagAllMembers: true,
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
    { question: "What business can you start with just ₦20,000?", type: "open", category: "business" },
    { question: "Name one skill you can monetize online", type: "open", category: "business" },
    { question: "What does ROI stand for in business?", type: "open", category: "business" },
    { question: "Which social media platform is best for business marketing in Nigeria?", type: "open", category: "business" },
    { question: "What is the first step in starting any business?", type: "open", category: "business" },
    { question: "Name one way to fund your startup business", type: "open", category: "business" },
    { question: "What is a business plan?", type: "open", category: "business" },
    { question: "How can you identify your target market?", type: "open", category: "business" },
    { question: "What is the difference between profit and revenue?", type: "open", category: "business" },
    { question: "Name one digital skill that's in high demand", type: "open", category: "business" },
    { question: "What does 'minimum viable product' (MVP) mean?", type: "open", category: "business" },
    { question: "How can you market your business for free?", type: "open", category: "business" },
    { question: "What is customer retention?", type: "open", category: "business" },
    { question: "Name one way to reduce business costs", type: "open", category: "business" },
    { question: "What is the importance of networking in business?", type: "open", category: "business" }
  ],
  
  general: [
    { question: "What is the capital of Nigeria?", type: "open", category: "general" },
    { question: "How many states are in Nigeria?", type: "open", category: "general" },
    { question: "What year did Nigeria gain independence?", type: "open", category: "general" },
    { question: "What is the largest continent in the world?", type: "open", category: "general" },
    { question: "How many days are in a leap year?", type: "open", category: "general" },
    { question: "What is the currency of Ghana?", type: "open", category: "general" },
    { question: "Who wrote the Nigerian national anthem?", type: "open", category: "general" },
    { question: "What does www stand for?", type: "open", category: "general" },
    { question: "How many minutes are in a full day?", type: "open", category: "general" },
    { question: "What is the smallest country in the world?", type: "open", category: "general" },
    { question: "How many sides does a triangle have?", type: "open", category: "general" },
    { question: "What is the largest ocean in the world?", type: "open", category: "general" },
    { question: "In which year was WhatsApp founded?", type: "open", category: "general" },
    { question: "What does GPS stand for?", type: "open", category: "general" },
    { question: "How many hours are in a week?", type: "open", category: "general" }
  ],
  
  hygiene: [
    { question: "How many times should you brush your teeth daily?", type: "open", category: "hygiene" },
    { question: "How long should you wash your hands to kill germs?", type: "open", category: "hygiene" },
    { question: "How often should you change your toothbrush?", type: "open", category: "hygiene" },
    { question: "What is the recommended time for daily exercise?", type: "open", category: "hygiene" },
    { question: "How many glasses of water should you drink daily?", type: "open", category: "hygiene" },
    { question: "How often should you wash your hair?", type: "open", category: "hygiene" },
    { question: "What should you do before eating?", type: "open", category: "hygiene" },
    { question: "How many hours of sleep do adults need daily?", type: "open", category: "hygiene" },
    { question: "Name one benefit of regular bathing", type: "open", category: "hygiene" },
    { question: "What is the best way to prevent body odor?", type: "open", category: "hygiene" },
    { question: "How often should you clip your nails?", type: "open", category: "hygiene" },
    { question: "Why is it important to wash fruits before eating?", type: "open", category: "hygiene" },
    { question: "What should you cover your mouth with when coughing?", type: "open", category: "hygiene" },
    { question: "How often should you change your bed sheets?", type: "open", category: "hygiene" },
    { question: "Name one way to maintain oral hygiene", type: "open", category: "hygiene" }
  ],
  
  current_affairs: [
    { question: "Who is the current President of Nigeria?", type: "open", category: "current_affairs" },
    { question: "What is the current minimum wage in Nigeria?", type: "open", category: "current_affairs" },
    { question: "Which year was the new naira notes introduced?", type: "open", category: "current_affairs" },
    { question: "What does CBN stand for?", type: "open", category: "current_affairs" },
    { question: "Name Nigeria's current Vice President", type: "open", category: "current_affairs" },
    { question: "What is the current exchange rate trend of Naira to Dollar?", type: "open", category: "current_affairs" },
    { question: "Which state recently conducted local government elections?", type: "open", category: "current_affairs" },
    { question: "What major tech company recently invested in Nigeria?", type: "open", category: "current_affairs" },
    { question: "Name one current challenge facing Nigerian youth", type: "open", category: "current_affairs" },
    { question: "What is the current fuel price per liter in Nigeria?", type: "open", category: "current_affairs" },
    { question: "Which Nigerian state is known for oil production?", type: "open", category: "current_affairs" },
    { question: "What does NYSC stand for?", type: "open", category: "current_affairs" },
    { question: "Name one major road project currently ongoing in Nigeria", type: "open", category: "current_affairs" },
    { question: "What is the current population estimate of Nigeria?", type: "open", category: "current_affairs" },
    { question: "Which Nigerian bank was recently recapitalized?", type: "open", category: "current_affairs" }
  ],
  
  science: [
    { question: "What gas do plants absorb from the atmosphere?", type: "open", category: "science" },
    { question: "Which planet is closest to the Sun?", type: "open", category: "science" },
    { question: "What does DNA stand for?", type: "open", category: "science" },
    { question: "How many bones are in the human body?", type: "open", category: "science" },
    { question: "What is the chemical symbol for water?", type: "open", category: "science" },
    { question: "Which organ pumps blood through the human body?", type: "open", category: "science" },
    { question: "What is the speed of light?", type: "open", category: "science" },
    { question: "How many chambers does a human heart have?", type: "open", category: "science" },
    { question: "What is the largest organ in the human body?", type: "open", category: "science" },
    { question: "Which gas makes up most of Earth's atmosphere?", type: "open", category: "science" },
    { question: "What is photosynthesis?", type: "open", category: "science" },
    { question: "How many teeth does an adult human have?", type: "open", category: "science" },
    { question: "What is the hardest natural substance on Earth?", type: "open", category: "science" },
    { question: "Which blood type is considered universal donor?", type: "open", category: "science" },
    { question: "What does CPU stand for in computers?", type: "open", category: "science" }
  ],
  
  fun_facts: [
    { question: "Which animal is known as the King of the Jungle?", type: "open", category: "fun_facts" },
    { question: "How many legs does a spider have?", type: "open", category: "fun_facts" },
    { question: "What is the tallest building in the world?", type: "open", category: "fun_facts" },
    { question: "Which country has the most time zones?", type: "open", category: "fun_facts" },
    { question: "What is the most spoken language in the world?", type: "open", category: "fun_facts" },
    { question: "How many strings does a guitar have?", type: "open", category: "fun_facts" },
    { question: "Which fruit is known as the king of fruits?", type: "open", category: "fun_facts" },
    { question: "What is the fastest land animal?", type: "open", category: "fun_facts" },
    { question: "How many colors are in a rainbow?", type: "open", category: "fun_facts" },
    { question: "Which planet is known as the Red Planet?", type: "open", category: "fun_facts" },
    { question: "What is the largest mammal in the world?", type: "open", category: "fun_facts" },
    { question: "How many players are on a football team on the field?", type: "open", category: "fun_facts" },
    { question: "Which bird can't fly but can run very fast?", type: "open", category: "fun_facts" },
    { question: "What is the hottest planet in our solar system?", type: "open", category: "fun_facts" },
    { question: "How many lives are cats said to have?", type: "open", category: "fun_facts" }
  ]
};

// Initialize question database
async function initializeQuestionDatabase() {
  try {
    const existingQuestions = await db.collection(COLLECTIONS.QUESTIONS).countDocuments();
    
    if (existingQuestions === 0) {
      console.log('📄 Initializing question database...');
      
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

// Validate answer format
function validateAnswerFormat(text) {
  // Look for numbered answers (1. answer 2. answer etc.)
  const answerPattern = /(\d+)\.\s*([^0-9]+?)(?=\s*\d+\.|$)/g;
  const answers = [];
  let match;
  
  while ((match = answerPattern.exec(text)) !== null) {
    const questionNum = parseInt(match[1]);
    const answer = match[2].trim();
    
    if (answer.length > 0) {
      answers[questionNum - 1] = answer;
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

// Process task submission
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
    
    console.log(`🔍 Task submission detected from ${senderId}`);
    
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
        text: `🔁 *You've already completed today's task!*\n\nCome back tomorrow for the next challenge. 🚀`
      }, { quoted: m });
      return true;
    }
    
    // Initialize user
    await initUser(senderId);
    const userData = await getUserData(senderId);
    
    // Update streak
    const currentStreak = updateTaskStreak(senderId, userData, today);
    
    // Calculate reward
    let finalReward = taskSettings.baseReward;
    
    // Apply streak bonus
    if (taskSettings.enableStreakBonus && currentStreak >= taskSettings.minStreakForBonus) {
      finalReward = Math.floor(finalReward * taskSettings.streakBonusMultiplier);
    }
    
    // Add money to user's wallet
    await addMoney(senderId, finalReward, 'Daily task completion');
    
    // Update user data
    await updateUserData(senderId, {
      lastTaskCompletion: today,
      totalTaskCompletions: (userData.totalTaskCompletions || 0) + 1,
      taskStreak: currentStreak,
      longestTaskStreak: userData.longestTaskStreak
    });
    
    // Add completion to today's task
    const completionData = {
      userId: senderId,
      userPhone: senderId.split('@')[0],
      answers: answers,
      submittedAt: new Date(),
      reward: finalReward,
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
      reward: finalReward,
      streak: currentStreak,
      submittedAt: new Date()
    });
    
    // Get updated user data
    const updatedUserData = await getUserData(senderId);
    
    // Build reward message
    let rewardBreakdown = `💰 Reward: ₦${finalReward.toLocaleString()}`;
    
    if (taskSettings.enableStreakBonus && currentStreak >= taskSettings.minStreakForBonus) {
      const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
      rewardBreakdown += ` (includes ${bonusPercent}% streak bonus)`;
    }
    
    // Success message
    let successMessage = `✅ *TASK COMPLETED SUCCESSFULLY!* ✅\n\n`;
    successMessage += `🎯 All questions answered!\n`;
    successMessage += rewardBreakdown + '\n';
    successMessage += `💸 New wallet balance: ₦${(updatedUserData.balance || 0).toLocaleString()}\n`;
    successMessage += `🔥 Current streak: ${currentStreak} days\n`;
    successMessage += `📊 Total completions: ${updatedUserData.totalTaskCompletions}\n`;
    successMessage += `🏆 Longest streak: ${updatedUserData.longestTaskStreak} days\n\n`;
    successMessage += `🎉 *Excellent work! Keep the momentum going!* 🚀`;
    
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
    
    // Send without mentions if no completions
    await sock.sendMessage(groupJid, {
      text: updateMessage
    });
    
  } catch (error) {
    console.error('Error sending completion update:', error);
  }
}

// Check if user is admin
function isAdmin(userId) {
  return taskSettings.adminNumbers.includes(userId.split('@')[0]);
}

// =======================
// 🎛️ ADMIN FUNCTIONS
// =======================

// Handle admin settings
async function handleAdminSettings(m, sock, config, args) {
  const senderId = m.key.participant || m.key.remoteJid;
  const from = m.key.remoteJid;
  
  if (!isAdmin(senderId)) {
    await sock.sendMessage(from, {
      text: `❌ *Access Denied*\n\nOnly admins can modify settings.`
    }, { quoted: m });
    return;
  }
  
  if (args.length === 0) {
    // Show current settings
    let settingsText = `🎛️ *GIST HQ - TASK SETTINGS* 🎛️\n\n`;
    settingsText += `💰 Base reward: ₦${taskSettings.baseReward.toLocaleString()}\n`;
    settingsText += `🔥 Streak bonus: ${taskSettings.enableStreakBonus ? 'Enabled' : 'Disabled'}\n`;
    
    if (taskSettings.enableStreakBonus) {
      const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
      settingsText += `🔥 Streak multiplier: +${bonusPercent}% after ${taskSettings.minStreakForBonus} days\n`;
    }
    
    settingsText += `📝 Questions per task: ${taskSettings.questionCount}\n`;
    settingsText += `⏰ Auto-post time: ${taskSettings.autoPostTime}\n`;
    settingsText += `⏰ Submission deadline: ${taskSettings.submissionDeadline}\n`;
    settingsText += `🏷️ Tag all members: ${taskSettings.tagAllMembers ? 'Yes' : 'No'}\n`;
    settingsText += `👥 Admin count: ${taskSettings.adminNumbers.length}\n\n`;
    
    settingsText += `*📋 Commands:*\n`;
    settingsText += `• \`${config.PREFIX}task settings reward [amount]\`\n`;
    settingsText += `• \`${config.PREFIX}task settings streak [on/off]\`\n`;
    settingsText += `• \`${config.PREFIX}task settings bonus [multiplier]\`\n`;
    settingsText += `• \`${config.PREFIX}task settings questions [count]\`\n`;
    settingsText += `• \`${config.PREFIX}task settings autopost [time]\`\n`;
    settingsText += `• \`${config.PREFIX}task settings deadline [time]\`\n`;
    settingsText += `• \`${config.PREFIX}task settings tagging [on/off]\`\n`;
    settingsText += `• \`${config.PREFIX}task settings admin add/remove [number]\``;
    
    await sock.sendMessage(from, { text: settingsText }, { quoted: m });
    return;
  }
  
  const setting = args[0].toLowerCase();
  const value = args.slice(1).join(' ');
  
  switch (setting) {
    case 'reward':
      const amount = parseInt(value);
      if (isNaN(amount) || amount < 100) {
        await sock.sendMessage(from, {
          text: `❌ *Invalid amount*\n\nReward must be at least ₦100.`
        }, { quoted: m });
        return;
      }
      taskSettings.baseReward = amount;
      await saveSettings();
      await sock.sendMessage(from, {
        text: `✅ *Base reward updated*\n\nNew reward: ₦${amount.toLocaleString()}`
      }, { quoted: m });
      break;
      
    case 'streak':
      if (value.toLowerCase() === 'on') {
        taskSettings.enableStreakBonus = true;
        await saveSettings();
        await sock.sendMessage(from, {
          text: `✅ *Streak bonus enabled*\n\nUsers will get bonus rewards for consecutive completions.`
        }, { quoted: m });
      } else if (value.toLowerCase() === 'off') {
        taskSettings.enableStreakBonus = false;
        await saveSettings();
        await sock.sendMessage(from, {
          text: `✅ *Streak bonus disabled*\n\nUsers will only get base rewards.`
        }, { quoted: m });
      } else {
        await sock.sendMessage(from, {
          text: `❌ *Invalid value*\n\nUse 'on' or 'off'.`
        }, { quoted: m });
      }
      break;
      
    case 'bonus':
      const multiplier = parseFloat(value);
      if (isNaN(multiplier) || multiplier < 1.1 || multiplier > 3.0) {
        await sock.sendMessage(from, {
          text: `❌ *Invalid multiplier*\n\nBonus multiplier must be between 1.1 and 3.0.`
        }, { quoted: m });
        return;
      }
      taskSettings.streakBonusMultiplier = multiplier;
      await saveSettings();
      const bonusPercent = Math.floor((multiplier - 1) * 100);
      await sock.sendMessage(from, {
        text: `✅ *Bonus multiplier updated*\n\nStreak bonus: +${bonusPercent}%`
      }, { quoted: m });
      break;
      
    case 'questions':
      const count = parseInt(value);
      if (isNaN(count) || count < 3 || count > 10) {
        await sock.sendMessage(from, {
          text: `❌ *Invalid count*\n\nQuestion count must be between 3 and 10.`
        }, { quoted: m });
        return;
      }
      taskSettings.questionCount = count;
      await saveSettings();
      await sock.sendMessage(from, {
        text: `✅ *Question count updated*\n\nDaily tasks will now have ${count} questions.`
      }, { quoted: m });
      break;
      
    case 'autopost':
      if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
        await sock.sendMessage(from, {
          text: `❌ *Invalid time format*\n\nUse HH:MM format (e.g., 08:00).`
        }, { quoted: m });
        return;
      }
      taskSettings.autoPostTime = value;
      await saveSettings();
      await sock.sendMessage(from, {
        text: `✅ *Auto-post time updated*\n\nDaily tasks will be posted at ${value} Nigeria time.`
      }, { quoted: m });
      break;
      
    case 'deadline':
      if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
        await sock.sendMessage(from, {
          text: `❌ *Invalid time format*\n\nUse HH:MM format (e.g., 23:59).`
        }, { quoted: m });
        return;
      }
      taskSettings.submissionDeadline = value;
      await saveSettings();
      await sock.sendMessage(from, {
        text: `✅ *Submission deadline updated*\n\nTasks must be completed by ${value} each day.`
      }, { quoted: m });
      break;
      
    case 'tagging':
      if (value.toLowerCase() === 'on') {
        taskSettings.tagAllMembers = true;
        await saveSettings();
        await sock.sendMessage(from, {
          text: `✅ *Silent tagging enabled*\n\nAll members will be silently notified when tasks are posted.`
        }, { quoted: m });
      } else if (value.toLowerCase() === 'off') {
        taskSettings.tagAllMembers = false;
        await saveSettings();
        await sock.sendMessage(from, {
          text: `✅ *Silent tagging disabled*\n\nTasks will be posted without notifications.`
        }, { quoted: m });
      } else {
        await sock.sendMessage(from, {
          text: `❌ *Invalid value*\n\nUse 'on' or 'off'.`
        }, { quoted: m });
      }
      break;
      
    case 'admin':
      if (args.length < 3) {
        await sock.sendMessage(from, {
          text: `❌ *Invalid command*\n\nUse: \`${config.PREFIX}task settings admin add/remove [phone]\``
        }, { quoted: m });
        return;
      }
      
      const action = args[1].toLowerCase();
      const phoneNumber = args[2].replace(/[^\d]/g, ''); // Remove non-digits
      
      if (action === 'add') {
        if (!taskSettings.adminNumbers.includes(phoneNumber)) {
          taskSettings.adminNumbers.push(phoneNumber);
          await saveSettings();
          await sock.sendMessage(from, {
            text: `✅ *Admin added*\n\n${phoneNumber} is now a task admin.`
          }, { quoted: m });
        } else {
          await sock.sendMessage(from, {
            text: `❌ *Already admin*\n\n${phoneNumber} is already a task admin.`
          }, { quoted: m });
        }
      } else if (action === 'remove') {
        const index = taskSettings.adminNumbers.indexOf(phoneNumber);
        if (index > -1) {
          taskSettings.adminNumbers.splice(index, 1);
          await saveSettings();
          await sock.sendMessage(from, {
            text: `✅ *Admin removed*\n\n${phoneNumber} is no longer a task admin.`
          }, { quoted: m });
        } else {
          await sock.sendMessage(from, {
            text: `❌ *Not found*\n\n${phoneNumber} is not a task admin.`
          }, { quoted: m });
        }
      } else {
        await sock.sendMessage(from, {
          text: `❌ *Invalid action*\n\nUse 'add' or 'remove'.`
        }, { quoted: m });
      }
      break;
      
    default:
      await sock.sendMessage(from, {
        text: `❌ *Unknown setting*\n\nUse \`${config.PREFIX}task settings\` to see available options.`
      }, { quoted: m });
  }
}

// Handle question management
async function handleQuestionManagement(m, sock, config, args) {
  const senderId = m.key.participant || m.key.remoteJid;
  const from = m.key.remoteJid;
  
  if (!isAdmin(senderId)) {
    await sock.sendMessage(from, {
      text: `❌ *Access Denied*\n\nOnly admins can manage questions.`
    }, { quoted: m });
    return;
  }
  
  if (args.length === 0) {
    // Show question stats
    const questionStats = await db.collection(COLLECTIONS.QUESTIONS).aggregate([
      { $match: { active: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]).toArray();
    
    let statsText = `📚 *QUESTION DATABASE STATS* 📚\n\n`;
    questionStats.forEach(stat => {
      statsText += `📁 ${stat._id}: ${stat.count} questions\n`;
    });
    
    const totalQuestions = questionStats.reduce((sum, stat) => sum + stat.count, 0);
    statsText += `\n📊 *Total: ${totalQuestions} active questions*\n\n`;
    
    statsText += `*📋 Commands:*\n`;
    statsText += `• \`${config.PREFIX}task questions add [category]\`\n`;
    statsText += `• \`${config.PREFIX}task questions remove [id]\`\n`;
    statsText += `• \`${config.PREFIX}task questions list [category]\``;
    
    await sock.sendMessage(from, { text: statsText }, { quoted: m });
    return;
  }
  
  const action = args[0].toLowerCase();
  
  switch (action) {
    case 'add':
      if (args.length < 2) {
        await sock.sendMessage(from, {
          text: `❌ *Missing category*\n\nUse: \`${config.PREFIX}task questions add [category]\`\n\nValid categories: business, general, hygiene, current_affairs, science, fun_facts`
        }, { quoted: m });
        return;
      }
      
      const category = args[1].toLowerCase();
      const validCategories = ['business', 'general', 'hygiene', 'current_affairs', 'science', 'fun_facts'];
      
      if (!validCategories.includes(category)) {
        await sock.sendMessage(from, {
          text: `❌ *Invalid category*\n\nValid categories: ${validCategories.join(', ')}`
        }, { quoted: m });
        return;
      }
      
      await sock.sendMessage(from, {
        text: `📝 *ADD NEW QUESTION*\n\nCategory: ${category}\n\nReply to this message with your question.`
      }, { quoted: m });
      
      // Note: This would require additional message handling logic to capture the reply
      break;
      
    case 'list':
      const listCategory = args[1]?.toLowerCase() || 'all';
      
      let query = { active: true };
      if (listCategory !== 'all') {
        query.category = listCategory;
      }
      
      const questions = await db.collection(COLLECTIONS.QUESTIONS)
        .find(query)
        .limit(20)
        .toArray();
      
      if (questions.length === 0) {
        await sock.sendMessage(from, {
          text: `❌ *No questions found*\n\nCategory: ${listCategory}`
        }, { quoted: m });
        return;
      }
      
      let listText = `📚 *QUESTIONS LIST* 📚\n\nCategory: ${listCategory}\n\n`;
      questions.forEach((q, index) => {
        listText += `${index + 1}. ${q.question}\n`;
        listText += `   Category: ${q.category} | ID: ${q._id}\n\n`;
      });
      
      if (questions.length === 20) {
        listText += `*Showing first 20 results...*`;
      }
      
      await sock.sendMessage(from, { text: listText }, { quoted: m });
      break;
      
    case 'remove':
      if (args.length < 2) {
        await sock.sendMessage(from, {
          text: `❌ *Missing question ID*\n\nUse: \`${config.PREFIX}task questions remove [id]\``
        }, { quoted: m });
        return;
      }
      
      const questionId = args[1];
      
      try {
        const result = await db.collection(COLLECTIONS.QUESTIONS).updateOne(
          { _id: questionId },
          { $set: { active: false, removedAt: new Date(), removedBy: senderId } }
        );
        
        if (result.matchedCount === 0) {
          await sock.sendMessage(from, {
            text: `❌ *Question not found*\n\nID: ${questionId}`
          }, { quoted: m });
        } else {
          await sock.sendMessage(from, {
            text: `✅ *Question removed*\n\nQuestion ID ${questionId} has been deactivated.`
          }, { quoted: m });
        }
      } catch (error) {
        await sock.sendMessage(from, {
          text: `❌ *Error removing question*\n\nPlease check the question ID.`
        }, { quoted: m });
      }
      break;
      
    default:
      await sock.sendMessage(from, {
        text: `❌ *Unknown action*\n\nUse: \`${config.PREFIX}task questions\` to see available commands.`
      }, { quoted: m });
  }
}

// Show user statistics
async function showUserStats(m, sock, config) {
  try {
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    
    await initUser(senderId);
    const userData = await getUserData(senderId);
    const today = getCurrentDate();
    
    // Get user's task history
    const taskHistory = await db.collection(COLLECTIONS.TASK_RECORDS)
      .find({ userId: senderId })
      .sort({ date: -1 })
      .limit(10)
      .toArray();
    
    // Check if completed today
    const completedToday = userData.lastTaskCompletion === today;
    
    let statsMessage = `📊 *YOUR TASK STATISTICS* 📊\n\n`;
    statsMessage += `👤 User: @${senderId.split('@')[0]}\n`;
    statsMessage += `💰 Current balance: ₦${(userData.balance || 0).toLocaleString()}\n\n`;
    
    statsMessage += `🎯 *TASK STATS:*\n`;
    statsMessage += `✅ Total completions: ${userData.totalTaskCompletions || 0}\n`;
    statsMessage += `🔥 Current streak: ${userData.taskStreak || 0} days\n`;
    statsMessage += `🏆 Longest streak: ${userData.longestTaskStreak || 0} days\n`;
    statsMessage += `📅 Last completion: ${userData.lastTaskCompletion || 'Never'}\n`;
    statsMessage += `🎯 Today's status: ${completedToday ? '✅ Completed' : '❌ Pending'}\n\n`;
    
    if (taskHistory.length > 0) {
      statsMessage += `📋 *RECENT HISTORY:*\n`;
      taskHistory.slice(0, 5).forEach((record, index) => {
        const rewardText = `₦${record.reward.toLocaleString()}`;
        const streakText = record.streak > 1 ? ` (${record.streak}🔥)` : '';
        statsMessage += `${index + 1}. ${record.date} - ${rewardText}${streakText}\n`;
      });
    }
    
    statsMessage += `\n🚀 *Keep the momentum going!*`;
    
    await sock.sendMessage(from, {
      text: statsMessage,
      mentions: [senderId]
    }, { quoted: m });
    
  } catch (error) {
    console.error('Error showing user stats:', error);
    await sock.sendMessage(from, {
      text: `❌ *Error loading statistics*\n\nPlease try again later.`
    }, { quoted: m });
  }
}

// Get current task status
async function getCurrentTaskStatus(groupJid) {
  try {
    const today = getCurrentDate();
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    
    if (!todayTask) {
      return {
        exists: false,
        message: `📋 *No task posted today*\n\nWaiting for admin to post today's challenge...`
      };
    }
    
    const completions = todayTask.completions || [];
    const totalMembers = await getGroupMembers({ groupMetadata: () => ({ participants: [] }) }, groupJid);
    
    let statusMessage = `🏢 *GIST HQ - TODAY'S TASK STATUS* 🏢\n\n`;
    statusMessage += `📅 Date: ${today}\n`;
    statusMessage += `🎯 Theme: ${todayTask.theme}\n`;
    statusMessage += `📝 Questions: ${todayTask.questions.length}\n`;
    statusMessage += `✅ Completed: ${completions.length} members\n`;
    statusMessage += `⏰ Deadline: ${todayTask.deadline}\n\n`;
    
    if (completions.length > 0) {
      statusMessage += `🏆 *Recent completions:*\n`;
      completions.slice(-3).forEach((completion, index) => {
        const phone = completion.userPhone;
        const streakText = completion.streak > 1 ? ` 🔥${completion.streak}` : '';
        statusMessage += `• ${phone}${streakText}\n`;
      });
      statusMessage += '\n';
    }
    
    statusMessage += `💰 Reward: ₦${taskSettings.baseReward.toLocaleString()}\n`;
    
    if (taskSettings.enableStreakBonus) {
      const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
      statusMessage += `🔥 Streak bonus: +${bonusPercent}% after ${taskSettings.minStreakForBonus} days\n`;
    }
    
    statusMessage += `\n📋 Format: 1. [answer] 2. [answer] 3. [answer] 4. [answer] 5. [answer]`;
    
    return {
      exists: true,
      task: todayTask,
      message: statusMessage
    };
    
  } catch (error) {
    console.error('Error getting task status:', error);
    return {
      exists: false,
      message: `❌ *Error loading task status*\n\nPlease try again later.`
    };
  }
}

// Test answer validation
async function testAnswerValidation(m, sock, config) {
  const from = m.key.remoteJid;
  const messageText = m.body || '';
  
  // Extract test answers from the message
  const testText = messageText.split(' ').slice(1).join(' ');
  
  if (!testText) {
    await sock.sendMessage(from, {
      text: `🧪 *TEST ANSWER VALIDATION* 🧪\n\nSend a message like:\n\`${config.PREFIX}testtask 1. Answer one 2. Answer two 3. Answer three 4. Answer four 5. Answer five\`\n\nI'll show you how the system would parse your answers.`
    }, { quoted: m });
    return;
  }
  
  const answers = validateAnswerFormat(testText);
  
  let testMessage = `🧪 *ANSWER VALIDATION TEST* 🧪\n\n`;
  testMessage += `📝 *Input text:*\n${testText}\n\n`;
  testMessage += `🔍 *Parsed answers (${answers.length}/${taskSettings.questionCount}):*\n`;
  
  if (answers.length === 0) {
    testMessage += `❌ No valid answers detected!\n\n`;
  } else {
    answers.forEach((answer, index) => {
      if (answer) {
        testMessage += `${index + 1}. ✅ "${answer}"\n`;
      } else {
        testMessage += `${index + 1}. ❌ Missing\n`;
      }
    });
  }
  
  testMessage += `\n🎯 *Validation result:* `;
  
  if (answers.length >= taskSettings.questionCount) {
    testMessage += `✅ VALID - Would be accepted as task submission`;
  } else {
    testMessage += `❌ INVALID - Need ${taskSettings.questionCount} answers`;
  }
  
  await sock.sendMessage(from, { text: testMessage }, { quoted: m });
}

// =======================
// 🚀 AUTO-POSTING SYSTEM
// =======================

// Schedule automatic task posting
function scheduleAutoPost(sock) {
  if (!taskSettings.autoPostEnabled) return;
  
  setInterval(async () => {
    try {
      const now = getNigeriaTime();
      const currentTime = now.format('HH:mm');
      
      if (currentTime === taskSettings.autoPostTime) {
        const today = getCurrentDate();
        
        // Check if already posted today
        const existingTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
        if (existingTask && existingTask.postedAt) {
          return; // Already posted
        }
        
        // Post to configured group
        if (taskSettings.groupJid) {
          await postDailyTask(sock, taskSettings.groupJid);
        }
      }
    } catch (error) {
      console.error('Error in auto-post scheduler:', error);
    }
  }, 60000); // Check every minute
}

// =======================
// 🎮 MAIN COMMAND HANDLER
// =======================

// Main command handler
async function handleTaskCommand(m, sock, config) {
  try {
    // Initialize database
    await initDatabase();
    await loadSettings();
    
    const messageText = m.body || '';
    const args = messageText.split(' ').slice(1);
    const from = m.key.remoteJid;
    const senderId = m.key.participant || m.key.remoteJid;
    
    // Set group JID if not set
    if (!taskSettings.groupJid && from.endsWith('@g.us')) {
      taskSettings.groupJid = from;
      await saveSettings();
    }
    
    // Handle different subcommands
    if (args.length === 0) {
      // Show current task status
      const status = await getCurrentTaskStatus(from);
      await sock.sendMessage(from, { text: status.message }, { quoted: m });
      return;
    }
    
    const subcommand = args[0].toLowerCase();
    
    switch (subcommand) {
      case 'settings':
        await handleAdminSettings(m, sock, config, args.slice(1));
        break;
        
      case 'questions':
        await handleQuestionManagement(m, sock, config, args.slice(1));
        break;
        
      case 'stats':
        await showUserStats(m, sock, config);
        break;
        
      case 'post':
        if (!isAdmin(senderId)) {
          await sock.sendMessage(from, {
            text: `❌ *Access Denied*\n\nOnly admins can manually post tasks.`
          }, { quoted: m });
          return;
        }
        
        if (!from.endsWith('@g.us')) {
          await sock.sendMessage(from, {
            text: `❌ *Group Only*\n\nTasks can only be posted in groups.`
          }, { quoted: m });
          return;
        }
        
        const posted = await postDailyTask(sock, from);
        if (posted) {
          await sock.sendMessage(from, {
            text: `✅ *Daily task posted successfully!*`
          }, { quoted: m });
        } else {
          await sock.sendMessage(from, {
            text: `❌ *Failed to post task*\n\nPlease try again.`
          }, { quoted: m });
        }
        break;
        
      case 'status':
        await sendCompletionUpdate(sock, from);
        break;
        
      case 'help':
        let helpMessage = `🏢 *GIST HQ - DAILY TASK HELP* 🏢\n\n`;
        helpMessage += `*📋 User Commands:*\n`;
        helpMessage += `• \`${config.PREFIX}task\` - View current task\n`;
        helpMessage += `• \`${config.PREFIX}task stats\` - Your statistics\n`;
        helpMessage += `• \`${config.PREFIX}task status\` - Completion status\n`;
        helpMessage += `• \`${config.PREFIX}testtask\` - Test answer format\n\n`;
        
        if (isAdmin(senderId)) {
          helpMessage += `*👑 Admin Commands:*\n`;
          helpMessage += `• \`${config.PREFIX}task settings\` - Configure system\n`;
          helpMessage += `• \`${config.PREFIX}task questions\` - Manage questions\n`;
          helpMessage += `• \`${config.PREFIX}task post\` - Manual post\n\n`;
        }
        
        helpMessage += `*📝 How to submit answers:*\n`;
        helpMessage += `Reply with: 1. [answer] 2. [answer] 3. [answer] 4. [answer] 5. [answer]\n\n`;
        helpMessage += `*🔥 Streak System:*\n`;
        helpMessage += `Complete tasks on consecutive days to build your streak and earn bonus rewards!\n\n`;
        helpMessage += `✨ *Happy tasking, GIST HQ family!*`;
        
        await sock.sendMessage(from, { text: helpMessage }, { quoted: m });
        break;
        
      default:
        await sock.sendMessage(from, {
          text: `❌ *Unknown command*\n\nUse \`${config.PREFIX}task help\` to see available commands.`
        }, { quoted: m });
    }
    
  } catch (error) {
    console.error('Error handling task command:', error);
    await sock.sendMessage(from, {
      text: `❌ *System Error*\n\nPlease try again later.`
    }, { quoted: m });
  }
}

// =======================
// 📱 MESSAGE PROCESSOR
// =======================

// Process incoming messages for task submissions
async function processMessage(m, sock, config) {
  try {
    // Initialize database
    await initDatabase();
    await loadSettings();
    
    const messageText = m.body || '';
    const from = m.key.remoteJid;
    
    // Skip if it's a command
    if (messageText.startsWith(config.PREFIX)) {
      return false;
    }
    
    // Only process in groups
    if (!from.endsWith('@g.us')) {
      return false;
    }
    
    // Try to process as task submission
    return await processTaskSubmission(m, sock, config);
    
  } catch (error) {
    console.error('Error processing message for tasks:', error);
    return false;
  }
}

// =======================
// 📊 STATISTICS & REPORTS
// =======================

// Generate daily report
async function generateDailyReport(date = null) {
  try {
    const targetDate = date || getCurrentDate();
    
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: targetDate });
    if (!todayTask) {
      return `📊 *DAILY REPORT - ${targetDate}*\n\n❌ No task was posted for this date.`;
    }
    
    const completions = todayTask.completions || [];
    const totalRewards = completions.reduce((sum, c) => sum + c.reward, 0);
    const averageStreak = completions.length > 0 ? 
      (completions.reduce((sum, c) => sum + c.streak, 0) / completions.length).toFixed(1) : 0;
    
    let report = `📊 *GIST HQ - DAILY REPORT* 📊\n\n`;
    report += `📅 Date: ${targetDate}\n`;
    report += `🎯 Theme: ${todayTask.theme}\n`;
    report += `📝 Questions: ${todayTask.questions.length}\n\n`;
    
    report += `📈 *COMPLETION STATS:*\n`;
    report += `✅ Total completions: ${completions.length}\n`;
    report += `💰 Total rewards paid: ₦${totalRewards.toLocaleString()}\n`;
    report += `🔥 Average streak: ${averageStreak} days\n`;
    report += `⚡ Completion rate: ${((completions.length / Math.max(completions.length, 1)) * 100).toFixed(1)}%\n\n`;
    
    if (completions.length > 0) {
      report += `🏆 *TOP PERFORMERS:*\n`;
      const sortedCompletions = completions
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 5);
      
      sortedCompletions.forEach((completion, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
        report += `${medal} ${completion.userPhone} - ${completion.streak} days streak\n`;
      });
    }
    
    return report;
    
  } catch (error) {
    console.error('Error generating daily report:', error);
    return `❌ *Error generating report*\n\nPlease try again later.`;
  }
}

// =======================
// 🎪 PLUGIN EXPORTS
// =======================

// Initialize plugin
export async function init(sock, config) {
  try {
    console.log('🚀 Initializing Daily Task System...');
    
    await initDatabase();
    await loadSettings();
    
    // Start auto-post scheduler
    scheduleAutoPost(sock);
    
    console.log('✅ Daily Task System initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Daily Task System:', error);
    return false;
  }
}

// Handle commands
export async function handleCommand(command, m, sock, config) {
  const cmd = command.toLowerCase();
  
  switch (cmd) {
    case 'task':
    case 'dailytask':
    case 'dt':
      await handleTaskCommand(m, sock, config);
      return true;
      
    case 'taskstats':
    case 'mystats':
      await showUserStats(m, sock, config);
      return true;
      
    case 'testtask':
    case 'testdt':
      await testAnswerValidation(m, sock, config);
      return true;
      
    default:
      return false;
  }
}

// Handle non-command messages
export async function handleMessage(m, sock, config) {
  // Process potential task submissions
  return await processMessage(m, sock, config);
}

// Cleanup function
export async function cleanup() {
  try {
    if (mongoClient) {
      await mongoClient.close();
      console.log('🔐 Daily Task System database connection closed');
    }
  } catch (error) {
    console.error('Error during Daily Task System cleanup:', error);
  }
}

// =======================
// 🎯 UTILITY FUNCTIONS
// =======================

// Get leaderboard
async function getTaskLeaderboard(limit = 10) {
  try {
    const leaderboard = await db.collection(COLLECTIONS.TASK_RECORDS).aggregate([
      {
        $group: {
          _id: '$userId',
          totalCompletions: { $sum: 1 },
          totalRewards: { $sum: '$reward' },
          maxStreak: { $max: '$streak' },
          lastCompletion: { $max: '$date' }
        }
      },
      { $sort: { totalCompletions: -1, maxStreak: -1 } },
      { $limit: limit }
    ]).toArray();
    
    return leaderboard;
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return [];
  }
}

// Check if past deadline
function isPastDeadline() {
  const now = getNigeriaTime();
  const [deadlineHour, deadlineMinute] = taskSettings.submissionDeadline.split(':').map(Number);
  const deadline = getNigeriaTime().hour(deadlineHour).minute(deadlineMinute).second(0);
  
  return now.isAfter(deadline);
}

// Get task performance analytics
async function getTaskAnalytics(days = 7) {
  try {
    const endDate = getCurrentDate();
    const startDate = moment.tz('Africa/Lagos').subtract(days - 1, 'days').format('DD-MM-YYYY');
    
    const analytics = await db.collection(COLLECTIONS.DAILY_TASKS).aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $project: {
          date: 1,
          theme: 1,
          completionCount: { $size: '$completions' },
          totalRewards: {
            $sum: '$completions.reward'
          }
        }
      },
      { $sort: { date: 1 } }
    ]).toArray();
    
    return analytics;
  } catch (error) {
    console.error('Error getting task analytics:', error);
    return [];
  }
}

// Format leaderboard message
async function formatLeaderboardMessage(limit = 10) {
  try {
    const leaderboard = await getTaskLeaderboard(limit);
    
    if (leaderboard.length === 0) {
      return `🏆 *GIST HQ - TASK LEADERBOARD* 🏆\n\n❌ No task completions yet.\n\nBe the first to complete a daily task!`;
    }
    
    let message = `🏆 *GIST HQ - TASK LEADERBOARD* 🏆\n\n`;
    message += `📊 *Top ${Math.min(limit, leaderboard.length)} performers:*\n\n`;
    
    leaderboard.forEach((user, index) => {
      const phone = user._id.split('@')[0];
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      
      message += `${medal} ${phone}\n`;
      message += `   ✅ ${user.totalCompletions} completions\n`;
      message += `   🔥 ${user.maxStreak} max streak\n`;
      message += `   💰 ₦${user.totalRewards.toLocaleString()} earned\n\n`;
    });
    
    message += `🚀 *Keep grinding, GIST HQ family!*`;
    
    return message;
  } catch (error) {
    console.error('Error formatting leaderboard:', error);
    return `❌ *Error loading leaderboard*\n\nPlease try again later.`;
  }
}

// =======================
// 🔄 EXPORT DEFAULT
// =======================

export default {
  info,
  init,
  handleCommand,
  handleMessage,
  cleanup,
  
  // Additional utility exports
  postDailyTask,
  getCurrentTaskStatus,
  generateDailyReport,
  getTaskLeaderboard,
  formatLeaderboardMessage,
  isAdmin,
  
  // Settings management
  loadSettings,
  saveSettings,
  
  // Direct access to settings (for external configuration)
  get settings() { return taskSettings; },
  set settings(newSettings) { 
    taskSettings = { ...taskSettings, ...newSettings };
    saveSettings();
  }
};
      