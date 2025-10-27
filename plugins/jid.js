// plugins/jid_plugin.js
// This plugin helps you find the JID (WhatsApp ID) of users and groups.

export default {
  name: 'JID Utility',
  version: '1.0.0',
  author: 'Your Bot',
  description: 'Gets the JID of the current chat, a mentioned user, or all groups.',
  category: 'utility',

  commands: ['jid'],
  aliases: ['getid'],

  async run(context) {
    const { msg: m, args, sock, logger, helpers, config } = context;
    const { PermissionHelpers } = helpers;

    try {
      const chatId = m.key.remoteJid;
      const isGroup = chatId.endsWith('@g.us');
      const senderId = m.key.participant || m.key.remoteJid;

      // 1. Handle `.jid groups` (Owner only)
      if (args[0]?.toLowerCase() === 'groups') {
        const isOwner = PermissionHelpers.isOwner(senderId, config.OWNER_NUMBER + '@s.whatsapp.net');
        if (!isOwner) {
          return m.reply('🔒 This feature is for the bot owner only.');
        }

        await m.reply('Fetching all group chats... this may take a moment.');

        const groups = await sock.groupFetchAllParticipating();
        let groupList = '🤖 *Bot is in the following groups:*\n\n';

        Object.values(groups).forEach((group, index) => {
          groupList += `${index + 1}. *${group.subject}*\n   - ${group.id}\n\n`;
        });

        return m.reply(groupList);
      }

      // 2. Handle `.jid @mention`
      const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (mentionedJid) {
        return m.reply(`👤 *Mentioned User's JID:*\n${mentionedJid}`);
      }

      // 3. Handle `.jid` (replying to a message)
      // Note: 'participant' is the JID of the *original sender* of the quoted message
      const quotedJid = m.message?.extendedTextMessage?.contextInfo?.participant;
      if (quotedJid) {
        return m.reply(`🗨️ *Quoted User's JID:*\n${quotedJid}`);
      }

      // 4. Handle `.jid` in a group (no mention/reply)
      if (isGroup) {
        return m.reply(`👥 *Current Group's JID:*\n${chatId}`);
      }

      // 5. Handle `.jid` in a DM (no mention/reply)
      if (!isGroup) {
        return m.reply(`👤 *Your JID:*\n${chatId}`);
      }

    } catch (error) {
      logger.error('Error in JID plugin:', error);
      m.reply('❌ An error occurred while trying to get the JID.');
    }
  }
};
