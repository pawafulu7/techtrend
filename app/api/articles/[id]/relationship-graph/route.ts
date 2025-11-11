import { NextRequest, NextResponse } from 'next/server';
import { articleDetailCache } from '@/lib/cache/article-detail-cache';
import { GraphDataSerializer } from '@/lib/graph/graph-data-serializer';
import { graphOptionsSchema } from '@/lib/types/graph';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { logger, sanitizeError } from '@/lib/logger';

/**
 * Article Relationship Graph API
 *
 * GET /api/articles/[id]/relationship-graph
 *
 * Returns graph visualization data for article relationships.
 *
 * Phase 1: Tag-based relationships only
 * Phase 2: Embedding-based relationships
 * Phase 3: Hybrid relationships
 *
 * CodexMCP recommendations:
 * - Server-side GraphData transformation (security, performance)
 * - Clamp maxNodes to prevent unbounded payloads
 * - Field filtering (no sensitive data)
 * - Phase-specific monitoring
 *
 * @see Plan: .claude/docs/plan/plan_20251111_233131_021_article-relationship-graph.md
 */

const tracer = trace.getTracer('relationship-graph');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return tracer.startActiveSpan('relationship-graph-api', async (span) => {
    const startTime = Date.now();

    try {
      const { id: articleId } = await params;

      span.setAttribute('articleId', articleId);

      // Parse and validate query parameters
      const searchParams = request.nextUrl.searchParams;
      const rawOptions = {
        algorithm: searchParams.get('algorithm') || 'tag',
        maxNodes: searchParams.get('maxNodes') ? parseInt(searchParams.get('maxNodes')!, 10) : 20,
        minSimilarity: searchParams.get('minSimilarity')
          ? parseFloat(searchParams.get('minSimilarity')!)
          : 0.3,
        depth: searchParams.get('depth') ? parseInt(searchParams.get('depth')!, 10) : 1,
      };

      // Zod validation (CodexMCP: enforce safe ranges)
      const options = graphOptionsSchema.parse(rawOptions);

      span.setAttribute('algorithm', options.algorithm);
      span.setAttribute('maxNodes', options.maxNodes);
      span.setAttribute('minSimilarity', options.minSimilarity);

      // Phase 1: Only tag-based algorithm is supported
      if (options.algorithm !== 'tag') {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'Only tag algorithm supported in Phase 1',
        });
        span.end();

        return NextResponse.json(
          {
            error: 'Only tag-based algorithm is supported in Phase 1',
            supportedAlgorithms: ['tag'],
          },
          { status: 400 }
        );
      }

      // Get target article with relations (uses cache)
      const targetArticle = await articleDetailCache.getArticleWithRelations(articleId);

      if (!targetArticle) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'Article not found',
        });
        span.end();

        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
      }

      // Early return if article has no tags
      if (targetArticle.tags.length === 0) {
        const emptyGraphData = {
          nodes: [
            {
              id: targetArticle.id,
              label: targetArticle.title,
              val: targetArticle.qualityScore,
              color: '#6B7280',
              category: 'Other',
              publishedAt: targetArticle.publishedAt.toISOString(),
              url: `/articles/${targetArticle.id}`,
            },
          ],
          links: [],
          metadata: {
            centerArticleId: targetArticle.id,
            algorithm: 'tag' as const,
            nodeCount: 1,
            linkCount: 0,
            timestamp: new Date().toISOString(),
            options,
            resultStats: {
              maxSimilarity: 0,
              minSimilarity: 0,
              avgSimilarity: 0,
              categoryCounts: { Other: 1 },
            },
          },
        };

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();

        return NextResponse.json(emptyGraphData);
      }

      // Get tag IDs
      const tagIds = targetArticle.tags.map(tag => tag.id);

      // Fetch related articles (tag-based, uses cache)
      const relatedArticlesRaw = await articleDetailCache.getRelatedArticles(articleId, tagIds);

      // Helper: Parse tags from concatenated string
      const parseTags = (tagsString: string | null): Array<{ id: string; name: string }> => {
        if (!tagsString) return [];

        return tagsString
          .split('||')
          .filter(tag => tag && tag.includes('::'))
          .map(tag => {
            const [id, name] = tag.split('::', 2);
            return { id, name };
          });
      };

      // Calculate Jaccard similarity for each related article
      const targetTagSet = new Set(tagIds);

      const relatedArticlesWithSimilarity = relatedArticlesRaw.map(article => {
        const articleTags = parseTags(article.tags as string | null);
        const articleTagIds = new Set(articleTags.map(t => t.id));
        const intersection = new Set([...targetTagSet].filter(x => articleTagIds.has(x)));
        const union = new Set([...targetTagSet, ...articleTagIds]);
        const similarity = union.size > 0 ? intersection.size / union.size : 0;

        return {
          id: article.id,
          title: article.title,
          summary: article.summary || '',
          url: article.url,
          sourceName: article.sourceName as string,
          publishedAt: article.publishedAt,
          qualityScore: article.qualityScore,
          tags: articleTags,
          similarity: Math.round(similarity * 100) / 100,
          commonTags: Number(article.commonTags),
          thumbnail: (article as any).thumbnail || undefined,
        };
      });

      // Sort by similarity desc (CodexMCP: best results first)
      const sortedArticles = relatedArticlesWithSimilarity
        .sort((a, b) => b.similarity - a.similarity)
        .filter(a => a.similarity >= options.minSimilarity)
        .slice(0, options.maxNodes);

      // Serialize to GraphData format (CodexMCP: server-side transformation)
      const graphData = GraphDataSerializer.serializeTagBased(targetArticle, sortedArticles);

      const elapsedMs = Date.now() - startTime;

      logger.info({
        articleId,
        algorithm: options.algorithm,
        nodeCount: graphData.nodes.length,
        linkCount: graphData.links.length,
        elapsedMs,
      }, 'Relationship graph generated');

      span.setAttribute('nodeCount', graphData.nodes.length);
      span.setAttribute('linkCount', graphData.links.length);
      span.setAttribute('elapsedMs', elapsedMs);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return NextResponse.json(graphData);

    } catch (error) {
      const elapsedMs = Date.now() - startTime;

      span.recordException(error as Error);
      span.setAttribute('elapsedMs', elapsedMs);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.end();

      logger.error({
        error: sanitizeError(error),
      }, 'Relationship graph generation failed');

      return NextResponse.json(
        { error: 'Failed to generate relationship graph' },
        { status: 500 }
      );
    }
  });
}
