import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { ArticleSummarizer } from '@/lib/ai';
import { Prisma } from '@prisma/client';
import type { ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { articleId } = body;

    if (!articleId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required field: articleId',
      } as ApiResponse<never>, { status: 400 });
    }

    // Get article
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      return NextResponse.json({
        success: false,
        error: 'Article not found',
      } as ApiResponse<never>, { status: 404 });
    }

    if (!article.content) {
      return NextResponse.json({
        success: false,
        error: 'Article has no content to summarize',
      } as ApiResponse<never>, { status: 400 });
    }

    // Check API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Gemini API key not configured',
      } as ApiResponse<never>, { status: 500 });
    }

    // Generate summary
    const summarizer = new ArticleSummarizer(apiKey);
    const summary = await summarizer.summarize(
      article.id,
      article.title,
      article.content
    );

    // Update article
    const updatedArticle = await prisma.article.update({
      where: { id: articleId },
      data: { summary },
      include: {
        source: true,
        tags: true,
      },
    });

    // キャッシュを無効化
    await cacheInvalidator.onArticleUpdated(articleId);

    return NextResponse.json({
      success: true,
      data: updatedArticle,
    } as ApiResponse<ArticleWithRelations>);
  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate summary',
      details: error instanceof Error ? error.message : undefined,
    } as ApiResponse<never>, { status: 500 });
  }
}

// Batch summarization endpoint
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { articleIds, regenerate = false } = body;

    if (!articleIds || !Array.isArray(articleIds)) {
      return NextResponse.json({
        success: false,
        error: 'Missing or invalid articleIds array',
      } as ApiResponse<never>, { status: 400 });
    }

    // Get articles
    const whereClause: Prisma.ArticleWhereInput = {
      id: { in: articleIds },
      content: { not: null },
    };

    if (!regenerate) {
      whereClause.summary = null;
    }

    const articles = await prisma.article.findMany({
      where: whereClause,
    });

    if (articles.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          processed: 0,
          message: 'No articles to summarize',
        },
      } as ApiResponse<any>);
    }

    // Check API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Gemini API key not configured',
      } as ApiResponse<never>, { status: 500 });
    }

    // Generate summaries
    const summarizer = new ArticleSummarizer(apiKey);
    const summaries = await summarizer.summarizeBatch(
      articles.map(a => ({
        id: a.id,
        title: a.title,
        content: a.content!,
      }))
    );

    // Update articles
    let processed = 0;
    for (const [articleId, summary] of summaries) {
      await prisma.article.update({
        where: { id: articleId },
        data: { summary },
      });
      processed++;
    }

    // バッチ処理後にキャッシュを無効化
    if (processed > 0) {
      await cacheInvalidator.onBulkImport();
    }

    return NextResponse.json({
      success: true,
      data: {
        processed,
        total: articles.length,
        message: `Summarized ${processed} out of ${articles.length} articles`,
      },
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Error in batch summarization:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process batch summarization',
      details: error instanceof Error ? error.message : undefined,
    } as ApiResponse<never>, { status: 500 });
  }
}