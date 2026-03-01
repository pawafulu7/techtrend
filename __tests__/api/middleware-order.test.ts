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
jest.mock('@/lib/auth/auth');
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

describe('Middleware nesting order (issue #461 regression)', () => {
  beforeEach(() => {
    wrapCalls = [];
    jest.clearAllMocks();
  });

  it('GET /api/digest: withRateLimit wraps withUserValidation', () => {
    jest.isolateModules(() => {
      wrapCalls = [];
      const mod = require('@/app/api/digest/route');
      // GET should be the result of withRateLimit (outermost for read endpoints)
      expect(mod.GET).toBe(RATE_LIMIT_SENTINEL);
      assertCorrectMiddlewareOrder(wrapCalls, 'GET /api/digest');
    });
  });

  it('POST /api/user/preferences/categories: withRateLimit wraps withUserValidation', () => {
    jest.isolateModules(() => {
      wrapCalls = [];
      const mod = require('@/app/api/user/preferences/categories/route');
      // POST goes through CSRF -> withRateLimit -> withUserValidation
      // CSRF is passthrough, so POST === RATE_LIMIT_SENTINEL
      expect(mod.POST).toBe(RATE_LIMIT_SENTINEL);
      assertCorrectMiddlewareOrder(wrapCalls, 'POST /api/user/preferences/categories');
    });
  });

  it('PUT /api/user/source-presets/[id]: withRateLimit wraps withUserValidation', () => {
    jest.isolateModules(() => {
      wrapCalls = [];
      const mod = require('@/app/api/user/source-presets/[id]/route');
      expect(mod.PUT).toBe(RATE_LIMIT_SENTINEL);
      assertCorrectMiddlewareOrder(wrapCalls, 'PUT /api/user/source-presets/[id]');
    });
  });

  it('DELETE /api/user/source-presets/[id]: withRateLimit wraps withUserValidation', () => {
    jest.isolateModules(() => {
      wrapCalls = [];
      const mod = require('@/app/api/user/source-presets/[id]/route');
      // Both PUT and DELETE are in the same module
      // Check that DELETE is also RATE_LIMIT_SENTINEL
      expect(mod.DELETE).toBe(RATE_LIMIT_SENTINEL);
      // The module defines two rate-limited endpoints (PUT, DELETE)
      // Both should have correct nesting
      const rateLimitCalls = wrapCalls.filter(
        (c) => c.middleware === 'withRateLimit'
      );
      for (const call of rateLimitCalls) {
        expect(call.receivedInner).toBe(USER_VALIDATION_SENTINEL);
      }
    });
  });

  it('POST /api/user/source-presets: withRateLimit wraps withUserValidation', () => {
    jest.isolateModules(() => {
      wrapCalls = [];
      const mod = require('@/app/api/user/source-presets/route');
      expect(mod.POST).toBe(RATE_LIMIT_SENTINEL);
      assertCorrectMiddlewareOrder(wrapCalls, 'POST /api/user/source-presets');
    });
  });

  it('POST /api/comments: withRateLimit wraps withUserValidation', () => {
    jest.isolateModules(() => {
      wrapCalls = [];
      const mod = require('@/app/api/comments/route');
      expect(mod.POST).toBe(RATE_LIMIT_SENTINEL);
      assertCorrectMiddlewareOrder(wrapCalls, 'POST /api/comments');
    });
  });

  it('withRateLimit always receives withUserValidation result (not raw handler)', () => {
    // This is the core regression check: if someone reverses the order to
    // withUserValidation(withRateLimit(key, handler)), then withRateLimit
    // would receive a raw handler function, NOT the USER_VALIDATION_SENTINEL
    jest.isolateModules(() => {
      wrapCalls = [];
      require('@/app/api/digest/route');
      require('@/app/api/user/preferences/categories/route');
      require('@/app/api/user/source-presets/route');
      require('@/app/api/user/source-presets/[id]/route');
      require('@/app/api/comments/route');

      const rateLimitCalls = wrapCalls.filter(
        (c) => c.middleware === 'withRateLimit'
      );

      // All rate-limited endpoints should have received the withUserValidation sentinel
      // digest GET: 1
      // categories POST: 1
      // source-presets POST: 1
      // source-presets/[id] PUT + DELETE: 2
      // comments POST: 1
      // Total: 6
      expect(rateLimitCalls.length).toBe(6);

      for (const call of rateLimitCalls) {
        expect(call.receivedInner).toBe(USER_VALIDATION_SENTINEL);
      }
    });
  });
});
