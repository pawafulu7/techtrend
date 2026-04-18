/**
 * Candidate Extractor - Layer 1: Embedding Candidate Extraction
 *
 * Handles pgvector similarity search and category centroid retrieval.
 */

import { PrismaClient, Prisma } from '@/lib/prisma-exports';
import { DEFAULT_SCORE_PARAMETERS } from '../types';
import { RedisCache } from '@/lib/cache/redis-cache';
import { logger } from '@/lib/logger';
import { measureAsync, hrtimeDiffMs } from '../tracing';

/** Module-level singleton for centroid cache (TTL: 1 hour) */
const centroidCache = new RedisCache({
  ttl: 3600,
  namespace: 'personalization',
});

/** Legacy default for embedding candidates (kept for API compatibility; not used in threshold mode) */
export const DEFAULT_TOP_K_CANDIDATES = 200;

/** Minimum similarity threshold to include in results (derived from ScoreParameters) */
export const DEFAULT_MIN_SIMILARITY =
  DEFAULT_SCORE_PARAMETERS.minSimilarityThreshold;

/** Safety cap for threshold-based filtering to prevent excessive memory use */
export const DEFAULT_THRESHOLD_RESULT_LIMIT = 5000;

/**
 * HNSW ef_search parameter bounds for pgvector.
 * pgvector's documented valid range is 1..1000; values above 1000 may be
 * rejected depending on the build. Clamp at 1000 to keep SET LOCAL safe.
 */
const HNSW_EF_SEARCH_MIN = 40;
const HNSW_EF_SEARCH_MAX = 1000;

// =============================================================================
// Type Definitions for SQL Results
// =============================================================================

/** Raw embedding candidate from pgvector query */
type RawEmbeddingCandidate = {
  id: string;
  title: string;
  url: string;
  published_at: string;
  created_at: string;
  quality_score: number | null;
  bookmarks: number | null;
  user_votes: number | null;
  source_id: string | null;
  summary: string | null;
  thumbnail_url: string | null;
  sim_emb: number;
};

/** Parsed embedding candidate for scoring */
export type EmbeddingCandidate = {
  id: string;
  title: string;
  url: string;
  publishedAt: Date;
  createdAt: Date;
  qualityScore: number;
  bookmarks: number;
  userVotes: number;
  sourceId: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  embeddingSimilarity: number;
};

/** Article with tag match information */
export type CandidateWithTagMatch = EmbeddingCandidate & {
  hasTagMatch: boolean;
};

/** Category centroid data from DB */
export type CategoryCentroidRow = {
  id: string;
  slug: string;
  centroid_embedding: string | null;
};

/**
 * Get category centroids from database, with Redis cache (TTL: 1 hour).
 *
 * Returns metadata for observability in addition to the centroid rows:
 *   - centroids: The centroid rows
 *   - cacheHit: true if served from Redis cache on the first lookup
 *   - fetchMs: Wall-clock ms from call start to resolution (includes lock wait)
 *   - lockWaitMs: Ms spent waiting in the Redis lock poll loop (0 if cache hit or lock acquired)
 *   - lockTimedOut: true if the Redis lock wait reached maxWaitTime and fell back to direct fetch
 */
export async function getCategoryCentroids(
  db: PrismaClient,
  categoryIds: string[]
): Promise<{
  centroids: CategoryCentroidRow[];
  cacheHit: boolean;
  fetchMs: number;
  lockWaitMs: number;
  lockTimedOut: boolean;
}> {
  const cacheKey = `centroids:${categoryIds.slice().sort().join(',')}`;

  return measureAsync('personalization.centroids', async (span) => {
    const fetchStart = process.hrtime.bigint();
    const meta = await centroidCache.getOrSetWithLockWithMeta<
      CategoryCentroidRow[]
    >(
      cacheKey,
      () =>
        db.$queryRaw<CategoryCentroidRow[]>`
          SELECT
            id,
            slug,
            "centroidEmbedding"::text as centroid_embedding
          FROM "InterestCategory"
          WHERE id = ANY(${categoryIds}::text[])
            AND "centroidEmbedding" IS NOT NULL
        `
    );
    const fetchMs = hrtimeDiffMs(fetchStart);

    span.setAttributes({
      cacheHit: meta.cacheHit,
      fetchMs,
      lockWaitMs: meta.waitedMs,
      lockTimedOut: meta.timedOut,
    });

    return {
      centroids: meta.value,
      cacheHit: meta.cacheHit,
      fetchMs,
      lockWaitMs: meta.waitedMs,
      lockTimedOut: meta.timedOut,
    };
  });
}

/**
 * Get embedding candidates using threshold-based similarity search.
 * Returns all articles that meet the similarity threshold up to a safety cap
 * to avoid unbounded memory usage.
 */
export async function getEmbeddingCandidates(
  db: PrismaClient,
  centroid: string,
  periodMonths: number,
  topK: number,
  excludeSourceIds?: string[]
): Promise<EmbeddingCandidate[]> {
  // Build period filter using calculated date parameter
  const cutoffDate =
    periodMonths > 0
      ? new Date(Date.now() - periodMonths * 30 * 24 * 60 * 60 * 1000)
      : null;
  const periodFilter = cutoffDate
    ? Prisma.sql`AND a."publishedAt" >= ${cutoffDate}`
    : Prisma.empty;

  // Build source exclusion filter
  const sourceExcludeFilter =
    excludeSourceIds && excludeSourceIds.length > 0
      ? Prisma.sql`AND a."sourceId" != ALL(${excludeSourceIds}::text[])`
      : Prisma.empty;

  // Apply guard rail: limit topK to safety cap
  const effectiveLimit = Math.min(topK, DEFAULT_THRESHOLD_RESULT_LIMIT);

  // Stage 1: Pure kNN query on partial HNSW index (no JOINs, no extra filters)
  // The partial index on embeddingKey = 'summary' enables HNSW usage here.
  // hnsw.ef_search must be >= LIMIT or the HNSW search returns at most ef_search rows
  // (default 40), causing topK to be silently capped regardless of the requested value.
  type Stage1Row = { articleId: string; sim_emb: number };
  const efSearch = Math.min(
    Math.max(Math.floor(effectiveLimit), HNSW_EF_SEARCH_MIN),
    HNSW_EF_SEARCH_MAX
  );
  const stage1Results = await measureAsync(
    'personalization.stage1_knn',
    async (span) => {
      let rows: Stage1Row[];
      let efSearchApplied = true;
      try {
        rows = await db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = ${efSearch}`);
          return tx.$queryRaw<Stage1Row[]>`
            SELECT "articleId", 1 - (embedding <=> ${centroid}::vector) AS sim_emb
            FROM "ArticleEmbedding"
            WHERE "embeddingKey" = 'summary'::"EmbeddingKey"
            ORDER BY embedding <=> ${centroid}::vector
            LIMIT ${effectiveLimit}
          `;
        });
      } catch (err) {
        // Fallback: ef_search SET may fail on some pgvector builds or if the
        // connection rejects the parameter. Retry without SET LOCAL so the
        // request still returns results, at the cost of reduced recall.
        logger.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            efSearch,
          },
          'Stage1 SET LOCAL hnsw.ef_search failed; falling back to default ef_search'
        );
        efSearchApplied = false;
        rows = await db.$queryRaw<Stage1Row[]>`
          SELECT "articleId", 1 - (embedding <=> ${centroid}::vector) AS sim_emb
          FROM "ArticleEmbedding"
          WHERE "embeddingKey" = 'summary'::"EmbeddingKey"
          ORDER BY embedding <=> ${centroid}::vector
          LIMIT ${effectiveLimit}
        `;
      }
      span.setAttributes({
        effectiveLimit,
        efSearch,
        efSearchApplied,
        stage1ResultCount: rows.length,
      });
      return rows;
    }
  );

  if (stage1Results.length === 0) {
    return [];
  }

  // Stage 2: Data fetch + filtering using Stage 1 results via VALUES clause
  const valuesClause = Prisma.join(
    stage1Results.map(
      (r) => Prisma.sql`(${r.articleId}::text, ${r.sim_emb}::float8)`
    ),
    ','
  );

  const mapped = await measureAsync(
    'personalization.stage2_fetch',
    async (span) => {
      const result = await db.$queryRaw<RawEmbeddingCandidate[]>`
        SELECT
          a.id,
          a.title,
          a.url,
          a."publishedAt" as published_at,
          a."createdAt" as created_at,
          a."qualityScore" as quality_score,
          a."bookmarks" as bookmarks,
          a."userVotes" as user_votes,
          a."sourceId" as source_id,
          a.summary,
          a.thumbnail as thumbnail_url,
          s1.sim_emb
        FROM (VALUES ${valuesClause}) AS s1("articleId", sim_emb)
        INNER JOIN "Article" a ON a.id = s1."articleId"
        WHERE a."summaryComputedAt" IS NOT NULL
          AND a."isHidden" = false
          ${periodFilter}
          ${sourceExcludeFilter}
          AND s1.sim_emb >= ${DEFAULT_MIN_SIMILARITY}
      `;

      const rows = result.map((row) => ({
        id: row.id,
        title: row.title,
        url: row.url,
        publishedAt: new Date(row.published_at),
        createdAt: new Date(row.created_at),
        qualityScore: row.quality_score ?? 0,
        bookmarks: row.bookmarks ?? 0,
        userVotes: row.user_votes ?? 0,
        sourceId: row.source_id,
        summary: row.summary,
        thumbnailUrl: row.thumbnail_url,
        embeddingSimilarity: row.sim_emb,
      }));

      span.setAttribute('stage2ResultCount', rows.length);
      return rows;
    }
  );

  // Monitor for potential recall issues after topK reduction
  if (mapped.length < 10 && effectiveLimit >= 50) {
    logger.warn(
      { candidateCount: mapped.length, effectiveLimit },
      'Low candidate count relative to topK limit — potential recall issue'
    );
  }

  return mapped;
}

/**
 * Check which candidates have tag matches with the selected categories.
 */
export async function checkTagMatches(
  db: PrismaClient,
  candidates: EmbeddingCandidate[],
  categoryIds: string[]
): Promise<CandidateWithTagMatch[]> {
  if (candidates.length === 0) {
    return [];
  }

  return measureAsync('personalization.tag_match', async (span) => {
    span.setAttribute('candidateCount', candidates.length);

    const articleIds = candidates.map((c) => c.id);

    const matchingArticles = await db.$queryRaw<{ article_id: string }[]>`
        SELECT DISTINCT at."A" as article_id
        FROM "_ArticleToTag" at
        INNER JOIN "TagCategoryMapping" tcm ON at."B" = tcm."tagId"
        WHERE at."A" = ANY(${articleIds}::text[])
          AND tcm."categoryId" = ANY(${categoryIds}::text[])
      `;

    const matchingSet = new Set(matchingArticles.map((r) => r.article_id));
    const result = candidates.map((c) => ({
      ...c,
      hasTagMatch: matchingSet.has(c.id),
    }));

    span.setAttribute('matchedCount', matchingSet.size);
    return result;
  });
}
