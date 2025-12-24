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
const MAX_RETRIES = 8;
const BASE_RETRY_DELAY_MS = 2000; // Increased from 1000
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

    // Add keep-alive mechanism
    this.keepAliveInterval = null;
    this.lastPingTime = Date.now();
    this.consecutiveErrors = 0;
  }

  getReconnectDelay() {
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
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !this.sessionManager.sessionId,
        browser: [this.sessionManager.config?.BOT_NAME || 'Groq', 'Chrome', '4.0.0'],
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },

        // ✅ ENHANCED CONNECTION SETTINGS FOR STABILITY
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,

        // Increased timeouts to prevent premature disconnections
        connectTimeoutMs: 60000, // 60 seconds (was 45s)
        defaultQueryTimeoutMs: 60000, // 60 seconds (was 45s)
        keepAliveIntervalMs: 25000, // 25 seconds (was 30s) - more frequent
        qrTimeout: 60000,

        // Retry configuration
        retryRequestDelayMs: 1000, // Increased from 500
        maxMsgRetryCount: 3, // Increased from 2

        // Message handling
        getMessage: async (key) => {
          if (this.socket?.msgRetryCache?.has(key.id)) {
            return this.socket.msgRetryCache.get(key.id).message;
          }
          return undefined;
        },

        // Additional stability settings
        emitOwnEvents: true,
        shouldSyncHistoryMessage: () => false,
        shouldIgnoreJid: jid => jid === 'status@broadcast',

        // Performance optimizations
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
        fireInitQueries: true,
      });

      // Enhanced message retry cache with cleanup
      this.socket.msgRetryCache = new Map();

      // Start custom keep-alive monitoring
      this.startKeepAlive();

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

  // ✅ NEW: Custom keep-alive mechanism
  startKeepAlive() {
    // Clear any existing interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    // Send periodic pings to keep connection alive
    this.keepAliveInterval = setInterval(async () => {
      try {
        if (!this.socket || !this.socket.ws || this.socket.ws.readyState !== 1) {
          logger.debug('⚠️ Socket not ready for keep-alive ping');
          return;
        }

        // Check if we've received any data recently
        const timeSinceLastPing = Date.now() - this.lastPingTime;

        if (timeSinceLastPing > 60000) { // 60 seconds without activity
          logger.debug('📡 Sending keep-alive ping...');

          // Send a lightweight query to keep connection active
          await this.socket.query({
            tag: 'iq',
            attrs: {
              to: '@s.whatsapp.net',
              type: 'get',
              xmlns: 'w:sync:app:state'
            }
          }).catch(() => {
            // Ignore errors, this is just a keep-alive
            logger.debug('Keep-alive ping failed (expected)');
          });

          this.lastPingTime = Date.now();
        }
      } catch (error) {
        logger.debug('Keep-alive error:', error.message);
      }
    }, 20000); // Check every 20 seconds
  }

  setupEventHandlers(saveCreds) {
    // Save credentials
    this.socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        this.lastPingTime = Date.now(); // Update activity time
      } catch (error) {
        logger.safeError(error, '❌ Failed to save credentials');
      }
    });

    // Forward core events
    this.socket.ev.on('messages.upsert', (messageUpdate) => {
      this.lastPingTime = Date.now(); // Update activity time
      this.consecutiveErrors = 0; // Reset error counter on successful message
      this.emit('message', { socket: this.socket, messageUpdate });

      // Enhanced retry cache with size limit
      if (messageUpdate.messages) {
        for (const msg of messageUpdate.messages) {
          if (msg.key?.id) {
            this.socket.msgRetryCache?.set(msg.key.id, msg);
          }
        }

        // Cleanup cache more aggressively
        if (this.socket.msgRetryCache?.size > 500) {
          const entries = Array.from(this.socket.msgRetryCache.entries());
          const toDelete = entries.slice(0, 250);
          toDelete.forEach(([key]) => this.socket.msgRetryCache.delete(key));
          logger.debug(`🧹 Cleaned message cache: ${toDelete.length} entries removed`);
        }
      }
    });

    this.socket.ev.on('call', (callUpdate) => {
      this.lastPingTime = Date.now();
      this.emit('call', { socket: this.socket, callUpdate });
    });

    this.socket.ev.on('groups.update', (groupUpdate) => {
      this.lastPingTime = Date.now();
      this.emit('groupUpdate', { socket: this.socket, groupUpdate });
    });

    this.socket.ev.on('group-participants.update', (event) => {
      this.lastPingTime = Date.now();
      this.emit('groupParticipants', { socket: this.socket, event });
    });

    // ✅ NEW: Monitor for connection health
    this.socket.ev.on('connection.update', () => {
      this.lastPingTime = Date.now();
    });
  }

  setupConnectionListener() {
    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.safeLog('info', '📱 QR Code Generated - Scan with WhatsApp');
        logger.safeLog('info', '💡 QR codes expire in 60 seconds. Please scan quickly!');
        this.status = 'qr_ready';
        this.emit('statusChange', 'qr_ready');
      }

      if (connection === 'connecting') {
        logger.safeLog('info', `🔄 Connecting to WhatsApp... (Attempt ${this.retryCount + 1}/${MAX_RETRIES})`);
        this.status = 'connecting';
        this.emit('statusChange', 'connecting', { attempt: this.retryCount + 1, max: MAX_RETRIES });
      }

      if (connection === 'open') {
        logger.safeLog('info', '✅ Successfully connected to WhatsApp!');
        logger.safeLog('info', `📱 Connected as: ${this.socket.user?.name || 'Unknown'}`);
        logger.safeLog('info', `📞 Phone: ${this.socket.user?.id?.split(':')[0] || 'Unknown'}`);

        this.status = 'connected';
        this.retryCount = 0;
        this.consecutiveErrors = 0; // Reset error counter
        this.lastPingTime = Date.now();
        this.emit('statusChange', 'connected');
      }

      if (connection === 'close') {
        this.status = 'disconnected';
        this.emit('statusChange', 'disconnected');

        // Stop keep-alive when disconnected
        if (this.keepAliveInterval) {
          clearInterval(this.keepAliveInterval);
          this.keepAliveInterval = null;
        }

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';

        logger.safeError(lastDisconnect?.error, `❌ Connection closed`);
        logger.warn(`📝 Status Code: ${statusCode || 'undefined'}`);
        logger.warn(`📝 Reason: ${reason}`);

        let shouldReconnect = true;
        let cleanSessionFirst = false;

        // ✅ ENHANCED: Better handling of Stream Errored (ack)
        if (statusCode === DisconnectReason.badSession) {
          if (reason.includes('Stream Errored (ack)')) {
            this.consecutiveErrors++;

            if (this.consecutiveErrors >= 3) {
              // If we've had 3 consecutive ack errors, clean session
              logger.warn('⚠️ Multiple consecutive Stream Ack errors. Cleaning session...');
              cleanSessionFirst = true;
              this.consecutiveErrors = 0;
            } else {
              logger.warn(`⚠️ Stream Ack error (${this.consecutiveErrors}/3). Reconnecting without cleaning session...`);
            }
          } else {
            logger.safeError(lastDisconnect?.error, '🚫 Bad session file. Cleaning session...');
            cleanSessionFirst = true;
          }
        }

        // Handle other disconnect reasons
        switch (statusCode) {
          case DisconnectReason.loggedOut:
            logger.safeError(lastDisconnect?.error, '🚪 Logged out - Session invalid');
            shouldReconnect = false;
            this.status = 'error';
            this.emit('statusChange', 'error', { error: 'Logged out', requiresScan: true });
            cleanSessionFirst = true;
            break;

          case DisconnectReason.connectionReplaced:
            logger.safeError(lastDisconnect?.error, '🔄 Connection replaced - Another instance detected');
            shouldReconnect = false;
            this.status = 'error';
            this.emit('statusChange', 'error', { error: 'Connection replaced' });
            break;

          case DisconnectReason.restartRequired:
            logger.warn('🔄 Server requires a restart. Retrying...');
            break;

          case DisconnectReason.timedOut:
            logger.safeError(lastDisconnect?.error, '⏰ Connection timed out. Retrying...');
            break;
        }

        // Reconnection logic
        if (shouldReconnect && this.retryCount < MAX_RETRIES) {
          this.retryCount++;

          if (cleanSessionFirst) {
            logger.safeLog('info', '🧹 Cleaning session files...');
            this.sessionManager.cleanSession();
          }

          const delay = this.getReconnectDelay();
          logger.safeLog('info', `🔄 Reconnecting in ${delay / 1000} seconds... (${this.retryCount}/${MAX_RETRIES})`);

          setTimeout(() => {
            this.connect().catch(error => {
              logger.safeError(error, '❌ Reconnection failed');
            });
          }, delay);

        } else if (this.retryCount >= MAX_RETRIES) {
          logger.safeError(lastDisconnect?.error, `💀 Maximum reconnection attempts (${MAX_RETRIES}) reached`);
          this.status = 'error';
          this.emit('statusChange', 'error', { error: 'Max retries reached' });
        }
      }
    });
  }

  async disconnect() {
    // Stop keep-alive
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    if (this.socket) {
      try {
        this.socket.end();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.warn('⚠️ Socket disconnect warning:', error.message);
      }
    }
    this.status = 'disconnected';
    this.socket = null;
    logger.safeLog('info', '🔌 Socket disconnected');
  }

  getSocket() { 
    return this.socket; 
  }

  isReady() {
    return this.socket && 
           this.socket.user?.id && 
           this.socket.ws?.readyState === 1 &&
           this.status === 'connected';
  }
}
