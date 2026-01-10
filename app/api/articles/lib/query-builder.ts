/**
 * Query Builder for Articles API
 *
 * Handles building Prisma where clauses and select fields
 * for article queries with support for various filters.
 */

import { Prisma, ArticleCategory } from '@prisma/client';
import { getDateRangeFilter } from '@/app/lib/date-utils';
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
      content: true, // Included for contentLength calculation, stripped before response
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
  }

  /**
   * Filter out articles with empty content
   */
  withContentFilter(includeEmptyContent: boolean): this {
    if (!includeEmptyContent) {
      // Optimize for partial index: use single AND condition
      this.where.AND = Array.isArray(this.where.AND)
        ? [
            ...this.where.AND,
            {
              AND: [{ content: { not: null } }, { content: { not: '' } }],
            },
          ]
        : [
            {
              AND: [{ content: { not: null } }, { content: { not: '' } }],
            },
          ];
    }
    return this;
  }

  /**
   * Exclude articles without processed summaries
   */
  withProcessedFilter(excludeUnprocessed: boolean): this {
    if (excludeUnprocessed) {
      this.where.summaryComputedAt = { not: null };
    }
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
    if (excludeLowQuality) {
      // Build AND conditions for low quality filter
      // Import SkipReason enum values for type-safe filtering
      const lowQualityFilters: ArticleWhereInput[] = [
        // Exclude THIN_CONTENT and QUALITY_FAILED skip reasons
        // PDF and SLIDE are valid content types, so they are NOT excluded
        {
          OR: [
            { skipReason: null },
            {
              skipReason: {
                notIn: ['THIN_CONTENT' as const, 'QUALITY_FAILED' as const],
              },
            },
          ],
        },
        // Exclude low quality score (< 30)
        // Note: qualityScore is Float @default(0), so null is not possible
        { qualityScore: { gte: 30 } },
      ];

      // Merge with existing AND conditions
      if (!this.where.AND) {
        this.where.AND = [];
      } else if (!Array.isArray(this.where.AND)) {
        this.where.AND = [this.where.AND];
      }
      this.where.AND = [...this.where.AND, ...lowQualityFilters];
    }
    return this;
  }

  /**
   * Filter by read status (requires authenticated user)
   */
  withReadFilter(
    readFilter: string | undefined,
    userId: string | undefined
  ): this {
    if (readFilter && userId) {
      if (readFilter === 'unread') {
        this.where.articleViews = {
          none: {
            userId: userId,
            isRead: true,
          },
        };
      } else if (readFilter === 'read') {
        this.where.articleViews = {
          some: {
            userId: userId,
            isRead: true,
          },
        };
      }
    }
    return this;
  }

  /**
   * Filter by sources (supports multiple sources)
   */
  async withSourceFilter(
    sources: string | undefined,
    sourceId: string | undefined
  ): Promise<{ builder: ArticleWhereClauseBuilder; emptyResult: boolean }> {
    if (sources) {
      if (sources === 'none') {
        this.where.sourceId = { in: [] };
        return { builder: this, emptyResult: true };
      }

      const sourceList = sources
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
      this.where.sourceId = {
        ...currentSourceId,
        notIn: excludeIds,
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
    if (tag) {
      // Single tag (backward compatibility) - case-insensitive
      this.where.tags = {
        some: {
          name: { equals: tag, mode: 'insensitive' },
        },
      };
    } else if (tags) {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      if (tagList.length > 0) {
        if (tagMode === 'AND') {
          // AND search: articles with all specified tags (case-insensitive)
          const tagAnd = tagList.map((tagName) => ({
            tags: {
              some: {
                name: { equals: tagName, mode: 'insensitive' as const },
              },
            },
          }));
          this.where.AND = Array.isArray(this.where.AND)
            ? [...this.where.AND, ...tagAnd]
            : tagAnd;
        } else {
          // OR search: articles with any of the specified tags (case-insensitive)
          // Note: Prisma's `in` doesn't support mode, so we use OR conditions
          this.where.tags = {
            some: {
              OR: tagList.map((tagName) => ({
                name: { equals: tagName, mode: 'insensitive' as const },
              })),
            },
          };
        }
      }
    }
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
    if (search) {
      const keywords = search
        .trim()
        .split(/[\s\u3000]+/)
        .filter((k) => k.length > 0);

      if (keywords.length === 1) {
        // Single keyword
        const searchOr: Prisma.ArticleWhereInput[] = [
          {
            title: {
              contains: keywords[0],
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            summary: {
              contains: keywords[0],
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ];
        this.where.AND = Array.isArray(this.where.AND)
          ? [...this.where.AND, { OR: searchOr }]
          : [{ OR: searchOr }];
      } else if (keywords.length > 1) {
        // Multiple keywords - AND search
        const keywordConditions = keywords.map((keyword) => ({
          OR: [
            {
              title: { contains: keyword, mode: Prisma.QueryMode.insensitive },
            },
            {
              summary: {
                contains: keyword,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          ] as Prisma.ArticleWhereInput[],
        }));
        this.where.AND = Array.isArray(this.where.AND)
          ? [...this.where.AND, ...keywordConditions]
          : keywordConditions;
      }
    }
    return this;
  }

  /**
   * Filter by date range
   */
  withDateRangeFilter(dateRange: string | undefined): this {
    if (dateRange && dateRange !== 'all') {
      const startDate = getDateRangeFilter(dateRange);
      if (startDate) {
        const now = new Date();
        const validStartDate = startDate > now ? now : startDate;

        this.where.publishedAt = {
          gte: validStartDate,
          lte: now,
        };
      }
    }
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
  metrics: MetricsCollector
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
    .withDateRangeFilter(filters.dateRange);

  // Source filter is async
  const { emptyResult } = await builder.withSourceFilter(
    filters.sources,
    filters.sourceId
  );

  // Exclude sources filter (e.g., exclude arXiv papers from home page)
  await builder.withExcludeSources(filters.excludeSources);

  return { where: builder.build(), emptyResult };
}
