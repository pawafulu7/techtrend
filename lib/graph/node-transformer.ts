import type { GraphNode } from '@/lib/types/graph';
import type { Article } from '@prisma/client';
import { logger } from '@/lib/logger';
import type { GraphNodeInput } from './graph-node-input';
import {
  GRAPH_CONSTANTS,
  getCategory,
  getCategoryColor,
  toISOString,
} from './graph-utils';

/**
 * Normalize Article to GraphNodeInput
 *
 * CodexMCP: Conversion layer for full Article objects
 */
export function toGraphNodeInput(
  article: Article & { tags?: Array<{ id: string; name: string }> }
): GraphNodeInput {
  return {
    id: article.id,
    title: article.title,
    translatedTitle: article.translatedTitle ?? null,
    tags: article.tags || [],
    url: article.url,
    qualityScore: article.qualityScore,
    publishedAt: article.publishedAt,
    summary: article.summary || undefined,
    thumbnail: article.thumbnail || undefined,
  };
}

/**
 * Convert GraphNodeInput to GraphNode
 *
 * CodexMCP: Unified conversion logic for center and related articles
 */
export function toGraphNode(
  input: GraphNodeInput,
  isCenter: boolean
): GraphNode {
  // CodexMCP: Throw early if required fields missing
  if (!input.id || !input.title) {
    throw new Error(
      `Missing required fields: id=${input.id}, title=${input.title}`
    );
  }

  // Phase 2: Use pre-computed category or calculate
  const category = input.category ?? getCategory(input.tags || []);
  const baseColor = getCategoryColor(category);

  // CodexMCP Phase 2: Adjust color brightness by similarity
  const color = isCenter
    ? '#FBBF24'
    : adjustColorForSimilarity(baseColor, input.similarity);

  // CodexMCP Phase 2: Clamp qualityScore to minimum baseline
  const qualityScore = Math.max(
    input.qualityScore ?? 0,
    GRAPH_CONSTANTS.MIN_QUALITY_SCORE
  );

  // CodexMCP Phase 2: Hybrid node size (quality * similarity)
  let val: number;
  if (isCenter) {
    val = qualityScore * GRAPH_CONSTANTS.CENTER_NODE_SCALE; // Center: enhanced visibility (larger than related nodes)
  } else if (input.similarity) {
    // Related: hybrid (quality * similarity * factor)
    const hybridSize =
      input.similarity * qualityScore * GRAPH_CONSTANTS.RELATED_NODE_SCALE;
    val = Math.min(
      Math.max(hybridSize, GRAPH_CONSTANTS.MIN_NODE_SIZE),
      GRAPH_CONSTANTS.MAX_NODE_SIZE
    ); // Clamp to 30-140
  } else {
    // Fallback: quality-based
    val = qualityScore;
  }

  const displayTitle = input.translatedTitle ?? input.title;

  return {
    id: input.id,
    label: isCenter ? `[中心] ${displayTitle}` : displayTitle, // CodexMCP: Badge for center node
    val, // CodexMCP Phase 2: Hybrid size (quality * similarity)
    color, // CodexMCP: Similarity-adjusted color
    category,
    publishedAt: toISOString(input.publishedAt),
    url: input.url || `/articles/${input.id}`,
    summary: input.summary,
    thumbnail: input.thumbnail,
    sourceName: input.sourceName,
    primaryTag: input.tags?.[0]?.name,
  };
}

/**
 * Count common tags between two tag lists (Phase 2)
 *
 * @param tags1 - First tag list (tag names)
 * @param tags2 - Second tag list (tag names)
 * @returns Number of common tags
 */
export function countCommonTags(tags1: string[], tags2: string[]): number {
  const set1 = new Set(tags1);
  const set2 = new Set(tags2);
  return [...set1].filter((t) => set2.has(t)).length;
}

/**
 * Adjust color brightness based on similarity (Phase 2)
 *
 * CodexMCP: Hybrid - category (hue) + similarity (lightness)
 */
export function adjustColorForSimilarity(
  baseColor: string,
  similarity?: number
): string {
  if (!similarity) return baseColor;

  // Validate hex format (CodeRabbit: prevent parseInt issues)
  if (!/^#[0-9A-Fa-f]{6}$/.test(baseColor)) {
    logger.warn({ baseColor }, 'Invalid color format, using as-is');
    return baseColor;
  }

  const r = parseInt(baseColor.slice(1, 3), 16);
  const g = parseInt(baseColor.slice(3, 5), 16);
  const b = parseInt(baseColor.slice(5, 7), 16);

  // Brightness factor: [0.7, 1.3] for similarity [0, 1]
  const factor =
    GRAPH_CONSTANTS.MIN_BRIGHTNESS_FACTOR +
    similarity * GRAPH_CONSTANTS.BRIGHTNESS_RANGE;

  const rAdj = Math.max(0, Math.min(Math.round(r * factor), 255));
  const gAdj = Math.max(0, Math.min(Math.round(g * factor), 255));
  const bAdj = Math.max(0, Math.min(Math.round(b * factor), 255));

  return `#${rAdj.toString(16).padStart(2, '0')}${gAdj.toString(16).padStart(2, '0')}${bAdj.toString(16).padStart(2, '0')}`;
}
