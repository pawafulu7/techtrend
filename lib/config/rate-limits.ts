import { z } from 'zod';
import { logger } from '@/lib/logger';
import { env } from '@/lib/config/env';

/**
 * Rate limit configuration schema
 *
 * Validates rate limit policy definitions and environment overrides.
 */
const RateLimitConfigSchemaInternal = z.object({
  points: z.number().int().positive(),
  duration: z.number().int().positive(),
  blockDuration: z.number().int().nonnegative().optional().default(0),
  keyStrategy: z
    .enum(['user', 'session', 'ip', 'anonymous'])
    .optional()
    .default('ip'),
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
export const RATE_LIMIT_POLICIES = {
  // Authentication (High Security) - 60s block for brute-force prevention
  'auth:login': {
    points: 5,
    duration: 60,
    blockDuration: 60,
    keyStrategy: 'ip',
    notes: 'Prevent brute force attacks',
    telemetryEvent: 'ratelimit.auth.login',
  },

  // サイトの入口のログインの開始（app/api/gate/start/route.ts）。開始は Cookie を 1 つ作るだけで外部へ
  // 通信しないので緩めにする（プリフェッチや複数のタブの復元で本人が締め出されないように）。
  // 守りの本体は Google のログインと許可リストの照合
  'auth:gate-start': {
    points: 30,
    duration: 60,
    keyStrategy: 'ip',
    notes: 'Throttle sign-in starts of the site-wide Google gate',
    telemetryEvent: 'ratelimit.auth.gate_start',
  },

  // サイトの入口の Google からの戻り（app/api/gate/[...all]/route.ts）。DB なしの state は Cookie にあり、
  // サーバー側に「使った」記録が残らないので、同じ state の Cookie で 10 分間は戻りを繰り返せる。
  // 戻りのたびに Google へトークンの交換を送るので、IP ごとに回数を絞る
  'auth:gate-callback': {
    points: 30,
    duration: 60,
    keyStrategy: 'ip',
    notes: 'Throttle OAuth callbacks of the site-wide Google gate',
    telemetryEvent: 'ratelimit.auth.gate_callback',
  },

  // サイトの入口の拒否・失敗のページ（app/api/gate/[...all]/route.ts）。未登録で拒否されたアカウントの
  // 利用の申請が届いているかを DB で引く（1 回の拒否につき 1〜2 回開くだけ）。ページを出してよい目印の
  // Cookie は署名が無く、申請用の Cookie は 30 分使い回せるので、IP ごとに回数を絞る
  'auth:gate-error': {
    points: 30,
    duration: 60,
    keyStrategy: 'ip',
    notes: 'Throttle the error page of the site-wide Google gate',
    telemetryEvent: 'ratelimit.auth.gate_error',
  },

  // サイトの入口の拒否のページからの利用の申請（app/api/gate/request/route.ts）。入口の外から届くので
  // IP ごとに数える。送れるのは Google のログインを通って拒否された人だけ（署名付きの Cookie）だが、
  // 申請するアドレスは書き換えられるので、1 人が別々のアドレスの申請を置ける。その連投をここで絞る
  // （対応待ちの全体の上限は lib/auth/site-gate/constants.ts の GATE_REQUEST_MAX_PENDING）
  'write:gate-request': {
    points: 10,
    duration: 3600,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Access requests from the gate error page per IP (10 per hour)',
    telemetryEvent: 'ratelimit.write.gate_request',
  },

  // 申請するアドレスを書き換えた利用の申請を、Google で選んだアカウントごとに数える
  // （app/api/gate/request/route.ts が checkRateLimit で直接使う）。IP を替えても、1 つのアカウントで
  // 別々のアドレスの申請を置き続けて対応待ちの枠を埋められないようにする
  'write:gate-request-edited': {
    points: 3,
    duration: 86400,
    blockDuration: 0,
    keyStrategy: 'anonymous',
    notes: 'Access requests for an edited address per signed-in Google account (3 per day)',
    telemetryEvent: 'ratelimit.write.gate_request_edited',
  },

  // RAG (Existing Policies) - No block, soft throttle only
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
  'write:comment': {
    points: 5,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Comment creation limit (5 per minute)',
    telemetryEvent: 'ratelimit.write.comment',
  },
  // 問い合わせは未ログインでも送れるので、IP 単位で数える（検証の前に数える）
  'write:inquiry': {
    points: 5,
    duration: 3600,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Inquiry submission per IP (5 per hour)',
    telemetryEvent: 'ratelimit.write.inquiry',
  },
  // IP を替えた連投で DB を埋められないよう、保存の直前に全体の件数で数える
  // （app/api/inquiries/route.ts が checkRateLimit で直接使う）
  'write:inquiry-global': {
    points: 50,
    duration: 3600,
    blockDuration: 0,
    keyStrategy: 'anonymous',
    notes: 'Inquiries saved across all senders (50 per hour)',
    telemetryEvent: 'ratelimit.write.inquiry-global',
  },
  'write:source-preset': {
    points: 10,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Source preset CRUD (10 per minute)',
    telemetryEvent: 'ratelimit.write.source-preset',
  },
  'write:preferences': {
    points: 10,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user' as const,
    notes: 'User category preferences update (10 per minute)',
    telemetryEvent: 'ratelimit.write.preferences',
  },
  'write:delete': {
    points: 3,
    duration: 3600,
    blockDuration: 30,
    keyStrategy: 'user',
    notes: 'Account deletion (3 per hour)',
    telemetryEvent: 'ratelimit.write.delete',
  },
  'write:read-status': {
    points: 30,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Read status update limit (30 per minute)',
    telemetryEvent: 'ratelimit.write.read-status',
  },
  'write:article-views': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Article view recording limit (60 per minute)',
    telemetryEvent: 'ratelimit.write.article-views',
  },
  'write:telemetry-vitals': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes:
      'Web Vitals beacons (up to 5 metrics per page load from 5% of sessions; anonymous)',
    telemetryEvent: 'ratelimit.write.telemetry-vitals',
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
  'read:popular': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Popular article rankings',
    telemetryEvent: 'ratelimit.read.popular',
  },
  'read:search': {
    points: 50,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Search queries',
    telemetryEvent: 'ratelimit.read.search',
  },
  'read:heatmap': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Heatmap category analysis',
    telemetryEvent: 'ratelimit.read.heatmap',
  },
  'read:diff-summary': {
    points: 30,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Diff summary weekly report (cached, public)',
    telemetryEvent: 'ratelimit.read.diff-summary',
  },
  'read:article-views': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Article view history read limit (60 per minute)',
    telemetryEvent: 'ratelimit.read.article-views',
  },
  'read:digest': {
    points: 30,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Personalized digest (user-specific, cached)',
    telemetryEvent: 'ratelimit.read.digest',
  },
  'read:tags-search': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Tag search queries',
    telemetryEvent: 'ratelimit.read.tags-search',
  },
  'read:tags-cloud': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Tag cloud data',
    telemetryEvent: 'ratelimit.read.tags-cloud',
  },
  'read:stories': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Articles in the same story (expanded from the home list)',
    telemetryEvent: 'ratelimit.read.stories',
  },
  'read:favorite:batch': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Favorite status batch lookup for article lists (login required)',
    telemetryEvent: 'ratelimit.read.favorite-batch',
  },
  'read:changelog': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Public changelog (cached)',
    telemetryEvent: 'ratelimit.read.changelog',
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

  // Admin Dashboard Operations
  'admin:read': {
    points: 60,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Admin dashboard read operations (stats, user list)',
    telemetryEvent: 'ratelimit.admin.read',
  },
  'admin:write': {
    points: 20,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Admin dashboard write operations (role change, deactivation)',
    telemetryEvent: 'ratelimit.admin.write',
  },

  // Admin Operations (Social Post Management)
  'admin:social-post-generate': {
    points: 5,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'AI generation for social posts (5 per minute)',
    telemetryEvent: 'ratelimit.admin.social-post-generate',
  },
  'admin:social-post-bulk': {
    points: 10,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Bulk operations for social posts (10 per minute)',
    telemetryEvent: 'ratelimit.admin.social-post-bulk',
  },
  'admin:social-post-write': {
    points: 20,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Social post create/update/delete (20 per minute)',
    telemetryEvent: 'ratelimit.admin.social-post-write',
  },
  'admin:social-post-generate-article': {
    points: 5,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes:
      'AI generation from specific article (5 per minute, AI cost control)',
    telemetryEvent: 'ratelimit.admin.social-post-generate-article',
  },
  'admin:social-post-candidates': {
    points: 30,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'user',
    notes: 'Candidate article search for social posts (30 per minute)',
    telemetryEvent: 'ratelimit.admin.social-post-candidates',
  },

  'admin:ai-generate': {
    points: 5,
    duration: 60,
    keyStrategy: 'user' as const,
    notes: 'Admin AI summary regeneration (5 per minute)',
    telemetryEvent: 'ratelimit.admin.ai-generate',
  },

  // Default Catch-All - No block
  default: {
    points: 100,
    duration: 60,
    blockDuration: 0,
    keyStrategy: 'ip',
    notes: 'Global default for unspecified endpoints',
    telemetryEvent: 'ratelimit.default',
  },
} satisfies Record<string, RateLimitConfig>;

/**
 * 定義済みのポリシーキー
 *
 * withRateLimit と createRateLimiterFromConfig の引数をこの型にすることで、未定義のキーを渡すと型チェックで
 * 失敗する（未定義のキーは実行時に黙って default へフォールバックするため）。
 * 回帰の検知は lib/config/rate-limits.type-test.ts が担う。
 */
export type RateLimitPolicyKey = keyof typeof RATE_LIMIT_POLICIES;

/**
 * 任意の文字列キーで引くための表
 *
 * RATE_LIMIT_OVERRIDES やテストは定義外のキーも渡すため、getRateLimitConfig は
 * string を受け付ける。
 */
const POLICIES_BY_KEY: Record<string, RateLimitConfig> = RATE_LIMIT_POLICIES;

/** default へのフォールバックを警告済みのキー（キーごとに 1 回だけ警告する） */
const warnedUnknownKeys = new Set<string>();

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
  // hasOwn で判定する（'toString' などのプロトタイプのプロパティを拾わないため）
  const isDefined = Object.hasOwn(POLICIES_BY_KEY, key);
  if (!isDefined && !warnedUnknownKeys.has(key)) {
    warnedUnknownKeys.add(key);
    logger.warn(
      { key },
      'Undefined rate limit policy key, using the default policy as the base (RATE_LIMIT_OVERRIDES still applies)'
    );
  }
  const config = isDefined ? POLICIES_BY_KEY[key] : RATE_LIMIT_POLICIES.default;

  // Apply environment overrides with validation
  const overrides = env.RATE_LIMIT_OVERRIDES;
  if (overrides) {
    try {
      const parsed = JSON.parse(overrides);
      if (parsed[key]) {
        const merged = { ...config, ...parsed[key] };
        // Validate merged config with Zod (CodexMCP fix: prevent runtime errors)
        return RateLimitConfigSchema.parse(merged);
      }
    } catch (error) {
      logger.error(
        { err: error },
        'Failed to parse/validate RATE_LIMIT_OVERRIDES'
      );
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
