// lib/pluginManager.js - V3 (With Scheduled Task Support)
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { safeOperation, PluginHelpers } from './pluginIntegration.js';
import { performance } from 'perf_hooks';
import logger from '../src/utils/logger.js';
import mongoManager from './mongoManager.js';
import cron from 'node-cron';

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
const SCHEDULED_TASKS_COLLECTION = 'scheduled_tasks';

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.pluginStates = new Map();
    this.scheduledTasks = new Map();
    this.cronJobs = new Map();
    this.commandMap = new Map();
    this.commandQueue = [];
    this.isProcessingQueue = false;
    this.pluginsDir = path.join(__dirname, '..', 'plugins');
    this.loaded = false;
    this.sock = null;
    this.config = null;
    this.bot = null;
  }

  // Store references for scheduled tasks
  setReferences(sock, config, bot) {
    this.sock = sock;
    this.config = config;
    this.bot = bot;
    logger.info('🔗 PluginManager references updated for scheduled tasks');
  }

  async loadPluginStatesFromDB() {
    logger.info('💾 Loading plugin states from database...');
    try {
      const states = await safeOperation(async (db, collection) => {
        return await collection.find({}).toArray();
      }, PLUGINS_COLLECTION);
      
      if (!states) {
        logger.warn('⚠️ No plugin states loaded from DB');
        return;
      }
      
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
    
    // Initialize scheduled tasks AFTER all plugins are loaded
    await this.initializeScheduledTasks();
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
        scheduledTasks: pluginData.scheduledTasks || [],
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

  async enablePlugin(filename) {
    const pluginInfo = this.plugins.get(filename);
    const state = this.pluginStates.get(filename);

    if (!pluginInfo || !state) {
      return { success: false, message: 'Plugin not found.' };
    }

    if (state.enabled) {
      return { success: false, message: 'Plugin is already enabled.' };
    }

    state.enabled = true;
    pluginInfo.enabled = true;
    
    const allCommands = [...pluginInfo.commands, ...pluginInfo.aliases];
    for (const command of allCommands) {
      const cmd = command.toLowerCase();
      if (this.commandMap.has(cmd)) {
        logger.warn(`⚠️ Command conflict: '${cmd}' in ${filename} overwrites ${this.commandMap.get(cmd)}.`);
      }
      this.commandMap.set(cmd, filename);
    }

    try {
      await this.savePluginStateToDB(filename, state);
      
      // Re-initialize scheduled tasks for this plugin
      if (pluginInfo.hasScheduledTasks) {
        await this.registerScheduledTasks(filename, pluginInfo);
      }
      
      logger.info(`✅ Plugin ${filename} enabled.`);
      return { success: true, message: 'Plugin enabled.' };
    } catch (error) {
      logger.error(error, `❌ Failed to save state for enabling ${filename}`);
      state.enabled = false;
      pluginInfo.enabled = false;
      allCommands.forEach(cmd => this.commandMap.delete(cmd.toLowerCase()));
      return { success: false, message: 'Failed to update database.' };
    }
  }

  async disablePlugin(filename) {
    const pluginInfo = this.plugins.get(filename);
    const state = this.pluginStates.get(filename);

    if (!pluginInfo || !state) {
      return { success: false, message: 'Plugin not found.' };
    }

    if (!state.enabled) {
      return { success: false, message: 'Plugin is already disabled.' };
    }

    state.enabled = false;
    pluginInfo.enabled = false;

    const allCommands = [...pluginInfo.commands, ...pluginInfo.aliases];
    for (const command of allCommands) {
      this.commandMap.delete(command.toLowerCase());
    }

    // Stop scheduled tasks for this plugin
    this.stopPluginScheduledTasks(filename);

    try {
      await this.savePluginStateToDB(filename, state);
      logger.info(`❌ Plugin ${filename} disabled.`);
      return { success: true, message: 'Plugin disabled.' };
    } catch (error) {
      logger.error(error, `❌ Failed to save state for disabling ${filename}`);
      state.enabled = true;
      pluginInfo.enabled = true;
      allCommands.forEach(cmd => this.commandMap.set(cmd.toLowerCase(), filename));
      return { success: false, message: 'Failed to update database.' };
    }
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

  // ============================================================
  // SCHEDULED TASKS SYSTEM
  // ============================================================

  async initializeScheduledTasks() {
    logger.info('⏰ Initializing scheduled tasks...');
    
    let totalTasks = 0;
    let registeredTasks = 0;

    for (const [filename, pluginInfo] of this.plugins.entries()) {
      const state = this.pluginStates.get(filename);
      
      // Only initialize tasks for enabled plugins
      if (!pluginInfo.enabled || (state && !state.enabled)) {
        logger.debug(`⏭️ Skipping tasks for disabled plugin: ${filename}`);
        continue;
      }

      if (pluginInfo.hasScheduledTasks && pluginInfo.scheduledTasks.length > 0) {
        totalTasks += pluginInfo.scheduledTasks.length;
        const registered = await this.registerScheduledTasks(filename, pluginInfo);
        registeredTasks += registered;
      }
    }

    logger.info(`✅ Scheduled tasks initialized: ${registeredTasks}/${totalTasks} tasks registered`);
  }

  async registerScheduledTasks(filename, pluginInfo) {
    let registeredCount = 0;

    for (const task of pluginInfo.scheduledTasks) {
      try {
        if (!task.schedule || !task.handler) {
          logger.warn(`⚠️ Invalid task in ${filename}: missing schedule or handler`);
          continue;
        }

        // Validate cron expression
        if (!cron.validate(task.schedule)) {
          logger.error(`❌ Invalid cron expression in ${filename}: ${task.schedule}`);
          continue;
        }

        const taskId = `${filename}:${task.name || 'unnamed'}`;
        
        // Check if task already exists
        if (this.cronJobs.has(taskId)) {
          logger.debug(`⏭️ Task already registered: ${taskId}`);
          continue;
        }

        // Create cron job
        const cronJob = cron.schedule(task.schedule, async () => {
          await this.executeScheduledTask(filename, task, pluginInfo);
        }, {
          scheduled: true,
          timezone: 'Africa/Lagos'
        });

        this.cronJobs.set(taskId, cronJob);
        
        // Store task metadata
        this.scheduledTasks.set(taskId, {
          filename,
          pluginName: pluginInfo.name,
          taskName: task.name || 'unnamed',
          schedule: task.schedule,
          description: task.description || 'No description',
          enabled: true,
          lastRun: null,
          nextRun: this.getNextRun(task.schedule),
          totalRuns: 0,
          failures: 0,
          lastError: null
        });

        registeredCount++;
        logger.info(`⏰ Registered task: ${taskId} (${task.schedule})`);

        // Save to database
        await this.saveScheduledTaskState(taskId);

      } catch (error) {
        logger.error(error, `❌ Failed to register task in ${filename}: ${task.name}`);
      }
    }

    return registeredCount;
  }

  async executeScheduledTask(filename, task, pluginInfo) {
    const taskId = `${filename}:${task.name || 'unnamed'}`;
    const taskMetadata = this.scheduledTasks.get(taskId);

    if (!taskMetadata || !taskMetadata.enabled) {
      logger.debug(`⏭️ Skipping disabled task: ${taskId}`);
      return;
    }

    const startTime = performance.now();
    logger.info(`⏰ Executing scheduled task: ${taskId}`);

    try {
      // Create context for scheduled task
      const context = {
        sock: this.sock,
        db: mongoManager,
        config: this.config,
        bot: this.bot,
        logger: logger,
        helpers: {
          TimeHelpers, PermissionHelpers, RateLimitHelpers, OwnerHelpers,
          TextHelpers, RandomHelpers, FileHelpers, SystemHelpers, ValidationHelpers
        }
      };

      // Execute task with timeout
      await Promise.race([
        task.handler(context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Task timeout exceeded')), 5 * 60 * 1000) // 5 minute timeout
        )
      ]);

      const executionTime = performance.now() - startTime;

      // Update task metadata
      taskMetadata.lastRun = new Date();
      taskMetadata.nextRun = this.getNextRun(task.schedule);
      taskMetadata.totalRuns++;
      taskMetadata.lastError = null;

      logger.info(`✅ Task completed: ${taskId} (${executionTime.toFixed(2)}ms)`);

      // Save state to database
      await this.saveScheduledTaskState(taskId);

    } catch (error) {
      logger.error(error, `❌ Task failed: ${taskId}`);

      // Update failure count
      taskMetadata.failures++;
      taskMetadata.lastError = error.message;
      taskMetadata.lastRun = new Date();

      // Auto-disable after 5 consecutive failures
      if (taskMetadata.failures >= 5) {
        taskMetadata.enabled = false;
        logger.error(`🚫 Auto-disabled task after 5 failures: ${taskId}`);
        
        // Stop the cron job
        const cronJob = this.cronJobs.get(taskId);
        if (cronJob) {
          cronJob.stop();
        }
      }

      await this.saveScheduledTaskState(taskId);
    }
  }

  async saveScheduledTaskState(taskId) {
    try {
      const taskMetadata = this.scheduledTasks.get(taskId);
      if (!taskMetadata) return;

      await safeOperation(async (db, collection) => {
        await collection.updateOne(
          { taskId },
          { $set: { ...taskMetadata, updatedAt: new Date() } },
          { upsert: true }
        );
      }, SCHEDULED_TASKS_COLLECTION);
    } catch (error) {
      logger.error(error, `❌ Failed to save task state: ${taskId}`);
    }
  }

  async loadScheduledTaskStates() {
    try {
      const states = await safeOperation(async (db, collection) => {
        return await collection.find({}).toArray();
      }, SCHEDULED_TASKS_COLLECTION);

      if (!states) return;

      states.forEach(state => {
        const existing = this.scheduledTasks.get(state.taskId);
        if (existing) {
          // Merge saved state with current state
          Object.assign(existing, {
            totalRuns: state.totalRuns || 0,
            failures: state.failures || 0,
            lastRun: state.lastRun,
            lastError: state.lastError
          });
        }
      });

      logger.info(`✅ Loaded states for ${states.length} scheduled tasks`);
    } catch (error) {
      logger.error(error, '❌ Failed to load scheduled task states');
    }
  }

  getNextRun(cronExpression) {
    try {
      // Simple next run calculation (approximate)
      // For more accurate, you could use a library like 'cron-parser'
      const now = new Date();
      const nextRun = new Date(now.getTime() + 60000); // Placeholder: 1 minute
      return nextRun;
    } catch (error) {
      return null;
    }
  }

  stopPluginScheduledTasks(filename) {
    let stoppedCount = 0;

    for (const [taskId, cronJob] of this.cronJobs.entries()) {
      if (taskId.startsWith(filename + ':')) {
        cronJob.stop();
        this.cronJobs.delete(taskId);
        
        const taskMetadata = this.scheduledTasks.get(taskId);
        if (taskMetadata) {
          taskMetadata.enabled = false;
        }
        
        stoppedCount++;
        logger.info(`⏹️ Stopped task: ${taskId}`);
      }
    }

    if (stoppedCount > 0) {
      logger.info(`⏹️ Stopped ${stoppedCount} scheduled task(s) for ${filename}`);
    }
  }

  clearAllScheduledTasks() {
    logger.info('🧹 Clearing all scheduled tasks...');
    
    for (const [taskId, cronJob] of this.cronJobs.entries()) {
      cronJob.stop();
      logger.debug(`⏹️ Stopped: ${taskId}`);
    }

    this.cronJobs.clear();
    this.scheduledTasks.clear();
    
    logger.info('✅ All scheduled tasks cleared');
  }

  getScheduledTasksInfo() {
    const tasks = [];

    for (const [taskId, metadata] of this.scheduledTasks.entries()) {
      tasks.push({
        taskId,
        ...metadata,
        isRunning: this.cronJobs.has(taskId)
      });
    }

    return {
      total: tasks.length,
      enabled: tasks.filter(t => t.enabled).length,
      disabled: tasks.filter(t => !t.enabled).length,
      tasks
    };
  }

  async toggleScheduledTask(taskId, enable) {
    const taskMetadata = this.scheduledTasks.get(taskId);
    const cronJob = this.cronJobs.get(taskId);

    if (!taskMetadata) {
      return { success: false, message: 'Task not found' };
    }

    if (enable) {
      if (taskMetadata.enabled) {
        return { success: false, message: 'Task is already enabled' };
      }

      if (cronJob) {
        cronJob.start();
      }

      taskMetadata.enabled = true;
      taskMetadata.failures = 0; // Reset failure count
      await this.saveScheduledTaskState(taskId);

      logger.info(`▶️ Enabled scheduled task: ${taskId}`);
      return { success: true, message: 'Task enabled' };

    } else {
      if (!taskMetadata.enabled) {
        return { success: false, message: 'Task is already disabled' };
      }

      if (cronJob) {
        cronJob.stop();
      }

      taskMetadata.enabled = false;
      await this.saveScheduledTaskState(taskId);

      logger.info(`⏸️ Disabled scheduled task: ${taskId}`);
      return { success: true, message: 'Task disabled' };
    }
  }

  // ============================================================
  // OTHER METHODS
  // ============================================================

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
        hasScheduledTasks: pluginInfo.hasScheduledTasks,
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
    const taskInfo = this.getScheduledTasksInfo();
    const issues = stats.plugins.filter(p => !p.enabled || p.stats.crashes > 0);
    const taskIssues = taskInfo.tasks.filter(t => !t.enabled || t.failures > 0);
    
    return {
      healthy: issues.length === 0 && taskIssues.length === 0,
      issues: [
        ...issues.map(p => `${p.name} is ${p.enabled ? 'enabled' : 'disabled'} with ${p.stats.crashes} crashes.`),
        ...taskIssues.map(t => `Task ${t.taskName} has ${t.failures} failures`)
      ],
      scheduledTasks: taskInfo
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
}

export default new PluginManager();