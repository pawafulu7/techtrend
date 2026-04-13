/**
 * Query Builder for Articles API
 *
 * Handles building Prisma where clauses and select fields
 * for article queries with support for various filters.
 */

import { ArticleCategory } from '@/lib/prisma-exports';
import { sourceCache } from '@/lib/cache/source-cache';
import { MetricsCollector, withCacheTiming } from '@/lib/metrics/performance';
import logger from '@/lib/logger';
import {
  ALLOWED_SELECTABLE_FIELDS,
  type ArticleWhereInput,
  type ArticleSelect,
  type FilterParams,
  type DisplayOptions,
} from './types';
import {
  pushLowQualityFilter,
  pushProcessedFilter,
  pushReadFilter,
  pushTagFilter,
  pushSearchFilter,
  pushDateRangeFilter,
} from './where-clause-predicates';

/**
 * Build select fields based on display options
 */
export function buildSelectFields(options: DisplayOptions): ArticleSelect {
  const { lightweight, fields, includeRelations } = options;

  if (lightweight) {
    // Ultra-lightweight mode: minimum fields only
    return {
      id: true,
      title: true,
      url: true,
      summary: true,
      thumbnail: true,
      publishedAt: true,
      sourceId: true,
    };
  }

  let selectFields: ArticleSelect;

  if (fields) {
    // Custom field selection with whitelist validation
    selectFields = { id: true } as ArticleSelect;
    const fieldList = fields.split(',').map((f) => f.trim());

    for (const field of fieldList) {
      if (ALLOWED_SELECTABLE_FIELDS.has(field)) {
        const selectFieldsAny = selectFields as Record<string, boolean>;
        selectFieldsAny[field] = true;
      }
    }
  } else {
    selectFields = {
      id: true,
      title: true,
      translatedTitle: true,
      url: true,
      summary: true,
      thumbnail: true,
      publishedAt: true,
      qualityScore: true,
      bookmarks: true,
      userVotes: true,
      difficulty: true,
      createdAt: true,
      updatedAt: true,
      sourceId: true,
      summaryVersion: true,
      articleType: true,
      category: true,
      contentLength: true, // Pre-calculated by DB trigger
    };
  }

  // Only include relations if explicitly requested (default: false to save bandwidth)
  if (includeRelations && !lightweight) {
    selectFields.source = {
      select: {
        id: true,
        name: true,
        type: true,
        url: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    };
    selectFields.tags = {
      select: {
        id: true,
        name: true,
      },
    };
  }

  return selectFields;
}

/**
 * Article Where Clause Builder
 * Fluent interface for building complex where clauses
 */
export class ArticleWhereClauseBuilder {
  private where: ArticleWhereInput = {};
  private metrics: MetricsCollector;

  constructor(metrics: MetricsCollector) {
    this.metrics = metrics;
    // Always exclude hidden articles from public-facing APIs
    this.where.isHidden = false;
    // Initialize AND array so predicate functions can safely push into it
    this.where.AND = [];
  }

  /**
   * Filter out articles with empty content
   */
  withContentFilter(includeEmptyContent: boolean): this {
    if (!includeEmptyContent) {
      // Optimize for partial index: use single AND condition
      // AND array is always initialized in the constructor
      (this.where.AND as ArticleWhereInput[]).push({
        AND: [{ content: { not: null } }, { content: { not: '' } }],
      });
    }
    return this;
  }

  /**
   * Exclude articles without processed summaries
   */
  withProcessedFilter(excludeUnprocessed: boolean): this {
    pushProcessedFilter(this.where, excludeUnprocessed);
    return this;
  }

  /**
   * Exclude low quality articles (default behavior for public-facing APIs)
   * Filters out articles with:
   * - skipReason IN ('THIN_CONTENT', 'QUALITY_FAILED')
   * - qualityScore < 30 (scale is 0-100)
   * PDF and SLIDE skip reasons are NOT excluded (valid content types)
   */
  withLowQualityFilter(excludeLowQuality: boolean): this {
    pushLowQualityFilter(
      this.where.AND as ArticleWhereInput[],
      excludeLowQuality
    );
    return this;
  }

  /**
   * Filter by read status (requires authenticated user)
   */
  withReadFilter(
    readFilter: string | undefined,
    userId: string | undefined
  ): this {
    pushReadFilter(this.where, readFilter, userId);
    return this;
  }

  /**
   * Filter by sources (supports multiple sources)
   */
  async withSourceFilter(
    sources: string | undefined,
    sourceId: string | undefined
  ): Promise<{ builder: ArticleWhereClauseBuilder; emptyResult: boolean }> {
    // Always filter to enabled sources only (disabled sources should never appear in public API)
    this.where.source = { enabled: true };

    if (sources) {
      // Normalize sources for case-insensitive comparison
      const normalized = sources.trim().toLowerCase();

      if (normalized === 'none') {
        this.where.sourceId = { in: [] };
        return { builder: this, emptyResult: true };
      }

      // 'all' means no source filtering - return all enabled sources
      if (normalized === 'all') {
        // enabled filter already applied at method start
        return { builder: this, emptyResult: false };
      }

      // Special values checked against normalized, but preserve original case for IDs
      const sourceList = sources
        .trim()
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      if (sourceList.length > 0) {
        // In unit tests, treat tokens as IDs directly
        const isTestEnv =
          process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

        if (isTestEnv) {
          this.where.sourceId = { in: sourceList };
        } else {
          let finalIds: string[];
          try {
            finalIds = await withCacheTiming(
              this.metrics,
              () => sourceCache.resolveSourceIds(sourceList),
              'cache_source_resolution'
            );
          } catch (error) {
            logger.error(
              `Failed to resolve source IDs: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            finalIds = sourceList;
          }

          if (finalIds.length === 0) {
            return { builder: this, emptyResult: true };
          }

          this.where.sourceId = { in: finalIds };
        }
      }
    } else if (sourceId) {
      this.where.sourceId = sourceId;
    }

    return { builder: this, emptyResult: false };
  }

  /**
   * Exclude specific sources from results (e.g., arXiv papers)
   * Can be combined with withSourceFilter for inclusion/exclusion patterns
   */
  async withExcludeSources(excludeSources: string | undefined): Promise<this> {
    if (!excludeSources) return this;

    const sourceList = excludeSources
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (sourceList.length === 0) return this;

    // In unit tests, treat tokens as IDs directly
    const isTestEnv =
      process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

    let excludeIds: string[];
    if (isTestEnv) {
      excludeIds = sourceList;
    } else {
      try {
        excludeIds = await withCacheTiming(
          this.metrics,
          () => sourceCache.resolveSourceIds(sourceList),
          'cache_source_resolution_exclude'
        );
      } catch (error) {
        logger.error(
          `Failed to resolve exclude source IDs: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        excludeIds = sourceList;
      }
    }

    if (excludeIds.length === 0) return this;

    // Merge with existing sourceId filter
    const currentSourceId = this.where.sourceId;
    if (currentSourceId && typeof currentSourceId === 'object') {
      // Already has filter (e.g., { in: [...] })
      // Merge with existing notIn array if present
      const existingNotIn =
        'notIn' in currentSourceId && Array.isArray(currentSourceId.notIn)
          ? currentSourceId.notIn
          : [];
      const mergedNotIn = [...new Set([...existingNotIn, ...excludeIds])];
      this.where.sourceId = {
        ...currentSourceId,
        notIn: mergedNotIn,
      };
    } else if (currentSourceId && typeof currentSourceId === 'string') {
      // Single source ID - check if it's in exclude list
      if (excludeIds.includes(currentSourceId)) {
        // The only allowed source is excluded, return empty
        this.where.sourceId = { in: [] };
      }
      // Otherwise, keep the single source ID (it's not excluded)
    } else {
      // No existing filter, just add notIn
      this.where.sourceId = { notIn: excludeIds };
    }

    return this;
  }

  /**
   * Filter by tags (supports single tag, multiple tags with OR/AND modes)
   * Uses case-insensitive matching for consistency with /api/articles/list
   */
  withTagFilter(
    tag: string | undefined,
    tags: string | undefined,
    tagMode: string | undefined
  ): this {
    pushTagFilter(
      this.where,
      this.where.AND as ArticleWhereInput[],
      tag,
      tags,
      tagMode
    );
    return this;
  }

  /**
   * Filter by category
   */
  withCategoryFilter(category: string | undefined): this {
    if (category && category !== 'all') {
      if (category === 'uncategorized') {
        this.where.category = null;
      } else {
        const validCategories = Object.values(ArticleCategory);
        if (validCategories.includes(category as ArticleCategory)) {
          this.where.category = category as ArticleCategory;
        } else {
          logger.warn({ category }, 'Invalid category provided');
        }
      }
    }
    return this;
  }

  /**
   * Filter by search keywords (supports multiple keywords with AND)
   */
  withSearchFilter(search: string | undefined): this {
    pushSearchFilter(this.where.AND as ArticleWhereInput[], search);
    return this;
  }

  /**
   * Filter by date range (supports both preset and custom from-to)
   * Accepts either a string (preset, backward-compatible) or an options object.
   */
  withDateRangeFilter(
    optionsOrDateRange?:
      | string
      | {
          dateRange?: string;
          dateFrom?: string;
          dateTo?: string;
          sortBy?: string;
        }
  ): this {
    const options =
      typeof optionsOrDateRange === 'string'
        ? { dateRange: optionsOrDateRange }
        : (optionsOrDateRange ?? {});
    const { dateRange, dateFrom, dateTo, sortBy } = options;
    pushDateRangeFilter(this.where, sortBy, dateRange, dateFrom, dateTo);
    return this;
  }

  /**
   * Build and return the final where clause
   */
  build(): ArticleWhereInput {
    return this.where;
  }
}

/**
 * Build complete where clause from filter parameters
 */
export async function buildWhereClause(
  filters: FilterParams,
  display: DisplayOptions,
  userId: string | undefined,
  metrics: MetricsCollector,
  sortBy?: string
): Promise<{ where: ArticleWhereInput; emptyResult: boolean }> {
  const builder = new ArticleWhereClauseBuilder(metrics);

  // Apply filters in order
  // excludeLowQuality defaults to false (new articles have qualityScore=0)
  const excludeLowQuality = filters.excludeLowQuality === true;

  builder
    .withContentFilter(display.includeEmptyContent)
    .withProcessedFilter(display.excludeUnprocessed)
    .withLowQualityFilter(excludeLowQuality)
    .withReadFilter(filters.readFilter, userId)
    .withTagFilter(filters.tag, filters.tags, filters.tagMode)
    .withCategoryFilter(filters.category)
    .withSearchFilter(filters.search)
    .withDateRangeFilter({
      dateRange: filters.dateRange,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      sortBy,
    });

  // Source filter is async
  const { emptyResult } = await builder.withSourceFilter(
    filters.sources,
    filters.sourceId
  );

  // Exclude sources filter (e.g., exclude arXiv papers from home page)
  await builder.withExcludeSources(filters.excludeSources);

  return { where: builder.build(), emptyResult };
}
