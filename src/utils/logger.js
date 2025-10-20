// src/utils/logger.js
import pino from 'pino';
import pretty from 'pino-pretty'; // We need to import the stream builder
import chalk from 'chalk';
import dayjs from 'dayjs';

// Define log level from environment, default to 'info'
const logLevel = process.env.LOG_LEVEL || 'info';

let logger;

if (process.env.NODE_ENV === 'production') {
  // --- PRODUCTION LOGGER ---
  // This is correct. It uses the high-performance async transport
  // and writes standard JSON to stdout.
  logger = pino({
    level: logLevel,
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // 1 = stdout
    },
  });

} else {
  // --- DEVELOPMENT LOGGER (THE FIX) ---
  // We create the pino-pretty stream *first* and pass it directly
  // to the pino constructor. This forces synchronous logging
  // and avoids the worker thread DataCloneError.

  // Define chalk colors for log levels
  const prettyColors = {
    default: chalk.white,
    fatal: chalk.red.bold,
    error: chalk.red,
    warn: chalk.yellow,
    info: chalk.green,
    debug: chalk.blue,
    trace: chalk.gray,
  };

  const prettyLevel = (label) => {
    const color = prettyColors[label] || prettyColors.default;
    return color(label.toUpperCase());
  };

  const prettyTime = (timestamp) => {
    return chalk.gray(`[${dayjs(timestamp).format('HH:mm:ss')}]`);
  };
  
  // 1. Create the pretty-printing stream
  const prettyStream = pretty({
    colorize: false, // We are doing custom coloring
    translateTime: false, // We are doing custom time
    ignore: 'pid,hostname', // Don't show process ID or hostname
    customPrettifiers: {
      level: prettyLevel,
      time: prettyTime,
    },
    messageFormat: (log, messageKey) => {
      const msg = log[messageKey];
      // Use the 'info' color (green) for standard messages
      return prettyColors.info(msg);
    },
  });

  // 2. Pass the stream directly to pino
  // This forces it to run synchronously in the main thread.
  logger = pino({ level: logLevel }, prettyStream);
}

// Also export chalk for any specific styling needed
logger.chalk = chalk;

// Export the centralized logger
export default logger;