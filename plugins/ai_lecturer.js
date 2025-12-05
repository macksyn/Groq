// plugins/ai_lecturer.js - Enhanced with Fallback API System
import axios from 'axios';
import cron from 'node-cron';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // API Configuration with Fallback
  PRIMARY_API_URL: 'https://malvin-api.vercel.app/ai/gpt-5',
  FALLBACK_API_URL: 'https://malvin-api.vercel.app/ai/venice',

  API_TIMEOUT: 60000,
  DEFAULT_TIMEZONE: 'Africa/Lagos',
  MAX_SESSIONS: 52,

  // Random greetings for variety lectures
  VARIETY_GREETINGS: [
    "Good day, everyone! 👋 I hope this message finds you well. Let's dive into something fascinating today.",
    "Hello, class! 🎓 I trust you've all had a productive week. Today, we're exploring an exciting topic.",
    "Greetings, brilliant minds! ✨ I've been looking forward to this session. Shall we begin?",
    "Welcome back! 🌟 I hope you're ready for today's lecture because we have something special lined up.",
    "Good morning/afternoon! ☀️ It's great to be here with you again. Let's make this session count.",
    "Hey there, scholars! 📚 I'm excited to share today's lecture with you. Let's get started!",
    "Warm greetings, everyone! 🤝 I trust you're all doing well. Today's topic is particularly interesting.",
    "Hello again! 👓 I've prepared something thought-provoking for us today. Ready to learn?",
  ],

  // Random greetings for series lectures
  SERIES_GREETINGS: [
    "Welcome back to our continuing series! 🎓 I hope you've been reflecting on our last session.",
    "Good day, everyone! 📖 It's wonderful to continue this journey with you all.",
    "Hello again, class! 🌟 I'm glad to see us making steady progress together.",
    "Greetings, dedicated learners! 💪 Let's pick up where we left off last week.",
    "Welcome back! 🔄 I trust you've been thinking about what we covered previously.",
    "Good to have you here again! 🎯 We're building something great together, one session at a time.",
    "Hello, persistent scholars! 📈 Our journey continues today with the next piece of the puzzle.",
  ],

  // Random closings for variety lectures
  VARIETY_CLOSINGS: [
    "That's all for today, everyone! 🎓 I hope you found this valuable. Until next time, stay curious!",
    "And with that, we conclude today's session. ✅ Keep thinking, keep learning. See you next week!",
    "That wraps up our lecture! 🌟 Remember to apply what you've learned. Have a great week ahead!",
    "Excellent! We've covered quite a lot today. 💡 Take some time to reflect on this. See you soon!",
    "And that's a wrap for this week! 🎬 I hope this gave you new perspectives. Stay brilliant!",
    "Thank you for your attention! 🙏 Keep exploring these ideas on your own. Until we meet again!",
    "That concludes our session! 📚 I trust you'll put this knowledge to good use. Farewell for now!",
    "Class dismissed! 🔔 Remember, learning doesn't stop here. Keep that curiosity alive!",
  ],

  // Random closings for series lectures (with next week tease)
  SERIES_CLOSINGS: [
    "That brings us to the end of Part {session}! 🎓 Next week, we'll explore {preview}. See you then!",
    "Excellent work today! ✅ We've covered {session} parts so far. Next week: {preview}. Stay tuned!",
    "And that's Part {session} complete! 🌟 Coming up next week: {preview}. Don't miss it!",
    "Well done, everyone! 💪 We're making real progress. Next session, we tackle {preview}. See you!",
    "That wraps up today's segment! 🎯 Next week's focus: {preview}. Keep building on what we've learned!",
    "Part {session} is in the books! 📖 Up next: {preview}. I'm excited to continue this journey with you!",
    "Great session today! ⭐ We're {session} steps in. Next week brings {preview}. Stay engaged!",
  ],

  LECTURERS: [
    {
      id: 'prof_alex',
      name: 'Prof. Alex Macksyn',
      style: 'Witty Lagos Academic prof',
      prompt: 'You\'re Prof. Alex - modern naija intellectual. Makes complex topics relatable with contemporary Nigerian realities. Natural flow, 5-7 emojis. Bold key terms.'
    },
    {
      id: 'dr_evelyn',
      name: 'Dr. Evelyn Hayes',
      style: 'British academic',
      prompt: 'You\'re Dr. Hayes - sharp British scholar. "Right then..." Precise, british slangs, sophisticated. Examples + evidence. 4-6 emojis. Bold key terms.'
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
      prompt: 'Role: Ada, a brilliant Lagos graduate. Smart, fast-paced, and ambitious. Lecture with **Lagos startup culture** (remote work, funding, coffee). Avoid childish slang; use witty **"relatable Twitter"** vibes. **Bold key terms**. 5 emojis 💻🚀⚡.'
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
      id: 'j.t_obinna',
      name: 'J.T Obinna',
      style: 'Shrewd Commercial Strategist',
      prompt: 'Role: J.T Obinna, an educated Business Mogul. Tone: Pragmatic, calculating, and value-driven. Analyze topics with **street-smarts logic**. Dismiss fluff; ask "Is it viable?" **Bold valuation strategy terms**. 4 emojis 💼🤝🏾💰🏗️.'
    },
    {
      id: 'wole_soyinka',
      name: 'Wole Soyinka',
      style: 'Grandiloquent Literary Icon',
      prompt: 'Role: A Soyinka-esque literary giant. Tone: Operatic, sophisticated, and fierce. Use **esoteric vocabulary** (grandiloquence) and **dense metaphors**. Critique the topic with intense gravity. Avoid simplicity; embrace **linguistic complexity**. **Bold profound truths**. 3 emojis 🦁✍🏾🎭.'
    },
    {
      id: 'uncle_jide',
      name: 'Uncle Jide',
      prompt: 'Street philosopher. Very very direct. Hustle mindset. 6-8 emojis. Bold terms.'
    },
    {
      id: 'sister_grace',
      name: 'Sister Grace',
      prompt: 'Deep thinker. "Let\'s reflect..." Philosophical, calm wisdom. 4-6 emojis. Bold terms.'
    }
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

function randomFromArray(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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
    .replace(/in the style of.*?[:\s]*/gi, '')
    .replace(/as (prof|dr|uncle|sister|mallam|baba).*?[:\s]*/gi, '')
    .trim();
  return clean.replace(/\n{3,}/g, '\n\n');
}

/**
 * Helper to make the API call with specific parameters
 */
async function callAIEndpoint(url, prompt) {
  return await axios.get(url, {
    params: { text: prompt },
    timeout: CONFIG.API_TIMEOUT
  });
}

async function generateLecture(lecturer, topic, mode, sessionNum, prevTopics, prevSummary = null) {
  let userPrompt = '';

  if (mode === 'variety') {
    const avoid = prevTopics.length > 0 ? `Avoid: ${prevTopics.slice(-3).join(', ')}. ` : '';
    userPrompt = `${topic} - Session ${sessionNum}\n${avoid}Pick NEW engaging topic. 1600-1800 words. Hook → 5 points → tips → close. DO NOT include greeting or closing. Start directly with content.`;
  } else {
    const recap = prevSummary ? `Last week we covered: "${prevSummary}". ` : '';
    userPrompt = `${topic} - Part ${sessionNum}\n${recap}Teach progressively. ${sessionNum === 1 ? 'Intro + roadmap.' : 'Build on previous.'} 1500-1700 words. DO NOT include greeting or closing. End with a brief teaser of what comes next (1 sentence). Start directly with content.`;
  }

  const fullPrompt = `${lecturer.prompt}\n\n${userPrompt}`;

  let rawResponse = null;
  let usedSource = 'PRIMARY';

  try {
    // Attempt 1: Primary API
    const response = await callAIEndpoint(CONFIG.PRIMARY_API_URL, fullPrompt);
    rawResponse = response.data?.response || response.data?.result || response.data?.answer;
  } catch (primaryError) {
    // Log the failure but don't crash yet
    console.warn(`[AI Lecturer] Primary API failed: ${primaryError.message}. Switching to fallback...`);

    try {
      // Attempt 2: Fallback API
      usedSource = 'FALLBACK';
      const response = await callAIEndpoint(CONFIG.FALLBACK_API_URL, fullPrompt);
      rawResponse = response.data?.response || response.data?.result || response.data?.answer;
    } catch (fallbackError) {
      // Both failed, throw a combined error
      throw new Error(`All AI sources failed. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`);
    }
  }

  if (!rawResponse || rawResponse.length < 100) {
    throw new Error(`AI (${usedSource}) returned empty or too short response`);
  }

  return cleanAIResponse(rawResponse.trim());
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
      break;
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

  if (!globalSock) {
    globalLogger?.error('Skipping scheduled lecture: No socket connection');
    return;
  }

  let schedule = null;

  try {
    schedule = await db.collection('lectures').findOne({ _id: scheduleId });
    if (!schedule) return;

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
    const prevSummary = schedule.lastSummary || null;

    // Generate lecture content
    const script = await generateLecture(
      schedule.lecturer,
      schedule.title,
      schedule.mode,
      schedule.session,
      prevTopics,
      prevSummary
    );

    // Extract current topic for variety mode
    let currentTopic = null;
    if (schedule.mode === 'variety') {
      const match = script.match(/(?:today|this week).{0,80}[:\n]/i);
      if (match) currentTopic = match[0].replace(/(?:today|this week)[:\s]*/i, '').trim();
    }

    // Extract preview for series mode
    let preview = 'the next topic in our series';
    const previewMatch = script.match(/(?:next|coming up|up next|we'll explore|we'll cover|we'll discuss)[:\s]+([^.!?\n]+)/i);
    if (previewMatch) {
      preview = previewMatch[1].trim().slice(0, 60);
    }

    // Choose random greeting
    const greeting = schedule.mode === 'variety' 
      ? randomFromArray(CONFIG.VARIETY_GREETINGS)
      : randomFromArray(CONFIG.SERIES_GREETINGS);

    // Choose random closing
    let closing;
    if (schedule.mode === 'variety') {
      closing = randomFromArray(CONFIG.VARIETY_CLOSINGS);
    } else {
      closing = randomFromArray(CONFIG.SERIES_CLOSINGS)
        .replace('{session}', schedule.session)
        .replace('{preview}', preview);
    }

    // Deliver header
    const label = schedule.mode === 'variety' ? 'SESSION' : 'PART';
    await globalSock.sendMessage(schedule.groupId, {
      text: `🎓 *${schedule.title.toUpperCase()} - ${label} ${schedule.session}*\n\n*Professor:* ${schedule.lecturer.name}\n${'─'.repeat(35)}`
    });

    await sleep(1000);

    // Send greeting
    await globalSock.sendMessage(schedule.groupId, { text: greeting });
    await sleep(2000);

    // Add recap for series lectures (not first session)
    if (schedule.mode === 'course' && schedule.session > 1 && prevSummary) {
      const recap = `📌 *Quick Recap:* Last week, we covered ${prevSummary}. Let's build on that today.`;
      await globalSock.sendMessage(schedule.groupId, { text: recap });
      await sleep(2000);
    }

    // Deliver main lecture content
    await deliverWithTyping(globalSock, schedule.groupId, script);

    await sleep(2000);

    // Send closing
    await globalSock.sendMessage(schedule.groupId, { text: closing });

    await sleep(1000);

    // Final footer
    const next = schedule.session + 1;
    await globalSock.sendMessage(schedule.groupId, {
      text: `${'─'.repeat(35)}\n🎓 *END ${label} ${schedule.session}*\n_${next <= CONFIG.MAX_SESSIONS ? 'See you next week!' : 'Course Complete!'}_`
    });

    // Generate summary for series mode
    let summary = null;
    if (schedule.mode === 'course') {
      summary = script.slice(0, 150).replace(/[*_~`]/g, '') + '...';
    }

    // Update DB
    const newTopics = schedule.mode === 'variety' && currentTopic 
      ? [...prevTopics, currentTopic].slice(-10) 
      : prevTopics;

    await db.collection('lectures').updateOne(
      { _id: scheduleId },
      { 
        $set: { 
          session: next, 
          previousTopics: newTopics, 
          lastSummary: summary,
          lastRun: new Date() 
        } 
      }
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
    const greeting = randomFromArray(CONFIG.VARIETY_GREETINGS);
    const closing = randomFromArray(CONFIG.VARIETY_CLOSINGS);

    await sock.sendMessage(msg.from, {
      text: `🎓 *LECTURE START*\n\n*Topic:* ${text}\n*Prof:* ${lecturer.name}\n${'─'.repeat(35)}`,
      edit: loading.key
    });

    await sleep(1000);
    await sock.sendMessage(msg.from, { text: greeting });
    await sleep(2000);
    await deliverWithTyping(sock, msg.from, script);
    await sleep(2000);
    await sock.sendMessage(msg.from, { text: closing });
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

  globalSock = sock;

  try {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) throw new Error('Format: Title | Day | Time | Mode');

    const [title, dayStr, timeStr, modeStr] = parts;
    const mode = modeStr === 'course' ? 'course' : 'variety';
    const { day, time, timezone, cronTime } = parseDayTime(dayStr, timeStr, parts[4]);

    // Check duplicates with case-insensitive match
    const titleLower = title.toLowerCase().trim();
    const exists = await db.collection('lectures').findOne({ 
      groupId: msg.from
    });

    // Manual check for case-insensitive duplicate
    if (exists) {
      const allSchedules = await db.collection('lectures').find({ groupId: msg.from }).toArray();
      const duplicate = allSchedules.find(s => s.title.toLowerCase().trim() === titleLower);

      if (duplicate) {
        throw new Error(
          `Lecture "${duplicate.title}" already exists.\n\n` +
          `Use: \`.cancel ${duplicate.title}\` to remove it first.`
        );
      }
    }

    const lecturer = randomLecturer();
    const schedule = {
      groupId: msg.from,
      title: title.trim(), // Store cleaned title
      mode, day, time, timezone,
      session: 1, lecturer, 
      previousTopics: [],
      lastSummary: null,
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
    const modeLabel = mode === 'course' ? 'Course Series' : 'Weekly Topics';

    await msg.reply(
      `✅ *Class Scheduled!*\n\n` +
      `*Subject:* ${title}\n` +
      `*Type:* ${modeLabel}\n` +
      `*Prof:* ${lecturer.name}\n` +
      `*Time:* Every ${dayName} @ ${time} (${timezone})\n` +
      `*Next:* I will send a message when class starts.`
    );

  } catch (error) {
    await msg.reply(`❌ Schedule Failed:\n${error.message}\n\nTry: \`.schedule BizTalk | Friday | 14:00 | variety\``);
  }
}

async function cmdTestSchedule(context) {
  const { msg, text, sock } = context;
  if (!context.isAdmin) return;

  const db = await PluginHelpers.getDB();
  const schedule = await db.collection('lectures').findOne({ groupId: msg.from });

  if (!schedule) return msg.reply('No schedules found in this group.');

  await msg.reply(`🧪 Force running: ${schedule.title}...`);
  globalSock = sock;
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
    const type = s.mode === 'course' ? '📖 Course' : '🎯 Weekly';
    reply += `\n*${s.title}*\n├ 🕒 ${day} @ ${s.time}\n├ ${type}\n└ 👨‍🏫 ${s.lecturer.name}\n`;
  }
  await msg.reply(reply);
}

async function cmdCancel(context) {
  const { msg, text } = context;
  if (!text) return msg.reply('Usage: .cancel <Title>');

  const db = await PluginHelpers.getDB();

  // First, let's see all schedules to debug
  const allSchedules = await db.collection('lectures').find({ groupId: msg.from }).toArray();

  if (allSchedules.length === 0) {
    return msg.reply('❌ No lectures scheduled in this group.');
  }

  // Try exact case-insensitive match first
  const searchTitle = text.trim().toLowerCase();
  let schedule = allSchedules.find(s => s.title.toLowerCase() === searchTitle);

  // If not found, try partial match
  if (!schedule) {
    schedule = allSchedules.find(s => s.title.toLowerCase().includes(searchTitle));
  }

  // If still not found, show available options
  if (!schedule) {
    const availableTitles = allSchedules.map(s => `• ${s.title}`).join('\n');
    return msg.reply(
      `❌ Lecture not found: "${text}"\n\n` +
      `*Available lectures:*\n${availableTitles}\n\n` +
      `*Tip:* Copy the exact title or use partial match.`
    );
  }

  // Stop cron job
  if (cronJobs.has(`lec_${schedule._id}`)) {
    cronJobs.get(`lec_${schedule._id}`).stop();
    cronJobs.delete(`lec_${schedule._id}`);
  }

  // Delete from database
  await db.collection('lectures').deleteOne({ _id: schedule._id });
  await msg.reply(`✅ *Cancelled Successfully*\n\n*Lecture:* ${schedule.title}\n*Professor:* ${schedule.lecturer.name}`);
}

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

export default {
  name: 'AI Lecturer',
  description: 'AI lecture system with dynamic greetings, series continuity & fallback API',
  category: 'education',
  version: '6.1.0',

  commands: ['lecture', 'schedule-lecture', 'lectures', 'cancel-lecture', 'testschedule'],

  async run(context) {
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