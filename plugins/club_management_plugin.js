// plugins/clubManagement.js - Complete Club Business Simulation Game
import chalk from 'chalk';
// Simple in-memory rate limiter (per user, per command)
const rateLimitStore = {};
const RATE_LIMIT_WINDOW = 10 * 1000; // 10 seconds
const RATE_LIMIT_MAX = 3; // max 3 commands per window

function isRateLimited(userId, command) {
  const now = Date.now();
  if (!rateLimitStore[userId]) rateLimitStore[userId] = {};
  if (!rateLimitStore[userId][command]) rateLimitStore[userId][command] = [];
  // Remove expired timestamps
  rateLimitStore[userId][command] = rateLimitStore[userId][command].filter(ts => now - ts < RATE_LIMIT_WINDOW);
  if (rateLimitStore[userId][command].length >= RATE_LIMIT_MAX) return true;
  rateLimitStore[userId][command].push(now);
  return false;
}

// Basic sender verification (example: check sender format)
function isValidSender(sender) {
  // Accept only WhatsApp-like IDs (e.g., 2348012345678@s.whatsapp.net)
  return typeof sender === 'string' && /^\d{8,15}@s\.whatsapp\.net$/.test(sender);
}
import moment from 'moment-timezone';
import { PluginHelpers, unifiedUserManager, safeOperation, getCollection } from '../lib/pluginIntegration.js';

// Plugin info and metadata
export const info = {
  name: 'Club Management',
  version: '2.0.0',
  author: 'Bot Developer',
  description: 'Complete club business simulation with licensing, equipment, staff, and revenue management',
  category: 'business',
  commands: [
    'club register <name>',
    'club info',
    'club buy <item>',
    'club repair <equipment>',
    'club hire <staff>',
    'club fire <staff>',
    'club host <event>',
    'club billboard',
    'club market',
    'club compete <target>',
    'club sabotage <target>',
    'club takeover <target>',
    'club license <type>',
    'club upgrade <area>',
    'club leaderboard'
  ],
  scheduledTasks: [
    {
      name: 'equipment_breakdown',
      schedule: '0 */6 * * *', // Every 6 hours
      description: 'Process equipment degradation and breakdowns',
      handler: async () => await processEquipmentBreakdown()
    },
    {
      name: 'license_check',
      schedule: '0 0 * * 1', // Every Monday at midnight
      description: 'Check license renewals and apply penalties',
      handler: async () => await processLicenseRenewals()
    },
    {
      name: 'weekly_billboard',
      schedule: '0 0 * * 0', // Every Sunday at midnight
      description: 'Update weekly billboard rankings',
      handler: async () => await updateWeeklyBillboard()
    },
    {
      name: 'revenue_generation',
      schedule: '0 */4 * * *', // Every 4 hours
      description: 'Generate passive revenue for active clubs',
      handler: async () => await generatePassiveRevenue()
    }
  ]
};

// Game data and configurations
const GAME_CONFIG = {
  EQUIPMENT: {
    // Sound Equipment
    'basic_speakers': { price: 15000, durability: 100, category: 'sound', boost: { revenue: 1.1, happiness: 0.05 } },
    'pro_speakers': { price: 35000, durability: 120, category: 'sound', boost: { revenue: 1.25, happiness: 0.1 } },
    'dj_booth': { price: 25000, durability: 90, category: 'sound', boost: { revenue: 1.15, happiness: 0.08 } },
    'mixing_console': { price: 45000, durability: 110, category: 'sound', boost: { revenue: 1.3, happiness: 0.12 } },
    
    // Lighting
    'basic_lights': { price: 8000, durability: 80, category: 'lighting', boost: { revenue: 1.05, happiness: 0.03 } },
    'led_system': { price: 28000, durability: 100, category: 'lighting', boost: { revenue: 1.2, happiness: 0.08 } },
    'laser_show': { price: 55000, durability: 85, category: 'lighting', boost: { revenue: 1.4, happiness: 0.15 } },
    
    // Furniture & Comfort
    'bar_stools': { price: 12000, durability: 150, category: 'furniture', boost: { revenue: 1.08, happiness: 0.04 } },
    'vip_booths': { price: 40000, durability: 200, category: 'furniture', boost: { revenue: 1.35, happiness: 0.12 } },
    'dance_floor': { price: 30000, durability: 120, category: 'furniture', boost: { revenue: 1.2, happiness: 0.09 } },
    'security_system': { price: 20000, durability: 180, category: 'security', boost: { revenue: 1.1, happiness: 0.06 } }
  },
  
  STAFF: {
    'dj': { salary: 8000, boost: { revenue: 1.25, happiness: 0.1 }, specialty: 'entertainment' },
    'bartender': { salary: 5000, boost: { revenue: 1.15, happiness: 0.06 }, specialty: 'service' },
    'bouncer': { salary: 6000, boost: { revenue: 1.05, happiness: 0.08 }, specialty: 'security' },
    'cleaner': { salary: 3000, boost: { revenue: 1.03, happiness: 0.04 }, specialty: 'maintenance' },
    'stripper': { salary: 10000, boost: { revenue: 1.4, happiness: 0.15 }, specialty: 'adult_entertainment' },
    'waitress': { salary: 4000, boost: { revenue: 1.12, happiness: 0.05 }, specialty: 'service' },
    'technician': { salary: 7000, boost: { revenue: 1.08, maintenance: 0.2 }, specialty: 'technical' }
  },
  
  LICENSES: {
    'business': { price: 50000, duration: 365, required: true, description: 'Basic business operation license' },
    'liquor': { price: 75000, duration: 365, required: false, description: 'Alcohol serving permit' },
    'adult_entertainment': { price: 100000, duration: 180, required: false, description: 'Adult entertainment license' },
    'noise_permit': { price: 25000, duration: 180, required: false, description: 'Late night noise permit' },
    'food_service': { price: 40000, duration: 365, required: false, description: 'Food service permit' }
  },
  
  UPGRADES: {
    'premium_interior': { price: 80000, boost: { revenue: 1.3, happiness: 0.12 } },
    'vip_lounge': { price: 120000, boost: { revenue: 1.5, happiness: 0.18 } },
    'rooftop_terrace': { price: 150000, boost: { revenue: 1.4, happiness: 0.15 } },
    'private_rooms': { price: 200000, boost: { revenue: 1.6, happiness: 0.2 } }
  },
  
  EVENTS: {
    'house_party': { cost: 5000, duration: 4, min_equipment: 2, revenue_multiplier: 1.2 },
    'themed_night': { cost: 8000, duration: 6, min_equipment: 3, revenue_multiplier: 1.4 },
    'concert': { cost: 15000, duration: 8, min_equipment: 5, revenue_multiplier: 1.8 },
    'exclusive_event': { cost: 25000, duration: 12, min_equipment: 8, revenue_multiplier: 2.5 }
  }
};

// Scheduled task handlers
async function processEquipmentBreakdown() {
  try {
    const clubsCollection = await getCollection('clubs');
    const clubs = await clubsCollection.find({ 'equipment.0': { $exists: true } }).toArray();
    
    let processedCount = 0;
    
    for (const club of clubs) {
      let updated = false;
      const equipment = club.equipment || [];
      
      for (let item of equipment) {
        // Calculate breakdown chance based on durability and technician presence
        const hasTechnician = (club.staff || []).some(s => s.type === 'technician');
        const degradationRate = hasTechnician ? 0.5 : 1.0; // Technicians halve degradation
        
        // Random degradation (1-3 points)
        const degradation = Math.floor(Math.random() * 3 + 1) * degradationRate;
        item.currentDurability = Math.max(0, item.currentDurability - degradation);
        
        // Equipment breaks if durability hits 0
        if (item.currentDurability <= 0 && !item.broken) {
          item.broken = true;
          updated = true;
        }
      }
      
      if (updated) {
        await clubsCollection.updateOne(
          { userId: club.userId },
          { $set: { equipment: equipment, updatedAt: new Date() } }
        );
        processedCount++;
      }
    }
    
    console.log(chalk.yellow(`⚙️ Processed equipment breakdown for ${processedCount} clubs`));
  } catch (error) {
    console.error(chalk.red('❌ Equipment breakdown task error:'), error.message);
  }
}

async function processLicenseRenewals() {
  try {
    const clubsCollection = await getCollection('clubs');
    const clubs = await clubsCollection.find({ 'licenses.0': { $exists: true } }).toArray();
    
    const now = new Date();
    let renewalCount = 0;
    
    for (const club of clubs) {
      let updated = false;
      const licenses = club.licenses || [];
      
      for (let license of licenses) {
        const expiryDate = new Date(license.expiresAt);
        
        // Check if license expired
        if (now > expiryDate && license.active) {
          license.active = false;
          updated = true;
          
          // Apply penalty for expired required licenses
          if (GAME_CONFIG.LICENSES[license.type]?.required) {
            const penalty = Math.floor(club.balance * 0.1); // 10% penalty
            club.balance = Math.max(0, club.balance - penalty);
            
            // Add to violations
            if (!club.violations) club.violations = [];
            club.violations.push({
              type: 'expired_license',
              description: `${license.type} license expired`,
              penalty: penalty,
              date: now
            });
          }
        }
      }
      
      if (updated) {
        await clubsCollection.updateOne(
          { userId: club.userId },
          { $set: { licenses: licenses, balance: club.balance, violations: club.violations || [], updatedAt: new Date() } }
        );
        renewalCount++;
      }
    }
    
    console.log(chalk.yellow(`📋 Processed license renewals for ${renewalCount} clubs`));
  } catch (error) {
    console.error(chalk.red('❌ License renewal task error:'), error.message);
  }
}

async function updateWeeklyBillboard() {
  try {
    const clubsCollection = await getCollection('clubs');
    const clubs = await clubsCollection.find({}).sort({ weeklyRevenue: -1 }).limit(10).toArray();
    
    const billboard = {
      week: moment().tz('Africa/Lagos').week(),
      year: moment().tz('Africa/Lagos').year(),
      updatedAt: new Date(),
      topEarners: clubs.map((club, index) => ({
        rank: index + 1,
        clubName: club.name,
        owner: club.userId.split('@')[0],
        revenue: club.weeklyRevenue || 0,
        rating: calculateClubRating(club),
        events: club.weeklyEvents || 0
      }))
    };
    
    // Store billboard
    const billboardCollection = await getCollection('club_billboard');
    await billboardCollection.insertOne(billboard);
    
    // Reset weekly stats for all clubs
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
    
    console.log(chalk.green(`📊 Updated weekly billboard with ${clubs.length} clubs`));
  } catch (error) {
    console.error(chalk.red('❌ Billboard update task error:'), error.message);
  }
}

async function generatePassiveRevenue() {
  try {
    const clubsCollection = await getCollection('clubs');
    const activeClubs = await clubsCollection.find({ 
      isActive: true,
      'equipment.0': { $exists: true }
    }).toArray();
    
    let revenueGenerated = 0;
    
    for (const club of activeClubs) {
      const baseRevenue = calculatePassiveRevenue(club);
      
      if (baseRevenue > 0) {
        // Add to club balance and user wallet
        await clubsCollection.updateOne(
          { userId: club.userId },
          { 
            $inc: { 
              balance: baseRevenue,
              totalRevenue: baseRevenue,
              weeklyRevenue: baseRevenue
            },
            $set: { lastRevenueAt: new Date() }
          }
        );
        
        // Also add to user's economy balance
        await unifiedUserManager.addMoney(club.userId, Math.floor(baseRevenue * 0.3), 'Club passive income');
        
        revenueGenerated += baseRevenue;
      }
    }
    
    console.log(chalk.green(`💰 Generated ₦${revenueGenerated.toLocaleString()} passive revenue for ${activeClubs.length} active clubs`));
  } catch (error) {
    console.error(chalk.red('❌ Passive revenue generation error:'), error.message);
  }
}

// Helper functions
function calculateClubRating(club) {
  let rating = 50; // Base rating
  
  // Equipment quality bonus
  const workingEquipment = (club.equipment || []).filter(e => !e.broken);
  rating += workingEquipment.length * 5;
  
  // Staff bonus
  rating += (club.staff || []).length * 8;
  
  // License compliance bonus
  const activeLicenses = (club.licenses || []).filter(l => l.active);
  rating += activeLicenses.length * 10;
  
  // Upgrade bonus
  rating += (club.upgrades || []).length * 12;
  
  // Recent violations penalty
  const recentViolations = (club.violations || []).filter(v => 
    new Date() - new Date(v.date) < 30 * 24 * 60 * 60 * 1000 // Last 30 days
  );
  rating -= recentViolations.length * 15;
  
  return Math.max(0, Math.min(100, Math.round(rating)));
}

function calculatePassiveRevenue(club) {
  let baseRevenue = 1000; // Base hourly revenue
  
  // Equipment multipliers
  const workingEquipment = (club.equipment || []).filter(e => !e.broken);
  for (const item of workingEquipment) {
    const config = GAME_CONFIG.EQUIPMENT[item.type];
    if (config) {
      baseRevenue *= config.boost.revenue || 1.0;
    }
  }
  
  // Staff multipliers
  for (const staff of club.staff || []) {
    const config = GAME_CONFIG.STAFF[staff.type];
    if (config) {
      baseRevenue *= config.boost.revenue || 1.0;
      // Deduct salary
      baseRevenue -= config.salary / 6; // Hourly salary deduction
    }
  }
  
  // License penalties
  const hasBusinessLicense = (club.licenses || []).some(l => l.type === 'business' && l.active);
  if (!hasBusinessLicense) {
    baseRevenue *= 0.5; // 50% penalty for no business license
  }
  
  // Upgrade multipliers
  for (const upgrade of club.upgrades || []) {
    const config = GAME_CONFIG.UPGRADES[upgrade.type];
    if (config) {
      baseRevenue *= config.boost.revenue || 1.0;
    }
  }
  
  return Math.max(0, Math.floor(baseRevenue));
}

// Main plugin handler
export default async function ClubManagement(m, sock, config, bot) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;
  
  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();
  if (command !== 'club') return;
  const subCommand = args[1]?.toLowerCase();
  const userId = m.sender;

  // Sender authentication
  if (!isValidSender(userId)) {
    await sock.sendMessage(m.from, { text: '❌ Authentication failed: Invalid sender ID.' });
    return;
  }

  // Rate limiting
  if (isRateLimited(userId, subCommand)) {
    await sock.sendMessage(m.from, { text: '⏳ You are sending commands too quickly. Please wait a few seconds.' });
    return;
  }

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
      default:
        await showClubHelp(m, sock, config.PREFIX);
        break;
    }
  } catch (error) {
    console.error(chalk.red('❌ Club management error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ An error occurred while processing your club command. Please try again.'
    });
  }
}

// Command handlers
async function handleClubRegister(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, {
      text: '❌ Please provide a club name!\n\n*Usage:* /club register <name>'
    });
    return;
  }
  
  // Sanitize club name: allow only letters, numbers, spaces, hyphens
  const clubName = args.join(' ').replace(/[^\w\s-]/g, '').trim();
  if (clubName.length < 3 || clubName.length > 30) {
    await sock.sendMessage(m.from, {
      text: '❌ Club name must be between 3-30 characters and contain only letters, numbers, spaces, and hyphens!'
    });
    return;
  }
  
  try {
    const clubsCollection = await getCollection('clubs');
    
    // Check if user already has a club
    const existingClub = await clubsCollection.findOne({ userId });
    if (existingClub) {
      await sock.sendMessage(m.from, {
        text: '❌ You already own a club! Use `/club info` to view your club details.'
      });
      return;
    }
    
    // Check if name is already taken
    // Escape regex special characters in clubName
    const escapedClubName = clubName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameExists = await clubsCollection.findOne({ 
      name: { $regex: new RegExp(`^${escapedClubName}$`, 'i') }
    });
    
    if (nameExists) {
      await sock.sendMessage(m.from, {
        text: '❌ This club name is already taken! Please choose a different name.'
      });
      return;
    }
    
    // Check if user has enough money (registration fee: 100,000)
    const registrationFee = 100000;
    const userBalance = await PluginHelpers.getBalance(userId);
    
    if (userBalance.wallet < registrationFee) {
      await sock.sendMessage(m.from, {
        text: `❌ Insufficient funds! Club registration costs ₦${registrationFee.toLocaleString()}.\n\nYour wallet: ₦${userBalance.wallet.toLocaleString()}`
      });
      return;
    }
    
    // Deduct registration fee
    await unifiedUserManager.removeMoney(userId, registrationFee, 'Club registration fee');
    
    // Create new club
    const newClub = {
      userId,
      name: clubName,
      balance: 0,
      totalRevenue: 0,
      weeklyRevenue: 0,
      weeklyEvents: 0,
      equipment: [],
      staff: [],
      licenses: [],
      upgrades: [],
      violations: [],
      reputation: 50,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastRevenueAt: null
    };
    
    await clubsCollection.insertOne(newClub);
    
    const successMsg = `🎉 *Club Registration Successful!*

🏷️ *Club Name:* ${clubName}
💰 *Registration Fee:* ₦${registrationFee.toLocaleString()}
⭐ *Starting Reputation:* ${newClub.reputation}/100

📋 *Next Steps:*
• Purchase business license: \`/club license business\`
• Buy equipment: \`/club market\`
• Hire staff: \`/club hire <staff_type>\`
• Host your first event: \`/club host house_party\`

💡 *Tip:* A business license is mandatory to operate legally!`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club registration error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Failed to register club. Please try again.'
    });
  }
}

async function handleClubInfo(m, sock, userId) {
  try {
    const clubsCollection = await getCollection('clubs');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You don\'t own a club! Use `/club register <name>` to start your club business.'
      });
      return;
    }
    
    // Calculate current stats
    const rating = calculateClubRating(club);
    const workingEquipment = (club.equipment || []).filter(e => !e.broken);
    const brokenEquipment = (club.equipment || []).filter(e => e.broken);
    const activeLicenses = (club.licenses || []).filter(l => l.active);
    const expiredLicenses = (club.licenses || []).filter(l => !l.active);
    
    let infoMsg = `🏢 *${club.name}*
━━━━━━━━━━━━━━━━━━━

💰 *Finances*
• Club Balance: ₦${club.balance.toLocaleString()}
• Total Revenue: ₦${club.totalRevenue.toLocaleString()}
• Weekly Revenue: ₦${club.weeklyRevenue.toLocaleString()}

⭐ *Status*
• Reputation: ${rating}/100 ${getRatingEmoji(rating)}
• Status: ${club.isActive ? '🟢 Active' : '🔴 Inactive'}
• Weekly Events: ${club.weeklyEvents || 0}

🎵 *Equipment (${club.equipment?.length || 0})*`;

    if (workingEquipment.length > 0) {
      infoMsg += `\n• Working: ${workingEquipment.length}`;
      workingEquipment.slice(0, 3).forEach(eq => {
        infoMsg += `\n  - ${eq.type.replace(/_/g, ' ')} (${eq.currentDurability}%)`;
      });
      if (workingEquipment.length > 3) {
        infoMsg += `\n  - ... and ${workingEquipment.length - 3} more`;
      }
    }
    
    if (brokenEquipment.length > 0) {
      infoMsg += `\n• Broken: ${brokenEquipment.length} 🔧`;
    }
    
    infoMsg += `\n\n👥 *Staff (${club.staff?.length || 0})*`;
    if (club.staff && club.staff.length > 0) {
      club.staff.slice(0, 5).forEach(staff => {
        infoMsg += `\n• ${staff.name} (${staff.type})`;
      });
      if (club.staff.length > 5) {
        infoMsg += `\n• ... and ${club.staff.length - 5} more`;
      }
    } else {
      infoMsg += '\n• No staff hired';
    }
    
    infoMsg += `\n\n📋 *Licenses*`;
    if (activeLicenses.length > 0) {
      infoMsg += `\n• Active: ${activeLicenses.length}`;
      activeLicenses.forEach(license => {
        const daysLeft = Math.ceil((new Date(license.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
        infoMsg += `\n  - ${license.type} (${daysLeft}d left)`;
      });
    }
    
    if (expiredLicenses.length > 0) {
      infoMsg += `\n• Expired: ${expiredLicenses.length} ⚠️`;
    }
    
    if (!activeLicenses.some(l => l.type === 'business')) {
      infoMsg += `\n\n⚠️ *Warning: No business license!*`;
    }
    
    if (club.violations && club.violations.length > 0) {
      infoMsg += `\n\n🚨 *Recent Violations: ${club.violations.length}*`;
    }
    
    infoMsg += `\n\n💡 *Quick Commands:*
• \`/club market\` - Browse equipment
• \`/club hire <staff>\` - Hire staff
• \`/club host <event>\` - Host events
• \`/club billboard\` - View rankings`;

    await sock.sendMessage(m.from, { text: infoMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club info error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Failed to retrieve club information.'
    });
  }
}

async function handleClubMarket(m, sock, userId) {
  try {
    let marketMsg = `🛍️ *Club Equipment Market*
━━━━━━━━━━━━━━━━━━━

🔊 *SOUND EQUIPMENT*`;
    
    Object.entries(GAME_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === 'sound') {
        marketMsg += `\n• ${key.replace(/_/g, ' ')}: ₦${item.price.toLocaleString()} (${item.durability} dur.)`;
      }
    });
    
    marketMsg += `\n\n💡 *LIGHTING*`;
    Object.entries(GAME_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === 'lighting') {
        marketMsg += `\n• ${key.replace(/_/g, ' ')}: ₦${item.price.toLocaleString()} (${item.durability} dur.)`;
      }
    });
    
    marketMsg += `\n\n🪑 *FURNITURE*`;
    Object.entries(GAME_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === 'furniture') {
        marketMsg += `\n• ${key.replace(/_/g, ' ')}: ₦${item.price.toLocaleString()} (${item.durability} dur.)`;
      }
    });
    
    marketMsg += `\n\n🛡️ *SECURITY*`;
    Object.entries(GAME_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === 'security') {
        marketMsg += `\n• ${key.replace(/_/g, ' ')}: ₦${item.price.toLocaleString()} (${item.durability} dur.)`;
      }
    });
    
    marketMsg += `\n\n💼 *STAFF AVAILABLE*`;
    Object.entries(GAME_CONFIG.STAFF).forEach(([key, staff]) => {
      marketMsg += `\n• ${key}: ₦${staff.salary.toLocaleString()}/week`;
    });
    
    marketMsg += `\n\n*Usage:*
• \`/club buy <item_name>\`
• \`/club hire <staff_type>\``;
    
    await sock.sendMessage(m.from, { text: marketMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club market error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Failed to load market information.'
    });
  }
}

async function handleClubBuy(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, {
      text: '❌ Please specify what to buy!\n\n*Usage:* /club buy <item_name>\n\nUse `/club market` to see available items.'
    });
    return;
  }
  
  // Sanitize item name: allow only letters, numbers, underscores
  const itemName = args.join('_').replace(/[^\w_]/g, '').toLowerCase();
  
  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(process.env.MONGO_URI, { useUnifiedTopology: true });
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const clubsCollection = client.db().collection('clubs');
      const club = await clubsCollection.findOne({ userId }, { session });
      if (!club) {
        await sock.sendMessage(m.from, {
          text: '❌ You don\'t own a club! Use `/club register <name>` first.'
        });
        await session.abortTransaction();
        return;
      }
      const equipment = GAME_CONFIG.EQUIPMENT[itemName];
      if (!equipment) {
        await sock.sendMessage(m.from, {
          text: `❌ Equipment "${itemName}" not found!\n\nUse \`/club market\` to see available items.`
        });
        await session.abortTransaction();
        return;
      }
      // Check if user has enough money
      const userBalance = await PluginHelpers.getBalance(userId);
      if (userBalance.wallet < equipment.price) {
        await sock.sendMessage(m.from, {
          text: `❌ Insufficient funds!\n\n*Item:* ${itemName.replace(/_/g, ' ')}\n*Price:* ₦${equipment.price.toLocaleString()}\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`
        });
        await session.abortTransaction();
        return;
      }
      // Deduct money and add equipment atomically
      await unifiedUserManager.removeMoney(userId, equipment.price, `Club equipment: ${itemName}`, { session });
      const newEquipment = {
        type: itemName,
        purchasedAt: new Date(),
        currentDurability: equipment.durability,
        maxDurability: equipment.durability,
        broken: false,
        timesRepaired: 0
      };
      await clubsCollection.updateOne(
        { userId },
        {
          $push: { equipment: newEquipment },
          $set: { updatedAt: new Date() }
        },
        { session }
      );
      const successMsg = `✅ *Equipment Purchased!*\n\nItem: ${itemName.replace(/_/g, ' ')}\nCost: ₦${equipment.price.toLocaleString()}\nDurability: ${equipment.durability}\nRevenue Boost: ${Math.round((equipment.boost.revenue - 1) * 100)}%\n\nTip: Hire a technician to reduce equipment wear!`;
      await sock.sendMessage(m.from, { text: successMsg });
    });
  } catch (error) {
    console.error(chalk.red('❌ Club buy error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Failed to purchase equipment.'
    });
  } finally {
    await session.endSession();
    await client.close();
  }
}

async function handleClubRepair(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, {
      text: '❌ Please specify equipment to repair!\n\n*Usage:* /club repair <equipment_name>'
    });
    return;
  }
  
  const itemName = args.join('_').toLowerCase();
  
  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(process.env.MONGO_URI, { useUnifiedTopology: true });
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const clubsCollection = client.db().collection('clubs');
      const club = await clubsCollection.findOne({ userId }, { session });
      if (!club) {
        await sock.sendMessage(m.from, {
          text: '❌ You don\'t own a club!'
        });
        await session.abortTransaction();
        return;
      }
      const equipment = club.equipment || [];
      const itemIndex = equipment.findIndex(eq => eq.type === itemName);
      if (itemIndex === -1) {
        await sock.sendMessage(m.from, {
          text: `❌ You don't own "${itemName.replace(/_/g, ' ')}" equipment!`
        });
        await session.abortTransaction();
        return;
      }
      const item = equipment[itemIndex];
      if (!item.broken && item.currentDurability >= item.maxDurability * 0.9) {
        await sock.sendMessage(m.from, {
          text: `❌ "${itemName.replace(/_/g, ' ')}" doesn't need repair!\n\nCurrent durability: ${item.currentDurability}/${item.maxDurability}`
        });
        await session.abortTransaction();
        return;
      }
      // Calculate repair cost (50% of original price)
      const equipmentConfig = GAME_CONFIG.EQUIPMENT[itemName];
      const repairCost = Math.floor(equipmentConfig.price * 0.5);
      const userBalance = await PluginHelpers.getBalance(userId);
      if (userBalance.wallet < repairCost) {
        await sock.sendMessage(m.from, {
          text: `❌ Insufficient funds for repair!\n\n*Repair Cost:* ₦${repairCost.toLocaleString()}\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`
        });
        await session.abortTransaction();
        return;
      }
      // Deduct money and repair equipment atomically
      await unifiedUserManager.removeMoney(userId, repairCost, `Repair: ${itemName}`, { session });
      equipment[itemIndex].currentDurability = item.maxDurability;
      equipment[itemIndex].broken = false;
      equipment[itemIndex].timesRepaired = (item.timesRepaired || 0) + 1;
      equipment[itemIndex].lastRepairedAt = new Date();
      await clubsCollection.updateOne(
        { userId },
        {
          $set: {
            equipment: equipment,
            updatedAt: new Date()
          }
        },
        { session }
      );
      const successMsg = `🔧 *Equipment Repaired!*\n\nItem: ${itemName.replace(/_/g, ' ')}\nCost: ₦${repairCost.toLocaleString()}\nNew Durability: ${item.maxDurability}/${item.maxDurability}\nTimes Repaired: ${equipment[itemIndex].timesRepaired}\n\nYour equipment is now fully operational!`;
      await sock.sendMessage(m.from, { text: successMsg });
    });
  } catch (error) {
    console.error(chalk.red('❌ Club repair error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Failed to repair equipment.'
    });
  } finally {
    await session.endSession();
    await client.close();
  }
}

async function handleClubHire(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, {
      text: '❌ Please specify staff type to hire!\n\n*Usage:* /club hire <staff_type>\n\n*Available Staff:*\n' + 
        Object.keys(GAME_CONFIG.STAFF).map(s => `• ${s}`).join('\n')
    });
    return;
  }
  
  // Sanitize staff type: allow only letters and underscores
  const staffType = args[0].replace(/[^a-zA-Z_]/g, '').toLowerCase();

  try {
    const clubsCollection = await getCollection('clubs');
    const club = await clubsCollection.findOne({ userId });
    if (!club) {
      await sock.sendMessage(m.from, { text: '❌ You don\'t own a club!' });
      return;
    }
    const staffConfig = GAME_CONFIG.STAFF[staffType];
    if (!staffConfig) {
      await sock.sendMessage(m.from, { text: `❌ Staff type "${staffType}" not found!\n\n*Available:* ${Object.keys(GAME_CONFIG.STAFF).join(', ')}` });
      return;
    }
    // Check if already have this type of staff (limit 2 per type)
    const existingStaff = (club.staff || []).filter(s => s.type === staffType);
    if (existingStaff.length >= 2) {
      await sock.sendMessage(m.from, { text: `❌ You already have maximum ${staffType}s (2 max per type)!\n\nUse \`/club fire ${staffType}\` to make room.` });
      return;
    }
    // Hiring cost (4 weeks salary upfront)
    const hiringCost = staffConfig.salary * 4;
    const userBalance = await PluginHelpers.getBalance(userId);
    if (userBalance.wallet < hiringCost) {
      await sock.sendMessage(m.from, { text: `❌ Insufficient funds to hire ${staffType}!\n\n*Cost:* ₦${hiringCost.toLocaleString()} (4 weeks salary)\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}` });
      return;
    }
    // Special requirements check
    if (staffType === 'stripper') {
      const hasAdultLicense = (club.licenses || []).some(l => l.type === 'adult_entertainment' && l.active);
      if (!hasAdultLicense) {
        await sock.sendMessage(m.from, { text: '❌ You need an active adult entertainment license to hire strippers!\n\nUse `/club license adult_entertainment` first.' });
        return;
      }
    }
    // Generate random staff name
    const names = {
      dj: ['DJ Mike', 'DJ Sarah', 'DJ Alex', 'DJ Luna', 'DJ Storm'],
      bartender: ['Carlos', 'Maria', 'Tony', 'Lisa', 'Jake'],
      bouncer: ['Big Joe', 'Marcus', 'Steel', 'Bruno', 'Tank'],
      cleaner: ['Rosa', 'Ahmed', 'Grace', 'Pedro', 'Kim'],
      stripper: ['Diamond', 'Cherry', 'Angel', 'Raven', 'Candy'],
      waitress: ['Sophie', 'Emma', 'Olivia', 'Mia', 'Ava'],
      technician: ['Tech Sam', 'Engineer Bob', 'Geek Paul', 'Pro Lisa', 'Wizard John']
    };
    const randomName = names[staffType][Math.floor(Math.random() * names[staffType].length)];
    // --- Begin Transaction ---
    const { MongoClient } = require('mongodb');
    const client = await MongoClient.connect(process.env.MONGO_URI, { useUnifiedTopology: true });
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const clubsCollection = client.db().collection('clubs');
        await unifiedUserManager.removeMoney(userId, hiringCost, `Hire ${staffType}: ${randomName}`, { session });
        const newStaff = {
          type: staffType,
          name: randomName,
          hiredAt: new Date(),
          weeksHired: 4,
          performance: Math.floor(Math.random() * 20) + 80,
          salary: staffConfig.salary
        };
        await clubsCollection.updateOne(
          { userId },
          {
            $push: { staff: newStaff },
            $set: { updatedAt: new Date() }
          },
          { session }
        );
        const successMsg = `✅ *Staff Hired Successfully!*\n\n👤 *Name:* ${randomName}\n💼 *Position:* ${staffType}\n💰 *Cost:* ₦${hiringCost.toLocaleString()} (4 weeks prepaid)\n📊 *Performance:* ${newStaff.performance}%\n📈 *Revenue Boost:* ${Math.round((staffConfig.boost.revenue - 1) * 100)}%\n\n🎉 ${randomName} is now working at your club!`;
        await sock.sendMessage(m.from, { text: successMsg });
      });
    } catch (error) {
      console.error(chalk.red('❌ Club hire error:'), error.message);
      await sock.sendMessage(m.from, { text: '❌ Failed to hire staff.' });
    } finally {
      await session.endSession();
      await client.close();
    }
  } catch (error) {
    console.error(chalk.red('❌ Club hire error:'), error.message);
    await sock.sendMessage(m.from, { text: '❌ Failed to hire staff.' });
  }
}

async function handleClubLicense(m, sock, args, userId) {
  if (args.length === 0) {
    let licenseMsg = `📋 *Available Licenses*
━━━━━━━━━━━━━━━━━━━

`;
    
    Object.entries(GAME_CONFIG.LICENSES).forEach(([key, license]) => {
      const required = license.required ? ' ⚠️ *REQUIRED*' : '';
      licenseMsg += `🏷️ *${key.replace(/_/g, ' ')}*${required}
• Price: ₦${license.price.toLocaleString()}
• Duration: ${license.duration} days
• ${license.description}

`;
    });
    
    licenseMsg += `*Usage:* \`/club license <type>\``;
    
    await sock.sendMessage(m.from, { text: licenseMsg });
    return;
  }
  
  const licenseType = args[0].toLowerCase();
  
  try {
    const clubsCollection = await getCollection('clubs');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You don\'t own a club!'
      });
      return;
    }
    
    const licenseConfig = GAME_CONFIG.LICENSES[licenseType];
    if (!licenseConfig) {
      await sock.sendMessage(m.from, {
        text: `❌ License type "${licenseType}" not found!\n\n*Available:* ${Object.keys(GAME_CONFIG.LICENSES).join(', ')}`
      });
      return;
    }
    
    // Check if already has active license
    const existingLicense = (club.licenses || []).find(l => l.type === licenseType && l.active);
    if (existingLicense) {
      const daysLeft = Math.ceil((new Date(existingLicense.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
      await sock.sendMessage(m.from, {
        text: `❌ You already have an active ${licenseType} license!\n\nExpires in: ${daysLeft} days\n\nLet it expire before purchasing a new one.`
      });
      return;
    }
    
    const userBalance = await PluginHelpers.getBalance(userId);
    
    if (userBalance.wallet < licenseConfig.price) {
      await sock.sendMessage(m.from, {
        text: `❌ Insufficient funds!\n\n*License:* ${licenseType}\n*Price:* ₦${licenseConfig.price.toLocaleString()}\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`
      });
      return;
    }
    
    // Purchase license
    await unifiedUserManager.removeMoney(userId, licenseConfig.price, `License: ${licenseType}`);
    
    const newLicense = {
      type: licenseType,
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + licenseConfig.duration * 24 * 60 * 60 * 1000),
      active: true,
      price: licenseConfig.price
    };
    
    await clubsCollection.updateOne(
      { userId },
      { 
        $push: { licenses: newLicense },
        $set: { updatedAt: new Date() }
      }
    );
    
    const successMsg = `✅ *License Purchased!*

📋 *Type:* ${licenseType.replace(/_/g, ' ')}
💰 *Cost:* ₦${licenseConfig.price.toLocaleString()}
⏰ *Duration:* ${licenseConfig.duration} days
📅 *Expires:* ${moment(newLicense.expiresAt).tz('Africa/Lagos').format('DD/MM/YYYY')}

${licenseConfig.required ? '🎉 Your club can now operate legally!' : '🌟 This license unlocks new opportunities!'}`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club license error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Failed to purchase license.'
    });
  }
}

async function handleClubHost(m, sock, args, userId) {
  if (args.length === 0) {
    let eventMsg = `🎪 *Available Events*
━━━━━━━━━━━━━━━━━━━

`;
    
    Object.entries(GAME_CONFIG.EVENTS).forEach(([key, event]) => {
      eventMsg += `🎉 *${key.replace(/_/g, ' ')}*
• Cost: ₦${event.cost.toLocaleString()}
• Duration: ${event.duration} hours
• Min Equipment: ${event.min_equipment}
• Revenue Multiplier: ${event.revenue_multiplier}x

`;
    });
    
    eventMsg += `*Usage:* \`/club host <event_type>\``;
    
    await sock.sendMessage(m.from, { text: eventMsg });
    return;
  }
  
  const eventType = args[0].toLowerCase();
  
  try {
    const clubsCollection = await getCollection('clubs');
    const club = await clubsCollection.findOne({ userId });
    
    if (!club) {
      await sock.sendMessage(m.from, {
        text: '❌ You don\'t own a club!'
      });
      return;
    }
    
    const eventConfig = GAME_CONFIG.EVENTS[eventType];
    if (!eventConfig) {
      await sock.sendMessage(m.from, {
        text: `❌ Event type "${eventType}" not found!\n\n*Available:* ${Object.keys(GAME_CONFIG.EVENTS).join(', ')}`
      });
      return;
    }
    
    // Check if club has business license
    const hasBusinessLicense = (club.licenses || []).some(l => l.type === 'business' && l.active);
    if (!hasBusinessLicense) {
      await sock.sendMessage(m.from, {
        text: '❌ You need an active business license to host events!\n\nUse `/club license business` first.'
      });
      return;
    }
    
    // Check equipment requirements
    const workingEquipment = (club.equipment || []).filter(e => !e.broken);
    if (workingEquipment.length < eventConfig.min_equipment) {
      await sock.sendMessage(m.from, {
        text: `❌ Not enough working equipment!\n\n*Required:* ${eventConfig.min_equipment} working equipment\n*You have:* ${workingEquipment.length}\n\nBuy more equipment or repair broken ones.`
      });
      return;
    }
    
    const userBalance = await PluginHelpers.getBalance(userId);
    
    if (userBalance.wallet < eventConfig.cost) {
      await sock.sendMessage(m.from, {
        text: `❌ Insufficient funds!\n\n*Event:* ${eventType}\n*Cost:* ₦${eventConfig.cost.toLocaleString()}\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`
      });
      return;
    }
    
    // Calculate event revenue
    let baseRevenue = eventConfig.cost * eventConfig.revenue_multiplier;
    
    // Apply equipment and staff bonuses
    for (const equipment of workingEquipment) {
      const config = GAME_CONFIG.EQUIPMENT[equipment.type];
      if (config) {
        baseRevenue *= config.boost.revenue || 1.0;
      }
    }
    
    for (const staff of club.staff || []) {
      const config = GAME_CONFIG.STAFF[staff.type];
      if (config) {
        baseRevenue *= config.boost.revenue || 1.0;
      }
    }
    
    const finalRevenue = Math.floor(baseRevenue);
    const profit = finalRevenue - eventConfig.cost;
    
    // Host the event
    await unifiedUserManager.removeMoney(userId, eventConfig.cost, `Host event: ${eventType}`);
    await unifiedUserManager.addMoney(userId, Math.floor(finalRevenue * 0.4), `Event revenue: ${eventType}`);
    
    // Update club stats
    await clubsCollection.updateOne(
      { userId },
      { 
        $inc: { 
          balance: finalRevenue,
          totalRevenue: finalRevenue,
          weeklyRevenue: finalRevenue,
          weeklyEvents: 1
        },
        $set: { 
          lastEventAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    // Small chance of equipment breakdown during event
    if (Math.random() < 0.1) {
      const randomEquipment = workingEquipment[Math.floor(Math.random() * workingEquipment.length)];
      randomEquipment.currentDurability = Math.max(0, randomEquipment.currentDurability - 10);
      
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
    
    const successMsg = `🎉 *Event Hosted Successfully!*

🎪 *Event:* ${eventType.replace(/_/g, ' ')}
💰 *Investment:* ₦${eventConfig.cost.toLocaleString()}
📈 *Revenue:* ₦${finalRevenue.toLocaleString()}
💵 *Profit:* ₦${profit.toLocaleString()}
⏰ *Duration:* ${eventConfig.duration} hours

${profit > 0 ? '🎊 Great success! Your club is thriving!' : '📉 Consider improving equipment and staff for better returns.'}`;

    await sock.sendMessage(m.from, { text: successMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club host error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Failed to host event.'
    });
  }
}

async function handleClubBillboard(m, sock, userId) {
  try {
    const billboardCollection = await getCollection('club_billboard');
    const latestBillboard = await billboardCollection.findOne({}, { sort: { updatedAt: -1 } });
    
    if (!latestBillboard) {
      await sock.sendMessage(m.from, {
        text: '📊 No billboard data available yet!\n\nCheck back after the first weekly update.'
      });
      return;
    }
    
    let billboardMsg = `📊 *Weekly Club Billboard*
Week ${latestBillboard.week}, ${latestBillboard.year}
━━━━━━━━━━━━━━━━━━━

🏆 *TOP EARNERS*

`;

    latestBillboard.topEarners.slice(0, 10).forEach((club, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      billboardMsg += `${medal} *${club.clubName}*
   Owner: @${club.owner}
   Revenue: ₦${club.revenue.toLocaleString()}
   Rating: ${club.rating}/100 ${getRatingEmoji(club.rating)}
   Events: ${club.events}

`;
    });
    
    // Check user's position
    const userClub = latestBillboard.topEarners.find(c => c.owner === userId.split('@')[0]);
    if (userClub) {
      billboardMsg += `📍 *Your Position:* #${userClub.rank}`;
    } else {
      billboardMsg += `📍 *Your club not in top 10*`;
    }
    
    billboardMsg += `\n\n💡 *Tip:* Host more events and improve your equipment to climb the rankings!`;
    
    await sock.sendMessage(m.from, { text: billboardMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club billboard error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Failed to load billboard.'
    });
  }
}

async function showClubHelp(m, sock, prefix) {
  const helpMsg = `🏢 *Club Management System*
━━━━━━━━━━━━━━━━━━━

🏗️ *GETTING STARTED*
• \`${prefix}club register <n>\` - Start your club business
• \`${prefix}club info\` - View your club details
• \`${prefix}club market\` - Browse equipment & staff

💼 *MANAGEMENT*
• \`${prefix}club buy <item>\` - Purchase equipment
• \`${prefix}club repair <item>\` - Fix broken equipment
• \`${prefix}club hire <staff>\` - Hire staff members
• \`${prefix}club fire <staff>\` - Fire staff members

📋 *OPERATIONS*
• \`${prefix}club license <type>\` - Buy permits & licenses
• \`${prefix}club host <event>\` - Host events for revenue
• \`${prefix}club upgrade <area>\` - Club improvements

📊 *COMPETITION*
• \`${prefix}club billboard\` - View weekly rankings
• \`${prefix}club compete <club>\` - Challenge rival clubs
• \`${prefix}club sabotage <club>\` - Corporate espionage
• \`${prefix}club takeover <club>\` - Acquire failing clubs

💡 *Tips:*
• Business license is mandatory to operate
• Hire technicians to reduce equipment wear
• Host regular events to build reputation
• Monitor equipment durability closely

🎮 *Welcome to the ultimate club simulation!*`;

  await sock.sendMessage(m.from, { text: helpMsg });
}

// Helper function for rating emojis
function getRatingEmoji(rating) {
  if (rating >= 90) return '🌟';
  if (rating >= 75) return '⭐';
  if (rating >= 50) return '🔶';
  if (rating >= 25) return '🔸';
  return '🔻';
}

// Additional command handlers for advanced features
async function handleClubCompete(m, sock, args, userId) {
  // Implementation for club competitions/battles
  await sock.sendMessage(m.from, {
    text: '🚧 Competition system coming soon!\n\nCompete with other clubs for customers and prestige.'
  });
}

async function handleClubSabotage(m, sock, args, userId) {
  // Implementation for sabotage mechanics
  await sock.sendMessage(m.from, {
    text: '🚧 Sabotage system coming soon!\n\nEngage in corporate espionage and dirty tactics.'
  });
}

async function handleClubTakeover(m, sock, args, userId) {
  // Implementation for hostile takeovers
  await sock.sendMessage(m.from, {
    text: '🚧 Takeover system coming soon!\n\nAcquire struggling competitor clubs.'
  });
}

async function handleClubUpgrade(m, sock, args, userId) {
  // Implementation for club upgrades
  if (args.length === 0) {
    let upgradeMsg = `🏗️ *Available Upgrades*
━━━━━━━━━━━━━━━━━━━

`;
    
    Object.entries(GAME_CONFIG.UPGRADES).forEach(([key, upgrade]) => {
      upgradeMsg += `🏢 *${key.replace(/_/g, ' ')}*
• Price: ₦${upgrade.price.toLocaleString()}
• Revenue Boost: ${Math.round((upgrade.boost.revenue - 1) * 100)}%
• Happiness Boost: ${Math.round(upgrade.boost.happiness * 100)}%

`;
    });
    
    upgradeMsg += `*Usage:* \`/club upgrade <upgrade_name>\``;
    
    await sock.sendMessage(m.from, { text: upgradeMsg });
    return;
  }
  
  await sock.sendMessage(m.from, {
    text: '🚧 Upgrade purchase system coming in next update!'
  });
}

async function handleClubFire(m, sock, args, userId) {
  if (args.length === 0) {
    await sock.sendMessage(m.from, {
      text: '❌ Please specify staff member to fire!\n\n*Usage:* /club fire <staff_type> or /club fire <staff_name>'
    });
    return;
  }
  
  await sock.sendMessage(m.from, {
    text: '🚧 Staff firing system coming soon!\n\nManage your workforce more effectively.'
  });
}

async function handleClubLeaderboard(m, sock, userId) {
  try {
    const clubsCollection = await getCollection('clubs');
    const topClubs = await clubsCollection
      .find({})
      .sort({ totalRevenue: -1 })
      .limit(15)
      .toArray();
    
    if (topClubs.length === 0) {
      await sock.sendMessage(m.from, {
        text: '📊 No clubs registered yet!\n\nBe the first to start a club empire!'
      });
      return;
    }
    
    let leaderboardMsg = `🏆 *All-Time Club Leaderboard*
━━━━━━━━━━━━━━━━━━━

`;

    topClubs.forEach((club, index) => {
      const medal = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const rating = calculateClubRating(club);
      
      leaderboardMsg += `${medal} *${club.name}*
   Owner: @${club.userId.split('@')[0]}
   Total Revenue: ₦${club.totalRevenue.toLocaleString()}
   Rating: ${rating}/100 ${getRatingEmoji(rating)}
   Equipment: ${(club.equipment || []).length}
   Staff: ${(club.staff || []).length}

`;
    });
    
    // Find user's position
    const userClub = topClubs.find(c => c.userId === userId);
    const userPosition = userClub ? topClubs.indexOf(userClub) + 1 : null;
    
    if (userPosition) {
      leaderboardMsg += `📍 *Your Position:* #${userPosition}`;
    } else {
      leaderboardMsg += `📍 *Your club not in top 15*`;
    }
    
    await sock.sendMessage(m.from, { text: leaderboardMsg });
    
  } catch (error) {
    console.error(chalk.red('❌ Club leaderboard error:'), error.message);
    await sock.sendMessage(m.from, {
      text: '❌ Failed to load leaderboard.'
    });
  }
}