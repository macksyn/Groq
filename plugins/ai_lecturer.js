// plugins/ai_lecturer.js - Clean Production Version
import axios from 'axios';
import cron from 'node-cron';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  API_URL: 'https://malvin-api.vercel.app/ai/gpt-5',
  API_TIMEOUT: 50000,
  DEFAULT_TIMEZONE: 'Africa/Lagos',
  MAX_SESSIONS: 52,

  // 10 Lecturers with distinct personalities
  LECTURERS: [
    { name: 'Prof. Alex Macksyn', prompt: 'Street-smart Lagos prof. Fun but smart. Use NEPA, danfo examples. 5-7 emojis. Bold key terms.' },
    { name: 'Dr. Evelyn Hayes', prompt: 'Sharp British academic. "Right then..." Data-driven, sophisticated. 4-6 emojis. Bold terms.' },
    { name: 'Baba Adegoke', prompt: 'Wise elder storyteller. Use proverbs, Nigerian wisdom. "My children..." 5-7 emojis. Bold terms.' },
    { name: 'Ada Eze', prompt: 'Gen-Z tech sis. Modern slang (no cap, slay). Tech/startup vibes. 6-9 emojis. Bold terms.' },
    { name: 'Mallam Garba', prompt: 'Patient Northern teacher. "Slowly..." Step-by-step, calm. 4-6 emojis. Bold terms.' },
    { name: 'Dr. Funke Alabi', prompt: 'No-nonsense Lagos aunty. "Sit up!" Sharp, high standards. 5-7 emojis. Bold terms.' },
    { name: 'Chike Okonkwo', prompt: 'Data analyst. "The numbers show..." Facts, zero fluff. 3-5 emojis. Bold terms.' },
    { name: 'Prof. Okon', prompt: 'Strict professor. "Open your books." Formal, authoritative. 3-5 emojis. Bold terms.' },
    { name: 'Uncle Jide', prompt: 'Street philosopher. "See ehn..." Use pidgin. Hustle mindset. 6-8 emojis. Bold terms.' },
    { name: 'Sister Grace', prompt: 'Deep thinker. "Let\'s reflect..." Philosophical, calm wisdom. 4-6 emojis. Bold terms.' }
  ]
};

// Global state for cron jobs and references
const cronJobs = new Map();
let sock = null;
let logger = null;

// ============================================================================
// UTILITIES
// ============================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function randomLecturer() {
  return CONFIG.LECTURERS[Math.floor(Math.random() * CONFIG.LECTURERS.length)];
}

function cleanAIResponse(text) {
  if (!text) return '';

  // Remove AI meta-talk
  let clean = text
    .replace(/^(here'?s?|here is|let me).{0,50}[:\n]/gi, '')
    .replace(/would you like.{0,50}[\?\n]/gi, '')
    .replace(/shall i continue.{0,50}[\?\n]/gi, '')
    .replace(/\*\*note:?\*\*.{0,100}/gi, '')
    .trim();

  return clean.replace(/\n{3,}/g, '\n\n');
}

async function generateLecture(lecturer, topic, mode, sessionNum, prevTopics) {
  try {
    let userPrompt = '';

    if (mode === 'variety') {
      // Different topic each week
      const avoid = prevTopics.length > 0 ? `Avoid: ${prevTopics.slice(-3).join(', ')}. ` : '';
      userPrompt = `${topic} - Session ${sessionNum}\n${avoid}Pick NEW engaging topic. 600-800 words. Hook → 3 points → tips → close. Start now.`;
    } else {
      // Progressive course
      userPrompt = `${topic} - Part ${sessionNum}\nTeach progressively. ${sessionNum === 1 ? 'Intro + roadmap.' : 'Build on previous.'} 500-700 words. Start now.`;
    }

    const fullPrompt = `${lecturer.prompt}\n\n${userPrompt}`;

    const response = await axios.get(CONFIG.API_URL, {
      params: { text: fullPrompt },
      timeout: CONFIG.API_TIMEOUT
    });

    const raw = response.data?.response || response.data?.result || response.data?.answer;
    if (!raw || raw.length < 100) throw new Error('Empty response');

    return cleanAIResponse(raw.trim());
  } catch (error) {
    throw new Error(`Generation failed: ${error.message}`);
  }
}

async function deliverWithTyping(sock, jid, text, logger) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    const typingTime = Math.min(12000, Math.max(2000, sentence.length * 50));

    await sock.sendPresenceUpdate('composing', jid);
    await sleep(typingTime);
    await sock.sendMessage(jid, { text: sentence });

    if (i < sentences.length - 1) {
      await sleep(1500);
    }
  }

  await sock.sendPresenceUpdate('paused', jid);
}

// ============================================================================
// SCHEDULING
// ============================================================================

function parseDayTime(dayStr, timeStr, tzStr) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  let day = /^\d+$/.test(dayStr) ? parseInt(dayStr) : days.indexOf(dayStr.toLowerCase());
  if (day < 0 || day > 6) throw new Error('Invalid day (use 0-6 or Sunday-Saturday)');

  if (!/^\d{2}:\d{2}$/.test(timeStr)) throw new Error('Time must be HH:MM (e.g., 14:30)');

  const [hour, min] = timeStr.split(':').map(Number);
  if (hour > 23 || min > 59) throw new Error('Invalid time');

  const tz = tzStr || CONFIG.DEFAULT_TIMEZONE;
  try {
    new Date().toLocaleString('en-US', { timeZone: tz });
  } catch (e) {
    throw new Error(`Invalid timezone: ${tz}`);
  }

  return { day, time: timeStr, timezone: tz, cronTime: `${min} ${hour} * * ${day}` };
}

function registerCron(id, cronTime, handler, tz) {
  try {
    if (cronJobs.has(id)) {
      cronJobs.get(id).stop();
    }

    const job = cron.schedule(cronTime, handler, { scheduled: true, timezone: tz });
    cronJobs.set(id, job);
    return true;
  } catch (error) {
    logger?.error({ err: error }, 'Cron registration failed');
    return false;
  }
}

function cancelCron(id) {
  if (cronJobs.has(id)) {
    cronJobs.get(id).stop();
    cronJobs.delete(id);
    return true;
  }
  return false;
}

async function runScheduledLecture(scheduleId) {
  const db = await PluginHelpers.getDB();

  try {
    const schedule = await db.collection('lectures').findOne({ _id: scheduleId });
    if (!schedule) return;

    if (schedule.session > CONFIG.MAX_SESSIONS) {
      await sock.sendMessage(schedule.groupId, {
        text: `🎓 *${schedule.title}* complete!\n\nAll ${CONFIG.MAX_SESSIONS} sessions delivered. 🎉`
      });
      return;
    }

    const prevTopics = schedule.previousTopics || [];
    const script = await generateLecture(
      schedule.lecturer,
      schedule.title,
      schedule.mode,
      schedule.session,
      prevTopics
    );

    // Extract topic if variety mode
    let currentTopic = null;
    if (schedule.mode === 'variety') {
      const match = script.match(/(?:today|this week).{0,80}[:\n]/i);
      if (match) {
        currentTopic = match[0].replace(/(?:today|this week)[:\s]*/i, '').trim();
      }
    }

    // Send header
    const label = schedule.mode === 'variety' ? 'SESSION' : 'PART';
    await sock.sendMessage(schedule.groupId, {
      text: `🎓 *${schedule.title.toUpperCase()} - ${label} ${schedule.session}*\n\n*Professor:* ${schedule.lecturer.name}\n${'─'.repeat(35)}`
    });

    // Deliver
    await deliverWithTyping(sock, schedule.groupId, script, logger);

    // Footer
    await sleep(2000);
    const next = schedule.session + 1;
    await sock.sendMessage(schedule.groupId, {
      text: `${'─'.repeat(35)}\n🎓 *END ${label} ${schedule.session}*\n\n_${next <= CONFIG.MAX_SESSIONS ? `${label} ${next} next week!` : 'Series complete!'}_`
    });

    // Update database
    const newTopics = schedule.mode === 'variety' && currentTopic 
      ? [...prevTopics, currentTopic].slice(-10) 
      : prevTopics;

    await db.collection('lectures').updateOne(
      { _id: scheduleId },
      { 
        $set: { 
          session: next, 
          previousTopics: newTopics,
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
    logger.error({ err: error }, 'Scheduled lecture failed');

    await db.collection('lecture_logs').insertOne({
      scheduleId,
      session: schedule.session,
      status: 'failed',
      error: error.message,
      date: new Date()
    });
  }
}

// ============================================================================
// COMMANDS
// ============================================================================

async function cmdLecture(context) {
  const { msg, text, sock, config, logger } = context;

  if (!text) {
    return msg.reply(`*Usage:* ${config.PREFIX}lecture <topic>\n\n*Example:* ${config.PREFIX}lecture Bitcoin explained`);
  }

  const lecturer = randomLecturer();

  await msg.react('🎓');
  const loading = await msg.reply(`🎓 Preparing lecture...\n\n*Topic:* ${text}\n*Prof:* ${lecturer.name}`);

  try {
    const script = await generateLecture(lecturer, text, 'variety', 1, []);

    await sock.sendMessage(msg.from, {
      text: `🎓 *LECTURE START*\n\n*Topic:* ${text}\n*Prof:* ${lecturer.name}\n${'─'.repeat(35)}`,
      edit: loading.key
    });

    await deliverWithTyping(sock, msg.from, script, logger);

    await sleep(2000);
    await sock.sendMessage(msg.from, {
      text: `${'─'.repeat(35)}\n🎓 *LECTURE END*`
    });

  } catch (error) {
    logger.error({ err: error }, 'Manual lecture failed');
    await sock.sendMessage(msg.from, {
      text: `❌ Failed: ${error.message}`,
      edit: loading.key
    });
  }
}

async function cmdSchedule(context) {
  const { msg, text, sock, logger } = context;
  const db = await PluginHelpers.getDB();

  try {
    const parts = text.split('|').map(p => p.trim());

    if (parts.length < 3) {
      return msg.reply(
        `📅 *Schedule Lecture*\n\n` +
        `*Format:* \`.schedule <title> | <day> | <time> | [mode]\`\n\n` +
        `*Modes:*\n` +
        `• *variety* (default) - Different topic each week\n` +
        `  Example: Relationship Gist, BizTalk, Health Talk\n\n` +
        `• *course* - Progressive curriculum\n` +
        `  Example: Python, History, Business Strategy\n\n` +
        `*Examples:*\n` +
        `\`.schedule Relationship Gist | Tuesday | 10:00\`\n` +
        `\`.schedule BizTalk | Wednesday | 15:00 | variety\`\n` +
        `\`.schedule Python | Monday | 14:00 | course\``
      );
    }

    const [title, dayStr, timeStr, modeStr] = parts;
    const mode = modeStr === 'course' ? 'course' : 'variety';

    const { day, time, timezone, cronTime } = parseDayTime(dayStr, timeStr, parts[4]);
    const lecturer = randomLecturer();

    const schedule = {
      groupId: msg.from,
      title,
      mode,
      day,
      time,
      timezone,
      session: 1,
      lecturer,
      previousTopics: [],
      lastRun: null,
      createdAt: new Date()
    };

    const result = await db.collection('lectures').insertOne(schedule);
    const scheduleId = result.insertedId;

    const success = registerCron(
      `lec_${scheduleId}`,
      cronTime,
      () => runScheduledLecture(scheduleId),
      timezone
    );

    if (!success) {
      await db.collection('lectures').deleteOne({ _id: scheduleId });
      throw new Error('Failed to register schedule');
    }

    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];

    await msg.reply(
      `✅ *Scheduled*\n\n` +
      `*Title:* ${title}\n` +
      `*Mode:* ${mode === 'variety' ? '🎲 Variety' : '📚 Course'}\n` +
      `*Professor:* ${lecturer.name}\n` +
      `*When:* Every ${dayName} at ${time}\n` +
      `*Timezone:* ${timezone}\n\n` +
      `${mode === 'variety' ? 'Fresh topic each week!' : 'Progressive learning!'}`
    );

  } catch (error) {
    logger.error({ err: error }, 'Schedule failed');
    await msg.reply(`❌ Failed: ${error.message}`);
  }
}

async function cmdList(context) {
  const { msg } = context;
  const db = await PluginHelpers.getDB();

  const schedules = await db.collection('lectures')
    .find({ groupId: msg.from })
    .sort({ title: 1 })
    .toArray();

  if (schedules.length === 0) {
    return msg.reply('📚 No active lectures.\n\nUse `.schedule` to create one.');
  }

  let reply = `📚 *Active Lectures (${schedules.length})*\n`;

  for (const s of schedules) {
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.day];
    const mode = s.mode === 'variety' ? '🎲' : '📚';

    reply += `\n${'─'.repeat(30)}\n` +
             `*${s.title}*\n` +
             `├ ${mode} ${s.mode}\n` +
             `├ Prof: ${s.lecturer.name}\n` +
             `├ Next: Session ${s.session}/${CONFIG.MAX_SESSIONS}\n` +
             `└ When: ${day} @ ${s.time}`;
  }

  await msg.reply(reply);
}

async function cmdCancel(context) {
  const { msg, text } = context;
  const db = await PluginHelpers.getDB();

  if (!text) {
    return msg.reply('*Usage:* `.cancel <title>`\n\n*Example:* `.cancel Relationship Gist`');
  }

  const schedule = await db.collection('lectures').findOne({
    groupId: msg.from,
    title: { $regex: new RegExp(`^${text}$`, 'i') }
  });

  if (!schedule) {
    return msg.reply(`❌ No lecture found: "${text}"`);
  }

  cancelCron(`lec_${schedule._id}`);
  await db.collection('lectures').deleteOne({ _id: schedule._id });
  await db.collection('lecture_logs').deleteMany({ scheduleId: schedule._id });

  await msg.reply(
    `✅ *Cancelled*\n\n` +
    `*Title:* ${schedule.title}\n` +
    `*Sessions Delivered:* ${schedule.session - 1}/${CONFIG.MAX_SESSIONS}`
  );
}

async function cmdHistory(context) {
  const { msg, text } = context;
  const db = await PluginHelpers.getDB();

  if (!text) {
    return msg.reply('*Usage:* `.history <title>`\n\n*Example:* `.history Relationship Gist`');
  }

  const schedule = await db.collection('lectures').findOne({
    groupId: msg.from,
    title: { $regex: new RegExp(`^${text}$`, 'i') }
  });

  if (!schedule) {
    return msg.reply(`❌ No lecture found: "${text}"`);
  }

  const logs = await db.collection('lecture_logs')
    .find({ scheduleId: schedule._id })
    .sort({ date: -1 })
    .limit(10)
    .toArray();

  if (logs.length === 0) {
    return msg.reply(`📜 No history for "${text}"`);
  }

  let reply = `📜 *History: ${schedule.title}*\n` +
              `*Mode:* ${schedule.mode === 'variety' ? '🎲 Variety' : '📚 Course'}\n` +
              `*Professor:* ${schedule.lecturer.name}\n`;

  for (const log of logs) {
    const icon = log.status === 'success' ? '✅' : '❌';
    const date = new Date(log.date).toLocaleDateString('en-GB');

    reply += `\n${icon} Session ${log.session} - ${date}`;
    if (log.topic) reply += `\n   └ ${log.topic}`;
    if (log.error) reply += `\n   └ Error: ${log.error.substring(0, 40)}`;
  }

  await msg.reply(reply);
}

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

export default {
  name: 'AI Lecturer',
  description: 'AI lecture system with 10 personalities, variety & course modes',
  category: 'education',
  version: '5.0.0',
  author: 'Claude',

  commands: ['lecture', 'schedule', 'lectures', 'cancel', 'history'],
  aliases: ['teach', 'schedule-lecture', 'list-lectures', 'cancel-lecture', 'lecture-history'],

  usage: '.lecture <topic> | .schedule <title> | <day> | <time> | [mode]',
  example: '.lecture Crypto explained\n.schedule Relationship Gist | Tuesday | 10:00\n.schedule Python | Monday | 14:00 | course',

  adminOnly: true,
  groupOnly: true,

  async run(context) {
    const { command } = context;

    switch (command) {
      case 'lecture':
      case 'teach':
        await cmdLecture(context);
        break;
      case 'schedule':
      case 'schedule-lecture':
        await cmdSchedule(context);
        break;
      case 'lectures':
      case 'list-lectures':
        await cmdList(context);
        break;
      case 'cancel':
      case 'cancel-lecture':
        await cmdCancel(context);
        break;
      case 'history':
      case 'lecture-history':
        await cmdHistory(context);
        break;
    }
  },

  async onLoad(context) {
    sock = context.sock;
    logger = context.logger;
    const db = await PluginHelpers.getDB();

    logger.info('AI Lecturer: Loading...');

    try {
      // Create indexes
      await db.collection('lectures').createIndex({ groupId: 1, title: 1 }, { unique: true });
      await db.collection('lecture_logs').createIndex({ scheduleId: 1, date: -1 });

      // Load all schedules
      const schedules = await db.collection('lectures').find().toArray();

      if (schedules.length === 0) {
        logger.info('AI Lecturer: No schedules');
        return;
      }

      let loaded = 0;

      for (const schedule of schedules) {
        try {
          const { cronTime } = parseDayTime(
            schedule.day.toString(),
            schedule.time,
            schedule.timezone
          );

          const success = registerCron(
            `lec_${schedule._id}`,
            cronTime,
            () => runScheduledLecture(schedule._id),
            schedule.timezone
          );

          if (success) loaded++;
        } catch (error) {
          logger.error({ err: error, title: schedule.title }, 'Load failed');
        }
      }

      logger.info(`AI Lecturer: Loaded ${loaded}/${schedules.length} schedules`);

    } catch (error) {
      logger.error({ err: error }, 'AI Lecturer: Init failed');
    }
  }
};