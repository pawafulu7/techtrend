module.exports = {
  apps: [
    {
      name: 'techtrend-scheduler',
      script: 'scripts/scheduled/scheduler.ts',
      interpreter: './node_modules/.bin/tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        SKIP_POST_SAVE_ENRICHMENT: '1', // Skip duplicate enrichment (125min->15-20min)
        COLLECT_FEEDS_CONCURRENCY: '5' // Parallel source processing (30min->10-15min)
      },
      error_file: 'logs/scheduler-error.log',
      out_file: 'logs/scheduler-out.log',
      log_file: 'logs/scheduler-combined.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'techtrend-auto-regenerate',
      script: 'scripts/scheduled/auto-regenerate.ts',
      interpreter: './node_modules/.bin/tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      cron_restart: '0 3 * * *', // 毎日午前3時に実行
      env: {
        NODE_ENV: 'production',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
      },
      error_file: 'logs/auto-regenerate-error.log',
      out_file: 'logs/auto-regenerate-out.log',
      log_file: 'logs/auto-regenerate-combined.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'techtrend-quality-check',
      script: 'scripts/scheduled/quality-check.ts',
      interpreter: './node_modules/.bin/tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      cron_restart: '0 2 * * *', // 毎日午前2時に実行
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/quality-check-error.log',
      out_file: 'logs/quality-check-out.log',
      log_file: 'logs/quality-check-combined.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'techtrend-embedding-worker',
      script: 'scripts/dev/run-embedding-worker.ts',
      interpreter: './node_modules/.bin/tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      cron_restart: '*/30 * * * *', // Every 30 minutes
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: process.env.DATABASE_URL,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        EMBEDDING_WORKER_TIMEOUT_MS: 300000,
        EMBEDDING_WORKER_BATCH_SIZE: 500
      },
      error_file: 'logs/embedding-worker-error.log',
      out_file: 'logs/embedding-worker-out.log',
      log_file: 'logs/embedding-worker-combined.log',
      time: true,
      merge_logs: true
    }
  ]
};