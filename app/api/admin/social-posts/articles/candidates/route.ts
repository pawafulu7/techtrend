/**
 * Social Posts API - Article Candidates Search
 *
 * GET /api/admin/social-posts/articles/candidates - 候補記事検索
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/get-session';
import {
  validateUser,
  createUserDeletedResponse,
} from '@/lib/middleware/with-user-validation';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  SocialPostSelector,
  ArticleCandidatesSearchSchema,
} from '@/lib/social-post';
import { prisma } from '@/lib/prisma';

/**
 * GET - 候補記事を検索
 *
 * クエリパラメータ:
 * - category: 記事カテゴリ（frontend, backend, ai_ml等）
 * - keyword: 検索キーワード（タイトル・要約を部分一致検索）
 * - limit: 取得件数（1-50、デフォルト10）
 *
 * レート制限: 30回/分 (admin:social-post-candidates)
 */
async function candidatesHandler(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authentication required.' },
        { status: 401 }
      );
    }

    // User existence check (prevent deleted user access)
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

    const { searchParams } = new URL(request.url);

    // クエリパラメータを取得（z.coerce.number()で文字列→数値変換をZodに委任）
    const rawParams = {
      category: searchParams.get('category') || undefined,
      keyword: searchParams.get('keyword') || undefined,
      limit: searchParams.get('limit') || undefined,
    };

    // Zodでバリデーション
    const parseResult = ArticleCandidatesSearchSchema.safeParse(rawParams);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const params = parseResult.data;
    const selector = new SocialPostSelector(prisma);
    const articles = await selector.searchCandidateArticles(params);

    logger.info(
      {
        userId: session.user.id,
        category: params.category,
        keyword: params.keyword,
        limit: params.limit,
        resultCount: articles.length,
      },
      '[SocialPostsAPI] Searched candidate articles'
    );

    return NextResponse.json({
      success: true,
      articles,
      count: articles.length,
    });
  } catch (error) {
    logger.error(
      { error },
      '[SocialPostsAPI] Failed to search candidate articles'
    );
    return NextResponse.json(
      { error: 'Failed to search candidate articles' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit(
  'admin:social-post-candidates',
  candidatesHandler
);
