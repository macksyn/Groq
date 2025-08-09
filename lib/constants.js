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

Use
