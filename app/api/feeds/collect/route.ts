import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { createFetcher } from '@/lib/fetchers';
import { ArticleSummarizer } from '@/lib/ai';
import { normalizeTagInput, isValidTagArray } from '@/lib/utils/tag-normalizer';
import type { ApiResponse, CollectResult } from '@/types/api';

export async function POST(request: NextRequest) {
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
        fetched: 0,
        created: 0,
        errors: [],
      };

      try {
        // Create fetcher for source
        const fetcher = createFetcher(source);
        const { articles, errors } = await fetcher.fetch();
        
        result.fetched = articles.length;
        result.errors = errors.map(e => e.message);

        // Process articles
        for (const articleData of articles) {
          try {
            // Check if article already exists
            const existing = await prisma.article.findUnique({
              where: { url: articleData.url },
            });

            if (!existing) {
              // タグを正規化してバリデーション
              const normalizedTags = normalizeTagInput(articleData.tagNames);
              
              // デバッグ: 不正なタグが検出された場合は警告
              if (process.env.NODE_ENV !== 'production' && articleData.tagNames) {
                if (!isValidTagArray(articleData.tagNames) && Array.isArray(articleData.tagNames)) {
                  console.warn(`[Feeds API] Non-string tags detected from ${source.name}:`, articleData.tagNames);
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

              result.created++;

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
                } catch (error) {
                  console.error(`Failed to generate summary for article ${article.id}:`, error);
                }
              }
            }
          } catch (error) {
            result.errors.push(`Article error: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } catch (error) {
        result.errors.push(`Source error: ${error instanceof Error ? error.message : String(error)}`);
      }

      results.push(result);
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        summary: {
          totalFetched: results.reduce((sum, r) => sum + r.fetched, 0),
          totalCreated: results.reduce((sum, r) => sum + r.created, 0),
          totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
        },
      },
    } as ApiResponse<{ results: CollectResult[]; summary: { totalFetched: number; totalCreated: number; totalErrors: number; } }>);
  } catch (error) {
    console.error('Error collecting feeds:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to collect feeds',
      details: error instanceof Error ? error.message : undefined,
    } as ApiResponse<never>, { status: 500 });
  }
}

// Allow manual triggering via GET for testing
export async function GET(request: NextRequest) {
  return POST(request);
}