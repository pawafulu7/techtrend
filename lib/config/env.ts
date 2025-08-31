/**
 * Centralized environment configuration with type safety and validation
 * Replaces direct process.env access throughout the codebase
 */

import { z } from 'zod';

// Environment variable schema
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().optional().default(''),
  
  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional().default('localhost'),
  REDIS_PORT: z.string().regex(/^\d+$/).optional().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  
  // Authentication
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32),
  
  // OAuth Providers (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  
  // AI Services
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  
  // Feature Flags
  ENABLE_CACHE: z.enum(['true', 'false']).optional().default('true'),
  ENABLE_AUTH: z.enum(['true', 'false']).optional().default('true'),
  ENABLE_ANALYTICS: z.enum(['true', 'false']).optional().default('false'),
  
  // Quality Control
  QUALITY_CHECK_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  QUALITY_MIN_SCORE: z.string().regex(/^\d+$/).optional().default('70'),
  QUALITY_AUTO_FIX: z.enum(['true', 'false']).optional().default('false'),
  MAX_REGENERATION_ATTEMPTS: z.string().regex(/^\d+$/).optional().default('3'),
  
  // Event Filtering
  EXCLUDE_EVENT_ARTICLES: z.enum(['true', 'false']).optional().default('false'),
  MAX_ARTICLES_PER_COMPANY: z.string().regex(/^\d+$/).optional().default('10'),
  
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).optional().default('3000'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
  
  // Testing
  CI: z.enum(['true', 'false']).optional(),
  TEST_DATABASE_URL: z.string().optional(),
});

// Type inference for the environment
export type Env = z.infer<typeof envSchema>;

// Validation error formatting
function formatValidationErrors(errors: z.ZodError): string {
  // ZodError exposes issues (v3)
  if (!errors || !errors.issues) {
    return '  - Unknown validation error';
  }
  return errors.issues
    .map(err => `  - ${err.path.join('.')}: ${err.message}`)
    .join('\n');
}

// Lazy initialization
let _env: Env | null = null;

/**
 * Get validated environment variables
 * Throws on first access if validation fails
 */
export function getEnv(): Env {
  if (_env === null) {
    try {
      _env = envSchema.parse(process.env);
    } catch (_error) {
      if (_error instanceof z.ZodError) {
        const errorMessage = `
Environment validation failed:
${formatValidationErrors(_error)}

Please check your .env file and ensure all required variables are set correctly.
        `.trim();
        
        // In development, log the error but continue with defaults
        if (process.env.NODE_ENV === 'development') {
          // Use safe defaults for development
          _env = envSchema.parse({
            ...process.env,
            NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'development-secret-key-should-be-replaced-in-production',
          });
        } else {
          // In production, fail fast
          throw new Error(errorMessage);
        }
      } else {
        throw _error;
      }
    }
  }
  
  return _env;
}

/**
 * Type-safe environment variable access
 */
export const env = new Proxy({} as Env, {
  get(_, prop: string) {
    const envVars = getEnv();
    return envVars[prop as keyof Env];
  },
});

/**
 * Feature flag helpers
 */
export const features = {
  isCacheEnabled: () => env.ENABLE_CACHE === 'true',
  isAuthEnabled: () => env.ENABLE_AUTH === 'true',
  isAnalyticsEnabled: () => env.ENABLE_ANALYTICS === 'true',
  isQualityCheckEnabled: () => env.QUALITY_CHECK_ENABLED === 'true',
  shouldExcludeEventArticles: () => env.EXCLUDE_EVENT_ARTICLES === 'true',
};

/**
 * Configuration helpers
 */
export const config = {
  database: {
    url: () => env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL || env.DATABASE_URL : env.DATABASE_URL,
  },
  redis: {
    // Prefer explicit REDIS_URL, then live host/port, then validated env defaults
    url: () => {
      const liveUrl = process.env.REDIS_URL;
      if (liveUrl && liveUrl.length > 0) return liveUrl;
      const liveHost = process.env.REDIS_HOST;
      const livePort = process.env.REDIS_PORT;
      if (liveHost && livePort) return `redis://${liveHost}:${livePort}`;
      const e = getEnv();
      return e.REDIS_URL || `redis://${e.REDIS_HOST}:${e.REDIS_PORT}`;
    },
    host: () => env.REDIS_HOST,
    port: () => parseInt(env.REDIS_PORT, 10),
    password: () => env.REDIS_PASSWORD,
  },
  quality: {
    minScore: () => parseInt(env.QUALITY_MIN_SCORE, 10),
    maxAttempts: () => parseInt(env.MAX_REGENERATION_ATTEMPTS, 10),
    autoFix: () => env.QUALITY_AUTO_FIX === 'true',
  },
  app: {
    port: () => parseInt(env.PORT, 10),
    url: () => env.NEXT_PUBLIC_APP_URL || `http://localhost:${env.PORT}`,
    isProduction: () => env.NODE_ENV === 'production',
    isDevelopment: () => env.NODE_ENV === 'development',
    isTest: () => env.NODE_ENV === 'test',
  },
};

/**
 * Reset environment cache for testing
 * Only available in test environment
 */
export function resetEnvCache(): void {
  if (process.env.NODE_ENV === 'test') {
    _env = null;
  }
}

/**
 * Validate environment on module load in production
 */
if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
  // Validate immediately in production server environment
  getEnv();
}
