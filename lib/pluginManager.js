// lib/pluginManager.js - V3 (Object-based plugins)
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { safeOperation, PluginHelpers } from './pluginIntegration.js';
import { performance } from 'perf_hooks';
import logger from '../src/utils/logger.js';
import mongoManager from './mongoManager.js';

// Import all helpers
import {
  TimeHelpers,
  PermissionHelpers,
  RateLimitHelpers,
  OwnerHelpers,
  TextHelpers,
  RandomHelpers,
  FileHelpers,
  SystemHelpers,
  ValidationHelpers
} from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_CRASHES_BEFORE_DISABLE = 3;
const PLUGIN_EXECUTION_TIMEOUT_MS = 30000;
const PLUGINS_COLLECTION = 'plugin_state';

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.pluginStates = new Map();
    this.scheduledTasks = new Map();
    this.commandMap = new Map();
    this.commandQueue = [];
    this.isProcessingQueue = false;
    this.pluginsDir = path.join(__dirname, '..', 'plugins');
    this.loaded = false;
  }

  async loadPluginStatesFromDB() {
    logger.info('💾 Loading plugin states from database...');
    try {
      const states = await safeOperation(async (db, collection) => {
        return await collection.find({}).toArray();
      }, PLUGINS_COLLECTION);
      this.pluginStates.clear();
      states.forEach(state => this.pluginStates.set(state.filename, state));
      logger.info(`✅ Loaded states for ${this.pluginStates.size} plugins from DB.`);
    } catch (error) {
      logger.error(error, '❌ Failed to load plugin states from DB');
    }
  }

  async savePluginStateToDB(filename, state) {
    try {
      await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { filename },
          { $set: { ...state, updatedAt: new Date() } },
          { upsert: true }
        );
      }, PLUGINS_COLLECTION);
    } catch (error) {
      logger.error(error, `❌ Failed to save state for ${filename} to DB`);
    }
  }

  async loadPlugins(forceReload = false) {
    if (this.loaded && !forceReload) return;

    logger.info('🔌 Loading plugins...');
    if (forceReload) {
      this.clearAllScheduledTasks();
      this.plugins.clear();
      this.pluginStates.clear();
      this.commandMap.clear();
      this.loaded = false;
    }

    await this.loadPluginStatesFromDB();
    
    let loadedCount = 0, enabledCount = 0;
    try {
      const files = await fs.readdir(this.pluginsDir);
      const pluginFiles = files.filter(file => file.endsWith('.js'));

      for (const file of pluginFiles) {
        const success = await this.loadPlugin(file);
        if (success) {
          loadedCount++;
          const state = this.pluginStates.get(file);
          if (state?.enabled !== false) enabledCount++;
        }
      }
    } catch (error) {
       logger.error(error, '❌ Failed to read plugins directory');
    }

    this.loaded = true;
    logger.info(`✅ Loaded ${loadedCount} plugins (${enabledCount} enabled).`);
    logger.info(`🗺️ Mapped ${this.commandMap.size} commands.`);
  }

  async loadPlugin(filename) {
    const pluginPath = path.join(this.pluginsDir, filename);
    try {
      const pluginModule = await import(`file://${pluginPath}?t=${Date.now()}`);
      const pluginData = pluginModule.default;

      if (!pluginData || typeof pluginData.run !== 'function' || !pluginData.name) {
        logger.warn(`⚠️ Plugin ${filename} is not in V3 object format. Skipping.`);
        return false;
      }

      let state = this.pluginStates.get(filename);
      if (!state) {
        state = {
          filename, enabled: true, crashes: 0, executions: 0,
          totalExecutionTime: 0, createdAt: new Date()
        };
        this.pluginStates.set(filename, state);
        await this.savePluginStateToDB(filename, state);
      }

      const pluginInfo = {
        name: pluginData.name,
        filename: filename,
        handler: pluginData.run,
        info: pluginData,
        initialized: false,
        enabled: state.enabled,
        hasScheduledTasks: !!pluginData.scheduledTasks,
        commands: pluginData.commands || [],
        aliases: pluginData.aliases || [],
      };

      if (pluginInfo.enabled) {
        const allCommands = [...pluginInfo.commands, ...pluginInfo.aliases];
        for (const command of allCommands) {
          const cmd = command.toLowerCase();
          if (this.commandMap.has(cmd)) {
            logger.warn(`⚠️ Command conflict: '${cmd}' in ${filename} overwrites ${this.commandMap.get(cmd)}.`);
          }
          this.commandMap.set(cmd, filename);
        }
      }
      
      this.plugins.set(filename, pluginInfo);
      return true;
    } catch (error) {
      logger.error(error, `❌ Failed to load ${filename}`);
      await this.trackCrash(filename, error, 'load');
      return false;
    }
  }

  async trackCrash(filename, error, context = 'execute') {
    const state = this.pluginStates.get(filename) || {
        filename, enabled: true, crashes: 0, executions: 0,
    };
    state.crashes = (state.crashes || 0) + 1;
    state.lastError = `${context} error: ${error.message}`;
    state.lastCrashTime = new Date();
    
    logger.error(error, `💥 Crash #${state.crashes} in ${filename} (${context})`);

    if (state.enabled && state.crashes >= MAX_CRASHES_BEFORE_DISABLE) {
      state.enabled = false;
      logger.error(`🚫 Auto-disabling plugin ${filename} after ${state.crashes} crashes.`);
      const pluginInfo = this.plugins.get(filename);
      if(pluginInfo) pluginInfo.enabled = false;
    }
    this.pluginStates.set(filename, state);
    await this.savePluginStateToDB(filename, state);
  }

  async handleCommand(m, sock, config, bot) {
    const prefix = config.PREFIX;
    const commandName = m.body.slice(prefix.length).trim().split(' ')[0].toLowerCase();
    const pluginFilename = this.commandMap.get(commandName);

    if (!pluginFilename) return;

    const plugin = this.plugins.get(pluginFilename);
    const state = this.pluginStates.get(pluginFilename);

    if (!plugin || !state || !state.enabled) {
      logger.warn(`⚠️ Command '${commandName}' maps to disabled/missing plugin '${pluginFilename}'.`);
      return;
    }

    this.commandQueue.push({ plugin, m, sock, config, bot });
    await this.processQueue();
  }

  async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.commandQueue.length > 0) {
      const task = this.commandQueue.shift();
      try {
        await this.executePlugin(task.plugin, task.m, task.sock, task.config, task.bot);
      } catch (error) {
        logger.error(error, `❌ Unhandled error during queue processing`);
      }
    }
    this.isProcessingQueue = false;
  }

  async executePlugins(m, sock, config, bot) {
    for (const [filename, plugin] of this.plugins.entries()) {
      const state = this.pluginStates.get(filename);
      if (!plugin.enabled || (state && !state.enabled)) continue;
      if (plugin.commands && plugin.commands.length > 0) continue; // Skip command plugins
      await this.executePlugin(plugin, m, sock, config, bot);
    }
  }

  async executePlugin(plugin, m, sock, config, bot) {
    const filename = plugin.filename;
    const state = this.pluginStates.get(filename);
    if (!state) return;
    
    if (plugin.info.ownerOnly) {
      const isOwner = PermissionHelpers.isOwner(m.sender || '', config.OWNER_NUMBER + '@s.whatsapp.net');
      if (!isOwner) {
        return m.reply('🔒 This command is reserved for the bot owner.');
      }
    }

    const startTime = performance.now();
    try {
      state.executions = (state.executions || 0) + 1;
      state.lastExecution = new Date();

      const prefix = config.PREFIX;
      const commandBody = m.body.slice(prefix.length).trim();
      const parts = commandBody.split(' ');
      const command = parts.shift().toLowerCase();
      const args = parts;
      const text = parts.join(' ');
      
      const context = {
        msg: m, args, text, command, sock, db: mongoManager, config, bot, logger,
        helpers: {
          TimeHelpers, PermissionHelpers, RateLimitHelpers, OwnerHelpers,
          TextHelpers, RandomHelpers, FileHelpers, SystemHelpers, ValidationHelpers
        }
      };

      await Promise.race([
        plugin.handler(context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout exceeded ${PLUGIN_EXECUTION_TIMEOUT_MS}ms`)), PLUGIN_EXECUTION_TIMEOUT_MS)
        )
      ]);

      const executionTime = performance.now() - startTime;
      state.totalExecutionTime = (state.totalExecutionTime || 0) + executionTime;

    } catch (error) {
      await this.trackCrash(filename, error, 'execute');
    } finally {
      state.updatedAt = new Date();
      await this.savePluginStateToDB(filename, state);
    }
  }

  // --- Other Methods (healthCheck, getAllPlugins, etc.) ---

  async getAllPlugins() {
    const pluginList = [];
    for (const [filename, pluginInfo] of this.plugins.entries()) {
      const state = this.pluginStates.get(filename) || {};
      pluginList.push({
        filename,
        name: pluginInfo.info?.name || filename,
        description: pluginInfo.info?.description || 'No description',
        category: pluginInfo.info?.category || 'general',
        commands: pluginInfo.info?.commands || [],
        enabled: state.enabled,
        stats: {
          executions: state.executions || 0,
          crashes: state.crashes || 0,
          lastError: state.lastError,
          lastCrashTime: state.lastCrashTime
        }
      });
    }
    return pluginList;
  }
  
  async healthCheck() {
    const stats = this.getPluginStats();
    const issues = stats.plugins.filter(p => !p.enabled || p.stats.crashes > 0);
    return {
      healthy: issues.length === 0,
      issues: issues.map(p => `${p.name} is ${p.enabled ? 'enabled' : 'disabled'} with ${p.stats.crashes} crashes.`),
    };
  }

  getPluginStats() {
    const stats = { total: 0, enabled: 0, disabled: 0, plugins: [] };
    for (const [filename, pluginInfo] of this.plugins.entries()) {
        const state = this.pluginStates.get(filename) || {};
        stats.total++;
        if (state.enabled) stats.enabled++;
        else stats.disabled++;
        stats.plugins.push({
            name: pluginInfo.name,
            enabled: state.enabled,
            ...state
        });
    }
    return stats;
  }
  
  // (We'd also add back clearAllScheduledTasks, etc.)
}

export default new PluginManager();