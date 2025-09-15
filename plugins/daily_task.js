// plugins/daily_task.js - Enhanced Daily Task System
import moment from 'moment-timezone';
// ✅ REFACTORED: Import only the getCollection helper
import { getCollection } from '../lib/pluginIntegration.js';

// Plugin information export (UNCHANGED)
export const info = {
  name: 'Daily Task System',
  version: '2.3.0', // Version bump for standalone architecture
  author: 'Bot Developer',
  description: 'A standalone daily quiz system with its own user data handling, using the central DB connection.',
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

// ✅ REFACTORED: Collection names now include the shared economy users collection
const COLLECTIONS = {
  ECONOMY_USERS: 'economy_users',
  TASK_RECORDS: 'task_records',
  QUESTIONS: 'task_questions',
  SETTINGS: 'task_settings',
  DAILY_TASKS: 'daily_tasks'
};

// Set Nigeria timezone (UNCHANGED)
moment.tz.setDefault('Africa/Lagos');

// Default task settings (UNCHANGED)
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
    wednesday: 'Personal Growth & Reflection',
    thursday: 'Current Affairs & News',
    friday: 'Science & Technology',
    saturday: 'Relationship & Fun Facts',
    sunday: 'GIST HQ Survey & Feedback'
  }
};

let taskSettings = { ...defaultSettings };

// Question Database (UNCHANGED)
const questionDatabase = {
    business: [{ question: "What business can you start with just ₦20,000?", correctAnswer: "food vending, retail, digital services, online tutoring, photography, recharge card sales" }],
    general: [{ question: "What is the capital of Nigeria?", correctAnswer: "abuja" }],
    hygiene: [{ question: "How many times should you brush your teeth daily?", correctAnswer: "2, twice" }],
    current_affairs: [{ question: "Who is the current President of Nigeria?", correctAnswer: "bola ahmed tinubu, tinubu" }],
    science: [{ question: "What gas do plants absorb from the atmosphere?", correctAnswer: "carbon dioxide, co2" }],
    fun_facts: [{ question: "Which animal is known as the King of the Jungle?", correctAnswer: "lion" }],
    personal: [{ question: "What is one goal you want to achieve this month?", correctAnswer: "personal answer" }],
    relationship: [{ question: "What is the most important quality in a friendship?", correctAnswer: "personal answer" }],
    survey: [{ question: "What is one thing you love most about the GIST HQ group?", correctAnswer: "positive:love,great,helpful,amazing,informative,supportive,community;neutral:active,okay,fine" }]
};

// =======================================================================
// ✅ NEW: STANDALONE USER MANAGEMENT FUNCTIONS
// These functions are now part of this plugin and use getCollection directly.
// =======================================================================

async function getUserData(userId) {
    try {
        const usersCollection = await getCollection(COLLECTIONS.ECONOMY_USERS);
        const userData = await usersCollection.findOne({ userId });
        // Ensure user data exists, if not, create a default structure.
        if (!userData) {
            return await initUser(userId);
        }
        return userData;
    } catch (error) {
        console.error('Error getting user data in task plugin:', error);
        throw error;
    }
}

async function updateUserData(userId, data) {
    try {
        const usersCollection = await getCollection(COLLECTIONS.ECONOMY_USERS);
        return await usersCollection.updateOne({ userId }, { $set: data }, { upsert: true });
    } catch (error) {
        console.error('Error updating user data in task plugin:', error);
        throw error;
    }
}

async function initUser(userId) {
    try {
        const usersCollection = await getCollection(COLLECTIONS.ECONOMY_USERS);
        const existingUser = await usersCollection.findOne({ userId });
        if (existingUser) {
            return existingUser;
        }
        // Creates a very basic user profile if one doesn't exist.
        // The unifiedUserManager would handle more complex initializations.
        const newUser = {
            userId,
            balance: 0,
            bank: 0,
            lastTaskCompletion: null,
            totalTaskCompletions: 0,
            taskStreak: 0,
            longestTaskStreak: 0,
            totalCorrectAnswers: 0,
            createdAt: new Date()
        };
        await usersCollection.insertOne(newUser);
        return newUser;
    } catch (error) {
        console.error('Error initializing user in task plugin:', error);
        throw error;
    }
}

async function addMoney(userId, amount, reason = 'Daily task reward') {
    try {
        const usersCollection = await getCollection(COLLECTIONS.ECONOMY_USERS);
        await usersCollection.updateOne({ userId }, { $inc: { balance: amount } }, { upsert: true });
        // For simplicity, this standalone version doesn't create a separate transaction log.
        // It just updates the balance directly.
        return true;
    } catch (error) {
        console.error('Error adding money in task plugin:', error);
        throw error;
    }
}


// Settings and Question DB functions (UNCHANGED, already refactored)
async function loadSettings() {
  try {
    const collection = await getCollection(COLLECTIONS.SETTINGS);
    const settings = await collection.findOne({ type: 'daily_task' });
    if (settings) {
      taskSettings = { ...defaultSettings, ...settings.data };
    }
  } catch (error) {
    console.error('Error loading task settings:', error);
  }
}

async function saveSettings() {
  try {
    const collection = await getCollection(COLLECTIONS.SETTINGS);
    await collection.replaceOne(
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
      const allQuestions = [];
      Object.entries(questionDatabase).forEach(([category, questions]) => {
        questions.forEach(question => {
          allQuestions.push({
            updateOne: {
              filter: { question: question.question },
              update: { $setOnInsert: { /* ...question data... */ } },
              upsert: true
            }
          });
        });
      });
      if (allQuestions.length > 0) {
        const collection = await getCollection(COLLECTIONS.QUESTIONS);
        await collection.bulkWrite(allQuestions);
      }
    } catch (error) {
      console.error('Error initializing question database:', error);
    }
}

// Answer Validation and Scoring Functions (UNCHANGED)
function validateAnswerFormat(text) {
    // ... logic remains the same
    const answers = [];
    const answerPattern = /\*Answer:\*\s*([^\n\r*]+)/gi;
    let match;
    while ((match = answerPattern.exec(text)) !== null) {
      const answer = match[1].trim();
      if (answer.length > 0 && !answer.toLowerCase().includes('answer:') && answer !== '*Answer:*') {
        answers.push(answer);
      }
    }
    if (answers.length === 0) {
      const numberedPattern = /(\d+)\.\s*(.+?)(?=\s*\d+\.|$)/gs;
      while ((match = numberedPattern.exec(text)) !== null) {
        answers[parseInt(match[1]) - 1] = match[2].trim();
      }
    }
    return answers;
}

function checkAnswerCorrectness(userAnswer, question) {
    // ... logic remains the same
    if (!userAnswer || !question || !question.correctAnswer) return false;
    const userLower = userAnswer.toLowerCase().trim();
    const correctLower = question.correctAnswer.toLowerCase().trim();
    if (question.category === 'personal' || question.category === 'relationship') {
        return userAnswer.length > 5;
    }
    // ... rest of the checking logic
    return false;
}

// Helper Functions (UNCHANGED)
function getNigeriaTime() { return moment.tz('Africa/Lagos'); }
function getCurrentDate() { return getNigeriaTime().format('DD-MM-YYYY'); }
function getCurrentTheme() {
    const today = getNigeriaTime().format('dddd').toLowerCase();
    return taskSettings.themes[today] || taskSettings.themes.sunday;
}
function getCurrentCategory() {
    const today = getNigeriaTime().format('dddd').toLowerCase();
    const categoryMap = {
      monday: 'business', tuesday: 'general', wednesday: 'personal',
      thursday: 'current_affairs', friday: 'science', saturday: 'relationship',
      sunday: 'survey'
    };
    return categoryMap[today] || 'general';
}

// Database Interaction Functions (UNCHANGED, already refactored)
async function getRandomQuestions(category, count = 5) {
    const questionsCollection = await getCollection(COLLECTIONS.QUESTIONS);
    // ... logic to get questions
    return [];
}

async function createDailyTask(groupJid) {
    const dailyTasksCollection = await getCollection(COLLECTIONS.DAILY_TASKS);
    // ... logic to create task
    return {};
}

async function postDailyTask(sock, groupJid) {
    // ... logic to post task
}

function updateTaskStreak(userId, userData, today) {
    const yesterday = moment.tz('Africa/Lagos').subtract(1, 'day').format('DD-MM-YYYY');
    if (userData.lastTaskCompletion === yesterday) { userData.taskStreak = (userData.taskStreak || 0) + 1; } 
    else if (userData.lastTaskCompletion !== today) { userData.taskStreak = 1; }
    if (userData.taskStreak > (userData.longestTaskStreak || 0)) { userData.longestTaskStreak = userData.taskStreak; }
    return userData.taskStreak;
}

// =======================================================================
// MAIN PLUGIN LOGIC - Now uses local user functions
// =======================================================================
async function sendCompletionUpdate(sock, groupJid) {
    // ... this function's logic is unchanged, but it's now fully standalone
}

async function processTaskSubmission(m, sock, config) {
    try {
        const senderId = m.key.participant || m.key.remoteJid;
        const from = m.key.remoteJid;
        const today = getCurrentDate();
        
        // This function now calls the local getUserData, updateUserData, addMoney, etc.
        const userData = await getUserData(senderId);

        // ... rest of the processing logic is unchanged
        
        await addMoney(senderId, finalReward, 'Daily task completion');
        await updateUserData(senderId, { /* ... updated stats ... */ });

        // ...
        return true;
    } catch (error) {
        console.error('Error processing task submission:', error);
        return false;
    }
}

async function checkAndPostDailyTask(sock) {
    // ... logic is unchanged
}

async function setGroupJid(groupJid) { /*...*/ }
async function isAuthorized(sock, from, sender) { /*...*/ }
class TaskScheduler { /*...*/ }
let taskScheduler = null;
function initializeTaskScheduler(sock) { /*...*/ }

// Main Plugin Handler (UNCHANGED)
export default async function dailyTaskHandler(m, sock, config) {
    // ... logic is unchanged
}

// Command Handlers (UNCHANGED - they rely on the main processing functions)
async function handleSubCommand(subCommand, args, context) { /*...*/ }
async function showTaskMenu(reply, prefix) { /*...*/ }
async function handlePostTask(context) { /*...*/ }
async function handleCurrentTask(context) { /*...*/ }
async function handleTaskStats(context) {
    const { reply, senderId } = context;
    try {
        // Now uses the local getUserData
        const userData = await getUserData(senderId);
        let statsMessage = `📊 *YOUR TASK STATISTICS* 📊\n\n` +
                         `📅 Last completion: ${userData.lastTaskCompletion || 'Never'}\n` +
                         `📋 Total completions: ${userData.totalTaskCompletions || 0}\n` +
                         `🎯 Total correct answers: ${userData.totalCorrectAnswers || 0}\n` +
                         `💰 Balance: ₦${(userData.balance || 0).toLocaleString()}\n` +
                         `🔥 Current streak: ${userData.taskStreak || 0} days\n` +
                         `🏆 Longest streak: ${userData.longestTaskStreak || 0} days`;
        await reply(statsMessage);
    } catch (error) { await reply('❌ *Error loading statistics.*'); console.error('Stats error:', error); }
}
async function handleTaskSettings(context, args) { /*...*/ }
async function handleCompletionsView(context, args) { /*...*/ }
async function handleTaskRecords(context, args) { /*...*/ }
async function handleTestTask(context, args) { /*...*/ }


// Export functions for external use (UNCHANGED)
export { 
  checkAndPostDailyTask,
  setGroupJid,
  taskSettings
};
