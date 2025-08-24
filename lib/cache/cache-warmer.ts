import { statsCache } from './stats-cache';
import { trendsCache } from './trends-cache';
import { searchCache } from './search-cache';
import { prisma } from '@/lib/database';
import { distributedLock } from './distributed-lock';

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
      keys: ['overall-stats']
    },
    trends: {
      enabled: true,
      priority: 2,
      interval: 1800000, // 30分
      keys: [
        { days: 7, tag: null },
        { days: 30, tag: null },
        { days: 90, tag: null }
      ]
    },
    keywords: {
      enabled: true,
      priority: 3,
      interval: 1800000, // 30分
      keys: ['keywords:trending']
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
        { q: 'ai', limit: 20 }
      ]
    }
  };

  /**
   * 起動時の初期ウォーミング
   */
  async warmOnStartup(): Promise<void> {
    console.error('[CacheWarmer] Starting initial cache warming...');
    
    // 分散ロックを取得（他のインスタンスと競合しない）
    const lockToken = await distributedLock.acquire('cache:warming:startup', this.warmingLockTTL);
    if (!lockToken) {
      console.error('[CacheWarmer] Another instance is already warming the cache');
      return;
    }

    try {
      this.isWarming = true;
      
      // 優先度順にウォーミング
      await this.warmStats();
      await this.warmTrends();
      await this.warmKeywords();
      await this.warmSearchQueries();
      
      console.error('[CacheWarmer] Initial cache warming completed');
    } catch (error) {
      console.error('[CacheWarmer] Error during cache warming:', error);
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
      console.error('[CacheWarmer] Periodic warming already started');
      return;
    }

    console.error('[CacheWarmer] Starting periodic cache warming...');
    
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
      console.error('[CacheWarmer] Periodic warming stopped');
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
      console.error(`[CacheWarmer] Running ${tasks.length} warming tasks`);
      await Promise.allSettled(tasks);
    }
  }

  /**
   * 統計データのウォーミング
   */
  private async warmStats(): Promise<void> {
    console.error('[CacheWarmer] Warming stats cache...');
    
    try {
      const stats = await this.fetchStats();
      await statsCache.set('overall-stats', stats);
      console.error('[CacheWarmer] Stats cache warmed successfully');
    } catch (error) {
      console.error('[CacheWarmer] Failed to warm stats cache:', error);
    }
  }

  /**
   * トレンドデータのウォーミング
   */
  private async warmTrends(): Promise<void> {
    console.error('[CacheWarmer] Warming trends cache...');
    
    try {
      for (const config of this.warmingConfig.trends.keys) {
        const key = trendsCache.generateKey(config);
        const data = await this.fetchTrends(config.days || 30, config.tag || undefined);
        await trendsCache.set(key, data);
      }
      console.error('[CacheWarmer] Trends cache warmed successfully');
    } catch (error) {
      console.error('[CacheWarmer] Failed to warm trends cache:', error);
    }
  }

  /**
   * キーワードデータのウォーミング
   */
  private async warmKeywords(): Promise<void> {
    console.error('[CacheWarmer] Warming keywords cache...');
    
    try {
      const data = await this.fetchKeywords();
      await trendsCache.set('keywords:trending', data);
      console.error('[CacheWarmer] Keywords cache warmed successfully');
    } catch (error) {
      console.error('[CacheWarmer] Failed to warm keywords cache:', error);
    }
  }

  /**
   * 検索クエリのウォーミング
   */
  private async warmSearchQueries(): Promise<void> {
    console.error('[CacheWarmer] Warming search cache...');
    
    try {
      for (const query of this.warmingConfig.search.queries) {
        const key = searchCache.generateKey(query);
        const data = await this.fetchSearchResults(query);
        await searchCache.set(key, data);
      }
      console.error('[CacheWarmer] Search cache warmed successfully');
    } catch (error) {
      console.error('[CacheWarmer] Failed to warm search cache:', error);
    }
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
    const lastRun = (global as unknown)[lastRunKey] || 0;
    
    if (now - lastRun >= config.interval) {
      (global as unknown)[lastRunKey] = now;
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
          createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) }
        }
      })
    ]);
    
    return {
      articleCount,
      sourceCount,
      lastHour: { count: lastHourArticles },
      lastDay: { from: oneDayAgo.toISOString(), to: now.toISOString() }
    };
  }

  /**
   * トレンドデータ取得
   */
  private async fetchTrends(days: number, tag?: string) {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    const whereClause: unknown = {
      publishedAt: { gte: startDate }
    };
    
    if (tag) {
      whereClause.tags = { some: { name: tag } };
    }
    
    const articles = await prisma.article.findMany({
      where: whereClause,
      include: { tags: true, source: true },
      orderBy: { publishedAt: 'desc' },
      take: 100
    });
    
    return { articles, period: { days, tag } };
  }

  /**
   * キーワードデータ取得
   */
  private async fetchKeywords() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentTags = await prisma.$queryRaw`
      SELECT 
        t.id,
        t.name,
        COUNT(DISTINCT a.id) as recent_count
      FROM Tag t
      JOIN _ArticleToTag at ON t.id = at.B
      JOIN Article a ON at.A = a.id
      WHERE a.publishedAt >= ${oneDayAgo.getTime()}
        AND t.name != ''
        AND t.name IS NOT NULL
      GROUP BY t.id, t.name
      ORDER BY recent_count DESC
      LIMIT 20
    ` as { id: string; name: string; recent_count: bigint }[];
    
    return {
      trending: recentTags.map(tag => ({
        id: tag.id,
        name: tag.name,
        recentCount: Number(tag.recent_count)
      })),
      period: { from: oneDayAgo.toISOString(), to: now.toISOString() }
    };
  }

  /**
   * 検索結果取得
   */
  private async fetchSearchResults(query: unknown) {
    const { q, limit = 20 } = query;
    
    // FTSを使用した検索（簡易実装）
    const searchResults = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id 
      FROM articles_fts 
      WHERE articles_fts MATCH ${q}
      ORDER BY rank
      LIMIT ${limit}
    `;
    
    const articleIds = searchResults.map(r => r.id);
    
    const articles = await prisma.article.findMany({
      where: { id: { in: articleIds } },
      include: { source: true, tags: true }
    });
    
    return {
      articles,
      totalCount: articles.length,
      query
    };
  }

  /**
   * ウォーミング状態取得
   */
  getStatus() {
    return {
      isWarming: this.isWarming,
      periodicWarmingActive: this.warmingInterval !== null,
      config: this.warmingConfig
    };
  }

  /**
   * 手動ウォーミング実行
   */
  async warmManual(targets?: string[]): Promise<void> {
    const validTargets = targets || ['stats', 'trends', 'keywords', 'search'];
    
    console.error(`[CacheWarmer] Manual warming for: ${validTargets.join(', ')}`);
    
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
    console.error('[CacheWarmer] Manual warming completed');
  }
}

// シングルトンインスタンス
export const cacheWarmer = new CacheWarmer();