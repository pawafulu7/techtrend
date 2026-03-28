import { NextRequest, NextResponse } from 'next/server';
import { collectFeeds } from '@/lib/services/feed-collect-service';
import { withFeedCollectAuth } from './with-feed-collect-auth';
import { distributedLock } from '@/lib/cache/distributed-lock';
import type { ApiResponse } from '@/types/api';

// Force dynamic to prevent Next.js 16 build-time page data collection
// This route uses jsdom (ESM-only) which fails during static analysis
export const dynamic = 'force-dynamic';

async function collectHandler(_request: NextRequest) {
  const result = await distributedLock.executeWithLock(
    'feeds:collect',
    async () => {
      const data = await collectFeeds();
      return NextResponse.json({
        success: true,
        data,
      } as ApiResponse<typeof data>);
    },
    300
  );

  if (!result) {
    return NextResponse.json(
      {
        success: false,
        error: 'Another run in progress',
      } as ApiResponse<never>,
      { status: 423 }
    );
  }
  return result;
}

export const POST = withFeedCollectAuth(collectHandler);

// Allow manual triggering via GET with token
export const GET = withFeedCollectAuth(collectHandler);
