import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock auth
jest.mock('@/lib/auth/get-session', () => ({
  getSession: jest.fn(),
}));

// Mock rate limiter
jest.mock('@/lib/rate-limiter', () => {
  const actual = jest.requireActual('@/lib/rate-limiter');
  return {
    ...actual,
    checkRateLimit: jest
      .fn()
      .mockResolvedValue({ limit: 20, remaining: 19, reset: new Date() }),
    createRateLimiterFromConfig: jest.fn().mockReturnValue({
      consume: jest.fn().mockResolvedValue({}),
    }),
  };
});

// Mock social post service
const mockService = {
  list: jest.fn(),
  getById: jest.fn(),
  getByIdWithAuditLogs: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  bulkAction: jest.fn(),
  generate: jest.fn(),
  generateScheduledPosts: jest.fn(),
  getStatusCounts: jest.fn(),
};

// Import actual error classes for instanceof checks
const {
  NotFoundError,
  DuplicateContentError,
  PromptInjectionError,
} = jest.requireActual('@/lib/social-post');

jest.mock('@/lib/social-post', () => {
  const actual = jest.requireActual('@/lib/social-post');
  return {
    ...actual,
    getSocialPostService: () => mockService,
    SocialPostFiltersSchema: {
      safeParse: jest.fn().mockReturnValue({
        success: true,
        data: { page: 1, limit: 20 },
      }),
    },
    SocialPostCreateSchema: {
      safeParse: jest.fn().mockReturnValue({
        success: true,
        data: {
          content: 'Test content',
          hashtags: ['#Test'],
          sourceUrls: ['https://example.com'],
          source: 'MANUAL',
        },
      }),
    },
    SocialPostUpdateSchema: {
      safeParse: jest.fn().mockReturnValue({
        success: true,
        data: { content: 'Updated content' },
      }),
    },
    SocialPostAutoGenerateSchema: {
      safeParse: jest.fn().mockReturnValue({
        success: true,
        data: { count: 3 },
      }),
    },
    SocialPostBulkSchema: {
      safeParse: jest.fn().mockReturnValue({
        success: true,
        data: { action: 'delete', ids: ['post-1'] },
      }),
    },
  };
});

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
};
jest.mock('@/lib/logger', () => mockLogger);

// Import handlers after mocks
const { GET, POST } = require('@/app/api/admin/social-posts/route');
const { GET: GET_BY_ID, PATCH, DELETE } = require('@/app/api/admin/social-posts/[id]/route');
const { POST: GENERATE } = require('@/app/api/admin/social-posts/generate/route');
const { POST: BULK } = require('@/app/api/admin/social-posts/bulk/route');
const { GET: GET_STATS } = require('@/app/api/admin/social-posts/stats/route');

describe('Social Posts API', () => {
  const adminSession = {
    user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    session: { id: 's1', userId: 'admin-1', token: 't1', expiresAt: new Date() },
  };

  const userSession = {
    user: { id: 'user-1', email: 'user@example.com', role: 'user' },
    session: { id: 's2', userId: 'user-1', token: 't2', expiresAt: new Date() },
  };

  const mockPost = {
    id: 'post-1',
    content: 'Test post',
    hashtags: ['#Test'],
    sourceUrls: ['https://example.com'],
    source: 'MANUAL',
    status: 'DRAFT',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/social-posts', () => {
    it('should return 401 when not authenticated', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Unauthorized');
    });

    it('should return 403 when user is not admin', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(userSession);

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });

    it('should return posts list for admin', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.list.mockResolvedValue({
        items: [mockPost],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.items).toHaveLength(1);
      expect(data.total).toBe(1);
    });
  });

  describe('POST /api/admin/social-posts', () => {
    it('should create a new post for admin', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.create.mockResolvedValue(mockPost);

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Test content',
          hashtags: ['#Test'],
          sourceUrls: ['https://example.com'],
          source: 'MANUAL',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.id).toBe('post-1');
    });

    it('should return 409 for duplicate content', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.create.mockRejectedValue(new DuplicateContentError());

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Test content',
          hashtags: ['#Test'],
          sourceUrls: ['https://example.com'],
          source: 'MANUAL',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain('similar content');
    });
  });

  describe('GET /api/admin/social-posts/[id]', () => {
    it('should return post details for admin', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.getById.mockResolvedValue(mockPost);

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/post-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'post-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe('post-1');
    });

    it('should return 404 for non-existent post', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.getById.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/non-existent');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'non-existent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('PATCH /api/admin/social-posts/[id]', () => {
    it('should update post for admin', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.update.mockResolvedValue({ ...mockPost, content: 'Updated content' });

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/post-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });

      const response = await PATCH(request, { params: Promise.resolve({ id: 'post-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.content).toBe('Updated content');
    });

    it('should return 404 when updating non-existent post', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.update.mockRejectedValue(new NotFoundError('SocialPost', 'non-existent'));

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/non-existent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });

      const response = await PATCH(request, { params: Promise.resolve({ id: 'non-existent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('DELETE /api/admin/social-posts/[id]', () => {
    it('should delete post for admin', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.delete.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/post-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'post-1' }) });

      expect(response.status).toBe(204);
    });

    it('should return 404 when deleting non-existent post', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.delete.mockRejectedValue(new NotFoundError('SocialPost', 'non-existent'));

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/non-existent', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'non-existent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('POST /api/admin/social-posts/generate', () => {
    it('should auto-generate posts for admin', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.generateScheduledPosts.mockResolvedValue([mockPost]);

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 3 }),
      });

      const response = await GENERATE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.count).toBe(1);
      expect(mockService.generateScheduledPosts).toHaveBeenCalledWith(3);
    });

    it('should return 404 when no articles available', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.generateScheduledPosts.mockRejectedValue(new NotFoundError('Article', 'none'));

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 3 }),
      });

      const response = await GENERATE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('POST /api/admin/social-posts/bulk', () => {
    it('should execute bulk delete for admin', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.bulkAction.mockResolvedValue({ success: 2, failed: 0 });

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          ids: ['post-1', 'post-2'],
        }),
      });

      const response = await BULK(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.processed).toBe(2);
      expect(data.failed).toBe(0);
    });

    it('should return 400 for changeStatus without status', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);

      // Override mock for this test
      const { SocialPostBulkSchema } = require('@/lib/social-post');
      (SocialPostBulkSchema.safeParse as jest.Mock).mockReturnValueOnce({
        success: true,
        data: { action: 'changeStatus', ids: ['post-1'] },
      });

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'changeStatus',
          ids: ['post-1'],
        }),
      });

      const response = await BULK(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Status is required');
    });
  });

  describe('GET /api/admin/social-posts/stats', () => {
    it('should return status counts for admin', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(adminSession);
      mockService.getStatusCounts.mockResolvedValue({
        DRAFT: 5,
        REVIEWED: 3,
        POSTED: 10,
        total: 18,
      });

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/stats');
      const response = await GET_STATS(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.DRAFT).toBe(5);
      expect(data.total).toBe(18);
    });

    it('should return 403 when user is not admin', async () => {
      const { getSession } = require('@/lib/auth/get-session');
      (getSession as jest.Mock).mockResolvedValue(userSession);

      const request = new NextRequest('http://localhost:3000/api/admin/social-posts/stats');
      const response = await GET_STATS(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });
  });
});
