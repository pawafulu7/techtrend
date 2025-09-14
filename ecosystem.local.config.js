// PM2 configuration for local development with dotenv
const path = require('path');

// Explicitly load .env from project root
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: 'techtrend-scheduler-local',
      script: 'scripts/scheduled/scheduler.ts',
      interpreter: 'tsx',
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
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET
      },
      error_file: 'logs/scheduler-error.log',
      out_file: 'logs/scheduler-out.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'techtrend-auto-regenerate-local',
      script: 'scripts/scheduled/auto-regenerate.ts',
      interpreter: 'tsx',
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
      interpreter: 'tsx',
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
    }
  ]
};