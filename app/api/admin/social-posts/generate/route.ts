/**
 * Social Posts API - AI Generation
 *
 * POST /api/admin/social-posts/generate - AI生成
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/get-session';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  getSocialPostService,
  SocialPostAutoGenerateSchema,
  NotFoundError,
  PromptInjectionError,
  DuplicateContentError,
} from '@/lib/social-post';

/**
 * POST - AI生成（自動選定）
 *
 * リクエストボディ: { count: number } (1-5)
 * 人気度・注目度を考慮して記事を自動選定し、投稿を生成
 *
 * レート制限: 5回/分 (admin:social-post-generate)
 */
async function generateHandler(request: NextRequest) {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized. Authentication required.' },
      { status: 401 }
    );
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

    // Zodでバリデーション（countのみ）
    const parseResult = SocialPostAutoGenerateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { count } = parseResult.data;

    const service = getSocialPostService();
    const posts = await service.generateScheduledPosts(count);

    logger.info(
      {
        userId: session.user.id,
        requested: count,
        generated: posts.length,
      },
      '[SocialPostsAPI] Auto-generated posts from popular articles'
    );

    return NextResponse.json({
      success: true,
      posts,
      count: posts.length,
    });
  } catch (error) {
    // ソースが見つからない場合
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
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
        { error: 'A post with similar content already exists' },
        { status: 409 }
      );
    }

    logger.error({ error }, '[SocialPostsAPI] Failed to generate posts');
    return NextResponse.json(
      { error: 'Failed to generate social posts' },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(
  'admin:social-post-generate',
  generateHandler
);
