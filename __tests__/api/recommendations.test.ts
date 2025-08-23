import { GET } from '@/app/api/recommendations/route';
import { auth } from '@/lib/auth/auth';
import { recommendationService } from '@/lib/recommendation/recommendation-service';
import { NextRequest } from 'next/server';

// モック

jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/auth/config', () => ({
  authOptions: {},
}));

jest.mock('@/lib/recommendation/recommendation-service', () => ({
  recommendationService: {
    getRecommendations: jest.fn(),
  },
}));

jest.mock('@/lib/redis/factory', () => ({
  getRedisService: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

describe('GET /api/recommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/recommendations');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('should return cached recommendations if available', async () => {
    const mockSession = {
      user: {
        id: 'user123',
        email: 'test@example.com',
      },
    };

    const cachedRecommendations = [
      {
        id: 'article1',
        title: 'Cached Article',
        recommendationScore: 0.9,
      },
    ];

    (auth as jest.Mock).mockResolvedValue(mockSession);
    const { getRedisService } = require('@/lib/redis/factory');
    const redisService = getRedisService();
    (redisService.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedRecommendations));

    const request = new NextRequest('http://localhost:3000/api/recommendations?limit=10');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(cachedRecommendations);
    expect(recommendationService.getRecommendations).not.toHaveBeenCalled();
  });

  it('should fetch fresh recommendations if cache is empty', async () => {
    const mockSession = {
      user: {
        id: 'user123',
        email: 'test@example.com',
      },
    };

    const freshRecommendations = [
      {
        id: 'article1',
        title: 'Fresh Article',
        url: 'https://example.com/1',
        summary: 'Summary',
        thumbnail: null,
        publishedAt: new Date(),
        sourceName: 'Source1',
        tags: ['React'],
        recommendationScore: 0.85,
        recommendationReasons: ['高品質な記事'],
      },
    ];

    (auth as jest.Mock).mockResolvedValue(mockSession);
    const { getRedisService } = require('@/lib/redis/factory');
    const redisService = getRedisService();
    (redisService.get as jest.Mock).mockResolvedValue(null);
    (recommendationService.getRecommendations as jest.Mock).mockResolvedValue(freshRecommendations);

    const request = new NextRequest('http://localhost:3000/api/recommendations?limit=10');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(freshRecommendations);
    expect(recommendationService.getRecommendations).toHaveBeenCalledWith('user123', 10);
    expect(redisService.set).toHaveBeenCalledWith(
      'recommendations:user123:10',
      JSON.stringify(freshRecommendations),
      300
    );
  });

  it('should respect limit parameter', async () => {
    const mockSession = {
      user: {
        id: 'user123',
        email: 'test@example.com',
      },
    };

    (auth as jest.Mock).mockResolvedValue(mockSession);
    const { getRedisService } = require('@/lib/redis/factory');
    const redisService = getRedisService();
    (redisService.get as jest.Mock).mockResolvedValue(null);
    (recommendationService.getRecommendations as jest.Mock).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/recommendations?limit=20');
    await GET(request);

    expect(recommendationService.getRecommendations).toHaveBeenCalledWith('user123', 20);
  });

  it('should enforce maximum limit of 30', async () => {
    const mockSession = {
      user: {
        id: 'user123',
        email: 'test@example.com',
      },
    };

    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (redisService.get as jest.Mock).mockResolvedValue(null);
    (recommendationService.getRecommendations as jest.Mock).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/recommendations?limit=50');
    await GET(request);

    expect(recommendationService.getRecommendations).toHaveBeenCalledWith('user123', 30);
  });

  it('should handle service errors gracefully', async () => {
    const mockSession = {
      user: {
        id: 'user123',
        email: 'test@example.com',
      },
    };

    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (redisService.get as jest.Mock).mockResolvedValue(null);
    (recommendationService.getRecommendations as jest.Mock).mockRejectedValue(
      new Error('Database error')
    );

    const request = new NextRequest('http://localhost:3000/api/recommendations');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to get recommendations');
  });
});