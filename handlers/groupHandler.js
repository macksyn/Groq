import chalk from 'chalk';
import moment from 'moment-timezone';

export default async function GroupHandler(sock, groupUpdate, config) {
  try {
    // Normalize input: accept a single update object or an array of updates
    const updates = Array.isArray(groupUpdate) ? groupUpdate : [groupUpdate];

    for (const update of updates) {
      const { id, participants, action } = update || {};
      
      if (!config.WELCOME || !participants) continue;
      
      try {
        // Get group metadata
        const metadata = await sock.groupMetadata(id);
        const groupName = metadata.subject;
        const membersCount = metadata.participants.length;
        
        for (const jid of participants) {
          const userName = jid.split('@')[0];
          const time = moment().tz('Africa/Lagos').format('HH:mm:ss');
          const date = moment().tz('Africa/Lagos').format('DD/MM/YYYY');
          
          // Get user profile picture
          let profilePic;
          try {
            profilePic = await sock.profilePictureUrl(jid, 'image');
          } catch {
            profilePic = 'https://i.ibb.co/fqvKZrP/ppdefault.jpg'; // Default avatar
          }
          
          if (action === 'add') {
            const welcomeMsg = `╭─────────────────────╮
│     🎉 WELCOME! 🎉     │
╰─────────────────────╯

👋 Hello @${userName}!

🏷️ *Group:* ${groupName}
👥 *Members:* ${membersCount}
📅 *Date:* ${date}
🕐 *Time:* ${time}

🌟 *Welcome to our community!*
Please read the group description and follow the rules.

📋 *Quick Commands:*
• ${config.PREFIX}menu - Show bot commands
• ${config.PREFIX}rules - Group rules
• ${config.PREFIX}help - Get help

Enjoy your stay! 🎈

╭─────────────────────╮
│   Powered by ${config.BOT_NAME}   │
╰─────────────────────╯`;

            await sock.sendMessage(id, {
              image: { url: profilePic },
              caption: welcomeMsg,
              mentions: [jid],
              contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                  title: '🎊 New Member Joined!',
                  body: `Welcome to ${groupName}`,
                  thumbnailUrl: profilePic,
                  mediaType: 1,
                  renderLargerThumbnail: true,
                  sourceUrl: 'https://github.com/WhiskeySockets/Baileys'
                }
              }
            });
            
            console.log(chalk.green(`👋 Welcomed ${userName} to ${groupName}`));
          }
          
          if (action === 'remove') {
            const goodbyeMsg = `╭─────────────────────╮
│     👋 GOODBYE! 👋     │
╰─────────────────────╯

💔 @${userName} left the group

🏷️ *Group:* ${groupName}
👥 *Members:* ${membersCount}
📅 *Date:* ${date}
🕐 *Time:* ${time}

😢 We're sad to see you go!
You're always welcome back.

Take care! 🌟

╭─────────────────────╮
│   Powered by ${config.BOT_NAME}   │
╰─────────────────────╯`;

            await sock.sendMessage(id, {
              image: { url: profilePic },
              caption: goodbyeMsg,
              mentions: [jid],
              contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                  title: '💔 Member Left',
                  body: `Goodbye from ${groupName}`,
                  thumbnailUrl: profilePic,
                  mediaType: 1,
                  renderLargerThumbnail: true,
                  sourceUrl: 'https://github.com/WhiskeySockets/Baileys'
                }
              }
            });
            
            console.log(chalk.yellow(`👋 Said goodbye to ${userName} from ${groupName}`));
          }
        }
        
      } catch (error) {
        console.log(chalk.red(`❌ Group handler error for group ${id}:`), error.message);
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Group handler error:'), error.message);
  }
}
