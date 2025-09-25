import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { PluginHelpers } from '../lib/pluginIntegration.js';

export const info = {
  name: 'autoInterview',
  version: '2.4.1',
  author: 'Alex Macksyn',
  description: 'Enhanced AI-powered interview system for Gist HQ with MongoDB persistence, admin tools, mandatory photo, flexible DOB, and conflict assessment',
  commands: [
    { name: 'interview', aliases: ['startinterview'], description: 'Manually start interview process' },
    { name: 'addquestion', description: 'Add new interview question (Admin only)' },
    { name: 'removequestion', description: 'Remove interview question (Admin only)' },
    { name: 'listquestions', description: 'View all interview questions (Admin only)' },
    { name: 'interviewsettings', description: 'Configure interview settings (Admin only)' },
    { name: 'interviewstats', description: 'View interview statistics (Admin only)' },
    { name: 'approveuser', description: 'Manually approve interview candidate (Admin only)' },
    { name: 'rejectuser', description: 'Manually reject interview candidate (Admin only)' },
    { name: 'setmaingroup', description: 'Set main group invite link (Admin only)' },
    { name: 'pendingreviews', description: 'View pending interview reviews (Admin only)' },
    { name: 'viewtranscript', description: 'View full transcript for a pending session (Admin only)' },
    { name: 'editevalprompt', description: 'Edit the AI evaluation prompt (Admin only)' },
    { name: 'resetquestions', description: 'Reset questions to defaults (Admin only)' },
    { name: 'cancelsession', description: 'Cancel an ongoing interview session (Admin only)' }
  ]
};

// Groq API configuration
const GROQ_CONFIG = {
  API_KEY: process.env.GROQ_API_KEY || '',
  BASE_URL: 'https://api.groq.com/openai/v1/chat/completions',
  MODEL: 'llama-3.3-70b-versatile',
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000
};

// Updated evaluation prompt
const DEFAULT_EVAL_PROMPT = `You are evaluating a candidate for "Gist HQ", a fun Nigerian WhatsApp community group focused on sharing good vibes, making friends, and helping each other.

INTERVIEW RESPONSES:
${'${responses}'}

EVALUATION CRITERIA:
1. Friendliness and positive attitude (20 points)
2. Genuine interest in community participation (20 points)
3. Respectful communication style (15 points)
4. Clear understanding of group purpose (15 points)
5. Likelihood to follow group rules (15 points)
6. Conflict resolution skills and non-violent temperament (15 points)
7. Age appropriateness (adult-like responses) (10 points)
8. Activity level and commitment to tasks/attendance (10 points)

RED FLAGS (automatic rejection):
- Disrespectful language or attitude
- Spam/promotional intent
- Inappropriate or offensive content
- Signs of aggression, violence, or hostility
- Likely underage (based on responses)
- Clear intent to break rules
- Unresponsive or evasive answers
- No photo provided (mandatory)

SCORING:
- 80-100: Excellent candidate (APPROVE)
- 60-79: Good candidate (APPROVE)
- 40-59: Average candidate (REVIEW - provide specific feedback)
- 0-39: Poor candidate (REJECT)

Return JSON:
{
  "decision": "APPROVE|REJECT|REVIEW",
  "score": 0-100,
  "feedback": "string (max 100 words)"
}`;

// Gist HQ Rules
const GHQ_RULES = `--++-- Welcome to Gist Headquarters! --++--
This group is A ꜰᴜɴ ᴘʟᴀᴄᴇ ᴛᴏ ꜱʜᴀʀᴇ ɢᴏᴏᴅ ᴠɪʙᴇꜱ, ᴍᴀᴋᴇ Nᴇᴡ Fʀɪᴇɴᴅꜱ ᴀɴᴅ ʜᴇʟᴘ ᴇᴀᴄʜ ᴏᴛʜᴇʀ.

*GHQ Rules*
1. *Respect and courtesy*: Treat others respectfully and kindly.
2. *Stay on topic*: Keep conversations relevant to the group's purpose.
3. *No spamming or Link-promotion*: No unsolicited links or ads without admin approval.
4. *No explicit or offensive content*: Avoid explicit material except on Freaky Fridays.
5. *No harassment or bullying*: Do not harass or intimidate members.
6. *Respect Members' Privacy*: Ask for consent before DMing.
7. *No Fighting & Insulting*: No insults or abusive words.
8. *Marking of Attendance*: Mark daily attendance or inform admins of absences.
9. *Do your Tasks*: Complete assigned tasks or face violation.
10. *Admin decisions are final*: Respect admin decisions.

*Consequences*
1. First offense: Warning
2. Second offense: Temporary removal (1-3 days)
3. Third offense: Permanent removal

*Reporting Issues*
Report violations to admins immediately.

*Admin Contact*
Contact *Admins* for concerns.

> By joining, you agree to these rules. 🖋️`;

// Default questions
const DEFAULT_QUESTIONS = [
  { id: 1, question: "What's your name and where are you from? Tell us a bit about yourself! 😊", required: true, category: "personal" },
  { id: 2, question: "Please upload a photo of yourself (mandatory for verification—send an image now!)", required: true, type: "photo", category: "personal" },
  { id: 3, question: "What's your date of birth? (Please provide day and month, e.g., 8/12 or 8th Dec. Year is optional.)", required: true, type: "dob", category: "personal" },
  { id: 4, question: "How did you hear about Gist HQ and what made you want to join?", required: true, category: "motivation" },
  { id: 5, question: "What kind of gist are you most interested in? Entertainment, business, tech, lifestyle, etc?", required: true, category: "interests" },
  { id: 6, question: "Are you here to share gist, learn, or just catch up?", required: true, category: "purpose" },
  { id: 7, question: "What's one interesting thing about yourself you'd like us to know?", required: false, category: "personal" },
  { id: 8, question: "How do you plan to contribute positively to Gist HQ?", required: true, category: "contribution" },
  { id: 9, question: "If a group member disagrees strongly, how would you handle it respectfully?", required: true, category: "conflict" },
  { id: 10, question: "Ever been in a heated group chat? What did you do, and what would you do differently?", required: true, category: "conflict" },
  { id: 11, question: "On a scale of 1-10, how patient are you with differing views? Give an example.", required: true, category: "conflict" },
  { id: 12, question: "What time zone are you in, and how often will you be active?", required: true, category: "activity" },
  { id: 13, question: "Been in other WhatsApp groups? What did you like/dislike, and how will it influence you here?", required: false, category: "experience" },
  { id: 14, question: "How do you feel about rules like no spamming or daily attendance?", required: true, category: "rules" },
  { id: 15, question: "Preferred way to communicate in groups—text, voice, memes, polls?", required: false, category: "communication" },
  { id: 16, question: "If someone breaks a rule, would you report, ignore, or confront? Why?", required: true, category: "responsibility" }
];

// MongoDB Collections
const COLLECTIONS = {
  sessions: 'interviewSessions',
  questions: 'interviewQuestions',
  settings: 'groupSettings',
  stats: 'interviewStats',
  evalPrompts: 'evaluationPrompts'
};

// In-memory storage
const interviewSessions = new Map();
const interviewQuestions = new Map();
const groupSettings = new Map();
const interviewStats = new Map();
const evalPrompts = new Map();

// Interview session structure
class InterviewSession {
  constructor(userId, groupId, userName) {
    this.userId = userId;
    this.groupId = groupId;
    this.userName = userName;
    this.displayName = '';
    this.dob = { day: null, month: null, year: null };
    this.photo = null;
    this.startTime = new Date();
    this.currentQuestion = 0;
    this.responses = [];
    this.followUpResponses = [];
    this.conversationHistory = [];
    this.status = 'active';
    this.remindersSent = 0;
    this.lastResponseTime = new Date();
    this.aiFollowUps = 0;
    this.rulesAcknowledged = false;
    this.score = 0;
    this.feedback = '';
    this.rulesAckAttempts = 0;
  }

  toDB() {
    return {
      ...this,
      startTime: this.startTime.toISOString(),
      lastResponseTime: this.lastResponseTime.toISOString(),
      conversationHistory: this.conversationHistory.slice(-10)
    };
  }

  static fromDB(obj) {
    const session = new InterviewSession(obj.userId, obj.groupId, obj.userName);
    Object.assign(session, obj);
    session.startTime = new Date(obj.startTime);
    session.lastResponseTime = new Date(obj.lastResponseTime);
    return session;
  }
}

// Group settings structure
class GroupSettings {
  constructor(groupId) {
    this.groupId = groupId;
    this.interviewGroupId = groupId;
    this.mainGroupLink = '';
    this.linkExpiryMinutes = 30;
    this.responseTimeoutMinutes = 10;
    this.reminderTimeoutMinutes = 5;
    this.maxReminders = 2;
    this.aiFollowUpEnabled = true;
    this.autoRemoveEnabled = true;
    this.adminIds = [];
    this.isActive = true;
    this.maxSessionAttempts = 3;
    this.sessionAttempts = new Map();
    this.rateLimits = { aiFollowUp: { calls: 5, windowMs: 60000 }, evaluation: { calls: 10, windowMs: 60000 } };
  }

  toDB() {
    return {
      ...this,
      sessionAttempts: Object.fromEntries(this.sessionAttempts)
    };
  }

  static fromDB(obj) {
    const settings = new GroupSettings(obj.groupId);
    Object.assign(settings, obj);
    settings.sessionAttempts = new Map(Object.entries(obj.sessionAttempts || {}));
    return settings;
  }
}

// AI Interview Engine
class AIInterviewEngine {
  constructor() {
    this.rateLimits = new Map();
  }

  isRateLimited(userId, type = 'aiFollowUp', groupId) {
    const settings = groupSettings.get(groupId);
    const limitConfig = settings?.rateLimits[type] || { calls: 5, windowMs: 60000 };
    const now = Date.now();
    const limit = this.rateLimits.get(`${userId}_${type}`) || { calls: 0, resetTime: now + limitConfig.windowMs };
    if (now > limit.resetTime) {
      limit.calls = 0;
      limit.resetTime = now + limitConfig.windowMs;
    }
    if (limit.calls >= limitConfig.calls) return true;
    limit.calls++;
    this.rateLimits.set(`${userId}_${type}`, limit);
    return false;
  }

  async retryAxiosRequest(config, retries = GROQ_CONFIG.RETRY_ATTEMPTS) {
    for (let i = 0; i < retries; i++) {
      try {
        return await axios(config);
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, GROQ_CONFIG.RETRY_DELAY_MS));
      }
    }
  }

  async generateFollowUp(question, userResponse, conversationHistory, userName, groupId) {
    if (this.isRateLimited('ai', 'aiFollowUp', groupId)) return null;

    try {
      const messages = [
        {
          role: 'system',
          content: `You are an intelligent interviewer for "Gist HQ". Ask thoughtful follow-up questions.

Rules:
1. Conversational, friendly, use ${userName}'s name
2. Use Nigerian expressions sparingly
3. ONE question, <100 characters
4. Relevant to response
5. Curious about background/interests
6. Avoid repetition

Original: "${question}"
Response: "${userResponse}"
User: ${userName}`
        },
        ...conversationHistory.slice(-4),
        { role: 'user', content: `Generate a follow-up question based on: "${userResponse}"` }
      ];

      const response = await this.retryAxiosRequest({
        method: 'post',
        url: GROQ_CONFIG.BASE_URL,
        data: {
          model: GROQ_CONFIG.MODEL,
          messages,
          temperature: 0.8,
          max_tokens: 100,
          top_p: 0.9
        },
        headers: {
          'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      return response.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      console.error('AI Follow-up Error:', error);
      return null;
    }
  }

  async parseDOB(userResponse, userName) {
    const dobRegex = /(?:(\d{1,2})[\/\-\s](?:\d{1,2}|\w+)(?:[\/\-\s](\d{4}))?)/i;
    const match = userResponse.match(dobRegex);
    if (match) {
      const [_, day, month, year] = match;
      const monthNum = isNaN(month) ? new Date(`${month} 1, 2000`).getMonth() + 1 : parseInt(month);
      if (day >= 1 && day <= 31 && monthNum >= 1 && monthNum <= 12) {
        return { day: parseInt(day), month: monthNum, year: year ? parseInt(year) : null };
      }
    }

    try {
      const messages = [
        {
          role: 'system',
          content: `Parse DOB from user response (day/month, year optional, e.g., "8/12", "8th Dec"). Return JSON: { day, month, year (null if not provided), clarification (if needed) }`
        },
        { role: 'user', content: `User: ${userName}\nResponse: "${userResponse}"` }
      ];

      const response = await this.retryAxiosRequest({
        method: 'post',
        url: GROQ_CONFIG.BASE_URL,
        data: {
          model: GROQ_CONFIG.MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 150
        },
        headers: {
          'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const result = JSON.parse(response.data?.choices?.[0]?.message?.content?.trim() || '{}');
      if (result.day && result.month) return result;
      return { day: null, month: null, year: null, clarification: result.clarification || 'Please provide DOB as day/month, e.g., 8/12 or 8th Dec.' };
    } catch (error) {
      console.error('DOB Parse Error:', error);
      return { day: null, month: null, year: null, clarification: 'Please provide DOB as day/month, e.g., 8/12 or 8th Dec.' };
    }
  }

  async evaluateInterview(session, customPrompt = '') {
    try {
      const responses = session.responses.map(r => `Q: ${r.question}\nA: ${r.answer}`).join('\n\n');
      const followUps = session.followUpResponses.map(f => `Follow-up: ${f.question}\nA: ${f.answer}`).join('\n\n');
      const photoInfo = session.photo ? `Photo provided: Yes` : `Photo provided: No (mandatory - red flag)`;

      const prompt = customPrompt || DEFAULT_EVAL_PROMPT.replace('${responses}', responses + (followUps ? '\n\n' + followUps : '') + `\n\n${photoInfo}`);

      const messages = [
        { role: 'system', content: 'You are a fair community moderator evaluating new members.' },
        { role: 'user', content: prompt }
      ];

      const response = await this.retryAxiosRequest({
        method: 'post',
        url: GROQ_CONFIG.BASE_URL,
        data: {
          model: GROQ_CONFIG.MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 200
        },
        headers: {
          'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      });

      const result = response.data?.choices?.[0]?.message?.content?.trim() || '{}';
      const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/) || [null, result];
      const evalResult = JSON.parse(jsonMatch[1] || result);
      return {
        decision: (evalResult.decision || 'REVIEW').toUpperCase(),
        score: parseInt(evalResult.score) || 50,
        feedback: (evalResult.feedback || 'No feedback provided').substring(0, 150)
      };
    } catch (error) {
      console.error('AI Evaluation Error:', error);
      return { decision: 'REVIEW', score: 50, feedback: 'Technical evaluation error' };
    }
  }
}

const aiEngine = new AIInterviewEngine();

// Timer management
const responseTimers = new Map();
const reminderTimers = new Map();

function setResponseTimer(userId, timeoutMs, callback) {
  clearResponseTimer(userId);
  responseTimers.set(userId, setTimeout(callback, timeoutMs));
}

function setReminderTimer(userId, timeoutMs, callback) {
  clearReminderTimer(userId);
  reminderTimers.set(userId, setTimeout(callback, timeoutMs));
}

function clearResponseTimer(userId) {
  if (responseTimers.has(userId)) {
    clearTimeout(responseTimers.get(userId));
    responseTimers.delete(userId);
  }
}

function clearReminderTimer(userId) {
  if (reminderTimers.has(userId)) {
    clearTimeout(reminderTimers.get(userId));
    reminderTimers.delete(userId);
  }
}

// MongoDB Helper Functions
async function saveSession(session) {
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.replaceOne({ userId: session.userId }, session.toDB(), { upsert: true });
  }, COLLECTIONS.sessions);
}

async function loadSession(userId) {
  const obj = await PluginHelpers.safeDBOperation(async (db, collection) => {
    return await collection.findOne({ userId });
  }, COLLECTIONS.sessions);
  if (obj) {
    const session = InterviewSession.fromDB(obj);
    interviewSessions.set(userId, session);
    return session;
  }
  return null;
}

async function deleteSession(userId) {
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.deleteOne({ userId });
  }, COLLECTIONS.sessions);
  interviewSessions.delete(userId);
  clearResponseTimer(userId);
  clearReminderTimer(userId);
}

async function initGroupSettings(groupId) {
  let settings = await PluginHelpers.safeDBOperation(async (db, collection) => {
    return await collection.findOne({ groupId });
  }, COLLECTIONS.settings);

  if (!settings) {
    settings = new GroupSettings(groupId);
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.insertOne(settings.toDB());
    }, COLLECTIONS.settings);
  } else {
    settings = GroupSettings.fromDB(settings);
  }
  groupSettings.set(groupId, settings);

  let questions = await PluginHelpers.safeDBOperation(async (db, collection) => {
    return await collection.findOne({ groupId });
  }, COLLECTIONS.questions);
  if (!questions || !questions.questions) {
    questions = { groupId, questions: [...DEFAULT_QUESTIONS] };
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.insertOne(questions);
    }, COLLECTIONS.questions);
  }
  interviewQuestions.set(groupId, questions.questions);

  let stats = await PluginHelpers.safeDBOperation(async (db, collection) => {
    return await collection.findOne({ groupId });
  }, COLLECTIONS.stats);
  if (!stats) {
    stats = { groupId, totalInterviews: 0, approved: 0, rejected: 0, autoRemoved: 0, pendingReviews: 0, averageScore: 0, averageDuration: 0 };
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.insertOne(stats);
    }, COLLECTIONS.stats);
  }
  interviewStats.set(groupId, stats);

  let prompt = await PluginHelpers.safeDBOperation(async (db, collection) => {
    return await collection.findOne({ groupId });
  }, COLLECTIONS.evalPrompts);
  if (!prompt) {
    prompt = { groupId, prompt: DEFAULT_EVAL_PROMPT };
    await PluginHelpers.safeDBOperation(async (db, collection) => {
      await collection.insertOne(prompt);
    }, COLLECTIONS.evalPrompts);
  }
  evalPrompts.set(groupId, prompt.prompt);

  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.deleteMany({ groupId, startTime: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  }, COLLECTIONS.sessions);

  return settings;
}

async function saveSettings(groupId, settings) {
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.replaceOne({ groupId }, settings.toDB());
  }, COLLECTIONS.settings);
}

async function saveQuestions(groupId, questions) {
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.updateOne({ groupId }, { $set: { questions } }, { upsert: true });
  }, COLLECTIONS.questions);
}

async function saveStats(groupId, stats) {
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.replaceOne({ groupId }, { groupId, ...stats });
  }, COLLECTIONS.stats);
}

async function saveEvalPrompt(groupId, prompt) {
  await PluginHelpers.safeDBOperation(async (db, collection) => {
    await collection.replaceOne({ groupId }, { groupId, prompt }, { upsert: true });
  }, COLLECTIONS.evalPrompts);
}

async function getPendingSessions(groupId) {
  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    return await collection.find({ groupId, status: 'pending_review' }).toArray();
  }, COLLECTIONS.sessions);
}

async function getActiveSessions(groupId) {
  return await PluginHelpers.safeDBOperation(async (db, collection) => {
    return await collection.find({ groupId, status: 'active' }).toArray();
  }, COLLECTIONS.sessions);
}

async function startInterview(userId, groupId, userName, sock) {
  const settings = await initGroupSettings(groupId);
  if (!settings.isActive) {
    await sock.sendMessage(groupId, { text: `⚠️ Interviews are currently disabled for this group.` });
    return;
  }

  const attemptsKey = `${groupId}_${userId}`;
  const attempts = settings.sessionAttempts.get(attemptsKey) || 0;
  if (attempts >= settings.maxSessionAttempts) {
    await sock.sendMessage(groupId, { text: `⚠️ ${userName}, you've reached the max interview attempts. Contact an admin!` });
    return;
  }
  settings.sessionAttempts.set(attemptsKey, attempts + 1);
  await saveSettings(groupId, settings);

  let session = interviewSessions.get(userId) || await loadSession(userId);
  if (session) {
    await sock.sendMessage(groupId, { text: `⚠️ ${userName}, you have an ongoing interview. Current: Question ${session.currentQuestion + 1}/${interviewQuestions.get(groupId).length}. Reply to continue!` });
    return;
  }

  session = new InterviewSession(userId, groupId, userName);
  interviewSessions.set(userId, session);
  await saveSession(session);

  const welcomeMsg = `🎉 *Welcome to Gist HQ Interview Room, ${userName}!* 🎉

So uhmm, ${userName}! 👋 I'm your friendly AI interviewer, here to gist with you before you join our main Gist HQ!

This is just 10-15 minutes stuff. Ready? So, let's start! 🚀

*Question 1/${interviewQuestions.get(groupId).length}:* What's your name and where are you from? Tell us a bit about yourself! 😊`;

  await sock.sendMessage(groupId, { text: welcomeMsg });

  const timeoutMs = settings.responseTimeoutMinutes * 60 * 1000;
  setResponseTimer(userId, timeoutMs, () => handleResponseTimeout(userId, sock));

  console.log(`✅ Interview started for ${userName} (${userId}) in group ${groupId}`);
}

async function handleInterviewResponse(session, userMessage, sock, isImage = false, imageData = null) {
  const settings = groupSettings.get(session.groupId);
  const questions = interviewQuestions.get(session.groupId) || DEFAULT_QUESTIONS;

  session.lastResponseTime = new Date();
  clearResponseTimer(session.userId);
  clearReminderTimer(session.userId);
  await saveSession(session);

  session.conversationHistory.push({
    role: 'user',
    content: isImage ? '[Image]' : userMessage,
    timestamp: new Date()
  });

  if (session.currentQuestion === 0 && !session.displayName && !isImage) {
    const nameMatch = userMessage.match(/name\s*(is|called)?\s*([A-Za-z\s]+)/i);
    session.displayName = nameMatch ? nameMatch[2].trim() : session.userName;
    await saveSession(session);
  }

  const currentQ = questions[session.currentQuestion];
  if (!currentQ) {
    await finishInterview(session, sock);
    return;
  }

  if (currentQ.type === 'photo') {
    if (isImage && imageData?.mimetype?.startsWith('image/')) {
      session.photo = { mimetype: imageData.mimetype, url: imageData.url || 'uploaded' };
      await saveSession(session);
    } else {
      const clarificationMsg = `${session.displayName}, please send a valid image (JPEG/PNG) for verification! 📸`;
      await sock.sendMessage(session.groupId, { text: clarificationMsg });
      setResponseTimer(session.userId, settings.responseTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(session.userId, sock));
      return;
    }
  }

  if (currentQ.type === 'dob' && !isImage) {
    const dobResult = await aiEngine.parseDOB(userMessage, session.displayName);
    if (dobResult.day && dobResult.month) {
      session.dob = { day: dobResult.day, month: dobResult.month, year: dobResult.year };
    } else {
      const clarificationMsg = `${session.displayName}, ${dobResult.clarification} Try again! 😊`;
      await sock.sendMessage(session.groupId, { text: clarificationMsg });
      await saveSession(session);
      setResponseTimer(session.userId, settings.responseTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(session.userId, sock));
      return;
    }
  }

  const isFollowUp = session.currentQuestion % 1 !== 0;
  const responsesArray = isFollowUp ? session.followUpResponses : session.responses;
  responsesArray.push({
    questionId: currentQ.id,
    question: currentQ.question,
    answer: isImage ? '[Image uploaded]' : userMessage,
    timestamp: new Date()
  });
  await saveSession(session);

  if (currentQ.type !== 'photo' && currentQ.type !== 'dob' && !isImage) {
    const shouldFollowUp = session.aiFollowUps < 2 && settings.aiFollowUpEnabled && userMessage.length > 10 && Math.random() > 0.5;
    if (shouldFollowUp) {
      const followUp = await aiEngine.generateFollowUp(currentQ.question, userMessage, session.conversationHistory, session.displayName, session.groupId);
      if (followUp) {
        const followUpMsg = `${session.displayName}, ${followUp} Wetin you think? 😊`;
        await sock.sendMessage(session.groupId, { text: followUpMsg });
        session.aiFollowUps++;
        session.currentQuestion += 0.1;
        await saveSession(session);
        setResponseTimer(session.userId, settings.responseTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(session.userId, sock));
        return;
      }
    }
  }

  session.currentQuestion = Math.floor(session.currentQuestion);
  session.currentQuestion++;

  if (session.currentQuestion === questions.length && !session.rulesAcknowledged) {
    await showRulesAndGuidelines(session, sock);
    return;
  }

  if (session.currentQuestion >= questions.length && session.rulesAcknowledged) {
    await finishInterview(session, sock);
    return;
  }

  const nextQuestion = questions[session.currentQuestion];
  if (nextQuestion) {
    const personalName = session.displayName || 'friend';
    const questionMsg = `*Question ${session.currentQuestion + 1}/${questions.length}:* ${nextQuestion.question}\n\nTake your time, ${personalName}! No wahala. 😊${nextQuestion.required ? '' : ' (Optional)'}`;
    await sock.sendMessage(session.groupId, { text: questionMsg });
    setResponseTimer(session.userId, settings.responseTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(session.userId, sock));
  }
}

async function showRulesAndGuidelines(session, sock) {
  const personalName = session.displayName || session.userName;
  const rulesMsg = `${GHQ_RULES}

📝 *Please confirm, ${personalName}:* Do you understand and agree to follow all these rules? (Reply with "Yes, I agree" or similar)`;

  await sock.sendMessage(session.groupId, { text: rulesMsg });
  setResponseTimer(session.userId, groupSettings.get(session.groupId).responseTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(session.userId, sock));
}

async function handleRulesAck(session, response, sock) {
  session.rulesAckAttempts++;
  if (session.rulesAckAttempts >= 3) {
    await removeUserFromInterview(session, 'Failed to acknowledge rules after multiple attempts', sock);
    return;
  }

  if (response.toLowerCase().includes('yes') && response.toLowerCase().includes('agree')) {
    session.rulesAcknowledged = true;
    await saveSession(session);
    const personalName = session.displayName || session.userName;
    await sock.sendMessage(session.groupId, { text: `✅ Thanks for agreeing, ${personalName}! Evaluating your responses... ⏳` });
    await finishInterview(session, sock);
  } else {
    await sock.sendMessage(session.groupId, {
      text: `❌ ${session.displayName || 'Hey'}, please reply with "Yes, I agree" to proceed. (Attempt ${session.rulesAckAttempts + 1}/3)`
    });
  }
}

async function handleResponseTimeout(userId, sock) {
  const session = interviewSessions.get(userId) || await loadSession(userId);
  if (!session || session.status !== 'active') return;

  const settings = groupSettings.get(session.groupId);
  session.remindersSent++;

  if (session.remindersSent <= settings.maxReminders) {
    const personalName = session.displayName || session.userName;
    const reminderMsg = session.remindersSent === 1
      ? `⏰ Hey ${personalName}! I'm waiting for your response. Reply to continue! 😊`
      : `⏰ Last reminder! Please respond or you'll be removed. 🙏`;

    await sock.sendMessage(session.groupId, { text: reminderMsg });
    setReminderTimer(userId, settings.reminderTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(userId, sock));
  } else {
    await removeUserFromInterview(session, 'No response after reminders', sock);
  }
}

async function finishInterview(session, sock) {
  if (!session.photo) {
    await sock.sendMessage(session.groupId, { text: `❌ ${session.displayName || session.userName}, photo is mandatory! Please upload it.` });
    return;
  }

  session.status = 'completed';
  await saveSession(session);

  const personalName = session.displayName || session.userName;
  await sock.sendMessage(session.groupId, { text: `✅ *Interview Complete!* Thanks ${personalName}! Evaluating responses... ⏳` });

  try {
    const customPrompt = evalPrompts.get(session.groupId);
    const evaluation = await aiEngine.evaluateInterview(session, customPrompt);
    session.score = evaluation.score;
    session.feedback = evaluation.feedback;
    await saveSession(session);

    if (evaluation.decision === 'APPROVE' && evaluation.score >= 60) {
      await approveUser(session, evaluation, sock);
    } else if (evaluation.decision === 'REJECT' || evaluation.score < 40) {
      await rejectUser(session, evaluation, sock);
    } else {
      session.status = 'pending_review';
      await saveSession(session);
      await updateStats(session.groupId, { pendingReviews: 1 }, session);
      await requestManualReview(session, evaluation, sock);
    }
  } catch (error) {
    console.error('Evaluation error:', error);
    session.status = 'pending_review';
    await saveSession(session);
    await requestManualReview(session, { score: 50, feedback: 'Technical evaluation error' }, sock);
    await sock.sendMessage(session.groupId, { text: `⚠️ An error occurred during evaluation. Admins have been notified for manual review.` });
  }
}

async function approveUser(session, evaluation, sock) {
  session.status = 'approved';
  await saveSession(session);
  const settings = groupSettings.get(session.groupId);
  await updateStats(session.groupId, { approved: 1 }, session);

  const personalName = session.displayName || session.userName;
  const approvalMsg = `🎉 *CONGRATULATIONS!* 🎉

Welcome to Gist HQ, ${personalName}! 🥳

You've passed the interview! Join our main group:

${settings.mainGroupLink || 'Link will be provided by admin'}

⚠️ Link expires in ${settings.linkExpiryMinutes} minutes.

Can't wait to see you, ${personalName}! 🚀`;

  await sock.sendMessage(session.groupId, { text: approvalMsg });
  setTimeout(() => deleteSession(session.userId), 10 * 60 * 1000);
}

async function rejectUser(session, evaluation, sock) {
  session.status = 'rejected';
  await saveSession(session);
  await updateStats(session.groupId, { rejected: 1 }, session);

  const personalName = session.displayName || session.userName;
  const rejectionMsg = `❌ *Interview Result*

Thanks for your interest, ${personalName}.

We won't be moving forward at this time.

${evaluation.feedback ? `Feedback: ${evaluation.feedback}` : ''}

Reapply later! Best wishes! 🙏`;

  await sock.sendMessage(session.groupId, { text: rejectionMsg });
  setTimeout(async () => {
    try {
      await sock.groupParticipantsUpdate(session.groupId, [session.userId], 'remove');
      console.log(`Removed rejected user: ${session.userName}`);
    } catch (error) {
      console.error('Failed to remove rejected user:', error);
    }
    await deleteSession(session.userId);
  }, 5 * 60 * 1000);
}

async function requestManualReview(session, evaluation, sock) {
  const personalName = session.displayName || session.userName;
  const reviewMsg = `🔍 *Manual Review Required*

Thanks ${personalName}! Your interview needs admin review.

Score: ${evaluation.score}/100
${evaluation.feedback ? `Feedback: ${evaluation.feedback}` : ''}

Please wait for admin response. ⏳`;

  await sock.sendMessage(session.groupId, { text: reviewMsg });
}

async function removeUserFromInterview(session, reason, sock) {
  session.status = 'failed';
  await saveSession(session);
  await updateStats(session.groupId, { autoRemoved: 1 }, session);

  const personalName = session.displayName || session.userName;
  const removalMsg = `⚠️ *Interview Timeout*

Sorry ${personalName}, removed due to: ${reason}

Rejoin to restart! 🔄`;

  await sock.sendMessage(session.groupId, { text: removalMsg });

  if (groupSettings.get(session.groupId)?.autoRemoveEnabled) {
    setTimeout(async () => {
      try {
        await sock.groupParticipantsUpdate(session.groupId, [session.userId], 'remove');
        console.log(`Auto-removed user: ${session.userName} - Reason: ${reason}`);
      } catch (error) {
        console.error('Failed to auto-remove user:', error);
      }
      await deleteSession(session.userId);
    }, 2000);
  }
}

async function updateStats(groupId, updates, session) {
  const stats = interviewStats.get(groupId) || {
    groupId,
    totalInterviews: 0,
    approved: 0,
    rejected: 0,
    autoRemoved: 0,
    pendingReviews: 0,
    averageScore: 0,
    averageDuration: 0
  };

  Object.keys(updates).forEach(key => {
    stats[key] = (stats[key] || 0) + updates[key];
  });
  stats.totalInterviews++;

  if (session) {
    stats.averageScore = ((stats.averageScore * (stats.totalInterviews - 1)) + (session.score || 0)) / stats.totalInterviews;
    const duration = (new Date() - new Date(session.startTime)) / (1000 * 60);
    stats.averageDuration = ((stats.averageDuration * (stats.totalInterviews - 1)) + duration) / stats.totalInterviews;
  }

  interviewStats.set(groupId, stats);
  await saveStats(groupId, stats);
}

function isAdmin(userId, groupId, config) {
  try {
    if (!userId || typeof userId !== 'string') return false;
    const cleanUserId = userId.replace('@s.whatsapp.net', '');

    if (config.OWNER_NUMBER && cleanUserId === config.OWNER_NUMBER.replace('@s.whatsapp.net', '')) return true;

    if (config.ADMIN_NUMBERS) {
      const adminNumbers = Array.isArray(config.ADMIN_NUMBERS)
        ? config.ADMIN_NUMBERS.map(num => String(num).replace('@s.whatsapp.net', ''))
        : config.ADMIN_NUMBERS.split(',').map(num => num.trim().replace('@s.whatsapp.net', ''));
      if (adminNumbers.includes(cleanUserId)) return true;
    }

    if (config.MODS && Array.isArray(config.MODS)) {
      const cleanMods = config.MODS.map(mod => String(mod).replace('@s.whatsapp.net', ''));
      if (cleanMods.includes(cleanUserId)) return true;
    }

    const settings = groupSettings.get(groupId);
    if (settings?.adminIds?.length > 0) {
      const cleanGroupAdmins = settings.adminIds.map(admin => String(admin).replace('@s.whatsapp.net', ''));
      if (cleanGroupAdmins.includes(cleanUserId)) return true;
    }

    return false;
  } catch (error) {
    console.error('isAdmin error:', error);
    return false;
  }
}

async function handleAdminCommand(command, args, m, sock, config, groupId) {
  const userId = m.sender;
  if (!isAdmin(userId, groupId, config)) {
    await sock.sendMessage(groupId, { text: `❌ This command is for admins only! 👮‍♀️` }, { quoted: m });
    return;
  }

  await initGroupSettings(groupId);
  const settings = groupSettings.get(groupId);
  const questions = interviewQuestions.get(groupId) || DEFAULT_QUESTIONS;

  switch (command.toLowerCase()) {
    case 'addquestion': {
      if (args.length < 3) {
        await sock.sendMessage(groupId, { text: `Usage: ${config.PREFIX}addquestion <category> <required:yes/no> <question>` }, { quoted: m });
        return;
      }
      const category = args[1].toLowerCase();
      const required = args[2].toLowerCase() === 'yes';
      const questionText = args.slice(3).join(' ');
      const newQuestion = { id: questions.length + 1, question: questionText, required, category };
      questions.push(newQuestion);
      await saveQuestions(groupId, questions);
      await sock.sendMessage(groupId, { text: `✅ Added question: "${questionText}" (ID: ${newQuestion.id})` }, { quoted: m });
      break;
    }

    case 'removequestion': {
      if (args.length < 2) {
        await sock.sendMessage(groupId, { text: `Usage: ${config.PREFIX}removequestion <question_id>` }, { quoted: m });
        return;
      }
      const id = parseInt(args[1]);
      const index = questions.findIndex(q => q.id === id);
      if (index === -1) {
        await sock.sendMessage(groupId, { text: `❌ Question ID ${id} not found!` }, { quoted: m });
        return;
      }
      const removed = questions.splice(index, 1)[0];
      await saveQuestions(groupId, questions);
      await sock.sendMessage(groupId, { text: `✅ Removed question ID ${id}: "${removed.question}"` }, { quoted: m });
      break;
    }

    case 'listquestions': {
      const questionList = questions.map(q => `ID: ${q.id} | ${q.question} | Required: ${q.required} | Category: ${q.category}`).join('\n');
      await sock.sendMessage(groupId, { text: `📋 *Questions*\n\n${questionList || 'No questions set.'}` }, { quoted: m });
      break;
    }

    case 'interviewsettings': {
      if (args.length < 3 || !['linkExpiry', 'responseTimeout', 'reminderTimeout', 'maxReminders', 'aiFollowUp', 'autoRemove'].includes(args[1])) {
        await sock.sendMessage(groupId, { text: `Usage: ${config.PREFIX}interviewsettings <setting> <value>\nOptions: linkExpiry, responseTimeout, reminderTimeout, maxReminders, aiFollowUp (on/off), autoRemove (on/off)` }, { quoted: m });
        return;
      }
      const setting = args[1];
      const value = args[2].toLowerCase();
      if (['linkExpiry', 'responseTimeout', 'reminderTimeout', 'maxReminders'].includes(setting)) {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          await sock.sendMessage(groupId, { text: `❌ Invalid number for ${setting}!` }, { quoted: m });
          return;
        }
        settings[`${setting}Minutes`] = num;
      } else {
        settings[setting + 'Enabled'] = value === 'on';
      }
      await saveSettings(groupId, settings);
      await sock.sendMessage(groupId, { text: `✅ Updated ${setting} to ${value}` }, { quoted: m });
      break;
    }

    case 'interviewstats': {
      const stats = interviewStats.get(groupId);
      const statsMsg = `📊 *Interview Stats*
Total Interviews: ${stats.totalInterviews}
Approved: ${stats.approved}
Rejected: ${stats.rejected}
Auto-Removed: ${stats.autoRemoved}
Pending Reviews: ${stats.pendingReviews}
Average Score: ${stats.averageScore.toFixed(2)}/100
Average Duration: ${stats.averageDuration.toFixed(2)} mins`;
      await sock.sendMessage(groupId, { text: statsMsg }, { quoted: m });
      break;
    }

    case 'approveuser': {
      if (args.length < 2) {
        await sock.sendMessage(groupId, { text: `Usage: ${config.PREFIX}approveuser <user_id>` }, { quoted: m });
        return;
      }
      const targetUserId = args[1].includes('@') ? args[1] : `${args[1]}@s.whatsapp.net`;
      const targetSession = await loadSession(targetUserId);
      if (!targetSession || targetSession.status !== 'pending_review') {
        await sock.sendMessage(groupId, { text: `❌ No pending session for user ${args[1]}!` }, { quoted: m });
        return;
      }
      await approveUser(targetSession, { score: targetSession.score, feedback: 'Manually approved by admin' }, sock);
      await sock.sendMessage(groupId, { text: `✅ Approved user ${targetSession.userName}` }, { quoted: m });
      break;
    }

    case 'rejectuser': {
      if (args.length < 2) {
        await sock.sendMessage(groupId, { text: `Usage: ${config.PREFIX}rejectuser <user_id>` }, { quoted: m });
        return;
      }
      const targetUserId = args[1].includes('@') ? args[1] : `${args[1]}@s.whatsapp.net`;
      const targetSession = await loadSession(targetUserId);
      if (!targetSession || targetSession.status !== 'pending_review') {
        await sock.sendMessage(groupId, { text: `❌ No pending session for user ${args[1]}!` }, { quoted: m });
        return;
      }
      await rejectUser(targetSession, { score: targetSession.score, feedback: 'Manually rejected by admin' }, sock);
      await sock.sendMessage(groupId, { text: `✅ Rejected user ${targetSession.userName}` }, { quoted: m });
      break;
    }

    case 'setmaingroup': {
      if (args.length < 2) {
        await sock.sendMessage(groupId, { text: `Usage: ${config.PREFIX}setmaingroup <link>` }, { quoted: m });
        return;
      }
      const link = args[1];
      if (!link.match(/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/)) {
        await sock.sendMessage(groupId, { text: `❌ Invalid WhatsApp group link!` }, { quoted: m });
        return;
      }
      settings.mainGroupLink = link;
      await saveSettings(groupId, settings);
      await sock.sendMessage(groupId, { text: `✅ Main group link set to: ${link}` }, { quoted: m });
      break;
    }

    case 'pendingreviews': {
      const pending = await getPendingSessions(groupId);
      const pendingList = pending.map(s => `${s.userName} (${s.userId}): Score ${s.score}/100`).join('\n');
      await sock.sendMessage(groupId, { text: `🔍 *Pending Reviews*\n\n${pendingList || 'No pending reviews.'}` }, { quoted: m });
      break;
    }

    case 'viewtranscript': {
      if (args.length < 2) {
        await sock.sendMessage(groupId, { text: `Usage: ${config.PREFIX}viewtranscript <user_id>` }, { quoted: m });
        return;
      }
      const targetUserId = args[1].includes('@') ? args[1] : `${args[1]}@s.whatsapp.net`;
      const targetSession = await loadSession(targetUserId);
      if (!targetSession) {
        await sock.sendMessage(groupId, { text: `❌ No session for user ${args[1]}!` }, { quoted: m });
        return;
      }
      let transcript = `📄 *Transcript for ${targetSession.userName}*\n\n`;
      targetSession.responses.forEach(r => {
        transcript += `Q${r.questionId}: ${r.question}\nA: ${r.answer}\n\n`;
      });
      targetSession.followUpResponses.forEach(f => {
        transcript += `FU: ${f.question}\nA: ${f.answer}\n\n`;
      });
      transcript += `Score: ${targetSession.score}/100\nFeedback: ${targetSession.feedback}\nPhoto: ${targetSession.photo ? 'Provided' : 'Not provided'}\nDOB: ${targetSession.dob.day}/${targetSession.dob.month || 'N/A'}/${targetSession.dob.year || 'N/A'}`;
      await sock.sendMessage(groupId, { text: transcript }, { quoted: m });
      break;
    }

    case 'editevalprompt': {
      if (args.length < 2) {
        await sock.sendMessage(groupId, { text: `Usage: ${config.PREFIX}editevalprompt <new_prompt>` }, { quoted: m });
        return;
      }
      const newPrompt = args.slice(1).join(' ');
      await saveEvalPrompt(groupId, newPrompt);
      evalPrompts.set(groupId, newPrompt);
      await sock.sendMessage(groupId, { text: `✅ Evaluation prompt updated.` }, { quoted: m });
      break;
    }

    case 'resetquestions': {
      await saveQuestions(groupId, [...DEFAULT_QUESTIONS]);
      interviewQuestions.set(groupId, [...DEFAULT_QUESTIONS]);
      await sock.sendMessage(groupId, { text: `✅ Questions reset to defaults.` }, { quoted: m });
      break;
    }

    case 'cancelsession': {
      if (args.length < 2) {
        await sock.sendMessage(groupId, { text: `Usage: ${config.PREFIX}cancelsession <user_id>` }, { quoted: m });
        return;
      }
      const targetUserId = args[1].includes('@') ? args[1] : `${args[1]}@s.whatsapp.net`;
      const targetSession = await loadSession(targetUserId);
      if (!targetSession || targetSession.status !== 'active') {
        await sock.sendMessage(groupId, { text: `❌ No active session for user ${args[1]}!` }, { quoted: m });
        return;
      }
      await removeUserFromInterview(targetSession, 'Session cancelled by admin', sock);
      await sock.sendMessage(groupId, { text: `✅ Cancelled session for ${targetSession.userName}` }, { quoted: m });
      break;
    }

    default:
      await sock.sendMessage(groupId, { text: `❌ Unknown admin command: ${command}` }, { quoted: m });
  }
}

// New function to handle new member events
export async function handleNewMember(userId, groupId, userName, sock, config) {
  try {
    if (userId === sock.user.id || isAdmin(userId, groupId, config)) return;
    console.log(`🎯 New member: ${userName} (${userId}) in group ${groupId}`);
    setTimeout(() => startInterview(userId, groupId, userName, sock), 2000);
  } catch (error) {
    console.error('handleNewMember error:', error);
    await sock.sendMessage(groupId, { text: `⚠️ Error processing new member ${userName}. Admins notified.` });
  }
}

export default async function autoInterviewHandler(m, sock, config) {
  try {
    if (!m.key.remoteJid.endsWith('@g.us')) return;

    const userId = m.key.participant || m.sender;
    const groupId = m.key.remoteJid;
    const userName = m.pushName || userId.split('@')[0];

    await initGroupSettings(groupId);
    const settings = groupSettings.get(groupId);

    if (m.key.fromMe === false && m.messageStubType === 26) {
      await handleNewMember(userId, groupId, userName, sock, config);
      return;
    }

    let session = interviewSessions.get(userId) || await loadSession(userId);
    if (session && session.status === 'active') {
      if (m.message?.conversation) {
        const userMessage = m.message.conversation.trim();
        if (!session.rulesAcknowledged && session.currentQuestion >= interviewQuestions.get(groupId).length) {
          await handleRulesAck(session, userMessage, sock);
          return;
        }
        await handleInterviewResponse(session, userMessage, sock);
        return;
      }

      if (m.message?.imageMessage && session.currentQuestion < interviewQuestions.get(groupId).length) {
        const currentQ = interviewQuestions.get(groupId)[session.currentQuestion];
        if (currentQ.type === 'photo') {
          await handleInterviewResponse(session, '[Image]', sock, true, {
            mimetype: m.message.imageMessage.mimetype,
            url: m.message.imageMessage.url
          });
          return;
        }
      }
    }

    if (m.message?.conversation?.startsWith(config.PREFIX)) {
      const [command, ...args] = m.message.conversation.slice(config.PREFIX.length).trim().split(/\s+/);
      const cmd = command.toLowerCase();
      const validCommands = info.commands.map(c => c.name).concat(info.commands.flatMap(c => c.aliases || []));

      if (cmd === 'interview' || cmd === 'startinterview') {
        session = interviewSessions.get(userId) || await loadSession(userId);
        if (session) {
          await sock.sendMessage(groupId, { text: `⚠️ Active interview session exists! Current: Question ${session.currentQuestion + 1}/${interviewQuestions.get(groupId).length}` }, { quoted: m });
          return;
        }
        await startInterview(userId, groupId, userName, sock);
        return;
      }

      if (validCommands.includes(cmd)) {
        await handleAdminCommand(cmd, args, m, sock, config, groupId);
        return;
      }
    }
  } catch (error) {
    console.error('Auto Interview Error:', error);
    await sock.sendMessage(groupId, { text: `⚠️ An error occurred. Admins have been notified.` });
    clearResponseTimer(userId);
    clearReminderTimer(userId);
  }
}
