/**
 * Database query optimization utilities
 * Provides efficient query patterns and caching strategies
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { cache } from 'react';

// Types for optimized queries
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
  include?: Record<string, boolean | object>;
  select?: Record<string, boolean | object>;
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  key?: string;
  tags?: string[];
}

/**
 * Optimized article queries with proper indexing
 */
export class ArticleQueryOptimizer {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get paginated articles with optimized includes
   * Uses select instead of include when possible for better performance
   */
  async getPaginatedArticles(
    page: number = 1,
    limit: number = 20,
    filters?: {
      sourceIds?: string[];
      tagNames?: string[];
      dateFrom?: Date;
      dateTo?: Date;
      searchQuery?: string;
    }
  ) {
    const offset = (page - 1) * limit;

    // Build where clause efficiently
    const where: Prisma.ArticleWhereInput = {};

    if (filters?.sourceIds?.length) {
      where.sourceId = { in: filters.sourceIds };
    }

    if (filters?.tagNames?.length) {
      where.tags = {
        some: {
          name: { in: filters.tagNames },
        },
      };
    }

    if (filters?.dateFrom || filters?.dateTo) {
      where.publishedAt = {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lte: filters.dateTo }),
      };
    }

    if (filters?.searchQuery) {
      // Use OR for search across multiple fields
      where.OR = [
        { title: { contains: filters.searchQuery, mode: 'insensitive' } },
        { summary: { contains: filters.searchQuery, mode: 'insensitive' } },
      ];
    }

    // Execute count and data queries in parallel
    const [total, articles] = await Promise.all([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
          url: true,
          summary: true,
          thumbnail: true,
          publishedAt: true,
          bookmarks: true,
          qualityScore: true,
          source: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          tags: {
            select: {
              id: true,
              name: true,
              category: true,
            },
            take: 5, // Limit tags to reduce payload
          },
          _count: {
            select: {
              favorites: true,
            },
          },
        },
        orderBy: { publishedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    return {
      articles,
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
    };
  }

  /**
   * Get article with full details
   * Optimized for single article view
   */
  async getArticleById(id: string) {
    return this.prisma.article.findUnique({
      where: { id },
      include: {
        source: true,
        tags: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        _count: {
          select: {
            favorites: true,
          },
        },
      },
    });
  }

  /**
   * Get related articles using efficient tag matching
   */
  async getRelatedArticles(articleId: string, limit: number = 5) {
    // First, get the article's tags
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: {
        tags: {
          select: { id: true },
        },
      },
    });

    if (!article || article.tags.length === 0) {
      return [];
    }

    const tagIds = article.tags.map(t => t.id);

    // Find articles with similar tags
    return this.prisma.article.findMany({
      where: {
        id: { not: articleId },
        tags: {
          some: {
            id: { in: tagIds },
          },
        },
      },
      select: {
        id: true,
        title: true,
        url: true,
        thumbnail: true,
        publishedAt: true,
        source: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Batch create articles with tags efficiently
   */
  async createArticlesWithTags(
    articles: Array<{
      article: Prisma.ArticleCreateInput;
      tagNames: string[];
    }>
  ) {
    // Use transaction for consistency
    return this.prisma.$transaction(async (tx) => {
      type CreatedArticle = Prisma.ArticleGetPayload<{ include: { tags: true; source: true } }>;
      const results: CreatedArticle[] = [];

      for (const { article, tagNames } of articles) {
        // Create or connect tags
        const tagConnections = await Promise.all(
          tagNames.map(async (name) => {
            const tag = await tx.tag.upsert({
              where: { name },
              create: { name },
              update: {},
            });
            return { id: tag.id };
          })
        );

        // Create article with tags
        const createdArticle = await tx.article.create({
          data: {
            ...article,
            tags: {
              connect: tagConnections,
            },
          },
          include: {
            tags: true,
            source: true,
          },
        });

        results.push(createdArticle);
      }

      return results;
    });
  }
}

/**
 * Optimized source queries
 */
export class SourceQueryOptimizer {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get sources with article counts
   * Uses aggregation for efficient counting
   */
  async getSourcesWithStats() {
    const sources = await this.prisma.source.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        url: true,
        enabled: true,
        _count: {
          select: {
            articles: true,
          },
        },
        articles: {
          select: {
            publishedAt: true,
          },
          orderBy: {
            publishedAt: 'desc',
          },
          take: 1,
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return sources.map(source => ({
      ...source,
      latestArticleDate: source.articles[0]?.publishedAt || null,
      articles: undefined, // Remove the articles array from response
    }));
  }
}

/**
 * Optimized tag queries
 */
export class TagQueryOptimizer {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get tag cloud with article counts
   * Efficient aggregation query
   */
  async getTagCloud(limit: number = 50) {
    const tags = await this.prisma.tag.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        _count: {
          select: {
            articles: true,
          },
        },
      },
      orderBy: {
        articles: {
          _count: 'desc',
        },
      },
      take: limit,
    });

    return tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      category: tag.category,
      count: tag._count.articles,
    }));
  }

  /**
   * Get trending tags for a time period
   */
  async getTrendingTags(days: number = 7, limit: number = 10) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const result = await this.prisma.$queryRaw<
      Array<{ tag_id: string; tag_name: string; article_count: bigint }>
    >`
      SELECT 
        t.id as tag_id,
        t.name as tag_name,
        COUNT(DISTINCT at."A") as article_count
      FROM "Tag" t
      INNER JOIN "_ArticleToTag" at ON t.id = at."B"
      INNER JOIN "Article" a ON at."A" = a.id
      WHERE a."publishedAt" >= ${since}
      GROUP BY t.id, t.name
      ORDER BY article_count DESC
      LIMIT ${limit}
    `;

    return result.map(row => ({
      id: row.tag_id,
      name: row.tag_name,
      count: Number(row.article_count),
    }));
  }
}

/**
 * Cache wrapper for expensive queries
 */
export function cachedQuery<T>(
  queryFn: () => Promise<T>,
  cacheKey: string,
  ttl: number = 300 // 5 minutes default
): () => Promise<T> {
  const cacheMap = new Map<string, { data: T; expiry: number }>();

  return async () => {
    const cached = cacheMap.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiry > now) {
      return cached.data;
    }

    const data = await queryFn();
    cacheMap.set(cacheKey, {
      data,
      expiry: now + ttl * 1000,
    });

    return data;
  };
}

/**
 * React cache wrapper for server components
 */
export const getCachedArticles = cache(async (page: number, limit: number) => {
  const prisma = new PrismaClient();
  const optimizer = new ArticleQueryOptimizer(prisma);
  return optimizer.getPaginatedArticles(page, limit);
});

/**
 * Database connection pooling configuration
 */
export function createOptimizedPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

// Export singleton instance
let prismaClient: PrismaClient | null = null;

export function getOptimizedPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = createOptimizedPrismaClient();
  }
  return prismaClient;
}
