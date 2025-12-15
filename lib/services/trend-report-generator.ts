import { PrismaClient, Prisma, TrendPeriodType } from '@prisma/client';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import logger from '@/lib/logger/index';
import { GEMINI_API } from '@/lib/constants';

// カテゴリタグ定義（大文字小文字を区別しない比較用）
const CATEGORY_TAGS = {
  'Frontend': ['React', 'Vue', 'Angular', 'CSS', 'JavaScript', 'TypeScript', 'Next.js', 'Svelte'],
  'Backend': ['Node.js', 'Python', 'Ruby', 'Go', 'Java', 'PHP', 'Rails', 'Django', 'FastAPI'],
  'AI/ML': ['AI', 'LLM', 'Claude', 'GPT', 'Gemini', '機械学習', 'ChatGPT', 'OpenAI', 'Anthropic', 'RAG'],
  'Security': ['セキュリティ', 'Security', '脆弱性', 'CVE', 'XSS', 'CSRF', '認証'],
  'DevOps': ['Docker', 'Kubernetes', 'CI/CD', 'AWS', 'GCP', 'Azure', 'Jenkins', 'GitHub Actions'],
  'Database': ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQL', 'NoSQL', 'Prisma'],
  'Mobile': ['iOS', 'Android', 'Flutter', 'React Native', 'Swift', 'Kotlin']
} as const;

// 型定義
type ArticleWithRelations = Prisma.ArticleGetPayload<{
  include: {
    tags: true;
    source: true;
    _count: {
      select: {
        articleViews: true;
        favorites: true;
      }
    }
  }
}>;

export interface TopArticleInfo {
  id: string;
  title: string;
  translatedTitle?: string | null;
  url: string;
  sourceName: string;
  viewCount: number;
  favoriteCount: number;
  score: number;
  tags: string[];
}

export interface CategoryInfo {
  name: string;
  count: number;
  percentage: number;
  topArticle: {
    id: string;
    title: string;
    translatedTitle?: string | null;
  } | null;
}

export interface TagInfo {
  name: string;
  count: number;
  percentage: number;
}

export interface TrendReportData {
  periodType: TrendPeriodType;
  periodStart: Date;
  periodEnd: Date;
  articleCount: number;
  topArticles: TopArticleInfo[];
  categories: CategoryInfo[];
  tags: TagInfo[];
  aiSummary?: string;
  aiModel?: string;
  promptVersion?: string;
  generatedAt?: Date;
}

// プロンプトバージョン管理
const PROMPT_VERSION = '1.0.0';

export class TrendReportGenerator {
  private prisma: PrismaClient;
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;

    // Gemini API初期化（オプション）
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: GEMINI_API.MODEL,
      });
    }
  }

  /**
   * 日間トレンドレポートを生成
   */
  async generateDailyReport(targetDate?: Date): Promise<string> {
    const date = targetDate || new Date();
    const { start, end } = this.getDayRangeJST(date);

    return this.generateReport(TrendPeriodType.DAILY, start, end);
  }

  /**
   * 週間トレンドレポートを生成
   */
  async generateWeeklyReport(targetDate?: Date): Promise<string> {
    const date = targetDate || new Date();
    const { start, end } = this.getWeekRangeJST(date);

    return this.generateReport(TrendPeriodType.WEEKLY, start, end);
  }

  /**
   * 月間トレンドレポートを生成
   */
  async generateMonthlyReport(targetDate?: Date): Promise<string> {
    const date = targetDate || new Date();
    const { start, end } = this.getMonthRangeJST(date);

    return this.generateReport(TrendPeriodType.MONTHLY, start, end);
  }

  /**
   * トレンドレポートを生成（共通処理）
   */
  private async generateReport(
    periodType: TrendPeriodType,
    periodStart: Date,
    periodEnd: Date
  ): Promise<string> {
    try {
      // 既存レポートチェック
      const existing = await this.prisma.trendReport.findUnique({
        where: {
          periodType_periodStart: {
            periodType,
            periodStart
          }
        }
      });

      if (existing) {
        logger.info(`Trend report already exists for ${periodType} starting ${periodStart.toISOString()}`);
        return existing.id;
      }

      // 記事データ取得
      const articles = await this.fetchArticles(periodStart, periodEnd);

      if (articles.length === 0) {
        logger.warn(`No articles found for ${periodType} period ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);
      }

      // 統計計算
      const topArticles = this.calculateTopArticles(articles);
      const categories = this.calculateCategories(articles);
      const tags = this.calculateTags(articles);

      // AI要約生成（オプション）
      let aiSummary: string | undefined;
      let aiModel: string | undefined;
      let generatedAt: Date | undefined;

      if (this.model && articles.length > 0) {
        try {
          aiSummary = await this.generateAISummary(periodType, articles, topArticles, categories, tags);
          aiModel = GEMINI_API.MODEL;
          generatedAt = new Date();
        } catch (error) {
          logger.error('Failed to generate AI summary', error);
          // AI生成失敗でもレポートは保存する
        }
      }

      // レポート保存
      const report = await this.prisma.trendReport.create({
        data: {
          periodType,
          periodStart,
          periodEnd,
          articleCount: articles.length,
          topArticles: JSON.parse(JSON.stringify(topArticles.slice(0, 10))),
          categories: JSON.parse(JSON.stringify(categories)),
          tags: JSON.parse(JSON.stringify(tags.slice(0, 30))),
          aiSummary,
          aiModel,
          promptVersion: aiSummary ? PROMPT_VERSION : undefined,
          generatedAt
        }
      });

      logger.info(`Trend report created: ${report.id} (${periodType}) with ${articles.length} articles`);
      return report.id;
    } catch (error) {
      logger.error(`Failed to generate ${periodType} trend report`, error);
      throw new Error(`Failed to generate ${periodType} trend report`);
    }
  }

  /**
   * 記事データを取得
   */
  private async fetchArticles(start: Date, end: Date): Promise<ArticleWithRelations[]> {
    return this.prisma.article.findMany({
      where: {
        publishedAt: {
          gte: start,
          lt: end
        }
      },
      include: {
        tags: true,
        source: true,
        _count: {
          select: {
            articleViews: true,
            favorites: true
          }
        }
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
  }

  /**
   * トップ記事を計算
   */
  private calculateTopArticles(articles: ArticleWithRelations[]): TopArticleInfo[] {
    return articles.map(article => {
      const viewCount = article._count.articleViews;
      const favoriteCount = article._count.favorites;
      const score = viewCount * 1 + favoriteCount * 3;

      return {
        id: article.id,
        title: article.title,
        translatedTitle: article.translatedTitle,
        url: article.url,
        sourceName: article.source.name,
        viewCount,
        favoriteCount,
        score,
        tags: article.tags.map(t => t.name)
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * カテゴリ別集計
   */
  private calculateCategories(articles: ArticleWithRelations[]): CategoryInfo[] {
    const categoryMap = new Map<string, Set<string>>();
    const categoryArticles = new Map<string, ArticleWithRelations[]>();

    articles.forEach(article => {
      const articleTags = article.tags.map(t => t.name.toLowerCase());

      for (const [category, tags] of Object.entries(CATEGORY_TAGS)) {
        const lowerTags = tags.map(t => t.toLowerCase());
        const hasMatch = articleTags.some(tag => lowerTags.includes(tag));

        if (hasMatch) {
          if (!categoryArticles.has(category)) {
            categoryArticles.set(category, []);
            categoryMap.set(category, new Set());
          }
          if (!categoryMap.get(category)!.has(article.id)) {
            categoryMap.get(category)!.add(article.id);
            categoryArticles.get(category)!.push(article);
          }
          break; // 1つのカテゴリにのみ分類
        }
      }
    });

    const categories: CategoryInfo[] = [];
    const totalCategorized = Array.from(categoryArticles.values()).reduce((sum, arr) => sum + arr.length, 0);

    for (const [name, catArticles] of categoryArticles.entries()) {
      const topArticle = this.calculateTopArticles(catArticles)[0];
      categories.push({
        name,
        count: catArticles.length,
        percentage: totalCategorized > 0 ? Math.round((catArticles.length / totalCategorized) * 100) : 0,
        topArticle: topArticle ? {
          id: topArticle.id,
          title: topArticle.title,
          translatedTitle: topArticle.translatedTitle
        } : null
      });
    }

    return categories.sort((a, b) => b.count - a.count);
  }

  /**
   * タグ別集計
   */
  private calculateTags(articles: ArticleWithRelations[]): TagInfo[] {
    const tagCount = new Map<string, number>();

    articles.forEach(article => {
      article.tags.forEach(tag => {
        tagCount.set(tag.name, (tagCount.get(tag.name) || 0) + 1);
      });
    });

    const totalTags = Array.from(tagCount.values()).reduce((sum, count) => sum + count, 0);

    return Array.from(tagCount.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalTags > 0 ? Math.round((count / totalTags) * 100 * 10) / 10 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * AI要約を生成
   */
  private async generateAISummary(
    periodType: TrendPeriodType,
    articles: ArticleWithRelations[],
    topArticles: TopArticleInfo[],
    categories: CategoryInfo[],
    tags: TagInfo[]
  ): Promise<string> {
    if (!this.model) {
      throw new Error('Gemini model not initialized');
    }

    const periodLabel = {
      [TrendPeriodType.DAILY]: '今日',
      [TrendPeriodType.WEEKLY]: '今週',
      [TrendPeriodType.MONTHLY]: '今月'
    }[periodType];

    const topTagsText = tags.slice(0, 10).map(t => `${t.name}(${t.count}件)`).join('、');
    const topCategoriesText = categories.slice(0, 5).map(c => `${c.name}(${c.count}件)`).join('、');
    const topArticlesText = topArticles.slice(0, 5).map((a, i) =>
      `${i + 1}. ${a.translatedTitle || a.title} (${a.sourceName})`
    ).join('\n');

    const prompt = `あなたは技術トレンドアナリストです。${periodLabel}の技術記事トレンドを分析し、200-300文字で要約してください。

## 入力データ
- 総記事数: ${articles.length}件
- 主要カテゴリ: ${topCategoriesText}
- 注目タグ: ${topTagsText}
- 人気記事TOP5:
${topArticlesText}

## 出力要件
1. ${periodLabel}のトレンド傾向を端的に述べる
2. 特に注目すべきトピック（2-3点）を挙げる
3. 技術者への示唆（学ぶべきこと、注目すべき動向）
4. 自然な日本語で、200-300文字程度

要約:`;

    const result = await this.model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.7,
      },
    });

    const response = result.response;
    let summary = response.text().trim();

    // 先頭の「要約:」などを除去
    summary = summary.replace(/^(要約[:：]?\s*)/i, '');

    return summary;
  }

  /**
   * 特定期間のトレンドレポートを取得
   */
  async getTrendReport(periodType: TrendPeriodType, periodStart: Date): Promise<TrendReportData | null> {
    const report = await this.prisma.trendReport.findUnique({
      where: {
        periodType_periodStart: {
          periodType,
          periodStart
        }
      }
    });

    if (!report) {
      return null;
    }

    return {
      periodType: report.periodType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      articleCount: report.articleCount,
      topArticles: report.topArticles as unknown as TopArticleInfo[],
      categories: report.categories as unknown as CategoryInfo[],
      tags: report.tags as unknown as TagInfo[],
      aiSummary: report.aiSummary ?? undefined,
      aiModel: report.aiModel ?? undefined,
      promptVersion: report.promptVersion ?? undefined,
      generatedAt: report.generatedAt ?? undefined
    };
  }

  /**
   * 最新のトレンドレポートを取得
   */
  async getLatestReport(periodType: TrendPeriodType): Promise<TrendReportData | null> {
    const report = await this.prisma.trendReport.findFirst({
      where: { periodType },
      orderBy: { periodStart: 'desc' }
    });

    if (!report) {
      return null;
    }

    return {
      periodType: report.periodType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      articleCount: report.articleCount,
      topArticles: report.topArticles as unknown as TopArticleInfo[],
      categories: report.categories as unknown as CategoryInfo[],
      tags: report.tags as unknown as TagInfo[],
      aiSummary: report.aiSummary ?? undefined,
      aiModel: report.aiModel ?? undefined,
      promptVersion: report.promptVersion ?? undefined,
      generatedAt: report.generatedAt ?? undefined
    };
  }

  /**
   * トレンドレポート一覧を取得
   */
  async getReportList(periodType: TrendPeriodType, limit: number = 10) {
    return this.prisma.trendReport.findMany({
      where: { periodType },
      orderBy: { periodStart: 'desc' },
      take: limit,
      select: {
        id: true,
        periodType: true,
        periodStart: true,
        periodEnd: true,
        articleCount: true,
        aiSummary: true,
        createdAt: true
      }
    });
  }

  // ========================================
  // 日付計算ヘルパー（JST基準）
  // ========================================

  /**
   * 日の範囲を取得（JST基準）
   */
  private getDayRangeJST(date: Date): { start: Date; end: Date } {
    // JSTオフセット（+9時間）
    const jstOffset = 9 * 60 * 60 * 1000;

    // JST日付の開始（00:00:00 JST = 前日15:00:00 UTC）
    const jstDate = new Date(date.getTime() + jstOffset);
    const year = jstDate.getUTCFullYear();
    const month = jstDate.getUTCMonth();
    const day = jstDate.getUTCDate();

    // UTC時刻に変換して返す
    const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - jstOffset);
    const end = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0) - jstOffset);

    return { start, end };
  }

  /**
   * 週の範囲を取得（JST基準、月曜始まり）
   */
  private getWeekRangeJST(date: Date): { start: Date; end: Date } {
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(date.getTime() + jstOffset);

    // 月曜日を週の開始とする
    const dayOfWeek = jstDate.getUTCDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 日曜は-6、それ以外は1-dayOfWeek

    const monday = new Date(jstDate);
    monday.setUTCDate(jstDate.getUTCDate() + diff);
    monday.setUTCHours(0, 0, 0, 0);

    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(monday.getUTCDate() + 7);

    // UTC時刻に変換して返す
    const start = new Date(monday.getTime() - jstOffset);
    const end = new Date(nextMonday.getTime() - jstOffset);

    return { start, end };
  }

  /**
   * 月の範囲を取得（JST基準）
   */
  private getMonthRangeJST(date: Date): { start: Date; end: Date } {
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(date.getTime() + jstOffset);

    const year = jstDate.getUTCFullYear();
    const month = jstDate.getUTCMonth();

    // 月初と翌月初（JST）
    const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const nextMonthStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));

    // UTC時刻に変換して返す
    const start = new Date(monthStart.getTime() - jstOffset);
    const end = new Date(nextMonthStart.getTime() - jstOffset);

    return { start, end };
  }
}
