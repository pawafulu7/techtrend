/**
 * Environment Variable Validator
 * 環境変数の検証とタイプセーフなアクセスを提供
 */

import { z } from 'zod';

// 環境変数スキーマ定義
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().describe('PostgreSQL connection string'),
  
  // Redis
  REDIS_URL: z.string().url().optional().describe('Redis connection string'),
  REDIS_HOST: z.string().optional().default('localhost'),
  REDIS_PORT: z.string().regex(/^\d+$/).optional().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  
  // AI APIs
  GEMINI_API_KEY: z.string().min(1).describe('Google Gemini API key'),
  ANTHROPIC_API_KEY: z.string().min(1).optional().describe('Anthropic Claude API key'),
  
  // Authentication
  NEXTAUTH_SECRET: z.string().min(32).describe('NextAuth.js secret key'),
  NEXTAUTH_URL: z.string().url().describe('NextAuth.js callback URL'),
  
  // OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_ID: z.string().optional(),
  GITHUB_SECRET: z.string().optional(),
  
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().regex(/^\d+$/).optional().default('3000'),
  
  // Feature Flags
  EXCLUDE_EVENT_ARTICLES: z.string().transform(val => val === 'true').optional().default(false),
  QUALITY_CHECK_ENABLED: z.string().transform(val => val === 'true').optional().default(true),
  QUALITY_MIN_SCORE: z.string().regex(/^\d+$/).optional().default('70'),
  QUALITY_AUTO_FIX: z.string().transform(val => val === 'true').optional().default(false),
  MAX_REGENERATION_ATTEMPTS: z.string().regex(/^\d+$/).optional().default('3'),
  MAX_ARTICLES_PER_COMPANY: z.string().regex(/^\d+$/).optional().default('50'),
  
  // Monitoring (optional)
  SENTRY_DSN: z.string().url().optional(),
  ENABLE_ANALYTICS: z.string().transform(val => val === 'true').optional().default(false),
});

// 環境変数の型定義
export type EnvConfig = z.infer<typeof envSchema>;

// キャッシュされた設定
let cachedConfig: EnvConfig | null = null;

/**
 * 環境変数を検証して取得
 * @returns 検証済みの環境変数設定
 * @throws 環境変数が不正な場合
 */
export function getValidatedEnv(): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    // 環境変数を検証
    const validated = envSchema.parse(process.env);
    cachedConfig = validated;
    return validated;
  } catch (_error) {
    if (_error instanceof z.ZodError) {
      const missingVars = _error.issues
        .filter(e => e.message === 'Required')
        .map(e => e.path.join('.'));
      
      const invalidVars = _error.issues
        .filter(e => e.message !== 'Required')
        .map(e => `${e.path.join('.')}: ${e.message}`);
      
      
      if (missingVars.length > 0) {
      }
      
      if (invalidVars.length > 0) {
      }
      
      // 開発環境では詳細なエラーを表示
      if (process.env.NODE_ENV === 'development') {
      }
      
      throw new Error(`Environment validation failed. Check your .env file.`);
    }
    throw _error;
  }
}

/**
 * 環境変数の存在チェック（検証なし）
 * @param key 環境変数名
 * @returns 環境変数が存在するか
 */
export function hasEnvVar(key: keyof EnvConfig): boolean {
  return process.env[key] !== undefined;
}

/**
 * 安全に環境変数を取得（デフォルト値付き）
 * @param key 環境変数名
 * @param defaultValue デフォルト値
 * @returns 環境変数の値またはデフォルト値
 */
export function getEnvVar<K extends keyof EnvConfig>(
  key: K,
  defaultValue?: EnvConfig[K]
): EnvConfig[K] | undefined {
  try {
    const config = getValidatedEnv();
    return config[key] ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * 環境が本番環境かチェック
 */
export function isProduction(): boolean {
  return getEnvVar('NODE_ENV') === 'production';
}

/**
 * 環境が開発環境かチェック
 */
export function isDevelopment(): boolean {
  return getEnvVar('NODE_ENV') === 'development';
}

/**
 * 環境がテスト環境かチェック
 */
export function isTest(): boolean {
  return getEnvVar('NODE_ENV') === 'test';
}

/**
 * Redis接続情報を取得
 */
export function getRedisConfig() {
  const config = getValidatedEnv();
  
  if (config.REDIS_URL) {
    return { url: config.REDIS_URL };
  }
  
  return {
    host: config.REDIS_HOST,
    port: parseInt(config.REDIS_PORT || '6379'),
    password: config.REDIS_PASSWORD,
  };
}

/**
 * 環境変数のサマリを取得（機密情報をマスク）
 */
export function getEnvSummary(): Record<string, string> {
  const config = getValidatedEnv();
  const summary: Record<string, string> = {};
  
  // 機密情報をマスクする
  const sensitiveKeys = ['API_KEY', 'SECRET', 'PASSWORD', 'DSN', 'DATABASE_URL'];
  
  for (const [key, value] of Object.entries(config)) {
    if (sensitiveKeys.some(sensitive => key.includes(sensitive))) {
      summary[key] = value ? '***' : 'not set';
    } else {
      summary[key] = String(value);
    }
  }
  
  return summary;
}

// 初期化時に検証を実行（エラーを早期発見）
if (process.env.NODE_ENV !== 'test') {
  try {
    getValidatedEnv();
  } catch (_error) {
    // 本番環境では起動を中止
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

export default getValidatedEnv;
