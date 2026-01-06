// plugins/township.js - Progressive City Building & Farming Simulation Game (V3)
import chalk from "chalk";
import moment from "moment-timezone";
import {
  PluginHelpers,
  unifiedUserManager,
  safeOperation,
  getCollection,
} from "../lib/pluginIntegration.js";

// ============================================================
// RATE LIMITER
// ============================================================
const rateLimitStore = {};
const RATE_LIMIT_WINDOW = 10 * 1000; // 10 seconds
const RATE_LIMIT_MAX = 3; // max 3 commands per window

function isRateLimited(userId, command) {
  const now = Date.now();
  if (!rateLimitStore[userId]) rateLimitStore[userId] = {};
  if (!rateLimitStore[userId][command]) rateLimitStore[userId][command] = [];
  rateLimitStore[userId][command] = rateLimitStore[userId][command].filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW,
  );
  if (rateLimitStore[userId][command].length >= RATE_LIMIT_MAX) return true;
  rateLimitStore[userId][command].push(now);
  return false;
}

// ============================================================
// SELECTION CONTEXT STORE
// ============================================================
const selectionContextStore = {};

function storeSelectionContext(messageId, type, options, handler) {
  selectionContextStore[messageId] = {
    type,
    options,
    handler,
    createdAt: Date.now(),
  };
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
// V3 PLUGIN EXPORT
// ============================================================
export default {
  name: "Township",
  version: "1.0.0",
  author: "Bot Developer",
  description:
    "Progressive city-building & farming simulation game with level-based unlocking",
  category: "simulation",
  commands: ["township", "town"],
  aliases: ["ts"],
  scheduledTasks: [
    {
      name: "crop_growth",
      schedule: "*/10 * * * *", // Every 10 minutes
      description: "Process crop growth on farms",
      handler: async (context) => await processCropGrowth(context),
    },
    {
      name: "production_completion",
      schedule: "*/15 * * * *", // Every 15 minutes
      description: "Complete production in factories",
      handler: async (context) => await processProduction(context),
    },
    {
      name: "resource_generation",
      schedule: "0 */6 * * *", // Every 6 hours
      description: "Generate passive resources",
      handler: async (context) => await generatePassiveResources(context),
    },
    {
      name: "spawn_orders",
      schedule: "*/30 * * * *", // Every 30 minutes
      description: "Spawn new world orders (helicopter, train, zoo, plane)",
      handler: async (context) => await spawnOrders(context),
    },
    {
      name: "daily_bonus",
      schedule: "0 0 * * *", // Daily at midnight
      description: "Award daily login bonus",
      handler: async (context) => await awardDailyBonus(context),
    },
    {
      name: "leaderboard_update",
      schedule: "0 1 * * *", // Daily at 1 AM
      description: "Update leaderboards",
      handler: async (context) => await updateLeaderboards(context),
    },
  ],

  async run(context) {
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

    // Handle selection responses
    if (m.quoted && m.quoted.text) {
      const selectionNumber = parseInt(m.body.trim(), 10);
      if (!isNaN(selectionNumber) && selectionNumber > 0) {
        const selectionContext = getSelectionContext(m.quoted.id);
        if (selectionContext) {
          if (selectionNumber <= selectionContext.options.length) {
            try {
              await selectionContext.handler(selectionNumber, m, sock, userId, db);
              return;
            } catch (error) {
              console.error(
                chalk.red("❌ Selection handler error:"),
                error.message,
              );
              await m.reply(
                "❌ An error occurred. Please try again.",
              );
              return;
            }
          } else {
            await m.reply(
              `❌ Invalid selection! Choose 1-${selectionContext.options.length}.`,
            );
            return;
          }
        }
      }
    }

    // Rate limiting
    if (isRateLimited(userId, subCommand)) {
      await m.reply("⏳ You're sending commands too quickly. Wait a few seconds.");
      return;
    }

    try {
      switch (subCommand) {
        case "start":
          await handleStart(m, sock, userId, db);
          break;
        case "status":
        case "info":
          await handleStatus(m, sock, userId, db);
          break;
        case "build":
          await handleBuild(m, sock, args.slice(1), userId, db);
          break;
        case "farm":
          await handleFarm(m, sock, args.slice(1), userId, db);
          break;
        case "harvest":
          await handleHarvest(m, sock, args.slice(1), userId, db);
          break;
        case "factory":
          await handleFactory(m, sock, args.slice(1), userId, db);
          break;
        case "produce":
          await handleProduce(m, sock, args.slice(1), userId, db);
          break;
        case "trade":
          await handleTrade(m, sock, args.slice(1), userId, db);
          break;
        case "market":
          await handleMarket(m, sock, userId, db);
          break;
        case "orders":
          await handleOrders(m, sock, userId, db);
          break;
        case "fulfill":
          await handleFulfill(m, sock, args.slice(1), userId, db);
          break;
        case "inventory":
        case "inv":
          await handleInventory(m, sock, userId, db);
          break;
        case "buildings":
          await handleBuildings(m, sock, userId, db);
          break;
        case "level":
          await handleLevel(m, sock, userId, db);
          break;
        case "leaderboard":
          await handleLeaderboard(m, sock, userId, db);
          break;
        case "reward":
          await handleReward(m, sock, userId, db);
          break;
        case "help":
          await showTownshipHelp(m, sock, config.PREFIX);
          break;
        default:
          await showTownshipHelp(m, sock, config.PREFIX);
          break;
      }
    } catch (error) {
      logger.error(error, "❌ Township error");
      await m.reply("❌ An error occurred. Please try again.");
    }
  },
};

// ============================================================
// GAME CONFIGURATION
// ============================================================

const GAME_CONFIG = {
  // Level progression
  LEVEL_SYSTEM: {
    maxLevel: 100,
    baseExpForLevel: 100,
    expMultiplier: 1.15, // Each level requires 15% more exp
  },

  // Resources
  RESOURCES: {
    coins: { name: "Coins", emoji: "🪙" },
    experience: { name: "Experience", emoji: "⭐" },
    energy: { name: "Energy", emoji: "⚡" },
  },

  // Crops - unlock at specific levels
  CROPS: {
    wheat: {
      name: "Wheat",
      emoji: "🌾",
      unlocksAt: 1,
      growthTime: 600, // 10 minutes in seconds
      yield: 3,
      sellPrice: 50,
    },
    corn: {
      name: "Corn",
      emoji: "🌽",
      unlocksAt: 5,
      growthTime: 900, // 15 minutes
      yield: 4,
      sellPrice: 75,
    },
    tomato: {
      name: "Tomato",
      emoji: "🍅",
      unlocksAt: 10,
      growthTime: 1200, // 20 minutes
      yield: 5,
      sellPrice: 100,
    },
    carrot: {
      name: "Carrot",
      emoji: "🥕",
      unlocksAt: 15,
      growthTime: 1200,
      yield: 4,
      sellPrice: 90,
    },
    sunflower: {
      name: "Sunflower",
      emoji: "🌻",
      unlocksAt: 20,
      growthTime: 1500,
      yield: 3,
      sellPrice: 150,
    },
    grape: {
      name: "Grape",
      emoji: "🍇",
      unlocksAt: 30,
      growthTime: 1800, // 30 minutes
      yield: 6,
      sellPrice: 200,
    },
    apple: {
      name: "Apple",
      emoji: "🍎",
      unlocksAt: 40,
      growthTime: 2100,
      yield: 5,
      sellPrice: 180,
    },
  },

  // Buildings - unlock at specific levels
  BUILDINGS: {
    // Basic
    farm: {
      name: "Farm",
      emoji: "🚜",
      unlocksAt: 1,
      price: 500,
      slots: 2,
      maxPerLevel: 1,
      type: "farm",
      description: "Grow crops",
    },
    storage: {
      name: "Storage",
      emoji: "📦",
      unlocksAt: 3,
      price: 1000,
      capacity: 50,
      type: "storage",
      description: "Store resources",
    },

    // Intermediate
    factory: {
      name: "Factory",
      emoji: "🏭",
      unlocksAt: 10,
      price: 5000,
      slots: 2,
      maxPerLevel: 1,
      type: "production",
      description: "Produce goods from raw materials",
    },
    market: {
      name: "Market Stall",
      emoji: "🏪",
      unlocksAt: 15,
      price: 3000,
      type: "trading",
      description: "Trade with other players",
    },

    // Advanced
    silo: {
      name: "Silo",
      emoji: "🗼",
      unlocksAt: 25,
      price: 15000,
      capacity: 200,
      type: "storage",
      description: "Large-scale storage",
    },
    greenhouse: {
      name: "Greenhouse",
      emoji: "🌱",
      unlocksAt: 35,
      price: 20000,
      slots: 5,
      maxPerLevel: 2,
      type: "farm",
      description: "Advanced farming with faster growth",
    },
    processing_plant: {
      name: "Processing Plant",
      emoji: "⚙️",
      unlocksAt: 50,
      price: 50000,
      slots: 4,
      maxPerLevel: 2,
      type: "production",
      description: "Advanced production with better yields",
    },

    // Late game
    harbor: {
      name: "Harbor",
      emoji: "⚓",
      unlocksAt: 70,
      price: 100000,
      type: "trading",
      description: "Trade with distant markets",
    },
    mega_factory: {
      name: "Mega Factory",
      emoji: "🏢",
      unlocksAt: 85,
      price: 200000,
      slots: 8,
      maxPerLevel: 3,
      type: "production",
      description: "Maximum production capacity",
    },
  },

  // Production recipes - unlock at specific levels
  RECIPES: {
    flour: {
      name: "Flour",
      emoji: "🥖",
      unlocksAt: 12,
      inputs: { wheat: 2 },
      outputs: { flour: 1 },
      time: 300, // 5 minutes
      sellPrice: 150,
    },
    bread: {
      name: "Bread",
      emoji: "🍞",
      unlocksAt: 20,
      inputs: { flour: 1, wheat: 1 },
      outputs: { bread: 1 },
      time: 600,
      sellPrice: 250,
    },
    juice: {
      name: "Juice",
      emoji: "🧃",
      unlocksAt: 25,
      inputs: { grape: 3 },
      outputs: { juice: 1 },
      time: 450,
      sellPrice: 300,
    },
    jam: {
      name: "Jam",
      emoji: "🍓",
      unlocksAt: 35,
      inputs: { apple: 2, grape: 1 },
      outputs: { jam: 1 },
      time: 600,
      sellPrice: 400,
    },
    sauce: {
      name: "Sauce",
      emoji: "🍅",
      unlocksAt: 40,
      inputs: { tomato: 3, carrot: 1 },
      outputs: { sauce: 1 },
      time: 500,
      sellPrice: 350,
    },
  },
  // Orders configuration
  ORDERS: {
    sources: ["helicopter", "train", "plane", "zoo"],
    spawn: {
      maxActive: 50,
      perSpawn: [1, 4], // spawn 1-4 orders each interval
      minRewardMultiplier: 1.1,
      maxRewardMultiplier: 2.5,
      minTTLMinutes: 30,
      maxTTLMinutes: 240,
    },
    // urgency tiers affect reward
    urgency: {
      low: 1,
      medium: 1.3,
      high: 1.7,
    },
  },
};

// ============================================================
// HANDLER FUNCTIONS
// ============================================================

async function handleStart(m, sock, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (player) {
      await m.reply("You already have a township! Use *!township status* to view it.");
      return;
    }

    // Use unified user manager for coins (shared wallet)
    await unifiedUserManager.addMoney(userId, 1000, "Township starting bonus");

    const newPlayer = {
      userId,
      createdAt: new Date(),
      level: 1,
      experience: 0,
      energy: 100,
      maxEnergy: 100,
      buildings: {},
      farms: {},
      factories: {},
      inventory: {},
      completedDailyBonus: false,
    };

    await collection.insertOne(newPlayer);

    const msg = `
✨ *Welcome to Township!* ✨

Your new town is created! 

📊 *Starting Resources:*
🪙 Coins: 1,000
⚡ Energy: 100/100

🎯 *First Steps:*
1. Build a farm: *!township build farm*
2. Plant crops: *!township farm <farm-id> <crop>*
3. Harvest when ready: *!township harvest <farm-id>*
4. Sell crops: *!township trade sell <item> <amount>*

💡 *Pro Tips:*
- Each level unlocks new buildings and crops
- Factories convert raw materials into valuable goods
- Check your level: *!township level*
- View status: *!township status*
- See all commands: *!township help*

Good luck! 🚀
    `;
    await m.reply(msg);
  } catch (error) {
    console.error("Error starting township:", error);
    await m.reply("❌ Error creating your township.");
  }
}

async function handleStatus(m, sock, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ You don't have a township yet. Use *!township start*");
      return;
    }

    // Get coins from unified wallet
    const userWallet = await unifiedUserManager.getMoney(userId);

    const nextLevelExp = calculateExpForLevel(player.level + 1);
    const currentLevelExp = calculateExpForLevel(player.level);
    const expProgress = ((player.experience - currentLevelExp) / (nextLevelExp - currentLevelExp) * 100).toFixed(1);

    const buildingCount = Object.keys(player.buildings).length;
    const farmCount = Object.keys(player.farms).length;
    const factoryCount = Object.keys(player.factories).length;

    const msg = `
🏘️ *Your Township - Level ${player.level}*

📊 *Resources:*
🪙 Coins: ${userWallet.toLocaleString()}
⭐ Experience: ${player.experience.toLocaleString()} / ${nextLevelExp.toLocaleString()}
   Progress: ${"█".repeat(Math.floor(expProgress / 5))}░ ${expProgress}%
⚡ Energy: ${player.energy}/${player.maxEnergy}

🏢 *Buildings:*
📦 Total: ${buildingCount}
🚜 Farms: ${farmCount}
🏭 Factories: ${factoryCount}

📦 *Storage:*
${getStorageInfo(player)}

🎁 Use *!township help* to see all commands
    `;
    await m.reply(msg);
  } catch (error) {
    console.error("Error getting status:", error);
    await m.reply("❌ Error fetching your status.");
  }
}

async function handleBuild(m, sock, args, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ You don't have a township yet. Use *!township start*");
      return;
    }

    if (args.length === 0) {
      // Show available buildings
      const available = Object.entries(GAME_CONFIG.BUILDINGS)
        .filter(([_, b]) => b.unlocksAt <= player.level)
        .map(([id, b]) => `${b.emoji} ${b.name} - ${b.price.toLocaleString()} coins (Level ${b.unlocksAt}+)`);

      const msg = `🏢 *Available Buildings:*\n${available.join("\n")}\n\nUse: *!township build <name>*`;
      const sentMsg = await m.reply(msg);
      return;
    }

    const buildingName = args.join(" ").toLowerCase();
    const buildingEntry = Object.entries(GAME_CONFIG.BUILDINGS).find(
      ([_, b]) => b.name.toLowerCase() === buildingName,
    );

    if (!buildingEntry) {
      await m.reply("❌ Building not found.");
      return;
    }

    const [buildingId, building] = buildingEntry;

    if (building.unlocksAt > player.level) {
      await m.reply(
        `❌ This building unlocks at level ${building.unlocksAt}. You are level ${player.level}.`,
      );
      return;
    }

    // Check unified wallet
    const userCoins = await unifiedUserManager.getMoney(userId);
    if (userCoins < building.price) {
      await m.reply(
        `❌ You need ${(building.price - userCoins).toLocaleString()} more coins.`,
      );
      return;
    }

    const buildingKey = buildingId + "_" + Date.now();
    // Deduct from unified wallet
    await unifiedUserManager.removeMoney(userId, building.price, `Township building: ${building.name}`);
    if (building.type === "farm") {
      player.farms[buildingKey] = {
        id: buildingKey,
        type: buildingId,
        crops: {},
        createdAt: new Date(),
      };
    } else if (building.type === "production") {
      player.factories[buildingKey] = {
        id: buildingKey,
        type: buildingId,
        production: {},
        createdAt: new Date(),
      };
    } else {
      player.buildings[buildingId] ||= [];
      player.buildings[buildingId].push({
        id: buildingKey,
        createdAt: new Date(),
      });
    }

    await collection.updateOne({ userId }, { $set: player });

    const remainingCoins = await unifiedUserManager.getMoney(userId);
    await m.reply(
      `✅ Built ${building.emoji} ${building.name}!\n💰 Cost: ${building.price.toLocaleString()} coins\n🪙 Remaining: ${remainingCoins.toLocaleString()}`,
    );
  } catch (error) {
    console.error("Error building:", error);
    await m.reply("❌ Error building structure.");
  }
}

async function handleFarm(m, sock, args, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ No township found.");
      return;
    }

    if (Object.keys(player.farms).length === 0) {
      await m.reply("❌ You don't have any farms yet. Build one with *!township build farm*");
      return;
    }

    if (args.length < 2) {
      const farmList = Object.entries(player.farms)
        .map(
          ([id, f], idx) =>
            `${idx + 1}. Farm #${id.substring(0, 8)}\n   Crops: ${Object.keys(f.crops).length}`,
        )
        .join("\n");

      const msg = `🚜 *Your Farms:*\n${farmList}\n\nUse: *!township farm <farm-id> <crop>*`;
      await m.reply(msg);
      return;
    }

    const farmId = args[0];
    const cropName = args.slice(1).join(" ").toLowerCase();

    const farm = player.farms[farmId];
    if (!farm) {
      await m.reply("❌ Farm not found.");
      return;
    }

    const cropEntry = Object.entries(GAME_CONFIG.CROPS).find(
      ([_, c]) => c.name.toLowerCase() === cropName,
    );

    if (!cropEntry) {
      await m.reply("❌ Crop not found.");
      return;
    }

    const [cropId, crop] = cropEntry;

    if (crop.unlocksAt > player.level) {
      await m.reply(
        `❌ This crop unlocks at level ${crop.unlocksAt}. You are level ${player.level}.`,
      );
      return;
    }

    const slotKey = "slot_" + Date.now();
    farm.crops[slotKey] = {
      type: cropId,
      plantedAt: Date.now(),
      readyAt: Date.now() + crop.growthTime * 1000,
    };

    await collection.updateOne({ userId }, { $set: player });

    const timeMin = Math.ceil(crop.growthTime / 60);
    await m.reply(
      `✅ Planted ${crop.emoji} ${crop.name}!\n⏱️ Ready in ${timeMin} minutes`,
    );
  } catch (error) {
    console.error("Error farming:", error);
    await m.reply("❌ Error planting crop.");
  }
}

async function handleHarvest(m, sock, args, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ No township found.");
      return;
    }

    if (args.length === 0) {
      const readyFarms = Object.entries(player.farms)
        .filter(([_, f]) => Object.values(f.crops).some((c) => Date.now() >= c.readyAt))
        .map(([id, _], idx) => `${idx + 1}. Farm #${id.substring(0, 8)}`);

      if (readyFarms.length === 0) {
        await m.reply("❌ No farms ready for harvest.");
        return;
      }

      const msg = `🌾 *Ready to Harvest:*\n${readyFarms.join("\n")}\n\nUse: *!township harvest <farm-id>*`;
      await m.reply(msg);
      return;
    }

    const farmId = args[0];
    const farm = player.farms[farmId];

    if (!farm) {
      await m.reply("❌ Farm not found.");
      return;
    }

    let harvested = {};
    const now = Date.now();
    const readySlots = Object.entries(farm.crops).filter(([_, c]) => now >= c.readyAt);

    if (readySlots.length === 0) {
      await m.reply("❌ No crops ready to harvest.");
      return;
    }

    for (const [slotKey, crop] of readySlots) {
      const cropData = GAME_CONFIG.CROPS[crop.type];
      harvested[crop.type] = (harvested[crop.type] || 0) + cropData.yield;
      player.experience += 10;
      delete farm.crops[slotKey];
    }

    // Add to inventory
    for (const [cropType, amount] of Object.entries(harvested)) {
      player.inventory[cropType] = (player.inventory[cropType] || 0) + amount;
    }

    await collection.updateOne({ userId }, { $set: player });

    const harvestedText = Object.entries(harvested)
      .map(([type, amount]) => `${GAME_CONFIG.CROPS[type].emoji} ${amount} ${GAME_CONFIG.CROPS[type].name}`)
      .join("\n");

    await m.reply(`✅ *Harvest Complete!*\n${harvestedText}\n⭐ +10 Experience`);
  } catch (error) {
    console.error("Error harvesting:", error);
    await m.reply("❌ Error harvesting crops.");
  }
}

async function handleFactory(m, sock, args, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ No township found.");
      return;
    }

    if (Object.keys(player.factories).length === 0) {
      await m.reply("❌ You don't have any factories yet. Build one with *!township build factory*");
      return;
    }

    const factoryList = Object.entries(player.factories)
      .map(
        ([id, f], idx) =>
          `${idx + 1}. Factory #${id.substring(0, 8)}\n   Production: ${Object.keys(f.production).length}`,
      )
      .join("\n");

    const msg = `🏭 *Your Factories:*\n${factoryList}\n\nUse: *!township produce <factory-id> <recipe>*`;
    await m.reply(msg);
  } catch (error) {
    console.error("Error viewing factories:", error);
    await m.reply("❌ Error viewing factories.");
  }
}

async function handleProduce(m, sock, args, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ No township found.");
      return;
    }

    if (args.length < 2) {
      const available = Object.entries(GAME_CONFIG.RECIPES)
        .filter(([_, r]) => r.unlocksAt <= player.level)
        .map(([id, r]) => {
          const inputs = Object.entries(r.inputs)
            .map(([type, amount]) => `${amount} ${GAME_CONFIG.CROPS[type].name}`)
            .join(" + ");
          return `${r.emoji} ${r.name}: ${inputs}`;
        });

      const msg = `🏭 *Available Recipes:*\n${available.join("\n")}\n\nUse: *!township produce <factory-id> <recipe>*`;
      await m.reply(msg);
      return;
    }

    const factoryId = args[0];
    const recipeName = args.slice(1).join(" ").toLowerCase();

    const factory = player.factories[factoryId];
    if (!factory) {
      await m.reply("❌ Factory not found.");
      return;
    }

    const recipeEntry = Object.entries(GAME_CONFIG.RECIPES).find(
      ([_, r]) => r.name.toLowerCase() === recipeName,
    );

    if (!recipeEntry) {
      await m.reply("❌ Recipe not found.");
      return;
    }

    const [recipeId, recipe] = recipeEntry;

    if (recipe.unlocksAt > player.level) {
      await m.reply(
        `❌ This recipe unlocks at level ${recipe.unlocksAt}. You are level ${player.level}.`,
      );
      return;
    }

    // Check inventory
    for (const [inputType, amount] of Object.entries(recipe.inputs)) {
      if ((player.inventory[inputType] || 0) < amount) {
        await m.reply(
          `❌ You need ${amount} ${GAME_CONFIG.CROPS[inputType].name} but have ${player.inventory[inputType] || 0}.`,
        );
        return;
      }
    }

    // Deduct inputs
    for (const [inputType, amount] of Object.entries(recipe.inputs)) {
      player.inventory[inputType] -= amount;
    }

    const slotKey = "slot_" + Date.now();
    factory.production[slotKey] = {
      recipe: recipeId,
      startedAt: Date.now(),
      completedAt: Date.now() + recipe.time * 1000,
    };

    await collection.updateOne({ userId }, { $set: player });

    const timeMin = Math.ceil(recipe.time / 60);
    await m.reply(
      `✅ Started production of ${recipe.emoji} ${recipe.name}!\n⏱️ Ready in ${timeMin} minutes`,
    );
  } catch (error) {
    console.error("Error producing:", error);
    await m.reply("❌ Error starting production.");
  }
}

async function handleInventory(m, sock, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ No township found.");
      return;
    }

    const inventoryList = Object.entries(player.inventory)
      .map(([type, amount]) => {
        const item = GAME_CONFIG.CROPS[type] || GAME_CONFIG.RECIPES[type] || { emoji: "❓", name: type };
        return `${item.emoji} ${item.name}: ${amount}`;
      });

    if (inventoryList.length === 0) {
      await m.reply("📦 Your inventory is empty.");
      return;
    }

    const msg = `📦 *Your Inventory:*\n${inventoryList.join("\n")}`;
    await m.reply(msg);
  } catch (error) {
    console.error("Error viewing inventory:", error);
    await m.reply("❌ Error viewing inventory.");
  }
}

async function handleTrade(m, sock, args, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ No township found.");
      return;
    }

    if (args.length === 0) {
      const msg = `
💱 *Trading System*

Sell crops and products:
*!township trade sell <item> <amount>*

Example: *!township trade sell wheat 10*

Your sellable items:
${Object.entries(player.inventory)
  .map(([type, amount]) => {
    const item = GAME_CONFIG.CROPS[type] || GAME_CONFIG.RECIPES[type];
    return `${item.emoji} ${item.name} (${amount}) - ${item.sellPrice} coins each`;
  })
  .join("\n")}
      `;
      await m.reply(msg);
      return;
    }

    if (args[0] === "sell" && args.length >= 3) {
      const itemName = args.slice(1, -1).join(" ").toLowerCase();
      const amount = parseInt(args[args.length - 1], 10);

      if (isNaN(amount) || amount <= 0) {
        await m.reply("❌ Invalid amount.");
        return;
      }

      const itemEntry = Object.entries({ ...GAME_CONFIG.CROPS, ...GAME_CONFIG.RECIPES }).find(
        ([_, item]) => item.name.toLowerCase() === itemName,
      );

      if (!itemEntry) {
        await m.reply("❌ Item not found.");
        return;
      }

      const [itemType, item] = itemEntry;
      const havingAmount = player.inventory[itemType] || 0;

      if (havingAmount < amount) {
        await m.reply(`❌ You only have ${havingAmount} but trying to sell ${amount}.`);
        return;
      }

      const totalPrice = amount * item.sellPrice;
      player.inventory[itemType] -= amount;
      await unifiedUserManager.addMoney(userId, totalPrice, `Township sold ${amount}x ${item.name}`);
      player.experience += Math.floor(amount * 5);

      await collection.updateOne({ userId }, { $set: player });

      const currentCoins = await unifiedUserManager.getMoney(userId);
      await m.reply(
        `✅ Sold ${amount} x ${item.emoji} ${item.name}\n💰 Earned: ${totalPrice.toLocaleString()} coins\n💰 Balance: ${currentCoins.toLocaleString()}\n⭐ +${Math.floor(amount * 5)} Experience`,
      );
    }
  } catch (error) {
    console.error("Error trading:", error);
    await m.reply("❌ Error processing trade.");
  }
}

async function handleBuildings(m, sock, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ No township found.");
      return;
    }

    const allBuildings = [];
    for (const [type, instances] of Object.entries(player.buildings)) {
      const building = GAME_CONFIG.BUILDINGS[type];
      allBuildings.push(`${building.emoji} ${building.name}: ${instances.length}`);
    }
    for (const [_, farm] of Object.entries(player.farms)) {
      const building = GAME_CONFIG.BUILDINGS[farm.type];
      allBuildings.push(`${building.emoji} ${building.name} - ${Object.keys(farm.crops).length} crops`);
    }
    for (const [_, factory] of Object.entries(player.factories)) {
      const building = GAME_CONFIG.BUILDINGS[factory.type];
      allBuildings.push(`${building.emoji} ${building.name} - ${Object.keys(factory.production).length} items`);
    }

    const msg = `🏘️ *Your Buildings:*\n${allBuildings.join("\n")}`;
    await m.reply(msg);
  } catch (error) {
    console.error("Error viewing buildings:", error);
    await m.reply("❌ Error viewing buildings.");
  }
}

async function handleLevel(m, sock, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ No township found.");
      return;
    }

    const nextLevelExp = calculateExpForLevel(player.level + 1);
    const currentLevelExp = calculateExpForLevel(player.level);
    const expForCurrentLevel = nextLevelExp - currentLevelExp;
    const currentExp = player.experience - currentLevelExp;
    const percentage = (currentExp / expForCurrentLevel * 100).toFixed(1);

    const unlockedAtLevel = Object.entries({
      ...GAME_CONFIG.CROPS,
      ...GAME_CONFIG.BUILDINGS,
      ...GAME_CONFIG.RECIPES,
    })
      .filter(([_, item]) => item.unlocksAt === player.level + 1)
      .map(([_, item]) => `${item.emoji} ${item.name}`);

    const msg = `
⭐ *Level ${player.level}* / 100

📊 *Experience Progress:*
${"█".repeat(Math.floor(percentage / 5))}░ ${percentage}%
${currentExp} / ${expForCurrentLevel} XP

🔓 *Next Level Unlocks:*
${unlockedAtLevel.length > 0 ? unlockedAtLevel.join("\n") : "Check next level!"}
    `;
    await m.reply(msg);
  } catch (error) {
    console.error("Error viewing level:", error);
    await m.reply("❌ Error viewing level.");
  }
}

async function handleLeaderboard(m, sock, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const topPlayers = await collection
      .find()
      .sort({ level: -1, experience: -1 })
      .limit(10)
      .toArray();

    const leaderboard = topPlayers
      .map(
        (p, idx) => `${idx + 1}. Level ${p.level} - ${p.experience.toLocaleString()} XP`,
      );

    const msg = `🏆 *Township Leaderboard:*\n${leaderboard.join("\n")}`;
    await m.reply(msg);
  } catch (error) {
    console.error("Error viewing leaderboard:", error);
    await m.reply("❌ Error viewing leaderboard.");
  }
}

async function handleMarket(m, sock, userId, db) {
  try {
    const msg = `
🏪 *Township Market*

Coming soon! Buy and sell items with other players.

For now, sell your crops using:
*!township trade sell <item> <amount>*
    `;
    await m.reply(msg);
  } catch (error) {
    console.error("Error viewing market:", error);
    await m.reply("❌ Error viewing market.");
  }
}

async function handleReward(m, sock, userId, db) {
  try {
    const collection = await getCollection(db, "township_players");
    const player = await collection.findOne({ userId });

    if (!player) {
      await m.reply("❌ No township found.");
      return;
    }

    const today = new Date().toDateString();
    if (player.completedDailyBonus && player.lastBonusDate === today) {
      await m.reply("❌ You already claimed your daily bonus! Come back tomorrow.");
      return;
    }

    const bonus = 100;
    await unifiedUserManager.addMoney(userId, bonus, "Township daily bonus");
    player.completedDailyBonus = true;
    player.lastBonusDate = today;

    await collection.updateOne({ userId }, { $set: player });

    const currentCoins = await unifiedUserManager.getMoney(userId);
    await m.reply(`🎁 *Daily Bonus Claimed!*\n💰 +${bonus} Coins\n💰 Balance: ${currentCoins.toLocaleString()}`);
  } catch (error) {
    console.error("Error claiming reward:", error);
    await m.reply("❌ Error claiming reward.");
  }
}

async function showTownshipHelp(m, sock, prefix) {
  const msg = `
🏘️ *Township - City Building Game*

📚 *Commands:*
${prefix}township start - Start a new township
${prefix}township status - View your township
${prefix}township level - View your progress
${prefix}township build [name] - Build a structure
${prefix}township farm [id] [crop] - Plant crops
${prefix}township harvest [id] - Harvest crops
${prefix}township factory - View factories
${prefix}township produce [id] [recipe] - Produce goods
${prefix}township trade sell [item] [amount] - Sell items
${prefix}township inventory - View your items
${prefix}township buildings - List all buildings
${prefix}township market - View market
${prefix}township leaderboard - See top players
${prefix}township reward - Claim daily bonus
${prefix}township orders - View active world orders (helicopter/train/plane/zoo)
${prefix}township fulfill <order-id> <amount> - Fulfill an order from your inventory
${prefix}township help - Show this help

🎮 *Game Features:*
✅ Progressive level system (1-100)
✅ Farming with various crops
✅ Production chains (factories)
✅ Resource management
✅ Trading system
✅ Building unlocks at each level

Start with: ${prefix}township start
  `;
  await m.reply(msg);
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function calculateExpForLevel(level) {
  if (level === 1) return 0;
  let exp = 0;
  for (let i = 1; i < level; i++) {
    exp += GAME_CONFIG.LEVEL_SYSTEM.baseExpForLevel * Math.pow(GAME_CONFIG.LEVEL_SYSTEM.expMultiplier, i - 1);
  }
  return Math.floor(exp);
}

function getStorageInfo(player) {
  const items = Object.keys(player.inventory).length;
  return items > 0
    ? Object.entries(player.inventory)
        .slice(0, 5)
        .map(([type, amount]) => {
          const item = GAME_CONFIG.CROPS[type] || GAME_CONFIG.RECIPES[type];
          return `${item.emoji} ${amount} ${item.name}`;
        })
        .join("\n")
    : "Empty";
}

function formatTimeRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ============================================================
// SCHEDULED TASK HANDLERS
// ============================================================

async function processCropGrowth(context) {
  try {
    const db = context.db;
    const collection = await getCollection(db, "township_players");
    // Process crop growth for all players
    // This is a background task
  } catch (error) {
    console.error("Error processing crop growth:", error);
  }
}

async function processProduction(context) {
  try {
    const db = context.db;
    const collection = await getCollection(db, "township_players");
    // Process factory production for all players
  } catch (error) {
    console.error("Error processing production:", error);
  }
}

async function generatePassiveResources(context) {
  try {
    // Generate passive resources for players with storage buildings
  } catch (error) {
    console.error("Error generating passive resources:", error);
  }
}

// Spawn world orders (helicopter/train/plane/zoo) to create objectives
async function spawnOrders(context) {
  try {
    const db = context.db;
    const ordersCol = await getCollection(db, "township_orders");
    const playersCol = await getCollection(db, "township_players");

    const activeCount = await ordersCol.countDocuments({ expiresAt: { $gt: new Date() }, remaining: { $gt: 0 } });
    if (activeCount >= (GAME_CONFIG.ORDERS.spawn.maxActive || 50)) return;

    const spawnCount = Math.floor(Math.random() * (GAME_CONFIG.ORDERS.spawn.perSpawn[1] - GAME_CONFIG.ORDERS.spawn.perSpawn[0] + 1)) + GAME_CONFIG.ORDERS.spawn.perSpawn[0];
    const possibleItems = Object.keys(GAME_CONFIG.CROPS).concat(Object.keys(GAME_CONFIG.RECIPES));

    for (let i = 0; i < spawnCount; i++) {
      const item = possibleItems[Math.floor(Math.random() * possibleItems.length)];
      const isCrop = !!GAME_CONFIG.CROPS[item];
      const basePrice = (isCrop ? GAME_CONFIG.CROPS[item].sellPrice : GAME_CONFIG.RECIPES[item].sellPrice) || 50;
      const qty = Math.floor(Math.random() * 20) + 5; // 5-24 units
      const urgencyRoll = Math.random();
      const urgency = urgencyRoll > 0.85 ? "high" : urgencyRoll > 0.5 ? "medium" : "low";
      const urgencyMult = GAME_CONFIG.ORDERS.urgency[urgency] || 1;
      const rewardMultiplier = GAME_CONFIG.ORDERS.spawn.minRewardMultiplier + Math.random() * (GAME_CONFIG.ORDERS.spawn.maxRewardMultiplier - GAME_CONFIG.ORDERS.spawn.minRewardMultiplier);
      const totalReward = Math.max(1, Math.floor(basePrice * qty * urgencyMult * rewardMultiplier * 0.9));
      const ttl = (GAME_CONFIG.ORDERS.spawn.minTTLMinutes + Math.floor(Math.random() * (GAME_CONFIG.ORDERS.spawn.maxTTLMinutes - GAME_CONFIG.ORDERS.spawn.minTTLMinutes + 1))) * 60 * 1000;

      const order = {
        itemType: item,
        quantity: qty,
        remaining: qty,
        reward: totalReward,
        rewardPerUnit: Math.max(1, Math.floor(totalReward / qty)),
        source: GAME_CONFIG.ORDERS.sources[Math.floor(Math.random() * GAME_CONFIG.ORDERS.sources.length)],
        urgency,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttl),
        completedAt: null,
      };

      await ordersCol.insertOne(order);
    }
  } catch (error) {
    console.error("Error spawning orders:", error);
  }
}

// List active orders to player
async function handleOrders(m, sock, userId, db) {
  try {
    const ordersCol = await getCollection(db, "township_orders");
    const now = new Date();
    const active = await ordersCol.find({ expiresAt: { $gt: now }, remaining: { $gt: 0 } }).sort({ urgency: -1 }).limit(10).toArray();

    if (!active || active.length === 0) {
      await m.reply("📭 There are no active world orders right now. Check back soon!");
      return;
    }

    const lines = active.map((o) => {
      const name = (GAME_CONFIG.CROPS[o.itemType] || GAME_CONFIG.RECIPES[o.itemType] || { name: o.itemType }).name;
      const etaMinutes = Math.max(1, Math.ceil((o.expiresAt - Date.now()) / 60000));
      return `ID:${o._id.toString().slice(-6)} | ${name} x${o.remaining} | Reward:${o.reward} | ${o.source} | ${o.urgency} | ETA:${etaMinutes}m`;
    });

    const msg = `📦 *Active World Orders:*
${lines.join("\n")}

Fulfill with: *!township fulfill <order-id-suffix> <amount>* (use the 6-char suffix shown)`;
    await m.reply(msg);
  } catch (error) {
    console.error("Error listing orders:", error);
    await m.reply("❌ Error fetching orders.");
  }
}

// Fulfill an order by order-id suffix (last 6 chars) and amount
async function handleFulfill(m, sock, args, userId, db) {
  try {
    if (!args || args.length < 2) {
      await m.reply("Usage: !township fulfill <order-id-suffix> <amount>");
      return;
    }

    const idSuffix = args[0].toLowerCase();
    const amount = parseInt(args[1], 10);
    if (isNaN(amount) || amount <= 0) {
      await m.reply("❌ Invalid amount.");
      return;
    }

    const ordersCol = await getCollection(db, "township_orders");
    const playerCol = await getCollection(db, "township_players");
    const player = await playerCol.findOne({ userId });
    if (!player) {
      await m.reply("❌ No township found.");
      return;
    }

    // Find matching order by suffix
    const now = new Date();
    const orders = await ordersCol.find({ expiresAt: { $gt: now }, remaining: { $gt: 0 } }).toArray();
    const order = orders.find((o) => o._id.toString().slice(-6).toLowerCase() === idSuffix);
    if (!order) {
      await m.reply("❌ Order not found or expired.");
      return;
    }

    const itemType = order.itemType;
    const have = player.inventory[itemType] || 0;
    if (have <= 0) {
      await m.reply(`❌ You don't have any ${(GAME_CONFIG.CROPS[itemType]||GAME_CONFIG.RECIPES[itemType]||{name:itemType}).name} in your inventory.`);
      return;
    }

    const take = Math.min(amount, have, order.remaining);
    if (take <= 0) {
      await m.reply("❌ Nothing to fulfill.");
      return;
    }

    // Deduct from player inventory
    player.inventory[itemType] -= take;
    if (player.inventory[itemType] <= 0) delete player.inventory[itemType];

    // Reward calculation
    const perUnit = order.rewardPerUnit || Math.max(1, Math.floor(order.reward / Math.max(1, order.quantity)));
    const reward = perUnit * take;

    // Update order
    await ordersCol.updateOne({ _id: order._id }, { $inc: { remaining: -take }, $set: { updatedAt: new Date() } });
    const updated = await ordersCol.findOne({ _id: order._id });
    if (updated.remaining <= 0) {
      await ordersCol.updateOne({ _id: order._id }, { $set: { completedAt: new Date() } });
    }

    // Pay user
    await unifiedUserManager.addMoney(userId, reward, `Fulfilled order ${order._id.toString().slice(-6)}`);

    // Grant XP
    player.experience = (player.experience || 0) + Math.floor(reward / 10);

    const playerColUpdate = await playerCol.updateOne({ userId }, { $set: player });

    const balance = await unifiedUserManager.getMoney(userId);
    await m.reply(`✅ Fulfilled ${take} x ${(GAME_CONFIG.CROPS[itemType]||GAME_CONFIG.RECIPES[itemType]||{name:itemType}).name}\n💰 Reward: ${reward} coins\n💰 Balance: ${balance.toLocaleString()}\n⭐ +${Math.floor(reward/10)} XP\n📦 Order Remaining: ${Math.max(0, updated.remaining)}`);
  } catch (error) {
    console.error("Error fulfilling order:", error);
    await m.reply("❌ Error fulfilling order.");
  }
}

async function awardDailyBonus(context) {
  try {
    // Award daily bonuses to active players
  } catch (error) {
    console.error("Error awarding daily bonus:", error);
  }
}

async function updateLeaderboards(context) {
  try {
    // Update leaderboards
  } catch (error) {
    console.error("Error updating leaderboards:", error);
  }
}
