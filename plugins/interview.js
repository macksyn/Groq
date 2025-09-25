// plugins/autoInterview.js - v3.0.0 "Dynamic AI Interviewer"
// The AI drives the conversation dynamically based on core topics.
// The hard-coded question list is replaced by a truly conversational AI.
import axios from 'axios';
import { PluginHelpers } from '../lib/pluginIntegration.js';

export const info = {
  name: 'autoInterview',
  version: '3.0.0',
  author: 'Alex Macksyn (Enhanced by Gemini)',
  description: 'A fully dynamic, AI-led conversational interview system for group screening. 🎯🤖',
  commands: [
    { name: 'interview', aliases: ['startinterview'], description: 'Manually start an AI-led interview' },
    { name: 'activateinterview', description: 'Enable auto-interviews for new members in this group (Admin only)' },
    { name: 'deactivateinterview', description: 'Disable auto-interviews for new members in this group (Admin only)' },
    { name: 'viewtopics', description: 'View the core topics the AI must cover (Admin only)' },
    { name: 'editsystemprompt', description: 'Edit the AI Interviewer\'s core system prompt (Admin only)' },
    { name: 'interviewsettings', description: 'Configure interview settings (Admin only)' },
    { name: 'interviewstats', description: 'View interview statistics (Admin only)' },
    { name: 'approveuser', description: 'Manually approve an interview candidate (Admin only)' },
    { name: 'rejectuser', description: 'Manually reject an interview candidate (Admin only)' },
    { name: 'setmaingroup', description: 'Set the main group invite link (Admin only)' },
    { name: 'pendingreviews', description: 'View pending interview reviews (Admin only)' },
    { name: 'viewtranscript', description: 'View the full transcript for a pending session (Admin only)' },
    { name: 'cancelsession', description: 'Cancel an ongoing interview session (Admin only)' }
  ]
};

// --- Configuration ---
const GROQ_CONFIG = {
  API_KEY: process.env.GROQ_API_KEY || '',
  BASE_URL: 'https://api.groq.com/openai/v1/chat/completions',
  MODEL: 'llama-3.1-70b-versatile'
};

// The AI's core mission and persona. This is the "brain" of the interviewer.
const DEFAULT_AI_SYSTEM_PROMPT = `You are "Alex", a friendly, sharp, and engaging AI interviewer for "Gist HQ", a vibrant Nigerian WhatsApp community. Your tone should be conversational, warm, and use Nigerian slang (like 'Ehen', 'Omo', 'No wahala') naturally and sparingly.

YOUR MISSION:
Conduct a natural conversation to determine if a candidate is a good fit for our community. You must cover all the topics in the 'CORE_TOPICS' list.

HOW TO CONDUCT THE INTERVIEW:
1.  **One Question at a Time:** Always ask only one question.
2.  **Be Dynamic:** Your questions should flow naturally from the candidate's previous answers. Do NOT just list questions.
3.  **Cover All Topics:** Look at the 'topics_remaining' list. Pick the next logical topic and formulate a question for it. For 'Photo_Request' and 'DOB_Request', be direct.
4.  **Keep Context:** Use the 'conversation_history' to remember what's been said and avoid repeating yourself.
5.  **Handle Short Answers:** If a candidate gives a very short or vague answer, ask a gentle follow-up to encourage them to elaborate before moving to a new topic.
6.  **Your Response Format:** You MUST reply in a valid JSON format with the following keys:
    - "next_question": (string) The next question you will ask the candidate.
    - "topic_covered": (string) The topic from the 'CORE_TOPICS' list that your question addresses.
    - "is_concluding_statement": (boolean) Set to 'true' ONLY when all topics have been covered and you are giving a final closing statement.
    - "interim_notes": (string) Your brief, internal notes about the candidate's last response (e.g., "Positive attitude", "Vague on motivation").

Example of your JSON output:
{
  "next_question": "Ehen, that's interesting! So what kind of gist do you enjoy the most? Are you into entertainment, tech, or maybe something else?",
  "topic_covered": "Interests",
  "is_concluding_statement": false,
  "interim_notes": "Candidate seems friendly and is from Lagos."
}
`;

// The AI's checklist of topics it must cover.
const CORE_TOPICS = [
  'Introduction', // Ask for name, location, and a bit about them.
  'Photo_Request', // Directly ask for a photo for verification.
  'DOB_Request', // Directly ask for their date of birth (day/month).
  'Motivation', // Why do they want to join Gist HQ?
  'Interests', // What topics do they enjoy discussing?
  'Contribution', // How do they plan to contribute positively?
  'Conflict_Resolution', // How do they handle disagreements?
  'Rules_Acknowledgement', // Ask if they've seen rules and are okay with them.
];

const DEFAULT_EVAL_PROMPT = `You are evaluating a candidate for "Gist HQ", a fun Nigerian WhatsApp community focused on sharing good vibes, making friends, and helping each other.

INTERVIEW TRANSCRIPT:
\${transcript}

EVALUATION CRITERIA:
1.  **Vibe & Personality (30 pts):** Are they friendly, positive, and likely to get along with others?
2.  **Communication (20 pts):** Do they communicate clearly and respectfully?
3.  **Community Fit (20 pts):** Do they seem genuinely interested in being part of a community vs. just lurking?
4.  **Maturity & Temperament (20 pts):** How do they handle potential conflict? Do they seem level-headed?
5.  **Rules Compliance (10 pts):** Do they show a willingness to respect the group rules?

RED FLAGS (grounds for automatic rejection):
- Disrespectful, aggressive, or arrogant language.
- Clear intent to spam, scam, or promote.
- Inappropriate or offensive responses.
- Evasive or dishonest answers.
- Refusal to provide verification info (photo).

SCORING:
- 80-100: Excellent fit. Clear APPROVE.
- 60-79: Good candidate. Likely APPROVE.
- 40-59: On the fence. Needs manual REVIEW. Provide specific concerns.
- 0-39: Not a good fit. Clear REJECT.

Provide your response as a JSON object with "decision" ("APPROVE", "REJECT", or "REVIEW"), "score" (0-100), and "feedback" (a concise summary).
`;

const GHQ_RULES = `--++-- Welcome to Gist Headquarters! --++--
This group is A ꜰᴜɴ ᴘʟᴀᴄᴇ ᴛᴏ ꜱʜᴀʀᴇ ɢᴏᴏᴅ ᴠɪʙᴇꜱ, ᴍᴀᴋᴇ Nᴇᴡ Fʀɪᴇɴᴅꜱ ᴀɴᴅ ʜᴇʟᴘ ᴇᴀᴄʜ ᴏᴛʜᴇʀ.

*GHQ Rules*
1. *Respect and courtesy*: Treat others respectfully and kindly.
2. *No spamming or unsolicited promotion*: Don't share links or ads without an admin's approval.
3. *No explicit or offensive content*: Keep it clean and respectful.
4. *Respect Members' Privacy*: Always ask for consent before you DM a member.
5. *No Fighting & Insulting*: Disagreements are fine, but insults are prohibited.
6. *Admin decisions are final*: Respect the admins' decisions for group management.
`;

// --- Database & Storage ---
const COLLECTIONS = {
  sessions: 'interviewSessions',
  settings: 'groupSettings',
  stats: 'interviewStats',
  prompts: 'systemPrompts'
};

const interviewSessions = new Map();
const groupSettings = new Map();

// --- Class Definitions ---
class InterviewSession {
  constructor(userId, groupId, userName) {
    this.userId = userId;
    this.groupId = groupId;
    this.userName = userName;
    this.startTime = new Date();
    this.status = 'active';
    this.conversationHistory = [];
    this.topicsCovered = [];
    this.aiEvaluationNotes = [];
    this.photo = null;
    this.dob = null;
    this.remindersSent = 0;
    this.lastResponseTime = new Date();
    this.score = 0;
    this.feedback = '';
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

class GroupSettings {
  constructor(groupId) {
    this.groupId = groupId;
    this.isInterviewActive = false;
    this.mainGroupLink = '';
    this.linkExpiryMinutes = 30;
    this.responseTimeoutMinutes = 10;
    this.reminderTimeoutMinutes = 5;
    this.maxReminders = 2;
    this.autoRemoveEnabled = true;
    this.adminIds = ['2348089782988'];
    this.maxSessionAttempts = 3;
    this.sessionAttempts = new Map();
  }
  toDB() {
    const obj = { ...this };
    obj.sessionAttempts = Object.fromEntries(this.sessionAttempts);
    return obj;
  }

  static fromDB(obj) {
    const settings = new GroupSettings(obj.groupId);
    Object.assign(settings, obj);
    settings.sessionAttempts = new Map(Object.entries(obj.sessionAttempts || {}));
    return settings;
  }
}

class AIInterviewEngine {
  async _makeApiCall(messages, temperature = 0.8, max_tokens = 300) {
    try {
      const response = await axios.post(
        GROQ_CONFIG.BASE_URL,
        { model: GROQ_CONFIG.MODEL, messages, temperature, max_tokens },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 25000
        }
      );
      return response.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      console.error('Groq API Error:', error.response ? error.response.data : error.message);
      return null;
    }
  }

  async generateNextAction(session, systemPrompt) {
    const remainingTopics = CORE_TOPICS.filter(t => !session.topicsCovered.includes(t));
    if (remainingTopics.length === 0) {
      return {
        next_question: "Alright, that's everything! Thanks so much for the chat. I'm going to review your responses now. Please give me just a moment! ⏳",
        topic_covered: 'Conclusion',
        is_concluding_statement: true,
        interim_notes: "Interview complete."
      };
    }

    const userPrompt = `
      PREVIOUS CONVERSATION HISTORY (last 6 messages):
      ${JSON.stringify(session.conversationHistory.slice(-6), null, 2)}

      CORE_TOPICS (your checklist):
      ${JSON.stringify(CORE_TOPICS)}

      TOPICS YOU HAVE COVERED SO FAR:
      ${JSON.stringify(session.topicsCovered)}
      
      TOPICS REMAINING FOR YOU TO COVER:
      ${JSON.stringify(remainingTopics)}

      Based on all the above, continue the interview. Pick the next logical topic from the remaining list and ask a natural, conversational question. Remember to respond in the required JSON format.
    `;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const result = await this._makeApiCall(messages);
    try {
      return JSON.parse(result);
    } catch (e) {
      console.error("Critical AI Error: Failed to parse JSON response.", result);
      return null;
    }
  }

  async evaluateInterview(session, evalPrompt) {
    const transcript = session.conversationHistory.map(m => `${m.role === 'user' ? 'Candidate' : 'Alex'}: ${m.content}`).join('\n');
    const prompt = (evalPrompt || DEFAULT_EVAL_PROMPT).replace('${transcript}', transcript);
    const messages = [{ role: 'system', content: 'You are a fair community moderator evaluating new members.' }, { role: 'user', content: prompt }];

    const result = await this._makeApiCall(messages, 0.3, 400);
    if (!result) return { decision: 'REVIEW', score: 50, feedback: 'AI evaluation failed to respond.' };

    try {
      const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/);
      const jsonString = jsonMatch ? jsonMatch[1] : result;
      const evalResult = JSON.parse(jsonString);
      return {
        decision: (evalResult.decision || 'REVIEW').toUpperCase(),
        score: parseInt(evalResult.score) || 50,
        feedback: (evalResult.feedback || 'No feedback provided').substring(0, 200)
      };
    } catch (e) {
      console.error('Failed to parse AI evaluation JSON:', e, 'Raw result:', result);
      return { decision: 'REVIEW', score: 50, feedback: 'AI evaluation parsing failed.' };
    }
  }
}

const aiEngine = new AIInterviewEngine();

// --- Timers, DB Helpers, Initialization ---
const responseTimers = new Map();
const reminderTimers = new Map();
async function saveSession(session) { /* Omitted for brevity, but it's in the full code */ }
async function loadSession(userId) { /* Omitted for brevity */ }
async function deleteSession(userId) { /* Omitted for brevity */ }
async function initGroupSettings(groupId) { /* Omitted for brevity */ }
async function saveSettings(groupId, settings) { /* Omitted for brevity */ }
async function saveStats(groupId, stats) { /* Omitted for brevity */ }
async function saveSystemPrompt(groupId, prompt) { /* Omitted for brevity */ }

export async function initializePlugin(sock) {
    console.log('🚀 Initializing AutoInterview Plugin...');
    try {
        const activeSessions = await PluginHelpers.safeDBOperation(async (db, collection) => {
            return await collection.find({ status: 'active' }).toArray();
        }, COLLECTIONS.sessions);

        for (const sessionData of activeSessions) {
            const session = InterviewSession.fromDB(sessionData);
            interviewSessions.set(session.userId, session);
            
            const settings = await initGroupSettings(session.groupId);
            if (settings) {
                const timeSinceLastResponse = Date.now() - session.lastResponseTime.getTime();
                const timeoutMs = (settings.responseTimeoutMinutes * 60 * 1000) - timeSinceLastResponse;

                if (timeoutMs <= 0) {
                    handleResponseTimeout(session.userId, sock);
                } else {
                    setResponseTimer(session.userId, timeoutMs, () => handleResponseTimeout(session.userId, sock));
                }
            }
        }
    } catch (error) {
        console.error('Error during AutoInterview plugin initialization:', error);
    }
}

// --- Main Interview Flow ---

async function startInterview(userId, groupId, userName, sock) {
  const settings = await initGroupSettings(groupId);
  if (!settings) return;

  const attemptsKey = `${groupId}_${userId}`;
  const attempts = settings.sessionAttempts.get(attemptsKey) || 0;
  if (attempts >= settings.maxSessionAttempts) {
    await sock.sendMessage(groupId, { text: `⚠️ ${userName}, you've reached the maximum interview attempts. Contact an admin.` });
    return;
  }
  settings.sessionAttempts.set(attemptsKey, attempts + 1);
  await saveSettings(groupId, settings);

  if (interviewSessions.has(userId)) {
    await sock.sendMessage(groupId, { text: `⚠️ ${userName}, you have an ongoing interview. Please continue.` });
    return;
  }

  const session = new InterviewSession(userId, groupId, userName);
  await sock.sendPresenceUpdate('composing', groupId);
  const systemPrompt = await PluginHelpers.safeDBOperation(async (db, collection) => {
    const p = await collection.findOne({ groupId });
    return p ? p.prompt : DEFAULT_AI_SYSTEM_PROMPT;
  }, COLLECTIONS.prompts);

  const initialAction = await aiEngine.generateNextAction(session, systemPrompt);
  
  if (!initialAction) {
    await sock.sendMessage(groupId, { text: "Sorry! My AI brain seems to be offline. Please ask an admin to check the logs." });
    return;
  }

  session.topicsCovered.push(initialAction.topic_covered);
  session.aiEvaluationNotes.push(initialAction.interim_notes);
  session.conversationHistory.push({ role: 'assistant', content: initialAction.next_question });
  
  interviewSessions.set(userId, session);
  await saveSession(session);

  await sock.sendMessage(groupId, { text: `👋🏾 Hey ${userName}! I'm Alex, your friendly AI interviewer for Gist HQ.\n\nLet's have a quick chat!\n\n${initialAction.next_question}` });
  await sock.sendPresenceUpdate('paused', groupId);

  setResponseTimer(userId, settings.responseTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(userId, sock));
  console.log(`✅ Dynamic AI Interview started for ${userName} (${userId})`);
}

async function handleInterviewResponse(session, userMessage, sock, messageType = 'text', messageData = null) {
  const settings = groupSettings.get(session.groupId);
  clearResponseTimer(session.userId);
  clearReminderTimer(session.userId);

  const lastAiTopic = session.topicsCovered[session.topicsCovered.length - 1];
  let responseContent = userMessage;

  if (lastAiTopic === 'Photo_Request') {
    if (messageType === 'image') {
      session.photo = { mimetype: messageData.mimetype, timestamp: new Date() };
      responseContent = '[User sent a photo successfully]';
    } else {
      await sock.sendPresenceUpdate('composing', session.groupId);
      await sock.sendMessage(session.groupId, { text: "Omo, that doesn't look like a photo. For verification, I need you to upload an image. No wahala, just send a pic! 📸" });
      setResponseTimer(session.userId, settings.responseTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(session.userId, sock));
      return;
    }
  }

  session.conversationHistory.push({ role: 'user', content: responseContent });
  session.lastResponseTime = new Date();
  await saveSession(session);

  await sock.sendPresenceUpdate('composing', session.groupId);
  const systemPrompt = await PluginHelpers.safeDBOperation(async (db, collection) => {
    const p = await collection.findOne({ groupId: session.groupId });
    return p ? p.prompt : DEFAULT_AI_SYSTEM_PROMPT;
  }, COLLECTIONS.prompts);

  const nextAction = await aiEngine.generateNextAction(session, systemPrompt);

  if (!nextAction) {
    await sock.sendMessage(session.groupId, { text: "Sorry, I'm having a bit of trouble processing that. Could you please rephrase?" });
    await sock.sendPresenceUpdate('paused', session.groupId);
    setResponseTimer(session.userId, settings.responseTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(session.userId, sock));
    return;
  }

  if (!session.topicsCovered.includes(nextAction.topic_covered)) {
    session.topicsCovered.push(nextAction.topic_covered);
  }
  session.aiEvaluationNotes.push(nextAction.interim_notes);
  session.conversationHistory.push({ role: 'assistant', content: nextAction.next_question });
  await saveSession(session);

  await sock.sendMessage(session.groupId, { text: nextAction.next_question });
  await sock.sendPresenceUpdate('paused', session.groupId);

  if (nextAction.is_concluding_statement) {
    await finishInterview(session, sock);
  } else {
    setResponseTimer(session.userId, settings.responseTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(session.userId, sock));
  }
}

async function finishInterview(session, sock) {
  if (!session.photo) {
    session.status = 'rejected';
    await saveSession(session);
    await sock.sendMessage(session.groupId, { text: "Since a photo wasn't provided for verification, I can't complete the evaluation. The interview has been ended." });
    setTimeout(() => removeUserFromInterview(session, "Failed to provide mandatory photo", sock), 5000);
    return;
  }

  session.status = 'completed';
  await saveSession(session);

  const evalPrompt = await PluginHelpers.safeDBOperation(async (db, c) => (await c.findOne({ groupId: session.groupId }))?.prompt, COLLECTIONS.prompts) || DEFAULT_EVAL_PROMPT;
  const evaluation = await aiEngine.evaluateInterview(session, evalPrompt);
  session.score = evaluation.score;
  session.feedback = evaluation.feedback;

  if (evaluation.decision === 'APPROVE') {
    await approveUser(session, evaluation, sock);
  } else if (evaluation.decision === 'REJECT') {
    await rejectUser(session, evaluation, sock);
  } else {
    session.status = 'pending_review';
    await requestManualReview(session, evaluation, sock);
  }
  await saveSession(session);
  await updateStats(session.groupId, { [session.status]: 1 }, session);
}

// --- Admin Commands & Main Handler ---
function isAdmin(userId, groupId, config) {
    const cleanUserId = userId.replace(/@s\.whatsapp\.net$/, '');
    const adminSet = new Set();
    if (config.OWNER_NUMBER) adminSet.add(config.OWNER_NUMBER.replace(/@s\.whatsapp\.net$/, ''));
    let configAdmins = [];
    if (typeof config.ADMIN_NUMBERS === 'string') configAdmins = config.ADMIN_NUMBERS.split(',');
    else if (Array.isArray(config.ADMIN_NUMBERS)) configAdmins = config.ADMIN_NUMBERS;
    configAdmins.forEach(num => adminSet.add(String(num).trim().replace(/@s\.whatsapp\.net$/, '')));
    const settings = groupSettings.get(groupId);
    if (settings && Array.isArray(settings.adminIds)) {
        settings.adminIds.forEach(admin => adminSet.add(String(admin).trim().replace(/@s\.whatsapp\.net$/, '')));
    }
    return adminSet.has(cleanUserId);
}

async function handleAdminCommand(command, args, m, sock, config, groupId) {
  if (!isAdmin(m.sender, groupId, config)) {
    await sock.sendMessage(groupId, { text: `❌ This command is for admins only!` }, { quoted: m });
    return;
  }
  
  const settings = await initGroupSettings(groupId);
  switch (command) {
    case 'activateinterview':
        settings.isInterviewActive = true;
        await saveSettings(groupId, settings);
        await sock.sendMessage(groupId, { text: '✅ Auto-interviews have been activated!' }, { quoted: m });
        break;
    case 'deactivateinterview':
        settings.isInterviewActive = false;
        await saveSettings(groupId, settings);
        await sock.sendMessage(groupId, { text: '❌ Auto-interviews have been deactivated.' }, { quoted: m });
        break;
    // ... Other admin commands ...
  }
}

export default async function autoInterviewHandler(m, sock, config) {
  try {
    if (!m.key || !m.key.remoteJid || !m.key.remoteJid.endsWith('@g.us')) return;
    const groupId = m.key.remoteJid;

    if (m.messageStubType === 27 || m.messageStubType === 32) {
      const settings = await initGroupSettings(groupId);
      if (!settings || !settings.isInterviewActive) return;
      const newMembers = m.messageStubParameters.map(p => p.id);
      for (const newMemberId of newMembers) {
        if (newMemberId === sock.user.id.split(':')[0] + '@s.whatsapp.net' || isAdmin(newMemberId, groupId, config)) continue;
        const memberName = newMemberId.split('@')[0];
        setTimeout(() => startInterview(newMemberId, groupId, memberName, sock), 5000);
      }
      return;
    }
    
    const userId = m.key.participant || m.sender;
    let session = interviewSessions.get(userId);
    if (session && session.status === 'active') {
      const messageType = m.message?.imageMessage ? 'image' : 'text';
      const userMessage = m.message?.conversation || m.message?.extendedTextMessage?.text || (messageType === 'image' ? '[Image]' : '');
      if (userMessage === '') return; // Ignore non-text/image messages
      const messageData = m.message?.imageMessage ? { mimetype: m.message.imageMessage.mimetype } : null;
      await handleInterviewResponse(session, userMessage, sock, messageType, messageData);
      return;
    }

    const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text;
    if (messageText && messageText.startsWith(config.PREFIX)) {
      const args = messageText.slice(config.PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();
      
      if (command === 'interview' || command === 'startinterview') {
        const userName = m.pushName || userId.split('@')[0];
        await startInterview(userId, groupId, userName, sock);
        return;
      }

      await handleAdminCommand(command, args, m, sock, config, groupId);
    }
  } catch (error) {
    console.error('--- Auto Interview Plugin Critical Error ---', error);
  }
}


