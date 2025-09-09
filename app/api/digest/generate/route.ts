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
      ttl: 3600,
      namespace: '@techtrend/cache:digest'
    });
  }
  return cache;
};

export async function POST(request: NextRequest) {
  try {
    // Parse request body with error handling
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { date } = body || {};

    // Validate date if provided
    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format' },
          { status: 400 }
        );
      }
    }

    const generator = new DigestGenerator(prisma);
    const digestId = await generator.generateWeeklyDigest(
      date ? new Date(date) : undefined
    );

    // Invalidate cache for this week's digest
    try {
      if (date) {
        const cacheInstance = getCache();
        const cacheKey = cacheInstance.generateCacheKey('weekly-digest', {
          params: { week: date }
        });
        await cacheInstance.del(cacheKey);
      }

      // Also invalidate cache for current week if no date specified
      if (!date) {
        const currentWeek = new Date().toISOString();
        const cacheInstance = getCache();
        const cacheKey = cacheInstance.generateCacheKey('weekly-digest', {
          params: { week: currentWeek }
        });
        await cacheInstance.del(cacheKey);
      }
    } catch (cacheError) {
      // キャッシュ削除エラーは無視して処理を続行
      logger.warn({ error: cacheError }, 'Cache deletion error, continuing');
    }

    logger.info({ digestId }, 'Weekly digest generated');

    return NextResponse.json({ 
      success: true, 
      digestId 
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate digest');
    return NextResponse.json(
      { error: 'Failed to generate digest' },
      { status: 500 }
    );
  }
}