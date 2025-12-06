// src/core/SocketManager.js - Enhanced stability version
import { EventEmitter } from 'events';
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import logger from '../utils/logger.js';

// Optimized constants for better stability
const MAX_RETRIES = 10; // Increased to allow more attempts during unstable periods
const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;

export class SocketManager extends EventEmitter {
  constructor(sessionManager, pluginManager, mongoManager) {
    super();
    this.sessionManager = sessionManager;
    this.pluginManager = pluginManager;
    this.mongoManager = mongoManager;

    this.socket = null;
    this.retryCount = 0;
    this.isConnecting = false;
    this.status = 'disconnected';
    this.consecutiveErrors = 0;
  }

  getReconnectDelay() {
    // If it's a 428 error, we want to reconnect quickly, not exponentially
    if (this.consecutiveErrors > 0 && this.consecutiveErrors < 3) {
        return 2000; 
    }
    const delay = BASE_RETRY_DELAY_MS * Math.pow(2, this.retryCount);
    return Math.min(delay, MAX_RETRY_DELAY_MS);
  }

  async connect() {
    if (this.isConnecting) {
      logger.warn('🔄 Connection attempt already in progress.');
      return;
    }

    try {
      this.isConnecting = true;
      this.status = 'connecting';
      this.emit('statusChange', 'connecting', { attempt: this.retryCount + 1, max: MAX_RETRIES });

      const { state, saveCreds } = await this.sessionManager.getAuthState();
      const { version } = await fetchLatestBaileysVersion();

      logger.safeLog('info', `📱 Using WhatsApp Web version: ${version.join('.')}`);

      this.socket = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // Keep silent to reduce log noise
        printQRInTerminal: !this.sessionManager.sessionId,
        browser: [this.sessionManager.config?.BOT_NAME || 'Malvin-XD', 'Chrome', '120.0.0'], // Updated Browser Version
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },

        // ✅ STABILITY CONFIGURATION (Fixed)
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: true, // Re-enabled for better UX

        // Standard Timeouts (Don't make these too long, or it hangs)
        connectTimeoutMs: 60000, 
        defaultQueryTimeoutMs: 60000,

        // Internal Keep Alive (Let Baileys handle it)
        // 30s is the standard sweet spot. 25s is fine too.
        keepAliveIntervalMs: 30000, 

        retryRequestDelayMs: 2000,
        maxMsgRetryCount: 5, // Increased for 428 resilience

        getMessage: async (key) => {
          if (this.socket?.msgRetryCache?.has(key.id)) {
            return this.socket.msgRetryCache.get(key.id).message;
          }
          return undefined;
        },

        emitOwnEvents: true,
        shouldSyncHistoryMessage: () => false,
        shouldIgnoreJid: jid => jid === 'status@broadcast',

        patchMessageBeforeSending: (message) => {
          const requiresPatch = !!(
            message.buttonsMessage ||
            message.templateMessage ||
            message.listMessage
          );
          if (requiresPatch) {
            message = {
              viewOnceMessage: {
                message: {
                  messageContextInfo: {
                    deviceListMetadataVersion: 2,
                    deviceListMetadata: {},
                  },
                  ...message,
                },
              },
            };
          }
          return message;
        },

        mobile: false,
      });

      this.socket.msgRetryCache = new Map();

      // REMOVED: this.startKeepAlive(); 
      // Reason: Custom Keep-Alive + Internal Keep-Alive = Conflicts

      this.setupEventHandlers(saveCreds);
      this.setupConnectionListener();

    } catch (error) {
      this.isConnecting = false;
      this.status = 'error';
      this.emit('statusChange', 'error', { error: error.message });
      logger.safeError(error, '❌ Failed to initiate connection');
    } finally {
      this.isConnecting = false; 
    }
  }

  setupEventHandlers(saveCreds) {
    this.socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (error) {
        logger.safeError(error, '❌ Failed to save credentials');
      }
    });

    this.socket.ev.on('messages.upsert', (messageUpdate) => {
      this.consecutiveErrors = 0; // Reset error counter on success
      this.emit('message', { socket: this.socket, messageUpdate });

      if (messageUpdate.messages) {
        for (const msg of messageUpdate.messages) {
          if (msg.key?.id) {
            this.socket.msgRetryCache?.set(msg.key.id, msg);
          }
        }
        if (this.socket.msgRetryCache?.size > 500) {
          const entries = Array.from(this.socket.msgRetryCache.entries());
          const toDelete = entries.slice(0, 250);
          toDelete.forEach(([key]) => this.socket.msgRetryCache.delete(key));
        }
      }
    });

    // Forward other events
    this.socket.ev.on('call', (callUpdate) => this.emit('call', { socket: this.socket, callUpdate }));
    this.socket.ev.on('groups.update', (groupUpdate) => this.emit('groupUpdate', { socket: this.socket, groupUpdate }));
    this.socket.ev.on('group-participants.update', (event) => this.emit('groupParticipants', { socket: this.socket, event }));
  }

  setupConnectionListener() {
    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.safeLog('info', '📱 QR Code Generated - Scan with WhatsApp');
        this.status = 'qr_ready';
        this.emit('statusChange', 'qr_ready');
      }

      if (connection === 'connecting') {
        this.status = 'connecting';
        this.emit('statusChange', 'connecting', { attempt: this.retryCount + 1, max: MAX_RETRIES });
      }

      if (connection === 'open') {
        logger.safeLog('info', '✅ Connected to WhatsApp!');
        this.status = 'connected';
        this.retryCount = 0;
        this.consecutiveErrors = 0;
        this.emit('statusChange', 'connected');
      }

      if (connection === 'close') {
        this.status = 'disconnected';
        this.emit('statusChange', 'disconnected');

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';

        logger.warn(`❌ Connection closed: ${statusCode} - ${reason}`);

        let shouldReconnect = true;
        let cleanSessionFirst = false;

        // ✅ HANDLE 428 SPECIFICALLY (The fix for your issue)
        if (statusCode === 428) {
            logger.warn('⚠️ Connection Terminated (428). Reconnecting immediately...');
            // Do NOT clean session for 428, just reconnect fast
            this.consecutiveErrors++;
            shouldReconnect = true; 
        }

        // Handle Bad Session
        if (statusCode === DisconnectReason.badSession) {
          logger.safeError(lastDisconnect?.error, '🚫 Bad session file. Cleaning session...');
          cleanSessionFirst = true;
          shouldReconnect = true;
        }

        // Handle Logged Out
        if (statusCode === DisconnectReason.loggedOut) {
          logger.safeError(lastDisconnect?.error, '🚪 Logged out');
          shouldReconnect = false;
          cleanSessionFirst = true;
          this.status = 'error';
          this.emit('statusChange', 'error', { error: 'Logged out', requiresScan: true });
        }

        if (shouldReconnect && this.retryCount < MAX_RETRIES) {
          this.retryCount++;

          if (cleanSessionFirst) {
            this.sessionManager.cleanSession();
          }

          const delay = this.getReconnectDelay();
          logger.safeLog('info', `🔄 Reconnecting in ${delay / 1000}s...`);

          setTimeout(() => {
            this.connect().catch(e => logger.safeError(e, 'Reconnection failed'));
          }, delay);
        }
      }
    });
  }

  async disconnect() {
    if (this.socket) {
      try {
        this.socket.end();
        this.socket = null;
      } catch (error) {
        logger.warn('⚠️ Socket disconnect warning:', error.message);
      }
    }
    this.status = 'disconnected';
  }

  getSocket() { return this.socket; }
  isReady() { return this.socket && this.status === 'connected'; }
}