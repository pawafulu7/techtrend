import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import type { ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { resolveTags } from '@/lib/services/tag-service';
import { getEmbeddingScheduler } from '@/lib/di/providers/embedding-scheduler.provider';
import logger from '@/lib/logger';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const article = await prisma.article.findUnique({
      where: { id },
      include: {
        source: true,
        tags: true,
      },
    });

    if (!article) {
      return NextResponse.json(
        {
          success: false,
          error: 'Article not found',
        } as ApiResponse<never>,
        { status: 404 }
      );
    }

    if (article.isHidden) {
      return NextResponse.json(
        {
          success: false,
          error: 'Article not found',
        } as ApiResponse<never>,
        { status: 404 }
      );
    }

    // Check if article has content (exclude null and empty strings, consistent with list API)
    if (article.content === null || article.content.trim() === '') {
      return NextResponse.json(
        {
          success: false,
          error: 'Article content not available',
        } as ApiResponse<never>,
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: article,
    } as ApiResponse<ArticleWithRelations>);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch article',
        details:
          process.env.NODE_ENV !== 'production'
            ? error instanceof Error
              ? error.message
              : undefined
            : undefined,
      } as ApiResponse<never>,
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  thumbnail: z.string().optional(),
  content: z.string().optional(),
  tagNames: z.array(z.string()).optional(),
});

const idSchema = z.cuid();

async function patchHandler(request: NextRequest, context: any) {
  try {
    const { id } = await context.params;

    const idResult = idSchema.safeParse(id);
    if (!idResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid article ID',
        } as ApiResponse<never>,
        { status: 400 }
      );
    }

    let body: z.infer<typeof patchSchema>;
    try {
      const rawBody = await request.json();
      body = patchSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Validation failed',
            details: error.issues,
          } as ApiResponse<never>,
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
        } as ApiResponse<never>,
        { status: 400 }
      );
    }

    const { title, summary, thumbnail, content, tagNames } = body;

    const updateData: Prisma.ArticleUpdateInput = {};
    if (title !== undefined) updateData.title = title;
    if (summary !== undefined) {
      updateData.summary = summary;
      // 一覧は summaryComputedAt がある記事だけを出し、定期の要約生成は要約のある記事を拾わない。
      // 要約を書いた記事は要約の処理を終えたものとして扱い、空にした記事は一覧から外す
      // （収集で要約を消すときの SUMMARY_RESET と同じ）
      updateData.summaryComputedAt = summary ? new Date() : null;
    }
    if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
    if (content !== undefined) {
      updateData.content = content;
      // 本文を書く他の経路と同じく本文の更新日時を進める（要約の再試行の期間・品質スコアの
      // 再計算は、この日時で本文の変化を拾う）
      updateData.contentUpdatedAt = new Date();
    }

    // タグは大文字小文字だけが違う既存のタグを使う（#672）。記事の更新と同じ
    // トランザクションに入れ、更新に失敗したとき（存在しない ID など）使われないタグを残さない
    const article = await prisma.$transaction(async (tx) => {
      if (tagNames !== undefined && Array.isArray(tagNames)) {
        const tags = await resolveTags(
          tagNames.map((name: string) => ({ name })),
          tx
        );
        // 既存のタグを外して、指定のタグに置き換える
        updateData.tags = { set: tags.map((tag) => ({ id: tag.id })) };
      }

      return tx.article.update({
        where: { id },
        data: updateData,
        include: {
          source: true,
          tags: true,
        },
      });
    });

    // 埋め込みはタイトルと一覧要約から作るので、どちらかを書いたら保存の後にジョブを積む。
    // ワーカーは要約の無い記事を飛ばすので、要約が残っているときだけ（空にした要約の埋め込みは
    // DB のトリガーが消す）
    const embeddingTextWritten = title !== undefined || summary !== undefined;
    if (embeddingTextWritten && article.summary) {
      await getEmbeddingScheduler().enqueue(id);
    }

    // キャッシュを無効化。タイトルか要約を書いたら、検索のキャッシュも消す
    // （onArticleUpdated は changes のタイトル・要約の値があるときに消す）
    await cacheInvalidator.onArticleUpdated(
      id,
      embeddingTextWritten
        ? { title: article.title, summary: article.summary }
        : undefined
    );
    // onArticleUpdated は一覧のキャッシュを消さないので、一覧に出る項目（タイトル・要約・サムネイル・
    // タグ）や、一覧に出すかを決める本文（本文の無い記事は出さない）を書いたら、一覧と件数の
    // キャッシュも消す（collect-feeds の要約生成の後と同じ）。失敗しても更新は済んでいるので、
    // ログに出して成功を返す
    if (
      embeddingTextWritten ||
      thumbnail !== undefined ||
      tagNames !== undefined ||
      content !== undefined
    ) {
      try {
        await cacheInvalidator.onBulkImport();
      } catch (cacheError) {
        logger.error(
          { err: cacheError, articleId: id },
          'List cache invalidation failed'
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: article,
    } as ApiResponse<ArticleWithRelations>);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update article',
        details:
          process.env.NODE_ENV !== 'production'
            ? error instanceof Error
              ? error.message
              : undefined
            : undefined,
      } as ApiResponse<never>,
      { status: 500 }
    );
  }
}

async function deleteHandler(request: NextRequest, context: any) {
  try {
    const { id } = await context.params;

    const idResult = idSchema.safeParse(id);
    if (!idResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid article ID',
        } as ApiResponse<never>,
        { status: 400 }
      );
    }

    await prisma.article.delete({
      where: { id },
    });

    // キャッシュを無効化
    await cacheInvalidator.onArticleDeleted(id);
    // onArticleDeleted は一覧と件数のキャッシュを消さないので、消した記事が一覧に残らないよう消す。
    // 失敗しても削除は済んでいるので、ログに出して成功を返す
    try {
      await cacheInvalidator.onBulkImport();
    } catch (cacheError) {
      logger.error(
        { err: cacheError, articleId: id },
        'List cache invalidation failed'
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Article deleted successfully' },
    } as ApiResponse<{ message: string }>);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete article',
        details:
          process.env.NODE_ENV !== 'production'
            ? error instanceof Error
              ? error.message
              : undefined
            : undefined,
      } as ApiResponse<never>,
      { status: 500 }
    );
  }
}

export const PATCH = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(patchHandler))
);

export const DELETE = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(deleteHandler))
);
