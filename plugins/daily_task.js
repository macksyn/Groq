// plugins/daily_task.js - Enhanced Daily Task System
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Daily Task System',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Enhanced daily quiz task system with improved answer validation, streaks, and MongoDB persistence',
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
  TASK_RECORDS: 'task_records',
  QUESTIONS: 'task_questions',
  SETTINGS: 'task_settings',
  DAILY_TASKS: 'daily_tasks'
};

// Database connection
let db = null;
let mongoClient = null;

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Default task settings
const defaultSettings = {
  baseReward: 1500,
  correctnessBonus: 100,
  enableStreakBonus: true,
  streakBonusMultiplier: 1.5,
  minStreakForBonus: 3,
  autoPostTime: '08:00',
  autoPostEnabled: true,
  questionCount: 5,
  submissionDeadline: '23:59',
  adminNumbers: [],
  groupJids: [],
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

let taskSettings = { ...defaultSettings };

// Enhanced question database
const questionDatabase = {
  business: [
    { question: "What business can you start with just ₦20,000?", correctAnswer: "food vending, retail, digital services, online tutoring, photography" },
    { question: "Name one skill you can monetize online", correctAnswer: "writing, graphic design, programming, tutoring, digital marketing, video editing" },
    { question: "What does ROI stand for in business?", correctAnswer: "return on investment" },
    { question: "What is the first step in starting any business?", correctAnswer: "market research, business planning, idea validation" },
    { question: "Name one way to fund your startup business", correctAnswer: "personal savings, loans, investors, grants, crowdfunding" },
    { question: "What business idea have you always wanted to try?", correctAnswer: "any business idea, personal answer" }
  ],
  
  general: [
    { question: "What is the capital of Nigeria?", correctAnswer: "abuja" },
    { question: "How many states are in Nigeria?", correctAnswer: "36" },
    { question: "What year did Nigeria gain independence?", correctAnswer: "1960" },
    { question: "What is the largest continent in the world?", correctAnswer: "asia" },
    { question: "How many days are in a leap year?", correctAnswer: "366" },
    { question: "What does WWW stand for?", correctAnswer: "world wide web" },
    { question: "What does GPS stand for?", correctAnswer: "global positioning system" },
    { question: "How many minutes are in a full day?", correctAnswer: "1440" },
    { question: "What is the smallest country in the world?", correctAnswer: "vatican city" },
    { question: "How many sides does a triangle have?", correctAnswer: "3" },
    { question: "What is the largest ocean in the world?", correctAnswer: "pacific ocean" },
    { question: "Who wrote the Nigerian national anthem?", correctAnswer: "benedict elide odiase, john ilechukwu" },
    { question: "What does CPU stand for?", correctAnswer: "central processing unit" },
    { question: "How many continents are there?", correctAnswer: "7" },
    { question: "What is the longest river in the world?", correctAnswer: "nile river, nile" }
  ],
  
  hygiene: [
    { question: "How many times should you brush your teeth daily?", correctAnswer: "2, twice" },
    { question: "How long should you wash your hands to kill germs?", correctAnswer: "20 seconds, 20" },
    { question: "How often should you change your toothbrush?", correctAnswer: "every 3 months, 3 months" },
    { question: "What is the recommended time for daily exercise?", correctAnswer: "30 minutes, 30" },
    { question: "How many glasses of water should you drink daily?", correctAnswer: "8, eight" },
    { question: "What should you do before eating?", correctAnswer: "wash your hands, wash hands" }
  ],
  
  current_affairs: [
    { question: "Who is the current President of Nigeria?", correctAnswer: "bola ahmed tinubu, tinubu" },
    { question: "What does CBN stand for?", correctAnswer: "central bank of nigeria" },
    { question: "Name Nigeria's current Vice President", correctAnswer: "kashim shettima, shettima" },
    { question: "What does NYSC stand for?", correctAnswer: "national youth service corps" },
    { question: "Which states are known for oil production in Nigeria?", correctAnswer: "rivers, delta, akwa ibom, bayelsa" },
    { question: "What is Nigeria's current minimum wage?", correctAnswer: "70000, 70,000, seventy thousand" }
  ],
  
  science: [
    { question: "What gas do plants absorb from the atmosphere?", correctAnswer: "carbon dioxide, co2" },
    { question: "Which planet is closest to the Sun?", correctAnswer: "mercury" },
    { question: "What does DNA stand for?", correctAnswer: "deoxyribonucleic acid" },
    { question: "How many bones are in the human body?", correctAnswer: "206" },
    { question: "What is the chemical symbol for water?", correctAnswer: "h2o" },
    { question: "Which organ pumps blood in the human body?", correctAnswer: "heart" }
  ],
  
  fun_facts: [
    { question: "Which animal is known as the King of the Jungle?", correctAnswer: "lion" },
    { question: "How many legs does a spider have?", correctAnswer: "8, eight" },
    { question: "What is the tallest building in the world?", correctAnswer: "burj khalifa" },
    { question: "Which country has the most time zones?", correctAnswer: "france" },
    { question: "What is the most spoken language in the world?", correctAnswer: "mandarin chinese, chinese, mandarin" },
    { question: "How many strings does a standard guitar have?", correctAnswer: "6, six" }
  ]
};

// Initialize MongoDB connection
async function initDatabase() {
  if (db) return db;
  
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DATABASE_NAME);
    
    await db.collection(COLLECTIONS.TASK_RECORDS).createIndex({ userId: 1, date: -1 });
    await db.collection(COLLECTIONS.QUESTIONS).createIndex({ category: 1 });
    await db.collection(COLLECTIONS.DAILY_TASKS).createIndex({ date: 1 }, { unique: true });
    
    console.log('✅ MongoDB connected successfully for Daily Tasks');
    await initializeQuestionDatabase();
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed for Daily Tasks:', error);
    throw error;
  }
}

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

async function initializeQuestionDatabase() {
  try {
    const existingQuestions = await db.collection(COLLECTIONS.QUESTIONS).countDocuments();
    
    if (existingQuestions === 0) {
      console.log('🔄 Initializing question database...');
      
      const allQuestions = [];
      Object.entries(questionDatabase).forEach(([category, questions]) => {
        questions.forEach(question => {
          allQuestions.push({
            question: question.question,
            correctAnswer: question.correctAnswer,
            category: category,
            type: "open",
            createdAt: new Date(),
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

// Enhanced answer validation
function validateAnswerFormat(text) {
  const answers = [];
  
  // Look for "Answer:" pattern
  const answerPattern = /\*Answer:\*\s*([^\n\r*]+)/gi;
  let match;
  
  while ((match = answerPattern.exec(text)) !== null) {
    const answer = match[1].trim();
    
    if (answer.length > 0 && !answer.toLowerCase().includes('answer:') && answer !== '*Answer:*') {
      answers.push(answer);
    }
  }
  
  // Fallback: numbered format
  if (answers.length === 0) {
    const numberedPattern = /(\d+)\.\s*([^0-9\n]+?)(?=\s*\d+\.|$)/g;
    while ((match = numberedPattern.exec(text)) !== null) {
      const questionNum = parseInt(match[1]);
      let answer = match[2].trim();
      
      if (answer.length > 2) {
        const sentences = answer.split(/[?.!]/);
        if (sentences.length > 1) {
          const lastSentence = sentences[sentences.length - 1].trim();
          if (lastSentence.length > 2) {
            answer = lastSentence;
          }
        }
        
        const questionKeywords = ['what', 'how', 'when', 'where', 'why', 'which', 'who', 'can you', 'do you', 'stand for', 'many', '?'];
        const lowerAnswer = answer.toLowerCase();
        const isQuestion = questionKeywords.some(keyword => 
          lowerAnswer.includes(keyword) || lowerAnswer.endsWith('?')
        );
        
        if (!isQuestion) {
          answers[questionNum - 1] = answer;
        }
      }
    }
  }
  
  return answers;
}

// Enhanced answer correctness checking
function checkAnswerCorrectness(userAnswer, correctAnswer) {
  if (!userAnswer || !correctAnswer) return false;
  
  const userLower = userAnswer.toLowerCase().trim();
  const correctLower = correctAnswer.toLowerCase().trim();
  
  // For personal questions
  if (correctLower.includes('personal answer') || correctLower.includes('any ')) {
    return userAnswer.length >= 2;
  }
  
  // Exact match
  if (userLower === correctLower) return true;
  
  // Multiple acceptable answers
  if (correctLower.includes(',')) {
    const acceptableAnswers = correctLower.split(',').map(ans => ans.trim());
    return acceptableAnswers.some(ans => {
      return userLower === ans || 
             userLower.includes(ans) || 
             ans.includes(userLower) ||
             (ans.length > 3 && userLower.replace(/\s+/g, '').includes(ans.replace(/\s+/g, '')));
    });
  }
  
  // Partial matching
  if (userLower.includes(correctLower) || correctLower.includes(userLower)) {
    return true;
  }
  
  // Number matching
  const userNumbers = userAnswer.match(/\d+/g);
  const correctNumbers = correctAnswer.match(/\d+/g);
  if (userNumbers && correctNumbers && userNumbers[0] === correctNumbers[0]) {
    return true;
  }
  
  // Common abbreviations
  const commonAbbreviations = {
    'gps': 'global positioning system',
    'www': 'world wide web',
    'roi': 'return on investment',
    'cbn': 'central bank of nigeria',
    'nysc': 'national youth service corps',
    'dna': 'deoxyribonucleic acid',
    'cpu': 'central processing unit',
    'co2': 'carbon dioxide',
    'h2o': 'water'
  };
  
  for (const [abbrev, fullForm] of Object.entries(commonAbbreviations)) {
    if (correctLower.includes(abbrev) && userLower.includes(fullForm)) {
      return true;
    }
    if (correctLower.includes(fullForm) && userLower.includes(abbrev)) {
      return true;
    }
  }
  
  return false;
}

function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

function getCurrentTheme() {
  const today = getNigeriaTime().format('dddd').toLowerCase();
  return taskSettings.themes[today] || taskSettings.themes.sunday;
}

function getCurrentCategory() {
  const today = getNigeriaTime().format('dddd').toLowerCase();
  const categoryMap = {
    monday: 'business', tuesday: 'general', wednesday: 'hygiene',
    thursday: 'current_affairs', friday: 'science', saturday: 'fun_facts', sunday: 'general'
  };
  return categoryMap[today] || 'general';
}

async function getRandomQuestions(category, count = 5) {
  try {
    let questions = await db.collection(COLLECTIONS.QUESTIONS)
      .aggregate([
        { $match: { category: category, active: true } },
        { $sample: { size: count } }
      ])
      .toArray();
    
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
    
    return questions.slice(0, count);
  } catch (error) {
    console.error('Error getting random questions:', error);
    return [];
  }
}

async function createDailyTask(groupJid) {
  try {
    const today = getCurrentDate();
    const theme = getCurrentTheme();
    const category = getCurrentCategory();
    
    const existingTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    if (existingTask) return existingTask;
    
    const questions = await getRandomQuestions(category, taskSettings.questionCount);
    if (questions.length === 0) throw new Error('No questions available');
    
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

function formatDailyTaskMessage(taskData) {
  const nigeriaTime = getNigeriaTime();
  const dayName = nigeriaTime.format('dddd');
  const dateStr = nigeriaTime.format('MMMM DD, YYYY');
  
  let message = `🏢 *GIST HQ - DAILY TASK CHALLENGE* 🏢\n\n`;
  message += `📅 ${dayName}, ${dateStr}\n`;
  message += `🎯 *Today's Theme:* ${taskData.theme.toUpperCase()}\n\n`;
  message += `📝 *Answer all ${taskData.questions.length} questions to earn your reward!*\n`;
  message += `⏰ *Deadline:* ${taskData.deadline} today\n\n`;
  
  taskData.questions.forEach((q, index) => {
    message += `${index + 1}️⃣ ${q.question}\n`;
    message += `*Answer:*\n\n`;
  });
  
  message += `💰 *Reward:* ₦${taskSettings.baseReward.toLocaleString()} for completion\n`;
  message += `✨ *Bonus:* ₦${taskSettings.correctnessBonus.toLocaleString()} per correct answer\n`;
  
  if (taskSettings.enableStreakBonus) {
    const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
    message += `🔥 *Streak Bonus:* +${bonusPercent}% after ${taskSettings.minStreakForBonus} consecutive days\n`;
  }
  
  message += `\n📋 *HOW TO SUBMIT:*\n`;
  message += `1️⃣ Copy this entire message\n`;
  message += `2️⃣ Type your answers after each "Answer:"\n`;
  message += `3️⃣ Send the completed message\n\n`;
  message += `✨ *Good luck, GIST HQ family!* ✨`;
  
  return message;
}

async function getGroupMembers(sock, groupJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    return groupMetadata.participants.map(participant => participant.id);
  } catch (error) {
    console.error('Error getting group members:', error);
    return [];
  }
}

async function postDailyTask(sock, groupJid) {
  try {
    const taskData = await createDailyTask(groupJid);
    const message = formatDailyTaskMessage(taskData);
    
    let mentions = [];
    if (taskSettings.tagAllMembers) {
      mentions = await getGroupMembers(sock, groupJid);
    }
    
    await sock.sendMessage(groupJid, { text: message, mentions: mentions });
    console.log(`✅ Daily task posted to group ${groupJid}`);
    return true;
  } catch (error) {
    console.error('Error posting daily task:', error);
    return false;
  }
}

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

async function addMoney(userId, amount, reason = 'Daily task reward') {
  return await unifiedUserManager.addMoney(userId, amount, reason);
}

async function getUserData(userId) {
  return await unifiedUserManager.getUserData(userId);
}

async function updateUserData(userId, data) {
  return await unifiedUserManager.updateUserData(userId, data);
}

async function initUser(userId) {
  return await unifiedUserManager.initUser(userId);
}

// Enhanced task submission processing
async function processTaskSubmission(m, sock, config) {
  try {
    const messageText = m.body || '';
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const today = getCurrentDate();
    
    const answers = validateAnswerFormat(messageText);
    if (answers.length < taskSettings.questionCount) {
      return false;
    }
    
    console.log(`📝 Task submission detected from ${senderId}`);
    console.log(`📋 Extracted answers:`, answers);
    
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    if (!todayTask) {
      await sock.sendMessage(from, {
        text: `❌ *No active task for today.*\n\nUse *${config.PREFIX}task current* to check for today's task.`
      }, { quoted: m });
      return true;
    }
    
    const hasCompleted = todayTask.completions.some(completion => completion.userId === senderId);
    if (hasCompleted) {
      await sock.sendMessage(from, {
        text: `📝 *You've already completed today's task!*\n\nCome back tomorrow for a new challenge. 🚀`
      }, { quoted: m });
      return true;
    }
    
    await initUser(senderId);
    const userData = await getUserData(senderId);
    
    // Check correctness with detailed logging
    let correctCount = 0;
    const answerResults = [];
    
    for (let i = 0; i < todayTask.questions.length; i++) {
      const question = todayTask.questions[i];
      const userAnswer = answers[i] || '';
      const isCorrect = checkAnswerCorrectness(userAnswer, question.correctAnswer);
      
      console.log(`Q${i+1}: "${question.question}"`);
      console.log(`User: "${userAnswer}" | Expected: "${question.correctAnswer}" | Correct: ${isCorrect}`);
      
      if (isCorrect) correctCount++;
      
      answerResults.push({
        questionNumber: i + 1,
        question: question.question,
        userAnswer: userAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect: isCorrect
      });
    }
    
    const currentStreak = updateTaskStreak(senderId, userData, today);
    
    // Calculate rewards
    let baseReward = taskSettings.baseReward;
    const correctnessBonus = correctCount * taskSettings.correctnessBonus;
    let streakBonus = 0;
    
    if (taskSettings.enableStreakBonus && currentStreak >= taskSettings.minStreakForBonus) {
      const originalBase = baseReward;
      baseReward = Math.floor(baseReward * taskSettings.streakBonusMultiplier);
      streakBonus = baseReward - originalBase;
    }
    
    const finalReward = baseReward + correctnessBonus;
    
    await addMoney(senderId, finalReward, 'Daily task completion');
    
    await updateUserData(senderId, {
      lastTaskCompletion: today,
      totalTaskCompletions: (userData.totalTaskCompletions || 0) + 1,
      taskStreak: currentStreak,
      longestTaskStreak: userData.longestTaskStreak,
      totalCorrectAnswers: (userData.totalCorrectAnswers || 0) + correctCount
    });
    
    // Save completion
    const completionData = {
      userId: senderId,
      userPhone: senderId.split('@')[0],
      answers: answers,
      correctCount: correctCount,
      submittedAt: new Date(),
      totalReward: finalReward,
      streak: currentStreak
    };
    
    await db.collection(COLLECTIONS.DAILY_TASKS).updateOne(
      { date: today },
      { $push: { completions: completionData } }
    );
    
    // Save record
    await db.collection(COLLECTIONS.TASK_RECORDS).insertOne({
      userId: senderId,
      date: today,
      answers: answers,
      correctCount: correctCount,
      totalReward: finalReward,
      streak: currentStreak,
      submittedAt: new Date()
    });
    
    const updatedUserData = await getUserData(senderId);
    
    // Enhanced success message
    let successMessage = `✅ *TASK COMPLETED!* ✅\n\n`;
    successMessage += `📊 *Your Score:* ${correctCount}/${todayTask.questions.length} correct\n\n`;
    
    // Show detailed answer review
    successMessage += `📝 *Answer Review:*\n`;
    answerResults.forEach((result) => {
      const emoji = result.isCorrect ? '✅' : '❌';
      const truncatedAnswer = result.userAnswer.length > 20 ? 
        result.userAnswer.substring(0, 20) + '...' : result.userAnswer;
      successMessage += `${emoji} Q${result.questionNumber}: ${truncatedAnswer}\n`;
    });
    successMessage += `\n`;
    
    // Reward breakdown
    successMessage += `💰 *Reward Breakdown:*\n`;
    successMessage += `• Base completion: ₦${taskSettings.baseReward.toLocaleString()}\n`;
    successMessage += `• Correct answers: ₦${correctnessBonus.toLocaleString()} (${correctCount} × ₦${taskSettings.correctnessBonus})\n`;
    
    if (streakBonus > 0) {
      const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
      successMessage += `• Streak bonus: +₦${streakBonus.toLocaleString()} (${bonusPercent}%)\n`;
    }
    
    successMessage += `• *Total earned: ₦${finalReward.toLocaleString()}*\n\n`;
    successMessage += `💸 *Your balance: ₦${(updatedUserData.balance || 0).toLocaleString()}*\n`;
    successMessage += `🔥 *Current streak: ${currentStreak} days*\n`;
    
    if (currentStreak === 1) {
      successMessage += `\n🌟 *Great start! Keep it up tomorrow!*`;
    } else if (currentStreak < taskSettings.minStreakForBonus) {
      const needed = taskSettings.minStreakForBonus - currentStreak;
      successMessage += `\n🔥 *${needed} more days to unlock streak bonus!*`;
    } else {
      successMessage += `\n🎉 *Amazing streak! Bonus activated!*`;
    }
    
    successMessage += `\n\n🎉 *Well done! See you tomorrow!* 🚀`;
    
    await sock.sendMessage(from, { text: successMessage }, { quoted: m });
    
    return true;
  } catch (error) {
    console.error('Error processing task submission:', error);
    await sock.sendMessage(from, {
      text: `❌ *Error processing your submission.*\n\nPlease try again or contact an admin.`
    }, { quoted: m });
    return false;
  }
}

async function checkAndPostDailyTask(sock) {
  try {
    if (!taskSettings.autoPostEnabled) {
      console.log('⏸️ Auto-posting disabled');
      return;
    }
    
    const now = getNigeriaTime();
    const currentTime = now.format('HH:mm');
    
    if (currentTime !== taskSettings.autoPostTime) {
      return;
    }
    
    const today = getCurrentDate();
    
    const existingTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    if (existingTask) {
      console.log(`📅 Task already posted for ${today}`);
      return;
    }
    
    if (!taskSettings.groupJids || taskSettings.groupJids.length === 0) {
      console.log('⚠️ No groups registered for auto-posting');
      return;
    }
    
    for (const groupJid of taskSettings.groupJids) {
      try {
        const success = await postDailyTask(sock, groupJid);
        if (success) {
          console.log(`✅ Daily task auto-posted to ${groupJid}`);
        }
      } catch (error) {
        console.error(`Error posting to group ${groupJid}:`, error);
      }
    }
    
  } catch (error) {
    console.error('Error in checkAndPostDailyTask:', error);
  }
}

async function setGroupJid(groupJid) {
  if (!taskSettings.groupJids.includes(groupJid)) {
    taskSettings.groupJids.push(groupJid);
    await saveSettings();
    console.log(`📝 Group JID added: ${groupJid}`);
  }
}

// Check if user is authorized
async function isAuthorized(sock, from, sender) {
  if (taskSettings.adminNumbers.includes(sender.split('@')[0])) return true;
  
  const ownerNumber = process.env.OWNER_NUMBER || '';
  const adminNumbers = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
  
  if (sender.split('@')[0] === ownerNumber || adminNumbers.includes(sender.split('@')[0])) {
    return true;
  }
  
  try {
    if (!from.endsWith('@g.us')) return false;
    
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(participant => participant.admin === 'admin' || participant.admin === 'superadmin')
      .map(participant => participant.id);

    return groupAdmins.includes(sender);
  } catch (error) {
    return false;
  }
}

// Main handler
export default async function dailyTaskHandler(m, sock, config) {
  try {
    if (!db) {
      await initDatabase();
      await loadSettings();
    }
    
    if (m.key.remoteJid.endsWith('@g.us')) {
      await setGroupJid(m.key.remoteJid);
    }
    
    if (m.body && !m.body.startsWith(config.PREFIX)) {
      const handled = await processTaskSubmission(m, sock, config);
      if (handled) return;
    }
    
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    
    const reply = async (text) => {
      await sock.sendMessage(from, { text }, { quoted: m });
    };
    
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
        await handleTaskStats({ senderId, reply });
        break;
        
      case 'testtask':
        await handleTestTask({ reply, config }, args.slice(1));
        break;
    }
  } catch (error) {
    console.error('❌ Daily Task plugin error:', error);
  }
}

async function handleSubCommand(subCommand, args, context) {
  switch (subCommand.toLowerCase()) {
    case 'post':
      await handlePostTask(context);
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
      await context.reply(`❓ Unknown command: *${subCommand}*\n\nUse *${context.config.PREFIX}task help* for available commands.`);
  }
}

async function showTaskMenu(reply, prefix) {
  const menuText = `🎯 *DAILY TASK SYSTEM* 🎯\n\n` +
                  `📊 *User Commands:*\n` +
                  `• *current* - View today's task\n` +
                  `• *stats* - View your statistics\n` +
                  `• *records* - View completion history\n` +
                  `• *completions* - See who completed today\n\n` +
                  `👑 *Admin Commands:*\n` +
                  `• *post* - Post today's task manually\n` +
                  `• *settings* - System settings\n\n` +
                  `🤖 *How to Submit Answers:*\n` +
                  `1️⃣ Copy the daily task message\n` +
                  `2️⃣ Fill in answers after each "Answer:"\n` +
                  `3️⃣ Send the completed message\n\n` +
                  `📅 *Daily Themes:*\n` +
                  `Mon: Business • Tue: General • Wed: Hygiene\n` +
                  `Thu: Current Affairs • Fri: Science • Sat: Fun Facts • Sun: Mixed\n\n` +
                  `💰 *Rewards:* ₦${taskSettings.baseReward.toLocaleString()} base + ₦${taskSettings.correctnessBonus} per correct answer\n` +
                  `🔥 *Streak Bonus:* +${Math.floor((taskSettings.streakBonusMultiplier - 1) * 100)}% after ${taskSettings.minStreakForBonus} days\n\n` +
                  `💡 *Usage:* ${prefix}task [command]`;
  
  await reply(menuText);
}

async function handlePostTask(context) {
  const { reply, senderId, sock, m, from } = context;
  
  const isAdminUser = await isAuthorized(sock, from, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can manually post tasks.');
    return;
  }
  
  try {
    if (!from.endsWith('@g.us')) {
      await reply('❌ This command works only in groups.');
      return;
    }
    
    const success = await postDailyTask(sock, from);
    
    if (success) {
      await reply('✅ *Daily task posted successfully!*\n\nMembers can now submit their answers.');
    } else {
      await reply('❌ *Failed to post task. Try again.*');
    }
  } catch (error) {
    await reply('❌ *Error posting task.*');
    console.error('Post task error:', error);
  }
}

async function handleCurrentTask(context) {
  const { reply, config } = context;
  
  try {
    const today = getCurrentDate();
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    
    if (!todayTask) {
      await reply(`📅 *No task for today.*\n\n🕐 Tasks auto-post at ${taskSettings.autoPostTime} daily.\n\n👑 Admins can post manually: *${config.PREFIX}task post*`);
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
      taskMessage += `\n⏰ *Task deadline has passed*\n`;
      taskMessage += `Come back tomorrow for a new challenge! 🚀`;
    } else {
      taskMessage += `\n📝 *Today's Questions:*\n\n`;
      
      todayTask.questions.forEach((q, index) => {
        taskMessage += `${index + 1}️⃣ ${q.question}\n`;
        taskMessage += `*Answer:*\n\n`;
      });
      
      taskMessage += `💰 *Rewards:*\n`;
      taskMessage += `• Base: ₦${taskSettings.baseReward.toLocaleString()}\n`;
      taskMessage += `• Per correct: ₦${taskSettings.correctnessBonus.toLocaleString()}\n`;
      
      if (taskSettings.enableStreakBonus) {
        const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
        taskMessage += `• Streak bonus: +${bonusPercent}% (after ${taskSettings.minStreakForBonus} days)\n`;
      }
      
      taskMessage += `\n📋 *Instructions:*\n`;
      taskMessage += `1️⃣ Copy this message\n`;
      taskMessage += `2️⃣ Fill answers after each "Answer:"\n`;
      taskMessage += `3️⃣ Send completed message\n\n`;
      taskMessage += `⏰ *Time remaining:* Until ${taskSettings.submissionDeadline} today`;
    }
    
    await reply(taskMessage);
  } catch (error) {
    await reply('❌ *Error loading current task.*');
    console.error('Current task error:', error);
  }
}

async function handleTaskStats(context) {
  const { reply, senderId } = context;
  
  try {
    await initUser(senderId);
    const userData = await getUserData(senderId);
    const today = getCurrentDate();
    
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    const completedToday = todayTask ? todayTask.completions.some(c => c.userId === senderId) : false;
    
    // Get recent performance
    const recentRecords = await db.collection(COLLECTIONS.TASK_RECORDS)
      .find({ userId: senderId })
      .sort({ submittedAt: -1 })
      .limit(5)
      .toArray();
    
    let statsMessage = `📊 *YOUR TASK STATISTICS* 📊\n\n`;
    statsMessage += `👤 *Profile Summary:*\n`;
    statsMessage += `📅 Last completion: ${userData.lastTaskCompletion || 'Never'}\n`;
    statsMessage += `📋 Total completions: ${userData.totalTaskCompletions || 0}\n`;
    statsMessage += `🎯 Total correct answers: ${userData.totalCorrectAnswers || 0}\n`;
    statsMessage += `💰 Current balance: ₦${(userData.balance || 0).toLocaleString()}\n\n`;
    
    statsMessage += `🔥 *Streak Information:*\n`;
    statsMessage += `• Current streak: ${userData.taskStreak || 0} days\n`;
    statsMessage += `• Longest streak: ${userData.longestTaskStreak || 0} days\n`;
    statsMessage += `• Today's status: ${completedToday ? 'Completed ✅' : 'Pending ❌'}\n\n`;
    
    if (recentRecords.length > 0) {
      statsMessage += `📈 *Recent Performance:*\n`;
      recentRecords.forEach((record, index) => {
        statsMessage += `${index + 1}. ${record.date}: ${record.correctCount}/5 - ₦${record.totalReward.toLocaleString()}\n`;
      });
      statsMessage += `\n`;
    }
    
    const streak = userData.taskStreak || 0;
    if (streak >= 7) {
      statsMessage += `🌟 *Outstanding ${streak}-day streak! You're on fire!* 🔥`;
    } else if (streak >= 3) {
      statsMessage += `🔥 *Great streak! Keep the momentum going!*`;
    } else if (completedToday) {
      statsMessage += `✅ *Good job today! Build your streak tomorrow!*`;
    } else {
      statsMessage += `💪 *Ready for today's challenge? Complete your task now!*`;
    }
    
    await reply(statsMessage);
  } catch (error) {
    await reply('❌ *Error loading statistics.*');
    console.error('Stats error:', error);
  }
}

async function handleTaskSettings(context, args) {
  const { reply, senderId, sock, from, config } = context;
  
  const isAdminUser = await isAuthorized(sock, from, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can access settings.');
    return;
  }
  
  try {
    if (args.length === 0) {
      let settingsMessage = `⚙️ *TASK SYSTEM SETTINGS* ⚙️\n\n`;
      settingsMessage += `💰 *Rewards:*\n`;
      settingsMessage += `• Base reward: ₦${taskSettings.baseReward.toLocaleString()}\n`;
      settingsMessage += `• Correctness bonus: ₦${taskSettings.correctnessBonus} per correct\n`;
      settingsMessage += `• Streak bonus: ${taskSettings.enableStreakBonus ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `• Streak multiplier: ${taskSettings.streakBonusMultiplier}x\n`;
      settingsMessage += `• Min streak for bonus: ${taskSettings.minStreakForBonus} days\n\n`;
      
      settingsMessage += `🤖 *Automation:*\n`;
      settingsMessage += `• Auto-post: ${taskSettings.autoPostEnabled ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `• Post time: ${taskSettings.autoPostTime} (Nigeria time)\n`;
      settingsMessage += `• Tag all members: ${taskSettings.tagAllMembers ? 'Yes ✅' : 'No ❌'}\n\n`;
      
      settingsMessage += `📝 *Task Configuration:*\n`;
      settingsMessage += `• Questions per task: ${taskSettings.questionCount}\n`;
      settingsMessage += `• Submission deadline: ${taskSettings.submissionDeadline}\n`;
      settingsMessage += `• Registered groups: ${taskSettings.groupJids.length}\n\n`;
      
      settingsMessage += `🔧 *Available Commands:*\n`;
      settingsMessage += `• \`${config.PREFIX}task settings reward 2000\`\n`;
      settingsMessage += `• \`${config.PREFIX}task settings bonus 150\`\n`;
      settingsMessage += `• \`${config.PREFIX}task settings streak on/off\`\n`;
      settingsMessage += `• \`${config.PREFIX}task settings autopost on/off\`\n`;
      settingsMessage += `• \`${config.PREFIX}task settings posttime 09:00\``;
      
      await reply(settingsMessage);
      return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args[1];
    
    let responseText = "";
    
    switch (setting) {
      case 'reward':
        if (!value || isNaN(value) || parseInt(value) < 100) {
          responseText = `⚠️ Invalid amount. Use: ${config.PREFIX}task settings reward 2000 (min: ₦100)`;
        } else {
          taskSettings.baseReward = parseInt(value);
          await saveSettings();
          responseText = `✅ Base reward set to ₦${parseInt(value).toLocaleString()}`;
        }
        break;
        
      case 'bonus':
        if (!value || isNaN(value) || parseInt(value) < 0) {
          responseText = `⚠️ Invalid amount. Use: ${config.PREFIX}task settings bonus 150`;
        } else {
          taskSettings.correctnessBonus = parseInt(value);
          await saveSettings();
          responseText = `✅ Correctness bonus set to ₦${parseInt(value).toLocaleString()} per correct answer`;
        }
        break;
        
      case 'streak':
        if (['on', 'true', 'yes', '1'].includes(value?.toLowerCase())) {
          taskSettings.enableStreakBonus = true;
          await saveSettings();
          responseText = "✅ Streak bonus enabled 🔥\n\nUsers will get bonus rewards for maintaining streaks!";
        } else if (['off', 'false', 'no', '0'].includes(value?.toLowerCase())) {
          taskSettings.enableStreakBonus = false;
          await saveSettings();
          responseText = "✅ Streak bonus disabled";
        } else {
          responseText = `⚠️ Invalid value. Use: ${config.PREFIX}task settings streak on/off`;
        }
        break;
        
      case 'autopost':
        if (['on', 'true', 'yes', '1'].includes(value?.toLowerCase())) {
          taskSettings.autoPostEnabled = true;
          await saveSettings();
          responseText = `✅ Auto-posting enabled 🤖\n\n*Tasks will automatically post at ${taskSettings.autoPostTime} daily.*`;
        } else if (['off', 'false', 'no', '0'].includes(value?.toLowerCase())) {
          taskSettings.autoPostEnabled = false;
          await saveSettings();
          responseText = "✅ Auto-posting disabled\n\nTasks will only be posted manually.";
        } else {
          responseText = `⚠️ Invalid value. Use: ${config.PREFIX}task settings autopost on/off`;
        }
        break;
        
      case 'posttime':
        if (!value || !/^\d{2}:\d{2}$/.test(value)) {
          responseText = `⚠️ Invalid time format. Use: ${config.PREFIX}task settings posttime 09:00`;
        } else {
          const [hours, minutes] = value.split(':');
          if (parseInt(hours) > 23 || parseInt(minutes) > 59) {
            responseText = "⚠️ Invalid time. Hours: 00-23, Minutes: 00-59";
          } else {
            taskSettings.autoPostTime = value;
            await saveSettings();
            responseText = `✅ Auto-post time set to ${value} (Nigeria time)`;
          }
        }
        break;
        
      default:
        responseText = `⚠️ Unknown setting: *${setting}*\n\nAvailable settings:\n• reward\n• bonus\n• streak\n• autopost\n• posttime`;
    }
    
    await reply(responseText);
  } catch (error) {
    await reply('❌ *Error updating settings.*');
    console.error('Settings error:', error);
  }
}

async function handleCompletionsView(context, args) {
  const { reply } = context;
  
  try {
    const date = args[0] || getCurrentDate();
    
    const task = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: date });
    
    if (!task) {
      await reply(`📅 *No task found for ${date}*\n\nTasks are available after they're posted.`);
      return;
    }
    
    let completionMessage = `📊 *TASK COMPLETION REPORT* 📊\n\n`;
    completionMessage += `📅 Date: ${date}\n`;
    completionMessage += `🎯 Theme: ${task.theme}\n`;
    completionMessage += `📋 Participants: ${task.completions.length}\n`;
    
    if (task.completions.length === 0) {
      completionMessage += `\n❌ *No completions yet*\n`;
      completionMessage += `💪 Encourage members to participate!`;
    } else {
      completionMessage += `\n✅ *COMPLETION DETAILS:*\n\n`;
      
      // Sort by score then by submission time
      const sortedCompletions = task.completions.sort((a, b) => {
        if (b.correctCount !== a.correctCount) {
          return b.correctCount - a.correctCount;
        }
        return new Date(a.submittedAt) - new Date(b.submittedAt);
      });
      
      sortedCompletions.forEach((completion, index) => {
        const userPhone = completion.userId.split('@')[0];
        const submittedTime = moment(completion.submittedAt).tz('Africa/Lagos').format('HH:mm');
        const scoreEmoji = completion.correctCount === task.questions.length ? '🏆' : 
                          completion.correctCount >= Math.ceil(task.questions.length * 0.8) ? '🥈' : 
                          completion.correctCount >= Math.ceil(task.questions.length * 0.6) ? '🥉' : '📝';
        
        completionMessage += `${scoreEmoji} ${index + 1}. +${userPhone}\n`;
        completionMessage += `   📊 Score: ${completion.correctCount}/${task.questions.length} correct\n`;
        completionMessage += `   ⏰ Time: ${submittedTime} • 🔥 Streak: ${completion.streak} days\n`;
        completionMessage += `   💰 Earned: ₦${completion.totalReward.toLocaleString()}\n\n`;
      });
      
      // Statistics
      const totalCorrect = sortedCompletions.reduce((sum, c) => sum + c.correctCount, 0);
      const avgScore = (totalCorrect / sortedCompletions.length / task.questions.length * 100).toFixed(1);
      const perfectScores = sortedCompletions.filter(c => c.correctCount === task.questions.length).length;
      
      completionMessage += `📈 *Statistics:*\n`;
      completionMessage += `• Average score: ${avgScore}%\n`;
      completionMessage += `• Perfect scores: ${perfectScores}\n`;
      completionMessage += `• Total rewards paid: ₦${sortedCompletions.reduce((sum, c) => sum + c.totalReward, 0).toLocaleString()}`;
    }
    
    await reply(completionMessage);
  } catch (error) {
    await reply('❌ *Error loading completions.*');
    console.error('Completions error:', error);
  }
}

async function handleTaskRecords(context, args) {
  const { reply, senderId, config } = context;
  
  try {
    const limit = args[0] ? parseInt(args[0]) : 10;
    const limitValue = Math.min(Math.max(limit, 1), 50);
    
    const records = await db.collection(COLLECTIONS.TASK_RECORDS)
      .find({ userId: senderId })
      .sort({ submittedAt: -1 })
      .limit(limitValue)
      .toArray();
    
    if (records.length === 0) {
      await reply(`📋 *No task history found*\n\nComplete some tasks to build your record!\n\nUse *${config.PREFIX}task current* to see today's task.`);
      return;
    }
    
    let recordsText = `📋 *YOUR TASK HISTORY* 📋\n\n`;
    recordsText += `📊 Showing last ${records.length} completions:\n\n`;
    
    records.forEach((record, index) => {
      const scorePercent = Math.round((record.correctCount / taskSettings.questionCount) * 100);
      const scoreEmoji = scorePercent === 100 ? '🏆' : 
                        scorePercent >= 80 ? '🥈' : 
                        scorePercent >= 60 ? '🥉' : '📝';
      
      recordsText += `${scoreEmoji} ${index + 1}. 📅 ${record.date}\n`;
      recordsText += `   📊 ${record.correctCount}/${taskSettings.questionCount} correct (${scorePercent}%)\n`;
      recordsText += `   💰 ₦${record.totalReward.toLocaleString()} earned • 🔥 ${record.streak} day streak\n`;
      recordsText += `   ⏰ ${moment(record.submittedAt).tz('Africa/Lagos').format('DD/MM/YY HH:mm')}\n\n`;
    });
    
    recordsText += `💡 *Use: ${config.PREFIX}task records [number]* for more (max 50)`;
    
    await reply(recordsText);
  } catch (error) {
    await reply('❌ *Error loading task records.*');
    console.error('Records error:', error);
  }
}

async function handleTestTask(context, args) {
  const { reply, config } = context;
  const testAnswers = args.join(' ');
  
  if (!testAnswers) {
    await reply(`🔍 *ANSWER FORMAT VALIDATOR* 🔍\n\n*Usage:* ${config.PREFIX}testtask [your_test_message]\n\n*✅ NEW FORMAT (Recommended):*\n${config.PREFIX}testtask 1️⃣ What is 2+2?\n*Answer:* 4\n\n2️⃣ Capital of Nigeria?\n*Answer:* Abuja\n\n*📝 OLD FORMAT (Still supported):*\n${config.PREFIX}testtask 1. Four 2. Abuja 3. 168\n\n*💡 This tests your format without submitting to the actual task.*`);
    return;
  }
  
  try {
    const answers = validateAnswerFormat(testAnswers);
    
    let result = `🔍 *FORMAT VALIDATION RESULTS* 🔍\n\n`;
    result += `📝 Input: ${testAnswers.length} characters\n`;
    result += `🎯 Expected: ${taskSettings.questionCount} answers\n`;
    result += `📊 Detected: ${answers.length} answers\n\n`;
    
    if (answers.length > 0) {
      result += `✅ *Parsed Answers:*\n`;
      answers.forEach((answer, index) => {
        if (answer && answer.trim().length > 0) {
          const truncated = answer.length > 30 ? answer.substring(0, 30) + '...' : answer;
          result += `${index + 1}. "${truncated}"\n`;
        } else {
          result += `${index + 1}. ❌ *Empty/Missing*\n`;
        }
      });
      result += `\n`;
    }
    
    // Validation status
    if (answers.length >= taskSettings.questionCount) {
      const validAnswers = answers.filter(a => a && a.trim().length > 0).length;
      if (validAnswers >= taskSettings.questionCount) {
        result += `🎉 *FORMAT VALID!* ✅\n`;
        result += `✨ Ready for submission!\n\n`;
        result += `💡 *To submit for real:*\n`;
        result += `1️⃣ Get today's task: ${config.PREFIX}task current\n`;
        result += `2️⃣ Copy and fill the answers\n`;
        result += `3️⃣ Send completed message`;
      } else {
        result += `⚠️ *INCOMPLETE ANSWERS*\n`;
        result += `Found ${validAnswers} valid out of ${taskSettings.questionCount} needed\n`;
        result += `Some answers are empty or missing.`;
      }
    } else {
      result += `❌ *INSUFFICIENT ANSWERS*\n`;
      result += `Need ${taskSettings.questionCount} answers, found ${answers.length}\n\n`;
      result += `💡 *Tips:*\n`;
      result += `• Copy the full task message\n`;
      result += `• Fill answers after each "Answer:" line\n`;
      result += `• Don't modify the question text\n`;
      result += `• Ensure all answers are filled`;
    }
    
    await reply(result);
  } catch (error) {
    await reply('❌ *Error testing format.*');
    console.error('Test error:', error);
  }
}

// Export functions for external use
export { 
  checkAndPostDailyTask,
  setGroupJid,
  taskSettings
};
