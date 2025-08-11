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
  
  // Add null/undefined checks
  if (!type || !m) {
    throw new Error('Invalid message structure - no content type found');
  }
  
  if (type === "buttonsMessage" || type === "viewOnceMessageV2") {
    if (type === "viewOnceMessageV2") {
      m = message.viewOnceMessageV2?.message;
      type = Object.keys(m || {})[0];
    } else {
      type = Object.keys(m || {})[1];
    }
    m = m?.[type];
    
    // Check again after extraction
    if (!type || !m) {
      throw new Error('Invalid nested message structure');
    }
  }
  
  // Ensure type is a string before calling replace
  if (typeof type !== 'string') {
    throw new Error(`Invalid message type: ${type}`);
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
    m.isGroup = m.from?.endsWith('@g.us') || false;
    m.sender = m.isGroup 
      ? decodeJid(m.key.participant) 
      : m.isSelf 
      ? decodeJid(sock.user?.id) 
      : m.from;
  }

  if (m.message) {
    m.type = getContentType(m.message);
    
    // Add null check for type
    if (!m.type) {
      console.warn('No content type found for message:', m.message);
      m.type = 'unknown';
    }
    
    // Handle ephemeral messages
    if (m.type === 'ephemeralMessage') {
      m.message = m.message[m.type]?.message;
      m.type = getContentType(m.message) || 'unknown';
    }
    
    // Handle view once messages
    if (m.type === 'viewOnceMessageV2') {
      m.message = m.message[m.type]?.message;
      m.type = getContentType(m.message) || 'unknown';
    }

    // Extract quoted message
    try {
      const quoted = m.message[m.type]?.contextInfo;
      if (quoted?.quotedMessage) {
        const quotedType = getContentType(quoted.quotedMessage);
        m.quoted = {
          id: quoted.stanzaId,
          sender: decodeJid(quoted.participant),
          message: quoted.quotedMessage,
          type: quotedType || 'unknown'
        };
        
        // Add quoted message text
        if (quotedType) {
          m.quoted.text = m.quoted.message[quotedType]?.text ||
                         m.quoted.message[quotedType]?.caption ||
                         m.quoted.message?.conversation || '';
        } else {
          m.quoted.text = '';
        }
        
        // Add download method to quoted with error handling
        m.quoted.download = async () => {
          try {
            return await downloadMedia(m.quoted.message);
          } catch (error) {
            console.warn('Failed to download quoted media:', error.message);
            return null;
          }
        };
      }
    } catch (error) {
      console.warn('Error processing quoted message:', error.message);
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
    try {
      return await sock.sendMessage(m.from, { text, ...options }, { quoted: m });
    } catch (error) {
      console.error('Failed to send reply:', error.message);
      throw error;
    }
  };
  
  m.react = async (emoji) => {
    try {
      return await sock.sendMessage(m.from, {
        react: { text: emoji, key: m.key }
      });
    } catch (error) {
      console.error('Failed to send reaction:', error.message);
      throw error;
    }
  };

  m.download = async () => {
    if (!m.message) return null;
    try {
      return await downloadMedia(m.message);
    } catch (error) {
      console.warn('Failed to download media:', error.message);
      return null;
    }
  };

  // Check if message has media
  m.hasMedia = () => {
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    return m.type && mediaTypes.includes(m.type);
  };

  // Get sender name
  m.getName = async () => {
    try {
      return await sock.getName(m.sender);
    } catch {
      return m.sender?.split('@')[0] || 'Unknown';
    }
  };

  // Check if sender is group admin
  m.isAdmin = async () => {
    if (!m.isGroup) return false;
    try {
      const metadata = await sock.groupMetadata(m.from);
      const participant = metadata.participants?.find(p => p.id === m.sender);
      return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
      console.warn('Failed to check admin status:', error.message);
      return false;
    }
  };

  // Check if bot is group admin
  m.isBotAdmin = async () => {
    if (!m.isGroup) return false;
    try {
      const metadata = await sock.groupMetadata(m.from);
      const botId = decodeJid(sock.user?.id);
      const participant = metadata.participants?.find(p => p.id === botId);
      return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
      console.warn('Failed to check bot admin status:', error.message);
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
    if (!type) return null;
    
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
    if (!text || typeof text !== 'string') return [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
  }
};
