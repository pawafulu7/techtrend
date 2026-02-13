import { statsCache } from './stats-cache';
import { trendsCache } from './trends-cache';
import { searchCache } from './search-cache';
import { keywordsCache } from './keywords-cache';
import { prisma } from '@/lib/database';
import { distributedLock } from './distributed-lock';
import { logger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';
import pLimit from 'p-limit';

/**
 * キャッシュウォーミング機能
 * 重要なデータを事前にキャッシュに読み込む
 */
export class CacheWarmer {
  private isWarming = false;
  private warmingInterval: NodeJS.Timeout | null = null;
  private readonly warmingLockTTL = 300; // 5分

  /**
   * ウォーミング設定
   */
  private readonly warmingConfig = {
    stats: {
      enabled: true,
      priority: 1,
      interval: 3600000, // 1時間
      keys: ['overall-stats'],
    },
    trends: {
      enabled: true,
      priority: 2,
      interval: 1800000, // 30分
      keys: [
        { days: 7, tag: null },
        { days: 30, tag: null },
        { days: 90, tag: null },
      ],
    },
    keywords: {
      enabled: true,
      priority: 3,
      interval: 1800000, // 30分
      keys: ['keywords:trending'],
    },
    search: {
      enabled: true,
      priority: 4,
      interval: 600000, // 10分
      queries: [
        { q: 'javascript', limit: 20 },
        { q: 'typescript', limit: 20 },
        { q: 'react', limit: 20 },
        { q: 'nodejs', limit: 20 },
        { q: 'ai', limit: 20 },
      ],
    },
  };

  /**
   * 起動時の初期ウォーミング
   */
  async warmOnStartup(): Promise<void> {
    // 分散ロックを取得（他のインスタンスと競合しない）
    const lockToken = await distributedLock.acquire(
      'cache:warming:startup',
      this.warmingLockTTL
    );
    if (!lockToken) {
      return;
    }

    try {
      this.isWarming = true;

      // 並列ウォーミング（4つのタスクを同時実行、部分失敗を許容）
      const results = await Promise.allSettled([
        this.warmStats(),
        this.warmTrends(),
        this.warmKeywords(),
        this.warmSearchQueries(),
      ]);

      // 失敗したタスクをログ出力
      const taskNames = ['stats', 'trends', 'keywords', 'search'];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error(
            { error: result.reason },
            `[CacheWarmer] ${taskNames[index]} warming failed`
          );
        }
      });
    } finally {
      this.isWarming = false;
      await distributedLock.release('cache:warming:startup', lockToken);
    }
  }

  /**
   * 定期的なウォーミングを開始
   */
  startPeriodicWarming(): void {
    if (this.warmingInterval) {
      return;
    }

    // 最小間隔で実行（10分）
    const minInterval = 600000;
    this.warmingInterval = setInterval(async () => {
      await this.performPeriodicWarming();
    }, minInterval);
  }

  /**
   * 定期的なウォーミングを停止
   */
  stopPeriodicWarming(): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
      this.warmingInterval = null;
    }
  }

  /**
   * 定期ウォーミング実行
   */
  private async performPeriodicWarming(): Promise<void> {
    const now = Date.now();

    // 各設定をチェックして必要なものだけ実行
    const tasks: Promise<void>[] = [];

    if (this.shouldWarm('stats', now)) {
      tasks.push(this.warmStats());
    }

    if (this.shouldWarm('trends', now)) {
      tasks.push(this.warmTrends());
    }

    if (this.shouldWarm('keywords', now)) {
      tasks.push(this.warmKeywords());
    }

    if (this.shouldWarm('search', now)) {
      tasks.push(this.warmSearchQueries());
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }

  /**
   * 統計データのウォーミング
   */
  private async warmStats(): Promise<void> {
    const stats = await this.fetchStats();
    await statsCache.set('overall-stats', stats);
  }

  /**
   * トレンドデータのウォーミング（並列実行、部分失敗を許容）
   */
  private async warmTrends(): Promise<void> {
    const trendKeys = this.warmingConfig.trends.keys;

    // Promise.allSettledで部分的な失敗を許容（1つ失敗しても他は継続）
    const results = await Promise.allSettled(
      trendKeys.map(async (config) => {
        const key = `${config.days}:${config.tag || 'all'}`;
        const data = await this.fetchTrends(
          config.days || 30,
          config.tag || undefined
        );
        await trendsCache.set(key, data);
      })
    );

    // 失敗したタスクをログ出力
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const config = trendKeys[index];
        logger.error(
          { error: result.reason },
          `[CacheWarmer] trends warming failed for ${config.days} days`
        );
      }
    });
  }

  /**
   * キーワードデータのウォーミング
   */
  private async warmKeywords(): Promise<void> {
    const data = await this.fetchKeywords();
    await keywordsCache.set('keywords:trending', data);
  }

  /**
   * 検索クエリのウォーミング（並列実行、同時実行数制限付き、部分失敗を許容）
   */
  private async warmSearchQueries(): Promise<void> {
    const limit = pLimit(3); // DBアクセスを伴うため同時実行を3に制限
    const searchQueries = this.warmingConfig.search.queries;

    const results = await Promise.allSettled(
      searchQueries.map((query) =>
        limit(async () => {
          const key = searchCache.generateQueryKey(query);
          const data = await this.fetchSearchResults(query);
          await searchCache.set(key, data);
        })
      )
    );

    // 失敗したクエリをログ出力
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const query = searchQueries[index];
        logger.error(
          { error: result.reason },
          `[CacheWarmer] search warming failed for query: ${query.q}`
        );
      }
    });
  }

  /**
   * ウォーミングが必要か判定
   */
  private shouldWarm(type: string, now: number): boolean {
    const config = this.warmingConfig[type as keyof typeof this.warmingConfig];
    if (!config || !config.enabled) {
      return false;
    }

    // 最後の実行時刻を記録（簡易実装）
    const lastRunKey = `lastWarm:${type}`;
    const globalWithLastRun = global as typeof globalThis & {
      [key: string]: number;
    };
    const lastRun = globalWithLastRun[lastRunKey] || 0;

    if (now - lastRun >= config.interval) {
      globalWithLastRun[lastRunKey] = now;
      return true;
    }

    return false;
  }

  /**
   * 統計データ取得
   */
  private async fetchStats() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [articleCount, sourceCount, lastHourArticles] = await Promise.all([
      prisma.article.count(),
      prisma.source.count({ where: { enabled: true } }),
      prisma.article.count({
        where: {
          createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      articleCount,
      sourceCount,
      lastHour: { count: lastHourArticles },
      lastDay: { from: oneDayAgo.toISOString(), to: now.toISOString() },
    };
  }

  /**
   * トレンドデータ取得
   */
  private async fetchTrends(days: number, tag?: string) {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const whereClause: Prisma.ArticleWhereInput = {
      publishedAt: { gte: startDate },
    };

    if (tag) {
      whereClause.tags = { some: { name: tag } };
    }

    const articles = await prisma.article.findMany({
      where: whereClause,
      include: { tags: true, source: true },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });

    return { articles, period: { days, tag } };
  }

  /**
   * キーワードデータ取得
   */
  private async fetchKeywords() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentTags = (await prisma.$queryRaw`
      SELECT
        t.id,
        t.name,
        COUNT(DISTINCT a.id) as recent_count
      FROM "Tag" t
      JOIN "_ArticleToTag" at ON t.id = at."B"
      JOIN "Article" a ON at."A" = a.id
      WHERE a."publishedAt" >= ${oneDayAgo.toISOString()}::timestamp
        AND t.name != ''
        AND t.name IS NOT NULL
      GROUP BY t.id, t.name
      ORDER BY recent_count DESC
      LIMIT 20
    `) as { id: string; name: string; recent_count: bigint }[];

    return {
      trending: recentTags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        recentCount: Number(tag.recent_count),
      })),
      period: { from: oneDayAgo.toISOString(), to: now.toISOString() },
    };
  }

  /**
   * 検索結果取得
   */
  private async fetchSearchResults(query: { q: string; limit?: number }) {
    const { q, limit = 20 } = query;

    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { translatedTitle: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { source: true, tags: true },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });

    return {
      articles,
      totalCount: articles.length,
      query,
    };
  }

  /**
   * ウォーミング状態取得
   */
  getStatus() {
    return {
      isWarming: this.isWarming,
      periodicWarmingActive: this.warmingInterval !== null,
      config: this.warmingConfig,
    };
  }

  /**
   * 手動ウォーミング実行
   */
  async warmManual(targets?: string[]): Promise<void> {
    const validTargets = targets || ['stats', 'trends', 'keywords', 'search'];

    const tasks: Promise<void>[] = [];

    if (validTargets.includes('stats')) {
      tasks.push(this.warmStats());
    }
    if (validTargets.includes('trends')) {
      tasks.push(this.warmTrends());
    }
    if (validTargets.includes('keywords')) {
      tasks.push(this.warmKeywords());
    }
    if (validTargets.includes('search')) {
      tasks.push(this.warmSearchQueries());
    }

    await Promise.allSettled(tasks);
  }
}

// シングルトンインスタンス
export const cacheWarmer = new CacheWarmer();
