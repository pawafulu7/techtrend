import { prisma } from '@/lib/database';
import { RedisCache } from './index';
import { Tag } from '@prisma/client';

interface TagWithCount extends Tag {
  _count: {
    articles: number;
  };
}

export class TagCache {
  private cache: RedisCache;

  constructor() {
    this.cache = new RedisCache({
      ttl: 3600, // 1時間
      namespace: '@techtrend/cache:tags'
    });
  }

  /**
   * すべてのタグを記事数付きで取得
   */
  async getAllTags(): Promise<TagWithCount[]> {
    return this.cache.getOrSet('all-tags', async () => {
      return prisma.tag.findMany({
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
   * 人気タグを取得（記事数上位）
   */
  async getPopularTags(limit = 20): Promise<TagWithCount[]> {
    return this.cache.getOrSet(`popular-tags:${limit}`, async () => {
      const tags = await prisma.tag.findMany({
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
      return tags.sort((a, b) => b._count.articles - a._count.articles);
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
            mode: 'insensitive'
          }
        },
        orderBy: { name: 'asc' }
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
            select: { articles: true } 
          } 
        }
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
   * 特定のタグのキャッシュを無効化
   */
  async invalidateTag(tagId: string): Promise<void> {
    await this.cache.delete(`tag:${tagId}`);
    // 関連するキャッシュも無効化
    await this.invalidate();
  }
}

// シングルトンインスタンスをエクスポート
export const tagCache = new TagCache();