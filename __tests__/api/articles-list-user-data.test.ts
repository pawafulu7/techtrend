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

const { prisma, resetPrismaMock } = require('@/lib/database');

describe('/api/articles/list with user data', () => {
  const mockUserId = 'test-user-id';
  const mockArticleId1 = 'article-1';
  const mockArticleId2 = 'article-2';

  beforeEach(() => {
    jest.clearAllMocks();
    resetPrismaMock();
  });

  it('should include user data when includeUserData=true and user is authenticated', async () => {
    const { GET } = require('@/app/api/articles/list/route');
    const { auth } = require('@/lib/auth/auth');
    auth.mockResolvedValueOnce({
      user: { id: mockUserId }
    });

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

    prisma.article.findMany.mockResolvedValueOnce(mockArticles as any);
    prisma.article.count.mockResolvedValueOnce(2 as any);

    prisma.favorite.findMany.mockResolvedValueOnce([
      { id: 'fav-1', userId: mockUserId, articleId: mockArticleId1, createdAt: new Date() }
    ] as any);

    prisma.articleView.findMany.mockResolvedValueOnce([
      {
        id: 'view-1',
        userId: mockUserId,
        articleId: mockArticleId2,
        isRead: true,
        createdAt: new Date()
      }
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/articles/list?includeUserData=true');

    const response = await GET(request);
    const json = await response.json();

    expect(json.success).toBe(true);
    const payload = json.data;

    expect(payload.total).toBe(2);
    expect(payload.items).toHaveLength(2);

    const [article1, article2] = payload.items;
    expect(article1.isFavorited).toBe(true);
    expect(article1.isRead).toBe(false);
    expect(article2.isFavorited).toBe(false);
    expect(article2.isRead).toBe(true);

    expect(prisma.favorite.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: mockUserId })
    }));

    expect(prisma.articleView.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: mockUserId })
    }));
  });

  it('should return articles without user data when includeUserData=false', async () => {
    const { GET } = require('@/app/api/articles/list/route');
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

    prisma.article.findMany.mockResolvedValueOnce(mockArticles as any);
    prisma.article.count.mockResolvedValueOnce(1 as any);

    const request = new NextRequest('http://localhost:3000/api/articles/list');

    const response = await GET(request);
    const json = await response.json();

    expect(json.success).toBe(true);
    const payload = json.data;

    expect(payload.total).toBe(1);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].isFavorited).toBeFalsy();
    expect(payload.items[0].isRead).toBeFalsy();

    expect(prisma.favorite.findMany).not.toHaveBeenCalled();
    expect(prisma.articleView.findMany).not.toHaveBeenCalled();
  });

  it('should handle empty result set gracefully', async () => {
    const { GET } = require('@/app/api/articles/list/route');
    const { auth } = require('@/lib/auth/auth');
    auth.mockResolvedValueOnce({
      user: { id: mockUserId }
    });

    prisma.article.findMany.mockResolvedValueOnce([] as any);
    prisma.article.count.mockResolvedValueOnce(0 as any);

    const request = new NextRequest('http://localhost:3000/api/articles/list?includeUserData=true');

    const response = await GET(request);
    const json = await response.json();

    expect(json.success).toBe(true);
    const payload = json.data;

    expect(payload.total).toBe(0);
    expect(payload.items).toHaveLength(0);
    expect(prisma.favorite.findMany).not.toHaveBeenCalled();
    expect(prisma.articleView.findMany).not.toHaveBeenCalled();
  });
});
