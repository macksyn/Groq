// plugins/ai_lecturer.js - Fixed & Robust Version
import axios from 'axios';
import cron from 'node-cron';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  API_URL: 'https://malvin-api.vercel.app/ai/gpt-5',
  API_TIMEOUT: 60000, // Increased to 60s
  DEFAULT_TIMEZONE: 'Africa/Lagos',
  MAX_SESSIONS: 52,

  LECTURERS: [
    {
    id: 'prof_alex',
      name: 'Prof. Alex Macksyn',
      style: 'Witty Lagos Academic prof',
      prompt: 'You\'re Prof. Alex - mordern naija intellectual. Makes complex topic relatable with contemporary nigerian realities. Natural flow, 5-7 emojis. Bold key terms.'
    },
    {
      id: 'dr_evelyn',
      name: 'Dr. Evelyn Hayes',
      style: 'British academic',
      prompt: 'You\'re Dr. Hayes - sharp British scholar. "Right then..." Precise, data-first, sophisticated. Examples + evidence. 4-6 emojis. Bold key terms.'
    },
    {
      id: 'sir_adegoke',
      name: 'Baba Adegoke',
      style: 'Wise Retired Headmaster',
      prompt: 'Role: Baba Adegoke, a literate, retired Nigerian Professor. Gentle, patient, and articulate. Lecture by connecting the topic to a **Nigerian proverb** or **parable**, then explaining it with modern clarity. Use standard, polished English (no pidgin), but with cultural gravitas. Address user as "My child." Bold **key wisdom**. Max 5 emojis 👴🏾📜🌴.'
    },
    {
      id: 'ada_coder',
      name: 'Ada "Tech Sis" Eze',
      style: 'Sharp Lagos Dev/PM',
      prompt: 'Role: Ada, a brilliant Lagos Software Engineer. Smart, fast-paced, and ambitious. Lecture with **Lagos startup culture** (remote work, funding, coffee). Avoid childish slang; use witty **"Tech Twitter"** vibes. **Bold key terms**. 5 emojis 💻🚀⚡.'
    },
    {
      id: 'mr_garba',
      name: 'Mallam Garba',
      style: 'Methodical Northern Academic',
      prompt: 'Role: Mallam Garba, a dignified Northern Nigerian lecturer. Soft-spoken, patient, and logical. Use **standard, polished English** (no slang). Break problems down into **simple, numbered steps**. Focus on **discipline and clarity**. Phrases: "Let us take it step by step." **Bold key concepts**. 4 emojis 🤲🏾📝📘✨.'
    },
    {
      id: 'dr_funke',
      name: 'Dr. Funke Alabi',
      style: 'Strict Lagos Executive',
      prompt: 'Role: Dr. Funke, a high-powered Lagos academic. Tone: Sophisticated, stern, and demanding. Zero tolerance for mediocrity. Speak impeccable, formal English. Offer **critical, direct advice** ("Tough Love"). Push the user to be ambitious. Phrases: "Sit up," "Do better." **Bold key commands**. 5 emojis 👠💼💅🏾⛔.'
    },
    {
      id: 'mazi_obinna',
      name: 'J.T Obinna',
      style: 'Shrewd Commercial Strategist',
      prompt: 'Role: J.T Obinna, an educated Business Mogul. Tone: Pragmatic, calculating, and value-driven. Analyze topics with **market street-smarts**. Dismiss fluff; ask "Is it viable?" **Bold financial/strategy terms**. 4 emojis 💼🤝🏾💰🏗️.'
    },
    { name: 'Prof. Okon', prompt: 'Strict professor. "Open your books." Formal, authoritative. 3-5 emojis. Bold terms.' },
    { name: 'Uncle Jide', prompt: 'Street philosopher. "See ehn..." Use pidgin. Hustle mindset. 6-8 emojis. Bold terms.' },
    { name: 'Sister Grace', prompt: 'Deep thinker. "Let\'s reflect..." Philosophical, calm wisdom. 4-6 emojis. Bold terms.' }
  ]
};

// Global state
const cronJobs = new Map();
let globalSock = null;
let globalLogger = null;

// ============================================================================
// UTILITIES
// ============================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function randomLecturer() {
  return CONFIG.LECTURERS[Math.floor(Math.random() * CONFIG.LECTURERS.length)];
}

function cleanAIResponse(text) {
  if (!text) return '';
  let clean = text
    .replace(/^(here'?s?|here is|let me (give|provide|deliver)).*?(lecture|content)[:\s]*/gi, '')
    .replace(/would you like (me to|another|more).*?[\?\s]*/gi, '')
    .replace(/shall i continue.*?[\?\s]*/gi, '')
    .replace(/is there anything else.*?[\?\s]*/gi, '')
    .replace(/let me know if.*?[\.\s]*/gi, '')
    .replace(/\*\*note:?\*\*[^\n]*/gi, '')
    .replace(/\*\*disclaimer:?\*\*[^\n]*/gi, '')
    .replace(/in the style of.*?[:\s]*/gi, '' )
    .replace(/as (prof|dr|uncle|sister|mallam|baba).*?[:\s]*/gi, '')
    .trim();
  return clean.replace(/\n{3,}/g, '\n\n');
}

async function generateLecture(lecturer, topic, mode, sessionNum, prevTopics) {
  try {
    let userPrompt = '';

    if (mode === 'variety') {
      const avoid = prevTopics.length > 0 ? `Avoid: ${prevTopics.slice(-3).join(', ')}. ` : '';
      userPrompt = `${topic} - Session ${sessionNum}\n${avoid}Pick NEW engaging topic. 600-800 words. Hook → 3 points → tips → close. Start now.`;
    } else {
      userPrompt = `${topic} - Part ${sessionNum}\nTeach progressively. ${sessionNum === 1 ? 'Intro + roadmap.' : 'Build on previous.'} 500-700 words. Start now.`;
    }

    const fullPrompt = `${lecturer.prompt}\n\n${userPrompt}`;

    const response = await axios.get(CONFIG.API_URL, {
      params: { text: fullPrompt },
      timeout: CONFIG.API_TIMEOUT
    });

    const raw = response.data?.response || response.data?.result || response.data?.answer;
    if (!raw || raw.length < 100) throw new Error('AI returned empty or too short response');

    return cleanAIResponse(raw.trim());
  } catch (error) {
    throw new Error(`Generation failed: ${error.message}`);
  }
}

async function deliverWithTyping(sock, jid, text) {
  if (!sock) throw new Error('Connection lost');

  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    const typingTime = Math.min(12000, Math.max(2000, sentence.length * 50));

    await sock.sendPresenceUpdate('composing', jid);
    await sleep(typingTime);

    try {
      await sock.sendMessage(jid, { text: sentence });
    } catch (e) {
      console.error('Failed to send sentence:', e);
      break; // Stop if message fails
    }

    if (i < sentences.length - 1) {
      await sleep(1500);
    }
  }

  await sock.sendPresenceUpdate('paused', jid);
}

// ============================================================================
// SCHEDULING CORE
// ============================================================================

function parseDayTime(dayStr, timeStr, tzStr) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  let day = /^\d+$/.test(dayStr) ? parseInt(dayStr) : days.indexOf(dayStr.toLowerCase());

  if (day < 0 || day > 6) throw new Error('Invalid day (use 0-6 or Sunday-Saturday)');
  if (!/^\d{2}:\d{2}$/.test(timeStr)) throw new Error('Time must be HH:MM (e.g., 14:30)');

  const [hour, min] = timeStr.split(':').map(Number);
  if (hour > 23 || min > 59) throw new Error('Invalid time');

  const tz = tzStr || CONFIG.DEFAULT_TIMEZONE;
  return { day, time: timeStr, timezone: tz, cronTime: `${min} ${hour} * * ${day}` };
}

function registerCron(id, cronTime, handler, tz) {
  try {
    if (cronJobs.has(id)) cronJobs.get(id).stop();
    // Validate TZ
    try { new Date().toLocaleString('en-US', { timeZone: tz }); } catch { tz = 'UTC'; }

    const job = cron.schedule(cronTime, handler, { scheduled: true, timezone: tz });
    cronJobs.set(id, job);
    return true;
  } catch (error) {
    globalLogger?.error({ err: error }, 'Cron registration failed');
    return false;
  }
}

async function runScheduledLecture(scheduleId) {
  const db = await PluginHelpers.getDB();

  // FIX: Ensure we have a valid socket
  if (!globalSock) {
    globalLogger?.error('Skipping scheduled lecture: No socket connection');
    return;
  }

  let schedule = null;

  try {
    schedule = await db.collection('lectures').findOne({ _id: scheduleId });
    if (!schedule) return;

    // 1. Ack that cron fired
    await globalSock.sendMessage(schedule.groupId, { 
      text: `⏳ *${schedule.lecturer.name}* is preparing lecture notes...` 
    });

    if (schedule.session > CONFIG.MAX_SESSIONS) {
      await globalSock.sendMessage(schedule.groupId, {
        text: `🎓 *${schedule.title}* complete!\nSeries finished.`
      });
      return;
    }

    const prevTopics = schedule.previousTopics || [];

    // 2. Generate
    const script = await generateLecture(
      schedule.lecturer,
      schedule.title,
      schedule.mode,
      schedule.session,
      prevTopics
    );

    // 3. Extract topic
    let currentTopic = null;
    if (schedule.mode === 'variety') {
      const match = script.match(/(?:today|this week).{0,80}[:\n]/i);
      if (match) currentTopic = match[0].replace(/(?:today|this week)[:\s]*/i, '').trim();
    }

    // 4. Deliver
    const label = schedule.mode === 'variety' ? 'SESSION' : 'PART';
    await globalSock.sendMessage(schedule.groupId, {
      text: `🎓 *${schedule.title.toUpperCase()} - ${label} ${schedule.session}*\n\n*Professor:* ${schedule.lecturer.name}\n${'─'.repeat(35)}`
    });

    await deliverWithTyping(globalSock, schedule.groupId, script);

    // 5. Close
    await sleep(2000);
    const next = schedule.session + 1;
    await globalSock.sendMessage(schedule.groupId, {
      text: `${'─'.repeat(35)}\n🎓 *END ${label} ${schedule.session}*\n_${next <= CONFIG.MAX_SESSIONS ? 'See you next week!' : 'Course Complete!'}_`
    });

    // 6. Update DB
    const newTopics = schedule.mode === 'variety' && currentTopic 
      ? [...prevTopics, currentTopic].slice(-10) 
      : prevTopics;

    await db.collection('lectures').updateOne(
      { _id: scheduleId },
      { $set: { session: next, previousTopics: newTopics, lastRun: new Date() } }
    );

    await db.collection('lecture_logs').insertOne({
      scheduleId,
      session: schedule.session,
      topic: currentTopic,
      status: 'success',
      date: new Date()
    });

  } catch (error) {
    globalLogger?.error({ err: error }, 'Scheduled lecture failed');

    // FIX: Inform user of failure
    if (schedule && globalSock) {
      await globalSock.sendMessage(schedule.groupId, {
        text: `❌ *Class Cancelled*\n\nProfessor ${schedule.lecturer.name} could not make it.\n*Reason:* ${error.message || 'Connection error'}`
      });
    }

    await db.collection('lecture_logs').insertOne({
      scheduleId,
      session: schedule ? schedule.session : 0,
      status: 'failed',
      error: error.message,
      date: new Date()
    });
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function cmdLecture(context) {
  const { msg, text, sock, config, logger } = context;
  if (!text) return msg.reply(`*Usage:* ${config.PREFIX}lecture <topic>`);

  const lecturer = randomLecturer();
  await msg.react('🎓');
  const loading = await msg.reply(`🎓 *Prof ${lecturer.name}* is preparing materials on:\n"${text}"...`);

  try {
    const script = await generateLecture(lecturer, text, 'variety', 1, []);

    await sock.sendMessage(msg.from, {
      text: `🎓 *LECTURE START*\n\n*Topic:* ${text}\n*Prof:* ${lecturer.name}\n${'─'.repeat(35)}`,
      edit: loading.key
    });

    await deliverWithTyping(sock, msg.from, script);
    await sock.sendMessage(msg.from, { text: `${'─'.repeat(35)}\n🎓 *CLASS DISMISSED*` });

  } catch (error) {
    await sock.sendMessage(msg.from, {
      text: `❌ Lecture Failed: ${error.message}`,
      edit: loading.key
    });
  }
}

async function cmdSchedule(context) {
  const { msg, text, sock, logger } = context;
  const db = await PluginHelpers.getDB();

  // FIX: Update global sock reference immediately
  globalSock = sock;

  try {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) throw new Error('Format: Title | Day | Time');

    const [title, dayStr, timeStr, modeStr] = parts;
    const mode = modeStr === 'course' ? 'course' : 'variety';
    const { day, time, timezone, cronTime } = parseDayTime(dayStr, timeStr, parts[4]);

    // Check duplicates
    const exists = await db.collection('lectures').findOne({ groupId: msg.from, title });
    if (exists) throw new Error(`Lecture "${title}" already exists. Cancel it first.`);

    const lecturer = randomLecturer();
    const schedule = {
      groupId: msg.from,
      title, mode, day, time, timezone,
      session: 1, lecturer, previousTopics: [],
      createdAt: new Date()
    };

    const result = await db.collection('lectures').insertOne(schedule);

    const success = registerCron(
      `lec_${result.insertedId}`,
      cronTime,
      () => runScheduledLecture(result.insertedId),
      timezone
    );

    if (!success) {
      await db.collection('lectures').deleteOne({ _id: result.insertedId });
      throw new Error('System failed to register timer.');
    }

    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
    await msg.reply(
      `✅ *Class Scheduled!*\n\n` +
      `*Subject:* ${title}\n` +
      `*Prof:* ${lecturer.name}\n` +
      `*Time:* Every ${dayName} @ ${time} (${timezone})\n` +
      `*Next:* I will send a message when class starts.`
    );

  } catch (error) {
    await msg.reply(`❌ Schedule Failed:\n${error.message}\n\nTry: \`.schedule BizTalk | Friday | 14:00\``);
  }
}

// Debug command to force run a schedule
async function cmdTestSchedule(context) {
  const { msg, text, sock } = context;
  if (!context.isAdmin) return;

  const db = await PluginHelpers.getDB();
  const schedule = await db.collection('lectures').findOne({ groupId: msg.from });

  if (!schedule) return msg.reply('No schedules found in this group.');

  await msg.reply(`🧪 Force running: ${schedule.title}...`);
  globalSock = sock; // Force update sock
  await runScheduledLecture(schedule._id);
}

async function cmdList(context) {
  const { msg } = context;
  const db = await PluginHelpers.getDB();
  const schedules = await db.collection('lectures').find({ groupId: msg.from }).toArray();

  if (schedules.length === 0) return msg.reply('📚 No lectures scheduled.');

  let reply = `📚 *Scheduled Classes (${schedules.length})*\n`;
  for (const s of schedules) {
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.day];
    reply += `\n*${s.title}*\n├ 🕒 ${day} @ ${s.time}\n└ 👨‍🏫 ${s.lecturer.name}\n`;
  }
  await msg.reply(reply);
}

async function cmdCancel(context) {
  const { msg, text } = context;
  if (!text) return msg.reply('Usage: .cancel <Title>');

  const db = await PluginHelpers.getDB();
  const schedule = await db.collection('lectures').findOne({
    groupId: msg.from,
    title: { $regex: new RegExp(`^${text}$`, 'i') }
  });

  if (!schedule) return msg.reply('❌ Class not found.');

  if (cronJobs.has(`lec_${schedule._id}`)) {
    cronJobs.get(`lec_${schedule._id}`).stop();
    cronJobs.delete(`lec_${schedule._id}`);
  }

  await db.collection('lectures').deleteOne({ _id: schedule._id });
  await msg.reply(`✅ Cancelled: ${schedule.title}`);
}

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

export default {
  name: 'AI Lecturer',
  description: 'AI lecture system (Robust)',
  category: 'education',
  version: '5.1.0',

  commands: ['lecture', 'schedule-lecture', 'lectures', 'cancel-lecture', 'testschedule'],

  async run(context) {
    // Update global sock on every command to keep it fresh
    globalSock = context.sock;
    globalLogger = context.logger;

    switch (context.command) {
      case 'lecture': await cmdLecture(context); break;
      case 'schedule-lecture': await cmdSchedule(context); break;
      case 'lectures': await cmdList(context); break;
      case 'cancel-lecture': await cmdCancel(context); break;
      case 'testschedule': await cmdTestSchedule(context); break;
    }
  },

  async onLoad(context) {
    globalSock = context.sock;
    globalLogger = context.logger;
    const db = await PluginHelpers.getDB();

    globalLogger.info('AI Lecturer: Initializing Scheduler...');

    try {
      const schedules = await db.collection('lectures').find().toArray();
      let loaded = 0;

      for (const schedule of schedules) {
        try {
          const { cronTime } = parseDayTime(schedule.day.toString(), schedule.time, schedule.timezone);

          const success = registerCron(
            `lec_${schedule._id}`,
            cronTime,
            () => runScheduledLecture(schedule._id),
            schedule.timezone
          );
          if (success) loaded++;
        } catch (e) {
          globalLogger.error(`Failed to load schedule ${schedule.title}: ${e.message}`);
        }
      }
      globalLogger.info(`AI Lecturer: Restored ${loaded} schedules`);
    } catch (e) {
      globalLogger.error('AI Lecturer Init Error:', e);
    }
  }
};