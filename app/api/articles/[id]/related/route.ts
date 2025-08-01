import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: articleId } = await params;
    
    // 対象記事を取得
    const targetArticle = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        tags: true
      }
    });

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

    // 同じタグを持つ記事を取得し、共通タグ数でグループ化
    const placeholders = tagIds.map(() => '?').join(',');
    const relatedArticlesRaw = await prisma.$queryRawUnsafe<Array<{
      id: string;
      title: string;
      summary: string | null;
      url: string;
      publishedAt: Date;
      sourceId: string;
      qualityScore: number;
      difficulty: string | null;
      commonTags: number;
    }>>(
      `
      SELECT DISTINCT
        a.id,
        a.title,
        a.summary,
        a.url,
        a.publishedAt,
        a.sourceId,
        a.qualityScore,
        a.difficulty,
        COUNT(DISTINCT at.B) as commonTags
      FROM Article a
      JOIN _ArticleToTag at ON a.id = at.A
      WHERE at.B IN (${placeholders})
        AND a.id != ?
        AND a.qualityScore >= 30
      GROUP BY a.id
      HAVING commonTags > 0
      ORDER BY commonTags DESC, a.publishedAt DESC
      LIMIT 10
      `,
      ...tagIds,
      articleId
    );

    // ソース情報とタグ情報を取得
    const articleIds = relatedArticlesRaw.map(a => a.id);
    
    const articlesWithDetails = await prisma.article.findMany({
      where: {
        id: {
          in: articleIds
        }
      },
      include: {
        source: true,
        tags: true
      }
    });

    // 詳細情報をマップに変換
    const articleDetailsMap = new Map(
      articlesWithDetails.map(a => [a.id, a])
    );

    // Jaccard係数で類似度を計算
    const targetTagSet = new Set(tagIds);
    
    const relatedArticles = relatedArticlesRaw
      .map(article => {
        const details = articleDetailsMap.get(article.id);
        if (!details) return null;

        const articleTagSet = new Set(details.tags.map(t => t.id));
        const intersection = new Set([...targetTagSet].filter(x => articleTagSet.has(x)));
        const union = new Set([...targetTagSet, ...articleTagSet]);
        const similarity = union.size > 0 ? intersection.size / union.size : 0;

        return {
          id: article.id,
          title: article.title,
          summary: article.summary || '',
          url: article.url,
          source: details.source.name,
          publishedAt: article.publishedAt.toISOString(),
          qualityScore: article.qualityScore,
          difficulty: article.difficulty,
          tags: details.tags.map(tag => ({
            id: tag.id,
            name: tag.name
          })),
          similarity: Math.round(similarity * 100) / 100
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.similarity - a!.similarity);

    return NextResponse.json({
      articles: relatedArticles,
      metadata: {
        algorithm: 'tag-based',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Failed to fetch related articles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch related articles' },
      { status: 500 }
    );
  }
}