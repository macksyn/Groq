// plugins/ai_lecturer.js - V4.0 Production Ready
import axios from 'axios';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  API_URL: 'https://malvin-api.vercel.app/ai/gpt-5',
  API_TIMEOUT: 50000,
  DEFAULT_TIMEZONE: 'Africa/Lagos',
  MAX_PARTS: 52, // 1 year of weekly lectures

  // Realistic typing simulation
  TYPING: {
    CHAR_MIN: 35,
    CHAR_MAX: 70,
    SENTENCE_PAUSE_MIN: 1200,
    SENTENCE_PAUSE_MAX: 2500,
    REFRESH_INTERVAL: 2800
  },

  // 10 Unique Lecturer Personalities
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
  duration += (Math.random() - 0.5) * duration * 0.3; // ±30% variation
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

  // Remove AI meta-commentary patterns
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
    .replace(/^\s*[-•*]\s*/gm, ''); // Remove leading bullets
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

function buildSeriesPrompt(schedule, isFirst, previousSummary = null) {
  const contextNote = !isFirst && previousSummary 
    ? `Last time: ${previousSummary.substring(0, 120)}...` 
    : '';

  return `${schedule.subject} - Part ${schedule.part}
${contextNote}

${isFirst 
  ? 'Structure: Welcome → Overview → First 3 Concepts → Preview Next → Strong Close'
  : `Structure: Quick Recap → Today's 3 Concepts → Connect to Part ${schedule.part - 1} → Preview Part ${schedule.part + 1} → Close`
}

500-700 words. Series continuity. Teach Part ${schedule.part}.`;
}

async function runScheduledLecture(scheduleId, sock, logger) {
  const db = await PluginHelpers.getDB();

  try {
    const schedule = await db.collection('lecture_schedules').findOne({ _id: scheduleId });

    if (!schedule) {
      logger.error(`Schedule ${scheduleId} not found`);
      return;
    }

    if (schedule.part > CONFIG.MAX_PARTS) {
      logger.warn(`${schedule.subject} completed all ${CONFIG.MAX_PARTS} parts`);
      await sock.sendMessage(schedule.groupId, {
        text: `🎓 *${schedule.subject}* series complete!\n\nAll ${CONFIG.MAX_PARTS} parts delivered. Course concluded. 🎉`
      });
      return;
    }

    logger.info(`Running: ${schedule.subject} Part ${schedule.part}`);

    // Get previous lecture summary if not first
    let previousSummary = null;
    if (schedule.part > 1) {
      const prev = await db.collection('lecture_history').findOne(
        { scheduleId, part: schedule.part - 1, status: 'success' },
        { sort: { deliveredAt: -1 } }
      );
      if (prev) {
        previousSummary = prev.summary;
      }
    }

    const prompt = buildSeriesPrompt(schedule, schedule.part === 1, previousSummary);
    const script = await generateLecture(schedule.lecturer, prompt, logger);

    // Header
    await sock.sendMessage(schedule.groupId, {
      text: `🎓 *${schedule.subject.toUpperCase()} - PART ${schedule.part}*\n\n*Professor:* ${schedule.lecturer.name}\n${'─'.repeat(35)}`
    });

    // Deliver
    await deliverScript(sock, schedule.groupId, script, logger);

    // Footer
    await sleep(2000);
    const nextPart = schedule.part + 1;
    const footer = nextPart <= CONFIG.MAX_PARTS
      ? `${'─'.repeat(35)}\n🎓 *END PART ${schedule.part}*\n\n_Part ${nextPart} next week. See you then!_`
      : `${'─'.repeat(35)}\n🎓 *FINAL LECTURE*\n\n_Series complete. Thank you!_`;

    await sock.sendMessage(schedule.groupId, { text: footer });

    // Update database
    await db.collection('lecture_schedules').updateOne(
      { _id: scheduleId },
      {
        $set: {
          part: nextPart,
          lastDelivered: new Date()
        }
      }
    );

    // Log history
    await db.collection('lecture_history').insertOne({
      scheduleId,
      part: schedule.part,
      summary: script.substring(0, 200),
      deliveredAt: new Date(),
      status: 'success'
    });

    logger.info(`Delivered ${schedule.subject} Part ${schedule.part}`);

  } catch (error) {
    logger.error({ err: error, scheduleId }, 'Scheduled lecture failed');

    try {
      const schedule = await db.collection('lecture_schedules').findOne({ _id: scheduleId });
      if (schedule) {
        await sock.sendMessage(schedule.groupId, {
          text: `❌ Lecture delivery error\n\n*${schedule.subject} Part ${schedule.part}*\n\n_Will retry next week._`
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
      logger.error({ err: notifyError }, 'Error notification failed');
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
  const { msg, text, logger, helpers, sock } = context;
  const db = await PluginHelpers.getDB();

  try {
    const parts = text.split('|').map(p => p.trim());

    if (parts.length < 3) {
      return msg.reply(
        `📅 *Schedule Lecture Series*\n\n` +
        `*Format:* \`.schedule <subject> | <day> | <time> | [timezone]\`\n\n` +
        `*Examples:*\n` +
        `• \`.schedule Python Basics | Monday | 10:00\`\n` +
        `• \`.schedule History of Jazz | Friday | 15:30 | America/New_York\`\n\n` +
        `*Day:* Sunday-Saturday or 0-6\n` +
        `*Time:* 24-hour HH:MM\n` +
        `*Timezone:* Optional (default: ${CONFIG.DEFAULT_TIMEZONE})`
      );
    }

    const [subject, dayStr, timeStr, tzStr] = parts;

    if (!subject || !dayStr || !timeStr) {
      throw new Error('Missing required fields');
    }

    const { dayOfWeek, time, timezone } = parseSchedule(dayStr, timeStr, tzStr);
    const cronTime = getCronTime(time, dayOfWeek);
    const lecturer = randomLecturer();

    const newSchedule = {
      groupId: msg.from,
      subject,
      dayOfWeek,
      time,
      timezone,
      part: 1,
      lecturer,
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
      const success = helpers.registerCronJob(
        jobId,
        cronTime,
        () => runScheduledLecture(scheduleId, sock, logger),
        timezone
      );

      if (!success) {
        throw new Error('Cron registration failed');
      }
    } catch (cronError) {
      await db.collection('lecture_schedules').deleteOne({ _id: scheduleId });
      throw new Error(`Scheduling failed: ${cronError.message}`);
    }

    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];

    await msg.reply(
      `✅ *Lecture Series Scheduled*\n\n` +
      `*Subject:* ${subject}\n` +
      `*Professor:* ${lecturer.name}\n` +
      `*Schedule:* Every ${dayName} at ${time}\n` +
      `*Timezone:* ${timezone}\n` +
      `*Total Parts:* Up to ${CONFIG.MAX_PARTS}\n\n` +
      `Part 1 starts on the next ${dayName}!`
    );

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

      reply += `\n${'─'.repeat(35)}\n` +
               `*${s.subject}*\n` +
               `├ Prof: ${s.lecturer.name}\n` +
               `├ Next: Part ${s.part}/${CONFIG.MAX_PARTS}\n` +
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
  const { msg, text, logger, helpers } = context;
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
    helpers.cancelCronJob(jobId);

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

async function handleHistory(context) {
  const { msg, text, logger } = context;
  const db = await PluginHelpers.getDB();

  if (!text) {
    return msg.reply(
      `📜 *Lecture History*\n\n` +
      `*Usage:* \`.history <subject>\`\n` +
      `*Example:* \`.history Python Basics\``
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

    let reply = `📜 *History: ${schedule.subject}*\n` +
                `*Professor:* ${schedule.lecturer.name}\n` +
                `_Last ${history.length} deliveries_\n`;

    for (const entry of history) {
      const icon = entry.status === 'success' ? '✅' : '❌';
      const date = new Date(entry.deliveredAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      reply += `\n${icon} Part ${entry.part} - ${date}`;
      if (entry.error) {
        reply += `\n   └ ${entry.error.substring(0, 50)}`;
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
  description: 'Production-ready AI lecture system with 10 unique personalities',
  category: 'education',
  version: '4.0.0',
  author: 'Claude + Malvin',

  commands: ['lecture', 'schedule', 'lectures', 'cancel', 'history'],
  aliases: ['teach', 'class', 'schedule-lecture', 'list-lectures', 'cancel-lecture', 'lecture-history'],

  usage: '.lecture <topic> or .schedule <subject> | <day> | <time>',
  example: '.lecture Bitcoin explained\n.schedule Python | Monday | 10:00\n.lectures\n.cancel Python\n.history Python',

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
    const { sock, logger, helpers } = context;
    const db = await PluginHelpers.getDB();

    logger.info('AI Lecturer v4: Initializing...');

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

          const success = helpers.registerCronJob(
            jobId,
            cronTime,
            () => runScheduledLecture(schedule._id, sock, logger),
            schedule.timezone
          );

          if (success) {
            loaded++;
            logger.info({
              subject: schedule.subject,
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

      logger.info(`AI Lecturer v4: Loaded ${loaded}/${schedules.length} schedules (${failed} failed)`);

    } catch (error) {
      logger.error({ err: error }, 'AI Lecturer v4: Initialization failed');
    }
  }
};