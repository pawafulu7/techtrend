import { NextRequest } from 'next/server';
import { GET } from '@/app/api/articles/list/route';

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

// Mock DI
jest.mock('../../lib/di', () => ({
  getPrismaClient: jest.fn(() => ({
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
  })),
}));

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
    const { getPrismaClient } = require('../../lib/di');
    const prisma = getPrismaClient();
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
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.items).toHaveLength(2);

    // Check first article - favorited but not read
    expect(data.data.items[0].id).toBe(mockArticleId1);
    expect(data.data.items[0].isFavorited).toBe(true);
    expect(data.data.items[0].isRead).toBe(false);

    // Check second article - not favorited but read
    expect(data.data.items[1].id).toBe(mockArticleId2);
    expect(data.data.items[1].isFavorited).toBe(false);
    expect(data.data.items[1].isRead).toBe(true);
  });

  it('should not include user data when includeUserData=false', async () => {
    const { getPrismaClient } = require('../../lib/di');
    const prisma = getPrismaClient();
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

    const { getPrismaClient } = require('../../lib/di');
    const prisma = getPrismaClient();
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
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.items).toHaveLength(1);

    // User data should not be included even if requested
    expect(data.data.items[0].isFavorited).toBeUndefined();
    expect(data.data.items[0].isRead).toBeUndefined();
  });
});