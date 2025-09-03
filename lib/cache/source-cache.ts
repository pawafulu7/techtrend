import { prisma } from '@/lib/database';
import { RedisCache } from './index';
import { Source } from '@prisma/client';
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

export class SourceCache {
  private cache: RedisCache;

  constructor() {
    this.cache = new RedisCache({
      ttl: 3600, // 1時間
      namespace: '@techtrend/cache:sources'
    });
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
  invalidateSource: (sourceId: string) => getSourceCache().invalidateSource(sourceId)
};

// test-only: インスタンスをリセット
export const __resetSourceCacheForTests = () => {
  sourceCacheInstance = null;
};
