// ============= SMART AI ENHANCEMENTS =============
// Add these to your existing plugin for true group intelligence

// Enhanced member profiling system
const memberProfiles = new Map();
const groupDynamics = new Map();
const conversationTopics = new Map();
const memberRelationships = new Map();
const groupMoods = new Map();
const learningPatterns = new Map();

// ============= 1. ADVANCED MEMBER PROFILING =============
class SmartMemberProfiler {
  constructor() {
    this.personalityTraits = {
      humor: ['funny', 'lol', 'haha', '😂', 'joke', 'lmao'],
      technical: ['code', 'programming', 'tech', 'software', 'api', 'bug'],
      social: ['guys', 'everyone', 'party', 'hangout', 'meet'],
      emotional: ['sad', 'happy', 'angry', 'excited', 'stressed', 'tired'],
      nigerian: ['wetin', 'abeg', 'oga', 'sha', 'keh', 'wahala', 'how far'],
      helpful: ['help', 'support', 'assist', 'guide', 'teach'],
      business: ['money', 'work', 'business', 'hustle', 'client', 'deal']
    };
    
    this.interests = {
      sports: ['football', 'soccer', 'basketball', 'chelsea', 'arsenal', 'united'],
      entertainment: ['movie', 'music', 'netflix', 'series', 'album', 'artist'],
      technology: ['ai', 'blockchain', 'crypto', 'phone', 'laptop', 'app'],
      food: ['rice', 'jollof', 'pepper', 'soup', 'restaurant', 'hungry'],
      lifestyle: ['travel', 'fashion', 'car', 'house', 'relationship', 'family']
    };
  }

  analyzeMemberMessage(userId, message, groupId) {
    let profile = memberProfiles.get(userId) || this.createNewProfile(userId);
    
    // Analyze personality traits
    this.updatePersonalityTraits(profile, message);
    
    // Analyze interests
    this.updateInterests(profile, message);
    
    // Analyze communication patterns
    this.updateCommunicationStyle(profile, message);
    
    // Analyze activity patterns
    this.updateActivityPatterns(profile, groupId);
    
    // Analyze emotional state
    this.updateEmotionalState(profile, message);
    
    memberProfiles.set(userId, profile);
    return profile;
  }

  createNewProfile(userId) {
    return {
      userId,
      personality: {
        humor: 0, technical: 0, social: 0, emotional: 0,
        nigerian: 0, helpful: 0, business: 0
      },
      interests: {
        sports: 0, entertainment: 0, technology: 0,
        food: 0, lifestyle: 0
      },
      communication: {
        messageLength: [],
        responseTime: [],
        activeHours: new Map(),
        preferredLanguage: 'english',
        formalityLevel: 0,
        questionAsker: 0,
        conversationStarter: 0
      },
      relationships: new Map(),
      emotionalHistory: [],
      topTopics: [],
      lastAnalyzed: Date.now(),
      totalMessages: 0,
      learningScore: 0
    };
  }

  updatePersonalityTraits(profile, message) {
    const text = message.toLowerCase();
    
    Object.entries(this.personalityTraits).forEach(([trait, keywords]) => {
      const matches = keywords.filter(keyword => text.includes(keyword)).length;
      if (matches > 0) {
        profile.personality[trait] += matches;
      }
    });
  }

  updateInterests(profile, message) {
    const text = message.toLowerCase();
    
    Object.entries(this.interests).forEach(([interest, keywords]) => {
      const matches = keywords.filter(keyword => text.includes(keyword)).length;
      if (matches > 0) {
        profile.interests[interest] += matches;
      }
    });
  }

  updateCommunicationStyle(profile, message) {
    // Message length analysis
    profile.communication.messageLength.push(message.length);
    if (profile.communication.messageLength.length > 50) {
      profile.communication.messageLength = profile.communication.messageLength.slice(-50);
    }

    // Question asking tendency
    if (message.includes('?') || /^(what|how|why|when|where|who)/i.test(message)) {
      profile.communication.questionAsker += 1;
    }

    // Formality level
    const formalWords = ['please', 'thank you', 'kindly', 'regards', 'sir', 'madam'];
    const casualWords = ['lol', 'bro', 'guy', 'mehn', 'abeg', 'wetin'];
    
    const formalCount = formalWords.filter(word => message.toLowerCase().includes(word)).length;
    const casualCount = casualWords.filter(word => message.toLowerCase().includes(word)).length;
    
    if (formalCount > casualCount) {
      profile.communication.formalityLevel += 1;
    } else if (casualCount > formalCount) {
      profile.communication.formalityLevel -= 1;
    }

    profile.totalMessages += 1;
  }

  updateActivityPatterns(profile, groupId) {
    const hour = new Date().getHours();
    const currentCount = profile.communication.activeHours.get(hour) || 0;
    profile.communication.activeHours.set(hour, currentCount + 1);
  }

  updateEmotionalState(profile, message) {
    const emotions = {
      happy: ['happy', 'joy', 'great', 'awesome', 'wonderful', '😊', '😄', '🎉'],
      sad: ['sad', 'down', 'depressed', 'hurt', 'crying', '😢', '😭', '💔'],
      angry: ['angry', 'mad', 'furious', 'annoyed', 'pissed', '😡', '🤬'],
      excited: ['excited', 'pumped', 'thrilled', 'amazing', '🔥', '🚀', '🎊'],
      stressed: ['stressed', 'tired', 'overwhelmed', 'busy', 'pressure', '😤', '😫']
    };

    const text = message.toLowerCase();
    Object.entries(emotions).forEach(([emotion, keywords]) => {
      const matches = keywords.filter(keyword => text.includes(keyword)).length;
      if (matches > 0) {
        profile.emotionalHistory.push({
          emotion,
          intensity: matches,
          timestamp: Date.now()
        });
      }
    });

    // Keep last 20 emotional states
    if (profile.emotionalHistory.length > 20) {
      profile.emotionalHistory = profile.emotionalHistory.slice(-20);
    }
  }

  getMemberSummary(userId) {
    const profile = memberProfiles.get(userId);
    if (!profile) return null;

    // Calculate dominant personality trait
    const dominantTrait = Object.entries(profile.personality)
      .sort(([,a], [,b]) => b - a)[0];

    // Calculate top interest
    const topInterest = Object.entries(profile.interests)
      .sort(([,a], [,b]) => b - a)[0];

    // Calculate average message length
    const avgMessageLength = profile.communication.messageLength.length > 0
      ? profile.communication.messageLength.reduce((a, b) => a + b, 0) / profile.communication.messageLength.length
      : 0;

    // Get most active hour
    const mostActiveHour = [...profile.communication.activeHours.entries()]
      .sort(([,a], [,b]) => b - a)[0];

    // Recent emotional state
    const recentEmotion = profile.emotionalHistory.slice(-1)[0];

    return {
      dominantPersonality: dominantTrait,
      topInterest,
      communicationStyle: {
        avgMessageLength: Math.round(avgMessageLength),
        formality: profile.communication.formalityLevel > 0 ? 'formal' : 'casual',
        questionTendency: profile.communication.questionAsker > profile.totalMessages * 0.3 ? 'high' : 'low'
      },
      activityPattern: mostActiveHour ? `Most active at ${mostActiveHour[0]}:00` : 'Unknown',
      currentMood: recentEmotion?.emotion || 'neutral',
      totalMessages: profile.totalMessages
    };
  }
}

// ============= 2. GROUP DYNAMICS ANALYZER =============
class GroupDynamicsAnalyzer {
  constructor() {
    this.conversationTopics = new Map();
    this.memberInteractions = new Map();
    this.groupMoods = new Map();
  }

  analyzeGroupMessage(message, groupId) {
    // Extract topics from message
    this.extractTopics(message.body, groupId);
    
    // Analyze member interactions
    this.analyzeMemberInteraction(message, groupId);
    
    // Update group mood
    this.updateGroupMood(message, groupId);
  }

  extractTopics(messageBody, groupId) {
    if (!messageBody) return;

    const topics = groupDynamics.get(groupId)?.topics || new Map();
    const text = messageBody.toLowerCase();
    
    // Nigerian context topics
    const nigerianTopics = {
      'politics': ['buhari', 'tinubu', 'apc', 'pdp', 'election', 'government', 'naija'],
      'sports': ['super eagles', 'afcon', 'premier league', 'football', 'chelsea', 'arsenal'],
      'entertainment': ['nollywood', 'afrobeats', 'burna boy', 'wizkid', 'davido'],
      'technology': ['fintech', 'startup', 'lagos tech', 'paystack', 'flutterwave'],
      'economy': ['naira', 'dollar', 'inflation', 'fuel', 'economy', 'business'],
      'culture': ['jollof', 'owambe', 'aso ebi', 'lagos', 'yoruba', 'igbo', 'hausa']
    };

    Object.entries(nigerianTopics).forEach(([topic, keywords]) => {
      const matches = keywords.filter(keyword => text.includes(keyword)).length;
      if (matches > 0) {
        const currentCount = topics.get(topic) || 0;
        topics.set(topic, currentCount + matches);
      }
    });

    // Store back to group dynamics
    const groupData = groupDynamics.get(groupId) || { topics: new Map(), interactions: new Map() };
    groupData.topics = topics;
    groupDynamics.set(groupId, groupData);
  }

  analyzeMemberInteraction(message, groupId) {
    const interactions = groupDynamics.get(groupId)?.interactions || new Map();
    
    // If it's a reply, record the interaction
    if (message.quoted && message.quoted.participant) {
      const interactionKey = `${message.sender}-${message.quoted.participant}`;
      const currentCount = interactions.get(interactionKey) || 0;
      interactions.set(interactionKey, currentCount + 1);
    }

    // Update group dynamics
    const groupData = groupDynamics.get(groupId) || { topics: new Map(), interactions: new Map() };
    groupData.interactions = interactions;
    groupDynamics.set(groupId, groupData);
  }

  updateGroupMood(message, groupId) {
    const moods = groupMoods.get(groupId) || [];
    
    const moodIndicators = {
      positive: ['great', 'awesome', 'good', 'happy', 'nice', 'cool', '😊', '👍', '🔥'],
      negative: ['bad', 'terrible', 'sad', 'angry', 'annoyed', '😢', '😡', '👎'],
      excited: ['excited', 'amazing', 'wow', 'incredible', '🎉', '🚀', '🔥'],
      casual: ['lol', 'haha', 'chill', 'relaxed', 'okay', 'alright']
    };

    let detectedMood = 'neutral';
    let maxScore = 0;

    Object.entries(moodIndicators).forEach(([mood, indicators]) => {
      const score = indicators.filter(indicator => 
        message.body?.toLowerCase().includes(indicator)
      ).length;
      
      if (score > maxScore) {
        maxScore = score;
        detectedMood = mood;
      }
    });

    if (maxScore > 0) {
      moods.push({
        mood: detectedMood,
        intensity: maxScore,
        timestamp: Date.now(),
        contributor: message.sender
      });

      // Keep last 50 mood records
      if (moods.length > 50) {
        moods.splice(0, moods.length - 50);
      }

      groupMoods.set(groupId, moods);
    }
  }

  getGroupInsights(groupId) {
    const dynamics = groupDynamics.get(groupId);
    const moods = groupMoods.get(groupId) || [];
    
    if (!dynamics) return null;

    // Top topics
    const topTopics = [...dynamics.topics.entries()]
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    // Most interactive members
    const interactions = [...dynamics.interactions.entries()]
      .reduce((acc, [pair, count]) => {
        const [sender, recipient] = pair.split('-');
        acc[sender] = (acc[sender] || 0) + count;
        return acc;
      }, {});

    const mostActive = Object.entries(interactions)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    // Current group mood trend
    const recentMoods = moods.slice(-10);
    const moodTrend = recentMoods.reduce((acc, { mood }) => {
      acc[mood] = (acc[mood] || 0) + 1;
      return acc;
    }, {});

    const dominantMood = Object.entries(moodTrend)
      .sort(([,a], [,b]) => b - a)[0];

    return {
      topTopics: topTopics.map(([topic, count]) => ({ topic, count })),
      mostActiveMembers: mostActive.map(([member, interactions]) => ({ member, interactions })),
      groupMood: dominantMood ? dominantMood[0] : 'neutral',
      totalInteractions: Object.values(interactions).reduce((a, b) => a + b, 0)
    };
  }
}

// ============= 3. SMART RESPONSE GENERATOR =============
class SmartResponseGenerator {
  constructor(profiler, analyzer) {
    this.profiler = profiler;
    this.analyzer = analyzer;
  }

  generatePersonalizedPrompt(userId, groupId, message) {
    const memberSummary = this.profiler.getMemberSummary(userId);
    const groupInsights = this.analyzer.getGroupInsights(groupId);
    
    let personalizedPrompt = `You are Groq, an intelligent AI assistant with deep knowledge about this WhatsApp group and its members.

USER PROFILE (${userId.split('@')[0]}):`;

    if (memberSummary) {
      personalizedPrompt += `
- Personality: ${memberSummary.dominantPersonality?.[0] || 'balanced'} type
- Main Interest: ${memberSummary.topInterest?.[0] || 'general'}
- Communication Style: ${memberSummary.communicationStyle.formality}, ${memberSummary.communicationStyle.avgMessageLength > 50 ? 'detailed' : 'concise'} messages
- Current Mood: ${memberSummary.currentMood}
- Activity Pattern: ${memberSummary.activityPattern}
- Messages Sent: ${memberSummary.totalMessages}`;
    }

    if (groupInsights) {
      personalizedPrompt += `

GROUP CONTEXT:
- Popular Topics: ${groupInsights.topTopics.slice(0, 3).map(t => t.topic).join(', ')}
- Group Mood: ${groupInsights.groupMood}
- Active Members: ${groupInsights.mostActiveMembers.slice(0, 3).map(m => m.member.split('@')[0]).join(', ')}`;
    }

    personalizedPrompt += `

Based on this knowledge, respond in a way that resonates with this specific user and fits the group dynamics. Be contextually aware and personally relevant.`;

    return personalizedPrompt;
  }

  shouldEngageWithMember(userId, message, groupId) {
    const memberSummary = this.profiler.getMemberSummary(userId);
    if (!memberSummary) return false;

    // Engage more with active, social members
    if (memberSummary.dominantPersonality?.[0] === 'social' && 
        memberSummary.totalMessages > 20) {
      return Math.random() < 0.6; // 60% chance
    }

    // Engage with members showing strong interests
    if (memberSummary.topInterest?.[1] > 10) {
      return Math.random() < 0.4; // 40% chance
    }

    // Engage with helpful members
    if (memberSummary.dominantPersonality?.[0] === 'helpful') {
      return Math.random() < 0.5; // 50% chance
    }

    return Math.random() < 0.2; // Default 20% chance
  }
}

// ============= 4. INTEGRATION FUNCTIONS =============

// Initialize smart features
const smartProfiler = new SmartMemberProfiler();
const groupAnalyzer = new GroupDynamicsAnalyzer();
const smartResponder = new SmartResponseGenerator(smartProfiler, groupAnalyzer);

// Enhanced group context update with learning
async function enhancedUpdateGroupContext(groqAI, groupId, message) {
  // Original context update
  await groqAI.updateGroupContext(groupId, message);
  
  // Smart analysis
  smartProfiler.analyzeMemberMessage(message.sender, message.body, groupId);
  groupAnalyzer.analyzeGroupMessage(message, groupId);
}

// Enhanced shouldRespond with smart member engagement
function enhancedShouldRespond(originalShouldRespond, userId, message, groupId, aiMode) {
  if (originalShouldRespond) return true;
  
  // Smart engagement based on member profile
  if (aiMode === AI_MODES.SMART || aiMode === AI_MODES.ACTIVE) {
    return smartResponder.shouldEngageWithMember(userId, message, groupId);
  }
  
  return false;
}

// Enhanced system prompt generation
function generateSmartSystemPrompt(userId, groupId, originalPrompt) {
  const personalizedPrompt = smartResponder.generatePersonalizedPrompt(userId, groupId);
  return personalizedPrompt + '\n\n' + originalPrompt;
}

// ============= 5. ADMIN COMMANDS FOR INSIGHTS =============

// Add these commands to your plugin
const smartCommands = {
  'memberprofile': async (userId, sock, m) => {
    const summary = smartProfiler.getMemberSummary(userId);
    if (!summary) {
      await sock.sendMessage(m.from, {
        text: '❌ No profile data available yet. Chat more to build your profile!'
      }, { quoted: m });
      return;
    }

    const profileText = `👤 *Member Profile Analysis*

🧠 *Personality:* ${summary.dominantPersonality?.[0] || 'Balanced'} type
🎯 *Main Interest:* ${summary.topInterest?.[0] || 'General topics'}
💬 *Communication:* ${summary.communicationStyle.formality} style, ${summary.communicationStyle.avgMessageLength} avg chars
😊 *Current Mood:* ${summary.currentMood}
⏰ *Activity:* ${summary.activityPattern}
📊 *Messages Sent:* ${summary.totalMessages}`;

    await sock.sendMessage(m.from, { text: profileText }, { quoted: m });
  },

  'groupinsights': async (groupId, sock, m) => {
    const insights = groupAnalyzer.getGroupInsights(groupId);
    if (!insights) {
      await sock.sendMessage(m.from, {
        text: '❌ No group insights available yet. Let the group chat more!'
      }, { quoted: m });
      return;
    }

    const insightsText = `📊 *Group Insights*

🔥 *Hot Topics:*
${insights.topTopics.map(t => `• ${t.topic} (${t.count} mentions)`).join('\n')}

👥 *Most Active Members:*
${insights.mostActiveMembers.map(m => `• ${m.member.split('@')[0]} (${m.interactions} interactions)`).join('\n')}

😊 *Group Mood:* ${insights.groupMood}
💬 *Total Interactions:* ${insights.totalInteractions}`;

    await sock.sendMessage(m.from, { text: insightsText }, { quoted: m });
  }
};

// Export the enhanced features
export {
  SmartMemberProfiler,
  GroupDynamicsAnalyzer,
  SmartResponseGenerator,
  enhancedUpdateGroupContext,
  enhancedShouldRespond,
  generateSmartSystemPrompt,
  smartCommands
};
