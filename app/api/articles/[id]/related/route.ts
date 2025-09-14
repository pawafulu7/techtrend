import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { RedisCache } from '@/lib/cache';
import { articleDetailCache } from '@/lib/cache/article-detail-cache';

// Initialize Redis cache for related articles
const cache = new RedisCache({
  ttl: 600, // 10 minutes
  namespace: '@techtrend/cache:related'
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: articleId } = await params;
    
    // Check cache first
    const cacheKey = cache.generateCacheKey('related', {
      params: { articleId }
    });
    
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }
    
    // 対象記事を取得（キャッシュ利用）
    const targetArticle = await articleDetailCache.getArticleWithRelations(articleId);

    if (!targetArticle) {
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 }
      );
    }

    if (targetArticle.tags.length === 0) {
      return NextResponse.json({
        articles: [],
        metadata: {
          algorithm: 'tag-based',
          timestamp: new Date().toISOString()
        }
      });
    }

    // タグIDのリストを取得
    const tagIds = targetArticle.tags.map(tag => tag.id);

    // 同じタグを持つ記事を取得し、すべての情報を1クエリで取得
    const placeholders = tagIds.map((_, index) => `$${index + 1}`).join(',');
    const relatedArticlesRaw = await prisma.$queryRawUnsafe<Array<{
      id: string;
      title: string;
      summary: string | null;
      url: string;
      publishedAt: Date;
      sourceId: string;
      sourceName: string;
      qualityScore: number;
      difficulty: string | null;
      commonTags: number;
      tags: string | null;
    }>>(
      `
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
        WHERE at."B" IN (${placeholders})
          AND a.id != $${tagIds.length + 1}
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
      `,
      ...tagIds,
      articleId
    );

    // タグ情報のパース関数
    const parseTags = (tagsString: string | null): Array<{ id: string; name: string }> => {
      if (!tagsString) return [];
      
      return tagsString.split('||')
        .filter(tag => tag && tag.includes('::'))
        .map(tag => {
          const [id, name] = tag.split('::', 2);
          return { id, name };
        });
    };

    // Jaccard係数で類似度を計算
    const targetTagSet = new Set(tagIds);
    
    const relatedArticles = relatedArticlesRaw
      .map(article => {
        const articleTags = parseTags(article.tags);
        const articleTagIds = new Set(articleTags.map(t => t.id));
        const intersection = new Set([...targetTagSet].filter(x => articleTagIds.has(x)));
        const union = new Set([...targetTagSet, ...articleTagIds]);
        const similarity = union.size > 0 ? intersection.size / union.size : 0;

        return {
          id: article.id,
          title: article.title,
          summary: article.summary || '',
          url: article.url,
          source: article.sourceName,
          publishedAt: article.publishedAt.toISOString(),
          qualityScore: article.qualityScore,
          difficulty: article.difficulty,
          tags: articleTags,
          similarity: Math.round(similarity * 100) / 100,
          commonTags: Number(article.commonTags)
        };
      })
      .sort((a, b) => {
        // First sort by common tags, then by similarity
        if (b.commonTags !== a.commonTags) {
          return b.commonTags - a.commonTags;
        }
        return b.similarity - a.similarity;
      });

    const response = {
      articles: relatedArticles,
      metadata: {
        algorithm: 'tag-based-optimized',
        timestamp: new Date().toISOString()
      }
    };
    
    // Cache the result
    await cache.set(cacheKey, response);
    
    return NextResponse.json(response);

  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch related articles' },
      { status: 500 }
    );
  }
}