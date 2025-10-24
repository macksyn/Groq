/**
 * @fileoverview Manages the Baileys WebSocket connection,
 * handling connection updates, QR code generation, and error recovery.
 */

import makeWASocket, {
  DisconnectReason,
  Browsers,
  isJidGroup,
} from '@whiskeysockets/baileys';
import { pino } from 'pino';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { handleMessage } from '../../handlers/messageHandler.js';
import { handleGroupUpdate } from '../../handlers/groupHandler.js';
import { handleCall } from '../../handlers/callHandler.js';

class SocketManager {
  /**
   * @param {WhatsAppBot} bot The main bot instance.
   * @param {SessionManager} sessionManager The session manager instance.
   */
  constructor(bot, sessionManager) {
    this.bot = bot;
    this.sessionManager = sessionManager;
    this.sock = null;
    this.pinoLogger = pino({ level: config.LOG_LEVEL || 'silent' }); // Use pino for Baileys
  }

  /**
   * Initializes and returns a new Baileys socket instance.
   * @returns {import('@whiskeysockets/baileys').WASocket}
   */
  createSocket() {
    const { state, saveCreds } = this.sessionManager.authState;
    
    const socket = makeWASocket({
      version: this.bot.waVersion,
      logger: this.pinoLogger,
      printQRInTerminal: config.PRINT_QR_IN_TERMINAL,
      browser: Browsers.macOS('Desktop'),
      auth: state,
      getMessage: async (key) => {
        // Implement message store logic if needed
        return { conversation: 'hello' };
      },
      // ... other config
    });

    this.attachEventListeners(socket, saveCreds);
    return socket;
  }

  /**
   * Attaches all necessary event listeners to the socket.
   * @param {import('@whiskeysockets/baileys').WASocket} socket The socket instance.
   * @param {() => Promise<void>} saveCreds Function to save credentials.
   */
  attachEventListeners(socket, saveCreds) {
    // Creds have updated, save them
    socket.ev.on('creds.update', saveCreds);

    // Connection has updated
    socket.ev.on('connection.update', this.handleConnectionUpdate.bind(this));

    // Received a new message
    socket.ev.on('messages.upsert', (m) => {
      if (config.ENABLE_MESSAGE_HANDLER) {
        handleMessage(socket, m, this.bot);
      }
    });

    // Group participants update
    socket.ev.on('group-participants.update', (update) => {
      if (config.ENABLE_GROUP_HANDLER) {
        handleGroupUpdate(socket, update, this.bot);
      }
    });

    // Incoming call
    socket.ev.on('call', (call) => {
      if (config.ENABLE_CALL_HANDLER) {
        handleCall(socket, call[0], this.bot);
      }
    });

    // ... other event listeners
  }

  /**
   * Handles the 'connection.update' event from Baileys.
   * @param {import('@whiskeysockets/baileys').ConnectionState} update The connection update object.
   */
  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;
    this.bot.lastConnectionUpdate = Date.now();

    if (qr) {
      this.bot.qr = qr;
      this.bot.emit('qr', qr);
      logger.info('📱 QR Code Generated - Scan with WhatsApp');
      logger.info('💡 QR codes expire in 60 seconds. Please scan quickly!');
    }

    if (connection === 'close') {
      this.bot.qr = null; // Clear QR on close
      // @ts-ignore
      const statusCode = lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.status;
      const reason = lastDisconnect?.error?.message || 'Unknown reason';
      
      logger.error(`❌ Connection closed`, { error: reason, stack: lastDisconnect?.error?.stack });
      logger.warn(`📝 Status Code: ${statusCode || 'N/A'}`);
      logger.warn(`📝 Reason: ${reason}`);

      const shouldReconnect = this.bot.shouldReconnect();

      if (!shouldReconnect) {
        logger.error('🚫 Max reconnect attempts reached. Bot will not restart.');
        this.bot.emit('fatal');
        return;
      }

      // --- MODIFIED LOGIC ---
      // Check for unrecoverable errors first
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
        logger.error('🚫 Unrecoverable error (Logged Out or Banned). Cleaning session and stopping.');
        await this.sessionManager.clearSession();
        this.bot.stop(true); // Pass true to indicate a fatal stop
      } 
      // Handle bad session file, but don't clear immediately
      else if (statusCode === DisconnectReason.badSession) {
        logger.error('🚫 Bad session file. Cleaning session and retrying...');
        await this.sessionManager.clearSession();
        this.bot.reconnect();
      }
      // For Stream Errors (500) or other temporary issues, just reconnect.
      else if (statusCode === DisconnectReason.streamEror || statusCode === 500) {
        logger.warn(`⚠️ Stream error (500) detected. Attempting a simple reconnect without clearing session.`);
        this.bot.reconnect();
      }
      // --- END OF MODIFIED LOGIC ---
      else if (statusCode === DisconnectReason.connectionClosed) {
        logger.warn('Connection closed. Attempting reconnect.');
        this.bot.reconnect();
      } else if (statusCode === DisconnectReason.connectionLost) {
        logger.warn('Connection lost. Attempting reconnect.');
        this.bot.reconnect();
      } else if (statusCode === DisconnectReason.timedOut || statusCode === 408) {
        logger.error('⏰ Connection timed out. Retrying...', { error: reason, stack: lastDisconnect?.error?.stack });
        this.bot.reconnect();
      } else {
        logger.error(`Unhandled connection close. Status: ${statusCode || 'N/A'}. Reconnecting...`);
        this.bot.reconnect();
      }
    } else if (connection === 'open') {
      logger.info('✅ WhatsApp connection established.');
      this.bot.qr = null; // Clear QR on successful connection
      this.bot.emit('open');
      this.bot.resetReconnectAttempts(); // Reset counter on success
    }
  }

  /**
   * Closes the socket connection.
   */
  close() {
    if (this.sock) {
      this.sock.logout();
      this.sock = null;
    }
  }
}

export default SocketManager;
