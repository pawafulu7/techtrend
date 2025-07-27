module.exports = {
  apps: [
    {
      name: 'techtrend-scheduler',
      script: 'scheduler.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
      },
      error_file: 'logs/scheduler-error.log',
      out_file: 'logs/scheduler-out.log',
      log_file: 'logs/scheduler-combined.log',
      time: true
    }
  ]
};