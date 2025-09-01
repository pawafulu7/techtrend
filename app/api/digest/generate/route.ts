import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DigestGenerator } from '@/lib/services/digest-generator';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger/index';

const cache = new RedisCache({
  ttl: 3600,
  namespace: '@techtrend/cache:digest'
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date } = body;

    const generator = new DigestGenerator(prisma);
    const digestId = await generator.generateWeeklyDigest(
      date ? new Date(date) : undefined
    );

    // Invalidate cache for this week's digest
    if (date) {
      const cacheKey = cache.generateCacheKey('weekly-digest', {
        params: { week: date }
      });
      await cache.del(cacheKey);
    }

    // Also invalidate cache for current week if no date specified
    if (!date) {
      const currentWeek = new Date().toISOString();
      const cacheKey = cache.generateCacheKey('weekly-digest', {
        params: { week: currentWeek }
      });
      await cache.del(cacheKey);
    }

    logger.info(`Weekly digest generated: ${digestId}`);

    return NextResponse.json({ 
      success: true, 
      digestId 
    });
  } catch (error) {
    logger.error('Failed to generate digest:', error);
    return NextResponse.json(
      { error: 'Failed to generate digest' },
      { status: 500 }
    );
  }
}