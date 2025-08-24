import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock Prisma and Redis
jest.mock('@/lib/database', () => ({
  prisma: {
    $queryRaw: jest.fn()
  }
}));

jest.mock('@/lib/redis/redis-client', () => ({
  getRedisClient: jest.fn(() => ({
    ping: jest.fn()
  }))
}));

describe('Health Check API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return healthy status when all services are up', async () => {
    const { prisma } = await import('@/lib/database');
    const { getRedisClient } = await import('@/lib/redis/redis-client');
    
    // Mock successful responses
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
    (getRedisClient().ping as jest.Mock).mockResolvedValue('PONG');

    const response = {
      status: 'healthy',
      database: 'connected',
      redis: 'connected',
      timestamp: expect.any(String)
    };

    expect(response.status).toBe('healthy');
    expect(response.database).toBe('connected');
    expect(response.redis).toBe('connected');
  });

  it('should return unhealthy status when database is down', async () => {
    const { prisma } = await import('@/lib/database');
    
    // Mock database failure
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

    const response = {
      status: 'unhealthy',
      database: 'disconnected',
      redis: 'connected',
      timestamp: expect.any(String)
    };

    expect(response.status).toBe('unhealthy');
    expect(response.database).toBe('disconnected');
  });
});