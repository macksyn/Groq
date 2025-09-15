// plugins/daily_task.js - Migrated to Centralized MongoDB Connection System
import moment from 'moment-timezone';
// ✅ REMOVED: Direct import of MongoClient.
// ✅ ADDED: Import of PluginHelpers for unified database and user functions.
import { PluginHelpers } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'Daily Task System',
  // ✅ UPDATED: Version number reflects migration.
  version: '3.0.0-migrated',
  author: 'Bot Developer',
  description: 'Enhanced daily quiz task system migrated to use a centralized MongoDB connection pool for improved performance and stability.',
  commands: [
    { name: 'task', aliases: ['dailytask', 'dt'], description: 'Access the daily task system' },
    { name: 'taskstats', aliases: ['mystats'], description: 'View your task statistics' },
    { name: 'testtask', aliases: ['testdt'], description: 'Test task answer validation' }
  ]
};

// Collection names remain the same.
const COLLECTIONS = {
  TASK_RECORDS: 'task_records',
  QUESTIONS: 'task_questions',
  SETTINGS: 'task_settings',
  DAILY_TASKS: 'daily_tasks'
};

// ✅ REMOVED: Local 'db' and 'mongoClient' variables. The connection is now managed globally.

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
    wednesday: 'Personal Growth & Reflection',
    thursday: 'Current Affairs & News',
    friday: 'Science & Technology',
    saturday: 'Relationship & Fun Facts',
    sunday: 'GIST HQ Survey & Feedback'
  }
};

let taskSettings = { ...defaultSettings };
let isPluginInitialized = false; // Flag to run initialization once.

// EXPANDED AND NEW QUESTION CATEGORIES (Unchanged)
const questionDatabase = {
  business: [
    { question: "What business can you start with just ₦20,000?", correctAnswer: "food vending, retail, digital services, online tutoring, photography, recharge card sales" },
    { question: "Name one skill you can monetize online", correctAnswer: "writing, graphic design, programming, tutoring, digital marketing, video editing, social media management" },
  ],
  general: [
    { question: "What is the capital of Nigeria?", correctAnswer: "abuja" },
    { question: "How many states are in Nigeria?", correctAnswer: "36" },
  ],
  hygiene: [
    { question: "How many times should you brush your teeth daily?", correctAnswer: "2, twice" },
    { question: "How long should you wash your hands to kill germs?", correctAnswer: "20 seconds, 20" },
  ],
  current_affairs: [
    { question: "Who is the current President of Nigeria?", correctAnswer: "bola ahmed tinubu, tinubu" },
    { question: "What does CBN stand for?", correctAnswer: "central bank of nigeria" },
  ],
  science: [
    { question: "What gas do plants absorb from the atmosphere?", correctAnswer: "carbon dioxide, co2" },
    { question: "Which planet is closest to the Sun?", correctAnswer: "mercury" },
  ],
  fun_facts: [
    { question: "Which animal is known as the King of the Jungle?", correctAnswer: "lion" },
    { question: "How many legs does a spider have?", correctAnswer: "8, eight" },
  ],
  personal: [
    { question: "What is one goal you want to achieve this month?", correctAnswer: "personal answer" },
    { question: "What is a skill you would love to learn and why?", correctAnswer: "personal answer" },
  ],
  relationship: [
    { question: "What is the most important quality in a friendship?", correctAnswer: "personal answer" },
    { question: "How do you show appreciation for the people you care about?", correctAnswer: "personal answer" },
  ],
  survey: [
    { question: "What is one thing you love most about the GIST HQ group?", correctAnswer: "positive:love,great,helpful,amazing,informative,supportive,community;neutral:active,okay,fine" },
    { question: "What is one thing that could be improved in GIST HQ?", correctAnswer: "constructive:improve,add,more,better,less,change,suggestion;neutral:nothing,fine,okay" },
  ]
};


// ✅ REMOVED: initDatabase() function. Connection is handled by mongoManager.

// ✅ NEW: One-time initialization function for the plugin.
async function initializePlugin() {
  if (isPluginInitialized) return;
  try {
    console.log('🔌 Initializing Daily Task plugin...');
    // Use safeDBOperation to ensure indexes are created safely.
    await PluginHelpers.safeDBOperation(async (db) => {
      await db.collection(COLLECTIONS.TASK_RECORDS).createIndex({ userId: 1, date: -1 });
      await db.collection(COLLECTIONS.QUESTIONS).createIndex({ category: 1 });
      await db.collection(COLLECTIONS.DAILY_TASKS).createIndex({ date: 1 }, { unique: true });
    });
    
    await loadSettings();
    await initializeQuestionDatabase(); // Syncs questions from code to DB.
    
    isPluginInitialized = true;
    console.log('✅ Daily Task plugin initialized successfully.');
  } catch (error) {
    console.error('❌ Daily Task plugin initialization failed:', error);
  }
}

async function loadSettings() {
  await PluginHelpers.safeDBOperation(async (db) => {
    const settings = await db.collection(COLLECTIONS.SETTINGS).findOne({ type: 'daily_task' });
    if (settings) {
      taskSettings = { ...defaultSettings, ...settings.data };
    }
  });
}

async function saveSettings() {
  await PluginHelpers.safeDBOperation(async (db) => {
    await db.collection(COLLECTIONS.SETTINGS).replaceOne(
      { type: 'daily_task' },
      { type: 'daily_task', data: taskSettings, updatedAt: new Date() },
      { upsert: true }
    );
  });
}

async function initializeQuestionDatabase() {
  await PluginHelpers.safeDBOperation(async (db) => {
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
      console.log(`✅ Question database synced.`);
    }
  });
}

// Answer validation and checking logic remains unchanged.
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
      answers[parseInt(match[1]) - 1] = match[2].trim();
    }
  }
  return answers;
}

function checkAnswerCorrectness(userAnswer, question) {
  if (!userAnswer || !question || !question.correctAnswer) return false;
  const userLower = userAnswer.toLowerCase().trim();
  const correctLower = question.correctAnswer.toLowerCase().trim();
  switch (question.category) {
    case 'survey':
    case 'personal':
    case 'relationship':
      return userAnswer.length > 5;
    default:
      if (userLower === correctLower) return true;
      if (correctLower.includes(',')) {
        return correctLower.split(',').map(ans => ans.trim()).some(ans => userLower.includes(ans));
      }
      return userLower.includes(correctLower);
  }
}

// Time and theme functions remain unchanged.
function getNigeriaTime() { return moment.tz('Africa/Lagos'); }
function getCurrentDate() { return getNigeriaTime().format('DD-MM-YYYY'); }
function getCurrentTheme() { const today = getNigeriaTime().format('dddd').toLowerCase(); return taskSettings.themes[today] || taskSettings.themes.sunday; }
function getCurrentCategory() {
  const today = getNigeriaTime().format('dddd').toLowerCase();
  const categoryMap = { monday: 'business', tuesday: 'general', wednesday: 'personal', thursday: 'current_affairs', friday: 'science', saturday: 'relationship', sunday: 'survey' };
  return categoryMap[today] || 'general';
}

async function getRandomQuestions(category, count = 5) {
  return await PluginHelpers.safeDBOperation(async (db) => {
    let questions;
    if (category === 'relationship') {
        const relQuestions = await db.collection(COLLECTIONS.QUESTIONS).aggregate([{ $match: { category: 'relationship', active: true } }, { $sample: { size: 3 } }]).toArray();
        const funQuestions = await db.collection(COLLECTIONS.QUESTIONS).aggregate([{ $match: { category: 'fun_facts', active: true } }, { $sample: { size: 2 } }]).toArray();
        questions = [...relQuestions, ...funQuestions];
    } else {
        questions = await db.collection(COLLECTIONS.QUESTIONS).aggregate([{ $match: { category: category, active: true } }, { $sample: { size: count } }]).toArray();
    }
    if (questions.length < count) {
      const needed = count - questions.length;
      const supplementQuestions = await db.collection(COLLECTIONS.QUESTIONS).aggregate([{ $match: { category: 'general', active: true } }, { $sample: { size: needed } }]).toArray();
      questions = [...questions, ...supplementQuestions];
    }
    return questions.slice(0, count);
  });
}

async function createDailyTask(groupJid) {
    return await PluginHelpers.safeDBOperation(async (db) => {
        const today = getCurrentDate();
        const theme = getCurrentTheme();
        const category = getCurrentCategory();
        
        const existingTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
        if (existingTask) return existingTask;
        
        const questions = await getRandomQuestions(category, taskSettings.questionCount);
        if (questions.length === 0) throw new Error('No questions available');
        
        const taskData = { date: today, groupJid, theme, category, questions, completions: [], postedAt: new Date(), deadline: taskSettings.submissionDeadline };
        
        await db.collection(COLLECTIONS.DAILY_TASKS).insertOne(taskData);
        console.log(`✅ Daily task created for ${today}`);
        return taskData;
    });
}

// Message formatting and group logic remain unchanged.
function formatDailyTaskMessage(taskData) {
  const nigeriaTime = getNigeriaTime();
  const dayName = nigeriaTime.format('dddd');
  const dateStr = nigeriaTime.format('MMMM DD, YYYY');
  let message = `🏢 *GIST HQ - DAILY TASK CHALLENGE* 🏢\n\n` +
                `📅 ${dayName}, ${dateStr}\n` +
                `🎯 *Today's Theme:* ${taskData.theme.toUpperCase()}\n\n` +
                `📝 *Answer all ${taskData.questions.length} questions to earn your reward!*\n` +
                `⏰ *Deadline:* ${taskData.deadline} today\n\n`;
  taskData.questions.forEach((q, index) => {
    message += `${index + 1}️⃣ ${q.question}\n*Answer:*\n\n`;
  });
  message += `💰 *Reward:* ₦${taskSettings.baseReward.toLocaleString()} for completion\n` +
             `✨ *Bonus:* ₦${taskSettings.correctnessBonus.toLocaleString()} per correct/thoughtful answer\n`;
  if (taskSettings.enableStreakBonus) {
    message += `🔥 *Streak Bonus:* +${Math.floor((taskSettings.streakBonusMultiplier - 1) * 100)}% after ${taskSettings.minStreakForBonus} consecutive days\n`;
  }
  message += `\n📋 *HOW TO SUBMIT:*\n1️⃣ Copy this entire message\n2️⃣ Type your answers after each "Answer:"\n3️⃣ Send the completed message\n\n✨ *Good luck, GIST HQ family!* ✨`;
  return message;
}

async function getGroupMembers(sock, groupJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    return groupMetadata.participants.map(p => p.id);
  } catch (error) { console.error('Error getting group members:', error); return []; }
}

async function postDailyTask(sock, groupJid) {
  try {
    const taskData = await createDailyTask(groupJid);
    const message = formatDailyTaskMessage(taskData);
    let mentions = [];
    if (taskSettings.tagAllMembers) {
      mentions = await getGroupMembers(sock, groupJid);
    }
    await sock.sendMessage(groupJid, { text: message, mentions });
    console.log(`✅ Daily task posted to group ${groupJid}`);
    return true;
  } catch (error) { console.error('Error posting daily task:', error); return false; }
}

function updateTaskStreak(userData, today) {
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

async function sendCompletionUpdate(sock, groupJid) {
  await PluginHelpers.safeDBOperation(async (db) => {
    const today = getCurrentDate();
    const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    if (!todayTask || todayTask.completions.length === 0) return;

    const completions = todayTask.completions.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    const totalMembers = await getGroupMembers(sock, groupJid);
    let updateMessage = `📊 *TASK COMPLETIONS SO FAR* (${completions.length}/${totalMembers.length}) 📊\n\n`;
    const mentions = [];

    completions.forEach((completion, index) => {
      mentions.push(completion.userId);
      updateMessage += `${index + 1}. @${completion.userId.split('@')[0]} ✅\n`;
    });
    updateMessage += `\nKeep the submissions coming! 💪`;

    await new Promise(resolve => setTimeout(resolve, 2000));
    await sock.sendMessage(groupJid, { text: updateMessage, mentions });
  });
}

async function processTaskSubmission(m, sock) {
  try {
    const messageText = m.body || '';
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const today = getCurrentDate();
    
    const answers = validateAnswerFormat(messageText);
    if (answers.length < taskSettings.questionCount) return false;
    
    console.log(`📝 Task submission detected from ${senderId}`);
    
    // ✅ All DB operations are now wrapped in safeOperation for resilience.
    const result = await PluginHelpers.safeDBOperation(async (db) => {
      const todayTask = await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
      if (!todayTask) return { error: 'No active task for today.' };
      if (todayTask.completions.some(c => c.userId === senderId)) return { error: "You've already completed today's task!" };
      
      const userData = await PluginHelpers.getUserData(senderId);
      
      let correctCount = 0;
      const answerResults = todayTask.questions.map((question, i) => {
        const userAnswer = answers[i] || '';
        const isCorrect = checkAnswerCorrectness(userAnswer, question);
        if (isCorrect) correctCount++;
        return { questionNumber: i + 1, userAnswer, isCorrect };
      });
      
      const currentStreak = updateTaskStreak(userData, today);
      
      let baseReward = taskSettings.baseReward;
      const correctnessBonus = correctCount * taskSettings.correctnessBonus;
      let streakBonus = 0;
      if (taskSettings.enableStreakBonus && currentStreak >= taskSettings.minStreakForBonus) {
        streakBonus = Math.floor(baseReward * taskSettings.streakBonusMultiplier) - baseReward;
      }
      const finalReward = baseReward + correctnessBonus + streakBonus;
      
      await PluginHelpers.addMoney(senderId, finalReward, 'Daily task completion');
      
      await PluginHelpers.updateUser(senderId, {
        lastTaskCompletion: today,
        totalTaskCompletions: (userData.totalTaskCompletions || 0) + 1,
        taskStreak: currentStreak,
        longestTaskStreak: userData.longestTaskStreak,
        totalCorrectAnswers: (userData.totalCorrectAnswers || 0) + correctCount
      });
      
      const completionData = { userId: senderId, answers, correctCount, submittedAt: new Date(), totalReward: finalReward, streak: currentStreak };
      
      await db.collection(COLLECTIONS.DAILY_TASKS).updateOne({ date: today }, { $push: { completions: completionData } });
      await db.collection(COLLECTIONS.TASK_RECORDS).insertOne({ ...completionData, date: today });
      
      const updatedUserData = await PluginHelpers.getUserData(senderId);

      return { success: true, answerResults, correctCount, finalReward, correctnessBonus, streakBonus, currentStreak, updatedBalance: updatedUserData.balance, questionCount: todayTask.questions.length };
    });

    if (result.error) {
      await sock.sendMessage(from, { text: `📝 *${result.error}*` }, { quoted: m });
      return true;
    }

    if (result.success) {
      let successMessage = `✅ *TASK COMPLETED!* ✅\n\n` +
                           `📊 *Your Score:* ${result.correctCount}/${result.questionCount} correct/thoughtful answers\n\n` +
                           `📝 *Answer Review:*\n`;
      result.answerResults.forEach(r => {
        successMessage += `${r.isCorrect ? '✅' : '❌'} Q${r.questionNumber}: _${r.userAnswer.substring(0, 25)}..._\n`;
      });
      successMessage += `\n💰 *Reward Breakdown:*\n` +
                        `• Base completion: ₦${taskSettings.baseReward.toLocaleString()}\n` +
                        `• Correctness bonus: ₦${result.correctnessBonus.toLocaleString()}\n`;
      if (result.streakBonus > 0) successMessage += `• Streak bonus: +₦${result.streakBonus.toLocaleString()}\n`;
      successMessage += `• *Total earned: ₦${result.finalReward.toLocaleString()}*\n\n` +
                        `💸 *Your balance: ₦${(result.updatedBalance || 0).toLocaleString()}*\n` +
                        `🔥 *Current streak: ${result.currentStreak} days*\n`;

      await sock.sendMessage(from, { text: successMessage }, { quoted: m });
      await sendCompletionUpdate(sock, from);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error processing task submission:', error);
    await sock.sendMessage(m.key.remoteJid, { text: `❌ *Error processing your submission.*` }, { quoted: m });
    return false;
  }
}

async function checkAndPostDailyTask(sock) {
  try {
    if (!taskSettings.autoPostEnabled || getNigeriaTime().format('HH:mm') !== taskSettings.autoPostTime) return;
    
    const wasPosted = await PluginHelpers.safeDBOperation(async (db) => {
        const today = getCurrentDate();
        return await db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: today });
    });

    if (wasPosted) return;
    
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

// Scheduler and authorization logic remain mostly unchanged.
class TaskScheduler {
  constructor(sock) { this.sock = sock; this.interval = null; this.running = false; }
  start() { if (this.running) return; this.running = true; console.log('⏰ Daily Task scheduler started'); this.interval = setInterval(() => checkAndPostDailyTask(this.sock), 60000); }
  stop() { if(this.running) { this.running = false; clearInterval(this.interval); this.interval = null; console.log('⏰ Daily Task scheduler stopped'); } }
}
let taskScheduler = null;

async function isAuthorized(sock, from, sender) {
  if (taskSettings.adminNumbers.includes(sender.split('@')[0])) return true;
  const ownerNumber = process.env.OWNER_NUMBER || '';
  if (sender.split('@')[0] === ownerNumber) return true;
  try {
    if (!from.endsWith('@g.us')) return false;
    const groupMetadata = await sock.groupMetadata(from);
    const groupAdmins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
    return groupAdmins.includes(sender);
  } catch { return false; }
}

// MAIN PLUGIN HANDLER
export default async function dailyTaskHandler(m, sock, config) {
  try {
    // ✅ Simplified initialization call.
    await initializePlugin();

    if (m.key.remoteJid.endsWith('@g.us') && !taskSettings.groupJids.includes(m.key.remoteJid)) {
        taskSettings.groupJids.push(m.key.remoteJid);
        await saveSettings();
    }
    
    if (!taskScheduler) {
        taskScheduler = new TaskScheduler(sock);
        taskScheduler.start();
    }

    if (m.body && !m.body.startsWith(config.PREFIX)) {
      if (await processTaskSubmission(m, sock)) return;
    }
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    const senderId = m.key.participant || m.key.remoteJid;
    const from = m.key.remoteJid;
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: m });
    const context = { m, sock, config, senderId, from, reply };
    
    switch (command) {
      case 'task': case 'dailytask': case 'dt':
        if (args.length === 1) await showTaskMenu(reply, config.PREFIX);
        else await handleSubCommand(args[1], args.slice(2), context);
        break;
      case 'taskstats': await handleTaskStats(context); break;
      case 'testtask': await handleTestTask(context, args.slice(1)); break;
    }
  } catch (error) { console.error('❌ Daily Task plugin error:', error); }
}

// Sub-command handlers now use safeOperation implicitly via other functions.
// Logic within handlers is the same, but the underlying DB calls are safer.
async function handleSubCommand(subCommand, args, context) {
    const commands = {
        'post': handlePostTask,
        'current': handleCurrentTask,
        'stats': handleTaskStats,
        'settings': (ctx) => handleTaskSettings(ctx, args),
        'completions': (ctx) => handleCompletionsView(ctx, args),
        'records': (ctx) => handleTaskRecords(ctx, args),
        'help': (ctx) => showTaskMenu(ctx.reply, ctx.config.PREFIX)
    };
    const handler = commands[subCommand.toLowerCase()];
    if (handler) await handler(context);
    else await context.reply(`❓ Unknown command: *${subCommand}*`);
}

async function showTaskMenu(reply, prefix) {
  const menuText = `🎯 *DAILY TASK SYSTEM* 🎯\n\n` +
                   `📊 *User Commands:*\n` +
                   `• *current* - View today's task\n• *stats* - View your statistics\n• *records* - View completion history\n• *completions* - See who completed today\n\n` +
                   `👑 *Admin Commands:*\n` +
                   `• *post* - Post today's task manually\n• *settings* - System settings\n\n` +
                   `💰 *Rewards:* ₦${taskSettings.baseReward.toLocaleString()} base + ₦${taskSettings.correctnessBonus} per correct answer\n` +
                   `💡 *Usage:* ${prefix}task [command]`;
  await reply(menuText);
}

async function handlePostTask({ reply, senderId, sock, from }) {
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can post tasks.');
  if (!from.endsWith('@g.us')) return reply('❌ This command works only in groups.');
  try {
    await postDailyTask(sock, from) ? await reply('✅ *Daily task posted successfully!*') : await reply('❌ *Failed to post task.*');
  } catch (error) { await reply('❌ *Error posting task.*'); }
}

async function handleCurrentTask({ reply, config }) {
    try {
        const todayTask = await PluginHelpers.safeDBOperation(db => db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date: getCurrentDate() }));
        if (!todayTask) return reply(`📅 *No task for today.*\n\nAdmins can post manually: *${config.PREFIX}task post*`);
        await reply(formatDailyTaskMessage(todayTask));
    } catch (error) { await reply('❌ *Error loading current task.*'); }
}

async function handleTaskStats({ reply, senderId }) {
    try {
        const userData = await PluginHelpers.getUserData(senderId);
        let statsMessage = `📊 *YOUR TASK STATISTICS* 📊\n\n` +
                         `📅 Last completion: ${userData.lastTaskCompletion || 'Never'}\n` +
                         `📋 Total completions: ${userData.totalTaskCompletions || 0}\n` +
                         `🎯 Total correct answers: ${userData.totalCorrectAnswers || 0}\n` +
                         `💰 Balance: ₦${(userData.balance || 0).toLocaleString()}\n` +
                         `🔥 Current streak: ${userData.taskStreak || 0} days\n` +
                         `🏆 Longest streak: ${userData.longestTaskStreak || 0} days`;
        await reply(statsMessage);
    } catch (error) { await reply('❌ *Error loading statistics.*'); }
}

async function handleTaskSettings({ reply, senderId, sock, from, config }, args) {
  if (!await isAuthorized(sock, from, senderId)) return reply('🚫 Only admins can access settings.');
  if (args.length === 0) {
      const settingsMessage = `⚙️ *TASK SYSTEM SETTINGS* ⚙️\n\n` +
        `💰 *Rewards:*\n` + `• Base reward: ₦${taskSettings.baseReward.toLocaleString()}\n` + `• Correctness bonus: ₦${taskSettings.correctnessBonus}\n` + `• Streak bonus: ${taskSettings.enableStreakBonus ? '✅' : '❌'}\n\n` +
        `🤖 *Automation:*\n` + `• Auto-post: ${taskSettings.autoPostEnabled ? '✅' : '❌'}\n` + `• Post time: ${taskSettings.autoPostTime}\n` + `• Deadline: ${taskSettings.submissionDeadline}\n\n` +
        `🔧 *Usage:* ${config.PREFIX}task settings [reward|bonus|streak|autopost|posttime|deadline] [value]`;
      return reply(settingsMessage);
  }
  try {
    const setting = args[0].toLowerCase();
    const value = args[1];
    let responseText = "";
    switch (setting) {
      case 'reward': taskSettings.baseReward = parseInt(value); responseText = `✅ Base reward set to ₦${taskSettings.baseReward.toLocaleString()}`; break;
      case 'bonus': taskSettings.correctnessBonus = parseInt(value); responseText = `✅ Correctness bonus set to ₦${taskSettings.correctnessBonus.toLocaleString()}`; break;
      case 'streak': taskSettings.enableStreakBonus = ['on', 'true', '1'].includes(value?.toLowerCase()); responseText = `✅ Streak bonus ${taskSettings.enableStreakBonus ? 'enabled' : 'disabled'}`; break;
      case 'autopost': taskSettings.autoPostEnabled = ['on', 'true', '1'].includes(value?.toLowerCase()); responseText = `✅ Auto-posting ${taskSettings.autoPostEnabled ? 'enabled' : 'disabled'}`; break;
      case 'posttime': case 'deadline':
        if (!/^\d{2}:\d{2}$/.test(value)) { responseText = `⚠️ Invalid time format (HH:MM).`; break; }
        if (setting === 'posttime') taskSettings.autoPostTime = value; else taskSettings.submissionDeadline = value;
        responseText = `✅ ${setting} set to ${value}`; break;
      default: responseText = `⚠️ Unknown setting: *${setting}*`;
    }
    if (!responseText.startsWith('⚠️')) await saveSettings();
    await reply(responseText);
  } catch (error) { await reply('❌ *Error updating settings.*'); }
}

async function handleCompletionsView({ reply }, args) {
    try {
        const date = args[0] || getCurrentDate();
        const task = await PluginHelpers.safeDBOperation(db => db.collection(COLLECTIONS.DAILY_TASKS).findOne({ date }));
        if (!task) return reply(`📅 *No task found for ${date}*`);
        
        let completionMessage = `📊 *TASK COMPLETION REPORT* 📊\n\n` + `📅 Date: ${date}\n` + `🎯 Theme: ${task.theme}\n` + `📋 Participants: ${task.completions.length}\n\n`;
        if (task.completions.length > 0) {
            task.completions.sort((a, b) => b.correctCount - a.correctCount || new Date(a.submittedAt) - new Date(b.submittedAt))
            .forEach((c, i) => {
                completionMessage += `${i + 1}. +${c.userId.split('@')[0]}\n   📊 ${c.correctCount}/${task.questions.length} • 💰 ₦${c.totalReward.toLocaleString()}\n`;
            });
        } else {
            completionMessage += `❌ *No completions yet*`;
        }
        await reply(completionMessage);
    } catch (error) { await reply('❌ *Error loading completions.*'); }
}

async function handleTaskRecords({ reply, senderId, config }, args) {
    try {
        const limit = args[0] ? parseInt(args[0]) : 5;
        const records = await PluginHelpers.safeDBOperation(db => db.collection(COLLECTIONS.TASK_RECORDS).find({ userId: senderId }).sort({ submittedAt: -1 }).limit(limit).toArray());
        if (records.length === 0) return reply(`📋 *No task history found*`);
        
        let recordsText = `📋 *YOUR LAST ${records.length} TASKS* 📋\n\n`;
        records.forEach((r, i) => {
          recordsText += `${i + 1}. 📅 ${r.date}\n   📊 ${r.correctCount}/${taskSettings.questionCount} correct • 💰 ₦${r.totalReward.toLocaleString()}\n`;
        });
        recordsText += `\n💡 Use *${config.PREFIX}task records [num]* for more.`;
        await reply(recordsText);
    } catch (error) { await reply('❌ *Error loading records.*'); }
}

async function handleTestTask({ reply, config }, args) {
  const testAnswers = args.join(' ');
  if (!testAnswers) return reply(`🔍 *ANSWER FORMAT VALIDATOR*\n\n*Usage:* ${config.PREFIX}testtask [your_test_message]`);
  const answers = validateAnswerFormat(testAnswers);
  let result = `🔍 *FORMAT VALIDATION RESULTS* 🔍\n\n` + `📊 Detected: ${answers.length} answers\n\n`;
  if (answers.length > 0) {
    answers.forEach((ans, i) => { result += `${i + 1}. "${ans.slice(0, 30)}..."\n`; });
    result += answers.length >= taskSettings.questionCount ? `\n🎉 *FORMAT VALID!* ✅` : `\n❌ *INSUFFICIENT ANSWERS*`;
  } else {
    result += `❌ *NO ANSWERS DETECTED*`;
  }
  await reply(result);
}

// Export functions for external use
export { 
  checkAndPostDailyTask,
  taskSettings
};
