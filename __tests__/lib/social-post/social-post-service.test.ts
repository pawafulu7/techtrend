import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PrismaClient } from '@/lib/prisma-exports';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Create mock before importing the service
const prismaMock = mockDeep<PrismaClient>();

// Mock prisma
jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocks
import {
  SocialPostService,
  resetSocialPostService,
} from '@/lib/social-post/social-post-service';

describe('SocialPostService', () => {
  let service: SocialPostService;

  const mockPost = {
    id: 'post-1',
    content: 'Test post content',
    hashtags: ['#TypeScript', '#Testing'],
    sourceUrls: ['https://example.com/article'],
    source: 'ARTICLE' as const,
    sourceIds: ['article-1'],
    status: 'DRAFT' as const,
    contentHash: 'abc123',
    originalContent: null,
    modelVersion: 'gemini-2.5-flash-lite',
    promptVersion: '1.0.0',
    contextSummary: 'Test context',
    scheduledAt: null,
    postedAt: null,
    postId: null,
    createdBy: 'user-1',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    mockReset(prismaMock);
    resetSocialPostService();
    service = new SocialPostService(prismaMock as unknown as PrismaClient);
  });

  describe('list', () => {
    it('should return paginated list of posts', async () => {
      const mockPosts = [mockPost];
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue(
        mockPosts
      );
      (prismaMock.socialPost.count as jest.Mock).mockResolvedValue(1);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.items).toEqual(mockPosts);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should apply status filter', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.socialPost.count as jest.Mock).mockResolvedValue(0);

      await service.list({ status: 'DRAFT', page: 1, limit: 20 });

      expect(prismaMock.socialPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'DRAFT' }),
        })
      );
    });

    it('should apply date range filter correctly', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.socialPost.count as jest.Mock).mockResolvedValue(0);

      await service.list({
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
        page: 1,
        limit: 20,
      });

      expect(prismaMock.socialPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        })
      );
    });

    it('should ignore "all" status filter', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.socialPost.count as jest.Mock).mockResolvedValue(0);

      await service.list({ status: 'all' as any, page: 1, limit: 20 });

      expect(prismaMock.socialPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ status: 'all' }),
        })
      );
    });
  });

  describe('getById', () => {
    it('should return post by id', async () => {
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(
        mockPost
      );

      const result = await service.getById('post-1');

      expect(result).toEqual(mockPost);
      expect(prismaMock.socialPost.findUnique).toHaveBeenCalledWith({
        where: { id: 'post-1' },
      });
    });

    it('should return null for non-existent post', async () => {
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getByIdWithAuditLogs', () => {
    it('should return post with audit logs', async () => {
      const postWithLogs = {
        ...mockPost,
        auditLogs: [
          {
            id: 'log-1',
            action: 'CREATE',
            userId: 'user-1',
            createdAt: new Date(),
          },
        ],
      };
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(
        postWithLogs
      );

      const result = await service.getByIdWithAuditLogs('post-1');

      expect(result).toEqual(postWithLogs);
      expect(prismaMock.socialPost.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            auditLogs: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('create', () => {
    it('should create a new post', async () => {
      (prismaMock.socialPost.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaMock.socialPost.create as jest.Mock).mockResolvedValue(mockPost);
      (prismaMock.socialPostAuditLog.create as jest.Mock).mockResolvedValue({});

      const input = {
        content: 'Test content',
        hashtags: ['#Test'],
        sourceUrls: ['https://example.com'],
        source: 'ARTICLE' as const,
        sourceIds: ['article-1'],
      };

      const result = await service.create(input, 'user-1');

      expect(result).toEqual(mockPost);
      expect(prismaMock.socialPost.create).toHaveBeenCalled();
      expect(prismaMock.socialPostAuditLog.create).toHaveBeenCalled();
    });

    it('should throw error for duplicate content', async () => {
      (prismaMock.socialPost.findFirst as jest.Mock).mockResolvedValue(
        mockPost
      );

      const input = {
        content: 'Test content',
        hashtags: ['#Test'],
        sourceUrls: ['https://example.com'],
        source: 'ARTICLE' as const,
      };

      await expect(service.create(input, 'user-1')).rejects.toThrow(
        'Duplicate content detected'
      );
    });
  });

  describe('update', () => {
    it('should update an existing post', async () => {
      const updatedPost = { ...mockPost, content: 'Updated content' };
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(
        mockPost
      );
      (prismaMock.socialPost.update as jest.Mock).mockResolvedValue(
        updatedPost
      );
      (prismaMock.socialPostAuditLog.create as jest.Mock).mockResolvedValue({});

      const result = await service.update(
        'post-1',
        { content: 'Updated content' },
        'user-1'
      );

      expect(result.content).toBe('Updated content');
      expect(prismaMock.socialPost.update).toHaveBeenCalled();
    });

    it('should throw error for non-existent post', async () => {
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('non-existent', { content: 'Updated' }, 'user-1')
      ).rejects.toThrow('SocialPost not found');
    });

    it('should preserve original content on first edit', async () => {
      const originalPost = { ...mockPost, originalContent: null };
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(
        originalPost
      );
      (prismaMock.socialPost.update as jest.Mock).mockResolvedValue({
        ...originalPost,
        content: 'New content',
        originalContent: mockPost.content,
      });
      (prismaMock.socialPostAuditLog.create as jest.Mock).mockResolvedValue({});

      await service.update('post-1', { content: 'New content' }, 'user-1');

      expect(prismaMock.socialPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            originalContent: mockPost.content,
          }),
        })
      );
    });

    it('should set reviewedBy and reviewedAt when status is REVIEWED', async () => {
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(
        mockPost
      );
      (prismaMock.socialPost.update as jest.Mock).mockResolvedValue({
        ...mockPost,
        status: 'REVIEWED',
      });
      (prismaMock.socialPostAuditLog.create as jest.Mock).mockResolvedValue({});

      await service.update('post-1', { status: 'REVIEWED' }, 'reviewer-1');

      expect(prismaMock.socialPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewedBy: 'reviewer-1',
            reviewedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete an existing post', async () => {
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(
        mockPost
      );
      (prismaMock.socialPostAuditLog.create as jest.Mock).mockResolvedValue({});
      (prismaMock.socialPost.delete as jest.Mock).mockResolvedValue(mockPost);

      await service.delete('post-1', 'user-1');

      expect(prismaMock.socialPostAuditLog.create).toHaveBeenCalled();
      expect(prismaMock.socialPost.delete).toHaveBeenCalledWith({
        where: { id: 'post-1' },
      });
    });

    it('should throw error for non-existent post', async () => {
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.delete('non-existent', 'user-1')).rejects.toThrow(
        'SocialPost not found'
      );
    });
  });

  describe('bulkAction', () => {
    it('should delete multiple posts', async () => {
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(
        mockPost
      );
      (prismaMock.socialPostAuditLog.create as jest.Mock).mockResolvedValue({});
      (prismaMock.socialPost.delete as jest.Mock).mockResolvedValue(mockPost);

      const result = await service.bulkAction(
        { action: 'delete', ids: ['post-1', 'post-2'] },
        'user-1'
      );

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should change status for multiple posts', async () => {
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(
        mockPost
      );
      (prismaMock.socialPost.update as jest.Mock).mockResolvedValue({
        ...mockPost,
        status: 'REVIEWED',
      });
      (prismaMock.socialPostAuditLog.create as jest.Mock).mockResolvedValue({});

      const result = await service.bulkAction(
        { action: 'changeStatus', ids: ['post-1'], status: 'REVIEWED' },
        'user-1'
      );

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should count failures when posts not found', async () => {
      (prismaMock.socialPost.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.bulkAction(
        { action: 'delete', ids: ['non-existent'] },
        'user-1'
      );

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe('getStatusCounts', () => {
    it('should return counts grouped by status', async () => {
      const mockCounts = [
        { status: 'DRAFT', _count: { status: 5 } },
        { status: 'REVIEWED', _count: { status: 3 } },
        { status: 'POSTED', _count: { status: 10 } },
      ];
      (prismaMock.socialPost.groupBy as jest.Mock).mockResolvedValue(
        mockCounts
      );

      const result = await service.getStatusCounts();

      expect(result.DRAFT).toBe(5);
      expect(result.REVIEWED).toBe(3);
      expect(result.POSTED).toBe(10);
      expect(result.total).toBe(18);
    });

    it('should return zero total when no posts exist', async () => {
      (prismaMock.socialPost.groupBy as jest.Mock).mockResolvedValue([]);

      const result = await service.getStatusCounts();

      expect(result.total).toBe(0);
    });
  });
});
