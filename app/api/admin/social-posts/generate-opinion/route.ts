/**
 * Social Posts API - Opinion Generation
 *
 * POST /api/admin/social-posts/generate-opinion - トレンドベースの感想・意見投稿を生成
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/auth';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { getSocialPostService } from '@/lib/social-post';

/**
 * Opinion生成リクエストスキーマ
 */
const OpinionGenerateSchema = z.object({
  count: z.coerce.number().min(1).max(5).default(1),
});

/**
 * POST - トレンドベースの感想・意見投稿を生成
 *
 * リクエストボディ: { count?: number } (1-5, default: 1)
 * 最近のトレンドデータを分析し、感想・意見調の投稿を生成
 *
 * レート制限: 5回/分 (admin:social-post-generate)
 */
async function generateOpinionHandler(request: NextRequest) {
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
    let body = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      // Empty body is OK, use defaults
    }

    // Zodでバリデーション
    const parseResult = OpinionGenerateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { count } = parseResult.data;

    const service = getSocialPostService();
    const posts = await service.generateOpinionPosts(count);

    logger.info(
      {
        userId: session.user.id,
        requested: count,
        generated: posts.length,
      },
      '[SocialPostsAPI] Generated opinion posts'
    );

    return NextResponse.json({
      success: true,
      posts,
      count: posts.length,
    });
  } catch (error) {
    logger.error(
      { error },
      '[SocialPostsAPI] Failed to generate opinion posts'
    );
    return NextResponse.json(
      { error: 'Failed to generate opinion posts' },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(
  'admin:social-post-generate',
  generateOpinionHandler
);
