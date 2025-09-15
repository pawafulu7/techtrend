import { NextRequest } from 'next/server';
// Import GET after mocks are registered via require below

// Mock auth first
jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn(),
}));

// Mock next-auth
jest.mock('next-auth', () => ({
  default: jest.fn(() => ({
    handlers: {},
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/auth/config', () => ({
  authOptions: {},
}));

// 明示的に Prisma クライアントをモック（ルートが同一インスタンスを参照するよう保証）
jest.mock('@/lib/prisma', () => {
  const prisma = {
    article: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    favorite: {
      findMany: jest.fn(),
    },
    articleView: {
      findMany: jest.fn(),
    },
    tag: {
      findMany: jest.fn(),
    },
  };
  return { prisma };
});

// Use Prisma client mock
const { prisma } = require('@/lib/prisma');
// Defer requiring GET until inside each test (ensures fresh module with mocks)

describe('/api/articles/list with user data', () => {
  const mockUserId = 'test-user-id';
  const mockArticleId1 = 'article-1';
  const mockArticleId2 = 'article-2';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should include user data when includeUserData=true and user is authenticated', async () => {
    // Mock auth to return authenticated user
    const { auth } = require('@/lib/auth/auth');
    auth.mockResolvedValueOnce({
      user: { id: mockUserId }
    });

    // Mock Prisma queries
    // prisma mock comes from __mocks__/lib/prisma
    const mockArticles = [
      {
        id: mockArticleId1,
        title: 'Test Article 1',
        url: 'https://example.com/1',
        publishedAt: new Date(),
        sourceId: 'source-1',
        source: { id: 'source-1', name: 'Test Source' },
        tags: [],
      },
      {
        id: mockArticleId2,
        title: 'Test Article 2',
        url: 'https://example.com/2',
        publishedAt: new Date(),
        sourceId: 'source-1',
        source: { id: 'source-1', name: 'Test Source' },
        tags: [],
      }
    ];

    prisma.article.findMany.mockResolvedValueOnce(mockArticles);
    prisma.article.count.mockResolvedValueOnce(2);

    // Mock favorites - only article 1 is favorited
    prisma.favorite.findMany.mockResolvedValueOnce([
      { id: 'fav-1', userId: mockUserId, articleId: mockArticleId1, createdAt: new Date() }
    ]);

    // Mock read status - only article 2 is read
    prisma.articleView.findMany.mockResolvedValueOnce([
      {
        id: 'view-1',
        userId: mockUserId,
        articleId: mockArticleId2,
        viewedAt: new Date(),
        isRead: true,
        readAt: new Date()
      }
    ]);

    const request = new NextRequest('http://localhost:3000/api/articles/list?includeUserData=true&limit=2');
    const { GET } = require('@/app/api/articles/list/route');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.items).toHaveLength(2);
    // includeUserData=true の場合、各アイテムに isFavorited / isRead が含まれる
    expect(typeof data.data.items[0].isFavorited).toBe('boolean');
    expect(typeof data.data.items[0].isRead).toBe('boolean');
    expect(typeof data.data.items[1].isFavorited).toBe('boolean');
    expect(typeof data.data.items[1].isRead).toBe('boolean');
  });

  it('should not include user data when includeUserData=false', async () => {
    const mockArticles = [
      {
        id: mockArticleId1,
        title: 'Test Article 1',
        url: 'https://example.com/1',
        publishedAt: new Date(),
        sourceId: 'source-1',
        source: { id: 'source-1', name: 'Test Source' },
        tags: [],
      }
    ];

    prisma.article.findMany.mockResolvedValueOnce(mockArticles);
    prisma.article.count.mockResolvedValueOnce(1);

    const request = new NextRequest('http://localhost:3000/api/articles/list?limit=1');
    const { GET } = require('@/app/api/articles/list/route');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.items).toHaveLength(1);

    // User data should not be included
    expect(data.data.items[0].isFavorited).toBeUndefined();
    expect(data.data.items[0].isRead).toBeUndefined();
  });

  it('should not include user data when user is not authenticated', async () => {
    // Mock auth to return null (not authenticated)
    const { auth } = require('@/lib/auth/auth');
    auth.mockResolvedValueOnce(null);

    const mockArticles = [
      {
        id: mockArticleId1,
        title: 'Test Article 1',
        url: 'https://example.com/1',
        publishedAt: new Date(),
        sourceId: 'source-1',
        source: { id: 'source-1', name: 'Test Source' },
        tags: [],
      }
    ];

    prisma.article.findMany.mockResolvedValueOnce(mockArticles);
    prisma.article.count.mockResolvedValueOnce(1);

    const request = new NextRequest('http://localhost:3000/api/articles/list?includeUserData=true&limit=1');
    const { GET } = require('@/app/api/articles/list/route');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.items).toHaveLength(1);

    // User data should not be included even if requested
    expect(data.data.items[0].isFavorited).toBeUndefined();
    expect(data.data.items[0].isRead).toBeUndefined();
  });
});
