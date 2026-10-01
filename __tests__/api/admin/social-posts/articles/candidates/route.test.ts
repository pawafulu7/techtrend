import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Middleware is passthrough here: authentication / composition are covered by
// __tests__/api/auth-middleware-unification.test.ts and
// __tests__/api/auth-middleware-composition.test.ts.
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: any) => handler),
}));

jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: jest.fn((handler: any) => {
    return (request: any, context: any) =>
      handler(request, {
        session: { user: { id: 'admin-user' } },
        ...context,
      });
  }),
}));

// Mock SocialPostSelector
const mockSearchCandidateArticles = jest.fn();
jest.mock('@/lib/social-post', () => {
  const actual = jest.requireActual('@/lib/social-post');
  return {
    ...actual,
    SocialPostSelector: jest.fn().mockImplementation(() => ({
      searchCandidateArticles: mockSearchCandidateArticles,
    })),
  };
});

// Mock prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {},
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
const { GET } = require('@/app/api/admin/social-posts/articles/candidates/route');

describe('GET /api/admin/social-posts/articles/candidates', () => {
  const mockArticles = [
    {
      id: 'article-1',
      title: 'Claude Code 1.0.40 Released',
      translatedTitle: 'Claude Code 1.0.40リリース',
      summary: 'New features for Claude Code',
      category: 'ai_ml',
      publishedAt: new Date('2026-01-25T10:00:00Z'),
      createdAt: new Date('2026-01-25T12:00:00Z'),
      qualityScore: 80,
      skipReason: null,
      sourceId: 'source-1',
      source: { name: 'Hacker News' },
      tags: [{ name: 'AI' }, { name: 'Claude' }],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchCandidateArticles.mockResolvedValue(mockArticles);
  });

  it('should return candidate articles without filters', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/articles/candidates'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.articles).toHaveLength(1);
    expect(data.count).toBe(1);
    expect(mockSearchCandidateArticles).toHaveBeenCalledWith({
      category: undefined,
      keyword: undefined,
      limit: 10,
    });
  });

  it('should filter by category', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/articles/candidates?category=ai_ml'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSearchCandidateArticles).toHaveBeenCalledWith({
      category: 'ai_ml',
      keyword: undefined,
      limit: 10,
    });
  });

  it('should filter by keyword', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/articles/candidates?keyword=Claude'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSearchCandidateArticles).toHaveBeenCalledWith({
      category: undefined,
      keyword: 'Claude',
      limit: 10,
    });
  });

  it('should filter by category and keyword', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/articles/candidates?category=ai_ml&keyword=Claude'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSearchCandidateArticles).toHaveBeenCalledWith({
      category: 'ai_ml',
      keyword: 'Claude',
      limit: 10,
    });
  });

  it('should respect limit parameter', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/articles/candidates?limit=5'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSearchCandidateArticles).toHaveBeenCalledWith({
      category: undefined,
      keyword: undefined,
      limit: 5,
    });
  });

  it('should return 400 for invalid category', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/articles/candidates?category=invalid_category'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid query parameters');
  });

  it('should return 400 for limit exceeding max', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/articles/candidates?limit=100'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid query parameters');
  });

  it('should return 500 on service error', async () => {
    mockSearchCandidateArticles.mockRejectedValue(new Error('Database error'));

    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/articles/candidates'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to search candidate articles');
  });

  it('should log search request', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/admin/social-posts/articles/candidates?category=ai_ml&keyword=Claude&limit=5'
    );
    await GET(request);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-user',
        category: 'ai_ml',
        keyword: 'Claude',
        limit: 5,
        resultCount: 1,
      }),
      '[SocialPostsAPI] Searched candidate articles'
    );
  });
});
