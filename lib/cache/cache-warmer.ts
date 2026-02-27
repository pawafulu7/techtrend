import { statsCache } from './stats-cache';
import { trendsCache } from './trends-cache';
import { searchCache } from './search-cache';
import { keywordsCache } from './keywords-cache';
import { prisma } from '@/lib/database';
import { logger } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis/client';
import type { Prisma } from '@prisma/client';
import pLimit from 'p-limit';

/**
 * キャッシュウォーミング機能
 * 重要なデータを事前にキャッシュに読み込む
 */
export class CacheWarmer {
  private isWarming = false;
  private redis = getRedisClient();
  private static readonly LAST_RUN_PREFIX = 'cache-warmer:lastRun:';

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
   * 定期的なウォーミングを開始（非推奨）
   * @deprecated 外部cron（GHAスケジューラ）を使用してください
   */
  startPeriodicWarming(): void {
    logger.warn(
      '[CacheWarmer] startPeriodicWarming is deprecated. Use external cron (GHA scheduler) instead.'
    );
  }

  /**
   * 定期的なウォーミングを停止（非推奨）
   * @deprecated 外部cron（GHAスケジューラ）を使用してください
   */
  stopPeriodicWarming(): void {
    logger.warn(
      '[CacheWarmer] stopPeriodicWarming is deprecated. Use external cron (GHA scheduler) instead.'
    );
  }

  /**
   * 定期ウォーミング実行
   */
  private async performPeriodicWarming(): Promise<void> {
    const tasks: { type: string; task: Promise<void> }[] = [];

    if (await this.shouldWarm('stats', Date.now())) {
      tasks.push({ type: 'stats', task: this.warmStats() });
    }
    if (await this.shouldWarm('trends', Date.now())) {
      tasks.push({ type: 'trends', task: this.warmTrends() });
    }
    if (await this.shouldWarm('keywords', Date.now())) {
      tasks.push({ type: 'keywords', task: this.warmKeywords() });
    }
    if (await this.shouldWarm('search', Date.now())) {
      tasks.push({ type: 'search', task: this.warmSearchQueries() });
    }

    if (tasks.length > 0) {
      const results = await Promise.allSettled(tasks.map((t) => t.task));
      // Record successful runs ONLY
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'fulfilled') {
          await this.recordWarmingRun(tasks[i].type);
        }
      }
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
   * ウォーミングが必要か判定（Redisベース）
   */
  private async shouldWarm(type: string, _now: number): Promise<boolean> {
    const config = this.warmingConfig[type as keyof typeof this.warmingConfig];
    if (!config || !config.enabled) {
      return false;
    }

    try {
      const key = `${CacheWarmer.LAST_RUN_PREFIX}${type}`;
      const lastRunStr = await this.redis.get(key);
      const lastRun = lastRunStr ? parseInt(lastRunStr, 10) : 0;
      return Date.now() - lastRun >= config.interval;
    } catch {
      // On Redis error, allow warming (fail-open)
      return true;
    }
  }

  /**
   * ウォーミング実行成功を記録
   */
  private async recordWarmingRun(type: string): Promise<void> {
    try {
      const key = `${CacheWarmer.LAST_RUN_PREFIX}${type}`;
      // Store timestamp with TTL of 2x the interval (auto-cleanup)
      const config =
        this.warmingConfig[type as keyof typeof this.warmingConfig];
      const ttl = config ? Math.ceil(config.interval / 1000) * 2 : 7200;
      await this.redis.setex(key, ttl, String(Date.now()));
    } catch {
      // Non-critical - next check will just re-warm
    }
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
      config: this.warmingConfig,
    };
  }

  /**
   * 手動ウォーミング実行
   */
  async warmManual(targets?: string[]): Promise<void> {
    const validTargets = targets || ['stats', 'trends', 'keywords', 'search'];
    const tasks: { type: string; task: Promise<void> }[] = [];

    for (const target of validTargets) {
      if (await this.shouldWarm(target, Date.now())) {
        if (target === 'stats')
          tasks.push({ type: 'stats', task: this.warmStats() });
        else if (target === 'trends')
          tasks.push({ type: 'trends', task: this.warmTrends() });
        else if (target === 'keywords')
          tasks.push({ type: 'keywords', task: this.warmKeywords() });
        else if (target === 'search')
          tasks.push({ type: 'search', task: this.warmSearchQueries() });
      }
    }

    const results = await Promise.allSettled(tasks.map((t) => t.task));
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        await this.recordWarmingRun(tasks[i].type);
      }
    }
  }
}

// シングルトンインスタンス
export const cacheWarmer = new CacheWarmer();
