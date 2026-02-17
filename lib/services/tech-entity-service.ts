/**
 * TechEntity Service
 *
 * CRUD operations for TechEntity (technology entity tracking).
 * Supports alias-aware lookups, mention tracking, and stats refresh.
 */

import {
  PrismaClient,
  TechEntity,
  TechEntityType,
  MentionSentiment,
} from '@prisma/client';

export interface FindOrCreateData {
  name: string;
  type: TechEntityType;
  aliases?: string[];
  description?: string;
  externalIds?: Record<string, string>;
}

export interface SearchFilters {
  type?: TechEntityType;
  limit?: number;
  offset?: number;
  sort?: 'mentionCount' | 'lastSeenAt' | 'name';
}

export interface SearchResult {
  entities: TechEntity[];
  total: number;
}

export interface AddMentionData {
  articleId: string;
  entityId: string;
  context?: string;
  sentiment?: MentionSentiment;
}

export class TechEntityService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Find or create entity by name (alias-aware).
   * Checks both `name` and `aliases` array for existing entities before creating.
   */
  async findOrCreate(data: FindOrCreateData): Promise<TechEntity> {
    // First, try to find by exact name
    const existingByName = await this.prisma.techEntity.findUnique({
      where: { name: data.name },
    });
    if (existingByName) {
      return existingByName;
    }

    // Then check if any existing entity has this name as an alias
    const existingByAlias = await this.prisma.techEntity.findFirst({
      where: {
        aliases: { has: data.name },
      },
    });
    if (existingByAlias) {
      return existingByAlias;
    }

    // Create new entity
    return this.prisma.techEntity.create({
      data: {
        name: data.name,
        type: data.type,
        aliases: data.aliases ?? [],
        description: data.description ?? null,
        externalIds: data.externalIds ?? undefined,
      },
    });
  }

  /**
   * Find entity by name. Checks both `name` field and `aliases` array.
   */
  async findByName(name: string): Promise<TechEntity | null> {
    // Try exact name first
    const byName = await this.prisma.techEntity.findUnique({
      where: { name },
    });
    if (byName) {
      return byName;
    }

    // Then check aliases
    return this.prisma.techEntity.findFirst({
      where: {
        aliases: { has: name },
      },
    });
  }

  /**
   * Search entities with optional type filter, pagination, and sorting.
   */
  async search(query: string, filters?: SearchFilters): Promise<SearchResult> {
    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;
    const sort = filters?.sort ?? 'mentionCount';

    const where = {
      AND: [
        // Text search on name (case-insensitive contains)
        query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' as const } },
                { aliases: { has: query } },
              ],
            }
          : {},
        // Optional type filter
        filters?.type ? { type: filters.type } : {},
      ],
    };

    const orderBy = this.buildOrderBy(sort);

    const [entities, total] = await Promise.all([
      this.prisma.techEntity.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
      }),
      this.prisma.techEntity.count({ where }),
    ]);

    return { entities, total };
  }

  /**
   * Add an article-entity mention link (UPSERT - idempotent).
   */
  async addMention(data: AddMentionData): Promise<void> {
    await this.prisma.articleTechMention.upsert({
      where: {
        articleId_entityId: {
          articleId: data.articleId,
          entityId: data.entityId,
        },
      },
      create: {
        articleId: data.articleId,
        entityId: data.entityId,
        context: data.context ?? null,
        sentiment: data.sentiment ?? 'NEUTRAL',
      },
      update: {
        // Update context/sentiment if provided on duplicate
        ...(data.context !== undefined ? { context: data.context } : {}),
        ...(data.sentiment !== undefined ? { sentiment: data.sentiment } : {}),
      },
    });
  }

  /**
   * Refresh stats (mentionCount, firstSeenAt, lastSeenAt) for a single entity
   * by aggregating from ArticleTechMention data.
   */
  async refreshStats(entityId: string): Promise<void> {
    const aggregate = await this.prisma.articleTechMention.aggregate({
      where: { entityId },
      _count: { id: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });

    await this.prisma.techEntity.update({
      where: { id: entityId },
      data: {
        mentionCount: aggregate._count.id,
        firstSeenAt: aggregate._min.createdAt,
        lastSeenAt: aggregate._max.createdAt,
      },
    });
  }

  /**
   * Refresh stats for all entities.
   */
  async refreshAllStats(): Promise<void> {
    const entities = await this.prisma.techEntity.findMany({
      select: { id: true },
    });

    for (const entity of entities) {
      await this.refreshStats(entity.id);
    }
  }

  private buildOrderBy(
    sort: 'mentionCount' | 'lastSeenAt' | 'name'
  ): Record<string, string> {
    switch (sort) {
      case 'mentionCount':
        return { mentionCount: 'desc' };
      case 'lastSeenAt':
        return { lastSeenAt: 'desc' };
      case 'name':
        return { name: 'asc' };
    }
  }
}
