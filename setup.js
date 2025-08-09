#!/usr/bin/env node

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(chalk.blue.bold(`
╭─────────────────────────────────────╮
│     🤖 Fresh WhatsApp Bot Setup     │
│         Welcome to the setup!       │
╰─────────────────────────────────────╯
`));

const questions = [
  {
    key: 'BOT_NAME',
    question: '🤖 Bot name (default: Fresh WhatsApp Bot): ',
    default: 'Fresh WhatsApp Bot'
  },
  {
    key: 'PREFIX',
    question: '🎯 Command prefix (default: .): ',
    default: '.'
  },
  {
    key: 'OWNER_NUMBER',
    question: '👑 Your WhatsApp number (without +): ',
    required: true,
    validate: (input) => /^\d{10,15}$/.test(input)
  },
  {
    key: 'OWNER_NAME',
    question: '📝 Your name (default: Bot Owner): ',
    default: 'Bot Owner'
  },
  {
    key: 'MODE',
    question: '🔧 Bot mode (public/private, default: public): ',
    default: 'public',
    validate: (input) => ['public', 'private'].includes(input.toLowerCase())
  },
  {
    key: 'AUTO_READ',
    question: '👁️ Auto-read messages? (true/false, default: true): ',
    default: 'true',
    validate: (input) => ['true', 'false'].includes(input.toLowerCase())
  },
  {
    key: 'AUTO_REACT',
    question: '😊 Auto-react to messages? (true/false, default: true): ',
    default: 'true',
    validate: (input) => ['true', 'false'].includes(input.toLowerCase())
  },
  {
    key: 'WELCOME',
    question: '👋 Send welcome messages in groups? (true/false, default: true): ',
    default: 'true',
    validate: (input) => ['true', 'false'].includes(input.toLowerCase())
  },
  {
    key: 'ANTILINK',
    question: '🚫 Enable anti-link protection? (true/false, default: false): ',
    default: 'false',
    validate: (input) => ['true', 'false'].includes(input.toLowerCase())
  },
  {
    key: 'REJECT_CALL',
    question: '📞 Auto-reject calls? (true/false, default: true): ',
    default: 'true',
    validate: (input) => ['true', 'false'].includes(input.toLowerCase())
  }
];

const optionalQuestions = [
  {
    key: 'OPENAI_API_KEY',
    question: '🤖 OpenAI API key (optional, for AI features): ',
    optional: true
  },
  {
    key: 'WEATHER_API_KEY',
    question: '🌤️ Weather API key (optional, for weather commands): ',
    optional: true
  },
  {
    key: 'GROQ_API_KEY',
    question: '⚡ Groq API key (optional, for fast AI): ',
    optional: true
  }
];

async function askQuestion(question, defaultValue = '', required = false, validate = null) {
  return new Promise((resolve) => {
    rl.question(chalk.cyan(question), (answer) => {
      const value = answer.trim() || defaultValue;
      
      if (required && !value) {
        console.log(chalk.red('❌ This field is required!'));
        resolve(askQuestion(question, defaultValue, required, validate));
      } else if (validate && value && !validate(value)) {
        console.log(chalk.red('❌ Invalid input format!'));
        resolve(askQuestion(question, defaultValue, required, validate));
      } else {
        resolve(value);
      }
    });
  });
}

async function createDirectories() {
  const dirs = ['session', 'plugins', 'lib', 'handlers', 'temp', 'logs', 'public', 'config'];
  
  console.log(chalk.blue('\n📁 Creating directories...'));
  
  for (const dir of dirs) {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(chalk.green(`✅ Created: ${dir}/`));
    } else {
      console.log(chalk.yellow(`⚠️ Already exists: ${dir}/`));
    }
  }
}

async function createEnvFile(config) {
  console.log(chalk.blue('\n📝 Creating .env file...'));
  
  let envContent = `# ================================
# 🤖 FRESH WHATSAPP BOT CONFIG
# ================================

# Bot Basic Settings
BOT_NAME="${config.BOT_NAME}"
PREFIX="${config.PREFIX}"
MODE="${config.MODE.toLowerCase()}"

# Session Management (Mega File Storage)
# Format: BotName~fileId#key
# Leave empty for first-time setup (will show QR code)
SESSION_ID=""

# Owner Information
OWNER_NUMBER="${config.OWNER_NUMBER}"
OWNER_NAME="${config.OWNER_NAME}"

# Auto Features
AUTO_READ="${config.AUTO_READ.toLowerCase()}"
AUTO_REACT="${config.AUTO_REACT.toLowerCase()}"
AUTO_BIO="true"
WELCOME="${config.WELCOME.toLowerCase()}"
ANTILINK="${config.ANTILINK.toLowerCase()}"
REJECT_CALL="${config.REJECT_CALL.toLowerCase()}"

# Server Settings
PORT="3000"
RENDER_EXTERNAL_URL=""

# Timezone
TIMEZONE="Africa/Lagos"

# Optional API Keys`;

  if (config.OPENAI_API_KEY) {
    envContent += `\nOPENAI_API_KEY="${config.OPENAI_API_KEY}"`;
  } else {
    envContent += `\n# OPENAI_API_KEY=""`;
  }

  if (config.WEATHER_API_KEY) {
    envContent += `\nWEATHER_API_KEY="${config.WEATHER_API_KEY}"`;
  } else {
    envContent += `\n# WEATHER_API_KEY=""`;
  }

  if (config.GROQ_API_KEY) {
    envContent += `\nGROQ_API_KEY="${config.GROQ_API_KEY}"`;
  } else {
    envContent += `\n# GROQ_API_KEY=""`;
  }

  envContent += `

# ================================
# 📝 SETUP INSTRUCTIONS
# ================================

# 1. FIRST TIME SETUP:
#    - Leave SESSION_ID empty
#    - Run: npm start
#    - Scan QR code with WhatsApp
#    - Bot will generate session files

# 2. MEGA SESSION SETUP:
#    - Upload session/creds.json to mega.nz
#    - Get download link: https://mega.nz/file/abc123#xyz789
#    - Format: BotName~abc123#xyz789
#    - Set SESSION_ID above

# 3. DEPLOYMENT:
#    - For Railway/Render: Set environment variables
#    - For Docker: Use docker-compose.yml
#    - For VPS: Use PM2 (npm run pm2)

# Need help? Check README.md or contact support!
`;

  fs.writeFileSync(path.join(__dirname, '.env'), envContent);
  console.log(chalk.green('✅ .env file created successfully!'));
}

async function createPackageJson() {
  console.log(chalk.blue('\n📦 Creating package.json...'));
  
  const packageExists = fs.existsSync(path.join(__dirname, 'package.json'));
  
  if (packageExists) {
    console.log(chalk.yellow('⚠️ package.json already exists, skipping...'));
    return;
  }

  const packageContent = {
    "name": "fresh-whatsapp-bot",
    "version": "1.0.0",
    "description": "A fresh WhatsApp bot built with Baileys and Mega session storage",
    "main": "index.js",
    "type": "module",
    "scripts": {
      "start": "node index.js",
      "dev": "node --watch index.js",
      "setup": "node setup.js",
      "pm2": "pm2 start index.js --name whatsapp-bot",
      "pm2:stop": "pm2 stop whatsapp-bot",
      "pm2:restart": "pm2 restart whatsapp-bot",
      "pm2:delete": "pm2 delete whatsapp-bot",
      "docker": "docker-compose up -d",
      "docker:stop": "docker-compose down",
      "docker:logs": "docker-compose logs -f"
    },
    "keywords": [
      "whatsapp",
      "bot",
      "baileys",
      "whatsapp-bot",
      "automation",
      "mega",
      "session",
      "fresh-bot"
    ],
    "author": "Fresh Bot Developer",
    "license": "MIT",
    "dependencies": {
      "@whiskeysockets/baileys": "^6.6.0",
      "axios": "^1.6.8",
      "chalk": "^5.3.0",
      "dotenv": "^16.4.5",
      "express": "^4.19.2",
      "megajs": "^1.1.0",
      "moment-timezone": "^0.5.45",
      "pino": "^8.20.0"
    },
    "devDependencies": {
      "nodemon": "^3.1.0"
    },
    "engines": {
      "node": ">=18.0.0"
    },
    "repository": {
      "type": "git",
      "url": "https://github.com/yourusername/fresh-whatsapp-bot"
    }
  };

  fs.writeFileSync(
    path.join(__dirname, 'package.json'), 
    JSON.stringify(packageContent, null, 2)
  );
  console.log(chalk.green('✅ package.json created successfully!'));
}

async function createStartupScript() {
  console.log(chalk.blue('\n🚀 Creating startup scripts...'));

  // Create start.sh for Linux/Mac
  const startScript = `#!/bin/bash

echo "🤖 Starting Fresh WhatsApp Bot..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the bot
echo "✅ Starting bot..."
npm start
`;

  fs.writeFileSync(path.join(__dirname, 'start.sh'), startScript);
  
  // Make it executable on Unix systems
  try {
    fs.chmodSync(path.join(__dirname, 'start.sh'), 0o755);
  } catch (error) {
    // Windows doesn't support chmod
  }

  // Create start.bat for Windows
  const startBat = `@echo off
echo 🤖 Starting Fresh WhatsApp Bot...

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

:: Start the bot
echo ✅ Starting bot...
npm start

pause
`;

  fs.writeFileSync(path.join(__dirname, 'start.bat'), startBat);
  
  console.log(chalk.green('✅ Startup scripts created!'));
  console.log(chalk.cyan('   - Linux/Mac: ./start.sh'));
  console.log(chalk.cyan('   - Windows: start.bat'));
}

async function createReadme(config) {
  console.log(chalk.blue('\n📖 Creating README.md...'));

  const readmeContent = `# 🤖 ${config.BOT_NAME}

A powerful WhatsApp bot built with Baileys, featuring AI integration, media processing, and advanced group management.

## ✨ Features

- 🤖 **AI Integration** - Chat with OpenAI GPT and Groq
- 🌤️ **Weather Updates** - Real-time weather information
- 📱 **QR Code Generator** - Create QR codes instantly
- 🔗 **URL Shortener** - Shorten long URLs
- 👥 **Group Management** - Welcome messages, admin tools
- 📊 **System Monitoring** - Performance and health checks
- 🎮 **Fun Commands** - Jokes, facts, quotes, and games
- ⚡ **Auto Features** - Auto-read, auto-react, auto-bio
- 🔒 **Security** - Anti-link, call rejection, owner-only commands

## 🚀 Quick Start

### Method 1: Automatic Setup
\`\`\`bash
node setup.js
npm start
\`\`\`

### Method 2: Manual Setup
1. **Clone the repository**
   \`\`\`bash
   git clone https://github.com/yourusername/fresh-whatsapp-bot
   cd fresh-whatsapp-bot
   \`\`\`

2. **Install dependencies**
   \`\`\`bash
   npm install
   \`\`\`

3. **Configure environment**
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your settings
   \`\`\`

4. **Start the bot**
   \`\`\`bash
   npm start
   \`\`\`

5. **Scan QR Code**
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices
   - Scan the QR code shown in terminal

## ⚙️ Configuration

### Basic Settings
- **BOT_NAME**: Your bot's display name
- **PREFIX**: Command prefix (default: \`${config.PREFIX}\`)
- **OWNER_NUMBER**: Your WhatsApp number
- **MODE**: \`public\` or \`private\`

### Features
- **AUTO_READ**: Auto-read messages
- **AUTO_REACT**: Random reactions to messages
- **WELCOME**: Group welcome/goodbye messages
- **ANTILINK**: Remove users who send links
- **REJECT_CALL**: Automatically reject calls

### API Keys (Optional)
- **OPENAI_API_KEY**: For AI chat features
- **WEATHER_API_KEY**: For weather commands
- **GROQ_API_KEY**: For fast AI responses

## 📱 Commands

### General Commands
- \`${config.PREFIX}menu\` - Show all commands
- \`${config.PREFIX}ping\` - Check bot response time
- \`${config.PREFIX}info\` - Bot information
- \`${config.PREFIX}owner\` - Contact owner

### Fun Commands
- \`${config.PREFIX}joke\` - Random joke
- \`${config.PREFIX}fact\` - Random fact
- \`${config.PREFIX}quote\` - Inspirational quote

### Utility Commands
- \`${config.PREFIX}weather [city]\` - Weather information
- \`${config.PREFIX}qr [text]\` - Generate QR code
- \`${config.PREFIX}short [url]\` - Shorten URL

### AI Commands
- \`${config.PREFIX}ai [question]\` - Ask AI
- \`${config.PREFIX}gpt [question]\` - Chat with GPT

### Group Commands
- \`${config.PREFIX}tagall\` - Tag all members
- \`${config.PREFIX}groupinfo\` - Group information
- \`${config.PREFIX}rules\` - Show group rules

### Owner Commands
- \`${config.PREFIX}restart\` - Restart bot
- \`${config.PREFIX}broadcast [msg]\` - Broadcast message
- \`${config.PREFIX}setbio [text]\` - Update bot status

## 🐳 Docker Deployment

\`\`\`bash
# Using Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
\`\`\`

## 🔄 PM2 Deployment

\`\`\`bash
# Install PM2
npm install -g pm2

# Start with PM2
npm run pm2

# Monitor
pm2 monit

# Stop
npm run pm2:stop
\`\`\`

## ☁️ Cloud Deployment

### Railway
1. Fork this repository
2. Connect to Railway
3. Add environment variables
4. Deploy

### Render
1. Connect GitHub repository
2. Set build command: \`npm install\`
3. Set start command: \`npm start\`
4. Add environment variables

### VPS
1. Clone repository on server
2. Install Node.js and PM2
3. Configure environment variables
4. Start with PM2

## 🔧 Session Management

### Local Session
- Session files are stored in \`session/\` directory
- Automatically created after QR scan

### Mega.nz Session (Recommended for cloud)
1. Upload \`session/creds.json\` to Mega.nz
2. Get download link
3. Format: \`BotName~fileId#key\`
4. Set as \`SESSION_ID\` in environment

## 🛠️ Development

### File Structure
\`\`\`
├── handlers/           # Event handlers
├── lib/               # Utilities and helpers
├── plugins/           # Command plugins
├── public/            # Web dashboard
├── session/           # WhatsApp session data
├── index.js           # Main bot file
└── setup.js           # Interactive setup
\`\`\`

### Adding Commands
1. Create plugin file in \`plugins/\`
2. Export default function
3. Handle commands and return responses

### Custom Plugins
\`\`\`javascript
export default async function customPlugin(m, sock, config) {
  if (m.body === '${config.PREFIX}custom') {
    await m.reply('Custom command works!');
  }
}
\`\`\`

## 📊 Monitoring

- **Web Dashboard**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **System Stats**: Use \`${config.PREFIX}status\` command

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Submit pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

- **Issues**: GitHub Issues
- **WhatsApp**: [Contact Owner](https://wa.me/${config.OWNER_NUMBER})
- **Documentation**: Check README.md

## 🙏 Acknowledgments

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [OpenAI](https://openai.com) - AI Integration
- [Mega.js](https://github.com/tonistiigi/mega) - Session Storage

---

Made with ❤️ by Fresh Bot Team
`;

  fs.writeFileSync(path.join(__dirname, 'README.md'), readmeContent);
  console.log(chalk.green('✅ README.md created successfully!'));
}

async function showNextSteps(config) {
  console.log(chalk.green.bold(`
╭─────────────────────────────────────╮
│        🎉 Setup Complete! 🎉        │
╰─────────────────────────────────────╯
`));

  console.log(chalk.cyan(`
📋 **Setup Summary:**
• Bot Name: ${config.BOT_NAME}
• Owner: ${config.OWNER_NAME} (${config.OWNER_NUMBER})
• Mode: ${config.MODE.toUpperCase()}
• Prefix: ${config.PREFIX}

📁 **Files Created:**
✅ .env (configuration)
✅ README.md (documentation)  
✅ package.json (dependencies)
✅ start.sh / start.bat (startup scripts)
✅ Required directories

🚀 **Next Steps:**
`));

  console.log(chalk.yellow(`
1. Install Dependencies:
   ${chalk.white('npm install')}

2. Start the Bot:
   ${chalk.white('npm start')}

3. Scan QR Code:
   • Open WhatsApp on your phone
   • Go to Settings > Linked Devices  
   • Scan the QR code in terminal

4. Test the Bot:
   • Send: ${config.PREFIX}ping
   • Send: ${config.PREFIX}menu
`));

  if (!config.OPENAI_API_KEY && !config.GROQ_API_KEY) {
    console.log(chalk.blue(`
🤖 **Optional AI Setup:**
• Get OpenAI API key: https://platform.openai.com
• Get Groq API key: https://console.groq.com
• Add to .env file for AI features
`));
  }

  if (!config.WEATHER_API_KEY) {
    console.log(chalk.blue(`
🌤️ **Optional Weather Setup:**
• Get free API key: https://openweathermap.org/api
• Add WEATHER_API_KEY to .env file
`));
  }

  console.log(chalk.green(`
💡 **Tips:**
• Use PM2 for production: ${chalk.white('npm run pm2')}
• For cloud deployment: Upload session to Mega.nz
• Web dashboard: http://localhost:3000
• Commands: ${config.PREFIX}help

📞 **Support:**
• GitHub: https://github.com/yourusername/fresh-whatsapp-bot
• WhatsApp: wa.me/${config.OWNER_NUMBER}

Happy botting! 🚀
`));
}

async function main() {
  try {
    const config = {};
    
    console.log(chalk.blue('📝 Please answer the following questions to configure your bot:\n'));
    
    // Ask main questions
    for (const q of questions) {
      config[q.key] = await askQuestion(
        q.question,
        q.default,
        q.required,
        q.validate
      );
    }
    
    // Ask optional questions
    console.log(chalk.blue('\n🔧 Optional configurations (press Enter to skip):\n'));
    
    for (const q of optionalQuestions) {
      config[q.key] = await askQuestion(q.question);
    }
    
    console.log(chalk.blue('\n🔨 Setting up your bot...\n'));
    
    // Create necessary files and directories
    await createDirectories();
    await createEnvFile(config);
    await createPackageJson();
    await createStartupScript();
    await createReadme(config);
    
    // Show next steps
    await showNextSteps(config);
    
  } catch (error) {
    console.error(chalk.red('\n❌ Setup failed:'), error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Setup interrupted. You can run setup again anytime with: node setup.js'));
  process.exit(0);
});

// Start the setup
main();
