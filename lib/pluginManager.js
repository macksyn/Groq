// lib/pluginManager.js - Complete Advanced plugin management system
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.buttonHandlers = new Map();
    this.pluginStats = new Map();
    this.scheduledTasks = new Map(); // Track scheduled tasks
    this.pluginsDir = path.join(__dirname, '..', 'plugins');
    this.disabledDir = path.join(this.pluginsDir, 'disabled');
    this.loaded = false;
    this.lastHealthCheck = null;
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  // Ensure required directories exist - ADDED BACK
  async ensureDirectories() {
    try {
      await fs.mkdir(this.pluginsDir, { recursive: true });
      await fs.mkdir(this.disabledDir, { recursive: true });
    } catch (error) {
      // Directories might already exist, ignore error
      console.log(chalk.yellow('⚠️ Directory creation note:', error.message));
    }
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
        this.loaded = false;
      }

      await this.ensureDirectories();
      
      const files = await fs.readdir(this.pluginsDir);
      const pluginFiles = files.filter(file => 
        file.endsWith('.js') && !file.startsWith('.') && !file.startsWith('disabled')
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
      // Check if file exists
      try {
        await fs.access(pluginPath);
      } catch {
        console.log(chalk.yellow(`⚠️ Plugin file not found: ${filename}`));
        return false;
      }
      
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

      // Register button handlers
      if (pluginModule.buttonHandlers) {
        for (const [buttonId, handler] of Object.entries(pluginModule.buttonHandlers)) {
          this.buttonHandlers.set(buttonId, handler);
        }
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
    
    try {
      const cron = await import('node-cron');
      
      for (const task of tasks) {
        try {
          if (!task.schedule || !task.handler || !task.name) {
            console.log(chalk.yellow(`⚠️ Invalid scheduled task in ${pluginName}:`, task));
            continue;
          }
          
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
    } catch (importError) {
      console.error(chalk.red('❌ Failed to import node-cron:'), importError.message);
    }
  }

  // Execute scheduled task with error tracking
  async executeScheduledTask(pluginName, task) {
    const taskKey = `${pluginName}_${task.name}`;
    const scheduledTask = this.scheduledTasks.get(taskKey);
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin || !plugin.enabled) {
      console.log(chalk.yellow(`⚠️ Skipping scheduled task ${taskKey}: plugin disabled`));
      return;
    }
    
    try {
      console.log(chalk.blue(`⏰ Executing scheduled task: ${pluginName}/${task.name}`));
      
      // Execute the task handler
      if (typeof task.handler === 'function') {
        await task.handler();
      } else {
        throw new Error('Task handler is not a function');
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
          try {
            scheduledTask.job.stop();
          } catch (stopError) {
            console.warn('Error stopping failed task:', stopError.message);
          }
        }
      }
      
      // Update plugin stats
      const stats = this.pluginStats.get(pluginName);
      if (stats) {
        stats.scheduledTaskErrors = (stats.scheduledTaskErrors || 0) + 1;
      }
    }
  }

  // Clear all scheduled tasks
  clearAllScheduledTasks() {
    for (const [taskKey, task] of this.scheduledTasks.entries()) {
      try {
        if (task.job && typeof task.job.stop === 'function') {
          task.job.stop();
        }
        if (task.job && typeof task.job.destroy === 'function') {
          task.job.destroy();
        }
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
      try {
        const health = await this.healthCheck();
        if (!health.healthy && health.criticalIssues > 2) {
          console.log(chalk.yellow('🔄 Critical issues detected, reloading all plugins...'));
          await this.loadPlugins(true); // Force reload
        }
      } catch (error) {
        console.error('Health monitoring error:', error.message);
      }
    }, 60 * 60 * 1000);
  }

  async performHealthCheck() {
    this.lastHealthCheck = new Date();
    
    // Check for stuck scheduled tasks
    for (const [taskKey, task] of this.scheduledTasks.entries()) {
      const timeSinceLastRun = Date.now() - (task.lastRun?.getTime() || 0);
      const twoHours = 2 * 60 * 60 * 1000;
      
      if (timeSinceLastRun > twoHours && task.errorCount > 0) {
        console.log(chalk.yellow(`⚠️ Restarting stuck scheduled task: ${taskKey}`));
        
        try {
          if (task.job && typeof task.job.stop === 'function') {
            task.job.stop();
          }
          if (task.job && typeof task.job.start === 'function') {
            task.job.start();
          }
          task.errorCount = 0;
        } catch (error) {
          console.error(chalk.red(`❌ Failed to restart task ${taskKey}:`), error.message);
        }
      }
    }
  }

  // Execute all plugins for a message
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
    
    // Execute all plugins concurrently
    await Promise.allSettled(promises);
  }

  // Execute button handler
  async executeButtonHandler(m, sock, config) {
    const buttonId = m.body;
    const handler = this.buttonHandlers.get(buttonId);

    if (handler) {
      try {
        await handler(m, sock, config);
      } catch (error) {
        console.error(chalk.red(`❌ Button handler error for ID ${buttonId}:`), error.message);
      }
    }
  }

  // Execute individual plugin with stats tracking
  async executePlugin(filename, plugin, m, sock, config) {
    const stats = this.pluginStats.get(filename);
    if (!stats) return;
    
    const startTime = Date.now();
    
    try {
      stats.executions++;
      stats.lastExecution = new Date();
      
      await plugin.handler(m, sock, config);
      
      const executionTime = Date.now() - startTime;
      stats.totalExecutionTime += executionTime;
      
      // Log slow plugins (> 2 seconds)
      if (executionTime > 2000) {
        console.log(chalk.yellow(`⚠️ Slow plugin: ${filename} took ${executionTime}ms`));
      }
      
    } catch (error) {
      stats.errors++;
      stats.lastError = error.message;
      
      console.error(chalk.red(`❌ Plugin ${filename} error:`), error.message);
      
      // Disable plugin if too many errors
      if (stats.errors > 15) {
        console.log(chalk.red(`🚫 Disabling plugin ${filename} due to excessive errors`));
        plugin.enabled = false;
      }
    }
  }

  // Get plugin statistics
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
      
      if (pluginStats) {
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
    }
    
    return stats;
  }

  // Enhanced health check with scheduled task monitoring
  async healthCheck() {
    const stats = this.getPluginStats();
    const issues = [];
    let criticalIssues = 0;
    
    // Check plugin error rates
    stats.plugins.forEach(plugin => {
      const errorRate = plugin.executions > 0 ? plugin.errors / plugin.executions : 0;
      
      if (errorRate > 0.2) { // More than 20% error rate
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
        description: task.task.description || 'No description',
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
    
    console.log(chalk.blue(`🔧 Manually triggering scheduled task: ${taskKey}`));
    await this.executeScheduledTask(task.plugin, task.task);
    return true;
  }

  // Enable plugin
  async enablePlugin(filename) {
    const plugin = this.plugins.get(filename);
    
    if (!plugin) {
      // Try to move from disabled directory
      const disabledPath = path.join(this.disabledDir, filename);
      const enabledPath = path.join(this.pluginsDir, filename);
      
      try {
        await fs.rename(disabledPath, enabledPath);
        await this.loadPlugin(filename);
        console.log(chalk.green(`✅ Enabled plugin: ${filename}`));
        return true;
      } catch (error) {
        console.log(chalk.red(`❌ Failed to enable ${filename}:`), error.message);
        return false;
      }
    }
    
    plugin.enabled = true;
    console.log(chalk.green(`✅ Enabled plugin: ${filename}`));
    return true;
  }

  // Disable plugin
  async disablePlugin(filename) {
    const plugin = this.plugins.get(filename);
    
    if (plugin) {
      plugin.enabled = false;
      console.log(chalk.yellow(`🚫 Disabled plugin: ${filename}`));
    }
    
    return true;
  }

  // Reload specific plugin
  async reloadPlugin(filename) {
    console.log(chalk.blue(`🔄 Reloading plugin: ${filename}`));
    
    // Remove from cache
    this.plugins.delete(filename);
    this.pluginStats.delete(filename);
    
    // Clear any scheduled tasks from this plugin
    const tasksToRemove = [];
    for (const [taskKey, task] of this.scheduledTasks.entries()) {
      if (task.plugin === filename) {
        tasksToRemove.push(taskKey);
      }
    }
    
    for (const taskKey of tasksToRemove) {
      const task = this.scheduledTasks.get(taskKey);
      if (task?.job) {
        try {
          task.job.stop();
          task.job.destroy();
        } catch (error) {
          console.warn('Error stopping task during reload:', error.message);
        }
      }
      this.scheduledTasks.delete(taskKey);
    }
    
    // Reload
    const success = await this.loadPlugin(filename);
    
    if (success) {
      console.log(chalk.green(`✅ Reloaded plugin: ${filename}`));
    }
    
    return success;
  }

  // Reload all plugins
  async reloadAllPlugins() {
    console.log(chalk.blue('🔄 Reloading all plugins...'));
    
    this.clearAllScheduledTasks();
    this.plugins.clear();
    this.pluginStats.clear();
    this.loaded = false;
    
    await this.loadPlugins();
  }

  // Get all plugins info
  async getAllPlugins() {
    const pluginList = [];
    
    for (const [filename, plugin] of this.plugins.entries()) {
      const stats = this.pluginStats.get(filename);
      
      pluginList.push({
        filename,
        name: plugin.info?.name || filename,
        version: plugin.info?.version || '1.0.0',
        author: plugin.info?.author || 'Unknown',
        description: plugin.info?.description || 'No description',
        category: plugin.info?.category || 'general',
        commands: plugin.info?.commands || [],
        scheduledTasks: plugin.info?.scheduledTasks || [],
        enabled: plugin.enabled,
        hasScheduledTasks: !!plugin.scheduledTask,
        stats: stats ? {
          executions: stats.executions,
          errors: stats.errors,
          lastExecution: stats.lastExecution,
          avgExecutionTime: stats.executions > 0 
            ? Math.round(stats.totalExecutionTime / stats.executions) 
            : 0
        } : null
      });
    }
    
    return pluginList;
  }

  // Show plugin summary
  showPluginSummary() {
    const stats = this.getPluginStats();
    
    console.log(chalk.cyan(`
📊 Plugin Summary:
• Total: ${stats.total}
• Enabled: ${stats.enabled}
• Disabled: ${stats.disabled}
• With Scheduled Tasks: ${stats.withScheduledTasks}
• Total Scheduled Tasks: ${this.scheduledTasks.size}
`));
    
    if (this.scheduledTasks.size > 0) {
      console.log(chalk.cyan('📅 Active Scheduled Tasks:'));
      for (const [taskKey, task] of this.scheduledTasks.entries()) {
        console.log(chalk.cyan(`   • ${taskKey}: ${task.task.schedule}`));
      }
    }
  }
}

// Export singleton instance
export default new PluginManager();
