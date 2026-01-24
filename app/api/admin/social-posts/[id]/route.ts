/**
 * Social Posts API - Single Post Operations
 *
 * GET    /api/admin/social-posts/[id] - 詳細取得
 * PATCH  /api/admin/social-posts/[id] - 更新
 * DELETE /api/admin/social-posts/[id] - 削除
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  getSocialPostService,
  SocialPostUpdateSchema,
  NotFoundError,
  DuplicateContentError,
} from '@/lib/social-post';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET - 詳細取得
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
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
    const { id } = await params;
    const includeAuditLogs =
      request.nextUrl.searchParams.get('includeAuditLogs') === 'true';

    const service = getSocialPostService();
    const post = includeAuditLogs
      ? await service.getByIdWithAuditLogs(id)
      : await service.getById(id);

    if (!post) {
      return NextResponse.json(
        { error: 'Social post not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(post, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error({ error }, '[SocialPostsAPI] Failed to get post');
    return NextResponse.json(
      { error: 'Failed to fetch social post' },
      { status: 500 }
    );
  }
}

/**
 * PATCH - 更新
 *
 * レート制限: 20回/分 (admin:social-post-write)
 */
async function updateHandler(request: NextRequest, context: RouteContext) {
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
    const { id } = await context.params;
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
    const parseResult = SocialPostUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const service = getSocialPostService();

    // scheduledAtをDateに変換
    const updateData = {
      ...parseResult.data,
      scheduledAt: parseResult.data.scheduledAt
        ? new Date(parseResult.data.scheduledAt)
        : parseResult.data.scheduledAt === null
          ? null
          : undefined,
    };

    const post = await service.update(id, updateData, session.user.id, {
      ipAddress:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    logger.info(
      { postId: post.id, userId: session.user.id },
      '[SocialPostsAPI] Post updated'
    );

    return NextResponse.json(post);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: 'Social post not found' },
        { status: 404 }
      );
    }

    if (error instanceof DuplicateContentError) {
      return NextResponse.json(
        { error: 'A post with similar content already exists' },
        { status: 409 }
      );
    }

    logger.error({ error }, '[SocialPostsAPI] Failed to update post');
    return NextResponse.json(
      { error: 'Failed to update social post' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - 削除
 *
 * レート制限: 20回/分 (admin:social-post-write)
 */
async function deleteHandler(request: NextRequest, context: RouteContext) {
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
    const { id } = await context.params;
    const service = getSocialPostService();

    await service.delete(id, session.user.id, {
      ipAddress:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    logger.info(
      { postId: id, userId: session.user.id },
      '[SocialPostsAPI] Post deleted'
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: 'Social post not found' },
        { status: 404 }
      );
    }

    logger.error({ error }, '[SocialPostsAPI] Failed to delete post');
    return NextResponse.json(
      { error: 'Failed to delete social post' },
      { status: 500 }
    );
  }
}

export const PATCH = withRateLimit('admin:social-post-write', updateHandler);
export const DELETE = withRateLimit('admin:social-post-write', deleteHandler);
