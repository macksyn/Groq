// plugins/menu_plugin.js - Dynamic Auto-Menu Plugin (V3)
import moment from 'moment-timezone';

// Category icons and display names
const CATEGORY_INFO = {
  general: { icon: '📚', name: 'General' },
  owner: { icon: '👑', name: 'Owner Only' },
  admin: { icon: '🛡️', name: 'Admin' },
  group: { icon: '👥', name: 'Group' },
  fun: { icon: '🎮', name: 'Fun & Games' },
  utility: { icon: '🔧', name: 'Utility' },
  media: { icon: '📁', name: 'Media' },
  ai: { icon: '🤖', name: 'AI & Smart' },
  download: { icon: '📥', name: 'Downloader' },
  economy: { icon: '💰', name: 'Economy' },
  search: { icon: '🔍', name: 'Search' },
  info: { icon: 'ℹ️', name: 'Information' },
  social: { icon: '🎂', name: 'Social' },
  tools: { icon: '🔨', name: 'Tools' },
  moderation: { icon: '🛡️', name: 'Moderation' },
  games: { icon: '🎯', name: 'Games' },
  music: { icon: '🎵', name: 'Music' },
  system: { icon: '⚡', name: 'System' }
};

// ============================================================
// V3 PLUGIN EXPORT (Required Structure)
// ============================================================

export default {
  name: 'menu',
  description: 'Automatically generates menu from all loaded plugins',
  commands: ['menu', 'help', 'list', 'cmds'],
  aliases: ['commands', 'commandlist'],
  category: 'general',
  usage: '[subcommand] [args]',
  example: 'menu | menu search image | help ping',
  version: '3.0.0',

  async run({ msg, args, text, command, sock, config, bot, logger }) {
    try {
      const subCommand = args[0]?.toLowerCase();

      // Get PluginManager from bot
      const pluginManager = bot.pluginManager || bot.getPluginManager?.();
      
      if (!pluginManager) {
        return await msg.reply('❌ Plugin manager not available');
      }

      // Route to specific handler
      if (subCommand === 'search' || subCommand === 'find') {
        return await handleSearch(msg, args.slice(1).join(' '), pluginManager, config);
      }

      if (subCommand && subCommand !== 'all') {
        // Show detailed help for specific command or category
        return await handleDetailedHelp(msg, subCommand, pluginManager, config);
      }

      // Show main menu
      return await showMainMenu(msg, pluginManager, config, bot, logger);

    } catch (error) {
      logger.error(error, '❌ Menu plugin error');
      await msg.react('❌');
      await msg.reply('❌ An error occurred generating the menu. Please try again.');
    }
  }
};

// ============================================================
// MAIN MENU
// ============================================================

async function showMainMenu(msg, pluginManager, config, bot, logger) {
  try {
    await msg.react('📖');

    // Collect all plugins and their commands
    const allPlugins = await pluginManager.getAllPlugins();
    const categorizedCommands = categorizePlugins(allPlugins);
    
    // Get bot stats
    const stats = pluginManager.getPluginStats();
    const startTime = bot.startTime || Date.now();
    const uptime = formatUptime(Date.now() - startTime);
    
    // Build menu header
    let menu = `╭━━━━━━━━━━━━━━━━━━━━╮
┃   🤖 *${config.BOT_NAME || 'WhatsApp Bot'}*   ┃
╰━━━━━━━━━━━━━━━━━━━━╯

👋 Hello! I'm your WhatsApp assistant.

📊 *Bot Information:*
• Status: ✅ Online
• Uptime: ${uptime}
• Prefix: \`${config.PREFIX}\`
• Mode: ${(config.MODE || 'public').toUpperCase()}
• Plugins: ${stats.enabled}/${stats.total}
• Commands: ${getTotalCommands(allPlugins)}

⏰ ${moment().tz(config.TIMEZONE || 'Africa/Lagos').format('DD/MM/YYYY HH:mm:ss')}

╭━━━━━━━━━━━━━━━━━━━━╮
┃   📋 *COMMAND MENU*    ┃
╰━━━━━━━━━━━━━━━━━━━━╯

`;

    // Build category sections
    const sortedCategories = Object.keys(categorizedCommands).sort();
    
    for (const category of sortedCategories) {
      const categoryData = CATEGORY_INFO[category] || { icon: '📦', name: category };
      const commands = categorizedCommands[category];
      
      if (commands.length === 0) continue;
      
      menu += `\n${categoryData.icon} *${categoryData.name}* (${commands.length})\n`;
      menu += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
      
      // Show up to 8 commands per category in main menu
      const displayCommands = commands.slice(0, 8);
      
      for (const cmd of displayCommands) {
        const prefix = config.PREFIX;
        const cmdName = cmd.command || cmd.commands?.[0] || 'unknown';
        const description = cmd.description || 'No description';
        
        // Truncate long descriptions
        const shortDesc = description.length > 40 
          ? description.substring(0, 37) + '...' 
          : description;
        
        menu += `• \`${prefix}${cmdName}\`\n  ${shortDesc}\n`;
      }
      
      // Show "more" indicator if there are more commands
      if (commands.length > 8) {
        menu += `  _...and ${commands.length - 8} more_\n`;
      }
    }

    // Footer with navigation tips
    menu += `\n╭━━━━━━━━━━━━━━━━━━━━╮
┃   💡 *QUICK TIPS*      ┃
╰━━━━━━━━━━━━━━━━━━━━╯

• \`${config.PREFIX}help <command>\` - Detailed help
• \`${config.PREFIX}menu <category>\` - Category view
• \`${config.PREFIX}menu search <query>\` - Search
• \`${config.PREFIX}menu all\` - Show all commands

*📂 Categories:*
${sortedCategories.map(cat => {
  const catInfo = CATEGORY_INFO[cat] || { icon: '📦', name: cat };
  return `${catInfo.icon} ${catInfo.name}`;
}).join(' • ')}

╭━━━━━━━━━━━━━━━━━━━━╮
┃   📞 *SUPPORT*         ┃
╰━━━━━━━━━━━━━━━━━━━━╯

• Owner: @${config.OWNER_NUMBER}
• Powered by Baileys & Node.js
• Made with ❤️ by ${config.OWNER_NAME || 'Bot Developer'}

_Type ${config.PREFIX}help for more information_`;

    await msg.reply(menu);
    await msg.react('✅');

  } catch (error) {
    logger.error(error, 'Menu generation failed');
    await msg.react('❌');
    await msg.reply('❌ Failed to generate menu. Please try again.');
  }
}

// ============================================================
// DETAILED HELP
// ============================================================

async function handleDetailedHelp(msg, query, pluginManager, config) {
  try {
    await msg.react('🔍');

    const allPlugins = await pluginManager.getAllPlugins();
    
    // Check if query is a category
    const categoryCommands = getCommandsByCategory(allPlugins, query);
    
    if (categoryCommands.length > 0) {
      return await showCategoryMenu(msg, query, categoryCommands, config);
    }

    // Search for specific command
    const commandInfo = findCommand(allPlugins, query);
    
    if (commandInfo) {
      return await showCommandHelp(msg, commandInfo, config);
    }

    // No match found
    await msg.react('❌');
    return msg.reply(`❌ *Not Found*\n\nNo command or category found for: *${query}*\n\n💡 Try:\n• \`${config.PREFIX}menu\` - View all categories\n• \`${config.PREFIX}menu search ${query}\` - Search commands`);

  } catch (error) {
    await msg.react('❌');
    return msg.reply('❌ Failed to retrieve command information.');
  }
}

// ============================================================
// CATEGORY VIEW
// ============================================================

async function showCategoryMenu(msg, category, commands, config) {
  const categoryData = CATEGORY_INFO[category] || { icon: '📦', name: category };
  
  let menu = `╭━━━━━━━━━━━━━━━━━━━━╮
┃  ${categoryData.icon} *${categoryData.name}*  ┃
╰━━━━━━━━━━━━━━━━━━━━╯

📋 Total Commands: ${commands.length}

`;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const prefix = config.PREFIX;
    const cmdName = cmd.command || cmd.commands?.[0] || 'unknown';
    const description = cmd.description || 'No description';
    const usage = cmd.usage || `${cmdName}`;
    
    menu += `\n*${i + 1}. ${prefix}${cmdName}*\n`;
    menu += `   📝 ${description}\n`;
    
    // Show aliases if available
    if (cmd.aliases && cmd.aliases.length > 0) {
      menu += `   🔗 Aliases: ${cmd.aliases.map(a => `\`${prefix}${a}\``).join(', ')}\n`;
    }
    
    menu += `   💡 Usage: \`${prefix}${usage}\`\n`;
    
    // Show restrictions
    const restrictions = [];
    if (cmd.ownerOnly) restrictions.push('👑 Owner Only');
    if (cmd.adminOnly) restrictions.push('🛡️ Admin Only');
    if (cmd.groupOnly) restrictions.push('👥 Group Only');
    if (restrictions.length > 0) {
      menu += `   🔒 ${restrictions.join(' • ')}\n`;
    }
  }

  menu += `\n╭━━━━━━━━━━━━━━━━━━━━╮
┃   💡 *NAVIGATION*       ┃
╰━━━━━━━━━━━━━━━━━━━━╯

• \`${config.PREFIX}help <command>\` - Detailed help
• \`${config.PREFIX}menu\` - Back to main menu
• \`${config.PREFIX}menu all\` - Show all commands`;

  await msg.reply(menu);
  await msg.react('✅');
}

// ============================================================
// COMMAND HELP
// ============================================================

async function showCommandHelp(msg, commandInfo, config) {
  const prefix = config.PREFIX;
  const cmdName = commandInfo.command || commandInfo.commands?.[0] || 'unknown';
  
  let help = `╭━━━━━━━━━━━━━━━━━━━━╮
┃   📖 *COMMAND HELP*    ┃
╰━━━━━━━━━━━━━━━━━━━━╯

*Command:* \`${prefix}${cmdName}\`
*Plugin:* ${commandInfo.pluginName || 'Unknown'}
*Category:* ${commandInfo.category || 'general'}

📝 *Description:*
${commandInfo.description || 'No description available'}

`;

  // Usage
  if (commandInfo.usage) {
    help += `💡 *Usage:*\n\`\`\`${prefix}${commandInfo.usage}\`\`\`\n\n`;
  } else {
    help += `💡 *Usage:*\n\`\`\`${prefix}${cmdName}\`\`\`\n\n`;
  }

  // Aliases
  if (commandInfo.aliases && commandInfo.aliases.length > 0) {
    help += `🔗 *Aliases:*\n${commandInfo.aliases.map(a => `• \`${prefix}${a}\``).join('\n')}\n\n`;
  }

  // Example
  if (commandInfo.example) {
    help += `📌 *Example:*\n\`${prefix}${commandInfo.example}\`\n\n`;
  }

  // Restrictions
  const restrictions = [];
  if (commandInfo.ownerOnly) restrictions.push('👑 Owner Only');
  if (commandInfo.adminOnly) restrictions.push('🛡️ Admin Only');
  if (commandInfo.groupOnly) restrictions.push('👥 Group Only');
  if (commandInfo.privateOnly) restrictions.push('💬 Private Only');
  
  if (restrictions.length > 0) {
    help += `🔒 *Restrictions:*\n${restrictions.join('\n')}\n\n`;
  }

  // Stats
  if (commandInfo.stats) {
    help += `📊 *Statistics:*\n`;
    help += `• Executions: ${commandInfo.stats.executions || 0}\n`;
    help += `• Crashes: ${commandInfo.stats.crashes || 0}\n`;
    if (commandInfo.stats.lastUsed) {
      help += `• Last Used: ${new Date(commandInfo.stats.lastUsed).toLocaleString()}\n`;
    }
    help += `\n`;
  }

  help += `╭━━━━━━━━━━━━━━━━━━━━╮
┃   💡 *NEED MORE HELP?* ┃
╰━━━━━━━━━━━━━━━━━━━━╯

• \`${prefix}menu ${commandInfo.category}\` - View category
• \`${prefix}menu\` - Back to main menu
• Contact owner: @${config.OWNER_NUMBER}`;

  await msg.reply(help);
  await msg.react('✅');
}

// ============================================================
// SEARCH FUNCTION
// ============================================================

async function handleSearch(msg, query, pluginManager, config) {
  if (!query || query.trim() === '') {
    return msg.reply(`❌ Please provide a search term\n\nExample: \`${config.PREFIX}menu search image\``);
  }

  await msg.react('🔍');

  const allPlugins = await pluginManager.getAllPlugins();
  const searchResults = searchCommands(allPlugins, query);

  if (searchResults.length === 0) {
    await msg.react('❌');
    return msg.reply(`❌ *No Results*\n\nNo commands found matching: *${query}*\n\n💡 Try:\n• Different search terms\n• \`${config.PREFIX}menu\` - View all categories`);
  }

  let message = `╭━━━━━━━━━━━━━━━━━━━━╮
┃   🔍 *SEARCH RESULTS*  ┃
╰━━━━━━━━━━━━━━━━━━━━╯

Query: *${query}*
Found: ${searchResults.length} command(s)

`;

  for (let i = 0; i < Math.min(searchResults.length, 10); i++) {
    const cmd = searchResults[i];
    const prefix = config.PREFIX;
    const cmdName = cmd.command || cmd.commands?.[0] || 'unknown';
    const description = cmd.description || 'No description';
    const category = CATEGORY_INFO[cmd.category]?.icon || '📦';
    
    message += `\n*${i + 1}. ${category} ${prefix}${cmdName}*\n`;
    message += `   ${description}\n`;
    message += `   💡 Type: \`${prefix}help ${cmdName}\`\n`;
  }

  if (searchResults.length > 10) {
    message += `\n_...and ${searchResults.length - 10} more results_\n`;
  }

  message += `\n╭━━━━━━━━━━━━━━━━━━━━╮
┃   💡 *TIP*              ┃
╰━━━━━━━━━━━━━━━━━━━━╯

Use \`${config.PREFIX}help <command>\` for detailed information about a specific command.`;

  await msg.reply(message);
  await msg.react('✅');
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Categorize plugins by their category
function categorizePlugins(plugins) {
  const categorized = {};

  for (const plugin of plugins) {
    if (!plugin.enabled) continue; // Skip disabled plugins
    
    const category = plugin.category || 'general';
    const commands = plugin.commands || [];
    
    if (!categorized[category]) {
      categorized[category] = [];
    }

    // Add each command with plugin info
    for (const cmd of commands) {
      categorized[category].push({
        command: cmd,
        commands: plugin.commands,
        aliases: plugin.aliases || [],
        description: plugin.description,
        usage: plugin.usage,
        example: plugin.example,
        category: category,
        pluginName: plugin.name,
        ownerOnly: plugin.ownerOnly,
        adminOnly: plugin.adminOnly,
        groupOnly: plugin.groupOnly,
        privateOnly: plugin.privateOnly,
        stats: plugin.stats
      });
    }
  }

  return categorized;
}

// Get commands by category
function getCommandsByCategory(plugins, category) {
  const commands = [];

  for (const plugin of plugins) {
    if (!plugin.enabled) continue;
    if (plugin.category?.toLowerCase() !== category.toLowerCase()) continue;

    const pluginCommands = plugin.commands || [];
    
    for (const cmd of pluginCommands) {
      commands.push({
        command: cmd,
        commands: plugin.commands,
        aliases: plugin.aliases || [],
        description: plugin.description,
        usage: plugin.usage,
        example: plugin.example,
        category: plugin.category,
        pluginName: plugin.name,
        ownerOnly: plugin.ownerOnly,
        adminOnly: plugin.adminOnly,
        groupOnly: plugin.groupOnly,
        privateOnly: plugin.privateOnly,
        stats: plugin.stats
      });
    }
  }

  return commands;
}

// Find specific command
function findCommand(plugins, query) {
  const searchQuery = query.toLowerCase().trim();

  for (const plugin of plugins) {
    if (!plugin.enabled) continue;

    const commands = plugin.commands || [];
    const aliases = plugin.aliases || [];
    
    // Check main commands
    if (commands.some(cmd => cmd.toLowerCase() === searchQuery)) {
      return {
        command: commands.find(cmd => cmd.toLowerCase() === searchQuery),
        commands: commands,
        aliases: aliases,
        description: plugin.description,
        usage: plugin.usage,
        example: plugin.example,
        category: plugin.category || 'general',
        pluginName: plugin.name,
        ownerOnly: plugin.ownerOnly,
        adminOnly: plugin.adminOnly,
        groupOnly: plugin.groupOnly,
        privateOnly: plugin.privateOnly,
        stats: plugin.stats
      };
    }

    // Check aliases
    if (aliases.some(alias => alias.toLowerCase() === searchQuery)) {
      return {
        command: commands[0] || searchQuery,
        commands: commands,
        aliases: aliases,
        description: plugin.description,
        usage: plugin.usage,
        example: plugin.example,
        category: plugin.category || 'general',
        pluginName: plugin.name,
        ownerOnly: plugin.ownerOnly,
        adminOnly: plugin.adminOnly,
        groupOnly: plugin.groupOnly,
        privateOnly: plugin.privateOnly,
        stats: plugin.stats
      };
    }
  }

  return null;
}

// Search commands
function searchCommands(plugins, query) {
  const results = [];
  const searchQuery = query.toLowerCase().trim();

  for (const plugin of plugins) {
    if (!plugin.enabled) continue;

    const commands = plugin.commands || [];
    const description = plugin.description || '';
    const name = plugin.name || '';

    // Check if query matches command name, description, or plugin name
    const matches = commands.some(cmd => cmd.toLowerCase().includes(searchQuery)) ||
                   description.toLowerCase().includes(searchQuery) ||
                   name.toLowerCase().includes(searchQuery);

    if (matches) {
      for (const cmd of commands) {
        results.push({
          command: cmd,
          commands: commands,
          aliases: plugin.aliases || [],
          description: description,
          usage: plugin.usage,
          example: plugin.example,
          category: plugin.category || 'general',
          pluginName: name,
          ownerOnly: plugin.ownerOnly,
          adminOnly: plugin.adminOnly,
          groupOnly: plugin.groupOnly,
          privateOnly: plugin.privateOnly,
          stats: plugin.stats
        });
      }
    }
  }

  return results;
}

// Get total command count
function getTotalCommands(plugins) {
  let total = 0;
  for (const plugin of plugins) {
    if (plugin.enabled) {
      total += (plugin.commands || []).length;
    }
  }
  return total;
}

// Format uptime
function formatUptime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}