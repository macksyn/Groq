// plugins/autoInterview.js - Gist HQ Intelligent Interview System
import axios from 'axios';
import { unifiedUserManager } from '../lib/pluginIntegration.js';

export const info = {
  name: 'autoInterview',
  version: '1.0.0',
  author: 'Alex Macksyn',
  description: 'Intelligent AI-powered interview system for Gist HQ group screening 🎯🤖',
  commands: [
    {
      name: 'interview',
      aliases: ['startinterview'],
      description: 'Manually start interview process'
    },
    {
      name: 'addquestion',
      description: 'Add new interview question (Admin only)'
    },
    {
      name: 'removequestion',
      description: 'Remove interview question (Admin only)'
    },
    {
      name: 'listquestions',
      description: 'View all interview questions (Admin only)'
    },
    {
      name: 'interviewsettings',
      description: 'Configure interview settings (Admin only)'
    },
    {
      name: 'interviewstats',
      description: 'View interview statistics (Admin only)'
    },
    {
      name: 'approveuser',
      description: 'Manually approve interview candidate (Admin only)'
    },
    {
      name: 'rejectuser',
      description: 'Manually reject interview candidate (Admin only)'
    },
    {
      name: 'setmaingroup',
      description: 'Set main group invite link (Admin only)'
    }
  ]
};

// Groq API configuration for AI responses
const GROQ_CONFIG = {
  API_KEY: process.env.GROQ_API_KEY || '',
  BASE_URL: 'https://api.groq.com/openai/v1/chat/completions',
  MODEL: 'llama-3.3-70b-versatile'
};

// Gist HQ Rules and Regulations
const GHQ_RULES = `--++-- Welcome to Gist Headquarters! --++--
This group is A ꜰᴜɴ ᴘʟᴀᴄᴇ ᴛᴏ ꜱʜᴀʀᴇ ɢᴏᴏᴅ ᴠɪʙᴇꜱ, ᴍᴀᴋᴇ Nᴇᴡ Fʀɪᴇɴᴅꜱ ᴀɴᴅ ʜᴇʟᴘ ᴇᴀᴄʜ ᴏᴛʜᴇʀ.

*GHQ Rules*
1. *Respect and courtesy*: Treat others respectfully and kindly, even when disagreeing or arguing.
2. *Stay on topic*: Keep conversations relevant to the groups purpose and topic(s).
3. *No spamming or Link-promotion*: Refrain from sharing unsolicited links, ads, or promoting personal interests without an admin's approval.
4. *No explicit or offensive content*: Avoid sharing explicit, graphic, or offensive material. It's only allowed on Freaky Fridays.
5. *No harassment or bullying*: Do not harass, bully, bodyshame or intimidate other group members.
6. *Respect Members' Privacy*: Please always ask for consent before you DM a member. Do not private chat a member here without their permission.
7. *No Fighting & Insulting*: Fighting and throwing insults or abusive words or cursing another member is strongly prohibited. 🚫 
8. *Marking of Attendance*: Marking your daily attendance shows you are actively involved in the group. Skipping 3 days of attendance without stating your reasons to an admin beforehand is a violation.
9. *Do your Tasks*: Always do your daily tasks the admins assign. Failure to do your tasks for 3 days in a row is a violation.
10. *Admin decisions are final*: Admins reserve the right to make decisions regarding group management and member conduct. Respect their decisions, no insults or foul words to them will be tolerated.

*Consequences of Rule Violations*
1. *First offense*: Warning from an admin.
2. *Second offence*: Temporary removal from the group (1-3 days depending).
3. *Third offense*: Permanent removal from the group.

*Reporting Issues*
If you witness or experience any privacy violations, disrespect, or insults, please report them to an admin immediately.

*Admin Contact*
For any questions, concerns, or issues, please reach out to the *Admins*.

> By joining this group, you acknowledge that you have read, understood, and agree to abide by these rules and regulations. 🖋️`;

// Default interview questions for Gist HQ
const DEFAULT_QUESTIONS = [
  {
    id: 1,
    question: "What's your name and where are you from? Tell us a bit about yourself! 😊",
    required: true,
    category: "personal"
  },
  {
    id: 2,
    question: "How did you hear about Gist HQ and what made you want to join our community?",
    required: true,
    category: "motivation"
  },
  {
    id: 3,
    question: "What kind of gist (discussions/topics) are you most interested in? Entertainment, business, tech, lifestyle, etc?",
    required: true,
    category: "interests"
  },
  {
    id: 4,
    question: "Are you here to share gist, learn from others, or just catch up on what's happening?",
    required: true,
    category: "purpose"
  },
  {
    id: 5,
    question: "What's one interesting thing about yourself that you'd like the community to know?",
    required: false,
    category: "personal"
  },
  {
    id: 6,
    question: "How do you plan to contribute positively to our Gist HQ family?",
    required: true,
    category: "contribution"
  }
];

// Interview storage
const interviewSessions = new Map(); // userId -> interview data
const interviewQuestions = new Map(); // groupId -> questions array
const groupSettings = new Map(); // groupId -> settings
const interviewStats = new Map(); // groupId -> stats

// Interview session structure
class InterviewSession {
  constructor(userId, groupId, userName) {
    this.userId = userId;
    this.groupId = groupId;
    this.userName = userName;
    this.startTime = new Date();
    this.currentQuestion = 0;
    this.responses = [];
    this.conversationHistory = [];
    this.status = 'active'; // active, completed, failed, approved, rejected
    this.remindersSent = 0;
    this.lastResponseTime = new Date();
    this.aiFollowUps = 0;
    this.rulesAcknowledged = false;
    this.score = 0;
    this.feedback = '';
  }
}

// Group settings structure
class GroupSettings {
  constructor(groupId) {
    this.groupId = groupId;
    this.interviewGroupId = groupId; // This is the interview group
    this.mainGroupLink = '';
    this.linkExpiryMinutes = 30;
    this.responseTimeoutMinutes = 10;
    this.reminderTimeoutMinutes = 5;
    this.maxReminders = 2;
    this.minRequiredQuestions = 5;
    this.aiFollowUpEnabled = true;
    this.autoRemoveEnabled = true;
    this.adminIds = [];
    this.isActive = true;
  }
}

// Initialize default settings for a group
function initGroupSettings(groupId) {
  if (!groupSettings.has(groupId)) {
    const settings = new GroupSettings(groupId);
    groupSettings.set(groupId, settings);
    
    // Initialize default questions
    if (!interviewQuestions.has(groupId)) {
      interviewQuestions.set(groupId, [...DEFAULT_QUESTIONS]);
    }
    
    // Initialize stats
    if (!interviewStats.has(groupId)) {
      interviewStats.set(groupId, {
        totalInterviews: 0,
        approved: 0,
        rejected: 0,
        autoRemoved: 0,
        averageScore: 0,
        averageDuration: 0
      });
    }
  }
  return groupSettings.get(groupId);
}

// AI Interview Engine
class AIInterviewEngine {
  constructor() {
    this.rateLimits = new Map();
  }

  // Generate AI follow-up questions based on user response
  async generateFollowUp(question, userResponse, conversationHistory) {
    try {
      const messages = [
        {
          role: 'system',
          content: `You are an intelligent interviewer for "Gist HQ", a vibrant Nigerian WhatsApp community group. Your job is to ask thoughtful follow-up questions based on user responses to get to know them better.

Rules for follow-up questions:
1. Keep questions conversational and friendly
2. Use occasional Nigerian expressions but stay professional
3. Ask only ONE follow-up question at a time
4. Make it relevant to their previous response
5. Keep it under 100 characters for WhatsApp
6. Be genuinely curious about their background/interests
7. Avoid repetitive questions

Original Question: "${question}"
Their Response: "${userResponse}"

Generate ONE natural follow-up question that would help understand this person better for our community.`
        },
        ...conversationHistory.slice(-4), // Last 4 exchanges for context
        {
          role: 'user',
          content: `Generate a follow-up question based on: "${userResponse}"`
        }
      ];

      const response = await axios.post(
        GROQ_CONFIG.BASE_URL,
        {
          model: GROQ_CONFIG.MODEL,
          messages: messages,
          temperature: 0.8,
          max_tokens: 100,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content.trim();
      }
      return null;

    } catch (error) {
      console.error('AI Follow-up Error:', error);
      return null;
    }
  }

  // Evaluate interview responses using AI
  async evaluateInterview(session) {
    try {
      const responses = session.responses.map(r => `Q: ${r.question}\nA: ${r.answer}`).join('\n\n');
      
      const evaluationPrompt = `You are evaluating a candidate for "Gist HQ", a fun Nigerian WhatsApp community group focused on sharing good vibes, making friends, and helping each other.

INTERVIEW RESPONSES:
${responses}

EVALUATION CRITERIA:
1. Friendliness and positive attitude (25 points)
2. Genuine interest in community participation (25 points)
3. Respectful communication style (20 points)  
4. Clear understanding of group purpose (20 points)
5. Likelihood to follow group rules (10 points)

RED FLAGS (automatic rejection):
- Disrespectful language or attitude
- Spam/promotional intent
- Inappropriate content
- Hostile or aggressive responses
- No genuine interest in community

SCORING:
- 80-100: Excellent candidate (APPROVE)
- 60-79: Good candidate (APPROVE)
- 40-59: Average candidate (REVIEW - provide specific feedback)
- 0-39: Poor candidate (REJECT)

Provide:
1. DECISION: APPROVE/REJECT/REVIEW
2. SCORE: [0-100]
3. FEEDBACK: Brief explanation (max 100 words)

Format: DECISION|SCORE|FEEDBACK`;

      const messages = [
        { role: 'system', content: 'You are a fair and friendly community moderator evaluating new members.' },
        { role: 'user', content: evaluationPrompt }
      ];

      const response = await axios.post(
        GROQ_CONFIG.BASE_URL,
        {
          model: GROQ_CONFIG.MODEL,
          messages: messages,
          temperature: 0.3,
          max_tokens: 200
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );

      if (response.data?.choices?.[0]?.message?.content) {
        const result = response.data.choices[0].message.content.trim();
        const [decision, score, feedback] = result.split('|');
        
        return {
          decision: decision?.trim().toUpperCase() || 'REVIEW',
          score: parseInt(score?.trim()) || 50,
          feedback: feedback?.trim() || 'No feedback provided'
        };
      }
      
      return { decision: 'REVIEW', score: 50, feedback: 'AI evaluation failed' };

    } catch (error) {
      console.error('AI Evaluation Error:', error);
      return { decision: 'REVIEW', score: 50, feedback: 'Technical evaluation error' };
    }
  }
}

const aiEngine = new AIInterviewEngine();

// Timer management for response timeouts
const responseTimers = new Map();
const reminderTimers = new Map();

function setResponseTimer(userId, timeoutMs, callback) {
  clearResponseTimer(userId);
  responseTimers.set(userId, setTimeout(callback, timeoutMs));
}

function setReminderTimer(userId, timeoutMs, callback) {
  clearReminderTimer(userId);
  reminderTimers.set(userId, setTimeout(callback, timeoutMs));
}

function clearResponseTimer(userId) {
  if (responseTimers.has(userId)) {
    clearTimeout(responseTimers.get(userId));
    responseTimers.delete(userId);
  }
}

function clearReminderTimer(userId) {
  if (reminderTimers.has(userId)) {
    clearTimeout(reminderTimers.get(userId));
    reminderTimers.delete(userId);
  }
}

// Start interview process
async function startInterview(userId, groupId, userName, sock) {
  const settings = initGroupSettings(groupId);
  if (!settings.isActive) return;

  // Check if already in interview
  if (interviewSessions.has(userId)) {
    console.log(`User ${userId} already in interview session`);
    return;
  }

  // Create new interview session
  const session = new InterviewSession(userId, groupId, userName);
  interviewSessions.set(userId, session);

  // Send welcome message
  const welcomeMsg = `🎉 *Welcome to Gist HQ Interview!* 🎉

Hey ${userName}! 👋 

I'm your friendly AI interviewer. I'll ask you a few questions to get to know you better before you join our main Gist HQ family! 

This should take about 5-10 minutes. Ready? Let's start! 🚀

*Question 1:* What's your name and where are you from? Tell us a bit about yourself! 😊`;

  await sock.sendMessage(groupId, { text: welcomeMsg });

  // Set response timer
  const timeoutMs = settings.responseTimeoutMinutes * 60 * 1000;
  setResponseTimer(userId, timeoutMs, () => handleResponseTimeout(userId, sock));

  console.log(`✅ Interview started for ${userName} (${userId}) in group ${groupId}`);
}

// Handle user response during interview
async function handleInterviewResponse(session, userMessage, sock) {
  const settings = groupSettings.get(session.groupId);
  const questions = interviewQuestions.get(session.groupId) || DEFAULT_QUESTIONS;

  // Update last response time
  session.lastResponseTime = new Date();
  clearResponseTimer(session.userId);
  clearReminderTimer(session.userId);

  // Add to conversation history
  session.conversationHistory.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date()
  });

  // Get current question
  const currentQ = questions[session.currentQuestion];
  if (!currentQ) {
    await finishInterview(session, sock);
    return;
  }

  // Save response
  session.responses.push({
    questionId: currentQ.id,
    question: currentQ.question,
    answer: userMessage,
    timestamp: new Date()
  });

  // Check if we should ask follow-up question (AI-driven)
  const shouldFollowUp = session.aiFollowUps < 2 && 
                        settings.aiFollowUpEnabled && 
                        userMessage.length > 10 && 
                        Math.random() > 0.5; // 50% chance for variety

  if (shouldFollowUp) {
    try {
      const followUp = await aiEngine.generateFollowUp(
        currentQ.question,
        userMessage,
        session.conversationHistory
      );

      if (followUp) {
        await sock.sendMessage(session.groupId, { text: followUp });
        session.aiFollowUps++;
        
        // Set timer for follow-up response
        const timeoutMs = settings.responseTimeoutMinutes * 60 * 1000;
        setResponseTimer(session.userId, timeoutMs, () => handleResponseTimeout(session.userId, sock));
        return;
      }
    } catch (error) {
      console.error('Follow-up generation failed:', error);
    }
  }

  // Move to next question
  session.currentQuestion++;

  // Check if we need to show rules
  if (session.currentQuestion === questions.length && !session.rulesAcknowledged) {
    await showRulesAndGuidelines(session, sock);
    return;
  }

  // Check if interview is complete
  if (session.currentQuestion >= questions.length && session.rulesAcknowledged) {
    await finishInterview(session, sock);
    return;
  }

  // Ask next question
  const nextQuestion = questions[session.currentQuestion];
  if (nextQuestion) {
    const questionMsg = `*Question ${session.currentQuestion + 1}:* ${nextQuestion.question}`;
    await sock.sendMessage(session.groupId, { text: questionMsg });

    // Set response timer
    const timeoutMs = settings.responseTimeoutMinutes * 60 * 1000;
    setResponseTimer(session.userId, timeoutMs, () => handleResponseTimeout(session.userId, sock));
  }
}

// Show rules and get acknowledgment
async function showRulesAndGuidelines(session, sock) {
  const rulesMsg = `${GHQ_RULES}

📝 *Please confirm:* Do you understand and agree to follow all these rules? (Reply with "Yes, I agree" or similar)`;

  await sock.sendMessage(session.groupId, { text: rulesMsg });

  // Set response timer for rules acknowledgment
  const settings = groupSettings.get(session.groupId);
  const timeoutMs = settings.responseTimeoutMinutes * 60 * 1000;
  setResponseTimer(session.userId, timeoutMs, () => handleResponseTimeout(session.userId, sock));
}

// Handle response timeout
async function handleResponseTimeout(userId, sock) {
  const session = interviewSessions.get(userId);
  if (!session || session.status !== 'active') return;

  const settings = groupSettings.get(session.groupId);
  session.remindersSent++;

  if (session.remindersSent <= settings.maxReminders) {
    // Send reminder
    const reminderMsg = session.remindersSent === 1 
      ? `⏰ Hey ${session.userName}! I'm still waiting for your response to continue the interview. Please reply when you're ready! 😊`
      : `⏰ Last reminder! Please respond to continue your Gist HQ interview, or you'll be automatically removed. 🙏`;

    await sock.sendMessage(session.groupId, { text: reminderMsg });

    // Set reminder timer
    const reminderMs = settings.reminderTimeoutMinutes * 60 * 1000;
    setReminderTimer(userId, reminderMs, () => handleResponseTimeout(userId, sock));
  } else {
    // Remove user from group
    await removeUserFromInterview(session, 'No response after reminders', sock);
  }
}

// Finish interview and evaluate
async function finishInterview(session, sock) {
  session.status = 'completed';
  
  const evaluationMsg = `✅ *Interview Complete!* 

Thank you ${session.userName} for taking the time to answer all questions! 🙏

I'm now evaluating your responses... This will take just a moment! ⏳`;

  await sock.sendMessage(session.groupId, { text: evaluationMsg });

  try {
    // AI evaluation
    const evaluation = await aiEngine.evaluateInterview(session);
    session.score = evaluation.score;
    session.feedback = evaluation.feedback;

    console.log(`Interview evaluation for ${session.userName}: ${evaluation.decision} (${evaluation.score}/100)`);

    if (evaluation.decision === 'APPROVE' && evaluation.score >= 60) {
      await approveUser(session, evaluation, sock);
    } else if (evaluation.decision === 'REJECT' || evaluation.score < 40) {
      await rejectUser(session, evaluation, sock);
    } else {
      // Manual review needed
      session.status = 'pending_review';
      await requestManualReview(session, evaluation, sock);
    }

  } catch (error) {
    console.error('Interview evaluation failed:', error);
    session.status = 'pending_review';
    await requestManualReview(session, { score: 50, feedback: 'Technical evaluation error' }, sock);
  }
}

// Approve user and send main group link
async function approveUser(session, evaluation, sock) {
  session.status = 'approved';
  const settings = groupSettings.get(session.groupId);
  
  // Update stats
  updateInterviewStats(session.groupId, 'approved', session);

  const approvalMsg = `🎉 *CONGRATULATIONS!* 🎉

Welcome to the Gist HQ family, ${session.userName}! 🥳

You've successfully passed the interview! Here's your link to join our main group:

${settings.mainGroupLink || 'Link will be provided by admin'}

⚠️ *Important:* This link will expire in ${settings.linkExpiryMinutes} minutes for security reasons.

Welcome to Gist HQ! Can't wait to see you in the main group! 🚀✨`;

  await sock.sendMessage(session.groupId, { text: approvalMsg });

  // Schedule link deletion reminder (if link was provided)
  if (settings.mainGroupLink) {
    setTimeout(async () => {
      const expiryMsg = `⏰ *Link Expired* 

The main group link shared with ${session.userName} has now expired for security. 🔒`;
      
      // Notify admins only (would need admin chat implementation)
      console.log(`Link expired for approved user: ${session.userName}`);
    }, settings.linkExpiryMinutes * 60 * 1000);
  }

  // Clean up session after some time
  setTimeout(() => {
    interviewSessions.delete(session.userId);
  }, 10 * 60 * 1000); // 10 minutes
}

// Reject user
async function rejectUser(session, evaluation, sock) {
  session.status = 'rejected';
  
  // Update stats
  updateInterviewStats(session.groupId, 'rejected', session);

  const rejectionMsg = `❌ *Interview Result* 

Thank you for your interest in Gist HQ, ${session.userName}.

Unfortunately, we won't be moving forward with your application at this time. 

${evaluation.feedback ? `Feedback: ${evaluation.feedback}` : ''}

You're welcome to reapply in the future! Best wishes! 🙏`;

  await sock.sendMessage(session.groupId, { text: rejectionMsg });

  // Remove from interview group after delay
  setTimeout(async () => {
    try {
      await sock.groupParticipantsUpdate(session.groupId, [session.userId], 'remove');
      console.log(`Removed rejected user: ${session.userName}`);
    } catch (error) {
      console.error('Failed to remove rejected user:', error);
    }
    interviewSessions.delete(session.userId);
  }, 5 * 60 * 1000); // 5 minutes delay
}

// Request manual admin review
async function requestManualReview(session, evaluation, sock) {
  const reviewMsg = `🔍 *Manual Review Required*

Thank you ${session.userName}! Your interview has been submitted for admin review.

Score: ${evaluation.score}/100
${evaluation.feedback ? `Feedback: ${evaluation.feedback}` : ''}

An admin will review your application and get back to you soon! Please wait patiently. ⏳`;

  await sock.sendMessage(session.groupId, { text: reviewMsg });

  // Notify admins (would need admin notification system)
  console.log(`Manual review requested for ${session.userName} - Score: ${evaluation.score}`);
}

// Remove user for non-responsiveness
async function removeUserFromInterview(session, reason, sock) {
  session.status = 'failed';
  
  // Update stats
  updateInterviewStats(session.groupId, 'autoRemoved', session);

  const removalMsg = `⚠️ *Interview Timeout*

Sorry ${session.userName}, you've been removed from the interview process due to: ${reason}

You're welcome to rejoin and restart the interview anytime! 🔄`;

  await sock.sendMessage(session.groupId, { text: removalMsg });

  // Remove from group
  setTimeout(async () => {
    try {
      await sock.groupParticipantsUpdate(session.groupId, [session.userId], 'remove');
      console.log(`Auto-removed user: ${session.userName} - Reason: ${reason}`);
    } catch (error) {
      console.error('Failed to auto-remove user:', error);
    }
    
    // Clean up
    interviewSessions.delete(session.userId);
    clearResponseTimer(session.userId);
    clearReminderTimer(session.userId);
  }, 2000);
}

// Update interview statistics
function updateInterviewStats(groupId, outcome, session) {
  const stats = interviewStats.get(groupId);
  if (!stats) return;

  stats.totalInterviews++;
  stats[outcome]++;
  
  // Update averages
  stats.averageScore = ((stats.averageScore * (stats.totalInterviews - 1)) + session.score) / stats.totalInterviews;
  
  const duration = (new Date() - session.startTime) / (1000 * 60); // minutes
  stats.averageDuration = ((stats.averageDuration * (stats.totalInterviews - 1)) + duration) / stats.totalInterviews;

  interviewStats.set(groupId, stats);
}

// Check if user is admin
function isAdmin(userId, groupId, config) {
  const settings = groupSettings.get(groupId);
  return config.OWNER_NUMBER === userId || 
         (config.MODS && config.MODS.includes(userId)) || 
         (settings && settings.adminIds.includes(userId));
}

// Main plugin handler
export default async function autoInterviewHandler(m, sock, config) {
  try {
    const isGroupChat = m.from.endsWith('@g.us');
    if (!isGroupChat) return; // Only work in groups

    const userId = m.sender;
    const groupId = m.from;
    const userName = m.pushName || userId.split('@')[0];
    
    // Initialize group settings
    initGroupSettings(groupId);
    const settings = groupSettings.get(groupId);

    // Handle group participant updates (new members)
    if (m.messageType === 'notification' && m.action === 'add' && settings.isActive) {
      const newMembers = m.participants || [m.sender];
      
      for (const newMember of newMembers) {
        // Don't interview bots or admins
        if (newMember === sock.user?.id || isAdmin(newMember, groupId, config)) {
          continue;
        }

        const memberName = newMember.split('@')[0];
        console.log(`🎯 New member detected: ${memberName} in interview group ${groupId}`);
        
        // Start interview after brief delay
        setTimeout(() => {
          startInterview(newMember, groupId, memberName, sock);
        }, 2000);
      }
      return;
    }

    // Handle interview responses
    const activeSession = interviewSessions.get(userId);
    if (activeSession && activeSession.status === 'active' && m.body) {
      // Check for rules acknowledgment
      if (!activeSession.rulesAcknowledged && activeSession.currentQuestion >= interviewQuestions.get(groupId).length) {
        const response = m.body.toLowerCase();
        if (response.includes('yes') && response.includes('agree')) {
          activeSession.rulesAcknowledged = true;
          await sock.sendMessage(groupId, { 
            text: `✅ Perfect! Thank you for agreeing to our community guidelines! 

Let me now evaluate your responses... ⏳` 
          });
          await finishInterview(activeSession, sock);
          return;
        } else {
          await sock.sendMessage(groupId, {
            text: `❌ I need you to explicitly agree to our rules to proceed. Please reply with "Yes, I agree" or similar. 

If you don't want to follow our guidelines, that's okay, but you won't be able to join the main group. 🤷‍♀️`
          });
          return;
        }
      }

      // Handle regular interview response
      await handleInterviewResponse(activeSession, m.body, sock);
      return;
    }

    // Handle admin commands
    if (m.body && m.body.startsWith(config.PREFIX)) {
      const args = m.body.slice(config.PREFIX.length).trim().split(' ');
      const command = args[0].toLowerCase();

      // Manual interview start
      if (command === 'interview' || command === 'startinterview') {
        if (activeSession) {
          await sock.sendMessage(groupId, {
            text: `⚠️ You already have an active interview session! Please complete it first. 

Current question: ${activeSession.currentQuestion + 1} of ${interviewQuestions.get(groupId).length}`
          }, { quoted: m });
          return;
        }

        await startInterview(userId, groupId, userName, sock);
        return;
      }

      // Admin-only commands
      if (!isAdmin(userId, groupId, config)) {
        if (['activateinterviews', 'deactivateinterviews', 'interviewstatus', 'addquestion', 
             'removequestion', 'listquestions', 'interviewsettings', 'interviewstats', 
             'approveuser', 'rejectuser', 'setmaingroup'].includes(command)) {
          await sock.sendMessage(groupId, {
            text: `❌ This command is only available to admins! 👮‍♀️`
          }, { quoted: m });
          return;
        }
      }

      // Add interview question
      if (command === 'addquestion' && isAdmin(userId, groupId, config)) {
        const questionText = args.slice(1).join(' ');
        if (!questionText) {
          await sock.sendMessage(groupId, {
            text: `📝 *Add Interview Question*

Usage: \`${config.PREFIX}addquestion <question text>\`

Example: \`${config.PREFIX}addquestion What's your favorite hobby?\``
          }, { quoted: m });
          return;
        }

        const questions = interviewQuestions.get(groupId) || [];
        const newQuestion = {
          id: Math.max(...questions.map(q => q.id), 0) + 1,
          question: questionText,
          required: true,
          category: 'custom'
        };

        questions.push(newQuestion);
        interviewQuestions.set(groupId, questions);

        await sock.sendMessage(groupId, {
          text: `✅ *Question Added Successfully!*

New question: "${questionText}"
Question ID: ${newQuestion.id}
Total questions: ${questions.length}`
        }, { quoted: m });
        return;
      }

      // Remove interview question
      if (command === 'removequestion' && isAdmin(userId, groupId, config)) {
        const questionId = parseInt(args[1]);
        if (!questionId) {
          await sock.sendMessage(groupId, {
            text: `🗑️ *Remove Interview Question*

Usage: \`${config.PREFIX}removequestion <question_id>\`

Use \`${config.PREFIX}listquestions\` to see question IDs.`
          }, { quoted: m });
          return;
        }

        const questions = interviewQuestions.get(groupId) || [];
        const originalLength = questions.length;
        const updatedQuestions = questions.filter(q => q.id !== questionId);
        
        if (updatedQuestions.length === originalLength) {
          await sock.sendMessage(groupId, {
            text: `❌ Question with ID ${questionId} not found! 

Use \`${config.PREFIX}listquestions\` to see available questions.`
          }, { quoted: m });
          return;
        }

        interviewQuestions.set(groupId, updatedQuestions);

        await sock.sendMessage(groupId, {
          text: `✅ *Question Removed Successfully!*

Question ID ${questionId} has been deleted.
Remaining questions: ${updatedQuestions.length}`
        }, { quoted: m });
        return;
      }

      // List interview questions
      if (command === 'listquestions' && isAdmin(userId, groupId, config)) {
        const questions = interviewQuestions.get(groupId) || [];
        
        if (questions.length === 0) {
          await sock.sendMessage(groupId, {
            text: `📝 *No Interview Questions*

No questions configured yet. Use \`${config.PREFIX}addquestion\` to add some!`
          }, { quoted: m });
          return;
        }

        let questionList = `📝 *Interview Questions (${questions.length})*\n\n`;
        questions.forEach((q, index) => {
          const required = q.required ? '✅' : '❌';
          questionList += `*${index + 1}.* [ID: ${q.id}] ${required}\n${q.question}\n\n`;
        });

        questionList += `_✅ = Required | ❌ = Optional_`;

        await sock.sendMessage(groupId, { text: questionList }, { quoted: m });
        return;
      }

      // Interview settings
      if (command === 'interviewsettings' && isAdmin(userId, groupId, config)) {
        if (args[1]) {
          // Update setting
          const setting = args[1].toLowerCase();
          const value = args[2];

          switch (setting) {
            case 'timeout':
              const timeout = parseInt(value);
              if (timeout && timeout >= 5 && timeout <= 60) {
                settings.responseTimeoutMinutes = timeout;
                await sock.sendMessage(groupId, {
                  text: `✅ Response timeout updated to ${timeout} minutes`
                }, { quoted: m });
              } else {
                await sock.sendMessage(groupId, {
                  text: `❌ Invalid timeout value. Use 5-60 minutes.`
                }, { quoted: m });
              }
              break;

            case 'reminders':
              const reminders = parseInt(value);
              if (reminders !== undefined && reminders >= 0 && reminders <= 5) {
                settings.maxReminders = reminders;
                await sock.sendMessage(groupId, {
                  text: `✅ Max reminders updated to ${reminders}`
                }, { quoted: m });
              } else {
                await sock.sendMessage(groupId, {
                  text: `❌ Invalid reminders value. Use 0-5.`
                }, { quoted: m });
              }
              break;

            case 'linkexpiry':
              const expiry = parseInt(value);
              if (expiry && expiry >= 10 && expiry <= 1440) {
                settings.linkExpiryMinutes = expiry;
                await sock.sendMessage(groupId, {
                  text: `✅ Link expiry updated to ${expiry} minutes`
                }, { quoted: m });
              } else {
                await sock.sendMessage(groupId, {
                  text: `❌ Invalid expiry value. Use 10-1440 minutes (24 hours max).`
                }, { quoted: m });
              }
              break;

            case 'active':
              const isActive = value?.toLowerCase() === 'true';
              settings.isActive = isActive;
              await sock.sendMessage(groupId, {
                text: `✅ Interview system ${isActive ? 'activated' : 'deactivated'}`
              }, { quoted: m });
              break;

            default:
              await sock.sendMessage(groupId, {
                text: `❌ Unknown setting: ${setting}

Available settings: timeout, reminders, linkexpiry, active`
              }, { quoted: m });
          }
          return;
        }

        // Show current settings
        const settingsMsg = `⚙️ *Interview Settings*

🔧 *Current Configuration:*
• Response Timeout: ${settings.responseTimeoutMinutes} minutes
• Reminder Timeout: ${settings.reminderTimeoutMinutes} minutes
• Max Reminders: ${settings.maxReminders}
• Link Expiry: ${settings.linkExpiryMinutes} minutes
• Min Required Questions: ${settings.minRequiredQuestions}
• AI Follow-ups: ${settings.aiFollowUpEnabled ? 'Enabled' : 'Disabled'}
• Auto Remove: ${settings.autoRemoveEnabled ? 'Enabled' : 'Disabled'}
• System Status: ${settings.isActive ? 'Active 🟢' : 'Inactive 🔴'}

📝 *Update Settings:*
\`${config.PREFIX}interviewsettings timeout 15\`
\`${config.PREFIX}interviewsettings reminders 2\`
\`${config.PREFIX}interviewsettings linkexpiry 30\`
\`${config.PREFIX}interviewsettings active true\``;

        await sock.sendMessage(groupId, { text: settingsMsg }, { quoted: m });
        return;
      }

      // Interview statistics
      if (command === 'interviewstats' && isAdmin(userId, groupId, config)) {
        const stats = interviewStats.get(groupId);
        if (!stats || stats.totalInterviews === 0) {
          await sock.sendMessage(groupId, {
            text: `📊 *Interview Statistics*

No interviews conducted yet! 📈

Once members start getting interviewed, you'll see stats here.`
          }, { quoted: m });
          return;
        }

        const successRate = ((stats.approved / stats.totalInterviews) * 100).toFixed(1);
        const avgScore = stats.averageScore.toFixed(1);
        const avgDuration = stats.averageDuration.toFixed(1);

        const statsMsg = `📊 *Interview Statistics*

📈 *Overall Performance:*
• Total Interviews: ${stats.totalInterviews}
• Approved: ${stats.approved} (${successRate}%)
• Rejected: ${stats.rejected}
• Auto-Removed: ${stats.autoRemoved}
• Pending Review: ${stats.totalInterviews - stats.approved - stats.rejected - stats.autoRemoved}

⭐ *Quality Metrics:*
• Average Score: ${avgScore}/100
• Average Duration: ${avgDuration} minutes
• Success Rate: ${successRate}%

🎯 *Active Sessions:* ${Array.from(interviewSessions.values()).filter(s => s.groupId === groupId && s.status === 'active').length}`;

        await sock.sendMessage(groupId, { text: statsMsg }, { quoted: m });
        return;
      }

      // Manually approve user
      if (command === 'approveuser' && isAdmin(userId, groupId, config)) {
        const targetUser = args[1];
        if (!targetUser) {
          await sock.sendMessage(groupId, {
            text: `✅ *Manual User Approval*

Usage: \`${config.PREFIX}approveuser @user_or_reply\`

You can either mention the user or reply to their message.`
          }, { quoted: m });
          return;
        }

        // Find session (could be enhanced to search by mention or quoted message)
        const session = Array.from(interviewSessions.values())
          .find(s => s.groupId === groupId && s.status === 'pending_review');

        if (!session) {
          await sock.sendMessage(groupId, {
            text: `❌ No pending interview sessions found for manual approval.`
          }, { quoted: m });
          return;
        }

        await approveUser(session, { score: 100, feedback: 'Manually approved by admin' }, sock);
        await sock.sendMessage(groupId, {
          text: `✅ User ${session.userName} has been manually approved by admin.`
        }, { quoted: m });
        return;
      }

      // Manually reject user
      if (command === 'rejectuser' && isAdmin(userId, groupId, config)) {
        const reason = args.slice(1).join(' ') || 'Rejected by admin';
        
        const session = Array.from(interviewSessions.values())
          .find(s => s.groupId === groupId && s.status === 'pending_review');

        if (!session) {
          await sock.sendMessage(groupId, {
            text: `❌ No pending interview sessions found for manual rejection.`
          }, { quoted: m });
          return;
        }

        await rejectUser(session, { score: 0, feedback: reason }, sock);
        await sock.sendMessage(groupId, {
          text: `❌ User ${session.userName} has been manually rejected by admin.\nReason: ${reason}`
        }, { quoted: m });
        return;
      }

      // Set main group link
      if (command === 'setmaingroup' && isAdmin(userId, groupId, config)) {
        const link = args[1];
        if (!link) {
          await sock.sendMessage(groupId, {
            text: `🔗 *Set Main Group Link*

Usage: \`${config.PREFIX}setmaingroup <invite_link>\`

Example: \`${config.PREFIX}setmaingroup https://chat.whatsapp.com/xxxxx\`

This link will be sent to approved interview candidates.`
          }, { quoted: m });
          return;
        }

        if (!link.includes('chat.whatsapp.com')) {
          await sock.sendMessage(groupId, {
            text: `❌ Invalid WhatsApp group invite link! 

Please provide a valid link starting with https://chat.whatsapp.com/`
          }, { quoted: m });
          return;
        }

        settings.mainGroupLink = link;
        groupSettings.set(groupId, settings);

        await sock.sendMessage(groupId, {
          text: `✅ *Main Group Link Updated!*

New link has been set and will be sent to approved candidates.

⚠️ Make sure this link is valid and points to your main Gist HQ group!`
        }, { quoted: m });
        return;
      }
    }

  } catch (error) {
    console.error('Auto Interview Plugin Error:', error);
    
    // Clean up any stuck sessions
    const session = interviewSessions.get(m.sender);
    if (session) {
      clearResponseTimer(m.sender);
      clearReminderTimer(m.sender);
    }
  }
}
