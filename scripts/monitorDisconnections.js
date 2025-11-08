// scripts/monitorDisconnections.js
// Add this to log disconnection patterns for debugging

import fs from 'fs/promises';
import path from 'path';

class DisconnectionLogger {
  constructor() {
    this.logFile = path.join(process.cwd(), 'disconnect_log.json');
    this.disconnections = [];
  }

  async logDisconnection(reason, statusCode, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      reason,
      statusCode,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      ...metadata
    };

    this.disconnections.push(entry);

    // Keep only last 100 entries
    if (this.disconnections.length > 100) {
      this.disconnections = this.disconnections.slice(-100);
    }

    try {
      await fs.writeFile(
        this.logFile,
        JSON.stringify(this.disconnections, null, 2)
      );
    } catch (error) {
      console.error('Failed to write disconnect log:', error.message);
    }
  }

  async analyze() {
    try {
      const data = await fs.readFile(this.logFile, 'utf-8');
      const logs = JSON.parse(data);

      const analysis = {
        totalDisconnections: logs.length,
        byReason: {},
        averageUptime: 0,
        pattern: []
      };

      logs.forEach(log => {
        analysis.byReason[log.reason] = (analysis.byReason[log.reason] || 0) + 1;
        analysis.averageUptime += log.uptime;
      });

      analysis.averageUptime = analysis.averageUptime / logs.length / 3600; // Convert to hours

      // Detect patterns
      const recentLogs = logs.slice(-10);
      const timesBetween = [];
      for (let i = 1; i < recentLogs.length; i++) {
        const diff = new Date(recentLogs[i].timestamp) - new Date(recentLogs[i-1].timestamp);
        timesBetween.push(diff / 1000 / 60); // minutes
      }

      const avgTimeBetween = timesBetween.reduce((a, b) => a + b, 0) / timesBetween.length;
      analysis.pattern = {
        averageMinutesBetweenDisconnects: avgTimeBetween.toFixed(2),
        lastTen: recentLogs.map(l => ({
          time: l.timestamp,
          reason: l.reason,
          uptime: `${(l.uptime / 60).toFixed(1)} min`
        }))
      };

      return analysis;
    } catch (error) {
      console.error('Failed to analyze disconnections:', error.message);
      return null;
    }
  }
}

// Export singleton
export const disconnectLogger = new DisconnectionLogger();

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  disconnectLogger.analyze().then(analysis => {
    console.log('\n📊 Disconnection Analysis:\n');
    console.log(JSON.stringify(analysis, null, 2));
  });
}