import { PrismaClient, Prisma, TrendPeriodType } from '@prisma/client';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import logger from '@/lib/logger/index';
import { GEMINI_API } from '@/lib/constants';
import { extractFirstJsonObject, TrendAiSummaryV1Schema } from '@/lib/types/trend-ai-summary';

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
const PROMPT_VERSION = '1.1.0';

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

    try {
      return await this.generateAISummaryStructured(periodType, articles, topArticles, categories, tags);
    } catch (error) {
      logger.warn('Failed to generate structured AI summary, falling back to legacy format', error);
      return await this.generateAISummaryLegacyPlainText(periodType, articles, topArticles, categories, tags);
    }
  }

  private async generateAISummaryStructured(
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
      [TrendPeriodType.DAILY]: '本日',
      [TrendPeriodType.WEEKLY]: '今週',
      [TrendPeriodType.MONTHLY]: '今月'
    }[periodType];

    const input = {
      periodLabel,
      articleCount: articles.length,
      topCategories: categories.slice(0, 8).map(c => ({
        name: c.name,
        count: c.count,
        percentage: c.percentage,
        topArticleId: c.topArticle?.id ?? null,
      })),
      topTags: tags.slice(0, 12).map(t => ({
        name: t.name,
        count: t.count,
        percentage: t.percentage,
      })),
      topArticles: topArticles.slice(0, 10).map(a => ({
        id: a.id,
        title: a.translatedTitle || a.title,
        sourceName: a.sourceName,
        url: a.url,
        viewCount: a.viewCount,
        favoriteCount: a.favoriteCount,
        score: a.score,
        tags: a.tags.slice(0, 6),
      })),
    };

    const prompt = `あなたは技術ニュース編集長です。記事タイトルを分析し、${periodLabel}のエンジニア向けインサイトを生成してください。

## 重要な指示
- 「件数が多いから注目」のような統計の言い換えは絶対禁止
- 記事タイトルから「何が起きているか」「何が解決されているか」を読み取る
- 具体的な技術名・ツール名・手法名を使う

## 出力形式（JSONのみ、説明文不要）
{
  "version": "trend_ai_summary_v1",
  "headline": "今日の核心を一言で（例: Gemini 2.0登場でAIエージェント開発が加速）",
  "keyTopics": [
    {
      "topic": "技術名",
      "reason": "【禁止】X件あるから注目 → 【OK】記事タイトルから読み取れる具体的動向を書く",
      "evidenceArticleIds": ["topArticles.idから選択"],
      "evidenceNumbers": [{"label":"", "value":""}]
    }
  ],
  "numbers": [{"label":"統計ラベル", "value":"数値"}],
  "actions": [
    {
      "title": "具体的なアクション",
      "detail": "記事タイトルを引用しながら、何を読むべきか・何を試すべきかを書く",
      "relatedTopics": [],
      "relatedArticleIds": []
    }
  ],
  "notes": []
}

## 良い例・悪い例
悪い例: "AI/ML: 総記事数の44%を占め注目を集めている"
良い例: "AI設計: 「小さな合意を積み重ねるプロトコル」のようなAIとの協働手法が登場。LangChainやDSPyを組み合わせた実践記事も増加"

悪い例: "TypeScriptの型安全性に関する知見を深めることが推奨されます"
良い例: "as const satisfiesでテストの型安全性を高める手法がKAKEHASHIから公開。既存テストコードへの適用を検討せよ"

## 入力データ
${JSON.stringify(input)}`;

    const result = await this.model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 900,
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    });

    const response = result.response;
    const rawText = response.text().trim();
    const json = extractFirstJsonObject(rawText);
    const validated = TrendAiSummaryV1Schema.safeParse(json);

    if (!validated.success) {
      throw new Error(`Structured AI summary validation failed: ${validated.error.message}`);
    }

    return JSON.stringify(validated.data);
  }

  private async generateAISummaryLegacyPlainText(
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
      [TrendPeriodType.DAILY]: '本日',
      [TrendPeriodType.WEEKLY]: '今週',
      [TrendPeriodType.MONTHLY]: '今月'
    }[periodType];

    const topTagNames = tags.slice(0, 5).map(t => t.name);
    const topTagsText = tags.slice(0, 10).map(t => `${t.name}(${t.count}件)`).join(', ');
    const topCategoriesText = categories.slice(0, 5).map(c => `${c.name}(${c.count}件, ${c.percentage}%)`).join(', ');

    const topArticlesText = topArticles.slice(0, 5).map((a, i) =>
      `${i + 1}. [${a.sourceName}] ${a.translatedTitle || a.title}\n   - タグ: ${a.tags.slice(0, 3).join(', ')}\n   - スコア: ${a.score} (閲覧${a.viewCount}/お気に入り${a.favoriteCount})`
    ).join('\n');

    const prompt = `技術ニュース編集長として、記事タイトルを分析しエンジニア向けインサイトを作成してください。

## 絶対禁止
- 「X件あるから注目」「Y%を占める」のような統計の言い換え
- 「注目を集めています」「トレンドです」のような空虚な表現

## 入力データ
- 期間: ${periodLabel}
- 人気記事TOP5:
${topArticlesText}

## 出力形式（プレーンテキスト、Markdown禁止）

[注目トピック]
(1) 技術名: 記事タイトルから読み取れる具体的な動向・手法・ツールを書く
(2) 技術名: 記事タイトルから読み取れる具体的な動向・手法・ツールを書く
(3) 技術名: 記事タイトルから読み取れる具体的な動向・手法・ツールを書く

[アクションポイント]
記事タイトルを引用し、何を読むべきか・何を試すべきかを具体的に書く

## 良い例・悪い例
悪い: "AI: 記事数の44%を占め注目されている"
良い: "AI設計: 「小さな合意を積み重ねるプロトコル」のようなAIとの協働手法が登場"

悪い: "TypeScriptの型安全性に関する知見を深めることが推奨されます"
良い: "as const satisfiesでテストの型安全性を高める手法がKAKEHASHIから公開。既存テストへの適用を検討せよ"`;

    const result = await this.model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.5,
      },
    });

    const response = result.response;
    let summary = response.text().trim();
    summary = summary.replace(/^(要約[:：]?\s*|##\s*出力\s*)/i, '');

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

  /**
   * 指定日付の前後にあるレポートの日付を取得
   */
  async getAdjacentReportDates(
    periodType: TrendPeriodType,
    currentPeriodStart: Date
  ): Promise<{ prevDate: Date | null; nextDate: Date | null }> {
    // 前のレポート
    const prevReport = await this.prisma.trendReport.findFirst({
      where: {
        periodType,
        periodStart: { lt: currentPeriodStart }
      },
      orderBy: { periodStart: 'desc' },
      select: { periodStart: true }
    });

    // 次のレポート
    const nextReport = await this.prisma.trendReport.findFirst({
      where: {
        periodType,
        periodStart: { gt: currentPeriodStart }
      },
      orderBy: { periodStart: 'asc' },
      select: { periodStart: true }
    });

    return {
      prevDate: prevReport?.periodStart ?? null,
      nextDate: nextReport?.periodStart ?? null
    };
  }

  /**
   * 最新レポートの日付を取得（404レスポンス用）
   */
  async getLatestReportDate(periodType: TrendPeriodType): Promise<Date | null> {
    const report = await this.prisma.trendReport.findFirst({
      where: { periodType },
      orderBy: { periodStart: 'desc' },
      select: { periodStart: true }
    });
    return report?.periodStart ?? null;
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
