import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DigestGenerator } from '@/lib/services/digest-generator';
import { RedisCache } from '@/lib/cache';

const cache = new RedisCache({
  ttl: 3600,
  namespace: '@techtrend/cache:digest'
});

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
    const cacheKey = cache.generateCacheKey('weekly-digest', {
      params: { week: params.week }
    });

    // Check cache first
    const cachedDigest = await cache.get(cacheKey);
    if (cachedDigest) {
      return NextResponse.json(cachedDigest);
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
    await cache.set(cacheKey, digest, 3600);

    return NextResponse.json(digest);
  } catch (error) {
    // エラーログはサーバー側で記録される
    return NextResponse.json(
      { error: 'Failed to get digest' },
      { status: 500 }
    );
  }
}