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
      max_restarts: 10,
      restart_delay: 30000,
      min_uptime: '60s',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development', // Local PM2 environment (enables .env.local loading)
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        COLLECT_FEEDS_CONCURRENCY: '7', // Parallel source processing (optimized from 5->7)
        FETCHER_TIMEOUT_MS: process.env.FETCHER_TIMEOUT_MS || '60000', // Per-source fetch timeout (ms)
        SKIP_POST_SAVE_ENRICHMENT: '0', // Enable post-save enrichment (required for embedding job enqueue)
        POST_SAVE_ENRICH_TIMEOUT_MS: '10000', // Post-save enrichment timeout (10s)
        POST_SAVE_ENRICH_SLEEP_MS: '0' // No sleep between enrichments (was 2000ms)
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
      autorestart: false, // Batch job: rely on cron_restart for scheduling
      watch: false,
      max_restarts: 10,
      restart_delay: 30000,
      min_uptime: '60s',
      max_memory_restart: '500M',
      cron_restart: '0 3 * * *', // Daily at 3:00 AM
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
      autorestart: false, // Batch job: rely on cron_restart for scheduling
      watch: false,
      max_restarts: 10,
      restart_delay: 30000,
      min_uptime: '60s',
      max_memory_restart: '500M',
      cron_restart: '0 2 * * *', // Daily at 2:00 AM
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
      autorestart: false, // Batch job: rely on cron_restart for scheduling
      watch: false,
      max_restarts: 10,
      restart_delay: 30000,
      min_uptime: '60s',
      max_memory_restart: '1G',
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
    },
    {
      name: 'techtrend-title-translator',
      script: 'scripts/maintenance/fix-missing-translations.ts',
      interpreter: './node_modules/.bin/tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false, // Batch job: rely on cron_restart for scheduling
      watch: false,
      max_restarts: 10,
      restart_delay: 30000,
      min_uptime: '60s',
      max_memory_restart: '500M',
      cron_restart: '0 * * * *', // Every hour at minute 0
      env: {
        NODE_ENV: 'production',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
      },
      error_file: 'logs/title-translator-error.log',
      out_file: 'logs/title-translator-out.log',
      log_file: 'logs/title-translator-combined.log',
      time: true,
      merge_logs: true
    }
  ]
};
