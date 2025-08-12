import { getContentType, downloadContentFromMessage } from '@whiskeysockets/baileys';

// Decode JID (WhatsApp ID) with null safety
export function decodeJid(jid) {
  if (!jid) return jid;
  if (typeof jid !== 'string') return jid;
  
  try {
    if (/:\d+@/gi.test(jid)) {
      const [user, server] = jid.split('@');
      if (!user || !server) return jid;
      return user.split(':')[0] + '@' + server;
    } else {
      return jid;
    }
  } catch (error) {
    console.warn('Error decoding JID:', error.message);
    return jid;
  }
}

// Helper function to safely download media
async function safeDownloadMedia(message) {
  try {
    if (!message) return null;
    
    let type = getContentType(message);
    if (!type) return null;
    
    let messageContent = message[type];
    if (!messageContent) return null;
    
    // Handle special message types
    if (type === "buttonsMessage" || type === "viewOnceMessageV2") {
      if (type === "viewOnceMessageV2") {
        messageContent = message.viewOnceMessageV2?.message;
        type = getContentType(messageContent);
      } else {
        const keys = Object.keys(messageContent || {});
        type = keys[1] || keys[0];
      }
      
      if (!type || !messageContent) return null;
      messageContent = messageContent[type];
    }
    
    if (!messageContent || typeof type !== 'string') return null;
    
    const stream = await downloadContentFromMessage(messageContent, type.replace("Message", ""));
    let buffer = Buffer.from([]);
    
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    
    return buffer;
  } catch (error) {
    console.warn('Failed to download media:', error.message);
    return null;
  }
}

// FIXED: Serialize message object with comprehensive null safety
export function serializeMessage(m, sock) {
  // Initialize basic properties with defaults
  m.id = m.key?.id || '';
  m.isSelf = m.key?.fromMe || false;
  m.from = decodeJid(m.key?.remoteJid) || '';
  m.isGroup = m.from?.endsWith('@g.us') || false;
  
  // FIXED: Safe sender extraction with comprehensive null checks
  if (m.isGroup) {
    m.sender = decodeJid(m.key?.participant) || '';
  } else if (m.isSelf) {
    m.sender = decodeJid(sock.user?.id) || '';
  } else {
    m.sender = m.from || '';
  }

  // Initialize message body with default empty string
  m.body = '';
  m.type = 'unknown';
  m.mentions = [];
  m.quoted = null;

  if (m.message) {
    try {
      m.type = getContentType(m.message) || 'unknown';
      
      // Handle ephemeral messages
      if (m.type === 'ephemeralMessage' && m.message[m.type]?.message) {
        m.message = m.message[m.type].message;
        m.type = getContentType(m.message) || 'unknown';
      }
      
      // Handle view once messages
      if (m.type === 'viewOnceMessageV2' && m.message[m.type]?.message) {
        m.message = m.message[m.type].message;
        m.type = getContentType(m.message) || 'unknown';
      }

      // FIXED: Safe quoted message extraction
      try {
        const quoted = m.message[m.type]?.contextInfo;
        if (quoted?.quotedMessage) {
          const quotedType = getContentType(quoted.quotedMessage);
          m.quoted = {
            id: quoted.stanzaId || '',
            sender: decodeJid(quoted.participant) || '',
            message: quoted.quotedMessage,
            type: quotedType || 'unknown',
            text: ''
          };
          
          // FIXED: Safe quoted message text extraction
          if (quotedType && m.quoted.message[quotedType]) {
            m.quoted.text = m.quoted.message[quotedType]?.text ||
                           m.quoted.message[quotedType]?.caption ||
                           m.quoted.message?.conversation || '';
          }
          
          // Ensure text is always a string
          if (typeof m.quoted.text !== 'string') {
            m.quoted.text = '';
          }
          
          // Add download method to quoted
          m.quoted.download = async () => {
            return await safeDownloadMedia(m.quoted.message);
          };
        }
      } catch (error) {
        console.warn('Error processing quoted message:', error.message);
        m.quoted = null;
      }

      // FIXED: Safe message body/text extraction with comprehensive checks
      try {
        let extractedBody = '';
        
        if (m.message?.conversation) {
          extractedBody = m.message.conversation;
        } else if (m.type && m.message[m.type]) {
          extractedBody = m.message[m.type]?.text ||
                         m.message[m.type]?.caption ||
                         '';
        } else if (m.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
          extractedBody = m.message.listResponseMessage.singleSelectReply.selectedRowId;
        } else if (m.message?.buttonsResponseMessage?.selectedButtonId) {
          extractedBody = m.message.buttonsResponseMessage.selectedButtonId;
        } else if (m.message?.templateButtonReplyMessage?.selectedId) {
          extractedBody = m.message.templateButtonReplyMessage.selectedId;
        }
        
        // Ensure body is always a string and safely process it
        if (typeof extractedBody === 'string') {
          m.body = extractedBody.trim();
        } else if (extractedBody !== null && extractedBody !== undefined) {
          m.body = String(extractedBody).trim();
        } else {
          m.body = '';
        }
      } catch (error) {
        console.warn('Error extracting message body:', error.message);
        m.body = '';
      }

      // FIXED: Safe mentions extraction
      try {
        m.mentions = m.message?.[m.type]?.contextInfo?.mentionedJid || [];
        if (!Array.isArray(m.mentions)) {
          m.mentions = [];
        }
        if (m.quoted?.sender) {
          m.mentions.push(m.quoted.sender);
        }
      } catch (error) {
        console.warn('Error extracting mentions:', error.message);
        m.mentions = [];
      }
      
    } catch (error) {
      console.warn('Error processing message content:', error.message);
      m.type = 'unknown';
      m.body = '';
      m.mentions = [];
      m.quoted = null;
    }
  }

  // FIXED: Helper methods with enhanced error handling
  m.reply = async (text, options = {}) => {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Reply text must be a valid string');
      }
      return await sock.sendMessage(m.from, { text, ...options }, { quoted: m });
    } catch (error) {
      console.error('Failed to send reply:', error.message);
      throw error;
    }
  };
  
  m.react = async (emoji) => {
    try {
      if (!emoji || typeof emoji !== 'string') {
        throw new Error('Emoji must be a valid string');
      }
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
    return await safeDownloadMedia(m.message);
  };

  // Check if message has media
  m.hasMedia = () => {
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    return m.type && mediaTypes.includes(m.type);
  };

  // FIXED: Get sender name with null safety
  m.getName = async () => {
    try {
      if (!m.sender || typeof m.sender !== 'string') {
        return 'Unknown';
      }
      const name = await sock.getName(m.sender);
      return name || m.sender.split('@')[0] || 'Unknown';
    } catch {
      return m.sender?.split('@')[0] || 'Unknown';
    }
  };

  // FIXED: Check if sender is group admin with comprehensive error handling
  m.isAdmin = async () => {
    if (!m.isGroup || !m.sender) return false;
    try {
      const metadata = await sock.groupMetadata(m.from);
      if (!metadata?.participants || !Array.isArray(metadata.participants)) {
        return false;
      }
      const participant = metadata.participants.find(p => p.id === m.sender);
      return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
      console.warn('Failed to check admin status:', error.message);
      return false;
    }
  };

  // FIXED: Check if bot is group admin with enhanced error handling
  m.isBotAdmin = async () => {
    if (!m.isGroup) return false;
    try {
      const metadata = await sock.groupMetadata(m.from);
      if (!metadata?.participants || !Array.isArray(metadata.participants)) {
        return false;
      }
      const botId = decodeJid(sock.user?.id);
      if (!botId) return false;
      
      const participant = metadata.participants.find(p => p.id === botId);
      return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
      console.warn('Failed to check bot admin status:', error.message);
      return false;
    }
  };

  return m;
}

// FIXED: Additional helper functions with null safety
export const MessageHelpers = {
  // Format file size
  formatSize: (bytes) => {
    if (typeof bytes !== 'number' || bytes < 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  // Get media info with null safety
  getMediaInfo: (message) => {
    if (!message) return null;
    
    try {
      const type = getContentType(message);
      if (!type) return null;
      
      const media = message[type];
      if (!media) return null;
      
      return {
        type: type.replace('Message', ''),
        mimetype: media.mimetype || '',
        filesize: media.fileLength || 0,
        width: media.width || 0,
        height: media.height || 0,
        duration: media.seconds || 0
      };
    } catch (error) {
      console.warn('Error getting media info:', error.message);
      return null;
    }
  },

  // Check if URL is valid
  isUrl: (string) => {
    if (!string || typeof string !== 'string') return false;
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  },

  // Extract URLs from text with null safety
  extractUrls: (text) => {
    if (!text || typeof text !== 'string') return [];
    try {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      return text.match(urlRegex) || [];
    } catch (error) {
      console.warn('Error extracting URLs:', error.message);
      return [];
    }
  }
};
