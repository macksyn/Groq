// plugins/autoInterview.js - v3.2.1 "Admin Command Fix"
// FIX: Restored the missing handleAdminCommand function, resolving the ReferenceError crash.
import axios from 'axios';
import { PluginHelpers } from '../lib/pluginIntegration.js';

export const info = {
  name: 'autoInterview',
  version: '3.2.1',
  author: 'Alex Macksyn (Enhanced by Gemini)',
  description: 'A resilient, dynamic, AI-led conversational interview system for group screening. 🎯🤖',
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

// --- System Prompts & Core Logic (Unchanged) ---
const DEFAULT_AI_SYSTEM_PROMPT = `You are "Alex", a friendly, sharp, and engaging AI interviewer...`; // Unchanged
const CORE_TOPICS = [ 'Introduction', 'Photo_Request', 'DOB_Request', 'Motivation', 'Interests', 'Contribution', 'Conflict_Resolution', 'Rules_Acknowledgement' ];
const DEFAULT_EVAL_PROMPT = `You are evaluating a candidate for "Gist HQ"...`; // Unchanged
const GHQ_RULES = `...`; // Unchanged

// --- Database & Storage (Unchanged) ---
const COLLECTIONS = { sessions: 'interviewSessions', settings: 'groupSettings', stats: 'interviewStats', prompts: 'systemPrompts' };
const interviewSessions = new Map();
const groupSettings = new Map();

// --- Class Definitions (Unchanged) ---
class InterviewSession { /* ... */ }
class GroupSettings { /* ... */ }
class AIInterviewEngine { /* ... */ }

const aiEngine = new AIInterviewEngine();

// --- Timers, DB Helpers (Unchanged) ---
const responseTimers = new Map();
const reminderTimers = new Map();
// All DB helpers (saveSession, etc.) are assumed to be here.

// --- Initialization ---
export async function initializePlugin(sock) {
    console.log('🚀 Initializing AutoInterview Plugin v3.2.1...');
    if (!GROQ_CONFIG.API_KEY) {
        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.log('!!! WARNING: GROQ_API_KEY is NOT set in your environment. !!!');
        console.log('!!! The interview plugin will NOT work without it.         !!!');
        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    }
    // Session recovery logic...
}

// --- Main Interview Flow ---
async function startInterview(userId, groupId, userName, sock) { /* ... */ }
async function handleInterviewResponse(session, userMessage, sock, messageType = 'text', messageData = null) { /* ... */ }
async function finishInterview(session, sock) { /* ... */ }
async function approveUser(session, evaluation, sock) { /* ... */ }
async function rejectUser(session, evaluation, sock) { /* ... */ }
async function requestManualReview(session, evaluation, sock) { /* ... */ }
async function removeUserFromInterview(session, reason, sock) { /* ... */ }
async function updateStats(groupId, updates, session) { /* ... */ }


// --- Admin Logic ---
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

// --- FIXED: Restored the missing handleAdminCommand function ---
async function handleAdminCommand(command, args, m, sock, config, groupId) {
  if (!isAdmin(m.sender, groupId, config)) {
    await sock.sendMessage(groupId, { text: `❌ This command is for admins only!` }, { quoted: m });
    return;
  }
  
  const settings = await initGroupSettings(groupId);
  const text = args.slice(1).join(" ");

  switch (command) {
    case 'activateinterview':
      if (settings.isInterviewActive) {
        await sock.sendMessage(groupId, { text: '✅ Auto-interviews are already active.' }, { quoted: m });
      } else {
        settings.isInterviewActive = true;
        await saveSettings(groupId, settings);
        await sock.sendMessage(groupId, { text: '✅ Auto-interviews have been activated for new members.' }, { quoted: m });
      }
      break;

    case 'deactivateinterview':
      if (!settings.isInterviewActive) {
        await sock.sendMessage(groupId, { text: 'ℹ️ Auto-interviews are already inactive.' }, { quoted: m });
      } else {
        settings.isInterviewActive = false;
        await saveSettings(groupId, settings);
        await sock.sendMessage(groupId, { text: '❌ Auto-interviews have been deactivated.' }, { quoted: m });
      }
      break;

    case 'viewtopics':
      await sock.sendMessage(groupId, { text: `📋 Core Interview Topics:\n\n- ${CORE_TOPICS.join('\n- ')}` }, { quoted: m });
      break;
    
    case 'setmaingroup':
        if (!text.includes('https://chat.whatsapp.com/')) {
            await sock.sendMessage(groupId, { text: 'Please provide a valid WhatsApp group link.' }, { quoted: m });
            return;
        }
        settings.mainGroupLink = text;
        await saveSettings(groupId, settings);
        await sock.sendMessage(groupId, { text: `✅ Main group link has been updated.` }, { quoted: m });
        break;

    case 'cancelsession':
        const targetId = text.replace(/[@\s]/g, '') + '@s.whatsapp.net';
        const sessionToCancel = interviewSessions.get(targetId);
        if (!sessionToCancel) {
            await sock.sendMessage(groupId, { text: `No active session found for that user.` }, { quoted: m });
            return;
        }
        await removeUserFromInterview(sessionToCancel, 'Cancelled by an admin', sock);
        await sock.sendMessage(groupId, { text: `✅ The interview session for @${targetId.split('@')[0]} has been cancelled.` }, { quoted: m, contextInfo: { mentionedJid: [targetId] } });
        break;
        
    default:
      await sock.sendMessage(groupId, { text: `🤔 Unknown admin command: "${command}"` }, { quoted: m });
      break;
  }
}


// --- Main Event Handler ---
export default async function autoInterviewHandler(m, sock, config) {
  try {
    if (!m.key || !m.key.remoteJid || !m.key.remoteJid.endsWith('@g.us')) return;
    const groupId = m.key.remoteJid;

    // New Member Detection
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
    const session = interviewSessions.get(userId);

    // Logic for users IN an active interview
    if (session && session.status === 'active') {
      const messageType = m.message?.imageMessage ? 'image' : 'text';
      const userMessage = m.message?.conversation || m.message?.extendedTextMessage?.text || (messageType === 'image' ? '[Image]' : '');
      
      if (!userMessage) return;
      
      const messageData = m.message?.imageMessage ? { mimetype: m.message.imageMessage.mimetype } : null;
      await handleInterviewResponse(session, userMessage, sock, messageType, messageData);
      return;
    }

    // Logic for users NOT in an active interview (Commands)
    const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text;
    if (messageText && messageText.startsWith(config.PREFIX)) {
      const args = messageText.slice(config.PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();
      
      if (command === 'interview' || command === 'startinterview') {
        const userName = m.pushName || userId.split('@')[0];
        await startInterview(userId, groupId, userName, sock);
        return;
      }
      
      // Pass to the admin command handler
      await handleAdminCommand(command, args, m, sock, config, groupId);
    }
  } catch (error) {
    console.error('--- Auto Interview Plugin Critical Error ---', error);
  }
}


