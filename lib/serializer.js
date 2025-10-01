import { getContentType, downloadContentFromMessage } from '@whiskeysockets/baileys';
import chalk from 'chalk';

// Global cache for ID mappings to avoid repeated API calls
const idMappingCache = new Map();

// ENHANCED: Better decode JID function with comprehensive logging
export function decodeJid(jid, sock = null, groupId = null) {
  if (!jid) return jid;
  if (typeof jid !== 'string') return jid;
  
  try {
    // Handle @lid format - these are internal WhatsApp identifiers
    if (jid.includes('@lid')) {
      console.log(chalk.yellow('⚠️ Found @lid format:'), jid);
      
      // Check cache first
      const cached = idMappingCache.get(jid);
      if (cached) {
        console.log(chalk.green('✓ Using cached mapping:'), cached);
        return cached;
      }
      
      // @lid format needs to be resolved through group metadata
      // For now, return as-is and let resolveGroupMemberIds handle it
      return jid;
    }
    
    // Handle regular WhatsApp numbers with device info (e.g., 2348089782988:42@s.whatsapp.net)
    if (jid.includes('@s.whatsapp.net')) {
      if (/:\d+@/gi.test(jid)) {
        // Extract just the phone number before the colon
        const [user, server] = jid.split('@');
        if (!user || !server) return jid;
        const phoneNumber = user.split(':')[0];
        const cleanJid = phoneNumber + '@' + server;
        console.log(chalk.cyan('📞 Cleaned JID:'), jid, '->', cleanJid);
        return cleanJid;
      }
      return jid;
    }
    
    // Handle @c.us format (old WhatsApp format)
    if (jid.includes('@c.us')) {
      if (/:\d+@/gi.test(jid)) {
        const [user, server] = jid.split('@');
        if (!user || !server) return jid;
        const phoneNumber = user.split(':')[0];
        return phoneNumber + '@' + server;
      }
      return jid;
    }
    
    // Handle other formats with device identifiers
    if (/:\d+@/gi.test(jid)) {
      const [user, server] = jid.split('@');
      if (!user || !server) return jid;
      const phoneNumber = user.split(':')[0];
      return phoneNumber + '@' + server;
    }
    
    return jid;
  } catch (error) {
    console.warn(chalk.red('Error decoding JID:'), error.message);
    return jid;
  }
}

// Function to resolve @lid IDs to real phone numbers using group metadata
async function resolveGroupMemberIds(sock, groupId, lidIds) {
  if (!sock || !groupId || !Array.isArray(lidIds) || lidIds.length === 0) {
    return lidIds;
  }
  
  try {
    // Get group metadata
    const metadata = await sock.groupMetadata(groupId);
    if (!metadata?.participants) return lidIds;
    
    console.log(chalk.magenta('🔍 Resolving @lid IDs in group:'), groupId);
    
    // Create mapping from participant data
    const resolvedIds = lidIds.map(lidId => {
      // Check cache first
      const cached = idMappingCache.get(lidId);
      if (cached) {
        console.log(chalk.green('✓ Cache hit for:'), lidId, '->', cached);
        return cached;
      }
      
      // Try to find the real phone number in participants
      const participant = metadata.participants.find(p => {
        const lidNumber = lidId.replace('@lid', '');
        return p.id.includes(lidNumber) || p.id === lidId;
      });
      
      if (participant && participant.id.includes('@s.whatsapp.net')) {
        const cleanId = decodeJid(participant.id, sock);
        idMappingCache.set(lidId, cleanId);
        console.log(chalk.green('✓ Resolved @lid:'), lidId, '->', cleanId);
        return cleanId;
      }
      
      // Fallback: Try to convert @lid to @s.whatsapp.net format
      const numberPart = lidId.replace('@lid', '');
      if (/^\d+$/.test(numberPart)) {
        const converted = numberPart + '@s.whatsapp.net';
        idMappingCache.set(lidId, converted);
        console.log(chalk.yellow('⚠️ Converted @lid:'), lidId, '->', converted);
        return converted;
      }
      
      console.log(chalk.red('❌ Could not resolve @lid:'), lidId);
      return lidId; // Return original if we can't resolve
    });
    
    return resolvedIds;
  } catch (error) {
    console.warn(chalk.red('Error resolving group member IDs:'), error.message);
    return lidIds;
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
    console.warn(chalk.yellow('Failed to download media:'), error.message);
    return null;
  }
}

// ENHANCED: Serialize message object with better JID handling and logging
export function serializeMessage(m, sock) {
  // Initialize basic properties with defaults
  m.id = m.key?.id || '';
  m.isSelf = m.key?.fromMe || false;
  m.from = decodeJid(m.key?.remoteJid, sock) || '';
  m.isGroup = m.from?.endsWith('@g.us') || false;
  
  // ENHANCED: Better sender extraction with comprehensive logging
  if (m.isGroup) {
    const rawParticipant = m.key?.participant;
    console.log(chalk.magenta('🔍 GROUP MESSAGE - Raw participant:'), rawParticipant);
    m.sender = decodeJid(rawParticipant, sock, m.from) || '';
    console.log(chalk.cyan('👤 Decoded sender:'), m.sender);
  } else if (m.isSelf) {
    const rawUserId = sock.user?.id;
    console.log(chalk.magenta('🔍 SELF MESSAGE - Raw user ID:'), rawUserId);
    m.sender = decodeJid(rawUserId, sock) || '';
    console.log(chalk.cyan('👤 Decoded sender:'), m.sender);
  } else {
    console.log(chalk.magenta('🔍 DIRECT MESSAGE - Using from:'), m.from);
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

      // ENHANCED: Safe quoted message extraction with ID resolution
      try {
        const quoted = m.message[m.type]?.contextInfo;
        if (quoted?.quotedMessage) {
          const quotedType = getContentType(quoted.quotedMessage);
          const rawQuotedSender = quoted.participant;
          console.log(chalk.magenta('💬 QUOTED - Raw sender:'), rawQuotedSender);
          const quotedSender = decodeJid(rawQuotedSender, sock, m.from) || '';
          console.log(chalk.cyan('💬 Quoted decoded sender:'), quotedSender);
          
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
        console.warn(chalk.yellow('Error processing quoted message:'), error.message);
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
        console.warn(chalk.yellow('Error extracting message body:'), error.message);
        m.body = '';
      }

      // ENHANCED: Safe mentions extraction with ID resolution
      try {
        const rawMentions = m.message?.[m.type]?.contextInfo?.mentionedJid || [];
        console.log(chalk.magenta('👥 Raw mentions:'), rawMentions);
        
        if (Array.isArray(rawMentions) && rawMentions.length > 0) {
          // Decode all mentions
          m.mentions = rawMentions.map(mention => {
            const decoded = decodeJid(mention, sock, m.from);
            console.log(chalk.cyan('👥 Decoded mention:'), mention, '->', decoded);
            return decoded;
          });
          
          // If in group and has @lid mentions, resolve them asynchronously
          if (m.isGroup && m.mentions.some(mention => mention.includes('@lid'))) {
            resolveGroupMemberIds(sock, m.from, m.mentions).then(resolvedMentions => {
              m.mentions = resolvedMentions;
              console.log(chalk.green('✓ Resolved all mentions:'), m.mentions);
            }).catch(error => {
              console.warn(chalk.red('Error resolving mentions:'), error.message);
            });
          }
        } else {
          m.mentions = [];
        }
        
        // Add quoted sender to mentions if exists
        if (m.quoted?.sender && !m.mentions.includes(m.quoted.sender)) {
          m.mentions.push(m.quoted.sender);
        }
      } catch (error) {
        console.warn(chalk.yellow('Error extracting mentions:'), error.message);
        m.mentions = [];
      }
      
    } catch (error) {
      console.warn(chalk.yellow('Error processing message content:'), error.message);
      m.type = 'unknown';
      m.body = '';
      m.mentions = [];
      m.quoted = null;
    }
  }

  // Add async method to resolve mentions after serialization
  m.resolveMentions = async () => {
    if (m.isGroup && m.mentions.some(mention => mention.includes('@lid'))) {
      try {
        const lidMentions = m.mentions.filter(mention => mention.includes('@lid'));
        const resolvedMentions = await resolveGroupMemberIds(sock, m.from, lidMentions);
        
        // Replace @lid mentions with resolved ones
        m.mentions = m.mentions.map(mention => {
          if (mention.includes('@lid')) {
            const index = lidMentions.indexOf(mention);
            return index !== -1 ? resolvedMentions[index] : mention;
          }
          return mention;
        });
      } catch (error) {
        console.warn(chalk.yellow('Error resolving mentions:'), error.message);
      }
    }
  };

  // Add async method to resolve quoted sender
  m.resolveQuoted = async () => {
    if (m.quoted && m.quoted.sender.includes('@lid') && m.isGroup) {
      try {
        const resolved = await resolveGroupMemberIds(sock, m.from, [m.quoted.sender]);
        if (resolved.length > 0) {
          m.quoted.sender = resolved[0];
        }
      } catch (error) {
        console.warn(chalk.yellow('Error resolving quoted sender:'), error.message);
      }
    }
  };

  // FIXED: Helper methods with enhanced error handling
  m.reply = async (text, options = {}) => {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Reply text must be a valid string');
      }
      return await sock.sendMessage(m.from, { text, ...options }, { quoted: m });
    } catch (error) {
      console.error(chalk.red('Failed to send reply:'), error.message);
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
      console.error(chalk.red('Failed to send reaction:'), error.message);
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
      console.warn(chalk.yellow('Failed to check admin status:'), error.message);
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
      console.warn(chalk.yellow('Failed to check bot admin status:'), error.message);
      return false;
    }
  };

  return m;
}

// Clear ID mapping cache every hour to prevent memory leaks
setInterval(() => {
  idMappingCache.clear();
  console.log(chalk.gray('🧹 Cleared ID mapping cache'));
}, 60 * 60 * 1000);

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
      console.warn(chalk.yellow('Error getting media info:'), error.message);
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
      console.warn(chalk.yellow('Error extracting URLs:'), error.message);
      return [];
    }
  },

  // Helper to resolve any remaining @lid IDs
  resolveLidIds: async (sock, groupId, ids) => {
    return await resolveGroupMemberIds(sock, groupId, ids);
  }
};
