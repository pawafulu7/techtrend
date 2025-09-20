import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

/**
 * バッチ処理の設定オプション
 */
export interface BatchOptions {
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  onProgress?: (processed: number, total: number) => void;
  onError?: (error: Error, batch: any[]) => void;
}

/**
 * 汎用的なバッチ処理プロセッサー
 * 大量のデータを効率的に処理するための基本クラス
 */
export class BatchProcessor<T> {
  private readonly defaultBatchSize = 100;
  private readonly defaultMaxRetries = 3;
  private readonly defaultRetryDelay = 1000;

  constructor(private readonly options: BatchOptions = {}) {}

  /**
   * データを指定されたサイズのバッチに分割
   */
  private splitIntoBatches(items: T[], batchSize?: number): T[][] {
    const size = batchSize ?? this.options.batchSize ?? this.defaultBatchSize;

    // batchSizeの検証: 正の整数であることを確認
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`batchSize must be a positive integer. Received: ${size}`);
    }

    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }

    return batches;
  }

  /**
   * バッチ処理の実行（リトライ機能付き）
   */
  private async processBatchWithRetry<R>(
    batch: T[],
    processor: (batch: T[]) => Promise<R>,
    retries = 0
  ): Promise<R | null> {
    try {
      return await processor(batch);
    } catch (error) {
      const maxRetries = this.options.maxRetries || this.defaultMaxRetries;

      if (retries < maxRetries) {
        const delay = this.options.retryDelay || this.defaultRetryDelay;
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, retries)));
        return this.processBatchWithRetry(batch, processor, retries + 1);
      }

      if (this.options.onError) {
        this.options.onError(error as Error, batch);
      }

      throw error;
    }
  }

  /**
   * バッチ処理の実行
   */
  async process<R>(
    items: T[],
    processor: (batch: T[]) => Promise<R>
  ): Promise<R[]> {
    const batches = this.splitIntoBatches(items);
    const results: R[] = [];
    let processedCount = 0;

    for (const batch of batches) {
      const result = await this.processBatchWithRetry(batch, processor);

      if (result !== null) {
        results.push(result);
      }

      processedCount += batch.length;

      if (this.options.onProgress) {
        this.options.onProgress(processedCount, items.length);
      }
    }

    return results;
  }

  /**
   * 並列バッチ処理の実行
   * 複数のバッチを同時に処理して高速化
   */
  async processParallel<R>(
    items: T[],
    processor: (batch: T[]) => Promise<R>,
    concurrency = 3
  ): Promise<R[]> {
    // concurrencyの検証: 正の整数であることを確認
    if (!Number.isFinite(concurrency) || concurrency <= 0) {
      throw new Error(`concurrency must be a positive integer. Received: ${concurrency}`);
    }

    const batches = this.splitIntoBatches(items);
    const results: R[] = [];
    let processedCount = 0;

    // 並列実行のためのチャンク作成
    for (let i = 0; i < batches.length; i += concurrency) {
      const chunk = batches.slice(i, i + concurrency);

      const chunkResults = await Promise.all(
        chunk.map(batch => this.processBatchWithRetry(batch, processor))
      );

      chunkResults.forEach(result => {
        if (result !== null) {
          results.push(result);
        }
      });

      processedCount += chunk.reduce((sum, batch) => sum + batch.length, 0);

      if (this.options.onProgress) {
        this.options.onProgress(processedCount, items.length);
      }
    }

    return results;
  }
}

/**
 * 記事のバッチ更新処理
 */
export class ArticleBatchProcessor extends BatchProcessor<string> {
  /**
   * 複数記事のお気に入り状態を一括更新
   */
  async batchUpdateFavorites(
    userId: string,
    articleIds: string[],
    isFavorited: boolean
  ): Promise<void> {
    await this.process(articleIds, async (batch) => {
      if (isFavorited) {
        // お気に入りに追加
        const data = batch.map(articleId => ({
          userId,
          articleId
        }));

        await prisma.favorite.createMany({
          data,
          skipDuplicates: true
        });
      } else {
        // お気に入りから削除
        await prisma.favorite.deleteMany({
          where: {
            userId,
            articleId: { in: batch }
          }
        });
      }
    });
  }

  /**
   * 複数記事の既読状態を一括更新
   */
  async batchUpdateReadStatus(
    userId: string,
    articleIds: string[],
    isRead: boolean
  ): Promise<void> {
    await this.process(articleIds, async (batch) => {
      const now = new Date();

      // upsertManyがPrismaにないため、トランザクションで処理
      await prisma.$transaction(
        batch.map(articleId =>
          prisma.articleView.upsert({
            where: {
              userId_articleId: {
                userId,
                articleId
              }
            },
            update: {
              isRead,
              readAt: isRead ? now : null
            },
            create: {
              userId,
              articleId,
              isRead,
              readAt: isRead ? now : null,
              viewedAt: null
            }
          })
        )
      );
    });
  }
}

/**
 * データベースクエリのバッチ実行
 * Prismaのトランザクションを使用して一括処理
 */
export class QueryBatchProcessor {
  /**
   * 複数のPrismaクエリをバッチ実行
   */
  static async executeQueries<T>(
    queries: Prisma.PrismaPromise<T>[],
    batchSize = 100
  ): Promise<T[]> {
    // batchSizeの検証: 正の整数であることを確認
    if (!Number.isFinite(batchSize) || batchSize <= 0) {
      throw new Error(`batchSize must be a positive integer. Received: ${batchSize}`);
    }

    const results: T[] = [];

    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchResults = await prisma.$transaction(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 条件付きクエリのバッチ実行
   * 条件に応じて異なるクエリを実行
   */
  static async executeConditionalQueries<T>(
    items: Array<{ condition: boolean; query: Prisma.PrismaPromise<T> }>,
    batchSize = 100
  ): Promise<T[]> {
    const queriesToExecute = items
      .filter(item => item.condition)
      .map(item => item.query);

    return this.executeQueries(queriesToExecute, batchSize);
  }
}