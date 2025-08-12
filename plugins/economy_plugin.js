// Fixed Handle leaderboard command
async function handleLeaderboard(context) {
  const { reply, sock, from } = context;
  
  try {
    // Get all users and calculate total wealth for proper sorting
    const users = await db.collection(COLLECTIONS.USERS)
      .find({})
      .toArray();
    
    if (!users || users.length === 0) {
      await reply('📊 *No users found in the economy system yet.*');
      return;
    }
    
    // Calculate total wealth and sort properly
    const rankedUsers = users
      .map(user => ({
        userId: user.userId,
        balance: user.balance || 0,
        bank: user.bank || 0,
        totalWealth: (user.balance || 0) + (user.bank || 0),
        attendances: user.totalAttendances || 0,
        streak: user.streak || 0
      }))
      .filter(user => user.totalWealth > 0) // Only show users with money
      .sort((a, b) => b.totalWealth - a.totalWealth) // Sort by total wealth (highest first)
      .slice(0, 10); // Get top 10
    
    if (rankedUsers.length === 0) {
      await reply('📊 *No users with money found yet. Start earning to appear on the leaderboard!*');
      return;
    }
    
    // Build leaderboard message
    let leaderboardText = '🏆 *TOP 10 RICHEST USERS* 🏆\n\n';
    
    rankedUsers.forEach((user, index) => {
      const position = index + 1;
      const emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
      const userName = user.userId.split('@')[0];
      
      leaderboardText += `${emoji} *@${userName}*\n`;
      leaderboardText += `   💰 Total: ${ecoSettings.currency}${user.totalWealth.toLocaleString()}\n`;
      leaderboardText += `   💵 Wallet: ${ecoSettings.currency}${user.balance.toLocaleString()} | 🏦 Bank: ${ecoSettings.currency}${user.bank.toLocaleString()}\n`;
      leaderboardText += `   📋 Attendance: ${user.attendances} | 🔥 Streak: ${user.streak}\n\n`;
    });
    
    leaderboardText += `📊 *Total Users:* ${rankedUsers.length}/${users.length}\n`;
    leaderboardText += `⏰ *Updated:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm')}`;
    
    // Send with mentions
    const mentionedUsers = rankedUsers.map(user => user.userId);
    
    await sock.sendMessage(from, {
      text: leaderboardText,
      mentions: mentionedUsers
    });
    
  } catch (error) {
    await reply('❌ *Error loading leaderboard. Please try again.*');
    console.error('Leaderboard error:', error);
  }
}
