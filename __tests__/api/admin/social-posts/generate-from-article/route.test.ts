import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock auth
const mockGetSession = jest.fn();
jest.mock('@/lib/auth/get-session', () => ({
  getSession: mockGetSession,
}));

// Mock rate limiter
jest.mock('@/lib/rate-limiter', () => {
  const actual = jest.requireActual('@/lib/rate-limiter');
  return {
    ...actual,
    checkRateLimit: jest
      .fn()
      .mockResolvedValue({ limit: 10, remaining: 9, reset: new Date() }),
    createRateLimiterFromConfig: jest.fn().mockReturnValue({
      consume: jest.fn().mockResolvedValue({}),
    }),
  };
});

// Mock service
const mockGenerate = jest.fn();
jest.mock('@/lib/social-post', () => {
  const actual = jest.requireActual('@/lib/social-post');
  return {
    ...actual,
    getSocialPostService: () => ({
      generate: mockGenerate,
    }),
  };
});

// Mock CSRF protection (pass-through in tests)
jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (handler: any) => handler,
}));

// Mock user validation
jest.mock('@/lib/middleware/with-user-validation', () => ({
  validateUser: jest.fn().mockImplementation(async (session) => session?.user ? { id: session.user.id, deletedAt: null } : null),
  createUserDeletedResponse: jest.fn(),
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
};
jest.mock('@/lib/logger', () => mockLogger);

// Import handler after mocks
const { POST } = require('@/app/api/admin/social-posts/generate-from-article/route');

describe('POST /api/admin/social-posts/generate-from-article', () => {
  const mockPost = {
    id: 'post-1',
    content: 'Generated content',
    status: 'DRAFT',
    source: 'ARTICLE',
    sourceIds: ['article-1'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: 'admin-user', role: 'admin' },
      session: { id: 's1', userId: 'admin-user', token: 't1', expiresAt: new Date() },
    });
    mockGenerate.mockResolvedValue({
      succeeded: [mockPost],
      failed: [],
    });
  });

  it('should return 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);

    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/generate-from-article',
      {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article-1' }),
      }
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized. Authentication required.');
  });

  it('should return 403 when user is not admin', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'regular-user', role: 'user' },
      session: { id: 's2', userId: 'regular-user', token: 't2', expiresAt: new Date() },
    });

    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/generate-from-article',
      {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article-1' }),
      }
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden. Admin access required.');
  });

  it('should return 400 for missing articleId', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/generate-from-article',
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });

  it('should return 400 for empty articleId', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/generate-from-article',
      {
        method: 'POST',
        body: JSON.stringify({ articleId: '' }),
      }
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });

  it('should generate post from article successfully', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/generate-from-article',
      {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article-1' }),
      }
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.post).toEqual(mockPost);
    expect(mockGenerate).toHaveBeenCalledWith(
      { source: 'ARTICLE', sourceIds: ['article-1'] },
      'admin-user',
      expect.objectContaining({})
    );
  });

  it('should return 400 when generation fails', async () => {
    mockGenerate.mockResolvedValue({
      succeeded: [],
      failed: [{ sourceId: 'article-1', error: 'Article not found' }],
    });

    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/generate-from-article',
      {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article-1' }),
      }
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Article not found');
  });

  it('should log successful generation', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/generate-from-article',
      {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article-1' }),
      }
    );
    await POST(request);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-user',
        articleId: 'article-1',
        succeeded: 1,
      }),
      '[SocialPostsAPI] Generated post from specific article'
    );
  });

  it('should return 400 for invalid JSON', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/generate-from-article',
      {
        method: 'POST',
        body: 'invalid json',
      }
    );
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid JSON in request body');
  });
});
