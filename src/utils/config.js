import chalk from 'chalk';

export function validateConfig() {
  const config = {
    SESSION_ID: process.env.SESSION_ID || '',
    PREFIX: process.env.PREFIX || '.',
    BOT_NAME: process.env.BOT_NAME || 'Groq AI',
    OWNER_NUMBER: process.env.OWNER_NUMBER?.replace(/[^\d]/g, '') || '',
    ADMIN_NUMBERS: process.env.ADMIN_NUMBERS?.split(',').map(n => n.trim().replace(/[^\d]/g, '')) || [],
    OWNER_NAME: process.env.OWNER_NAME || 'Alex Macksyn',
    MODE: (process.env.MODE || 'public').toLowerCase(),
    AUTO_BIO: process.env.AUTO_BIO === 'true',
    AUTO_READ: process.env.AUTO_READ === 'true',
    AUTO_REACT: process.env.AUTO_REACT === 'true',
    WELCOME: process.env.WELCOME === 'true',
    ANTILINK: process.env.ANTILINK === 'true',
    REJECT_CALL: process.env.REJECT_CALL === 'true',
    AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN === 'true',
    PORT: parseInt(process.env.PORT) || 3000,
    NODE_ENV: process.env.NODE_ENV || 'production',
    TIMEZONE: process.env.TIMEZONE || 'Africa/Lagos',
    MONGODB_URI: process.env.MONGODB_URI || '',
    DATABASE_NAME: process.env.DATABASE_NAME || 'whatsapp_bot'
  };

  const errors = [];
  
  if (!config.OWNER_NUMBER) {
    errors.push('OWNER_NUMBER is required');
  }
  
  if (!['public', 'private'].includes(config.MODE)) {
    errors.push('MODE must be "public" or "private"');
  }
  
  if (errors.length > 0) {
    console.error(chalk.red('❌ Configuration errors:'));
    errors.forEach(error => console.error(chalk.red(`  • ${error}`)));
    process.exit(1);
  }
  
  console.log(chalk.green('✅ Configuration validated'));
  return config;
}
