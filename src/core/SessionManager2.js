// src/core/SessionManager.js (Corrected)
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { useMultiFileAuthState, BufferJSON } from '@whiskeysockets/baileys';
import { File } from 'megajs';
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
        logger.info('📥 No local session found. Attempting to download from Mega...');
        await this.downloadSession();
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

  async downloadSession() {
    try {
      // This function uses the detailed validation and logging from your V2 file
      if (!this.sessionId || !this.sessionId.includes('~') || !this.sessionId.includes('#')) {
        throw new Error('Invalid SESSION_ID format. Expected: BotName~fileId#key');
      }
      const [botName, fileData] = this.sessionId.split('~');
      const [fileId, key] = fileData.split('#');
      if (!fileId || !key) throw new Error('Malformed SESSION_ID');

      const megaUrl = `https://mega.nz/file/${fileId}#${key}`;
      logger.info(`Downloading from: ${megaUrl}`);

      const file = File.fromURL(megaUrl);
      const data = await file.downloadBuffer();

      JSON.parse(data.toString()); // Validate JSON

      await fs.writeFile(this.credsPath, data);
      logger.info('✅ Session downloaded and saved successfully!');
      return true;

    } catch (error) {
      logger.error(error, '❌ Session download failed');
      logger.warn('💡 Bot will proceed with QR code. Please scan the code to generate a new session.');
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
        logger.error(error, '❌ Failed to save session to creds.json');
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
