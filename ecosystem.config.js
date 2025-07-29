module.exports = {
  apps: [
    {
      name: 'techtrend-scheduler',
      script: 'scheduler-v2.ts',
      interpreter: './node_modules/.bin/tsx',
      instances: 1,
      exec_mode: 'fork',
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
      time: true,
      merge_logs: true
    }
  ]
};