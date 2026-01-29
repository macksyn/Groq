// plugins/time.js
// This plugin displays the current server time and date.

export default {
  // ============================================================
  // REQUIRED PLUGIN METADATA
  // ============================================================
  // These fields are used by pluginManager.js to register and identify the plugin
  name: 'Time Utility',
  version: '1.0.0',
  author: 'Your Bot',
  description: 'Shows the current server time and date.',
  category: 'utility',

  // ============================================================
  // COMMAND REGISTRATION
  // ============================================================
  // Primary commands that trigger this plugin
  commands: ['time'],
  // Alternative commands (aliases) that also trigger this plugin
  aliases: ['datetime', 'clock'],

  // ============================================================
  // MAIN EXECUTION HANDLER
  // ============================================================
  // This function is called by pluginManager.js when the command is triggered
  async run(context) {
    // Destructure the context object provided by pluginManager
    // - msg (m): The message object containing all message data
    // - args: Command arguments (text after the command)
    // - sock: WhatsApp socket connection
    // - logger: Logger instance for debugging
    // - helpers: Utility functions (PermissionHelpers, TimeHelpers, etc.)
    // - config: Bot configuration (PREFIX, OWNER_NUMBER, etc.)
    const { msg: m, args, sock, logger, helpers, config } = context;

    try {
      // ============================================================
      // COMMAND LOGIC STARTS HERE
      // ============================================================
      
      // Get current date and time
      const now = new Date();
      
      // Format time (HH:MM:SS)
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const currentTime = `${hours}:${minutes}:${seconds}`;
      
      // Format date (YYYY-MM-DD)
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const currentDate = `${year}-${month}-${day}`;
      
      // Get day of week
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = daysOfWeek[now.getDay()];
      
      // Build response message
      const response = `🕐 *Server Time*\n\n` +
                      `⏰ Time: ${currentTime}\n` +
                      `📅 Date: ${currentDate}\n` +
                      `📆 Day: ${dayOfWeek}`;
      
      // Send reply back to the chat
      return m.reply(response);

      // ============================================================
      // FUTURE FEATURES CAN BE ADDED HERE
      // ============================================================
      // Examples:
      // - Add timezone conversion: if (args[0]) { convert to timezone }
      // - Add time difference calculator: if (args[0] === 'diff') { ... }
      // - Add countdown timer: if (args[0] === 'until') { ... }
      // - Add stopwatch functionality: if (args[0] === 'stopwatch') { ... }
      
    } catch (error) {
      // Log any errors that occur during execution
      logger.error('Error in Time plugin:', error);
      // Inform the user that something went wrong
      m.reply('❌ An error occurred while fetching the time.');
    }
  }
};