/**
 * Centralized environment configuration with type safety and validation
 * Replaces direct process.env access throughout the codebase
 */

import { z } from 'zod';
import logger from '@/lib/logger';

// Preprocess all env vars: empty/whitespace-only strings → undefined
// GHA/CI environments often set secrets to '' when not configured
function sanitizeEnv(
  raw: NodeJS.ProcessEnv
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [
      k,
      typeof v === 'string' && v.trim() === '' ? undefined : v,
    ])
  );
}
const optionalUrl = z.string().url().optional();
const numericStringWithDefault = (def: string) =>
  z.preprocess((v) => {
    if (typeof v !== 'string' || !/^\d+$/.test(v)) return def;
    return v;
  }, z.string());
const safeCoerceInt = (def: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null) return undefined;
    const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().int().default(def));
const safeCoerceNumber = (def: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().default(def));
const booleanEnum = z.preprocess(
  (v) => (typeof v === 'string' ? v.toLowerCase() : v),
  z.enum(['true', 'false'])
);

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

    // Better Auth (supports AUTH_* and NEXTAUTH_* for backwards compatibility)
    NEXTAUTH_URL: optionalUrl,
    BETTER_AUTH_URL: optionalUrl,
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
    EMBEDDING_DIMENSIONS: safeCoerceInt(1536),
    EMBEDDING_BATCH_SIZE: safeCoerceInt(100),
    EMBEDDING_CONCURRENCY: safeCoerceInt(50),

    // RAG Configuration
    RAG_TOP_K: safeCoerceInt(10),
    RAG_SIMILARITY_THRESHOLD: safeCoerceNumber(0.7),
    RAG_ACTIVE_MODEL: z.string().default('text-embedding-3-small'),
    RAG_ACTIVE_VERSION: safeCoerceInt(1),
    RAG_ENABLED: booleanEnum.optional().default('false'),

    // Upstash Redis (for rate limiting in production)
    UPSTASH_REDIS_REST_URL: optionalUrl,
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    // Feature Flags
    ENABLE_CACHE: booleanEnum.optional().default('true'),
    ENABLE_AUTH: booleanEnum.optional().default('true'),
    ENABLE_ANALYTICS: booleanEnum.optional().default('false'),
    AGENT_STREAMING_ENABLED: booleanEnum.optional().default('false'),

    // Quality Control
    QUALITY_CHECK_ENABLED: booleanEnum.optional().default('true'),
    QUALITY_MIN_SCORE: numericStringWithDefault('70'),
    QUALITY_AUTO_FIX: booleanEnum.optional().default('false'),
    MAX_REGENERATION_ATTEMPTS: numericStringWithDefault('3'),

    // Event Filtering
    EXCLUDE_EVENT_ARTICLES: booleanEnum.optional().default('false'),
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
    CI: z.union([booleanEnum, z.literal('1'), z.literal('0')]).optional(),
    TEST_DATABASE_URL: z.string().optional(),

    // Email / SMTP
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    SKIP_EMAIL_SEND: booleanEnum.optional().default('false'),
    GMAIL_USER: z.string().optional(),
    GMAIL_APP_PASSWORD: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: safeCoerceInt(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: booleanEnum.optional().default('false'),

    // GitHub OAuth Aliases
    GITHUB_ID: z.string().trim().min(1).optional(),
    GITHUB_SECRET: z.string().trim().min(1).optional(),

    // External API Keys
    GOOGLE_API_KEY: z.string().optional(),
    QIITA_API_TOKEN: z.string().optional(),

    // LLM Configuration
    GEMINI_MODEL: z.string().optional(),
    AGENT_MODEL: z.string().optional(),
    LOG_LLM_RAW_RESPONSE: booleanEnum.optional().default('false'),
    USE_LOCAL_LLM_FALLBACK: booleanEnum.optional().default('false'),
    PREFER_LOCAL_LLM: booleanEnum.optional().default('false'),
    LOCAL_LLM_URL: optionalUrl,
    LOCAL_LLM_MODEL: z.string().optional(),
    LOCAL_LLM_MAX_TOKENS: safeCoerceInt(800),
    LOCAL_LLM_MAX_CONTENT_LENGTH: safeCoerceInt(8000),

    // Regression Testing
    REGRESSION_MODE: booleanEnum.optional().default('false'),
    REGRESSION_TEMPERATURE: z.preprocess((v) => {
      if (v === undefined || v === null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().optional()),
    REGRESSION_TOP_P: z.preprocess((v) => {
      if (v === undefined || v === null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().optional()),
    REGRESSION_TOP_K: z.preprocess((v) => {
      if (v === undefined || v === null) return undefined;
      const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().int().optional()),

    // Notifications
    SLACK_WEBHOOK_URL: optionalUrl,
    SLACK_NOTIFICATION_ENABLED: booleanEnum.optional().default('false'),

    // Summary / Batch Processing
    SUMMARY_CONCURRENCY: safeCoerceInt(3),
    SUMMARY_TIMEOUT: safeCoerceInt(90000),
    SUMMARY_REQUEST_DELAY: safeCoerceInt(500),
    MIN_CONTENT_LENGTH: safeCoerceInt(100),
    MIN_PROCESSED_FOR_FAILURE: z.preprocess((v) => {
      if (v === undefined || v === null) return undefined;
      const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
      return Number.isFinite(n) && n >= 1 ? n : undefined;
    }, z.number().int().min(1).default(5)),
    POST_SAVE_ENRICH_TIMEOUT_MS: safeCoerceInt(10000),
    POST_SAVE_ENRICH_SLEEP_MS: safeCoerceInt(0),
    HATENA_BLOG_DEV_ENRICH_SLEEP_MS: safeCoerceInt(2500),
    SKIP_POST_SAVE_ENRICHMENT: z.enum(['0', '1']).optional().default('0'),

    // Fetchers
    FETCHER_TIMEOUT_MS: safeCoerceInt(120000),
    ARXIV_MAX_ARTICLES_PER_FETCH: safeCoerceInt(50),
    ARXIV_FETCHER_TIMEOUT_MS: safeCoerceInt(600000),
    ARXIV_ENRICHMENT_CONCURRENCY: safeCoerceInt(5),
    HATENA_BLOG_DEV_MAX_PAGES: safeCoerceInt(3),
    HATENA_BLOG_DEV_TIMEOUT: safeCoerceInt(30000),
    COLLECT_FEEDS_CONCURRENCY: safeCoerceInt(5),
    COLLECT_FEEDS_PID_FILE: z
      .string()
      .default('/tmp/techtrend-collect-feeds.pid'),
    COLLECT_FEEDS_DEBUG: z.enum(['0', '1']).optional().default('0'),

    // Database Configuration
    PRISMA_QUERY_LOG: booleanEnum.optional(),
    DB_CONNECTION_LIMIT: safeCoerceInt(20),
    DB_POOL_TIMEOUT: safeCoerceInt(10),
    DB_STATEMENT_CACHE_SIZE: z.preprocess((v) => {
      if (v === undefined || v === null) return undefined;
      const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().int().optional()),
    DB_CONNECT_TIMEOUT: safeCoerceInt(10),
    DB_TRANSACTION_TIMEOUT: safeCoerceInt(10000),
    PGBOUNCER_MODE: z.string().optional(),

    // Caching
    CACHE_L1_TTL: safeCoerceInt(3600),
    CACHE_L2_TTL: safeCoerceInt(1200),
    CACHE_L3_TTL: safeCoerceInt(600),

    // Workers
    EMBEDDING_WORKER_BATCH_SIZE: safeCoerceInt(300),
    EMBEDDING_WORKER_MAX_ATTEMPTS: safeCoerceInt(3),
    EMBEDDING_WORKER_TIMEOUT_MS: safeCoerceInt(9000),
    EMBEDDING_STUCK_THRESHOLD_MINUTES: safeCoerceInt(30),
    EMBEDDING_RECOVERY_BATCH_LIMIT: safeCoerceInt(100),

    // Security / Middleware
    CURSOR_SECRET: z.string().optional(),
    ALLOW_INSECURE_CURSOR_SECRET: booleanEnum.optional().default('false'),
    CRON_SECRET: z.string().optional(),
    CRON_TOKEN: z.string().optional(),
    CSRF_TRUSTED_ORIGINS: z.string().optional(),
    RATE_LIMIT_OVERRIDES: z.string().optional(),

    // Translation / Tech Terms
    ENABLE_TITLE_TRANSLATION: booleanEnum.optional().default('true'),
    TRANSLATION_RATE_LIMIT: z.preprocess((v) => {
      if (v === undefined || v === null) return undefined;
      const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().int().optional()),
    TECH_TERMS_UPDATE_URL: optionalUrl,

    // Monitoring / Diagnostics
    ENABLE_DEBUG_METRICS: booleanEnum.optional().default('false'),
    NODE_MAX_HEAP_MB: safeCoerceInt(512),
    PROCESS_TYPE: z.string().optional(),
    DEBUG: z.string().optional(),

    // Feature Flags (additional)
    USE_DATABASE_PROVIDER: booleanEnum.optional().default('false'),
    USE_OPTIMIZED_SOURCES_API: booleanEnum.optional().default('false'),
    USE_DATALOADER: booleanEnum.optional().default('false'),

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
    const sanitized = sanitizeEnv(process.env);
    const parsed = envSchema.safeParse(sanitized);

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

    // Allow fallback for auth secret issues only when secrets are truly missing
    // (not when provided but invalid, e.g. 'short')
    const authSecretsMissing =
      sanitized.AUTH_SECRET == null && sanitized.NEXTAUTH_SECRET == null;

    if (authSecretsMissing && isAuthSecretOnlyError(parsed.error)) {
      const allowFallback =
        sanitized.NODE_ENV !== 'production' ||
        sanitized.ALLOW_INSECURE_AUTH_FALLBACK?.toLowerCase() === 'true';

      if (!allowFallback) {
        // Production without explicit opt-in: fail fast to prevent
        // DEV_AUTH_SECRET (a public constant) from being used as session secret
        throw new Error(errorMessage);
      }

      if (sanitized.NODE_ENV === 'production') {
        logger.warn(errorMessage);
        logger.warn(
          'AUTH_SECRET not set in production — using insecure fallback (ALLOW_INSECURE_AUTH_FALLBACK=true)'
        );
      }

      const retryParsed = envSchema.safeParse({
        ...sanitized,
        AUTH_SECRET: sanitized.AUTH_SECRET || DEV_AUTH_SECRET,
        NEXTAUTH_SECRET: sanitized.NEXTAUTH_SECRET || DEV_AUTH_SECRET,
      });

      if (retryParsed.success) {
        _env = retryParsed.data;
        return _env;
      }

      // Retry failed - throw original error
      throw new Error(errorMessage);
    }

    // Non-auth errors: fail fast
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
