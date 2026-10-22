import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { normalizeArticleCategory } from '@/lib/utils/article/article-category-normalizer';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCronOrAdminAuth } from '@/lib/middleware/with-cron-or-admin-auth';
import { getTagIdsForConnect } from '@/lib/services/tag-service';
import { calculateArticleQualityScore } from '@/lib/utils/quality-score';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';

async function generateSummariesHandler(_request: NextRequest) {
  try {
    // 要約がない記事を取得（最大10件）
    const articlesWithoutSummary = await prisma.article.findMany({
      where: {
        OR: [
          { summary: null },
          { summary: '' },
          { detailedSummary: null },
          { detailedSummary: '' },
        ],
      },
      include: {
        source: true,
        tags: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: 10,
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
        const existingTagNames = article.tags.map((tag) => tag.name);

        // tags重複除外：result.tags内の重複 + 既存タグとの重複
        const resultTags = result.tags ?? [];
        const uniqueNewTags = [...new Set(resultTags)].filter(
          (tagName) => !existingTagNames.includes(tagName)
        );

        // category正規化
        const normalizedCategory = result.category
          ? normalizeArticleCategory(result.category)
          : undefined;

        const now = new Date();

        // タグ作成と記事更新をatomicに実行
        await prisma.$transaction(async (tx) => {
          // Safe tag creation using upsert pattern (prevents race condition duplicates)
          const tagConnections =
            uniqueNewTags.length > 0
              ? await getTagIdsForConnect(
                  uniqueNewTags,
                  { normalize: false },
                  tx
                )
              : [];

          // 記事を更新
          const updated = await tx.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              articleType: 'unified',
              summaryVersion: result.summaryVersion,
              summaryComputedAt: now,
              ...(result.translatedTitle && {
                translatedTitle: result.translatedTitle,
              }),
              ...(normalizedCategory && { category: normalizedCategory }),
              ...(tagConnections.length > 0 && {
                tags: { connect: tagConnections },
              }),
            },
            include: { source: true, tags: true },
          });

          // qualityScore 列は記事スコア（定期採点と同じ式）。新しい要約とタグで採点する。
          // サービスの result.qualityScore は要約の品質スコアで別の指標なので保存しない
          await tx.article.update({
            where: { id: article.id },
            data: {
              qualityScore: calculateArticleQualityScore(updated),
              qualityScoreComputedAt: now,
            },
          });
        });
        // 埋め込みのジョブは、要約を保存した後に積む（ワーカーは保存済みの要約を埋め込む）
        await service.scheduleEmbedding(article.id);
        // 記事ごとのキャッシュを消す（定期実行の batch-processor と同じ。失敗を投げない）
        await cacheInvalidator.onArticleUpdated(article.id, {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
        });

        generated++;
      } catch (error) {
        console.error(
          `[API] Summary generation failed for article ${article.id} (${article.title.substring(0, 30)}...):`,
          error
        );
        errors++;
      }
    }

    if (generated > 0) {
      // onArticleUpdated は一覧と件数のキャッシュを消さないので、要約を作った記事が一覧にすぐ出るよう
      // 最後にまとめて消す（collect-feeds の要約生成の後と同じ）。失敗しても要約は保存済み
      try {
        await cacheInvalidator.onBulkImport();
      } catch (cacheError) {
        console.error('[API] List cache invalidation failed:', cacheError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        generated,
        errors,
        total: articlesWithoutSummary.length,
      },
    });
  } catch (error) {
    console.error('[API] Batch summary generation failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate summaries',
      },
      { status: 500 }
    );
  }
}

// 認証チェック（Cron Secret または Admin Session）→ レート制限
export const POST = withCronOrAdminAuth(
  withRateLimit('ai:summary', generateSummariesHandler)
);
