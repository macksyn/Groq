// Enhanced pluginManager.js with better error handling and reloading
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.pluginStats = new Map();
    this.scheduledTasks = new Map(); // Track scheduled tasks
    this.pluginsDir = path.join(__dirname, '..', 'plugins');
    this.disabledDir = path.join(this.pluginsDir, 'disabled');
    this.loaded = false;
    this.lastHealthCheck = null;
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  // Enhanced load plugins with force reload option
  async loadPlugins(forceReload = false) {
    if (this.loaded && !forceReload) {
      return Array.from(this.plugins.values());
    }
    
    console.log(chalk.blue('🔌 Loading plugins...'));
    const startTime = Date.now();
    
    try {
      // Clear existing if force reloading
      if (forceReload) {
        this.clearAllScheduledTasks();
        this.plugins.clear();
        this.pluginStats.clear();
      }

      await this.ensureDirectories();
      
      const files = await fs.readdir(this.pluginsDir);
      const pluginFiles = files.filter(file => 
        file.endsWith('.js') && !file.startsWith('.')
      );
      
      let loadedCount = 0;
      for (const file of pluginFiles) {
        const success = await this.loadPlugin(file);
        if (success) loadedCount++;
      }
      
      this.loaded = true;
      const loadTime = Date.now() - startTime;
      
      console.log(chalk.green(`✅ Loaded ${loadedCount}/${pluginFiles.length} plugins in ${loadTime}ms`));
      this.showPluginSummary();
      
      return Array.from(this.plugins.values());
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to load plugins:'), error.message);
      return [];
    }
  }

  // Enhanced plugin loading with scheduled task tracking
  async loadPlugin(filename) {
    const pluginPath = path.join(this.pluginsDir, filename);
    
    try {
      // Clear module cache to ensure fresh load
      delete require.cache[pluginPath];
      
      const pluginModule = await import(`file://${pluginPath}?t=${Date.now()}`);
      
      if (!pluginModule.default || typeof pluginModule.default !== 'function') {
        console.log(chalk.yellow(`⚠️ Plugin ${filename} missing default export function`));
        return false;
      }
      
      const pluginInfo = {
        name: filename,
        filename: filename,
        handler: pluginModule.default,
        info: pluginModule.info || { name: filename },
        loadTime: Date.now(),
        enabled: true,
        errors: 0,
        executions: 0,
        lastExecution: null,
        scheduledTask: null // Track if this plugin has scheduled tasks
      };
      
      // Initialize scheduled tasks if plugin has them
      if (pluginModule.info?.scheduledTasks) {
        await this.initializeScheduledTasks(filename, pluginModule.info.scheduledTasks);
        pluginInfo.scheduledTask = true;
      }
      
      this.plugins.set(filename, pluginInfo);
      this.pluginStats.set(filename, {
        executions: 0,
        errors: 0,
        lastExecution: null,
        lastError: null,
        totalExecutionTime: 0,
        scheduledTaskErrors: 0
      });
      
      console.log(chalk.green(`✅ Loaded: ${filename}${pluginInfo.scheduledTask ? ' (with scheduled tasks)' : ''}`));
      return true;
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to load ${filename}:`), error.message);
      return false;
    }
  }

  // Initialize scheduled tasks for plugins
  async initializeScheduledTasks(pluginName, tasks) {
    if (!Array.isArray(tasks)) return;
    
    const cron = await import('node-cron');
    
    for (const task of tasks) {
      try {
        const cronJob = cron.default.schedule(task.schedule, async () => {
          await this.executeScheduledTask(pluginName, task);
        }, {
          scheduled: true,
          timezone: 'Africa/Lagos'
        });
        
        this.scheduledTasks.set(`${pluginName}_${task.name}`, {
          job: cronJob,
          plugin: pluginName,
          task: task,
          lastRun: null,
          errorCount: 0
        });
        
        console.log(chalk.cyan(`📅 Scheduled task: ${pluginName}/${task.name} - ${task.schedule}`));
      } catch (error) {
        console.error(chalk.red(`❌ Failed to schedule task ${task.name} for ${pluginName}:`), error.message);
      }
    }
  }

  // Execute scheduled task with error tracking
  async executeScheduledTask(pluginName, task) {
    const taskKey = `${pluginName}_${task.name}`;
    const scheduledTask = this.scheduledTasks.get(taskKey);
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin || !plugin.enabled) return;
    
    try {
      console.log(chalk.blue(`⏰ Executing scheduled task: ${pluginName}/${task.name}`));
      
      // Execute the task function
      if (typeof task.handler === 'function') {
        await task.handler();
      }
      
      // Update tracking
      if (scheduledTask) {
        scheduledTask.lastRun = new Date();
        scheduledTask.errorCount = 0;
      }
      
      console.log(chalk.green(`✅ Scheduled task completed: ${pluginName}/${task.name}`));
      
    } catch (error) {
      console.error(chalk.red(`❌ Scheduled task error ${pluginName}/${task.name}:`), error.message);
      
      // Track errors
      if (scheduledTask) {
        scheduledTask.errorCount++;
        
        // Disable task if too many errors
        if (scheduledTask.errorCount > 5) {
          console.log(chalk.red(`🚫 Disabling scheduled task ${taskKey} due to excessive errors`));
          scheduledTask.job.stop();
        }
      }
      
      // Update plugin stats
      const stats = this.pluginStats.get(pluginName);
      if (stats) {
        stats.scheduledTaskErrors++;
      }
    }
  }

  // Clear all scheduled tasks
  clearAllScheduledTasks() {
    for (const [taskKey, task] of this.scheduledTasks.entries()) {
      try {
        task.job.stop();
        task.job.destroy();
      } catch (error) {
        console.warn(`Failed to stop task ${taskKey}:`, error.message);
      }
    }
    this.scheduledTasks.clear();
    console.log(chalk.yellow('🗑️ Cleared all scheduled tasks'));
  }

  // Health monitoring for scheduled tasks
  startHealthMonitoring() {
    // Check plugin health every 10 minutes
    setInterval(async () => {
      await this.performHealthCheck();
    }, 10 * 60 * 1000);
    
    // Force reload plugins every hour if issues detected
    setInterval(async () => {
      const health = await this.healthCheck();
      if (!health.healthy && health.criticalIssues > 0) {
        console.log(chalk.yellow('🔄 Critical issues detected, reloading all plugins...'));
        await this.loadPlugins(true); // Force reload
      }
    }, 60 * 60 * 1000);
  }

  async performHealthCheck() {
    this.lastHealthCheck = new Date();
    
    // Check for stuck scheduled tasks
    for (const [taskKey, task] of this.scheduledTasks.entries()) {
      const timeSinceLastRun = Date.now() - (task.lastRun?.getTime() || 0);
      const oneHour = 60 * 60 * 1000;
      
      if (timeSinceLastRun > oneHour * 2 && task.errorCount > 0) {
        console.log(chalk.yellow(`⚠️ Restarting stuck scheduled task: ${taskKey}`));
        
        try {
          task.job.stop();
          task.job.start();
          task.errorCount = 0;
        } catch (error) {
          console.error(chalk.red(`❌ Failed to restart task ${taskKey}:`), error.message);
        }
      }
    }
  }

  // Enhanced health check with scheduled task monitoring
  async healthCheck() {
    const stats = this.getPluginStats();
    const issues = [];
    let criticalIssues = 0;
    
    // Check plugin error rates
    stats.plugins.forEach(plugin => {
      const errorRate = plugin.executions > 0 ? plugin.errors / plugin.executions : 0;
      
      if (errorRate > 0.1) {
        issues.push(`${plugin.name}: High error rate (${Math.round(errorRate * 100)}%)`);
        criticalIssues++;
      }
      
      if (plugin.avgExecutionTime > 5000) {
        issues.push(`${plugin.name}: Slow execution time (${plugin.avgExecutionTime}ms avg)`);
      }
    });
    
    // Check scheduled tasks
    let stuckTasks = 0;
    for (const [taskKey, task] of this.scheduledTasks.entries()) {
      if (task.errorCount > 3) {
        issues.push(`${taskKey}: Multiple scheduled task failures (${task.errorCount})`);
        stuckTasks++;
      }
      
      const timeSinceLastRun = Date.now() - (task.lastRun?.getTime() || 0);
      if (timeSinceLastRun > 2 * 60 * 60 * 1000) { // 2 hours
        issues.push(`${taskKey}: No execution in 2+ hours`);
        stuckTasks++;
      }
    }
    
    if (stuckTasks > 0) {
      criticalIssues += stuckTasks;
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      criticalIssues,
      scheduledTasks: {
        total: this.scheduledTasks.size,
        stuck: stuckTasks,
        active: Array.from(this.scheduledTasks.values()).filter(t => t.errorCount === 0).length
      },
      stats,
      lastHealthCheck: this.lastHealthCheck
    };
  }

  // Get scheduled task status
  getScheduledTaskStatus() {
    const tasks = [];
    
    for (const [taskKey, task] of this.scheduledTasks.entries()) {
      tasks.push({
        key: taskKey,
        plugin: task.plugin,
        name: task.task.name,
        schedule: task.task.schedule,
        lastRun: task.lastRun,
        errorCount: task.errorCount,
        isActive: task.job && !task.job.destroyed
      });
    }
    
    return {
      total: tasks.length,
      active: tasks.filter(t => t.isActive).length,
      stuck: tasks.filter(t => t.errorCount > 3).length,
      tasks
    };
  }

  // Manual trigger for scheduled tasks
  async triggerScheduledTask(taskKey) {
    const task = this.scheduledTasks.get(taskKey);
    if (!task) {
      throw new Error(`Scheduled task ${taskKey} not found`);
    }
    
    await this.executeScheduledTask(task.plugin, task.task);
    return true;
  }

  // Rest of your existing methods...
  async executePlugins(m, sock, config) {
    if (!this.loaded) {
      await this.loadPlugins();
    }
    
    const promises = [];
    
    for (const [filename, plugin] of this.plugins.entries()) {
      if (!plugin.enabled) continue;
      
      const promise = this.executePlugin(filename, plugin, m, sock, config);
      promises.push(promise);
    }
    
    await Promise.allSettled(promises);
  }

  async executePlugin(filename, plugin, m, sock, config) {
    const stats = this.pluginStats.get(filename);
    const startTime = Date.now();
    
    try {
      stats.executions++;
      stats.lastExecution = new Date();
      
      await plugin.handler(m, sock, config);
      
      const executionTime = Date.now() - startTime;
      stats.totalExecutionTime += executionTime;
      
      if (executionTime > 1000) {
        console.log(chalk.yellow(`⚠️ Slow plugin: ${filename} took ${executionTime}ms`));
      }
      
    } catch (error) {
      stats.errors++;
      stats.lastError = error.message;
      
      console.error(chalk.red(`❌ Plugin ${filename} error:`), error.message);
      
      if (stats.errors > 10) {
        console.log(chalk.red(`🚫 Disabling plugin ${filename} due to excessive errors`));
        await this.disablePlugin(filename);
      }
    }
  }

  getPluginStats() {
    const stats = {
      total: this.plugins.size,
      enabled: 0,
      disabled: 0,
      withScheduledTasks: 0,
      totalExecutions: 0,
      totalErrors: 0,
      plugins: []
    };
    
    for (const [filename, plugin] of this.plugins.entries()) {
      const pluginStats = this.pluginStats.get(filename);
      
      if (plugin.enabled) stats.enabled++;
      else stats.disabled++;
      
      if (plugin.scheduledTask) stats.withScheduledTasks++;
      
      stats.totalExecutions += pluginStats.executions;
      stats.totalErrors += pluginStats.errors;
      
      stats.plugins.push({
        name: filename,
        enabled: plugin.enabled,
        hasScheduledTasks: !!plugin.scheduledTask,
        executions: pluginStats.executions,
        errors: pluginStats.errors,
        scheduledTaskErrors: pluginStats.scheduledTaskErrors || 0,
        avgExecutionTime: pluginStats.executions > 0 
          ? Math.round(pluginStats.totalExecutionTime / pluginStats.executions) 
          : 0,
        lastExecution: pluginStats.lastExecution,
        lastError: pluginStats.lastError
      });
    }
    
    return stats;
  }

  // Add the rest of your existing methods here...
  // (enablePlugin, disablePlugin, reloadPlugin, etc. - keeping them as they were)
}

export default new PluginManager();