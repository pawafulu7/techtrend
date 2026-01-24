/**
 * Social Posts API - AI Generation
 *
 * POST /api/admin/social-posts/generate - AI生成
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  getSocialPostService,
  SocialPostGenerateSchema,
} from '@/lib/social-post';

/**
 * POST - AI生成
 *
 * レート制限: 5回/分 (admin:social-post-generate)
 */
async function generateHandler(request: NextRequest) {
  const session = await auth();

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

    // Zodでバリデーション
    const parseResult = SocialPostGenerateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { source, sourceIds } = parseResult.data;

    const service = getSocialPostService();
    const posts = await service.generate(
      { source, sourceIds },
      session.user.id,
      {
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }
    );

    logger.info(
      {
        userId: session.user.id,
        source,
        sourceIds,
        generatedCount: posts.length,
      },
      '[SocialPostsAPI] Posts generated'
    );

    return NextResponse.json({
      success: true,
      posts,
      count: posts.length,
    });
  } catch (error) {
    // ソースが見つからない場合
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // プロンプトインジェクション検出
    if (error instanceof Error && error.message.includes('injection')) {
      logger.warn(
        { userId: session.user.id, error: error.message },
        '[SocialPostsAPI] Prompt injection detected'
      );
      return NextResponse.json(
        { error: 'Content validation failed' },
        { status: 400 }
      );
    }

    // 重複コンテンツ
    if (error instanceof Error && error.message.includes('Duplicate')) {
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
