import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';

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
