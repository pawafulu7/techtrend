/**
 * Comment Service
 *
 * Provides CRUD operations for comments with:
 * - XSS sanitization
 * - Content validation (1000 char limit)
 * - Article existence verification
 * - Result-based error handling
 */

import { prisma } from '@/lib/prisma';
import { sanitizeUserInput } from '@/lib/utils/html-sanitizer';
import { commentsCache } from '@/lib/cache/comments-cache';
import { logger } from '@/lib/logger';
import type { Comment, CommentVisibility } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface CreateCommentInput {
  articleId: string;
  userId: string;
  content: string;
  visibility: CommentVisibility;
}

export interface UpdateCommentInput {
  content?: string;
  visibility?: CommentVisibility;
}

export interface PaginationOptions {
  cursor?: string;
  limit: number;
}

export interface PaginatedComments {
  comments: Comment[];
  nextCursor: string | null;
  totalCount: number;
}

export type CommentError =
  | { type: 'NOT_FOUND'; message: string }
  | { type: 'ARTICLE_NOT_FOUND'; message: string }
  | { type: 'FORBIDDEN'; message: string }
  | { type: 'VALIDATION_ERROR'; message: string; field?: string }
  | { type: 'INTERNAL_ERROR'; message: string };

export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

// =============================================================================
// Constants
// =============================================================================

const MAX_CONTENT_LENGTH = 1000;

// =============================================================================
// Service
// =============================================================================

export class CommentService {
  /**
   * Create a new comment
   *
   * Flow: Sanitize → Validate → Check Article → Save
   */
  async createComment(
    input: CreateCommentInput
  ): Promise<Result<Comment, CommentError>> {
    const { articleId, userId, content, visibility } = input;

    // 1. Sanitize content (XSS prevention, preserves newlines)
    const sanitizedContent = sanitizeUserInput(content);

    // 2. Validate content
    const validationError = this.validateContent(sanitizedContent);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // 3. Check article exists
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true },
    });

    if (!article) {
      return {
        success: false,
        error: {
          type: 'ARTICLE_NOT_FOUND',
          message: 'Article not found',
        },
      };
    }

    // 4. Create comment
    try {
      const comment = await prisma.comment.create({
        data: {
          articleId,
          userId,
          content: sanitizedContent,
          visibility,
        },
      });

      // 5. Invalidate cache
      await commentsCache.invalidate(articleId, userId);

      return { success: true, data: comment };
    } catch (error) {
      logger.error(
        { err: error, articleId, userId },
        'Failed to create comment in database'
      );
      return {
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: 'Failed to create comment',
        },
      };
    }
  }

  /**
   * Get comments for an article by user
   *
   * MVP: Returns only the user's own comments (private comments)
   * Excludes deleted comments (deletedAt != null)
   * Uses cache with 60 second TTL
   */
  async getCommentsByArticle(
    articleId: string,
    userId: string,
    options: PaginationOptions
  ): Promise<Result<PaginatedComments, CommentError>> {
    const { cursor, limit } = options;

    // 1. Check cache first
    const cached = await commentsCache.getComments(
      articleId,
      userId,
      cursor ?? null,
      limit
    );
    if (cached) {
      return { success: true, data: cached };
    }

    // 2. Query database on cache miss
    try {
      const where = {
        articleId,
        userId,
        deletedAt: null,
      };

      // Get total count
      const totalCount = await prisma.comment.count({ where });

      // Build query with cursor-based pagination
      const comments = await prisma.comment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
      });

      // Determine next cursor
      const nextCursor =
        comments.length === limit ? comments[comments.length - 1].id : null;

      const data: PaginatedComments = {
        comments,
        nextCursor,
        totalCount,
      };

      // 3. Cache the result
      await commentsCache.setComments(articleId, userId, cursor ?? null, limit, data);

      return { success: true, data };
    } catch (_error) {
      return {
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: 'Failed to get comments',
        },
      };
    }
  }

  /**
   * Update a comment
   *
   * - Owner check: only the comment owner can update
   * - Validates content if provided
   * - Sanitizes content before saving
   */
  async updateComment(
    id: string,
    userId: string,
    input: UpdateCommentInput
  ): Promise<Result<Comment, CommentError>> {
    // 1. Find comment and check existence
    const comment = await prisma.comment.findUnique({
      where: { id },
    });

    if (!comment || comment.deletedAt !== null) {
      return {
        success: false,
        error: {
          type: 'NOT_FOUND',
          message: 'Comment not found',
        },
      };
    }

    // 2. Check ownership
    if (comment.userId !== userId) {
      return {
        success: false,
        error: {
          type: 'FORBIDDEN',
          message: 'Permission denied',
        },
      };
    }

    // 3. Prepare update data
    const updateData: { content?: string; visibility?: CommentVisibility } = {};

    if (input.content !== undefined) {
      // Sanitize and validate content (preserves newlines)
      const sanitizedContent = sanitizeUserInput(input.content);
      const validationError = this.validateContent(sanitizedContent);
      if (validationError) {
        return { success: false, error: validationError };
      }
      updateData.content = sanitizedContent;
    }

    if (input.visibility !== undefined) {
      updateData.visibility = input.visibility;
    }

    // 4. Update comment
    try {
      const updatedComment = await prisma.comment.update({
        where: { id },
        data: updateData,
      });

      // 5. Invalidate cache
      await commentsCache.invalidate(comment.articleId, userId);

      return { success: true, data: updatedComment };
    } catch (_error) {
      return {
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: 'Failed to update comment',
        },
      };
    }
  }

  /**
   * Delete a comment (soft delete)
   *
   * Sets deletedAt to current timestamp
   * - Owner check: only the comment owner can delete
   */
  async deleteComment(
    id: string,
    userId: string
  ): Promise<Result<void, CommentError>> {
    // 1. Find comment and check existence
    const comment = await prisma.comment.findUnique({
      where: { id },
    });

    if (!comment || comment.deletedAt !== null) {
      return {
        success: false,
        error: {
          type: 'NOT_FOUND',
          message: 'Comment not found',
        },
      };
    }

    // 2. Check ownership
    if (comment.userId !== userId) {
      return {
        success: false,
        error: {
          type: 'FORBIDDEN',
          message: 'Permission denied',
        },
      };
    }

    // 3. Soft delete
    try {
      await prisma.comment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // 4. Invalidate cache
      await commentsCache.invalidate(comment.articleId, userId);

      return { success: true, data: undefined };
    } catch (_error) {
      return {
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          message: 'Failed to delete comment',
        },
      };
    }
  }

  /**
   * Validate comment content
   *
   * - Not empty
   * - Not whitespace only
   * - Max 1000 characters (UTF-16 code units)
   */
  private validateContent(content: string): CommentError | null {
    // Check empty
    if (!content || content.length === 0) {
      return {
        type: 'VALIDATION_ERROR',
        message: 'Content is required',
        field: 'content',
      };
    }

    // Check whitespace only
    if (content.trim().length === 0) {
      return {
        type: 'VALIDATION_ERROR',
        message: 'Content cannot be whitespace only',
        field: 'content',
      };
    }

    // Check max length (UTF-16 code units = string.length in JavaScript)
    if (content.length > MAX_CONTENT_LENGTH) {
      return {
        type: 'VALIDATION_ERROR',
        message: `Content must be ${MAX_CONTENT_LENGTH} characters or less`,
        field: 'content',
      };
    }

    return null;
  }
}

// Export singleton instance
export const commentService = new CommentService();
