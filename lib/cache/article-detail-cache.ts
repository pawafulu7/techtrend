import { RedisCache } from './redis-cache';
import { prisma } from '@/lib/database';
import type { Prisma } from '@prisma/client';

/**
 * 記事詳細ページ用のキャッシュクラス
 */
export class ArticleDetailCache {
  private cache: RedisCache;

  constructor() {
    this.cache = new RedisCache({
      ttl: 1800, // 30分（詳細ページは長めにキャッシュ）
      namespace: '@techtrend/cache:article-detail'
    });
  }

  /**
   * 記事詳細を取得（キャッシュ利用）
   */
  async getArticleWithRelations(articleId: string): Promise<Prisma.ArticleGetPayload<{
    include: {
      source: true;
      tags: true;
    };
  }> | null> {
    // キャッシュから取得を試みる
    const cacheKey = `article:${articleId}:with-relations`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached as Prisma.ArticleGetPayload<{
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

    // キャッシュに保存
    await this.cache.set(cacheKey, article);

    return article;
  }

  /**
   * 関連記事を取得（キャッシュ利用）
   */
  async getRelatedArticles(articleId: string, tagIds: string[]): Promise<any[]> {
    if (tagIds.length === 0) {
      return [];
    }

    // キャッシュキーを生成（記事IDとタグIDの組み合わせ）
    const cacheKey = `related:${articleId}:${tagIds.sort().join(',')}`;

    // キャッシュから取得を試みる
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached as any[];
    }

    // DBから取得（既存のクエリを使用）
    const relatedArticles = await prisma.$queryRaw`
      WITH RelatedArticles AS (
        SELECT DISTINCT
          a.id,
          a.title,
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
        WHERE at."B" IN (${tagIds.join(',')})
          AND a.id != ${articleId}
          AND a."qualityScore" >= 30
        GROUP BY a.id, a.title, a.summary, a.url, a."publishedAt", a."sourceId", s.name, a."qualityScore", a.difficulty
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
      GROUP BY ra.id, ra.title, ra.summary, ra.url, ra."publishedAt", ra."sourceId", ra."sourceName", ra."qualityScore", ra.difficulty, ra."commonTags"
      ORDER BY ra."commonTags" DESC, ra."publishedAt" DESC
    `;

    // キャッシュに保存
    await this.cache.set(cacheKey, relatedArticles);

    return relatedArticles as any[];
  }

  /**
   * 記事更新時のキャッシュ無効化
   */
  async invalidateArticle(articleId: string): Promise<void> {
    // 記事詳細のキャッシュを削除（新しいキー形式）
    await this.cache.delete(`article:${articleId}:with-relations`);

    // 関連記事のキャッシュも削除（パターンマッチング）
    // TODO: より効率的な削除方法を検討
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