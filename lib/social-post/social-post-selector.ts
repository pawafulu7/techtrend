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
// Constants
// =============================================================================

/**
 * 海外ソースのID一覧（優先的に選定）
 * - arXiv AI: AI/ML論文
 * - Hacker News: 質の高い海外記事
 * - Hugging Face: AI系
 * - Dev.to, GitHub Blog, OpenAI Blog等
 */
const HIGH_PRIORITY_SOURCE_IDS = [
  'cmfxa7efs0001teo0kjt70c5k', // arXiv AI
  'hacker_news_202508', // Hacker News
  'cmfxa7efj0000teo006dhbox6e', // Hugging Face Papers
  'cmdwmplc10000tec8vg2t9r2o', // Hugging Face Blog
  'cmdq3nww70003tegxm78oydnb', // Dev.to
  'cmfwpq7dc0000te8m6fd12f0x', // OpenAI Blog
  'cmdwmplco0001tec833nye4ak', // Google AI Blog
  'cmdq43ofy0000teolba9vrndf', // Google Developers Blog
  'github_blog_202508', // GitHub Blog
  'cloudflare_blog_202508', // Cloudflare Blog
  'cmdq3nwwz0008tegx2eu8cozq', // Stack Overflow Blog
];

/**
 * 高優先カテゴリ（AI/プラクティス系）
 */
const HIGH_PRIORITY_CATEGORIES: ArticleCategory[] = [
  'ai_ml', // AI/ML全般
  'architecture', // アーキテクチャ・設計
  'testing', // テスト戦略
  'devops', // CI/CD・運用
  'security', // セキュリティ
];

/**
 * 高優先タグ（エンジニアリング文化・プラクティス系）
 */
const HIGH_PRIORITY_TAGS = [
  // AI/LLM関連
  'AIエージェント',
  'RAG',
  'プロンプトエンジニアリング',
  'LLM',
  'Claude Code',
  'MCP',
  // 開発プラクティス
  'CI/CD',
  'SRE',
  'オープンソース',
  'Open Source',
  'アーキテクチャ',
  // 文化・生産性
  'Programming',
  'プログラミング',
  '開発',
];

/**
 * 低優先タグ（ハードウェア・個別ニュース系）
 * これらのタグを持つ記事はスコアを下げる
 */
const LOW_PRIORITY_TAGS = [
  'GPU',
  'EC2',
  'ハードウェア',
  'ベンチマーク',
  'Linux', // OSニュースは控えめに
];

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
   * - 海外ソース・高優先カテゴリ・高優先タグを優先
   * - 低優先タグの記事はスコアを下げる
   * - 既に投稿済みの記事を除外
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

    // 候補記事を取得（タグ情報も含める）
    const candidates = await this.prisma.article.findMany({
      where: {
        id: { notIn: postedArticleIds },
        qualityScore: { gte: opts.minQualityScore },
        createdAt: { gte: cutoffTime },
        skipReason: null,
        summary: { not: null },
      },
      include: {
        tags: { select: { name: true } },
      },
      orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
      take: count * 10, // 多めに取得してスコアリング
    });

    // スコアリング: 品質スコアを尊重し、優先度はタイブレーク程度に
    // 品質スコアは0-100なので、優先度は最大でも±10程度に抑える
    const scored = candidates.map((article) => {
      let priorityScore = 0;

      // 海外ソースボーナス (+5)
      if (HIGH_PRIORITY_SOURCE_IDS.includes(article.sourceId)) {
        priorityScore += 5;
      }

      // 高優先カテゴリボーナス (+3)
      if (
        article.category &&
        HIGH_PRIORITY_CATEGORIES.includes(article.category)
      ) {
        priorityScore += 3;
      }

      // タグベースのスコア調整
      const tagNames = article.tags.map((t) => t.name);

      // 高優先タグボーナス (+2 per tag, max +6)
      const highPriorityTagCount = tagNames.filter((t) =>
        HIGH_PRIORITY_TAGS.includes(t)
      ).length;
      priorityScore += Math.min(highPriorityTagCount * 2, 6);

      // 低優先タグペナルティ (-3 per tag, max -6)
      const lowPriorityTagCount = tagNames.filter((t) =>
        LOW_PRIORITY_TAGS.includes(t)
      ).length;
      priorityScore -= Math.min(lowPriorityTagCount * 3, 6);

      return {
        article,
        priorityScore,
        // 総合スコア = 品質スコア + 優先度スコア（タイブレーク用）
        totalScore: (article.qualityScore || 0) + priorityScore,
      };
    });

    // 総合スコアでソート
    scored.sort((a, b) => b.totalScore - a.totalScore);

    // カテゴリ分散を適用
    const articles = scored.map((s) => s.article);
    return this.diversifyByCategory(articles, count, maxPerCategory);
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
   * 指定記事のタグを取得
   */
  async getArticleTags(articleId: string): Promise<{ name: string }[]> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: {
        tags: {
          select: { name: true },
        },
      },
    });
    return article?.tags || [];
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

  /**
   * 同じタグを持つ過去の記事を取得（時間軸の視点用）
   * 7日以上前の記事から、同じタグを持つものを検索
   */
  async getHistoricalArticlesByTags(
    articleId: string,
    tags: { name: string }[],
    limit: number = 3
  ): Promise<{ title: string; summary: string; publishedAt: Date }[]> {
    if (tags.length === 0) return [];

    const tagNames = tags.map((t) => t.name);

    // 7日以上前の記事から検索（最近の記事との比較のため）
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const articles = await this.prisma.article.findMany({
      where: {
        id: { not: articleId },
        summary: { not: null },
        createdAt: { lt: sevenDaysAgo },
        tags: {
          some: {
            name: { in: tagNames },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        title: true,
        translatedTitle: true,
        summary: true,
        publishedAt: true,
      },
    });

    return articles.map((a) => ({
      title: a.translatedTitle || a.title,
      summary: a.summary || '',
      publishedAt: a.publishedAt,
    }));
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
