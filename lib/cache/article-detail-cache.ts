import { RedisCache } from './redis-cache';
import { CACHE_TTL } from './constants';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { revalidatePath } from 'next/cache';

/**
 * 記事詳細ページ用のキャッシュクラス
 */
export class ArticleDetailCache {
  private cache: RedisCache;

  constructor() {
    this.cache = new RedisCache({
      ttl: CACHE_TTL.LONG,
      namespace: '@techtrend/cache:article-detail',
    });
  }

  /**
   * 記事詳細を取得（キャッシュ利用）
   */
  /**
   * Restore Date objects from cached string timestamps
   * Handles nested date fields in article, source, and tags
   */
  private restoreDates<T>(cached: T): T {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const restored = { ...cached } as Record<string, unknown>;

    // Restore article date fields
    const dateFields = ['publishedAt', 'createdAt', 'updatedAt'];
    dateFields.forEach((field) => {
      if (restored[field] && typeof restored[field] === 'string') {
        restored[field] = new Date(restored[field]);
      }
    });

    // Restore source date fields if present
    if (restored.source && typeof restored.source === 'object') {
      const source = restored.source as Record<string, unknown>;
      ['createdAt', 'updatedAt'].forEach((field) => {
        if (source[field] && typeof source[field] === 'string') {
          source[field] = new Date(source[field] as string);
        }
      });
    }

    // Restore tag date fields if present
    if (Array.isArray(restored.tags)) {
      restored.tags = restored.tags.map((tag: unknown) => {
        if (tag && typeof tag === 'object') {
          const restoredTag = { ...tag };
          ['createdAt', 'updatedAt'].forEach((field) => {
            if (restoredTag[field] && typeof restoredTag[field] === 'string') {
              restoredTag[field] = new Date(restoredTag[field]);
            }
          });
          return restoredTag;
        }
        return tag;
      });
    }

    return restored as T;
  }

  async getArticleWithRelations(
    articleId: string
  ): Promise<Prisma.ArticleGetPayload<{
    include: {
      source: true;
      tags: true;
    };
  }> | null> {
    // キャッシュから取得を試みる
    const cacheKey = `article:${articleId}:with-relations`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      // Restore Date objects from cached string timestamps
      const restored = this.restoreDates(cached);
      return restored as Prisma.ArticleGetPayload<{
        include: {
          source: true;
          tags: true;
        };
      }>;
    }

    // DBから取得（sourceとtagsを必ず含める）
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        source: true,
        tags: true,
      },
    });

    if (!article) {
      return null;
    }

    // Exclude hidden articles (centralized check for all callers)
    if (article.isHidden) {
      return null;
    }

    // キャッシュに保存
    await this.cache.set(cacheKey, article);

    return article;
  }

  /**
   * 関連記事を取得（キャッシュ利用）
   */

  async getRelatedArticles(
    articleId: string,
    tagIds: string[]
  ): Promise<any[]> {
    if (tagIds.length === 0) {
      return [];
    }

    // キャッシュキーを生成（記事IDとタグIDの組み合わせ）
    const cacheKey = `related:${articleId}:${tagIds.sort().join(',')}`;

    // キャッシュから取得を試みる
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return Array.isArray(cached) ? cached : [];
    }

    // DBから取得
    const relatedArticles = await prisma.$queryRaw<
      {
        id: string;
        title: string;
        translatedTitle: string | null;
        summary: string | null;
        url: string;
        publishedAt: Date;
        sourceId: string;
        sourceName: string;
        qualityScore: number | null;
        difficulty: string | null;
        commonTags: bigint;
        tags: string | null;
      }[]
    >`
      WITH RelatedArticles AS (
        SELECT DISTINCT
          a.id,
          a.title,
          a."translatedTitle",
          a.summary,
          a.url,
          a."publishedAt",
          a."sourceId",
          s.name as "sourceName",
          a."qualityScore",
          a.difficulty,
          COUNT(DISTINCT at."B") as "commonTags"
        FROM "Article" a
        JOIN "_ArticleToTag" at ON a.id = at."A"
        JOIN "Source" s ON a."sourceId" = s.id
        WHERE at."B" = ANY(${tagIds}::text[])
          AND a.id != ${articleId}
          AND a."isHidden" = false
          AND a."qualityScore" >= 30
        GROUP BY a.id, a.title, a."translatedTitle", a.summary, a.url, a."publishedAt", a."sourceId", s.name, a."qualityScore", a.difficulty
        HAVING COUNT(DISTINCT at."B") > 0
        ORDER BY COUNT(DISTINCT at."B") DESC, a."publishedAt" DESC
        LIMIT 10
      )
      SELECT
        ra.*,
        STRING_AGG(t.id || '::' || t.name, '||') as tags
      FROM RelatedArticles ra
      LEFT JOIN "_ArticleToTag" at2 ON ra.id = at2."A"
      LEFT JOIN "Tag" t ON at2."B" = t.id
      GROUP BY ra.id, ra.title, ra."translatedTitle", ra.summary, ra.url, ra."publishedAt", ra."sourceId", ra."sourceName", ra."qualityScore", ra.difficulty, ra."commonTags"
      ORDER BY ra."commonTags" DESC, ra."publishedAt" DESC
    `;

    // キャッシュに保存
    await this.cache.set(cacheKey, relatedArticles);

    return Array.isArray(relatedArticles) ? relatedArticles : [];
  }

  /**
   * 記事更新時のキャッシュ無効化
   * Redis + Next.js ISRキャッシュの両方を無効化
   */
  async invalidateArticle(articleId: string): Promise<void> {
    // Redisキャッシュを削除
    await this.cache.delete(`article:${articleId}:with-relations`);
    await this.cache.invalidatePattern(`related:${articleId}:*`);

    // Next.js ISRキャッシュを無効化
    try {
      revalidatePath(`/articles/${articleId}`);
    } catch {
      // スクリプト実行時など、Next.jsコンテキスト外では無視
    }
  }

  /**
   * 全関連記事キャッシュを無効化
   * 非表示トグル時など、関連記事の表示が変わる可能性がある場合に使用
   */
  async invalidateAllRelated(): Promise<void> {
    try {
      await this.cache.invalidatePattern('related:*');
    } catch (error) {
      console.error('Failed to invalidate related article cache:', error);
    }
  }

  /**
   * キャッシュ統計を取得
   */
  getStats() {
    return this.cache.getStats();
  }
}

// シングルトンインスタンス
export const articleDetailCache = new ArticleDetailCache();
