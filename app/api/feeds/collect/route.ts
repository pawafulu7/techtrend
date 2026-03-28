import { NextRequest, NextResponse } from 'next/server';
import { collectFeeds } from '@/lib/services/feed-collect-service';
import {
  withFeedCollectAuth,
  withFeedCollectTokenAuth,
} from './with-feed-collect-auth';
import { distributedLock } from '@/lib/cache/distributed-lock';
import type { ApiResponse } from '@/types/api';

// Force dynamic to prevent Next.js 16 build-time page data collection
// This route uses jsdom (ESM-only) which fails during static analysis
export const dynamic = 'force-dynamic';

async function collectHandler(_request: NextRequest) {
  try {
    const data = await distributedLock.executeWithLock(
      'feeds:collect',
      () => collectFeeds(),
      300
    );

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: 'Another run in progress',
        } as ApiResponse<never>,
        { status: 423 }
      );
    }
    return NextResponse.json({ success: true, data } as ApiResponse<
      typeof data
    >);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to collect feeds',
        details: error instanceof Error ? error.message : undefined,
      } as ApiResponse<never>,
      { status: 500 }
    );
  }
}

// POST: Bearer + ?token= + admin session
export const POST = withFeedCollectAuth(collectHandler);

// GET: Bearer + ?token= のみ（admin sessionは不可 — GETはCSRF保護対象外のため）
export const GET = withFeedCollectTokenAuth(collectHandler);
