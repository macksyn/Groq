import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { File } from 'megajs';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SessionManager {
  constructor(config) {
    this.config = config;
    this.sessionDir = path.join(__dirname, '../../sessions');
    this.credsPath = path.join(this.sessionDir, 'creds.json');
  }

  async initialize() {
    try {
      // Create session directory
      await fs.mkdir(this.sessionDir, { recursive: true });
      console.log(chalk.blue('📁 Session directory ready'));
      
      // Download session if needed
      if (!await this.sessionExists() && this.config.SESSION_ID) {
        await this.downloadSession();
      }
      
    } catch (error) {
      console.log(chalk.yellow('⚠️ Session initialization warning:'), error.message);
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
    if (!this.config.SESSION_ID?.includes('~')) {
      console.log(chalk.yellow('📱 No valid SESSION_ID, will use QR code authentication.'));
      return false;
    }

    try {
      console.log(chalk.yellow('📥 Downloading session from Mega...'));
      
      const [botName, fileData] = this.config.SESSION_ID.split('~');
      if (!fileData || !fileData.includes('#')) {
        throw new Error('Invalid SESSION_ID format. Expected: BotName~fileId#key');
      }

      const [fileId, key] = fileData.split('#');
      
      if (!fileId || !key || fileId.length < 8 || key.length < 16) {
        throw new Error('Invalid file ID or key format');
      }

      const file = File.fromURL(`https://mega.nz/file/${fileId}#${key}`);

      const data = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Download timeout after 60 seconds'));
        }, 60000);

        file.download((error, data) => {
          clearTimeout(timeout);
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        });
      });
      
      if (!data || data.length === 0) {
        throw new Error('Downloaded session data is empty');
      }

      // Validate JSON
      try {
        JSON.parse(data);
      } catch (parseError) {
        throw new Error('Downloaded session data is not valid JSON');
      }

      await fs.writeFile(this.credsPath, data);
      console.log(chalk.green('✅ Session downloaded successfully from Mega!'));
      return true;

    } catch (error) {
      console.log(chalk.red('❌ Failed to download session from Mega:'), error.message);
      console.log(chalk.yellow('💡 Will proceed with QR code authentication...'));
      return false;
    }
  }

  async getAuthState() {
    return await useMultiFileAuthState(this.sessionDir);
  }

  async cleanSession() {
    try {
      const files = await fs.readdir(this.sessionDir);
      for (const file of files) {
        const filePath = path.join(this.sessionDir, file);
        try {
          const stats = await fs.lstat(filePath);
          if (stats.isFile()) {
            await fs.unlink(filePath);
          }
        } catch (fileError) {
          console.warn(chalk.yellow(`⚠️ Could not delete ${file}:`, fileError.message));
        }
      }
      console.log(chalk.yellow('🗑️ Session files cleaned'));
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not clean session:'), error.message);
    }
  }
}