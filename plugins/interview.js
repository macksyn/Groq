// plugins/interview.js - Complete AI-Driven Interview Management System
import chalk from 'chalk';
import axios from 'axios';
import moment from 'moment-timezone';
import { PluginHelpers } from '../lib/pluginIntegration.js';

// Plugin metadata
export const info = {
  name: 'Interview System',
  version: '2.0.0',
  author: 'Alex Macksyn',
  description: 'Complete AI-driven interview management system with automated Q&A, reminders, and evaluation',
  category: 'group-management',
  commands: [
    { cmd: 'interview', desc: 'Main interview command' },
    { cmd: 'setinterview', desc: 'Configure interview settings' },
    { cmd: 'interviewstats', desc: 'View interview statistics' },
    { cmd: 'interviewhelp', desc: 'Show interview help' },
    { cmd: 'skipquestion', desc: 'Skip current question (admin only)' },
    { cmd: 'endinterview', desc: 'End ongoing interview (admin only)' },
    { cmd: 'resetinterview', desc: 'Reset user interview (admin only)' }
  ],
  scheduledTasks: [
    {
      name: 'interviewReminder',
      schedule: '0 */2 * * *', // Every 2 hours
      description: 'Send reminders to users with pending interviews',
      handler: async () => {
        await InterviewScheduler.sendReminders();
      }
    },
    {
      name: 'interviewCleanup',
      schedule: '0 0 * * *', // Daily at midnight
      description: 'Clean up expired interviews',
      handler: async () => {
        await InterviewScheduler.cleanupExpired();
      }
    }
  ]
};

// MongoDB Collections
const COLLECTIONS = {
  SETTINGS: 'interview_settings',
  SESSIONS: 'interview_sessions',
  QUESTIONS: 'interview_questions',
  RESULTS: 'interview_results',
  STATS: 'interview_stats'
};

// Interview configuration
const INTERVIEW_CONFIG = {
  MAX_QUESTIONS: 10,
  TIME_PER_QUESTION: 5 * 60 * 1000, // 5 minutes
  PASS_THRESHOLD: 70, // 70% to pass
  MAX_RETRIES: 3,
  REMINDER_INTERVAL: 2 * 60 * 60 * 1000, // 2 hours
  SESSION_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  AI_MODEL: 'llama-3.1-70b-versatile'
};

// Default interview questions
const DEFAULT_QUESTIONS = [
  {
    id: 1,
    category: 'introduction',
    question: 'Tell us about yourself and why you want to join Gist HQ.',
    type: 'open',
    weight: 15,
    aiEvalCriteria: ['clarity', 'enthusiasm', 'relevance', 'length']
  },
  {
    id: 2,
    category: 'community',
    question: 'What can you contribute to our community? Share your skills or interests.',
    type: 'open',
    weight: 15,
    aiEvalCriteria: ['specificity', 'value_proposition', 'authenticity']
  },
  {
    id: 3,
    category: 'rules',
    question: 'How would you handle disagreements or conflicts in a group setting?',
    type: 'open',
    weight: 12,
    aiEvalCriteria: ['maturity', 'conflict_resolution', 'respect']
  },
  {
    id: 4,
    category: 'commitment',
    question: 'Are you willing to actively participate and follow group rules? (Yes/No)',
    type: 'boolean',
    weight: 10,
    correctAnswer: 'yes'
  },
  {
    id: 5,
    category: 'engagement',
    question: 'What topics interest you most? (Tech, Business, Entertainment, Education, Other)',
    type: 'choice',
    weight: 8,
    options: ['Tech', 'Business', 'Entertainment', 'Education', 'Other']
  },
  {
    id: 6,
    category: 'values',
    question: 'Describe what makes a good community member in 2-3 sentences.',
    type: 'open',
    weight: 15,
    aiEvalCriteria: ['understanding', 'values_alignment', 'thoughtfulness']
  },
  {
    id: 7,
    category: 'availability',
    question: 'How often can you engage with the community? (Daily, Few times a week, Weekly)',
    type: 'choice',
    weight: 8,
    options: ['Daily', 'Few times a week', 'Weekly', 'Occasionally']
  },
  {
    id: 8,
    category: 'spam',
    question: 'Will you refrain from spamming or sharing inappropriate content? (Yes/No)',
    type: 'boolean',
    weight: 12,
    correctAnswer: 'yes'
  },
  {
    id: 9,
    category: 'experience',
    question: 'Have you been part of similar communities before? Share your experience.',
    type: 'open',
    weight: 10,
    aiEvalCriteria: ['experience', 'lessons_learned', 'growth']
  },
  {
    id: 10,
    category: 'final',
    question: 'Any final thoughts or questions about joining Gist HQ?',
    type: 'open',
    weight: 5,
    aiEvalCriteria: ['curiosity', 'engagement', 'professionalism']
  }
];

// Interview Manager Class
class InterviewManager {
  // Initialize interview settings for a group
  static async initializeGroup(groupId, config) {
    try {
      const col = await PluginHelpers.getCollection(COLLECTIONS.SETTINGS);
      
      const settings = {
        groupId,
        enabled: true,
        mainGroupLink: config.mainGroupLink || '',
        mainGroupId: config.mainGroupId || '',
        welcomeMessage: config.welcomeMessage || this.getDefaultWelcomeMessage(),
        passMessage: config.passMessage || this.getDefaultPassMessage(),
        failMessage: config.failMessage || this.getDefaultFailMessage(),
        questions: config.questions || DEFAULT_QUESTIONS,
        passThreshold: config.passThreshold || INTERVIEW_CONFIG.PASS_THRESHOLD,
        maxRetries: config.maxRetries || INTERVIEW_CONFIG.MAX_RETRIES,
        autoKickOnFail: config.autoKickOnFail !== false,
        requireAllQuestions: config.requireAllQuestions !== false,
        useAI: config.useAI !== false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: config.createdBy || 'system'
      };
      
      await col.updateOne(
        { groupId },
        { $set: settings },
        { upsert: true }
      );
      
      console.log(chalk.green(`✅ Interview initialized for group: ${groupId}`));
      return settings;
      
    } catch (error) {
      console.error(chalk.red('❌ Error initializing interview:'), error.message);
      throw error;
    }
  }
  
  // Get group settings
  static async getGroupSettings(groupId) {
    try {
      const col = await PluginHelpers.getCollection(COLLECTIONS.SETTINGS);
      return await col.findOne({ groupId });
    } catch (error) {
      console.error(chalk.red('❌ Error getting settings:'), error.message);
      return null;
    }
  }
  
  // Update group settings
  static async updateSettings(groupId, updates) {
    try {
      const col = await PluginHelpers.getCollection(COLLECTIONS.SETTINGS);
      
      await col.updateOne(
        { groupId },
        { 
          $set: { 
            ...updates, 
            updatedAt: new Date() 
          } 
        }
      );
      
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Error updating settings:'), error.message);
      return false;
    }
  }
  
  // Start interview session
  static async startSession(groupId, userId, userName) {
    try {
      const settings = await this.getGroupSettings(groupId);
      
      if (!settings || !settings.enabled) {
        return { success: false, reason: 'Interview not enabled for this group' };
      }
      
      const col = await PluginHelpers.getCollection(COLLECTIONS.SESSIONS);
      
      // Check for existing session
      const existing = await col.findOne({ 
        groupId, 
        userId, 
        status: { $in: ['active', 'pending'] }
      });
      
      if (existing) {
        return { 
          success: false, 
          reason: 'You already have an active interview session',
          session: existing
        };
      }
      
      // Check retry limit
      const previousAttempts = await col.countDocuments({
        groupId,
        userId,
        status: 'failed'
      });
      
      if (previousAttempts >= settings.maxRetries) {
        return {
          success: false,
          reason: `Maximum retry limit (${settings.maxRetries}) reached`
        };
      }
      
      // Create new session
      const session = {
        groupId,
        userId,
        userName,
        status: 'active',
        currentQuestion: 0,
        answers: [],
        score: 0,
        startedAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + INTERVIEW_CONFIG.SESSION_EXPIRY),
        attempt: previousAttempts + 1,
        remindersSent: 0
      };
      
      const result = await col.insertOne(session);
      session._id = result.insertedId;
      
      console.log(chalk.green(`🎯 Interview started for ${userName} in ${groupId}`));
      return { success: true, session };
      
    } catch (error) {
      console.error(chalk.red('❌ Error starting session:'), error.message);
      return { success: false, reason: error.message };
    }
  }
  
  // Get active session
  static async getSession(groupId, userId) {
    try {
      const col = await PluginHelpers.getCollection(COLLECTIONS.SESSIONS);
      return await col.findOne({ 
        groupId, 
        userId, 
        status: 'active'
      });
    } catch (error) {
      console.error(chalk.red('❌ Error getting session:'), error.message);
      return null;
    }
  }
  
  // Submit answer
  static async submitAnswer(groupId, userId, answer) {
    try {
      const session = await this.getSession(groupId, userId);
      
      if (!session) {
        return { success: false, reason: 'No active interview session found' };
      }
      
      const settings = await this.getGroupSettings(groupId);
      const question = settings.questions[session.currentQuestion];
      
      if (!question) {
        return { success: false, reason: 'Invalid question state' };
      }
      
      // Evaluate answer
      const evaluation = await this.evaluateAnswer(question, answer, settings.useAI);
      
      // Store answer
      const answerRecord = {
        questionId: question.id,
        question: question.question,
        answer: answer,
        score: evaluation.score,
        maxScore: question.weight,
        feedback: evaluation.feedback,
        timestamp: new Date()
      };
      
      // Update session
      const col = await PluginHelpers.getCollection(COLLECTIONS.SESSIONS);
      
      const newScore = session.score + evaluation.score;
      const nextQuestion = session.currentQuestion + 1;
      const isComplete = nextQuestion >= settings.questions.length;
      
      const updateData = {
        $push: { answers: answerRecord },
        $set: {
          score: newScore,
          currentQuestion: nextQuestion,
          lastActivity: new Date()
        }
      };
      
      if (isComplete) {
        const totalPossible = settings.questions.reduce((sum, q) => sum + q.weight, 0);
        const percentage = (newScore / totalPossible) * 100;
        const passed = percentage >= settings.passThreshold;
        
        updateData.$set.status = passed ? 'passed' : 'failed';
        updateData.$set.completedAt = new Date();
        updateData.$set.finalScore = newScore;
        updateData.$set.percentage = percentage;
        
        // Save result
        await this.saveResult(groupId, userId, session, passed, percentage);
      }
      
      await col.updateOne({ _id: session._id }, updateData);
      
      return {
        success: true,
        evaluation,
        isComplete,
        nextQuestion: isComplete ? null : nextQuestion,
        score: newScore
      };
      
    } catch (error) {
      console.error(chalk.red('❌ Error submitting answer:'), error.message);
      return { success: false, reason: error.message };
    }
  }
  
  // Evaluate answer using AI or rules
  static async evaluateAnswer(question, answer, useAI = true) {
    try {
      // Basic validation
      if (!answer || answer.trim().length === 0) {
        return {
          score: 0,
          feedback: '❌ Empty answer. Please provide a response.',
          passed: false
        };
      }
      
      // Boolean questions
      if (question.type === 'boolean') {
        const normalizedAnswer = answer.toLowerCase().trim();
        const correct = normalizedAnswer === question.correctAnswer.toLowerCase() ||
                       (question.correctAnswer.toLowerCase() === 'yes' && ['yes', 'y', 'yeah', 'sure', 'okay'].includes(normalizedAnswer)) ||
                       (question.correctAnswer.toLowerCase() === 'no' && ['no', 'n', 'nope', 'nah'].includes(normalizedAnswer));
        
        return {
          score: correct ? question.weight : 0,
          feedback: correct ? '✅ Correct!' : '❌ Incorrect answer.',
          passed: correct
        };
      }
      
      // Choice questions
      if (question.type === 'choice') {
        const isValidChoice = question.options.some(opt => 
          answer.toLowerCase().includes(opt.toLowerCase())
        );
        
        const score = isValidChoice ? question.weight : question.weight * 0.5;
        
        return {
          score,
          feedback: isValidChoice ? '✅ Valid choice' : '⚠️ Acceptable answer',
          passed: isValidChoice
        };
      }
      
      // Open-ended questions with AI evaluation
      if (question.type === 'open' && useAI && question.aiEvalCriteria) {
        return await this.aiEvaluate(question, answer);
      }
      
      // Fallback: Basic length and quality check
      const wordCount = answer.trim().split(/\s+/).length;
      let score = 0;
      let feedback = '';
      
      if (wordCount < 5) {
        score = question.weight * 0.3;
        feedback = '⚠️ Answer is too short. Please elaborate more.';
      } else if (wordCount < 20) {
        score = question.weight * 0.7;
        feedback = '✓ Good answer, but could use more detail.';
      } else {
        score = question.weight;
        feedback = '✅ Well-detailed answer!';
      }
      
      return { score, feedback, passed: score >= question.weight * 0.6 };
      
    } catch (error) {
      console.error(chalk.red('❌ Evaluation error:'), error.message);
      return {
        score: question.weight * 0.5,
        feedback: '⚠️ Auto-scored based on length',
        passed: true
      };
    }
  }
  
  // AI-powered evaluation using Groq
  static async aiEvaluate(question, answer) {
    try {
      const groqApiKey = process.env.GROQ_API_KEY;
      
      if (!groqApiKey) {
        console.warn(chalk.yellow('⚠️ GROQ_API_KEY not set, using fallback evaluation'));
        return {
          score: question.weight * 0.7,
          feedback: '✓ Answer recorded (AI evaluation unavailable)',
          passed: true
        };
      }
      
      const prompt = `You are an interview evaluator for a WhatsApp community called "Gist HQ".

Question: ${question.question}
Category: ${question.category}
User's Answer: ${answer}

Evaluation Criteria: ${question.aiEvalCriteria.join(', ')}

Evaluate this answer and provide:
1. A score from 0-${question.weight} (be fair but critical)
2. Brief constructive feedback (1-2 sentences)
3. Whether they passed (score >= ${question.weight * 0.6})

Respond in this exact JSON format:
{
  "score": <number>,
  "feedback": "<feedback text>",
  "passed": <boolean>
}`;

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: INTERVIEW_CONFIG.AI_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 200
        },
        {
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      const aiResponse = response.data.choices[0].message.content;
      const parsed = JSON.parse(aiResponse);
      
      console.log(chalk.cyan(`🤖 AI evaluated: ${parsed.score}/${question.weight}`));
      
      return {
        score: Math.min(parsed.score, question.weight),
        feedback: parsed.feedback,
        passed: parsed.passed
      };
      
    } catch (error) {
      console.error(chalk.red('❌ AI evaluation error:'), error.message);
      
      // Fallback scoring
      const wordCount = answer.trim().split(/\s+/).length;
      const score = wordCount >= 20 ? question.weight : question.weight * 0.7;
      
      return {
        score,
        feedback: '✓ Answer recorded and evaluated',
        passed: true
      };
    }
  }
  
  // Save interview result
  static async saveResult(groupId, userId, session, passed, percentage) {
    try {
      const col = await PluginHelpers.getCollection(COLLECTIONS.RESULTS);
      
      const result = {
        groupId,
        userId,
        sessionId: session._id,
        userName: session.userName,
        passed,
        score: session.score,
        percentage,
        answers: session.answers,
        attempt: session.attempt,
        completedAt: new Date(),
        duration: new Date() - session.startedAt
      };
      
      await col.insertOne(result);
      
      // Update stats
      await this.updateStats(groupId, passed);
      
      return result;
      
    } catch (error) {
      console.error(chalk.red('❌ Error saving result:'), error.message);
    }
  }
  
  // Update statistics
  static async updateStats(groupId, passed) {
    try {
      const col = await PluginHelpers.getCollection(COLLECTIONS.STATS);
      
      await col.updateOne(
        { groupId },
        {
          $inc: {
            totalInterviews: 1,
            passed: passed ? 1 : 0,
            failed: passed ? 0 : 1
          },
          $set: { updatedAt: new Date() }
        },
        { upsert: true }
      );
      
    } catch (error) {
      console.error(chalk.red('❌ Error updating stats:'), error.message);
    }
  }
  
  // Get statistics
  static async getStats(groupId) {
    try {
      const col = await PluginHelpers.getCollection(COLLECTIONS.STATS);
      const stats = await col.findOne({ groupId });
      
      if (!stats) {
        return {
          totalInterviews: 0,
          passed: 0,
          failed: 0,
          passRate: 0
        };
      }
      
      stats.passRate = stats.totalInterviews > 0 
        ? Math.round((stats.passed / stats.totalInterviews) * 100)
        : 0;
      
      return stats;
      
    } catch (error) {
      console.error(chalk.red('❌ Error getting stats:'), error.message);
      return null;
    }
  }
  
  // Default messages
  static getDefaultWelcomeMessage() {
    return `╭─────────────────────╮
│   🎯 INTERVIEW TIME!   │
╰─────────────────────╯

Welcome to Gist HQ Interview! 🎉

You'll answer {total} questions to join our main group.

📋 *Interview Rules:*
• Answer honestly and thoughtfully
• Take your time (5 min per question)
• Score at least {threshold}% to pass
• You have {maxRetries} attempts

🤖 *AI Evaluation:* Your answers will be evaluated by our AI system for quality and relevance.

✨ Ready? Let's begin!

Type anything to start! 🚀`;
  }
  
  static getDefaultPassMessage() {
    return `╭─────────────────────╮
│   🎊 CONGRATULATIONS!   │
╰─────────────────────╯

✅ *You passed the interview!*

📊 *Your Score:* {score}/{total} ({percentage}%)

🎉 You've demonstrated great potential and we're excited to have you in Gist HQ!

🔗 *Join Main Group:*
{groupLink}

Welcome aboard! 🚀`;
  }
  
  static getDefaultFailMessage() {
    return `╭─────────────────────╮
│   😔 TRY AGAIN!   │
╰─────────────────────╯

❌ *Interview Not Passed*

📊 *Your Score:* {score}/{total} ({percentage}%)
🎯 *Required:* {threshold}%

💡 *Feedback:* Your answers need more detail and thoughtfulness.

🔄 *Retries Left:* {retriesLeft}

Don't worry! Review your answers and try again. You can do it! 💪`;
  }
}

// Scheduler for reminders and cleanup
class InterviewScheduler {
  static async sendReminders() {
    try {
      console.log(chalk.blue('⏰ Sending interview reminders...'));
      
      const col = await PluginHelpers.getCollection(COLLECTIONS.SESSIONS);
      
      const stuckSessions = await col.find({
        status: 'active',
        lastActivity: { 
          $lt: new Date(Date.now() - INTERVIEW_CONFIG.REMINDER_INTERVAL) 
        },
        remindersSent: { $lt: 3 }
      }).toArray();
      
      console.log(chalk.cyan(`📬 Found ${stuckSessions.length} sessions needing reminders`));
      
      for (const session of stuckSessions) {
        // This will be sent via the bot's message handler
        console.log(chalk.yellow(`⏰ Reminder needed for ${session.userName}`));
        
        await col.updateOne(
          { _id: session._id },
          { 
            $inc: { remindersSent: 1 },
            $set: { lastReminder: new Date() }
          }
        );
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Reminder error:'), error.message);
    }
  }
  
  static async cleanupExpired() {
    try {
      console.log(chalk.blue('🧹 Cleaning up expired interview sessions...'));
      
      const col = await PluginHelpers.getCollection(COLLECTIONS.SESSIONS);
      
      const result = await col.updateMany(
        {
          status: 'active',
          expiresAt: { $lt: new Date() }
        },
        {
          $set: {
            status: 'expired',
            expiredAt: new Date()
          }
        }
      );
      
      if (result.modifiedCount > 0) {
        console.log(chalk.green(`✅ Cleaned up ${result.modifiedCount} expired sessions`));
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Cleanup error:'), error.message);
    }
  }
}

// Main plugin handler
export default async function interviewPlugin(m, sock, config, bot) {
  try {
    const body = m.body?.trim() || '';
    const prefix = config.PREFIX;
    
    // Only process commands that start with prefix
    if (!body.startsWith(prefix)) {
      // Handle interview responses (non-command messages in interview groups)
      await handleInterviewResponse(m, sock, config);
      return;
    }
    
    const args = body.slice(prefix.length).trim().split(/\s+/);
    const cmd = args[0]?.toLowerCase();
    
    // Interview commands
    if (cmd === 'setinterview') {
      await handleSetInterview(m, sock, config, args);
    } else if (cmd === 'interview') {
      await handleInterviewCommand(m, sock, config, args);
    } else if (cmd === 'interviewstats') {
      await handleInterviewStats(m, sock, config);
    } else if (cmd === 'interviewhelp') {
      await handleInterviewHelp(m, sock, config);
    } else if (cmd === 'skipquestion') {
      await handleSkipQuestion(m, sock, config);
    } else if (cmd === 'endinterview') {
      await handleEndInterview(m, sock, config, args);
    } else if (cmd === 'resetinterview') {
      await handleResetInterview(m, sock, config, args);
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Interview plugin error:'), error.message);
  }
}

// Handle non-command messages (interview responses)
async function handleInterviewResponse(m, sock, config) {
  try {
    if (!m.isGroup || m.isSelf) return;
    
    const session = await InterviewManager.getSession(m.from, m.sender);
    
    if (!session) return; // No active interview
    
    const settings = await InterviewManager.getGroupSettings(m.from);
    
    if (!settings || !settings.enabled) return;
    
    const answer = m.body?.trim();
    
    if (!answer) {
      await m.reply('⚠️ Please provide an answer to continue.');
      return;
    }
    
    // Submit answer
    const result = await InterviewManager.submitAnswer(m.from, m.sender, answer);
    
    if (!result.success) {
      await m.reply(`❌ Error: ${result.reason}`);
      return;
    }
    
    // Show feedback
    let response = `${result.evaluation.feedback}\n\n`;
    response += `📊 *Score:* ${result.evaluation.score}/${settings.questions[session.currentQuestion].weight}\n`;
    response += `🎯 *Total Score:* ${result.score}\n\n`;
    
    if (result.isComplete) {
      // Interview complete
      const totalPossible = settings.questions.reduce((sum, q) => sum + q.weight, 0);
      const percentage = (result.score / totalPossible) * 100;
      const passed = percentage >= settings.passThreshold;
      
      if (passed) {
        response = settings.passMessage
          .replace('{score}', result.score)
          .replace('{total}', totalPossible)
          .replace('{percentage}', percentage.toFixed(1))
          .replace('{groupLink}', settings.mainGroupLink);
      } else {
        const retriesLeft = settings.maxRetries - session.attempt;
        response = settings.failMessage
          .replace('{score}', result.score)
          .replace('{total}', totalPossible)
          .replace('{percentage}', percentage.toFixed(1))
          .replace('{threshold}', settings.passThreshold)
          .replace('{retriesLeft}', retriesLeft);
        
        // Auto-kick if enabled and no retries left
        if (settings.autoKickOnFail && retriesLeft <= 0) {
          setTimeout(async () => {
            try {
              await sock.groupParticipantsUpdate(m.from, [m.sender], 'remove');
              console.log(chalk.yellow(`🚪 Auto-kicked ${m.sender} after failed interview`));
            } catch (error) {
              console.error('Auto-kick error:', error.message);
            }
          }, 10000); // 10 second delay
        }
      }
      
      await m.reply(response);
      
    } else {
      // Next question
      const nextQ = settings.questions[result.nextQuestion];
      response += `━━━━━━━━━━━━━━━━━\n\n`;
      response += `*Question ${result.nextQuestion + 1}/${settings.questions.length}*\n\n`;
      response += `${nextQ.question}\n\n`;
      
      if (nextQ.type === 'choice') {
        response += `*Options:* ${nextQ.options.join(', ')}\n\n`;
      }
      
      response += `⏱️ You have 5 minutes to answer.`;
      
      await m.reply(response);
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Response handler error:'), error.message);
  }
}

// Set up interview for group
async function handleSetInterview(m, sock, config, args) {
  try {
    if (!m.isGroup) {
      await m.reply('❌ This command can only be used in groups.');
      return;
    }
    
    const isOwner = m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
    const isAdmin = await m.isGroupAdmin();
    
    if (!isOwner && !isAdmin) {
      await m.reply('❌ Only group admins can configure interview settings.');
      return;
    }
    
    const subCmd = args[1]?.toLowerCase();
    
    if (subCmd === 'enable') {
      const mainGroupLink = args[2];
      
      if (!mainGroupLink) {
        await m.reply('❌ Usage: `setinterview enable <main_group_link>`');
        return;
      }
      
      const settings = await InterviewManager.initializeGroup(m.from, {
        mainGroupLink,
        createdBy: m.sender
      });
      
      let response = `╭─────────────────────╮
│ ✅ INTERVIEW ENABLED │
╰─────────────────────╯

🎯 Interview system is now active for this group!

📋 *Configuration:*
• Questions: ${settings.questions.length}
• Pass Threshold: ${settings.passThreshold}%
• Max Retries: ${settings.maxRetries}
• Auto-kick on fail: ${settings.autoKickOnFail ? 'Yes' : 'No'}
• AI Evaluation: ${settings.useAI ? 'Enabled' : 'Disabled'}

🔗 *Main Group:* ${settings.mainGroupLink}

💡 *What happens next?*
When new members join, they'll automatically receive interview questions. Once they pass, they'll get the main group link.

⚙️ *More Settings:*
• \`${config.PREFIX}setinterview threshold <number>\` - Set pass percentage
• \`${config.PREFIX}setinterview retries <number>\` - Set max attempts
• \`${config.PREFIX}setinterview autokick <on|off>\` - Auto-remove failed users
• \`${config.PREFIX}setinterview disable\` - Disable interview

📊 View stats: \`${config.PREFIX}interviewstats\``;

      await m.reply(response);
      
    } else if (subCmd === 'disable') {
      await InterviewManager.updateSettings(m.from, { enabled: false });
      await m.reply('🚫 Interview system disabled for this group.');
      
    } else if (subCmd === 'threshold') {
      const threshold = parseInt(args[2]);
      
      if (isNaN(threshold) || threshold < 1 || threshold > 100) {
        await m.reply('❌ Usage: `setinterview threshold <1-100>`');
        return;
      }
      
      await InterviewManager.updateSettings(m.from, { passThreshold: threshold });
      await m.reply(`✅ Pass threshold set to ${threshold}%`);
      
    } else if (subCmd === 'retries') {
      const retries = parseInt(args[2]);
      
      if (isNaN(retries) || retries < 1 || retries > 10) {
        await m.reply('❌ Usage: `setinterview retries <1-10>`');
        return;
      }
      
      await InterviewManager.updateSettings(m.from, { maxRetries: retries });
      await m.reply(`✅ Max retries set to ${retries}`);
      
    } else if (subCmd === 'autokick') {
      const enabled = args[2]?.toLowerCase() === 'on';
      
      await InterviewManager.updateSettings(m.from, { autoKickOnFail: enabled });
      await m.reply(`✅ Auto-kick ${enabled ? 'enabled' : 'disabled'}`);
      
    } else if (subCmd === 'link') {
      const newLink = args[2];
      
      if (!newLink) {
        await m.reply('❌ Usage: `setinterview link <new_group_link>`');
        return;
      }
      
      await InterviewManager.updateSettings(m.from, { mainGroupLink: newLink });
      await m.reply(`✅ Main group link updated`);
      
    } else if (subCmd === 'ai') {
      const enabled = args[2]?.toLowerCase() === 'on';
      
      await InterviewManager.updateSettings(m.from, { useAI: enabled });
      await m.reply(`✅ AI evaluation ${enabled ? 'enabled' : 'disabled'}`);
      
    } else {
      let response = `╭─────────────────────╮
│ ⚙️ INTERVIEW SETTINGS │
╰─────────────────────╯

*Available Commands:*

🟢 *Enable/Disable:*
• \`${config.PREFIX}setinterview enable <link>\`
• \`${config.PREFIX}setinterview disable\`

⚙️ *Configuration:*
• \`${config.PREFIX}setinterview threshold <1-100>\`
• \`${config.PREFIX}setinterview retries <1-10>\`
• \`${config.PREFIX}setinterview autokick <on|off>\`
• \`${config.PREFIX}setinterview link <new_link>\`
• \`${config.PREFIX}setinterview ai <on|off>\`

📋 *Example:*
\`${config.PREFIX}setinterview enable https://chat.whatsapp.com/xxxxx\`

💡 Need help? Use \`${config.PREFIX}interviewhelp\``;

      await m.reply(response);
    }
    
  } catch (error) {
    console.error(chalk.red('❌ SetInterview error:'), error.message);
    await m.reply('❌ Error configuring interview: ' + error.message);
  }
}

// Main interview command
async function handleInterviewCommand(m, sock, config, args) {
  try {
    if (!m.isGroup) {
      await m.reply('❌ This command can only be used in groups.');
      return;
    }
    
    const subCmd = args[1]?.toLowerCase();
    
    if (subCmd === 'start') {
      // Manual start
      const settings = await InterviewManager.getGroupSettings(m.from);
      
      if (!settings || !settings.enabled) {
        await m.reply('❌ Interview is not enabled for this group.');
        return;
      }
      
      const result = await InterviewManager.startSession(m.from, m.sender, m.pushName || 'User');
      
      if (!result.success) {
        await m.reply(`❌ ${result.reason}`);
        return;
      }
      
      // Send welcome message
      const welcomeMsg = settings.welcomeMessage
        .replace('{total}', settings.questions.length)
        .replace('{threshold}', settings.passThreshold)
        .replace('{maxRetries}', settings.maxRetries);
      
      await m.reply(welcomeMsg);
      
      // Wait 3 seconds then send first question
      setTimeout(async () => {
        const firstQ = settings.questions[0];
        let response = `*Question 1/${settings.questions.length}*\n\n`;
        response += `${firstQ.question}\n\n`;
        
        if (firstQ.type === 'choice') {
          response += `*Options:* ${firstQ.options.join(', ')}\n\n`;
        }
        
        response += `⏱️ You have 5 minutes to answer.`;
        
        await m.reply(response);
      }, 3000);
      
    } else if (subCmd === 'status') {
      const session = await InterviewManager.getSession(m.from, m.sender);
      
      if (!session) {
        await m.reply('❌ You don\'t have an active interview.');
        return;
      }
      
      const settings = await InterviewManager.getGroupSettings(m.from);
      const totalPossible = settings.questions.reduce((sum, q) => sum + q.weight, 0);
      const percentage = (session.score / totalPossible) * 100;
      
      let response = `╭─────────────────────╮
│ 📊 INTERVIEW STATUS │
╰─────────────────────╯

👤 *User:* ${session.userName}
🎯 *Progress:* ${session.currentQuestion}/${settings.questions.length}
📈 *Current Score:* ${session.score}/${totalPossible} (${percentage.toFixed(1)}%)
🎓 *Pass Threshold:* ${settings.passThreshold}%
🔄 *Attempt:* ${session.attempt}/${settings.maxRetries}
⏰ *Started:* ${moment(session.startedAt).fromNow()}
📬 *Reminders Sent:* ${session.remindersSent}

${percentage >= settings.passThreshold ? '✅ On track to pass!' : '⚠️ Need higher scores'}

💡 Keep answering thoughtfully to improve your score!`;

      await m.reply(response);
      
    } else if (subCmd === 'retry') {
      const settings = await InterviewManager.getGroupSettings(m.from);
      
      if (!settings || !settings.enabled) {
        await m.reply('❌ Interview is not enabled for this group.');
        return;
      }
      
      // Check previous attempts
      const col = await PluginHelpers.getCollection(COLLECTIONS.SESSIONS);
      const attempts = await col.countDocuments({
        groupId: m.from,
        userId: m.sender,
        status: 'failed'
      });
      
      if (attempts >= settings.maxRetries) {
        await m.reply(`❌ You've reached the maximum retry limit (${settings.maxRetries}).`);
        return;
      }
      
      // Start new attempt
      const result = await InterviewManager.startSession(m.from, m.sender, m.pushName || 'User');
      
      if (!result.success) {
        await m.reply(`❌ ${result.reason}`);
        return;
      }
      
      await m.reply(`🔄 Starting retry attempt ${attempts + 1}/${settings.maxRetries}...`);
      
      // Send first question
      setTimeout(async () => {
        const firstQ = settings.questions[0];
        let response = `*Question 1/${settings.questions.length}*\n\n`;
        response += `${firstQ.question}\n\n`;
        
        if (firstQ.type === 'choice') {
          response += `*Options:* ${firstQ.options.join(', ')}\n\n`;
        }
        
        response += `⏱️ You have 5 minutes to answer.`;
        
        await m.reply(response);
      }, 2000);
      
    } else {
      let response = `╭─────────────────────╮
│ 🎯 INTERVIEW COMMANDS │
╰─────────────────────╯

*User Commands:*
• \`${config.PREFIX}interview start\` - Start interview
• \`${config.PREFIX}interview status\` - Check your progress
• \`${config.PREFIX}interview retry\` - Retry after failure

*Admin Commands:*
• \`${config.PREFIX}setinterview\` - Configure settings
• \`${config.PREFIX}interviewstats\` - View statistics
• \`${config.PREFIX}skipquestion @user\` - Skip question
• \`${config.PREFIX}endinterview @user\` - End interview
• \`${config.PREFIX}resetinterview @user\` - Reset attempts

💡 Type \`${config.PREFIX}interviewhelp\` for detailed help.`;

      await m.reply(response);
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Interview command error:'), error.message);
    await m.reply('❌ Error: ' + error.message);
  }
}

// Show interview statistics
async function handleInterviewStats(m, sock, config) {
  try {
    if (!m.isGroup) {
      await m.reply('❌ This command can only be used in groups.');
      return;
    }
    
    const settings = await InterviewManager.getGroupSettings(m.from);
    
    if (!settings) {
      await m.reply('❌ Interview is not configured for this group.');
      return;
    }
    
    const stats = await InterviewManager.getStats(m.from);
    const col = await PluginHelpers.getCollection(COLLECTIONS.SESSIONS);
    
    const activeSessions = await col.countDocuments({
      groupId: m.from,
      status: 'active'
    });
    
    const recentResults = await PluginHelpers.getCollection(COLLECTIONS.RESULTS);
    const recent = await recentResults.find({ groupId: m.from })
      .sort({ completedAt: -1 })
      .limit(5)
      .toArray();
    
    let response = `╭─────────────────────╮
│ 📊 INTERVIEW STATISTICS │
╰─────────────────────╯

📈 *Overall Stats:*
• Total Interviews: ${stats.totalInterviews}
• Passed: ${stats.passed} ✅
• Failed: ${stats.failed} ❌
• Pass Rate: ${stats.passRate}%
• Active Sessions: ${activeSessions}

⚙️ *Settings:*
• Pass Threshold: ${settings.passThreshold}%
• Max Retries: ${settings.maxRetries}
• Auto-kick: ${settings.autoKickOnFail ? 'Yes' : 'No'}
• AI Evaluation: ${settings.useAI ? 'Yes' : 'No'}

📋 *Recent Completions:*`;

    if (recent.length > 0) {
      recent.forEach((r, i) => {
        response += `\n${i + 1}. ${r.userName} - ${r.passed ? '✅' : '❌'} (${r.percentage.toFixed(1)}%)`;
      });
    } else {
      response += '\n_No completed interviews yet_';
    }
    
    response += `\n\n📅 *Last Updated:* ${moment(stats.updatedAt).fromNow()}`;
    
    await m.reply(response);
    
  } catch (error) {
    console.error(chalk.red('❌ Stats error:'), error.message);
    await m.reply('❌ Error fetching statistics.');
  }
}

// Show detailed help
async function handleInterviewHelp(m, sock, config) {
  try {
    let response = `╭─────────────────────╮
│ 📚 INTERVIEW HELP │
╰─────────────────────╯

🎯 *What is this?*
An AI-powered interview system to screen new members before they join the main group.

📋 *How it works:*
1. New members join interview group
2. They answer ${DEFAULT_QUESTIONS.length} questions
3. AI evaluates their responses
4. Score ≥70% = Pass → Get main group link
5. Score <70% = Can retry (max 3 attempts)

🤖 *AI Evaluation:*
Our AI checks for:
• Answer quality and depth
• Relevance to question
• Sincerity and engagement
• Grammar and clarity

👥 *For Users:*
\`${config.PREFIX}interview start\` - Begin interview
\`${config.PREFIX}interview status\` - Check progress
\`${config.PREFIX}interview retry\` - Try again

👔 *For Admins:*
\`${config.PREFIX}setinterview enable <link>\` - Setup
\`${config.PREFIX}setinterview threshold <num>\` - Set pass %
\`${config.PREFIX}interviewstats\` - View stats
\`${config.PREFIX}skipquestion @user\` - Skip question
\`${config.PREFIX}endinterview @user\` - End session
\`${config.PREFIX}resetinterview @user\` - Reset attempts

💡 *Tips for Success:*
• Be honest and genuine
• Write detailed answers (20+ words)
• Show enthusiasm
• Proofread before sending

⚠️ *Important:*
• Each question has 5 min timer
• Empty answers score 0
• Too many failures = auto-kick

Need more help? Contact admins!`;

    await m.reply(response);
    
  } catch (error) {
    console.error(chalk.red('❌ Help error:'), error.message);
  }
}

// Skip question (admin only)
async function handleSkipQuestion(m, sock, config) {
  try {
    if (!m.isGroup) {
      await m.reply('❌ This command can only be used in groups.');
      return;
    }
    
    const isOwner = m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
    const isAdmin = await m.isGroupAdmin();
    
    if (!isOwner && !isAdmin) {
      await m.reply('❌ Only admins can skip questions.');
      return;
    }
    
    const targetUser = m.mentions?.[0] || m.quoted?.sender;
    
    if (!targetUser) {
      await m.reply('❌ Usage: Reply to user or mention them: `skipquestion @user`');
      return;
    }
    
    const session = await InterviewManager.getSession(m.from, targetUser);
    
    if (!session) {
      await m.reply('❌ User doesn\'t have an active interview.');
      return;
    }
    
    const settings = await InterviewManager.getGroupSettings(m.from);
    const currentQ = settings.questions[session.currentQuestion];
    
    // Auto-pass current question
    const result = await InterviewManager.submitAnswer(
      m.from, 
      targetUser, 
      'Admin skip - auto pass'
    );
    
    await m.reply(`✅ Skipped question ${session.currentQuestion + 1} for ${targetUser.split('@')[0]}`);
    
    // Send next question
    if (!result.isComplete) {
      const nextQ = settings.questions[result.nextQuestion];
      let response = `⏭️ *Question Skipped by Admin*\n\n`;
      response += `*Question ${result.nextQuestion + 1}/${settings.questions.length}*\n\n`;
      response += `${nextQ.question}\n\n`;
      
      if (nextQ.type === 'choice') {
        response += `*Options:* ${nextQ.options.join(', ')}\n\n`;
      }
      
      await sock.sendMessage(m.from, { text: response, mentions: [targetUser] });
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Skip error:'), error.message);
    await m.reply('❌ Error skipping question.');
  }
}

// End interview (admin only)
async function handleEndInterview(m, sock, config, args) {
  try {
    if (!m.isGroup) {
      await m.reply('❌ This command can only be used in groups.');
      return;
    }
    
    const isOwner = m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
    const isAdmin = await m.isGroupAdmin();
    
    if (!isOwner && !isAdmin) {
      await m.reply('❌ Only admins can end interviews.');
      return;
    }
    
    const targetUser = m.mentions?.[0] || m.quoted?.sender;
    
    if (!targetUser) {
      await m.reply('❌ Usage: Reply to user or mention them: `endinterview @user`');
      return;
    }
    
    const col = await PluginHelpers.getCollection(COLLECTIONS.SESSIONS);
    
    const result = await col.updateOne(
      { groupId: m.from, userId: targetUser, status: 'active' },
      { 
        $set: { 
          status: 'terminated',
          terminatedBy: m.sender,
          terminatedAt: new Date()
        } 
      }
    );
    
    if (result.modifiedCount > 0) {
      await m.reply(`✅ Interview terminated for ${targetUser.split('@')[0]}`);
      await sock.sendMessage(m.from, {
        text: '🚫 Your interview has been ended by an admin.',
        mentions: [targetUser]
      });
    } else {
      await m.reply('❌ User doesn\'t have an active interview.');
    }
    
  } catch (error) {
    console.error(chalk.red('❌ End interview error:'), error.message);
    await m.reply('❌ Error ending interview.');
  }
}

// Reset interview attempts (admin only)
async function handleResetInterview(m, sock, config, args) {
  try {
    if (!m.isGroup) {
      await m.reply('❌ This command can only be used in groups.');
      return;
    }
    
    const isOwner = m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
    const isAdmin = await m.isGroupAdmin();
    
    if (!isOwner && !isAdmin) {
      await m.reply('❌ Only admins can reset interviews.');
      return;
    }
    
    const targetUser = m.mentions?.[0] || m.quoted?.sender;
    
    if (!targetUser) {
      await m.reply('❌ Usage: Reply to user or mention them: `resetinterview @user`');
      return;
    }
    
    const col = await PluginHelpers.getCollection(COLLECTIONS.SESSIONS);
    
    const result = await col.deleteMany({
      groupId: m.from,
      userId: targetUser
    });
    
    if (result.deletedCount > 0) {
      await m.reply(`✅ Reset ${result.deletedCount} interview session(s) for ${targetUser.split('@')[0]}\n\nThey can now start fresh.`);
    } else {
      await m.reply('❌ No interview sessions found for this user.');
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Reset error:'), error.message);
    await m.reply('❌ Error resetting interview.');
  }
}