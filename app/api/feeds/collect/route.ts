import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { createFetcher } from '@/lib/fetchers';
import { ArticleSummarizer } from '@/lib/ai';
import { normalizeTagInput, isValidTagArray } from '@/lib/utils/tag-normalizer';
import type { ApiResponse, CollectResult } from '@/types/api';

export async function POST() {
  try {
    const results: CollectResult[] = [];
    
    // Get all enabled sources
    const sources = await prisma.source.findMany({
      where: { enabled: true },
    });

    // Initialize AI summarizer
    const apiKey = process.env.GEMINI_API_KEY;
    const summarizer = apiKey ? new ArticleSummarizer(apiKey) : null;

    for (const source of sources) {
      const result: CollectResult = {
        source: source.name,
        success: true,
        newArticles: 0,
        totalArticles: 0,
      };

      try {
        // Create fetcher for source
        const fetcher = createFetcher(source);
        const { articles, errors } = await fetcher.fetch();
        
        result.totalArticles = articles.length;
        if (errors.length > 0) {
          result.success = false;
          result.error = errors.map(e => e.message).join(', ');
        }

        // Process articles
        for (const articleData of articles) {
          try {
            // Check if article already exists
            const existing = await prisma.article.findUnique({
              where: { url: articleData.url },
            });

            if (!existing) {
              // タグを正規化してバリデーション
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const tagNames = (articleData as any).tagNames || [];
              const normalizedTags = normalizeTagInput(tagNames);
              
              // デバッグ: 不正なタグが検出された場合は警告
              if (process.env.NODE_ENV !== 'production' && tagNames.length > 0) {
                if (!isValidTagArray(tagNames) && Array.isArray(tagNames)) {
                }
              }

              // Create article
              const article = await prisma.article.create({
                data: {
                  title: articleData.title,
                  url: articleData.url,
                  summary: articleData.summary,
                  thumbnail: articleData.thumbnail,
                  content: articleData.content,
                  publishedAt: articleData.publishedAt,
                  sourceId: articleData.sourceId,
                  tags: {
                    connectOrCreate: normalizedTags.map(name => ({
                      where: { name },
                      create: { name },
                    })),
                  },
                },
              });

              result.newArticles++;

              // Generate AI summary with unified format if not present and summarizer available
              if (!article.summary && article.content && summarizer) {
                try {
                  const result = await summarizer.summarizeUnified(
                    article.id,
                    article.title,
                    article.content
                  );
                  
                  await prisma.article.update({
                    where: { id: article.id },
                    data: { 
                      summary: result.summary,
                      detailedSummary: result.detailedSummary,
                      articleType: result.articleType,
                      summaryVersion: result.summaryVersion,
                    },
                  });
                } catch {
                }
              }
            }
          } catch (_error) {
            if (!result.error) {
              result.error = '';
            }
            result.error += `Article error: ${error instanceof Error ? error.message : String(error)}; `;
          }
        }
      } catch (_error) {
        result.success = false;
        result.error = `Source error: ${error instanceof Error ? error.message : String(error)}`;
      }

      results.push(result);
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        summary: {
          totalFetched: results.reduce((sum, r) => sum + r.totalArticles, 0),
          totalCreated: results.reduce((sum, r) => sum + r.newArticles, 0),
          totalErrors: results.filter(r => !r.success).length,
        },
      },
    } as ApiResponse<{ results: CollectResult[]; summary: { totalFetched: number; totalCreated: number; totalErrors: number; } }>);
  } catch {
    return NextResponse.json({
      success: false,
      error: 'Failed to collect feeds',
      details: error instanceof Error ? error.message : undefined,
    } as ApiResponse<never>, { status: 500 });
  }
}

// Allow manual triggering via GET for testing
export async function GET() {
  return POST();
}