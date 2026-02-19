import { PrismaClient, TechEntityType } from '@prisma/client';

export interface CompanyTechMatrix {
  companies: { groupId: string; name: string; articleCount: number }[];
  technologies: { entityId: string; name: string; type: string }[];
  matrix: { companyGroupId: string; entityId: string; mentionCount: number }[];
}

export interface CompanyTimeline {
  company: { groupId: string; name: string };
  timeline: {
    month: string;
    entities: { entityId: string; name: string; count: number }[];
  }[];
}

export interface CompanyListItem {
  groupId: string;
  name: string;
  articleCount: number;
}

export interface MatrixOptions {
  minMentions?: number;
  companyLimit?: number;
  techLimit?: number;
  entityTypes?: TechEntityType[];
}

export class CompanyTechAnalysisService {
  constructor(private prisma: PrismaClient) {}

  async getMatrix(options?: MatrixOptions): Promise<CompanyTechMatrix> {
    const {
      minMentions = 2,
      companyLimit = 30,
      techLimit = 30,
      entityTypes,
    } = options ?? {};

    // Step 1: Get companies (SourceGroups) with article counts, limited
    const companiesRaw = await this.prisma.sourceGroup.findMany({
      where: {
        sources: {
          some: {
            articles: { some: {} },
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Get article counts per group using a single groupBy query
    const groupIds = companiesRaw.map((g) => g.id);
    const articleCounts = await this.prisma.article.groupBy({
      by: ['sourceId'],
      where: {
        source: { groupId: { in: groupIds } },
      },
      _count: { id: true },
    });

    // Map sourceId -> groupId via sources
    const sources = await this.prisma.source.findMany({
      where: { groupId: { in: groupIds } },
      select: { id: true, groupId: true },
    });
    const sourceToGroup = new Map<string, string>();
    for (const s of sources) {
      if (s.groupId) sourceToGroup.set(s.id, s.groupId);
    }

    // Aggregate article counts per group
    const groupArticleCounts = new Map<string, number>();
    for (const ac of articleCounts) {
      const gId = sourceToGroup.get(ac.sourceId);
      if (gId) {
        groupArticleCounts.set(
          gId,
          (groupArticleCounts.get(gId) ?? 0) + ac._count.id
        );
      }
    }

    const companiesWithCounts = companiesRaw.map((group) => ({
      groupId: group.id,
      name: group.name,
      articleCount: groupArticleCounts.get(group.id) ?? 0,
    }));

    // Sort by article count descending and limit
    const companies = companiesWithCounts
      .filter((c) => c.articleCount > 0)
      .sort((a, b) => b.articleCount - a.articleCount)
      .slice(0, companyLimit);

    if (companies.length === 0) {
      return { companies: [], technologies: [], matrix: [] };
    }

    const companyGroupIds = companies.map((c) => c.groupId);

    // Step 2: Get mention matrix (company x technology)
    const entityTypeFilter = entityTypes?.length
      ? { entity: { type: { in: entityTypes } } }
      : {};

    const mentionAggregates = await this.prisma.articleTechMention.groupBy({
      by: ['entityId'],
      where: {
        article: {
          source: {
            groupId: { in: companyGroupIds },
          },
        },
        ...entityTypeFilter,
      },
      _count: { id: true },
      having: {
        id: { _count: { gte: minMentions } },
      },
    });

    if (mentionAggregates.length === 0) {
      return { companies, technologies: [], matrix: [] };
    }

    // Get top technologies by total mention count
    const topEntityIds = mentionAggregates
      .sort((a, b) => b._count.id - a._count.id)
      .slice(0, techLimit)
      .map((m) => m.entityId);

    // Step 3: Get technology details
    const techEntities = await this.prisma.techEntity.findMany({
      where: { id: { in: topEntityIds } },
      select: { id: true, name: true, type: true },
    });

    const technologies = techEntities.map((e) => ({
      entityId: e.id,
      name: e.name,
      type: e.type,
    }));

    // Step 4: Build full matrix (company x technology mention counts)
    // Get per-company breakdown via source groupId
    // Use a raw-style approach: get all relevant mentions and aggregate in JS
    const rawMentions = await this.prisma.articleTechMention.findMany({
      where: {
        entityId: { in: topEntityIds },
        article: {
          source: {
            groupId: { in: companyGroupIds },
          },
        },
      },
      select: {
        entityId: true,
        article: {
          select: {
            source: {
              select: { groupId: true },
            },
          },
        },
      },
    });

    // Aggregate: companyGroupId x entityId -> mentionCount
    const matrixMap = new Map<string, number>();
    for (const mention of rawMentions) {
      const groupId = mention.article.source.groupId;
      if (!groupId) continue;
      const key = `${groupId}:${mention.entityId}`;
      matrixMap.set(key, (matrixMap.get(key) ?? 0) + 1);
    }

    const matrix: CompanyTechMatrix['matrix'] = [];
    for (const [key, count] of matrixMap) {
      if (count < minMentions) continue;
      const sepIndex = key.indexOf(':');
      const companyGroupId = key.substring(0, sepIndex);
      const entityId = key.substring(sepIndex + 1);
      matrix.push({ companyGroupId, entityId, mentionCount: count });
    }

    return { companies, technologies, matrix };
  }

  async getCompanyTimeline(
    groupId: string,
    months: number = 12
  ): Promise<CompanyTimeline> {
    // Verify group exists
    const group = await this.prisma.sourceGroup.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });

    if (!group) {
      throw new CompanyNotFoundError(groupId);
    }

    const since = new Date();
    since.setDate(1);
    since.setMonth(since.getMonth() - months);
    since.setHours(0, 0, 0, 0);

    // Get all mentions for this company's articles within the time range
    const mentions = await this.prisma.articleTechMention.findMany({
      where: {
        article: {
          source: { groupId },
          publishedAt: { gte: since },
        },
      },
      select: {
        entityId: true,
        entity: {
          select: { id: true, name: true },
        },
        article: {
          select: { publishedAt: true },
        },
      },
    });

    // Aggregate by month
    const monthMap = new Map<
      string,
      Map<string, { entityId: string; name: string; count: number }>
    >();

    for (const mention of mentions) {
      const publishedAt = mention.article.publishedAt;
      if (!publishedAt) continue;

      const monthKey = `${publishedAt.getFullYear()}-${String(publishedAt.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, new Map());
      }
      const entityMap = monthMap.get(monthKey)!;
      const existing = entityMap.get(mention.entityId);
      if (existing) {
        existing.count++;
      } else {
        entityMap.set(mention.entityId, {
          entityId: mention.entityId,
          name: mention.entity.name,
          count: 1,
        });
      }
    }

    // Sort months chronologically
    const sortedMonths = [...monthMap.keys()].sort();
    const timeline = sortedMonths.map((month) => ({
      month,
      entities: [...monthMap.get(month)!.values()].sort(
        (a, b) => b.count - a.count
      ),
    }));

    return {
      company: { groupId: group.id, name: group.name },
      timeline,
    };
  }

  async getCompanyList(): Promise<CompanyListItem[]> {
    const groups = await this.prisma.sourceGroup.findMany({
      select: {
        id: true,
        name: true,
        sources: {
          select: {
            _count: {
              select: { articles: true },
            },
          },
        },
      },
    });

    return groups
      .map((g) => ({
        groupId: g.id,
        name: g.name,
        articleCount: g.sources.reduce((sum, s) => sum + s._count.articles, 0),
      }))
      .filter((c) => c.articleCount > 0)
      .sort((a, b) => b.articleCount - a.articleCount);
  }
}

export class CompanyNotFoundError extends Error {
  constructor(groupId: string) {
    super(`Company (SourceGroup) not found: ${groupId}`);
    this.name = 'CompanyNotFoundError';
  }
}
