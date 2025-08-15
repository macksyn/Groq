// lib/pluginManager.js - Advanced plugin management system
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
    this.pluginsDir = path.join(__dirname, '..', 'plugins', '...', 'economy');
    this.disabledDir = path.join(this.pluginsDir, 'disabled');
    this.loaded = false;
  }

  // Load all plugins from plugins directory
  async loadPlugins() {
    if (this.loaded) return Array.from(this.plugins.values());
    
    console.log(chalk.blue('🔌 Loading plugins...'));
    const startTime = Date.now();
    
    try {
      // Ensure directories exist
      await this.ensureDirectories();
      
      // Get all plugin files
      const files = await fs.readdir(this.pluginsDir);
      const pluginFiles = files.filter(file => 
        file.endsWith('.js') && !file.startsWith('.')
      );
      
      // Load each plugin
      for (const file of pluginFiles) {
        await this.loadPlugin(file);
      }
      
      this.loaded = true;
      const loadTime = Date.now() - startTime;
      
      console.log(chalk.green(`✅ Loaded ${this.plugins.size} plugins in ${loadTime}ms`));
      
      // Show plugin summary
      this.showPluginSummary();
      
      return Array.from(this.plugins.values());
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to load plugins:'), error.message);
      return [];
    }
  }

  // Load individual plugin
  async loadPlugin(filename) {
    const pluginPath = path.join(this.pluginsDir, filename);
    
    try {
      // Dynamic import with cache busting
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
        executions: 0
      };
      
      this.plugins.set(filename, pluginInfo);
      this.pluginStats.set(filename, {
        executions: 0,
        errors: 0,
        lastExecution: null,
        lastError: null,
        totalExecutionTime: 0
      });
      
      console.log(chalk.green(`✅ Loaded: ${filename}`));
      return true;
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to load ${filename}:`), error.message);
      return false;
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

  // Execute individual plugin with stats tracking
  async executePlugin(filename, plugin, m, sock, config) {
    const stats = this.pluginStats.get(filename);
    const startTime = Date.now();
    
    try {
      stats.executions++;
      stats.lastExecution = new Date();
      
      await plugin.handler(m, sock, config);
      
      const executionTime = Date.now() - startTime;
      stats.totalExecutionTime += executionTime;
      
      // Log slow plugins (> 1 second)
      if (executionTime > 1000) {
        console.log(chalk.yellow(`⚠️ Slow plugin: ${filename} took ${executionTime}ms`));
      }
      
    } catch (error) {
      stats.errors++;
      stats.lastError = error.message;
      
      console.error(chalk.red(`❌ Plugin ${filename} error:`), error.message);
      
      // Disable plugin if too many errors
      if (stats.errors > 10) {
        console.log(chalk.red(`🚫 Disabling plugin ${filename} due to excessive errors`));
        await this.disablePlugin(filename);
      }
    }
  }

  // Get plugin statistics
  getPluginStats() {
    const stats = {
      total: this.plugins.size,
      enabled: 0,
      disabled: 0,
      totalExecutions: 0,
      totalErrors: 0,
      plugins: []
    };
    
    for (const [filename, plugin] of this.plugins.entries()) {
      const pluginStats = this.pluginStats.get(filename);
      
      if (plugin.enabled) stats.enabled++;
      else stats.disabled++;
      
      stats.totalExecutions += pluginStats.executions;
      stats.totalErrors += pluginStats.errors;
      
      stats.plugins.push({
        name: filename,
        enabled: plugin.enabled,
        executions: pluginStats.executions,
        errors: pluginStats.errors,
        avgExecutionTime: pluginStats.executions > 0 
          ? Math.round(pluginStats.totalExecutionTime / pluginStats.executions) 
          : 0,
        lastExecution: pluginStats.lastExecution,
        lastError: pluginStats.lastError
      });
    }
    
    return stats;
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
      
      // Optionally move to disabled directory
      const sourcePath = path.join(this.pluginsDir, filename);
      const targetPath = path.join(this.disabledDir, filename);
      
      try {
        await fs.rename(sourcePath, targetPath);
        this.plugins.delete(filename);
        this.pluginStats.delete(filename);
        console.log(chalk.yellow(`🚫 Disabled plugin: ${filename}`));
      } catch (error) {
        console.log(chalk.yellow(`⚠️ Plugin ${filename} disabled in memory only`));
      }
    }
    
    return true;
  }

  // Reload specific plugin
  async reloadPlugin(filename) {
    console.log(chalk.blue(`🔄 Reloading plugin: ${filename}`));
    
    // Remove from cache
    this.plugins.delete(filename);
    this.pluginStats.delete(filename);
    
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
    
    this.plugins.clear();
    this.pluginStats.clear();
    this.loaded = false;
    
    await this.loadPlugins();
  }

  // Install plugin from URL or file
  async installPlugin(source, filename) {
    try {
      let pluginCode;
      
      if (source.startsWith('http')) {
        // Download from URL
        const response = await fetch(source);
        pluginCode = await response.text();
      } else {
        // Read from local file
        pluginCode = await fs.readFile(source, 'utf8');
      }
      
      // Validate plugin code (basic check)
      if (!pluginCode.includes('export default')) {
        throw new Error('Plugin must have default export');
      }
      
      const pluginPath = path.join(this.pluginsDir, filename);
      await fs.writeFile(pluginPath, pluginCode);
      
      // Load the new plugin
      await this.loadPlugin(filename);
      
      console.log(chalk.green(`✅ Installed plugin: ${filename}`));
      return true;
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to install plugin: ${error.message}`));
      return false;
    }
  }

  // Uninstall plugin
  async uninstallPlugin(filename) {
    try {
      const pluginPath = path.join(this.pluginsDir, filename);
      
      // Remove from memory
      this.plugins.delete(filename);
      this.pluginStats.delete(filename);
      
      // Delete file
      await fs.unlink(pluginPath);
      
      console.log(chalk.yellow(`🗑️ Uninstalled plugin: ${filename}`));
      return true;
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to uninstall ${filename}: ${error.message}`));
      return false;
    }
  }

  // List all available plugins
  listPlugins() {
    return Array.from(this.plugins.entries()).map(([filename, plugin]) => ({
      filename,
      name: plugin.info.name || filename,
      version: plugin.info.version || '1.0.0',
      author: plugin.info.author || 'Unknown',
      description: plugin.info.description || 'No description',
      commands: plugin.info.commands || [],
      enabled: plugin.enabled,
      stats: this.pluginStats.get(filename)
    }));
  }

  // Get plugin by command
  getPluginByCommand(command) {
    for (const [filename, plugin] of this.plugins.entries()) {
      if (!plugin.enabled) continue;
      
      const commands = plugin.info.commands || [];
      const hasCommand = commands.some(cmd => {
        if (typeof cmd === 'string') {
          return cmd === command;
        }
        return cmd.name === command || (cmd.aliases && cmd.aliases.includes(command));
      });
      
      if (hasCommand) {
        return { filename, plugin };
      }
    }
    
    return null;
  }

  // Show plugin summary
  showPluginSummary() {
    const stats = this.getPluginStats();
    
    console.log(chalk.cyan(`
📊 Plugin Summary:
• Total: ${stats.total}
• Enabled: ${stats.enabled}
• Disabled: ${stats.disabled}
`));
  }

  // Ensure required directories exist
  async ensureDirectories() {
    try {
      await fs.mkdir(this.pluginsDir, { recursive: true });
      await fs.mkdir(this.disabledDir, { recursive: true });
    } catch (error) {
      // Directories might already exist
    }
  }

  // Health check for plugins
  async healthCheck() {
    const stats = this.getPluginStats();
    const issues = [];
    
    // Check for plugins with high error rates
    stats.plugins.forEach(plugin => {
      const errorRate = plugin.executions > 0 ? plugin.errors / plugin.executions : 0;
      
      if (errorRate > 0.1) { // More than 10% error rate
        issues.push(`${plugin.name}: High error rate (${Math.round(errorRate * 100)}%)`);
      }
      
      if (plugin.avgExecutionTime > 5000) { // Slower than 5 seconds
        issues.push(`${plugin.name}: Slow execution time (${plugin.avgExecutionTime}ms avg)`);
      }
    });
    
    return {
      healthy: issues.length === 0,
      issues,
      stats
    };
  }
}

// Export singleton instance
export default new PluginManager();
