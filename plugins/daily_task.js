// plugins/daily_task.js - Enhanced Daily Task System
import { MongoClient } from 'mongodb';
import moment from 'moment-timezone';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Daily Task System',
  version: '2.2.1', // Updated version for new feedback system
  author: 'Bot Developer',
  description: 'Enhanced daily quiz task system with detailed feedback, public completion lists, expanded questions, new personal/survey categories, intelligent scoring, and a self-contained scheduler.',
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

// Default task settings with new themes
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
    wednesday: 'Personal Growth & Reflection', // New Theme
    thursday: 'Current Affairs & News',
    friday: 'Science & Technology',
    saturday: 'Relationship & Fun Facts', // New Theme
    sunday: 'GIST HQ Survey & Feedback' // New Theme
  }
};

let taskSettings = { ...defaultSettings };

// =======================================================================
// EXPANDED AND NEW QUESTION CATEGORIES
// =======================================================================
const questionDatabase = {
  business: [
    { question: "What business can you start with just ₦20,000?", correctAnswer: "food vending, retail, digital services, online tutoring, photography, recharge card sales" },
    { question: "Name one skill you can monetize online", correctAnswer: "writing, graphic design, programming, tutoring, digital marketing, video editing, social media management" },
    { question: "What does ROI stand for in business?", correctAnswer: "return on investment" },
    { question: "What is the first step in starting any business?", correctAnswer: "market research, business planning, idea validation, identifying a problem" },
    { question: "Name one way to fund your startup business", correctAnswer: "personal savings, loans, investors, grants, crowdfunding, bootstrapping" },
    { question: "What is a 'target audience' in marketing?", correctAnswer: "specific group of people, potential customers, intended consumers" },
    { question: "Name one challenge faced by small businesses in Nigeria.", correctAnswer: "power supply, access to funding, inflation, poor infrastructure, government policies" },
    { question: "What is the difference between a product and a service?", correctAnswer: "tangible vs intangible, physical item vs action performed" },
    { question: "Why is customer service important for a business?", correctAnswer: "customer retention, loyalty, good reviews, brand reputation, repeat business" },
    { question: "What does 'B2B' stand for in commerce?", correctAnswer: "business to business" },
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
    { question: "How many sides does a triangle have?", correctAnswer: "3, three" },
    { question: "What is the largest ocean in the world?", correctAnswer: "pacific ocean" },
    { question: "Who wrote the Nigerian national anthem?", correctAnswer: "benedict elide odiase, john ilechukwu" },
    { question: "What does CPU stand for?", correctAnswer: "central processing unit" },
    { question: "How many continents are there?", correctAnswer: "7, seven" },
    { question: "What is the longest river in the world?", correctAnswer: "nile river, nile" },
    { question: "In what year did Nigeria switch to driving on the right side of the road?", correctAnswer: "1972" },
    { question: "What is the official language of Nigeria?", correctAnswer: "english" },
    { question: "How many local government areas are in Nigeria?", correctAnswer: "774" },
  ],
  
  hygiene: [
    { question: "How many times should you brush your teeth daily?", correctAnswer: "2, twice" },
    { question: "How long should you wash your hands to kill germs?", correctAnswer: "20 seconds, 20" },
    { question: "How often should you change your toothbrush?", correctAnswer: "every 3 months, 3 months" },
    { question: "What is the recommended time for daily exercise?", correctAnswer: "30 minutes, 30" },
    { question: "How many glasses of water should you drink daily?", correctAnswer: "8, eight" },
    { question: "What should you do before eating?", correctAnswer: "wash your hands, wash hands" },
    { question: "Why is it important to get enough sleep?", correctAnswer: "physical health, mental health, energy, recovery, brain function" },
    { question: "Name one benefit of a balanced diet.", correctAnswer: "healthy weight, strong immune system, energy, disease prevention" },
    { question: "How can you prevent food poisoning at home?", correctAnswer: "cook food thoroughly, wash hands, store food properly, avoid cross-contamination" },
  ],
  
  current_affairs: [
    { question: "Who is the current President of Nigeria?", correctAnswer: "bola ahmed tinubu, tinubu" },
    { question: "What does CBN stand for?", correctAnswer: "central bank of nigeria" },
    { question: "Name Nigeria's current Vice President", correctAnswer: "kashim shettima, shettima" },
    { question: "What does NYSC stand for?", correctAnswer: "national youth service corps" },
    { question: "Which states are known for oil production in Nigeria?", correctAnswer: "rivers, delta, akwa ibom, bayelsa" },
    { question: "What major economic issue is currently affecting Nigeria?", correctAnswer: "inflation, fuel subsidy removal, foreign exchange rate, forex" },
    { question: "Who is the current governor of Lagos State?", correctAnswer: "babajide sanwo-olu, sanwo-olu" },
    { question: "What is the name of Nigeria's national football team?", correctAnswer: "super eagles" },
  ],
  
  science: [
    { question: "What gas do plants absorb from the atmosphere?", correctAnswer: "carbon dioxide, co2" },
    { question: "Which planet is closest to the Sun?", correctAnswer: "mercury" },
    { question: "What does DNA stand for?", correctAnswer: "deoxyribonucleic acid" },
    { question: "How many bones are in the adult human body?", correctAnswer: "206" },
    { question: "What is the chemical symbol for water?", correctAnswer: "h2o" },
    { question: "Which organ pumps blood in the human body?", correctAnswer: "heart" },
    { question: "What force keeps us on the ground?", correctAnswer: "gravity" },
    { question: "What is the process by which plants make their own food?", correctAnswer: "photosynthesis" },
    { question: "What is the largest planet in our solar system?", correctAnswer: "jupiter" },
  ],
  
  fun_facts: [
    { question: "Which animal is known as the King of the Jungle?", correctAnswer: "lion" },
    { question: "How many legs does a spider have?", correctAnswer: "8, eight" },
    { question: "What is the tallest building in the world?", correctAnswer: "burj khalifa" },
    { question: "Which country has the most time zones?", correctAnswer: "france" },
    { question: "What is the most spoken language in the world?", correctAnswer: "mandarin chinese, chinese, mandarin" },
    { question: "How many strings does a standard guitar have?", correctAnswer: "6, six" },
    { question: "What is the only mammal capable of true flight?", correctAnswer: "bat" },
    { question: "What is a group of lions called?", correctAnswer: "a pride, pride" },
    { question: "Which Nigerian city is famous for its ancient walls?", correctAnswer: "benin city, kano" },
  ],

  // NEW: Personal Category
  personal: [
    { question: "What is one goal you want to achieve this month?", correctAnswer: "personal answer" },
    { question: "What is a skill you would love to learn and why?", correctAnswer: "personal answer" },
    { question: "Describe a challenge you recently overcame.", correctAnswer: "personal answer" },
    { question: "What is one thing that made you smile today?", correctAnswer: "personal answer" },
    { question: "If you could give your younger self one piece of advice, what would it be?", correctAnswer: "personal answer" },
    { question: "What book or movie has had a big impact on you?", correctAnswer: "personal answer" },
    { question: "What are you most grateful for right now?", correctAnswer: "personal answer" },
  ],

  // NEW: Relationship Category
  relationship: [
    { question: "What is the most important quality in a friendship?", correctAnswer: "personal answer" },
    { question: "How do you show appreciation for the people you care about?", correctAnswer: "personal answer" },
    { question: "What is one common mistake people make in relationships?", correctAnswer: "personal answer" },
    { question: "What does 'good communication' mean to you in a relationship?", correctAnswer: "personal answer" },
    { question: "Share a piece of advice for maintaining strong family bonds.", correctAnswer: "personal answer" },
  ],

  // NEW: Survey Category with Intelligent Scoring Keywords
  survey: [
    { question: "What is one thing you love most about the GIST HQ group?", correctAnswer: "positive:love,great,helpful,amazing,informative,supportive,community;neutral:active,okay,fine" },
    { question: "What is one thing that could be improved in GIST HQ?", correctAnswer: "constructive:improve,add,more,better,less,change,suggestion;neutral:nothing,fine,okay" },
    { question: "What kind of topics or activities would you like to see more of in the group?", correctAnswer: "suggestion:topics,activities,events,sessions,training,more of" },
    { question: "On a scale of 1-10, how valuable has GIST HQ been to you?", correctAnswer: "rating:10,9,8,7,6,5,4,3,2,1" },
    { question: "What is your favorite part of the daily tasks?", correctAnswer: "positive:rewards,learning,questions,challenge,fun,engaging;neutral:everything,all" },
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
    // This function now just ensures all questions from the code are in the DB.
    // It can be run multiple times to add new questions without duplicating old ones.
    console.log('🔄 Syncing question database...');
    const allQuestions = [];
    Object.entries(questionDatabase).forEach(([category, questions]) => {
      questions.forEach(question => {
        allQuestions.push({
          updateOne: {
            filter: { question: question.question },
            update: {
              $setOnInsert: {
                question: question.question,
                correctAnswer: question.correctAnswer,
                category: category,
                type: "open",
                createdAt: new Date(),
                active: true
              }
            },
            upsert: true
          }
        });
      });
    });
    
    if (allQuestions.length > 0) {
      await db.collection(COLLECTIONS.QUESTIONS).bulkWrite(allQuestions);
      console.log(`✅ Question database synced. Total questions available.`);
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
    const numberedPattern = /(\d+)\.\s*(.+?)(?=\s*\d+\.|$)/gs; // Made more robust
    while ((match = numberedPattern.exec(text)) !== null) {
      const questionNum = parseInt(match[1]);
      let answer = match[2].trim();
      
      if (answer.length > 2) {
        answers[questionNum - 1] = answer;
      }
    }
  }
  
  return answers;
}

// =======================================================================
// MODIFIED: INTELLIGENT SCORING FOR ALL CATEGORIES
// =======================================================================
function checkAnswerCorrectness(userAnswer, question) {
  if (!userAnswer || !question || !question.correctAnswer) return false;
  
  const userLower = userAnswer.toLowerCase().trim();
  const correctLower = question.correctAnswer.toLowerCase().trim();
  
  // Handle different question categories
  switch (question.category) {
    case 'survey':
      // Intelligent scoring for surveys
      const parts = correctLower.split(';');
      for (const part of parts) {
        const [type, keywords] = part.split(':');
        const keywordList = keywords.split(',');
        if (keywordList.some(kw => userLower.includes(kw))) {
          if (type === 'positive' || type === 'constructive' || type === 'suggestion' || type === 'rating') return true; // All feedback is "correct"
        }
      }
      return userAnswer.length > 5; // Basic check for genuine effort

    case 'personal':
    case 'relationship':
      // Personal answers are always "correct" if they have substance
      return userAnswer.length > 5;

    default:
      // Standard factual checking for other categories
      if (userLower === correctLower) return true;
      if (correctLower.includes(',')) {
        const acceptableAnswers = correctLower.split(',').map(ans => ans.trim());
        return acceptableAnswers.some(ans => userLower.includes(ans));
      }
      if (userLower.includes(correctLower)) return true;
      const userNumbers = userAnswer.match(/\d+/g);
      const correctNumbers = correctLower.match(/\d+/g);
      if (userNumbers && correctNumbers && userNumbers[0] === correctNumbers[0]) return true;
      return false;
  }
}

function getNigeriaTime() {
  return moment.tz('Africa/Lagos');
}

function getCurrentDate() {
  return getNigeriaTime().format('DD-MM-YYYY');
}

// MODIFIED: Updated themes and categories
function getCurrentTheme() {
  const today = getNigeriaTime().format('dddd').toLowerCase();
  return taskSettings.themes[today] || taskSettings.themes.sunday;
}

function getCurrentCategory() {
  const today = getNigeriaTime().format('dddd').toLowerCase();
  const categoryMap = {
    monday: 'business', 
    tuesday: 'general', 
    wednesday: 'personal', // New
    thursday: 'current_affairs', 
    friday: 'science', 
    saturday: 'relationship', // New
    sunday: 'survey' // New
  };
  return categoryMap[today] || 'general';
}

async function getRandomQuestions(category, count = 5) {
  try {
    let questions;
    // For relationship, mix with fun_facts
    if (category === 'relationship') {
        const relQuestions = await db.collection(COLLECTIONS.QUESTIONS).aggregate([{ $match: { category: 'relationship', active: true } }, { $sample: { size: 3 } }]).toArray();
        const funQuestions = await db.collection(COLLECTIONS.QUESTIONS).aggregate([{ $match: { category: 'fun_facts', active: true } }, { $sample: { size: 2 } }]).toArray();
        questions = [...relQuestions, ...funQuestions];
    } else {
        questions = await db.collection(COLLECTIONS.QUESTIONS).aggregate([{ $match: { category: category, active: true } }, { $sample: { size: count } }]).toArray();
    }
    
    // Fallback if not enough questions
    if (questions.length < count) {
      const needed = count - questions.length;
      const supplementQuestions = await db.collection(COLLECTIONS.QUESTIONS).aggregate([{ $match: { category: 'general', active: true } }, { $sample: { size: needed } }]).toArray();
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
  message += `✨ *Bonus:* ₦${taskSettings.correctnessBonus.toLocaleString()} per correct/thoughtful answer\n`;
  
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

// =======================================================================
// NEW: PUBLIC COMPLETION LIST FUNCTION
// =======================================================================
async function sendCompletionUpdate(sock, groupJid) {
  try {
    const today = getCurrentDate();
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });

    if (!todayTask || todayTask.completions.length === 0) {
      return; // No task or no completions yet, no need to send an update
    }

    const completions = todayTask.completions;
    const totalMembers = await getGroupMembers(sock, groupJid);

    let updateMessage = `📊 *TASK COMPLETIONS SO FAR* (${completions.length}/${totalMembers.length}) 📊\n\n`;
    const mentions = [];

    // Sort by submission time
    completions.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

    completions.forEach((completion, index) => {
      const userJid = completion.userId;
      const userPhone = userJid.split('@')[0];
      mentions.push(userJid);
      updateMessage += `${index + 1}. @${userPhone} ✅\n`;
    });

    updateMessage += `\nKeep the submissions coming! 💪`;

    // Wait a couple of seconds after the personal feedback before sending the group update
    await new Promise(resolve => setTimeout(resolve, 2000));

    await sock.sendMessage(groupJid, {
      text: updateMessage,
      mentions: mentions
    });

  } catch (error) {
    console.error('Error sending completion update:', error);
  }
}


// MODIFIED: Enhanced task submission processing with detailed feedback and completion list
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
      await sock.sendMessage(from, { text: `❌ *No active task for today.*` }, { quoted: m });
      return true;
    }
    
    const hasCompleted = todayTask.completions.some(completion => completion.userId === senderId);
    if (hasCompleted) {
      await sock.sendMessage(from, { text: `📝 *You've already completed today's task!*` }, { quoted: m });
      return true;
    }
    
    await initUser(senderId);
    const userData = await getUserData(senderId);
    
    let correctCount = 0;
    const answerResults = [];
    
    for (let i = 0; i < todayTask.questions.length; i++) {
      const question = todayTask.questions[i];
      const userAnswer = answers[i] || '';
      const isCorrect = checkAnswerCorrectness(userAnswer, question);
      
      if (isCorrect) correctCount++;
      
      answerResults.push({
        questionNumber: i + 1,
        userAnswer: userAnswer,
        isCorrect: isCorrect
      });
    }
    
    const currentStreak = updateTaskStreak(senderId, userData, today);
    
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
    
    const completionData = {
      userId: senderId,
      userPhone: senderId.split('@')[0],
      answers: answers,
      correctCount: correctCount,
      submittedAt: new Date(),
      totalReward: finalReward,
      streak: currentStreak
    };
    
    await db.collection(COLLECTIONS.DAILY_TASKS).updateOne({ date: today }, { $push: { completions: completionData } });
    await db.collection(COLLECTIONS.TASK_RECORDS).insertOne({ ...completionData, date: today });
    
    const updatedUserData = await getUserData(senderId);
    
    // Build the detailed feedback message
    let successMessage = `✅ *TASK COMPLETED!* ✅\n\n`;
    successMessage += `📊 *Your Score:* ${correctCount}/${todayTask.questions.length} correct/thoughtful answers\n\n`;

    // Detailed Answer Review
    successMessage += `📝 *Answer Review:*\n`;
    answerResults.forEach((result) => {
      const emoji = result.isCorrect ? '✅' : '❌';
      const truncatedAnswer = result.userAnswer.length > 25 ? 
        result.userAnswer.substring(0, 25) + '...' : result.userAnswer;
      successMessage += `${emoji} Q${result.questionNumber}: _${truncatedAnswer || "No answer given"}_ \n`;
    });
    successMessage += `\n`;
    
    // Reward Breakdown
    successMessage += `💰 *Reward Breakdown:*\n`;
    successMessage += `• Base completion: ₦${taskSettings.baseReward.toLocaleString()}\n`;
    successMessage += `• Correctness bonus: ₦${correctnessBonus.toLocaleString()} (${correctCount} × ₦${taskSettings.correctnessBonus})\n`;
    if (streakBonus > 0) {
      const bonusPercent = Math.floor((taskSettings.streakBonusMultiplier - 1) * 100);
      successMessage += `• Streak bonus: +₦${streakBonus.toLocaleString()} (${bonusPercent}%)\n`;
    }
    successMessage += `• *Total earned: ₦${finalReward.toLocaleString()}*\n\n`;
    successMessage += `💸 *Your balance: ₦${(updatedUserData.balance || 0).toLocaleString()}*\n`;
    successMessage += `🔥 *Current streak: ${currentStreak} days*\n`;
    
    // First, send the detailed private feedback to the user
    await sock.sendMessage(from, { text: successMessage }, { quoted: m });

    // Then, send the public completion list to the group
    await sendCompletionUpdate(sock, from);
    
    return true;
  } catch (error) {
    console.error('Error processing task submission:', error);
    await sock.sendMessage(from, { text: `❌ *Error processing your submission.*` }, { quoted: m });
    return false;
  }
}

async function checkAndPostDailyTask(sock) {
  try {
    if (!taskSettings.autoPostEnabled) return;
    
    const now = getNigeriaTime();
    if (now.format('HH:mm') !== taskSettings.autoPostTime) return;
    
    const today = getCurrentDate();
    const existingTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    if (existingTask) return;
    
    if (!taskSettings.groupJids || taskSettings.groupJids.length === 0) {
      console.log('⚠️ No groups registered for auto-posting');
      return;
    }
    
    for (const groupJid of taskSettings.groupJids) {
      await postDailyTask(sock, groupJid).catch(e => console.error(`Error posting to ${groupJid}:`, e));
    }
  } catch (error) {
    console.error('Error in checkAndPostDailyTask:', error);
  }
}

async function setGroupJid(groupJid) {
  if (!taskSettings.groupJids.includes(groupJid)) {
    taskSettings.groupJids.push(groupJid);
    await saveSettings();
    console.log(`📝 Group JID added for auto-posting: ${groupJid}`);
  }
}

async function isAuthorized(sock, from, sender) {
  if (taskSettings.adminNumbers.includes(sender.split('@')[0])) return true;
  const ownerNumber = process.env.OWNER_NUMBER || '';
  if (sender.split('@')[0] === ownerNumber) return true;
  try {
    if (!from.endsWith('@g.us')) return false;
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);
    return groupAdmins.includes(sender);
  } catch (error) {
    return false;
  }
}

// =======================================================================
// INTERNAL SCHEDULER FOR AUTOMATIC TASK POSTING
// =======================================================================
class TaskScheduler {
  constructor(sock) { this.sock = sock; this.interval = null; this.running = false; }
  start() { if (this.running) return; this.running = true; console.log('⏰ Daily Task scheduler started'); this.interval = setInterval(() => checkAndPostDailyTask(this.sock), 60000); }
  stop() { this.running = false; if (this.interval) clearInterval(this.interval); this.interval = null; console.log('⏰ Daily Task scheduler stopped'); }
}
let taskScheduler = null;
function initializeTaskScheduler(sock) { if (taskScheduler) taskScheduler.stop(); taskScheduler = new TaskScheduler(sock); taskScheduler.start(); return taskScheduler; }

// =======================================================================
// MAIN PLUGIN HANDLER
// =======================================================================
export default async function dailyTaskHandler(m, sock, config) {
  try {
    if (!db) {
      await initDatabase();
      await loadSettings();
      if (!taskScheduler) initializeTaskScheduler(sock);
    }
    if (m.key.remoteJid.endsWith('@g.us')) await setGroupJid(m.key.remoteJid);
    if (m.body && !m.body.startsWith(config.PREFIX)) { if (await processTaskSubmission(m, sock, config)) return; }
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const reply = async (text) => sock.sendMessage(from, { text }, { quoted: m });
    
    switch (command) {
      case 'task': case 'dailytask': case 'dt':
        if (args.length === 1) await showTaskMenu(reply, config.PREFIX);
        else await handleSubCommand(args[1], args.slice(2), { m, sock, config, senderId, from, reply });
        break;
      case 'taskstats': await handleTaskStats({ senderId, reply }); break;
      case 'testtask': await handleTestTask({ reply, config }, args.slice(1)); break;
    }
  } catch (error) { console.error('❌ Daily Task plugin error:', error); }
}

async function handleSubCommand(subCommand, args, context) {
  switch (subCommand.toLowerCase()) {
    case 'post': await handlePostTask(context); break;
    case 'current': await handleCurrentTask(context); break;
    case 'stats': await handleTaskStats(context); break;
    case 'settings': await handleTaskSettings(context, args); break;
    case 'completions': await handleCompletionsView(context, args); break;
    case 'records': await handleTaskRecords(context, args); break;
    case 'help': await showTaskMenu(context.reply, context.config.PREFIX); break;
    default: await context.reply(`❓ Unknown command: *${subCommand}*`);
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
                  `📅 *Daily Themes:*\n` +
                  `Mon: Business • Tue: General • Wed: Personal\n` +

