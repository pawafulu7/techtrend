import { z } from 'zod';
import { logger, sanitizeError } from '@/lib/logger';

/**
 * Rate limit configuration schema
 *
 * Validates rate limit policy definitions and environment overrides.
 */
const RateLimitConfigSchemaInternal = z.object({
  points: z.number().int().positive(),
  duration: z.number().int().positive(),
  blockDuration: z.number().int().nonnegative().optional().default(0),
  keyStrategy: z.enum(['user', 'session', 'ip', 'anonymous']).optional().default('ip'),
  notes: z.string().optional(),
  telemetryEvent: z.string().optional(),
});

export const RateLimitConfigSchema = RateLimitConfigSchemaInternal;

export type RateLimitConfig = z.input<typeof RateLimitConfigSchemaInternal>;

/**
 * Predefined rate limit policies
 *
 * Key format: <category>:<action>
 * - Category: auth, ai, rag, write, read, public
 * - Action: specific operation (login, summary, favorite, etc.)
 *
 * Key strategies:
 * - 'user': Authenticated user ID (fallback to IP for anonymous)
 * - 'session': Session token (cookie-based)
 * - 'ip': Client IP address
 * - 'anonymous': Single global key (for health checks)
 */
export const RATE_LIMIT_POLICIES: Record<string, RateLimitConfig> = {
  // Authentication (High Security) - 60s block for brute-force prevention
  'auth:register': {
    points: 5,
    duration: 60,
    blockDuration: 60,
    keyStrategy: 'ip',
    notes: 'Prevent account creation spam',
    telemetryEvent: 'ratelimit.auth.register',
  },
  'auth:login': {
    points: 5,
    duration: 60,
    blockDuration: 60,
    keyStrategy: 'ip',
    notes: 'Prevent brute force attacks',
    telemetryEvent: 'ratelimit.auth.login',
  },
  'auth:verify': {
    points: 10,
    duration: 60,
    blockDuration: 60,
    keyStrategy: 'ip',
    notes: 'Email verification attempts',
    telemetryEvent: 'ratelimit.auth.verify',
  },
  'auth:auto-login': {
    points: 5,
    duration: 300,
    blockDuration: 60,
    keyStrategy: 'ip',
    notes: 'Auto-login token validation abuse prevention',
    telemetryEvent: 'ratelimit.auth.auto-login',
  },

  // AI Generation (Cost Control) - No block, soft throttle only
  'ai:summary': {
    points: 10,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Gemini API cost control',
    telemetryEvent: 'ratelimit.ai.summary',
  },
  'ai:tags': {
    points: 10,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Gemini API cost control',
    telemetryEvent: 'ratelimit.ai.tags',
  },

  // RAG (Existing Policies) - No block, soft throttle only
  'rag:search': {
    points: 10,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Vector search (low cost)',
    telemetryEvent: 'ratelimit.rag.search',
  },
  'rag:agent': {
    points: 5,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'AI agent search (high cost)',
    telemetryEvent: 'ratelimit.rag.agent',
  },

  // Write Operations (Spam Prevention)
  'write:favorite': {
    points: 20,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Prevent favorite spam',
    telemetryEvent: 'ratelimit.write.favorite',
  },
  'write:profile': {
    points: 10,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Profile update limit',
    telemetryEvent: 'ratelimit.write.profile',
  },
  'write:password': {
    points: 5,
    duration: 300,
    blockDuration: 60,
    keyStrategy: 'user',
    notes: 'Password change (5 per 5min)',
    telemetryEvent: 'ratelimit.write.password',
  },
  'write:vote': {
    points: 30,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Article voting limit',
    telemetryEvent: 'ratelimit.write.vote',
  },
  'write:comment': {
    points: 5,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Comment creation limit (5 per minute)',
    telemetryEvent: 'ratelimit.write.comment',
  },
  'write:delete': {
    points: 3,
    duration: 3600,
    blockDuration: 30,
    keyStrategy: 'user',
    notes: 'Account deletion (3 per hour)',
    telemetryEvent: 'ratelimit.write.delete',
  },

  // Read Operations (General Protection) - No block
  'read:articles': {
    points: 100,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'General article listing',
    telemetryEvent: 'ratelimit.read.articles',
  },
  'read:search': {
    points: 50,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Search queries',
    telemetryEvent: 'ratelimit.read.search',
  },

  // Public Endpoints (High Tolerance) - No block
  'public:stats': {
    points: 200,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Public statistics',
    telemetryEvent: 'ratelimit.public.stats',
  },
  'public:health': {
    points: 500,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'anonymous',
    notes: 'Health check (monitoring)',
    telemetryEvent: 'ratelimit.public.health',
  },

  // Default Catch-All - No block
  'default': {
    points: 100,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Global default for unspecified endpoints',
    telemetryEvent: 'ratelimit.default',
  },
};

/**
 * Get rate limit config by key
 *
 * Applies environment overrides if present and validates the merged result.
 *
 * Environment override format:
 * RATE_LIMIT_OVERRIDES='{"auth:login":{"points":10}}'
 *
 * @param key - Rate limit policy key
 * @returns Validated rate limit configuration
 */
export function getRateLimitConfig(key: string): RateLimitConfig {
  const config = RATE_LIMIT_POLICIES[key] || RATE_LIMIT_POLICIES['default'];

  // Apply environment overrides with validation
  const overrides = process.env.RATE_LIMIT_OVERRIDES;
  if (overrides) {
    try {
      const parsed = JSON.parse(overrides);
      if (parsed[key]) {
        const merged = { ...config, ...parsed[key] };
        // Validate merged config with Zod (CodexMCP fix: prevent runtime errors)
        return RateLimitConfigSchema.parse(merged);
      }
    } catch (error) {
      logger.error({ error: sanitizeError(error) }, 'Failed to parse/validate RATE_LIMIT_OVERRIDES');
    }
  }

  return config;
}

/**
 * Validate all rate limit configs at build time
 *
 * Throws if any predefined policy is invalid.
 * Call this during application initialization.
 */
export function validateRateLimitConfigs(): void {
  Object.entries(RATE_LIMIT_POLICIES).forEach(([key, config]) => {
    try {
      RateLimitConfigSchema.parse(config);
    } catch (error) {
      throw new Error(`Invalid rate limit config for "${key}": ${error}`);
    }
  });
}
