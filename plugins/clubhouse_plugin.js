// plugins/clubTycoon.js - Premium Nigerian Nightlife Business Tycoon
import chalk from 'chalk';
import moment from 'moment-timezone';
import { PluginHelpers, unifiedUserManager, safeOperation, getCollection } from '../lib/pluginIntegration.js';

// Plugin info and metadata
export const info = {
  name: 'Club Tycoon',
  version: '3.0.0',
  author: 'Premium Business Simulator',
  description: 'Realistic Nigerian nightlife business tycoon with real brands, celebrities, and challenging economics',
  category: 'premium_business',
  commands: [
    'club register <name>',
    'club info',
    'club buy <equipment>',
    'club repair <equipment>',
    'club hire <staff>',
    'club fire <staff>',
    'club host <event>',
    'club celebrity <name>',
    'club billboard',
    'club market',
    'club compete <target>',
    'club sabotage <target>',
    'club takeover <target>',
    'club license <type>',
    'club upgrade <type>',
    'club leaderboard',
    'club alliance <action>',
    'club sponsors',
    'club stats',
    'club bankruptcy'
  ],
  scheduledTasks: [
    {
      name: 'weekly_expenses',
      schedule: '0 0 * * 1', // Every Monday
      description: 'Deduct staff salaries and utilities for all active clubs',
      handler: async () => await processWeeklyExpenses()
    },
    {
      name: 'equipment_breakdown',
      schedule: '0 */8 * * *', // Every 8 hours
      description: 'Process equipment degradation for active clubs',
      handler: async () => await processEquipmentBreakdown()
    },
    {
      name: 'license_enforcement',
      schedule: '0 6 * * *', // Daily at 6 AM
      description: 'Enforce license compliance and issue penalties',
      handler: async () => await processLicenseEnforcement()
    },
    {
      name: 'random_events',
      schedule: '0 */12 * * *', // Every 12 hours
      description: 'Generate random events, scandals, and opportunities',
      handler: async () => await processRandomEvents()
    },
    {
      name: 'reputation_decay',
      schedule: '0 0 * * *', // Daily
      description: 'Apply reputation decay for inactive clubs',
      handler: async () => await processReputationDecay()
    },
    {
      name: 'billboard_update',
      schedule: '0 0 * * 0', // Sunday midnight
      description: 'Update weekly billboard and generate NPC competition',
      handler: async () => await updateBillboardWithNPCs()
    },
    {
      name: 'sponsor_payments',
      schedule: '0 0 * * 1', // Every Monday
      description: 'Process sponsor payments for eligible clubs',
      handler: async () => await processSponsorPayments()
    }
  ]
};

// Premium Game Configuration with Real Brands & Nigerian Context
const TYCOON_CONFIG = {
  REGISTRATION_FEE: {
    min: 5000000, // ₦5M
    max: 10000000, // ₦10M
    base: 7500000 // ₦7.5M
  },
  
  EQUIPMENT: {
    // Premium Sound Systems - Real Brands
    'jbl_prx815': { 
      name: 'JBL PRX815 Speaker System',
      price: 1200000, 
      durability: 150, 
      category: 'sound', 
      brand: 'JBL',
      boost: { revenue: 1.3, reputation: 8 },
      maintenance: 720000 // 60% repair cost
    },
    'yamaha_cl5': { 
      name: 'Yamaha CL5 Digital Console',
      price: 2000000, 
      durability: 180, 
      category: 'sound', 
      brand: 'Yamaha',
      boost: { revenue: 1.5, reputation: 12 },
      maintenance: 1200000
    },
    'pioneer_djm900': { 
      name: 'Pioneer DJM-900NXS2 DJ Mixer',
      price: 1500000, 
      durability: 160, 
      category: 'sound', 
      brand: 'Pioneer',
      boost: { revenue: 1.4, reputation: 10 },
      maintenance: 900000
    },
    'bose_f1': { 
      name: 'Bose F1 Model 812 System',
      price: 1800000, 
      durability: 170, 
      category: 'sound', 
      brand: 'Bose',
      boost: { revenue: 1.45, reputation: 11 },
      maintenance: 1080000
    },
    
    // Premium Lighting - Real Brands
    'chauvet_intimidator': { 
      name: 'Chauvet DJ Intimidator Spot 475Z',
      price: 1000000, 
      durability: 140, 
      category: 'lighting', 
      brand: 'Chauvet',
      boost: { revenue: 1.25, reputation: 7 },
      maintenance: 600000
    },
    'martin_quantum': { 
      name: 'Martin MAC Quantum Wash',
      price: 1500000, 
      durability: 160, 
      category: 'lighting', 
      brand: 'Martin',
      boost: { revenue: 1.35, reputation: 9 },
      maintenance: 900000
    },
    'samsung_led_wall': { 
      name: 'Samsung LED Wall Display',
      price: 3500000, 
      durability: 200, 
      category: 'visual', 
      brand: 'Samsung',
      boost: { revenue: 1.8, reputation: 20 },
      maintenance: 2100000,
      special: 'celebrity_requirement' // Some celebs demand this
    },
    
    // Premium Furniture & Security
    'italian_vip_couches': { 
      name: 'Italian Leather VIP Couches',
      price: 750000, 
      durability: 300, 
      category: 'furniture', 
      brand: 'Premium',
      boost: { revenue: 1.2, reputation: 6 },
      maintenance: 450000
    },
    'reinforced_entrance': { 
      name: 'Reinforced Security Entrance',
      price: 600000, 
      durability: 500, 
      category: 'security', 
      brand: 'Custom',
      boost: { revenue: 1.1, reputation: 4, security: 0.3 },
      maintenance: 360000
    },
    'hikvision_cameras': { 
      name: 'Hikvision 4K Security System',
      price: 900000, 
      durability: 400, 
      category: 'security', 
      brand: 'Hikvision',
      boost: { revenue: 1.15, reputation: 5, security: 0.4 },
      maintenance: 540000
    }
  },
  
  STAFF: {
    'resident_dj': { 
      salary: 150000, // ₦150k/week
      boost: { revenue: 1.4, reputation: 10 }, 
      specialty: 'entertainment',
      requirements: ['pioneer_djm900', 'yamaha_cl5'] // Needs proper equipment
    },
    'celebrity_bartender': { 
      salary: 120000, 
      boost: { revenue: 1.25, reputation: 6 }, 
      specialty: 'service',
      requirements: ['liquor']
    },
    'head_bouncer': { 
      salary: 100000, 
      boost: { revenue: 1.1, reputation: 4, security: 0.5 }, 
      specialty: 'security' 
    },
    'maintenance_crew': { 
      salary: 80000, 
      boost: { revenue: 1.05, maintenance: 0.4 }, 
      specialty: 'technical' 
    },
    'premium_entertainer': { 
      salary: 200000, 
      boost: { revenue: 1.6, reputation: 15 }, 
      specialty: 'adult_entertainment',
      requirements: ['adult_entertainment', 'italian_vip_couches']
    },
    'vip_hostess': { 
      salary: 90000, 
      boost: { revenue: 1.3, reputation: 8 }, 
      specialty: 'vip_service' 
    },
    'sound_engineer': { 
      salary: 110000, 
      boost: { revenue: 1.2, maintenance: 0.3 }, 
      specialty: 'technical' 
    }
  },
  
  LICENSES: {
    'business': { 
      price: 2500000, // ₦2.5M/year
      duration: 365, 
      required: true, 
      description: 'Corporate business operations permit',
      penalties: { daily_fine: 100000, shutdown_risk: 0.1 }
    },
    'liquor': { 
      price: 1500000, // ₦1.5M/year
      duration: 365, 
      required: false, 
      description: 'Premium alcohol service permit',
      enables: ['alcohol_events', 'celebrity_bartender'],
      penalties: { daily_fine: 75000, revenue_loss: 0.3 }
    },
    'noise_permit': { 
      price: 1200000, // ₦1.2M/6 months
      duration: 180, 
      required: false, 
      description: 'Late night noise exemption',
      enables: ['concert', 'celebrity_concert'],
      penalties: { daily_fine: 50000, reputation_loss: 5 }
    },
    'food_service': { 
      price: 1000000, // ₦1M/year
      duration: 365, 
      required: false, 
      description: 'Restaurant and catering permit',
      enables: ['dinner_events', 'vip_dining'],
      penalties: { daily_fine: 40000, health_risk: 0.2 }
    },
    'adult_entertainment': { 
      price: 3000000, // ₦3M/6 months
      duration: 180, 
      required: false, 
      description: 'Adult entertainment operations',
      enables: ['premium_entertainer', 'exclusive_events'],
      penalties: { daily_fine: 150000, scandal_risk: 0.4 }
    }
  },
  
  NIGERIAN_CELEBRITIES: {
    'burna_boy': {
      name: 'Burna Boy',
      fee: 20000000, // ₦20M
      reputation_boost: 50,
      revenue_multiplier: 3.5,
      requirements: ['samsung_led_wall', 'pioneer_djm900', 'noise_permit'],
      no_show_chance: 0.03, // 3% chance
      scandal_risk: 0.1
    },
    'wizkid': {
      name: 'Wizkid',
      fee: 18000000, // ₦18M
      reputation_boost: 45,
      revenue_multiplier: 3.2,
      requirements: ['yamaha_cl5', 'martin_quantum', 'noise_permit'],
      no_show_chance: 0.05,
      scandal_risk: 0.08
    },
    'davido': {
      name: 'Davido',
      fee: 16000000, // ₦16M
      reputation_boost: 42,
      revenue_multiplier: 3.0,
      requirements: ['jbl_prx815', 'chauvet_intimidator'],
      no_show_chance: 0.04,
      scandal_risk: 0.12
    },
    'asake': {
      name: 'Asake',
      fee: 12000000, // ₦12M
      reputation_boost: 35,
      revenue_multiplier: 2.8,
      requirements: ['pioneer_djm900'],
      no_show_chance: 0.05,
      scandal_risk: 0.06
    },
    'olamide': {
      name: 'Olamide',
      fee: 10000000, // ₦10M
      reputation_boost: 30,
      revenue_multiplier: 2.5,
      requirements: ['jbl_prx815'],
      no_show_chance: 0.06,
      scandal_risk: 0.05
    },
    'rema': {
      name: 'Rema',
      fee: 9000000, // ₦9M
      reputation_boost: 28,
      revenue_multiplier: 2.3,
      requirements: ['bose_f1'],
      no_show_chance: 0.07,
      scandal_risk: 0.04
    },
    'fireboy': {
      name: 'Fireboy DML',
      fee: 8000000, // ₦8M
      reputation_boost: 25,
      revenue_multiplier: 2.2,
      requirements: ['yamaha_cl5'],
      no_show_chance: 0.08,
      scandal_risk: 0.03
    },
    'tiwa_savage': {
      name: 'Tiwa Savage',
      fee: 7000000, // ₦7M
      reputation_boost: 22,
      revenue_multiplier: 2.0,
      requirements: ['italian_vip_couches'],
      no_show_chance: 0.04,
      scandal_risk: 0.02
    },
    'kizz_daniel': {
      name: 'Kizz Daniel',
      fee: 6000000, // ₦6M
      reputation_boost: 20,
      revenue_multiplier: 1.9,
      requirements: ['chauvet_intimidator'],
      no_show_chance: 0.09,
      scandal_risk: 0.03
    }
  },
  
  EVENTS: {
    'house_party': { 
      cost: 500000, // ₦500k
      duration: 4, 
      min_equipment: 2,
      min_reputation: 20,
      revenue_multiplier: 1.8,
      licenses_required: ['business']
    },
    'themed_night': { 
      cost: 1000000, // ₦1M
      duration: 6, 
      min_equipment: 4,
      min_reputation: 40,
      revenue_multiplier: 2.2,
      licenses_required: ['business', 'liquor']
    },
    'concert': { 
      cost: 2500000, // ₦2.5M
      duration: 8, 
      min_equipment: 6,
      min_reputation: 60,
      revenue_multiplier: 2.8,
      licenses_required: ['business', 'noise_permit']
    },
    'exclusive_vip_event': { 
      cost: 5000000, // ₦5M
      duration: 12, 
      min_equipment: 8,
      min_reputation: 80,
      revenue_multiplier: 3.5,
      licenses_required: ['business', 'liquor', 'noise_permit']
    },
    'celebrity_concert': { 
      cost: 8000000, // ₦8M base + celebrity fee
      duration: 10, 
      min_equipment: 10,
      min_reputation: 90,
      revenue_multiplier: 4.0,
      licenses_required: ['business', 'liquor', 'noise_permit'],
      requires_celebrity: true
    }
  },
  
  UPGRADES: {
    'social_media_marketing': { 
      price: 2000000, 
      boost: { revenue: 1.3, reputation: 15 },
      description: 'Professional social media management'
    },
    'vip_parking_lot': { 
      price: 3000000, 
      boost: { revenue: 1.25, reputation: 10 },
      description: 'Secured VIP customer parking'
    },
    'backup_generators': { 
      price: 2500000, 
      boost: { reliability: 0.9 },
      description: 'Prevents power outage losses'
    },
    'soundproofing': { 
      price: 1800000, 
      boost: { noise_compliance: 0.8 },
      description: 'Reduces noise violations'
    },
    'celebrity_endorsement': { 
      price: 5000000, 
      boost: { revenue: 1.5, reputation: 25 },
      description: 'A-list celebrity brand endorsement'
    },
    'premium_bar': { 
      price: 1500000, 
      boost: { revenue: 1.2, reputation: 8 },
      description: 'Premium imported liquor collection',
      requires: ['liquor']
    }
  },
  
  WEEKLY_UTILITIES: {
    base: 250000, // ₦250k minimum
    per_staff: 25000, // ₦25k per staff member
    per_equipment: 15000, // ₦15k per equipment
    luxury_multiplier: 1.8 // Premium clubs pay more
  },
  
  NPC_CLUBS: [
    { name: 'Quilox Lagos', reputation: 85, weeklyRevenue: () => Math.random() * 50000000 + 20000000 },
    { name: 'Escape Nightclub', reputation: 78, weeklyRevenue: () => Math.random() * 40000000 + 15000000 },
    { name: 'Club 57', reputation: 72, weeklyRevenue: () => Math.random() * 35000000 + 10000000 },
    { name: 'Rumours Nightclub', reputation: 68, weeklyRevenue: () => Math.random() * 30000000 + 8000000 },
    { name: 'Cubana Club', reputation: 75, weeklyRevenue: () => Math.random() * 45000000 + 12000000 }
  ],

  SPONSORS: {
    'guinness': { 
      name: 'Guinness Nigeria',
      min_reputation: 70,
      weekly_bonus: 500000,
      maintenance_cost: 100000, // Weekly cost to maintain sponsorship
      description: 'Premium beer sponsorship'
    },
    'heineken': { 
      name: 'Heineken',
      min_reputation: 80,
      weekly_bonus: 800000,
      maintenance_cost: 150000,
      description: 'International beer brand endorsement'
    },
    'redbull': { 
      name: 'Red Bull',
      min_reputation: 75,
      weekly_bonus: 600000,
      maintenance_cost: 120000,
      description: 'Energy drink partnership'
    }
  }
};

// Command Handlers
async function handleClubRegister(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, {
      text: `❌ Please provide a club name!\n\n*Usage:* /club register <club_name>\n\n💰 *Registration Fee:* ₦${TYCOON_CONFIG.REGISTRATION_FEE.base.toLocaleString()}\n\n⚠️ *Warning:* This is a premium business simulation. Only serious entrepreneurs should apply!`
    });
    return;
  }
  
  const clubName = args.join(' ').trim();
  
  if (clubName.length < 3 || clubName.length > 35) {
    await sock.sendMessage(m.from, {
      text: '❌ Club name must be between 3-35 characters!'
    });
    return;
  }
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    
    // Check if user already has a club
    const existingClub = await clubsCollection.findOne({ userId });
    if (existingClub) {
      await sock.sendMessage(m.from, {
        text: '❌ You already own a nightclub empire! Use `/club info` to view your business.'
      });
      return;
    }
    
    // Check if name is already taken
    const nameExists = await clubsCollection.findOne({ 
      name: { $regex: new RegExp(`^${clubName}$`, 'i') }
    });
    
    if (nameExists) {
      await sock.sendMessage(m.from, {
        text: '❌ This club name is already taken by another entrepreneur!'
      });
      return;
    }
    
    // Check if user has enough money for premium registration
    const registrationFee = TYCOON_CONFIG.REGISTRATION_FEE.base;
    const userBalance = await PluginHelpers.getBalance(userId);
    
    if (userBalance.wallet < registrationFee) {
      await sock.sendMessage(m.from, {
        text: `❌ *INSUFFICIENT CAPITAL!*\n\n💰 *Required:* ₦${registrationFee.toLocaleString()}\n💳 *Your Wallet:* ₦${userBalance.wallet.toLocaleString()}\n💸 *Shortage:* ₦${(registrationFee - userBalance.wallet).toLocaleString()}\n\n🏪 This is a premium nightlife business simulation. Accumulate more capital before attempting to enter the industry.`
      });
      return;
    }
    
    // Deduct premium registration fee
    await unifiedUserManager.removeMoney(userId, registrationFee, 'Premium Club Registration');
    
    // Create luxury club
    const premiumClub = {
      userId,
      name: clubName,
      balance: 0,
      totalRevenue: 0,
      weeklyRevenue: 0,
      weeklyEvents: 0,
      reputation: 45, // Starting reputation for premium clubs
      equipment: [],
      staff: [],
      licenses: [],
      upgrades: [],
      violations: [],
      events: [],
      expenses: [],
      notifications: [],
      pendingAlliances: [],
      alliance: null,
      sponsors: [],
      isActive: true,
      bankruptcyRisk: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastEventAt: null,
      tier: 'premium' // Premium tier designation
    };
    
    await clubsCollection.insertOne(premiumClub);
    
    const successMsg = `🍾 *NIGHTCLUB EMPIRE ESTABLISHED!*

🏢 *Club Name:* ${clubName}
💰 *Investment:* ₦${registrationFee.toLocaleString()}
⭐ *Starting Reputation:* ${premiumClub.reputation}/100
🎯 *Tier:* Premium

🚨 *CRITICAL REQUIREMENTS:*
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⚠️  BUSINESS LICENSE MANDATORY  ⚠️         ┃
┃  Cost: ₦2,500,000/year                    ┃
┃  Without it: Daily fines + Shutdown risk  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📋 *IMMEDIATE ACTION REQUIRED:*
• \`/club license business\` - Get mandatory permit
• \`/club market\` - Browse premium equipment
• \`/club hire resident_dj\` - Hire professional staff

💡 *Welcome to Lagos nightlife elite!*`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Premium club registration error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Registration system temporarily unavailable. Please try again.'
    });
  }
}

async function handleClubInfo(m, sock, userId) {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You don\'t own a nightclub! Use `/club register <name>` to start your empire.'
      });
      return;
    }
    
    const reputation = calculateClubReputation(club);
    const workingEquipment = (club.equipment || []).filter(e => !e.broken);
    const brokenEquipment = (club.equipment || []).filter(e => e.broken);
    const activeLicenses = (club.licenses || []).filter(l => l.active);
    const expiredLicenses = (club.licenses || []).filter(l => !l.active);
    
    // Calculate weekly operational costs
    const weeklyCosts = TYCOON_CONFIG.WEEKLY_UTILITIES.base + 
      (club.staff?.length || 0) * TYCOON_CONFIG.WEEKLY_UTILITIES.per_staff +
      (club.equipment?.length || 0) * TYCOON_CONFIG.WEEKLY_UTILITIES.per_equipment;
    
    const statusIcon = club.isActive ? '🟢' : '🔴';
    const tierIcon = club.tier === 'premium' ? '👑' : '🏪';
    
    let infoMsg = `${tierIcon} *${club.name}* ${statusIcon}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *FINANCIAL STATUS*
• Club Treasury: ₦${club.balance.toLocaleString()}
• Total Revenue: ₦${club.totalRevenue.toLocaleString()}
• Weekly Revenue: ₦${club.weeklyRevenue.toLocaleString()}
• Weekly OpEx: ₦${weeklyCosts.toLocaleString()}

⭐ *REPUTATION & STATUS*
• Reputation: ${reputation}/100 ${getReputationIcon(reputation)}
• Weekly Events: ${club.weeklyEvents || 0}
• Business Status: ${club.isActive ? 'ACTIVE' : 'SUSPENDED'}`;

    if (club.bankruptcyRisk) {
      infoMsg += `\n• 🚨 *BANKRUPTCY RISK!*`;
    }

    if (club.alliance) {
      infoMsg += `\n• Alliance: ${club.alliance}`;
    }
    
    infoMsg += `\n\n🎵 *EQUIPMENT (${club.equipment?.length || 0})*`;
    if (workingEquipment.length > 0) {
      infoMsg += `\n• Operational: ${workingEquipment.length}`;
      workingEquipment.slice(0, 3).forEach(eq => {
        const config = TYCOON_CONFIG.EQUIPMENT[eq.type];
        infoMsg += `\n  - ${config?.name || eq.type} (${eq.currentDurability}%)`;
      });
      if (workingEquipment.length > 3) {
        infoMsg += `\n  - ... +${workingEquipment.length - 3} more items`;
      }
    } else {
      infoMsg += `\n• ❌ NO EQUIPMENT - Cannot host events!`;
    }
    
    if (brokenEquipment.length > 0) {
      infoMsg += `\n• 🔧 Broken: ${brokenEquipment.length} (Repair needed!)`;
    }
    
    infoMsg += `\n\n👥 *STAFF (${club.staff?.length || 0})*`;
    if (club.staff && club.staff.length > 0) {
      const weeklySalaries = club.staff.reduce((total, staff) => {
        const config = TYCOON_CONFIG.STAFF[staff.type];
        return total + (config?.salary || 0);
      }, 0);
      
      infoMsg += `\n• Weekly Salaries: ₦${weeklySalaries.toLocaleString()}`;
      club.staff.slice(0, 4).forEach(staff => {
        const config = TYCOON_CONFIG.STAFF[staff.type];
        infoMsg += `\n  - ${staff.name} (${staff.type}) - ₦${config?.salary.toLocaleString()}/wk`;
      });
      if (club.staff.length > 4) {
        infoMsg += `\n  - ... +${club.staff.length - 4} more staff`;
      }
    } else {
      infoMsg += `\n• ❌ NO STAFF - Limited operations!`;
    }
    
    infoMsg += `\n\n📋 *LICENSES*`;
    if (activeLicenses.length > 0) {
      activeLicenses.forEach(license => {
        const daysLeft = Math.ceil((new Date(license.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
        const urgency = daysLeft < 30 ? '⚠️' : '✅';
        infoMsg += `\n${urgency} ${license.type.replace(/_/g, ' ')} (${daysLeft}d)`;
      });
    }
    
    if (!activeLicenses.some(l => l.type === 'business')) {
      infoMsg += `\n🚨 *CRITICAL: NO BUSINESS LICENSE!*`;
    }
    
    if (expiredLicenses.length > 0) {
      infoMsg += `\n❌ Expired: ${expiredLicenses.length} licenses`;
    }

    infoMsg += `\n\n🤝 *SPONSORS (${club.sponsors?.length || 0})*`;
    if (club.sponsors && club.sponsors.length > 0) {
      club.sponsors.forEach(sponsor => {
        const config = TYCOON_CONFIG.SPONSORS[sponsor.type];
        infoMsg += `\n• ${config.name} - Weekly Bonus: ₦${config.weekly_bonus.toLocaleString()}`;
      });
    } else {
      infoMsg += `\n• No sponsors - Build reputation to attract!`;
    }
    
    // Recent notifications
    if (club.notifications && club.notifications.length > 0) {
      const recentNotifications = club.notifications.slice(-3);
      infoMsg += `\n\n🔔 *RECENT ALERTS*`;
      recentNotifications.forEach(notif => {
        infoMsg += `\n• ${notif.message}`;
      });
      // Clear notifications after viewing
      await clubsCollection.updateOne({ userId }, { $set: { notifications: [] } });
    }

    if (club.pendingAlliances && club.pendingAlliances.length > 0) {
      infoMsg += `\n\n📩 *PENDING ALLIANCE INVITES*`;
      club.pendingAlliances.forEach(ally => {
        infoMsg += `\n• ${ally}`;
      });
    }
    
    // Quick stats
    infoMsg += `\n\n📊 *QUICK STATS*`;
    infoMsg += `\n• Violations: ${club.violations?.length || 0}`;
    infoMsg += `\n• Upgrades: ${club.upgrades?.length || 0}`;
    infoMsg += `\n• Days Active: ${Math.ceil((new Date() - new Date(club.createdAt)) / (1000 * 60 * 60 * 24))}`;
    
    infoMsg += `\n\n💡 *NEXT ACTIONS:*`;
    if (!activeLicenses.some(l => l.type === 'business')) {
      infoMsg += `\n🔥 GET BUSINESS LICENSE IMMEDIATELY!`;
    } else if (workingEquipment.length < 3) {
      infoMsg += `\n• Buy more premium equipment`;
    } else if (club.staff.length < 2) {
      infoMsg += `\n• Hire professional staff`;
    } else {
      infoMsg += `\n• Host events to generate revenue`;
    }
    
    await sock.sendMessage(m.from, { text: infoMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club info error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Unable to retrieve club information.'
    });
  }
}

async function handleClubBuy(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, {
      text: '❌ Please specify equipment to purchase!\n\n*Usage:* /club buy <equipment_code>\n\nUse `/club market` to see available equipment with codes.'
    });
    return;
  }
  
  const equipmentCode = args[0].toLowerCase();
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You need to own a club first!'
      });
      return;
    }
    
    const equipment = TYCOON_CONFIG.EQUIPMENT[equipmentCode];
    if (!equipment) {
      await sock.sendMessage(m.from, {
        text: `❌ Equipment "${equipmentCode}" not found!\n\nUse \`/club market\` to see available equipment.`
      });
      return;
    }
    
    // Check if user has enough money
    const userBalance = await PluginHelpers.getBalance(userId);
    
    if (userBalance.wallet < equipment.price) {
      await sock.sendMessage(m.from, {
        text: `❌ *INSUFFICIENT CAPITAL!*\n\n🛍️ *${equipment.name}*\n💰 *Price:* ₦${equipment.price.toLocaleString()}\n💳 *Your Wallet:* ₦${userBalance.wallet.toLocaleString()}\n💸 *Shortage:* ₦${(equipment.price - userBalance.wallet).toLocaleString()}`
      });
      return;
    }
    
    // Check for duplicate equipment (limit premium items)
    const hasEquipment = (club.equipment || []).some(eq => eq.type === equipmentCode);
    if (hasEquipment) {
      await sock.sendMessage(m.from, {
        text: `❌ You already own ${equipment.name}!\n\nPremium equipment is limited to one per club. Focus on diversifying your setup.`
      });
      return;
    }
    
    // Purchase equipment
    await unifiedUserManager.removeMoney(userId, equipment.price, `Premium equipment: ${equipment.name}`);
    
    const newEquipment = {
      type: equipmentCode,
      name: equipment.name,
      brand: equipment.brand,
      purchasedAt: new Date(),
      currentDurability: equipment.durability,
      maxDurability: equipment.durability,
      broken: false,
      timesRepaired: 0,
      maintenanceCost: equipment.maintenance
    };
    
    await clubsCollection.updateOne(
      { userId },
      { 
        $push: { equipment: newEquipment },
        $set: { updatedAt: new Date() }
      }
    );
    
    const successMsg = `✅ *PREMIUM EQUIPMENT ACQUIRED!*

🛍️ *Item:* ${equipment.name}
🏷️ *Brand:* ${equipment.brand}
💰 *Investment:* ₦${equipment.price.toLocaleString()}
🔧 *Durability:* ${equipment.durability}
📈 *Revenue Boost:* +${Math.round((equipment.boost.revenue - 1) * 100)}%
⭐ *Reputation Boost:* +${equipment.boost.reputation}

🔧 *Maintenance Info:*
• Repair Cost: ₦${equipment.maintenance.toLocaleString()} (60% of price)
• Hire maintenance crew to reduce wear
• Regular upkeep ensures peak performance

🎊 Your club's prestige just increased significantly!`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club buy error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Equipment purchase failed.'
    });
  }
}

async function handleClubRepair(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, {
      text: '❌ Please specify equipment to repair!\n\n*Usage:* /club repair <equipment_code>'
    });
    return;
  }
  
  const equipmentCode = args[0].toLowerCase();
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You need to own a club first!'
      });
      return;
    }
    
    const equipment = club.equipment || [];
    const itemIndex = equipment.findIndex(eq => eq.type === equipmentCode);
    
    if (itemIndex === -1) {
      await sock.sendMessage(m.from, {
        text: `❌ You don't own "${equipmentCode}" equipment!`
      });
      return;
    }
    
    const item = equipment[itemIndex];
    const equipmentConfig = TYCOON_CONFIG.EQUIPMENT[equipmentCode];
    
    if (!item.broken && item.currentDurability >= item.maxDurability * 0.8) {
      await sock.sendMessage(m.from, {
        text: `❌ *${equipmentConfig?.name || equipmentCode}* is in good condition!\n\nCurrent durability: ${item.currentDurability}%\nRepair only when durability drops below 80% or equipment is broken.`
      });
      return;
    }
    
    const repairCost = item.maintenanceCost || equipmentConfig?.maintenance || Math.floor(equipmentConfig?.price * 0.6);
    const userBalance = await PluginHelpers.getBalance(userId);
    
    if (userBalance.wallet < repairCost) {
      await sock.sendMessage(m.from, {
        text: `❌ *INSUFFICIENT FUNDS FOR REPAIR!*\n\n🔧 *${equipmentConfig?.name}*\n💰 *Repair Cost:* ₦${repairCost.toLocaleString()}\n💳 *Your Wallet:* ₦${userBalance.wallet.toLocaleString()}\n\nPremium equipment requires premium maintenance costs.`
      });
      return;
    }
    
    // Professional repair service
    await unifiedUserManager.removeMoney(userId, repairCost, `Professional repair: ${equipmentConfig?.name}`);
    
    equipment[itemIndex].currentDurability = item.maxDurability;
    equipment[itemIndex].broken = false;
    equipment[itemIndex].timesRepaired = (item.timesRepaired || 0) + 1;
    equipment[itemIndex].lastRepairedAt = new Date();
    
    // Reduce max durability slightly after multiple repairs
    if (equipment[itemIndex].timesRepaired > 3) {
      equipment[itemIndex].maxDurability = Math.max(60, item.maxDurability - 5);
    }
    
    await clubsCollection.updateOne(
      { userId },
      { 
        $set: { 
          equipment: equipment,
          updatedAt: new Date()
        }
      }
    );
    
    const successMsg = `🔧 *PROFESSIONAL REPAIR COMPLETED!*

⚙️ *Equipment:* ${equipmentConfig?.name}
🏷️ *Brand:* ${equipmentConfig?.brand}
💰 *Service Cost:* ₦${repairCost.toLocaleString()}
🔧 *New Condition:* ${equipment[itemIndex].maxDurability}%
📊 *Repair History:* ${equipment[itemIndex].timesRepaired} times

✅ Your premium equipment is now operating at peak performance!

💡 *Maintenance Tips:*
• Hire maintenance crew to reduce future wear
• Regular upkeep prevents costly breakdowns
• Consider equipment replacement after 5+ repairs`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club repair error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Equipment repair service unavailable.'
    });
  }
}

async function handleClubHire(m, sock, args, userId) {
  if (args.length === 0) {
    let staffMsg = `👥 *PROFESSIONAL STAFF RECRUITMENT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    
    Object.entries(TYCOON_CONFIG.STAFF).forEach(([key, staff]) => {
      const revenueBoost = Math.round((staff.boost.revenue - 1) * 100);
      staffMsg += `💼 *${key.replace(/_/g, ' ').toUpperCase()}*\n`;
      staffMsg += `• Salary: ₦${staff.salary.toLocaleString()}/week\n`;
      staffMsg += `• Revenue Boost: +${revenueBoost}%\n`;
      if (staff.boost.reputation) staffMsg += `• Reputation: +${staff.boost.reputation}\n`;
      if (staff.requirements) staffMsg += `• Requires: ${staff.requirements.join(', ')}\n`;
      staffMsg += `• Specialty: ${staff.specialty}\n\n`;
    });
    
    staffMsg += `*Usage:* \`/club hire <staff_type>\`\n\n`;
    staffMsg += `⚠️ *HIRING TERMS:*
• 4 weeks salary paid upfront
• Maximum 2 staff per type
• Weekly salaries auto-deducted
• Professional contracts only`;
    
    await sock.sendMessage(m.from, { text: staffMsg });
    return;
  }
  
  const staffType = args[0].toLowerCase();
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You need to own a club first!'
      });
      return;
    }
    
    const staffConfig = TYCOON_CONFIG.STAFF[staffType];
    if (!staffConfig) {
      await sock.sendMessage(m.from, {
        text: `❌ Staff position "${staffType}" not available!\n\nUse \`/club hire\` to see available positions.`
      });
      return;
    }
    
    // Check staff limit
    const existingStaff = (club.staff || []).filter(s => s.type === staffType);
    if (existingStaff.length >= 2) {
      await sock.sendMessage(m.from, {
        text: `❌ Maximum staff limit reached for ${staffType}!\n\nYou can only hire 2 professionals per position. Use \`/club fire ${staffType}\` to make room.`
      });
      return;
    }
    
    // Check requirements
    if (staffConfig.requirements) {
      const missingRequirements = [];
      for (const requirement of staffConfig.requirements) {
        const hasEquipment = (club.equipment || []).some(eq => 
          eq.type === requirement && !eq.broken
        );
        const hasLicense = (club.licenses || []).some(l => 
          l.type === requirement && l.active
        );
        
        if (!hasEquipment && !hasLicense) {
          missingRequirements.push(requirement);
        }
      }
      
      if (missingRequirements.length > 0) {
        await sock.sendMessage(m.from, {
          text: `❌ *${staffType.replace(/_/g, ' ').toUpperCase()}* requires:\n\n${missingRequirements.map(req => `• ${req.replace(/_/g, ' ')}`).join('\n')}\n\nFulfill requirements before hiring professional staff.`
        });
        return;
      }
    }
    
    // Calculate hiring cost (4 weeks upfront)
    const hiringCost = staffConfig.salary * 4;
    const userBalance = await PluginHelpers.getBalance(userId);
    
    if (userBalance.wallet < hiringCost) {
      await sock.sendMessage(m.from, {
        text: `❌ *INSUFFICIENT CAPITAL FOR HIRING!*\n\n💼 *Position:* ${staffType.replace(/_/g, ' ')}\n💰 *Cost:* ₦${hiringCost.toLocaleString()} (4 weeks prepaid)\n💳 *Your Wallet:* ₦${userBalance.wallet.toLocaleString()}\n\nPremium staff require premium compensation packages.`
      });
      return;
    }
    
    // Generate professional staff member
    const professionalNames = {
      resident_dj: ['DJ Spinall', 'DJ Cuppy', 'DJ Neptune', 'DJ Kaywise', 'DJ Xclusive'],
      celebrity_bartender: ['Mixmaster Tony', 'Cocktail Queen Ada', 'Premium Paul', 'Luxury Lisa', 'Elite Emma'],
      head_bouncer: ['Security Chief Mike', 'Protection Pro Sam', 'Guardian Grace', 'Shield Steve', 'Fortress Felix'],
      maintenance_crew: ['Tech Master John', 'Engineer Expert', 'Repair Pro Rita', 'Fix-It Frank', 'Service Sarah'],
      premium_entertainer: ['Diamond Diva', 'Platinum Pearl', 'Golden Grace', 'Silver Star', 'Crystal Crown'],
      vip_hostess: ['VIP Victoria', 'Elite Ella', 'Premium Priya', 'Luxury Luna', 'Class Chloe'],
      sound_engineer: ['Audio Alex', 'Sound Sage', 'Mix Master Maya', 'Beat Boss Ben', 'Studio Star']
    };
    
    const nameList = professionalNames[staffType] || ['Professional Staff'];
    const randomName = nameList[Math.floor(Math.random() * nameList.length)];
    
    // Hire professional staff
    await unifiedUserManager.removeMoney(userId, hiringCost, `Professional hire: ${randomName}`);
    
    const newStaff = {
      type: staffType,
      name: randomName,
      hiredAt: new Date(),
      weeksHired: 4, // Prepaid weeks
      performance: Math.floor(Math.random() * 15) + 85, // 85-99% (premium staff)
      salary: staffConfig.salary,
      experience: Math.floor(Math.random() * 10) + 5, // 5-14 years experience
      specialty: staffConfig.specialty
    };
    
    await clubsCollection.updateOne(
      { userId },
      { 
        $push: { staff: newStaff },
        $set: { updatedAt: new Date() }
      }
    );
    
    const successMsg = `✅ *PROFESSIONAL STAFF HIRED!*

👤 *Name:* ${randomName}
💼 *Position:* ${staffType.replace(/_/g, ' ').toUpperCase()}
💰 *Investment:* ₦${hiringCost.toLocaleString()} (4 weeks prepaid)
📊 *Performance Rating:* ${newStaff.performance}%
🎯 *Experience:* ${newStaff.experience} years
📈 *Revenue Impact:* +${Math.round((staffConfig.boost.revenue - 1) * 100)}%

🌟 ${randomName} brings professional expertise to your club operations!

💡 *Staff Benefits:*
• Increased customer satisfaction
• Professional service standards  
• Enhanced club reputation
• Reduced operational risks

⚠️ *Weekly salary of ₦${staffConfig.salary.toLocaleString()} will be auto-deducted.*`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club hire error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Professional recruitment service unavailable.'
    });
  }
}

async function handleClubFire(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, {
      text: '❌ Please specify staff to terminate!\n\n*Usage:* /club fire <staff_type> or /club fire <staff_name>\n\nUse `/club info` to see your current staff.'
    });
    return;
  }
  
  const staffIdentifier = args.join(' ').toLowerCase();
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You need to own a club first!'
      });
      return;
    }
    
    const staff = club.staff || [];
    
    // Find staff by type or name
    const staffIndex = staff.findIndex(s => 
      s.type.toLowerCase() === staffIdentifier || 
      s.name.toLowerCase().includes(staffIdentifier)
    );
    
    if (staffIndex === -1) {
      await sock.sendMessage(m.from, {
        text: `❌ Staff member "${staffIdentifier}" not found!\n\nUse \`/club info\` to see your current staff.`
      });
      return;
    }
    
    const staffMember = staff[staffIndex];
    const staffConfig = TYCOON_CONFIG.STAFF[staffMember.type];
    
    // Calculate severance pay (2 weeks salary)
    const severancePay = staffConfig.salary * 2;
    
    // Remove staff member
    staff.splice(staffIndex, 1);
    
    await clubsCollection.updateOne(
      { userId },
      { 
        $set: { 
          staff: staff,
          updatedAt: new Date()
        },
        $inc: { balance: -severancePay } // Deduct severance from club balance
      }
    );
    
    const terminationMsg = `💼 *STAFF TERMINATION PROCESSED*

👤 *Name:* ${staffMember.name}
💼 *Position:* ${staffMember.type.replace(/_/g, ' ')}
📅 *Service Period:* ${Math.ceil((new Date() - new Date(staffMember.hiredAt)) / (1000 * 60 * 60 * 24 * 7))} weeks
💰 *Severance Pay:* ₦${severancePay.toLocaleString()}

⚠️ *Impact on Operations:*
• Lost revenue boost: -${Math.round((staffConfig.boost.revenue - 1) * 100)}%
• Reduced service quality
• Potential reputation impact

💡 You can hire new staff anytime through \`/club hire\``;

    await sock.sendMessage(m.from, { text: terminationMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club fire error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Staff termination service unavailable.'
    });
  }
}

async function handleClubHost(m, sock, args, userId) {
  if (args.length === 0) {
    let eventMsg = `🎪 *PREMIUM EVENT HOSTING*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    
    Object.entries(TYCOON_CONFIG.EVENTS).forEach(([key, event]) => {
      eventMsg += `🎉 *${key.replace(/_/g, ' ').toUpperCase()}*\n`;
      eventMsg += `• Investment: ₦${event.cost.toLocaleString()}\n`;
      eventMsg += `• Duration: ${event.duration} hours\n`;
      eventMsg += `• Min Equipment: ${event.min_equipment}\n`;
      eventMsg += `• Min Reputation: ${event.min_reputation}\n`;
      eventMsg += `• Revenue Multiplier: ${event.revenue_multiplier}x\n`;
      eventMsg += `• Licenses Required: ${event.licenses_required.join(', ')}\n`;
      if (event.requires_celebrity) eventMsg += `• 🌟 Requires Celebrity Booking\n`;
      eventMsg += `\n`;
    });
    
    eventMsg += `*Usage:* \`/club host <event_type>\`\n\n`;
    eventMsg += `⚠️ *EVENT REQUIREMENTS:*
• Sufficient equipment and staff
• Required licenses must be active
• Minimum reputation level
• Upfront investment required`;
    
    await sock.sendMessage(m.from, { text: eventMsg });
    return;
  }
  
  const eventType = args[0].toLowerCase();
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You need to own a club first!'
      });
      return;
    }
    
    const eventConfig = TYCOON_CONFIG.EVENTS[eventType];
    if (!eventConfig) {
      await sock.sendMessage(m.from, {
        text: `❌ Event type "${eventType}" not available!\n\nUse \`/club host\` to see available events.`
      });
      return;
    }
    
    // Check if club is active
    if (!club.isActive) {
      await sock.sendMessage(m.from, {
        text: '❌ Your club is currently suspended! Resolve violations and licensing issues first.'
      });
      return;
    }
    
    // Check reputation requirement
    const clubReputation = calculateClubReputation(club);
    if (clubReputation < eventConfig.min_reputation) {
      await sock.sendMessage(m.from, {
        text: `❌ *INSUFFICIENT REPUTATION!*\n\n🎪 *Event:* ${eventType.replace(/_/g, ' ')}\n⭐ *Required:* ${eventConfig.min_reputation} reputation\n📊 *Your Level:* ${clubReputation}/100\n\nBuild reputation through smaller events first.`
      });
      return;
    }
    
    // Check license requirements
    const missingLicenses = [];
    for (const licenseType of eventConfig.licenses_required) {
      const hasLicense = (club.licenses || []).some(l => 
        l.type === licenseType && l.active
      );
      if (!hasLicense) {
        missingLicenses.push(licenseType);
      }
    }
    
    if (missingLicenses.length > 0) {
      await sock.sendMessage(m.from, {
        text: `❌ *MISSING REQUIRED LICENSES!*\n\n${missingLicenses.map(license => `• ${license.replace(/_/g, ' ')}`).join('\n')}\n\nObtain all licenses before hosting this event type.`
      });
      return;
    }
    
    // Check equipment requirements
    const workingEquipment = (club.equipment || []).filter(e => !e.broken);
    if (workingEquipment.length < eventConfig.min_equipment) {
      await sock.sendMessage(m.from, {
        text: `❌ *INSUFFICIENT EQUIPMENT!*\n\n🎪 *Event:* ${eventType.replace(/_/g, ' ')}\n🛍️ *Required:* ${eventConfig.min_equipment} working equipment\n⚙️ *Available:* ${workingEquipment.length}\n\n• Buy more premium equipment\n• Repair broken equipment`
      });
      return;
    }
    
    // Check if requires celebrity booking
    if (eventConfig.requires_celebrity) {
      await sock.sendMessage(m.from, {
        text: `❌ *CELEBRITY CONCERT REQUIRES BOOKING!*\n\n🌟 This event type requires a celebrity performer.\n\nUse \`/club celebrity <celebrity_code>\` to book an artist first, then the concert will happen automatically.`
      });
      return;
    }
    
    // Check funding
    const userBalance = await PluginHelpers.getBalance(userId);
    if (userBalance.wallet < eventConfig.cost) {
      await sock.sendMessage(m.from, {
        text: `❌ *INSUFFICIENT EVENT FUNDING!*\n\n🎪 *Event:* ${eventType.replace(/_/g, ' ')}\n💰 *Cost:* ₦${eventConfig.cost.toLocaleString()}\n💳 *Your Wallet:* ₦${userBalance.wallet.toLocaleString()}\n\nSecure additional capital for premium event hosting.`
      });
      return;
    }
    
    // Host the event
    await unifiedUserManager.removeMoney(userId, eventConfig.cost, `Event hosting: ${eventType}`);
    
    const eventRevenue = calculateEventRevenue(club, eventConfig);
    const netProfit = eventRevenue - eventConfig.cost;
    const personalIncome = Math.floor(eventRevenue * 0.35); // 35% to user wallet
    
    // Add random risk
    const riskChance = Math.random();
    if (riskChance < 0.1) { // 10% chance of failure
      const loss = Math.floor(eventRevenue * 0.5);
      const reputationLoss = 10;
      await clubsCollection.updateOne(
        { userId },
        { 
          $inc: { 
            balance: -loss,
            reputation: -reputationLoss
          },
          $push: { 
            events: {
              type: 'event_failure',
              title: '🚨 Event Failure!',
              description: `The ${eventType} event at ${club.name} failed due to unexpected issues!`,
              impact: { balance: -loss, reputation: -reputationLoss },
              timestamp: new Date()
            }
          }
        }
      );
      await sock.sendMessage(m.from, { text: `🚨 *EVENT FAILURE!* The event encountered issues. Loss: ₦${loss.toLocaleString()}, Reputation: -${reputationLoss}` });
      return;
    }
    
    // Update club stats
    await clubsCollection.updateOne(
      { userId },
      { 
        $inc: { 
          balance: eventRevenue,
          totalRevenue: eventRevenue,
          weeklyRevenue: eventRevenue,
          weeklyEvents: 1
        },
        $set: { lastEventAt: new Date() },
        $push: { 
          events: {
            type: eventType,
            title: `🎪 ${eventType.replace(/_/g, ' ')} Success`,
            description: `Successfully hosted ${eventType.replace(/_/g, ' ')} at ${club.name}`,
            cost: eventConfig.cost,
            revenue: eventRevenue,
            profit: netProfit,
            timestamp: new Date()
          }
        }
      }
    );
    
    // Give user personal income
    await unifiedUserManager.addMoney(userId, personalIncome, `Event profits: ${eventType}`);
    
    // Random equipment stress during large events
    if (eventConfig.cost > 1000000 && Math.random() < 0.15) {
      const randomEquipment = workingEquipment[Math.floor(Math.random() * workingEquipment.length)];
      const stressDamage = Math.floor(Math.random() * 15 + 5);
      randomEquipment.currentDurability = Math.max(0, randomEquipment.currentDurability - stressDamage);
      
      if (randomEquipment.currentDurability <= 0) {
        randomEquipment.broken = true;
      }
      
      const updatedEquipment = club.equipment.map(e => 
        e.type === randomEquipment.type ? randomEquipment : e
      );
      
      await clubsCollection.updateOne(
        { userId },
        { $set: { equipment: updatedEquipment } }
      );
      await sock.sendMessage(m.from, { text: `⚠️ Equipment stress: ${randomEquipment.name} durability reduced by ${stressDamage}%` });
    }
    
    // Calculate reputation gain based on event success
    const reputationGain = Math.floor((eventRevenue / eventConfig.cost) * 3); // Better events = more reputation
    await clubsCollection.updateOne(
      { userId },
      { $inc: { reputation: reputationGain } }
    );
    
    const successMsg = `🎊 *PREMIUM EVENT SUCCESS!*

🎪 *Event:* ${eventType.replace(/_/g, ' ').toUpperCase()}
💰 *Investment:* ₦${eventConfig.cost.toLocaleString()}
📈 *Total Revenue:* ₦${eventRevenue.toLocaleString()}
💵 *Net Profit:* ₦${netProfit.toLocaleString()}
💳 *Your Share:* ₦${personalIncome.toLocaleString()}
⭐ *Reputation Gain:* +${reputationGain}
⏰ *Duration:* ${eventConfig.duration} hours

${netProfit > eventConfig.cost ? '🍾 MASSIVE SUCCESS! Your club is the talk of Lagos!' : netProfit > 0 ? '🎉 Profitable event! Building your empire steadily.' : '📊 Break-even event. Consider upgrading equipment and staff.'}

📊 *Event Impact:*
• Customer satisfaction boost
• Industry recognition
• Media coverage value
• Network expansion opportunities`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club host error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Event hosting system temporarily unavailable.'
    });
  }
}

async function handleCelebrityBooking(m, sock, args, userId) {
  if (args.length === 0) {
    let celebrityMsg = `🌟 *NIGERIAN CELEBRITY BOOKINGS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    
    Object.entries(TYCOON_CONFIG.NIGERIAN_CELEBRITIES).forEach(([key, celeb]) => {
      celebrityMsg += `🎤 *${celeb.name}*\n`;
      celebrityMsg += `• Fee: ₦${celeb.fee.toLocaleString()}\n`;
      celebrityMsg += `• Reputation Boost: +${celeb.reputation_boost}\n`;
      celebrityMsg += `• Revenue Multiplier: ${celeb.revenue_multiplier}x\n`;
      celebrityMsg += `• Requirements: ${celeb.requirements.join(', ')}\n`;
      celebrityMsg += `• No-show Risk: ${Math.round(celeb.no_show_chance * 100)}%\n`;
      celebrityMsg += `• Code: \`${key}\`\n\n`;
    });
    
    celebrityMsg += `⚠️ *BOOKING TERMS:*
• Full payment required upfront
• Equipment requirements must be met
• No refunds for no-shows
• Scandal risk varies by celebrity\n\n`;
    celebrityMsg += `*Usage:* \`/club celebrity <celebrity_code>\``;
    
    await sock.sendMessage(m.from, { text: celebrityMsg });
    return;
  }
  
  const celebrityCode = args[0].toLowerCase();
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You need a club to book celebrities!'
      });
      return;
    }
    
    const celebrity = TYCOON_CONFIG.NIGERIAN_CELEBRITIES[celebrityCode];
    if (!celebrity) {
      await sock.sendMessage(m.from, {
        text: `❌ Celebrity "${celebrityCode}" not found!\n\nUse \`/club celebrity\` to see available artists.`
      });
      return;
    }
    
    // Check club reputation requirement
    const clubReputation = calculateClubReputation(club);
    const minReputation = celebrity.fee > 15000000 ? 85 : celebrity.fee > 10000000 ? 70 : 50;
    
    if (clubReputation < minReputation) {
      await sock.sendMessage(m.from, {
        text: `❌ *${celebrity.name}* requires clubs with ${minReputation}+ reputation!\n\nYour reputation: ${clubReputation}/100\nBuild your reputation by hosting successful events.`
      });
      return;
    }
    
    // Check equipment requirements
    const missingEquipment = [];
    for (const requirement of celebrity.requirements) {
      const hasEquipment = (club.equipment || []).some(eq => 
        eq.type === requirement && !eq.broken
      );
      const hasLicense = (club.licenses || []).some(l => 
        l.type === requirement && l.active
      );
      
      if (!hasEquipment && !hasLicense) {
        missingEquipment.push(requirement);
      }
    }
    
    if (missingEquipment.length > 0) {
      await sock.sendMessage(m.from, {
        text: `❌ *${celebrity.name}* requires specific equipment/licenses:\n\n*Missing:*\n${missingEquipment.map(req => `• ${req.replace(/_/g, ' ')}`).join('\n')}\n\nFulfill all requirements before booking.`
      });
      return;
    }
    
    // Check if user can afford the booking
    const userBalance = await PluginHelpers.getBalance(userId);
    const totalCost = celebrity.fee;
    
    if (userBalance.wallet < totalCost) {
      await sock.sendMessage(m.from, {
        text: `❌ *INSUFFICIENT FUNDS!*\n\n💰 *${celebrity.name} Fee:* ₦${totalCost.toLocaleString()}\n💳 *Your Wallet:* ₦${userBalance.wallet.toLocaleString()}\n💸 *Shortage:* ₦${(totalCost - userBalance.wallet).toLocaleString()}\n\n🏦 Secure additional funding before booking A-list talent.`
      });
      return;
    }
    
    // Process celebrity booking
    await unifiedUserManager.removeMoney(userId, totalCost, `Celebrity booking: ${celebrity.name}`);
    
    // Check for no-show (random chance)
    const noShow = Math.random() < celebrity.no_show_chance;
    
    if (noShow) {
      // Celebrity didn't show up - lose money and reputation
      const reputationLoss = Math.floor(celebrity.reputation_boost * 0.3);
      
      await clubsCollection.updateOne(
        { userId },
        { 
          $inc: { reputation: -reputationLoss },
          $push: { 
            events: {
              type: 'celebrity_no_show',
              title: '💔 Celebrity No-Show!',
              description: `${celebrity.name} failed to show up for the booked performance!`,
              impact: { 
                balance: -totalCost, 
                reputation: -reputationLoss 
              },
              celebrity: celebrityCode,
              timestamp: new Date()
            }
          }
        }
      );
      
      const noShowMsg = `💔 *CELEBRITY NO-SHOW DISASTER!*

🎤 *Artist:* ${celebrity.name}
💸 *Lost Investment:* ₦${totalCost.toLocaleString()}
📉 *Reputation Loss:* -${reputationLoss} points
😡 *Customer Refunds:* Required

🚨 This is the risk of booking A-list talent. Your reputation and money are gone, but you can rebuild!

💡 *Recovery Tips:*
• Host smaller events to rebuild reputation
• Save money for backup bookings
• Consider less risky artists`;

      await sock.sendMessage(m.from, { text: noShowMsg });
      return;
    }
    
    // Successful celebrity performance
    const eventRevenue = calculateEventRevenue(club, TYCOON_CONFIG.EVENTS.celebrity_concert, celebrity.revenue_multiplier);
    const netProfit = eventRevenue - totalCost;
    const reputationGain = celebrity.reputation_boost;
    
    // Add revenue to club and user wallet
    await clubsCollection.updateOne(
      { userId },
      { 
        $inc: { 
          balance: eventRevenue,
          totalRevenue: eventRevenue,
          weeklyRevenue: eventRevenue,
          weeklyEvents: 1,
          reputation: reputationGain
        },
        $set: { lastEventAt: new Date() },
        $push: { 
          events: {
            type: 'celebrity_concert',
            title: '🌟 Celebrity Concert Success!',
            description: `${celebrity.name} performed at ${club.name}!`,
            impact: { 
              balance: netProfit, 
              reputation: reputationGain 
            },
            celebrity: celebrityCode,
            revenue: eventRevenue,
            timestamp: new Date()
          }
        }
      }
    );
    
    // Give user 40% of revenue as personal income
    const personalIncome = Math.floor(eventRevenue * 0.4);
    await unifiedUserManager.addMoney(userId, personalIncome, `Celebrity concert profits: ${celebrity.name}`);
    
    // Check for scandal risk
    const scandal = Math.random() < celebrity.scandal_risk;
    let scandalMsg = '';
    
    if (scandal) {
      const scandalLoss = Math.floor(reputationGain * 0.4);
      await clubsCollection.updateOne(
        { userId },
        { $inc: { reputation: -scandalLoss } }
      );
      scandalMsg = `\n\n⚠️ *SCANDAL ALERT!*\n${celebrity.name} involved in controversy after the show!\nReputation loss: -${scandalLoss} points`;
    }
    
    const successMsg = `🍾 *CELEBRITY CONCERT SUCCESS!*

🎤 *Artist:* ${celebrity.name}
💰 *Investment:* ₦${totalCost.toLocaleString()}
📈 *Total Revenue:* ₦${eventRevenue.toLocaleString()}
💵 *Net Profit:* ₦${netProfit.toLocaleString()}
💳 *Your Share:* ₦${personalIncome.toLocaleString()}
⭐ *Reputation Gain:* +${reputationGain} points

🎊 Your club is now the talk of Lagos! This performance will be remembered for years.${scandalMsg}

📊 *Performance Impact:*
• Massive media coverage
• Celebrity endorsement value
• Premium customer attraction
• Industry recognition`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Celebrity booking error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Celebrity booking system temporarily unavailable.'
    });
  }
}

async function handleClubBillboard(m, sock, userId) {
  try {
    const billboardCollection = await getCollection('club_billboard');
    const latestBillboard = await billboardCollection.findOne({}, { sort: { updatedAt: -1 } });
    
    if (!latestBillboard) {
      await sock.sendMessage(m.from, { text: '❌ No billboard data available yet!' });
      return;
    }
    
    let billboardMsg = `📊 *LAGOS NIGHTLIFE BILLBOARD*
Week ${latestBillboard.week} / ${latestBillboard.year}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Top Clubs by Weekly Revenue:\n\n`;
    
    latestBillboard.topClubs.forEach(club => {
      const isNPC = club.isNPC ? '(NPC)' : `(Owner: @${club.owner})`;
      billboardMsg += `🏆 #${club.rank} - ${club.name} ${isNPC}\n`;
      billboardMsg += `• Revenue: ₦${club.weeklyRevenue.toLocaleString()}\n`;
      billboardMsg += `• Reputation: ${club.reputation}\n`;
      billboardMsg += `• Events: ${club.events}\n\n`;
    });
    
    billboardMsg += `💡 Updated every Sunday. Host more events to climb the ranks!`;
    
    await sock.sendMessage(m.from, { text: billboardMsg });
  } catch (error) {
    console.error(chalk.red('❌ Billboard error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Unable to fetch billboard.' });
  }
}

async function handleClubMarket(m, sock, userId) {
  try {
    let marketMsg = `🛍️ *PREMIUM EQUIPMENT MARKET*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔊 *PROFESSIONAL SOUND SYSTEMS*`;
    
    Object.entries(TYCOON_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === 'sound') {
        const revenueBoost = Math.round((item.boost.revenue - 1) * 100);
        marketMsg += `\n\n💎 *${item.name}*`;
        marketMsg += `\n• Brand: ${item.brand}`;
        marketMsg += `\n• Price: ₦${item.price.toLocaleString()}`;
        marketMsg += `\n• Revenue Boost: +${revenueBoost}%`;
        marketMsg += `\n• Reputation: +${item.boost.reputation}`;
        marketMsg += `\n• Code: \`${key}\``;
      }
    });
    
    marketMsg += `\n\n💡 *PROFESSIONAL LIGHTING*`;
    Object.entries(TYCOON_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === 'lighting' || item.category === 'visual') {
        const revenueBoost = Math.round((item.boost.revenue - 1) * 100);
        marketMsg += `\n\n✨ *${item.name}*`;
        marketMsg += `\n• Brand: ${item.brand}`;
        marketMsg += `\n• Price: ₦${item.price.toLocaleString()}`;
        marketMsg += `\n• Revenue Boost: +${revenueBoost}%`;
        marketMsg += `\n• Reputation: +${item.boost.reputation}`;
        if (item.special) marketMsg += `\n• ⭐ Celebrity Requirement`;
        marketMsg += `\n• Code: \`${key}\``;
      }
    });
    
    marketMsg += `\n\n🪑 *LUXURY FURNITURE & SECURITY*`;
    Object.entries(TYCOON_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === 'furniture' || item.category === 'security') {
        const revenueBoost = Math.round((item.boost.revenue - 1) * 100);
        marketMsg += `\n\n🏆 *${item.name}*`;
        marketMsg += `\n• Brand: ${item.brand}`;
        marketMsg += `\n• Price: ₦${item.price.toLocaleString()}`;
        marketMsg += `\n• Revenue Boost: +${revenueBoost}%`;
        marketMsg += `\n• Code: \`${key}\``;
      }
    });
    
    marketMsg += `\n\n👥 *PROFESSIONAL STAFF*`;
    Object.entries(TYCOON_CONFIG.STAFF).forEach(([key, staff]) => {
      const revenueBoost = Math.round((staff.boost.revenue - 1) * 100);
      marketMsg += `\n• ${key.replace(/_/g, ' ')}: ₦${staff.salary.toLocaleString()}/week (+${revenueBoost}%)`;
    });
    
    marketMsg += `\n\n*Usage:*`;
    marketMsg += `\n• \`/club buy <equipment_code>\``;
    marketMsg += `\n• \`/club hire <staff_type>\``;
    marketMsg += `\n\n⚠️ *All prices are premium tier. Repairs cost 60% of original price.*`;
    
    await sock.sendMessage(m.from, { text: marketMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club market error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Market system temporarily unavailable.'
    });
  }
}

async function handleClubCompete(m, sock, args, userId) {
  if (args.length === 0) {
    let npcMsg = `🏆 *CLUB COMPETITION ARENA*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Challenge NPC clubs to DJ battles or event contests!

Available Targets:
${TYCOON_CONFIG.NPC_CLUBS.map(npc => `• ${npc.name} (Rep: ${npc.reputation})`).join('\n')}

*Usage:* /club compete <target_name>

💰 Cost: ₦1,000,000
📈 Win: +10 Rep, ₦2,000,000
📉 Lose: -5 Rep`;

    await sock.sendMessage(m.from, { text: npcMsg });
    return;
  }

  const targetName = args.join(' ');
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, { text: '❌ You need a club to compete!' });
      return;
    }

    let targetClub = await clubsCollection.findOne({ name: { $regex: new RegExp(`^${targetName}$`, 'i') } });
    let isNPC = false;

    if (!targetClub) {
      const npc = TYCOON_CONFIG.NPC_CLUBS.find(n => n.name.toLowerCase() === targetName.toLowerCase());
      if (!npc) {
        await sock.sendMessage(m.from, { text: `❌ Target club "${targetName}" not found!` });
        return;
      }
      targetClub = npc;
      isNPC = true;
    }

    const competeCost = 1000000;
    const userBalance = await PluginHelpers.getBalance(userId);

    if (userBalance.wallet < competeCost) {
      await sock.sendMessage(m.from, { text: `❌ Insufficient funds for competition! Cost: ₦${competeCost.toLocaleString()}` });
      return;
    }

    await unifiedUserManager.removeMoney(userId, competeCost, `Competition vs ${targetName}`);

    const clubRep = calculateClubReputation(club);
    const targetRep = targetClub.reputation;

    const winChance = clubRep / (clubRep + targetRep);
    const win = Math.random() < winChance;

    if (win) {
      const reward = 2000000;
      const repGain = 10;
      await clubsCollection.updateOne({ userId }, { $inc: { balance: reward, reputation: repGain } });
      const msg = `🏆 *COMPETITION VICTORY!*\n\nDefeated ${targetName}\n💰 Reward: ₦${reward.toLocaleString()}\n⭐ Rep: +${repGain}`;
      await sock.sendMessage(m.from, { text: msg });
      if (!isNPC) {
        targetClub.notifications.push({ message: `Lost competition to ${club.name}. Rep -5` });
        await clubsCollection.updateOne({ name: targetName }, { $inc: { reputation: -5 }, $set: { notifications: targetClub.notifications } });
      }
    } else {
      const repLoss = 5;
      await clubsCollection.updateOne({ userId }, { $inc: { reputation: -repLoss } });
      const msg = `😞 *COMPETITION DEFEAT!*\n\nLost to ${targetName}\n⭐ Rep: -${repLoss}`;
      await sock.sendMessage(m.from, { text: msg });
      if (!isNPC) {
        targetClub.notifications.push({ message: `Won competition vs ${club.name}. Rep +5` });
        await clubsCollection.updateOne({ name: targetName }, { $inc: { reputation: 5 }, $set: { notifications: targetClub.notifications } });
      }
    }
  } catch (error) {
    console.error(chalk.red('❌ Compete error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Competition failed.' });
  }
}

async function handleClubSabotage(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, { text: '❌ Specify target club!\n\n*Usage:* /club sabotage <target_name>\n\n💰 Cost: ₦2,000,000\nRisk: 20% backfire' });
    return;
  }

  const targetName = args.join(' ');
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, { text: '❌ You need a club to sabotage!' });
      return;
    }

    const targetClub = await clubsCollection.findOne({ name: { $regex: new RegExp(`^${targetName}$`, 'i') } });

    if (!targetClub) {
      await sock.sendMessage(m.from, { text: `❌ Target club "${targetName}" not found!` });
      return;
    }

    if (targetClub.userId === userId) {
      await sock.sendMessage(m.from, { text: '❌ Cannot sabotage your own club!' });
      return;
    }

    const sabotageCost = 2000000;
    const userBalance = await PluginHelpers.getBalance(userId);

    if (userBalance.wallet < sabotageCost) {
      await sock.sendMessage(m.from, { text: `❌ Insufficient funds for sabotage! Cost: ₦${sabotageCost.toLocaleString()}` });
      return;
    }

    await unifiedUserManager.removeMoney(userId, sabotageCost, `Sabotage vs ${targetName}`);

    const backfireChance = club.alliance === targetClub.alliance ? 0.5 : 0.2; // Higher risk if same alliance
    const backfire = Math.random() < backfireChance;

    if (backfire) {
      const repLoss = 15;
      await clubsCollection.updateOne({ userId }, { $inc: { reputation: -repLoss } });
      await sock.sendMessage(m.from, { text: `🔥 *SABOTAGE BACKFIRE!*\n\nDetected! Reputation -${repLoss}` });
      targetClub.notifications.push({ message: `Sabotage attempt by ${club.name} failed. Gained rep +5` });
      await clubsCollection.updateOne({ name: targetName }, { $inc: { reputation: 5 }, $set: { notifications: targetClub.notifications } });
    } else {
      const repLossTarget = 10;
      targetClub.notifications.push({ message: `Sabotaged by unknown! Reputation -${repLossTarget}` });
      await clubsCollection.updateOne({ name: targetName }, { $inc: { reputation: -repLossTarget }, $set: { notifications: targetClub.notifications } });
      await sock.sendMessage(m.from, { text: `🕵️ *SABOTAGE SUCCESS!*\n\n${targetName} reputation reduced by ${repLossTarget}` });
    }
  } catch (error) {
    console.error(chalk.red('❌ Sabotage error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Sabotage failed.' });
  }
}

async function handleClubTakeover(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, { text: '❌ Specify target club!\n\n*Usage:* /club takeover <target_name>\n\nRequirements: Target low rep/bankrupt, Cost: ₦5,000,000' });
    return;
  }

  const targetName = args.join(' ');
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, { text: '❌ You need a club to takeover!' });
      return;
    }

    const targetClub = await clubsCollection.findOne({ name: { $regex: new RegExp(`^${targetName}$`, 'i') } });

    if (!targetClub) {
      await sock.sendMessage(m.from, { text: `❌ Target club "${targetName}" not found!` });
      return;
    }

    if (targetClub.userId === userId) {
      await sock.sendMessage(m.from, { text: '❌ Cannot takeover your own club!' });
      return;
    }

    const targetRep = calculateClubReputation(targetClub);
    if (targetRep > 30 || targetClub.balance > 0) {
      await sock.sendMessage(m.from, { text: '❌ Target club is too strong for takeover!' });
      return;
    }

    const takeoverCost = 5000000;
    const userBalance = await PluginHelpers.getBalance(userId);

    if (userBalance.wallet < takeoverCost) {
      await sock.sendMessage(m.from, { text: `❌ Insufficient funds for takeover! Cost: ₦${takeoverCost.toLocaleString()}` });
      return;
    }

    await unifiedUserManager.removeMoney(userId, takeoverCost, `Takeover of ${targetName}`);

    // Transfer assets
    club.equipment = [...club.equipment, ...targetClub.equipment];
    club.staff = [...club.staff, ...targetClub.staff];
    club.balance += Math.max(0, targetClub.balance);
    club.reputation += 20; // Gain rep for takeover

    await clubsCollection.updateOne({ userId }, { $set: { equipment: club.equipment, staff: club.staff, balance: club.balance, reputation: club.reputation } });
    await clubsCollection.deleteOne({ name: targetName });

    await sock.sendMessage(m.from, { text: `🏰 *TAKEOVER SUCCESS!*\n\nAcquired ${targetName}. Gained assets and +20 rep.` });
  } catch (error) {
    console.error(chalk.red('❌ Takeover error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Takeover failed.' });
  }
}

async function handleClubLicense(m, sock, args, userId) {
  if (args.length === 0) {
    let licenseMsg = `📋 *GOVERNMENT LICENSING AUTHORITY*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    
    Object.entries(TYCOON_CONFIG.LICENSES).forEach(([key, license]) => {
      const required = license.required ? ' 🚨 *MANDATORY*' : '';
      licenseMsg += `🏛️ *${key.replace(/_/g, ' ').toUpperCase()}*${required}\n`;
      licenseMsg += `• Fee: ₦${license.price.toLocaleString()}\n`;
      licenseMsg += `• Duration: ${license.duration} days\n`;
      licenseMsg += `• ${license.description}\n`;
      if (license.enables) licenseMsg += `• Enables: ${license.enables.join(', ')}\n`;
      if (license.penalties) {
        licenseMsg += `• Violations: ₦${license.penalties.daily_fine || 0}/day fine\n`;
      }
      licenseMsg += `\n`;
    });
    
    licenseMsg += `*Usage:* \`/club license <license_type>\`\n\n`;
    licenseMsg += `⚠️ *COMPLIANCE WARNING:*
• Business license is mandatory for all operations
• Operating without licenses incurs daily fines
• Repeat violations can lead to shutdown
• Renew licenses before expiration`;
    
    await sock.sendMessage(m.from, { text: licenseMsg });
    return;
  }
  
  const licenseType = args[0].toLowerCase();
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You need to own a club first!'
      });
      return;
    }
    
    const licenseConfig = TYCOON_CONFIG.LICENSES[licenseType];
    if (!licenseConfig) {
      await sock.sendMessage(m.from, {
        text: `❌ License type "${licenseType}" not available!\n\nUse \`/club license\` to see available licenses.`
      });
      return;
    }
    
    // Check if already has active license
    const existingLicense = (club.licenses || []).find(l => 
      l.type === licenseType && l.active
    );
    
    if (existingLicense) {
      const daysLeft = Math.ceil((new Date(existingLicense.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
      await sock.sendMessage(m.from, {
        text: `❌ You already have an active ${licenseType.replace(/_/g, ' ')} license!\n\n📅 *Expires in:* ${daysLeft} days\n\nLet it expire naturally before purchasing a renewal.`
      });
      return;
    }
    
    const userBalance = await PluginHelpers.getBalance(userId);
    
    if (userBalance.wallet < licenseConfig.price) {
      await sock.sendMessage(m.from, {
        text: `❌ *INSUFFICIENT FUNDS FOR LICENSE!*\n\n📋 *License:* ${licenseType.replace(/_/g, ' ')}\n💰 *Fee:* ₦${licenseConfig.price.toLocaleString()}\n💳 *Your Wallet:* ₦${userBalance.wallet.toLocaleString()}\n\nGovernment licensing fees are non-negotiable.`
      });
      return;
    }
    
    // Purchase license
    await unifiedUserManager.removeMoney(userId, licenseConfig.price, `Government license: ${licenseType}`);
    
    const newLicense = {
      type: licenseType,
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + licenseConfig.duration * 24 * 60 * 60 * 1000),
      active: true,
      fee: licenseConfig.price,
      authority: 'Lagos State Government'
    };
    
    await clubsCollection.updateOne(
      { userId },
      { 
        $push: { licenses: newLicense },
        $set: { updatedAt: new Date() }
      }
    );
    
    let complianceStatus = '';
    if (licenseType === 'business') {
      complianceStatus = '\n🎊 *Your club can now operate legally!*\n✅ Daily violation fines have stopped.';
    }
    
    const successMsg = `✅ *GOVERNMENT LICENSE ISSUED!*

📋 *Type:* ${licenseType.replace(/_/g, ' ').toUpperCase()}
💰 *Fee:* ₦${licenseConfig.price.toLocaleString()}
📅 *Duration:* ${licenseConfig.duration} days
🏛️ *Authority:* Lagos State Government

${licenseConfig.description}

${complianceStatus}

💡 Renew before expiration to avoid fines!`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ License error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ License purchase failed.' });
  }
}

async function handleClubUpgrade(m, sock, args, userId) {
  if (args.length === 0) {
    let upgradeMsg = `🔝 *CLUB UPGRADES*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    
    Object.entries(TYCOON_CONFIG.UPGRADES).forEach(([key, upgrade]) => {
      const revenueBoost = Math.round((upgrade.boost.revenue - 1) * 100) || 0;
      upgradeMsg += `🏆 *${key.replace(/_/g, ' ').toUpperCase()}*\n`;
      upgradeMsg += `• Price: ₦${upgrade.price.toLocaleString()}\n`;
      upgradeMsg += `• Revenue Boost: +${revenueBoost}%\n`;
      if (upgrade.boost.reputation) upgradeMsg += `• Reputation: +${upgrade.boost.reputation}\n`;
      if (upgrade.requires) upgradeMsg += `• Requires: ${upgrade.requires.join(', ')}\n`;
      upgradeMsg += `• ${upgrade.description}\n\n`;
    });
    
    upgradeMsg += `*Usage:* \`/club upgrade <upgrade_type>\`\n\n`;
    upgradeMsg += `⚠️ *UPGRADE RULES:*
• One per type
• Permanent improvements
• Some have requirements`;

    await sock.sendMessage(m.from, { text: upgradeMsg });
    return;
  }

  const upgradeType = args[0].toLowerCase();
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, { text: '❌ You need a club to upgrade!' });
      return;
    }

    const upgradeConfig = TYCOON_CONFIG.UPGRADES[upgradeType];
    if (!upgradeConfig) {
      await sock.sendMessage(m.from, { text: `❌ Upgrade "${upgradeType}" not available!` });
      return;
    }

    if ((club.upgrades || []).some(u => u.type === upgradeType)) {
      await sock.sendMessage(m.from, { text: `❌ Already have this upgrade!` });
      return;
    }

    if (upgradeConfig.requires) {
      const missing = upgradeConfig.requires.filter(req => !club.licenses.some(l => l.type === req && l.active));
      if (missing.length > 0) {
        await sock.sendMessage(m.from, { text: `❌ Missing requirements: ${missing.join(', ')}` });
        return;
      }
    }

    const userBalance = await PluginHelpers.getBalance(userId);

    if (userBalance.wallet < upgradeConfig.price) {
      await sock.sendMessage(m.from, { text: `❌ Insufficient funds! Price: ₦${upgradeConfig.price.toLocaleString()}` });
      return;
    }

    await unifiedUserManager.removeMoney(userId, upgradeConfig.price, `Upgrade: ${upgradeType}`);

    const newUpgrade = {
      type: upgradeType,
      purchasedAt: new Date()
    };

    await clubsCollection.updateOne(
      { userId },
      { $push: { upgrades: newUpgrade } }
    );

    await sock.sendMessage(m.from, { text: `✅ *UPGRADE INSTALLED!*\n\n${upgradeConfig.description}\n💰 Cost: ₦${upgradeConfig.price.toLocaleString()}` });
  } catch (error) {
    console.error(chalk.red('❌ Upgrade error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Upgrade failed.' });
  }
}

async function handleClubLeaderboard(m, sock, userId) {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const topClubs = await clubsCollection.find({}).sort({ totalRevenue: -1 }).limit(10).toArray();

    let leaderboardMsg = `🏅 *ALL-TIME LEADERBOARD*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Top Clubs by Total Revenue:\n\n`;

    topClubs.forEach((club, index) => {
      leaderboardMsg += `🏆 #${index + 1} - ${club.name} (@${club.userId.split('@')[0]})\n`;
      leaderboardMsg += `• Revenue: ₦${club.totalRevenue.toLocaleString()}\n`;
      leaderboardMsg += `• Rep: ${calculateClubReputation(club)}\n\n`;
    });

    await sock.sendMessage(m.from, { text: leaderboardMsg });
  } catch (error) {
    console.error(chalk.red('❌ Leaderboard error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Unable to fetch leaderboard.' });
  }
}

async function handleClubAlliance(m, sock, args, userId) {
  if (args.length < 2) {
    await sock.sendMessage(m.from, { text: '❌ Usage: /club alliance <action> <arg>\nActions: form <name>, invite <club_name>, accept <alliance_name>, leave' });
    return;
  }

  const action = args[0].toLowerCase();
  const arg = args.slice(1).join(' ');

  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, { text: '❌ You need a club for alliances!' });
      return;
    }

    if (action === 'form') {
      if (club.alliance) {
        await sock.sendMessage(m.from, { text: '❌ Already in an alliance!' });
        return;
      }
      club.alliance = arg;
      await clubsCollection.updateOne({ userId }, { $set: { alliance: arg } });
      await sock.sendMessage(m.from, { text: `✅ Alliance "${arg}" formed!` });
    } else if (action === 'invite') {
      if (!club.alliance) {
        await sock.sendMessage(m.from, { text: '❌ Form an alliance first!' });
        return;
      }
      const targetClub = await clubsCollection.findOne({ name: { $regex: new RegExp(`^${arg}$`, 'i') } });
      if (!targetClub) {
        await sock.sendMessage(m.from, { text: `❌ Club "${arg}" not found!` });
        return;
      }
      targetClub.pendingAlliances.push(club.alliance);
      await clubsCollection.updateOne({ name: arg }, { $set: { pendingAlliances: targetClub.pendingAlliances } });
      await sock.sendMessage(m.from, { text: `📩 Invite sent to ${arg}!` });
    } else if (action === 'accept') {
      const index = club.pendingAlliances.indexOf(arg);
      if (index === -1) {
        await sock.sendMessage(m.from, { text: `❌ No pending invite for "${arg}"!` });
        return;
      }
      club.pendingAlliances.splice(index, 1);
      club.alliance = arg;
      await clubsCollection.updateOne({ userId }, { $set: { alliance: arg, pendingAlliances: club.pendingAlliances } });
      await sock.sendMessage(m.from, { text: `✅ Joined alliance "${arg}"!` });
    } else if (action === 'leave') {
      if (!club.alliance) {
        await sock.sendMessage(m.from, { text: '❌ Not in an alliance!' });
        return;
      }
      club.alliance = null;
      await clubsCollection.updateOne({ userId }, { $set: { alliance: null } });
      await sock.sendMessage(m.from, { text: `✅ Left alliance!` });
    } else {
      await sock.sendMessage(m.from, { text: '❌ Invalid action!' });
    }
  } catch (error) {
    console.error(chalk.red('❌ Alliance error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Alliance operation failed.' });
  }
}

async function handleClubSponsors(m, sock, userId) {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, { text: '❌ You need a club for sponsors!' });
      return;
    }

    const rep = calculateClubReputation(club);

    let sponsorMsg = `🤝 *SPONSORSHIP DEALS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Available Sponsors (Require high rep):\n`;

    Object.entries(TYCOON_CONFIG.SPONSORS).forEach(([key, sponsor]) => {
      const available = rep >= sponsor.min_reputation ? '✅' : '🔒';
      sponsorMsg += `\n${available} *${sponsor.name}*\n`;
      sponsorMsg += `• Min Rep: ${sponsor.min_reputation}\n`;
      sponsorMsg += `• Weekly Bonus: ₦${sponsor.weekly_bonus.toLocaleString()}\n`;
      sponsorMsg += `• Maint Cost: ₦${sponsor.maintenance_cost.toLocaleString()}\n`;
      sponsorMsg += `• ${sponsor.description}\n`;
      sponsorMsg += `• Code: \`${key}\`\n`;
    });

    sponsorMsg += `\n*Usage:* /club sponsors <code> to apply\n\n⚠️ Sponsors provide bonuses but have weekly costs.`;

    if (args.length > 0) {
      const sponsorCode = args[0].toLowerCase();
      const sponsorConfig = TYCOON_CONFIG.SPONSORS[sponsorCode];
      if (!sponsorConfig) {
        await sock.sendMessage(m.from, { text: `❌ Invalid sponsor!` });
        return;
      }

      if (rep < sponsorConfig.min_reputation) {
        await sock.sendMessage(m.from, { text: `❌ Reputation too low! Need ${sponsorConfig.min_reputation}` });
        return;
      }

      if (club.sponsors.some(s => s.type === sponsorCode)) {
        await sock.sendMessage(m.from, { text: `❌ Already have this sponsor!` });
        return;
      }

      club.sponsors.push({ type: sponsorCode, startedAt: new Date() });
      await clubsCollection.updateOne({ userId }, { $set: { sponsors: club.sponsors } });

      await sock.sendMessage(m.from, { text: `✅ *SPONSORSHIP SECURED!*\n\n${sponsorConfig.name} - Enjoy weekly bonuses!` });
      return;
    }

    await sock.sendMessage(m.from, { text: sponsorMsg });
  } catch (error) {
    console.error(chalk.red('❌ Sponsors error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Sponsor system failed.' });
  }
}

async function handleClubStats(m, sock, userId) {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, { text: '❌ No club found!' });
      return;
    }

    const rep = calculateClubReputation(club);
    const totalEvents = club.events.length;
    const totalViolations = club.violations.length;
    const totalExpenses = club.expenses.reduce((sum, exp) => sum + exp.amount, 0);

    const statsMsg = `📈 *CLUB STATS FOR ${club.name}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Total Revenue: ₦${club.totalRevenue.toLocaleString()}
• Total Expenses: ₦${totalExpenses.toLocaleString()}
• Net Profit: ₦${(club.totalRevenue - totalExpenses).toLocaleString()}
• Reputation: ${rep}/100
• Events Hosted: ${totalEvents}
• Violations: ${totalViolations}
• Upgrades: ${club.upgrades.length}
• Staff Count: ${club.staff.length}
• Equipment Count: ${club.equipment.length}
• Sponsors: ${club.sponsors.length}`;

    await sock.sendMessage(m.from, { text: statsMsg });
  } catch (error) {
    console.error(chalk.red('❌ Stats error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Unable to fetch stats.' });
  }
}

async function handleClubBankruptcy(m, sock, userId) {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, { text: '❌ No club found!' });
      return;
    }

    if (club.balance > 0) {
      await sock.sendMessage(m.from, { text: '❌ Club not bankrupt! Balance positive.' });
      return;
    }

    await clubsCollection.deleteOne({ userId });
    await sock.sendMessage(m.from, { text: '💥 *BANKRUPTCY DECLARED!*\n\nClub reset. Start over with /club register.' });
  } catch (error) {
    console.error(chalk.red('❌ Bankruptcy error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Bankruptcy failed.' });
  }
}

// Scheduled Task Handlers
async function processWeeklyExpenses() {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const activeClubs = await clubsCollection.find({ isActive: true }).toArray();
    
    let totalDeducted = 0;
    let clubsProcessed = 0;
    
    for (const club of activeClubs) {
      let weeklyExpenses = TYCOON_CONFIG.WEEKLY_UTILITIES.base;
      
      // Staff salaries
      const staffCosts = (club.staff || []).reduce((total, staff) => {
        const staffConfig = TYCOON_CONFIG.STAFF[staff.type];
        return total + (staffConfig?.salary || 0);
      }, 0);
      
      // Equipment maintenance
      const equipmentCosts = (club.equipment || []).length * TYCOON_CONFIG.WEEKLY_UTILITIES.per_equipment;
      
      // License renewal reminders (deduct early renewal penalties)
      const expiredLicenses = (club.licenses || []).filter(l => {
        const daysLeft = Math.ceil((new Date(l.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
        return daysLeft < 7; // About to expire
      });
      
      const licenseWarningCost = expiredLicenses.length * 50000; // Warning fine
      
      const totalExpenses = weeklyExpenses + staffCosts + equipmentCosts + licenseWarningCost;
      
      // Deduct from club balance first, then from user wallet if needed
      let remainingCost = totalExpenses;
      
      if (club.balance >= remainingCost) {
        await clubsCollection.updateOne(
          { userId: club.userId },
          { 
            $inc: { balance: -remainingCost },
            $push: { 
              expenses: {
                type: 'weekly_operations',
                amount: remainingCost,
                breakdown: {
                  utilities: weeklyExpenses,
                  staff: staffCosts,
                  equipment: equipmentCosts,
                  penalties: licenseWarningCost
                },
                date: new Date()
              }
            }
          }
        );
      } else {
        // Club balance insufficient, deduct from user wallet
        const clubContribution = club.balance;
        remainingCost -= clubContribution;
        
        const userBalance = await PluginHelpers.getBalance(club.userId);
        
        if (userBalance.wallet >= remainingCost) {
          await unifiedUserManager.removeMoney(club.userId, remainingCost, 'Club operational expenses');
          await clubsCollection.updateOne(
            { userId: club.userId },
            { 
              $set: { balance: 0 },
              $push: { 
                expenses: {
                  type: 'emergency_funding',
                  amount: totalExpenses,
                  userContribution: remainingCost,
                  date: new Date()
                }
              }
            }
          );
        } else {
          // Cannot afford expenses - club goes into debt/bankruptcy risk
          const debt = remainingCost - userBalance.wallet;
          await clubsCollection.updateOne(
            { userId: club.userId },
            { 
              $set: { 
                balance: -debt,
                bankruptcyRisk: true,
                lastExpenseWarning: new Date()
              },
              $push: {
                notifications: {
                  message: `Unable to pay weekly expenses! Debt: ₦${debt.toLocaleString()}. Bankruptcy risk!`
                }
              }
            }
          );
        }
      }
      
      totalDeducted += totalExpenses;
      clubsProcessed++;
    }
    
    console.log(chalk.yellow(`💸 Processed weekly expenses: ₦${totalDeducted.toLocaleString()} from ${clubsProcessed} clubs`));
  } catch (error) {
    console.error(chalk.red('❌ Weekly expenses error:'), error.message);
  }
}

async function processEquipmentBreakdown() {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const clubs = await clubsCollection.find({ 
      isActive: true, 
      'equipment.0': { $exists: true } 
    }).toArray();
    
    let breakdownEvents = 0;
    
    for (const club of clubs) {
      let updated = false;
      const equipment = club.equipment || [];
      
      for (let item of equipment) {
        if (item.broken) continue; // Already broken
        
        // Calculate degradation rate based on maintenance staff and age
        const hasMaintenanceCrew = (club.staff || []).some(s => s.type === 'maintenance_crew');
        const hasSoundEngineer = (club.staff || []).some(s => s.type === 'sound_engineer');
        
        let degradationRate = 1.0;
        if (hasMaintenanceCrew) degradationRate *= 0.4; // 60% reduction
        if (hasSoundEngineer) degradationRate *= 0.6; // 40% additional reduction
        
        // Age-based degradation (older equipment breaks more)
        const ageInMonths = Math.ceil((new Date() - new Date(item.purchasedAt)) / (1000 * 60 * 60 * 24 * 30));
        const ageFactor = 1 + (ageInMonths * 0.1);
        
        const degradation = Math.floor((Math.random() * 5 + 2) * degradationRate * ageFactor);
        item.currentDurability = Math.max(0, item.currentDurability - degradation);
        
        // Equipment breaks if durability hits 0
        if (item.currentDurability <= 0 && !item.broken) {
          item.broken = true;
          item.brokenAt = new Date();
          updated = true;
          breakdownEvents++;
          
          // Add emergency repair notification
          club.notifications.push({
            type: 'equipment_breakdown',
            message: `${item.name} has broken down and needs immediate repair! Cost: ₦${item.maintenanceCost.toLocaleString()}`,
            equipment: item.type,
            timestamp: new Date()
          });
        }
      }
      
      if (updated) {
        await clubsCollection.updateOne(
          { userId: club.userId },
          { 
            $set: { 
              equipment: equipment, 
              notifications: club.notifications,
              updatedAt: new Date() 
            }
          }
        );
      }
    }
    
    console.log(chalk.yellow(`⚙️ Equipment breakdown events: ${breakdownEvents}`));
  } catch (error) {
    console.error(chalk.red('❌ Equipment breakdown error:'), error.message);
  }
}

async function processLicenseEnforcement() {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const clubs = await clubsCollection.find({ isActive: true }).toArray();
    
    let violationsIssued = 0;
    
    for (const club of clubs) {
      const licenses = club.licenses || [];
      let dailyFines = 0;
      let reputationLoss = 0;
      let violations = club.violations || [];
      
      // Update license status
      licenses.forEach(l => {
        l.active = new Date() < new Date(l.expiresAt);
      });

      const activeLicenses = licenses.filter(l => l.active);
      const expiredLicenses = licenses.filter(l => !l.active);

      // Check for required business license
      if (!activeLicenses.some(l => l.type === 'business')) {
        const penalties = TYCOON_CONFIG.LICENSES.business.penalties;
        dailyFines += penalties.daily_fine;
        reputationLoss += 5;
        
        violations.push({
          type: 'no_business_license',
          fine: penalties.daily_fine,
          date: new Date(),
          description: 'Operating without valid business license'
        });
        
        // Random shutdown risk
        if (Math.random() < penalties.shutdown_risk) {
          await clubsCollection.updateOne(
            { userId: club.userId },
            { 
              $set: { 
                isActive: false,
                shutdownReason: 'Government shutdown - No business license',
                shutdownAt: new Date()
              },
              $push: {
                notifications: { message: 'Club shut down due to no business license!' }
              }
            }
          );
          continue;
        }
      }
      
      // Check other license violations
      for (const expiredLicense of expiredLicenses) {
        const licenseConfig = TYCOON_CONFIG.LICENSES[expiredLicense.type];
        if (licenseConfig && licenseConfig.penalties) {
          dailyFines += licenseConfig.penalties.daily_fine || 0;
          reputationLoss += licenseConfig.penalties.reputation_loss || 0;
          
          violations.push({
            type: `expired_${expiredLicense.type}`,
            fine: licenseConfig.penalties.daily_fine || 0,
            date: new Date(),
            description: `Expired ${expiredLicense.type.replace(/_/g, ' ')} license`
          });

          // Additional penalties
          if (licenseConfig.penalties.revenue_loss) {
            club.balance = Math.floor(club.balance * (1 - licenseConfig.penalties.revenue_loss));
          }
          if (licenseConfig.penalties.scandal_risk && Math.random() < licenseConfig.penalties.scandal_risk) {
            reputationLoss += 10;
            violations.push({
              type: 'scandal',
              description: 'Scandal due to license violation'
            });
          }
        }
      }
      
      // Apply penalties
      if (dailyFines > 0 || reputationLoss > 0) {
        const newBalance = Math.max(club.balance - dailyFines, -Math.abs(club.balance * 2)); // Allow debt
        const newReputation = Math.max(0, club.reputation - reputationLoss);
        
        await clubsCollection.updateOne(
          { userId: club.userId },
          { 
            $set: { 
              balance: newBalance,
              reputation: newReputation,
              licenses: licenses,
              violations: violations,
              lastViolationCheck: new Date()
            }
          }
        );
        
        violationsIssued++;
      }
    }
    
    console.log(chalk.red(`🚨 License violations issued: ${violationsIssued}`));
  } catch (error) {
    console.error(chalk.red('❌ License enforcement error:'), error.message);
  }
}

async function processRandomEvents() {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const activeClubs = await clubsCollection.find({ 
      isActive: true,
      reputation: { $gt: 30 } // Only affect established clubs
    }).toArray();
    
    if (activeClubs.length === 0) return;
    
    // Select random club for event
    const randomClub = activeClubs[Math.floor(Math.random() * activeClubs.length)];
    const eventType = Math.random();
    
    let event = null;
    let updates = {};
    
    if (eventType < 0.1) {
      // Police Raid (10% chance)
      const hasAllLicenses = ['business', 'liquor', 'noise_permit'].every(type =>
        (randomClub.licenses || []).some(l => l.type === type && l.active)
      );
      
      if (!hasAllLicenses) {
        const fine = Math.floor(Math.random() * 2000000 + 1000000); // ₦1M-₦3M
        event = {
          type: 'police_raid',
          title: '🚨 Police Raid!',
          description: `Police raided ${randomClub.name} for license violations!`,
          impact: { balance: -fine, reputation: -15 },
          timestamp: new Date()
        };
        updates = {
          balance: Math.max(0, randomClub.balance - fine),
          reputation: Math.max(0, randomClub.reputation - 15)
        };
      }
    } else if (eventType < 0.2) {
      // Celebrity Surprise Visit (10% chance)
      const celebrities = Object.keys(TYCOON_CONFIG.NIGERIAN_CELEBRITIES);
      const randomCeleb = celebrities[Math.floor(Math.random() * celebrities.length)];
      const reputationBoost = Math.floor(Math.random() * 10 + 5);
      
      event = {
        type: 'celebrity_visit',
        title: '🌟 Celebrity Spotted!',
        description: `${TYCOON_CONFIG.NIGERIAN_CELEBRITIES[randomCeleb].name} was seen partying at ${randomClub.name}!`,
        impact: { reputation: reputationBoost },
        celebrity: randomCeleb,
        timestamp: new Date()
      };
      updates = {
        reputation: Math.min(100, randomClub.reputation + reputationBoost)
      };
    } else if (eventType < 0.3) {
      // Power Outage (10% chance)
      const hasGenerator = (randomClub.upgrades || []).some(u => u.type === 'backup_generators');
      
      if (!hasGenerator) {
        const loss = Math.floor(randomClub.balance * 0.1); // 10% loss
        event = {
          type: 'power_outage',
          title: '⚡ Power Outage!',
          description: `Power outage at ${randomClub.name} ruined ongoing events!`,
          impact: { balance: -loss, reputation: -5 },
          timestamp: new Date()
        };
        updates = {
          balance: randomClub.balance - loss,
          reputation: randomClub.reputation - 5
        };
      }
    } else if (eventType < 0.35) {
      // Scandal (5% chance)
      const scandalLoss = 20;
      event = {
        type: 'scandal',
        title: '📰 Scandal Hits!',
        description: `A scandal involving staff at ${randomClub.name} has gone viral!`,
        impact: { reputation: -scandalLoss },
        timestamp: new Date()
      };
      updates = {
        reputation: randomClub.reputation - scandalLoss
      };
    } else if (eventType < 0.4) {
      // Opportunity: Sponsor Offer (5% chance)
      const sponsors = Object.keys(TYCOON_CONFIG.SPONSORS);
      const randomSponsor = sponsors[Math.floor(Math.random() * sponsors.length)];
      event = {
        type: 'sponsor_offer',
        title: '🤝 Sponsor Opportunity!',
        description: `${TYCOON_CONFIG.SPONSORS[randomSponsor].name} offers sponsorship! Use /club sponsors ${randomSponsor} to accept.`,
        sponsor: randomSponsor,
        timestamp: new Date()
      };
    }

    if (event) {
      await clubsCollection.updateOne(
        { userId: randomClub.userId },
        { 
          $push: { events: event, notifications: { message: event.title + ' - ' + event.description } },
          $set: updates
        }
      );
      console.log(chalk.cyan(`🎲 Random event: ${event.title} at ${randomClub.name}`));
    }
  } catch (error) {
    console.error(chalk.red('❌ Random events error:'), error.message);
  }
}

async function processReputationDecay() {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const inactiveClubs = await clubsCollection.find({
      isActive: true,
      $or: [
        { lastEventAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, // No events in 7 days
        { lastEventAt: { $exists: false } }
      ]
    }).toArray();
    
    for (const club of inactiveClubs) {
      const decayAmount = Math.floor(Math.random() * 3 + 1); // 1-3 reputation loss
      const newReputation = Math.max(0, club.reputation - decayAmount);
      
      await clubsCollection.updateOne(
        { userId: club.userId },
        { 
          $set: { 
            reputation: newReputation,
            lastReputationDecay: new Date()
          },
          $push: {
            notifications: { message: `Reputation decayed by ${decayAmount} due to inactivity! Host events to maintain.` }
          }
        }
      );
    }
    
    console.log(chalk.yellow(`📉 Reputation decay applied to ${inactiveClubs.length} inactive clubs`));
  } catch (error) {
    console.error(chalk.red('❌ Reputation decay error:'), error.message);
  }
}

async function updateBillboardWithNPCs() {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const playerClubs = await clubsCollection.find({}).sort({ weeklyRevenue: -1 }).toArray();
    
    // Generate NPC performance for this week
    const npcPerformance = TYCOON_CONFIG.NPC_CLUBS.map(npc => ({
      name: npc.name,
      isNPC: true,
      reputation: npc.reputation + Math.floor(Math.random() * 10 - 5), // ±5 variation
      weeklyRevenue: npc.weeklyRevenue(),
      events: Math.floor(Math.random() * 8 + 2) // 2-9 events
    }));
    
    // Combine player and NPC clubs
    const allClubs = [
      ...playerClubs.map(club => ({
        name: club.name,
        owner: club.userId.split('@')[0],
        isNPC: false,
        reputation: calculateClubReputation(club),
        weeklyRevenue: club.weeklyRevenue || 0,
        events: club.weeklyEvents || 0
      })),
      ...npcPerformance
    ];
    
    // Sort by weekly revenue
    allClubs.sort((a, b) => b.weeklyRevenue - a.weeklyRevenue);
    
    const billboard = {
      week: moment().tz('Africa/Lagos').week(),
      year: moment().tz('Africa/Lagos').year(),
      updatedAt: new Date(),
      topClubs: allClubs.slice(0, 15).map((club, index) => ({
        rank: index + 1,
        ...club
      }))
    };
    
    // Store billboard
    const billboardCollection = await getCollection('club_billboard');
    await billboardCollection.insertOne(billboard);
    
    // Reset weekly stats for player clubs
    await clubsCollection.updateMany(
      {},
      { 
        $set: { 
          weeklyRevenue: 0, 
          weeklyEvents: 0, 
          updatedAt: new Date() 
        } 
      }
    );
    
    console.log(chalk.green(`📊 Billboard updated with ${playerClubs.length} player clubs and ${npcPerformance.length} NPCs`));
  } catch (error) {
    console.error(chalk.red('❌ Billboard update error:'), error.message);
  }
}

async function processSponsorPayments() {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const sponsoredClubs = await clubsCollection.find({ 'sponsors.0': { $exists: true } }).toArray();

    for (const club of sponsoredClubs) {
      let totalBonus = 0;
      let totalCost = 0;

      for (const sponsor of club.sponsors) {
        const config = TYCOON_CONFIG.SPONSORS[sponsor.type];
        if (config) {
          totalBonus += config.weekly_bonus;
          totalCost += config.maintenance_cost;
        }
      }

      const net = totalBonus - totalCost;
      await clubsCollection.updateOne(
        { userId: club.userId },
        { $inc: { balance: net } }
      );

      if (net < 0) {
        club.notifications.push({ message: `Sponsor maintenance cost: ₦${Math.abs(net).toLocaleString()}` });
        await clubsCollection.updateOne({ userId: club.userId }, { $set: { notifications: club.notifications } });
      }
    }

    console.log(chalk.green(`💰 Processed sponsors for ${sponsoredClubs.length} clubs`));
  } catch (error) {
    console.error(chalk.red('❌ Sponsor payments error:'), error.message);
  }
}

// Helper Functions
function calculateClubReputation(club) {
  let reputation = club.reputation || 50;
  
  // Equipment bonus
  const workingEquipment = (club.equipment || []).filter(e => !e.broken);
  reputation += workingEquipment.reduce((sum, eq) => {
    const config = TYCOON_CONFIG.EQUIPMENT[eq.type];
    return sum + (config?.boost.reputation || 0);
  }, 0);
  
  // Staff bonus
  reputation += (club.staff || []).reduce((sum, staff) => {
    const config = TYCOON_CONFIG.STAFF[staff.type];
    return sum + (config?.boost.reputation || 0);
  }, 0);
  
  // Upgrade bonus
  reputation += (club.upgrades || []).reduce((sum, upgrade) => {
    const config = TYCOON_CONFIG.UPGRADES[upgrade.type];
    return sum + (config?.boost.reputation || 0);
  }, 0);
  
  // Recent violations penalty
  const recentViolations = (club.violations || []).filter(v => 
    new Date() - new Date(v.date) < 30 * 24 * 60 * 60 * 1000 // Last 30 days
  );
  reputation -= recentViolations.length * 8;
  
  return Math.max(0, Math.min(100, Math.round(reputation)));
}

function calculateEventRevenue(club, eventConfig, celebrityMultiplier = 1) {
  let baseRevenue = eventConfig.cost * eventConfig.revenue_multiplier * celebrityMultiplier;
  
  // Equipment bonuses
  const workingEquipment = (club.equipment || []).filter(e => !e.broken);
  for (const equipment of workingEquipment) {
    const config = TYCOON_CONFIG.EQUIPMENT[equipment.type];
    if (config) {
      baseRevenue *= config.boost.revenue || 1.0;
    }
  }
  
  // Staff bonuses
  for (const staff of club.staff || []) {
    const config = TYCOON_CONFIG.STAFF[staff.type];
    if (config) {
      baseRevenue *= config.boost.revenue || 1.0;
    }
  }
  
  // Reputation multiplier (higher reputation = more customers)
  const reputationMultiplier = 0.5 + (club.reputation / 100) * 1.5; // 0.5x to 2.0x based on reputation
  baseRevenue *= reputationMultiplier;
  
  // Upgrade bonuses
  for (const upgrade of club.upgrades || []) {
    const config = TYCOON_CONFIG.UPGRADES[upgrade.type];
    if (config) {
      baseRevenue *= config.boost.revenue || 1.0;
    }
  }

  // Alliance bonus
  if (club.alliance) {
    baseRevenue *= 1.1; // 10% bonus for being in alliance
  }
  
  return Math.floor(baseRevenue);
}

function getReputationIcon(rep) {
  if (rep > 90) return '🔥🔥🔥';
  if (rep > 70) return '⭐⭐⭐';
  if (rep > 50) return '👍👍';
  return '😔';
}

// Main Plugin Handler
export default async function ClubTycoon(m, sock, config, bot) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;
  
  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  
  if (command !== 'club') return;
  
  const subCommand = args[1]?.toLowerCase();
  const userId = m.sender;
  
  try {
    switch (subCommand) {
      case 'register':
        await handleClubRegister(m, sock, args.slice(2), userId);
        break;
      case 'info':
        await handleClubInfo(m, sock, userId);
        break;
      case 'buy':
        await handleClubBuy(m, sock, args.slice(2), userId);
        break;
      case 'repair':
        await handleClubRepair(m, sock, args.slice(2), userId);
        break;
      case 'hire':
        await handleClubHire(m, sock, args.slice(2), userId);
        break;
      case 'fire':
        await handleClubFire(m, sock, args.slice(2), userId);
        break;
      case 'host':
        await handleClubHost(m, sock, args.slice(2), userId);
        break;
      case 'celebrity':
        await handleCelebrityBooking(m, sock, args.slice(2), userId);
        break;
      case 'billboard':
        await handleClubBillboard(m, sock, userId);
        break;
      case 'market':
        await handleClubMarket(m, sock, userId);
        break;
      case 'compete':
        await handleClubCompete(m, sock, args.slice(2), userId);
        break;
      case 'sabotage':
        await handleClubSabotage(m, sock, args.slice(2), userId);
        break;
      case 'takeover':
        await handleClubTakeover(m, sock, args.slice(2), userId);
        break;
      case 'license':
        await handleClubLicense(m, sock, args.slice(2), userId);
        break;
      case 'upgrade':
        await handleClubUpgrade(m, sock, args.slice(2), userId);
        break;
      case 'leaderboard':
        await handleClubLeaderboard(m, sock, userId);
        break;
      case 'alliance':
        await handleClubAlliance(m, sock, args.slice(2), userId);
        break;
      case 'sponsors':
        await handleClubSponsors(m, sock, userId);
        break;
      case 'stats':
        await handleClubStats(m, sock, userId);
        break;
      case 'bankruptcy':
        await handleClubBankruptcy(m, sock, userId);
        break;
      default:
        await showClubHelp(m, sock, config.PREFIX);
        break;
    }
  } catch (error) {
    console.error(chalk.red('❌ Club tycoon error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ An error occurred while processing your club command. Please try again later.'
    });
  }
}

async function showClubHelp(m, sock, prefix) {
  const helpMsg = `🍾 *Club Tycoon Commands*

${info.commands.map(cmd => `• \`${prefix}club ${cmd}\``).join('\n')}

💡 Premium Nigerian nightlife simulation with real brands and celebrities!`;

  await sock.sendMessage(m.from, { text: helpMsg });
}
