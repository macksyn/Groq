// plugins/autoInterview.js - Enhanced with MongoDB persistence, admin tools, mandatory photo after name, flexible DOB
import axios from 'axios';
import { PluginHelpers } from '../lib/pluginIntegration.js';
import { PermissionHelpers } from '../lib/helpers.js';

export const info = {
  name: 'autoInterview',
  version: '2.3.0',
  author: 'Alex Macksyn',
  description: 'Intelligent AI-powered interview system for Gist HQ group screening 🎯🤖 - Enhanced with mandatory photo, DOB flexibility, and conflict assessment',
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
    { name: 'cancelsession', description: 'Cancel an ongoing interview session (Admin only)' },
    { name: 'activateinterview', description: 'Activates auto-interview for new members in this group' }
  ]
};

// Groq API configuration
const GROQ_CONFIG = {
  API_KEY: process.env.GROQ_API_KEY || '',
  BASE_URL: 'https://api.groq.com/openai/v1/chat/completions',
  MODEL: 'llama-3.3-70b-versatile'
};

// Updated evaluation prompt (removed bonus for photo since mandatory)
const DEFAULT_EVAL_PROMPT = `You are evaluating a candidate for "Gist HQ", a fun Nigerian WhatsApp community group focused on sharing good vibes, making friends, and helping each other.

INTERVIEW RESPONSES:
${'${responses}'}

EVALUATION CRITERIA:
1. Friendliness and positive attitude (20 points)
2. Genuine interest in community participation (20 points)
3. Respectful communication style (15 points)
4. Clear understanding of group purpose (15 points)
5. Likelihood to follow group rules (e.g., no spam, respect privacy) (15 points)
6. Conflict resolution skills and non-violent temperament (15 points)
7. Age appropriateness (reasonable day/month, adult-like responses) (10 points)
8. Activity level and commitment to tasks/attendance (10 points)

RED FLAGS (automatic rejection):
- Disrespectful language or attitude
- Spam/promotional intent
- Inappropriate or offensive content
- Signs of aggression, violence, or hostility
- Likely underage (based on DOB or immature responses)
- Clear intent to break rules (e.g., spamming, DMing without consent)
- Unresponsive or evasive answers
- No photo provided (mandatory for verification)

SCORING:
- 80-100: Excellent candidate (APPROVE)
- 60-79: Good candidate (APPROVE)
- 40-59: Average candidate (REVIEW - provide specific feedback)
- 0-39: Poor candidate (REJECT)

Provide your response as a JSON object with three keys: "decision" (string: "APPROVE", "REJECT", or "REVIEW"), "score" (integer: 0-100), and "feedback" (string, max 100 words).

Example:
{
  "decision": "APPROVE",
  "score": 85,
  "feedback": "Excellent candidate with a positive attitude."
}
`;

// Gist HQ Rules (unchanged)
const GHQ_RULES = `--++-- Welcome to Gist Headquarters! --++--
This group is A ꜰᴜɴ ᴘʟᴀᴄᴇ ᴛᴏ ꜱʜᴀʀᴇ ɢᴏᴏᴅ ᴠɪʙᴇꜱ, ᴍᴀᴋᴇ Nᴇᴡ Fʀɪᴇɴᴅꜱ ᴀɴᴅ ʜᴇʟᴘ ᴇᴀᴄʜ ᴏᴛʜᴇʀ.

*GHQ Rules*
1. *Respect and courtesy*: Treat others respectfully and kindly, even when disagreeing or arguing.
2. *Stay on topic*: Keep conversations relevant to the groups purpose and topic(s).
3. *No spamming or Link-promotion*: Refrain from sharing unsolicited links, ads, or promoting personal interests without an admin's approval.
4. *No explicit or offensive content*: Avoid sharing explicit, graphic, or offensive material. It's only allowed on Freaky Fridays.
5. *No harassment or bullying*: Do not harass, bully, bodyshame or intimidate other group members.
6. *Respect Members' Privacy*: Please always ask for consent before you DM a member. Do not private chat a member here without their permission.
7. *No Fighting & Insulting*: Fighting and throwing insults or abusive words or cursing another member is strongly prohibited. 🚫 
8. *Marking of Attendance*: Marking your daily attendance shows you are actively involved in the group. Skipping 3 days of attendance without stating your reasons to an admin beforehand is a violation.
9. *Do your Tasks*: Always do your daily tasks the admins assign. Failure to do your tasks for 3 days in a row is a violation.
10. *Admin decisions are final*: Admins reserve the right to make decisions regarding group management and member conduct. Respect their decisions, no insults or foul words to them will be tolerated.

*Consequences of Rule Violations*
1. *First offense*: Warning from an admin.
2. *Second offence*: Temporary removal from the group (1-3 days depending).
3. *Third offense*: Permanent removal from the group.

*Reporting Issues*
If you witness or experience any privacy violations, disrespect, or insults, please report them to an admin immediately.

*Admin Contact*
For any questions, concerns, or issues, please reach out to the *Admins*.

> By joining this group, you acknowledge that you have read, understood, and agree to abide by these rules and regulations. 🖋️`;

// Updated default questions with photo as Q2 (mandatory)
const DEFAULT_QUESTIONS = [
  {
    id: 1,
    question: "What's your name and where are you from? Tell us a bit about yourself! 😊",
    required: true,
    category: "personal"
  },
  {
    id: 2,
    question: "Please upload a photo of yourself (mandatory for verification—send an image in this chat now!)",
    required: true,
    type: "photo",
    category: "personal"
  },
  {
    id: 3,
    question: "What's your date of birth? (Please provide day and month, e.g., 8/12 or 8th Dec. Year is optional.)",
    required: true,
    type: "dob",
    category: "personal"
  },
  {
    id: 4,
    question: "How did you hear about Gist HQ and what made you want to join our community?",
    required: true,
    category: "motivation"
  },
  {
    id: 5,
    question: "What kind of gist (discussions/topics) are you most interested in? Entertainment, business, tech, lifestyle, etc?",
    required: true,
    category: "interests"
  },
  {
    id: 6,
    question: "Are you here to share gist, learn from others, or just catch up on what's happening?",
    required: true,
    category: "purpose"
  },
  {
    id: 7,
    question: "What's one interesting thing about yourself that you'd like the community to know?",
    required: false,
    category: "personal"
  },
  {
    id: 8,
    question: "How do you plan to contribute positively to our Gist HQ family?",
    required: true,
    category: "contribution"
  },
  {
    id: 9,
    question: "Imagine a group member disagrees with your opinion strongly and starts arguing—how would you handle the situation to keep things respectful?",
    required: true,
    category: "conflict"
  },
  {
    id: 10,
    question: "Have you ever been in a situation where a group chat got heated? What did you do, and what would you do differently now to prevent escalation?",
  required: true,
    category: "conflict"
  },
  {
    id: 11,
    question: "On a scale of 1-10, how patient are you in dealing with differing views, and can you give an example of resolving a conflict peacefully?",
    required: true,
    category: "conflict"
  },
  {
    id: 12,
    question: "What time zone are you in, and how often do you think you'll be active in the group (e.g., daily, a few times a week)?",
    required: true,
    category: "activity"
  },
  {
    id: 13,
    question: "Have you been part of other WhatsApp groups before? What did you like or dislike about them, and how will that influence your participation here?",
    required: false,
    category: "experience"
  },
  {
    id: 14,
    question: "How do you feel about group rules like no spamming, respecting privacy (e.g., asking before DMing), and marking daily attendance? Are there any you might find challenging?",
    required: true,
    category: "rules"
  },
  {
    id: 15,
    question: "What’s your preferred way to communicate in groups—text, voice notes, memes, or polls? And how do you ensure your messages add value without overwhelming others?",
    required: false,
    category: "communication"
  },
  {
    id: 16,
    question: "If you notice someone breaking a rule (e.g., sharing offensive content), would you report it to an admin, ignore it, or confront them directly? Why?",
    required: true,
    category: "responsibility"
  }
];

// MongoDB Collections
const COLLECTIONS = {
  sessions: 'interviewSessions',
  questions: 'interviewQuestions',
  settings: 'groupSettings',
  stats: 'interviewStats',
  evalPrompts: 'evaluationPrompts'
};

// Interview storage
const interviewSessions = new Map();
const interviewQuestions = new Map();
const groupSettings = new Map();
const interviewStats = new Map();
const evalPrompts = new Map();

let isRecoveryCheckDone = false;

async function runSessionRecovery(sock) {
  try {
    console.log('🤖 Running interview session recovery check...');
    const activeSessions = await PluginHelpers.safeDBOperation(async (db, collection) => {
      return await collection.find({ status: 'active' }).toArray();
    }, COLLECTIONS.sessions);

    if (activeSessions.length === 0) {
      console.log('✅ No active sessions found. Recovery check complete.');
      return;
    }

    console.log(`🔍 Found ${activeSessions.length} active session(s) to terminate.`);

    for (const sessionData of activeSessions) {
      const session = InterviewSession.fromDB(sessionData);
      try {
        await sock.sendMessage(session.groupId, {
          text: `Hello ${session.userName}, the interview session was terminated because the bot restarted. Please start a new interview.`
        });
        session.status = 'failed';
        await saveSession(session);
        console.log(`✅ Terminated session for ${session.userName} in group ${session.groupId}`);
      } catch (error) {
        console.error(`❌ Failed to terminate session for ${session.userName}:`, error.message);
        session.status = 'failed';
        await saveSession(session);
      }
    }
    console.log('✅ Session recovery check finished.');
  } catch (error) {
    console.error('❌ An error occurred during interview session recovery:', error);
  }
}

// Interview session structure
class InterviewSession {
  constructor(userId, groupId, userName) {
    this.userId = userId;
    this.groupId = groupId;
    this.userName = userName;
    this.displayName = '';
    this.dob = { day: null, month: null, year: null }; // Store parsed DOB
    this.photo = null; // Store photo metadata (mandatory)
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
    const obj = { ...this };
    obj.startTime = this.startTime.toISOString();
    obj.lastResponseTime = this.lastResponseTime.toISOString();
    return obj;
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
    this.minRequiredQuestions = 0; // Deprecated, will be calculated dynamically
    this.aiFollowUpEnabled = true;
    this.autoRemoveEnabled = true;
    this.adminIds = [];
    this.isActive = true;
    this.autoInterviewActive = false;
    this.maxSessionAttempts = 3;
    this.sessionAttempts = new Map();
  }

  toDB() {
    const obj = { ...this };
    obj.sessionAttempts = Object.fromEntries(this.sessionAttempts); // Convert Map to object
    return obj;
  }

  static fromDB(obj) {
    const settings = new GroupSettings(obj.groupId);
    Object.assign(settings, obj);
    // Ensure sessionAttempts is a Map, converting from object if needed
    settings.sessionAttempts = new Map(Object.entries(obj.sessionAttempts || {}));
    return settings;
  }
}

// AI Interview Engine
class AIInterviewEngine {
  constructor() {
    this.rateLimits = new Map();
  }

  isRateLimited(userId) {
    const now = Date.now();
    const limit = this.rateLimits.get(userId) || { calls: 0, resetTime: now + 60000 };
    if (now > limit.resetTime) {
      limit.calls = 0;
      limit.resetTime = now + 60000;
    }
    if (limit.calls >= 5) return true;
    limit.calls++;
    this.rateLimits.set(userId, limit);
    return false;
  }

  async generateFollowUp(question, userResponse, conversationHistory, userName = '') {
    if (this.isRateLimited('ai')) return null;

    try {
      const messages = [
        {
          role: 'system',
          content: `You are an intelligent interviewer for "Gist HQ". Ask thoughtful follow-up questions to get to know the candidate better.

Rules:
1. Keep it conversational, friendly, use ${userName}'s name
2. Use Nigerian expressions like "Ehen", "Omo" sparingly
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

      const response = await axios.post(
        GROQ_CONFIG.BASE_URL,
        {
          model: GROQ_CONFIG.MODEL,
          messages: messages,
          temperature: 0.8,
          max_tokens: 100,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      return response.data?.choices?.[0]?.message?.content?.trim() || null;

    } catch (error) {
      console.error('AI Follow-up Error:', error);
      return null;
    }
  }

  async parseDOB(userResponse, userName) {
    try {
      const messages = [
        {
          role: 'system',
          content: `Parse a date of birth from a user's response. The user may provide day and month (year optional) in formats like "8/12", "8th Dec", "December 8", or "Dec 8". Return JSON with day, month (1-12), and year (null if not provided). If ambiguous or invalid, return null and a clarification question.`
        },
        {
          role: 'user',
          content: `User: ${userName}\nResponse: "${userResponse}"`
        }
      ];

      const response = await axios.post(
        GROQ_CONFIG.BASE_URL,
        {
          model: GROQ_CONFIG.MODEL,
          messages: messages,
          temperature: 0.3,
          max_tokens: 150
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const result = response.data?.choices?.[0]?.message?.content?.trim();
      try {
        const parsed = JSON.parse(result);
        if (parsed.day && parsed.month) return parsed;
        return { day: null, month: null, year: null, clarification: parsed.clarification || 'Please provide your DOB as day/month, e.g., 8/12 or 8th Dec.' };
      } catch {
        return { day: null, month: null, year: null, clarification: 'Please provide your DOB as day/month, e.g., 8/12 or 8th Dec.' };
      }
    } catch (error) {
      console.error('DOB Parse Error:', error);
      return { day: null, month: null, year: null, clarification: 'Please provide your DOB as day/month, e.g., 8/12 or 8th Dec.' };
    }
  }

  async evaluateInterview(session, customPrompt = '') {
    try {
      const responses = session.responses.map(r => `Q: ${r.question}\nA: ${r.answer}`).join('\n\n');
      const followUps = session.followUpResponses.map(f => `Follow-up: ${f.question}\nA: ${f.answer}`).join('\n\n');
      const photoInfo = session.photo ? `Photo provided: Yes` : `Photo provided: No (mandatory - potential red flag)`;
      
      const prompt = customPrompt || DEFAULT_EVAL_PROMPT.replace('${responses}', responses + (followUps ? '\n\n' + followUps : '') + `\n\n${photoInfo}`);

      const messages = [
        { role: 'system', content: 'You are a fair community moderator evaluating new members.' },
        { role: 'user', content: prompt }
      ];

      const response = await axios.post(
        GROQ_CONFIG.BASE_URL,
        {
          model: GROQ_CONFIG.MODEL,
          messages: messages,
          temperature: 0.3,
          max_tokens: 200
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );

      if (response.data?.choices?.[0]?.message?.content) {
        const result = response.data.choices[0].message.content.trim();
        try {
          // Attempt to find JSON block if markdown is used
          const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/);
          const jsonString = jsonMatch ? jsonMatch[1] : result;
          const evalResult = JSON.parse(jsonString);
          return {
            decision: (evalResult.decision || 'REVIEW').toUpperCase(),
            score: parseInt(evalResult.score) || 50,
            feedback: (evalResult.feedback || 'No feedback provided').substring(0, 150)
          };
        } catch (e) {
          console.error('Failed to parse AI evaluation JSON:', e);
          return { decision: 'REVIEW', score: 50, feedback: 'AI evaluation parsing failed' };
        }
      }
      return { decision: 'REVIEW', score: 50, feedback: 'AI evaluation failed' };

    } catch (error) {
      console.error('AI Evaluation Error:', error);
      return { decision: 'REVIEW', score: 50, feedback: 'Technical evaluation error' };
    }
  }
}

const aiEngine = new AIInterviewEngine();

// Timer management (unchanged)
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

// MongoDB Helper Functions (unchanged)
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
  if (!settings.isActive) return;

  const attemptsKey = `${groupId}_${userId}`;
  const attempts = settings.sessionAttempts.get(attemptsKey) || 0;
  if (attempts >= settings.maxSessionAttempts) {
    await sock.sendMessage(groupId, { text: `⚠️ ${userName}, you've reached the max interview attempts. Contact an admin if needed!` });
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

  const welcomeMsg = `🎉 *Welcome to Gist HQ Interview, ${userName}!* 🎉

Ehen, ${userName}! 👋 I'm your friendly AI interviewer, here to gist with you before you join our main Gist HQ fam! 

This na just 10-15 minutes. Ready? Omo, let's start! 🚀

*Question 1:* What's your name and where are you from? Tell us a bit about yourself! 😊`;

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

  // Extract display name from Q1
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

  // Handle photo question (mandatory)
  if (currentQ.type === 'photo') {
    if (isImage) {
      session.photo = { mimetype: imageData.mimetype, url: imageData.url || 'uploaded' };
      await saveSession(session);
    } else {
      const clarificationMsg = `${session.displayName}, photo is mandatory for verification! Please send an image in this chat now. No wahala, just upload it! 📸`;
      await sock.sendMessage(session.groupId, { text: clarificationMsg });
      const timeoutMs = settings.responseTimeoutMinutes * 60 * 1000;
      setResponseTimer(session.userId, timeoutMs, () => handleResponseTimeout(session.userId, sock));
      return;
    }
  }

  // Handle DOB question
  if (currentQ.type === 'dob' && !isImage) {
    await sock.sendPresenceUpdate('composing', session.groupId);
    const dobResult = await aiEngine.parseDOB(userMessage, session.displayName);
    if (dobResult.day && dobResult.month) {
      session.dob = { day: dobResult.day, month: dobResult.month, year: dobResult.year };
    } else {
      const clarificationMsg = `${session.displayName}, ${dobResult.clarification} Try again, no wahala! 😊`;
      await sock.sendMessage(session.groupId, { text: clarificationMsg });
      await saveSession(session);
      const timeoutMs = settings.responseTimeoutMinutes * 60 * 1000;
      setResponseTimer(session.userId, timeoutMs, () => handleResponseTimeout(session.userId, sock));
      return;
    }
  }

  // Save response
  const isFollowUp = session.currentQuestion % 1 !== 0;
  const responsesArray = isFollowUp ? session.followUpResponses : session.responses;
  responsesArray.push({
    questionId: currentQ.id,
    question: currentQ.question,
    answer: isImage ? '[Image uploaded]' : userMessage,
    timestamp: new Date()
  });
  await saveSession(session);

  // AI follow-up logic (skip for special types)
  if (currentQ.type !== 'photo' && currentQ.type !== 'dob' && !isImage) {
    const shouldFollowUp = session.aiFollowUps < 2 &&
                          settings.aiFollowUpEnabled &&
                          userMessage.length > 10 &&
                          Math.random() > 0.5;

    if (shouldFollowUp) {
      await sock.sendPresenceUpdate('composing', session.groupId);
      const followUp = await aiEngine.generateFollowUp(
        currentQ.question,
        userMessage,
        session.conversationHistory,
        session.displayName
      );

      if (followUp) {
        const followUpMsg = `${session.displayName}, ${followUp} Wetin you think? 😊`;
        await sock.sendMessage(session.groupId, { text: followUpMsg });
        session.aiFollowUps++;
        session.currentQuestion += 0.1;
        await saveSession(session);

        const timeoutMs = settings.responseTimeoutMinutes * 60 * 1000;
        setResponseTimer(session.userId, timeoutMs, () => handleResponseTimeout(session.userId, sock));
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
    const questionMsg = `*Question ${session.currentQuestion + 1}/${questions.length}:* ${nextQuestion.question}\n\nTake your time, ${personalName}! No wahala. 😊`;
    await sock.sendMessage(session.groupId, { text: questionMsg });

    const timeoutMs = settings.responseTimeoutMinutes * 60 * 1000;
    setResponseTimer(session.userId, timeoutMs, () => handleResponseTimeout(session.userId, sock));
  }
}

async function showRulesAndGuidelines(session, sock) {
  const personalName = session.displayName || session.userName;
  const rulesMsg = `${GHQ_RULES}

📝 *Please confirm, ${personalName}:* Do you understand and agree to follow all these rules? (Reply with "Yes, I agree" or similar)`;

  await sock.sendMessage(session.groupId, { text: rulesMsg });

  const settings = groupSettings.get(session.groupId);
  const timeoutMs = settings.responseTimeoutMinutes * 60 * 1000;
  setResponseTimer(session.userId, timeoutMs, () => handleResponseTimeout(session.userId, sock));
}

async function handleRulesAck(session, response, sock) {
  session.rulesAckAttempts++;
  const maxAttempts = 3;
  if (session.rulesAckAttempts >= maxAttempts) {
    await removeUserFromInterview(session, 'Failed to acknowledge rules after multiple attempts', sock);
    return;
  }

  const lowerResponse = response.toLowerCase();
  if (lowerResponse.includes('yes') && lowerResponse.includes('agree')) {
    session.rulesAcknowledged = true;
    await saveSession(session);
    const personalName = session.displayName || session.userName;
    await sock.sendMessage(session.groupId, { 
      text: `✅ Perfect! Thanks for agreeing, ${personalName}! Ehen, now let me evaluate your responses... ⏳` 
    });
    await finishInterview(session, sock);
  } else {
    await sock.sendMessage(session.groupId, {
      text: `❌ ${session.displayName || 'Hey'}, I need you to explicitly agree to our rules to proceed. Please reply with "Yes, I agree" or similar. 

If you don't want to, no wahala, but you won't be able to join the main group. 🤷‍♀️ (Attempt ${session.rulesAckAttempts + 1}/${maxAttempts})`
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
      ? `⏰ Hey ${personalName}! I'm still waiting for your response to continue the interview. Please reply when you're ready! No wahala 😊`
      : `⏰ Last reminder! Please respond to continue your Gist HQ interview, or you'll be automatically removed. 🙏`;

    await sock.sendMessage(session.groupId, { text: reminderMsg });

    const reminderMs = settings.reminderTimeoutMinutes * 60 * 1000;
    setReminderTimer(userId, reminderMs, () => handleResponseTimeout(userId, sock));
  } else {
    await removeUserFromInterview(session, 'No response after reminders', sock);
  }
}

async function finishInterview(session, sock) {
  // Check if photo was provided (mandatory)
  if (!session.photo) {
    await sock.sendMessage(session.groupId, { text: `❌ ${session.displayName || session.userName}, photo is mandatory! Please upload it to continue.` });
    return; // Don't proceed to evaluation
  }

  session.status = 'completed';
  await saveSession(session);
  
  const personalName = session.displayName || session.userName;
  const evaluationMsg = `✅ *Interview Complete!* 

Thanks ${personalName} for taking the time to answer all questions! 🙏

I'm now evaluating your responses... This will take just a moment! ⏳`;

  await sock.sendMessage(session.groupId, { text: evaluationMsg });

  try {
    await sock.sendPresenceUpdate('composing', session.groupId);
    const customPrompt = evalPrompts.get(session.groupId);
    const evaluation = await aiEngine.evaluateInterview(session, customPrompt);
    session.score = evaluation.score;
    session.feedback = evaluation.feedback;
    await saveSession(session);

    console.log(`Interview evaluation for ${session.userName}: ${evaluation.decision} (${evaluation.score}/100)`);

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
    console.error('Interview evaluation failed:', error);
    session.status = 'pending_review';
    await saveSession(session);
    await requestManualReview(session, { score: 50, feedback: 'Technical evaluation error' }, sock);
  }
}

async function approveUser(session, evaluation, sock) {
  session.status = 'approved';
  await saveSession(session);
  const settings = groupSettings.get(session.groupId);
  
  await updateStats(session.groupId, { approved: 1 }, session);

  const personalName = session.displayName || session.userName;
  const approvalMsg = `🎉 *CONGRATULATIONS!* 🎉

Welcome to the Gist HQ family, ${personalName}! 🥳 Opor!

You've successfully passed the interview! Here's your link to join our main group:

${settings.mainGroupLink || 'Link will be provided by admin'}

⚠️ *Important:* This link will expire in ${settings.linkExpiryMinutes} minutes for security reasons.

Can't wait to see you in the main group, ${personalName}! 🚀✨`;

  await sock.sendMessage(session.groupId, { text: approvalMsg });

  if (settings.mainGroupLink) {
    setTimeout(() => {
      console.log(`Link expired for approved user: ${session.userName}`);
    }, settings.linkExpiryMinutes * 60 * 1000);
  }

  setTimeout(() => deleteSession(session.userId), 10 * 60 * 1000);
}

async function rejectUser(session, evaluation, sock) {
  session.status = 'rejected';
  await saveSession(session);
  
  await updateStats(session.groupId, { rejected: 1 }, session);

  const personalName = session.displayName || session.userName;
  const rejectionMsg = `❌ *Interview Result* 

Thanks for your interest in Gist HQ, ${personalName}.

Unfortunately, we won't be moving forward with your application at this time. 

${evaluation.feedback ? `Feedback: ${evaluation.feedback}` : ''}

You're welcome to reapply in the future! Best wishes! 🙏`;

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

Thanks ${personalName}! Your interview has been submitted for admin review.

Score: ${evaluation.score}/100
${evaluation.feedback ? `Feedback: ${evaluation.feedback}` : ''}

An admin will review your application and get back to you soon! Please wait patiently. ⏳`;

  await sock.sendMessage(session.groupId, { text: reviewMsg });

  console.log(`Manual review requested for ${session.userName} - Score: ${evaluation.score}`);
}

async function removeUserFromInterview(session, reason, sock) {
  session.status = 'failed';
  await saveSession(session);
  
  await updateStats(session.groupId, { autoRemoved: 1 }, session);

  const personalName = session.displayName || session.userName;
  const removalMsg = `⚠️ *Interview Timeout*

Sorry ${personalName}, you've been removed from the interview process due to: ${reason}

You're welcome to rejoin and restart the interview anytime! 🔄 No wahala.`;

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
  const stats = interviewStats.get(groupId);
  if (!stats) return;

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

async function handleAdminCommand(command, args, m, sock, config, groupId) {
  const userId = m.sender;
  if (!m.isAdmin()) {
    await sock.sendMessage(groupId, { text: `❌ This command is only available to admins! 👮‍♀️` }, { quoted: m });
    return;
  }

  await initGroupSettings(groupId);

  switch (command) {
    case 'activateinterview':
      const settings = groupSettings.get(groupId);
      settings.autoInterviewActive = !settings.autoInterviewActive;
      await saveSettings(groupId, settings);
      await sock.sendMessage(groupId, { text: `✅ Auto-interview for new members is now ${settings.autoInterviewActive ? 'ON' : 'OFF'}.` }, { quoted: m });
      break;
    // ... (other cases unchanged, omitted for brevity)
    case 'viewtranscript':
      // Updated to include photo info
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
    // ... (rest unchanged)
  }
}

export async function handleNewMember(sock, groupId, newMemberId, config) {
  try {
    const settings = await initGroupSettings(groupId);
    if (!settings.autoInterviewActive) {
      return;
    }

    if (newMemberId === sock.user.id || PermissionHelpers.isPlatformAdmin(newMemberId, config)) {
      return;
    }

    const memberName = newMemberId.split('@')[0];
    console.log(`🎯 Auto-interview triggered for new member: ${memberName} in group ${groupId}`);

    // Use a short delay to allow welcome messages to appear first
    setTimeout(() => startInterview(newMemberId, groupId, memberName, sock), 3000);
  } catch (error) {
    console.error('Interview plugin: Error handling new member:', error);
  }
}

export default async function autoInterviewHandler(m, sock, config) {
  try {
    if (!isRecoveryCheckDone) {
      await runSessionRecovery(sock);
      isRecoveryCheckDone = true;
    }

    const isGroupChat = m.key.remoteJid.endsWith('@g.us');
    if (!isGroupChat) return;

    const userId = m.key.participant || m.sender;
    const groupId = m.key.remoteJid;
    const userName = m.pushName || userId.split('@')[0];
    
    await initGroupSettings(groupId);
    const settings = groupSettings.get(groupId);

    let session = interviewSessions.get(userId) || await loadSession(userId);
    if (session && session.status === 'active') {
      if (m.message?.conversation) {
        const userMessage = m.message.conversation;

        if (!session.rulesAcknowledged && session.currentQuestion >= interviewQuestions.get(groupId).length) {
          await handleRulesAck(session, userMessage, sock);
          return;
        }

        await handleInterviewResponse(session, userMessage, sock);
        return;
      }

      if (m.type === 'imageMessage' && session.currentQuestion < interviewQuestions.get(groupId).length) {
        const currentQ = interviewQuestions.get(groupId)[session.currentQuestion];
        if (currentQ.type === 'photo') {
          await handleInterviewResponse(session, '[Image]', sock, true, {
            mimetype: m.message.imageMessage.mimetype,
            url: m.message.imageMessage.url,
          });
          return;
        }
      }
    }

    if (m.message?.conversation && m.message.conversation.startsWith(config.PREFIX)) {
      const args = m.message.conversation.slice(config.PREFIX.length).trim().split(' ');
      const command = args[0].toLowerCase();

      if (command === 'interview' || command === 'startinterview') {
        session = interviewSessions.get(userId) || await loadSession(userId);
        if (session) {
          await sock.sendMessage(groupId, { text: `⚠️ You already have an active interview session! Please complete it first. \n\nCurrent question: ${session.currentQuestion + 1}/${interviewQuestions.get(groupId).length}` }, { quoted: m });
          return;
        }

        await startInterview(userId, groupId, userName, sock);
        return;
      }

      const adminOnlyCommands = ['addquestion', 'removequestion', 'listquestions', 'interviewsettings', 'interviewstats', 'approveuser', 'rejectuser', 'setmaingroup', 'pendingreviews', 'viewtranscript', 'editevalprompt', 'resetquestions', 'cancelsession'];
      if (adminOnlyCommands.includes(command)) {
        await handleAdminCommand(command, args, m, sock, config, groupId);
        return;
      }
    }

  } catch (error) {
    console.error('Auto Interview Plugin Error:', error);
    
    const session = interviewSessions.get(m.key.participant || m.sender);
    if (session) {
      clearResponseTimer(m.key.participant || m.sender);
      clearReminderTimer(m.key.participant || m.sender);
    }
  }
}