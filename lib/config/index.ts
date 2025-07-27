/**
 * アプリケーション設定
 */

// 環境変数
export const env = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
} as const;

// API制限設定
export const apiLimits = {
  gemini: {
    maxRequestsPerMinute: 60,
    maxTokensPerRequest: 150,
    batchSize: 3,
    retryDelay: 2000, // ms
    temperature: 0.3,
  },
  fetchers: {
    maxRetries: 3,
    retryDelay: 1000, // ms
    defaultTimeout: 30000, // ms
  },
} as const;

// アプリケーション設定
export const appConfig = {
  articlesPerPage: 12,
  maxSummaryLength: 80,
  minSummaryLength: 60,
  scheduler: {
    cronPattern: '0 * * * *', // 毎時0分
    timezone: 'Asia/Tokyo',
  },
  sources: {
    maxArticlesPerFetch: 50,
    maxArticlesPerSource: 1000,
  },
} as const;

// フィーチャーフラグ
export const features = {
  enableScheduler: true,
  enableApiEndpoints: true,
  enableDebugLogging: env.NODE_ENV === 'development',
} as const;

// 設定の検証
export function validateConfig(): void {
  if (!env.GEMINI_API_KEY && features.enableScheduler) {
    console.warn('⚠️  GEMINI_API_KEY が設定されていません。要約生成が無効になります。');
  }
}