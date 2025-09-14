import { NextRequest, NextResponse } from 'next/server';
import { articleDetailCache } from '@/lib/cache/article-detail-cache';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: articleId } = await params;
    
    
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

    // articleDetailCacheを使用して関連記事を取得
    const relatedArticlesRaw = await articleDetailCache.getRelatedArticles(articleId, tagIds);

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
    
    // 関連記事のキャッシュは articleDetailCache.getRelatedArticles 内で処理される
    
    return NextResponse.json(response);

  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch related articles' },
      { status: 500 }
    );
  }
}