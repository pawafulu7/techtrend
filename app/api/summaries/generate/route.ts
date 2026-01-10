import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { normalizeArticleCategory } from '@/lib/utils/article-category-normalizer';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCronOrAdminAuth } from '@/lib/middleware/with-cron-or-admin-auth';

async function generateSummariesHandler(_request: NextRequest) {
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
          articleId: article.id,
        });

        // 既存のタグ名を取得
        const existingTagNames = article.tags.map(tag => tag.name);

        // tags重複除外：result.tags内の重複 + 既存タグとの重複
        const resultTags = result.tags ?? [];
        const uniqueNewTags = [...new Set(resultTags)].filter(
          tagName => !existingTagNames.includes(tagName)
        );

        // N+1最適化: createMany + findMany パターン（接続プール圧迫を回避）
        let tagConnections: { id: string }[] = [];
        if (uniqueNewTags.length > 0) {
          // 1. 全タグを一括作成（重複はスキップ）
          await prisma.tag.createMany({
            data: uniqueNewTags.map(name => ({ name })),
            skipDuplicates: true
          });

          // 2. 作成/既存のタグを一括取得
          const existingTags = await prisma.tag.findMany({
            where: { name: { in: uniqueNewTags } },
            select: { id: true }
          });

          tagConnections = existingTags.map(tag => ({ id: tag.id }));
        }

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

// 認証チェック（Cron Secret または Admin Session）→ レート制限
export const POST = withCronOrAdminAuth(
  withRateLimit('ai:summary', generateSummariesHandler)
);