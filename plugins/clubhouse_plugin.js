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
      salary: 150000, // ₦150k/week (was ₦8k)
      boost: { revenue: 1.4, reputation: 10 }, 
      specialty: 'entertainment',
      requirements: ['pioneer_djm900', 'yamaha_cl5'] // Needs proper equipment
    },
    'celebrity_bartender': { 
      salary: 120000, 
      boost: { revenue: 1.25, reputation: 6 }, 
      specialty: 'service',
      requirements: ['liquor_license']
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
      requirements: ['adult_entertainment_license', 'italian_vip_couches']
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
      requires: ['liquor_license']
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
  ]
};

// Scheduled Task Handlers
async function processWeeklyExpenses() {
  try {
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
    staffMsg += `⚠️ *HIRING TERMS:*\n`;
    staffMsg += `• 4 weeks salary paid upfront\n`;
    staffMsg += `• Maximum 2 staff per type\n`;
    staffMsg += `• Weekly salaries auto-deducted\n`;
    staffMsg += `• Professional contracts only`;
    
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
    eventMsg += `⚠️ *EVENT REQUIREMENTS:*\n`;
    eventMsg += `• Sufficient equipment and staff\n`;
    eventMsg += `• Required licenses must be active\n`;
    eventMsg += `• Minimum reputation level\n`;
    eventMsg += `• Upfront investment required`;
    
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
    licenseMsg += `⚠️ *COMPLIANCE WARNING:*\n`;
    licenseMsg += `• Business license is mandatory for all operations\n`;
    licenseMsg += `• Operating without licenses incurs daily fines\n`;
    licenseMsg += `• Repeat violations can lead to shutdown\n`;
    licenseMsg += `• Renew licenses before expiration`;
    
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

📋 *License:* ${licenseType.replace(/_/g, ' ').toUpperCase()}
🏛️ *Authority:* Lagos State Government
💰 *Fee Paid:* ₦${licenseConfig.price.toLocaleString()}
⏰ *Duration:* ${licenseConfig.duration} days
📅 *Expires:* ${moment(newLicense.expiresAt).tz('Africa/Lagos').format('DD/MM/YYYY')}${complianceStatus}

${licenseConfig.enables ? `🔓 *Now Enabled:*\n${licenseConfig.enables.map(item => `• ${item.replace(/_/g, ' ')}`).join('\n')}` : ''}

⚠️ *IMPORTANT:* Set calendar reminders for license renewal to avoid violations and fines.`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club license error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Government licensing system temporarily unavailable.'
    });
  }
}

async function handleClubUpgrade(m, sock, args, userId) {
  if (args.length === 0) {
    let upgradeMsg = `🏗️ *PREMIUM CLUB UPGRADES*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    
    Object.entries(TYCOON_CONFIG.UPGRADES).forEach(([key, upgrade]) => {
      upgradeMsg += `🏢 *${key.replace(/_/g, ' ').toUpperCase()}*\n`;
      upgradeMsg += `• Investment: ₦${upgrade.price.toLocaleString()}\n`;
      upgradeMsg += `• ${upgrade.description}\n`;
      if (upgrade.boost.revenue) upgradeMsg += `• Revenue Boost: +${Math.round((upgrade.boost.revenue - 1) * 100)}%\n`;
      if (upgrade.boost.reputation) upgradeMsg += `• Reputation: +${upgrade.boost.reputation}\n`;
      if (upgrade.requires) upgradeMsg += `• Requires: ${upgrade.requires.join(', ')}\n`;
      upgradeMsg += `\n`;
    });
    
    upgradeMsg += `*Usage:* \`/club upgrade <upgrade_type>\`\n\n`;
    upgradeMsg += `💡 *UPGRADE BENEFITS:*\n`;
    upgradeMsg += `• Permanent revenue improvements\n`;
    upgradeMsg += `• Enhanced customer experience\n`;
    upgradeMsg += `• Competitive advantages\n`;
    upgradeMsg += `• Prestige and recognition`;
    
    await sock.sendMessage(m.from, { text: upgradeMsg });
    return;
  }
  
  const upgradeType = args[0].toLowerCase();
  
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You need to own a club first!'
      });
      return;
    }
    
    const upgradeConfig = TYCOON_CONFIG.UPGRADES[upgradeType];
    if (!upgradeConfig) {
      await sock.sendMessage(m.from, {
        text: `❌ Upgrade "${upgradeType}" not available!\n\nUse \`/club upgrade\` to see available upgrades.`
      });
      return;
    }
    
    // Check if already has this upgrade
    const hasUpgrade = (club.upgrades || []).some(u => u.type === upgradeType);
    if (hasUpgrade) {
      await sock.sendMessage(m.from, {
        text: `❌ You already have the ${upgradeType.replace(/_/g, ' ')} upgrade!\n\nEach upgrade can only be purchased once.`
      });
      return;
    }
    
    // Check requirements
    if (upgradeConfig.requires) {
      const missingRequirements = [];
      for (const requirement of upgradeConfig.requires) {
        const hasLicense = (club.licenses || []).some(l => 
          l.type === requirement && l.active
        );
        if (!hasLicense) {
          missingRequirements.push(requirement);
        }
      }
      
      if (missingRequirements.length > 0) {
        await sock.sendMessage(m.from, {
          text: `❌ *UPGRADE REQUIREMENTS NOT MET!*\n\n${missingRequirements.map(req => `• ${req.replace(/_/g, ' ')}`).join('\n')}\n\nFulfill all requirements before purchasing this upgrade.`
        });
        return;
      }
    }
    
    const userBalance = await PluginHelpers.getBalance(userId);
    
    if (userBalance.wallet < upgradeConfig.price) {
      await sock.sendMessage(m.from, {
        text: `❌ *INSUFFICIENT CAPITAL FOR UPGRADE!*\n\n🏗️ *Upgrade:* ${upgradeType.replace(/_/g, ' ')}\n💰 *Cost:* ₦${upgradeConfig.price.toLocaleString()}\n💳 *Your Wallet:* ₦${userBalance.wallet.toLocaleString()}\n\nPremium upgrades require substantial investment.`
      });
      return;
    }
    
    // Purchase upgrade
    await unifiedUserManager.removeMoney(userId, upgradeConfig.price, `Club upgrade: ${upgradeType}`);
    
    const newUpgrade = {
      type: upgradeType,
      name: upgradeType.replace(/_/g, ' '),
      purchasedAt: new Date(),
      cost: upgradeConfig.price,
      description: upgradeConfig.description
    };
    
    await clubsCollection.updateOne(
      { userId },
      { 
        $push: { upgrades: newUpgrade },
        $set: { updatedAt: new Date() }
      }
    );
    
    const successMsg = `🏗️ *PREMIUM UPGRADE COMPLETED!*

🏢 *Upgrade:* ${upgradeType.replace(/_/g, ' ').toUpperCase()}
💰 *Investment:* ₦${upgradeConfig.price.toLocaleString()}
📝 *Description:* ${upgradeConfig.description}

🎊 *PERMANENT BENEFITS ACTIVATED:*${upgradeConfig.boost.revenue ? `\n📈 Revenue Boost: +${Math.round((upgradeConfig.boost.revenue - 1) * 100)}%` : ''}${upgradeConfig.boost.reputation ? `\n⭐ Reputation Boost: +${upgradeConfig.boost.reputation}` : ''}${upgradeConfig.boost.reliability ? `\n🔧 Reliability Boost: +${Math.round(upgradeConfig.boost.reliability * 100)}%` : ''}

✨ Your club's prestige and operational capabilities have been permanently enhanced!

💡 *Strategic Impact:*
• Enhanced customer satisfaction
• Competitive market advantage
• Premium service delivery
• Long-term profitability improvement`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club upgrade error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Upgrade system temporarily unavailable.'
    });
  }
}

// Helper function for reputation icons
function getReputationIcon(reputation) {
  if (reputation >= 95) return '🏆'; // Legendary
  if (reputation >= 85) return '🌟'; // Elite
  if (reputation >= 70) return '⭐'; // Premium
  if (reputation >= 50) return '🔶'; // Standard
  if (reputation >= 30) return '🔸'; // Basic
  return '🔻'; // Poor
}

// Placeholder handlers for advanced features
async function handleClubCompete(m, sock, args, userId) {
  await sock.sendMessage(m.from, {
    text: '🚧 *CLUB COMPETITION SYSTEM*\n\nChallenge rival clubs in:\n• DJ Battles\n• Cocktail Contests\n• Customer Reviews\n• Revenue Competitions\n\n🔜 Coming in next update with betting and prizes!'
  });
}

async function handleClubSabotage(m, sock, args, userId) {
  await sock.sendMessage(m.from, {
    text: '🚧 *CORPORATE SABOTAGE SYSTEM*\n\nEngage in business warfare:\n• Fake negative reviews\n• Staff poaching\n• Equipment interference\n• License complications\n\n🔜 High-risk, high-reward mechanics coming soon!'
  });
}

async function handleClubTakeover(m, sock, args, userId) {
  await sock.sendMessage(m.from, {
    text: '🚧 *HOSTILE TAKEOVER SYSTEM*\n\nAcquire struggling competitors:\n• Buy out failing clubs\n• Merge operations\n• Expand your empire\n• Control market territories\n\n🔜 Advanced business strategy features!'
  });
}

async function handleClubAlliance(m, sock, args, userId) {
  await sock.sendMessage(m.from, {
    text: '🚧 *CLUB ALLIANCE SYSTEM*\n\nForm strategic partnerships:\n• Joint marketing campaigns\n• Shared security resources\n• Co-hosted mega events\n• Protection from sabotage\n\n🔜 Multiplayer cooperation mechanics!'
  });
}

async function handleClubSponsors(m, sock, args, userId) {
  await sock.sendMessage(m.from, {
    text: '🚧 *CORPORATE SPONSORSHIP SYSTEM*\n\nAttract major sponsors:\n• Alcohol brand partnerships\n• Music label deals\n• Fashion brand collaborations\n• Tech company endorsements\n\n🔜 Passive income through sponsorships!'
  });
}

async function handleClubStats(m, sock, userId) {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You don\'t own a club! Use `/club register <n>` to start your empire.'
      });
      return;
    }
    
    // Calculate comprehensive statistics
    const daysSinceCreation = Math.ceil((new Date() - new Date(club.createdAt)) / (1000 * 60 * 60 * 24));
    const avgDailyRevenue = daysSinceCreation > 0 ? Math.floor(club.totalRevenue / daysSinceCreation) : 0;
    const reputation = calculateClubReputation(club);
    
    // Equipment statistics
    const totalEquipment = club.equipment?.length || 0;
    const workingEquipment = (club.equipment || []).filter(e => !e.broken).length;
    const equipmentValue = (club.equipment || []).reduce((total, eq) => {
      const config = TYCOON_CONFIG.EQUIPMENT[eq.type];
      return total + (config?.price || 0);
    }, 0);
    
    // Staff statistics
    const totalStaff = club.staff?.length || 0;
    const weeklySalaries = (club.staff || []).reduce((total, staff) => {
      const config = TYCOON_CONFIG.STAFF[staff.type];
      return total + (config?.salary || 0);
    }, 0);
    
    // License statistics
    const activeLicenses = (club.licenses || []).filter(l => l.active).length;
    const licenseValue = (club.licenses || []).reduce((total, license) => {
      return total + (license.fee || 0);
    }, 0);
    
    const statsMsg = `📊 *COMPREHENSIVE CLUB ANALYTICS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏢 *${club.name}*
📅 *Age:* ${daysSinceCreation} days
⭐ *Reputation:* ${reputation}/100 ${getReputationIcon(reputation)}
${club.bankruptcyRisk ? '🚨 *BANKRUPTCY RISK ACTIVE*' : ''}

💰 *FINANCIAL ANALYTICS*
• Total Revenue: ₦${club.totalRevenue.toLocaleString()}
• Current Balance: ₦${club.balance.toLocaleString()}
• Weekly Revenue: ₦${club.weeklyRevenue.toLocaleString()}
• Avg Daily Revenue: ₦${avgDailyRevenue.toLocaleString()}
• Equipment Value: ₦${equipmentValue.toLocaleString()}

📈 *OPERATIONAL METRICS*
• Total Events Hosted: ${(club.events || []).length}
• Weekly Events: ${club.weeklyEvents || 0}
• Equipment: ${workingEquipment}/${totalEquipment} operational
• Staff: ${totalStaff} professionals
• Weekly Payroll: ₦${weeklySalaries.toLocaleString()}

📋 *COMPLIANCE STATUS*
• Active Licenses: ${activeLicenses}
• License Investment: ₦${licenseValue.toLocaleString()}
• Violations: ${(club.violations || []).length}
• Upgrades: ${(club.upgrades || []).length}

🎯 *PERFORMANCE INDICATORS*
• Revenue per Event: ₦${club.weeklyEvents > 0 ? Math.floor(club.weeklyRevenue / club.weeklyEvents).toLocaleString() : '0'}
• ROI on Equipment: ${equipmentValue > 0 ? Math.round((club.totalRevenue / equipmentValue) * 100) : 0}%
• Staff Efficiency: ${totalStaff > 0 ? Math.floor(club.totalRevenue / totalStaff / 1000) : 0}K/staff
• Operating Days: ${club.lastEventAt ? Math.ceil((new Date() - new Date(club.lastEventAt)) / (1000 * 60 * 60 * 24)) : 'Never'} days since last event

💡 *STRATEGIC INSIGHTS*
${avgDailyRevenue > 100000 ? '✅ Strong daily revenue generation' : '⚠️ Consider hosting more frequent events'}
${reputation > 80 ? '✅ Excellent market reputation' : '⚠️ Focus on reputation building'}
${workingEquipment >= 5 ? '✅ Well-equipped for premium events' : '⚠️ Expand equipment inventory'}`;

    await sock.sendMessage(m.from, { text: statsMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club stats error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Analytics system temporarily unavailable.'
    });
  }
}

async function handleClubBankruptcy(m, sock, userId) {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You don\'t own a club!'
      });
      return;
    }
    
    if (!club.bankruptcyRisk && club.balance >= 0) {
      await sock.sendMessage(m.from, {
        text: '❌ Your club is not in financial distress!\n\nBankruptcy is only available for clubs with severe financial problems.'
      });
      return;
    }
    
    // Calculate liquidation value (30% of equipment and upgrades)
    const equipmentValue = (club.equipment || []).reduce((total, eq) => {
      const config = TYCOON_CONFIG.EQUIPMENT[eq.type];
      return total + (config?.price || 0);
    }, 0);
    
    const upgradeValue = (club.upgrades || []).reduce((total, upgrade) => {
      const config = TYCOON_CONFIG.UPGRADES[upgrade.type];
      return total + (config?.price || 0);
    }, 0);
    
    const liquidationValue = Math.floor((equipmentValue + upgradeValue) * 0.3);
    
    const bankruptcyMsg = `💔 *CLUB BANKRUPTCY PROCEEDINGS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏢 *Club:* ${club.name}
📅 *Operational Period:* ${Math.ceil((new Date() - new Date(club.createdAt)) / (1000 * 60 * 60 * 24))} days
💸 *Current Debt:* ₦${Math.abs(club.balance).toLocaleString()}

💰 *LIQUIDATION ASSESSMENT*
• Equipment Value: ₦${equipmentValue.toLocaleString()}
• Upgrade Value: ₦${upgradeValue.toLocaleString()}
• Liquidation Recovery: ₦${liquidationValue.toLocaleString()} (30%)

⚠️ *BANKRUPTCY CONSEQUENCES:*
• Club permanently closed
• All equipment and upgrades lost
• Staff contracts terminated
• Licenses forfeited
• Reputation reset to 0

🔄 *FRESH START BENEFITS:*
• Liquidation funds to your wallet
• Experience bonus for next club (+10 reputation)
• Bankruptcy protection (reduced registration fee)
• Industry knowledge retained

💡 *Type "CONFIRM BANKRUPTCY" to proceed or "CANCEL" to continue struggling.*`;

    await sock.sendMessage(m.from, { text: bankruptcyMsg });
    
    // Note: In a full implementation, you'd handle the confirmation response
    // For now, this shows the bankruptcy options without implementing the full flow
    
  } catch (error) {
    console.error(chalk.red('❌ Club bankruptcy error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Bankruptcy court system temporarily unavailable.'
    });
  }
}

async function handleClubBillboard(m, sock, userId) {
  try {
    const billboardCollection = await getCollection('club_billboard');
    const latestBillboard = await billboardCollection.findOne({}, { sort: { updatedAt: -1 } });
    
    if (!latestBillboard) {
      await sock.sendMessage(m.from, {
        text: '📊 Billboard system initializing...\n\nCheck back after the first weekly update (Sundays).'
      });
      return;
    }
    
    let billboardMsg = `📊 *LAGOS NIGHTLIFE BILLBOARD*
Week ${latestBillboard.week}, ${latestBillboard.year}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏆 *TOP PERFORMING CLUBS*

`;

    latestBillboard.topClubs.slice(0, 12).forEach((club, index) => {
      const medal = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const npcIndicator = club.isNPC ? ' 🤖' : '';
      
      billboardMsg += `${medal} *${club.name}*${npcIndicator}\n`;
      if (!club.isNPC) billboardMsg += `   Owner: @${club.owner}\n`;
      billboardMsg += `   Revenue: ₦${club.weeklyRevenue.toLocaleString()}\n`;
      billboardMsg += `   Rating: ${club.reputation}/100 ${getReputationIcon(club.reputation)}\n`;
      billboardMsg += `   Events: ${club.events}\n\n`;
    });
    
    // Find user's position
    const userClub = latestBillboard.topClubs.find(c => 
      !c.isNPC && c.owner === userId.split('@')[0]
    );
    
    if (userClub) {
      billboardMsg += `📍 *YOUR POSITION:* #${userClub.rank}`;
      if (userClub.rank <= 3) {
        billboardMsg += ` 🎊 *ELITE TIER!*`;
      } else if (userClub.rank <= 10) {
        billboardMsg += ` ⭐ *TOP 10 CLUB!*`;
      }
    } else {
      billboardMsg += `📍 *Your club not in top 15*\nHost more premium events to climb the rankings!`;
    }
    
    billboardMsg += `\n\n🎯 *COMPETITION INSIGHTS:*\n`;
    const topRevenue = latestBillboard.topClubs[0]?.weeklyRevenue || 0;
    const avgRevenue = latestBillboard.topClubs.slice(0, 5).reduce((sum, club) => sum + club.weeklyRevenue, 0) / 5;
    
    billboardMsg += `• Top Club Revenue: ₦${topRevenue.toLocaleString()}\n`;
    billboardMsg += `• Top 5 Average: ₦${Math.floor(avgRevenue).toLocaleString()}\n`;
    billboardMsg += `• Entry Threshold: Host premium events consistently`;
    
    await sock.sendMessage(m.from, { text: billboardMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club billboard error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Billboard system temporarily unavailable.'
    });
  }
}

async function handleClubLeaderboard(m, sock, userId) {
  try {
    const clubsCollection = await getCollection('club_tycoon');
    const topClubs = await clubsCollection
      .find({})
      .sort({ totalRevenue: -1 })
      .limit(20)
      .toArray();
    
    if (topClubs.length === 0) {
      await sock.sendMessage(m.from, {
        text: '📊 No clubs registered yet!\n\nBe the first to dominate Lagos nightlife!'
      });
      return;
    }
    
    let leaderboardMsg = `🏆 *ALL-TIME CLUB LEADERBOARD*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

    topClubs.forEach((club, index) => {
      const medal = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const reputation = calculateClubReputation(club);
      const daysSinceCreated = Math.ceil((new Date() - new Date(club.createdAt)) / (1000 * 60 * 60 * 24));
      
      leaderboardMsg += `${medal} *${club.name}*\n`;
      leaderboardMsg += `   Total Revenue: ₦${club.totalRevenue.toLocaleString()}\n`;
      leaderboardMsg += `   Rating: ${reputation}/100 ${getReputationIcon(reputation)}\n`;
      leaderboardMsg += `   Age: ${daysSinceCreated} days\n`;
      leaderboardMsg += `   Equipment: ${(club.equipment || []).length} | Staff: ${(club.staff || []).length}\n\n`;
    });
    
    // Find user's position in all clubs
    const userPosition = topClubs.findIndex(c => c.userId === userId) + 1;
    
    if (userPosition > 0) {
      leaderboardMsg += `📍 *YOUR POSITION:* #${userPosition}`;
      if (userPosition <= 5) {
        leaderboardMsg += ` 🎊 *ELITE EMPIRE!*`;
      } else if (userPosition <= 10) {
        leaderboardMsg += ` ⭐ *TOP TIER CLUB!*`;
      } else if (userPosition <= 20) {
        leaderboardMsg += ` 💪 *COMPETITIVE LEVEL!*`;
      }
    } else {
      leaderboardMsg += `📍 *Your club not in top 20*\nBuild your empire to join the elite ranks!`;
    }
    
    // Add insights about the competition
    const topRevenue = topClubs[0]?.totalRevenue || 0;
    const millionaires = topClubs.filter(c => c.totalRevenue >= 1000000).length;
    
    leaderboardMsg += `\n\n🎯 *INDUSTRY INSIGHTS:*\n`;
    leaderboardMsg += `• Highest Earner: ₦${topRevenue.toLocaleString()}\n`;
    leaderboardMsg += `• Million+ Clubs: ${millionaires}/20\n`;
    leaderboardMsg += `• Active Competition: ${topClubs.filter(c => c.isActive).length} clubs\n`;
    leaderboardMsg += `• Average Age: ${Math.floor(topClubs.reduce((sum, c) => sum + Math.ceil((new Date() - new Date(c.createdAt)) / (1000 * 60 * 60 * 24)), 0) / topClubs.length)} days`;
    
    await sock.sendMessage(m.from, { text: leaderboardMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club leaderboard error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Leaderboard system temporarily unavailable.'
    });
  }
}

async function showClubHelp(m, sock, prefix) {
  const helpMsg = `🏢 *NIGERIAN CLUB TYCOON SYSTEM*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏗️ *GETTING STARTED*
• \`${prefix}club register <n>\` - Start your ₦7.5M nightclub empire
• \`${prefix}club info\` - View comprehensive club details
• \`${prefix}club market\` - Browse premium equipment & staff

💼 *OPERATIONS MANAGEMENT*
• \`${prefix}club buy <equipment>\` - Purchase real brand equipment
• \`${prefix}club repair <equipment>\` - Professional repair services
• \`${prefix}club hire <staff>\` - Recruit professional staff
• \`${prefix}club fire <staff>\` - Terminate staff contracts

📋 *LEGAL COMPLIANCE*
• \`${prefix}club license <type>\` - Obtain government permits
• \`${prefix}club upgrade <type>\` - Premium club improvements

🎪 *EVENT HOSTING*
• \`${prefix}club host <event>\` - Host premium events
• \`${prefix}club celebrity <artist>\` - Book Nigerian superstars

📊 *ANALYTICS & COMPETITION*
• \`${prefix}club stats\` - Comprehensive business analytics
• \`${prefix}club billboard\` - Weekly performance rankings
• \`${prefix}club leaderboard\` - All-time club rankings

🎮 *ADVANCED FEATURES (Coming Soon)*
• \`${prefix}club compete <target>\` - Business competitions
• \`${prefix}club sabotage <target>\` - Corporate warfare
• \`${prefix}club alliance <action>\` - Strategic partnerships
• \`${prefix}club bankruptcy\` - Financial restructuring

💰 *PREMIUM ECONOMICS:*
• Registration: ₦7,500,000
• Business License: ₦2,500,000/year
• Real equipment brands with 60% repair costs
• Celebrity bookings: ₦6M - ₦20M
• Weekly operational expenses auto-deducted

🌟 *NIGERIAN CELEBRITIES AVAILABLE:*
Burna Boy • Wizkid • Davido • Asake • Olamide
Rema • Fireboy • Tiwa Savage • Kizz Daniel

⚠️ *HIGH-RISK, HIGH-REWARD:*
• Equipment breaks down over time
• Staff require weekly salaries
• License violations incur daily fines
• Celebrity no-shows lose your deposit
• Random events can impact your business

🎯 *Welcome to Lagos' most challenging business simulation!*`;

  await sock.sendMessage(m.from, { text: helpMsg });
} clubsCollection = await getCollection('club_tycoon');
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
        
        // Calculate breakdown chance based on maintenance staff and age
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
          if (!club.notifications) club.notifications = [];
          club.notifications.push({
            type: 'equipment_breakdown',
            message: `${item.type.replace(/_/g, ' ')} has broken down and needs immediate repair!`,
            equipment: item.type,
            repairCost: TYCOON_CONFIG.EQUIPMENT[item.type]?.maintenance || 0,
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
              notifications: club.notifications || [],
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
      const activeLicenses = (club.licenses || []).filter(l => l.active);
      const expiredLicenses = (club.licenses || []).filter(l => !l.active);
      
      let dailyFines = 0;
      let reputationLoss = 0;
      let violations = club.violations || [];
      
      // Check for required business license
      const hasBusinessLicense = activeLicenses.some(l => l.type === 'business');
      if (!hasBusinessLicense) {
        dailyFines += TYCOON_CONFIG.LICENSES.business.penalties.daily_fine;
        reputationLoss += 5;
        
        violations.push({
          type: 'no_business_license',
          fine: TYCOON_CONFIG.LICENSES.business.penalties.daily_fine,
          date: new Date(),
          description: 'Operating without valid business license'
        });
        
        // Random shutdown risk
        if (Math.random() < TYCOON_CONFIG.LICENSES.business.penalties.shutdown_risk) {
          await clubsCollection.updateOne(
            { userId: club.userId },
            { 
              $set: { 
                isActive: false,
                shutdownReason: 'Government shutdown - No business license',
                shutdownAt: new Date()
              }
            }
          );
          continue; // Skip other checks for shut down club
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
        }
      }
      
      // Apply penalties
      if (dailyFines > 0 || reputationLoss > 0) {
        const newBalance = Math.max(0, club.balance - dailyFines);
        const newReputation = Math.max(0, club.reputation - reputationLoss);
        
        await clubsCollection.updateOne(
          { userId: club.userId },
          { 
            $set: { 
              balance: newBalance,
              reputation: newReputation,
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
          balance: Math.max(0, randomClub.balance - loss),
          reputation: Math.max(0, randomClub.reputation - 5)
        };
      }
    } else if (eventType < 0.25) {
      // Staff Scandal (5% chance)
      const staff = randomClub.staff || [];
      if (staff.length > 0) {
        const randomStaff = staff[Math.floor(Math.random() * staff.length)];
        const reputationLoss = Math.floor(Math.random() * 10 + 5);
        
        event = {
          type: 'staff_scandal',
          title: '📰 Staff Scandal!',
          description: `${randomStaff.name} (${randomStaff.type}) involved in public controversy!`,
          impact: { reputation: -reputationLoss },
          staff: randomStaff.name,
          timestamp: new Date()
        };
        updates = {
          reputation: Math.max(0, randomClub.reputation - reputationLoss)
        };
      }
    } else if (eventType < 0.28) {
      // Viral Social Media Post (3% chance)
      const hasMarketing = (randomClub.upgrades || []).some(u => u.type === 'social_media_marketing');
      const reputationBoost = hasMarketing ? Math.floor(Math.random() * 15 + 10) : Math.floor(Math.random() * 8 + 3);
      
      event = {
        type: 'viral_post',
        title: '📱 Viral Fame!',
        description: `${randomClub.name} went viral on social media! Customer inquiries flooding in!`,
        impact: { reputation: reputationBoost },
        timestamp: new Date()
      };
      updates = {
        reputation: Math.min(100, randomClub.reputation + reputationBoost)
      };
    }
    
    // Apply event if generated
    if (event) {
      if (!randomClub.events) randomClub.events = [];
      randomClub.events.push(event);
      
      await clubsCollection.updateOne(
        { userId: randomClub.userId },
        { 
          $set: { 
            ...updates,
            updatedAt: new Date()
          },
          $push: { events: event }
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
  
  return Math.floor(baseRevenue);
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
      name: { $regex: new RegExp(`^${clubName}// plugins/clubTycoon.js - Premium Nigerian Nightlife Business Tycoon
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
      salary: 150000, // ₦150k/week (was ₦8k)
      boost: { revenue: 1.4, reputation: 10 }, 
      specialty: 'entertainment',
      requirements: ['pioneer_djm900', 'yamaha_cl5'] // Needs proper equipment
    },
    'celebrity_bartender': { 
      salary: 120000, 
      boost: { revenue: 1.25, reputation: 6 }, 
      specialty: 'service',
      requirements: ['liquor_license']
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
      requirements: ['adult_entertainment_license', 'italian_vip_couches']
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
      requires: ['liquor_license']
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
  ]
};

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
        
        // Calculate breakdown chance based on maintenance staff and age
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
          if (!club.notifications) club.notifications = [];
          club.notifications.push({
            type: 'equipment_breakdown',
            message: `${item.type.replace(/_/g, ' ')} has broken down and needs immediate repair!`,
            equipment: item.type,
            repairCost: TYCOON_CONFIG.EQUIPMENT[item.type]?.maintenance || 0,
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
              notifications: club.notifications || [],
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
      const activeLicenses = (club.licenses || []).filter(l => l.active);
      const expiredLicenses = (club.licenses || []).filter(l => !l.active);
      
      let dailyFines = 0;
      let reputationLoss = 0;
      let violations = club.violations || [];
      
      // Check for required business license
      const hasBusinessLicense = activeLicenses.some(l => l.type === 'business');
      if (!hasBusinessLicense) {
        dailyFines += TYCOON_CONFIG.LICENSES.business.penalties.daily_fine;
        reputationLoss += 5;
        
        violations.push({
          type: 'no_business_license',
          fine: TYCOON_CONFIG.LICENSES.business.penalties.daily_fine,
          date: new Date(),
          description: 'Operating without valid business license'
        });
        
        // Random shutdown risk
        if (Math.random() < TYCOON_CONFIG.LICENSES.business.penalties.shutdown_risk) {
          await clubsCollection.updateOne(
            { userId: club.userId },
            { 
              $set: { 
                isActive: false,
                shutdownReason: 'Government shutdown - No business license',
                shutdownAt: new Date()
              }
            }
          );
          continue; // Skip other checks for shut down club
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
        }
      }
      
      // Apply penalties
      if (dailyFines > 0 || reputationLoss > 0) {
        const newBalance = Math.max(0, club.balance - dailyFines);
        const newReputation = Math.max(0, club.reputation - reputationLoss);
        
        await clubsCollection.updateOne(
          { userId: club.userId },
          { 
            $set: { 
              balance: newBalance,
              reputation: newReputation,
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
, 'i') }
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
        text: '❌ You don\'t own a nightclub! Use `/club register <n>` to start your empire.'
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
    
    // Recent notifications
    if (club.notifications && club.notifications.length > 0) {
      const recentNotifications = club.notifications.slice(-2);
      infoMsg += `\n\n🔔 *RECENT ALERTS*`;
      recentNotifications.forEach(notif => {
        infoMsg += `\n• ${notif.message}`;
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
    
    celebrityMsg += `⚠️ *BOOKING TERMS:*\n`;
    celebrityMsg += `• Full payment required upfront\n`;
    celebrityMsg += `• Equipment requirements must be met\n`;
    celebrityMsg += `• No refunds for no-shows\n`;
    celebrityMsg += `• Scandal risk varies by celebrity\n\n`;
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
    
    const: Math.max(0, randomClub.balance - fine),
          reputation: Math.max(0, randomClub.reputation - 15)
        };
      }
    } else if (eventType < 0.15) {
      // Celebrity Surprise Visit (5% chance)
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
    } else if (eventType < 0.2) {
      // Power Outage (5% chance)
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
          balance
