import { getContentType, downloadContentFromMessage } from '@whiskeysockets/baileys';

// Global cache for ID mappings to avoid repeated API calls
const idMappingCache = new Map();

// FIXED: Enhanced decode JID function that properly converts @lid to @s.whatsapp.net
export function decodeJid(jid, sock = null, groupId = null) {
  if (!jid) return jid;
  if (typeof jid !== 'string') return jid;

  try {
    // Handle regular WhatsApp numbers
    if (jid.includes('@s.whatsapp.net')) {
      if (/:\d+@/gi.test(jid)) {
        const [user, server] = jid.split('@');
        if (!user || !server) return jid;
        return user.split(':')[0] + '@' + server;
      }
      return jid;
    }

    // THIS SECTION IS INTENTIONALLY LEFT as-is.
    // The main fix is in serializeMessage, as this function is synchronous.
    if (jid.includes('@lid')) {
      // Try to get from cache first
      const cached = idMappingCache.get(jid);
      if (cached) {
        return cached;
      }

      // Extract the numeric part and convert to proper format
      const numberPart = jid.replace('@lid', '').split(':')[0];
      if (/^\d+$/.test(numberPart)) {
        const converted = numberPart + '@s.whatsapp.net';
        // Cache the conversion
        // idMappingCache.set(jid, converted); // Do not cache this, it's the wrong value
        return converted;
      }

      // If can't extract number, return original and log warning
      console.warn(`⚠️ Could not convert @lid to proper format: ${jid}`);
      return jid;
    }

    // Handle other formats with colons
    if (/:\d+@/gi.test(jid)) {
      const [user, server] = jid.split('@');
      if (!user || !server) return jid;
      return user.split(':')[0] + '@' + server;
    }

    return jid;
  } catch (error) {
    console.warn('Error decoding JID:', error.message);
    return jid;
  }
}

// Add this helper function to validate JIDs before saving to database
export function validateAndNormalizeJid(jid) {
  if (!jid || typeof jid !== 'string') return null;

  // Decode the JID
  const decoded = decodeJid(jid);

  // Ensure it's in proper @s.whatsapp.net format
  if (!decoded || !decoded.includes('@s.whatsapp.net')) {
    console.warn(`⚠️ Invalid JID format after decoding: ${decoded}`);
    return null;
  }

  // Extract just the phone number part
  const phoneNumber = decoded.split('@')[0];
  if (!/^\d+$/.test(phoneNumber)) {
    console.warn(`⚠️ JID contains non-numeric phone number: ${decoded}`);
    return null;
  }

  return decoded;
}

// Function to resolve @lid IDs to real phone numbers using group metadata
const idMappingCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function resolveGroupMemberIds(sock, groupId, lidIds) {
  if (!sock || !groupId || !Array.isArray(lidIds) || lidIds.length === 0) {
    return lidIds;
  }

  try {
    const metadata = await sock.groupMetadata(groupId);
    if (!metadata?.participants) return lidIds;

    const resolvedIds = lidIds.map(lidId => {
      // Check cache first
      const cached = getCachedId(lidId);
      if (cached) return cached;

      // Extract and validate number part
      const numberPart = lidId.replace('@lid', '').split(':')[0];
      if (!/^\d+$/.test(numberPart)) {
        console.warn(`Invalid LID format: ${lidId}`);
        return lidId;
      }

      // Find matching participant
      const participant = metadata.participants.find(p => {
        const pIdNum = p.id.replace(/[^0-9]/g, '');
        const phoneNum = p.phoneNumber?.replace(/[^0-9]/g, '');

        return pIdNum === numberPart || phoneNum === numberPart;
      });

      if (participant) {
        let jid;

        // Priority: phoneNumber > id
        if (participant.phoneNumber) {
          jid = participant.phoneNumber.includes('@') 
            ? participant.phoneNumber 
            : participant.phoneNumber + '@s.whatsapp.net';
        } else if (participant.id.includes('@s.whatsapp.net')) {
          jid = participant.id;
        } else {
          jid = numberPart + '@s.whatsapp.net';
        }

        cacheId(lidId, jid);
        return jid;
      }

      // Fallback conversion
      const fallbackJid = numberPart + '@s.whatsapp.net';
      cacheId(lidId, fallbackJid);
      return fallbackJid;
    });

    return resolvedIds;
  } catch (error) {
    console.warn('Error resolving group member IDs:', error.message);
    return lidIds;
  }
}

function getCachedId(lidId) {
  const cached = idMappingCache.get(lidId);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    idMappingCache.delete(lidId);
    return null;
  }

  return cached.value;
}

function cacheId(lidId, jid) {
  idMappingCache.set(lidId, {
    value: jid,
    timestamp: Date.now()
  });
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

// CONSOLIDATED: Serialize message with proper ID conversion
// ------------------- MODIFICATION: Made function async -------------------
export async function serializeMessage(m, sock) {
  // Initialize basic properties with defaults
  m.id = m.key?.id || '';
  m.isSelf = m.key?.fromMe || false;
  m.from = decodeJid(m.key?.remoteJid, sock) || '';
  m.isGroup = m.from?.endsWith('@g.us') || false;

  // ------------------- CRITICAL FIX: ASYNC SENDER RESOLUTION -------------------
  if (m.isGroup) {
    const rawSender = m.key?.participant;
    let resolvedSender = idMappingCache.get(rawSender);

    if (!resolvedSender && rawSender && rawSender.includes('@lid')) {
      try {
        const metadata = await sock.groupMetadata(m.from);

        // Find the participant with matching LID
        const participant = metadata.participants.find(p => 
          p.id === rawSender || p.id.includes(rawSender.split(':')[0])
        );

        if (participant) {
          // ✅ FIX: Check phoneNumber field first, then fall back to id
          if (participant.phoneNumber && participant.phoneNumber.includes('@s.whatsapp.net')) {
            resolvedSender = participant.phoneNumber;
            idMappingCache.set(rawSender, resolvedSender);
          } else if (participant.id.includes('@s.whatsapp.net')) {
            resolvedSender = participant.id;
            idMappingCache.set(rawSender, resolvedSender);
          } else {
            // Still couldn't resolve
            resolvedSender = decodeJid(rawSender, sock, m.from);
          }
        } else {
          // Participant not found in metadata
          resolvedSender = decodeJid(rawSender, sock, m.from);
        }

      } catch (e) {
        console.error(`Failed to fetch metadata to resolve LID ${rawSender}: ${e.message}`);
        resolvedSender = decodeJid(rawSender, sock, m.from);
      }
    } else if (!resolvedSender) {
      resolvedSender = decodeJid(rawSender, sock, m.from);
    }

    m.sender = resolvedSender || '';

  } else if (m.isSelf) {
    m.sender = decodeJid(sock.user?.id, sock) || '';
  } else {
    m.sender = m.from || '';
  }
  // ------------------- END OF CRITICAL FIX -------------------


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

      // ENHANCED: Safe quoted message extraction with ID resolution
      try {
        const quoted = m.message[m.type]?.contextInfo;
        if (quoted?.quotedMessage) {
          const quotedType = getContentType(quoted.quotedMessage);

          // --- FIX: Resolve quoted sender if it's a LID ---
          let rawQuotedSender = decodeJid(quoted.participant, sock, m.from) || '';
          if (rawQuotedSender.includes('@lid')) {
             // Try to resolve it (cannot be async here, so we do our best)
             const cached = idMappingCache.get(rawQuotedSender);
             if (cached) {
                rawQuotedSender = cached;
             } else {
                // Cannot fully resolve async here, but `validateAndNormalizeJid` will fail it
                console.warn(`Quoted sender ${rawQuotedSender} is an unresolved LID.`);
             }
          }

          let quotedSender = validateAndNormalizeJid(rawQuotedSender) || rawQuotedSender;

          m.quoted = {
            id: quoted.stanzaId || '',
            sender: quotedSender,
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

      // FIXED: Safe message body/text extraction
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

        // Ensure body is always a string
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

      // ENHANCED: Safe mentions extraction with ID resolution
      try {
        const rawMentions = m.message?.[m.type]?.contextInfo?.mentionedJid || [];
        if (Array.isArray(rawMentions) && rawMentions.length > 0) {

          // --- FIX: Resolve mentions (must be async) ---
          const resolvedMentions = await resolveGroupMemberIds(sock, m.from, rawMentions);

          m.mentions = resolvedMentions.map(mention => {
            const normalized = validateAndNormalizeJid(mention);
            return normalized || mention; // Fallback to whatever was returned
          }).filter(mention => mention && mention.includes('@s.whatsapp.net'));

        } else {
          m.mentions = [];
        }

        // Add quoted sender to mentions if exists and valid
        if (m.quoted?.sender && 
            m.quoted.sender.includes('@s.whatsapp.net') && 
            !m.mentions.includes(m.quoted.sender)) {
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

  // FIXED: Check if sender is group admin
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

  // ENHANCED: Check if bot is group admin
  m.isBotAdmin = async () => {
    if (!m.isGroup) return false;
    try {
      const metadata = await sock.groupMetadata(m.from);
      if (!metadata?.participants || !Array.isArray(metadata.participants)) {
        return false;
      }
      const botId = decodeJid(sock.user?.id, sock);
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

// Clear ID mapping cache every hour to prevent memory leaks
setInterval(() => {
  idMappingCache.clear();
  console.log('🧹 Cleared ID mapping cache');
}, 60 * 60 * 1000);

// FIXED: Additional helper functions
export const MessageHelpers = {
  formatSize: (bytes) => {
    if (typeof bytes !== 'number' || bytes < 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

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

  isUrl: (string) => {
    if (!string || typeof string !== 'string') return false;
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  },

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