/**
 * Middleware Nesting Order Test
 *
 * Verifies that `withRateLimit` wraps `withUserValidation` (not the reverse)
 * across all API routes changed in issue #461.
 *
 * Correct order: withRateLimit(key, withUserValidation(handler))
 *   - withUserValidation is called first (inner)
 *   - withRateLimit receives the result as its handler argument (outer)
 *
 * Wrong order: withUserValidation(withRateLimit(key, handler))
 *   - This would skip rate limiting for unauthenticated requests
 */

// Sentinel values to track wrapping
const USER_VALIDATION_SENTINEL = Symbol('withUserValidation');
const RATE_LIMIT_SENTINEL = Symbol('withRateLimit');

interface WrapCall {
  middleware: string;
  receivedInner: unknown;
}

let wrapCalls: WrapCall[] = [];

// Mock middleware modules BEFORE any route imports
jest.mock('@/lib/middleware/with-user-validation', () => ({
  withUserValidation: jest.fn((handler: unknown) => {
    wrapCalls.push({ middleware: 'withUserValidation', receivedInner: handler });
    // Return a sentinel so withRateLimit can identify it received a withUserValidation result
    return USER_VALIDATION_SENTINEL;
  }),
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: unknown) => {
    wrapCalls.push({ middleware: 'withRateLimit', receivedInner: handler });
    return RATE_LIMIT_SENTINEL;
  }),
}));

// CSRF is the outermost wrapper on write endpoints - passthrough for this test
jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: jest.fn((handler: unknown) => handler),
}));

// Mock dependencies that route modules import at module level
jest.mock('@/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));
jest.mock('@/lib/database', () => ({
  prisma: {},
}));
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  sanitizeError: jest.fn((e: unknown) => e),
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('@/lib/services/digest-service', () => ({
  digestService: {
    getDigest: jest.fn(),
    invalidateUserCache: jest.fn(),
  },
}));
jest.mock('@/lib/comments/comment-service', () => ({
  commentService: {
    createComment: jest.fn(),
    getCommentsByArticle: jest.fn(),
  },
}));
jest.mock('@/lib/utils/prisma-error-handler', () => ({
  handlePrismaError: jest.fn(),
}));
jest.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: jest.fn(),
  createRateLimiterFromConfig: jest.fn(),
  RateLimitError: class RateLimitError extends Error {},
}));
jest.mock('@/lib/config/rate-limits', () => ({
  getRateLimitConfig: jest.fn(),
}));
jest.mock('@/lib/cache/comments-cache', () => ({
  commentsCache: {
    getComments: jest.fn(),
    setComments: jest.fn(),
    invalidate: jest.fn(),
  },
}));
jest.mock('@/lib/favorites/cache-helpers', () => ({
  updateFavoriteCacheBestEffort: jest.fn(),
  setFavoriteBustCookie: jest.fn(),
}));
jest.mock('@/lib/redis/factory', () => ({
  getRedisService: jest.fn(),
}));
jest.mock('@/lib/dataloader/article-view-loader', () => ({
  invalidateUserViewCache: jest.fn(),
  invalidateViewCache: jest.fn(),
}));
jest.mock('@/lib/auth/utils', () => ({
  verifyPassword: jest.fn(),
  deleteUserAccountWithAudit: jest.fn(),
}));

/**
 * Asserts that the middleware nesting order is correct:
 * withUserValidation is called first (inner), then withRateLimit wraps it (outer).
 *
 * The correct pattern: withRateLimit(key, withUserValidation(handler))
 * JavaScript evaluates inner arguments first, so:
 *   1. withUserValidation(handler) is called -> returns USER_VALIDATION_SENTINEL
 *   2. withRateLimit(key, USER_VALIDATION_SENTINEL) is called -> returns RATE_LIMIT_SENTINEL
 */
function assertCorrectMiddlewareOrder(
  calls: WrapCall[],
  endpointDescription: string
) {
  // Filter to only withUserValidation and withRateLimit calls
  const relevantCalls = calls.filter(
    (c) =>
      c.middleware === 'withUserValidation' ||
      c.middleware === 'withRateLimit'
  );

  expect(relevantCalls.length).toBeGreaterThanOrEqual(2);

  // Find the last pair (in case of multiple endpoints in one module)
  // For modules with a single rate-limited endpoint, there's exactly one pair
  // For modules with multiple, we check each pair
  for (let i = 0; i < relevantCalls.length; i++) {
    if (relevantCalls[i].middleware === 'withRateLimit') {
      // The withRateLimit call should have received USER_VALIDATION_SENTINEL
      // which means withUserValidation was called first (inner)
      expect(relevantCalls[i].receivedInner).toBe(USER_VALIDATION_SENTINEL);
    }
  }
}

/**
 * Rate-limited endpoints that must have withRateLimit wrapping withUserValidation.
 * Add new entries here when adding rate limiting to new endpoints.
 */
const RATE_LIMITED_ENDPOINTS: {
  method: string;
  path: string;
  modulePath: string;
}[] = [
  { method: 'GET', path: '/api/digest', modulePath: '@/app/api/digest/route' },
  { method: 'POST', path: '/api/user/preferences/categories', modulePath: '@/app/api/user/preferences/categories/route' },
  { method: 'PUT', path: '/api/user/source-presets/[id]', modulePath: '@/app/api/user/source-presets/[id]/route' },
  { method: 'DELETE', path: '/api/user/source-presets/[id]', modulePath: '@/app/api/user/source-presets/[id]/route' },
  { method: 'POST', path: '/api/user/source-presets', modulePath: '@/app/api/user/source-presets/route' },
  { method: 'POST', path: '/api/comments', modulePath: '@/app/api/comments/route' },
  { method: 'POST', path: '/api/favorites', modulePath: '@/app/api/favorites/route' },
  { method: 'DELETE', path: '/api/favorites', modulePath: '@/app/api/favorites/route' },
  { method: 'POST', path: '/api/favorites/[articleId]', modulePath: '@/app/api/favorites/[articleId]/route' },
  { method: 'DELETE', path: '/api/favorites/[articleId]', modulePath: '@/app/api/favorites/[articleId]/route' },
  { method: 'POST', path: '/api/articles/read-status', modulePath: '@/app/api/articles/read-status/route' },
  { method: 'PUT', path: '/api/articles/read-status', modulePath: '@/app/api/articles/read-status/route' },
  { method: 'DELETE', path: '/api/articles/read-status', modulePath: '@/app/api/articles/read-status/route' },
  { method: 'DELETE', path: '/api/user/delete', modulePath: '@/app/api/user/delete/route' },
];

describe('Middleware nesting order (issue #461 regression)', () => {
  beforeEach(() => {
    wrapCalls = [];
    jest.clearAllMocks();
  });

  it.each(
    RATE_LIMITED_ENDPOINTS.map((ep) => [
      `${ep.method} ${ep.path}`,
      ep.method,
      ep.modulePath,
    ])
  )(
    '%s: withRateLimit wraps withUserValidation',
    (_label, method, modulePath) => {
      jest.isolateModules(() => {
        wrapCalls = [];
        const mod = require(modulePath);
        expect(mod[method]).toBe(RATE_LIMIT_SENTINEL);
        assertCorrectMiddlewareOrder(wrapCalls, _label);
      });
    }
  );

  it('withRateLimit always receives withUserValidation result across all endpoints', () => {
    // Core regression check: if someone reverses the order to
    // withUserValidation(withRateLimit(key, handler)), then withRateLimit
    // would receive a raw handler function, NOT the USER_VALIDATION_SENTINEL
    const uniqueModules = [
      ...new Set(RATE_LIMITED_ENDPOINTS.map((ep) => ep.modulePath)),
    ];

    jest.isolateModules(() => {
      wrapCalls = [];
      for (const modulePath of uniqueModules) {
        require(modulePath);
      }

      const rateLimitCalls = wrapCalls.filter(
        (c) => c.middleware === 'withRateLimit'
      );

      expect(rateLimitCalls.length).toBe(RATE_LIMITED_ENDPOINTS.length);

      for (const call of rateLimitCalls) {
        expect(call.receivedInner).toBe(USER_VALIDATION_SENTINEL);
      }
    });
  });
});
