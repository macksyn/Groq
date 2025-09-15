// plugins/daily_task.js - Enhanced Daily Task System
import moment from 'moment-timezone';
// ✅ REFACTORED: Import only the getCollection helper
import { getCollection } from '../lib/pluginIntegration.js';

// Plugin information export (UNCHANGED)
export const info = {
  name: 'Daily Task System',
  version: '2.3.1', // Version bump for bug fix and full implementation
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

// Collection names (UNCHANGED)
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

// ✅ FIXED: Using the full question database again.
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
  ],
  hygiene: [
    { question: "How many times should you brush your teeth daily?", correctAnswer: "2, twice" },
    { question: "How long should you wash your hands to kill germs?", correctAnswer: "20 seconds, 20" },
    { question: "How often should you change your toothbrush?", correctAnswer: "every 3 months, 3 months" },
  ],
  current_affairs: [
    { question: "Who is the current President of Nigeria?", correctAnswer: "bola ahmed tinubu, tinubu" },
    { question: "What does CBN stand for?", correctAnswer: "central bank of nigeria" },
    { question: "Name Nigeria's current Vice President", correctAnswer: "kashim shettima, shettima" },
  ],
  science: [
    { question: "What gas do plants absorb from the atmosphere?", correctAnswer: "carbon dioxide, co2" },
    { question: "Which planet is closest to the Sun?", correctAnswer: "mercury" },
    { question: "What does DNA stand for?", correctAnswer: "deoxyribonucleic acid" },
  ],
  fun_facts: [
    { question: "Which animal is known as the King of the Jungle?", correctAnswer: "lion" },
    { question: "How many legs does a spider have?", correctAnswer: "8, eight" },
    { question: "What is the tallest building in the world?", correctAnswer: "burj khalifa" },
  ],
  personal: [
    { question: "What is one goal you want to achieve this month?", correctAnswer: "personal answer" },
    { question: "What is a skill you would love to learn and why?", correctAnswer: "personal answer" },
    { question: "Describe a challenge you recently overcame.", correctAnswer: "personal answer" },
  ],
  relationship: [
    { question: "What is the most important quality in a friendship?", correctAnswer: "personal answer" },
    { question: "How do you show appreciation for the people you care about?", correctAnswer: "personal answer" },
    { question: "What is one common mistake people make in relationships?", correctAnswer: "personal answer" },
  ],
  survey: [
    { question: "What is one thing you love most about the GIST HQ group?", correctAnswer: "positive:love,great,helpful,amazing,informative,supportive,community;neutral:active,okay,fine" },
    { question: "What is one thing that could be improved in GIST HQ?", correctAnswer: "constructive:improve,add,more,better,less,change,suggestion;neutral:nothing,fine,okay" },
    { question: "What kind of topics or activities would you like to see more of in the group?", correctAnswer: "suggestion:topics,activities,events,sessions,training,more of" },
  ]
};

// =======================================================================
// STANDALONE USER MANAGEMENT FUNCTIONS (UNCHANGED)
// =======================================================================
async function getUserData(userId) {
    try {
        const usersCollection = await getCollection(COLLECTIONS.ECONOMY_USERS);
        const userData = await usersCollection.findOne({ userId });
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
        const newUser = {
            userId, balance: 0, bank: 0, lastTaskCompletion: null,
            totalTaskCompletions: 0, taskStreak: 0, longestTaskStreak: 0,
            totalCorrectAnswers: 0, createdAt: new Date()
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
        return true;
    } catch (error) {
        console.error('Error adding money in task plugin:', error);
        throw error;
    }
}

// Settings and Question DB functions
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

// ✅ FIXED: Fully implemented the logic inside $setOnInsert.
async function initializeQuestionDatabase() {
    try {
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
        const collection = await getCollection(COLLECTIONS.QUESTIONS);
        await collection.bulkWrite(allQuestions);
        console.log(`✅ Question database synced.`);
      }
    } catch (error) {
      console.error('Error initializing question database:', error);
    }
}

// Answer Validation and Scoring Functions
function validateAnswerFormat(text) {
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
        const questionNum = parseInt(match[1]);
        let answer = match[2].trim();
        if (answer.length > 2) {
          answers[questionNum - 1] = answer;
        }
      }
    }
    return answers;
}

// ✅ FIXED: Fully implemented the factual answer checking logic.
function checkAnswerCorrectness(userAnswer, question) {
    if (!userAnswer || !question || !question.correctAnswer) return false;
    const userLower = userAnswer.toLowerCase().trim();
    const correctLower = question.correctAnswer.toLowerCase().trim();
  
    switch (question.category) {
      case 'survey':
        const parts = correctLower.split(';');
        for (const part of parts) {
          const [type, keywords] = part.split(':');
          const keywordList = keywords.split(',');
          if (keywordList.some(kw => userLower.includes(kw))) {
            if (['positive', 'constructive', 'suggestion', 'rating'].includes(type)) return true;
          }
        }
        return userAnswer.length > 5;
  
      case 'personal':
      case 'relationship':
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

// Database Interaction Functions
// ✅ FIXED: Fully implemented the question fetching logic.
async function getRandomQuestions(category, count = 5) {
    try {
        const questionsCollection = await getCollection(COLLECTIONS.QUESTIONS);
        let questions;
        if (category === 'relationship') {
            const relQuestions = await questionsCollection.aggregate([{ $match: { category: 'relationship', active: true } }, { $sample: { size: 3 } }]).toArray();
            const funQuestions = await questionsCollection.aggregate([{ $match: { category: 'fun_facts', active: true } }, { $sample: { size: 2 } }]).toArray();
            questions = [...relQuestions, ...funQuestions];
        } else {
            questions = await questionsCollection.aggregate([{ $match: { category: category, active: true } }, { $sample: { size: count } }]).toArray();
        }
        
        if (questions.length < count) {
          const needed = count - questions.length;
          const supplementQuestions = await questionsCollection.aggregate([{ $match: { category: 'general', active: true } }, { $sample: { size: needed } }]).toArray();
          questions = [...questions, ...supplementQuestions];
        }
        
        return questions.slice(0, count);
    } catch (error) {
        console.error('Error getting random questions:', error);
        return [];
    }
}

// ✅ FIXED: Fully implemented the task creation logic.
async function createDailyTask(groupJid) {
    try {
        const today = getCurrentDate();
        const theme = getCurrentTheme();
        const category = getCurrentCategory();
        
        const dailyTasksCollection = await getCollection(COLLECTIONS.DAILY_TASKS);
        const existingTask = await dailyTasksCollection.findOne({ date: today });
        if (existingTask) return existingTask;
        
        const questions = await getRandomQuestions(category, taskSettings.questionCount);
        if (questions.length < taskSettings.questionCount) throw new Error('Not enough questions available to create a task.');
        
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
        
        await dailyTasksCollection.insertOne(taskData);
        console.log(`✅ Daily task created for ${today}`);
        return taskData;
    } catch (error) {
        console.error('Error creating daily task:', error);
        throw error;
    }
}

function updateTaskStreak(userId, userData, today) {
    const yesterday = moment.tz('Africa/Lagos').subtract(1, 'day').format('DD-MM-YYYY');
    if (userData.lastTaskCompletion === yesterday) { userData.taskStreak = (userData.taskStreak || 0) + 1; } 
    else if (userData.lastTaskCompletion !== today) { userData.taskStreak = 1; }
    if (userData.taskStreak > (userData.longestTaskStreak || 0)) { userData.longestTaskStreak = userData.taskStreak; }
    return userData.taskStreak;
}

// Main Plugin Logic
// ✅ FIXED: Fully implemented the completion update logic.
async function sendCompletionUpdate(sock, groupJid) {
    try {
      const today = getCurrentDate();
      const dailyTasksCollection = await getCollection(COLLECTIONS.DAILY_TASKS);
      const todayTask = await dailyTasksCollection.findOne({ date: today });
  
      if (!todayTask || todayTask.completions.length === 0) return;
  
      const completions = todayTask.completions;
      const groupMetadata = await sock.groupMetadata(groupJid);
      const totalMembers = groupMetadata.participants.length;
  
      let updateMessage = `📊 *TASK COMPLETIONS SO FAR* (${completions.length}/${totalMembers}) 📊\n\n`;
      const mentions = [];
      completions.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
      completions.forEach((completion, index) => {
        mentions.push(completion.userId);
        updateMessage += `${index + 1}. @${completion.userPhone} ✅\n`;
      });
      updateMessage += `\nKeep the submissions coming! 💪`;
      await new Promise(resolve => setTimeout(resolve, 2000));
      await sock.sendMessage(groupJid, { text: updateMessage, mentions: mentions });
    } catch (error) {
      console.error('Error sending completion update:', error);
    }
}

// ✅ FIXED: Fully implemented the submission processing and feedback message logic.
async function processTaskSubmission(m, sock, config) {
    try {
        const messageText = m.body || '';
        const senderId = m.key.participant || m.key.remoteJid;
        const from = m.key.remoteJid;
        const today = getCurrentDate();
        const answers = validateAnswerFormat(messageText);

        if (answers.length < taskSettings.questionCount) return false;
        
        const dailyTasksCollection = await getCollection(COLLECTIONS.DAILY_TASKS);
        const todayTask = await dailyTasksCollection.findOne({ date: today });
        if (!todayTask) {
          await sock.sendMessage(from, { text: `❌ *No active task for today.*` }, { quoted: m });
          return true;
        }

        const hasCompleted = todayTask.completions.some(c => c.userId === senderId);
        if (hasCompleted) {
          await sock.sendMessage(from, { text: `📝 *You've already completed today's task!*` }, { quoted: m });
          return true;
        }

        await initUser(senderId);
        const userData = await getUserData(senderId);
        
        let correctCount = 0;
        const answerResults = [];
        todayTask.questions.forEach((question, i) => {
            const userAnswer = answers[i] || '';
            const isCorrect = checkAnswerCorrectness(userAnswer, question);
            if (isCorrect) correctCount++;
            answerResults.push({ questionNumber: i + 1, userAnswer: userAnswer, isCorrect: isCorrect });
        });

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
          userId: senderId, userPhone: senderId.split('@')[0], answers: answers, correctCount: correctCount,
          submittedAt: new Date(), totalReward: finalReward, streak: currentStreak
        };
        
        await dailyTasksCollection.updateOne({ date: today }, { $push: { completions: completionData } });
        const taskRecordsCollection = await getCollection(COLLECTIONS.TASK_RECORDS);
        await taskRecordsCollection.insertOne({ ...completionData, date: today });
        
        const updatedUserData = await getUserData(senderId);
        
        let successMessage = `✅ *TASK COMPLETED!* ✅\n\n`;
        successMessage += `📊 *Your Score:* ${correctCount}/${todayTask.questions.length} correct/thoughtful answers\n\n`;
        successMessage += `📝 *Answer Review:*\n`;
        answerResults.forEach((result) => {
          const emoji = result.isCorrect ? '✅' : '❌';
          const truncatedAnswer = result.userAnswer.length > 25 ? result.userAnswer.substring(0, 25) + '...' : result.userAnswer;
          successMessage += `${emoji} Q${result.questionNumber}: _${truncatedAnswer || "No answer given"}_ \n`;
        });
        successMessage += `\n`;
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
        
        await sock.sendMessage(from, { text: successMessage }, { quoted: m });
        await sendCompletionUpdate(sock, from);
        return true;
    } catch (error) {
        console.error('Error processing task submission:', error);
        await m.reply('❌ An error occurred while processing your submission.');
        return false;
    }
}

// Scheduler and Authorization (UNCHANGED)
async function checkAndPostDailyTask(sock) { /* ... */ }
async function setGroupJid(groupJid) { /* ... */ }
async function isAuthorized(sock, from, sender) { /* ... */ }
class TaskScheduler { /* ... */ }
let taskScheduler = null;
function initializeTaskScheduler(sock) { /* ... */ }

// Main Plugin Handler
export default async function dailyTaskHandler(m, sock, config) {
    try {
        if (!taskScheduler) {
          await loadSettings();
          await initializeQuestionDatabase();
          initializeTaskScheduler(sock);
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

// Command Handlers (UNCHANGED)
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
async function showTaskMenu(reply, prefix) { /* ... */ }
async function handlePostTask(context) {
    const { reply, senderId, sock, m, from } = context;
    if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can post tasks.');
    if (!from.endsWith('@g.us')) return reply('❌ This command works only in groups.');
    try {
        if (await postDailyTask(sock, from)) await reply('✅ *Daily task posted successfully!*');
        else await reply('❌ *Failed to post task.*');
    } catch (error) { await reply('❌ *Error posting task.*'); }
}
async function handleCurrentTask(context) { /* ... */ }
async function handleTaskStats(context) { /* ... */ }
async function handleTaskSettings(context, args) { /* ... */ }
async function handleCompletionsView(context, args) { /* ... */ }
async function handleTaskRecords(context, args) { /* ... */ }
async function handleTestTask(context, args) { /* ... */ }

// Exports
export { 
  checkAndPostDailyTask,
  setGroupJid,
  taskSettings
};

