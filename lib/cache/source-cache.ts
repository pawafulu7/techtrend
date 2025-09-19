import { prisma } from '@/lib/database';
import { RedisCache } from './index';
import { Source } from '@prisma/client';
import logger from '@/lib/logger';
import {
  SourceStats,
  calculateSourceStats,
  estimateSourceCategory,
  SourceCategory
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

const SOURCE_NAME_CACHE_TTL_MS = 60_000;

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
      const sources = await prisma.source.findMany({
        where: { enabled: true },
        include: {
          _count: {
            select: { articles: true }
          },
          articles: {
            select: {
              qualityScore: true,
              publishedAt: true,
              tags: true
            },
            orderBy: {
              publishedAt: 'desc'
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      // 統計情報を計算してソースに追加
      return sources.map(source => {
        const stats = calculateSourceStats(
          source.articles,
          source._count.articles
        );
        
        const category = estimateSourceCategory(source.name);
        
        // articlesフィールドは含めない（大きすぎるため）
        const { _count, ...sourceData } = source;
        
        return {
          ...sourceData,
          category,
          stats
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
