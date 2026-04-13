/**
 * Social Posts API - Generate from Specific Article
 *
 * POST /api/admin/social-posts/generate-from-article - 指定記事から投稿を生成
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/get-session';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import {
  validateUser,
  createUserDeletedResponse,
} from '@/lib/middleware/with-user-validation';
import {
  getSocialPostService,
  NotFoundError,
  PromptInjectionError,
  DuplicateContentError,
} from '@/lib/social-post';

/**
 * リクエストスキーマ
 */
const GenerateFromArticleSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
});

/**
 * POST - 指定記事から投稿を生成
 *
 * リクエストボディ: { articleId: string }
 *
 * レート制限: 10回/分 (admin:social-post-generate-article)
 */
async function generateFromArticleHandler(request: NextRequest) {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized. Authentication required.' },
      { status: 401 }
    );
  }

  const validatedUser = await validateUser(session);
  if (!validatedUser) {
    return createUserDeletedResponse();
  }

  if (session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden. Admin access required.' },
      { status: 403 }
    );
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Zodでバリデーション
    const parseResult = GenerateFromArticleSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { articleId } = parseResult.data;
    const service = getSocialPostService();

    // 記事から投稿を生成
    const result = await service.generate(
      { source: 'ARTICLE', sourceIds: [articleId] },
      session.user.id,
      {
        ipAddress:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }
    );

    if (result.failed.length > 0 && result.succeeded.length === 0) {
      // 全て失敗
      return NextResponse.json(
        { error: result.failed[0].error },
        { status: 400 }
      );
    }

    logger.info(
      {
        userId: session.user.id,
        articleId,
        succeeded: result.succeeded.length,
      },
      '[SocialPostsAPI] Generated post from specific article'
    );

    return NextResponse.json({
      success: true,
      post: result.succeeded[0],
    });
  } catch (error) {
    // ソースが見つからない場合
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // プロンプトインジェクション検出
    if (error instanceof PromptInjectionError) {
      logger.warn(
        { userId: session.user.id },
        '[SocialPostsAPI] Prompt injection detected'
      );
      return NextResponse.json(
        { error: 'Content validation failed' },
        { status: 400 }
      );
    }

    // 重複コンテンツ
    if (error instanceof DuplicateContentError) {
      return NextResponse.json(
        { error: 'A post from this article already exists' },
        { status: 409 }
      );
    }

    logger.error(
      { error },
      '[SocialPostsAPI] Failed to generate post from article'
    );
    return NextResponse.json(
      { error: 'Failed to generate post from article' },
      { status: 500 }
    );
  }
}

export const POST = withCSRFProtection(
  withRateLimit(
    'admin:social-post-generate-article',
    generateFromArticleHandler
  )
);
