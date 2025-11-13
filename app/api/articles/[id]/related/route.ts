import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { articleDetailCache } from '@/lib/cache/article-detail-cache';
import { VectorSearchService, SearchResult } from '@/lib/rag/vector-search-service';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';

const relatedArticlesQuerySchema = z.object({
  algorithm: z.enum(['tag', 'embedding', 'auto']).default('auto'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20),
});

type RelatedArticlesQuery = z.infer<typeof relatedArticlesQuerySchema>;
type ArticleWithRelations = NonNullable<Awaited<ReturnType<typeof articleDetailCache.getArticleWithRelations>>>;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: articleId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const rawQuery = {
      algorithm: searchParams.get('algorithm') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
    };

    const parseResult = relatedArticlesQuerySchema.safeParse(rawQuery);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: parseResult.error.issues.map(issue => ({
            path: issue.path.join('.') || 'unknown',
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const query: RelatedArticlesQuery = parseResult.data;
    const limit = query.limit;

    const targetArticle = await articleDetailCache.getArticleWithRelations(articleId);

    if (!targetArticle) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const shouldTryEmbedding = query.algorithm === 'embedding' || query.algorithm === 'auto';

    if (shouldTryEmbedding) {
      const vectorSearch = new VectorSearchService(prisma);

      if (vectorSearch.isEmbeddingServiceAvailable()) {
        try {
          const startTime = Date.now();
          const results = await vectorSearch.searchByArticleId(articleId, {
            topK: limit,
            similarityThreshold: 0.5,
          });

          logger.info({
            articleId,
            algorithm: 'embedding',
            resultCount: results.length,
            elapsedMs: Date.now() - startTime,
            limit,
          }, 'Related articles fetched (embedding-based)');

          if (results.length > 0) {
            const articles = mapSearchResultToRelatedArticle(results, targetArticle);

            return NextResponse.json({
              articles,
              metadata: {
                algorithm: 'embedding' as const,
                timestamp: new Date().toISOString(),
              },
            });
          }
        } catch (error) {
          logger.warn({
            articleId,
            algorithm: query.algorithm,
            error: sanitizeError(error),
          }, 'Embedding search failed for related articles');

          if (query.algorithm === 'embedding') {
            return NextResponse.json({
              articles: [],
              metadata: {
                algorithm: 'embedding' as const,
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      } else {
        logger.warn({
          articleId,
          algorithm: query.algorithm,
        }, 'EmbeddingService unavailable for related articles');

        if (query.algorithm === 'embedding') {
          return NextResponse.json({
            articles: [],
            metadata: {
              algorithm: 'embedding' as const,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      if (query.algorithm === 'embedding') {
        return NextResponse.json({
          articles: [],
          metadata: {
            algorithm: 'embedding' as const,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // Tag-based processing (explicit or fallback)
    const tagIds = targetArticle.tags.map(tag => tag.id);

    if (tagIds.length === 0) {
      return NextResponse.json({
        articles: [],
        metadata: {
          algorithm: 'tag' as const,
          source: query.algorithm === 'auto' ? 'tag_fallback' : undefined,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const relatedArticlesRaw = await articleDetailCache.getRelatedArticles(articleId, tagIds);
    const targetTagSet = new Set(tagIds);

    const relatedArticles = relatedArticlesRaw
      .map(article => {
        const articleTags = parseTags(article.tags as string | null);
        const articleTagIds = new Set(articleTags.map(t => t.id));
        const commonTags = countCommonTags(targetTagSet, articleTagIds);
        const unionSize = new Set([...targetTagSet, ...articleTagIds]).size;
        const similarity = unionSize > 0 ? commonTags / unionSize : 0;

        return {
          id: article.id,
          title: article.title,
          summary: article.summary || '',
          url: article.url,
          source: article.sourceName,
          publishedAt: article.publishedAt.toISOString(),
          qualityScore: article.qualityScore,
          difficulty: null,  // CodeRabbit: Consistent with embedding-based results
          tags: articleTags,
          similarity: Math.round(similarity * 100) / 100,
          commonTags,
        };
      })
      .sort((a, b) => {
        if (b.commonTags !== a.commonTags) {
          return b.commonTags - a.commonTags;
        }
        return b.similarity - a.similarity;
      })
      .slice(0, limit);

    logger.info({
      articleId,
      algorithm: 'tag',
      resultCount: relatedArticles.length,
      source: query.algorithm === 'auto' ? 'tag_fallback' : 'explicit',
      limit,
    }, 'Related articles fetched (tag-based)');

    return NextResponse.json({
      articles: relatedArticles,
      metadata: {
        algorithm: 'tag' as const,
        source: query.algorithm === 'auto' ? 'tag_fallback' : undefined,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({
      error: sanitizeError(error),
    }, 'Failed to fetch related articles');

    return NextResponse.json(
      { error: 'Failed to fetch related articles' },
      { status: 500 }
    );
  }
}

function mapSearchResultToRelatedArticle(
  results: SearchResult[],
  targetArticle: ArticleWithRelations
) {
  const targetTagIds = new Set(targetArticle.tags.map(tag => tag.id));

  return results.map(result => {
    const resultTags = result.tags ?? [];
    const resultTagIds = new Set(resultTags.map(tag => tag.id));

    return {
      id: result.articleId,
      title: result.title,
      summary: result.summary ?? '',
      url: `/articles/${result.articleId}`,
      source: result.sourceName || '',
      publishedAt: result.publishedAt.toISOString(),
      qualityScore: result.qualityScore ?? 0,
      difficulty: null,
      tags: resultTags,
      similarity: Math.round(result.similarity * 100) / 100,
      commonTags: countCommonTags(targetTagIds, resultTagIds),
    };
  });
}

function countCommonTags(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const id of b) {
    if (a.has(id)) {
      count += 1;
    }
  }
  return count;
}

function parseTags(tagsString: string | null): Array<{ id: string; name: string }> {
  if (!tagsString) {
    return [];
  }

  return tagsString
    .split('||')
    .map(tag => tag?.trim())
    .filter(tag => tag && tag.includes('::'))
    .map(tag => {
      const [idRaw, nameRaw] = tag.split('::', 2);
      const id = idRaw?.trim();
      const name = nameRaw?.trim();
      return { id, name };
    })
    .filter(tag => tag.id && tag.name);  // CodeRabbit: Filter out empty id/name
}
