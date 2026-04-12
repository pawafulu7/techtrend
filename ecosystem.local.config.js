// PM2 configuration for local development with dotenv
const path = require('path');

// Explicitly load .env from project root
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: 'techtrend-scheduler-local',
      script: 'scripts/scheduled/scheduler.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        // .envファイルから読み込まれた環境変数を設定
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || process.env.NEXTAUTH_URL,
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
        SKIP_POST_SAVE_ENRICHMENT: '0', // Enable post-save enrichment (required for Phase 2)
        COLLECT_FEEDS_CONCURRENCY: '5', // Parallel source processing (30min->10-15min)
        FETCHER_TIMEOUT_MS: process.env.FETCHER_TIMEOUT_MS || '600000', // Per-source fetch timeout (10 min, extended for arXiv)
        ARXIV_ENRICHMENT_CONCURRENCY: process.env.ARXIV_ENRICHMENT_CONCURRENCY || '5', // arXiv parallel enrichment
        POST_SAVE_ENRICH_TIMEOUT_MS: '10000', // Post-save enrichment timeout (10s)
        POST_SAVE_ENRICH_SLEEP_MS: '0' // No sleep between enrichments (was 2000ms)
      },
      error_file: 'logs/scheduler-error.log',
      out_file: 'logs/scheduler-out.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'techtrend-auto-regenerate-local',
      script: 'scripts/scheduled/auto-regenerate.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      cron_restart: '0 3 * * *', // 毎日午前3時に実行
      env: {
        NODE_ENV: 'development',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL
      },
      error_file: 'logs/auto-regenerate-error.log',
      out_file: 'logs/auto-regenerate-out.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'techtrend-quality-check-local',
      script: 'scripts/scheduled/quality-check.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      cron_restart: '0 2 * * *', // 毎日午前2時に実行
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL
      },
      error_file: 'logs/quality-check-error.log',
      out_file: 'logs/quality-check-out.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'techtrend-embedding-worker-local',
      script: 'scripts/dev/run-embedding-worker.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      cron_restart: '0 * * * *', // 1時間ごとに実行
      env: {
        NODE_ENV: 'development',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
      },
      error_file: 'logs/embedding-worker-error.log',
      out_file: 'logs/embedding-worker-out.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'techtrend-diff-summary-local',
      script: 'scripts/ai/generate-diff-summaries-weekly.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      cron_restart: '0 6 * * 1', // 毎週月曜 06:00 JST に前週のサマリーを生成
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
      },
      error_file: 'logs/diff-summary-error.log',
      out_file: 'logs/diff-summary-out.log',
      time: true,
      merge_logs: true
    }
  ]
};
