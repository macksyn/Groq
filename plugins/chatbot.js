// plugins/ai_chat_plugin.js - AI Chatbot plugin using Groq API
import { getSharedDatabase } from '../lib/pluginIntegration.js';

// Plugin information export
export const info = {
  name: 'AI Chatbot',
  version: '1.0.1', // Updated version number
  author: 'Bot Developer',
  description: 'An AI chatbot that uses the Groq API to respond to user queries.',
  commands: [
    {
      name: 'chat',
      aliases: ['ai', 'ask', 'groq'],
      description: 'Start a conversation with the AI.',
      usage: '{prefix}chat [your question]'
    }
  ]
};

// Main plugin handler function
export default async function groqChatHandler(m, sock, config) {
  try {
    // Await for database connection to be ready (if needed for future features)
    const db = getSharedDatabase();

    // Ensure the message starts with the command prefix
    if (!m.body.startsWith(config.PREFIX)) {
      return;
    }

    // Extract command and arguments
    const messageBody = m.body.slice(config.PREFIX.length).trim();
    const args = messageBody.split(' ').filter(arg => arg.length > 0);
    const command = args[0].toLowerCase();
    const prompt = args.slice(1).join(' ');

    // Handle the 'chat' command
    if (info.commands[0].aliases.includes(command) || info.commands[0].name === command) {
      if (!prompt) {
        await sock.sendMessage(m.key.remoteJid, { text: 'Hello! How can I help you today? Please provide a question or topic after the command, for example: `!chat What is the capital of France?`' }, { quoted: m });
        return;
      }

      // Check for Groq API key
      const GROQ_API_KEY = process.env.GROQ_API_KEY;
      if (!GROQ_API_KEY) {
        console.error('❌ GROQ_API_KEY is not set in environment variables.');
        await sock.sendMessage(m.key.remoteJid, { text: '❌ My AI services are currently unavailable. Please ask my owner to set up the Groq API key.' }, { quoted: m });
        return;
      }

      // Show a "typing" indicator to let the user know a response is being generated
      await sock.sendPresenceUpdate('composing', m.key.remoteJid);

      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            model: "mixtral-8x7b-32768" // You can change this to a different model if you prefer
          })
        });

        if (!response.ok) {
          // Log a more detailed error message if the response is not successful
          console.error(`❌ Groq API returned an error: ${response.status} ${response.statusText}`);
          const errorData = await response.json().catch(() => ({ message: 'No JSON body in error response' }));
          console.error('❌ Groq API Error Details:', errorData);
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const aiReply = data.choices[0].message.content.trim();

        // Send the AI's response back to the user
        await sock.sendMessage(m.key.remoteJid, { text: aiReply }, { quoted: m });
      } catch (error) {
        // Log the full error object for better debugging
        console.error('❌ Error calling Groq API:', error);
        await sock.sendMessage(m.key.remoteJid, { text: '❌ An error occurred while trying to get a response from the AI. Please try again later.' }, { quoted: m });
      } finally {
        // Stop the "typing" indicator
        await sock.sendPresenceUpdate('paused', m.key.remoteJid);
      }
    }
  } catch (error) {
    console.error('❌ Error in Groq chat handler:', error);
  }
}
