import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { CategoryClassifier } from '@/lib/services/category-classifier';
import { RedisCache } from '@/lib/cache';

// Initialize Redis cache with 1 hour TTL for category stats
const cache = new RedisCache({
  ttl: 3600, // 1 hour
  namespace: '@techtrend/cache:categories'
});

export async function GET(_request: NextRequest) {
  try {
    const cacheKey = 'category-stats';
    
    // Check cache first
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    // Get category counts
    const categoryStats = await prisma.article.groupBy({
      by: ['category'],
      _count: {
        _all: true
      },
      orderBy: {
        _count: {
          category: 'desc'
        }
      }
    });

    // Transform results
    const categories = categoryStats
      .filter(stat => stat.category !== null)
      .map(stat => ({
        value: stat.category,
        label: CategoryClassifier.getCategoryLabel(stat.category),
        count: stat._count._all
      }));

    // Add uncategorized count
    const uncategorizedCount = categoryStats.find(stat => stat.category === null)?._count._all || 0;
    if (uncategorizedCount > 0) {
      categories.push({
        value: null,
        label: '未分類',
        count: uncategorizedCount
      });
    }

    // Get total count
    const total = categories.reduce((sum, cat) => sum + cat.count, 0);

    const result = {
      categories,
      total,
      timestamp: new Date().toISOString()
    };

    // Cache the result
    await cache.set(cacheKey, result);

    return NextResponse.json(result);
  } catch (error) {
    // エラーログはサーバー側で記録されるため、クライアントには簡潔なメッセージのみ返す
    return NextResponse.json(
      { error: 'Failed to get category stats' },
      { status: 500 }
    );
  }
}