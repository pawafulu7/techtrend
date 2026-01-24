/**
 * Social Post Selector
 *
 * 投稿候補の選定ロジック
 */

import {
  type PrismaClient,
  type Article,
  type TrendReport,
  type DiffSummary,
  ArticleCategory,
} from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

interface SelectionOptions {
  maxPerCategory?: number;
  minQualityScore?: number;
  hoursBack?: number;
}

const DEFAULT_OPTIONS: Required<SelectionOptions> = {
  maxPerCategory: 2,
  minQualityScore: 50,
  hoursBack: 24,
};

// =============================================================================
// Selector Class
// =============================================================================

export class SocialPostSelector {
  constructor(private prisma: PrismaClient) {}

  /**
   * 投稿候補の記事を選定
   * - 既に投稿済みの記事を除外
   * - 品質スコアでフィルタリング
   * - カテゴリ分散を考慮
   */
  async selectArticles(
    count: number,
    options: SelectionOptions = {}
  ): Promise<Article[]> {
    // 入力バリデーション: count <= 0 の場合は空配列を返す
    if (count <= 0) {
      return [];
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };
    // maxPerCategory は最低1以上を保証
    const maxPerCategory = Math.max(1, opts.maxPerCategory);

    const now = new Date();
    const cutoffTime = new Date(
      now.getTime() - opts.hoursBack * 60 * 60 * 1000
    );

    // 既に投稿済みの記事IDを取得
    const postedArticleIds = await this.getPostedSourceIds('ARTICLE');

    // 候補記事を取得（スコアリング）
    // createdAt（取り込み日）を基準に抽出
    const candidates = await this.prisma.article.findMany({
      where: {
        id: { notIn: postedArticleIds },
        qualityScore: { gte: opts.minQualityScore },
        createdAt: { gte: cutoffTime },
        skipReason: null,
        summary: { not: null },
      },
      orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
      take: count * 3, // 多めに取得してカテゴリ分散
    });

    // カテゴリ分散（同一カテゴリは最大N件）
    return this.diversifyByCategory(candidates, count, maxPerCategory);
  }

  /**
   * 今日のDaily Trendを選定
   */
  async selectDailyTrend(): Promise<TrendReport | null> {
    // UTC midnight を明示的に計算（サーバーローカルTZに依存しない）
    const now = new Date();
    const utcMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    // 既に投稿済みのDaily Trend IDを取得
    const postedIds = await this.getPostedSourceIds('DAILY_TREND');

    return this.prisma.trendReport.findFirst({
      where: {
        id: { notIn: postedIds },
        periodType: 'DAILY',
        periodStart: { gte: utcMidnight },
        aiSummary: { not: null },
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  /**
   * 最新のDiff Summaryを選定
   */
  async selectDiffSummary(): Promise<DiffSummary | null> {
    // 既に投稿済みのDiff Summary IDを取得
    const postedIds = await this.getPostedSourceIds('DIFF_SUMMARY');

    return this.prisma.diffSummary.findFirst({
      where: {
        id: { notIn: postedIds },
        status: 'SUCCESS',
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  /**
   * 指定IDの記事を取得
   */
  async getArticleById(id: string): Promise<Article | null> {
    return this.prisma.article.findUnique({
      where: { id },
    });
  }

  /**
   * 指定IDのTrendReportを取得
   */
  async getTrendReportById(id: string): Promise<TrendReport | null> {
    return this.prisma.trendReport.findUnique({
      where: { id },
    });
  }

  /**
   * 指定IDのDiffSummaryを取得
   */
  async getDiffSummaryById(id: string): Promise<DiffSummary | null> {
    return this.prisma.diffSummary.findUnique({
      where: { id },
    });
  }

  /**
   * 複数記事を一括取得
   */
  async getArticlesByIds(ids: string[]): Promise<Article[]> {
    const articles = await this.prisma.article.findMany({
      where: { id: { in: ids } },
    });
    // 入力IDの順序を保証するためMapで再整列
    const map = new Map(articles.map((a) => [a.id, a]));
    return ids.map((id) => map.get(id)).filter(Boolean) as Article[];
  }

  /**
   * 関連トレンドを取得（同カテゴリの最近のトピック）
   */
  async getRelatedTrends(
    category: string | null,
    limit: number = 5
  ): Promise<string[]> {
    if (!category) return [];

    const recentTrend = await this.prisma.trendReport.findFirst({
      where: {
        periodType: 'DAILY',
        aiSummary: { not: null },
      },
      orderBy: { periodStart: 'desc' },
      select: { topArticles: true },
    });

    if (!recentTrend?.topArticles) return [];

    // topArticlesから関連トピックを抽出（型安全なバリデーション）
    const topArticles = recentTrend.topArticles;
    if (!Array.isArray(topArticles)) return [];

    return topArticles
      .filter((a): a is { title: string; category?: string } => {
        if (typeof a !== 'object' || a === null || Array.isArray(a)) {
          return false;
        }
        const obj = a as Record<string, unknown>;
        return typeof obj.title === 'string' && obj.category === category;
      })
      .slice(0, limit)
      .map((a) => a.title);
  }

  /**
   * 同カテゴリの最近の記事タイトルを取得
   */
  async getRecentArticleTitles(
    category: string | null,
    excludeId: string,
    limit: number = 5
  ): Promise<string[]> {
    if (!category) return [];

    // Validate category against ArticleCategory enum
    const validCategories = Object.values(ArticleCategory);
    if (!validCategories.includes(category as ArticleCategory)) {
      return [];
    }

    const articles = await this.prisma.article.findMany({
      where: {
        category: category as ArticleCategory,
        id: { not: excludeId },
        summary: { not: null },
      },
      orderBy: { createdAt: 'desc' }, // 取り込み日基準に統一
      take: limit,
      select: { translatedTitle: true, title: true },
    });

    return articles.map((a) => a.translatedTitle || a.title);
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * 既に投稿済みのソースIDを取得
   */
  private async getPostedSourceIds(
    source: 'ARTICLE' | 'DAILY_TREND' | 'DIFF_SUMMARY'
  ): Promise<string[]> {
    const posts = await this.prisma.socialPost.findMany({
      where: {
        source,
        status: { notIn: ['ARCHIVED'] },
      },
      select: { sourceIds: true },
    });

    // 重複を排除してユニークなIDのみ返す
    const ids = posts.flatMap((p) => p.sourceIds);
    return [...new Set(ids)];
  }

  /**
   * カテゴリで分散させる
   */
  private diversifyByCategory<T extends { category?: string | null }>(
    items: T[],
    count: number,
    maxPerCategory: number
  ): T[] {
    const selected: T[] = [];
    const categoryCount: Record<string, number> = {};

    for (const item of items) {
      const category = item.category || 'other';
      const currentCount = categoryCount[category] || 0;

      if (currentCount < maxPerCategory) {
        selected.push(item);
        categoryCount[category] = currentCount + 1;

        if (selected.length >= count) {
          break;
        }
      }
    }

    return selected;
  }
}
