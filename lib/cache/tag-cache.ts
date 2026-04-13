import { prisma } from '@/lib/prisma';
import { RedisCache } from './index';
import { CACHE_TTL } from './constants';
import { Tag } from '@/lib/prisma-exports';
import type { TagWithCount } from '@/types/models';

export class TagCache {
  private cache: RedisCache;

  constructor() {
    this.cache = new RedisCache({
      ttl: CACHE_TTL.VERY_LONG,
      namespace: '@techtrend/cache:tags',
    });
  }

  /**
   * すべてのタグを記事数付きで取得
   */
  async getAllTags(): Promise<TagWithCount[]> {
    return this.cache.getOrSetWithLock('all-tags', async () => {
      return prisma.tag.findMany({
        include: {
          _count: {
            select: { articles: true },
          },
        },
        orderBy: { name: 'asc' },
      });
    });
  }

  /**
   * 人気タグを取得（記事数上位）
   */
  async getPopularTags(limit = 20): Promise<TagWithCount[]> {
    return this.cache.getOrSetWithLock(`popular-tags:${limit}`, async () => {
      const tags = await prisma.tag.findMany({
        include: {
          _count: {
            select: { articles: true },
          },
        },
        orderBy: {
          articles: {
            _count: 'desc',
          },
        },
        take: limit,
      });

      return tags;
    });
  }

  /**
   * タグ名でタグを検索
   */
  async findTagsByName(searchTerm: string): Promise<Tag[]> {
    const cacheKey = `search:${searchTerm.toLowerCase()}`;

    return this.cache.getOrSet(cacheKey, async () => {
      return prisma.tag.findMany({
        where: {
          name: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
        orderBy: { name: 'asc' },
      });
    });
  }

  /**
   * 単一のタグを取得
   */
  async getTag(id: string): Promise<TagWithCount | null> {
    return this.cache.getOrSet(`tag:${id}`, async () => {
      return prisma.tag.findUnique({
        where: { id },
        include: {
          _count: {
            select: { articles: true },
          },
        },
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
   * 特定のタグのキャッシュをターゲット無効化
   * 該当タグの個別キー、集約キー（all-tags, popular-tags）、検索キャッシュを削除する。
   * 無関係なキャッシュは保持される。エラー時は全キャッシュ無効化にフォールバック。
   */
  async invalidateTag(tagId: string): Promise<void> {
    try {
      await Promise.all([
        // Individual tag data
        this.cache.delete(`tag:${tagId}`).catch(() => {}),
        // Aggregate keys (must refresh since tag membership changed)
        this.cache.delete('all-tags').catch(() => {}),
        // Popular tags (various limits)
        this.cache.invalidatePattern('popular-tags:*'),
        // Search results (may contain this tag)
        this.cache.invalidatePattern('search:*'),
      ]);
    } catch (_error) {
      // Fallback to full invalidation on any error
      await this.invalidate();
    }
  }
}

// シングルトンインスタンスをエクスポート
export const tagCache = new TagCache();
