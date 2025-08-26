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
  baseReward: 300,
  correctnessBonus: 50,
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

// Question database with personal questions added
const questionDatabase = {
  business: [
    { question: "What business can you start with just ₦20,000?", correctAnswer: "Food vending, retail, digital services" },
    { question: "Name one skill you can monetize online", correctAnswer: "Writing, graphic design, programming, tutoring" },
    { question: "What does ROI stand for in business?", correctAnswer: "Return on Investment" },
    { question: "What is the first step in starting any business?", correctAnswer: "Market research, business planning" },
    { question: "Name one way to fund your startup business", correctAnswer: "Personal savings, loans, investors, grants" },
    { question: "How can you market your business for free?", correctAnswer: "Social media, networking, word of mouth" },
    { question: "What is customer retention?", correctAnswer: "Keeping existing customers engaged and loyal" },
    { question: "Name one digital skill that's in high demand", correctAnswer: "Web development, digital marketing, data analysis" },
    { question: "What does MVP mean in business?", correctAnswer: "Minimum Viable Product" },
    { question: "Name one way to reduce business costs", correctAnswer: "Automation, bulk purchasing, remote work" },
    { question: "What business idea have you always wanted to try?", correctAnswer: "Any business idea" },
    { question: "If you had ₦100,000 today, what business would you start?", correctAnswer: "Any business idea" },
    { question: "What skill do you have that others might pay for?", correctAnswer: "Any skill or talent" },
    { question: "Name one successful Nigerian entrepreneur you admire", correctAnswer: "Aliko Dangote, Tony Elumelu, Folorunsho Alakija" },
    { question: "What's the biggest business challenge in Nigeria today?", correctAnswer: "Power supply, funding, corruption, inflation" }
  ],
  
  general: [
    { question: "What is the capital of Nigeria?", correctAnswer: "Abuja" },
    { question: "How many states are in Nigeria?", correctAnswer: "36" },
    { question: "What year did Nigeria gain independence?", correctAnswer: "1960" },
    { question: "What is the largest continent in the world?", correctAnswer: "Asia" },
    { question: "How many days are in a leap year?", correctAnswer: "366" },
    { question: "What does www stand for?", correctAnswer: "World Wide Web" },
    { question: "How many minutes are in a full day?", correctAnswer: "1440" },
    { question: "What is the smallest country in the world?", correctAnswer: "Vatican City" },
    { question: "How many sides does a triangle have?", correctAnswer: "3" },
    { question: "What is the largest ocean in the world?", correctAnswer: "Pacific Ocean" },
    { question: "Which state in Nigeria are you from?", correctAnswer: "Any Nigerian state" },
    { question: "What is your favorite Nigerian food?", correctAnswer: "Any Nigerian food" },
    { question: "Name one place in Nigeria you'd love to visit", correctAnswer: "Any place in Nigeria" },
    { question: "What's your favorite color and why?", correctAnswer: "Any color with reason" },
    { question: "If you could meet any historical figure, who would it be?", correctAnswer: "Any historical figure" }
  ],
  
  hygiene: [
    { question: "How many times should you brush your teeth daily?", correctAnswer: "2" },
    { question: "How long should you wash your hands to kill germs?", correctAnswer: "20 seconds" },
    { question: "How often should you change your toothbrush?", correctAnswer: "Every 3 months" },
    { question: "What is the recommended time for daily exercise?", correctAnswer: "30 minutes" },
    { question: "How many glasses of water should you drink daily?", correctAnswer: "8" },
    { question: "What should you do before eating?", correctAnswer: "Wash your hands" },
    { question: "How many hours of sleep do adults need daily?", correctAnswer: "7-9" },
    { question: "What is the best way to prevent body odor?", correctAnswer: "Regular bathing, deodorant, clean clothes" },
    { question: "How often should you clip your nails?", correctAnswer: "Weekly" },
    { question: "Why wash fruits before eating?", correctAnswer: "Remove germs, dirt, chemicals" },
    { question: "What time do you usually wake up in the morning?", correctAnswer: "Any time" },
    { question: "How many times do you bathe in a day?", correctAnswer: "Any number" },
    { question: "What's your favorite way to stay fit?", correctAnswer: "Any exercise or activity" },
    { question: "Do you prefer morning or evening showers?", correctAnswer: "Morning, evening" },
    { question: "What healthy habit are you trying to build?", correctAnswer: "Any healthy habit" }
  ],
  
  current_affairs: [
    { question: "Who is the current President of Nigeria?", correctAnswer: "Bola Ahmed Tinubu" },
    { question: "What does CBN stand for?", correctAnswer: "Central Bank of Nigeria" },
    { question: "Name Nigeria's current Vice President", correctAnswer: "Kashim Shettima" },
    { question: "What does NYSC stand for?", correctAnswer: "National Youth Service Corps" },
    { question: "Which state is known for oil production?", correctAnswer: "Rivers, Delta, Akwa Ibom" },
    { question: "What is Nigeria's current minimum wage?", correctAnswer: "70000, 70,000" },
    { question: "Name one challenge facing Nigerian youth", correctAnswer: "Unemployment, inflation, education" },
    { question: "What major tech company invested in Nigeria recently?", correctAnswer: "Google, Microsoft, Meta" },
    { question: "When were new naira notes introduced?", correctAnswer: "2022" },
    { question: "What is Nigeria's estimated population?", correctAnswer: "220+ million, 200+ million" },
    { question: "What's your opinion on Nigeria's current economic situation?", correctAnswer: "Any opinion" },
    { question: "Which Nigerian news source do you trust most?", correctAnswer: "Any news source" },
    { question: "What change would you like to see in Nigeria?", correctAnswer: "Any positive change" },
    { question: "Do you think Nigeria is heading in the right direction?", correctAnswer: "Yes, No" },
    { question: "What's the biggest problem in your community?", correctAnswer: "Any community problem" }
  ],
  
  science: [
    { question: "What gas do plants absorb from atmosphere?", correctAnswer: "Carbon dioxide" },
    { question: "Which planet is closest to the Sun?", correctAnswer: "Mercury" },
    { question: "What does DNA stand for?", correctAnswer: "Deoxyribonucleic acid" },
    { question: "How many bones in human body?", correctAnswer: "206" },
    { question: "What is the chemical symbol for water?", correctAnswer: "H2O" },
    { question: "Which organ pumps blood?", correctAnswer: "Heart" },
    { question: "How many chambers in human heart?", correctAnswer: "4" },
    { question: "What is the largest organ in human body?", correctAnswer: "Skin" },
    { question: "Which gas makes up most of Earth's atmosphere?", correctAnswer: "Nitrogen" },
    { question: "How many teeth does an adult have?", correctAnswer: "32" },
    { question: "What's your favorite subject in school?", correctAnswer: "Any school subject" },
    { question: "Do you believe in climate change?", correctAnswer: "Yes, No" },
    { question: "What technology do you use most daily?", correctAnswer: "Any technology" },
    { question: "Would you like to travel to space?", correctAnswer: "Yes, No" },
    { question: "What's the most amazing scientific fact you know?", correctAnswer: "Any scientific fact" }
  ],
  
  fun_facts: [
    { question: "Which animal is King of the Jungle?", correctAnswer: "Lion" },
    { question: "How many legs does a spider have?", correctAnswer: "8" },
    { question: "What is the tallest building in the world?", correctAnswer: "Burj Khalifa" },
    { question: "Which country has most time zones?", correctAnswer: "France" },
    { question: "Most spoken language in the world?", correctAnswer: "Mandarin Chinese" },
    { question: "How many strings does a guitar have?", correctAnswer: "6" },
    { question: "What is the fastest land animal?", correctAnswer: "Cheetah" },
    { question: "How many colors in a rainbow?", correctAnswer: "7" },
    { question: "Which planet is the Red Planet?", correctAnswer: "Mars" },
    { question: "What is the largest mammal?", correctAnswer: "Blue whale" },
    { question: "What's your favorite movie of all time?", correctAnswer: "Any movie" },
    { question: "If you could have any superpower, what would it be?", correctAnswer: "Any superpower" },
    { question: "What's your dream vacation destination?", correctAnswer: "Any place" },
    { question: "Are you a morning person or night owl?", correctAnswer: "Morning person, night owl" },
    { question: "What's your biggest fear?", correctAnswer: "Any fear" },
    { question: "If you won ₦10 million today, what would you do first?", correctAnswer: "Any reasonable answer" },
    { question: "What's your favorite way to relax after a stressful day?", correctAnswer: "Any relaxation method" },
    { question: "Do you prefer cats or dogs?", correctAnswer: "Cats, dogs" },
    { question: "What's one thing you can't live without?", correctAnswer: "Any item or person" },
    { question: "What makes you laugh the most?", correctAnswer: "Any answer" }
  ]
};

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

// Validate answer format - handles questions + answers pattern
function validateAnswerFormat(text) {
  const answerPattern = /(\d+)\.\s*([^0-9]+?)(?=\s*\d+\.|$)/g;
  const answers = [];
  let match;
  
  const questionKeywords = ['what', 'how', 'when', 'where', 'why', 'which', 'who', 'can you', 'do you', 'stand for', 'many', '?'];
  
  while ((match = answerPattern.exec(text)) !== null) {
    const questionNum = parseInt(match[1]);
    let answer = match[2].trim();
    
    if (answer.length > 2) {
      // Handle "Question? Answer" pattern - extract answer part
      const sentences = answer.split(/[?.!]/);
      if (sentences.length > 1) {
        const lastSentence = sentences[sentences.length - 1].trim();
        if (lastSentence.length > 2) {
          answer = lastSentence;
        }
      }
      
      // Check if still looks like question
      const lowerAnswer = answer.toLowerCase();
      const isQuestion = questionKeywords.some(keyword => 
        lowerAnswer.includes(keyword) || lowerAnswer.endsWith('?')
      );
      
      if (!isQuestion) {
        answers[questionNum - 1] = answer;
      }
    }
  }
  
  return answers;
}

// Check answer correctness - flexible for personal questions
function checkAnswerCorrectness(userAnswer, correctAnswer) {
  if (!userAnswer || !correctAnswer) return false;
  
  const userLower = userAnswer.toLowerCase().trim();
  const correctLower = correctAnswer.toLowerCase().trim();
  
  // For personal questions, accept any reasonable answer
  if (correctLower.includes('any') || correctLower.includes('personal')) {
    return userAnswer.length >= 2; // Any answer with at least 2 characters
  }
  
  if (userLower === correctLower) return true;
  
  if (correctLower.includes(',')) {
    const acceptableAnswers = correctLower.split(',').map(ans => ans.trim());
    if (acceptableAnswers.some(ans => userLower.includes(ans) || ans.includes(userLower))) {
      return true;
    }
  }
  
  if (correctLower.includes(userLower) || userLower.includes(correctLower)) {
    return true;
  }
  
  const userNumbers = userAnswer.match(/\d+/g);
  const correctNumbers = correctAnswer.match(/\d+/g);
  if (userNumbers && correctNumbers && userNumbers[0] === correctNumbers[0]) {
    return true;
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
    message += `*${index + 1}. Type your answer here*\n\n`;
  });
  
  message += `💰 *Reward:* ₦${taskSettings.baseReward.toLocaleString()} for completion\n`;
  
  if (taskSettings.enableStreakBonus) {
    const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
    message += `🔥 *Streak Bonus:* +${bonusPercent}% after ${taskSettings.minStreakForBonus} consecutive days\n`;
  }
  
  message += `\n📋 *Example Format:*\n`;
  message += `1. Lagos\n2. 36 states\n3. 1960\n4. Asia\n5. 366 days\n\n`;
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
    
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    if (!todayTask) {
      await sock.sendMessage(from, {
        text: `❌ *No active task for today.*\n\nUse *${config.PREFIX}task current* to check.`
      }, { quoted: m });
      return true;
    }
    
    const hasCompleted = todayTask.completions.some(completion => completion.userId === senderId);
    if (hasCompleted) {
      await sock.sendMessage(from, {
        text: `📝 *You've already completed today's task!*\n\nCome back tomorrow. 🚀`
      }, { quoted: m });
      return true;
    }
    
    await initUser(senderId);
    const userData = await getUserData(senderId);
    
    // Check correctness
    let correctCount = 0;
    const answerResults = [];
    
    for (let i = 0; i < todayTask.questions.length; i++) {
      const question = todayTask.questions[i];
      const userAnswer = answers[i] || '';
      const isCorrect = checkAnswerCorrectness(userAnswer, question.correctAnswer);
      
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
    
    // Success message
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
    
    // Simple indicators
    successMessage += `📝 Results: `;
    answerResults.forEach((result) => {
      successMessage += result.isCorrect ? '✅' : '❌';
    });
    
    successMessage += `\n\n🎉 Great work! 🚀`;
    
    await sock.sendMessage(from, { text: successMessage }, { quoted: m });
    
    // Update completion list
    await sendCompletionUpdate(sock, from, today);
    
    return true;
  } catch (error) {
    console.error('Error processing task submission:', error);
    return false;
  }
}

async function sendCompletionUpdate(sock, groupJid, date = null) {
  try {
    const targetDate = date || getCurrentDate();
    
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: targetDate });
    if (!todayTask) return;
    
    const completions = todayTask.completions || [];
    const totalMembers = await getGroupMembers(sock, groupJid);
    
    let updateMessage = `📊 *GIST HQ - TASK COMPLETION STATUS* 📊\n\n`;
    updateMessage += `📅 Date: ${targetDate}\n`;
    updateMessage += `🎯 Theme: ${todayTask.theme}\n\n`;
    
    if (completions.length === 0) {
      updateMessage += `❌ *No completions yet*\n`;
      updateMessage += `💪 Be the first to complete today's task!`;
    } else {
      updateMessage += `✅ *COMPLETED TODAY (${completions.length}/${totalMembers.length} members):*\n\n`;
      
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
      
      await sock.sendMessage(groupJid, { text: updateMessage, mentions: mentions });
      return;
    }
    
    await sock.sendMessage(groupJid, { text: updateMessage });
    
  } catch (error) {
    console.error('Error sending completion update:', error);
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
        await handleTestTask({ reply }, args.slice(1));
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
                  `🤖 *Auto-Detection:*\n` +
                  `Send answers: 1. answer 2. answer 3. answer...\n\n` +
                  `📅 *Daily Themes:*\n` +
                  `Mon: Business • Tue: General • Wed: Hygiene\n` +
                  `Thu: Current Affairs • Fri: Science • Sat: Fun Facts • Sun: Mixed\n\n` +
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
      await reply('✅ *Daily task posted successfully!*');
    } else {
      await reply('❌ *Failed to post task. Try again.*');
    }
  } catch (error) {
    await reply('❌ *Error posting task.*');
    console.error('Post task error:', error);
  }
}

async function handleCurrentTask(context) {
  const { reply } = context;
  
  try {
    const today = getCurrentDate();
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    
    if (!todayTask) {
      await reply(`📅 *No task for today.*\n\nTasks post automatically at ${taskSettings.autoPostTime}.\n\nAdmins can post manually: *${context.config.PREFIX}task post*`);
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
      taskMessage += `\n❌ *Task deadline passed*\n`;
      taskMessage += `Come back tomorrow!`;
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
      
      taskMessage += `\n📋 *Format:* 1. [answer] 2. [answer] 3. [answer]...`;
    }
    
    await reply(taskMessage);
  } catch (error) {
    await reply('❌ *Error loading task.*');
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
    
    let statsMessage = `📊 *YOUR TASK STATISTICS* 📊\n\n`;
    statsMessage += `📅 Last completion: ${userData.lastTaskCompletion || 'Never'}\n`;
    statsMessage += `📋 Total completions: ${userData.totalTaskCompletions || 0}\n`;
    statsMessage += `🔥 Current streak: ${userData.taskStreak || 0} days\n`;
    statsMessage += `🏆 Longest streak: ${userData.longestTaskStreak || 0} days\n`;
    statsMessage += `✅ Today's status: ${completedToday ? 'Completed ✅' : 'Pending ❌'}\n`;
    statsMessage += `💰 Current balance: ₦${(userData.balance || 0).toLocaleString()}\n`;
    
    const streak = userData.taskStreak || 0;
    if (streak >= 7) {
      statsMessage += `\n🌟 *Amazing ${streak}-day streak!*`;
    } else if (streak >= 3) {
      statsMessage += `\n🔥 *Great streak! Keep going!*`;
    } else {
      statsMessage += `\n💪 *Complete daily tasks to build streaks!*`;
    }
    
    await reply(statsMessage);
  } catch (error) {
    await reply('❌ *Error loading stats.*');
    console.error('Stats error:', error);
  }
}

async function handleTaskSettings(context, args) {
  const { reply, senderId, sock, m, from } = context;
  
  const isAdminUser = await isAuthorized(sock, from, senderId);
  if (!isAdminUser) {
    await reply('🚫 Only admins can access settings.');
    return;
  }
  
  try {
    if (args.length === 0) {
      let settingsMessage = `⚙️ *TASK SETTINGS* ⚙️\n\n`;
      settingsMessage += `💰 Base Reward: ₦${taskSettings.baseReward.toLocaleString()}\n`;
      settingsMessage += `🎯 Correctness Bonus: ₦${taskSettings.correctnessBonus} per correct answer\n`;
      settingsMessage += `🔥 Streak Bonus: ${taskSettings.enableStreakBonus ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `📈 Streak Multiplier: ${taskSettings.streakBonusMultiplier}x\n`;
      settingsMessage += `⏰ Auto Post Time: ${taskSettings.autoPostTime}\n`;
      settingsMessage += `🤖 Auto Post: ${taskSettings.autoPostEnabled ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `📝 Questions per Task: ${taskSettings.questionCount}\n`;
      settingsMessage += `🏷️ Silent Tags: ${taskSettings.tagAllMembers ? 'Enabled ✅' : 'Disabled ❌'}\n\n`;
      settingsMessage += `*Commands:*\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings reward 500\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings bonus 100\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings streak on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings autopost on/off\`\n`;
      settingsMessage += `• \`${context.config.PREFIX}task settings posttime 09:00\``;
      
      await reply(settingsMessage);
      return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args[1];
    
    let responseText = "";
    
    switch (setting) {
      case 'reward':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid amount. Use: ${context.config.PREFIX}task settings reward 500`;
        } else {
          taskSettings.baseReward = parseInt(value);
          await saveSettings();
          responseText = `✅ Base reward set to ₦${parseInt(value).toLocaleString()}`;
        }
        break;
        
      case 'bonus':
        if (!value || isNaN(value)) {
          responseText = `⚠️ Invalid amount. Use: ${context.config.PREFIX}task settings bonus 100`;
        } else {
          taskSettings.correctnessBonus = parseInt(value);
          await saveSettings();
          responseText = `✅ Correctness bonus set to ₦${parseInt(value)} per correct answer`;
        }
        break;
        
      case 'streak':
        if (value === 'on' || value === 'true' || value === 'yes') {
          taskSettings.enableStreakBonus = true;
          await saveSettings();
          responseText = "✅ Streak bonus enabled 🔥";
        } else if (value === 'off' || value === 'false' || value === 'no') {
          taskSettings.enableStreakBonus = false;
          await saveSettings();
          responseText = "✅ Streak bonus disabled";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}task settings streak on/off`;
        }
        break;
        
      case 'autopost':
        if (value === 'on' || value === 'true' || value === 'yes') {
          taskSettings.autoPostEnabled = true;
          await saveSettings();
          responseText = `✅ Auto-posting enabled 🤖\n\n*Tasks will post at ${taskSettings.autoPostTime} daily.*`;
        } else if (value === 'off' || value === 'false' || value === 'no') {
          taskSettings.autoPostEnabled = false;
          await saveSettings();
          responseText = "✅ Auto-posting disabled";
        } else {
          responseText = `⚠️ Invalid value. Use: ${context.config.PREFIX}task settings autopost on/off`;
        }
        break;
        
      case 'posttime':
        if (!value || !/^\d{2}:\d{2}$/.test(value)) {
          responseText = `⚠️ Invalid time. Use: ${context.config.PREFIX}task settings posttime 09:00`;
        } else {
          taskSettings.autoPostTime = value;
          await saveSettings();
          responseText = `✅ Auto-post time set to ${value} (Nigeria time)`;
        }
        break;
        
      default:
        responseText = "⚠️ Unknown setting. Available:\n• reward\n• bonus\n• streak\n• autopost\n• posttime";
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
      await reply(`📅 *No task found for ${date}*`);
      return;
    }
    
    let completionMessage = `📊 *TASK COMPLETIONS* 📊\n\n`;
    completionMessage += `📅 Date: ${date}\n`;
    completionMessage += `🎯 Theme: ${task.theme}\n`;
    completionMessage += `📋 Total: ${task.completions.length}\n\n`;
    
    if (task.completions.length === 0) {
      completionMessage += `❌ *No completions yet*`;
    } else {
      completionMessage += `✅ *Completed Members:*\n\n`;
      
      task.completions.forEach((completion, index) => {
        const userPhone = completion.userId.split('@')[0];
        const submittedTime = moment(completion.submittedAt).tz('Africa/Lagos').format('HH:mm');
        
        completionMessage += `${index + 1}. +${userPhone}\n`;
        completionMessage += `   ⏰ ${submittedTime} • 🔥 ${completion.streak} days • 💰 ₦${completion.totalReward.toLocaleString()}\n\n`;
      });
    }
    
    await reply(completionMessage);
  } catch (error) {
    await reply('❌ *Error loading completions.*');
    console.error('Completions error:', error);
  }
}

async function handleTaskRecords(context, args) {
  const { reply, senderId } = context;
  
  try {
    const limit = args[0] ? parseInt(args[0]) : 10;
    const limitValue = Math.min(Math.max(limit, 1), 50);
    
    const records = await db.collection(COLLECTIONS.TASK_RECORDS)
      .find({ userId: senderId })
      .sort({ submittedAt: -1 })
      .limit(limitValue)
      .toArray();
    
    if (records.length === 0) {
      await reply(`📋 *No records found*\n\nComplete some tasks to build your history!`);
      return;
    }
    
    let recordsText = `📋 *YOUR TASK HISTORY* 📋\n\n`;
    recordsText += `📊 Last ${records.length} completions:\n\n`;
    
    records.forEach((record, index) => {
      recordsText += `${index + 1}. 📅 ${record.date}\n`;
      recordsText += `   💰 ₦${record.totalReward.toLocaleString()} • 📊 ${record.correctCount}/5 • 🔥 ${record.streak} days\n`;
      recordsText += `   ⏰ ${moment(record.submittedAt).tz('Africa/Lagos').format('DD/MM/YY HH:mm')}\n\n`;
    });
    
    recordsText += `💡 *Use: ${context.config.PREFIX}task records [number]* for more (max 50)`;
    
    await reply(recordsText);
  } catch (error) {
    await reply('❌ *Error loading records.*');
    console.error('Records error:', error);
  }
}

async function handleTestTask(context, args) {
  const { reply } = context;
  const testAnswers = args.join(' ');
  
  if (!testAnswers) {
    await reply(`🔍 *Answer Format Test*\n\nUsage: ${context.config.PREFIX}testtask [answers]\n\nExample: ${context.config.PREFIX}testtask 1. Lagos 2. 36 3. 1960 4. Asia 5. 366\n\nTests your answer format without submitting.`);
    return;
  }
  
  try {
    const answers = validateAnswerFormat(testAnswers);
    
    let result = `🔍 *Format Test Results:*\n\n`;
    result += `📝 Input: "${testAnswers}"\n\n`;
    result += `📊 Detected: ${answers.length}/${taskSettings.questionCount}\n\n`;
    
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
      result += `\n🎉 *Format valid!* ✅\n`;
      result += `✨ *Ready to submit real answers!*`;
    } else {
      result += `\n❌ *Incomplete*\n`;
      result += `📋 Need ${taskSettings.questionCount} answers, found ${answers.length}\n\n`;
      result += `💡 *Correct format:*\n`;
      result += `1. First answer\n2. Second answer\n3. Third answer...`;
    }
    
    await reply(result);
  } catch (error) {
    await reply('❌ *Error testing format.*');
    console.error('Test error:', error);
  }
}

// Export functions
export { 
  checkAndPostDailyTask,
  setGroupJid,
  taskSettings
};