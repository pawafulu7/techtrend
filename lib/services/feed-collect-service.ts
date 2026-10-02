import { prisma } from '@/lib/prisma';
import { createFetcher } from '@/lib/fetchers';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { validateArticleContent } from '@/lib/services/summary/summary-orchestrator';
import { normalizeTagInput } from '@/lib/utils/tag/tag-normalizer';
import type { CollectResult } from '@/types/api';
import logger from '@/lib/logger';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
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

  // 要約は定期実行と同じ DI の要約サービスで生成する
  const summaryService = env.GEMINI_API_KEY
    ? getAppDependencies().service
    : null;

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

          // Generate AI summary if not present and the summary service is available.
          // 本文の基準（空・短すぎる）は定期実行の要約生成と同じものを使う
          const validation = validateArticleContent(article);
          if (!article.summary && validation.valid && summaryService) {
            try {
              const summaryResult = await summaryService.generateSummary({
                title: article.title,
                content: validation.content,
                qualityThreshold: 40,
                articleId: article.id,
              });

              await prisma.article.update({
                where: { id: article.id },
                // 定期実行（summary-orchestrator）と同じく翻訳タイトルと生成時刻も保存する。
                // summary が入った記事は定期実行の対象（summary が空）から外れるため、
                // ここで保存しないと後から埋まらない
                data: {
                  summary: summaryResult.summary,
                  detailedSummary: summaryResult.detailedSummary,
                  translatedTitle: summaryResult.translatedTitle,
                  articleType: 'unified',
                  summaryVersion: summaryResult.summaryVersion,
                  summaryComputedAt: new Date(),
                },
              });

              // 作成から要約保存までの間に要約なしでキャッシュされた記事を消す
              try {
                await cacheInvalidator.onArticleUpdated(article.id, {
                  summary: summaryResult.summary,
                  detailedSummary: summaryResult.detailedSummary,
                });
              } catch (cacheError) {
                logger.warn(
                  { articleId: article.id, err: cacheError },
                  'Cache invalidation failed, continuing'
                );
              }
            } catch (error) {
              logger.error(
                { articleId: article.id, err: error },
                'Failed to generate AI summary for article'
              );
            }
          }
        } catch (error) {
          collectResult.success = false;
          logger.error(
            { source: source.name, url: articleData.url, err: error },
            'Failed to process article'
          );
          if (!collectResult.error) {
            collectResult.error = '';
          }
          collectResult.error += `Article error: ${error instanceof Error ? error.message : String(error)}; `;
        }
      }
    } catch (error) {
      logger.error(
        { source: source.name, err: error },
        'Failed to collect source'
      );
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
