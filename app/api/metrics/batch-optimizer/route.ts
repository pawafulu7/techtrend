/**
 * Batch Optimizer Metrics API
 * codex推奨: メトリクス収集とモニタリング
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/get-session';
import {
  validateUser,
  createUserDeletedResponse,
} from '@/lib/middleware/with-user-validation';
import { getAllOptimizerStats } from '@/lib/dataloader/batch-optimizer';
import { getFavoriteLoaderStats } from '@/lib/dataloader/favorite-loader';
import { getViewLoaderStats } from '@/lib/dataloader/article-view-loader';
import type { PartialDataLoaderStats } from '@/lib/types/metrics';
import logger from '@/lib/logger';

export async function GET() {
  try {
    // 管理者権限チェック
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authentication required.' },
        { status: 401 }
      );
    }

    // User existence check (prevent deleted user access)
    const validatedUser = await validateUser(session);
    if (!validatedUser) {
      return createUserDeletedResponse();
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      );
    }
    // オプティマイザーの統計
    const optimizerStats = getAllOptimizerStats();

    // DataLoaderの統計
    const favoriteStats = getFavoriteLoaderStats();
    const viewStats = getViewLoaderStats();

    // 統合メトリクス
    const metrics = {
      timestamp: new Date().toISOString(),
      optimizers: optimizerStats,
      dataloaders: {
        favorite: favoriteStats,
        view: viewStats,
      },
      summary: {
        totalCacheHitRate: calculateTotalHitRate(favoriteStats, viewStats),
        batchSizes: {
          favorite: optimizerStats.favorite?.currentBatchSize || 'N/A',
          view: optimizerStats.view?.currentBatchSize || 'N/A',
        },
        latencyP95: {
          favorite: optimizerStats.favorite?.latencyStats?.p95 || 'N/A',
          view: optimizerStats.view?.latencyStats?.p95 || 'N/A',
        },
      },
    };

    return NextResponse.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch batch optimizer metrics');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch metrics',
      },
      { status: 500 }
    );
  }
}

function calculateTotalHitRate(
  favoriteStats: PartialDataLoaderStats | null,
  viewStats: PartialDataLoaderStats | null
): string {
  const totalHits =
    (favoriteStats?.l1Hits || 0) +
    (favoriteStats?.l2Hits || 0) +
    (viewStats?.l1Hits || 0) +
    (viewStats?.l2Hits || 0);
  const totalRequests =
    (favoriteStats?.totalRequests || 0) + (viewStats?.totalRequests || 0);

  if (totalRequests === 0) {
    return '0%';
  }

  return `${((totalHits / totalRequests) * 100).toFixed(2)}%`;
}
