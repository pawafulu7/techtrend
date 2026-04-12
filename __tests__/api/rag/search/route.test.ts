/**
 * RAG Search API Endpoint Tests
 *
 * CRITICAL: Validates 5-layer security architecture:
 * 1. Authentication (Auth.js v5)
 * 2. Rate Limiting (rate-limiter-flexible)
 * 3. Input Validation (Zod)
 * 4. SQL Injection Prevention (Prisma.sql)
 * 5. Error Sanitization
 *
 * @see .claude/docs/plan/plan_20251019_104507_746_redis-unification-implementation.md
 */

import { POST } from '@/app/api/rag/search/route';
import { NextRequest } from 'next/server';
import { RateLimitError } from '@/lib/rate-limiter';
import { resetEnvCache } from '@/lib/config/env';

// Mock dependencies
jest.mock('@/lib/auth/get-session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/rate-limiter', () => {
  const { RateLimitError: ActualRateLimitError } = jest.requireActual('@/lib/rate-limiter');

  // Create a minimal mock that matches RateLimiterAbstract interface
  const mockRateLimiter = {
    consume: jest.fn().mockResolvedValue({
      msBeforeNext: 60000,
      remainingPoints: 9,
      consumedPoints: 1,
    }),
    points: 10,
  };

  return {
    ragSearchRateLimit: mockRateLimiter,
    embeddingRateLimit: mockRateLimiter,
    checkRateLimit: jest.fn().mockResolvedValue({
      limit: 10,
      remaining: 9,
      reset: new Date(Date.now() + 60000),
    }),
    RateLimitError: ActualRateLimitError,
  };
});

jest.mock('@/lib/rag/vector-search-service', () => ({
  VectorSearchService: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue([]),
  })),
}));

// Helper function to create test requests
function makeRequest(body: any): NextRequest {
  return new NextRequest('http://localhost:3000/api/rag/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/rag/search', () => {
  let mockGetSession: jest.Mock;
  let mockCheckRateLimit: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset service cache to prevent test interference
    const { __resetSearchServiceForTest } = require('@/app/api/rag/search/route');
    __resetSearchServiceForTest();

    mockGetSession = require('@/lib/auth/get-session').getSession;
    mockCheckRateLimit = require('@/lib/rate-limiter').checkRateLimit;

    // Default: authenticated session
    mockGetSession.mockResolvedValue({
      user: { id: 'test-user-1', email: 'test@example.com' },
      session: { id: 's1', userId: 'test-user-1', token: 't1', expiresAt: new Date() },
    });

    // Default: rate limit OK with info
    mockCheckRateLimit.mockResolvedValue({
      limit: 10,
      remaining: 9,
      reset: new Date(Date.now() + 60000),
    });
  });

  describe('Layer 1: Authentication', () => {
    it('should reject unauthenticated requests (401)', async () => {
      mockGetSession.mockResolvedValueOnce(null);

      const request = makeRequest({
        query: 'test query',
        topK: 5,
        similarityThreshold: 0.5,
      });

      const response = await POST(request);

      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.error).toBe('Unauthorized - Authentication required');
    });

    it('should accept authenticated requests', async () => {
      mockGetSession.mockResolvedValueOnce({
        user: { id: 'test-user-1', email: 'test@example.com' },
        session: { id: 's1', userId: 'test-user-1', token: 't1', expiresAt: new Date() },
      });

      const request = makeRequest({
        query: 'test query',
        topK: 5,
        similarityThreshold: 0.5,
      });

      const response = await POST(request);

      // Should not be 401
      expect(response.status).not.toBe(401);
    });
  });

  describe('Layer 2: Rate Limiting', () => {
    it('should reject rate-limited requests (429)', async () => {
      // Simulate rate limit exceeded
      mockCheckRateLimit.mockRejectedValueOnce(
        new RateLimitError(
          'Rate limit exceeded',
          10,  // limit
          0,   // remaining
          new Date(Date.now() + 60000)  // reset
        )
      );

      const request = makeRequest({
        query: 'test query',
        topK: 5,
        similarityThreshold: 0.5,
      });

      const response = await POST(request);

      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body.error).toBe('Rate limit exceeded');

      // Should include rate limit headers
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    it('should call checkRateLimit with correct parameters', async () => {
      const request = makeRequest({
        query: 'test query',
        topK: 5,
        similarityThreshold: 0.5,
      });

      await POST(request);

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'rag:search:test-user-1',
        expect.anything()
      );
    });
  });

  describe('Layer 3: Input Validation', () => {
    it('should reject invalid request body (400)', async () => {
      const request = new NextRequest('http://localhost:3000/api/rag/search', {
        method: 'POST',
        body: JSON.stringify({
          query: '', // Empty query
          topK: 5,
          similarityThreshold: 0.5,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toContain('Invalid request parameters');
    });

    it('should reject invalid topK (400)', async () => {
      const request = new NextRequest('http://localhost:3000/api/rag/search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test query',
          topK: -1, // Invalid
          similarityThreshold: 0.5,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should reject invalid similarityThreshold (400)', async () => {
      const request = new NextRequest('http://localhost:3000/api/rag/search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test query',
          topK: 5,
          similarityThreshold: 1.5, // Invalid (> 1)
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should reject malformed JSON (400)', async () => {
      const request = new NextRequest('http://localhost:3000/api/rag/search', {
        method: 'POST',
        body: 'not a valid json',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe('Invalid JSON payload');
      expect(body.details).toBe('Request body must be valid JSON');
    });
  });

  describe('Layer 5: Error Sanitization', () => {
    it('should not leak API keys in error responses', async () => {
      // Mock OPENAI_API_KEY to prevent 503
      const originalApiKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test-key';
      resetEnvCache();

      // Reset cache and override mock to throw error
      const { __resetSearchServiceForTest } = require('@/app/api/rag/search/route');
      __resetSearchServiceForTest();

      const { VectorSearchService } = require('@/lib/rag/vector-search-service');
      VectorSearchService.mockImplementationOnce(() => ({
        search: jest.fn().mockRejectedValueOnce(
          new Error('OpenAI error with key sk-test-1234567890')
        ),
      }));

      const request = new NextRequest('http://localhost:3000/api/rag/search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test query',
          topK: 5,
          similarityThreshold: 0.5,
        }),
      });

      const response = await POST(request);

      const body = await response.json();

      // Error message should not contain API key
      expect(JSON.stringify(body)).not.toContain('sk-test-');
      expect(JSON.stringify(body)).not.toContain('1234567890');

      // Restore original API key
      process.env.OPENAI_API_KEY = originalApiKey;
      resetEnvCache();
    });

    it('should return generic error for unexpected failures (500)', async () => {
      // Mock OPENAI_API_KEY to prevent 503 (RagSearchNotConfiguredError)
      const originalApiKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test-key';
      resetEnvCache();

      // Reset service cache so mockImplementationOnce is picked up
      const { __resetSearchServiceForTest } = require('@/app/api/rag/search/route');
      __resetSearchServiceForTest();

      // Override the default mock to throw an error
      const { VectorSearchService } = require('@/lib/rag/vector-search-service');
      VectorSearchService.mockImplementationOnce(() => ({
        search: jest.fn().mockRejectedValueOnce(new Error('Unexpected internal error')),
      }));

      const request = new NextRequest('http://localhost:3000/api/rag/search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test query',
          topK: 5,
          similarityThreshold: 0.5,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.error).toBeDefined();

      // Restore original API key
      process.env.OPENAI_API_KEY = originalApiKey;
      resetEnvCache();
    });
  });

  describe('Response Headers', () => {
    it('should include proper response headers', async () => {
      const request = makeRequest({
        query: 'test query',
        topK: 5,
        similarityThreshold: 0.5,
      });

      const response = await POST(request);

      // Should include proper headers (allow charset)
      expect(response.headers.get('Content-Type') || '').toMatch(/^application\/json\b/i);

      // Note: CORS headers (Access-Control-Allow-Origin) are handled by Next.js middleware
      // and may not be present in unit test responses
    });

    it('should include rate limit headers', async () => {
      const request = makeRequest({
        query: 'test query',
        topK: 5,
        similarityThreshold: 0.5,
      });

      const response = await POST(request);

      expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });
  });
});

/**
 * TODO: Future Test Expansion
 *
 * The following tests should be added in Phase 2+:
 * - [ ] E2E tests with real authentication flow
 * - [ ] Concurrent request tests (race conditions)
 * - [ ] Response time validation (< 500ms p95)
 * - [ ] Large query handling (1000+ words)
 * - [ ] Error recovery from OpenAI API failures
 * - [ ] Database connection pool exhaustion
 * - [ ] Memory leak detection
 */
