// Bot constants and configuration values

// Reaction emojis for auto-react feature
export const REACTION_EMOJIS = [
  '❤️', '💯', '🔥', '👍', '😍', '🎉', '✨', '🚀', 
  '⚡', '💫', '🌟', '👌', '💪', '🙌', '🤗', '😎'
];

// Welcome message templates
export const WELCOME_MESSAGES = {
  DEFAULT: `╭─────────────────────╮
│     🎉 WELCOME! 🎉     │
╰─────────────────────╯

👋 Hello @{username}!

🏷️ *Group:* {groupName}
👥 *Members:* {memberCount}
📅 *Date:* {date}
🕐 *Time:* {time}

🌟 Welcome to our community!
Please read the group rules and enjoy your stay! 🎈`,

  FORMAL: `🎊 *New Member Alert!* 🎊

Welcome @{username} to *{groupName}*

📋 *Group Information:*
• Total Members: {memberCount}
• Joined: {date} at {time}

📖 Please read group description for rules and guidelines.
💬 Feel free to introduce yourself!

Enjoy your time here! ✨`,

  CASUAL: `Hey @{username}! 👋

Welcome to {groupName}! 🎉
We now have {memberCount} awesome members!

Hope you have fun here! 🚀`
};

// Goodbye message templates
export const GOODBYE_MESSAGES = {
  DEFAULT: `╭─────────────────────╮
│     👋 GOODBYE! 👋     │
╰─────────────────────╯

💔 @{username} left the group

🏷️ *Group:* {groupName}
👥 *Remaining:* {memberCount}
📅 *Date:* {date}
🕐 *Time:* {time}

😢 We're sad to see you go!
You're always welcome back. 🌟`,

  SHORT: `👋 @{username} left the group. Farewell! 😢`,

  FORMAL: `📢 *Member Departure Notice*

@{username} has left *{groupName}*
Remaining members: {memberCount}

Thank you for your participation. 🙏`
};

// Command categories
export const COMMAND_CATEGORIES = {
  GENERAL: '📚 General',
  ADMIN: '👑 Admin Only',
  GROUP: '👥 Group',
  OWNER: '🔒 Owner Only',
  FUN: '🎮 Fun',
  UTILITY: '🔧 Utility',
  MEDIA: '📁 Media',
  AI: '🤖 AI & Smart'
};

// Error messages
export const ERROR_MESSAGES = {
  NOT_OWNER: '❌ This command is only for the bot owner!',
  NOT_ADMIN: '❌ This command is only for group admins!',
  NOT_GROUP: '❌ This command can only be used in groups!',
  BOT_NOT_ADMIN: '❌ Bot needs to be admin to perform this action!',
  INVALID_FORMAT: '❌ Invalid format! Please check the command usage.',
  RATE_LIMITED: '⏰ Please wait before using this command again!',
  NETWORK_ERROR: '🌐 Network error! Please try again later.',
  UNKNOWN_ERROR: '❌ An unknown error occurred!',
  MISSING_PARAMETER: '❓ Missing required parameter! Check command usage.',
  FILE_TOO_LARGE: '📁 File is too large! Maximum size is {maxSize}.',
  UNSUPPORTED_FORMAT: '❌ Unsupported file format!',
  API_ERROR: '🔧 API service is currently unavailable!'
};

// Success messages
export const SUCCESS_MESSAGES = {
  COMMAND_EXECUTED: '✅ Command executed successfully!',
  FILE_UPLOADED: '📤 File uploaded successfully!',
  SETTINGS_UPDATED: '⚙️ Settings updated successfully!',
  USER_KICKED: '👢 User has been removed from the group!',
  USER_PROMOTED: '⬆️ User has been promoted to admin!',
  USER_DEMOTED: '⬇️ User has been demoted from admin!',
  MESSAGE_SENT: '📨 Message sent successfully!'
};

// Rate limiting configuration
export const RATE_LIMITS = {
  GLOBAL: { maxUses: 10, windowMs: 60000 }, // 10 commands per minute
  AI_COMMANDS: { maxUses: 5, windowMs: 300000 }, // 5 AI commands per 5 minutes
  MEDIA_COMMANDS: { maxUses: 3, windowMs: 120000 }, // 3 media commands per 2 minutes
  ADMIN_COMMANDS: { maxUses: 20, windowMs: 60000 }, // 20 admin commands per minute
  DOWNLOAD_COMMANDS: { maxUses: 2, windowMs: 180000 } // 2 downloads per 3 minutes
};

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  VIDEO: 50 * 1024 * 1024, // 50MB
  AUDIO: 20 * 1024 * 1024, // 20MB
  DOCUMENT: 100 * 1024 * 1024, // 100MB
  STICKER: 1 * 1024 * 1024 // 1MB
};

// Supported file formats
export const SUPPORTED_FORMATS = {
  IMAGE: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
  VIDEO: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.3gp'],
  AUDIO: ['.mp3', '.wav', '.ogg', '.aac', '.m4a', '.opus'],
  DOCUMENT: ['.pdf', '.doc', '.docx', '.txt', '.zip', '.rar']
};

// Bot status messages
export const STATUS_MESSAGES = {
  STARTING: '🔄 Starting up...',
  ONLINE: '✅ Online and ready!',
  RECONNECTING: '🔄 Reconnecting...',
  MAINTENANCE: '🔧 Under maintenance',
  ERROR: '❌ Error occurred',
  OFFLINE: '🔴 Offline'
};

// Default responses for various scenarios
export const DEFAULT_RESPONSES = {
  UNKNOWN_COMMAND: '❓ Unknown command. Type *{prefix}menu* to see available commands.',
  HELP_MESSAGE: `🤖 *Bot Help*

Use *{prefix}menu* to see all commands.
Use *{prefix}help [command]* for specific command help.

Need support? Contact: {ownerNumber}`,
  
  MAINTENANCE_MODE: '🔧 Bot is currently under maintenance. Please try again later.',
  
  PERMISSION_DENIED: "🚫 You don't have permission to use this command.",
  
  GROUP_ONLY: '👥 This command can only be used in groups.',
  
  PRIVATE_ONLY: '💬 This command can only be used in private chat.',
  
  PROCESSING: '⏳ Processing your request, please wait...',
  
  TIMEOUT: '⏰ Request timed out. Please try again.'
};

// Menu templates
export const MENU_TEMPLATES = {
  MAIN: `🤖 *{botName} - Command Menu*

*📚 General Commands:*
{generalCommands}

*🎮 Fun Commands:*
{funCommands}

*🔧 Utility Commands:*
{utilityCommands}

*👥 Group Commands:*
{groupCommands}

*🤖 AI Commands:*
{aiCommands}

*ℹ️ Info:*
• Prefix: *{prefix}*
• Total Commands: *{totalCommands}*
• Version: *{version}*

*📞 Support:* {ownerNumber}
*🔗 Repository:* github.com/your-repo

Type *{prefix}help [command]* for detailed help.`,

  CATEGORY: `📂 *{category} Commands*

{commands}

*💡 Usage:*
• *{prefix}help [command]* - Get command help
• *{prefix}menu* - Back to main menu

Total commands in this category: *{count}*`,

  COMMAND_HELP: `📖 *Command Help: {command}*

*📝 Description:* {description}
*🎯 Usage:* {usage}
*📂 Category:* {category}
*👑 Permission:* {permission}
*⏰ Cooldown:* {cooldown}

*📌 Examples:*
{examples}

*💡 Aliases:* {aliases}`
};

// Bot information
export const BOT_INFO = {
  VERSION: '1.0.0',
  AUTHOR: 'Fresh Bot Developer',
  GITHUB: 'https://github.com/your-repo/fresh-whatsapp-bot',
  SUPPORT_GROUP: 'https://chat.whatsapp.com/your-support-group',
  DOCUMENTATION: 'https://your-docs-site.com',
  LICENSE: 'MIT'
};

// API endpoints (examples)
export const API_ENDPOINTS = {
  WEATHER: 'https://api.openweathermap.org/data/2.5/weather',
  TRANSLATE: 'https://api.mymemory.translated.net/get',
  JOKES: 'https://official-joke-api.appspot.com/random_joke',
  FACTS: 'https://uselessfacts.jsph.pl/random.json',
  QUOTES: 'https://api.quotegarden.io/api/v3/quotes/random',
  CURRENCY: 'https://api.exchangerate-api.com/v4/latest/',
  QR_CODE: 'https://api.qrserver.com/v1/create-qr-code/',
  SHORT_URL: 'https://tinyurl.com/api-create.php'
};

// Regular expressions
export const REGEX_PATTERNS = {
  URL: /(https?:\/\/[^\s]+)/gi,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s-()]{10,}$/,
  MENTION: /@(\d+)/g,
  HASHTAG: /#[\w]+/g,
  WHATSAPP_NUMBER: /^[\d]{10,15}$/,
  IP_ADDRESS: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/
};

// Time zones
export const TIMEZONES = {
  LAGOS: 'Africa/Lagos',
  NAIROBI: 'Africa/Nairobi',
  CAIRO: 'Africa/Cairo',
  LONDON: 'Europe/London',
  NEW_YORK: 'America/New_York',
  TOKYO: 'Asia/Tokyo',
  DUBAI: 'Asia/Dubai',
  SYDNEY: 'Australia/Sydney'
};

// Language codes for translation
export const LANGUAGE_CODES = {
  'english': 'en',
  'spanish': 'es',
  'french': 'fr',
  'german': 'de',
  'italian': 'it',
  'portuguese': 'pt',
  'russian': 'ru',
  'chinese': 'zh',
  'japanese': 'ja',
  'korean': 'ko',
  'arabic': 'ar',
  'hindi': 'hi',
  'swahili': 'sw',
  'yoruba': 'yo',
  'hausa': 'ha',
  'igbo': 'ig'
};

// Sticker pack info
export const STICKER_PACK = {
  name: 'Fresh Bot Stickers',
  author: 'Fresh WhatsApp Bot',
  id: 'com.freshbot.stickers',
  publisher: 'Fresh Bot Team'
};

// Database collections/tables
export const DB_COLLECTIONS = {
  USERS: 'users',
  GROUPS: 'groups',
  COMMANDS: 'commands',
  LOGS: 'logs',
  SETTINGS: 'settings',
  TEMP_DATA: 'temp_data'
};

// Cache keys
export const CACHE_KEYS = {
  GROUP_METADATA: 'group_metadata_',
  USER_DATA: 'user_data_',
  COMMAND_STATS: 'command_stats_',
  RATE_LIMIT: 'rate_limit_',
  API_RESPONSE: 'api_response_'
};

// Event types
export const EVENT_TYPES = {
  MESSAGE_RECEIVED: 'message.received',
  COMMAND_EXECUTED: 'command.executed',
  USER_JOINED: 'user.joined',
  USER_LEFT: 'user.left',
  GROUP_CREATED: 'group.created',
  BOT_ADDED: 'bot.added',
  ERROR_OCCURRED: 'error.occurred'
};

// Plugin categories
export const PLUGIN_CATEGORIES = {
  CORE: 'core',
  UTILITY: 'utility',
  FUN: 'fun',
  ADMIN: 'admin',
  MEDIA: 'media',
  AI: 'ai',
  SOCIAL: 'social',
  GAMES: 'games'
};

// Default settings
export const DEFAULT_SETTINGS = {
  prefix: '.',
  language: 'en',
  timezone: 'Africa/Lagos',
  welcome: true,
  goodbye: true,
  antilink: false,
  autoReact: true,
  autoRead: false,
  autoReply: false,
  nsfw: false,
  maintenance: false
};
