import chalk from 'chalk';

export default async function CallHandler(callUpdate, sock, config) {
  try {
    if (!config.REJECT_CALL) return;

    for (const call of callUpdate) {
      const { from, id, status } = call;
      
      if (status === 'offer') {
        console.log(chalk.yellow(`📞 Incoming call from: ${from}`));
        
        // Reject the call
        await sock.rejectCall(id, from);
        
        // Send message to caller
        const rejectMsg = `🚫 *Call Rejected*

Sorry, this bot doesn't accept calls. Please send a text message instead.

📝 You can use the following commands:
• ${config.PREFIX}menu - Show available commands
• ${config.PREFIX}help - Get help
• ${config.PREFIX}owner - Contact owner

Thank you for understanding! 🤖`;

        try {
          await sock.sendMessage(from, { text: rejectMsg });
          console.log(chalk.red(`🚫 Call rejected from: ${from.split('@')[0]}`));
        } catch (error) {
          console.log(chalk.yellow('⚠️ Failed to send reject message:', error.message));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red('❌ Call handler error:'), error.message);
  }
}
