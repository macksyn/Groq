#!/usr/bin/env node
import 'dotenv/config';
import chalk from 'chalk';
import { WhatsAppBot } from './src/core/WhatsAppBot.js';
import { validateConfig } from './src/utils/config.js';
import { gracefulShutdown } from './src/utils/gracefulShutdown.js';

console.log(chalk.cyan(`
╭─────────────────────────────────────╮
│       🤖 ${process.env.BOT_NAME || 'Groq AI'}       │
│         Starting v2.0...            │
╰─────────────────────────────────────╯
`));

async function main() {
  try {
    const config = validateConfig();
    const bot = new WhatsAppBot(config);
    await bot.start();
    gracefulShutdown(bot);
  } catch (error) {
    console.error(chalk.red('💥 Startup failed:'), error.message);
    process.exit(1);
  }
}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error(chalk.red('💥 Uncaught Exception:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('❌ Unhandled Rejection:'), reason);
  process.exit(1);
});

main();
