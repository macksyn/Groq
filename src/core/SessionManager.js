// src/core/SessionManager.js (Base64 Version)
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { useMultiFileAuthState, BufferJSON } from 'baileys';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SessionManager {
  constructor(config) {
    this.config = config;
    this.sessionId = config.SESSION_ID;
    this.sessionDir = path.join(__dirname, '../../sessions');
    this.credsPath = path.join(this.sessionDir, 'creds.json');
  }

  async initialize() {
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
      logger.info('📁 Session directory ready');

      const sessionFileExists = await this.sessionExists();

      if (sessionFileExists) {
        logger.info('✅ Existing local session file found.');
      } else if (this.sessionId) {
        logger.info('📥 No local session found. Attempting to decode session ID...');
        await this.decodeSession();
      } else {
        logger.warn('⚠️ No SESSION_ID found. Proceeding with QR code authentication.');
      }
    } catch (error) {
      logger.error(error, '❌ A critical error occurred during session initialization');
      // We throw the error to halt the bot's startup if the session can't be set up.
      throw error;
    }
  }

  async sessionExists() {
    try {
      await fs.access(this.credsPath);
      return true;
    } catch {
      return false;
    }
  }

  async decodeSession() {
    try {
      // Validate session ID format: BotName~base64Data
      if (!this.sessionId || !this.sessionId.includes('~')) {
        throw new Error('Invalid SESSION_ID format. Expected: BotName~base64Data');
      }

      // Split and extract base64 data
      const parts = this.sessionId.split('~');
      if (parts.length < 2) {
        throw new Error('Malformed SESSION_ID: Missing base64 data after ~');
      }

      const [botName, base64Data] = parts;
      logger.info(`📦 Decoding session for: ${botName}`);

      // Decode base64 to JSON
      const jsonData = Buffer.from(base64Data, 'base64').toString('utf8');
      
      // Validate JSON
      const parsedData = JSON.parse(jsonData);
      
      // Verify it has the required creds structure
      if (!parsedData.noiseKey || !parsedData.signedIdentityKey || !parsedData.signedPreKey) {
        throw new Error('Invalid session data: Missing required credential fields');
      }

      // Write to creds.json
      await fs.writeFile(this.credsPath, jsonData, 'utf8');
      
      logger.info('✅ Session decoded and saved successfully!');
      return true;

    } catch (error) {
      logger.error(error, '❌ Session decode failed');
      
      // Provide helpful error messages
      if (error.message.includes('Invalid base64')) {
        logger.warn('💡 The SESSION_ID contains invalid base64 data. Please generate a new session.');
      } else if (error.message.includes('JSON')) {
        logger.warn('💡 The decoded data is not valid JSON. Please generate a new session.');
      } else {
        logger.warn('💡 Bot will proceed with QR code. Please scan the code to generate a new session.');
      }
      
      return false;
    }
  }

  async getAuthState() {
    let creds;
    const { state, saveCreds: saveCredsMulti } = await useMultiFileAuthState(this.sessionDir);

    if (await this.sessionExists()) {
      try {
        const data = await fs.readFile(this.credsPath, 'utf-8');
        creds = JSON.parse(data, BufferJSON.reviver);
        state.creds = creds; // Inject the loaded creds into the state
        logger.info('✅ Injected session from creds.json into auth state.');
      } catch (e) {
        logger.warn('⚠️ Could not parse creds.json. A new session will be created.');
      }
    }

    const saveCreds = async () => {
      try {
        await saveCredsMulti();
        await fs.writeFile(
          this.credsPath,
          JSON.stringify(state.creds, BufferJSON.replacer, 2)
        );
      } catch (e) {
        logger.error(e, '❌ Failed to save session to creds.json');
      }
    };

    return { state, saveCreds };
  }

  async cleanSession() {
    logger.warn('🗑️ Cleaning session directory...');
    try {
      await fs.rm(this.sessionDir, { recursive: true, force: true });
      await fs.mkdir(this.sessionDir, { recursive: true });
      logger.info('✅ Session directory cleaned.');
    } catch (error) {
      logger.error(error, '⚠️ Could not clean session');
    }
  }
}
