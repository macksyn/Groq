// Enhanced functions to add to your existing Twitter plugin

// Add this import at the top with other imports
import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';

// Enhanced message formatting function that handles media
async function formatAndSendTweetMessage(sock, targetChat, tweet, username, userDisplayName, media = []) {
  try {
    let content = tweet.text || '';
    
    // Truncate if too long
    if (content.length > twitterSettings.maxMessageLength) {
      content = content.substring(0, twitterSettings.maxMessageLength - 3) + '...';
    }

    // Create tweet URL - using x.com now
    const tweetUrl = `https://x.com/${username}/status/${tweet.id}`;

    // Format basic message using template
    let message = twitterSettings.messageTemplate
      .replace('{username}', username)
      .replace('{displayname}', userDisplayName)
      .replace('{content}', content)
      .replace('{url}', tweetUrl)
      .replace('{date}', moment(tweet.created_at).tz('Africa/Lagos').format('DD/MM/YYYY HH:mm'));

    // Add metrics if available
    if (tweet.public_metrics) {
      const metrics = tweet.public_metrics;
      message += `\n\n📊 ${metrics.like_count || 0} ❤️ | ${metrics.retweet_count || 0} 🔄 | ${metrics.reply_count || 0} 💬`;
    }

    // Send the text message first
    await sock.sendMessage(targetChat, { text: message });

    // Handle media if available
    if (media && media.length > 0) {
      for (const mediaItem of media) {
        try {
          await sendMediaItem(sock, targetChat, mediaItem, username);
          // Small delay between media items
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error sending media item:`, error);
          // Send fallback message with media URL
          await sock.sendMessage(targetChat, { 
            text: `📎 Media: ${mediaItem.url || 'Media not available'}` 
          });
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error formatting and sending tweet message:', error);
    
    // Fallback: send simple message
    const fallbackMessage = `🐦 New tweet from @${username}\n\n${tweet.text}\n\n${tweetUrl}`;
    await sock.sendMessage(targetChat, { text: fallbackMessage });
    return false;
  }
}

// Function to download and send media items
async function sendMediaItem(sock, targetChat, mediaItem, username) {
  try {
    let mediaUrl = '';
    let caption = `📸 From @${username}`;

    // Determine media URL based on type
    switch (mediaItem.type) {
      case 'photo':
        if (!twitterSettings.enableImages) return;
        mediaUrl = mediaItem.url;
        caption = `📸 Image from @${username}`;
        break;
        
      case 'video':
        if (!twitterSettings.enableVideos) return;
        // For videos, we might need to use preview_image_url if direct video URL isn't available
        mediaUrl = mediaItem.url || mediaItem.preview_image_url;
        caption = `🎥 Video from @${username}`;
        
        if (!mediaUrl) {
          // If no direct URL, send preview image instead
          if (mediaItem.preview_image_url) {
            mediaUrl = mediaItem.preview_image_url;
            caption = `🎥 Video preview from @${username} (Full video: link in tweet above)`;
          } else {
            console.log('No video URL available for media item');
            return;
          }
        }
        break;
        
      case 'animated_gif':
        if (!twitterSettings.enableVideos) return;
        mediaUrl = mediaItem.url || mediaItem.preview_image_url;
        caption = `🎬 GIF from @${username}`;
        break;
        
      default:
        console.log(`Unknown media type: ${mediaItem.type}`);
        return;
    }

    if (!mediaUrl) {
      console.log('No media URL found');
      return;
    }

    // Download the media
    console.log(`📥 Downloading media: ${mediaUrl}`);
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.data || response.data.byteLength === 0) {
      throw new Error('Empty media file received');
    }

    const buffer = Buffer.from(response.data);
    
    // Detect file type
    const fileType = await fileTypeFromBuffer(buffer);
    if (!fileType) {
      throw new Error('Could not detect file type');
    }

    const fileName = `twitter_media_${Date.now()}.${fileType.ext}`;

    // Prepare media message based on type
    let messageData = {};

    if (fileType.mime.startsWith('image/')) {
      messageData = {
        image: buffer,
        caption: caption,
        fileName: fileName
      };
    } else if (fileType.mime.startsWith('video/') || fileType.ext === 'mp4') {
      // Check file size (WhatsApp has limits)
      if (buffer.length > 16 * 1024 * 1024) { // 16MB limit
        throw new Error('Video file too large for WhatsApp');
      }
      
      messageData = {
        video: buffer,
        caption: caption,
        fileName: fileName
      };
    } else if (fileType.ext === 'gif') {
      messageData = {
        video: buffer,
        caption: caption,
        fileName: fileName.replace('.gif', '.mp4'),
        gifPlayback: true
      };
    } else {
      // Send as document for other file types
      messageData = {
        document: buffer,
        fileName: fileName,
        caption: caption,
        mimetype: fileType.mime
      };
    }

    // Send the media
    await sock.sendMessage(targetChat, messageData);
    console.log(`✅ Sent ${fileType.mime} media to ${targetChat}`);

  } catch (error) {
    console.error('Error sending media item:', error);
    throw error;
  }
}

// Modified checkAccountTweets function - replace the existing one
async function checkAccountTweets(sock, account) {
  try {
    const { tweets, media } = await getUserTweets(account.userId, account.lastTweetId);
    
    if (!tweets || tweets.length === 0) {
      return;
    }

    console.log(`📝 Found ${tweets.length} new tweets for @${account.username}`);

    // Process tweets in chronological order (oldest first)
    const sortedTweets = tweets.sort((a, b) => 
      new Date(a.created_at) - new Date(b.created_at)
    );

    for (const tweet of sortedTweets) {
      try {
        // Check filters
        if (!matchesFilters(tweet, account.filters, account.excludeKeywords)) {
          console.log(`⏭️ Tweet ${tweet.id} filtered out`);
          continue;
        }

        // Send to target chats
        for (const targetChat of account.targetChats) {
          try {
            // Check if already sent
            if (await isTweetSent(tweet.id, targetChat)) {
              continue;
            }

            // Get media for this tweet
            const tweetMedia = media?.filter(m => 
              tweet.attachments?.media_keys?.includes(m.media_key)
            ) || [];

            // Format and send message with media
            await formatAndSendTweetMessage(
              sock, 
              targetChat, 
              tweet, 
              account.username, 
              account.displayName, 
              tweetMedia
            );

            // Mark as sent
            await markTweetSent(tweet.id, targetChat, account.username, tweet);

            console.log(`✅ Sent tweet ${tweet.id} to ${targetChat} with ${tweetMedia.length} media items`);

            // Longer delay between messages to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            console.error(`Error sending tweet to ${targetChat}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error processing tweet ${tweet.id}:`, error);
      }
    }

    // Update last checked and last tweet ID
    await db.collection(COLLECTIONS.TWITTER_ACCOUNTS).updateOne(
      { username: account.username },
      {
        $set: {
          lastChecked: new Date(),
          lastTweetId: sortedTweets[sortedTweets.length - 1].id
        },
        $inc: { totalTweetsSent: sortedTweets.length }
      }
    );

  } catch (error) {
    console.error(`Error checking account tweets for @${account.username}:`, error);
  }
}

// Enhanced settings with media size limits
const enhancedDefaultSettings = {
  ...defaultSettings,
  maxImageSize: 5 * 1024 * 1024, // 5MB
  maxVideoSize: 16 * 1024 * 1024, // 16MB (WhatsApp limit)
  downloadTimeout: 30000, // 30 seconds
  maxMediaItems: 4, // Max media items per tweet
  sendMediaAsDocument: false, // Send large media as documents
  compressImages: true, // Compress images if too large
  skipFailedMedia: true // Continue sending other media if one fails
};

// Update your twitterSettings to include these new options
Object.assign(twitterSettings, enhancedDefaultSettings);

// Enhanced error handling for media download
async function downloadMediaWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: twitterSettings.downloadTimeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*,video/*,*/*'
        }
      });
      
      return Buffer.from(response.data);
    } catch (error) {
      console.error(`Media download attempt ${i + 1} failed:`, error.message);
      
      if (i === maxRetries - 1) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
}

// Function to handle different Twitter media URLs
function getMediaDownloadUrl(mediaItem) {
  // For images, use the largest available size
  if (mediaItem.type === 'photo' && mediaItem.url) {
    // Twitter image URLs can be modified for different sizes
    // Remove size parameters and add :large for best quality
    return mediaItem.url.split('?')[0] + '?format=jpg&name=large';
  }
  
  // For videos, try to get the best quality URL
  if (mediaItem.type === 'video') {
    // Twitter API v2 might not always provide direct video URLs
    // In some cases, you might need to use the preview image
    return mediaItem.url || mediaItem.preview_image_url;
  }
  
  return mediaItem.url;
}

// Export the enhanced functions
export { 
  formatAndSendTweetMessage,
  sendMediaItem,
  downloadMediaWithRetry,
  getMediaDownloadUrl,
  checkAccountTweets // Export the modified version
};
