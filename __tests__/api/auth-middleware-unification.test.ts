/**
 * Auth middleware unification test (issues #659, #662)
 *
 * Runs the real withAdminAuth / withUserValidation / withCSRFProtection over
 * every HTTP method of the 16 routes that used to authenticate inside the
 * handler, and checks that:
 * - unauthenticated requests get 401
 * - deleted users get 401 USER_DELETED
 * - non-admin users get 403 on admin routes
 * - cross-site write requests get 403 from CSRF protection
 * - allowed requests reach the handler with the right user id
 *
 * Only withRateLimit is a pass-through (it needs Redis). Wrapper order is
 * checked separately in auth-middleware-composition.test.ts.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: unknown) => handler),
}));

jest.mock('@/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
  CREDENTIAL_PROVIDER_ID: 'credential',
}));

jest.mock('@/lib/auth/user-auth-cache');

jest.mock('@/lib/auth/utils', () => ({
  changePassword: jest.fn(),
}));

// agent-search はレート制限を handler の中で行う（withRateLimit を使わない）。
// handler に届いたかどうかと、レート制限のキーに使われたユーザー ID をこれで確かめる
const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rate-limiter', () => {
  const actual = jest.requireActual('@/lib/rate-limiter');
  return {
    ...actual,
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  };
});

// agent-search の後段（SSE / batch）。検証済みユーザーの ID が渡ることだけを確かめる
const mockHandleStreamingRequest = jest.fn();
const mockHandleBatchRequest = jest.fn();
jest.mock('@/app/api/rag/agent-search/streaming-handler', () => ({
  handleStreamingRequest: (...args: unknown[]) =>
    mockHandleStreamingRequest(...args),
}));
jest.mock('@/app/api/rag/agent-search/batch-handler', () => ({
  handleBatchRequest: (...args: unknown[]) => mockHandleBatchRequest(...args),
}));

const mockSocialPostService = {
  list: jest.fn(),
  getById: jest.fn(),
  getByIdWithAuditLogs: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  bulkAction: jest.fn(),
  generate: jest.fn(),
  generateScheduledPosts: jest.fn(),
  generateOpinionPosts: jest.fn(),
  getStatusCounts: jest.fn(),
};
const mockSearchCandidateArticles = jest.fn();

jest.mock('@/lib/social-post', () => {
  const actual = jest.requireActual('@/lib/social-post');
  return {
    ...actual,
    getSocialPostService: () => mockSocialPostService,
    SocialPostSelector: jest.fn().mockImplementation(() => ({
      searchCandidateArticles: mockSearchCandidateArticles,
    })),
    SocialPostCreateSchema: {
      safeParse: jest.fn().mockReturnValue({
        success: true,
        data: {
          content: 'Test content',
          hashtags: ['#Test'],
          sourceUrls: ['https://example.com'],
          source: 'MANUAL',
        },
      }),
    },
  };
});

jest.mock('@/lib/cache/stats-cache', () => ({
  statsCache: { getStats: () => ({ hits: 3, misses: 1 }) },
}));
jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: { getStats: () => ({ hits: 1, misses: 1 }) },
}));

jest.mock('@/lib/dataloader/batch-optimizer', () => ({
  getAllOptimizerStats: () => ({}),
}));
jest.mock('@/lib/dataloader/favorite-loader', () => ({
  createFavoriteLoader: jest.fn(),
  getFavoriteLoaderStats: () => null,
}));
jest.mock('@/lib/dataloader/article-view-loader', () => ({
  getViewLoaderStats: () => null,
}));


import { auth } from '@/lib/auth/auth';
import { getUserAuthData } from '@/lib/auth/user-auth-cache';
import { prisma } from '@/lib/prisma';

import * as socialPosts from '@/app/api/admin/social-posts/route';
import * as socialPostById from '@/app/api/admin/social-posts/[id]/route';
import * as socialPostsBulk from '@/app/api/admin/social-posts/bulk/route';
import * as socialPostsGenerate from '@/app/api/admin/social-posts/generate/route';
import * as socialPostsGenerateOpinion from '@/app/api/admin/social-posts/generate-opinion/route';
import * as socialPostsGenerateFromArticle from '@/app/api/admin/social-posts/generate-from-article/route';
import * as socialPostsCandidates from '@/app/api/admin/social-posts/articles/candidates/route';
import * as socialPostsStats from '@/app/api/admin/social-posts/stats/route';
import * as cacheStats from '@/app/api/cache/stats/route';
import * as batchOptimizer from '@/app/api/metrics/batch-optimizer/route';
import * as favoritesBatch from '@/app/api/favorites/batch/route';
import * as categories from '@/app/api/user/preferences/categories/route';
import * as profile from '@/app/api/user/profile/route';
import * as password from '@/app/api/user/password/route';
import * as agentSearch from '@/app/api/rag/agent-search/route';
import { changePassword } from '@/lib/auth/utils';
import { RateLimitError } from '@/lib/rate-limiter';
import { features } from '@/lib/config/env';

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<Response>;

type Row = {
  label: string;
  kind: 'admin' | 'user';
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  handler: RouteHandler;
};

const h = (fn: unknown) => fn as RouteHandler;

const ROWS: Row[] = [
  // Admin API (10 routes, 13 methods)
  { label: 'GET /api/admin/social-posts', kind: 'admin', method: 'GET', path: '/api/admin/social-posts', handler: h(socialPosts.GET) },
  { label: 'POST /api/admin/social-posts', kind: 'admin', method: 'POST', path: '/api/admin/social-posts', handler: h(socialPosts.POST) },
  { label: 'GET /api/admin/social-posts/[id]', kind: 'admin', method: 'GET', path: '/api/admin/social-posts/post-1', handler: h(socialPostById.GET) },
  { label: 'PATCH /api/admin/social-posts/[id]', kind: 'admin', method: 'PATCH', path: '/api/admin/social-posts/post-1', handler: h(socialPostById.PATCH) },
  { label: 'DELETE /api/admin/social-posts/[id]', kind: 'admin', method: 'DELETE', path: '/api/admin/social-posts/post-1', handler: h(socialPostById.DELETE) },
  { label: 'POST /api/admin/social-posts/bulk', kind: 'admin', method: 'POST', path: '/api/admin/social-posts/bulk', handler: h(socialPostsBulk.POST) },
  { label: 'POST /api/admin/social-posts/generate', kind: 'admin', method: 'POST', path: '/api/admin/social-posts/generate', handler: h(socialPostsGenerate.POST) },
  { label: 'POST /api/admin/social-posts/generate-opinion', kind: 'admin', method: 'POST', path: '/api/admin/social-posts/generate-opinion', handler: h(socialPostsGenerateOpinion.POST) },
  { label: 'POST /api/admin/social-posts/generate-from-article', kind: 'admin', method: 'POST', path: '/api/admin/social-posts/generate-from-article', handler: h(socialPostsGenerateFromArticle.POST) },
  { label: 'GET /api/admin/social-posts/articles/candidates', kind: 'admin', method: 'GET', path: '/api/admin/social-posts/articles/candidates', handler: h(socialPostsCandidates.GET) },
  { label: 'GET /api/admin/social-posts/stats', kind: 'admin', method: 'GET', path: '/api/admin/social-posts/stats', handler: h(socialPostsStats.GET) },
  { label: 'GET /api/cache/stats', kind: 'admin', method: 'GET', path: '/api/cache/stats', handler: h(cacheStats.GET) },
  { label: 'GET /api/metrics/batch-optimizer', kind: 'admin', method: 'GET', path: '/api/metrics/batch-optimizer', handler: h(batchOptimizer.GET) },
  // User API (5 routes, 6 methods)
  { label: 'POST /api/favorites/batch', kind: 'user', method: 'POST', path: '/api/favorites/batch', handler: h(favoritesBatch.POST) },
  { label: 'GET /api/user/preferences/categories', kind: 'user', method: 'GET', path: '/api/user/preferences/categories', handler: h(categories.GET) },
  { label: 'POST /api/user/preferences/categories', kind: 'user', method: 'POST', path: '/api/user/preferences/categories', handler: h(categories.POST) },
  { label: 'GET /api/user/profile', kind: 'user', method: 'GET', path: '/api/user/profile', handler: h(profile.GET) },
  // issue #662
  { label: 'POST /api/user/password', kind: 'user', method: 'POST', path: '/api/user/password', handler: h(password.POST) },
  { label: 'POST /api/rag/agent-search', kind: 'user', method: 'POST', path: '/api/rag/agent-search', handler: h(agentSearch.POST) },
];

const WRITE_ROWS = ROWS.filter((row) => row.method !== 'GET');
const ADMIN_ROWS = ROWS.filter((row) => row.kind === 'admin');

const BASE_URL = 'http://localhost:3000';
const SAME_ORIGIN_HEADERS = { 'sec-fetch-site': 'same-origin' };
const CROSS_SITE_HEADERS = {
  origin: 'https://evil.example',
  'sec-fetch-site': 'cross-site',
};

const USER_ID = 'user-1';
const VALID_SESSION = {
  user: { id: USER_ID, email: 'user@example.com', name: 'User' },
  session: { id: 's1', userId: USER_ID, token: 't1', expiresAt: new Date() },
};

const mockGetSession = auth.api.getSession as unknown as jest.Mock;
const mockGetUserAuthData = getUserAuthData as jest.MockedFunction<
  typeof getUserAuthData
>;
const prismaMock = prisma as any;
// Same access pattern as __tests__/api/user/preferences/categories.test.ts
const { resetPrismaMock } = require('@/lib/prisma') as {
  resetPrismaMock: () => void;
};

function makeRequest(
  row: Pick<Row, 'method' | 'path'>,
  headers: Record<string, string> = SAME_ORIGIN_HEADERS,
  body: unknown = {}
): NextRequest {
  const hasBody = row.method !== 'GET';
  return new NextRequest(`${BASE_URL}${row.path}`, {
    method: row.method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
}

function makeContext() {
  return { params: Promise.resolve({ id: 'post-1' }) };
}

function setFindUnique(deletedAt: Date | null) {
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where: { id: string }; select?: { accounts?: unknown } }) => {
      if (args.select?.accounts) {
        return {
          id: args.where.id,
          email: 'user@example.com',
          name: 'User',
          image: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt,
          accounts: [{ providerId: 'credential', password: 'hashed' }],
        };
      }
      return { id: args.where.id, deletedAt };
    }
  );
}

function expectSocialPostServiceNotCalled() {
  for (const fn of Object.values(mockSocialPostService)) {
    expect(fn).not.toHaveBeenCalled();
  }
  expect(mockSearchCandidateArticles).not.toHaveBeenCalled();
}

describe('Auth middleware unification (issues #659, #662)', () => {
  beforeEach(() => {
    resetPrismaMock();
    jest.clearAllMocks();
    // Reset implementations explicitly so rows do not leak state to each other
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue(VALID_SESSION);
    mockGetUserAuthData.mockReset();
    mockGetUserAuthData.mockResolvedValue({ role: 'admin', deletedAt: null });
    setFindUnique(null);
    mockCheckRateLimit.mockReset();
    mockHandleStreamingRequest.mockReset();
    mockHandleBatchRequest.mockReset();
  });

  it('covers 19 methods (13 admin + 6 user), 11 of them writes', () => {
    expect(ROWS).toHaveLength(19);
    expect(ADMIN_ROWS).toHaveLength(13);
    expect(WRITE_ROWS).toHaveLength(11);
  });

  describe('unauthenticated requests', () => {
    it.each(ROWS.map((row) => [row.label, row] as const))(
      '%s returns 401',
      async (_label, row) => {
        mockGetSession.mockResolvedValue(null);

        const response = await row.handler(makeRequest(row), makeContext());
        const body = await response.json();

        expect(response.status).toBe(401);
        if (row.kind === 'admin') {
          expect(body.error).toBe('Unauthorized');
        } else {
          expect(body.code).toBe('NOT_AUTHENTICATED');
        }
        expectSocialPostServiceNotCalled();
        expect(changePassword).not.toHaveBeenCalled();
        // agent-search の handler に届いていない（他の行では呼ばれない経路）
        expect(mockCheckRateLimit).not.toHaveBeenCalled();
      }
    );
  });

  describe('deleted users', () => {
    it.each(ROWS.map((row) => [row.label, row] as const))(
      '%s returns 401 USER_DELETED',
      async (_label, row) => {
        // Admin routes: take the deletedAt branch, not the "no auth data" branch
        mockGetUserAuthData.mockResolvedValue({
          role: 'admin',
          deletedAt: '2026-09-30T00:00:00.000Z',
        });
        setFindUnique(new Date('2026-09-30T00:00:00.000Z'));

        const response = await row.handler(makeRequest(row), makeContext());
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.code).toBe('USER_DELETED');
        expect(body.requiresLogout).toBe(true);
        expectSocialPostServiceNotCalled();
        expect(changePassword).not.toHaveBeenCalled();
        // agent-search の handler に届いていない（他の行では呼ばれない経路）
        expect(mockCheckRateLimit).not.toHaveBeenCalled();
      }
    );
  });

  describe('non-admin users on admin routes', () => {
    it.each(ADMIN_ROWS.map((row) => [row.label, row] as const))(
      '%s returns 403',
      async (_label, row) => {
        mockGetUserAuthData.mockResolvedValue({ role: 'user', deletedAt: null });

        const response = await row.handler(makeRequest(row), makeContext());
        const body = await response.json();

        expect(response.status).toBe(403);
        expect(body.error).toBe('Forbidden');
        expectSocialPostServiceNotCalled();
      }
    );
  });

  describe('cross-site write requests', () => {
    it.each(WRITE_ROWS.map((row) => [row.label, row] as const))(
      '%s returns 403 from CSRF protection',
      async (_label, row) => {
        const response = await row.handler(
          makeRequest(row, CROSS_SITE_HEADERS),
          makeContext()
        );
        const body = await response.json();

        expect(response.status).toBe(403);
        expect(body.error).toBe('CSRF validation failed');
        expectSocialPostServiceNotCalled();
        expect(changePassword).not.toHaveBeenCalled();
        // agent-search の handler に届いていない（他の行では呼ばれない経路）
        expect(mockCheckRateLimit).not.toHaveBeenCalled();
      }
    );
  });

  describe('user validation failures (DB errors)', () => {
    const USER_ROWS = ROWS.filter((row) => row.kind === 'user');

    it.each(USER_ROWS.map((row) => [row.label, row] as const))(
      '%s returns JSON 500 when the user lookup throws',
      async (_label, row) => {
        prismaMock.user.findUnique.mockRejectedValue(new Error('db down'));

        const response = await row.handler(makeRequest(row), makeContext());
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body).toEqual({ error: 'Internal server error' });
        expect(changePassword).not.toHaveBeenCalled();
        expect(mockCheckRateLimit).not.toHaveBeenCalled();
      }
    );
  });

  describe('allowed requests reach the handler', () => {
    it('POST /api/admin/social-posts creates a post for an admin (same origin)', async () => {
      mockSocialPostService.create.mockResolvedValue({ id: 'post-1' });

      const response = await socialPosts.POST(
        makeRequest({ method: 'POST', path: '/api/admin/social-posts' }),
        makeContext() as never
      );

      expect(response.status).toBe(201);
      expect(mockSocialPostService.create).toHaveBeenCalledWith(
        expect.any(Object),
        USER_ID,
        expect.any(Object)
      );
    });

    it('GET /api/cache/stats returns stats for an admin', async () => {
      const response = await cacheStats.GET(
        makeRequest({ method: 'GET', path: '/api/cache/stats' }),
        makeContext()
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.caches.stats.hits).toBe(3);
    });

    it('GET /api/metrics/batch-optimizer returns metrics for an admin', async () => {
      const response = await batchOptimizer.GET(
        makeRequest({ method: 'GET', path: '/api/metrics/batch-optimizer' }),
        makeContext()
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('POST /api/favorites/batch queries favorites of the validated user', async () => {
      prismaMock.favorite.findMany.mockResolvedValue([{ articleId: 'a1' }]);

      const response = await favoritesBatch.POST(
        makeRequest(
          { method: 'POST', path: '/api/favorites/batch' },
          SAME_ORIGIN_HEADERS,
          { articleIds: ['a1', 'a2'] }
        ),
        makeContext()
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.favorites).toEqual({ a1: true, a2: false });
      expect(prismaMock.favorite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID }),
        })
      );
    });

    it('POST /api/user/password changes the password of the validated user', async () => {
      (changePassword as jest.Mock).mockResolvedValue(0);

      const response = await password.POST(
        makeRequest(
          { method: 'POST', path: '/api/user/password' },
          SAME_ORIGIN_HEADERS,
          {
            currentPassword: 'oldPassword123',
            newPassword: 'NewPassword123',
            confirmPassword: 'NewPassword123',
          }
        ),
        makeContext()
      );

      expect(response.status).toBe(200);
      expect(changePassword).toHaveBeenCalledWith(
        USER_ID,
        'oldPassword123',
        'NewPassword123',
        't1'
      );
    });

    it('POST /api/rag/agent-search rate-limits by the validated user id', async () => {
      mockCheckRateLimit.mockRejectedValue(
        new RateLimitError('limited', 5, 0, new Date(Date.now() + 60_000))
      );

      const response = await agentSearch.POST(
        makeRequest(
          { method: 'POST', path: '/api/rag/agent-search' },
          SAME_ORIGIN_HEADERS,
          { query: 'react hooks', agentType: 'article-search' }
        ),
        makeContext()
      );

      expect(response.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        `rag:agent:article-search:${USER_ID}`,
        expect.anything()
      );
    });

    it.each([
      ['streaming', true],
      ['batch', false],
    ] as const)(
      'POST /api/rag/agent-search passes the validated user id to the %s handler',
      async (_mode, streaming) => {
        const streamingSpy = jest
          .spyOn(features, 'isAgentStreamingEnabled')
          .mockReturnValue(streaming);
        mockCheckRateLimit.mockResolvedValue({
          limit: 5,
          remaining: 4,
          reset: new Date(Date.now() + 60_000),
        });
        const downstream = streaming
          ? mockHandleStreamingRequest
          : mockHandleBatchRequest;
        downstream.mockResolvedValue(new Response(null, { status: 200 }));

        try {
          const response = await agentSearch.POST(
            makeRequest(
              { method: 'POST', path: '/api/rag/agent-search' },
              SAME_ORIGIN_HEADERS,
              { query: 'react hooks', agentType: 'article-search' }
            ),
            makeContext()
          );

          expect(response.status).toBe(200);
          expect(downstream).toHaveBeenCalledTimes(1);
          expect(downstream.mock.calls[0][1]).toBe(USER_ID);
          expect(
            (streaming ? mockHandleBatchRequest : mockHandleStreamingRequest)
          ).not.toHaveBeenCalled();
        } finally {
          streamingSpy.mockRestore();
        }
      }
    );

    it('GET /api/user/profile returns the profile of the validated user', async () => {
      const response = await profile.GET(
        makeRequest({ method: 'GET', path: '/api/user/profile' }),
        makeContext()
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.id).toBe(USER_ID);
      expect(body.hasPassword).toBe(true);
      expect(body.providers).toEqual(['credential']);
    });
  });
});
