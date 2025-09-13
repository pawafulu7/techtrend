import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DigestGenerator } from '@/lib/services/digest-generator';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger';

// キャッシュインスタンスを遅延初期化
let cache: RedisCache | null = null;

const getCache = () => {
  if (!cache) {
    cache = new RedisCache({
      ttl: 10800, // 3 hours (increased from 1 hour)
      namespace: '@techtrend/cache:digest'
    });
  }
  return cache;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { week: string } }
) {
  try {
    const weekDate = new Date(params.week);
    
    if (isNaN(weekDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    // Generate cache key based on week start date
    const cacheInstance = getCache();
    const cacheKey = cacheInstance.generateCacheKey('weekly-digest', {
      params: { week: params.week }
    });

    // Check cache first
    try {
      const cachedDigest = await cacheInstance.get(cacheKey);
      if (cachedDigest) {
        return NextResponse.json(cachedDigest);
      }
    } catch (cacheError) {
      // キャッシュエラーは無視して処理を続行
      logger.warn({ err: cacheError }, 'Cache error, continuing without cache');
    }

    const generator = new DigestGenerator(prisma);
    const digest = await generator.getWeeklyDigest(weekDate);

    if (!digest) {
      return NextResponse.json(
        { error: 'Digest not found' },
        { status: 404 }
      );
    }

    // Cache the digest for 1 hour
    try {
      await cacheInstance.set(cacheKey, digest, 3600);
    } catch (cacheError) {
      // キャッシュ保存エラーは無視
      logger.warn({ err: cacheError }, 'Cache set error, continuing without caching');
    }

    return NextResponse.json(digest);
  } catch (_error) {
    // エラーログはサーバー側で記録される
    return NextResponse.json(
      { error: 'Failed to get digest' },
      { status: 500 }
    );
  }
}