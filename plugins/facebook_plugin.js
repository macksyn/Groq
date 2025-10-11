// plugins/facebook.js - Enhanced Facebook Video Downloader
import getFBInfo from '@xaviabot/fb-downloader';
import chalk from 'chalk';

// Session storage with auto-cleanup
const fbSessionMap = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Auto-cleanup expired sessions every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of fbSessionMap.entries()) {
    if (now - session.timestamp > SESSION_TIMEOUT) {
      fbSessionMap.delete(userId);
    }
  }
}, 2 * 60 * 1000);

// Utility: Fetch video stream as Buffer
async function getStreamBuffer(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } catch (error) {
    throw new Error(`Failed to download video: ${error.message}`);
  }
}

// Format file size
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Main command handler
async function facebookCommand(m, Matrix) {
  const prefix = m.prefix || '.';
  const cmd = m.command;
  const text = m.text;
  const userId = m.sender;

  try {
    // ===== STEP 1: Initial URL Processing =====
    if (['facebook', 'fb', 'fbdl'].includes(cmd)) {
      // Validate URL
      if (!text) {
        return await m.reply(`❌ *Please provide a valid Facebook video URL.*

*Usage:*
${prefix}fb <facebook_video_url>

*Example:*
${prefix}fb https://www.facebook.com/watch?v=123456`);
      }

      // Check if it's a valid Facebook URL
      if (!text.match(/facebook\.com|fb\.watch/i)) {
        return await m.reply('❌ *Invalid Facebook URL. Please provide a valid Facebook video link.*');
      }

      await m.React("🔍");

      console.log(chalk.blue(`[FB] Processing request from ${m.pushName}: ${text.substring(0, 50)}...`));

      // Fetch video info
      let fbData;
      try {
        fbData = await getFBInfo(text);
      } catch (fetchError) {
        console.error(chalk.red('[FB] Fetch error:'), fetchError.message);
        await m.reply('❌ *Failed to fetch video information. Please check the URL and try again.*');
        await m.React("❌");
        return;
      }

      if (!fbData || (!fbData.sd && !fbData.hd)) {
        await m.reply('❌ *No downloadable video found. This might be a private video or invalid link.*');
        await m.React("❌");
        return;
      }

      // Build quality list
      const qualityList = [];
      if (fbData.sd) {
        qualityList.push({ 
          resolution: 'SD', 
          url: fbData.sd,
          label: '📹 SD Quality'
        });
      }
      if (fbData.hd) {
        qualityList.push({ 
          resolution: 'HD', 
          url: fbData.hd,
          label: '🎬 HD Quality'
        });
      }

      if (qualityList.length === 0) {
        await m.reply('⚠️ *No SD or HD quality available for this video.*');
        await m.React("❌");
        return;
      }

      // Save session
      fbSessionMap.set(userId, { 
        qualityList,
        title: fbData.title,
        thumbnail: fbData.thumbnail,
        timestamp: Date.now()
      });

      // Build quality menu
      let qualityOptions = '';
      qualityList.forEach((q, index) => {
        qualityOptions += `${index + 1}. ${q.label}\n`;
      });

      const menuMessage = `╭━━━〔 *FACEBOOK DOWNLOADER* 〕━━━╮
│
│ 📝 *Title:* ${fbData.title || 'Facebook Video'}
│ 🌐 *Source:* Facebook
│ 📊 *Available Qualities:*
│
${qualityOptions.split('\n').map(line => line ? `│    ${line}` : '').join('\n')}
│
│ 💡 *How to download:*
│ Reply with the number (1 or 2)
│ Example: Send *1* for SD or *2* for HD
│
│ ⏱️ Session expires in 5 minutes
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯

_Powered by ${m.botName || 'POPKID-MD'}_`;

      // Send with thumbnail if available
      if (fbData.thumbnail) {
        await Matrix.sendMessage(m.from, {
          image: { url: fbData.thumbnail },
          caption: menuMessage
        }, { quoted: m });
      } else {
        await m.reply(menuMessage);
      }

      await m.React("✅");
      console.log(chalk.green(`[FB] Menu sent to ${m.pushName}. Qualities: ${qualityList.map(q => q.resolution).join(', ')}`));
    }

    // ===== STEP 2: Quality Selection Handler =====
    else if (m.isReply && fbSessionMap.has(userId)) {
      const session = fbSessionMap.get(userId);
      
      // Check if session expired
      if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
        fbSessionMap.delete(userId);
        return await m.reply('⏱️ *Session expired. Please send the Facebook URL again.*');
      }

      const { qualityList, title } = session;
      
      // Parse user selection
      const selection = parseInt(text?.trim());
      
      if (isNaN(selection) || selection < 1 || selection > qualityList.length) {
        return await m.reply(`❌ *Invalid selection. Please reply with a number between 1 and ${qualityList.length}.*`);
      }

      const selected = qualityList[selection - 1];

      if (!selected) {
        return await m.reply('❌ *Invalid quality selection.*');
      }

      await m.React("⬇️");
      console.log(chalk.blue(`[FB] Downloading ${selected.resolution} for ${m.pushName}...`));

      try {
        // Download video
        const buffer = await getStreamBuffer(selected.url);
        const sizeMB = buffer.length / (1024 * 1024);
        const sizeFormatted = formatBytes(buffer.length);

        console.log(chalk.cyan(`[FB] Downloaded: ${sizeFormatted}`));

        // Check file size limit (300MB for WhatsApp)
        if (sizeMB > 300) {
          await m.reply(`🚫 *File too large!*

📦 Size: ${sizeFormatted}
⚠️ WhatsApp limit: 300MB

Please try SD quality or download from your browser.`);
          await m.React("❌");
          return;
        }

        // Send video
        await Matrix.sendMessage(m.from, {
          video: buffer,
          mimetype: 'video/mp4',
          caption: `✅ *Download Complete!*

📝 *Title:* ${title || 'Facebook Video'}
🎬 *Quality:* ${selected.resolution}
📦 *Size:* ${sizeFormatted}

_Downloaded by ${m.botName || 'POPKID-MD'}_`,
          fileName: `facebook_${selected.resolution.toLowerCase()}_${Date.now()}.mp4`
        }, { quoted: m });

        // Clear session after successful download
        fbSessionMap.delete(userId);
        await m.React("✅");
        
        console.log(chalk.green(`[FB] Successfully sent ${selected.resolution} video to ${m.pushName}`));

      } catch (downloadError) {
        console.error(chalk.red('[FB] Download error:'), downloadError.message);
        
        await m.reply(`❌ *Download Failed*

${downloadError.message}

Please try again or use a different quality.`);
        await m.React("❌");
      }
    }

  } catch (error) {
    console.error(chalk.red('[FB] Command error:'), error);
    await m.reply('❌ *An unexpected error occurred. Please try again later.*');
    await m.React("❌");
  }
}

// Plugin info and export
export const info = {
  name: 'Facebook Downloader',
  category: 'downloader',
  version: '2.0.0',
  author: 'POPKID-MD',
  description: 'Download Facebook videos in SD or HD quality',
  commands: ['facebook', 'fb', 'fbdl'],
  usage: '<prefix>fb <facebook_url>',
  examples: [
    '.fb https://www.facebook.com/watch?v=123456',
    '.fb https://fb.watch/abc123'
  ],
  cooldown: 5, // 5 seconds between uses per user
  isPremium: false,
  isAdmin: false,
  isOwner: false
};

// Main export
export default facebookCommand;
