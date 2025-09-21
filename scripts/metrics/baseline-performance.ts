#!/usr/bin/env npx tsx
/**
 * ベースラインパフォーマンス計測スクリプト
 * DBアクセス最適化Phase 3.3の効果測定用
 */

import { PrismaClient } from '@prisma/client';
import { RedisCache } from '../../lib/cache/redis-cache';
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'info', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
    { level: 'error', emit: 'stdout' },
  ],
});

interface MetricResult {
  timestamp: string;
  test: string;
  queryCount: number;
  executionTime: number;
  cacheHits: number;
  cacheMisses: number;
  avgQueryTime: number;
  maxQueryTime: number;
  minQueryTime: number;
}

class PerformanceMetrics {
  private queryCount = 0;
  private queryTimes: number[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private startTime: number = 0;

  constructor() {
    // Prismaのクエリログを監視
    (prisma as any).$on('query', (e: any) => {
      this.queryCount++;
      this.queryTimes.push(e.duration);
    });
  }

  reset() {
    this.queryCount = 0;
    this.queryTimes = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.startTime = Date.now();
  }

  recordCacheHit() {
    this.cacheHits++;
  }

  recordCacheMiss() {
    this.cacheMisses++;
  }

  getMetrics(testName: string): MetricResult {
    const executionTime = Date.now() - this.startTime;
    const avgQueryTime = this.queryTimes.length > 0
      ? this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length
      : 0;
    const maxQueryTime = this.queryTimes.length > 0
      ? Math.max(...this.queryTimes)
      : 0;
    const minQueryTime = this.queryTimes.length > 0
      ? Math.min(...this.queryTimes)
      : 0;

    return {
      timestamp: new Date().toISOString(),
      test: testName,
      queryCount: this.queryCount,
      executionTime,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      avgQueryTime,
      maxQueryTime,
      minQueryTime,
    };
  }
}

async function testArticleListPerformance(metrics: PerformanceMetrics) {
  console.log('\n📊 Testing /api/articles/list performance...');

  metrics.reset();

  // テスト1: 基本的な記事一覧取得
  const articles = await prisma.article.findMany({
    take: 20,
    orderBy: { publishedAt: 'desc' },
    include: {
      source: true,
      tags: true,
    },
  });

  const result = metrics.getMetrics('article_list_basic');
  console.log(`  ✅ Basic list: ${result.queryCount} queries, ${result.executionTime}ms`);
  return result;
}

async function testArticleListWithFilters(metrics: PerformanceMetrics) {
  console.log('\n📊 Testing filtered article list performance...');

  metrics.reset();

  // テスト2: フィルタ付き記事一覧
  const tagRecords = await prisma.tag.findMany({
    where: { name: { in: ['TypeScript', 'React', 'Next.js'] } },
    select: { id: true },
  });

  const articles = await prisma.article.findMany({
    where: {
      tags: {
        some: {
          id: { in: tagRecords.map(t => t.id) },
        },
      },
    },
    take: 20,
    orderBy: { publishedAt: 'desc' },
    include: {
      source: true,
    },
  });

  const result = metrics.getMetrics('article_list_filtered');
  console.log(`  ✅ Filtered list: ${result.queryCount} queries, ${result.executionTime}ms`);
  return result;
}

async function testUserSpecificData(metrics: PerformanceMetrics) {
  console.log('\n📊 Testing user-specific data loading...');

  metrics.reset();

  // テスト3: ユーザー固有データの取得（お気に入り、既読状態）
  const users = await prisma.user.findMany({ take: 1 });
  if (users.length === 0) {
    console.log('  ⚠️  No users found, skipping test');
    return null;
  }

  const userId = users[0].id;
  const articles = await prisma.article.findMany({
    take: 20,
    orderBy: { publishedAt: 'desc' },
  });

  // N+1クエリ問題のシミュレーション
  for (const article of articles) {
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_articleId: {
          userId,
          articleId: article.id,
        },
      },
    });

    const view = await prisma.articleView.findUnique({
      where: {
        userId_articleId: {
          userId,
          articleId: article.id,
        },
      },
    });
  }

  const result = metrics.getMetrics('user_data_n_plus_1');
  console.log(`  ✅ User data (N+1): ${result.queryCount} queries, ${result.executionTime}ms`);
  return result;
}

async function testBatchedUserData(metrics: PerformanceMetrics) {
  console.log('\n📊 Testing batched user data loading...');

  metrics.reset();

  const users = await prisma.user.findMany({ take: 1 });
  if (users.length === 0) {
    console.log('  ⚠️  No users found, skipping test');
    return null;
  }

  const userId = users[0].id;
  const articles = await prisma.article.findMany({
    take: 20,
    orderBy: { publishedAt: 'desc' },
  });

  const articleIds = articles.map(a => a.id);

  // バッチ取得
  const favorites = await prisma.favorite.findMany({
    where: {
      userId,
      articleId: { in: articleIds },
    },
  });

  const views = await prisma.articleView.findMany({
    where: {
      userId,
      articleId: { in: articleIds },
    },
  });

  const result = metrics.getMetrics('user_data_batched');
  console.log(`  ✅ User data (Batched): ${result.queryCount} queries, ${result.executionTime}ms`);
  return result;
}

async function testCachePerformance(metrics: PerformanceMetrics) {
  console.log('\n📊 Testing cache performance...');

  const cache = new RedisCache({
    ttl: 300,
    namespace: '@techtrend/metrics:test',
  });

  metrics.reset();

  // キャッシュミスのテスト
  const key1 = 'test:articles:page1';
  let cachedData = await cache.get(key1);
  if (!cachedData) {
    metrics.recordCacheMiss();
    const data = await prisma.article.findMany({
      take: 20,
      orderBy: { publishedAt: 'desc' },
    });
    await cache.set(key1, data);
  } else {
    metrics.recordCacheHit();
  }

  // キャッシュヒットのテスト
  for (let i = 0; i < 5; i++) {
    cachedData = await cache.get(key1);
    if (cachedData) {
      metrics.recordCacheHit();
    } else {
      metrics.recordCacheMiss();
    }
  }

  await cache.delete(key1);

  const result = metrics.getMetrics('cache_performance');
  console.log(`  ✅ Cache test: ${result.cacheHits} hits, ${result.cacheMisses} misses`);
  return result;
}

async function main() {
  console.log('🚀 Starting baseline performance measurement...\n');
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Database:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown');
  console.log('Timestamp:', new Date().toISOString());
  console.log('=' .repeat(60));

  const metrics = new PerformanceMetrics();
  const results: MetricResult[] = [];

  try {
    // 各テストを実行
    results.push(await testArticleListPerformance(metrics));
    results.push(await testArticleListWithFilters(metrics));

    const userDataResult = await testUserSpecificData(metrics);
    if (userDataResult) results.push(userDataResult);

    const batchedResult = await testBatchedUserData(metrics);
    if (batchedResult) results.push(batchedResult);

    results.push(await testCachePerformance(metrics));

    // 結果をファイルに保存
    const outputDir = join(process.cwd(), 'metrics-reports');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = join(outputDir, `baseline-${timestamp}.json`);

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
    console.log('📈 PERFORMANCE SUMMARY\n');
    console.log('Test Name                    | Queries | Time(ms) | Avg Query(ms)');
    console.log('-----------------------------|---------|----------|-------------');

    for (const result of results) {
      const testName = result.test.padEnd(28);
      const queries = result.queryCount.toString().padStart(7);
      const time = result.executionTime.toString().padStart(8);
      const avgTime = result.avgQueryTime.toFixed(2).padStart(12);
      console.log(`${testName} | ${queries} | ${time} | ${avgTime}`);
    }

    // 改善可能性の分析
    console.log('\n' + '=' .repeat(60));
    console.log('💡 OPTIMIZATION OPPORTUNITIES\n');

    const n1Result = results.find(r => r.test === 'user_data_n_plus_1');
    const batchResult = results.find(r => r.test === 'user_data_batched');

    if (n1Result && batchResult) {
      const improvement = ((n1Result.queryCount - batchResult.queryCount) / n1Result.queryCount * 100).toFixed(1);
      console.log(`✨ Batching can reduce queries by ${improvement}%`);
      console.log(`   (${n1Result.queryCount} queries → ${batchResult.queryCount} queries)`);
    }

    const cacheResult = results.find(r => r.test === 'cache_performance');
    if (cacheResult) {
      const hitRate = (cacheResult.cacheHits / (cacheResult.cacheHits + cacheResult.cacheMisses) * 100).toFixed(1);
      console.log(`\n📦 Cache hit rate: ${hitRate}%`);
      if (parseFloat(hitRate) < 70) {
        console.log('   ⚠️  Cache hit rate is below target (70%)');
      }
    }

  } catch (error) {
    console.error('❌ Error during measurement:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
main().catch(console.error);