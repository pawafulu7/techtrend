/**
 * Centralized environment configuration with type safety and validation
 * Replaces direct process.env access throughout the codebase
 */

import { z } from 'zod';
import logger from '@/lib/logger';

// Helpers to coerce empty strings to undefined for optional vars
const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url()).optional();
const numericStringWithDefault = (def: string) =>
  z.preprocess((v) => {
    if (typeof v !== 'string' || v.trim() === '' || !/^\d+$/.test(v))
      return def;
    return v;
  }, z.string());

// Environment variable schema
const envSchema = z
  .object({
    // Database
    DATABASE_URL: optionalUrl,

    // Redis
    REDIS_URL: z.string().optional(),
    REDIS_HOST: z.string().optional().default('localhost'),
    REDIS_PORT: numericStringWithDefault('6379'),
    REDIS_PASSWORD: z.string().optional(),

    // Authentication (Auth.js v5 supports both AUTH_* and NEXTAUTH_*)
    NEXTAUTH_URL: optionalUrl,
    AUTH_SECRET: z.string().min(32).optional(),
    NEXTAUTH_SECRET: z.string().min(32).optional(),

    // OAuth Providers (optional, but must be non-empty if provided)
    GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().trim().min(1).optional(),
    GITHUB_CLIENT_ID: z.string().trim().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().trim().min(1).optional(),

    // AI Services
    GEMINI_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z
      .string()
      .startsWith('sk-', 'Invalid OpenAI API key format')
      .optional(),
    ANTHROPIC_API_KEY: z.string().optional(),

    // RAG & Embeddings
    EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
    EMBEDDING_BATCH_SIZE: z.coerce.number().int().min(1).max(2048).default(100),
    EMBEDDING_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(50),

    // RAG Configuration
    RAG_TOP_K: z.coerce.number().int().min(1).max(100).default(10),
    RAG_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
    RAG_ACTIVE_MODEL: z.string().default('text-embedding-3-small'),
    RAG_ACTIVE_VERSION: z.coerce.number().int().positive().default(1),
    RAG_ENABLED: z.enum(['true', 'false']).optional().default('false'),

    // Upstash Redis (for rate limiting in production)
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    // Feature Flags
    ENABLE_CACHE: z.enum(['true', 'false']).optional().default('true'),
    ENABLE_AUTH: z.enum(['true', 'false']).optional().default('true'),
    ENABLE_ANALYTICS: z.enum(['true', 'false']).optional().default('false'),
    AGENT_STREAMING_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .default('false'),

    // Quality Control
    QUALITY_CHECK_ENABLED: z.enum(['true', 'false']).optional().default('true'),
    QUALITY_MIN_SCORE: numericStringWithDefault('70'),
    QUALITY_AUTO_FIX: z.enum(['true', 'false']).optional().default('false'),
    MAX_REGENERATION_ATTEMPTS: numericStringWithDefault('3'),

    // Event Filtering
    EXCLUDE_EVENT_ARTICLES: z
      .enum(['true', 'false'])
      .optional()
      .default('false'),
    MAX_ARTICLES_PER_COMPANY: numericStringWithDefault('10'),

    // Application
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: numericStringWithDefault('3000'),
    NEXT_PUBLIC_APP_URL: optionalUrl,

    // Logging
    LOG_LEVEL: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.toLowerCase() : v),
        z.enum(['debug', 'info', 'warn', 'error'])
      )
      .optional(),

    // Testing
    CI: z
      .union([z.enum(['true', 'false']), z.literal('1'), z.literal('0')])
      .optional(),
    TEST_DATABASE_URL: z.string().optional(),

    // Email / SMTP
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    SKIP_EMAIL_SEND: z.enum(['true', 'false']).optional().default('false'),
    GMAIL_USER: z.string().optional(),
    GMAIL_APP_PASSWORD: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: z.enum(['true', 'false']).optional().default('false'),

    // GitHub OAuth Aliases
    GITHUB_ID: z.string().trim().min(1).optional(),
    GITHUB_SECRET: z.string().trim().min(1).optional(),

    // External API Keys
    GOOGLE_API_KEY: z.string().optional(),
    QIITA_API_TOKEN: z.string().optional(),

    // LLM Configuration
    GEMINI_MODEL: z.string().optional(),
    AGENT_MODEL: z.string().optional(),
    LOG_LLM_RAW_RESPONSE: z.enum(['true', 'false']).optional().default('false'),
    USE_LOCAL_LLM_FALLBACK: z
      .enum(['true', 'false'])
      .optional()
      .default('false'),
    PREFER_LOCAL_LLM: z.enum(['true', 'false']).optional().default('false'),
    LOCAL_LLM_URL: optionalUrl,
    LOCAL_LLM_MODEL: z.string().optional(),
    LOCAL_LLM_MAX_TOKENS: z.coerce.number().int().positive().default(800),
    LOCAL_LLM_MAX_CONTENT_LENGTH: z.coerce
      .number()
      .int()
      .positive()
      .default(8000),

    // Regression Testing
    REGRESSION_MODE: z.enum(['true', 'false']).optional().default('false'),
    REGRESSION_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
    REGRESSION_TOP_P: z.coerce.number().min(0).max(1).optional(),
    REGRESSION_TOP_K: z.coerce.number().int().positive().optional(),

    // Notifications
    SLACK_WEBHOOK_URL: optionalUrl,
    SLACK_NOTIFICATION_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .default('false'),

    // Summary / Batch Processing
    SUMMARY_CONCURRENCY: z.coerce.number().int().min(1).default(3),
    SUMMARY_TIMEOUT: z.coerce.number().int().positive().default(90000),
    SUMMARY_REQUEST_DELAY: z.coerce.number().int().min(0).default(500),
    MIN_CONTENT_LENGTH: z.coerce.number().int().min(0).default(100),

    // Fetchers
    FETCHER_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
    ARXIV_MAX_ARTICLES_PER_FETCH: z.coerce
      .number()
      .int()
      .positive()
      .default(50),
    ARXIV_ENRICHMENT_CONCURRENCY: z.coerce.number().int().min(1).default(5),
    HATENA_BLOG_DEV_MAX_PAGES: z.coerce.number().int().positive().default(3),
    HATENA_BLOG_DEV_TIMEOUT: z.coerce.number().int().positive().default(30000),

    // Database Configuration
    DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(20),
    DB_POOL_TIMEOUT: z.coerce.number().int().positive().default(10),
    DB_STATEMENT_CACHE_SIZE: z.coerce.number().int().min(0).optional(),
    DB_CONNECT_TIMEOUT: z.coerce.number().int().positive().default(10),
    DB_TRANSACTION_TIMEOUT: z.coerce.number().int().positive().default(10000),
    PGBOUNCER_MODE: z.string().optional(),

    // Caching
    CACHE_L1_TTL: z.coerce.number().int().positive().default(3600),
    CACHE_L2_TTL: z.coerce.number().int().positive().default(1200),
    CACHE_L3_TTL: z.coerce.number().int().positive().default(600),

    // Workers
    EMBEDDING_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).default(300),
    EMBEDDING_WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
    EMBEDDING_WORKER_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .default(9000),

    // Security / Middleware
    CURSOR_SECRET: z.string().optional(),
    ALLOW_INSECURE_CURSOR_SECRET: z
      .enum(['true', 'false'])
      .optional()
      .default('false'),
    CRON_SECRET: z.string().optional(),
    CRON_TOKEN: z.string().optional(),
    CSRF_TRUSTED_ORIGINS: z.string().optional(),
    RATE_LIMIT_OVERRIDES: z.string().optional(),

    // Translation / Tech Terms
    ENABLE_TITLE_TRANSLATION: z
      .enum(['true', 'false'])
      .optional()
      .default('true'),
    TRANSLATION_RATE_LIMIT: z.coerce.number().int().positive().optional(),
    TECH_TERMS_UPDATE_URL: optionalUrl,

    // Monitoring / Diagnostics
    ENABLE_DEBUG_METRICS: z.enum(['true', 'false']).optional().default('false'),
    NODE_MAX_HEAP_MB: z.coerce.number().int().positive().default(512),
    PROCESS_TYPE: z.string().optional(),
    DEBUG: z.string().optional(),

    // Feature Flags (additional)
    USE_DATABASE_PROVIDER: z
      .enum(['true', 'false'])
      .optional()
      .default('false'),

    // Platform Detection (runtime-injected)
    VERCEL: z.string().optional(),
    NETLIFY: z.string().optional(),
    AWS_EXECUTION_ENV: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // Ensure at least one auth secret is provided
    if (!env.AUTH_SECRET && !env.NEXTAUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_SECRET'],
        message: 'Either AUTH_SECRET or NEXTAUTH_SECRET must be provided',
      });
    }
  })
  .transform((env) => {
    // Normalize: use AUTH_SECRET as primary, fallback to NEXTAUTH_SECRET
    const secret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET!;
    return {
      ...env,
      AUTH_SECRET: secret,
      NEXTAUTH_SECRET: env.NEXTAUTH_SECRET ?? secret,
    };
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
    .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
    .join('\n');
}

// Lazy initialization
let _env: Env | null = null;

// Development fallback secret
const DEV_AUTH_SECRET =
  'development-secret-key-change-me-in-production-min-32-chars';

/**
 * Check if ZodError is only about missing auth secrets
 */
function isAuthSecretOnlyError(error: z.ZodError): boolean {
  return error.issues.every((issue) => {
    const path = issue.path.join('.');
    return path === 'AUTH_SECRET' || path === 'NEXTAUTH_SECRET';
  });
}

/**
 * Get validated environment variables
 * Throws on first access if validation fails
 */
export function getEnv(): Env {
  if (_env === null) {
    const parsed = envSchema.safeParse(process.env);

    if (parsed.success) {
      _env = parsed.data;
      return _env;
    }

    // Validation failed
    const errorMessage = `
Environment validation failed:
${formatValidationErrors(parsed.error)}

Please check your .env file and ensure all required variables are set correctly.
    `.trim();

    // In development, allow fallback ONLY for auth secret issues
    if (
      (process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test') &&
      isAuthSecretOnlyError(parsed.error)
    ) {
      logger.warn(errorMessage);
      logger.warn('Using development auth secret fallback');

      const retryParsed = envSchema.safeParse({
        ...process.env,
        AUTH_SECRET: process.env.AUTH_SECRET || DEV_AUTH_SECRET,
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || DEV_AUTH_SECRET,
      });

      if (retryParsed.success) {
        _env = retryParsed.data;
        return _env;
      }

      // Retry failed - throw original error
      throw new Error(errorMessage);
    }

    // Production or non-auth errors: fail fast
    throw new Error(errorMessage);
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
  isAgentStreamingEnabled: () =>
    env.NODE_ENV === 'test' ? false : env.AGENT_STREAMING_ENABLED === 'true',
  isQualityCheckEnabled: () => env.QUALITY_CHECK_ENABLED === 'true',
  shouldExcludeEventArticles: () => env.EXCLUDE_EVENT_ARTICLES === 'true',
  isRagEnabled: () => env.RAG_ENABLED === 'true' && !!env.OPENAI_API_KEY,
  isRateLimitingEnabled: () =>
    !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
};

/**
 * Configuration helpers
 */
export const config = {
  database: {
    url: () =>
      env.NODE_ENV === 'test'
        ? env.TEST_DATABASE_URL || env.DATABASE_URL
        : env.DATABASE_URL,
  },
  redis: {
    // Build URL strictly from validated env to ensure test determinism
    url: () => {
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
  rag: {
    topK: () => env.RAG_TOP_K,
    similarityThreshold: () => env.RAG_SIMILARITY_THRESHOLD,
    activeModel: () => env.RAG_ACTIVE_MODEL,
    activeVersion: () => env.RAG_ACTIVE_VERSION,
    isEnabled: () => features.isRagEnabled(),
  },
  embedding: {
    model: () => env.EMBEDDING_MODEL,
    dimensions: () => env.EMBEDDING_DIMENSIONS,
    batchSize: () => env.EMBEDDING_BATCH_SIZE,
    concurrency: () => env.EMBEDDING_CONCURRENCY,
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
