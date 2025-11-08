// src/core/ConnectionMonitor.js - Proactive connection health monitoring
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

export class ConnectionMonitor extends EventEmitter {
  constructor(socketManager) {
    super(); // ✅ Initialize EventEmitter
    this.socketManager = socketManager;
    this.healthCheckInterval = null;
    this.isMonitoring = false;
    this.lastSuccessfulCheck = Date.now();
    this.failedChecks = 0;
    this.maxFailedChecks = 3;
  }

  start() {
    if (this.isMonitoring) {
      logger.debug('Connection monitoring already active, skipping duplicate start');
      return;
    }

    logger.info('🏥 Initializing connection health monitoring...');
    this.isMonitoring = true;

    // ✅ Wait 45 seconds before starting health checks to allow connection to fully stabilize
    // This gives the socket time to:
    // 1. Establish WebSocket connection
    // 2. Complete authentication
    // 3. Sync initial data
    setTimeout(() => {
      if (!this.isMonitoring) {
        logger.debug('Monitoring was stopped during startup delay');
        return;
      }

      logger.info('🏥 Connection health monitoring is now active');

      // Perform first health check immediately to verify connection is ready
      this.performHealthCheck();

      // Then check every 30 seconds
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck();
      }, 30000);

    }, 45000); // 45 seconds delay
  }

  async performHealthCheck() {
    try {
      const socket = this.socketManager.getSocket();

      // Check 1: Socket exists
      if (!socket) {
        logger.debug('Health check: Socket not available');
        this.handleFailedCheck('No socket');
        return;
      }

      // Check 2: Socket has user info (most important - means authenticated)
      if (socket.user?.id) {
        // If we have user info, the connection is fundamentally working
        // even if WebSocket state is weird
        this.lastSuccessfulCheck = Date.now();
        this.failedChecks = 0;
        logger.debug('✅ Connection health check passed (user authenticated)');
        return;
      }

      // If no user info, check WebSocket state
      if (!socket.ws) {
        logger.debug('Health check: WebSocket not established');
        this.handleFailedCheck('No WebSocket');
        return;
      }

      // Check WebSocket has readyState property
      if (!('readyState' in socket.ws)) {
        logger.debug('Health check: WebSocket has no readyState property');
        this.handleFailedCheck('No readyState');
        return;
      }

      const wsState = socket.ws.readyState;

      // If state is undefined/null
      if (wsState === undefined || wsState === null) {
        logger.debug('Health check: WebSocket readyState is undefined/null');
        this.handleFailedCheck('Undefined state');
        return;
      }

      // If WebSocket is not OPEN
      if (wsState !== 1) {
        logger.debug(`Health check: WebSocket in ${this.getReadyStateText(wsState)} state`);
        this.handleFailedCheck(`State: ${this.getReadyStateText(wsState)}`);
        return;
      }

      // WebSocket is OPEN but no user info yet (still connecting)
      const timeSinceLastSuccess = Date.now() - this.lastSuccessfulCheck;
      if (timeSinceLastSuccess < 60000) {
        // Within first 60 seconds, be patient
        logger.debug('Health check: Waiting for authentication (within grace period)');
        return;
      } else {
        // After 60 seconds, no user info is a problem
        logger.debug('Health check: No user info after grace period');
        this.handleFailedCheck('No user info');
        return;
      }

    } catch (error) {
      logger.debug(`Health check error: ${error.message}`);
      this.handleFailedCheck(`Error: ${error.message}`);
    }
  }

  handleFailedCheck() {
    this.failedChecks++;

    if (this.failedChecks >= this.maxFailedChecks) {
      logger.error(`🚨 Connection health degraded: ${this.failedChecks} consecutive failures`);

      // Emit warning event
      this.socketManager.emit('healthWarning', {
        failedChecks: this.failedChecks,
        lastSuccess: new Date(this.lastSuccessfulCheck).toISOString()
      });

      // Consider forcing reconnection if checks keep failing
      if (this.failedChecks >= 5) {
        logger.error('💀 Connection appears dead. Consider manual restart.');
      }
    }
  }

  getReadyStateText(state) {
    // Handle undefined/null states
    if (state === undefined || state === null) {
      return 'UNDEFINED';
    }

    const states = {
      0: 'CONNECTING',
      1: 'OPEN',
      2: 'CLOSING',
      3: 'CLOSED'
    };

    return states[state] || `UNKNOWN(${state})`;
  }

  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.isMonitoring = false;
    logger.info('🏥 Connection health monitoring stopped');
  }

  getStats() {
    return {
      isMonitoring: this.isMonitoring,
      lastSuccessfulCheck: new Date(this.lastSuccessfulCheck).toISOString(),
      failedChecks: this.failedChecks,
      timeSinceLastSuccess: Date.now() - this.lastSuccessfulCheck
    };
  }
}