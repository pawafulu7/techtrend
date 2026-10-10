import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { validateArticleContent } from '@/lib/services/summary/summary-orchestrator';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCronOrAdminAuth } from '@/lib/middleware/with-cron-or-admin-auth';
import { getTagIdsForConnect } from '@/lib/services/tag-service';
import logger from '@/lib/logger';
import { env } from '@/lib/config/env';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';

async function generateTagsHandler(_request: NextRequest) {
  // DI の要約サービスはキーが無くても組み立てられ、記事ごとに失敗するだけになる。
  // 設定不備を 200 で隠さないよう、先に止める
  if (!env.GEMINI_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'Tag generation is not configured' },
      { status: 503 }
    );
  }

  try {
    // タグがない記事を取得（最大10件）。本文が短すぎる記事は生成しないので、
    // 先に除外しないと毎回同じ記事が枠を占める
    const articlesWithoutTags = await prisma.article.findMany({
      where: {
        tags: {
          none: {},
        },
        contentLength: { gte: Math.max(env.MIN_CONTENT_LENGTH, 1) },
      },
      select: {
        id: true,
        title: true,
        content: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: 10,
    });

    let generated = 0;
    let errors = 0;

    // 定期実行と同じ DI の要約サービスを使用
    const { service } = getAppDependencies();

    for (const article of articlesWithoutTags) {
      try {
        // 本文が無い・短すぎる記事はスキップ（定期実行の要約生成と同じ基準）
        const validation = validateArticleContent(article);
        if (!validation.valid) {
          continue;
        }

        // 要約とタグを生成（タグのみ使用）
        const result = await service.generateSummary({
          title: article.title,
          content: validation.content,
          qualityThreshold: 40,
          articleId: article.id, // Schedule embedding job
        });

        const tagNames = result.tags ?? [];

        if (tagNames.length === 0) {
          continue;
        }

        // タグ作成と記事更新をatomicに実行
        const didUpdate = await prisma.$transaction(async (tx) => {
          // Safe tag creation using upsert pattern (prevents race condition duplicates)
          // 要約サービスはタグを trim・重複除去するだけで正規化しない。
          // 既定の正規化を通す
          const tagConnections = await getTagIdsForConnect(
            tagNames,
            undefined,
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
        if (didUpdate) {
          generated++;
          // 記事詳細・一覧のキャッシュはタグを含むので、接続後に無効化する
          try {
            await cacheInvalidator.onArticleUpdated(article.id);
          } catch (cacheError) {
            logger.warn(
              { err: cacheError, articleId: article.id },
              '[TagGenerateAPI] Cache invalidation failed, continuing'
            );
          }
        }
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
