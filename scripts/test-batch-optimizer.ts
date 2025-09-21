/**
 * Test Batch Optimizer
 * codex推奨: 負荷シミュレーションによる動的調整テスト
 */

import { prisma } from '@/lib/prisma';
import { createLoaders } from '@/lib/dataloader';
import { getAllOptimizerStats } from '@/lib/dataloader/batch-optimizer';
import logger from '@/lib/logger';

async function simulateLoad() {
  const userId = 'cmefp5z2m0001tem5epun8j6q';

  // 様々な負荷パターンをシミュレート
  const loadPatterns = [
    { name: '軽負荷', count: 5, delay: 100 },
    { name: '中負荷', count: 20, delay: 50 },
    { name: '高負荷', count: 50, delay: 20 },
    { name: 'バースト', count: 100, delay: 10 },
  ];

  for (const pattern of loadPatterns) {
    logger.info(`\n========== ${pattern.name}パターン開始 ==========`);

    // 記事IDを取得
    const articles = await prisma.article.findMany({
      take: pattern.count,
      orderBy: { publishedAt: 'desc' },
      select: { id: true }
    });

    const articleIds = articles.map(a => a.id);

    // 複数のリクエストをシミュレート
    for (let i = 0; i < 10; i++) {
      const loaders = createLoaders({ userId });

      if (loaders.favorite && loaders.view) {
        const startTime = Date.now();

        // バッチローディングを実行
        await Promise.all([
          loaders.favorite.loadMany(articleIds),
          loaders.view.loadMany(articleIds)
        ]);

        const duration = Date.now() - startTime;
        console.log(`  Request ${i + 1}: ${duration}ms`);

        // 遅延を追加
        await new Promise(resolve => setTimeout(resolve, pattern.delay));
      }
    }

    // 統計を表示
    const stats = getAllOptimizerStats();
    console.log('\n現在の統計:');
    console.log('Favorite Optimizer:');
    console.log(`  バッチサイズ: ${stats.favorite?.currentBatchSize || 'N/A'}`);
    console.log(`  P95レイテンシ: ${stats.favorite?.latencyStats?.p95 || 'N/A'}ms`);
    console.log(`  キャッシュヒット率: ${(stats.favorite?.cacheHitRate * 100).toFixed(1)}%`);

    if (stats.favorite?.recentAdjustments?.length > 0) {
      console.log('  最近の調整:');
      stats.favorite.recentAdjustments.forEach((adj: any) => {
        const time = new Date(adj.timestamp).toLocaleTimeString();
        console.log(`    ${time}: ${adj.oldSize} → ${adj.newSize} (${adj.reason})`);
      });
    }

    console.log('\nView Optimizer:');
    console.log(`  バッチサイズ: ${stats.view?.currentBatchSize || 'N/A'}`);
    console.log(`  P95レイテンシ: ${stats.view?.latencyStats?.p95 || 'N/A'}ms`);
    console.log(`  キャッシュヒット率: ${(stats.view?.cacheHitRate * 100).toFixed(1)}%`);

    if (stats.view?.recentAdjustments?.length > 0) {
      console.log('  最近の調整:');
      stats.view.recentAdjustments.forEach((adj: any) => {
        const time = new Date(adj.timestamp).toLocaleTimeString();
        console.log(`    ${time}: ${adj.oldSize} → ${adj.newSize} (${adj.reason})`);
      });
    }

    // 次のパターンまで待機
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function testMetricsAPI() {
  logger.info('\n========== Metrics API テスト ==========');

  const response = await fetch('http://localhost:3001/api/metrics/batch-optimizer');
  const data = await response.json();

  if (data.success) {
    console.log('\nMetrics API Response:');
    console.log(JSON.stringify(data.data.summary, null, 2));
  } else {
    console.error('Metrics API failed:', data);
  }
}

async function main() {
  try {
    logger.info('バッチオプティマイザーテスト開始');

    // 負荷シミュレーション
    await simulateLoad();

    // Metrics APIテスト
    await testMetricsAPI();

    logger.info('\n✅ テスト完了');

  } catch (error) {
    logger.error('テスト失敗:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();