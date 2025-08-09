import { getContentType, downloadContentFromMessage } from '@whiskeysockets/baileys';

// Decode JID (WhatsApp ID)
export function decodeJid(jid) {
  if (!jid) return jid;
  if (/:\d+@/gi.test(jid)) {
    const [user, server] = jid.split('@');
    return user.split(':')[0] + '@' + server;
  } else {
    return jid;
  }
}

// Download media from message
export async function downloadMedia(message) {
  let type = Object.keys(message)[0];
  let m = message[type];
  
  if (type === "buttonsMessage" || type === "viewOnceMessageV2") {
    if (type === "viewOnceMessageV2") {
      m = message.viewOnceMessageV2?.message;
      type = Object.keys(m || {})[0];
    } else {
      type = Object.keys(m || {})[1];
    }
    m = m[type];
  }
  
  const stream = await downloadContentFromMessage(m, type.replace("Message", ""));
  let buffer = Buffer.from([]);
  
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  
  return buffer;
}

// Serialize message object with helper methods
export function serializeMessage(m, sock) {
  // Basic message properties
  if (m.key) {
    m.id = m.key.id;
    m.isSelf = m.key.fromMe;
    m.from = decodeJid(m.key.remoteJid);
    m.isGroup = m.from.endsWith('@g.us');
    m.sender = m.isGroup 
      ? decodeJid(m.key.participant) 
      : m.isSelf 
      ? decodeJid(sock.user.id) 
      : m.from;
  }

  if (m.message) {
    m.type = getContentType(m.message);
    
    // Handle ephemeral messages
    if (m.type === 'ephemeralMessage') {
      m.message = m.message[m.type].message;
      m.type = getContentType(m.message);
    }
    
    // Handle view once messages
    if (m.type === 'viewOnceMessageV2') {
      m.message = m.message[m.type].message;
      m.type = getContentType(m.message);
    }

    // Extract quoted message
    try {
      const quoted = m.message[m.type]?.contextInfo;
      if (quoted?.quotedMessage) {
        m.quoted = {
          id: quoted.stanzaId,
          sender: decodeJid(quoted.participant),
          message: quoted.quotedMessage,
          type: getContentType(quoted.quotedMessage)
        };
        
        // Add quoted message text
        const quotedType = m.quoted.type;
        m.quoted.text = m.quoted.message[quotedType]?.text ||
                       m.quoted.message[quotedType]?.caption ||
                       m.quoted.message?.conversation || '';
        
        // Add download method to quoted
        m.quoted.download = () => downloadMedia(m.quoted.message);
      }
    } catch {
      m.quoted = null;
    }

    // Extract message body/text
    m.body = m.message?.conversation ||
             m.message?.[m.type]?.text ||
             m.message?.[m.type]?.caption ||
             m.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
             m.message?.buttonsResponseMessage?.selectedButtonId ||
             m.message?.templateButtonReplyMessage?.selectedId ||
             '';

    // Extract mentions
    m.mentions = m.message?.[m.type]?.contextInfo?.mentionedJid || [];
    if (m.quoted?.sender) m.mentions.push(m.quoted.sender);
  }

  // Helper methods
  m.reply = async (text, options = {}) => {
    return await sock.sendMessage(m.from, { text, ...options }, { quoted: m });
  };
  
  m.react = async (emoji) => {
    return await sock.sendMessage(m.from, {
      react: { text: emoji, key: m.key }
    });
  };

  m.download = async () => {
    if (!m.message) return null;
    return await downloadMedia(m.message);
  };

  // Check if message has media
  m.hasMedia = () => {
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    return mediaTypes.includes(m.type);
  };

  // Get sender name
  m.getName = async () => {
    try {
      return await sock.getName(m.sender);
    } catch {
      return m.sender.split('@')[0];
    }
  };

  // Check if sender is group admin
  m.isAdmin = async () => {
    if (!m.isGroup) return false;
    try {
      const metadata = await sock.groupMetadata(m.from);
      const participant = metadata.participants.find(p => p.id === m.sender);
      return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch {
      return false;
    }
  };

  // Check if bot is group admin
  m.isBotAdmin = async () => {
    if (!m.isGroup) return false;
    try {
      const metadata = await sock.groupMetadata(m.from);
      const botId = decodeJid(sock.user.id);
      const participant = metadata.participants.find(p => p.id === botId);
      return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch {
      return false;
    }
  };

  return m;
}

// Additional helper functions
export const MessageHelpers = {
  // Format file size
  formatSize: (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  // Get media info
  getMediaInfo: (message) => {
    const type = getContentType(message);
    const media = message[type];
    
    return {
      type: type.replace('Message', ''),
      mimetype: media?.mimetype || '',
      filesize: media?.fileLength || 0,
      width: media?.width || 0,
      height: media?.height || 0,
      duration: media?.seconds || 0
    };
  },

  // Check if URL is valid
  isUrl: (string) => {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  },

  // Extract URLs from text
  extractUrls: (text) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
  }
};
