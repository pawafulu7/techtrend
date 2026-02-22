import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';

async function handler(
  request: NextRequest,
  context: { params: Promise<{ articleId: string }> }
) {
  try {
    const { articleId } = await context.params;

    if (!articleId) {
      return NextResponse.json(
        { error: 'articleId is required' },
        { status: 400 }
      );
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
        category: true,
        url: true,
        publishedAt: true,
        source: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const response = NextResponse.json({
      articleId: article.id,
      title: article.title,
      summary: article.detailedSummary || article.summary || '',
      category: article.category ?? 'unknown',
      source: article.source.name,
      publishedAt: article.publishedAt.toISOString(),
      url: article.url,
    });

    response.headers.set(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=7200'
    );

    return response;
  } catch (error) {
    logger.error({ error }, 'Semantic Atlas detail API error');
    return NextResponse.json(
      { error: 'Failed to fetch article detail' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:semantic-atlas', handler);
