import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { Prisma } from '@prisma/client';
import type { ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';

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
      return NextResponse.json({
        success: false,
        error: 'Article not found',
      } as ApiResponse<never>, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: article,
    } as ApiResponse<ArticleWithRelations>);
  } catch (_error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch article',
      details: error instanceof Error ? error.message : undefined,
    } as ApiResponse<never>, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
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
  } catch (_error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to update article',
      details: error instanceof Error ? error.message : undefined,
    } as ApiResponse<never>, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.article.delete({
      where: { id },
    });

    // キャッシュを無効化
    await cacheInvalidator.onArticleDeleted(id);

    return NextResponse.json({
      success: true,
      data: { message: 'Article deleted successfully' },
    } as ApiResponse<{ message: string }>);
  } catch (_error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to delete article',
      details: error instanceof Error ? error.message : undefined,
    } as ApiResponse<never>, { status: 500 });
  }
}