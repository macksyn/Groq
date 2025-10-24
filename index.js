#!/usr/bin/env node
import 'dotenv/config';
import logger from './src/utils/logger.js';
import { WhatsAppBot } from './src/core/WhatsAppBot.js';
import { validateConfig } from './src/utils/config.js';
import { gracefulShutdown } from './src/utils/gracefulShutdown.js';

logger.info(`
╭─────────────────────────────────────╮
│       🤖 ${process.env.BOT_NAME || 'Groq AI'}       │
│         Starting v2.0...            │
╰─────────────────────────────────────╯
`);

async function main() {
  try {
    const config = validateConfig();
    const bot = new WhatsAppBot(config);
    await bot.start();
    gracefulShutdown(bot);
  } catch (error) {
    logger.error(error, '💥 Startup failed:');
    process.exit(1);
  }
}

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error(reason, '💥 Uncaught Exception:');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(reason, '❌ Unhandled Rejection:');
  process.exit(1);
});

main();
