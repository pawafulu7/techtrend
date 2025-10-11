import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { normalizeArticleCategory } from '@/lib/utils/article-category-normalizer';

export async function POST() {
  try {
    // 要約がない記事を取得（最大10件）
    const articlesWithoutSummary = await prisma.article.findMany({
      where: {
        OR: [
          { summary: null },
          { summary: '' },
          { detailedSummary: null },
          { detailedSummary: '' }
        ]
      },
      include: {
        source: true,
        tags: true
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 10
    });

    let generated = 0;
    let errors = 0;

    // 新DIサービスを使用
    const { service } = getAppDependencies();

    for (const article of articlesWithoutSummary) {
      try {
        // コンテンツが空の場合はスキップ
        if (!article.content || article.content.trim() === '') {
          continue;
        }

        // 新DIサービスで要約を生成
        const result = await service.generateSummary({
          title: article.title,
          content: article.content,
          qualityThreshold: 40,
        });

        // 既存のタグ名を取得
        const existingTagNames = article.tags.map(tag => tag.name);

        // tags重複除外：result.tags内の重複 + 既存タグとの重複
        const resultTags = result.tags ?? [];
        const uniqueNewTags = [...new Set(resultTags)].filter(
          tagName => !existingTagNames.includes(tagName)
        );

        // 新規タグを並列でupsert（パフォーマンス最適化）
        const tagConnections = await Promise.all(
          uniqueNewTags.map(async tagName => {
            const tag = await prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName },
            });
            return { id: tag.id };
          })
        );

        // category正規化
        const normalizedCategory = result.category
          ? normalizeArticleCategory(result.category)
          : undefined;

        const now = new Date();

        // 記事を更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            articleType: 'unified',
            summaryVersion: result.summaryVersion,
            qualityScore: result.qualityScore,
            summaryComputedAt: now,
            qualityScoreComputedAt: now,
            ...(result.translatedTitle && { translatedTitle: result.translatedTitle }),
            ...(normalizedCategory && { category: normalizedCategory }),
            ...(tagConnections.length > 0 && {
              tags: { connect: tagConnections }
            })
          }
        });

        generated++;
      } catch (error) {
        console.error(`[API] Summary generation failed for article ${article.id} (${article.title.substring(0, 30)}...):`, error);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        generated,
        errors,
        total: articlesWithoutSummary.length
      }
    });
  } catch (error) {
    console.error('[API] Batch summary generation failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate summaries'
      },
      { status: 500 }
    );
  }
}