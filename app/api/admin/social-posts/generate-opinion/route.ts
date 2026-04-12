/**
 * Social Posts API - Opinion Generation
 *
 * POST /api/admin/social-posts/generate-opinion - トレンドベースの感想・意見投稿を生成
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/get-session';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  getSocialPostService,
  NotFoundError,
  PromptInjectionError,
  DuplicateContentError,
  InsufficientDataError,
} from '@/lib/social-post';

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
    // JSONパース（空ボディは許容）
    let body = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
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
    const posts = await service.generateOpinionPosts(count, session.user.id);

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
    // ソースが見つからない場合
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    // プロンプトインジェクション検出
    if (error instanceof PromptInjectionError) {
      logger.warn(
        { userId: session.user.id },
        '[SocialPostsAPI] Prompt injection detected in opinion generation'
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

    // トレンドデータ不足
    if (error instanceof InsufficientDataError) {
      return NextResponse.json(
        { error: 'Insufficient trend data for opinion generation' },
        { status: 422 }
      );
    }

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
