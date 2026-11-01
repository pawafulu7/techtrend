#!/usr/bin/env npx tsx
/**
 * バッチサイズ分布計測スクリプト
 * DataLoaderの最適なバッチサイズを決定するための計測
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { writeFileSync } from 'fs';
import { join } from 'path';

const prisma = createPrismaClient();

interface BatchSizeMetrics {
  timestamp: string;
  scenario: string;
  totalRequests: number;
  uniqueIds: number;
  duplicateIds: number;
  batchSizes: number[];
  avgBatchSize: number;
  maxBatchSize: number;
  minBatchSize: number;
  p50BatchSize: number;
  p90BatchSize: number;
  p95BatchSize: number;
  p99BatchSize: number;
}

class BatchSizeAnalyzer {
  private batchSizes: number[] = [];

  recordBatch(size: number) {
    this.batchSizes.push(size);
  }

  getPercentile(percentile: number): number {
    if (this.batchSizes.length === 0) return 0;

    const sorted = [...this.batchSizes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getMetrics(scenario: string, uniqueIds: Set<string>, allIds: string[]): BatchSizeMetrics {
    const duplicateCount = allIds.length - uniqueIds.size;

    return {
      timestamp: new Date().toISOString(),
      scenario,
      totalRequests: allIds.length,
      uniqueIds: uniqueIds.size,
      duplicateIds: duplicateCount,
      batchSizes: [...this.batchSizes],
      avgBatchSize: this.batchSizes.length > 0
        ? this.batchSizes.reduce((a, b) => a + b, 0) / this.batchSizes.length
        : 0,
      maxBatchSize: this.batchSizes.length > 0
        ? Math.max(...this.batchSizes)
        : 0,
      minBatchSize: this.batchSizes.length > 0
        ? Math.min(...this.batchSizes)
        : 0,
      p50BatchSize: this.getPercentile(50),
      p90BatchSize: this.getPercentile(90),
      p95BatchSize: this.getPercentile(95),
      p99BatchSize: this.getPercentile(99),
    };
  }

  reset() {
    this.batchSizes = [];
  }
}

/**
 * 通常の記事一覧表示でのバッチサイズを計測
 */
async function measureArticleListBatches(analyzer: BatchSizeAnalyzer): Promise<BatchSizeMetrics> {
  console.log('\n📊 Measuring article list batch sizes...');
  analyzer.reset();

  const allArticleIds: string[] = [];
  const uniqueArticleIds = new Set<string>();

  // 複数ページの取得をシミュレート
  for (let page = 1; page <= 5; page++) {
    const articles = await prisma.article.findMany({
      take: 20,
      skip: (page - 1) * 20,
      orderBy: { publishedAt: 'desc' },
      select: { id: true },
    });

    const ids = articles.map(a => a.id);
    ids.forEach(id => {
      allArticleIds.push(id);
      uniqueArticleIds.add(id);
    });

    analyzer.recordBatch(ids.length);
    console.log(`  Page ${page}: ${ids.length} articles`);
  }

  const metrics = analyzer.getMetrics('article_list_pagination', uniqueArticleIds, allArticleIds);
  console.log(`  ✅ Total: ${metrics.uniqueIds} unique IDs, avg batch: ${metrics.avgBatchSize.toFixed(1)}`);

  return metrics;
}

/**
 * ユーザー固有データ（お気に入り、既読）のバッチサイズを計測
 */
async function measureUserDataBatches(analyzer: BatchSizeAnalyzer): Promise<BatchSizeMetrics | null> {
  console.log('\n📊 Measuring user-specific data batch sizes...');
  analyzer.reset();

  const users = await prisma.user.findMany({ take: 5 });
  if (users.length === 0) {
    console.log('  ⚠️  No users found, skipping test');
    return null;
  }

  const allArticleIds: string[] = [];
  const uniqueArticleIds = new Set<string>();

  // 複数ユーザーの複数ページアクセスをシミュレート
  for (const user of users) {
    for (let page = 1; page <= 3; page++) {
      const articles = await prisma.article.findMany({
        take: 20,
        skip: (page - 1) * 20,
        orderBy: { publishedAt: 'desc' },
        select: { id: true },
      });

      const ids = articles.map(a => a.id);
      ids.forEach(id => {
        allArticleIds.push(id);
        uniqueArticleIds.add(id);
      });

      analyzer.recordBatch(ids.length);
    }
  }

  const metrics = analyzer.getMetrics('user_data_batches', uniqueArticleIds, allArticleIds);
  console.log(`  ✅ ${users.length} users: ${metrics.uniqueIds} unique, ${metrics.duplicateIds} duplicate IDs`);
  console.log(`     P90 batch size: ${metrics.p90BatchSize}, P99: ${metrics.p99BatchSize}`);

  return metrics;
}

/**
 * タグフィルタリング時のバッチサイズを計測
 */
async function measureTagFilterBatches(analyzer: BatchSizeAnalyzer): Promise<BatchSizeMetrics> {
  console.log('\n📊 Measuring tag filter batch sizes...');
  analyzer.reset();

  // 人気タグのトップ10を取得
  const popularTags = await prisma.tag.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: { articles: true },
      },
    },
    orderBy: {
      articles: {
        _count: 'desc',
      },
    },
    take: 10,
  });

  const allTagNames: string[] = [];
  const uniqueTagNames = new Set<string>();

  // 各種フィルタパターンをシミュレート
  const filterPatterns = [
    ['TypeScript', 'React', 'Next.js'],
    ['JavaScript', 'Node.js'],
    ['Docker', 'Kubernetes', 'DevOps'],
    ['AI', 'Machine Learning'],
    ['Security', 'Authentication'],
  ];

  for (const pattern of filterPatterns) {
    // 実際のAPIと同様にタグ名からIDを解決
    pattern.forEach(name => {
      allTagNames.push(name);
      uniqueTagNames.add(name);
    });

    analyzer.recordBatch(pattern.length);
    console.log(`  Filter: [${pattern.join(', ')}] - ${pattern.length} tags`);
  }

  const metrics = analyzer.getMetrics('tag_filter_batches', uniqueTagNames, allTagNames);
  console.log(`  ✅ ${filterPatterns.length} patterns: avg ${metrics.avgBatchSize.toFixed(1)} tags per filter`);

  return metrics;
}

/**
 * 無限スクロール時のバッチサイズを計測
 */
async function measureInfiniteScrollBatches(analyzer: BatchSizeAnalyzer): Promise<BatchSizeMetrics> {
  console.log('\n📊 Measuring infinite scroll batch sizes...');
  analyzer.reset();

  const allArticleIds: string[] = [];
  const uniqueArticleIds = new Set<string>();

  // 無限スクロールで深いページまでアクセス
  const totalPages = 20;
  const pageSize = 20;

  for (let page = 1; page <= totalPages; page++) {
    const articles = await prisma.article.findMany({
      take: pageSize,
      skip: (page - 1) * pageSize,
      orderBy: { publishedAt: 'desc' },
      select: { id: true },
    });

    if (articles.length === 0) break;

    const ids = articles.map(a => a.id);
    ids.forEach(id => {
      allArticleIds.push(id);
      uniqueArticleIds.add(id);
    });

    analyzer.recordBatch(ids.length);

    if (page % 5 === 0) {
      console.log(`  Page ${page}: cumulative ${uniqueArticleIds.size} articles`);
    }
  }

  const metrics = analyzer.getMetrics('infinite_scroll', uniqueArticleIds, allArticleIds);
  console.log(`  ✅ ${totalPages} pages: max batch ${metrics.maxBatchSize}, P95: ${metrics.p95BatchSize}`);

  return metrics;
}

/**
 * 最適なバッチサイズの推奨を生成
 */
function generateRecommendations(allMetrics: BatchSizeMetrics[]): void {
  console.log('\n' + '=' .repeat(60));
  console.log('🎯 BATCH SIZE RECOMMENDATIONS\n');

  // 全シナリオのP95値を収集
  const p95Values = allMetrics
    .filter(m => m !== null)
    .map(m => m.p95BatchSize);

  const p99Values = allMetrics
    .filter(m => m !== null)
    .map(m => m.p99BatchSize);

  const maxBatchSizes = allMetrics
    .filter(m => m !== null)
    .map(m => m.maxBatchSize);

  const overallP95 = Math.max(...p95Values);
  const overallP99 = Math.max(...p99Values);
  const overallMax = Math.max(...maxBatchSizes);

  console.log(`📈 Statistical Summary:`);
  console.log(`   P95 across all scenarios: ${overallP95}`);
  console.log(`   P99 across all scenarios: ${overallP99}`);
  console.log(`   Max batch size observed: ${overallMax}`);

  console.log(`\n💡 Recommendations:`);

  // 推奨バッチサイズの計算
  const recommendedSize = Math.min(200, Math.max(100, Math.ceil(overallP99 * 1.2)));

  console.log(`   1. Set maxBatchSize to ${recommendedSize}`);
  console.log(`      (Based on P99 * 1.2 with bounds [100, 200])`);

  if (overallMax > 200) {
    console.log(`\n   ⚠️  Warning: Maximum observed batch size (${overallMax}) exceeds recommended limit`);
    console.log(`      Consider implementing chunk splitting for large batches`);
  }

  // 重複率の分析
  const duplicateRates = allMetrics
    .filter(m => m !== null)
    .map(m => m.duplicateIds / Math.max(1, m.totalRequests) * 100);

  const avgDuplicateRate = duplicateRates.reduce((a, b) => a + b, 0) / duplicateRates.length;

  if (avgDuplicateRate > 10) {
    console.log(`\n   2. High duplicate rate detected (${avgDuplicateRate.toFixed(1)}%)`);
    console.log(`      DataLoader caching will be highly effective`);
  }

  console.log(`\n   3. Chunk size for DB queries: ${Math.ceil(recommendedSize / 3)}`);
  console.log(`      (Recommended: maxBatchSize / 3 for parallel processing)`);
}

async function main() {
  console.log('🚀 Starting batch size measurement...\n');
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Timestamp:', new Date().toISOString());
  console.log('=' .repeat(60));

  const analyzer = new BatchSizeAnalyzer();
  const results: BatchSizeMetrics[] = [];

  try {
    // 各シナリオでバッチサイズを計測
    results.push(await measureArticleListBatches(analyzer));

    const userDataResult = await measureUserDataBatches(analyzer);
    if (userDataResult) results.push(userDataResult);

    results.push(await measureTagFilterBatches(analyzer));
    results.push(await measureInfiniteScrollBatches(analyzer));

    // 結果をファイルに保存
    const outputDir = join(process.cwd(), 'metrics-reports');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = join(outputDir, `batch-sizes-${timestamp}.json`);

    // ディレクトリ作成
    const fs = await import('fs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // JSONファイルに保存
    writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n📁 Results saved to: ${outputFile}`);

    // サマリー表示
    console.log('\n' + '=' .repeat(60));
    console.log('📊 BATCH SIZE DISTRIBUTION SUMMARY\n');
    console.log('Scenario                   | Avg  | P50  | P90  | P95  | P99  | Max');
    console.log('---------------------------|------|------|------|------|------|----');

    for (const result of results.filter(r => r !== null)) {
      const scenario = result.scenario.padEnd(26);
      const avg = result.avgBatchSize.toFixed(1).padStart(4);
      const p50 = result.p50BatchSize.toString().padStart(4);
      const p90 = result.p90BatchSize.toString().padStart(4);
      const p95 = result.p95BatchSize.toString().padStart(4);
      const p99 = result.p99BatchSize.toString().padStart(4);
      const max = result.maxBatchSize.toString().padStart(3);

      console.log(`${scenario} | ${avg} | ${p50} | ${p90} | ${p95} | ${p99} | ${max}`);
    }

    // 推奨事項の生成
    generateRecommendations(results);

  } catch (error) {
    console.error('❌ Error during measurement:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
main().catch(console.error);