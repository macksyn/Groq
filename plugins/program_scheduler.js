// plugins/program_scheduler.js - V3 Format
// Group Activity Scheduler with RSVP, Analytics, and Live Notifications

import moment from 'moment-timezone';

// Configuration
const CONFIG = {
  TIMEZONE: 'Africa/Lagos',
  COLLECTION: 'group_scheduler',
  DEFAULT_REMINDER_HOURS: 2,
  MORNING_REMINDER_TIME: '08:00',
  TOMORROW_REMINDER_TIME: '22:00',
  DEFAULT_DURATION: 60,
  DEFAULT_REMINDERS: {
    morningReminder: true,
    tomorrowPreview: true,
    twoHourReminder: true,
    startNotification: true,
    endNotification: true
  }
};

// Emoji mapping for programs
const PROGRAM_EMOJIS = {
  'relationship': '💕',
  'food': '🍽️',
  'health': '🏥',
  'fitness': '💪',
  'study': '📚',
  'gaming': '🎮',
  'movie': '🎬',
  'music': '🎵',
  'owambe': '👗',
  'calls': '📞',
  'biz': '💼',
  'mcm': '💘',
  'wcw': '💘',
  'market': '🛒',
  'throwback': '📸',
  'bible': '📖',
  'worship': '🙏',
  'freaky': '🔞',
  'default': '📅'
};

// Store for tracking sent notifications
const sentNotifications = new Map();

// Helper Functions
function getProgramEmoji(programName) {
  const name = programName.toLowerCase();
  for (const [key, emoji] of Object.entries(PROGRAM_EMOJIS)) {
    if (name.includes(key)) return emoji;
  }
  return PROGRAM_EMOJIS.default;
}

function parseDay(dayInput) {
  const dayMap = {
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2, 'tues': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
    'sunday': 0, 'sun': 0
  };
  return dayMap[dayInput.toLowerCase()] ?? null;
}

function parseTime(timeInput) {
  const input = timeInput.toLowerCase().trim();
  const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
  const match = input.match(timeRegex);
  
  if (!match) return null;
  
  let hour = parseInt(match[1]);
  const minute = parseInt(match[2] || '0');
  const meridiem = match[3];
  
  if (minute < 0 || minute > 59) return null;
  
  if (meridiem) {
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  }
  
  if (hour < 0 || hour > 23) return null;
  
  return { hour, minute };
}

function parseDuration(durationInput) {
  if (!durationInput) return CONFIG.DEFAULT_DURATION;
  
  const input = durationInput.toLowerCase().trim();
  const patterns = [
    /^(\d+(?:\.\d+)?)\s*h(?:our)?s?$/i,
    /^(\d+)\s*m(?:in)?(?:ute)?s?$/i,
    /^(\d+)\s*h\s*(\d+)\s*m$/i
  ];
  
  let match = input.match(patterns[0]);
  if (match) return Math.round(parseFloat(match[1]) * 60);
  
  match = input.match(patterns[1]);
  if (match) return parseInt(match[1]);
  
  match = input.match(patterns[2]);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  
  return CONFIG.DEFAULT_DURATION;
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatTime(hour, minute) {
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${h}:${m} ${period}`;
}

function getDayName(dayNumber) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayNumber];
}

function getProgramsForDay(programs, dayNumber) {
  return programs
    .filter(p => p.enabled && p.day === dayNumber)
    .sort((a, b) => {
      if (a.hour !== b.hour) return a.hour - b.hour;
      return a.minute - b.minute;
    });
}

function getTodaysPrograms(programs) {
  const today = moment().tz(CONFIG.TIMEZONE).day();
  return getProgramsForDay(programs, today);
}

function getTomorrowsPrograms(programs) {
  const tomorrow = moment().tz(CONFIG.TIMEZONE).add(1, 'day').day();
  return getProgramsForDay(programs, tomorrow);
}

function shouldStartNow(program) {
  const now = moment().tz(CONFIG.TIMEZONE);
  const today = now.day();
  
  if (program.day !== today) return false;
  
  return program.hour === now.hour() && now.minute() === program.minute;
}

function shouldEndNow(program) {
  const now = moment().tz(CONFIG.TIMEZONE);
  const today = now.day();
  
  if (program.day !== today) return false;
  
  const programStart = moment().tz(CONFIG.TIMEZONE).hour(program.hour).minute(program.minute);
  const programEnd = programStart.clone().add(program.duration, 'minutes');
  
  return programEnd.hour() === now.hour() && programEnd.minute() === now.minute();
}

function shouldSendTwoHourReminder(program, reminderHours) {
  const now = moment().tz(CONFIG.TIMEZONE);
  const today = now.day();
  
  if (program.day !== today) return false;
  
  const programTime = moment().tz(CONFIG.TIMEZONE).hour(program.hour).minute(program.minute).second(0);
  const reminderTime = programTime.clone().subtract(reminderHours, 'hours');
  const timeDiff = now.diff(reminderTime, 'minutes');
  
  return timeDiff >= 0 && timeDiff < 10;
}

// Database Functions
async function initGroupScheduler(db, groupId) {
  const collection = db.collection(CONFIG.COLLECTION);
  const existing = await collection.findOne({ groupId });
  
  if (!existing) {
    const newScheduler = {
      groupId,
      enabled: true,
      programs: [],
      reminderSettings: CONFIG.DEFAULT_REMINDERS,
      analytics: {
        totalProgramsCreated: 0,
        totalProgramsCompleted: 0,
        totalAttendances: 0
      },
      lastDailyReminder: null,
      lastTomorrowReminder: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await collection.insertOne(newScheduler);
    return newScheduler;
  }
  
  if (!existing.reminderSettings) existing.reminderSettings = CONFIG.DEFAULT_REMINDERS;
  if (!existing.analytics) {
    existing.analytics = {
      totalProgramsCreated: 0,
      totalProgramsCompleted: 0,
      totalAttendances: 0
    };
  }
  
  return existing;
}

async function getGroupScheduler(db, groupId) {
  const collection = db.collection(CONFIG.COLLECTION);
  const scheduler = await collection.findOne({ groupId });
  return scheduler || await initGroupScheduler(db, groupId);
}

async function updateGroupScheduler(db, groupId, updates) {
  const collection = db.collection(CONFIG.COLLECTION);
  await collection.updateOne(
    { groupId },
    { $set: { ...updates, updatedAt: new Date() } },
    { upsert: true }
  );
  return true;
}

async function addProgram(db, groupId, name, day, time, duration) {
  const scheduler = await getGroupScheduler(db, groupId);
  
  const duplicate = scheduler.programs.find(p => 
    p.name.toLowerCase() === name.toLowerCase()
  );
  
  if (duplicate) return { error: 'duplicate', existing: duplicate };
  
  const program = {
    id: Date.now().toString(),
    name,
    day,
    dayName: getDayName(day),
    hour: time.hour,
    minute: time.minute,
    timeDisplay: formatTime(time.hour, time.minute),
    duration: duration || CONFIG.DEFAULT_DURATION,
    durationDisplay: formatDuration(duration || CONFIG.DEFAULT_DURATION),
    enabled: true,
    rsvps: { attending: [], notAttending: [] },
    stats: { timesRun: 0, totalAttendees: 0, avgAttendance: 0 },
    createdAt: new Date()
  };
  
  scheduler.programs.push(program);
  scheduler.analytics.totalProgramsCreated++;
  
  await updateGroupScheduler(db, groupId, { 
    programs: scheduler.programs,
    analytics: scheduler.analytics
  });
  
  return { success: true, program };
}

async function removeProgram(db, groupId, programId) {
  const scheduler = await getGroupScheduler(db, groupId);
  
  const index = scheduler.programs.findIndex(p => 
    p.id === programId || p.name.toLowerCase() === programId.toLowerCase()
  );
  if (index === -1) return false;
  
  const removed = scheduler.programs.splice(index, 1)[0];
  await updateGroupScheduler(db, groupId, { programs: scheduler.programs });
  
  return removed;
}

async function toggleProgram(db, groupId, programId) {
  const scheduler = await getGroupScheduler(db, groupId);
  
  const program = scheduler.programs.find(p => 
    p.id === programId || p.name.toLowerCase() === programId.toLowerCase()
  );
  if (!program) return false;
  
  program.enabled = !program.enabled;
  await updateGroupScheduler(db, groupId, { programs: scheduler.programs });
  
  return program;
}

async function rsvpToProgram(db, groupId, userId, programId, attending = true) {
  const scheduler = await getGroupScheduler(db, groupId);
  
  const program = scheduler.programs.find(p => 
    p.id === programId || p.name.toLowerCase() === programId.toLowerCase()
  );
  if (!program) return false;
  
  program.rsvps.attending = program.rsvps.attending.filter(id => id !== userId);
  program.rsvps.notAttending = program.rsvps.notAttending.filter(id => id !== userId);
  
  if (attending) {
    program.rsvps.attending.push(userId);
  } else {
    program.rsvps.notAttending.push(userId);
  }
  
  await updateGroupScheduler(db, groupId, { programs: scheduler.programs });
  
  return program;
}

async function clearProgramRSVPs(db, groupId, programId) {
  const scheduler = await getGroupScheduler(db, groupId);
  const program = scheduler.programs.find(p => p.id === programId);
  if (!program) return false;
  
  const attendeeCount = program.rsvps.attending.length;
  program.stats.timesRun++;
  program.stats.totalAttendees += attendeeCount;
  program.stats.avgAttendance = program.stats.totalAttendees / program.stats.timesRun;
  
  scheduler.analytics.totalProgramsCompleted++;
  scheduler.analytics.totalAttendances += attendeeCount;
  
  program.rsvps = { attending: [], notAttending: [] };
  
  await updateGroupScheduler(db, groupId, { 
    programs: scheduler.programs,
    analytics: scheduler.analytics
  });
  
  return true;
}

// Formatting Functions
function formatProgramList(programs, title = 'Scheduled Programs') {
  if (!programs || programs.length === 0) {
    return `📅 *${title}*\n\nNo programs scheduled yet.`;
  }
  
  let message = `📅 *${title}*\n\n`;
  const byDay = {};
  
  programs.forEach(program => {
    if (!byDay[program.day]) byDay[program.day] = [];
    byDay[program.day].push(program);
  });
  
  const sortedDays = Object.keys(byDay).sort((a, b) => parseInt(a) - parseInt(b));
  
  sortedDays.forEach(day => {
    const dayName = getDayName(parseInt(day));
    message += `*${dayName}*\n${'─'.repeat(20)}\n`;
    
    byDay[day]
      .sort((a, b) => {
        if (a.hour !== b.hour) return a.hour - b.hour;
        return a.minute - b.minute;
      })
      .forEach(program => {
        const emoji = getProgramEmoji(program.name);
        const status = program.enabled ? '' : ' (Disabled)';
        const attendeeCount = program.rsvps.attending.length;
        
        message += `${emoji} *${program.name}*${status}\n`;
        message += `   ⏰ ${program.timeDisplay} (${program.durationDisplay})\n`;
        if (attendeeCount > 0) {
          message += `   👥 ${attendeeCount} attending\n`;
        }
        message += `   🆔 ${program.id}\n\n`;
      });
  });
  
  return message;
}

function formatAnalytics(scheduler) {
  const analytics = scheduler.analytics || {};
  
  let message = `📊 *GROUP SCHEDULE ANALYTICS*\n\n`;
  message += `📈 *Overall Statistics:*\n`;
  message += `• Total Programs Created: ${analytics.totalProgramsCreated || 0}\n`;
  message += `• Programs Completed: ${analytics.totalProgramsCompleted || 0}\n`;
  message += `• Total Attendances: ${analytics.totalAttendances || 0}\n`;
  
  if (analytics.totalProgramsCompleted > 0) {
    const avgAttendance = Math.round(analytics.totalAttendances / analytics.totalProgramsCompleted);
    message += `• Avg Attendance: ${avgAttendance} per program\n`;
  }
  
  message += `\n🏆 *Top Programs:*\n`;
  
  const programsWithStats = scheduler.programs
    .filter(p => p.stats?.timesRun > 0)
    .sort((a, b) => b.stats.avgAttendance - a.stats.avgAttendance)
    .slice(0, 5);
  
  if (programsWithStats.length > 0) {
    programsWithStats.forEach((program, index) => {
      const emoji = getProgramEmoji(program.name);
      message += `${index + 1}. ${emoji} ${program.name}\n`;
      message += `   • Avg Attendance: ${Math.round(program.stats.avgAttendance)}\n`;
      message += `   • Times Run: ${program.stats.timesRun}\n\n`;
    });
  } else {
    message += `No completed programs yet.\n\n`;
  }
  
  message += `💡 Use .schedule report [program] for detailed program stats`;
  
  return message;
}

function formatProgramReport(program) {
  const emoji = getProgramEmoji(program.name);
  
  let message = `📊 *PROGRAM REPORT*\n\n${emoji} *${program.name}*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `📅 *Schedule:*\n`;
  message += `• Day: ${program.dayName}\n`;
  message += `• Time: ${program.timeDisplay}\n`;
  message += `• Duration: ${program.durationDisplay}\n`;
  message += `• Status: ${program.enabled ? 'Active ✅' : 'Disabled 🚫'}\n\n`;
  message += `👥 *Current RSVPs:*\n`;
  message += `• Attending: ${program.rsvps.attending.length}\n`;
  message += `• Not Attending: ${program.rsvps.notAttending.length}\n\n`;
  
  if (program.stats?.timesRun > 0) {
    message += `📈 *Performance:*\n`;
    message += `• Times Run: ${program.stats.timesRun}\n`;
    message += `• Total Attendees: ${program.stats.totalAttendees}\n`;
    message += `• Avg Attendance: ${Math.round(program.stats.avgAttendance)}\n\n`;
  }
  
  message += `🆔 ID: ${program.id}\n`;
  message += `📅 Created: ${moment(program.createdAt).format('MMM DD, YYYY')}`;
  
  return message;
}

// Scheduled Task Handlers
async function sendDailyReminders(context) {
  const { sock, db, logger } = context;
  
  try {
    logger.info('📅 Sending daily morning reminders...');
    
    const collection = db.collection(CONFIG.COLLECTION);
    const allSchedulers = await collection.find({ enabled: true }).toArray();
    
    if (!allSchedulers || allSchedulers.length === 0) {
      logger.info('No active group schedulers found');
      return;
    }
    
    const today = moment().tz(CONFIG.TIMEZONE);
    const todayStr = today.format('YYYY-MM-DD');
    
    for (const scheduler of allSchedulers) {
      if (!scheduler.reminderSettings?.morningReminder) continue;
      if (scheduler.lastDailyReminder === todayStr) continue;
      
      const todaysPrograms = getTodaysPrograms(scheduler.programs);
      if (todaysPrograms.length === 0) continue;
      
      let message = `🌅 *Good Morning!*\n\n📅 *Today's Programs (${today.format('dddd, MMM Do')})*\n\n`;
      
      todaysPrograms.forEach((program, index) => {
        const emoji = getProgramEmoji(program.name);
        const attendeeCount = program.rsvps.attending.length;
        
        message += `${index + 1}. ${emoji} *${program.name}*\n`;
        message += `   ⏰ ${program.timeDisplay} (${program.durationDisplay})\n`;
        if (attendeeCount > 0) {
          message += `   👥 ${attendeeCount} attending\n`;
        }
        message += `\n`;
      });
      
      message += `💡 RSVP with: .attend [program name]\n`;
      message += `📢 You'll receive reminders before each program!\n`;
      message += `━━━━━━━━━━━━━━━━━━━━`;
      
      try {
        await sock.sendMessage(scheduler.groupId, { text: message });
        await updateGroupScheduler(db, scheduler.groupId, { lastDailyReminder: todayStr });
        logger.info(`✅ Sent daily reminder to ${scheduler.groupId}`);
      } catch (error) {
        logger.error(`Failed to send daily reminder to ${scheduler.groupId}:`, error.message);
      }
    }
    
    logger.info('✅ Daily reminders completed');
  } catch (error) {
    logger.error('Error sending daily reminders:', error);
  }
}

async function sendTomorrowReminders(context) {
  const { sock, db, logger } = context;
  
  try {
    logger.info('🌙 Sending tomorrow\'s preview reminders...');
    
    const collection = db.collection(CONFIG.COLLECTION);
    const allSchedulers = await collection.find({ enabled: true }).toArray();
    
    if (!allSchedulers || allSchedulers.length === 0) return;
    
    const today = moment().tz(CONFIG.TIMEZONE);
    const tomorrow = today.clone().add(1, 'day');
    const todayStr = today.format('YYYY-MM-DD');
    
    for (const scheduler of allSchedulers) {
      if (!scheduler.reminderSettings?.tomorrowPreview) continue;
      if (scheduler.lastTomorrowReminder === todayStr) continue;
      
      const tomorrowsPrograms = getTomorrowsPrograms(scheduler.programs);
      if (tomorrowsPrograms.length === 0) continue;
      
      let message = `🌙 *Tomorrow's Preview*\n\n📅 *${tomorrow.format('dddd, MMM Do')}*\n\n`;
      
      tomorrowsPrograms.forEach((program, index) => {
        const emoji = getProgramEmoji(program.name);
        message += `${index + 1}. ${emoji} *${program.name}*\n`;
        message += `   ⏰ ${program.timeDisplay} (${program.durationDisplay})\n\n`;
      });
      
      message += `✨ Get ready for an exciting day ahead!\n`;
      message += `💡 RSVP early: .attend [program name]\n`;
      message += `━━━━━━━━━━━━━━━━━━━━`;
      
      try {
        await sock.sendMessage(scheduler.groupId, { text: message });
        await updateGroupScheduler(db, scheduler.groupId, { lastTomorrowReminder: todayStr });
        logger.info(`✅ Sent tomorrow's preview to ${scheduler.groupId}`);
      } catch (error) {
        logger.error(`Failed to send tomorrow's preview:`, error.message);
      }
    }
    
    logger.info('✅ Tomorrow\'s preview reminders completed');
  } catch (error) {
    logger.error('Error sending tomorrow\'s reminders:', error);
  }
}

async function checkTwoHourReminders(context) {
  const { sock, db, logger } = context;
  
  try {
    const collection = db.collection(CONFIG.COLLECTION);
    const allSchedulers = await collection.find({ enabled: true }).toArray();
    
    if (!allSchedulers || allSchedulers.length === 0) return;
    
    const now = moment().tz(CONFIG.TIMEZONE);
    
    for (const scheduler of allSchedulers) {
      if (!scheduler.reminderSettings?.twoHourReminder) continue;
      
      const todaysPrograms = getTodaysPrograms(scheduler.programs);
      const reminderHours = CONFIG.DEFAULT_REMINDER_HOURS;
      
      for (const program of todaysPrograms) {
        if (!shouldSendTwoHourReminder(program, reminderHours)) continue;
        
        const reminderKey = `2hr_${scheduler.groupId}_${program.id}_${now.format('YYYY-MM-DD')}`;
        if (sentNotifications.has(reminderKey)) continue;
        
        const emoji = getProgramEmoji(program.name);
        const attendeeCount = program.rsvps.attending.length;
        
        let message = `⏰ *REMINDER ALERT* ⏰\n\n${emoji} *${program.name}* starts in ${reminderHours} hours!\n\n`;
        message += `🕐 Time: *${program.timeDisplay}*\n⏱️ Duration: ${program.durationDisplay}\n`;
        
        if (attendeeCount > 0) {
          message += `👥 ${attendeeCount} people attending\n`;
        }
        
        message += `\n📍 Don't miss it! 🔥\n💡 RSVP: .attend ${program.name}\n━━━━━━━━━━━━━━━━━━━━`;
        
        try {
          await sock.sendMessage(scheduler.groupId, { text: message });
          sentNotifications.set(reminderKey, Date.now());
          logger.info(`✅ Sent 2-hour reminder for "${program.name}"`);
        } catch (error) {
          logger.error(`Failed to send reminder:`, error.message);
        }
      }
    }
    
    // Cleanup old notifications
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    for (const [key, timestamp] of sentNotifications.entries()) {
      if (timestamp < oneDayAgo) {
        sentNotifications.delete(key);
      }
    }
  } catch (error) {
    logger.error('Error checking 2-hour reminders:', error);
  }
}

async function checkLivePrograms(context) {
  const { sock, db, logger } = context;
  
  try {
    const collection = db.collection(CONFIG.COLLECTION);
    const allSchedulers = await collection.find({ enabled: true }).toArray();
    
    if (!allSchedulers || allSchedulers.length === 0) return;
    
    const now = moment().tz(CONFIG.TIMEZONE);
    
    for (const scheduler of allSchedulers) {
      const todaysPrograms = getTodaysPrograms(scheduler.programs);
      
      for (const program of todaysPrograms) {
        // Check for start notification
        if (scheduler.reminderSettings?.startNotification && shouldStartNow(program)) {
          const startKey = `start_${scheduler.groupId}_${program.id}_${now.format('YYYY-MM-DD')}`;
          
          if (!sentNotifications.has(startKey)) {
            const emoji = getProgramEmoji(program.name);
            const attendees = program.rsvps.attending;
            
            let message = `🔴 *LIVE NOW* 🔴\n\n${emoji} *${program.name}* is starting!\n\n`;
            message += `⏰ Time: ${program.timeDisplay}\n⏱️ Duration: ${program.durationDisplay}\n`;
            
            if (attendees.length > 0) {
              message += `\n👥 *Confirmed Attendees (${attendees.length}):*\n`;
              const mentions = attendees.slice(0, 5).map(id => `@${id.split('@')[0]}`).join(', ');
              message += mentions;
              if (attendees.length > 5) {
                message += ` and ${attendees.length - 5} others`;
              }
            }
            
            message += `\n\n📍 Join the discussion now! 🔥\n━━━━━━━━━━━━━━━━━━━━`;
            
            try {
              await sock.sendMessage(scheduler.groupId, { text: message, mentions: attendees });
              sentNotifications.set(startKey, Date.now());
              logger.info(`✅ Sent start notification for "${program.name}"`);
            } catch (error) {
              logger.error(`Failed to send start notification:`, error.message);
            }
          }
        }
        
        // Check for end notification
        if (scheduler.reminderSettings?.endNotification && shouldEndNow(program)) {
          const endKey = `end_${scheduler.groupId}_${program.id}_${now.format('YYYY-MM-DD')}`;
          
          if (!sentNotifications.has(endKey)) {
            const emoji = getProgramEmoji(program.name);
            const attendeeCount = program.rsvps.attending.length;
            
            let message = `🟢 *PROGRAM ENDED* 🟢\n\nThat will be all for today's ${emoji} *${program.name}*!\n\n`;
            
            if (attendeeCount > 0) {
              message += `👏 Thanks to our ${attendeeCount} participant${attendeeCount > 1 ? 's' : ''}!\n`;
            }
            
            message += `\n✨ See you next ${program.dayName}!\n━━━━━━━━━━━━━━━━━━━━`;
            
            try {
              await sock.sendMessage(scheduler.groupId, { text: message });
              sentNotifications.set(endKey, Date.now());
              logger.info(`✅ Sent end notification for "${program.name}"`);
              
              // Clear RSVPs after program ends
              await clearProgramRSVPs(db, scheduler.groupId, program.id);
            } catch (error) {
              logger.error(`Failed to send end notification:`, error.message);
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error checking live programs:', error);
  }
}

// V3 Plugin Export
export default {
  name: 'schedule',
  description: 'Enhanced schedule manager with RSVP, analytics, and live notifications',
  aliases: ['program', 'activity'],
  category: 'group',
  usage: 'add [name] | [day] | [time] | [duration]',
  example: 'schedule add Food\'s Corner | Friday | 5 PM | 2h',
  version: '2.0.0',
  groupOnly: true,
  commands: ['schedule', 'programs', 'activities', 'today', 'attend', 'rsvp', 'cantmake', 'attendees'],
  
  scheduledTasks: [
    {
      name: 'daily_morning_reminder',
      schedule: '0 8 * * *',
      description: 'Send daily morning reminder for today\'s programs',
      handler: sendDailyReminders
    },
    {
      name: 'tomorrow_preview_reminder',
      schedule: '0 22 * * *',
      description: 'Send tomorrow\'s programs preview',
      handler: sendTomorrowReminders
    },
    {
      name: 'two_hour_reminder_check',
      schedule: '*/10 * * * *',
      description: 'Check and send 2-hour advance reminders',
      handler: checkTwoHourReminders
    },
    {
      name: 'live_program_notifications',
      schedule: '* * * * *',
      description: 'Send live start and end notifications',
      handler: checkLivePrograms
    }
  ],

  async run({ msg, args, text, command, sock, db, config, helpers, logger }) {
    const { PermissionHelpers } = helpers;
    
    const groupId = msg.key.remoteJid;
    const senderId = msg.key.participant || msg.key.remoteJid;
    
    if (!groupId.endsWith('@g.us')) {
      return await msg.reply('⚠️ This command only works in groups!');
    }
    
    const dbInstance = await db.getDatabase();
    if (!dbInstance) {
      return await msg.reply('❌ Database unavailable. Please try again later.');
    }
    
    const isAdmin = PermissionHelpers.isOwner(senderId, config.OWNER_NUMBER + '@s.whatsapp.net') ||
                    (config.ADMIN_NUMBERS && config.ADMIN_NUMBERS.split(',').some(num => 
                      senderId.includes(num.trim())));
    
    // Route to appropriate handler
    const cmd = command.toLowerCase();
    
    switch (cmd) {
      case 'schedule':
      case 'program':
      case 'activity':
        await handleScheduleCommand(args, senderId, groupId, msg, dbInstance, isAdmin, config);
        break;
        
      case 'programs':
      case 'activities':
        await handleProgramsCommand(groupId, msg, dbInstance);
        break;
        
      case 'today':
        await handleTodayCommand(groupId, msg, dbInstance);
        break;
        
      case 'attend':
      case 'rsvp':
        await handleAttendCommand(text, senderId, groupId, msg, dbInstance);
        break;
        
      case 'cantmake':
        await handleCantMakeCommand(text, senderId, groupId, msg, dbInstance);
        break;
        
      case 'attendees':
        await handleAttendeesCommand(text, groupId, msg, dbInstance, sock);
        break;
    }
  }
};

// Command Handlers
async function handleScheduleCommand(args, senderId, groupId, msg, db, isAdmin, config) {
  if (!isAdmin) {
    return await msg.reply('🚫 *Admin Only*\n\nOnly admins can manage the schedule.');
  }
  
  if (args.length === 0) {
    const helpText = `📅 *Schedule Management*\n\n` +
      `*Add Program:*\n` +
      `• .schedule add [name] | [day] | [time] | [duration]\n` +
      `• Example: .schedule add Food's Corner | Friday | 5 PM | 2h\n\n` +
      `*Remove Program:*\n` +
      `• .schedule remove [id or name]\n\n` +
      `*Toggle Program:*\n` +
      `• .schedule toggle [id or name]\n\n` +
      `*Analytics:*\n` +
      `• .schedule stats - Group analytics\n` +
      `• .schedule report [program] - Program details\n\n` +
      `*Settings:*\n` +
      `• .schedule settings - View/edit reminder settings\n\n` +
      `*Enable/Disable:*\n` +
      `• .schedule on/off`;
    
    return await msg.reply(helpText);
  }
  
  const action = args[0].toLowerCase();
  
  switch (action) {
    case 'add':
      await handleAddProgram(args.slice(1).join(' '), groupId, msg, db);
      break;
      
    case 'remove':
    case 'delete':
      await handleRemoveProgram(args.slice(1).join(' '), groupId, msg, db);
      break;
      
    case 'toggle':
      await handleToggleProgram(args.slice(1).join(' '), groupId, msg, db);
      break;
      
    case 'stats':
    case 'analytics':
      await handleStatsCommand(groupId, msg, db);
      break;
      
    case 'report':
      await handleReportCommand(args.slice(1).join(' '), groupId, msg, db);
      break;
      
    case 'settings':
      await handleSettingsCommand(args.slice(1), groupId, msg, db);
      break;
      
    case 'on':
    case 'enable':
      await updateGroupScheduler(db, groupId, { enabled: true });
      await msg.reply('✅ *Scheduler Enabled*\n\nAutomated reminders are now active!');
      break;
      
    case 'off':
    case 'disable':
      await updateGroupScheduler(db, groupId, { enabled: false });
      await msg.reply('🚫 *Scheduler Disabled*\n\nAutomated reminders are now paused.');
      break;
      
    default:
      await msg.reply('❌ Unknown action. Use `.schedule` for help.');
  }
}

async function handleAddProgram(input, groupId, msg, db) {
  const parts = input.split('|').map(p => p.trim());
  
  if (parts.length < 3) {
    return await msg.reply('⚠️ *Invalid Format*\n\nUse: .schedule add [name] | [day] | [time] | [duration]\n\n' +
      'Example: .schedule add Food\'s Corner | Friday | 5 PM | 2h\n' +
      'Duration is optional (default: 1h)');
  }
  
  const [name, dayInput, timeInput, durationInput] = parts;
  
  if (!name) {
    return await msg.reply('❌ Program name is required!');
  }
  
  const day = parseDay(dayInput);
  if (day === null) {
    return await msg.reply('❌ Invalid day! Use: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, or Sunday');
  }
  
  const time = parseTime(timeInput);
  if (!time) {
    return await msg.reply('❌ Invalid time format! Examples: 5:00 PM, 17:00, 5pm');
  }
  
  const duration = parseDuration(durationInput);
  
  const result = await addProgram(db, groupId, name, day, time, duration);
  
  if (result.error === 'duplicate') {
    return await msg.reply(`❌ *Program Already Exists*\n\nA program named "${result.existing.name}" is already scheduled.`);
  }
  
  if (!result.success) {
    return await msg.reply('❌ Failed to add program. Please try again.');
  }
  
  const emoji = getProgramEmoji(result.program.name);
  const confirmText = `✅ *Program Added Successfully!*\n\n` +
    `${emoji} *${result.program.name}*\n` +
    `📅 Day: ${result.program.dayName}\n` +
    `⏰ Time: ${result.program.timeDisplay}\n` +
    `⏱️ Duration: ${result.program.durationDisplay}\n` +
    `🆔 ID: ${result.program.id}\n\n` +
    `🔔 Automated reminders are now active!`;
  
  await msg.reply(confirmText);
}

async function handleRemoveProgram(identifier, groupId, msg, db) {
  if (!identifier) {
    return await msg.reply('⚠️ Specify program ID or name.\n\nExample: .schedule remove Food\'s Corner');
  }
  
  const removed = await removeProgram(db, groupId, identifier);
  
  if (!removed) {
    return await msg.reply('❌ Program not found! Use `.programs` to see all programs.');
  }
  
  const emoji = getProgramEmoji(removed.name);
  await msg.reply(`✅ *Program Removed*\n\n${emoji} ${removed.name} has been removed from the schedule.`);
}

async function handleToggleProgram(identifier, groupId, msg, db) {
  if (!identifier) {
    return await msg.reply('⚠️ Specify program ID or name.');
  }
  
  const program = await toggleProgram(db, groupId, identifier);
  
  if (!program) {
    return await msg.reply('❌ Program not found!');
  }
  
  const emoji = getProgramEmoji(program.name);
  const status = program.enabled ? 'Enabled' : 'Disabled';
  await msg.reply(`${program.enabled ? '✅' : '🚫'} *Program ${status}*\n\n${emoji} ${program.name}`);
}

async function handleStatsCommand(groupId, msg, db) {
  const scheduler = await getGroupScheduler(db, groupId);
  
  if (!scheduler) {
    return await msg.reply('❌ Failed to load scheduler data.');
  }
  
  const message = formatAnalytics(scheduler);
  await msg.reply(message);
}

async function handleReportCommand(identifier, groupId, msg, db) {
  if (!identifier) {
    return await msg.reply('⚠️ Specify program name or ID.\n\nExample: .schedule report Food\'s Corner');
  }
  
  const scheduler = await getGroupScheduler(db, groupId);
  if (!scheduler) {
    return await msg.reply('❌ Failed to load scheduler data.');
  }
  
  const program = scheduler.programs.find(p => 
    p.id === identifier || p.name.toLowerCase() === identifier.toLowerCase()
  );
  
  if (!program) {
    return await msg.reply('❌ Program not found!');
  }
  
  const message = formatProgramReport(program);
  await msg.reply(message);
}

async function handleSettingsCommand(args, groupId, msg, db) {
  const scheduler = await getGroupScheduler(db, groupId);
  if (!scheduler) {
    return await msg.reply('❌ Failed to load scheduler data.');
  }
  
  if (args.length === 0) {
    const settings = scheduler.reminderSettings || CONFIG.DEFAULT_REMINDERS;
    
    let message = `⚙️ *REMINDER SETTINGS*\n\n`;
    message += `🌅 Morning Reminder (8 AM): ${settings.morningReminder ? '✅' : '❌'}\n`;
    message += `🌙 Tomorrow Preview (10 PM): ${settings.tomorrowPreview ? '✅' : '❌'}\n`;
    message += `⏰ 2-Hour Reminder: ${settings.twoHourReminder ? '✅' : '❌'}\n`;
    message += `🔴 Start Notification: ${settings.startNotification ? '✅' : '❌'}\n`;
    message += `🟢 End Notification: ${settings.endNotification ? '✅' : '❌'}\n\n`;
    message += `💡 Toggle: .schedule settings [type] on/off\n`;
    message += `Example: .schedule settings start off`;
    
    return await msg.reply(message);
  }
  
  const settingType = args[0].toLowerCase();
  const action = args[1]?.toLowerCase();
  
  if (!action || !['on', 'off'].includes(action)) {
    return await msg.reply('⚠️ Usage: .schedule settings [type] on/off');
  }
  
  const settingMap = {
    'morning': 'morningReminder',
    'tomorrow': 'tomorrowPreview',
    '2hour': 'twoHourReminder',
    'twohour': 'twoHourReminder',
    'start': 'startNotification',
    'end': 'endNotification'
  };
  
  const settingKey = settingMap[settingType];
  if (!settingKey) {
    return await msg.reply('❌ Invalid setting type. Use: morning, tomorrow, 2hour, start, end');
  }
  
  scheduler.reminderSettings[settingKey] = action === 'on';
  await updateGroupScheduler(db, groupId, { reminderSettings: scheduler.reminderSettings });
  
  await msg.reply(`✅ ${settingKey} ${action === 'on' ? 'enabled' : 'disabled'}`);
}

async function handleProgramsCommand(groupId, msg, db) {
  const scheduler = await getGroupScheduler(db, groupId);
  
  if (!scheduler) {
    return await msg.reply('❌ Failed to load scheduler data.');
  }
  
  const message = formatProgramList(scheduler.programs);
  await msg.reply(message);
}

async function handleTodayCommand(groupId, msg, db) {
  const scheduler = await getGroupScheduler(db, groupId);
  
  if (!scheduler) {
    return await msg.reply('❌ Failed to load scheduler data.');
  }
  
  const today = moment().tz(CONFIG.TIMEZONE);
  const todaysPrograms = getTodaysPrograms(scheduler.programs);
  
  if (todaysPrograms.length === 0) {
    return await msg.reply(`📅 *Today's Schedule*\n\n${today.format('dddd, MMMM Do')}\n\nNo programs scheduled for today. Enjoy your free day! 🌟`);
  }
  
  let message = `📅 *Today's Schedule*\n\n${today.format('dddd, MMMM Do')}\n\n`;
  
  todaysPrograms.forEach((program, index) => {
    const emoji = getProgramEmoji(program.name);
    const attendeeCount = program.rsvps.attending.length;
    
    message += `${index + 1}. ${emoji} *${program.name}*\n`;
    message += `   ⏰ ${program.timeDisplay} (${program.durationDisplay})\n`;
    if (attendeeCount > 0) {
      message += `   👥 ${attendeeCount} attending\n`;
    }
    message += `\n`;
  });
  
  message += `💡 RSVP: .attend [program name]`;
  
  await msg.reply(message);
}

async function handleAttendCommand(programName, userId, groupId, msg, db) {
  if (!programName) {
    return await msg.reply('⚠️ Specify program name.\n\nExample: .attend Food\'s Corner');
  }
  
  const program = await rsvpToProgram(db, groupId, userId, programName, true);
  
  if (!program) {
    return await msg.reply('❌ Program not found! Use `.programs` to see all programs.');
  }
  
  const emoji = getProgramEmoji(program.name);
  const attendeeCount = program.rsvps.attending.length;
  
  await msg.reply(`✅ *RSVP Confirmed!*\n\n${emoji} ${program.name}\n⏰ ${program.timeDisplay}\n👥 ${attendeeCount} attending`);
}

async function handleCantMakeCommand(programName, userId, groupId, msg, db) {
  if (!programName) {
    return await msg.reply('⚠️ Specify program name.');
  }
  
  const program = await rsvpToProgram(db, groupId, userId, programName, false);
  
  if (!program) {
    return await msg.reply('❌ Program not found!');
  }
  
  const emoji = getProgramEmoji(program.name);
  await msg.reply(`📝 *Noted*\n\n${emoji} ${program.name}\nYou've been marked as unable to attend.`);
}

async function handleAttendeesCommand(programName, groupId, msg, db, sock) {
  if (!programName) {
    return await msg.reply('⚠️ Specify program name.\n\nExample: .attendees Food\'s Corner');
  }
  
  const scheduler = await getGroupScheduler(db, groupId);
  if (!scheduler) {
    return await msg.reply('❌ Failed to load scheduler data.');
  }
  
  const program = scheduler.programs.find(p => 
    p.id === programName || p.name.toLowerCase() === programName.toLowerCase()
  );
  
  if (!program) {
    return await msg.reply('❌ Program not found!');
  }
  
  const emoji = getProgramEmoji(program.name);
  const attendees = program.rsvps.attending;
  const notAttending = program.rsvps.notAttending;
  
  let message = `👥 *RSVP LIST*\n\n${emoji} *${program.name}*\n`;
  message += `⏰ ${program.dayName} at ${program.timeDisplay}\n\n`;
  
  if (attendees.length > 0) {
    message += `✅ *Attending (${attendees.length}):*\n`;
    attendees.forEach((id, index) => {
      message += `${index + 1}. @${id.split('@')[0]}\n`;
    });
  } else {
    message += `✅ *Attending:* None yet\n`;
  }
  
  if (notAttending.length > 0) {
    message += `\n❌ *Can't Make It (${notAttending.length}):*\n`;
    notAttending.forEach((id, index) => {
      message += `${index + 1}. @${id.split('@')[0]}\n`;
    });
  }
  
  message += `\n💡 RSVP with: .attend ${program.name}`;
  
  await sock.sendMessage(groupId, {
    text: message,
    mentions: [...attendees, ...notAttending]
  }, { quoted: msg.message });
}