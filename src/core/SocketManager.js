// src/core/SocketManager.js - FIXED: Better conflict handling
import { EventEmitter } from 'events';
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import logger from '../utils/logger.js';

const MAX_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;
const CONFLICT_RETRY_DELAY_MS = 8000; // ✅ Special delay for conflicts

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
    this.lastDisconnectReason = null; // ✅ Track last disconnect
  }

  getReconnectDelay() {
    // ✅ CONFLICT-SPECIFIC DELAY
    if (this.lastDisconnectReason === 'conflict') {
      return CONFLICT_RETRY_DELAY_MS;
    }

    // For 428 errors, reconnect quickly
    if (this.consecutiveErrors > 0 && this.consecutiveErrors < 3) {
      return 2000;
    }

    // Standard exponential backoff
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
      this.emit('statusChange', 'connecting', { 
        attempt: this.retryCount + 1, 
        max: MAX_RETRIES 
      });

      const { state, saveCreds } = await this.sessionManager.getAuthState();
      const { version } = await fetchLatestBaileysVersion();

      logger.safeLog('info', `📱 Using WhatsApp Web version: ${version.join('.')}`);

      this.socket = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !this.sessionManager.sessionId,
        browser: [
          this.sessionManager.config?.BOT_NAME || 'Malvin-XD', 
          'Chrome', 
          '120.0.0'
        ],
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },

        // ✅ OPTIMIZED FOR CONFLICT HANDLING
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,

        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,

        retryRequestDelayMs: 2000,
        maxMsgRetryCount: 5,

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
      this.consecutiveErrors = 0;
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

    this.socket.ev.on('call', (callUpdate) => {
      this.emit('call', { socket: this.socket, callUpdate });
    });

    this.socket.ev.on('groups.update', (groupUpdate) => {
      this.emit('groupUpdate', { socket: this.socket, groupUpdate });
    });

    this.socket.ev.on('group-participants.update', (event) => {
      this.emit('groupParticipants', { socket: this.socket, event });
    });
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
        this.emit('statusChange', 'connecting', { 
          attempt: this.retryCount + 1, 
          max: MAX_RETRIES 
        });
      }

      if (connection === 'open') {
        logger.safeLog('info', '✅ Connected to WhatsApp!');
        this.status = 'connected';
        this.retryCount = 0;
        this.consecutiveErrors = 0;
        this.lastDisconnectReason = null; // ✅ Clear disconnect reason
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

        // ✅ HANDLE 440 CONFLICT SPECIFICALLY
        if (statusCode === 440 && reason.includes('conflict')) {
          this.consecutiveErrors++;
          this.lastDisconnectReason = 'conflict'; // ✅ Mark as conflict

          if (this.consecutiveErrors >= 3) {
            logger.warn('⚠️ Multiple conflicts detected. This may indicate another instance is running.');
            logger.warn('💡 Waiting longer before retry to let old session expire...');
          } else {
            logger.warn(`⚠️ Connection conflict (${this.consecutiveErrors}/3). Another session may be active.`);
            logger.warn('💡 Waiting for old session to expire before reconnecting...');
          }

          shouldReconnect = true;
          // Don't clean session on conflict - we just need to wait
          cleanSessionFirst = false;
        }

        // ✅ HANDLE 428 SPECIFICALLY
        else if (statusCode === 428) {
          this.consecutiveErrors++;
          this.lastDisconnectReason = '428';

          if (this.consecutiveErrors >= 3) {
            logger.warn('⚠️ Multiple 428 errors. Cleaning session...');
            cleanSessionFirst = true;
            this.consecutiveErrors = 0;
          } else {
            logger.warn(`⚠️ Stream error (${this.consecutiveErrors}/3). Reconnecting...`);
          }
          shouldReconnect = true;
        }

        // Handle Bad Session
        else if (statusCode === DisconnectReason.badSession) {
          logger.safeError(lastDisconnect?.error, '🚫 Bad session file. Cleaning session...');
          this.lastDisconnectReason = 'badSession';
          cleanSessionFirst = true;
          shouldReconnect = true;
        }

        // Handle Logged Out
        else if (statusCode === DisconnectReason.loggedOut) {
          logger.safeError(lastDisconnect?.error, '🚪 Logged out');
          this.lastDisconnectReason = 'loggedOut';
          shouldReconnect = false;
          cleanSessionFirst = true;
          this.status = 'error';
          this.emit('statusChange', 'error', { 
            error: 'Logged out', 
            requiresScan: true 
          });
        }

        // Handle Connection Replaced
        else if (statusCode === DisconnectReason.connectionReplaced) {
          logger.warn('🔄 Connection replaced by another instance');
          this.lastDisconnectReason = 'replaced';
          shouldReconnect = false;
          this.status = 'error';
          this.emit('statusChange', 'error', { 
            error: 'Connection replaced' 
          });
        }

        // Other disconnects
        else {
          this.lastDisconnectReason = 'other';
        }

        // Reconnection logic
        if (shouldReconnect && this.retryCount < MAX_RETRIES) {
          this.retryCount++;

          if (cleanSessionFirst) {
            logger.safeLog('info', '🧹 Cleaning session files...');
            this.sessionManager.cleanSession();
          }

          const delay = this.getReconnectDelay();
          const delaySeconds = (delay / 1000).toFixed(1);

          // ✅ IMPROVED LOGGING
          if (this.lastDisconnectReason === 'conflict') {
            logger.safeLog('info', 
              `🔄 Waiting ${delaySeconds}s for old session to expire... (${this.retryCount}/${MAX_RETRIES})`
            );
          } else {
            logger.safeLog('info', 
              `🔄 Reconnecting in ${delaySeconds}s... (${this.retryCount}/${MAX_RETRIES})`
            );
          }

          setTimeout(() => {
            this.connect().catch(e => 
              logger.safeError(e, 'Reconnection failed')
            );
          }, delay);

        } else if (this.retryCount >= MAX_RETRIES) {
          logger.safeError(
            lastDisconnect?.error, 
            `💀 Maximum reconnection attempts (${MAX_RETRIES}) reached`
          );
          this.status = 'error';
          this.emit('statusChange', 'error', { 
            error: 'Max retries reached' 
          });
        }
      }
    });
  }

  async disconnect() {
    if (this.socket) {
      try {
        // ✅ PROPER CLEANUP: Send logout signal
        if (this.socket.ws?.readyState === 1) {
          logger.info('📤 Sending logout signal to WhatsApp...');
          await this.socket.logout();
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        this.socket.end();
        this.socket = null;
      } catch (error) {
        logger.warn('⚠️ Socket disconnect warning:', error.message);
      }
    }
    this.status = 'disconnected';
  }

  getSocket() {
    return this.socket;
  }

  isReady() {
    return this.socket && this.status === 'connected';
  }
}
