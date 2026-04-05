import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUnifiedSummaryService } from '@/lib/ai/unified-summary-service';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCronOrAdminAuth } from '@/lib/middleware/with-cron-or-admin-auth';
import { getTagIdsForConnect } from '@/lib/services/tag-service';
import logger from '@/lib/logger';

async function generateTagsHandler(_request: NextRequest) {
  try {
    // タグがない記事を取得（最大10件）
    const articlesWithoutTags = await prisma.article.findMany({
      where: {
        tags: {
          none: {},
        },
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

    // 統一サービスを使用
    const service = getUnifiedSummaryService();

    for (const article of articlesWithoutTags) {
      try {
        // コンテンツが空の場合はスキップ
        if (!article.content || article.content.trim() === '') {
          continue;
        }

        // 統一フォーマットで要約とタグを生成（タグのみ使用）
        const result = await service.generate(
          article.title,
          article.content,
          undefined,
          undefined,
          article.id // Schedule embedding job
        );

        // タグは既に正規化済み
        const normalizedTags = result.tags;

        if (normalizedTags.length === 0) {
          continue;
        }

        // タグ作成と記事更新をatomicに実行
        const didUpdate = await prisma.$transaction(async (tx) => {
          // Safe tag creation using upsert pattern (prevents race condition duplicates)
          const tagConnections = await getTagIdsForConnect(
            normalizedTags,
            { normalize: false }, // Already normalized by service
            tx
          );

          // 記事にタグを追加
          if (tagConnections.length > 0) {
            await tx.article.update({
              where: { id: article.id },
              data: {
                tags: {
                  connect: tagConnections,
                },
              },
            });
            return true;
          }
          return false;
        });
        if (didUpdate) generated++;
      } catch (error) {
        logger.error(
          { err: error, articleId: article.id },
          '[TagGenerateAPI] Tag generation failed'
        );
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        generated,
        errors,
        total: articlesWithoutTags.length,
      },
    });
  } catch (error) {
    logger.error(
      { err: error },
      '[TagGenerateAPI] Batch tag generation failed'
    );
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate tags',
      },
      { status: 500 }
    );
  }
}

// 認証チェック（Cron Secret または Admin Session）→ レート制限
export const POST = withCronOrAdminAuth(
  withRateLimit('ai:tags', generateTagsHandler)
);
