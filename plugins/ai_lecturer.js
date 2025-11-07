// plugins/ai_lecturer.js - V3 Plugin (Enhanced with Improved Prompts & Natural Typing)
import axios from 'axios';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// --- CONFIGURATION ---
const CONFIG = {
  DEFAULT_TIMEZONE: 'Africa/Lagos',
  MAX_LECTURE_PARTS: 52, // Maximum 52 parts (1 year of weekly lectures)

  // REALISTIC TYPING SIMULATION
  TYPING_SPEED_MIN: 40,    // Minimum ms per character (fast typer)
  TYPING_SPEED_MAX: 80,    // Maximum ms per character (normal typer)
  TYPING_REFRESH_INTERVAL: 3000, // Refresh typing indicator every 3s
  PAUSE_BETWEEN_SENTENCES_MIN: 1500, // 1.5s pause after sentence
  PAUSE_BETWEEN_SENTENCES_MAX: 3000, // 3s pause after sentence

  PRIMARY_API_TIMEOUT: 60000,
  FALLBACK_API_TIMEOUT: 60000
};

// --- HELPER FUNCTIONS ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ensures database indexes are created
 */
async function ensureIndexes(db, logger) {
  try {
    await db.collection('lecture_schedules').createIndex(
      { groupId: 1, subject: 1 },
      { 
        unique: true, 
        collation: { locale: 'en', strength: 2 },
        name: 'unique_group_subject'
      }
    );
    await db.collection('lecture_schedules').createIndex({ groupId: 1 });
    await db.collection('lecture_history').createIndex({ scheduleId: 1, deliveredAt: -1 });

    // NEW: Indexes for lecture summaries and engagement
    await db.collection('lecture_summaries').createIndex({ scheduleId: 1, part: 1 });
    await db.collection('lecture_engagement').createIndex({ scheduleId: 1 });

    logger.info('AI Lecturer: Database indexes ensured');
  } catch (error) {
    logger.warn(error, 'AI Lecturer: Failed to create indexes (may already exist)');
  }
}

/**
 * Generates the lecture content from an AI provider.
 * Uses SHORT prompts for GET API, detailed for POST API
 */
async function generateLecture(systemPrompt, userPrompt, logger) {
  let lectureContent = null;
  let generatedBy = 'AI';

  // --- Try Primary API (GPT-5) with SHORT prompt ---
  const primaryApiUrl = 'https://malvin-api.vercel.app/ai/gpt-5';

  // For GET API: Combine into single concise prompt
  const shortPrompt = `${systemPrompt}\n\nWrite the lecture.`;

  try {
    logger.info('AI Lecturer: Trying primary API (gpt-5)...');
    logger.info(`Prompt length: ${shortPrompt.length} chars`);

    const response = await axios.get(primaryApiUrl, {
      params: { text: shortPrompt },
      timeout: CONFIG.PRIMARY_API_TIMEOUT
    });

    const result = response.data?.response || response.data?.result || response.data?.answer;
    if (result && typeof result === 'string' && result.trim().length > 0) {
      lectureContent = result.trim();
      generatedBy = 'GPT-5 (Primary)';
      logger.info('AI Lecturer: Primary API succeeded');
      return { lectureContent, generatedBy };
    }
    throw new Error('Primary API returned invalid or empty response');
  } catch (primaryError) {
    logger.warn({ err: primaryError }, 'AI Lecturer: Primary API failed, trying fallback...');

    // --- Try Fallback API (Groq) with MORE DETAILED prompt ---
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      logger.error('AI Lecturer: GROQ_API_KEY not set for fallback');
      throw new Error('Primary AI failed and fallback AI (Groq) is not configured. Please contact the bot administrator.');
    }

    const groqModel = 'llama3-70b-8192';
    const groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';

    // For POST API: Can use more detailed prompt
    const detailedSystemPrompt = enhancePromptForGroq(systemPrompt);

    try {
      const groqResponse = await axios.post(
        groqApiUrl,
        {
          model: groqModel,
          messages: [
            { role: 'system', content: detailedSystemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 3000,
          top_p: 1.0,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: CONFIG.FALLBACK_API_TIMEOUT
        }
      );

      const groqResult = groqResponse.data?.choices?.[0]?.message?.content?.trim();
      if (!groqResult || groqResult.length === 0) {
        throw new Error('Groq fallback returned empty content');
      }

      lectureContent = groqResult;
      generatedBy = 'Groq AI (Fallback)';
      logger.info('AI Lecturer: Fallback API succeeded');
      return { lectureContent, generatedBy };
    } catch (fallbackError) {
      logger.error({ err: fallbackError }, 'AI Lecturer: Both primary and fallback APIs failed');
      throw new Error('All AI services are currently unavailable. Please try again later.');
    }
  }
}

/**
 * NEW: Enhance prompt with additional details for Groq (POST API)
 */
function enhancePromptForGroq(shortPrompt) {
  // Add more detailed instructions since POST has no length limit
  return `${shortPrompt}

ADDITIONAL DETAILS:
- Write in natural, flowing sentences
- Include concrete examples from Nigerian life
- Make it engaging and memorable
- Use proper formatting: *bold* for terms, line breaks for readability
- Balance education with entertainment
- End with actionable takeaway`;
}

/**
 * NEW: Realistic typing simulation that maintains typing indicator
 * throughout the entire typing duration
 */
async function simulateTyping(sock, jid, durationMs, logger) {
  const startTime = Date.now();
  const endTime = startTime + durationMs;

  try {
    // Initial typing indicator
    await sock.sendPresenceUpdate('composing', jid);

    // Keep refreshing typing indicator until typing duration is complete
    while (Date.now() < endTime) {
      const remainingTime = endTime - Date.now();
      const waitTime = Math.min(CONFIG.TYPING_REFRESH_INTERVAL, remainingTime);

      if (waitTime > 0) {
        await sleep(waitTime);

        // Refresh typing indicator if still typing
        if (Date.now() < endTime) {
          await sock.sendPresenceUpdate('composing', jid);
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error during typing simulation');
  }
}

/**
 * NEW: Calculate realistic typing duration based on sentence length
 */
function calculateTypingDuration(sentence) {
  const charCount = sentence.length;

  // Random typing speed between min and max (ms per character)
  const typingSpeed = CONFIG.TYPING_SPEED_MIN + 
    Math.random() * (CONFIG.TYPING_SPEED_MAX - CONFIG.TYPING_SPEED_MIN);

  // Base typing time
  let duration = charCount * typingSpeed;

  // Add slight random variation (±20%) for naturalness
  const variation = duration * 0.2;
  duration += (Math.random() * variation * 2) - variation;

  // Ensure reasonable bounds (min 2s, max 15s per sentence)
  duration = Math.max(2000, Math.min(15000, duration));

  return Math.round(duration);
}

/**
 * NEW: Calculate natural pause between sentences
 */
function calculatePauseDuration() {
  const minPause = CONFIG.PAUSE_BETWEEN_SENTENCES_MIN;
  const maxPause = CONFIG.PAUSE_BETWEEN_SENTENCES_MAX;

  // Random pause with slight bias toward shorter pauses
  const pause = minPause + Math.random() * (maxPause - minPause);

  return Math.round(pause);
}

/**
 * IMPROVED: Delivers the lecture with realistic human-like typing
 */
async function deliverLectureScript(sock, jid, lectureText, logger) {
  // Split into sentences
  const sentences = lectureText
    .replace(/(\r\n|\n|\r)/gm, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0);

  logger.info(`AI Lecturer: Delivering ${sentences.length} sentences to ${jid}`);

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();

    try {
      // Calculate realistic typing duration for this sentence
      const typingDuration = calculateTypingDuration(sentence);

      logger.info(`Sentence ${i + 1}/${sentences.length}: ${sentence.substring(0, 50)}... (${typingDuration}ms typing)`);

      // Simulate typing with sustained indicator
      await simulateTyping(sock, jid, typingDuration, logger);

      // Send the message
      await sock.sendMessage(jid, { text: sentence });

      // Natural pause between sentences (like thinking)
      if (i < sentences.length - 1) {
        const pauseDuration = calculatePauseDuration();
        await sleep(pauseDuration);
      }

    } catch (error) {
      logger.error({ err: error, sentence: i + 1 }, 'Failed to send sentence, continuing...');
      // Brief pause before continuing to next sentence
      await sleep(1000);
    }
  }

  // Stop typing indicator
  await sock.sendPresenceUpdate('paused', jid);
  logger.info('Lecture delivery complete');
}

/**
 * Parses and validates schedule parameters.
 */
function parseSchedule(dayStr, timeStr, userTz) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  let dayOfWeek;

  if (/^\d+$/.test(dayStr)) {
    dayOfWeek = parseInt(dayStr, 10);
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      throw new Error('Invalid day number. Must be 0 (Sunday) to 6 (Saturday).');
    }
  } else {
    dayOfWeek = days.indexOf(dayStr.toLowerCase());
    if (dayOfWeek === -1) {
      throw new Error('Invalid day name. Use full day name (e.g., "Monday") or number 0-6.');
    }
  }

  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    throw new Error('Invalid time format. Use 24-hour HH:MM (e.g., "10:00" or "23:30").');
  }

  const [hours, minutes] = timeStr.split(':').map(Number);
  if (hours > 23 || minutes > 59) {
    throw new Error('Invalid time values. Hours must be 0-23, minutes 0-59.');
  }

  const timezone = userTz || CONFIG.DEFAULT_TIMEZONE;

  try {
    new Date().toLocaleString('en-US', { timeZone: timezone });
  } catch (e) {
    throw new Error(`Invalid timezone: "${timezone}". Examples: "Africa/Lagos", "Europe/London", "America/New_York".`);
  }

  return { dayOfWeek, time: timeStr, timezone };
}

/**
 * Logs delivery history to database
 */
async function logDeliveryHistory(db, scheduleId, part, status, error = null, logger) {
  try {
    await db.collection('lecture_history').insertOne({
      scheduleId: scheduleId,
      part: part,
      deliveredAt: new Date(),
      status: status,
      error: error ? error.message : null
    });
  } catch (err) {
    logger.error({ err }, 'Failed to log delivery history');
  }
}

/**
 * Extract key points from lecture content (simple extraction)
 */
function extractKeyPoints(lectureContent) {
  const sentences = lectureContent
    .split(/[.!?]/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 150); // Reasonable length sentences

  // Take first 3 substantial sentences as key points
  return sentences.slice(0, 3);
}

/**
 * Save lecture summary for future context
 */
async function saveLectureSummary(db, scheduleId, part, subject, lectureContent, logger) {
  try {
    const keyPoints = extractKeyPoints(lectureContent);
    const summary = lectureContent.substring(0, 250).trim() + '...';

    await db.collection('lecture_summaries').insertOne({
      scheduleId: scheduleId,
      part: part,
      subject: subject,
      summary: summary,
      keyPoints: keyPoints,
      createdAt: new Date()
    });

    logger.info(`Saved summary for ${subject} Part ${part}`);
  } catch (err) {
    logger.error({ err }, 'Failed to save lecture summary');
  }
}

/**
 * Get previous lecture context
 */
async function getPreviousContext(db, scheduleId, currentPart) {
  try {
    if (currentPart === 1) {
      return {
        hasPrevious: false,
        summary: null,
        keyPoints: []
      };
    }

    const previousLecture = await db.collection('lecture_summaries').findOne({
      scheduleId: scheduleId,
      part: currentPart - 1
    });

    if (!previousLecture) {
      return {
        hasPrevious: true,
        summary: "Previous lecture content not available",
        keyPoints: []
      };
    }

    return {
      hasPrevious: true,
      summary: previousLecture.summary,
      keyPoints: previousLecture.keyPoints || []
    };
  } catch (err) {
    return {
      hasPrevious: currentPart > 1,
      summary: "Unable to retrieve previous lecture",
      keyPoints: []
    };
  }
}

/**
 * Track engagement metrics
 */
async function trackEngagement(db, scheduleId, wasSuccessful, logger) {
  try {
    const engagement = await db.collection('lecture_engagement').findOne({ scheduleId });

    if (!engagement) {
      // Initialize engagement tracking
      await db.collection('lecture_engagement').insertOne({
        scheduleId: scheduleId,
        totalDeliveries: 1,
        successfulDeliveries: wasSuccessful ? 1 : 0,
        failureCount: wasSuccessful ? 0 : 1,
        lastUpdated: new Date()
      });
    } else {
      // Update engagement
      await db.collection('lecture_engagement').updateOne(
        { scheduleId },
        {
          $inc: {
            totalDeliveries: 1,
            successfulDeliveries: wasSuccessful ? 1 : 0,
            failureCount: wasSuccessful ? 0 : 1
          },
          $set: { lastUpdated: new Date() }
        }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to track engagement');
  }
}

/**
 * Get engagement level
 */
async function getEngagementLevel(db, scheduleId) {
  try {
    const engagement = await db.collection('lecture_engagement').findOne({ scheduleId });

    if (!engagement || engagement.totalDeliveries < 3) {
      return 'standard'; // Not enough data
    }

    const successRate = engagement.successfulDeliveries / engagement.totalDeliveries;

    if (successRate > 0.85) return 'high';
    if (successRate < 0.5) return 'low';
    return 'standard';
  } catch (err) {
    return 'standard';
  }
}

/**
 * Build SHORT prompt for GET API (under 800 chars)
 */
function buildManualLecturePrompt(topic) {
  return `You're Prof AB, a Nigerian professor teaching smart professionals in "Gist HQ" WhatsApp group.

Write a lecture on: ${topic}

STRUCTURE:
🎯 Hook (2 sentences - grab attention)
📚 Setup (define concept + why it matters + Nigerian example)
💡 3 Main Points (each: explain → example → insight)
🔧 Application (what they can use today)
🎬 Closer (memorable takeaway)

STYLE: Conversational professor. Break text every 2-3 sentences. Use Nigerian context (NEPA, traffic, naira, jollof). Include 2+ local examples. 5-7 emojis. *Bold* key terms. Ask 2-3 questions. "Abi?" "Sha" naturally.

500-600 words. Educational but fun, like chatting over drinks.`;
}

/**
 * Build SHORT prompt for series lectures (GET API compatible)
 */
function buildSeriesLecturePrompt(schedule, context) {
  const isFirstLecture = schedule.part === 1;
  const prevSummary = context.hasPrevious ? context.summary.substring(0, 100) : "First lecture";
  const engagement = context.engagement || 'standard';

  let prompt = `You're Prof AB delivering Part ${schedule.part} of "${schedule.subject}" to Gist HQ WhatsApp group.

${isFirstLecture ? 
  `🎓 WELCOME (20 words): Exciting intro to the series` : 
  `🔄 RECAP (25 words): Last week - ${prevSummary}. Today's focus...`}

🎯 TODAY'S FOCUS (30 words): What Part ${schedule.part} covers

📚 TEACHING (400 words in 3 sections):
1. Primary Concept (explain → Nigerian example → insight)
2. Secondary Concept (connects to #1 → different example)
3. Synthesis (how it fits → real application)

💭 DISCUSSION (30 words): Thought question
🔮 PREVIEW (30 words): Tease Part ${schedule.part + 1}
🎓 TAKEAWAY (20 words): Memorable summary

STYLE: Break every 2-3 sentences. Nigerian context (NEPA, traffic, naira). 5-8 emojis. *Bold* key terms. "Abi?" "Sha" naturally.`;

  // Add engagement adjustments
  if (engagement === 'low') {
    prompt += `\n\nBOOST: Bigger hook, more examples, simpler concepts.`;
  } else if (engagement === 'high') {
    prompt += `\n\nLEVEL UP: Go deeper, add advanced concepts.`;
  }

  // Add progression
  if (schedule.part <= 3) {
    prompt += ` Foundation phase - accessible.`;
  } else if (schedule.part <= 7) {
    prompt += ` Growth phase - more complexity.`;
  } else {
    prompt += ` Mastery phase - advanced insights.`;
  }

  return prompt;
}

/**
 * Runs the automated, scheduled lecture with improved prompts
 */
async function runScheduledLecture(scheduleId, sock, logger) {
  const db = await PluginHelpers.getDB();

  try {
    // Fetch fresh schedule data from database
    const schedule = await db.collection('lecture_schedules').findOne({ _id: scheduleId });

    if (!schedule) {
      logger.error(`Schedule ${scheduleId} not found in database - may have been deleted`);
      return;
    }

    // Check if we've reached max parts
    if (schedule.part > CONFIG.MAX_LECTURE_PARTS) {
      logger.warn(`Schedule ${schedule.subject} has reached max parts (${CONFIG.MAX_LECTURE_PARTS})`);
      await sock.sendMessage(schedule.groupId, {
        text: `🎓 The lecture series "${schedule.subject}" has completed all ${CONFIG.MAX_LECTURE_PARTS} parts.\n\n` +
              `_This course has automatically concluded. Thank you for attending!_`
      });
      return;
    }

    logger.info(`Running scheduled lecture: ${schedule.subject} (Part ${schedule.part}) in ${schedule.groupId}`);

    // Get previous context and engagement level
    const previousContext = await getPreviousContext(db, scheduleId, schedule.part);
    const engagementLevel = await getEngagementLevel(db, scheduleId);

    const context = {
      ...previousContext,
      engagement: engagementLevel
    };

    // Build improved prompt with context
    const systemPrompt = buildSeriesLecturePrompt(schedule, context);
    const userPrompt = `Write Part ${schedule.part} of the ${schedule.subject} lecture series.`;

    // Generate lecture script
    const { lectureContent, generatedBy } = await generateLecture(systemPrompt, userPrompt, logger);
    if (!lectureContent) throw new Error('AI returned empty script');

    // Send header
    const header = `🎓 *AI LECTURE: PART ${schedule.part}* 🎓\n\n` +
                   `*Topic:* ${schedule.subject}\n` +
                   `*Professor:* Prof AB\n` +
                   `-----------------------------------`;
    await sock.sendMessage(schedule.groupId, { text: header });

    // Deliver script with realistic typing
    await deliverLectureScript(sock, schedule.groupId, lectureContent, logger);

    // Save lecture summary for next time
    await saveLectureSummary(db, scheduleId, schedule.part, schedule.subject, lectureContent, logger);

    // Send footer
    await sock.sendPresenceUpdate('composing', schedule.groupId);
    await sleep(3000);
    const nextPart = schedule.part + 1;
    const footerMsg = nextPart <= CONFIG.MAX_LECTURE_PARTS
      ? `_Class dismissed. Part ${nextPart} will be delivered next week._`
      : `_This was the final lecture. Course concluded!_`;

    await sock.sendMessage(schedule.groupId, { 
      text: `-----------------------------------\n` +
            `🎓 *END OF PART ${schedule.part}* 🎓\n\n` +
            footerMsg
    });
    await sock.sendPresenceUpdate('paused', schedule.groupId);

    // Update database for next week
    await db.collection('lecture_schedules').updateOne(
      { _id: scheduleId },
      { 
        $set: { 
          part: nextPart,
          lastDeliveredTimestamp: new Date()
        } 
      }
    );

    // Track successful engagement
    await trackEngagement(db, scheduleId, true, logger);

    // Log success
    await logDeliveryHistory(db, scheduleId, schedule.part, 'success', null, logger);
    logger.info(`Successfully delivered lecture ${schedule.subject} Part ${schedule.part}`);

  } catch (error) {
    logger.error({ err: error, scheduleId }, 'Failed to run scheduled lecture');

    try {
      const schedule = await db.collection('lecture_schedules').findOne({ _id: scheduleId });
      if (schedule) {
        await sock.sendMessage(schedule.groupId, {
          text: `❌ *Lecture Delivery Failed*\n\n` +
                `I was scheduled to deliver *Part ${schedule.part} of ${schedule.subject}*, but an error occurred.\n\n` +
                `_Error: ${error.message}_\n\n` +
                `The lecture will be attempted again at the next scheduled time.`
        });

        // Track failed engagement
        await trackEngagement(db, scheduleId, false, logger);
        await logDeliveryHistory(db, scheduleId, schedule.part, 'failed', error, logger);
      }
    } catch (notifyError) {
      logger.error({ err: notifyError }, 'Failed to send error notification');
    }
  }
}

/**
 * Converts schedule info into a cron time string.
 */
function getCronTime(time, dayOfWeek) {
  const [hour, minute] = time.split(':');
  return `${minute} ${hour} * * ${dayOfWeek}`;
}

/**
 * Creates a unique, predictable job ID for the scheduler
 */
function getJobId(scheduleId) {
  return `lecture_${scheduleId.toString()}`;
}

// --- COMMAND HANDLERS ---

/**
 * Handles manual `.lecture` command with improved prompt
 */
async function handleManualLecture(context) {
  const { msg, text, sock, config, logger } = context;
  const topic = text;

  if (!topic) {
    await msg.reply(
      `Please provide a topic for the lecture.\n\n` +
      `*Usage:* ${config.PREFIX}lecture <topic>\n` +
      `*Example:* ${config.PREFIX}lecture The impact of Afrobeats on global music`
    );
    return;
  }

  await msg.react('🧠');
  const loadingMsg = await msg.reply(
    `🧠 *Preparing your lecture...*\n\n` +
    `*Topic:* ${topic}\n\n` +
    `_This might take a moment. Prof AB is writing the full script..._`
  );

  // Use improved prompt
  const systemPrompt = buildManualLecturePrompt(topic);
  const userPrompt = `Write a comprehensive lecture on: ${topic}`;

  try {
    const { lectureContent, generatedBy } = await generateLecture(systemPrompt, userPrompt, logger);
    if (!lectureContent) throw new Error('AI returned an empty script');

    const header = `🎓 *GHQ LECTURE: STARTING* 🎓\n\n` +
                     `*Topic:* ${topic}\n` +
                     `*Professor:* Prof AB\n` +
                     `-----------------------------------`;
    await sock.sendMessage(msg.from, { text: header, edit: loadingMsg.key });
    await msg.react('✅');

    await deliverLectureScript(sock, msg.from, lectureContent, logger);

    await sock.sendPresenceUpdate('composing', msg.from);
    await sleep(3000);
    await sock.sendMessage(msg.from, { 
      text: `-----------------------------------\n` +
            `🎓 *AI LECTURE: END* 🎓\n\n` +
            `_This concludes today's lecture._`
    });
    await sock.sendPresenceUpdate('paused', msg.from);
  } catch (error) {
    logger.error({ err: error }, 'AI Lecturer plugin failed (manual)');
    await msg.react('❌');
    await sock.sendMessage(msg.from, { 
      text: `❌ *Lecture Failed*\n\n${error.message}`, 
      edit: loadingMsg.key 
    });
  }
}

/**
 * Handles `.schedule-lecture <subject> | <day> | <time> | [timezone]`
 */
async function handleScheduleLecture(context) {
  const { msg, text, logger, helpers, sock } = context;
  const db = await PluginHelpers.getDB();

  try {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) {
      throw new Error('USAGE_ERROR');
    }

    const [subject, dayStr, timeStr, tzStr] = parts;
    if (!subject || !dayStr || !timeStr) {
      throw new Error('USAGE_ERROR');
    }

    const { dayOfWeek, time, timezone } = parseSchedule(dayStr, timeStr, tzStr);
    const cronTime = getCronTime(time, dayOfWeek);

    // Prepare schedule document
    const newSchedule = {
      groupId: msg.from,
      subject: subject,
      dayOfWeek: dayOfWeek,
      time: time,
      timezone: timezone,
      part: 1,
      lastDeliveredTimestamp: null,
      scheduledBy: msg.sender,
      createdAt: new Date()
    };

    // Insert into database (will fail if duplicate due to unique index)
    let insertResult;
    try {
      insertResult = await db.collection('lecture_schedules').insertOne(newSchedule);
    } catch (dbError) {
      if (dbError.code === 11000) {
        throw new Error(`A lecture on "${subject}" is already scheduled in this group. Cancel it first to reschedule.`);
      }
      throw dbError;
    }

    const scheduleId = insertResult.insertedId;

    // Register with cron scheduler
    const jobId = getJobId(scheduleId);
    try {
      const success = helpers.registerCronJob(
        jobId,
        cronTime,
        () => runScheduledLecture(scheduleId, sock, logger),
        timezone
      );

      if (!success) {
        throw new Error('Failed to register job with cron scheduler');
      }
    } catch (cronError) {
      // Rollback: delete from database if cron registration fails
      await db.collection('lecture_schedules').deleteOne({ _id: scheduleId });
      throw new Error(`Could not schedule lecture: ${cronError.message}`);
    }

    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
    await msg.reply(
      `✅ *Lecture Scheduled Successfully!*\n\n` +
      `*Subject:* ${subject}\n` +
      `*Schedule:* Every ${dayName} at ${time}\n` +
      `*Timezone:* ${timezone}\n` +
      `*Cron Pattern:* \`${cronTime}\`\n` +
      `*Job ID:* \`${jobId}\`\n\n` +
      `Part 1 will be delivered on the next scheduled day.\n` +
      `_Maximum ${CONFIG.MAX_LECTURE_PARTS} parts will be delivered._`
    );

  } catch (error) {
    logger.error({ err: error }, 'Failed to schedule lecture');

    if (error.message === 'USAGE_ERROR') {
      await msg.reply(
        `❌ *Invalid Format*\n\n` +
        `*Usage:* \`.schedule-lecture <Subject> | <Day> | <Time> | [Timezone]\`\n\n` +
        `*Examples:*\n` +
        `• \`.schedule-lecture Biology | Monday | 10:00\`\n` +
        `• \`.schedule-lecture Physics | 1 | 14:30 | Europe/London\`\n\n` +
        `*Day:* 0-6 (0=Sunday, 6=Saturday) or full name\n` +
        `*Time:* 24-hour HH:MM format\n` +
        `*Timezone:* Optional (default: ${CONFIG.DEFAULT_TIMEZONE})`
      );
    } else {
      await msg.reply(`❌ *Schedule Failed*\n\n${error.message}`);
    }
  }
}

/**
 * Handles `.list-lectures`
 */
async function handleListLectures(context) {
  const { msg, logger } = context;
  const db = await PluginHelpers.getDB();

  try {
    const schedules = await db.collection('lecture_schedules')
      .find({ groupId: msg.from })
      .sort({ subject: 1 })
      .toArray();

    if (schedules.length === 0) {
      await msg.reply(`📚 No lectures are currently scheduled for this group.\n\nUse \`.schedule-lecture\` to create one.`);
      return;
    }

    let reply = `📚 *Scheduled Lectures (${schedules.length})*\n`;

    for (const s of schedules) {
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.dayOfWeek];
      const lastRan = s.lastDeliveredTimestamp 
        ? new Date(s.lastDeliveredTimestamp).toLocaleString('en-GB', { timeZone: s.timezone })
        : 'Never';

      const progress = `${s.part - 1}/${CONFIG.MAX_LECTURE_PARTS}`;

      reply += `\n-----------------------------------\n` +
               `*${s.subject}*\n` +
               `├ Next Part: ${s.part}\n` +
               `├ Progress: ${progress} completed\n` +
               `├ Schedule: ${dayName} @ ${s.time}\n` +
               `├ Timezone: ${s.timezone}\n` +
               `├ Last Ran: ${lastRan}\n` +
               `└ Job ID: \`${getJobId(s._id)}\``;
    }

    await msg.reply(reply);
  } catch (error) {
    logger.error({ err: error }, 'Failed to list lectures');
    await msg.reply(`❌ Could not fetch lecture list.\n\n_Error: ${error.message}_`);
  }
}

/**
 * Handles `.cancel-lecture <subject>`
 */
async function handleCancelLecture(context) {
  const { msg, text, logger, helpers } = context;
  const db = await PluginHelpers.getDB();
  const subjectToCancel = text;

  if (!subjectToCancel) {
    await msg.reply(
      `Please provide the subject name to cancel.\n\n` +
      `*Usage:* \`.cancel-lecture <Subject>\`\n` +
      `*Example:* \`.cancel-lecture Biology\``
    );
    return;
  }

  try {
    const schedule = await db.collection('lecture_schedules').findOne({
      groupId: msg.from,
      subject: { $regex: new RegExp(`^${subjectToCancel}$`, 'i') }
    });

    if (!schedule) {
      await msg.reply(`❌ Could not find a lecture named "${subjectToCancel}" in this group.`);
      return;
    }

    const jobId = getJobId(schedule._id);

    // Cancel the cron job first
    const cronCancelled = helpers.cancelCronJob(jobId);

    // Delete from database
    const dbResult = await db.collection('lecture_schedules').deleteOne({ _id: schedule._id });

    if (dbResult.deletedCount === 0) {
      logger.warn(`Cron job ${jobId} cancelled but DB delete failed`);
      await msg.reply(
        `⚠️ Partially cancelled.\n\n` +
        `Cron job stopped but database entry remains. Please check logs.`
      );
    } else {
      const partsDelivered = schedule.part - 1;
      await msg.reply(
        `✅ *Lecture Series Cancelled*\n\n` +
        `*Subject:* ${schedule.subject}\n` +
        `*Parts Delivered:* ${partsDelivered}/${CONFIG.MAX_LECTURE_PARTS}\n` +
        `*Job ID:* \`${jobId}\`\n\n` +
        `The scheduled lectures have been permanently removed.`
      );
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to cancel lecture');
    await msg.reply(`❌ *Cancellation Failed*\n\n${error.message}`);
  }
}

/**
 * Handles `.lecture-history <subject>`
 */
async function handleLectureHistory(context) {
  const { msg, text, logger } = context;
  const db = await PluginHelpers.getDB();
  const subject = text;

  if (!subject) {
    await msg.reply(
      `Please provide the subject name.\n\n` +
      `*Usage:* \`.lecture-history <Subject>\`\n` +
      `*Example:* \`.lecture-history Biology\``
    );
    return;
  }

  try {
    const schedule = await db.collection('lecture_schedules').findOne({
      groupId: msg.from,
      subject: { $regex: new RegExp(`^${subject}$`, 'i') }
    });

    if (!schedule) {
      await msg.reply(`❌ No lecture series found for "${subject}" in this group.`);
      return;
    }

    const history = await db.collection('lecture_history')
      .find({ scheduleId: schedule._id })
      .sort({ deliveredAt: -1 })
      .limit(10)
      .toArray();

    if (history.length === 0) {
      await msg.reply(`📜 No delivery history found for "${subject}".\n\n_The first lecture hasn't been delivered yet._`);
      return;
    }

    let reply = `📜 *Lecture History: ${subject}*\n` +
                `_Showing last ${history.length} deliveries_\n`;

    for (const entry of history) {
      const status = entry.status === 'success' ? '✅' : '❌';
      const date = new Date(entry.deliveredAt).toLocaleString('en-GB', { 
        timeZone: schedule.timezone,
        dateStyle: 'short',
        timeStyle: 'short'
      });

      reply += `\n${status} Part ${entry.part} - ${date}`;
      if (entry.error) {
        reply += `\n   └ Error: ${entry.error}`;
      }
    }

    await msg.reply(reply);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch lecture history');
    await msg.reply(`❌ Could not fetch history.\n\n_Error: ${error.message}_`);
  }
}

// --- V3 PLUGIN EXPORT ---

export default {
  name: 'AI Lecturer (v3)',
  description: 'AI-powered course manager with manual lectures and automated weekly schedules.',
  category: 'ai',
  version: '3.2.0',
  author: 'Gemini + Claude',

  commands: ['lecture', 'teach', 'schedule-lecture', 'list-lectures', 'cancel-lecture', 'lecture-history'],
  aliases: ['ai-lecture', 'ai-teach', 'schedule-class', 'list-classes', 'cancel-class', 'lecture-log'],

  usage: 'Use .lecture <topic> or .schedule-lecture <subject> | <day> | <time> | [timezone]',
  example: '.lecture The Benin Empire\n.schedule-lecture History | Monday | 10:00 | Africa/Lagos\n.list-lectures\n.cancel-lecture History\n.lecture-history History',

  adminOnly: true,
  groupOnly: true,

  /**
   * Main V3 plugin execution function (Command Router)
   */
  async run(context) {
    const { command } = context;

    switch (command) {
      case 'lecture':
      case 'teach':
        await handleManualLecture(context);
        break;
      case 'schedule-lecture':
      case 'schedule-class':
        await handleScheduleLecture(context);
        break;
      case 'list-lectures':
      case 'list-classes':
        await handleListLectures(context);
        break;
      case 'cancel-lecture':
      case 'cancel-class':
        await handleCancelLecture(context);
        break;
      case 'lecture-history':
      case 'lecture-log':
        await handleLectureHistory(context);
        break;
    }
  },

  /**
   * V3 LIFECYCLE HOOK: onLoad
   * Loads all schedules from DB and registers them with node-cron.
   */
  async onLoad(context) {
    const { sock, logger, helpers } = context;
    const db = await PluginHelpers.getDB();

    logger.info('AI Lecturer (onLoad): Initializing...');

    try {
      // Ensure database indexes exist
      await ensureIndexes(db, logger);

      // Fetch all schedules
      const allSchedules = await db.collection('lecture_schedules').find().toArray();

      if (allSchedules.length === 0) {
        logger.info('AI Lecturer (onLoad): No schedules found in database');
        return;
      }

      logger.info(`AI Lecturer (onLoad): Found ${allSchedules.length} schedule(s) to load`);

      // Track already registered jobs to prevent duplicates
      const registeredJobs = new Set();
      let successCount = 0;
      let skipCount = 0;

      for (const schedule of allSchedules) {
        const jobId = getJobId(schedule._id);

        // Prevent duplicate registration
        if (registeredJobs.has(jobId)) {
          logger.warn(`Job ${jobId} already registered in this load cycle, skipping`);
          skipCount++;
          continue;
        }

        try {
          // Validate timezone is still valid
          try {
            new Date().toLocaleString('en-US', { timeZone: schedule.timezone });
          } catch (tzError) {
            logger.error(
              { scheduleId: schedule._id, timezone: schedule.timezone },
              'Invalid timezone in stored schedule, skipping'
            );
            skipCount++;
            continue;
          }

          const cronTime = getCronTime(schedule.time, schedule.dayOfWeek);

          // Register the job with fresh data fetching
          const success = helpers.registerCronJob(
            jobId,
            cronTime,
            () => runScheduledLecture(schedule._id, sock, logger),
            schedule.timezone
          );

          if (!success) {
            logger.error({ jobId, scheduleId: schedule._id }, 'Failed to register cron job');
            skipCount++;
            continue;
          }

          registeredJobs.add(jobId);
          successCount++;

          logger.info({
            jobId,
            subject: schedule.subject,
            groupId: schedule.groupId,
            cronTime,
            timezone: schedule.timezone
          }, 'Successfully registered lecture schedule');

        } catch (error) {
          logger.error(
            { err: error, scheduleId: schedule._id, subject: schedule.subject },
            'Error loading individual schedule'
          );
          skipCount++;
        }
      }

      logger.info(
        `AI Lecturer (onLoad): Completed. Success: ${successCount}, Skipped: ${skipCount}, Total: ${allSchedules.length}`
      );

      if (skipCount > 0) {
        logger.warn(`${skipCount} schedule(s) failed to load. Check logs for details.`);
      }

    } catch (error) {
      logger.error({ err: error }, 'AI Lecturer (onLoad): Critical error during initialization');
    }
  }
};