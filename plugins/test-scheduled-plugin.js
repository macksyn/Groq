// plugins/test_scheduled.js - Simple test plugin to verify scheduled tasks work
import moment from 'moment-timezone';

// Plugin information with test scheduled tasks
export const info = {
  name: 'Test Scheduled Tasks',
  version: '1.0.0',
  description: 'Test plugin to verify scheduled tasks are working',
  author: 'Bot Developer',
  category: 'testing',
  
  // Define test scheduled tasks that run every few minutes
  scheduledTasks: [
    {
      name: 'test_every_2_minutes',
      schedule: '*/2 * * * *', // Every 2 minutes
      description: 'Test task that runs every 2 minutes',
      handler: async () => {
        console.log(`🔔 TEST SCHEDULED TASK: ${moment().tz('Africa/Lagos').format('HH:mm:ss')} - Every 2 minutes task executed!`);
        await sendTestMessage('2-minute test completed');
      }
    },
    {
      name: 'test_every_5_minutes',
      schedule: '*/5 * * * *', // Every 5 minutes
      description: 'Test task that runs every 5 minutes',
      handler: async () => {
        console.log(`🔔 TEST SCHEDULED TASK: ${moment().tz('Africa/Lagos').format('HH:mm:ss')} - Every 5 minutes task executed!`);
        await sendTestMessage('5-minute test completed');
      }
    },
    {
      name: 'test_hourly',
      schedule: '0 * * * *', // Every hour at minute 0
      description: 'Test task that runs every hour',
      handler: async () => {
        console.log(`🔔 TEST SCHEDULED TASK: ${moment().tz('Africa/Lagos').format('HH:mm:ss')} - Hourly task executed!`);
        await sendTestMessage('Hourly test completed');
      }
    }
  ],
  
  commands: [
    {
      name: 'testschedule',
      description: 'Test scheduled tasks system',
      usage: '.testschedule',
      category: 'testing'
    }
  ]
};

// Global variables
let botSocket = null;
let botConfig = null;

// Function to send test messages
async function sendTestMessage(taskType) {
  try {
    if (!botSocket || !botConfig?.OWNER_NUMBER) {
      console.log('❌ Cannot send test message: No bot socket or owner number');
      return;
    }
    
    const currentTime = moment().tz('Africa/Lagos').format('dddd, MMMM DD, YYYY [at] HH:mm:ss');
    
    const testMessage = `🧪 *SCHEDULED TASK TEST* 🧪\n\n` +
                       `✅ *Task:* ${taskType}\n` +
                       `⏰ *Time:* ${currentTime}\n` +
                       `🤖 *Status:* Scheduled tasks working perfectly!\n\n` +
                       `This message confirms your scheduled task system is operational.`;
    
    await botSocket.sendMessage(botConfig.OWNER_NUMBER + '@s.whatsapp.net', {
      text: testMessage
    });
    
    console.log(`✅ Test message sent to owner for: ${taskType}`);
    
  } catch (error) {
    console.error('❌ Error sending test message:', error.message);
  }
}

// Main plugin handler
export default async function testScheduledHandler(m, sock, config) {
  try {
    // Store bot references for scheduled tasks
    botSocket = sock;
    botConfig = config;
    
    // Handle commands
    if (!m.body || !m.body.startsWith(config.PREFIX)) return;
    
    const args = m.body.slice(config.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();
    
    if (command === 'testschedule') {
      const reply = async (text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
      
      try {
        // Get current time and next scheduled times
        const now = moment().tz('Africa/Lagos');
        const next2Min = now.clone().add(2 - (now.minute() % 2), 'minutes').startOf('minute');
        const next5Min = now.clone().add(5 - (now.minute() % 5), 'minutes').startOf('minute');
        const nextHour = now.clone().add(1, 'hour').startOf('hour');
        
        let testInfo = `🧪 *SCHEDULED TASK TEST INFO* 🧪\n\n`;
        testInfo += `⏰ *Current Time:* ${now.format('dddd, MMM DD [at] HH:mm:ss')}\n\n`;
        testInfo += `📅 *Next Scheduled Tasks:*\n`;
        testInfo += `• Every 2 min: ${next2Min.format('HH:mm:ss')} (${next2Min.fromNow()})\n`;
        testInfo += `• Every 5 min: ${next5Min.format('HH:mm:ss')} (${next5Min.fromNow()})\n`;
        testInfo += `• Every hour: ${nextHour.format('HH:mm:ss')} (${nextHour.fromNow()})\n\n`;
        testInfo += `🔍 *How to Verify:*\n`;
        testInfo += `• Check console logs for task execution\n`;
        testInfo += `• Owner will receive test messages\n`;
        testInfo += `• Use API endpoint: /api/scheduled-tasks\n\n`;
        testInfo += `💡 If tasks don't run, check:\n`;
        testInfo += `• Plugin Manager is loaded\n`;
        testInfo += `• Cron jobs are initialized\n`;
        testInfo += `• Bot has been running continuously`;
        
        await reply(testInfo);
        
        // Send manual test message immediately
        await sendTestMessage('Manual test via command');
        
      } catch (error) {
        await reply('❌ Error getting test schedule info.');
        console.error('Test schedule error:', error);
      }
    }
    
  } catch (error) {
    console.error('❌ Test scheduled plugin error:', error);
  }
}

// Export test function for manual triggering
export { sendTestMessage };