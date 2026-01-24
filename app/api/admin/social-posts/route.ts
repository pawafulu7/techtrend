/**
 * Social Posts API - List & Create
 *
 * GET  /api/admin/social-posts - 一覧取得
 * POST /api/admin/social-posts - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  getSocialPostService,
  SocialPostFiltersSchema,
  SocialPostCreateSchema,
} from '@/lib/social-post';

/**
 * GET - 一覧取得
 */
export async function GET(request: NextRequest) {
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
    const searchParams = request.nextUrl.searchParams;

    // パラメータをパース
    const rawFilters = {
      status: searchParams.get('status') || undefined,
      source: searchParams.get('source') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
    };

    // Zodでバリデーション
    const parseResult = SocialPostFiltersSchema.safeParse(rawFilters);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const service = getSocialPostService();
    const result = await service.list(parseResult.data);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error({ error }, '[SocialPostsAPI] Failed to list posts');
    return NextResponse.json(
      { error: 'Failed to fetch social posts' },
      { status: 500 }
    );
  }
}

/**
 * POST - 新規作成
 *
 * レート制限: 20回/分 (admin:social-post-write)
 */
async function createHandler(request: NextRequest) {
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
    const parseResult = SocialPostCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const service = getSocialPostService();
    const post = await service.create(parseResult.data, session.user.id, {
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    logger.info(
      { postId: post.id, userId: session.user.id },
      '[SocialPostsAPI] Post created'
    );

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Duplicate content detected'
    ) {
      return NextResponse.json(
        {
          error:
            'Duplicate content detected. A post with this content already exists.',
        },
        { status: 409 }
      );
    }

    logger.error({ error }, '[SocialPostsAPI] Failed to create post');
    return NextResponse.json(
      { error: 'Failed to create social post' },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit('admin:social-post-write', createHandler);
