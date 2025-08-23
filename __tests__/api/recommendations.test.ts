import { GET } from '@/app/api/recommendations/route';
import { auth } from '@/lib/auth/auth';
import { recommendationService } from '@/lib/recommendation/recommendation-service';
import { NextRequest } from 'next/server';

// モック
jest.mock('next/headers', () => ({
  headers: jest.fn(() => Promise.resolve(new Headers())),
}));

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
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    getJSON: jest.fn().mockResolvedValue(null),
    setJSON: jest.fn().mockResolvedValue('OK'),
  })),
}));

describe('GET /api/recommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const request = {
      nextUrl: new URL('http://localhost:3000/api/recommendations'),
      method: 'GET',
      headers: new Headers(),
    } as NextRequest;
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
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

    const request = {
      nextUrl: new URL('http://localhost:3000/api/recommendations?limit=20'),
      method: 'GET',
      headers: new Headers(),
    } as NextRequest;
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

    (auth as jest.Mock).mockResolvedValue(mockSession);
    const { getRedisService } = require('@/lib/redis/factory');
    const redisService = getRedisService();
    (redisService.get as jest.Mock).mockResolvedValue(null);
    (recommendationService.getRecommendations as jest.Mock).mockResolvedValue([]);

    const request = {
      nextUrl: new URL('http://localhost:3000/api/recommendations?limit=50'),
      method: 'GET',
      headers: new Headers(),
    } as NextRequest;
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

    (auth as jest.Mock).mockResolvedValue(mockSession);
    const { getRedisService } = require('@/lib/redis/factory');
    const redisService = getRedisService();
    (redisService.get as jest.Mock).mockResolvedValue(null);
    (recommendationService.getRecommendations as jest.Mock).mockRejectedValue(
      new Error('Database error')
    );

    const request = {
      nextUrl: new URL('http://localhost:3000/api/recommendations'),
      method: 'GET',
      headers: new Headers(),
    } as NextRequest;
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to get recommendations');
  });
});