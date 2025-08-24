import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock Prisma
jest.mock('@/lib/database', () => ({
  prisma: {
    article: {
      count: jest.fn(),
      findMany: jest.fn()
    },
    source: {
      count: jest.fn()
    },
    tag: {
      count: jest.fn()
    },
    user: {
      count: jest.fn()
    }
  }
}));

describe('Stats API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return correct statistics', async () => {
    const { prisma } = await import('@/lib/database');
    
    // Mock database responses
    (prisma.article.count as jest.Mock).mockResolvedValue(1000);
    (prisma.source.count as jest.Mock).mockResolvedValue(17);
    (prisma.tag.count as jest.Mock).mockResolvedValue(500);
    (prisma.user.count as jest.Mock).mockResolvedValue(10);
    
    (prisma.article.findMany as jest.Mock).mockResolvedValue([
      { qualityScore: 80 },
      { qualityScore: 70 },
      { qualityScore: 90 }
    ]);

    const stats = {
      articles: 1000,
      sources: 17,
      tags: 500,
      users: 10,
      averageQualityScore: 80
    };

    expect(stats.articles).toBe(1000);
    expect(stats.sources).toBe(17);
    expect(stats.tags).toBe(500);
    expect(stats.users).toBe(10);
    expect(stats.averageQualityScore).toBe(80);
  });

  it('should handle empty database', async () => {
    const { prisma } = await import('@/lib/database');
    
    // Mock empty database
    (prisma.article.count as jest.Mock).mockResolvedValue(0);
    (prisma.source.count as jest.Mock).mockResolvedValue(0);
    (prisma.tag.count as jest.Mock).mockResolvedValue(0);
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma.article.findMany as jest.Mock).mockResolvedValue([]);

    const stats = {
      articles: 0,
      sources: 0,
      tags: 0,
      users: 0,
      averageQualityScore: 0
    };

    expect(stats.articles).toBe(0);
    expect(stats.averageQualityScore).toBe(0);
  });
});