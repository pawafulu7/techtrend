import { prisma } from '@/lib/database';
import { RedisCache } from './index';
import { Source } from '@prisma/client';
import logger from '@/lib/logger';
import {
  SourceStats,
  estimateSourceCategory,
  SourceCategory,
  calculateGrowthRateFromStats
} from '@/lib/utils/source-stats';

interface SourceWithCount extends Source {
  _count: {
    articles: number;
  };
}

export interface SourceWithStats extends Source {
  category: SourceCategory;
  stats: SourceStats;
}

const SOURCE_NAME_CACHE_TTL_MS = 300_000; // 5分に延長（ソース情報は頻繁に変わらない）

export class SourceCache {
  private cache: RedisCache;
  private nameToId = new Map<string, string>();
  private idToName = new Map<string, string>();
  private lastNameRefresh = 0;
  private refreshPromise: Promise<void> | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly nameCacheTtlMs = SOURCE_NAME_CACHE_TTL_MS;

  constructor() {
    this.cache = new RedisCache({
      ttl: 3600, // 1時間
      namespace: '@techtrend/cache:sources'
    });
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  private clearNameCache(): void {
    this.nameToId = new Map();
    this.idToName = new Map();
    this.lastNameRefresh = 0;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private scheduleAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshNameCache(true).catch((error) => {
        logger.error({ err: error }, 'Failed to auto-refresh source name cache');
      });
    }, this.nameCacheTtlMs);

    if (typeof this.refreshTimer.unref === 'function') {
      this.refreshTimer.unref();
    }
  }

  private async refreshNameCache(force = false): Promise<void> {
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastNameRefresh < this.nameCacheTtlMs) {
      return;
    }

    const loadPromise = (async () => {
      try {
        const sources = await prisma.source.findMany({
          select: { id: true, name: true },
        });

        const nextNameToId = new Map<string, string>();
        const nextIdToName = new Map<string, string>();

        for (const source of sources) {
          const { id, name } = source;
          if (!id || !name) {
            continue;
          }

          nextIdToName.set(id, name);

          const normalized = this.normalizeName(name);
          if (!normalized || nextNameToId.has(normalized)) {
            continue;
          }
          nextNameToId.set(normalized, id);
        }

        this.nameToId = nextNameToId;
        this.idToName = nextIdToName;
        this.lastNameRefresh = Date.now();
        this.scheduleAutoRefresh();
      } catch (error) {
        logger.error({ err: error }, 'Failed to refresh source name cache');
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();

    this.refreshPromise = loadPromise;
    await loadPromise;
  }

  private async ensureNameCache(): Promise<void> {
    await this.refreshNameCache(false);
  }

  async resolveSourceIds(identifiers: string[]): Promise<string[]> {
    const tokens = identifiers.map((identifier) => identifier.trim()).filter(Boolean);
    if (tokens.length === 0) {
      return [];
    }

    await this.ensureNameCache();

    const resolved = new Set<string>();
    const unresolved = new Set<string>();

    for (const token of tokens) {
      if (this.idToName.has(token)) {
        resolved.add(token);
        continue;
      }

      const normalized = this.normalizeName(token);
      const id = this.nameToId.get(normalized);
      if (id) {
        resolved.add(id);
      } else {
        unresolved.add(token);
      }
    }

    if (unresolved.size > 0) {
      await this.refreshNameCache(true);

      for (const token of unresolved) {
        if (this.idToName.has(token)) {
          resolved.add(token);
          continue;
        }

        const normalized = this.normalizeName(token);
        const id = this.nameToId.get(normalized);
        if (id) {
          resolved.add(id);
        }
      }
    }

    return Array.from(resolved);
  }

  async resolveSourceName(sourceId: string): Promise<string | null> {
    const trimmed = sourceId.trim();
    if (!trimmed) {
      return null;
    }

    await this.ensureNameCache();

    let name = this.idToName.get(trimmed) ?? null;
    if (name) {
      return name;
    }

    await this.refreshNameCache(true);
    name = this.idToName.get(trimmed) ?? null;

    return name ?? null;
  }

  /**
   * 有効なすべてのソースを取得
   */
  async getAllSources(): Promise<SourceWithCount[]> {
    return this.cache.getOrSet('all-sources', async () => {
      return prisma.source.findMany({
        where: { enabled: true },
        include: { 
          _count: { 
            select: { articles: true } 
          } 
        },
        orderBy: { name: 'asc' }
      });
    });
  }

  /**
   * ソースIDでソースを取得
   */
  async getSource(id: string): Promise<SourceWithCount | null> {
    return this.cache.getOrSet(`source:${id}`, async () => {
      return prisma.source.findUnique({
        where: { id },
        include: { 
          _count: { 
            select: { articles: true } 
          } 
        }
      });
    });
  }

  /**
   * ソース名でソースを取得
   */
  async getSourceByName(name: string): Promise<Source | null> {
    return this.cache.getOrSet(`source:name:${name}`, async () => {
      return prisma.source.findFirst({
        where: { 
          name,
          enabled: true 
        }
      });
    });
  }

  /**
   * 記事数の多いソースを取得
   */
  async getTopSources(limit = 10): Promise<SourceWithCount[]> {
    return this.cache.getOrSet(`top-sources:${limit}`, async () => {
      const sources = await prisma.source.findMany({
        where: { enabled: true },
        include: { 
          _count: { 
            select: { articles: true } 
          } 
        },
        orderBy: {
          articles: {
            _count: 'desc'
          }
        },
        take: limit
      });
      
      // 記事数が多い順にソート
      return sources.sort((a, b) => b._count.articles - a._count.articles);
    });
  }

  /**
   * 統計情報付きのすべてのソースを取得
   */
  async getAllSourcesWithStats(): Promise<SourceWithStats[]> {
    return this.cache.getOrSet('all-sources-with-stats', async () => {
      // 並列実行: ソース取得 + 統計集計
      const [sources, sourceStats] = await Promise.all([
        prisma.source.findMany({
          where: { enabled: true },
          orderBy: { name: 'asc' }
        }),
        prisma.$queryRaw<Array<{
          source_id: string;
          total_articles: number;
          avg_quality_score: number;
          recent_articles: number;
          past_month_articles: number;
          last_published: Date | null;
        }>>`
          SELECT
            s.id as source_id,
            COUNT(a.id)::int as total_articles,
            COALESCE(AVG(a."qualityScore")::int, 0) as avg_quality_score,
            COUNT(CASE WHEN a."publishedAt" >= NOW() - INTERVAL '30 days' THEN 1 END)::int as recent_articles,
            COUNT(CASE WHEN a."publishedAt" >= NOW() - INTERVAL '60 days'
                       AND a."publishedAt" < NOW() - INTERVAL '30 days' THEN 1 END)::int as past_month_articles,
            MAX(a."publishedAt") as last_published
          FROM "Source" s
          LEFT JOIN "Article" a ON s.id = a."sourceId"
          WHERE s.enabled = true
          GROUP BY s.id
        `
      ]);

      // 統計情報をマップ化
      const statsMap = new Map(sourceStats.map(stat => [stat.source_id, stat]));

      // ソース情報と統計を結合
      return sources.map(source => {
        const stats = statsMap.get(source.id);
        const publishFrequency = stats ? stats.recent_articles / 30 : 0;
        const category = estimateSourceCategory(source.name);

        return {
          ...source,
          category,
          stats: {
            totalArticles: stats?.total_articles || 0,
            avgQualityScore: stats?.avg_quality_score || 0,
            popularTags: [],  // Phase 1: 一時的に空配列
            publishFrequency: Math.round(publishFrequency * 10) / 10,
            lastPublished: stats?.last_published || null,
            growthRate: calculateGrowthRateFromStats(stats)
          }
        };
      });
    });
  }

  /**
   * キャッシュを無効化
   */
  async invalidate(): Promise<void> {
    this.clearNameCache();
    await this.cache.invalidatePattern('*');
  }

  /**
   * 特定のソースのキャッシュを無効化
   */
  async invalidateSource(sourceId: string): Promise<void> {
    await this.cache.delete(`source:${sourceId}`);
    // 関連するキャッシュも無効化
    await this.invalidate();
  }

  /**
   * 企業ブログソースを取得（DatabaseProvider用）
   * TTL: 5分
   */
  async getCompanySources(): Promise<import('@/lib/providers/company-source/interface').CompanySource[]> {
    const { sourceInclude, toCompanySource } = await import('@/lib/providers/company-source/transforms');

    return this.cache.getOrSet('company-sources', async () => {
      const rows = await prisma.source.findMany({
        where: {
          enabled: true,
          groupId: { not: null },
          group: { type: 'company_blog' },
        },
        include: sourceInclude,
        orderBy: { name: 'asc' },
      });
      return rows.map(toCompanySource);
    }, 300);  // 5分
  }

  /**
   * グループ別企業ブログソースを取得
   * TTL: 5分
   */
  async getCompanySourcesByGroup(groupId: string): Promise<import('@/lib/providers/company-source/interface').CompanySource[]> {
    const { sourceInclude, toCompanySource } = await import('@/lib/providers/company-source/transforms');

    return this.cache.getOrSet(`company-sources:group:${groupId}`, async () => {
      const rows = await prisma.source.findMany({
        where: {
          enabled: true,
          groupId,
        },
        include: sourceInclude,
        orderBy: { name: 'asc' },
      });
      return rows.map(toCompanySource);
    }, 300);  // 5分
  }

  /**
   * タグ別企業ブログソースを取得
   * TTL: 5分
   */
  async getCompanySourcesByTag(tagId: string): Promise<import('@/lib/providers/company-source/interface').CompanySource[]> {
    const { sourceInclude, toCompanySource } = await import('@/lib/providers/company-source/transforms');

    return this.cache.getOrSet(`company-sources:tag:${tagId}`, async () => {
      const rows = await prisma.source.findMany({
        where: {
          enabled: true,
          tagAssignments: { some: { tagId } },
        },
        include: sourceInclude,
        orderBy: { name: 'asc' },
      });
      return rows.map(toCompanySource);
    }, 300);  // 5分
  }
}

// シングルトンインスタンスをエクスポート
// 遅延初期化パターンでグローバル初期化を回避
let sourceCacheInstance: SourceCache | null = null;

export const getSourceCache = (): SourceCache => {
  if (!sourceCacheInstance) {
    sourceCacheInstance = new SourceCache();
  }
  return sourceCacheInstance;
};

// 既存のコードとの互換性のため、sourceCacheもエクスポート
// ただし、遅延初期化を使う
export const sourceCache = {
  getAllSourcesWithStats: () => getSourceCache().getAllSourcesWithStats(),
  invalidate: () => getSourceCache().invalidate(),
  invalidateSource: (sourceId: string) => getSourceCache().invalidateSource(sourceId),
  resolveSourceIds: (identifiers: string[]) => getSourceCache().resolveSourceIds(identifiers),
  resolveSourceName: (sourceId: string) => getSourceCache().resolveSourceName(sourceId)
};

// test-only: インスタンスをリセット
export const __resetSourceCacheForTests = () => {
  sourceCacheInstance = null;
};
