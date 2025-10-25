# 🔌 Groq Bot Plugin System Documentation

## Overview

Your bot now has a **fully automatic plugin loading system** that:
- ✅ Auto-discovers all plugins in the `plugins/` folder
- ✅ Auto-syncs plugin metadata to MongoDB
- ✅ Dynamically generates the menu from loaded plugins
- ✅ Tracks plugin usage, crashes, and statistics
- ✅ Supports hot-reload (with restart)
- ✅ Preserves enabled/disabled states across restarts

---

## 🚀 How It Works

### 1. **Bot Startup**
When the bot starts:
1. `PluginManager` scans the `plugins/` directory
2. Loads each `.js` file as a plugin
3. Validates plugin structure (must have `name` and `run` function)
4. Syncs all plugins to MongoDB `plugins` collection
5. Preserves enabled/disabled states from previous runs

### 2. **Menu Generation**
The `menu` plugin automatically:
1. Queries MongoDB for all plugins
2. Groups them by category
3. Shows aliases, usage, and descriptions
4. Marks owner-only commands with 🔒
5. Shows enabled ✅ and disabled ❌ status

### 3. **Command Execution**
When a user sends a command:
1. Message is checked for command prefix (default: `.`)
2. Command name is extracted and matched to plugin (including aliases)
3. Plugin is loaded from memory (Map)
4. Permissions are checked (owner-only, admin-only, etc.)
5. Plugin's `run()` function is executed with full context
6. Usage statistics are updated in MongoDB
7. Errors are caught and crashes are tracked

---

## 📁 File Structure

```
groq-bot/
├── plugins/
│   ├── menu.js          ← Auto-generates menu from all plugins
│   ├── help.js          ← Shows detailed help for a command
│   ├── ping.js          ← Simple ping command
│   ├── stats.js         ← Bot statistics
│   ├── owner.js         ← Owner management commands
│   ├── echo.js          ← Example plugin
│   └── _template.js     ← Template for new plugins
├── src/
│   └── core/
│       └── PluginManager.js  ← Auto-loads and manages plugins
└── .env
```

---

## 🎯 Creating a New Plugin

### Step 1: Create the file

Create a new file in `plugins/` folder:

```bash
touch plugins/mycommand.js
```

### Step 2: Use the template

```javascript
// plugins/mycommand.js

export default {
  name: 'mycommand',
  description: 'Does something cool',
  aliases: ['mc', 'mycmd'],
  category: 'utility',
  usage: '<argument>',
  example: 'mycommand hello',
  
  async run({ msg, args, sock, db, prefix }) {
    const sender = msg.key.remoteJid;
    
    // Your logic here
    await sock.sendMessage(sender, {
      text: 'Hello from my command!'
    });
  }
};
```

### Step 3: Restart the bot

```bash
npm start
# or
pm2 restart groq-ai
```

**That's it!** Your command will:
- ✅ Automatically appear in `.menu`
- ✅ Be callable with `.mycommand` or `.mc`
- ✅ Show up in the correct category
- ✅ Be stored in MongoDB

---

## 📋 Plugin Properties

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | String | Command name (used to invoke) |
| `run` | Function | Main execution function |

### Optional Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `description` | String | "No description" | Brief description |
| `aliases` | Array | `[]` | Alternative command names |
| `category` | String | "general" | Category for menu grouping |
| `usage` | String | "" | Usage format |
| `example` | String | "" | Example usage |
| `version` | String | "1.0.0" | Plugin version |
| `ownerOnly` | Boolean | false | Restrict to owner |
| `adminOnly` | Boolean | false | Restrict to admins |
| `groupOnly` | Boolean | false | Only works in groups |
| `privateOnly` | Boolean | false | Only works in DMs |

---

## 🎮 Run Function Context

The `run()` function receives a context object:

```javascript
async run({ msg, args, sock, db, prefix }) {
  // msg - Full WhatsApp message object
  // args - Array of command arguments
  // sock - WhatsApp socket (for sending messages)
  // db - MongoDB database instance
  // prefix - Current command prefix (default: '.')
}
```

### Message Object (msg)
```javascript
{
  key: {
    remoteJid: '1234567890@s.whatsapp.net', // Sender ID
    fromMe: false,
    id: 'message-id'
  },
  message: {
    conversation: 'text content',
    extendedTextMessage: { ... },
    imageMessage: { ... },
    // ... more message types
  }
}
```

---

## 🛠️ Common Operations

### Send a message
```javascript
await sock.sendMessage(sender, {
  text: 'Hello!'
});
```

### Send with reply
```javascript
await sock.sendMessage(sender, {
  text: 'Reply!'
}, {
  quoted: msg
});
```

### React to message
```javascript
await sock.sendMessage(sender, {
  react: { text: '✅', key: msg.key }
});
```

### Database operations
```javascript
// Insert
await db.collection('users').insertOne({ name: 'John' });

// Find
const user = await db.collection('users').findOne({ name: 'John' });

// Update
await db.collection('users').updateOne(
  { name: 'John' },
  { $set: { age: 30 } }
);
```

---

## 👑 Owner Commands

### Plugin Management
```bash
.owner plugins list              # List all plugins
.owner plugins info <name>       # Show plugin details
.owner plugins enable <name>     # Enable a plugin
.owner plugins disable <name>    # Disable a plugin
```

### System Commands
```bash
.owner stats                     # Database & system stats
.owner backup                    # Create database backup
.owner reload all                # Reload all plugins
.owner reload <name>             # Reload specific plugin
```

### Settings
```bash
.owner prefix <new>              # Change command prefix
.owner setowner <number>         # Change owner number
.owner antilink <on/off>         # Toggle antilink
.owner welcome <on/off>          # Toggle welcome messages
```

---

## 📊 Categories

Supported categories (with auto-icons):

- **general** 📱 - Basic commands
- **owner** 👑 - Owner-only commands
- **admin** ⚙️ - Admin commands
- **utility** 🛠️ - Utility tools
- **fun** 🎮 - Fun/entertainment
- **media** 🎬 - Media handling
- **download** ⬇️ - Download tools
- **search** 🔍 - Search commands
- **ai** 🤖 - AI features
- **tools** 🔧 - General tools
- **group** 👥 - Group management
- **moderation** 🛡️ - Moderation tools
- **economy** 💰 - Economy system
- **games** 🎯 - Games
- **music** 🎵 - Music commands
- **info** ℹ️ - Information
- **system** ⚡ - System commands

---

## 🔄 Plugin Lifecycle

1. **Load** - Plugin file is imported
2. **Validate** - Structure is checked
3. **Register** - Added to PluginManager Map
4. **Sync** - Metadata saved to MongoDB
5. **Ready** - Available for command execution
6. **Execute** - Run when user calls command
7. **Track** - Usage stats updated
8. **Crash** - Errors tracked, auto-disabled after 3 crashes

---

## 🐛 Debugging

### Check plugin status
```bash
.owner plugins list
```

### View plugin details
```bash
.owner plugins info <name>
```

### Check logs
```bash
pm2 logs groq-ai
# or
tail -f logs/error.log
```

### Test plugin directly
```bash
node --loader ./test-plugin.js
```

---

## ⚠️ Important Notes

1. **Restart Required**: Changes to plugin files require bot restart
2. **Naming**: Plugin names must be unique
3. **Async/Await**: Always use async/await for async operations
4. **Error Handling**: Wrap code in try-catch blocks
5. **Rate Limiting**: Built-in rate limiting (10 commands/minute)
6. **Database**: Each plugin can create its own collections
7. **Permissions**: Check permissions before sensitive operations

---

## 🎉 Benefits of This System

✅ **Zero Configuration** - Just drop a file in `plugins/`  
✅ **Auto-Discovery** - Menu updates automatically  
✅ **Persistent State** - Plugin settings saved to MongoDB  
✅ **Crash Protection** - Auto-disables failing plugins  
✅ **Usage Tracking** - See which commands are popular  
✅ **Hot-Reload Ready** - Easy to update plugins  
✅ **Type Safety** - Clear plugin interface  
✅ **Scalable** - Add unlimited plugins  

---

## 📝 Example: Complete Plugin

```javascript
// plugins/weather.js

import axios from 'axios';

export default {
  name: 'weather',
  description: 'Get weather information for a city',
  aliases: ['w', 'forecast'],
  category: 'utility',
  usage: '<city>',
  example: 'weather London',
  version: '1.0.0',

  async run({ msg, args, sock, db, prefix }) {
    const sender = msg.key.remoteJid;

    if (args.length === 0) {
      return await sock.sendMessage(sender, {
        text: `❌ Please specify a city!\n\nUsage: ${prefix}weather <city>`
      });
    }

    const city = args.join(' ');

    try {
      // Show typing indicator
      await sock.sendPresenceUpdate('composing', sender);

      // Fetch weather (replace with real API)
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=YOUR_API_KEY`
      );

      const weather = response.data;
      const temp = Math.round(weather.main.temp - 273.15); // Kelvin to Celsius

      const message = `🌤️ *Weather in ${weather.name}*\n\n` +
        `🌡️ Temperature: ${temp}°C\n` +
        `💨 Wind: ${weather.wind.speed} m/s\n` +
        `💧 Humidity: ${weather.main.humidity}%\n` +
        `☁️ Condition: ${weather.weather[0].description}`;

      await sock.sendMessage(sender, { text: message });

      // Stop typing
      await sock.sendPresenceUpdate('paused', sender);

      // Save to database
      await db.collection('weather_queries').insertOne({
        sender,
        city,
        timestamp: new Date()
      });

    } catch (error) {
      await sock.sendMessage(sender, {
        text: `❌ Error: ${error.message}`
      });
    }
  }
};
```

---

## 🔥 Advanced Features

### 1. Middleware Pattern
```javascript
export default {
  name: 'premium',
  
  async run({ msg, args, sock, db, prefix }) {
    const sender = msg.key.remoteJid;
    
    // Check if user is premium
    const user = await db.collection('users').findOne({ jid: sender });
    if (!user?.premium) {
      return await sock.sendMessage(sender, {
        text: '⭐ This is a premium feature!'
      });
    }
    
    // Continue with premium feature...
  }
};
```

### 2. Cooldown System
```javascript
const cooldowns = new Map();

export default {
  name: 'limited',
  
  async run({ msg, sock }) {
    const sender = msg.key.remoteJid;
    const cooldownTime = 60000; // 1 minute
    
    if (cooldowns.has(sender)) {
      const expirationTime = cooldowns.get(sender) + cooldownTime;
      const timeLeft = Math.round((expirationTime - Date.now()) / 1000);
      
      if (Date.now() < expirationTime) {
        return await sock.sendMessage(sender, {
          text: `⏱️ Please wait ${timeLeft}s before using this again.`
        });
      }
    }
    
    cooldowns.set(sender, Date.now());
    
    // Execute command...
  }
};
```

### 3. Multi-step Conversation
```javascript
const conversations = new Map();

export default {
  name: 'register',
  
  async run({ msg, args, sock, db }) {
    const sender = msg.key.remoteJid;
    
    if (!conversations.has(sender)) {
      conversations.set(sender, { step: 1 });
      return await sock.sendMessage(sender, {
        text: '📝 What is your name?'
      });
    }
    
    const conv = conversations.get(sender);
    
    if (conv.step === 1) {
      conv.name = args.join(' ');
      conv.step = 2;
      return await sock.sendMessage(sender, {
        text: '📧 What is your email?'
      });
    }
    
    if (conv.step === 2) {
      conv.email = args[0];
      
      // Save to database
      await db.collection('users').insertOne({
        jid: sender,
        name: conv.name,
        email: conv.email,
        registered: new Date()
      });
      
      conversations.delete(sender);
      
      return await sock.sendMessage(sender, {
        text: `✅ Registration complete!\n\nName: ${conv.name}\nEmail: ${conv.email}`
      });
    }
  }
};
```

### 4. Group Management
```javascript
export default {
  name: 'kick',
  category: 'group',
  groupOnly: true,
  adminOnly: true,
  usage: '@mention',
  
  async run({ msg, sock }) {
    const sender = msg.key.remoteJid;
    const isGroup = sender.endsWith('@g.us');
    
    if (!isGroup) {
      return await sock.sendMessage(sender, {
        text: '❌ This command only works in groups!'
      });
    }
    
    // Get mentioned users
    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    
    if (mentions.length === 0) {
      return await sock.sendMessage(sender, {
        text: '❌ Please mention a user to kick!'
      });
    }
    
    // Get group metadata
    const groupMetadata = await sock.groupMetadata(sender);
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const botParticipant = groupMetadata.participants.find(p => p.id === botJid);
    
    // Check if bot is admin
    if (!botParticipant?.admin) {
      return await sock.sendMessage(sender, {
        text: '❌ I need to be an admin to kick members!'
      });
    }
    
    // Check if sender is admin
    const senderParticipant = groupMetadata.participants.find(p => p.id === msg.key.participant);
    if (!senderParticipant?.admin) {
      return await sock.sendMessage(sender, {
        text: '❌ You need to be an admin to use this command!'
      });
    }
    
    // Kick users
    await sock.groupParticipantsUpdate(sender, mentions, 'remove');
    
    await sock.sendMessage(sender, {
      text: `✅ Kicked ${mentions.length} user(s)!`
    });
  }
};
```

### 5. Scheduled Tasks
```javascript
let interval = null;

export default {
  name: 'reminder',
  usage: '<minutes> <message>',
  
  async run({ msg, args, sock }) {
    const sender = msg.key.remoteJid;
    const minutes = parseInt(args[0]);
    const message = args.slice(1).join(' ');
    
    if (!minutes || !message) {
      return await sock.sendMessage(sender, {
        text: '❌ Usage: reminder <minutes> <message>'
      });
    }
    
    await sock.sendMessage(sender, {
      text: `⏰ Reminder set for ${minutes} minute(s)!`
    });
    
    setTimeout(async () => {
      await sock.sendMessage(sender, {
        text: `🔔 *REMINDER*\n\n${message}`
      });
    }, minutes * 60 * 1000);
  }
};
```

### 6. File Upload Handler
```javascript
import { downloadMediaMessage } from '@whiskeysockets/baileys';

export default {
  name: 'sticker',
  description: 'Convert image to sticker',
  category: 'media',
  
  async run({ msg, sock }) {
    const sender = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const messageType = quoted?.imageMessage || msg.message?.imageMessage;
    
    if (!messageType) {
      return await sock.sendMessage(sender, {
        text: '❌ Please send or reply to an image!'
      });
    }
    
    try {
      await sock.sendMessage(sender, {
        text: '⏳ Creating sticker...'
      });
      
      // Download the image
      const buffer = await downloadMediaMessage(
        { message: quoted || msg.message },
        'buffer',
        {}
      );
      
      // Send as sticker
      await sock.sendMessage(sender, {
        sticker: buffer
      });
      
    } catch (error) {
      await sock.sendMessage(sender, {
        text: `❌ Error: ${error.message}`
      });
    }
  }
};
```

### 7. API Integration Example
```javascript
import axios from 'axios';

export default {
  name: 'joke',
  description: 'Get a random joke',
  category: 'fun',
  
  async run({ msg, sock, db }) {
    const sender = msg.key.remoteJid;
    
    try {
      // Fetch from API
      const response = await axios.get('https://official-joke-api.appspot.com/random_joke');
      const joke = response.data;
      
      const message = `😂 *Random Joke*\n\n${joke.setup}\n\n_${joke.punchline}_`;
      
      await sock.sendMessage(sender, { text: message });
      
      // Track in database
      await db.collection('jokes_sent').insertOne({
        sender,
        joke: joke.setup,
        timestamp: new Date()
      });
      
    } catch (error) {
      await sock.sendMessage(sender, {
        text: '❌ Could not fetch joke. Try again later.'
      });
    }
  }
};
```

---

## 🎨 Best Practices

### ✅ DO:
- Use clear, descriptive plugin names
- Provide helpful error messages
- Add usage examples
- Handle errors gracefully
- Validate user input
- Use try-catch blocks
- Add typing indicators for long operations
- Clean up resources (timeouts, intervals)
- Document your code
- Use async/await properly

### ❌ DON'T:
- Block the event loop with synchronous operations
- Store sensitive data in plain text
- Expose API keys in code
- Create global variables (use closures or database)
- Ignore error handling
- Make assumptions about message format
- Forget to check permissions
- Leave console.log() everywhere
- Create infinite loops
- Hard-code phone numbers

---

## 🔒 Security Considerations

### 1. Input Validation
```javascript
// Always validate and sanitize input
const amount = parseInt(args[0]);
if (isNaN(amount) || amount < 0 || amount > 1000000) {
  return await sock.sendMessage(sender, {
    text: '❌ Invalid amount!'
  });
}
```

### 2. Permission Checks
```javascript
// Check owner permission
if (plugin.ownerOnly && !isOwner(sender)) {
  return await sock.sendMessage(sender, {
    text: '❌ Owner only!'
  });
}
```

### 3. Rate Limiting
```javascript
// Prevent spam
if (!rateLimiter.checkLimit(sender)) {
  return await sock.sendMessage(sender, {
    text: '⚠️ Too many requests. Slow down!'
  });
}
```

### 4. SQL Injection (MongoDB)
```javascript
// Use parameterized queries
await db.collection('users').findOne({
  username: args[0] // Safe with MongoDB
});

// Avoid building queries from strings
// BAD: eval(`db.collection('${args[0]}')`)
```

---

## 📊 Database Schema Examples

### Users Collection
```javascript
{
  _id: ObjectId("..."),
  jid: "1234567890@s.whatsapp.net",
  name: "John Doe",
  premium: false,
  banned: false,
  warns: 0,
  balance: 1000,
  level: 5,
  exp: 2500,
  lastSeen: ISODate("2025-01-15T10:30:00Z"),
  registered: ISODate("2025-01-01T00:00:00Z")
}
```

### Plugins Collection
```javascript
{
  _id: ObjectId("..."),
  name: "ping",
  description: "Check bot response time",
  category: "general",
  aliases: ["p"],
  enabled: true,
  crashes: 0,
  usageCount: 1523,
  lastUsed: ISODate("2025-01-15T10:30:00Z"),
  createdAt: ISODate("2025-01-01T00:00:00Z"),
  updatedAt: ISODate("2025-01-15T00:00:00Z")
}
```

### Settings Collection
```javascript
{
  _id: ObjectId("..."),
  key: "prefix",
  value: ".",
  updatedAt: ISODate("2025-01-01T00:00:00Z")
}
```

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Start Bot
```bash
npm start
# or with PM2
npm run pm2
```

### 4. Create Your First Plugin
```bash
# Copy template
cp plugins/_template.js plugins/mycommand.js

# Edit the file
nano plugins/mycommand.js

# Restart bot
pm2 restart groq-ai
```

### 5. Test Your Plugin
```
.menu            # See your command listed
.mycommand       # Test it
.help mycommand  # View details
```

---

## 📚 Resources

- [Baileys Documentation](https://github.com/WhiskeySockets/Baileys)
- [MongoDB Node.js Driver](https://www.mongodb.com/docs/drivers/node/current/)
- [WhatsApp Web Protocol](https://github.com/sigalor/whatsapp-web-reveng)

---

## 💡 Tips & Tricks

1. **Test in private first** - Don't spam groups while testing
2. **Use .owner eval** - Quick code execution for debugging
3. **Check .owner stats** - Monitor database growth
4. **Regular backups** - Use `.owner backup` regularly
5. **Monitor logs** - `pm2 logs groq-ai` shows real-time logs
6. **Disable broken plugins** - `.owner plugins disable <n>`
7. **Use aliases** - Add shortcuts for frequently used commands
8. **Category organization** - Keep plugins organized by category
9. **Document usage** - Always provide usage examples
10. **Version your plugins** - Track changes with version numbers

---

## 🎉 Success!

Your bot now has a **powerful, automatic plugin system**! 

Every time you add a new `.js` file to `plugins/`, it will:
- ✅ Auto-load on startup
- ✅ Appear in the menu
- ✅ Be callable by users
- ✅ Track usage statistics
- ✅ Handle errors gracefully

Just drop in a plugin file and restart! 🚀

---

Made with ❤️ by the Groq Bot Framework Team