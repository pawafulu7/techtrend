/**
 * Candidate Extractor - Layer 1: Embedding Candidate Extraction
 *
 * Handles pgvector similarity search and category centroid retrieval.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { DEFAULT_SCORE_PARAMETERS } from '../types';

/** Legacy default for embedding candidates (kept for API compatibility; not used in threshold mode) */
export const DEFAULT_TOP_K_CANDIDATES = 1000;

/** Minimum similarity threshold to include in results (derived from ScoreParameters) */
export const DEFAULT_MIN_SIMILARITY =
  DEFAULT_SCORE_PARAMETERS.minSimilarityThreshold;

/** Safety cap for threshold-based filtering to prevent excessive memory use */
export const DEFAULT_THRESHOLD_RESULT_LIMIT = 5000;

// =============================================================================
// Type Definitions for SQL Results
// =============================================================================

/** Raw embedding candidate from pgvector query */
type RawEmbeddingCandidate = {
  id: string;
  title: string;
  url: string;
  published_at: Date;
  created_at: Date;
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
 * Get category centroids from database.
 */
export async function getCategoryCentroids(
  db: PrismaClient,
  categoryIds: string[]
): Promise<CategoryCentroidRow[]> {
  const result = await db.$queryRaw<CategoryCentroidRow[]>`
    SELECT
      id,
      slug,
      "centroidEmbedding"::text as centroid_embedding
    FROM "InterestCategory"
    WHERE id = ANY(${categoryIds}::text[])
      AND "centroidEmbedding" IS NOT NULL
  `;

  return result;
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

  // Use threshold-based filtering with topK limit
  const maxDistance = 1 - DEFAULT_MIN_SIMILARITY;

  // Apply guard rail: limit topK to safety cap
  const effectiveLimit = Math.min(topK, DEFAULT_THRESHOLD_RESULT_LIMIT);

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
      1 - (ae.embedding <=> ${centroid}::vector) AS sim_emb
    FROM "Article" a
    INNER JOIN "ArticleEmbedding" ae ON a.id = ae."articleId"
    WHERE ae."embeddingKey" = 'summary'::"EmbeddingKey"
      AND a."summaryComputedAt" IS NOT NULL
      AND a."isHidden" = false
      AND (ae.embedding <=> ${centroid}::vector) < ${maxDistance}
      ${periodFilter}
      ${sourceExcludeFilter}
    ORDER BY ae.embedding <=> ${centroid}::vector
    LIMIT ${effectiveLimit}
  `;

  return result.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    qualityScore: row.quality_score ?? 0,
    bookmarks: row.bookmarks ?? 0,
    userVotes: row.user_votes ?? 0,
    sourceId: row.source_id,
    summary: row.summary,
    thumbnailUrl: row.thumbnail_url,
    embeddingSimilarity: row.sim_emb,
  }));
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

  const articleIds = candidates.map((c) => c.id);

  const matchingArticles = await db.$queryRaw<{ article_id: string }[]>`
    SELECT DISTINCT at."A" as article_id
    FROM "_ArticleToTag" at
    INNER JOIN "TagCategoryMapping" tcm ON at."B" = tcm."tagId"
    WHERE at."A" = ANY(${articleIds}::text[])
      AND tcm."categoryId" = ANY(${categoryIds}::text[])
  `;

  const matchingSet = new Set(matchingArticles.map((r) => r.article_id));

  return candidates.map((c) => ({
    ...c,
    hasTagMatch: matchingSet.has(c.id),
  }));
}
