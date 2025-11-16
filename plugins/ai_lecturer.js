//
// 🎲 VARIETY MODE (Default) - Fresh Topics Each Week
// ---------------------------------------------------
// Perfect for: Talk shows, discussion series, weekly segments
// Each session = Standalone topic within the category
// No continuity required - anyone can join any week
//
// Examples:
// • "Relationship Gist" (Tuesdays)
//   Week 1: Communication in modern relationships
//   Week 2: Building trust and setting boundaries
//   Week 3: Handling conflicts effectively
//   Week 4: Love languages explained
//   (Each week = completely different topic!)
//
// • "BizTalk" (Wednesdays)
//   Week 1: Starting a side hustle in Nigeria
//   Week 2: Digital marketing on a budget
//   Week 3: Managing business finances
//   Week 4: Customer retention strategies
//
// • "Sex Education / Freaky Gist" (Thursdays)
//   Week 1: Understanding consent
//   Week 2: Sexual health basics
//   Week 3: Relationship intimacy
//   Week 4: Safe practices
//
// • "Health Talk" (Fridays)
//   Week 1: Nutrition myths debunked
//   Week 2: Mental health awareness
//   Week 3: Exercise for beginners
//   Week 4: Sleep hygiene tips
//
// 📚 COURSE MODE - Progressive Learning
// --------------------------------------
// Perfect for: Skills, subjects, structured learning
// Each part builds on previous ones
// Students should follow from Part 1
//
// Examples:
// • "Python Programming"
//   Part 1: What is Python? Setup & basics
//   Part 2: Variables and data types
//   Part 3: Control flow (if/else, loops)
//   Part 10: Object-oriented programming
//   (Each part builds on previous knowledge!)
//
// • "Nigerian History"
//   Part 1: Overview and importance
//   Part 2: Pre-colonial kingdoms
//   Part 5: Colonial era
//   Part 15: Independence movement
//
// HOW TO SCHEDULE:
// ================
// VARIETY: .schedule Relationship Gist | Tuesday | 10:00
// COURSE:  .schedule Python | Monday | 10:00 | course

import axios from 'axios';
import { PluginHelpers } from '../lib/pluginIntegration.js';
import cron from 'node-cron';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  API_URL: 'https://malvin-api.vercel.app/ai/gpt-5',
  API_TIMEOUT: 50000,
  DEFAULT_TIMEZONE: 'Africa/Lagos',
  MAX_PARTS: 52,

  TYPING: {
    CHAR_MIN: 35,
    CHAR_MAX: 70,
    SENTENCE_PAUSE_MIN: 1200,
    SENTENCE_PAUSE_MAX: 2500,
    REFRESH_INTERVAL: 2800
  },

  LECTURERS: [
    {
      id: 'prof_alex',
      name: 'Prof. Alex Macksyn',
      style: 'Street-smart Lagos prof',
      prompt: 'You\'re Prof. Alex - cool Lagos lecturer. Use Nigerian vibes (NEPA, danfo, jollof debates). Fun but smart. Natural flow, 5-7 emojis. Bold key terms.'
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
      style: 'Elder storyteller',
      prompt: 'You\'re Baba Adegoke - wise elder. "My children..." Use proverbs, Nigerian folk wisdom. Stories teach lessons. Warm grandpa vibes. 5-7 emojis. Bold terms.'
    },
    {
      id: 'ada_coder',
      name: 'Ada "Tech Sis" Eze',
      style: 'Gen-Z tech enthusiast',
      prompt: 'You\'re Ada - young tech sis! Modern slang (no cap, it\'s giving, slay). Link to startups/crypto/AI. High energy! 6-9 emojis. Bold terms.'
    },
    {
      id: 'mr_garba',
      name: 'Mallam Garba',
      style: 'Patient Northern teacher',
      prompt: 'You\'re Mallam Garba - calm Northern teacher. "Slowly, let us understand..." Patient, step-by-step. Simple clarity. Encouraging. 4-6 emojis. Bold terms.'
    },
    {
      id: 'dr_funke',
      name: 'Dr. Funke Alabi',
      style: 'No-nonsense Lagos aunty',
      prompt: 'You\'re Dr. Funke - Lagos Big Aunty. "Sit up! This is serious." Sharp, sophisticated, high standards. Tough love. 5-7 emojis. Bold terms.'
    },
    {
      id: 'chike_analyst',
      name: 'Chike "Numbers Guy"',
      style: 'Data-driven analyst',
      prompt: 'You\'re Chike - data analyst. "The numbers show..." Facts, stats, bottom line. Zero fluff. Actionable insights. 3-5 emojis. Bold terms.'
    },
    {
      id: 'prof_okon',
      name: 'Prof. (Mrs.) Okon',
      style: 'Strict academic',
      prompt: 'You\'re Prof. Okon - strict professor. "Open your books." Formal, authoritative, encyclopedic. Respected elder. "Is that clear?" 3-5 emojis. Bold terms.'
    },
    {
      id: 'uncle_jide',
      name: 'Uncle Jide',
      style: 'Street hustler philosopher',
      prompt: 'You\'re Uncle Jide - street philosopher. "See ehn..." Use pidgin naturally. Link to hustle/business. Smart but street. 6-8 emojis. Bold terms.'
    },
    {
      id: 'sister_grace',
      name: 'Sister Grace',
      style: 'Reflective thinker',
      prompt: 'You\'re Sister Grace - deep thinker. "Let\'s reflect..." Philosophical, metaphors, multiple angles. Calm wisdom. 4-6 emojis. Bold terms.'
    }
  ]
};

// ============================================================================
// GLOBAL STATE FOR CRON JOBS
// ============================================================================

const activeCronJobs = new Map();
let globalSock = null;
let globalLogger = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function randomLecturer() {
  return CONFIG.LECTURERS[Math.floor(Math.random() * CONFIG.LECTURERS.length)];
}

function calculateTypingTime(text) {
  const chars = text.length;
  const speed = CONFIG.TYPING.CHAR_MIN + Math.random() * (CONFIG.TYPING.CHAR_MAX - CONFIG.TYPING.CHAR_MIN);
  let duration = chars * speed;
  duration += (Math.random() - 0.5) * duration * 0.3;
  return Math.max(1500, Math.min(12000, Math.round(duration)));
}

function calculatePause() {
  return Math.round(
    CONFIG.TYPING.SENTENCE_PAUSE_MIN +
    Math.random() * (CONFIG.TYPING.SENTENCE_PAUSE_MAX - CONFIG.TYPING.SENTENCE_PAUSE_MIN)
  );
}

async function simulateTyping(sock, jid, durationMs, logger) {
  const endTime = Date.now() + durationMs;

  try {
    await sock.sendPresenceUpdate('composing', jid);

    while (Date.now() < endTime) {
      const remaining = endTime - Date.now();
      const wait = Math.min(CONFIG.TYPING.REFRESH_INTERVAL, remaining);

      if (wait > 0) {
        await sleep(wait);
        if (Date.now() < endTime) {
          await sock.sendPresenceUpdate('composing', jid);
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Typing simulation error');
  }
}

function cleanResponse(text) {
  if (!text) return '';

  const patterns = [
    /^(here'?s?|here is|let me (give|provide|deliver)).*?(lecture|content)[:\s]*/gi,
    /^(i'll|i will|i can) (deliver|give|provide|teach).*?[:\s]*/gi,
    /would you like (me to|another|more).*?[\?\s]*/gi,
    /shall i continue.*?[\?\s]*/gi,
    /is there anything else.*?[\?\s]*/gi,
    /let me know if.*?[\.\s]*/gi,
    /\*\*note:?\*\*[^\n]*/gi,
    /\*\*disclaimer:?\*\*[^\n]*/gi,
    /in the style of.*?[:\s]*/gi,
    /as (prof|dr|uncle|sister|mallam|baba).*?[:\s]*/gi
  ];

  let cleaned = text;
  patterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  return cleaned
    .trim()
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*[-•*]\s*/gm, '');
}

async function generateLecture(lecturer, prompt, logger) {
  try {
    logger.info(`Generating lecture with ${lecturer.name}...`);

    const fullPrompt = `${lecturer.prompt}\n\n${prompt}\n\nWrite naturally. NO meta-talk. Start directly.`;

    const response = await axios.get(CONFIG.API_URL, {
      params: { text: fullPrompt },
      timeout: CONFIG.API_TIMEOUT
    });

    const raw = response.data?.response || response.data?.result || response.data?.answer;

    if (!raw || typeof raw !== 'string' || raw.trim().length < 100) {
      throw new Error('API returned empty or invalid response');
    }

    const cleaned = cleanResponse(raw.trim());

    if (cleaned.length < 100) {
      throw new Error('Cleaned response too short');
    }

    logger.info(`Generated ${cleaned.length} chars`);
    return cleaned;

  } catch (error) {
    logger.error({ err: error }, 'Lecture generation failed');
    throw new Error(`Could not generate lecture: ${error.message}`);
  }
}

async function deliverScript(sock, jid, script, logger) {
  const sentences = script
    .replace(/[\r\n]+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0);

  logger.info(`Delivering ${sentences.length} sentences`);

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();

    try {
      const typingTime = calculateTypingTime(sentence);
      await simulateTyping(sock, jid, typingTime, logger);
      await sock.sendMessage(jid, { text: sentence });

      if (i < sentences.length - 1) {
        await sleep(calculatePause());
      }
    } catch (error) {
      logger.error({ err: error, index: i }, 'Failed to send sentence');
      await sleep(800);
    }
  }

  await sock.sendPresenceUpdate('paused', jid);
  logger.info('Delivery complete');
}

function parseSchedule(dayStr, timeStr, tzStr) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  let dayOfWeek;
  if (/^\d+$/.test(dayStr)) {
    dayOfWeek = parseInt(dayStr, 10);
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      throw new Error('Day must be 0-6 (0=Sunday)');
    }
  } else {
    dayOfWeek = days.indexOf(dayStr.toLowerCase());
    if (dayOfWeek === -1) {
      throw new Error('Invalid day. Use day name or 0-6');
    }
  }

  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    throw new Error('Time must be HH:MM (24-hour)');
  }

  const [hour, minute] = timeStr.split(':').map(Number);
  if (hour > 23 || minute > 59) {
    throw new Error('Invalid time (00:00-23:59)');
  }

  const timezone = tzStr || CONFIG.DEFAULT_TIMEZONE;

  try {
    new Date().toLocaleString('en-US', { timeZone: timezone });
  } catch (e) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  return { dayOfWeek, time: timeStr, timezone };
}

function getCronTime(time, dayOfWeek) {
  const [hour, minute] = time.split(':');
  return `${minute} ${hour} * * ${dayOfWeek}`;
}

function getJobId(scheduleId) {
  return `lecture_${scheduleId.toString()}`;
}

async function ensureIndexes(db, logger) {
  try {
    await db.collection('lecture_schedules').createIndex(
      { groupId: 1, subject: 1 },
      { unique: true, collation: { locale: 'en', strength: 2 } }
    );
    await db.collection('lecture_schedules').createIndex({ groupId: 1 });
    await db.collection('lecture_history').createIndex({ scheduleId: 1, deliveredAt: -1 });
    logger.info('Lecture indexes created');
  } catch (error) {
    logger.warn({ err: error }, 'Index creation warning');
  }
}

function buildOneTimePrompt(topic) {
  return `Topic: ${topic}

Structure:
Hook → Core Teaching (3 points with examples) → Practical Application → Strong Close

600-800 words. Natural Nigerian context. Teach it.`;
}

function buildSeriesPrompt(schedule, isFirst, previousSummary = null, coursePlan = null) {
  const mode = schedule.mode || 'course'; // 'course' or 'variety'

  if (mode === 'variety') {
    // VARIETY MODE: Different topic each week within the category
    const previousTopics = schedule.previousTopics || [];
    const topicHistory = previousTopics.length > 0 
      ? `Covered before: ${previousTopics.slice(-5).join(', ')}. Pick NEW topic.` 
      : '';

    return `${schedule.subject} - Session ${schedule.part}

${topicHistory}

Pick a fresh, engaging topic within "${schedule.subject}". Make it:
- Relevant to Nigerian audience
- Different from previous sessions
- Practical and relatable
- Standalone (not continuing last week)

Structure: Hook → Topic intro → 3-4 key points (examples + insights) → Practical tips → Strong close

600-800 words. Teach now.`;
  }

  // COURSE MODE: Progressive curriculum
  const contextNote = !isFirst && previousSummary 
    ? `Last: ${previousSummary.substring(0, 120)}...` 
    : '';

  let stage = '';
  if (schedule.part <= 4) stage = 'Foundation (basics, fundamentals)';
  else if (schedule.part <= 12) stage = 'Building (intermediate concepts)';
  else if (schedule.part <= 26) stage = 'Advanced (deep dives, applications)';
  else stage = 'Mastery (expert topics, real-world)';

  const planNote = coursePlan ? `Course plan: ${coursePlan}` : '';

  return `${schedule.subject} - Part ${schedule.part}/${CONFIG.MAX_PARTS}
${contextNote}
${planNote}
Stage: ${stage}

${isFirst 
  ? `Part 1: Intro. Cover: (1) What is ${schedule.subject}? Why learn it? (2) Roadmap for this 52-part series - what students will master (3) First core concept. End with: "Next week, Part 2..."`
  : `Part ${schedule.part}: Progress from Part ${schedule.part - 1}. Teach 2-3 NEW concepts at ${stage} level. Reference previous. Preview Part ${schedule.part + 1}.`
}

500-700 words. Natural progression. Teach now.`;
}

// ============================================================================
// CRON JOB MANAGEMENT
// ============================================================================

function registerCronJob(jobId, cronTime, handler, timezone = 'Africa/Lagos') {
  try {
    if (activeCronJobs.has(jobId)) {
      globalLogger?.warn(`Cron job ${jobId} already exists, stopping old one`);
      const oldJob = activeCronJobs.get(jobId);
      oldJob.stop();
    }

    if (!cron.validate(cronTime)) {
      throw new Error(`Invalid cron expression: ${cronTime}`);
    }

    const cronJob = cron.schedule(cronTime, handler, {
      scheduled: true,
      timezone: timezone
    });

    activeCronJobs.set(jobId, cronJob);
    globalLogger?.info(`Registered cron job: ${jobId} (${cronTime})`);
    return true;
  } catch (error) {
    globalLogger?.error({ err: error }, `Failed to register cron job: ${jobId}`);
    return false;
  }
}

function cancelCronJob(jobId) {
  try {
    if (activeCronJobs.has(jobId)) {
      const cronJob = activeCronJobs.get(jobId);
      cronJob.stop();
      activeCronJobs.delete(jobId);
      globalLogger?.info(`Cancelled cron job: ${jobId}`);
      return true;
    }
    globalLogger?.warn(`Cron job not found: ${jobId}`);
    return false;
  } catch (error) {
    globalLogger?.error({ err: error }, `Failed to cancel cron job: ${jobId}`);
    return false;
  }
}

// ============================================================================
// SCHEDULED LECTURE EXECUTION
// ============================================================================

async function runScheduledLecture(scheduleId) {
  const db = await PluginHelpers.getDB();

  try {
    const schedule = await db.collection('lecture_schedules').findOne({ _id: scheduleId });

    if (!schedule) {
      globalLogger.error(`Schedule ${scheduleId} not found`);
      return;
    }

    if (schedule.part > CONFIG.MAX_PARTS) {
      globalLogger.warn(`${schedule.subject} completed all ${CONFIG.MAX_PARTS} parts`);
      await globalSock.sendMessage(schedule.groupId, {
        text: `🎓 *${schedule.subject}* series complete!\n\nAll ${CONFIG.MAX_PARTS} sessions delivered. 🎉`
      });
      return;
    }

    const mode = schedule.mode || 'course';
    globalLogger.info(`Running: ${schedule.subject} ${mode === 'variety' ? 'Session' : 'Part'} ${schedule.part}`);

    // Get previous context
    let previousSummary = null;
    let coursePlan = schedule.coursePlan || null;

    if (schedule.part > 1 && mode === 'course') {
      const prev = await db.collection('lecture_history').findOne(
        { scheduleId, part: schedule.part - 1, status: 'success' },
        { sort: { deliveredAt: -1 } }
      );
      if (prev) {
        previousSummary = prev.summary;
      }
    }

    const prompt = buildSeriesPrompt(schedule, schedule.part === 1, previousSummary, coursePlan);
    const script = await generateLecture(schedule.lecturer, prompt, globalLogger);

    // Extract topic for variety mode
    let currentTopic = null;
    if (mode === 'variety') {
      // Try to extract the topic from the lecture
      const topicMatch = script.match(/(?:today|this week|let'?s talk about)[:\s]*([^\n\.!?]{10,80})/i);
      if (topicMatch) {
        currentTopic = topicMatch[1].trim();
      }
    }

    // If Part 1 in course mode, extract and save course plan
    if (schedule.part === 1 && mode === 'course' && !coursePlan) {
      const planMatch = script.match(/(?:roadmap|syllabus|we'?ll cover|plan|series will include)[:\s]([^\.]+(?:\.[^\.]+){0,3})/i);
      if (planMatch) {
        coursePlan = planMatch[1].substring(0, 200).trim();
        await db.collection('lecture_schedules').updateOne(
          { _id: scheduleId },
          { $set: { coursePlan } }
        );
        globalLogger.info(`Saved course plan: ${coursePlan.substring(0, 50)}...`);
      }
    }

    // Header
    const partLabel = mode === 'variety' ? `SESSION ${schedule.part}` : `PART ${schedule.part}`;
    await globalSock.sendMessage(schedule.groupId, {
      text: `🎓 *${schedule.subject.toUpperCase()} - ${partLabel}*\n\n*Professor:* ${schedule.lecturer.name}\n${'─'.repeat(35)}`
    });

    await deliverScript(globalSock, schedule.groupId, script, globalLogger);

    await sleep(2000);
    const nextPart = schedule.part + 1;
    const nextLabel = mode === 'variety' ? `Session ${nextPart}` : `Part ${nextPart}`;
    const footer = nextPart <= CONFIG.MAX_PARTS
      ? `${'─'.repeat(35)}\n🎓 *END ${partLabel}*\n\n_${nextLabel} next week with a fresh topic!_`
      : `${'─'.repeat(35)}\n🎓 *FINAL SESSION*\n\n_Series complete. Thank you!_`;

    await globalSock.sendMessage(schedule.groupId, { text: footer });

    // Update schedule
    const updateData = {
      part: nextPart,
      lastDelivered: new Date()
    };

    // For variety mode, track previous topics
    if (mode === 'variety' && currentTopic) {
      const previousTopics = schedule.previousTopics || [];
      previousTopics.push(currentTopic);
      // Keep only last 10 topics
      if (previousTopics.length > 10) {
        previousTopics.shift();
      }
      updateData.previousTopics = previousTopics;
    }

    await db.collection('lecture_schedules').updateOne(
      { _id: scheduleId },
      { $set: updateData }
    );

    await db.collection('lecture_history').insertOne({
      scheduleId,
      part: schedule.part,
      topic: currentTopic || null,
      summary: script.substring(0, 200),
      deliveredAt: new Date(),
      status: 'success'
    });

    globalLogger.info(`Delivered ${schedule.subject} ${partLabel}${currentTopic ? `: ${currentTopic}` : ''}`);

  } catch (error) {
    globalLogger.error({ err: error, scheduleId }, 'Scheduled lecture failed');

    try {
      const schedule = await db.collection('lecture_schedules').findOne({ _id: scheduleId });
      if (schedule) {
        const mode = schedule.mode || 'course';
        const label = mode === 'variety' ? `Session ${schedule.part}` : `Part ${schedule.part}`;

        await globalSock.sendMessage(schedule.groupId, {
          text: `❌ Lecture delivery error\n\n*${schedule.subject} ${label}*\n\n_Will retry next week._`
        });

        await db.collection('lecture_history').insertOne({
          scheduleId,
          part: schedule.part,
          deliveredAt: new Date(),
          status: 'failed',
          error: error.message
        });
      }
    } catch (notifyError) {
      globalLogger.error({ err: notifyError }, 'Error notification failed');
    }
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleManualLecture(context) {
  const { msg, text, sock, config, logger } = context;

  if (!text || text.length < 5) {
    return msg.reply(
      `📚 *Lecture Command*\n\n` +
      `*Usage:* ${config.PREFIX}lecture <topic>\n\n` +
      `*Example:*\n${config.PREFIX}lecture Why Bitcoin matters\n${config.PREFIX}lecture Afrobeats history`
    );
  }

  const lecturer = randomLecturer();

  await msg.react('🎓');
  const loading = await msg.reply(
    `🎓 *Preparing Lecture*\n\n` +
    `*Topic:* ${text}\n` +
    `*Professor:* ${lecturer.name}\n\n` +
    `_Generating content..._`
  );

  try {
    const prompt = buildOneTimePrompt(text);
    const script = await generateLecture(lecturer, prompt, logger);

    await sock.sendMessage(msg.from, {
      text: `🎓 *LECTURE START*\n\n*Topic:* ${text}\n*Prof:* ${lecturer.name}\n${'─'.repeat(35)}`,
      edit: loading.key
    });

    await msg.react('✅');
    await deliverScript(sock, msg.from, script, logger);

    await sleep(2000);
    await sock.sendMessage(msg.from, {
      text: `${'─'.repeat(35)}\n🎓 *LECTURE END*\n\n_Class dismissed!_`
    });

  } catch (error) {
    logger.error({ err: error }, 'Manual lecture failed');
    await msg.react('❌');
    await sock.sendMessage(msg.from, {
      text: `❌ *Lecture Failed*\n\n${error.message}`,
      edit: loading.key
    });
  }
}

async function handleSchedule(context) {
  const { msg, text, logger, sock } = context;
  const db = await PluginHelpers.getDB();

  try {
    const parts = text.split('|').map(p => p.trim());

    if (parts.length < 3) {
      return msg.reply(
        `📅 *Schedule Lecture Series*\n\n` +
        `*Format:* \`.schedule <subject> | <day> | <time> | [mode] | [timezone]\`\n\n` +
        `*🎯 TWO MODES:*\n\n` +
        `*1️⃣ VARIETY MODE* (default)\n` +
        `Different topic each week within category\n` +
        `Perfect for: Relationship Gist, BizTalk, Health Talk\n` +
        `Example: \`.schedule Relationship Gist | Tuesday | 10:00\`\n` +
        `  Week 1: Communication in relationships\n` +
        `  Week 2: Trust and boundaries\n` +
        `  Week 3: Dealing with conflicts\n` +
        `  (Fresh topic each week!)\n\n` +
        `*2️⃣ COURSE MODE*\n` +
        `Progressive curriculum, building each week\n` +
        `Perfect for: Python, History, Business Strategy\n` +
        `Example: \`.schedule Python Programming | Monday | 14:00 | course\`\n` +
        `  Part 1: Introduction\n` +
        `  Part 2: Variables (builds on Part 1)\n` +
        `  Part 3: Functions (builds on Part 2)\n` +
        `  (Progressive learning!)\n\n` +
        `*More Examples:*\n` +
        `• \`.schedule BizTalk | Wednesday | 15:00\` ← variety\n` +
        `• \`.schedule Sex Education | Thursday | 20:00\` ← variety\n` +
        `• \`.schedule Health Talk | Friday | 10:00 | variety | Africa/Lagos\`\n` +
        `• \`.schedule Data Science | Monday | 10:00 | course\`\n\n` +
        `*Parameters:*\n` +
        `• Day: Sunday-Saturday or 0-6\n` +
        `• Time: 24-hour HH:MM\n` +
        `• Mode: "variety" or "course" (default: variety)\n` +
        `• Timezone: Optional (default: ${CONFIG.DEFAULT_TIMEZONE})`
      );
    }

    let [subject, dayStr, timeStr, modeOrTz, tzStr] = parts;

    // Parse mode and timezone (flexible order)
    let mode = 'variety'; // Default to variety mode
    let timezone = null;

    if (modeOrTz) {
      if (modeOrTz.toLowerCase() === 'course' || modeOrTz.toLowerCase() === 'variety') {
        mode = modeOrTz.toLowerCase();
        timezone = tzStr;
      } else {
        // modeOrTz is actually timezone
        timezone = modeOrTz;
      }
    }

    if (!subject || !dayStr || !timeStr) {
      throw new Error('Missing required fields');
    }

    const { dayOfWeek, time, timezone: parsedTz } = parseSchedule(dayStr, timeStr, timezone);
    const cronTime = getCronTime(time, dayOfWeek);
    const lecturer = randomLecturer();

    const newSchedule = {
      groupId: msg.from,
      subject,
      dayOfWeek,
      time,
      timezone: parsedTz,
      mode,
      part: 1,
      lecturer,
      previousTopics: [], // For variety mode
      coursePlan: null, // For course mode
      lastDelivered: null,
      scheduledBy: msg.sender,
      createdAt: new Date()
    };

    let result;
    try {
      result = await db.collection('lecture_schedules').insertOne(newSchedule);
    } catch (dbError) {
      if (dbError.code === 11000) {
        throw new Error(`"${subject}" already scheduled. Cancel it first.`);
      }
      throw dbError;
    }

    const scheduleId = result.insertedId;
    const jobId = getJobId(scheduleId);

    try {
      const success = registerCronJob(
        jobId,
        cronTime,
        () => runScheduledLecture(scheduleId),
        parsedTz
      );

      if (!success) {
        throw new Error('Cron registration failed');
      }
    } catch (cronError) {
      await db.collection('lecture_schedules').deleteOne({ _id: scheduleId });
      throw new Error(`Scheduling failed: ${cronError.message}`);
    }

    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
    const modeEmoji = mode === 'variety' ? '🎲' : '📚';
    const modeDesc = mode === 'variety' 
      ? 'Different topic each week' 
      : 'Progressive curriculum';

    let reply = `✅ *Lecture Series Scheduled*\n\n` +
      `*Subject:* ${subject}\n` +
      `*Professor:* ${lecturer.name}\n` +
      `*Schedule:* Every ${dayName} at ${time}\n` +
      `*Timezone:* ${parsedTz}\n` +
      `*Mode:* ${modeEmoji} ${mode.toUpperCase()}\n` +
      `*Type:* ${modeDesc}\n` +
      `*Total Sessions:* Up to ${CONFIG.MAX_PARTS}\n\n`;

    if (mode === 'variety') {
      reply += `📚 *How it works:*\n` +
        `Each ${dayName}, the AI picks a fresh topic within "${subject}".\n` +
        `Topics are standalone - no need to catch previous weeks!\n\n` +
        `_Session 1 starts on the next ${dayName}!_`;
    } else {
      reply += `📚 *How it works:*\n` +
        `Part 1: Introduction + roadmap\n` +
        `Parts 2-4: Foundation concepts\n` +
        `Parts 5-12: Building skills\n` +
        `Parts 13-26: Advanced topics\n` +
        `Parts 27-52: Mastery + real-world\n\n` +
        `_Part 1 starts on the next ${dayName}!_`;
    }

    await msg.reply(reply);

  } catch (error) {
    logger.error({ err: error }, 'Schedule failed');
    await msg.reply(`❌ *Schedule Failed*\n\n${error.message}`);
  }
}

async function handleList(context) {
  const { msg, logger } = context;
  const db = await PluginHelpers.getDB();

  try {
    const schedules = await db.collection('lecture_schedules')
      .find({ groupId: msg.from })
      .sort({ subject: 1 })
      .toArray();

    if (schedules.length === 0) {
      return msg.reply(
        `📚 *No Active Lectures*\n\n` +
        `Use \`.schedule\` to create one.`
      );
    }

    let reply = `📚 *Active Lecture Series (${schedules.length})*\n`;

    for (const s of schedules) {
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.dayOfWeek];
      const lastRan = s.lastDelivered 
        ? new Date(s.lastDelivered).toLocaleDateString('en-GB')
        : 'Not yet';

      const mode = s.mode || 'course';
      const modeEmoji = mode === 'variety' ? '🎲' : '📚';
      const label = mode === 'variety' ? 'Session' : 'Part';

      reply += `\n${'─'.repeat(35)}\n` +
               `*${s.subject}*\n` +
               `├ Mode: ${modeEmoji} ${mode}\n` +
               `├ Prof: ${s.lecturer.name}\n` +
               `├ Next: ${label} ${s.part}/${CONFIG.MAX_PARTS}\n` +
               `├ When: ${day} @ ${s.time}\n` +
               `├ Zone: ${s.timezone}\n` +
               `└ Last: ${lastRan}`;
    }

    await msg.reply(reply);

  } catch (error) {
    logger.error({ err: error }, 'List failed');
    await msg.reply(`❌ *List Failed*\n\n${error.message}`);
  }
}

async function handleCancel(context) {
  const { msg, text, logger } = context;
  const db = await PluginHelpers.getDB();

  if (!text) {
    return msg.reply(
      `🗑️ *Cancel Lecture*\n\n` +
      `*Usage:* \`.cancel <subject>\`\n` +
      `*Example:* \`.cancel Python Basics\``
    );
  }

  try {
    const schedule = await db.collection('lecture_schedules').findOne({
      groupId: msg.from,
      subject: { $regex: new RegExp(`^${text}$`, 'i') }
    });

    if (!schedule) {
      return msg.reply(`❌ No lecture found: "${text}"`);
    }

    const jobId = getJobId(schedule._id);
    cancelCronJob(jobId);

    await db.collection('lecture_schedules').deleteOne({ _id: schedule._id });
    await db.collection('lecture_history').deleteMany({ scheduleId: schedule._id });

    await msg.reply(
      `✅ *Lecture Cancelled*\n\n` +
      `*Subject:* ${schedule.subject}\n` +
      `*Parts Delivered:* ${schedule.part - 1}/${CONFIG.MAX_PARTS}\n\n` +
      `Schedule and history removed.`
    );

  } catch (error) {
    logger.error({ err: error }, 'Cancel failed');
    await msg.reply(`❌ *Cancel Failed*\n\n${error.message}`);
  }
}

, 'i') }
    });

    if (!schedule) {
      return msg.reply(`❌ No lecture found: "${text}"`);
    }

    const history = await db.collection('lecture_history')
      .find({ scheduleId: schedule._id })
      .sort({ deliveredAt: -1 })
      .limit(10)
      .toArray();

    if (history.length === 0) {
      return msg.reply(
        `📜 *No History*\n\n` +
        `"${text}" hasn't been delivered yet.`
      );
    }

    const mode = schedule.mode || 'course';
    const label = mode === 'variety' ? 'Session' : 'Part';

    let reply = `📜 *History: ${schedule.subject}*\n` +
                `*Mode:* ${mode === 'variety' ? '🎲 Variety' : '📚 Course'}\n` +
                `*Professor:* ${schedule.lecturer.name}\n` +
                `_Last ${history.length} deliveries_\n`;

    for (const entry of history) {
      const icon = entry.status === 'success' ? '✅' : '❌';
      const date = new Date(entry.deliveredAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      reply += `\n${icon} ${label} ${entry.part} - ${date}`;

      // Show topic for variety mode
      if (mode === 'variety' && entry.topic) {
        reply += `\n   └ ${entry.topic}`;
      }

      if (entry.error) {
        reply += `\n   └ Error: ${entry.error.substring(0, 50)}`;
      }
    }

    await msg.reply(reply);

  } catch (error) {
    logger.error({ err: error }, 'History failed');
    await msg.reply(`❌ *History Failed*\n\n${error.message}`);
  }
}

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

export default {
  name: 'AI Lecturer',
  description: 'Production-ready AI lecture system with 10 personalities and 2 modes (variety/course)',
  category: 'education',
  version: '4.1.0',
  author: 'Claude + Malvin',

  commands: ['lecture', 'schedule', 'lectures', 'cancel', 'history'],
  aliases: ['teach', 'class', 'schedule-lecture', 'list-lectures', 'cancel-lecture', 'lecture-history'],

  usage: '.lecture <topic> or .schedule <subject> | <day> | <time> | [mode]',
  example: '.lecture Bitcoin explained\n.schedule Relationship Gist | Tuesday | 10:00\n.schedule Python | Monday | 10:00 | course\n.lectures\n.cancel Relationship Gist\n.history Relationship Gist',

  adminOnly: true,
  groupOnly: true,

  async run(context) {
    const { command } = context;

    switch (command) {
      case 'lecture':
      case 'teach':
        await handleManualLecture(context);
        break;
      case 'schedule':
      case 'schedule-lecture':
      case 'class':
        await handleSchedule(context);
        break;
      case 'lectures':
      case 'list-lectures':
        await handleList(context);
        break;
      case 'cancel':
      case 'cancel-lecture':
        await handleCancel(context);
        break;
      case 'history':
      case 'lecture-history':
        await handleHistory(context);
        break;
    }
  },

  async onLoad(context) {
    const { sock, logger } = context;
    const db = await PluginHelpers.getDB();

    globalSock = sock;
    globalLogger = logger;

    logger.info('AI Lecturer v4.1: Initializing (Variety + Course modes)...');

    try {
      await ensureIndexes(db, logger);

      const schedules = await db.collection('lecture_schedules').find().toArray();

      if (schedules.length === 0) {
        logger.info('No schedules to load');
        return;
      }

      logger.info(`Loading ${schedules.length} schedule(s)`);

      let loaded = 0;
      let failed = 0;

      for (const schedule of schedules) {
        try {
          const cronTime = getCronTime(schedule.time, schedule.dayOfWeek);
          const jobId = getJobId(schedule._id);
          const mode = schedule.mode || 'course';

          const success = registerCronJob(
            jobId,
            cronTime,
            () => runScheduledLecture(schedule._id),
            schedule.timezone
          );

          if (success) {
            loaded++;
            logger.info({
              subject: schedule.subject,
              mode: mode,
              professor: schedule.lecturer.name,
              schedule: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][schedule.dayOfWeek]} @ ${schedule.time}`
            }, 'Lecture loaded');
          } else {
            failed++;
            logger.error({ subject: schedule.subject }, 'Failed to load');
          }
        } catch (error) {
          failed++;
          logger.error({ err: error, subject: schedule.subject }, 'Load error');
        }
      }

      logger.info(`AI Lecturer v4.1: Loaded ${loaded}/${schedules.length} schedules (${failed} failed)`);

    } catch (error) {
      logger.error({ err: error }, 'AI Lecturer v4.1: Initialization failed');
    }
  }
};