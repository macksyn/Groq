// plugins/club_management.js - Complete Club Business Simulation Game (V3)
import chalk from "chalk";
import moment from "moment-timezone";
import {
  PluginHelpers,
  unifiedUserManager,
  safeOperation,
  getCollection,
} from "../lib/pluginIntegration.js";

// Simple in-memory rate limiter (per user, per command)
const rateLimitStore = {};
const RATE_LIMIT_WINDOW = 10 * 1000; // 10 seconds
const RATE_LIMIT_MAX = 3; // max 3 commands per window

function isRateLimited(userId, command) {
  const now = Date.now();
  if (!rateLimitStore[userId]) rateLimitStore[userId] = {};
  if (!rateLimitStore[userId][command]) rateLimitStore[userId][command] = [];
  // Remove expired timestamps
  rateLimitStore[userId][command] = rateLimitStore[userId][command].filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW,
  );
  if (rateLimitStore[userId][command].length >= RATE_LIMIT_MAX) return true;
  rateLimitStore[userId][command].push(now);
  return false;
}

// Store selection context: messageId -> { type, options, handler }
const selectionContextStore = {};

function storeSelectionContext(messageId, type, options, handler) {
  selectionContextStore[messageId] = {
    type,
    options,
    handler,
    createdAt: Date.now(),
  };
  // Clean up old contexts after 30 minutes
  setTimeout(
    () => {
      delete selectionContextStore[messageId];
    },
    30 * 60 * 1000,
  );
}

function getSelectionContext(messageId) {
  return selectionContextStore[messageId];
}

// ============================================================
// V3 PLUGIN EXPORT (Required Structure)
// ============================================================

export default {
  name: "Club Management",
  version: "3.0.0",
  author: "Bot Developer",
  description:
    "Complete club business simulation with licensing, equipment, staff, and revenue management",
  category: "business",
  commands: ["club"],
  // allow play and rank via main command arguments
  aliases: [],
  scheduledTasks: [
    {
      name: "equipment_breakdown",
      schedule: "0 */6 * * *", // Every 6 hours
      description: "Process equipment degradation and breakdowns",
      handler: async (context) => await processEquipmentBreakdown(context),
    },
    {
      name: "license_check",
      schedule: "0 0 * * 1", // Every Monday at midnight
      description: "Check license renewals and apply penalties",
      handler: async (context) => await processLicenseRenewals(context),
    },
    {
      name: "aggregate_economy_sinks",
      schedule: "0 1 * * 0", // Weekly Sunday 01:00
      description: "Aggregate weekly economy sink totals",
      handler: async (context) => await aggregateEconomySinks(context),
    },
    {
      name: "weekly_billboard",
      schedule: "0 0 * * 0", // Every Sunday at midnight
      description: "Update weekly billboard rankings",
      handler: async (context) => await updateWeeklyBillboard(context),
    },
    {
      name: "revenue_generation",
      schedule: "0 */4 * * *", // Every 4 hours
      description: "Generate passive revenue for active clubs",
      handler: async (context) => await generatePassiveRevenue(context),
    },
    {
      name: "celebrity_availability_update",
      schedule: "0 0 * * *", // Daily at midnight
      description: "Randomize celebrity availability",
      handler: async (context) => await updateCelebrityAvailability(context),
    },
    {
      name: "utilities_deduction",
      schedule: "0 0 * * 0", // Weekly Sunday
      description: "Deduct utilities and rent",
      handler: async (context) => await deductUtilities(context),
    },
    {
      name: "daily_decisions",
      schedule: "0 0 * * *", // Daily at midnight
      description: "Assign daily decisions to active clubs",
      handler: async (context) => await assignDailyDecisions(context),
    },
    {
      name: "club_visibility_decay",
      schedule: "0 0 * * *", // Daily at midnight
      description: "Decay club visibility and process PR campaigns",
      handler: async (context) => await processVisibilityDecay(context),
    },
  ],

  // ===== V3 Main Handler =====
  async run(context) {
    // Destructure the V3 context object
    const {
      msg: m,
      args,
      text,
      command,
      sock,
      db,
      config,
      bot,
      logger,
      helpers,
    } = context;

    if (!m.body || !m.body.startsWith(config.PREFIX)) return;

    const subCommand = args[0]?.toLowerCase();
    const userId = (m.key && (m.key.participant || m.key.remoteJid)) || m.sender;

    // Check if this is a quoted selection (user is quoting a message with just a number)
    if (m.quoted && m.quoted.text) {
      const selectionNumber = parseInt(m.body.trim(), 10);
      if (!isNaN(selectionNumber) && selectionNumber > 0) {
        const context = getSelectionContext(m.quoted.id);
        if (context) {
          // This is a selection response!
          if (selectionNumber <= context.options.length) {
            try {
              await context.handler(selectionNumber, m, sock, userId, db);
              return;
            } catch (error) {
              console.error(
                chalk.red("❌ Selection handler error:"),
                error.message,
              );
              await m.reply(
                "❌ An error occurred while processing your selection. Please try again.",
              );
              return;
            }
          } else {
            await m.reply(
              `❌ Invalid selection! Please choose a number between 1 and ${context.options.length}.`,
            );
            return;
          }
        }
      }
    }

    // Rate limiting
    if (isRateLimited(userId, subCommand)) {
      await m.reply(
        "⏳ You are sending commands too quickly. Please wait a few seconds.",
      );
      return;
    }

    try {
      switch (subCommand) {
        case "register":
          await handleClubRegister(m, sock, args.slice(1), userId, db);
          break;
        case "info":
          await handleClubInfo(m, sock, userId, db);
          break;
        case "buy":
          await handleClubBuy(m, sock, args.slice(1), userId, db);
          break;
        case "repair":
          await handleClubRepair(m, sock, args.slice(1), userId, db);
          break;
        case "hire":
          await handleClubHire(m, sock, args.slice(1), userId, db);
          break;
        case "fire":
          await handleClubFire(m, sock, args.slice(1), userId, db);
          break;
        case "host":
          await handleClubHost(m, sock, args.slice(1), userId, db);
          break;
        case "play":
          await handleClubPlay(m, sock, args.slice(1), userId, db);
          break;
        case "rank":
          await handleClubRank(m, sock, args.slice(1), userId, db);
          break;
        case "billboard":
          await handleClubBillboard(m, sock, userId, db);
          break;
        case "market":
          await handleClubMarket(m, sock, userId, db);
          break;
        case "compete":
          await handleClubCompete(m, sock, args.slice(1), userId, db);
          break;
        case "sabotage":
          await handleClubSabotage(m, sock, args.slice(1), userId, db);
          break;
        case "takeover":
          await handleClubTakeover(m, sock, args.slice(1), userId, db);
          break;
        case "license":
          await handleClubLicense(m, sock, args.slice(1), userId, db);
          break;
        case "upgrade":
          await handleClubUpgrade(m, sock, args.slice(1), userId, db);
          break;
        case "leaderboard":
          await handleClubLeaderboard(m, sock, userId, db);
          break;
        case "book":
          await handleClubBook(m, sock, args.slice(1), userId, db);
          break;
        case "decision":
          await handleClubDecision(m, sock, args.slice(1), userId, db);
          break;
        case "pr":
          await handleClubPR(m, sock, args.slice(1), userId, db);
          break;
        default:
          await showClubHelp(m, sock, config.PREFIX);
          break;
      }
    } catch (error) {
      logger.error(error, "❌ Club management error");
      await m.reply(
        "❌ An error occurred while processing your club command. Please try again.",
      );
    }
  },
};

// Game data and configurations - Updated with real brands, celebrities, and high prices
const GAME_CONFIG = {
  EQUIPMENT: {
    // Sound Equipment (High-end, expensive for economy drain)
    jbl_speakers: {
      price: 50000000,
      durability: 150,
      category: "sound",
      boost: { revenue: 1.3, happiness: 0.12 },
      displayName: "JBL Speakers",
    },
    yamaha_speakers: {
      price: 45000000,
      durability: 140,
      category: "sound",
      boost: { revenue: 1.25, happiness: 0.1 },
      displayName: "Yamaha Speakers",
    },
    pioneer_dj_booth: {
      price: 80000000,
      durability: 130,
      category: "sound",
      boost: { revenue: 1.4, happiness: 0.15 },
      displayName: "Pioneer DJ Booth",
    },
    bose_system: {
      price: 120000000,
      durability: 160,
      category: "sound",
      boost: { revenue: 1.5, happiness: 0.18 },
      displayName: "Bose System",
    },

    // Lighting
    chauvet_beam: {
      price: 60000000,
      durability: 120,
      category: "lighting",
      boost: { revenue: 1.35, happiness: 0.14 },
      displayName: "Chauvet Beam",
    },
    martin_lights: {
      price: 100000000,
      durability: 150,
      category: "lighting",
      boost: { revenue: 1.45, happiness: 0.16 },
      displayName: "Martin Lights",
    },

    // Furniture & Comfort
    vip_booths: {
      price: 30000000,
      durability: 200,
      category: "furniture",
      boost: { revenue: 1.25, happiness: 0.1 },
      displayName: "VIP Booths",
    },
    bar_stools: {
      price: 15000000,
      durability: 180,
      category: "furniture",
      boost: { revenue: 1.15, happiness: 0.08 },
      displayName: "Bar Stools",
    },

    // Security
    hikvision_camera: {
      price: 20000000,
      durability: 200,
      category: "security",
      boost: { revenue: 1.2, happiness: 0.1 },
      displayName: "Hikvision Camera",
    },
    samsung_monitor: {
      price: 35000000,
      durability: 180,
      category: "security",
      boost: { revenue: 1.25, happiness: 0.12 },
      displayName: "Samsung Monitor",
    },
  },

  STAFF: {
    dj: {
      salary: 8000000,
      boost: { revenue: 1.25, happiness: 0.1 },
      specialty: "entertainment",
    },
    bartender: {
      salary: 1000000,
      boost: { revenue: 1.15, happiness: 0.06 },
      specialty: "service",
    },
    bouncer: {
      salary: 4000000,
      boost: { revenue: 1.05, happiness: 0.08 },
      specialty: "security",
    },
    cleaner: {
      salary: 1200000,
      boost: { revenue: 1.03, happiness: 0.04 },
      specialty: "maintenance",
    },
    stripper: {
      salary: 10000000,
      boost: { revenue: 1.4, happiness: 0.15 },
      specialty: "adult_entertainment",
    },
    waitress: {
      salary: 4000000,
      boost: { revenue: 1.12, happiness: 0.05 },
      specialty: "service",
    },
    technician: {
      salary: 7000000,
      boost: { revenue: 1.08, maintenance: 0.2 },
      specialty: "technical",
    },
  },

  LICENSES: {
    business: {
      price: 500000000,
      duration: 90,
      required: true,
      description: "Basic business operation license",
    },
    liquor: {
      price: 75000000,
      duration: 90,
      required: false,
      description: "Alcohol serving permit",
    },
    adult_entertainment: {
      price: 200000000,
      duration: 30,
      required: false,
      description: "Adult entertainment license",
    },
    noise_permit: {
      price: 25000000,
      duration: 90,
      required: false,
      description: "Late night noise permit",
    },
    food_service: {
      price: 4000000,
      duration: 90,
      required: false,
      description: "Food service permit",
    },
  },

  UPGRADES: {
    premium_interior: {
      price: 80000000,
      boost: { revenue: 1.3, happiness: 0.12 },
    },
    vip_lounge: { price: 120000000, boost: { revenue: 1.5, happiness: 0.18 } },
    rooftop_terrace: {
      price: 150000000,
      boost: { revenue: 1.4, happiness: 0.15 },
    },
    private_rooms: {
      price: 200000000,
      boost: { revenue: 1.6, happiness: 0.2 },
    },
  },

  EVENTS: {
    house_party: {
      cost: 5000000,
      duration: 4,
      min_equipment: 2,
      revenue_multiplier: 1.2,
    },
    themed_night: {
      cost: 8000000,
      duration: 6,
      min_equipment: 3,
      revenue_multiplier: 1.4,
    },
    concert: {
      cost: 15000000,
      duration: 8,
      min_equipment: 5,
      revenue_multiplier: 1.8,
    },
    exclusive_event: {
      cost: 25000000,
      duration: 12,
      min_equipment: 8,
      revenue_multiplier: 2.5,
    },
  },
  // Consumables and risk mode configs
  CONSUMABLES: {
    insurance: {
      price: 500000000,
      description:
        "Prevents full loss on failed events (consumed on failure, refunds 50%).",
    },
  },

  // Club Visibility & PR System
  PR_ACTIVITIES: {
    social_media: {
      name: "📱 Social Media Campaign",
      cost: 50000000,
      visibility_gain: 10,
      duration_hours: 2,
      description: "Post on social platforms to boost visibility",
    },
    billboard: {
      name: "🎨 Billboard Advertisement",
      cost: 150000000,
      visibility_gain: 15,
      duration_hours: 4,
      description: "Large outdoor billboard in high-traffic area",
    },
    influencer_collab: {
      name: "⭐ Influencer Collaboration",
      cost: 300000000,
      visibility_gain: 25,
      duration_hours: 6,
      description: "Partner with local social media influencer",
    },
    grand_event: {
      name: "🎪 Grand Opening Event",
      cost: 500000000,
      visibility_gain: 35,
      duration_hours: 8,
      description: "Massive promotional event with giveaways",
    },
  },

  RISK_MODES: {
    safe: {
      label: "safe",
      successChance: 0.95,
      payoutMultiplier: 0.9,
      cooldownMs: 30 * 60 * 1000,
      attemptsPerDay: 10,
      minLevel: 1,
    },
    standard: {
      label: "standard",
      successChance: 0.85,
      payoutMultiplier: 1.0,
      cooldownMs: 20 * 60 * 1000,
      attemptsPerDay: 6,
      minLevel: 1,
    },
    high: {
      label: "high",
      successChance: 0.5,
      payoutMultiplier: 1.6,
      cooldownMs: 120 * 60 * 1000,
      attemptsPerDay: 2,
      minLevel: 5,
    },
  },
  LEVELS: {
    baseXp: 100,
    // gentler progression curve so players can reach level 11 reasonably
    formula: (lvl) => Math.max(200, Math.floor(500 * Math.pow(1.35, lvl - 1))),
  },
  RANKS: [
    { name: "Newbie", minLevel: 1 },
    { name: "Rookie", minLevel: 3 },
    { name: "Amateur", minLevel: 6 },
    { name: "Hustler", minLevel: 10 },
    { name: "Veteran", minLevel: 15 },
    { name: "Legend", minLevel: 20 },
    { name: "Pro", minLevel: 25 },
    { name: "Elite", minLevel: 30 },
    { name: "Master", minLevel: 35 },
    { name: "Tycoon", minLevel: 40 },
    { name: "Legend", minLevel: 45 },
  ],

  SKILL_GAMES: {
    guess: {
      description: "Guess a number 1-6. Usage: /club play guess <number>",
    },
    math: {
      description:
        "Solve a quick math: supply the result. Usage: /club play math <answer>",
    },
  },

  CELEBRITIES: {
    burna_boy: {
      fee: 8000000,
      boost: { revenue: 2.5, happiness: 0.3 },
      availability: 0.5,
      genre: "afro_fusion",
    },
    wizkid: {
      fee: 7000000,
      boost: { revenue: 2.3, happiness: 0.28 },
      availability: 0.6,
      genre: "afrobeats",
    },
    davido: {
      fee: 6500000,
      boost: { revenue: 2.2, happiness: 0.25 },
      availability: 0.7,
      genre: "afrobeats",
    },
    rema: {
      fee: 4000000,
      boost: { revenue: 2.0, happiness: 0.22 },
      availability: 0.8,
      genre: "afro_rave",
    },
    fireboy_dml: {
      fee: 3000000,
      boost: { revenue: 1.8, happiness: 0.2 },
      availability: 0.85,
      genre: "afrobeats_rnb",
    },
    asake: {
      fee: 3500000,
      boost: { revenue: 1.9, happiness: 0.21 },
      availability: 0.75,
      genre: "fuji_afrobeats",
    },
    olamide: {
      fee: 2500000,
      boost: { revenue: 1.7, happiness: 0.18 },
      availability: 0.9,
      genre: "street_hop",
    },
    ayra_starr: {
      fee: 3000000,
      boost: { revenue: 1.8, happiness: 0.2 },
      availability: 0.8,
      genre: "afropop_rnb",
    },
    tems: {
      fee: 4500000,
      boost: { revenue: 2.1, happiness: 0.23 },
      availability: 0.7,
      genre: "alternative_rnb",
    },
    tiwa_savage: {
      fee: 4000000,
      boost: { revenue: 2.0, happiness: 0.22 },
      availability: 0.75,
      genre: "afrobeats",
    },
    seyi_vibez: {
      fee: 2000000,
      boost: { revenue: 1.6, happiness: 0.15 },
      availability: 0.9,
      genre: "fuji_street_hop",
    },
    oxlade: {
      fee: 1500000,
      boost: { revenue: 1.5, happiness: 0.14 },
      availability: 0.95,
      genre: "afrobeats_rnb",
    },
    joeboy: {
      fee: 1800000,
      boost: { revenue: 1.55, happiness: 0.16 },
      availability: 0.9,
      genre: "afrobeats_pop",
    },
    omah_lay: {
      fee: 2200000,
      boost: { revenue: 1.65, happiness: 0.17 },
      availability: 0.85,
      genre: "afrobeats_soul",
    },
    ckay: {
      fee: 2500000,
      boost: { revenue: 1.7, happiness: 0.18 },
      availability: 0.8,
      genre: "afrobeats_pop",
    },
    fola: {
      fee: 2800000,
      boost: { revenue: 1.75, happiness: 0.19 },
      availability: 0.82,
      genre: "afrobeats_trap",
    },
    shalipopi: {
      fee: 3200000,
      boost: { revenue: 1.85, happiness: 0.21 },
      availability: 0.78,
      genre: "street_hop_afrobeats",
    },
    bella_shmurda: {
      fee: 2600000,
      boost: { revenue: 1.7, happiness: 0.18 },
      availability: 0.85,
      genre: "street_hop",
    },
    kizz_daniel: {
      fee: 2400000,
      boost: { revenue: 1.65, happiness: 0.17 },
      availability: 0.88,
      genre: "afrobeats_pop",
    },
    zlatan: {
      fee: 2700000,
      boost: { revenue: 1.72, happiness: 0.19 },
      availability: 0.83,
      genre: "street_hop_afrobeats",
    },
    naira_marley: {
      fee: 2300000,
      boost: { revenue: 1.6, happiness: 0.16 },
      availability: 0.85,
      genre: "street_hop",
    },
    reekado_banks: {
      fee: 2200000,
      boost: { revenue: 1.65, happiness: 0.17 },
      availability: 0.87,
      genre: "afrobeats_pop",
    },
    lil_kesh: {
      fee: 2000000,
      boost: { revenue: 1.55, happiness: 0.15 },
      availability: 0.9,
      genre: "street_hop_afrobeats",
    },
    portable: {
      fee: 120000,
      boost: { revenue: 1.7, happiness: 0.18 },
      availability: 0.85,
      genre: "reggae_afrobeats",
    },
    zinoleesky: {
      fee: 2400000,
      boost: { revenue: 1.5, happiness: 0.14 },
      availability: 0.92,
      genre: "afrobeats",
    },
    ayo_maff: {
      fee: 590000,
      boost: { revenue: 1.58, happiness: 0.16 },
      availability: 0.88,
      genre: "afrobeats_trap",
    },
    ruger: {
      fee: 1100000,
      boost: { revenue: 1.62, happiness: 0.17 },
      availability: 0.86,
      genre: "afropop",
    },
    young_john: {
      fee: 1500000,
      boost: { revenue: 1.8, happiness: 0.2 },
      availability: 0.8,
      genre: "afrobeats_rnb",
    },
    bnxn: {
      fee: 1000000,
      boost: { revenue: 1.83, happiness: 0.21 },
      availability: 0.79,
      genre: "afrobeats_rnb",
    },
  },

  UTILITIES_BASE_COST: 20000000, // Base weekly utilities/rent, scales with club size
  INFLATION_RATE: 0.05, // 5% weekly price increase for equipment/licenses

  // Daily Decisions - Big Engagement Boost
  DAILY_DECISIONS: [
    {
      id: "dj_raise",
      emoji: "🎵",
      title: "DJ Demands a Raise",
      situation:
        "Your DJ is demanding a 30% salary increase or threatens to quit.",
      options: [
        {
          emoji: "1️⃣",
          text: "Pay the raise (+happiness, -money)",
          effects: { money: -50000000, happiness: 15, djMorale: 20, xp: 10 },
        },
        {
          emoji: "2️⃣",
          text: "Refuse (risk DJ quitting)",
          effects: { money: 0, happiness: -10, djMorale: -30, xp: 5 },
        },
        {
          emoji: "3️⃣",
          text: "Fire him (short-term save, long-term loss)",
          effects: { money: 25000000, happiness: -20, revenue: -0.2, xp: 15 },
        },
      ],
    },
    {
      id: "noise_complaint",
      emoji: "🚨",
      title: "Noise Complaint Received",
      situation:
        "Neighbors are complaining about loud music. The authorities threaten a fine.",
      options: [
        {
          emoji: "1️⃣",
          text: "Pay bribe to authorities (+no fine, -money)",
          effects: { money: -30000000, violations: -1, xp: 8 },
        },
        {
          emoji: "2️⃣",
          text: "Buy noise permit (expensive, legal)",
          effects: { money: -450000000, violations: -1, happiness: 5, xp: 12 },
        },
        {
          emoji: "3️⃣",
          text: "Ignore it (face ₦100k fine)",
          effects: { money: -400000000, violations: 1, xp: 0 },
        },
      ],
    },
    {
      id: "staff_theft",
      emoji: "💼",
      title: "Staff Member Caught Stealing",
      situation:
        "Your bartender has been skimming cash from the till. What do you do?",
      options: [
        {
          emoji: "1️⃣",
          text: "Let it slide with warning (-reputation)",
          effects: { money: 0, reputation: -10, happiness: -5, xp: 5 },
        },
        {
          emoji: "2️⃣",
          text: "Fire immediately (recover loss)",
          effects: { money: 20000000, reputation: 10, happiness: -15, xp: 15 },
        },
        {
          emoji: "3️⃣",
          text: "Report to police (legal but costly)",
          effects: { money: -1500000, reputation: 20, happiness: -20, xp: 20 },
        },
      ],
    },
    {
      id: "equipment_breakdown",
      emoji: "⚙️",
      title: "Critical Equipment Breakdown",
      situation:
        "Your main DJ booth equipment breaks down right before a major event tonight!",
      options: [
        {
          emoji: "1️⃣",
          text: "Cancel event (save money, lose revenue)",
          effects: { money: 0, revenue: -0.3, xp: 5 },
        },
        {
          emoji: "2️⃣",
          text: "Emergency repair (+money, equipment works)",
          effects: { money: -40000000, revenue: 0.1, xp: 15 },
        },
        {
          emoji: "3️⃣",
          text: "Rent backup equipment (expensive solution)",
          effects: { money: -140000000, revenue: 0.2, xp: 10 },
        },
      ],
    },
    {
      id: "celebrity_offer",
      emoji: "⭐",
      title: "Celebrity Appearance Opportunity",
      situation:
        "A rising celebrity offers to perform at your club for a negotiable fee.",
      options: [
        {
          emoji: "1️⃣",
          text: "Pay full price (guaranteed success)",
          effects: { money: -80000000, revenue: 0.5, happiness: 25, xp: 20 },
        },
        {
          emoji: "2️⃣",
          text: "Negotiate cheaper rate (risky)",
          effects: { money: -40000000, revenue: 0.25, xp: 15 },
        },
        {
          emoji: "3️⃣",
          text: "Decline (miss opportunity)",
          effects: { money: 0, xp: 0 },
        },
      ],
    },
    {
      id: "rival_sabotage",
      emoji: "💣",
      title: "Rival Club Sabotage",
      situation:
        "Your rival club spreads false rumors about your club on social media.",
      options: [
        {
          emoji: "1️⃣",
          text: "Ignore (lose customers)",
          effects: { revenue: -0.15, happiness: -10, xp: 5 },
        },
        {
          emoji: "2️⃣",
          text: "Launch counter campaign (+reputation)",
          effects: { money: -20000000, reputation: 15, happiness: 10, xp: 15 },
        },
        {
          emoji: "3️⃣",
          text: "Sabotage them back (risky)",
          effects: { money: -15000000, reputation: -20, violations: 1, xp: 10 },
        },
      ],
    },
    {
      id: "license_renewal",
      emoji: "📋",
      title: "License Renewal Coming Up",
      situation:
        "Your business license expires in 2 days. Renewal is mandatory.",
      options: [
        {
          emoji: "1️⃣",
          text: "Renew immediately (on time)",
          effects: { money: -350000000, violations: 0, xp: 10 },
        },
        {
          emoji: "2️⃣",
          text: "Wait until deadline (risky)",
          effects: { money: -450000000, violations: 0, xp: 5 },
        },
        {
          emoji: "3️⃣",
          text: "Let it expire (severe penalties)",
          effects: {
            money: -1000000000,
            violations: 2,
            isActive: false,
            xp: 0,
          },
        },
      ],
    },
    {
      id: "staff_romance",
      emoji: "💕",
      title: "Staff Romance Drama",
      situation:
        "Two of your staff members are dating and it's causing workplace tension.",
      options: [
        {
          emoji: "1️⃣",
          text: "Ignore and let it play out",
          effects: { money: 0, happiness: -10, xp: 5 },
        },
        {
          emoji: "2️⃣",
          text: "Fire one of them (lose staff)",
          effects: { money: 0, happiness: -15, xp: 10 },
        },
        {
          emoji: "3️⃣",
          text: "Talk to both (+morale boost)",
          effects: { money: 0, happiness: 10, xp: 15 },
        },
      ],
    },
    {
      id: "health_inspection",
      emoji: "🏥",
      title: "Health & Safety Inspection",
      situation:
        "Authorities are conducting a surprise health and safety inspection today!",
      options: [
        {
          emoji: "1️⃣",
          text: "Pass inspection normally (luck)",
          effects: { money: 0, violations: -1, xp: 10 },
        },
        {
          emoji: "2️⃣",
          text: "Quick emergency cleaning (+money)",
          effects: { money: -10000000, violations: -1, xp: 15 },
        },
        {
          emoji: "3️⃣",
          text: "Fail inspection (major fine)",
          effects: { money: -80000000, violations: 2, happiness: -20, xp: 0 },
        },
      ],
    },
    {
      id: "expansion_offer",
      emoji: "🏢",
      title: "Expansion Opportunity",
      situation: "A bank offers a loan to expand your club to a new location.",
      options: [
        {
          emoji: "1️⃣",
          text: "Accept loan (big risk/reward)",
          effects: { money: 2000000000, xp: 30 },
        },
        {
          emoji: "2️⃣",
          text: "Negotiate better terms (risky)",
          effects: { money: 1000000000, xp: 20 },
        },
        {
          emoji: "3️⃣",
          text: "Decline (stay safe)",
          effects: { money: 0, xp: 5 },
        },
      ],
    },
  ],
};

// Economic tuning parameters — adjust these to fight inflation
GAME_CONFIG.ECONOMY = {
  PRICE_MULTIPLIER: 10, // multiply visible prices to sink more money
  SALARY_MULTIPLIER: 5, // increase salaries to move money out of player pockets
  PASSIVE_TAX: 0.2, // tax on passive revenue (was 0.05)
  EVENT_TAX: 0.2, // tax on event gross revenue (was 0.10)
  UTILITIES_MULTIPLIER: 5, // scale utilities up
  USER_PASSIVE_SHARE: 0.1, // share of passive revenue paid to user wallet (was 0.3)
  CELEB_FEE_MULTIPLIER: 50, // scale celebrity fees
  INFLATION_RATE: 0.2, // increase inflation rate used in market messaging
};

// Apply economic tuning to existing GAME_CONFIG entries
function applyEconomicTuning() {
  const E = GAME_CONFIG.ECONOMY;
  // Equipment
  Object.entries(GAME_CONFIG.EQUIPMENT).forEach(([k, v]) => {
    if (v.price)
      v.price = Math.max(1, Math.floor(v.price * E.PRICE_MULTIPLIER));
  });
  // Staff salaries
  Object.entries(GAME_CONFIG.STAFF).forEach(([k, v]) => {
    if (v.salary)
      v.salary = Math.max(1, Math.floor(v.salary * E.SALARY_MULTIPLIER));
  });
  // Licenses
  Object.entries(GAME_CONFIG.LICENSES).forEach(([k, v]) => {
    if (v.price)
      v.price = Math.max(1, Math.floor(v.price * E.PRICE_MULTIPLIER));
  });
  // Upgrades
  Object.entries(GAME_CONFIG.UPGRADES).forEach(([k, v]) => {
    if (v.price)
      v.price = Math.max(1, Math.floor(v.price * E.PRICE_MULTIPLIER));
  });
  // Events
  Object.entries(GAME_CONFIG.EVENTS).forEach(([k, v]) => {
    if (v.cost) v.cost = Math.max(1, Math.floor(v.cost * E.PRICE_MULTIPLIER));
  });
  // Celebrities
  Object.entries(GAME_CONFIG.CELEBRITIES).forEach(([k, v]) => {
    if (v.fee) v.fee = Math.max(1, Math.floor(v.fee * E.CELEB_FEE_MULTIPLIER));
  });
  // Utilities base
  GAME_CONFIG.UTILITIES_BASE_COST = Math.max(
    1,
    Math.floor(GAME_CONFIG.UTILITIES_BASE_COST * E.UTILITIES_MULTIPLIER),
  );
  // Inflation
  GAME_CONFIG.INFLATION_RATE = E.INFLATION_RATE;
}

applyEconomicTuning();

// Scheduled task handlers
async function processEquipmentBreakdown(context) {
  try {
    const clubsCollection = await getCollection("clubs");
    const clubs = await clubsCollection
      .find({ "equipment.0": { $exists: true } })
      .toArray();

    let processedCount = 0;

    for (const club of clubs) {
      let updated = false;
      const equipment = club.equipment || [];

      for (let item of equipment) {
        // Calculate breakdown chance based on durability and technician presence
        const hasTechnician = (club.staff || []).some(
          (s) => s.type === "technician",
        );
        const degradationRate = hasTechnician ? 0.5 : 1.0; // Technicians halve degradation

        // Random degradation (1-3 points), higher during events
        const degradation =
          Math.floor(Math.random() * 3 + 1) *
          degradationRate *
          (club.weeklyEvents > 2 ? 1.5 : 1.0);
        item.currentDurability = Math.max(
          0,
          item.currentDurability - degradation,
        );

        // Equipment breaks if durability hits 0
        if (item.currentDurability <= 0 && !item.broken) {
          item.broken = true;
          updated = true;
        }
      }

      if (updated) {
        await clubsCollection.updateOne(
          { userId: club.userId },
          { $set: { equipment: equipment, updatedAt: new Date() } },
        );
        processedCount++;
      }
    }

    console.log(
      chalk.yellow(
        `⚙️ Processed equipment breakdown for ${processedCount} clubs`,
      ),
    );
  } catch (error) {
    console.error(
      chalk.red("❌ Equipment breakdown task error:"),
      error.message,
    );
  }
}

async function processLicenseRenewals(context) {
  try {
    const clubsCollection = await getCollection("clubs");
    const clubs = await clubsCollection
      .find({ "licenses.0": { $exists: true } })
      .toArray();

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
              type: "expired_license",
              description: `${license.type} license expired`,
              penalty: penalty,
              date: now,
            });

            // Escalate: 3 violations = shutdown
            if (club.violations.length >= 3) {
              club.isActive = false;
              club.violations.push({
                type: "club_shutdown",
                description:
                  "Multiple violations leading to temporary shutdown",
                date: now,
              });
            }
          }
        }
      }

      if (updated) {
        await clubsCollection.updateOne(
          { userId: club.userId },
          {
            $set: {
              licenses: licenses,
              balance: club.balance,
              violations: club.violations || [],
              isActive: club.isActive,
              updatedAt: new Date(),
            },
          },
        );
        renewalCount++;
      }
    }

    console.log(
      chalk.yellow(`📋 Processed license renewals for ${renewalCount} clubs`),
    );
  } catch (error) {
    console.error(chalk.red("❌ License renewal task error:"), error.message);
  }
}

async function updateWeeklyBillboard() {
  try {
    const clubsCollection = await getCollection("clubs");
    const clubs = await clubsCollection
      .find({})
      .sort({ weeklyRevenue: -1 })
      .limit(10)
      .toArray();

    const billboard = {
      week: moment().tz("Africa/Lagos").week(),
      year: moment().tz("Africa/Lagos").year(),
      updatedAt: new Date(),
      topEarners: clubs.map((club, index) => ({
        rank: index + 1,
        clubName: club.name,
        owner: club.userId.split("@")[0],
        revenue: club.weeklyRevenue || 0,
        rating: calculateClubRating(club),
        events: club.weeklyEvents || 0,
      })),
    };

    // Store billboard
    const billboardCollection = await getCollection("club_billboard");
    await billboardCollection.insertOne(billboard);

    // Reset weekly stats for all clubs
    await clubsCollection.updateMany(
      {},
      {
        $set: {
          weeklyRevenue: 0,
          weeklyEvents: 0,
          updatedAt: new Date(),
        },
      },
    );

    console.log(
      chalk.green(`📊 Updated weekly billboard with ${clubs.length} clubs`),
    );
  } catch (error) {
    console.error(chalk.red("❌ Billboard update task error:"), error.message);
  }
}

async function generatePassiveRevenue() {
  try {
    const clubsCollection = await getCollection("clubs");
    const activeClubs = await clubsCollection
      .find({
        isActive: true,
        "equipment.0": { $exists: true },
      })
      .toArray();

    let revenueGenerated = 0;

    for (const club of activeClubs) {
      let baseRevenue = calculatePassiveRevenue(club);

      // Apply global economic multiplier to passive revenue
      const multiplier = await computeEconomicMultiplier();
      baseRevenue = Math.floor(baseRevenue * multiplier);

      // Deduct salaries more aggressively
      for (const staff of club.staff || []) {
        const config = GAME_CONFIG.STAFF[staff.type];
        if (config) {
          baseRevenue -= config.salary; // Full deduction if unpaid
        }
      }

      if (baseRevenue > 0) {
        // Economy sinks: maintenance fee and passive tax
        const maintenance = Math.floor(
          (club.equipment?.length || 0) * 2000 +
            (club.staff?.length || 0) * 1000,
        );
        const passiveTax = Math.floor(
          baseRevenue * (GAME_CONFIG.ECONOMY.PASSIVE_TAX || 0.05),
        );
        const sinkTotal = maintenance + passiveTax;

        // Record sink
        await recordEconomySink("passive_income_sink", sinkTotal);

        // Add to club balance and user wallet (after sinks)
        const afterSinksRevenue = Math.max(0, baseRevenue - sinkTotal);
        await clubsCollection.updateOne(
          { userId: club.userId },
          {
            $inc: {
              balance: baseRevenue,
              totalRevenue: baseRevenue,
              weeklyRevenue: baseRevenue,
            },
            $set: { lastRevenueAt: new Date() },
          },
        );

        // Also add to user's economy balance
        await unifiedUserManager.addMoney(
          club.userId,
          Math.floor(
            afterSinksRevenue * (GAME_CONFIG.ECONOMY.USER_PASSIVE_SHARE || 0.1),
          ),
          "Club passive income",
        );

        revenueGenerated += afterSinksRevenue;
      } else {
        // Negative revenue leads to violation
        if (!club.violations) club.violations = [];
        club.violations.push({
          type: "negative_revenue",
          description: "Club operating at loss",
          date: new Date(),
        });
        await clubsCollection.updateOne(
          { userId: club.userId },
          { $set: { violations: club.violations } },
        );
      }
    }

    console.log(
      chalk.green(
        `💰 Generated ₦${revenueGenerated.toLocaleString()} passive revenue for ${activeClubs.length} active clubs`,
      ),
    );
  } catch (error) {
    console.error(
      chalk.red("❌ Passive revenue generation error:"),
      error.message,
    );
  }
}

async function updateCelebrityAvailability() {
  try {
    const celebritiesCollection = await getCollection("celebrities");
    Object.entries(GAME_CONFIG.CELEBRITIES).forEach(async ([name, celeb]) => {
      const newAvailability = Math.random() * (0.9 - 0.4) + 0.4; // Random 0.4-0.9
      await celebritiesCollection.updateOne(
        { name },
        { $set: { availability: newAvailability, updatedAt: new Date() } },
        { upsert: true },
      );
    });
    console.log(chalk.green(`🎤 Updated celebrity availabilities`));
  } catch (error) {
    console.error(
      chalk.red("❌ Celebrity availability update error:"),
      error.message,
    );
  }
}

async function deductUtilities() {
  try {
    const clubsCollection = await getCollection("clubs");
    const clubs = await clubsCollection.find({ isActive: true }).toArray();

    let totalDeductions = 0;

    for (const club of clubs) {
      // Calculate utilities based on size (equipment + staff + upgrades)
      const clubSize =
        (club.equipment?.length || 0) +
        (club.staff?.length || 0) +
        (club.upgrades?.length || 0);
      const utilitiesCost = GAME_CONFIG.UTILITIES_BASE_COST + clubSize * 100000; // Scales with size

      club.balance = Math.max(0, club.balance - utilitiesCost);

      if (club.balance < 0) {
        club.isActive = false;
        if (!club.violations) club.violations = [];
        club.violations.push({
          type: "utilities_default",
          description: "Failed to pay utilities - club shutdown",
          penalty: utilitiesCost,
          date: new Date(),
        });
      }

      await clubsCollection.updateOne(
        { userId: club.userId },
        {
          $set: {
            balance: club.balance,
            isActive: club.isActive,
            violations: club.violations || [],
            updatedAt: new Date(),
          },
        },
      );

      totalDeductions += utilitiesCost;
    }

    console.log(
      chalk.yellow(
        `🏠 Deducted ₦${totalDeductions.toLocaleString()} in utilities across clubs`,
      ),
    );
  } catch (error) {
    console.error(
      chalk.red("❌ Utilities deduction task error:"),
      error.message,
    );
  }
}

// Aggregate economy sinks weekly and store summaries
async function aggregateEconomySinks(context) {
  try {
    const sinkCollection = await getCollection("economy_sink");
    const aggCollection = await getCollection("economy_sink_aggregate");
    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const pipeline = [
      { $match: { date: { $gte: weekAgo, $lte: now } } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ];

    const res = await sinkCollection.aggregate(pipeline).toArray();
    const total = res[0]?.total || 0;
    const count = res[0]?.count || 0;

    await aggCollection.insertOne({
      periodStart: weekAgo,
      periodEnd: now,
      total,
      count,
      createdAt: new Date(),
    });

    // Optionally, keep raw sink entries for historical purposes; otherwise, we could prune here.
    console.log(
      chalk.green(
        `🧾 Aggregated economy sinks: ₦${total.toLocaleString()} from ${count} entries`,
      ),
    );
  } catch (error) {
    console.error(chalk.red("❌ Sink aggregation failed:"), error.message);
  }
}

// Assign daily decisions to active clubs
async function assignDailyDecisions(context) {
  try {
    const clubsCollection = await getCollection("clubs");
    const decisionsCollection = await getCollection("club_decisions");

    const activeClubs = await clubsCollection
      .find({ isActive: true })
      .toArray();
    let assignedCount = 0;

    for (const club of activeClubs) {
      // Check if club already has a pending decision today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingDecision = await decisionsCollection.findOne({
        userId: club.userId,
        createdAt: { $gte: today },
      });

      if (existingDecision && !existingDecision.resolved) {
        // Already has a pending decision, skip
        continue;
      }

      // Pick a random decision from available options
      const randomDecision =
        GAME_CONFIG.DAILY_DECISIONS[
          Math.floor(Math.random() * GAME_CONFIG.DAILY_DECISIONS.length)
        ];

      // Create decision record
      const decisionRecord = {
        userId: club.userId,
        clubId: club._id,
        decisionId: randomDecision.id,
        title: randomDecision.title,
        situation: randomDecision.situation,
        emoji: randomDecision.emoji,
        options: randomDecision.options,
        createdAt: new Date(),
        resolved: false,
        choice: null,
        resolvedAt: null,
      };

      await decisionsCollection.insertOne(decisionRecord);
      assignedCount++;
    }

    console.log(
      chalk.yellow(`📣 Assigned daily decisions to ${assignedCount} clubs`),
    );
  } catch (error) {
    console.error(
      chalk.red("❌ Daily decisions assignment error:"),
      error.message,
    );
  }
}

// Helper functions
function calculateClubRating(club) {
  let rating = 50; // Base rating

  // Equipment quality bonus
  const workingEquipment = (club.equipment || []).filter((e) => !e.broken);
  rating += workingEquipment.length * 5;

  // Staff bonus
  rating += (club.staff || []).length * 8;

  // License compliance bonus
  const activeLicenses = (club.licenses || []).filter((l) => l.active);
  rating += activeLicenses.length * 10;

  // Upgrade bonus
  rating += (club.upgrades || []).length * 12;

  // Recent violations penalty (more severe)
  const recentViolations = (club.violations || []).filter(
    (v) => new Date() - new Date(v.date) < 30 * 24 * 60 * 60 * 1000, // Last 30 days
  );
  rating -= recentViolations.length * 20; // Increased penalty

  return Math.max(0, Math.min(100, Math.round(rating)));
}

function calculatePassiveRevenue(club) {
  let baseRevenue = 10000; // Increased base for higher stakes

  // Equipment multipliers (cap to prevent exploits)
  const workingEquipment = (club.equipment || [])
    .filter((e) => !e.broken)
    .slice(0, 10); // Cap at 10
  for (const item of workingEquipment) {
    const config = GAME_CONFIG.EQUIPMENT[item.type];
    if (config) {
      baseRevenue *= config.boost.revenue || 1.0;
    }
  }

  // Staff multipliers (cap at 15 staff)
  const staff = (club.staff || []).slice(0, 15);
  for (const s of staff) {
    const config = GAME_CONFIG.STAFF[s.type];
    if (config) {
      baseRevenue *= config.boost.revenue || 1.0;
      // Deduct salary
      baseRevenue -= config.salary / 6; // Hourly salary deduction
    }
  }

  // License penalties
  const hasBusinessLicense = (club.licenses || []).some(
    (l) => l.type === "business" && l.active,
  );
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

// Dynamic economic multiplier and sinks
async function computeEconomicMultiplier() {
  try {
    const clubsCollection = await getCollection("clubs");
    const activeCount = await clubsCollection.countDocuments({
      isActive: true,
    });
    // Basic formula: more active clubs => lower payouts to control inflation
    // activeCount <=50 => multiplier up to 1.1, 50-200 => 1.0 down to 0.8, >200 => 0.7
    if (activeCount <= 50) return Math.min(1.1, 1 + (50 - activeCount) / 500);
    if (activeCount <= 200) return 1.0 - ((activeCount - 50) / 150) * 0.2; // ranges 1.0 -> 0.8
    return 0.7; // heavily saturated
  } catch (error) {
    console.error("Failed to compute economic multiplier:", error.message);
    return 1.0; // safe fallback
  }
}

async function recordEconomySink(reason, amount) {
  try {
    if (amount <= 0) return;
    const sinkCollection = await getCollection("economy_sink");
    await sinkCollection.insertOne({ reason, amount, date: new Date() });
  } catch (error) {
    console.error("Failed to record economy sink:", error.message);
  }
}

// Helper function to find equipment by flexible name matching
function findEquipmentByName(input) {
  const normalized = input.toLowerCase().replace(/\s+/g, "_");

  // Exact match first
  if (GAME_CONFIG.EQUIPMENT[normalized]) {
    return { key: normalized, config: GAME_CONFIG.EQUIPMENT[normalized] };
  }

  // Partial match in displayName or key
  for (const [key, config] of Object.entries(GAME_CONFIG.EQUIPMENT)) {
    const displayName = (config.displayName || key).toLowerCase();
    const keyLower = key.toLowerCase();

    if (displayName.includes(normalized) || keyLower.includes(normalized) || normalized.includes(keyLower)) {
      return { key, config };
    }
  }

  return null;
}

// Helper function to find celebrity by flexible name matching
function findCelebrity(input) {
  const normalized = input.toLowerCase().replace(/\s+/g, "_");

  // Exact match first
  if (GAME_CONFIG.CELEBRITIES[normalized]) {
    return { key: normalized, config: GAME_CONFIG.CELEBRITIES[normalized] };
  }

  // Partial match
  for (const [key, config] of Object.entries(GAME_CONFIG.CELEBRITIES)) {
    if (key.toLowerCase().includes(normalized) || normalized.includes(key.toLowerCase())) {
      return { key, config };
    }
  }

  return null;
}

// Command handlers
async function handleClubRegister(m, sock, args, userId, db) {
  if (args.length === 0) {
    await m.reply(
      "❌ Please provide a club name!\n\n*Usage:* /club register <name>",
    );
    return;
  }

  // Sanitize club name: allow only letters, numbers, spaces, hyphens
  const clubName = args
    .join(" ")
    .replace(/[^\w\s-]/g, "")
    .trim();
  if (clubName.length < 3 || clubName.length > 30) {
    await m.reply(
      "❌ Club name must be between 3-30 characters and contain only letters, numbers, spaces, and hyphens!",
    );
    return;
  }

  try {
    const clubsCollection = await getCollection("clubs");

    // Check if user already has a club
    const existingClub = await clubsCollection.findOne({ userId });
    if (existingClub) {
      await m.reply(
        "❌ You already own a club! Use `/club info` to view your club details.",
      );
      return;
    }

    // Check if name is already taken
    // Escape regex special characters in clubName
    const escapedClubName = clubName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameExists = await clubsCollection.findOne({
      name: { $regex: new RegExp(`^${escapedClubName}$`, "i") },
    });

    if (nameExists) {
      await m.reply(
        "❌ This club name is already taken! Please choose a different name.",
      );
      return;
    }

    // Check if user has enough money (registration fee: 1,0000,000)
    const registrationFee = 500000000; // Increased
    const userBalance = await PluginHelpers.getBalance(userId);

    if (userBalance.wallet < registrationFee) {
      await m.reply(
        `❌ Insufficient funds! Club registration costs ₦${registrationFee.toLocaleString()}.\n\nYour wallet: ₦${userBalance.wallet.toLocaleString()}`,
      );
      return;
    }

    // Deduct registration fee
    await unifiedUserManager.removeMoney(
      userId,
      registrationFee,
      "Club registration fee",
    );

    // Create new club
    const newClub = {
      userId,
      name: clubName,
      xp: 0,
      level: 1,
      rank: "Newbie",
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
      visibility: 50, // Starting visibility (50%)
      lastVisibilityUpdate: new Date(),
      visibilityRevenueModifier: 1.0, // No modifier initially
      consumables: {
        insurance: 0,
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastRevenueAt: null,
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

    await m.reply(successMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club registration error:"), error.message);
    await m.reply("❌ Failed to register club. Please try again.");
  }
}

async function handleClubInfo(m, sock, userId, db) {
  try {
    const clubsCollection = await getCollection("clubs");
    const club = await clubsCollection.findOne({ userId });

    if (!club) {
      await m.reply(
        "❌ You don't own a club! Use `/club register <name>` to start your club business.",
      );
      return;
    }

    // Calculate current stats
    const rating = calculateClubRating(club);
    const workingEquipment = (club.equipment || []).filter((e) => !e.broken);
    const brokenEquipment = (club.equipment || []).filter((e) => e.broken);
    const activeLicenses = (club.licenses || []).filter((l) => l.active);
    const expiredLicenses = (club.licenses || []).filter((l) => !l.active);

    // Visibility status
    const visibility = club.visibility || 50;
    const visibilityStatus = getVisibilityStatus(visibility);

    let infoMsg = `🏢 *${club.name}*
━━━━━━━━━━━━━━━━━━━

💰 *Finances*
• Club Balance: ₦${club.balance.toLocaleString()}
• Total Revenue: ₦${club.totalRevenue.toLocaleString()}
• Weekly Revenue: ₦${club.weeklyRevenue.toLocaleString()}

⭐ *Status*
• Reputation: ${rating}/100 ${getRatingEmoji(rating)}
• Status: ${club.isActive ? "🟢 Active" : "🔴 Inactive"}
• Weekly Events: ${club.weeklyEvents || 0}

📱 *Visibility*
• ${visibilityStatus.emoji} *${visibilityStatus.label}* (${visibility}%)
• ${visibilityStatus.description}
• Use \`/club pr\` to launch campaigns

🎵 *Equipment (${club.equipment?.length || 0})*`;

    if (workingEquipment.length > 0) {
      infoMsg += `\n• Working: ${workingEquipment.length}`;
      workingEquipment.slice(0, 3).forEach((eq) => {
        infoMsg += `\n  - ${eq.type.replace(/_/g, " ")} (${eq.currentDurability}%)`;
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
      club.staff.slice(0, 5).forEach((staff) => {
        infoMsg += `\n• ${staff.name} (${staff.type})`;
      });
      if (club.staff.length > 5) {
        infoMsg += `\n• ... and ${club.staff.length - 5} more`;
      }
    } else {
      infoMsg += "\n• No staff hired";
    }

    infoMsg += `\n\n📋 *Licenses*`;
    if (activeLicenses.length > 0) {
      infoMsg += `\n• Active: ${activeLicenses.length}`;
      activeLicenses.forEach((license) => {
        const daysLeft = Math.ceil(
          (new Date(license.expiresAt) - new Date()) / (1000 * 60 * 60 * 24),
        );
        infoMsg += `\n  - ${license.type} (${daysLeft}d left)`;
      });
    }

    if (expiredLicenses.length > 0) {
      infoMsg += `\n• Expired: ${expiredLicenses.length} ⚠️`;
    }

    if (!activeLicenses.some((l) => l.type === "business")) {
      infoMsg += `\n\n⚠️ *Warning: No business license!*`;
    }

    if (club.violations && club.violations.length > 0) {
      infoMsg += `\n\n🚨 *Recent Violations: ${club.violations.length}*`;
    }

    // Show global economic multiplier and recent sink totals for transparency
    try {
      const multiplier = await computeEconomicMultiplier();
      const aggCollection = await getCollection("economy_sink_aggregate");
      const lastAgg = await aggCollection.findOne(
        {},
        { sort: { createdAt: -1 } },
      );
      const recentSink = lastAgg?.total || 0;
      infoMsg += `\n\n🌐 *Global Multiplier:* x${multiplier.toFixed(2)}`;
      infoMsg += `\n🧾 *Recent Sink (7d):* ₦${recentSink.toLocaleString()}`;
    } catch (e) {
      // silent fallback
    }

    infoMsg += `\n\n💡 *Quick Commands:*
• \`/club market\` - Browse equipment
• \`/club hire <staff>\` - Hire staff
• \`/club host <event>\` - Host events
• \`/club book <celebrity> <event>\` - Book celebrities
• \`/club billboard\` - View rankings`;

    await m.reply(infoMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club info error:"), error.message);
    await m.reply("❌ Failed to retrieve club information.");
  }
}

async function handleClubMarket(m, sock, userId, db) {
  try {
    let marketMsg = `🛍️ *Club Equipment Market*
━━━━━━━━━━━━━━━━━━━

🔊 *SOUND EQUIPMENT*`;

    Object.entries(GAME_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === "sound") {
        const displayName = item.displayName || key.replace(/_/g, " ");
        marketMsg += `\n• *${displayName}*: ₦${item.price.toLocaleString()} (${item.durability} dur.)`;
      }
    });

    marketMsg += `\n\n💡 *LIGHTING*`;
    Object.entries(GAME_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === "lighting") {
        const displayName = item.displayName || key.replace(/_/g, " ");
        marketMsg += `\n• *${displayName}*: ₦${item.price.toLocaleString()} (${item.durability} dur.)`;
      }
    });

    marketMsg += `\n\n🪑 *FURNITURE*`;
    Object.entries(GAME_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === "furniture") {
        const displayName = item.displayName || key.replace(/_/g, " ");
        marketMsg += `\n• *${displayName}*: ₦${item.price.toLocaleString()} (${item.durability} dur.)`;
      }
    });

    marketMsg += `\n\n🛡️ *SECURITY*`;
    Object.entries(GAME_CONFIG.EQUIPMENT).forEach(([key, item]) => {
      if (item.category === "security") {
        const displayName = item.displayName || key.replace(/_/g, " ");
        marketMsg += `\n• *${displayName}*: ₦${item.price.toLocaleString()} (${item.durability} dur.)`;
      }
    });

    marketMsg += `\n\n💼 *STAFF AVAILABLE*`;
    Object.entries(GAME_CONFIG.STAFF).forEach(([key, staff]) => {
      marketMsg += `\n• *${key.replace(/_/g, " ")}*: Salary ₦${staff.salary.toLocaleString()} (Revenue Boost: ${Math.round((staff.boost.revenue - 1) * 100)}%)`;
    });

    marketMsg += `\n\n⭐ *CELEBRITIES FOR BOOKING*`;
    Object.entries(GAME_CONFIG.CELEBRITIES).forEach(([key, celeb]) => {
      marketMsg += `\n• *${key.replace(/_/g, " ")}*: Fee ₦${celeb.fee.toLocaleString()} (Revenue Boost: ${Math.round((celeb.boost.revenue - 1) * 100)}%)`;
    });

    marketMsg += `\n\n*Usage:* /club buy <item> | /club hire <staff> | /club book <celebrity> <event>\n\nPrices subject to 5% weekly inflation!`;

    // Consumables
    marketMsg += `\n\n🧾 *CONSUMABLES*`;
    Object.entries(GAME_CONFIG.CONSUMABLES).forEach(([key, item]) => {
      marketMsg += `\n• *${key.replace(/_/g, " ")}*: ₦${item.price.toLocaleString()} - ${item.description}`;
    });

    await m.reply(marketMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club market error:"), error.message);
    await m.reply("❌ Failed to load market.");
  }
}

async function handleClubBuy(m, sock, args, userId, db) {
  if (args.length === 0) {
    await m.reply(
      "❌ Please specify item to buy!\n\n*Usage:* /club buy <item_name>\n\nView available: /club market",
    );
    return;
  }

  const itemInput = args.join(" ");

  try {
    const clubsCollection = await getCollection("clubs");
    const club = await clubsCollection.findOne({ userId });

    if (!club) {
      await m.reply("❌ You don't own a club!");
      return;
    }

    // Use flexible matching for equipment
    const equipmentResult = findEquipmentByName(itemInput);
    const equipment = equipmentResult?.config;
    const equipmentKey = equipmentResult?.key;

    // sanitize consumable key similar to find functions
    const consumableKey = (itemInput || "")
      .replace(/[\*_`~]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const consumable = GAME_CONFIG.CONSUMABLES[consumableKey];
    const userBalance = await PluginHelpers.getBalance(userId);

    if (consumable) {
      if (userBalance.wallet < consumable.price) {
        await m.reply(
          `❌ Insufficient funds!\n\n*Item:* ${itemInput}\n*Price:* ₦${consumable.price.toLocaleString()}\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`,
        );
        return;
      }

      // Deduct and add consumable to club
      await unifiedUserManager.removeMoney(
        userId,
        consumable.price,
        `Purchase consumable: ${itemInput}`,
      );
      await clubsCollection.updateOne(
        { userId },
        {
          $inc: { [`consumables.${consumableKey}`]: 1 },
          $set: { updatedAt: new Date() },
        },
      );

      await m.reply(
        `✅ *Consumable Purchased!*\n\n• Item: ${itemInput}\n• Cost: ₦${consumable.price.toLocaleString()}\n\nUse it automatically when needed during risky events.`,
      );
      return;
    }

    if (!equipment) {
      await m.reply(
        `❌ Item "${itemInput}" not found!\n\nView available: /club market`,
      );
      return;
    }

    // Cap equipment at 10
    if (club.equipment?.length >= 10) {
      await m.reply(
        "❌ Maximum equipment limit reached (10 items)! Repair or sell existing ones.",
      );
      return;
    }

    if (userBalance.wallet < equipment.price) {
      await m.reply(
        `❌ Insufficient funds!\n\n*Item:* ${equipment.displayName || equipmentKey.replace(/_/g, " ")}\n*Price:* ₦${equipment.price.toLocaleString()}\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`,
      );
      return;
    }

    // Deduct money and add equipment
    await unifiedUserManager.removeMoney(
      userId,
      equipment.price,
      `Club equipment: ${equipment.displayName || equipmentKey}`,
    );

    const newEquipment = {
      type: equipmentKey,
      displayName: equipment.displayName || equipmentKey.replace(/_/g, " "),
      purchasedAt: new Date(),
      currentDurability: equipment.durability,
      maxDurability: equipment.durability,
      broken: false,
      timesRepaired: 0,
    };

    await clubsCollection.updateOne(
      { userId },
      {
        $push: { equipment: newEquipment },
        $set: { updatedAt: new Date() },
      },
    );

    const successMsg = `✅ *Equipment Purchased!*

🛍️ *Item:* ${equipment.displayName || equipmentKey.replace(/_/g, " ")}
💰 *Cost:* ₦${equipment.price.toLocaleString()}
🔧 *Durability:* ${equipment.durability}
📈 *Revenue Boost:* ${Math.round((equipment.boost.revenue - 1) * 100)}%

💡 *Tip:* Hire a technician to reduce equipment wear!`;

    await m.reply(successMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club buy error:"), error.message);
    await m.reply("❌ Failed to purchase equipment.");
  }
}

async function handleClubRepair(m, sock, args, userId, db) {
  if (args.length === 0) {
    await m.reply(
      "❌ Please specify equipment to repair!\n\n*Usage:* /club repair <equipment_name>",
    );
    return;
  }

  const itemName = args.join("_").toLowerCase();

  try {
    const clubsCollection = await getCollection("clubs");
    const club = await clubsCollection.findOne({ userId });

    if (!club) {
      await m.reply("❌ You don't own a club!");
      return;
    }

    const equipment = club.equipment || [];
    const itemIndex = equipment.findIndex((eq) => eq.type === itemName);

    if (itemIndex === -1) {
      await m.reply(
        `❌ You don't own "${itemName.replace(/_/g, " ")}" equipment!`,
      );
      return;
    }

    const item = equipment[itemIndex];

    if (!item.broken && item.currentDurability >= item.maxDurability * 0.9) {
      await m.reply(
        `❌ "${itemName.replace(/_/g, " ")}" doesn't need repair!\n\nCurrent durability: ${item.currentDurability}/${item.maxDurability}`,
      );
      return;
    }

    const equipmentConfig = GAME_CONFIG.EQUIPMENT[itemName];
    const repairCost = Math.floor(equipmentConfig.price * 0.5);
    const userBalance = await PluginHelpers.getBalance(userId);

    if (userBalance.wallet < repairCost) {
      await m.reply(
        `❌ Insufficient funds for repair!\n\n*Repair Cost:* ₦${repairCost.toLocaleString()}\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`,
      );
      return;
    }

    // Deduct money first
    const moneyRemoved = await unifiedUserManager.removeMoney(
      userId,
      repairCost,
      `Repair: ${itemName}`,
    );

    if (!moneyRemoved) {
      await m.reply("❌ Failed to deduct repair cost. Please try again.");
      return;
    }

    equipment[itemIndex].currentDurability = item.maxDurability;
    equipment[itemIndex].broken = false;
    equipment[itemIndex].timesRepaired = (item.timesRepaired || 0) + 1;
    equipment[itemIndex].lastRepairedAt = new Date();

    await clubsCollection.updateOne(
      { userId },
      {
        $set: {
          equipment: equipment,
          updatedAt: new Date(),
        },
      },
    );

    const successMsg = `🔧 *Equipment Repaired!*

🛍️ *Item:* ${itemName.replace(/_/g, " ")}
💰 *Cost:* ₦${repairCost.toLocaleString()}
🔧 *New Durability:* ${item.maxDurability}/${item.maxDurability}
🔄 *Times Repaired:* ${equipment[itemIndex].timesRepaired}

✅ Your equipment is now fully operational!`;

    await m.reply(successMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club repair error:"), error.message);
    await m.reply("❌ Failed to repair equipment.");
  }
}

async function handleClubHire(m, sock, args, userId, db) {
  if (args.length === 0) {
    await m.reply(
      "❌ Please specify staff type to hire!\n\n*Usage:* /club hire <staff_type>\n\n*Available Staff:*\n" +
        Object.keys(GAME_CONFIG.STAFF)
          .map((s) => `• ${s}`)
          .join("\n"),
    );
    return;
  }

  const staffType = args[0].replace(/[^a-zA-Z_]/g, "").toLowerCase();

  try {
    const clubsCollection = await getCollection("clubs");
    const club = await clubsCollection.findOne({ userId });

    if (!club) {
      await m.reply("❌ You don't own a club!");
      return;
    }

    const staffConfig = GAME_CONFIG.STAFF[staffType];
    if (!staffConfig) {
      await m.reply(
        `❌ Staff type "${staffType}" not found!\n\n*Available:* ${Object.keys(GAME_CONFIG.STAFF).join(", ")}`,
      );
      return;
    }

    const existingStaff = (club.staff || []).filter(
      (s) => s.type === staffType,
    );
    if (existingStaff.length >= 2) {
      await m.reply(
        `❌ You already have maximum ${staffType}s (2 max per type)!\n\nUse \`/club fire ${staffType}\` to make room.`,
      );
      return;
    }

    const hiringCost = staffConfig.salary * 4;
    const userBalance = await PluginHelpers.getBalance(userId);

    if (userBalance.wallet < hiringCost) {
      await m.reply(
        `❌ Insufficient funds to hire ${staffType}!\n\n*Cost:* ₦${hiringCost.toLocaleString()} (4 weeks salary)\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`,
      );
      return;
    }

    if (staffType === "stripper") {
      const hasAdultLicense = (club.licenses || []).some(
        (l) => l.type === "adult_entertainment" && l.active,
      );
      if (!hasAdultLicense) {
        await m.reply(
          "❌ You need an active adult entertainment license to hire strippers!\n\nUse `/club license adult_entertainment` first.",
        );
        return;
      }
    }

    const names = {
      dj: ["DJ Neptune", "DJ Cuppy", "DJ Spinall", "DJ Big N", "DJ Xclusive"],
      bartender: ["Angella", "Maria", "Jay", "Lisa", "Sandra"],
      bouncer: ["Big Joe", "Marcus", "Steel", "Bruno", "Tank"],
      cleaner: ["Rosa", "Ahmed", "Grace", "Pedro", "Kim"],
      stripper: ["Diamond", "Cherry", "Angel", "Raven", "Candy"],
      waitress: ["Sophie", "Emma", "Olivia", "Mia", "Ava"],
      technician: [
        "Tech Sam",
        "Engineer Bob",
        "Geek Paul",
        "Pro Lisa",
        "Wizard John",
      ],
    };
    const randomName =
      names[staffType][Math.floor(Math.random() * names[staffType].length)];

    // Deduct money first
    const moneyRemoved = await unifiedUserManager.removeMoney(
      userId,
      hiringCost,
      `Hire ${staffType}: ${randomName}`,
    );

    if (!moneyRemoved) {
      await m.reply("❌ Failed to deduct hiring cost. Please try again.");
      return;
    }

    const newStaff = {
      type: staffType,
      name: randomName,
      hiredAt: new Date(),
      weeksHired: 4,
      performance: Math.floor(Math.random() * 20) + 80,
      salary: staffConfig.salary,
    };

    await clubsCollection.updateOne(
      { userId },
      {
        $push: { staff: newStaff },
        $set: { updatedAt: new Date() },
      },
    );

    const successMsg = `✅ *Staff Hired Successfully!*

👤 *Name:* ${randomName}
💼 *Position:* ${staffType}
💰 *Cost:* ₦${hiringCost.toLocaleString()} (4 weeks prepaid)
📊 *Performance:* ${newStaff.performance}%
📈 *Revenue Boost:* ${Math.round((staffConfig.boost.revenue - 1) * 100)}%

🎉 ${randomName} is now working at your club!`;

    await m.reply(successMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club hire error:"), error.message);
    await m.reply("❌ Failed to hire staff. Please try again.");
  }
}

async function handleClubLicense(m, sock, args, userId, db) {
  if (args.length === 0) {
    let licenseMsg = `📋 *Available Licenses*
━━━━━━━━━━━━━━━━━━━

`;

    Object.entries(GAME_CONFIG.LICENSES).forEach(([key, license]) => {
      const required = license.required ? " ⚠️ *REQUIRED*" : "";
      licenseMsg += `🏷️ *${key.replace(/_/g, " ")}*${required}
• Price: ₦${license.price.toLocaleString()}
• Duration: ${license.duration} days
• ${license.description}

`;
    });

    licenseMsg += `*Usage:* \`/club license <type>\``;

    await m.reply(licenseMsg);
    return;
  }

  const licenseType = args[0].toLowerCase();

  try {
    const clubsCollection = await getCollection("clubs");
    const club = await clubsCollection.findOne({ userId });

    if (!club) {
      await m.reply("❌ You don't own a club!");
      return;
    }

    const licenseConfig = GAME_CONFIG.LICENSES[licenseType];
    if (!licenseConfig) {
      await m.reply(
        `❌ License type "${licenseType}" not found!\n\n*Available:* ${Object.keys(GAME_CONFIG.LICENSES).join(", ")}`,
      );
      return;
    }

    // Check if already has active license
    const existingLicense = (club.licenses || []).find(
      (l) => l.type === licenseType && l.active,
    );
    if (existingLicense) {
      const daysLeft = Math.ceil(
        (new Date(existingLicense.expiresAt) - new Date()) /
          (1000 * 60 * 60 * 24),
      );
      await m.reply(
        `❌ You already have an active ${licenseType} license!\n\nExpires in: ${daysLeft} days\n\nLet it expire before purchasing a new one.`,
      );
      return;
    }

    const userBalance = await PluginHelpers.getBalance(userId);

    if (userBalance.wallet < licenseConfig.price) {
      await m.reply(
        `❌ Insufficient funds!\n\n*License:* ${licenseType}\n*Price:* ₦${licenseConfig.price.toLocaleString()}\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`,
      );
      return;
    }

    // Purchase license
    await unifiedUserManager.removeMoney(
      userId,
      licenseConfig.price,
      `License: ${licenseType}`,
    );

    const newLicense = {
      type: licenseType,
      purchasedAt: new Date(),
      expiresAt: new Date(
        Date.now() + licenseConfig.duration * 24 * 60 * 60 * 1000,
      ),
      active: true,
      price: licenseConfig.price,
    };

    await clubsCollection.updateOne(
      { userId },
      {
        $push: { licenses: newLicense },
        $set: { updatedAt: new Date() },
      },
    );

    const successMsg = `✅ *License Purchased!*

📋 *Type:* ${licenseType.replace(/_/g, " ")}
💰 *Cost:* ₦${licenseConfig.price.toLocaleString()}
⏰ *Duration:* ${licenseConfig.duration} days
📅 *Expires:* ${moment(newLicense.expiresAt).tz("Africa/Lagos").format("DD/MM/YYYY")}

${licenseConfig.required ? "🎉 Your club can now operate legally!" : "🌟 This license unlocks new opportunities!"}`;

    await m.reply(successMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club license error:"), error.message);
    await m.reply("❌ Failed to purchase license.");
  }
}

async function handleClubHost(m, sock, args, userId, db) {
  if (args.length === 0) {
    const eventKeys = Object.keys(GAME_CONFIG.EVENTS);
    let eventMsg = `🎪 *Available Events*
━━━━━━━━━━━━━━━━━━━

`;

    eventKeys.forEach((key, index) => {
      const event = GAME_CONFIG.EVENTS[key];
      eventMsg += `\n*${index + 1}. ${key.replace(/_/g, " ")}*
• Cost: ₦${event.cost.toLocaleString()}
• Duration: ${event.duration} hours
• Min Equipment: ${event.min_equipment}
• Revenue Multiplier: ${event.revenue_multiplier}x`;
    });

    eventMsg += `\n\n💬 *Reply to this message with just the number (1, 2, 3, etc.) to select an event!*
Or use: \`/club host <event_type>\``;

    const sentMsg = await m.reply(eventMsg);

    // Store selection context for this message
    const messageId = sentMsg?.key?.id || m.key.id;
    storeSelectionContext(
      messageId,
      "event_selection",
      eventKeys,
      async (selection, replyMsg, sock, userId, db) => {
        const selectedEvent = eventKeys[selection - 1];
        await handleClubHostEvent(replyMsg, sock, [selectedEvent], userId, db);
      },
    );

    return;
  }

  const eventType = args[0].toLowerCase();
  await handleClubHostEvent(m, sock, args, userId, db);
}

async function handleClubHostEvent(m, sock, args, userId, db) {
  const eventType = args[0].toLowerCase();

  try {
    const clubsCollection = await getCollection("clubs");
    const club = await clubsCollection.findOne({ userId });

    if (!club) {
      await m.reply("❌ You don't own a club!");
      return;
    }

    const eventConfig = GAME_CONFIG.EVENTS[eventType];
    if (!eventConfig) {
      await m.reply(
        `❌ Event type "${eventType}" not found!\n\n*Available:* ${Object.keys(GAME_CONFIG.EVENTS).join(", ")}`,
      );
      return;
    }

    // Check if club has business license
    const hasBusinessLicense = (club.licenses || []).some(
      (l) => l.type === "business" && l.active,
    );
    if (!hasBusinessLicense) {
      await m.reply(
        "❌ You need an active business license to host events!\n\nUse `/club license business` first.",
      );
      return;
    }

    // Check equipment requirements
    const workingEquipment = (club.equipment || []).filter((e) => !e.broken);
    if (workingEquipment.length < eventConfig.min_equipment) {
      await m.reply(
        `❌ Not enough working equipment!\n\n*Required:* ${eventConfig.min_equipment} working equipment\n*You have:* ${workingEquipment.length}\n\nBuy more equipment or repair broken ones.`,
      );
      return;
    }

    // Mode (risk) selection: /club host <event> <mode>
    const modeArg = args[1]?.toLowerCase() || "standard";
    const mode =
      GAME_CONFIG.RISK_MODES[modeArg] || GAME_CONFIG.RISK_MODES.standard;

    // Enforce minimum level to select certain modes
    const clubLevel = club.level || 1;
    if (mode.minLevel && clubLevel < mode.minLevel) {
      await m.reply(
        `❌ *${mode.label}* mode requires level ${mode.minLevel}. Your club level: ${clubLevel}.`,
      );
      return;
    }

    const userBalance = await PluginHelpers.getBalance(userId);
    if (userBalance.wallet < eventConfig.cost) {
      await m.reply(
        `❌ Insufficient funds!\n\n*Event:* ${eventType}\n*Cost:* ₦${eventConfig.cost.toLocaleString()}\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`,
      );
      return;
    }

    // Hosting cooldowns & attempt limits (per club per event+mode)
    const now = Date.now();
    club.hostingStats = club.hostingStats || {};
    const statKey = `${eventType}:${mode.label}`;
    const stat = club.hostingStats[statKey] || {
      lastAt: null,
      attemptsDate: null,
      attempts: 0,
    };

    // Reset daily attempts if day changed
    const today = new Date().toISOString().slice(0, 10);
    if (stat.attemptsDate !== today) {
      stat.attempts = 0;
      stat.attemptsDate = today;
    }

    if (stat.attempts >= (mode.attemptsPerDay || 1)) {
      await m.reply(
        `❌ You have reached the daily attempt limit for *${eventType}* in *${mode.label}* mode. Try another mode or wait until tomorrow.`,
      );
      return;
    }

    if (stat.lastAt && now - stat.lastAt < (mode.cooldownMs || 0)) {
      const remaining = Math.ceil(
        ((mode.cooldownMs || 0) - (now - stat.lastAt)) / 60000,
      );
      await m.reply(
        `⏳ Cooldown active for *${mode.label}* mode. Please wait ${remaining} more minute(s) before hosting this event again.`,
      );
      return;
    }

    // Calculate base revenue (same as before) and apply equipment/staff bonuses
    let baseRevenue = eventConfig.cost * eventConfig.revenue_multiplier;
    for (const equipment of workingEquipment) {
      const config = GAME_CONFIG.EQUIPMENT[equipment.type];
      if (config) baseRevenue *= config.boost.revenue || 1.0;
    }
    for (const staff of club.staff || []) {
      const config = GAME_CONFIG.STAFF[staff.type];
      if (config) baseRevenue *= config.boost.revenue || 1.0;
    }

    // Charge entry cost first (risk)
    await unifiedUserManager.removeMoney(
      userId,
      eventConfig.cost,
      `Host event: ${eventType} (${mode.label})`,
    );

    // ===== CHAOTIC EVENT OUTCOMES SYSTEM =====
    // Determine event outcome with RNG and modifiers

    // Get security staff count (reduces bad outcomes)
    const securityStaff = (club.staff || []).filter(
      (s) => s.type === "bouncer",
    ).length;
    const eventHasBusinessLicense = (club.licenses || []).some(
      (l) => l.type === "business" && l.active,
    );
    const hasLiquorLicense = (club.licenses || []).some(
      (l) => l.type === "liquor" && l.active,
    );

    // Determine outcome
    const outcomeRoll = Math.random();
    let eventOutcome = null;
    let outcomeName = "";
    let outcomeEmoji = "";
    let revenueModifier = 1.0;
    let equipmentDamage = 0;
    let fineAmount = 0;
    let violationAdded = false;

    // Outcome probabilities (can be modified by security staff)
    // Base: Sold Out 25%, Normal 50%, Fight 15%, Police 10%
    // Security reduces Fight and Police chances
    let soldOutChance = 0.25;
    let normalChance = 0.5;
    let fightChance = 0.15;
    let policeChance = 0.1;

    // Security staff reduces bad outcomes (10% reduction per bouncer, max 30%)
    const securityReduction = Math.min(0.3, securityStaff * 0.1);
    if (securityReduction > 0) {
      fightChance *= 1 - securityReduction;
      policeChance *= 1 - securityReduction;
      // Redistribute reduced chance to normal
      normalChance += 0.15 * securityReduction + 0.1 * securityReduction;
    }

    // Determine which outcome occurred
    if (outcomeRoll <= soldOutChance) {
      eventOutcome = "sold_out";
      outcomeName = "🎫 SOLD OUT";
      outcomeEmoji = "✨";
      revenueModifier = 1.3; // +30% revenue
    } else if (outcomeRoll <= soldOutChance + normalChance) {
      eventOutcome = "normal";
      outcomeName = "✅ Normal Event";
      outcomeEmoji = "🎉";
      revenueModifier = 1.0; // Normal revenue
    } else if (outcomeRoll <= soldOutChance + normalChance + fightChance) {
      eventOutcome = "fight";
      outcomeName = "💥 FIGHT BROKE OUT";
      outcomeEmoji = "🔥";
      revenueModifier = 0.4; // Only 40% revenue
      equipmentDamage = 35; // Significant damage
      violationAdded = true; // Reputation hit

      // Insurance check: equipment damage protection
      club.consumables = club.consumables || {};
      if ((club.consumables.insurance || 0) > 0) {
        club.consumables.insurance -= 1;
        equipmentDamage = 0; // Insurance prevents equipment damage
        await m.reply(
          "🛡️ *Insurance Activated!* Your equipment is protected from the chaos.",
        );
      }
    } else if (
      outcomeRoll <=
      soldOutChance + normalChance + fightChance + policeChance
    ) {
      eventOutcome = "police";
      outcomeName = "🚨 POLICE RAID";
      outcomeEmoji = "🚔";
      revenueModifier = 0; // No revenue

      // License protection: Liquor license reduces raid impact
      if (hasLiquorLicense) {
        fineAmount = 0; // License protects from raid
        outcomeName = "🚨 Police Visit (License Protected)";
        revenueModifier = 0.5; // Still lose half revenue but no fine
        await m.reply(
          "📋 *License Protected You!* Your liquor license kept you safe from fines.",
        );
      } else {
        fineAmount = 150000; // Large fine
        violationAdded = true;
      }
    }

    // Calculate final revenue with outcome modifier
    let finalRevenue = Math.floor(baseRevenue * revenueModifier);

    // Apply visibility modifier to final revenue
    const visibilityModifier = club.visibilityRevenueModifier || 1.0;
    finalRevenue = Math.floor(finalRevenue * visibilityModifier);

    // Roll for success based on mode (only affects base success chance, not outcomes)
    const successRoll = Math.random();
    let success = successRoll <= mode.successChance;

    // If success roll failed, reduce revenue further
    if (!success && eventOutcome === "normal") {
      finalRevenue = Math.floor(finalRevenue * 0.6); // Failed event does 60% revenue
    } else if (
      !success &&
      eventOutcome !== "fight" &&
      eventOutcome !== "police"
    ) {
      finalRevenue = Math.floor(finalRevenue * 0.7);
    }

    // Check for insurance consumable (general failure protection)
    club.consumables = club.consumables || {};
    let usedInsurance = false;
    if (
      !success &&
      (club.consumables.insurance || 0) > 0 &&
      eventOutcome !== "fight"
    ) {
      // Consume insurance to refund 50% of cost on general failure
      club.consumables.insurance -= 1;
      usedInsurance = true;
      const refund = Math.floor(eventConfig.cost * 0.5);
      await unifiedUserManager.addMoney(
        userId,
        refund,
        `Insurance refund for ${eventType}`,
      );
      finalRevenue = Math.max(finalRevenue, refund);
    }

    // Apply fine if police raid
    if (fineAmount > 0) {
      await unifiedUserManager.removeMoney(
        userId,
        fineAmount,
        `Police raid fine for ${eventType}`,
      );
    }

    // Reward user with a share of revenue
    const userShare = Math.floor(finalRevenue * 0.4);
    if (userShare > 0) {
      await unifiedUserManager.addMoney(
        userId,
        userShare,
        `Event revenue: ${eventType}`,
      );
    }

    // Calculate XP gain from event (tuned)
    const xpGain = Math.floor(finalRevenue / 1000) + (success ? 80 : 15);

    // Update club stats: track revenue (could be zero on failure), attempts, lastAt
    stat.attempts = (stat.attempts || 0) + 1;
    stat.lastAt = now;
    club.hostingStats[statKey] = stat;

    // Apply global economic multiplier for events
    const globalMultiplier = await computeEconomicMultiplier();
    const grossAfterMultiplier = Math.floor(finalRevenue * globalMultiplier);

    // Sinks: event tax + maintenance
    const eventTax = Math.floor(
      grossAfterMultiplier * (GAME_CONFIG.ECONOMY.EVENT_TAX || 0.1),
    );
    const maintenance = Math.floor(
      workingEquipment.length * 1000 + (club.staff?.length || 0) * 500,
    );
    const sinks = eventTax + maintenance;
    if (sinks > 0) await recordEconomySink("event_sink", sinks);

    const netRevenue = Math.max(0, grossAfterMultiplier - sinks);

    // Prepare DB updates (credit clubs with net revenue)
    const updateOps = {
      $inc: {
        balance: netRevenue,
        totalRevenue: netRevenue,
        weeklyRevenue: netRevenue,
        weeklyEvents: 1,
        xp: xpGain,
      },
      $set: {
        lastEventAt: new Date(),
        updatedAt: new Date(),
        hostingStats: club.hostingStats,
        consumables: club.consumables,
      },
    };

    // Handle reputation and violations based on outcome
    if (eventOutcome === "sold_out") {
      updateOps.$inc.reputation = 15; // Big reputation boost
    } else if (eventOutcome === "normal") {
      updateOps.$inc.reputation = 5;
    } else if (eventOutcome === "fight") {
      updateOps.$inc.reputation = -20; // Major reputation hit
      if (violationAdded) {
        updateOps.$push = {
          violations: {
            type: "fight_incident",
            description: `Fight broke out during ${eventType}`,
            date: new Date(),
          },
        };
      }
    } else if (eventOutcome === "police") {
      if (violationAdded) {
        updateOps.$inc.reputation = -25; // Severe reputation hit
        updateOps.$push = {
          violations: {
            type: "police_raid",
            description: `Police raid during ${eventType}`,
            date: new Date(),
          },
        };
      } else {
        updateOps.$inc.reputation = -10; // Minor hit (license protected you)
      }
    }

    await clubsCollection.updateOne({ userId }, updateOps);

    // Apply equipment damage if needed (from fight outcome or regular breakdown)
    if (equipmentDamage > 0) {
      const randomEquipment =
        workingEquipment[Math.floor(Math.random() * workingEquipment.length)];
      randomEquipment.currentDurability = Math.max(
        0,
        randomEquipment.currentDurability - equipmentDamage,
      );

      if (randomEquipment.currentDurability <= 0) {
        randomEquipment.broken = true;
      }

      const updatedEquipment = club.equipment.map((e) =>
        e.type === randomEquipment.type ? randomEquipment : e,
      );

      await clubsCollection.updateOne(
        { userId },
        { $set: { equipment: updatedEquipment } },
      );
    } else if (Math.random() < 0.2 && eventOutcome !== "fight") {
      // Regular breakdown chance (only if not fight outcome)
      const randomEquipment =
        workingEquipment[Math.floor(Math.random() * workingEquipment.length)];
      randomEquipment.currentDurability = Math.max(
        0,
        randomEquipment.currentDurability - 20,
      );

      if (randomEquipment.currentDurability <= 0) {
        randomEquipment.broken = true;
      }

      const updatedEquipment = club.equipment.map((e) =>
        e.type === randomEquipment.type ? randomEquipment : e,
      );

      await clubsCollection.updateOne(
        { userId },
        { $set: { equipment: updatedEquipment } },
      );
    }

    // After updating XP, check for level up
    await checkClubLevelUp(userId, clubsCollection);

    var profit = Math.max(0, finalRevenue - eventConfig.cost);

    const visibilityStatus = getVisibilityStatus(club.visibility || 50);
    const successMsg = `${outcomeEmoji} *${outcomeName}*
━━━━━━━━━━━━━━━━━━━

🎪 *Event:* ${eventType.replace(/_/g, " ")}
💰 *Investment:* ₦${eventConfig.cost.toLocaleString()}
📈 *Revenue:* ₦${finalRevenue.toLocaleString()}
💵 *Profit:* ₦${profit.toLocaleString()}
⏰ *Duration:* ${eventConfig.duration} hours
📱 *Visibility:* ${visibilityStatus.emoji} ${club.visibility || 50}% (${visibilityStatus.label})

${eventOutcome === "sold_out" ? "🎊 Incredible turnout! Tickets sold out!" : ""}
${eventOutcome === "normal" ? "✅ Smooth event, good crowd!" : ""}
${eventOutcome === "fight" ? "💔 Crowd got rowdy, causing damage!" + (equipmentDamage > 0 ? "\n🔧 Equipment damaged!" : "\n🛡️ Insurance protected your equipment!") : ""}
${eventOutcome === "police" ? "⚠️ Authorities showed up!" + (fineAmount > 0 ? `\n💸 Fine: ₦${fineAmount.toLocaleString()}` : "\n📋 Your license protected you!") : ""}
${violationAdded && eventOutcome !== "police" ? "\n📋 +1 Violation" : ""}
${usedInsurance && eventOutcome !== "fight" ? "\n🛡️ Insurance activated!" : ""}
${securityStaff > 0 ? `\n🛡️ ${securityStaff} security staff reduced incident risk` : ""}

⭐ +${xpGain} XP`;

    await m.reply(successMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club host error:"), error.message);
    await m.reply("❌ Failed to host event.");
  }
}

async function handleClubBillboard(m, sock, userId, db) {
  try {
    const billboardCollection = await getCollection("club_billboard");
    const latestBillboard = await billboardCollection.findOne(
      {},
      { sort: { updatedAt: -1 } },
    );

    if (!latestBillboard) {
      await m.reply(
        "📊 No billboard data available yet!\n\nCheck back after the first weekly update.",
      );
      return;
    }

    let billboardMsg = `📊 *Weekly Club Billboard*
Week ${latestBillboard.week}, ${latestBillboard.year}
━━━━━━━━━━━━━━━━━━━

🏆 *TOP EARNERS*

`;

    latestBillboard.topEarners.slice(0, 10).forEach((club, index) => {
      const medal =
        index === 0
          ? "🥇"
          : index === 1
            ? "🥈"
            : index === 2
              ? "🥉"
              : `${index + 1}.`;
      billboardMsg += `${medal} *${club.clubName}*
   Owner: @${club.owner}
   Revenue: ₦${club.revenue.toLocaleString()}
   Rating: ${club.rating}/100 ${getRatingEmoji(club.rating)}
   Events: ${club.events}

`;
    });

    // Check user's position
    const userClub = latestBillboard.topEarners.find(
      (c) => c.owner === userId.split("@")[0],
    );
    if (userClub) {
      billboardMsg += `📍 *Your Position:* #${userClub.rank}`;
    } else {
      billboardMsg += `📍 *Your club not in top 10*`;
    }

    billboardMsg += `\n\n💡 *Tip:* Host more events and improve your equipment to climb the rankings!`;

    await m.reply(billboardMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club billboard error:"), error.message);
    await m.reply("❌ Failed to load billboard.");
  }
}

async function handleClubBook(m, sock, args, userId, db) {
  if (args.length < 2) {
    await m.reply(
      "❌ Please specify celebrity and event!\n\n*Usage:* /club book <celebrity> <event>\n\nView available: /club market",
    );
    return;
  }

  const celebInput = args[0];
  const eventType = args[1].toLowerCase();

  try {
    const clubsCollection = await getCollection("clubs");
    const celebritiesCollection = await getCollection("celebrities");
    const club = await clubsCollection.findOne({ userId });

    if (!club) {
      await m.reply("❌ You don't own a club!");
      return;
    }

    // Use flexible matching for celebrity
    const celebResult = findCelebrity(celebInput);
    const celebConfig = celebResult?.config;
    const celebKey = celebResult?.key;

    if (!celebConfig) {
      await m.reply(
        `❌ Celebrity "${celebInput}" not found!\n\nView available: /club market`,
      );
      return;
    }

    const eventConfig = GAME_CONFIG.EVENTS[eventType];
    if (!eventConfig) {
      await m.reply(
        `❌ Event "${eventType}" not found!\n\nView available: /club host`,
      );
      return;
    }

    const celebData = (await celebritiesCollection.findOne({
      name: celebKey,
    })) || { availability: celebConfig.availability };

    // Roll for success
    if (Math.random() > celebData.availability) {
      const deposit = Math.floor(celebConfig.fee * 0.5);
      await unifiedUserManager.removeMoney(
        userId,
        deposit,
        `Failed booking deposit: ${celebKey}`,
      );

      await clubsCollection.updateOne(
        { userId },
        { $inc: { reputation: -10 } },
      );

      const violations = club.violations || [];
      violations.push({
        type: "failed_booking",
        description: `Failed to book ${celebKey.replace(/_/g, " ")}`,
        date: new Date(),
      });
      await clubsCollection.updateOne({ userId }, { $set: { violations } });

      await m.reply(
        `❌ Booking failed! ${celebKey.replace(/_/g, " ")} is unavailable.\n\nLost deposit: ₦${deposit.toLocaleString()}\n\nReputation decreased.`,
      );
      return;
    }

    const userBalance = await PluginHelpers.getBalance(userId);
    if (userBalance.wallet < celebConfig.fee) {
      await m.reply(
        `❌ Insufficient funds!\n\n*Fee:* ₦${celebConfig.fee.toLocaleString()}\n*Your Wallet:* ₦${userBalance.wallet.toLocaleString()}`,
      );
      return;
    }

    // Deduct money first
    const moneyRemoved = await unifiedUserManager.removeMoney(
      userId,
      celebConfig.fee,
      `Book ${celebKey} for ${eventType}`,
    );

    if (!moneyRemoved) {
      await m.reply("❌ Failed to deduct booking fee. Please try again.");
      return;
    }

    const newBooking = {
      celebrity: celebKey,
      event: eventType,
      bookedAt: new Date(),
      boost: celebConfig.boost,
    };

    await clubsCollection.updateOne(
      { userId },
      {
        $push: { bookings: newBooking },
        $inc: { reputation: 20 },
        $set: { updatedAt: new Date() },
      },
    );

    const successMsg = `✅ *Celebrity Booked!*

⭐ *Celebrity:* ${celebKey.replace(/_/g, " ")}
🎪 *For Event:* ${eventType.replace(/_/g, " ")}
💰 *Fee:* ₦${celebConfig.fee.toLocaleString()}
📈 *Revenue Boost:* ${Math.round((celebConfig.boost.revenue - 1) * 100)}%

💡 Host the event to apply the boost!`;

    await m.reply(successMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club book error:"), error.message);
    await m.reply("❌ Failed to book celebrity.");
  }
}

// Progression helpers
async function checkClubLevelUp(userId, clubsCollection) {
  try {
    const club = await clubsCollection.findOne({ userId });
    if (!club) return;
    const currentLevel = club.level || 1;
    const xp = club.xp || 0;
    // compute next level threshold
    let nextLevel = currentLevel + 1;
    const threshold = GAME_CONFIG.LEVELS.formula(nextLevel);
    if (xp >= threshold) {
      // level up loop in case of multiple levels
      let newLevel = currentLevel;
      while (xp >= GAME_CONFIG.LEVELS.formula(newLevel + 1)) newLevel++;
      const newRank =
        GAME_CONFIG.RANKS.slice()
          .reverse()
          .find((r) => newLevel >= r.minLevel)?.name || club.rank;
      await clubsCollection.updateOne(
        { userId },
        { $set: { level: newLevel, rank: newRank, updatedAt: new Date() } },
      );
    }
  } catch (error) {
    console.error("Level up check failed:", error.message);
  }
}

// Mini-games handler
async function handleClubPlay(m, sock, args, userId, db) {
  if (args.length === 0) {
    let gamesMsg = `🎮 *Mini-Games*\nAvailable games:\n`;
    Object.entries(GAME_CONFIG.SKILL_GAMES).forEach(([k, v]) => {
      gamesMsg += `• ${k}: ${v.description}\n`;
    });
    gamesMsg += `\n*Usage:* /club play <game> <answer>`;
    await m.reply(gamesMsg);
    return;
  }

  const game = args[0].toLowerCase();
  const clubsCollection = await getCollection("clubs");
  const club = await clubsCollection.findOne({ userId });
  if (!club) {
    await m.reply("❌ You don't own a club!");
    return;
  }

  // Ensure minimal equipment/staff for fairness
  const workingEquipment = (club.equipment || []).filter((e) => !e.broken);

  if (game === "guess") {
    const guess = parseInt(args[1], 10);
    if (!guess || guess < 1 || guess > 6) {
      await m.reply("Usage: /club play guess <number 1-6>");
      return;
    }
    const secret = Math.floor(Math.random() * 6) + 1;
    if (guess === secret) {
      const reward = 50000 + Math.floor(workingEquipment.length * 5000);
      await unifiedUserManager.addMoney(
        userId,
        reward,
        "Mini-game: guess reward",
      );
      await clubsCollection.updateOne(
        { userId },
        { $inc: { xp: 30 }, $set: { updatedAt: new Date() } },
      );
      await checkClubLevelUp(userId, clubsCollection);
      await m.reply(
        `🎉 Correct! The number was ${secret}. You win ₦${reward.toLocaleString()} and +30 XP.`,
      );
    } else {
      await clubsCollection.updateOne(
        { userId },
        { $inc: { xp: 5 }, $set: { updatedAt: new Date() } },
      );
      await checkClubLevelUp(userId, clubsCollection);
      await m.reply(`❌ Wrong. The number was ${secret}. You get +5 XP.`);
    }
    return;
  }

  if (game === "math") {
    // simple math question deterministic based on club id for testability
    const a = (club.name.length % 9) + 2;
    const b = (club.level || 1) + 1;
    const expected = a + b;
    const answer = parseInt(args[1], 10);
    if (isNaN(answer)) {
      await m.reply(
        `Usage: /club play math <answer>\nQuestion: What is ${a} + ${b}?`,
      );
      return;
    }
    if (answer === expected) {
      const reward = 30000 + (club.level || 1) * 2000;
      await unifiedUserManager.addMoney(
        userId,
        reward,
        "Mini-game: math reward",
      );
      await clubsCollection.updateOne(
        { userId },
        { $inc: { xp: 40 }, $set: { updatedAt: new Date() } },
      );
      await checkClubLevelUp(userId, clubsCollection);
      await m.reply(
        `✅ Correct! You solved ${a} + ${b}. You win ₦${reward.toLocaleString()} and +40 XP.`,
      );
    } else {
      await clubsCollection.updateOne(
        { userId },
        { $inc: { xp: 10 }, $set: { updatedAt: new Date() } },
      );
      await checkClubLevelUp(userId, clubsCollection);
      await m.reply(
        `❌ Incorrect. The correct answer was ${expected}. You get +10 XP.`,
      );
    }
    return;
  }

  await m.reply("❌ Game not found. Use `/club play` to list available games.");
}

// Show rank/info
async function handleClubRank(m, sock, args, userId, db) {
  try {
    const clubsCollection = await getCollection("clubs");
    const club = await clubsCollection.findOne({ userId });
    if (!club) {
      await m.reply("❌ You don't own a club!");
      return;
    }
    const level = club.level || 1;
    const xp = club.xp || 0;
    const next = GAME_CONFIG.LEVELS.formula(level + 1);
    await m.reply(
      `🏅 *${club.name}*\nLevel: ${level} (${club.rank || "Newbie"})\nXP: ${xp}/${next}`,
    );
  } catch (error) {
    console.error("Rank display failed:", error.message);
    await m.reply("❌ Failed to load rank info.");
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
• \`${prefix}club book <celebrity> <event>\` - Book celebrities
• \`${prefix}club upgrade <area>\` - Club improvements

📱 *VISIBILITY & MARKETING*
• \`${prefix}club pr\` - Launch PR campaigns to build visibility
• Must maintain visibility or customers flee to rivals!
• Low visibility (<30%) = severe revenue loss
• Run campaigns regularly to stay relevant

🎯 *DAILY ENGAGEMENT*
• \`${prefix}club decision\` - View & respond to daily challenges
• Earn XP and rewards by making strategic decisions
• One decision per day - face consequences or reap rewards!

📊 *COMPETITION*
• \`${prefix}club billboard\` - View weekly rankings
• \`${prefix}club compete <club>\` - Challenge rival clubs
• \`${prefix}club sabotage <club>\` - Corporate espionage
• \`${prefix}club takeover <club>\` - Acquire failing clubs

💡 *Tips:*
• Business license is mandatory to operate
• Hire technicians to reduce equipment wear
• Host regular events to build reputation
• Run PR campaigns to maintain visibility and customer base!
• Don't ignore daily decisions - they affect your club!

🎮 *Welcome to the ultimate club simulation!*`;

  await m.reply(helpMsg);
}

// Helper function for rating emojis
function getRatingEmoji(rating) {
  if (rating >= 90) return "🌟";
  if (rating >= 75) return "⭐";
  if (rating >= 50) return "🔶";
  if (rating >= 25) return "🔸";
  return "🔻";
}

// Additional command handlers for advanced features
async function handleClubCompete(m, sock, args, userId, db) {
  // Implementation for club competitions/battles
  await m.reply(
    "🚧 Competition system coming soon!\n\nCompete with other clubs for customers and prestige.",
  );
}

async function handleClubSabotage(m, sock, args, userId, db) {
  // Implementation for sabotage mechanics
  await m.reply(
    "🚧 Sabotage system coming soon!\n\nEngage in corporate espionage and dirty tactics.",
  );
}

async function handleClubTakeover(m, sock, args, userId, db) {
  // Implementation for hostile takeovers
  await m.reply(
    "🚧 Takeover system coming soon!\n\nAcquire struggling competitor clubs.",
  );
}

async function handleClubUpgrade(m, sock, args, userId, db) {
  // Implementation for club upgrades
  if (args.length === 0) {
    let upgradeMsg = `🏗️ *Available Upgrades*
━━━━━━━━━━━━━━━━━━━

`;

    Object.entries(GAME_CONFIG.UPGRADES).forEach(([key, upgrade]) => {
      upgradeMsg += `🏢 *${key.replace(/_/g, " ")}*
• Price: ₦${upgrade.price.toLocaleString()}
• Revenue Boost: ${Math.round((upgrade.boost.revenue - 1) * 100)}%
• Happiness Boost: ${Math.round(upgrade.boost.happiness * 100)}%

`;
    });

    upgradeMsg += `*Usage:* \`/club upgrade <upgrade_name>\``;

    await m.reply(upgradeMsg);
    return;
  }

  await m.reply("🚧 Upgrade purchase system coming in next update!");
}

async function handleClubFire(m, sock, args, userId, db) {
  if (args.length === 0) {
    await m.reply(
      "❌ Please specify staff member to fire!\n\n*Usage:* /club fire <staff_type> or /club fire <staff_name>",
    );
    return;
  }

  await m.reply(
    "🚧 Staff firing system coming soon!\n\nManage your workforce more effectively.",
  );
}

async function handleClubLeaderboard(m, sock, userId, db) {
  try {
    const clubsCollection = await getCollection("clubs");
    const topClubs = await clubsCollection
      .find({})
      .sort({ totalRevenue: -1 })
      .limit(15)
      .toArray();

    if (topClubs.length === 0) {
      await m.reply(
        "📊 No clubs registered yet!\n\nBe the first to start a club empire!",
      );
      return;
    }

    let leaderboardMsg = `🏆 *All-Time Club Leaderboard*
━━━━━━━━━━━━━━━━━━━

`;

    topClubs.forEach((club, index) => {
      const medal =
        index === 0
          ? "👑"
          : index === 1
            ? "🥈"
            : index === 2
              ? "🥉"
              : `${index + 1}.`;
      const rating = calculateClubRating(club);

      leaderboardMsg += `${medal} *${club.name}*
   Owner: @${club.userId.split("@")[0]}
   Total Revenue: ₦${club.totalRevenue.toLocaleString()}
   Rating: ${rating}/100 ${getRatingEmoji(rating)}
   Equipment: ${(club.equipment || []).length}
   Staff: ${(club.staff || []).length}

`;
    });

    // Find user's position
    const userClub = topClubs.find((c) => c.userId === userId);
    const userPosition = userClub ? topClubs.indexOf(userClub) + 1 : null;

    if (userPosition) {
      leaderboardMsg += `📍 *Your Position:* #${userPosition}`;
    } else {
      leaderboardMsg += `📍 *Your club not in top 15*`;
    }

    await m.reply(leaderboardMsg);
  } catch (error) {
    console.error(chalk.red("❌ Club leaderboard error:"), error.message);
    await m.reply("❌ Failed to load leaderboard.");
  }
}

// Daily Decisions Handler
async function handleClubDecision(m, sock, args, userId, db) {
  try {
    const clubsCollection = await getCollection("clubs");
    const decisionsCollection = await getCollection("club_decisions");

    const club = await clubsCollection.findOne({ userId });
    if (!club) {
      await m.reply("❌ You don't own a club! Use `/club register` to start.");
      return;
    }

    // Get today's pending decision
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingDecision = await decisionsCollection.findOne({
      userId,
      createdAt: { $gte: today },
      resolved: false,
    });

    if (!pendingDecision) {
      await m.reply(
        "🎉 *No pending decisions right now!*\n\n✅ You've made your daily decision or there isn't one yet.\n\nDecisions are assigned daily at midnight. Check back later for new challenges!",
      );
      return;
    }

    // Show the decision with options
    let decisionMsg = `${pendingDecision.emoji} *${pendingDecision.title}*\n━━━━━━━━━━━━━━━━━━━\n\n📝 *Situation:*\n${pendingDecision.situation}\n\n*What will you do?*\n\n`;

    pendingDecision.options.forEach((option, index) => {
      decisionMsg += `${option.emoji} ${option.text}\n`;
    });

    decisionMsg += `\n💡 *Reply with just the number* (1, 2, or 3) to this message to make your choice.`;

    // Send decision message and store selection context
    const sentMsg = await m.reply(decisionMsg);

    // Store the selection handler for this message
    storeSelectionContext(
      sentMsg.id || m.id,
      "decision",
      pendingDecision.options,
      async (choiceNumber) => {
        await processDecisionChoice(
          choiceNumber,
          pendingDecision,
          userId,
          club,
          clubsCollection,
          decisionsCollection,
          m,
          sock,
        );
      },
    );
  } catch (error) {
    console.error(chalk.red("❌ Decision handler error:"), error.message);
    await m.reply("❌ Failed to load your daily decision. Please try again.");
  }
}

// Process player's decision choice
async function processDecisionChoice(
  choiceNumber,
  decision,
  userId,
  club,
  clubsCollection,
  decisionsCollection,
  m,
  sock,
) {
  try {
    const chosenOption = decision.options[choiceNumber - 1];
    if (!chosenOption) {
      await m.reply("❌ Invalid choice! Please select 1, 2, or 3.");
      return;
    }

    const effects = chosenOption.effects;

    // Apply effects to club
    let updates = { updatedAt: new Date() };
    let messageText = `✅ *You chose: "${chosenOption.text}"*\n━━━━━━━━━━━━━━━━━━━\n\n`;

    // Money changes
    if (effects.money !== undefined && effects.money !== 0) {
      updates.balance = Math.max(0, (club.balance || 0) + effects.money);
      messageText +=
        effects.money > 0
          ? `💰 +₦${Math.abs(effects.money).toLocaleString()}\n`
          : `💸 -₦${Math.abs(effects.money).toLocaleString()}\n`;
    }

    // XP changes
    if (effects.xp !== undefined) {
      updates.xp = (club.xp || 0) + effects.xp;
      messageText += `⭐ +${effects.xp} XP\n`;
    }

    // Happiness changes
    if (effects.happiness !== undefined) {
      updates.reputation = Math.max(
        0,
        Math.min(100, (club.reputation || 50) + effects.happiness),
      );
      messageText +=
        effects.happiness > 0
          ? `😊 Happiness +${effects.happiness}\n`
          : `😔 Happiness ${effects.happiness}\n`;
    }

    // Revenue multiplier changes
    if (effects.revenue !== undefined) {
      messageText +=
        effects.revenue > 0
          ? `📈 Revenue increased by ${Math.round(effects.revenue * 100)}%\n`
          : `📉 Revenue decreased by ${Math.round(Math.abs(effects.revenue) * 100)}%\n`;
    }

    // Violations changes
    if (effects.violations !== undefined) {
      updates.violations = club.violations || [];
      if (effects.violations > 0) {
        for (let i = 0; i < effects.violations; i++) {
          updates.violations.push({
            type: "decision_consequence",
            description: `Decision: ${decision.title} - ${chosenOption.text}`,
            date: new Date(),
          });
        }
        messageText += `🚨 +${effects.violations} violation(s)\n`;
      } else if (effects.violations < 0) {
        // Remove violations
        updates.violations = updates.violations.slice(
          0,
          Math.max(0, updates.violations.length + effects.violations),
        );
        messageText += `✅ Resolved ${Math.abs(effects.violations)} violation(s)\n`;
      }
    }

    // Club status changes
    if (effects.isActive !== undefined) {
      updates.isActive = effects.isActive;
      if (!effects.isActive) {
        messageText += `⛔ *CLUB SHUTDOWN* - Critical decision consequences!\n`;
      }
    }

    // Update club in database
    await clubsCollection.updateOne({ userId }, { $set: updates });

    // Mark decision as resolved
    await decisionsCollection.updateOne(
      { _id: decision._id },
      {
        $set: {
          resolved: true,
          choice: choiceNumber,
          chosenOption: chosenOption.text,
          resolvedAt: new Date(),
        },
      },
    );

    // Check for level up
    await checkClubLevelUp(userId, clubsCollection);

    messageText += `\n🏢 *Your club has been updated!*`;
    await m.reply(messageText);
  } catch (error) {
    console.error(
      chalk.red("❌ Decision choice processing error:"),
      error.message,
    );
    await m.reply(
      "❌ An error occurred while processing your decision. Please try again.",
    );
  }
}

// ============================================================
// CLUB VISIBILITY & PR SYSTEM
// ============================================================

// PR Activity Handler
async function handleClubPR(m, sock, args, userId, db) {
  try {
    const clubsCollection = await getCollection("clubs");

    const club = await clubsCollection.findOne({ userId });
    if (!club) {
      await m.reply("❌ You don't own a club! Use `/club register` to start.");
      return;
    }

    if (args.length === 0) {
      // Show PR menu
      let prMsg = `📱 *Club Visibility & PR System*
━━━━━━━━━━━━━━━━━━━

📊 *Current Visibility:* ${club.visibility || 50}%

*Available PR Activities:*
`;

      let optionNum = 1;
      const options = Object.entries(GAME_CONFIG.PR_ACTIVITIES);

      options.forEach(([key, activity]) => {
        prMsg += `\n${optionNum}️⃣ ${activity.name}
   💰 Cost: ₦${activity.cost.toLocaleString()}
   📈 Visibility: +${activity.visibility_gain}%
   ⏱️ Duration: ${activity.duration_hours}h
   📝 ${activity.description}`;
        optionNum++;
      });

      prMsg += `\n\n💡 *Usage:* Reply with the number (1-4) to launch that campaign!
⚠️ Low visibility (<30%) = customer churn
🔴 Critical (<10%) = severe revenue loss`;

      const message = await m.reply(prMsg);
      storeSelectionContext(message.key.id, "pr_activity", options, (choice) =>
        processPRChoice(m, choice, userId, db),
      );
      return;
    }

    const activityKey = args[0].toLowerCase();
    const activity = GAME_CONFIG.PR_ACTIVITIES[activityKey];

    if (!activity) {
      await m.reply(
        "❌ Invalid PR activity. Use `/club pr` to see available options.",
      );
      return;
    }

    await processPRActivity(m, userId, db, activityKey, activity);
  } catch (error) {
    console.error(chalk.red("❌ PR handler error:"), error.message);
    await m.reply("❌ An error occurred processing your PR activity.");
  }
}

// Process PR Activity Choice from Selection
async function processPRChoice(m, selectedIndex, userId, db) {
  try {
    const clubsCollection = await getCollection("clubs");
    const club = await clubsCollection.findOne({ userId });

    if (!club) {
      await m.reply("❌ Club not found.");
      return;
    }

    const options = Object.entries(GAME_CONFIG.PR_ACTIVITIES);
    if (selectedIndex < 1 || selectedIndex > options.length) {
      await m.reply("❌ Invalid selection.");
      return;
    }

    const [activityKey, activity] = options[selectedIndex - 1];
    await processPRActivity(m, userId, db, activityKey, activity);
  } catch (error) {
    console.error(chalk.red("❌ PR choice error:"), error.message);
    await m.reply("❌ Error processing your selection.");
  }
}

// Execute PR Activity
async function processPRActivity(m, userId, db, activityKey, activity) {
  try {
    const clubsCollection = await getCollection("clubs");
    const club = await clubsCollection.findOne({ userId });

    if (!club) {
      await m.reply("❌ Club not found.");
      return;
    }

    // Check funds
    const userBalance = await unifiedUserManager.getBalance(userId);
    if (userBalance < activity.cost) {
      await m.reply(
        `❌ Insufficient funds! You have ₦${userBalance.toLocaleString()} but need ₦${activity.cost.toLocaleString()}`,
      );
      return;
    }

    // Deduct cost
    await unifiedUserManager.removeMoney(
      userId,
      activity.cost,
      `PR Activity - ${activity.name}`,
    );

    // Calculate final visibility gain with some randomness (+/- 10%)
    const variability = Math.random() * 0.2 - 0.1; // -10% to +10%
    const actualGain = Math.floor(activity.visibility_gain * (1 + variability));

    // Update visibility
    const currentVisibility = club.visibility || 50;
    const newVisibility = Math.min(100, currentVisibility + actualGain);
    const visibilityGain = newVisibility - currentVisibility;

    // Store PR activity record
    const prActivitiesCollection = await getCollection("club_pr_activities");
    await prActivitiesCollection.insertOne({
      userId,
      clubName: club.name,
      activityType: activityKey,
      activityName: activity.name,
      cost: activity.cost,
      visibilityGain: visibilityGain,
      createdAt: new Date(),
      expiresAt: new Date(
        Date.now() + activity.duration_hours * 60 * 60 * 1000,
      ),
    });

    // Update club visibility
    await clubsCollection.updateOne(
      { userId },
      {
        $set: {
          visibility: newVisibility,
          lastVisibilityUpdate: new Date(),
          updatedAt: new Date(),
        },
      },
    );

    // Success message
    let successMsg = `✅ *PR Campaign Launched!*
━━━━━━━━━━━━━━━━━━━

🎯 *Activity:* ${activity.name}
💰 *Investment:* ₦${activity.cost.toLocaleString()}
📈 *Visibility Gained:* +${visibilityGain}%
⏱️ *Duration:* ${activity.duration_hours} hours

📊 *Club Visibility:* ${currentVisibility}% → ${newVisibility}%`;

    if (newVisibility >= 80) {
      successMsg += `\n\n🔥 *TRENDING!* Your club is now a major hotspot!`;
    } else if (newVisibility >= 60) {
      successMsg += `\n\n⭐ Your club is building buzz!`;
    }

    successMsg += `\n\n💡 Your club visibility will slowly decay over time. Run campaigns regularly to stay relevant!`;

    await m.reply(successMsg);
  } catch (error) {
    console.error(chalk.red("❌ PR activity execution error:"), error.message);
    await m.reply("❌ An error occurred while processing your PR activity.");
  }
}

// Process Daily Visibility Decay - Scheduled Task
async function processVisibilityDecay(context) {
  try {
    const clubsCollection = await getCollection("clubs");
    const prActivitiesCollection = await getCollection("club_pr_activities");

    // Get all active clubs
    const clubs = await clubsCollection.find({ isActive: true }).toArray();

    let decayCount = 0;
    let affectedCount = 0;

    for (const club of clubs) {
      try {
        // Clean up expired PR activities
        await prActivitiesCollection.deleteMany({
          userId: club.userId,
          expiresAt: { $lt: new Date() },
        });

        // Calculate decay (-5% to -10% per day)
        const currentVisibility = club.visibility || 50;
        const decayRate = 0.05 + Math.random() * 0.05; // 5-10%
        const decayAmount = Math.floor(currentVisibility * decayRate);
        const newVisibility = Math.max(0, currentVisibility - decayAmount);

        // Determine consequences
        let revenueModifier = 1.0;
        let message = "";

        if (newVisibility < 10) {
          // Critical: severe loss
          revenueModifier = 0.4;
          message = "🔴 CRITICAL VISIBILITY - Customers fleeing to rivals!";
        } else if (newVisibility < 30) {
          // Low: customer churn
          revenueModifier = 0.7;
          message = "⚠️ LOW VISIBILITY - Customer churn increasing!";
        } else if (newVisibility < 50) {
          // Medium-low: slight loss
          revenueModifier = 0.9;
          message = "📉 Visibility dropping - Consider PR campaigns!";
        }

        // Update club
        const updates = {
          $set: {
            visibility: newVisibility,
            visibilityDecayMessage: message,
            lastVisibilityDecay: new Date(),
            visibilityRevenueModifier: revenueModifier,
            updatedAt: new Date(),
          },
        };

        await clubsCollection.updateOne({ userId: club.userId }, updates);

        decayCount++;

        if (message) {
          affectedCount++;
          console.log(
            chalk.yellow(`⚠️  ${club.name}: ${message} (${newVisibility}%)`),
          );
        }
      } catch (clubError) {
        console.error(
          chalk.red(`Error processing visibility decay for ${club.name}:`),
          clubError.message,
        );
      }
    }

    console.log(
      chalk.green(
        `✅ Visibility decay processed: ${decayCount} clubs, ${affectedCount} affected`,
      ),
    );
  } catch (error) {
    console.error(
      chalk.red("❌ Visibility decay scheduled task error:"),
      error.message,
    );
  }
}

// Helper function to get visibility status emoji and description
function getVisibilityStatus(visibility) {
  if (visibility >= 80)
    return {
      emoji: "🔥",
      label: "TRENDING",
      description: "Extremely popular, high demand",
    };
  if (visibility >= 60)
    return {
      emoji: "⭐",
      label: "POPULAR",
      description: "Well-known, steady customers",
    };
  if (visibility >= 40)
    return {
      emoji: "📈",
      label: "GROWING",
      description: "Gaining recognition",
    };
  if (visibility >= 30)
    return {
      emoji: "⚠️",
      label: "DECLINING",
      description: "Customer interest dropping",
    };
  if (visibility >= 10)
    return {
      emoji: "🔴",
      label: "CRITICAL",
      description: "Severe visibility loss",
    };
  return { emoji: "⛔", label: "UNKNOWN", description: "Club fading away" };
}
