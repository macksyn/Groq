// plugins/menu.js - Dynamic Auto-Menu Plugin (V3)
import moment from 'moment-timezone';

// Plugin metadata
export const info = {
  name: 'Dynamic Menu System',
  version: '2.0.0',
  author: 'Alex Macksyn',
  description: 'Automatically generates menu from all loaded plugins',
  category: 'general',
  commands: ['menu', 'help', 'list', 'cmds'],
  aliases: ['commands', 'commandlist']
};

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
  info: { icon: 'ℹ️', name: 'Information' }
};

// Main plugin function
export default async function menuPlugin(context) {
  const { msg: m, args, text, command, sock, config, bot, logger } = context;

  // Get all loaded plugins from PluginManager
  const pluginManager = bot.getPluginManager();
  
  if (!pluginManager) {
    return m.reply('❌ Plugin manager not available');
  }

  const subCommand = args[0]?.toLowerCase();

  // Route to specific handler
  if (subCommand === 'search' || subCommand === 'find') {
    return await handleSearch(m, args.slice(1).join(' '), pluginManager, config);
  }

  if (subCommand && subCommand !== 'all') {
    // Show detailed help for specific command or category
    return await handleDetailedHelp(m, subCommand, pluginManager, config);
  }

  // Show main menu
  return await showMainMenu(m, pluginManager, config, bot, logger);
}

// ==================== MAIN MENU ====================

async function showMainMenu(m, pluginManager, config, bot, logger) {
  try {
    await m.react('📖');

    // Collect all plugins and their commands
    const allPlugins = await pluginManager.getAllPlugins();
    const categorizedCommands = categorizePlugins(allPlugins);
    
    // Get bot stats
    const stats = bot.getStats();
    const uptime = formatUptime(stats.uptime);
    
    // Build menu header
    let menu = `╭━━━━━━━━━━━━━━━━━━━━╮
┃   🤖 *${config.BOT_NAME}*   ┃
╰━━━━━━━━━━━━━━━━━━━━╯

👋 Hello! I'm your WhatsApp assistant.

📊 *Bot Information:*
• Status: ${stats.status === 'connected' ? '✅ Online' : '❌ Offline'}
• Uptime: ${uptime}
• Prefix: \`${config.PREFIX}\`
• Mode: ${config.MODE.toUpperCase()}
• Plugins: ${stats.plugins.enabled}/${stats.plugins.total}
• Commands: ${getTotalCommands(allPlugins)}

⏰ ${moment().tz(config.TIMEZONE).format('DD/MM/YYYY HH:mm:ss')}

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
• Made with ❤️ by ${config.OWNER_NAME}

_Type ${config.PREFIX}help for more information_`;

    await m.reply(menu);
    await m.react('✅');

  } catch (error) {
    logger.error('Menu generation failed:', error.message);
    await m.react('❌');
    await m.reply('❌ Failed to generate menu. Please try again.');
  }
}

// ==================== DETAILED HELP ====================

async function handleDetailedHelp(m, query, pluginManager, config) {
  try {
    await m.react('🔍');

    const allPlugins = await pluginManager.getAllPlugins();
    
    // Check if query is a category
    const categoryCommands = getCommandsByCategory(allPlugins, query);
    
    if (categoryCommands.length > 0) {
      return await showCategoryMenu(m, query, categoryCommands, config);
    }

    // Search for specific command
    const commandInfo = findCommand(allPlugins, query);
    
    if (commandInfo) {
      return await showCommandHelp(m, commandInfo, config);
    }

    // No match found
    await m.react('❌');
    return m.reply(`❌ *Not Found*\n\nNo command or category found for: *${query}*\n\n💡 Try:\n• \`${config.PREFIX}menu\` - View all categories\n• \`${config.PREFIX}menu search ${query}\` - Search commands`);

  } catch (error) {
    await m.react('❌');
    return m.reply('❌ Failed to retrieve command information.');
  }
}

// ==================== CATEGORY VIEW ====================

async function showCategoryMenu(m, category, commands, config) {
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
    const usage = cmd.usage || `${prefix}${cmdName}`;
    
    menu += `\n*${i + 1}. ${prefix}${cmdName}*\n`;
    menu += `   📝 ${description}\n`;
    
    // Show aliases if available
    if (cmd.aliases && cmd.aliases.length > 0) {
      menu += `   🔗 Aliases: ${cmd.aliases.map(a => `\`${prefix}${a}\``).join(', ')}\n`;
    }
    
    menu += `   💡 Usage: \`${usage}\`\n`;
    
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

  await m.reply(menu);
  await m.react('✅');
}

// ==================== COMMAND HELP ====================

async function showCommandHelp(m, commandInfo, config) {
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
    help += `💡 *Usage:*\n\`\`\`${commandInfo.usage}\`\`\`\n\n`;
  } else {
    help += `💡 *Usage:*\n\`\`\`${prefix}${cmdName}\`\`\`\n\n`;
  }

  // Aliases
  if (commandInfo.aliases && commandInfo.aliases.length > 0) {
    help += `🔗 *Aliases:*\n${commandInfo.aliases.map(a => `• \`${prefix}${a}\``).join('\n')}\n\n`;
  }

  // Examples
  if (commandInfo.examples && commandInfo.examples.length > 0) {
    help += `📌 *Examples:*\n`;
    commandInfo.examples.forEach((example, index) => {
      help += `${index + 1}. \`${prefix}${example}\`\n`;
    });
    help += `\n`;
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

  // Cooldown
  if (commandInfo.cooldown) {
    help += `⏰ *Cooldown:* ${commandInfo.cooldown} seconds\n\n`;
  }

  help += `╭━━━━━━━━━━━━━━━━━━━━╮
┃   💡 *NEED MORE HELP?* ┃
╰━━━━━━━━━━━━━━━━━━━━╯

• \`${prefix}menu ${commandInfo.category}\` - View category
• \`${prefix}menu\` - Back to main menu
• Contact owner: @${config.OWNER_NUMBER}`;

  await m.reply(help);
  await m.react('✅');
}

// ==================== SEARCH FUNCTION ====================

async function handleSearch(m, query, pluginManager, config) {
  if (!query || query.trim() === '') {
    return m.reply(`❌ Please provide a search term\n\nExample: \`${config.PREFIX}menu search image\``);
  }

  await m.react('🔍');

  const allPlugins = await pluginManager.getAllPlugins();
  const searchResults = searchCommands(allPlugins, query);

  if (searchResults.length === 0) {
    await m.react('❌');
    return m.reply(`❌ *No Results*\n\nNo commands found matching: *${query}*\n\n💡 Try:\n• Different search terms\n• \`${config.PREFIX}menu\` - View all categories`);
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

  await m.reply(message);
  await m.react('✅');
}

// ==================== HELPER FUNCTIONS ====================

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
        aliases: plugin.info?.aliases || [],
        description: plugin.description,
        usage: plugin.info?.usage,
        examples: plugin.info?.examples,
        category: category,
        pluginName: plugin.name,
        ownerOnly: plugin.info?.ownerOnly,
        adminOnly: plugin.info?.adminOnly,
        groupOnly: plugin.info?.groupOnly,
        privateOnly: plugin.info?.privateOnly,
        cooldown: plugin.info?.cooldown
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
        aliases: plugin.info?.aliases || [],
        description: plugin.description,
        usage: plugin.info?.usage,
        examples: plugin.info?.examples,
        category: plugin.category,
        pluginName: plugin.name,
        ownerOnly: plugin.info?.ownerOnly,
        adminOnly: plugin.info?.adminOnly,
        groupOnly: plugin.info?.groupOnly,
        privateOnly: plugin.info?.privateOnly,
        cooldown: plugin.info?.cooldown
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
    const aliases = plugin.info?.aliases || [];
    
    // Check main commands
    if (commands.some(cmd => cmd.toLowerCase() === searchQuery)) {
      return {
        command: commands.find(cmd => cmd.toLowerCase() === searchQuery),
        commands: commands,
        aliases: aliases,
        description: plugin.description,
        usage: plugin.info?.usage,
        examples: plugin.info?.examples,
        category: plugin.category || 'general',
        pluginName: plugin.name,
        ownerOnly: plugin.info?.ownerOnly,
        adminOnly: plugin.info?.adminOnly,
        groupOnly: plugin.info?.groupOnly,
        privateOnly: plugin.info?.privateOnly,
        cooldown: plugin.info?.cooldown
      };
    }

    // Check aliases
    if (aliases.some(alias => alias.toLowerCase() === searchQuery)) {
      return {
        command: commands[0] || searchQuery,
        commands: commands,
        aliases: aliases,
        description: plugin.description,
        usage: plugin.info?.usage,
        examples: plugin.info?.examples,
        category: plugin.category || 'general',
        pluginName: plugin.name,
        ownerOnly: plugin.info?.ownerOnly,
        adminOnly: plugin.info?.adminOnly,
        groupOnly: plugin.info?.groupOnly,
        privateOnly: plugin.info?.privateOnly,
        cooldown: plugin.info?.cooldown
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
          aliases: plugin.info?.aliases || [],
          description: description,
          usage: plugin.info?.usage,
          examples: plugin.info?.examples,
          category: plugin.category || 'general',
          pluginName: name,
          ownerOnly: plugin.info?.ownerOnly,
          adminOnly: plugin.info?.adminOnly,
          groupOnly: plugin.info?.groupOnly,
          privateOnly: plugin.info?.privateOnly,
          cooldown: plugin.info?.cooldown
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
