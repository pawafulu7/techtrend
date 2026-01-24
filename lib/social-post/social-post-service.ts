/**
 * Social Post Service
 *
 * メインサービス（CRUD、生成制御、監査ログ）
 */

import { createHash } from 'crypto';
import type { PrismaClient, Prisma } from '@prisma/client';
import logger from '@/lib/logger';
import { prisma as defaultPrisma } from '@/lib/prisma';

import type {
  SocialPost,
  SocialPostStatus,
  CreateSocialPostInput,
  UpdateSocialPostInput,
  GenerateParams,
  BulkActionParams,
  SocialPostFilters,
  PaginatedResult,
  GenerateResult,
  AuditAction,
  AuditMetadata,
} from './types';
import { SocialPostGenerator } from './social-post-generator';
import { SocialPostSelector } from './social-post-selector';
import { DuplicateContentError, NotFoundError } from './errors';

// =============================================================================
// Service Class
// =============================================================================

export class SocialPostService {
  private generator: SocialPostGenerator;
  private selector: SocialPostSelector;

  constructor(private prisma: PrismaClient) {
    this.selector = new SocialPostSelector(prisma);
    this.generator = new SocialPostGenerator(this.selector);
  }

  // =============================================================================
  // CRUD Operations
  // =============================================================================

  /**
   * 一覧取得（フィルター・ページネーション対応）
   */
  async list(filters: SocialPostFilters): Promise<PaginatedResult<SocialPost>> {
    const { status, source, dateFrom, dateTo, page = 1 } = filters;
    // Ensure limit is at least 1 to prevent zero division
    const limit = Math.max(1, filters.limit ?? 20);

    const where: Prisma.SocialPostWhereInput = {
      ...(status && status !== 'all' && { status }),
      ...(source && source !== 'all' && { source }),
      // 日付フィルター: dateFromとdateToを1つのcreatedAtオブジェクトにマージ
      ...((dateFrom || dateTo) && {
        createdAt: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.socialPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.socialPost.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 詳細取得
   */
  async getById(id: string): Promise<SocialPost | null> {
    return this.prisma.socialPost.findUnique({
      where: { id },
    });
  }

  /**
   * 詳細取得（監査ログ付き）
   */
  async getByIdWithAuditLogs(id: string): Promise<
    | (SocialPost & {
        auditLogs: Array<{
          id: string;
          action: string;
          userId: string | null;
          createdAt: Date;
        }>;
      })
    | null
  > {
    return this.prisma.socialPost.findUnique({
      where: { id },
      include: {
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            action: true,
            userId: true,
            createdAt: true,
          },
        },
      },
    });
  }

  /**
   * 新規作成
   * @param options.skipAuditLog - trueの場合、監査ログを作成しない（generate()から呼ばれる場合に使用）
   */
  async create(
    data: CreateSocialPostInput,
    userId: string,
    metadata?: AuditMetadata,
    options?: { skipAuditLog?: boolean }
  ): Promise<SocialPost> {
    const contentHash = this.generateContentHash(data.content);

    // 重複チェック
    const existing = await this.prisma.socialPost.findFirst({
      where: {
        contentHash,
        status: { notIn: ['ARCHIVED'] },
      },
    });

    if (existing) {
      throw new DuplicateContentError();
    }

    try {
      const post = await this.prisma.socialPost.create({
        data: {
          content: data.content,
          hashtags: data.hashtags,
          sourceUrls: data.sourceUrls,
          source: data.source,
          sourceIds: data.sourceIds || [],
          contentHash,
          modelVersion: data.modelVersion,
          promptVersion: data.promptVersion,
          contextSummary: data.contextSummary,
          createdBy: userId,
        },
      });

      if (!options?.skipAuditLog) {
        await this.createAuditLog(
          post.id,
          'CREATE',
          userId,
          null,
          post,
          metadata
        );
      }

      logger.info({ postId: post.id, userId }, 'SocialPost created');

      return post;
    } catch (error) {
      // Prismaユニーク制約違反を409相当のエラーに変換
      if (this.isPrismaUniqueConstraintError(error)) {
        throw new DuplicateContentError();
      }
      throw error;
    }
  }

  /**
   * 更新
   */
  async update(
    id: string,
    data: UpdateSocialPostInput,
    userId: string,
    metadata?: AuditMetadata
  ): Promise<SocialPost> {
    const existing = await this.prisma.socialPost.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('SocialPost', id);
    }

    // 編集前コンテンツを保存（初回編集時のみ）
    const updateData: Prisma.SocialPostUpdateInput = { ...data };

    if (data.content && data.content !== existing.content) {
      if (!existing.originalContent) {
        updateData.originalContent = existing.content;
      }
      updateData.contentHash = this.generateContentHash(data.content);
    }

    // レビュー情報を更新
    if (data.status === 'REVIEWED') {
      updateData.reviewedBy = userId;
      updateData.reviewedAt = new Date();
    }

    try {
      const post = await this.prisma.socialPost.update({
        where: { id },
        data: updateData,
      });

      await this.createAuditLog(id, 'UPDATE', userId, existing, post, metadata);

      logger.info(
        { postId: id, userId, changes: Object.keys(data) },
        'SocialPost updated'
      );

      return post;
    } catch (error) {
      // Prismaユニーク制約違反を409相当のエラーに変換
      if (this.isPrismaUniqueConstraintError(error)) {
        throw new DuplicateContentError();
      }
      throw error;
    }
  }

  /**
   * 削除
   */
  async delete(
    id: string,
    userId: string,
    metadata?: AuditMetadata
  ): Promise<void> {
    const existing = await this.prisma.socialPost.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('SocialPost', id);
    }

    // 監査ログを先に記録（Cascadeで削除されるため）
    await this.createAuditLog(id, 'DELETE', userId, existing, null, metadata);

    await this.prisma.socialPost.delete({
      where: { id },
    });

    logger.info({ postId: id, userId }, 'SocialPost deleted');
  }

  // =============================================================================
  // Bulk Operations
  // =============================================================================

  /**
   * 一括操作
   */
  async bulkAction(
    params: BulkActionParams,
    userId: string,
    metadata?: AuditMetadata
  ): Promise<{ success: number; failed: number }> {
    const { action, ids, status } = params;
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        if (action === 'delete') {
          await this.delete(id, userId, metadata);
        } else if (action === 'changeStatus' && status) {
          await this.update(id, { status }, userId, metadata);
        } else {
          // Unknown or invalid action
          logger.warn({ id, action, status }, 'Unknown or invalid bulk action');
          failed++;
          continue;
        }
        success++;
      } catch (error) {
        logger.warn({ id, action, error }, 'Bulk action failed for item');
        failed++;
      }
    }

    logger.info(
      { action, total: ids.length, success, failed, userId },
      'Bulk action completed'
    );

    return { success, failed };
  }

  // =============================================================================
  // AI Generation
  // =============================================================================

  /**
   * AI生成（手動）
   * 部分成功をサポート: 一部失敗しても成功分は返却
   */
  async generate(
    params: GenerateParams,
    userId: string,
    metadata?: AuditMetadata
  ): Promise<GenerateResult<SocialPost>> {
    const { source, sourceIds } = params;
    const succeeded: SocialPost[] = [];
    const failed: Array<{ sourceId: string; error: string }> = [];

    for (const sourceId of sourceIds) {
      try {
        const generated = await this.generator.generate(source, sourceId);

        const post = await this.create(
          {
            content: generated.comment,
            hashtags: [],
            sourceUrls: generated.sourceUrls,
            source,
            sourceIds: [sourceId],
            modelVersion: generated.modelVersion,
            promptVersion: generated.promptVersion,
            contextSummary: generated.contextSummary,
          },
          userId,
          metadata,
          { skipAuditLog: true } // GENERATEアクションで記録するため
        );

        await this.createAuditLog(post.id, 'GENERATE', userId, null, post, {
          source,
          sourceId,
          modelVersion: generated.modelVersion,
          ...metadata,
        });

        succeeded.push(post);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error({ source, sourceId, error }, 'Failed to generate post');
        failed.push({ sourceId, error: errorMessage });
        // 部分成功のため続行
      }
    }

    logger.info(
      {
        source,
        total: sourceIds.length,
        succeeded: succeeded.length,
        failed: failed.length,
      },
      'Post generation completed'
    );

    return { succeeded, failed };
  }

  /**
   * スケジュール実行用の自動生成
   */
  async generateScheduledPosts(count: number = 5): Promise<SocialPost[]> {
    const articles = await this.selector.selectArticles(count);
    const results: SocialPost[] = [];

    for (const article of articles) {
      try {
        const generated = await this.generator.generateFromArticle(article);

        const post = await this.create(
          {
            content: generated.comment,
            hashtags: [],
            sourceUrls: [article.url],
            source: 'ARTICLE',
            sourceIds: [article.id],
            modelVersion: generated.modelVersion,
            promptVersion: generated.promptVersion,
            contextSummary: generated.contextSummary,
          },
          'system',
          undefined,
          { skipAuditLog: true } // GENERATEアクションで記録するため
        );

        await this.createAuditLog(post.id, 'GENERATE', 'system', null, post, {
          source: 'ARTICLE',
          sourceId: article.id,
          modelVersion: generated.modelVersion,
          scheduled: true,
        });

        results.push(post);
      } catch (error) {
        logger.error(
          { articleId: article.id, error },
          'Failed to generate scheduled post'
        );
        // 1件失敗しても続行
      }
    }

    logger.info(
      { requested: count, generated: results.length },
      'Scheduled post generation completed'
    );

    return results;
  }

  /**
   * トレンド分析からOpinion投稿を生成（感想・意見調）
   * @param count 生成件数（1-5）
   * @param userId 生成を実行したユーザーID（監査ログ用）
   */
  async generateOpinionPosts(
    count: number = 1,
    userId: string = 'system'
  ): Promise<SocialPost[]> {
    const results: SocialPost[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const generated = await this.generator.generateOpinion();

        const post = await this.create(
          {
            content: generated.comment,
            hashtags: [],
            sourceUrls: [],
            source: 'OPINION',
            sourceIds: [],
            modelVersion: generated.modelVersion,
            promptVersion: generated.promptVersion,
            contextSummary: generated.contextSummary,
          },
          userId,
          undefined,
          { skipAuditLog: true }
        );

        await this.createAuditLog(post.id, 'GENERATE', userId, null, post, {
          source: 'OPINION',
          modelVersion: generated.modelVersion,
        });

        results.push(post);
      } catch (error) {
        logger.error({ error, index: i }, 'Failed to generate opinion post');
        // 1件失敗しても続行
      }
    }

    logger.info(
      { requested: count, generated: results.length, userId },
      'Opinion post generation completed'
    );

    return results;
  }

  // =============================================================================
  // Statistics
  // =============================================================================

  /**
   * ステータス別の件数を取得
   */
  async getStatusCounts(): Promise<Record<SocialPostStatus | 'total', number>> {
    const counts = await this.prisma.socialPost.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    // Initialize all statuses with 0
    const result: Record<SocialPostStatus | 'total', number> = {
      DRAFT: 0,
      REVIEWED: 0,
      SCHEDULED: 0,
      POSTING: 0,
      POSTED: 0,
      FAILED: 0,
      ARCHIVED: 0,
      total: 0,
    };

    for (const item of counts) {
      result[item.status as SocialPostStatus] = item._count.status;
      result.total += item._count.status;
    }

    return result;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * コンテンツハッシュを生成
   */
  private generateContentHash(content: string): string {
    return createHash('sha256')
      .update(content.trim().toLowerCase())
      .digest('hex');
  }

  /**
   * Prismaのユニーク制約違反エラーかどうかを判定
   */
  private isPrismaUniqueConstraintError(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }

  /**
   * 監査ログを作成
   */
  private async createAuditLog(
    socialPostId: string,
    action: AuditAction,
    userId: string | null,
    previousData: unknown,
    newData: unknown,
    metadata?: AuditMetadata
  ): Promise<void> {
    try {
      await this.prisma.socialPostAuditLog.create({
        data: {
          socialPostId,
          action,
          userId,
          previousData: previousData
            ? JSON.parse(JSON.stringify(previousData))
            : null,
          newData: newData ? JSON.parse(JSON.stringify(newData)) : null,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        },
      });
    } catch (error) {
      // 監査ログの失敗はメイン処理に影響させない
      logger.error(
        { socialPostId, action, error },
        'Failed to create audit log'
      );
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let serviceInstance: SocialPostService | null = null;

/**
 * SocialPostServiceのシングルトンインスタンスを取得
 */
export function getSocialPostService(prisma?: PrismaClient): SocialPostService {
  // If a custom prisma instance is provided, create a new service instance
  // This is useful for testing with mock prisma clients
  if (prisma) {
    return new SocialPostService(prisma);
  }
  // Otherwise, use the singleton pattern for the default prisma instance
  if (!serviceInstance) {
    serviceInstance = new SocialPostService(defaultPrisma);
  }
  return serviceInstance;
}

/**
 * テスト用: インスタンスをリセット
 */
export function resetSocialPostService(): void {
  serviceInstance = null;
}
