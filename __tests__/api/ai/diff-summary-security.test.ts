import { describe, it, expect } from '@jest/globals';

// Mock rate limiter to prevent actual Redis calls
jest.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({
    limit: 30,
    remaining: 29,
    reset: new Date(Date.now() + 60000),
  }),
  createRateLimiterFromConfig: jest.fn(),
  RateLimitError: class RateLimitError extends Error {
    limit: number;
    reset: Date;
    constructor(message: string, limit: number, reset: Date) {
      super(message);
      this.limit = limit;
      this.reset = reset;
    }
  },
}));

// Mock auth
jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn().mockResolvedValue(null),
}));

// Mock prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    diffSummary: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

// Mock Redis cache
jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/ai/diff-summary/route';

describe('GET /api/ai/diff-summary - rate limiting', () => {
  it('should include rate limit headers in response', async () => {
    const request = new NextRequest('http://localhost:3000/api/ai/diff-summary');
    const response = await GET(request);

    expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
    expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
  });
});

describe('POST /api/ai/diff-summary - auth required', () => {
  it('should reject unauthenticated requests', async () => {
    const request = new NextRequest('http://localhost:3000/api/ai/diff-summary', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });
});
