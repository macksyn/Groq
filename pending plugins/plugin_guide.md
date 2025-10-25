# 🔌 Plugin Installation & Development Guide

## 📋 Table of Contents
- [How Plugins Work](#how-plugins-work)
- [Installing New Plugins](#installing-new-plugins)
- [Creating Custom Plugins](#creating-custom-plugins)
- [Plugin Examples](#plugin-examples)
- [Plugin Management](#plugin-management)
- [Best Practices](#best-practices)

## 🔧 How Plugins Work

The bot automatically loads all `.js` files from the `plugins/` directory at startup. Each plugin is a simple JavaScript module that exports a function.

### Plugin Lifecycle:
1. **Bot starts** → Scans `plugins/` directory
2. **Loads plugins** → Imports all `.js` files
3. **Caches plugins** → Stores in memory (loaded once)
4. **Message arrives** → Runs all plugins for each message
5. **Hot reload** → Restart bot to load new plugins

## 📥 Installing New Plugins

### Method 1: Drop & Play (Easiest)
```bash
# 1. Download or create a plugin file
# 2. Drop it into the plugins/ directory
cp new-plugin.js plugins/

# 3. Restart the bot
npm restart
# or if using PM2:
npm run pm2:restart
```

### Method 2: Using Git (For Shared Plugins)
```bash
# Clone a plugin repository
git clone https://github.com/user/awesome-plugin.git temp-plugin
cp temp-plugin/*.js plugins/
rm -rf temp-plugin

# Restart bot
npm restart
```

### Method 3: Package Manager (Advanced)
```bash
# Install via npm if plugin is published
npm install whatsapp-bot-plugin-name
# Then copy from node_modules to plugins/
cp node_modules/plugin-name/index.js plugins/plugin-name.js
```

## 🛠️ Creating Custom Plugins

### Basic Plugin Template
```javascript
// plugins/my-plugin.js
export default async function myPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase();
  
  // Your command logic here
  if (cmd === `${prefix}hello`) {
    await m.reply('Hello World! 👋');
  }
}

// Optional: Plugin metadata
export const info = {
  name: 'My Custom Plugin',
  version: '1.0.0',
  author: 'Your Name',
  description: 'A simple hello world plugin',
  commands: ['hello']
};
```

### Plugin Function Parameters

```javascript
function myPlugin(m, sock, config) {
  // m = Message object with helper methods
  // sock = WhatsApp socket connection  
  // config = Bot configuration from .env
}
```

### Message Object (m) Properties & Methods

```javascript
// Properties
m.body          // Message text
m.sender        // Sender WhatsApp ID
m.from          // Chat ID  
m.isGroup       // true if group message
m.quoted        // Quoted message object (if any)
m.mentions      // Array of mentioned users
m.type          // Message type (text, image, etc.)

// Helper Methods
await m.reply(text)           // Reply to message
await m.react(emoji)          // React with emoji
await m.download()            // Download media
await m.getName()             // Get sender name
await m.isAdmin()             // Check if sender is admin
await m.isBotAdmin()          // Check if bot is admin
```

### Socket (sock) Methods

```javascript
// Send messages
await sock.sendMessage(jid, content)
await sock.sendContact(jid, contacts)

// Group management
await sock.groupMetadata(groupId)
await sock.groupParticipantsUpdate(groupId, [user], 'add'/'remove')

// Profile management
await sock.updateProfileStatus(text)
await sock.updateProfileName(name)
await sock.profilePictureUrl(jid)
```

## 📚 Plugin Examples

### 1. Simple Text Command
```javascript
// plugins/greetings.js
export default async function greetingsPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase();
  
  if (cmd === `${prefix}hi`) {
    await m.reply('Hello there! How are you doing? 😊');
  }
  
  if (cmd === `${prefix}bye`) {
    await m.reply('Goodbye! Have a great day! 👋');
  }
}

export const info = {
  name: 'Greetings Plugin',
  commands: ['hi', 'bye']
};
```

### 2. Command with Parameters
```javascript
// plugins/calculator.js
export default async function calculatorPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase();
  
  if (cmd.startsWith(`${prefix}calc `)) {
    const expression = m.body.slice(6); // Remove ".calc "
    
    try {
      // Simple math evaluation (be careful with eval!)
      const result = eval(expression.replace(/[^0-9+\-*/().\s]/g, ''));
      await m.reply(`🧮 **Calculator**\n\n📝 Expression: ${expression}\n📊 Result: ${result}`);
    } catch (error) {
      await m.reply('❌ Invalid mathematical expression!');
    }
  }
}

export const info = {
  name: 'Calculator Plugin',
  commands: ['calc'],
  usage: '.calc 2+2*3'
};
```

### 3. Group-Only Command
```javascript
// plugins/group-tools.js
export default async function groupToolsPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase();
  
  // Tag all members (groups only)
  if (cmd === `${prefix}tagall` && m.isGroup) {
    try {
      const metadata = await sock.groupMetadata(m.from);
      const participants = metadata.participants;
      
      let mentions = [];
      let text = '📢 **Everyone!**\n\n';
      
      participants.forEach((participant, index) => {
        mentions.push(participant.id);
        text += `${index + 1}. @${participant.id.split('@')[0]}\n`;
      });
      
      await sock.sendMessage(m.from, {
        text: text,
        mentions: mentions
      });
      
    } catch (error) {
      await m.reply('❌ Failed to tag all members');
    }
  }
}

export const info = {
  name: 'Group Tools',
  commands: ['tagall'],
  groupOnly: true
};
```

### 4. Owner-Only Command
```javascript
// plugins/admin-tools.js
import { PermissionHelpers } from '../lib/helpers.js';

export default async function adminToolsPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase();
  
  // Check if user is owner
  const isOwner = PermissionHelpers.isOwner(m.sender, config.OWNER_NUMBER + '@s.whatsapp.net');
  if (!isOwner) return; // Exit if not owner
  
  if (cmd.startsWith(`${prefix}announce `)) {
    const announcement = m.body.slice(10); // Remove ".announce "
    
    const announceMsg = `📢 **ANNOUNCEMENT**\n\n${announcement}\n\n_From: ${config.BOT_NAME}_`;
    await m.reply(announceMsg);
  }
}

export const info = {
  name: 'Admin Tools',
  commands: ['announce'],
  ownerOnly: true
};
```

### 5. API Integration Plugin
```javascript
// plugins/random-facts.js
import axios from 'axios';

export default async function randomFactsPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase();
  
  if (cmd === `${prefix}fact`) {
    try {
      await m.react('🤔');
      
      const response = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
      const fact = response.data.text;
      
      await m.reply(`🧠 **Random Fact**\n\n${fact}`);
      await m.react('✅');
      
    } catch (error) {
      await m.react('❌');
      await m.reply('❌ Failed to fetch random fact. Try again later!');
    }
  }
}

export const info = {
  name: 'Random Facts',
  commands: ['fact']
};
```

### 6. Media Processing Plugin
```javascript
// plugins/sticker-maker.js
export default async function stickerMakerPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase();
  
  if (cmd === `${prefix}sticker` || cmd === `${prefix}s`) {
    if (!m.quoted || !m.quoted.message) {
      return m.reply('📷 Reply to an image or video to create a sticker!');
    }
    
    try {
      await m.react('🔄');
      
      // Download quoted media
      const media = await m.quoted.download();
      
      if (!media) {
        return m.reply('❌ Failed to download media!');
      }
      
      // Send as sticker
      await sock.sendMessage(m.from, {
        sticker: media,
        mimetype: 'image/webp'
      });
      
      await m.react('✅');
      
    } catch (error) {
      await m.react('❌');
      await m.reply('❌ Failed to create sticker: ' + error.message);
    }
  }
}

export const info = {
  name: 'Sticker Maker',
  commands: ['sticker', 's'],
  description: 'Convert images/videos to stickers'
};
```

## 🎛️ Plugin Management

### Directory Structure
```
plugins/
├── basic.js           # Essential commands (ping, menu, info)
├── advanced.js        # AI, weather, QR codes
├── owner.js          # Owner-only commands
├── fun.js            # Entertainment commands
├── group.js          # Group management
├── media.js          # Media processing
├── custom1.js        # Your custom plugin 1
├── custom2.js        # Your custom plugin 2
└── disabled/         # Disabled plugins (optional folder)
    └── old-plugin.js
```

### Enable/Disable Plugins
```bash
# Disable a plugin (move to disabled folder)
mkdir -p plugins/disabled
mv plugins/unwanted-plugin.js plugins/disabled/

# Enable a plugin (move back from disabled)
mv plugins/disabled/wanted-plugin.js plugins/

# Restart bot
npm restart
```

### Plugin Loading Order
- Plugins are loaded alphabetically by filename
- All plugins run for every message
- Use early returns for performance (check command first)

### Hot Reload (Development)
```bash
# Method 1: Auto-restart with nodemon
npm run dev

# Method 2: Manual restart
npm restart

# Method 3: PM2 restart  
npm run pm2:restart
```

## ⚡ Best Practices

### 1. Performance Optimization
```javascript
export default async function myPlugin(m, sock, config) {
  const cmd = m.body.toLowerCase();
  
  // ✅ Good: Early return for irrelevant messages
  if (!cmd.startsWith(config.PREFIX)) return;
  
  // ✅ Good: Check command first, then logic
  if (cmd === `${config.PREFIX}hello`) {
    await m.reply('Hello!');
  }
  
  // ❌ Bad: Heavy processing before checking relevance
  // const heavyData = await someExpensiveOperation();
  // if (cmd === '.hello') { ... }
}
```

### 2. Error Handling
```javascript
export default async function myPlugin(m, sock, config) {
  try {
    const cmd = m.body.toLowerCase();
    
    if (cmd === `${config.PREFIX}api`) {
      const response = await axios.get('https://api.example.com/data');
      await m.reply(`Data: ${response.data.result}`);
    }
  } catch (error) {
    console.error('Plugin error:', error.message);
    await m.reply('❌ Something went wrong! Please try again.');
  }
}
```

### 3. Rate Limiting
```javascript
import { RateLimitHelpers } from '../lib/helpers.js';

export default async function myPlugin(m, sock, config) {
  const cmd = m.body.toLowerCase();
  
  if (cmd === `${config.PREFIX}expensive`) {
    // Rate limit: 3 uses per 5 minutes
    if (RateLimitHelpers.isLimited(m.sender, 'expensive', 3, 300000)) {
      return m.reply('⏰ Please wait before using this command again!');
    }
    
    // Your expensive operation here
    await m.reply('✅ Expensive operation completed!');
  }
}
```

### 4. Plugin Metadata
```javascript
export default async function myPlugin(m, sock, config) {
  // Plugin logic here
}

// Always include plugin info
export const info = {
  name: 'My Plugin',
  version: '1.0.0',
  author: 'Your Name',
  description: 'What this plugin does',
  category: 'utility', // utility, fun, admin, media, etc.
  commands: [
    {
      name: 'command1',
      description: 'What command1 does',
      usage: '.command1 [parameters]',
      aliases: ['cmd1', 'c1'],
      ownerOnly: false,
      groupOnly: false
    }
  ],
  dependencies: ['axios'], // NPM packages this plugin needs
  apiKeys: ['SOME_API_KEY'] // Required API keys
};
```

### 5. Configuration
```javascript
export default async function myPlugin(m, sock, config) {
  // Access bot config
  const prefix = config.PREFIX;
  const isPublic = config.MODE === 'public';
  
  // Plugin-specific config (add to .env)
  const apiKey = process.env.MY_PLUGIN_API_KEY;
  
  if (!apiKey) {
    console.log('⚠️ MY_PLUGIN_API_KEY not found in .env');
    return;
  }
  
  // Use config in your plugin logic
}
```

### 6. File Organization
```javascript
// For complex plugins, create a folder structure:
plugins/
├── advanced-plugin/
│   ├── index.js      # Main plugin file
│   ├── utils.js      # Helper functions
│   ├── config.js     # Plugin configuration
│   └── README.md     # Plugin documentation
└── simple-plugin.js  # Simple single-file plugin
```

## 🚀 Quick Start: Install Your First Plugin

### Example: Random Quote Plugin

1. **Create the plugin file:**
```bash
touch plugins/quotes.js
```

2. **Add the plugin code:**
```javascript
// plugins/quotes.js
import axios from 'axios';

export default async function quotesPlugin(m, sock, config) {
  const prefix = config.PREFIX;
  const cmd = m.body.toLowerCase();
  
  if (cmd === `${prefix}quote`) {
    try {
      await m.react('💭');
      
      const response = await axios.get('https://api.quotegarden.io/api/v3/quotes/random');
      const quote = response.data.data;
      
      const quoteMsg = `💭 **Daily Quote**\n\n"${quote.quoteText}"\n\n— *${quote.quoteAuthor}*`;
      
      await m.reply(quoteMsg);
      await m.react('✅');
      
    } catch (error) {
      await m.react('❌');
      await m.reply('❌ Failed to fetch quote. Try again later!');
    }
  }
}

export const info = {
  name: 'Random Quotes',
  version: '1.0.0',
  author: 'You',
  description: 'Get inspiring random quotes',
  commands: ['quote']
};
```

3. **Restart the bot:**
```bash
npm restart
```

4. **Test the plugin:**
Send `.quote` in WhatsApp and enjoy your first custom plugin! 🎉

## 🔍 Plugin Debugging

### Enable Debug Mode
```bash
NODE_ENV=development npm start
```

### Check Plugin Loading
```javascript
// Add to your plugin for debugging
export default async function myPlugin(m, sock, config) {
  console.log('Plugin loaded:', info.name);
  
  // Your plugin logic
}
```

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Plugin not loading | Check file extension is `.js` |
| Command not working | Verify prefix and command format |
| Import errors | Use ES6 imports (`import`/`export`) |
| Rate limiting | Add delays between API calls |
| Memory leaks | Clean up intervals/timeouts |

That's it! You now have everything you need to create, install, and manage plugins in your Fresh WhatsApp Bot! 🚀