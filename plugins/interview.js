// plugins/autoInterview.js - v3.2.0 "Resilience Update"
// FIX: Addresses unresponsiveness by adding robust error handling, startup checks,
// detailed logging, and user feedback on failures.
import axios from 'axios';
import { PluginHelpers } from '../lib/pluginIntegration.js';

export const info = {
  name: 'autoInterview',
  version: '3.2.0',
  author: 'Alex Macksyn (Enhanced by Gemini)',
  description: 'A resilient, dynamic, AI-led conversational interview system for group screening. 🎯🤖',
  commands: [
    // ... commands remain the same ...
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

// --- System Prompts & Core Logic (Unchanged) ---
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
`;
const CORE_TOPICS = [ 'Introduction', 'Photo_Request', 'DOB_Request', 'Motivation', 'Interests', 'Contribution', 'Conflict_Resolution', 'Rules_Acknowledgement' ];
const DEFAULT_EVAL_PROMPT = `...`; // Unchanged
const GHQ_RULES = `...`; // Unchanged

// --- Database & Storage (Unchanged) ---
const COLLECTIONS = { sessions: 'interviewSessions', settings: 'groupSettings', stats: 'interviewStats', prompts: 'systemPrompts' };
const interviewSessions = new Map();
const groupSettings = new Map();

// --- Class Definitions (Unchanged) ---
class InterviewSession { /* ... */ }
class GroupSettings { /* ... */ }

// --- REVISED: AI Engine with Better Error Handling ---
class AIInterviewEngine {
  async _makeApiCall(messages, temperature = 0.8, max_tokens = 300) {
    if (!GROQ_CONFIG.API_KEY) {
      console.error('🔴 CRITICAL: GROQ_API_KEY is not set in environment variables.');
      return null;
    }
    try {
      const response = await axios.post(
        GROQ_CONFIG.BASE_URL,
        { model: GROQ_CONFIG.MODEL, messages, temperature, max_tokens },
        {
          headers: { 'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`, 'Content-Type': 'application/json' },
          timeout: 45000 // Increased timeout for better stability
        }
      );
      return response.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.error('🔴 AI API Error: Request timed out.');
      } else if (error.response) {
        console.error(`🔴 AI API Error: Status ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else {
        console.error('🔴 AI API Error: An unexpected error occurred.', error.message);
      }
      return null;
    }
  }

  async generateNextAction(session, systemPrompt) {
    const remainingTopics = CORE_TOPICS.filter(t => !session.topicsCovered.includes(t));
    if (remainingTopics.length === 0) {
      return { /* ... concluding statement ... */ };
    }
    const userPrompt = `...`; // Unchanged

    const messages = [ { role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];
    const result = await this._makeApiCall(messages);

    if (!result) {
        console.log("AI returned a null or empty response.");
        return null; // Handled in the main logic
    }

    try {
      // FIX: Sometimes the AI wraps its response in markdown, this removes it.
      const cleanedResult = result.replace(/```json\n/g, '').replace(/\n```/g, '');
      return JSON.parse(cleanedResult);
    } catch (e) {
      console.error("🔴 AI JSON PARSE ERROR: The AI returned invalid JSON.");
      console.error("--- The problematic response was: ---");
      console.error(result);
      console.error("------------------------------------");
      return null;
    }
  }

  async evaluateInterview(session, evalPrompt) { /* ... same logic, uses _makeApiCall ... */ }
}

const aiEngine = new AIInterviewEngine();

// --- Timers, DB Helpers (Unchanged) ---

// --- REVISED: Initialization with Startup Check ---
export async function initializePlugin(sock) {
    console.log('🚀 Initializing AutoInterview Plugin v3.2.0...');
    if (!GROQ_CONFIG.API_KEY) {
        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.log('!!! WARNING: GROQ_API_KEY is NOT set in your environment. !!!');
        console.log('!!! The interview plugin will NOT work without it.         !!!');
        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    }
    // Session recovery logic remains the same
    try {
        const activeSessions = await PluginHelpers.safeDBOperation(async (db, collection) => {
            return await collection.find({ status: 'active' }).toArray();
        }, COLLECTIONS.sessions);

        if (activeSessions && activeSessions.length > 0) {
            console.log(`🔄 Resuming ${activeSessions.length} active interview session(s).`);
            // ... rest of the recovery logic
        }
    } catch (error) {
        console.error('Error during AutoInterview plugin initialization:', error);
    }
}

// --- Main Interview Flow ---
async function startInterview(userId, groupId, userName, sock) {
    // ... Same logic as before ...
    console.log(`[Flow] Starting interview for ${userName} (${userId})`);
    const initialAction = await aiEngine.generateNextAction(session, systemPrompt);

    if (!initialAction) {
        console.error(`[Flow] Failed to get initial action from AI for ${userName}.`);
        await sock.sendMessage(groupId, { text: "Oh, sorry! My AI brain is taking a quick break. Please try again in a moment using the `.interview` command." });
        return;
    }
    // ... rest of startInterview logic
}


async function handleInterviewResponse(session, userMessage, sock, messageType = 'text', messageData = null) {
  console.log(`[Flow] Handling response from ${session.userName}. Message type: ${messageType}.`);
  const settings = groupSettings.get(session.groupId);
  clearResponseTimer(session.userId);
  clearReminderTimer(session.userId);

  // ... photo handling logic is the same ...

  await sock.sendPresenceUpdate('composing', session.groupId);
  const systemPrompt = /* ... get system prompt ... */'';
  
  console.log(`[Flow] Requesting next action from AI for ${session.userName}.`);
  const nextAction = await aiEngine.generateNextAction(session, systemPrompt);

  // --- MAJOR FIX: Handle AI Failure Gracefully ---
  if (!nextAction) {
    console.error(`[Flow] Failed to get next action from AI for ${session.userName}.`);
    await sock.sendMessage(session.groupId, { text: "I'm sorry, I had a little trouble processing that. Could you please say that again?" });
    await sock.sendPresenceUpdate('paused', session.groupId);
    // Reset timer and wait for user to repeat themselves
    setResponseTimer(session.userId, settings.responseTimeoutMinutes * 60 * 1000, () => handleResponseTimeout(session.userId, sock));
    return;
  }

  console.log(`[Flow] AI responded with topic: ${nextAction.topic_covered} for ${session.userName}.`);
  
  // ... rest of handleInterviewResponse logic is the same ...
}

// ... finishInterview, approveUser, rejectUser, isAdmin, etc. are all unchanged ...

// --- REVISED: Main Event Handler with Clearer Logic ---
export default async function autoInterviewHandler(m, sock, config) {
  try {
    if (!m.key || !m.key.remoteJid || !m.key.remoteJid.endsWith('@g.us')) return;
    const groupId = m.key.remoteJid;

    // New Member Detection (Unchanged)
    if (m.messageStubType === 27 || m.messageStubType === 32) {
        // ... new member logic ...
        return;
    }
    
    // Determine the user and if they have an active session
    const userId = m.key.participant || m.sender;
    const session = interviewSessions.get(userId);

    // --- Logic for users IN an active interview ---
    if (session && session.status === 'active') {
      const messageType = m.message?.imageMessage ? 'image' : 'text';
      const userMessage = m.message?.conversation || m.message?.extendedTextMessage?.text || (messageType === 'image' ? '[Image]' : '');
      
      // FIX: Ignore empty messages, stickers, status updates etc.
      if (!userMessage) {
        return;
      }
      
      const messageData = m.message?.imageMessage ? { mimetype: m.message.imageMessage.mimetype } : null;
      await handleInterviewResponse(session, userMessage, sock, messageType, messageData);
      return;
    }

    // --- Logic for users NOT in an active interview (Commands) ---
    const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text;
    if (messageText && messageText.startsWith(config.PREFIX)) {
      const args = messageText.slice(config.PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();
      
      if (command === 'interview' || command === 'startinterview') {
        const userName = m.pushName || userId.split('@')[0];
        await startInterview(userId, groupId, userName, sock);
        return;
      }
      // Handle admin commands
      await handleAdminCommand(command, args, m, sock, config, groupId);
    }
  } catch (error) {
    console.error('--- Auto Interview Plugin Critical Error ---', error);
    // Optional: Notify owner on critical failure
    // const ownerId = config.OWNER_NUMBER ? `${config.OWNER_NUMBER}@s.whatsapp.net` : null;
    // if (ownerId) await sock.sendMessage(ownerId, { text: `A critical error occurred in the interview plugin: ${error.message}` });
  }
}


