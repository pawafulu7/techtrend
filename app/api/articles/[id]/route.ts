import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import type { ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
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

const idSchema = z.string().cuid();

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
            details: error.errors,
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
    if (summary !== undefined) updateData.summary = summary;
    if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
    if (content !== undefined) updateData.content = content;

    if (tagNames !== undefined && Array.isArray(tagNames)) {
      updateData.tags = {
        set: [], // Clear existing tags
        connectOrCreate: tagNames.map((name: string) => ({
          where: { name },
          create: { name },
        })),
      };
    }

    const article = await prisma.article.update({
      where: { id },
      data: updateData,
      include: {
        source: true,
        tags: true,
      },
    });

    // キャッシュを無効化
    await cacheInvalidator.onArticleUpdated(id);

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
