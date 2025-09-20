/**
 * Batch Optimizer Metrics API
 * codex推奨: メトリクス収集とモニタリング
 */

import { NextResponse } from 'next/server';
import { getAllOptimizerStats } from '@/lib/dataloader/batch-optimizer';
import { getFavoriteLoaderStats } from '@/lib/dataloader/favorite-loader';
import { getViewLoaderStats } from '@/lib/dataloader/article-view-loader';

export async function GET() {
  try {
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
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch metrics',
    }, { status: 500 });
  }
}

function calculateTotalHitRate(favoriteStats: any, viewStats: any): string {
  const totalHits = (favoriteStats?.l1Hits || 0) + (favoriteStats?.l2Hits || 0) +
                    (viewStats?.l1Hits || 0) + (viewStats?.l2Hits || 0);
  const totalRequests = (favoriteStats?.totalRequests || 0) + (viewStats?.totalRequests || 0);

  if (totalRequests === 0) {
    return '0%';
  }

  return `${((totalHits / totalRequests) * 100).toFixed(2)}%`;
}