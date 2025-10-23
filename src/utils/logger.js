// src/utils/logger.js - FIXED VERSION
import pino from 'pino';
import chalk from 'chalk';

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

let logger;

if (isProduction) {
  // Production: Simple JSON logging to stdout
  logger = pino({
    level: logLevel,
    formatters: {
      level: (label) => ({ level: label })
    }
  });
} else {
  // Development: Use pino-pretty transport (FIXED)
  logger = pino({
    level: logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
        messageFormat: '{msg}',
        customColors: 'info:green,warn:yellow,error:red',
        customLevels: 'fatal:60,error:50,warn:40,info:30,debug:20,trace:10'
      }
    }
  });
}

// Helper function to safely log errors
logger.safeError = (error, message) => {
  if (error instanceof Error) {
    logger.error({
      msg: message || error.message,
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
  } else {
    logger.error({ msg: message, error: String(error) });
  }
};

// Helper function to safely log objects
logger.safeLog = (level, message, data) => {
  try {
    if (data && typeof data === 'object') {
      // Only log serializable properties
      const safeData = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
          if (typeof value === 'function') continue;
          if (value instanceof Buffer) {
            safeData[key] = `<Buffer ${value.length} bytes>`;
          } else {
            try {
              JSON.stringify(value);
              safeData[key] = value;
            } catch {
              safeData[key] = String(value);
            }
          }
        }
      }
      logger[level]({ msg: message, ...safeData });
    } else {
      logger[level](message);
    }
  } catch (error) {
    console.error('Logger error:', error.message);
    console.log(level.toUpperCase(), ':', message);
  }
};

// Add chalk for manual coloring if needed
logger.chalk = chalk;

export default logger;