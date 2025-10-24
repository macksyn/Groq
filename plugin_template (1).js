// plugins/_template.js - Use this as a template for new plugins

export default {
  // Required: Unique plugin name (used as command)
  name: 'example',
  
  // Required: Brief description of what the plugin does
  description: 'Example plugin template',
  
  // Optional: Alternative command names
  aliases: ['ex', 'sample'],
  
  // Optional: Plugin category (affects menu grouping)
  category: 'general', // general, owner, admin, utility, fun, media, etc.
  
  // Optional: Command usage format
  usage: '[option] <required>',
  
  // Optional: Example usage
  example: 'example hello world',
  
  // Optional: Plugin version
  version: '1.0.0',
  
  // Optional: Restrict to owner only
  ownerOnly: false,
  
  // Optional: Restrict to admins only (for group commands)
  adminOnly: false,
  
  // Optional: Works only in groups
  groupOnly: false,
  
  // Optional: Works only in private chats
  privateOnly: false,

  /**
   * Main plugin execution function
   * @param {Object} context - Execution context
   * @param {Object} context.msg - WhatsApp message object
   * @param {Array} context.args - Command arguments (split by space)
   * @param {Object} context.sock - WhatsApp socket (for sending messages)
   * @param {Object} context.db - MongoDB database instance
   * @param {String} context.prefix - Current command prefix
   */
  async run({ msg, args, sock, db, prefix }) {
    const sender = msg.key.remoteJid; // Who sent the message
    const isGroup = sender.endsWith('@g.us'); // Is it a group?
    
    try {
      // Extract message info
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      
      // Example: Simple text response
      if (args.length === 0) {
        return await sock.sendMessage(sender, {
          text: `✅ Hello! This is an example plugin.\n\nUsage: ${prefix}${this.name} <text>`
        });
      }
      
      // Example: Echo back the arguments
      const text = args.join(' ');
      await sock.sendMessage(sender, {
        text: `You said: ${text}`
      });
      
      // Example: Database operations
      const collection = db.collection('example_data');
      await collection.insertOne({
        sender,
        text,
        timestamp: new Date()
      });
      
      // Example: Reply to quoted message
      if (quotedMsg) {
        await sock.sendMessage(sender, {
          text: '📝 Replying to quoted message!'
        }, {
          quoted: msg
        });
      }
      
      // Example: Send with mentions
      if (mentionedJids.length > 0) {
        await sock.sendMessage(sender, {
          text: `👋 Hello ${mentionedJids.map(j => '@' + j.split('@')[0]).join(', ')}!`,
          mentions: mentionedJids
        });
      }
      
      // Example: Send reaction
      await sock.sendMessage(sender, {
        react: {
          text: '✅',
          key: msg.key
        }
      });
      
      // Example: Group-only features
      if (isGroup) {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(sender);
        console.log('Group name:', groupMetadata.subject);
        console.log('Participants:', groupMetadata.participants.length);
      }

    } catch (error) {
      console.error(`Error in ${this.name} plugin:`, error);
      
      await sock.sendMessage(sender, {
        text: `❌ An error occurred: ${error.message}`
      });
    }
  }
};


// ============================================
// COMMON PATTERNS AND EXAMPLES
// ============================================

/*

1. SIMPLE TEXT RESPONSE:
-----------------------
await sock.sendMessage(sender, {
  text: 'Hello World!'
});


2. SEND IMAGE:
--------------
import axios from 'axios';

const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
await sock.sendMessage(sender, {
  image: Buffer.from(response.data),
  caption: 'Here is your image!'
});


3. SEND VIDEO:
--------------
await sock.sendMessage(sender, {
  video: videoBuffer,
  caption: 'Check this out!',
  gifPlayback: false // true for GIF
});


4. SEND DOCUMENT:
-----------------
await sock.sendMessage(sender, {
  document: fileBuffer,
  fileName: 'document.pdf',
  mimetype: 'application/pdf'
});


5. SEND AUDIO/VOICE:
--------------------
await sock.sendMessage(sender, {
  audio: audioBuffer,
  ptt: true, // true = voice note, false = audio file
  mimetype: 'audio/mp4'
});


6. SEND POLL:
-------------
await sock.sendMessage(sender, {
  poll: {
    name: 'What is your favorite color?',
    values: ['Red', 'Blue', 'Green', 'Yellow'],
    selectableCount: 1
  }
});


7. REPLY TO MESSAGE:
--------------------
await sock.sendMessage(sender, {
  text: 'This is a reply!'
}, {
  quoted: msg
});


8. FORWARD MESSAGE:
-------------------
await sock.sendMessage(targetJid, {
  forward: msg
});


9. DELETE MESSAGE:
------------------
await sock.sendMessage(sender, {
  delete: msg.key
});


10. SEND TYPING INDICATOR:
--------------------------
await sock.sendPresenceUpdate('composing', sender);
// ... do work ...
await sock.sendPresenceUpdate('paused', sender);


11. DATABASE OPERATIONS:
------------------------
// Insert
await db.collection('users').insertOne({ name: 'John', jid: sender });

// Find
const user = await db.collection('users').findOne({ jid: sender });

// Update
await db.collection('users').updateOne(
  { jid: sender },
  { $set: { lastSeen: new Date() } }
);

// Delete
await db.collection('users').deleteOne({ jid: sender });

// Count
const count = await db.collection('users').countDocuments();


12. CHECK PERMISSIONS:
---------------------
// Check if owner
const isOwner = sender.includes(process.env.OWNER_NUMBER);

// Check if group admin (in groups)
if (isGroup) {
  const groupMetadata = await sock.groupMetadata(sender);
  const participant = groupMetadata.participants.find(p => p.id === msg.key.participant);
  const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
}


13. EXTRACT MESSAGE CONTENT:
----------------------------
const text = 
  msg.message?.conversation ||
  msg.message?.extendedTextMessage?.text ||
  msg.message?.imageMessage?.caption ||
  msg.message?.videoMessage?.caption || '';


14. GET MENTIONED USERS:
------------------------
const mentionedJids = 
  msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];


15. GET QUOTED MESSAGE:
-----------------------
const quotedMsg = 
  msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;


16. SEND CONTACT CARD:
---------------------
const vcard = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
TEL;type=CELL;waid=1234567890:+1234567890
END:VCARD`;

await sock.sendMessage(sender, {
  contacts: {
    displayName: 'John Doe',
    contacts: [{ vcard }]
  }
});


17. SEND LOCATION:
------------------
await sock.sendMessage(sender, {
  location: {
    degreesLatitude: 37.7749,
    degreesLongitude: -122.4194,
    name: 'San Francisco'
  }
});


18. ERROR HANDLING:
-------------------
try {
  // Your code
} catch (error) {
  console.error(`Error in plugin:`, error);
  await sock.sendMessage(sender, {
    text: `❌ Error: ${error.message}`
  });
}


19. RATE LIMITING (per user):
-----------------------------
const userKey = `ratelimit_${sender}`;
const lastUsed = await db.collection('ratelimits').findOne({ key: userKey });

if (lastUsed && (Date.now() - lastUsed.timestamp < 5000)) {
  return await sock.sendMessage(sender, {
    text: '⚠️ Please wait before using this command again.'
  });
}

await db.collection('ratelimits').updateOne(
  { key: userKey },
  { $set: { timestamp: Date.now() } },
  { upsert: true }
);


20. PAGINATION:
---------------
const page = parseInt(args[0]) || 1;
const perPage = 10;
const skip = (page - 1) * perPage;

const items = await db.collection('items')
  .find({})
  .skip(skip)
  .limit(perPage)
  .toArray();

const total = await db.collection('items').countDocuments();
const totalPages = Math.ceil(total / perPage);

let text = `📄 Page ${page}/${totalPages}\n\n`;
items.forEach((item, i) => {
  text += `${skip + i + 1}. ${item.name}\n`;
});

*/
