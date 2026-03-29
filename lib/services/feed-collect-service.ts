import { prisma } from '@/lib/prisma';
import { createFetcher } from '@/lib/fetchers';
import { ArticleSummarizer } from '@/lib/ai';
import { normalizeTagInput } from '@/lib/utils/tag/tag-normalizer';
import type { CollectResult } from '@/types/api';
import logger from '@/lib/logger';
import { env } from '@/lib/config/env';

export async function collectFeeds(): Promise<{
  results: CollectResult[];
  summary: { totalFetched: number; totalCreated: number; totalErrors: number };
}> {
  const results: CollectResult[] = [];

  // Get all enabled sources
  const sources = await prisma.source.findMany({
    where: { enabled: true },
  });

  // Initialize AI summarizer
  const apiKey = env.GEMINI_API_KEY;
  const summarizer = apiKey ? new ArticleSummarizer(apiKey) : null;

  for (const source of sources) {
    const collectResult: CollectResult = {
      source: source.name,
      success: true,
      newArticles: 0,
      totalArticles: 0,
    };

    try {
      // Create fetcher for source
      const fetcher = createFetcher(source);
      const { articles, errors } = await fetcher.fetch();

      collectResult.totalArticles = articles.length;
      if (errors.length > 0) {
        collectResult.success = false;
        collectResult.error = errors.map((e) => e.message).join(', ');
      }

      // Deduplicate fetched articles by URL
      const seenFetchedURLs = new Set<string>();
      const uniqueArticles = articles.filter((article) => {
        if (seenFetchedURLs.has(article.url)) return false;
        seenFetchedURLs.add(article.url);
        return true;
      });

      // Batch check for existing articles (N+1 optimization)
      const articleURLs = uniqueArticles.map((a) => a.url);
      const existingArticles = await prisma.article.findMany({
        where: { url: { in: articleURLs } },
        select: { url: true },
      });
      const existingURLSet = new Set(existingArticles.map((a) => a.url));

      // Filter to only new articles
      const newArticles = uniqueArticles.filter(
        (a) => !existingURLSet.has(a.url)
      );

      // Process only new articles
      for (const articleData of newArticles) {
        try {
          // タグを正規化
          // Note: articleData is CreateArticleInput with tagNames property
          // The RSS categories have already been converted to tagNames in the fetcher layer
          const tagNames = articleData.tagNames ?? articleData.tags ?? [];
          const normalizedTags = normalizeTagInput(tagNames);

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
                connectOrCreate: normalizedTags.map((name) => ({
                  where: { name },
                  create: { name },
                })),
              },
            },
          });

          collectResult.newArticles++;

          // Generate AI summary with unified format if not present and summarizer available
          if (!article.summary && article.content && summarizer) {
            try {
              const summaryResult = await summarizer.summarizeUnified(
                article.id,
                article.title,
                article.content
              );

              await prisma.article.update({
                where: { id: article.id },
                data: {
                  summary: summaryResult.summary,
                  detailedSummary: summaryResult.detailedSummary,
                  articleType: summaryResult.articleType,
                  summaryVersion: summaryResult.summaryVersion,
                },
              });
            } catch (error) {
              logger.error(
                { articleId: article.id, error },
                'Failed to generate AI summary for article'
              );
            }
          }
        } catch (error) {
          collectResult.success = false;
          logger.error(
            { source: source.name, url: articleData.url, error },
            'Failed to process article'
          );
          if (!collectResult.error) {
            collectResult.error = '';
          }
          collectResult.error += `Article error: ${error instanceof Error ? error.message : String(error)}; `;
        }
      }
    } catch (error) {
      logger.error({ source: source.name, error }, 'Failed to collect source');
      collectResult.success = false;
      collectResult.error = `Source error: ${error instanceof Error ? error.message : String(error)}`;
    }

    results.push(collectResult);
  }

  return {
    results,
    summary: {
      totalFetched: results.reduce((sum, r) => sum + r.totalArticles, 0),
      totalCreated: results.reduce((sum, r) => sum + r.newArticles, 0),
      totalErrors: results.filter((r) => !r.success).length,
    },
  };
}
