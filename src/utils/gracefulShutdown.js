import chalk from 'chalk';

export function gracefulShutdown(bot) {
  let shutdownInProgress = false;

  function handleShutdown(signal) {
    if (shutdownInProgress) return;
    
    shutdownInProgress = true;
    console.log(chalk.blue(`\n📪 ${signal} received. Shutting down gracefully...`));

    const timeout = setTimeout(() => {
      console.log(chalk.red('⚡ Force shutdown after timeout'));
      process.exit(1);
    }, 15000);

    bot.stop()
      .then(() => {
        clearTimeout(timeout);
        console.log(chalk.green('🎉 Graceful shutdown completed'));
        process.exit(0);
      })
      .catch((error) => {
        clearTimeout(timeout);
        console.error(chalk.red('❌ Shutdown error:'), error.message);
        process.exit(1);
      });
  }

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}