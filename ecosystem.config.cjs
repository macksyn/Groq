module.exports = {
  apps: [
    {
      name: 'Groq AI',
      script: 'index.js',
      
      // Runtime options
      node_args: '--expose-gc --max-old-space-size=2048',
      exec_mode: 'fork',
      instances: 1,
      
      // Auto-restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '30s',
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        watch: true
      },
      
      // Health monitoring for PM2
      kill_timeout: 10000,
      listen_timeout: 8000,
      shutdown_with_message: true,
      
      // Health check endpoint
      health_check_http: 'http://localhost:3000/health',
      health_check_grace_period: 10000
    }
  ]
};
