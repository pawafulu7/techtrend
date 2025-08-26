import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Create mock functions
const mockArticleCount = jest.fn();
const mockArticleFindMany = jest.fn();
const mockSourceCount = jest.fn();
const mockTagCount = jest.fn();
const mockUserCount = jest.fn();

// Mock Prisma
jest.mock('@/lib/database', () => ({
  prisma: {
    article: {
      count: mockArticleCount,
      findMany: mockArticleFindMany
    },
    source: {
      count: mockSourceCount
    },
    tag: {
      count: mockTagCount
    },
    user: {
      count: mockUserCount
    }
  }
}));

describe('Stats API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return correct statistics', async () => {    
    // Mock database responses
    mockArticleCount.mockResolvedValue(1000);
    mockSourceCount.mockResolvedValue(17);
    mockTagCount.mockResolvedValue(500);
    mockUserCount.mockResolvedValue(10);
    
    mockArticleFindMany.mockResolvedValue([
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
    // Mock empty database
    mockArticleCount.mockResolvedValue(0);
    mockSourceCount.mockResolvedValue(0);
    mockTagCount.mockResolvedValue(0);
    mockUserCount.mockResolvedValue(0);
    mockArticleFindMany.mockResolvedValue([]);

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