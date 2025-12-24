// plugins/real_estate.js - Real Estate Empire Game Plugin
// Integrates with the existing economy system for risky property investment

// ---------------------------------------------------------------- //
//  PLUGIN METADATA & ENTRY POINT
// ---------------------------------------------------------------- //

// Extract commands and aliases
const oldInfo = {
  name: 'Real Estate Empire',
  version: '1.0.0',
  author: 'AI Assistant',
  description: 'A risky real estate investment game with properties, disasters, and market volatility.',
  commands: [
    { name: 'realestate', aliases: ['re', 'property'], description: 'Main real estate menu' },
    { name: 'buyproperty', aliases: ['buyre'], description: 'Buy land or properties' },
    { name: 'sellproperty', aliases: ['sellre'], description: 'Sell properties' },
    { name: 'develop', aliases: ['build'], description: 'Develop land into properties' },
    { name: 'manage', aliases: ['mng'], description: 'Manage your properties' },
    { name: 'market', aliases: ['remarket'], description: 'View property market prices' },
    { name: 'portfolio', aliases: ['reportfolio'], description: 'View your real estate portfolio' },
    { name: 'events', aliases: ['revents'], description: 'View active real estate events' },
  ]
};

// Generate V3 command and alias lists
const v3Commands = oldInfo.commands.map(cmd => cmd.name);
const v3Aliases = oldInfo.commands.flatMap(cmd => cmd.aliases || []);

export default {
  // ===== V3 Metadata =====
  name: oldInfo.name,
  version: oldInfo.version,
  author: oldInfo.author,
  description: oldInfo.description,
  category: 'games',

  // ===== V3 Command Handling =====
  commands: v3Commands,
  aliases: v3Aliases,

  // ===== Scheduled Tasks =====
  scheduledTasks: [
    {
      name: 'market_fluctuation',
      description: 'Update property prices and trigger random events',
      schedule: '0 */6 * * *', // Every 6 hours
      handler: (context) => updateMarketConditions(context)
    },
    {
      name: 'property_maintenance',
      description: 'Apply maintenance costs and check for disasters',
      schedule: '0 9 * * *', // Daily at 9 AM
      handler: (context) => applyMaintenanceCosts(context)
    }
  ],

  // ===== V3 Main Handler =====
  async run(context) {
    // Destructure the V3 context object
    const { msg: m, args, text, command, sock, db, config, bot, logger, helpers } = context;
    const { PermissionHelpers, TimeHelpers } = helpers;

    try {
      // Route to appropriate handler
      const subCommand = command.toLowerCase().replace('realestate', '').trim() || 'menu';

      switch (subCommand) {
        case 'menu':
          await showRealEstateMenu(context);
          break;
        case 'buyproperty':
        case 'buy':
          await handleBuyProperty(context, args);
          break;
        case 'sellproperty':
        case 'sell':
          await handleSellProperty(context, args);
          break;
        case 'develop':
        case 'build':
          await handleDevelopProperty(context, args);
          break;
        case 'manage':
        case 'mng':
          await handleManageProperties(context, args);
          break;
        case 'market':
          await handleMarketView(context);
          break;
        case 'portfolio':
          await handlePortfolioView(context);
          break;
        case 'events':
          await handleEventsView(context);
          break;
        default:
          await context.reply('❓ *Unknown real estate command. Use `realestate` for menu.*');
      }
    } catch (error) {
      logger.error('Real Estate Plugin Error:', error);
      await context.reply('❌ *Real estate system error. Please try again.*');
    }
  }
};

// ---------------------------------------------------------------- //
//  GAME DATA & CONFIGURATION
// ---------------------------------------------------------------- //

// Property types with base prices and characteristics
const PROPERTY_TYPES = {
  land: {
    name: 'Land',
    basePrice: 50000,
    volatility: 0.15,
    emoji: '🌱',
    description: 'Empty land ready for development',
    developmentCost: 25000,
    developmentTime: 2, // days
    maintenanceCost: 500,
    riskLevel: 'Low'
  },
  house: {
    name: 'House',
    basePrice: 150000,
    volatility: 0.12,
    emoji: '🏠',
    description: 'Residential property',
    developmentCost: 75000,
    developmentTime: 5,
    maintenanceCost: 2000,
    riskLevel: 'Medium',
    rentalIncome: 5000 // daily
  },
  apartment: {
    name: 'Apartment Complex',
    basePrice: 500000,
    volatility: 0.18,
    emoji: '🏢',
    description: 'Multi-unit residential building',
    developmentCost: 250000,
    developmentTime: 10,
    maintenanceCost: 8000,
    riskLevel: 'High',
    rentalIncome: 15000
  },
  commercial: {
    name: 'Commercial Building',
    basePrice: 1000000,
    volatility: 0.25,
    emoji: '🏬',
    description: 'Office/retail space',
    developmentCost: 500000,
    developmentTime: 15,
    maintenanceCost: 15000,
    riskLevel: 'Very High',
    rentalIncome: 25000
  },
  luxury: {
    name: 'Luxury Estate',
    basePrice: 5000000,
    volatility: 0.30,
    emoji: '🏰',
    description: 'High-end luxury property',
    developmentCost: 2500000,
    developmentTime: 20,
    maintenanceCost: 50000,
    riskLevel: 'Extreme',
    rentalIncome: 75000
  }
};

// Market conditions that affect prices
let marketConditions = {
  trend: 'stable', // stable, booming, crashing, volatile
  modifier: 1.0,
  lastUpdate: new Date()
};

// Active events that affect gameplay
let activeEvents = [];

// Random events that can occur
const RANDOM_EVENTS = [
  {
    name: 'Market Boom',
    description: 'Property prices surge by 50%',
    effect: { priceModifier: 1.5, duration: 24 }, // hours
    probability: 0.1,
    emoji: '📈'
  },
  {
    name: 'Economic Recession',
    description: 'Property prices drop by 30%',
    effect: { priceModifier: 0.7, duration: 48 },
    probability: 0.15,
    emoji: '📉'
  },
  {
    name: 'Natural Disaster',
    description: 'Random properties damaged, repair costs required',
    effect: { disaster: true, damagePercent: 0.2 },
    probability: 0.05,
    emoji: '🌪️'
  },
  {
    name: 'Tenant Strike',
    description: 'Rental income reduced by 50% for 3 days',
    effect: { rentalModifier: 0.5, duration: 72 },
    probability: 0.08,
    emoji: '👥'
  },
  {
    name: 'Government Subsidy',
    description: 'Development costs reduced by 25%',
    effect: { developmentModifier: 0.75, duration: 24 },
    probability: 0.12,
    emoji: '🏛️'
  }
];

// ---------------------------------------------------------------- //
//  CORE GAME FUNCTIONS
// ---------------------------------------------------------------- //

// Update market conditions and prices
async function updateMarketConditions(context) {
  const { logger } = context;

  try {
    // Update property prices based on volatility
    for (const [type, data] of Object.entries(PROPERTY_TYPES)) {
      const change = (Math.random() - 0.5) * 2 * data.volatility;
      data.currentPrice = Math.max(1000, data.basePrice * (1 + change));
    }

    // Random events
    if (Math.random() < 0.3) { // 30% chance every 6 hours
      const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
      activeEvents.push({
        ...event,
        startTime: new Date(),
        endTime: new Date(Date.now() + event.effect.duration * 60 * 60 * 1000)
      });

      // Limit to 3 active events
      if (activeEvents.length > 3) {
        activeEvents.shift();
      }

      logger.info(`Real Estate Event: ${event.name}`);
    }

    marketConditions.lastUpdate = new Date();
  } catch (error) {
    logger.error('Error updating market conditions:', error);
  }
}

// Apply maintenance costs and disasters
async function applyMaintenanceCosts(context) {
  const { logger, sock } = context;

  try {
    // This would iterate through all users' properties and apply costs
    // For now, just log that it runs
    logger.info('Applying real estate maintenance costs');

    // In full implementation, would:
    // - Deduct maintenance costs from owners
    // - Apply rental income
    // - Handle disasters
    // - Send notifications for bankruptcies

  } catch (error) {
    logger.error('Error applying maintenance costs:', error);
  }
}

// Show main real estate menu
async function showRealEstateMenu(context) {
  const { reply, config } = context;

  const menuText = `🏠 *REAL ESTATE EMPIRE* 🏠\n\n` +
                  `Welcome to the high-stakes world of property investment!\n\n` +
                  `💰 *Invest in:* Land → Houses → Apartments → Commercial → Luxury\n` +
                  `⚡ *Risks:* Market crashes, disasters, maintenance costs\n` +
                  `🎯 *Rewards:* Rental income, property appreciation\n\n` +
                  `📋 *Commands:*\n` +
                  `• *buyproperty* - Purchase land/properties\n` +
                  `• *develop* - Build on your land\n` +
                  `• *manage* - Handle property maintenance\n` +
                  `• *market* - View current prices\n` +
                  `• *portfolio* - Your property holdings\n` +
                  `• *events* - Active market events\n\n` +
                  `⚠️ *Warning:* This is highly speculative! You can lose everything!`;

  await reply(menuText);
}

// Handle property purchases
async function handleBuyProperty(context, args) {
  const { reply, senderId, config } = context;

  try {
    if (!args || args.length === 0) {
      const types = Object.entries(PROPERTY_TYPES)
        .map(([key, data]) => `${data.emoji} *${data.name}* - ${config.currency || '₦'}${data.basePrice.toLocaleString()}`)
        .join('\n');

      await reply(`🏠 *AVAILABLE PROPERTIES*\n\n${types}\n\nUse: \`buyproperty <type>\`\nExample: \`buyproperty house\``);
      return;
    }

    const propertyType = args[0].toLowerCase();
    const property = PROPERTY_TYPES[propertyType];

    if (!property) {
      await reply('❌ *Invalid property type. Use `buyproperty` to see options.*');
      return;
    }

    // Check if user can afford it
    const userData = await getUserData(senderId);
    const price = property.basePrice;

    if (userData.balance < price) {
      await reply(`❌ *Insufficient funds!*\n\n💰 *Cost:* ${config.currency || '₦'}${price.toLocaleString()}\n💵 *Your Balance:* ${config.currency || '₦'}${userData.balance.toLocaleString()}`);
      return;
    }

    // Deduct money
    await removeMoney(senderId, price, `Purchased ${property.name}`);

    // Add property to portfolio
    const newProperty = {
      id: `${propertyType}_${Date.now()}`,
      type: propertyType,
      purchasePrice: price,
      purchaseDate: new Date(),
      condition: 100, // 0-100
      developed: propertyType === 'land' ? false : true,
      rentalIncome: property.rentalIncome || 0
    };

    await updateUserData(senderId, {
      $push: { 'realEstate.properties': newProperty }
    });

    await reply(`✅ *Property Purchased!*\n\n${property.emoji} *${property.name}*\n💰 *Cost:* ${config.currency || '₦'}${price.toLocaleString()}\n📅 *Date:* ${new Date().toLocaleDateString()}\n\nUse \`develop\` to build on land!`);

  } catch (error) {
    await reply('❌ *Error purchasing property. Please try again.*');
    console.error('Buy property error:', error);
  }
}

// Handle property development
async function handleDevelopProperty(context, args) {
  const { reply, senderId, config } = context;

  try {
    const userData = await getUserData(senderId);
    const properties = userData.realEstate?.properties || [];

    const undevelopedLand = properties.filter(p => !p.developed);

    if (undevelopedLand.length === 0) {
      await reply('🏗️ *No undeveloped land found!*\n\nPurchase land first with `buyproperty land`');
      return;
    }

    if (!args || args.length === 0) {
      const landList = undevelopedLand
        .map((p, i) => `${i + 1}. ${PROPERTY_TYPES[p.type].emoji} Land (ID: ${p.id.slice(-6)})`)
        .join('\n');

      await reply(`🏗️ *UNDEVELOPED LAND*\n\n${landList}\n\nUse: \`develop <number> <building_type>\`\nExample: \`develop 1 house\`\n\n*Available buildings:* house, apartment, commercial, luxury`);
      return;
    }

    const landIndex = parseInt(args[0]) - 1;
    const buildingType = args[1]?.toLowerCase();

    if (isNaN(landIndex) || landIndex < 0 || landIndex >= undevelopedLand.length) {
      await reply('❌ *Invalid land number.*');
      return;
    }

    const building = PROPERTY_TYPES[buildingType];
    if (!building || buildingType === 'land') {
      await reply('❌ *Invalid building type. Choose: house, apartment, commercial, luxury*');
      return;
    }

    const selectedLand = undevelopedLand[landIndex];

    // Check development cost
    if (userData.balance < building.developmentCost) {
      await reply(`❌ *Insufficient funds for development!*\n\n💰 *Cost:* ${config.currency || '₦'}${building.developmentCost.toLocaleString()}\n💵 *Your Balance:* ${config.currency || '₦'}${userData.balance.toLocaleString()}`);
      return;
    }

    // Deduct cost
    await removeMoney(senderId, building.developmentCost, `Developed land into ${building.name}`);

    // Update property
    await updateUserData(senderId, {
      $set: {
        [`realEstate.properties.${properties.indexOf(selectedLand)}.type`]: buildingType,
        [`realEstate.properties.${properties.indexOf(selectedLand)}.developed`]: true,
        [`realEstate.properties.${properties.indexOf(selectedLand)}.rentalIncome`]: building.rentalIncome,
        [`realEstate.properties.${properties.indexOf(selectedLand)}.developmentDate`]: new Date()
      }
    });

    await reply(`✅ *Development Complete!*\n\n${building.emoji} *${building.name}*\n💰 *Cost:* ${config.currency || '₦'}${building.developmentCost.toLocaleString()}\n📈 *Daily Rental:* ${config.currency || '₦'}${building.rentalIncome.toLocaleString()}\n\n⚠️ *Remember maintenance costs!*`);

  } catch (error) {
    await reply('❌ *Error developing property. Please try again.*');
    console.error('Develop property error:', error);
  }
}

// Handle property management
async function handleManageProperties(context, args) {
  const { reply, senderId, config } = context;

  try {
    const userData = await getUserData(senderId);
    const properties = userData.realEstate?.properties || [];

    if (properties.length === 0) {
      await reply('🏠 *No properties to manage!*\n\nStart by buying land with `buyproperty land`');
      return;
    }

    // Calculate total rental income and maintenance costs
    let totalIncome = 0;
    let totalMaintenance = 0;
    let damagedCount = 0;

    properties.forEach(p => {
      const propData = PROPERTY_TYPES[p.type];
      totalIncome += p.rentalIncome || 0;
      totalMaintenance += propData.maintenanceCost;
      if (p.condition < 80) damagedCount++;
    });

    const netIncome = totalIncome - totalMaintenance;

    let manageText = `🏠 *PROPERTY MANAGEMENT* 🏠\n\n` +
                    `📊 *Portfolio Overview:*\n` +
                    `• Properties: ${properties.length}\n` +
                    `• Damaged: ${damagedCount}\n\n` +
                    `💰 *Daily Finances:*\n` +
                    `• Rental Income: ${config.currency || '₦'}${totalIncome.toLocaleString()}\n` +
                    `• Maintenance: ${config.currency || '₦'}${totalMaintenance.toLocaleString()}\n` +
                    `• Net Income: ${config.currency || '₦'}${netIncome.toLocaleString()}\n\n`;

    if (damagedCount > 0) {
      manageText += `⚠️ *${damagedCount} properties need repairs!*\nUse \`manage repair <property_id>\`\n\n`;
    }

    manageText += `💡 *Management Tips:*\n• Monitor property conditions\n• Repair damaged buildings\n• Watch for market events\n• Diversify your portfolio`;

    await reply(manageText);

  } catch (error) {
    await reply('❌ *Error loading property management. Please try again.*');
    console.error('Manage properties error:', error);
  }
}

// Handle market view
async function handleMarketView(context) {
  const { reply, config } = context;

  const marketText = `📊 *PROPERTY MARKET* 📊\n\n` +
                    `Current market conditions: *${marketConditions.trend.toUpperCase()}*\n\n` +
                    Object.entries(PROPERTY_TYPES).map(([key, data]) =>
                      `${data.emoji} *${data.name}*\n` +
                      `💰 Base: ${config.currency || '₦'}${data.basePrice.toLocaleString()}\n` +
                      `📈 Risk: ${data.riskLevel}\n` +
                      `⚡ Volatility: ${(data.volatility * 100).toFixed(0)}%\n`
                    ).join('\n') +
                    `\n\n⚠️ *Prices fluctuate every 6 hours!*\n🎲 *Random events can occur!*`;

  await reply(marketText);
}

// Handle portfolio view
async function handlePortfolioView(context) {
  const { reply, senderId, config } = context;

  try {
    const userData = await getUserData(senderId);
    const properties = userData.realEstate?.properties || [];

    if (properties.length === 0) {
      await reply('📁 *Your portfolio is empty!*\n\nStart building with `buyproperty land`');
      return;
    }

    let portfolioText = `📁 *YOUR REAL ESTATE PORTFOLIO* 📁\n\n`;
    let totalValue = 0;
    let totalIncome = 0;

    properties.forEach((p, i) => {
      const propData = PROPERTY_TYPES[p.type];
      const currentValue = Math.floor(p.purchasePrice * (1 + (Math.random() - 0.5) * 0.2)); // Simulated appreciation
      totalValue += currentValue;
      totalIncome += p.rentalIncome || 0;

      portfolioText += `${i + 1}. ${propData.emoji} *${propData.name}*\n` +
                      `   💰 Value: ${config.currency || '₦'}${currentValue.toLocaleString()}\n` +
                      `   📈 Income: ${config.currency || '₦'}${(p.rentalIncome || 0).toLocaleString()}/day\n` +
                      `   ❤️ Condition: ${p.condition}%\n` +
                      `   📅 Owned: ${Math.floor((Date.now() - new Date(p.purchaseDate)) / 86400000)} days\n\n`;
    });

    portfolioText += `💎 *Total Portfolio Value:* ${config.currency || '₦'}${totalValue.toLocaleString()}\n` +
                    `💵 *Total Daily Income:* ${config.currency || '₦'}${totalIncome.toLocaleString()}`;

    await reply(portfolioText);

  } catch (error) {
    await reply('❌ *Error loading portfolio. Please try again.*');
    console.error('Portfolio view error:', error);
  }
}

// Handle events view
async function handleEventsView(context) {
  const { reply } = context;

  if (activeEvents.length === 0) {
    await reply('🎪 *No active market events*\n\nEvents occur randomly and affect property values!');
    return;
  }

  const eventsText = `🎪 *ACTIVE MARKET EVENTS* 🎪\n\n` +
                    activeEvents.map(event =>
                      `${event.emoji} *${event.name}*\n` +
                      `📝 ${event.description}\n` +
                      `⏰ Ends: ${event.endTime.toLocaleString()}\n`
                    ).join('\n') +
                    `\n\n⚠️ *Events can dramatically affect your investments!*`;

  await reply(eventsText);
}

// Placeholder for sell property
async function handleSellProperty(context, args) {
  await context.reply('🏠 *Property selling coming soon!*\n\nFor now, focus on building your empire! 🏗️');
}

// ---------------------------------------------------------------- //
//  UTILITY FUNCTIONS (reuse from economy plugin)
// ---------------------------------------------------------------- //

// These would be imported from the main economy system
async function getUserData(userId) {
  // Placeholder - integrate with economy plugin
  return {
    balance: 100000,
    realEstate: {
      properties: []
    }
  };
}

async function updateUserData(userId, data) {
  // Placeholder - integrate with economy plugin
  console.log('Updating user data:', userId, data);
}

async function addMoney(userId, amount, reason) {
  // Placeholder - integrate with economy plugin
  console.log('Adding money:', userId, amount, reason);
}

async function removeMoney(userId, amount, reason) {
  // Placeholder - integrate with economy plugin
  console.log('Removing money:', userId, amount, reason);
}