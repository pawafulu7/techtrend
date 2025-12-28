/**
 * CommentService Unit Tests
 *
 * Tests for comment CRUD functionality (Task 2.1, 2.2, 2.3)
 * - createComment: Sanitize → Validate → Check Article Exists → Save → Invalidate Cache
 * - getCommentsByArticle: Cache → Pagination, userId filter, deletedAt exclusion → Set Cache
 * - updateComment: Owner check, validation → Invalidate Cache
 * - deleteComment: Soft delete, owner check → Invalidate Cache
 */

// Mock commentsCache - must be before import
jest.mock('@/lib/cache/comments-cache', () => ({
  commentsCache: {
    getComments: jest.fn(),
    setComments: jest.fn(),
    invalidate: jest.fn(),
  },
}));

import { CommentService } from '@/lib/comments/comment-service';
import { commentsCache } from '@/lib/cache/comments-cache';
import type { Article, Comment } from '@prisma/client';

// Import prismaMock from test utilities (auto-mocked via jest.config.node.js)
const { prismaMock, resetPrismaMock } = require('../../../test/utils/prisma-mock');

// Get mocked cache for assertions
const mockCommentsCache = commentsCache as jest.Mocked<typeof commentsCache>;

describe('CommentService', () => {
  let service: CommentService;

  // Test fixtures
  const mockArticle: Article = {
    id: 'article-123',
    title: 'Test Article',
    translatedTitle: null,
    url: 'https://example.com/article',
    summary: 'Test summary',
    thumbnail: null,
    content: 'Test content',
    publishedAt: new Date('2024-01-01'),
    sourceId: 'source-1',
    bookmarks: 0,
    qualityScore: 0.8,
    userVotes: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    difficulty: null,
    detailedSummary: null,
    articleType: null,
    summaryVersion: 8,
    category: null,
    contentUpdatedAt: null,
    qualityScoreComputedAt: null,
    summaryComputedAt: null,
    skipReason: null,
    summaryError: null,
  };

  const mockComment: Comment = {
    id: 'comment-123',
    articleId: 'article-123',
    userId: 'user-123',
    content: 'Test comment',
    visibility: 'PRIVATE',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  };

  beforeEach(() => {
    resetPrismaMock();
    // Reset cache mock
    mockCommentsCache.getComments.mockReset();
    mockCommentsCache.setComments.mockReset();
    mockCommentsCache.invalidate.mockReset();
    // Default: cache miss
    mockCommentsCache.getComments.mockResolvedValue(null);
    mockCommentsCache.setComments.mockResolvedValue(undefined);
    mockCommentsCache.invalidate.mockResolvedValue(undefined);
    service = new CommentService();
  });

  describe('createComment', () => {
    describe('正常系', () => {
      it('should create a comment successfully', async () => {
        prismaMock.article.findUnique.mockResolvedValue(mockArticle);
        prismaMock.comment.create.mockResolvedValue(mockComment);

        const result = await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: 'Test comment',
          visibility: 'PRIVATE',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe('comment-123');
          expect(result.data.content).toBe('Test comment');
        }
      });

      it('should sanitize HTML content before saving', async () => {
        prismaMock.article.findUnique.mockResolvedValue(mockArticle);
        prismaMock.comment.create.mockResolvedValue({
          ...mockComment,
          content: 'Clean content',
        });

        const result = await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: '<script>alert("xss")</script>Clean content',
          visibility: 'PRIVATE',
        });

        expect(result.success).toBe(true);
        // Verify sanitized content was passed to create
        expect(prismaMock.comment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              content: 'Clean content',
            }),
          })
        );
      });

      it('should accept exactly 1000 characters (boundary)', async () => {
        const content1000 = 'a'.repeat(1000);
        prismaMock.article.findUnique.mockResolvedValue(mockArticle);
        prismaMock.comment.create.mockResolvedValue({
          ...mockComment,
          content: content1000,
        });

        const result = await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: content1000,
          visibility: 'PRIVATE',
        });

        expect(result.success).toBe(true);
      });
    });

    describe('バリデーションエラー', () => {
      it('should reject empty content', async () => {
        const result = await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: '',
          visibility: 'PRIVATE',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('VALIDATION_ERROR');
          expect(result.error.field).toBe('content');
        }
      });

      it('should reject whitespace-only content', async () => {
        const result = await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: '   \n\t  ',
          visibility: 'PRIVATE',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('VALIDATION_ERROR');
          expect(result.error.field).toBe('content');
        }
      });

      it('should reject content exceeding 1000 characters', async () => {
        const content1001 = 'a'.repeat(1001);

        const result = await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: content1001,
          visibility: 'PRIVATE',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('VALIDATION_ERROR');
          expect(result.error.field).toBe('content');
        }
      });

      it('should count multibyte characters correctly (UTF-16)', async () => {
        // 日本語文字: 各1文字としてカウント
        const japaneseContent = 'あ'.repeat(1001);

        const result = await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: japaneseContent,
          visibility: 'PRIVATE',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('VALIDATION_ERROR');
        }
      });

      it('should accept 1000 Japanese characters', async () => {
        const japaneseContent = 'あ'.repeat(1000);
        prismaMock.article.findUnique.mockResolvedValue(mockArticle);
        prismaMock.comment.create.mockResolvedValue({
          ...mockComment,
          content: japaneseContent,
        });

        const result = await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: japaneseContent,
          visibility: 'PRIVATE',
        });

        expect(result.success).toBe(true);
      });
    });

    describe('記事存在確認', () => {
      it('should return ARTICLE_NOT_FOUND when article does not exist', async () => {
        prismaMock.article.findUnique.mockResolvedValue(null);

        const result = await service.createComment({
          articleId: 'non-existent-article',
          userId: 'user-123',
          content: 'Test comment',
          visibility: 'PRIVATE',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('ARTICLE_NOT_FOUND');
        }
      });
    });

    describe('XSSサニタイズ', () => {
      it('should remove script tags', async () => {
        prismaMock.article.findUnique.mockResolvedValue(mockArticle);
        prismaMock.comment.create.mockResolvedValue({
          ...mockComment,
          content: 'Safe text',
        });

        await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: '<script>alert("xss")</script>Safe text',
          visibility: 'PRIVATE',
        });

        expect(prismaMock.comment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              content: expect.not.stringContaining('<script>'),
            }),
          })
        );
      });

      it('should remove event handlers', async () => {
        prismaMock.article.findUnique.mockResolvedValue(mockArticle);
        prismaMock.comment.create.mockResolvedValue({
          ...mockComment,
          content: 'Click me',
        });

        await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: '<div onclick="alert(1)">Click me</div>',
          visibility: 'PRIVATE',
        });

        expect(prismaMock.comment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              content: expect.not.stringContaining('onclick'),
            }),
          })
        );
      });

      it('should handle HTML entities in content', async () => {
        prismaMock.article.findUnique.mockResolvedValue(mockArticle);
        prismaMock.comment.create.mockResolvedValue({
          ...mockComment,
          content: 'Test & example',
        });

        await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: 'Test &amp; example',
          visibility: 'PRIVATE',
        });

        expect(prismaMock.comment.create).toHaveBeenCalled();
      });
    });
  });

  describe('getCommentsByArticle', () => {
    const mockComments: Comment[] = [
      { ...mockComment, id: 'comment-1', createdAt: new Date('2024-01-03') },
      { ...mockComment, id: 'comment-2', createdAt: new Date('2024-01-02') },
      { ...mockComment, id: 'comment-3', createdAt: new Date('2024-01-01') },
    ];

    describe('正常系', () => {
      it('should return comments for user and article', async () => {
        prismaMock.comment.findMany.mockResolvedValue(mockComments);
        prismaMock.comment.count.mockResolvedValue(3);

        const result = await service.getCommentsByArticle('article-123', 'user-123', {
          limit: 10,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.comments).toHaveLength(3);
          expect(result.data.totalCount).toBe(3);
        }
      });

      it('should filter by userId (only own comments)', async () => {
        prismaMock.comment.findMany.mockResolvedValue(mockComments);
        prismaMock.comment.count.mockResolvedValue(3);

        await service.getCommentsByArticle('article-123', 'user-123', { limit: 10 });

        expect(prismaMock.comment.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              userId: 'user-123',
            }),
          })
        );
      });

      it('should exclude deleted comments (deletedAt: null)', async () => {
        prismaMock.comment.findMany.mockResolvedValue(mockComments);
        prismaMock.comment.count.mockResolvedValue(3);

        await service.getCommentsByArticle('article-123', 'user-123', { limit: 10 });

        expect(prismaMock.comment.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              deletedAt: null,
            }),
          })
        );
      });

      it('should order by createdAt DESC', async () => {
        prismaMock.comment.findMany.mockResolvedValue(mockComments);
        prismaMock.comment.count.mockResolvedValue(3);

        await service.getCommentsByArticle('article-123', 'user-123', { limit: 10 });

        expect(prismaMock.comment.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          })
        );
      });
    });

    describe('ページネーション', () => {
      it('should return nextCursor when more results exist', async () => {
        const comments = mockComments.slice(0, 2);
        prismaMock.comment.findMany.mockResolvedValue(comments);
        prismaMock.comment.count.mockResolvedValue(5);

        const result = await service.getCommentsByArticle('article-123', 'user-123', {
          limit: 2,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.nextCursor).toBe('comment-2');
        }
      });

      it('should return null nextCursor when no more results', async () => {
        prismaMock.comment.findMany.mockResolvedValue(mockComments);
        prismaMock.comment.count.mockResolvedValue(3);

        const result = await service.getCommentsByArticle('article-123', 'user-123', {
          limit: 10,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.nextCursor).toBeNull();
        }
      });

      it('should use cursor for pagination', async () => {
        prismaMock.comment.findMany.mockResolvedValue([mockComments[2]]);
        prismaMock.comment.count.mockResolvedValue(3);

        await service.getCommentsByArticle('article-123', 'user-123', {
          cursor: 'comment-2',
          limit: 10,
        });

        expect(prismaMock.comment.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            cursor: { id: 'comment-2' },
            skip: 1,
          })
        );
      });
    });

    describe('0件の場合', () => {
      it('should return empty array with null cursor', async () => {
        prismaMock.comment.findMany.mockResolvedValue([]);
        prismaMock.comment.count.mockResolvedValue(0);

        const result = await service.getCommentsByArticle('article-123', 'user-123', {
          limit: 10,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.comments).toHaveLength(0);
          expect(result.data.nextCursor).toBeNull();
          expect(result.data.totalCount).toBe(0);
        }
      });
    });
  });

  describe('updateComment', () => {
    describe('正常系', () => {
      it('should update comment content', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);
        prismaMock.comment.update.mockResolvedValue({
          ...mockComment,
          content: 'Updated content',
        });

        const result = await service.updateComment('comment-123', 'user-123', {
          content: 'Updated content',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.content).toBe('Updated content');
        }
      });

      it('should update comment visibility', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);
        prismaMock.comment.update.mockResolvedValue({
          ...mockComment,
          visibility: 'PUBLIC',
        });

        const result = await service.updateComment('comment-123', 'user-123', {
          visibility: 'PUBLIC',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.visibility).toBe('PUBLIC');
        }
      });

      it('should sanitize updated content', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);
        prismaMock.comment.update.mockResolvedValue({
          ...mockComment,
          content: 'Safe content',
        });

        await service.updateComment('comment-123', 'user-123', {
          content: '<script>xss</script>Safe content',
        });

        expect(prismaMock.comment.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              content: 'Safe content',
            }),
          })
        );
      });
    });

    describe('所有者チェック', () => {
      it('should reject update from non-owner', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);

        const result = await service.updateComment('comment-123', 'other-user', {
          content: 'Updated content',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('FORBIDDEN');
        }
      });
    });

    describe('エラーケース', () => {
      it('should return NOT_FOUND for non-existent comment', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(null);

        const result = await service.updateComment('non-existent', 'user-123', {
          content: 'Updated content',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('NOT_FOUND');
        }
      });

      it('should return NOT_FOUND for deleted comment', async () => {
        prismaMock.comment.findUnique.mockResolvedValue({
          ...mockComment,
          deletedAt: new Date(),
        });

        const result = await service.updateComment('comment-123', 'user-123', {
          content: 'Updated content',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('NOT_FOUND');
        }
      });

      it('should validate updated content length', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);

        const result = await service.updateComment('comment-123', 'user-123', {
          content: 'a'.repeat(1001),
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('VALIDATION_ERROR');
        }
      });
    });
  });

  describe('deleteComment', () => {
    describe('正常系', () => {
      it('should soft delete comment (set deletedAt)', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);
        prismaMock.comment.update.mockResolvedValue({
          ...mockComment,
          deletedAt: new Date(),
        });

        const result = await service.deleteComment('comment-123', 'user-123');

        expect(result.success).toBe(true);
        expect(prismaMock.comment.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              deletedAt: expect.any(Date),
            }),
          })
        );
      });
    });

    describe('所有者チェック', () => {
      it('should reject delete from non-owner', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);

        const result = await service.deleteComment('comment-123', 'other-user');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('FORBIDDEN');
        }
      });
    });

    describe('エラーケース', () => {
      it('should return NOT_FOUND for non-existent comment', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(null);

        const result = await service.deleteComment('non-existent', 'user-123');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('NOT_FOUND');
        }
      });

      it('should return NOT_FOUND for already deleted comment', async () => {
        prismaMock.comment.findUnique.mockResolvedValue({
          ...mockComment,
          deletedAt: new Date(),
        });

        const result = await service.deleteComment('comment-123', 'user-123');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('NOT_FOUND');
        }
      });
    });
  });

  describe('Cache Integration', () => {
    describe('createComment', () => {
      it('should invalidate cache after successful creation', async () => {
        prismaMock.article.findUnique.mockResolvedValue(mockArticle);
        prismaMock.comment.create.mockResolvedValue(mockComment);

        await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: 'Test comment',
          visibility: 'PRIVATE',
        });

        expect(mockCommentsCache.invalidate).toHaveBeenCalledWith('article-123', 'user-123');
      });

      it('should not invalidate cache on validation error', async () => {
        await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: '',
          visibility: 'PRIVATE',
        });

        expect(mockCommentsCache.invalidate).not.toHaveBeenCalled();
      });

      it('should not invalidate cache when article not found', async () => {
        prismaMock.article.findUnique.mockResolvedValue(null);

        await service.createComment({
          articleId: 'article-123',
          userId: 'user-123',
          content: 'Test comment',
          visibility: 'PRIVATE',
        });

        expect(mockCommentsCache.invalidate).not.toHaveBeenCalled();
      });
    });

    describe('getCommentsByArticle', () => {
      const mockPaginatedComments = {
        comments: [mockComment],
        nextCursor: null,
        totalCount: 1,
      };

      it('should return cached data on cache hit', async () => {
        mockCommentsCache.getComments.mockResolvedValue(mockPaginatedComments);

        const result = await service.getCommentsByArticle('article-123', 'user-123', {
          limit: 10,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(mockPaginatedComments);
        }
        // Should not query database
        expect(prismaMock.comment.findMany).not.toHaveBeenCalled();
        expect(prismaMock.comment.count).not.toHaveBeenCalled();
      });

      it('should query database and set cache on cache miss', async () => {
        mockCommentsCache.getComments.mockResolvedValue(null);
        prismaMock.comment.findMany.mockResolvedValue([mockComment]);
        prismaMock.comment.count.mockResolvedValue(1);

        await service.getCommentsByArticle('article-123', 'user-123', { limit: 10 });

        // Should query database
        expect(prismaMock.comment.findMany).toHaveBeenCalled();
        expect(prismaMock.comment.count).toHaveBeenCalled();
        // Should set cache
        expect(mockCommentsCache.setComments).toHaveBeenCalledWith(
          'article-123',
          'user-123',
          null,
          10,
          expect.objectContaining({
            comments: [mockComment],
            totalCount: 1,
          })
        );
      });

      it('should pass cursor to cache methods', async () => {
        prismaMock.comment.findMany.mockResolvedValue([mockComment]);
        prismaMock.comment.count.mockResolvedValue(5);

        await service.getCommentsByArticle('article-123', 'user-123', {
          cursor: 'cursor-123',
          limit: 10,
        });

        expect(mockCommentsCache.getComments).toHaveBeenCalledWith(
          'article-123',
          'user-123',
          'cursor-123',
          10
        );
        expect(mockCommentsCache.setComments).toHaveBeenCalledWith(
          'article-123',
          'user-123',
          'cursor-123',
          10,
          expect.any(Object)
        );
      });
    });

    describe('updateComment', () => {
      it('should invalidate cache after successful update', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);
        prismaMock.comment.update.mockResolvedValue({
          ...mockComment,
          content: 'Updated content',
        });

        await service.updateComment('comment-123', 'user-123', {
          content: 'Updated content',
        });

        expect(mockCommentsCache.invalidate).toHaveBeenCalledWith('article-123', 'user-123');
      });

      it('should not invalidate cache on permission error', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);

        await service.updateComment('comment-123', 'other-user', {
          content: 'Updated content',
        });

        expect(mockCommentsCache.invalidate).not.toHaveBeenCalled();
      });

      it('should not invalidate cache when comment not found', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(null);

        await service.updateComment('comment-123', 'user-123', {
          content: 'Updated content',
        });

        expect(mockCommentsCache.invalidate).not.toHaveBeenCalled();
      });
    });

    describe('deleteComment', () => {
      it('should invalidate cache after successful deletion', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);
        prismaMock.comment.update.mockResolvedValue({
          ...mockComment,
          deletedAt: new Date(),
        });

        await service.deleteComment('comment-123', 'user-123');

        expect(mockCommentsCache.invalidate).toHaveBeenCalledWith('article-123', 'user-123');
      });

      it('should not invalidate cache on permission error', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);

        await service.deleteComment('comment-123', 'other-user');

        expect(mockCommentsCache.invalidate).not.toHaveBeenCalled();
      });

      it('should not invalidate cache when comment not found', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(null);

        await service.deleteComment('comment-123', 'user-123');

        expect(mockCommentsCache.invalidate).not.toHaveBeenCalled();
      });
    });
  });
});
