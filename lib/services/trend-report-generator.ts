import { PrismaClient, Prisma, TrendPeriodType } from '@prisma/client';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import logger from '@/lib/logger/index';
import { GEMINI_API } from '@/lib/constants';
import {
  extractFirstJsonObject,
  TrendAiSummarySchema,
} from '@/lib/types/trend-ai-summary';

// JST offset constant (+9 hours in milliseconds)
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// カテゴリタグ定義（大文字小文字を区別しない比較用）
const CATEGORY_TAGS = {
  Frontend: [
    'React',
    'Vue',
    'Angular',
    'CSS',
    'JavaScript',
    'TypeScript',
    'Next.js',
    'Svelte',
  ],
  Backend: [
    'Node.js',
    'Python',
    'Ruby',
    'Go',
    'Java',
    'PHP',
    'Rails',
    'Django',
    'FastAPI',
  ],
  'AI/ML': [
    'AI',
    'LLM',
    'Claude',
    'GPT',
    'Gemini',
    '機械学習',
    'ChatGPT',
    'OpenAI',
    'Anthropic',
    'RAG',
  ],
  Security: [
    'セキュリティ',
    'Security',
    '脆弱性',
    'CVE',
    'XSS',
    'CSRF',
    '認証',
  ],
  DevOps: [
    'Docker',
    'Kubernetes',
    'CI/CD',
    'AWS',
    'GCP',
    'Azure',
    'Jenkins',
    'GitHub Actions',
  ],
  Database: [
    'PostgreSQL',
    'MySQL',
    'MongoDB',
    'Redis',
    'SQL',
    'NoSQL',
    'Prisma',
  ],
  Mobile: ['iOS', 'Android', 'Flutter', 'React Native', 'Swift', 'Kotlin'],
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
      };
    };
  };
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
  thumbnail?: string | null;
  detailedSummary?: string | null;
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
const PROMPT_VERSION = '2.3.0';

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
        model: GEMINI_API.TREND_MODEL,
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
            periodStart,
          },
        },
      });

      if (existing) {
        logger.info(
          `Trend report already exists for ${periodType} starting ${periodStart.toISOString()}`
        );
        return existing.id;
      }

      // 記事データ取得
      const articles = await this.fetchArticles(periodStart, periodEnd);

      if (articles.length === 0) {
        logger.warn(
          `No articles found for ${periodType} period ${periodStart.toISOString()} - ${periodEnd.toISOString()}`
        );
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
          aiSummary = await this.generateAISummary(
            periodType,
            periodStart,
            periodEnd,
            articles,
            topArticles,
            categories,
            tags
          );
          aiModel = GEMINI_API.TREND_MODEL;
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
          generatedAt,
        },
      });

      logger.info(
        `Trend report created: ${report.id} (${periodType}) with ${articles.length} articles`
      );
      return report.id;
    } catch (error) {
      logger.error(`Failed to generate ${periodType} trend report`, error);
      throw new Error(`Failed to generate ${periodType} trend report`);
    }
  }

  /**
   * 記事データを取得
   */
  private async fetchArticles(
    start: Date,
    end: Date
  ): Promise<ArticleWithRelations[]> {
    return this.prisma.article.findMany({
      where: {
        publishedAt: {
          gte: start,
          lt: end,
        },
      },
      include: {
        tags: true,
        source: true,
        _count: {
          select: {
            articleViews: true,
            favorites: true,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
    });
  }

  /**
   * トップ記事を計算
   */
  private calculateTopArticles(
    articles: ArticleWithRelations[]
  ): TopArticleInfo[] {
    return articles
      .map((article) => {
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
          tags: article.tags.map((t) => t.name),
          thumbnail: article.thumbnail,
          detailedSummary: article.detailedSummary,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * カテゴリ別集計
   */
  private calculateCategories(
    articles: ArticleWithRelations[]
  ): CategoryInfo[] {
    const categoryMap = new Map<string, Set<string>>();
    const categoryArticles = new Map<string, ArticleWithRelations[]>();

    articles.forEach((article) => {
      const articleTags = article.tags.map((t) => t.name.toLowerCase());

      for (const [category, tags] of Object.entries(CATEGORY_TAGS)) {
        const lowerTags = tags.map((t) => t.toLowerCase());
        const hasMatch = articleTags.some((tag) => lowerTags.includes(tag));

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
    const totalCategorized = Array.from(categoryArticles.values()).reduce(
      (sum, arr) => sum + arr.length,
      0
    );

    for (const [name, catArticles] of categoryArticles.entries()) {
      const topArticle = this.calculateTopArticles(catArticles)[0];
      categories.push({
        name,
        count: catArticles.length,
        percentage:
          totalCategorized > 0
            ? Math.round((catArticles.length / totalCategorized) * 100)
            : 0,
        topArticle: topArticle
          ? {
              id: topArticle.id,
              title: topArticle.title,
              translatedTitle: topArticle.translatedTitle,
            }
          : null,
      });
    }

    return categories.sort((a, b) => b.count - a.count);
  }

  /**
   * タグ別集計
   */
  private calculateTags(articles: ArticleWithRelations[]): TagInfo[] {
    const tagCount = new Map<string, number>();

    articles.forEach((article) => {
      article.tags.forEach((tag) => {
        tagCount.set(tag.name, (tagCount.get(tag.name) || 0) + 1);
      });
    });

    const totalTags = Array.from(tagCount.values()).reduce(
      (sum, count) => sum + count,
      0
    );

    return Array.from(tagCount.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage:
          totalTags > 0 ? Math.round((count / totalTags) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * AI要約を生成
   */
  private async generateAISummary(
    periodType: TrendPeriodType,
    periodStart: Date,
    periodEnd: Date,
    articles: ArticleWithRelations[],
    topArticles: TopArticleInfo[],
    categories: CategoryInfo[],
    tags: TagInfo[]
  ): Promise<string> {
    const model = this.model;
    if (!model) {
      throw new Error('Gemini model not initialized');
    }

    try {
      return await this.generateAISummaryStructured(
        periodType,
        periodStart,
        periodEnd,
        articles,
        topArticles,
        categories,
        tags
      );
    } catch (error) {
      logger.warn(
        'Failed to generate structured AI summary, falling back to legacy format',
        error
      );
      return await this.generateAISummaryLegacyPlainText(
        periodType,
        articles,
        topArticles,
        categories,
        tags
      );
    }
  }

  /**
   * 参照キー（A1〜A10）を実際の記事IDに変換するポストプロセス。
   * 無効な参照キーは除外し、変換後に空配列になった場合はfallbackIdを挿入する。
   */
  private static resolveRefKeysToIds(
    obj: Record<string, unknown>,
    refMap: Map<string, string>,
    fallbackId: string | undefined
  ): void {
    const validIds = new Set(refMap.values());
    const resolve = (keys: unknown[]): string[] => {
      const resolved = keys
        .filter((k): k is string => typeof k === 'string')
        .map((k) => refMap.get(k) ?? (validIds.has(k) ? k : undefined))
        .filter((id): id is string => id !== undefined);
      const deduped = Array.from(new Set(resolved));
      if (deduped.length === 0 && fallbackId) {
        return [fallbackId];
      }
      return deduped;
    };

    // keyTopics[].evidenceArticleIds
    const keyTopics = obj.keyTopics;
    if (Array.isArray(keyTopics)) {
      for (const topic of keyTopics) {
        if (
          topic &&
          typeof topic === 'object' &&
          Array.isArray((topic as Record<string, unknown>).evidenceArticleIds)
        ) {
          (topic as Record<string, unknown>).evidenceArticleIds = resolve(
            (topic as Record<string, unknown>).evidenceArticleIds as unknown[]
          );
        }
      }
    }

    // actions[].articleIds
    const actions = obj.actions;
    if (Array.isArray(actions)) {
      for (const action of actions) {
        if (
          action &&
          typeof action === 'object' &&
          Array.isArray((action as Record<string, unknown>).articleIds)
        ) {
          (action as Record<string, unknown>).articleIds = resolve(
            (action as Record<string, unknown>).articleIds as unknown[]
          );
        }
      }
    }
  }

  private async generateAISummaryStructured(
    periodType: TrendPeriodType,
    periodStart: Date,
    periodEnd: Date,
    articles: ArticleWithRelations[],
    topArticles: TopArticleInfo[],
    categories: CategoryInfo[],
    tags: TagInfo[]
  ): Promise<string> {
    const model = this.model;
    if (!model) {
      throw new Error('Gemini model not initialized');
    }

    const periodLabel = {
      [TrendPeriodType.DAILY]: '本日',
      [TrendPeriodType.WEEKLY]: '今週',
      [TrendPeriodType.MONTHLY]: '今月',
    }[periodType];

    const input: Record<string, unknown> = {
      periodLabel,
      articleCount: articles.length,
      topCategories: categories.slice(0, 8).map((c) => ({
        name: c.name,
        count: c.count,
        percentage: c.percentage,
        topArticleId: c.topArticle?.id ?? null,
      })),
      topTags: tags.slice(0, 12).map((t) => ({
        name: t.name,
        count: t.count,
        percentage: t.percentage,
      })),
      topArticles: topArticles.slice(0, 10).map((a, i) => ({
        ref: `A${i + 1}`,
        id: a.id,
        title: a.translatedTitle || a.title,
        sourceName: a.sourceName,
        url: a.url,
        viewCount: a.viewCount,
        favoriteCount: a.favoriteCount,
        score: a.score,
        tags: a.tags.slice(0, 6),
        detailedSummary: a.detailedSummary?.slice(0, 500) ?? null,
      })),
    };

    // 前期間（デフォルト: 同じ期間長）との比較データを追加（存在しない場合はavailable=false）
    try {
      const durationMs = periodEnd.getTime() - periodStart.getTime();
      const prevStart = new Date(periodStart.getTime() - durationMs);
      const prevEnd = new Date(periodStart);

      const previousArticles = await this.fetchArticles(prevStart, prevEnd);
      const previousCategories = this.calculateCategories(previousArticles);
      const previousTags = this.calculateTags(previousArticles);

      const toCountMap = (
        items: Array<{ name: string; count: number; percentage: number }>
      ) =>
        new Map(
          items.map(
            (i) =>
              [i.name, { count: i.count, percentage: i.percentage }] as const
          )
        );

      const toDeltaList = (
        today: Array<{ name: string; count: number; percentage: number }>,
        prev: Array<{ name: string; count: number; percentage: number }>
      ) => {
        const prevMap = toCountMap(prev);
        const names = new Set<string>([
          ...today.map((t) => t.name),
          ...prev.map((p) => p.name),
        ]);
        const deltas = Array.from(names).map((name) => {
          const t = today.find((x) => x.name === name);
          const p = prevMap.get(name);
          const todayCount = t?.count ?? 0;
          const prevCount = p?.count ?? 0;
          return {
            name,
            todayCount,
            prevCount,
            deltaCount: todayCount - prevCount,
            todayPercentage: t?.percentage ?? 0,
            prevPercentage: p?.percentage ?? 0,
          };
        });

        const newItems = deltas
          .filter((d) => d.prevCount === 0 && d.todayCount > 0)
          .sort((a, b) => b.todayCount - a.todayCount);
        const rising = deltas
          .filter((d) => d.deltaCount > 0 && d.prevCount > 0)
          .sort((a, b) => b.deltaCount - a.deltaCount);
        const falling = deltas
          .filter((d) => d.deltaCount < 0)
          .sort((a, b) => a.deltaCount - b.deltaCount);

        return { newItems, rising, falling };
      };

      const tagDeltas = toDeltaList(tags, previousTags);
      const categoryDeltas = toDeltaList(categories, previousCategories);

      const basisLabel = {
        [TrendPeriodType.DAILY]: '前日',
        [TrendPeriodType.WEEKLY]: '前週',
        [TrendPeriodType.MONTHLY]: '前期間',
      }[periodType];

      input.comparison = {
        available: previousArticles.length > 0,
        basis: {
          periodLabel: basisLabel,
          periodStart: prevStart.toISOString(),
          periodEnd: prevEnd.toISOString(),
        },
        previous: {
          articleCount: previousArticles.length,
          topCategories: previousCategories.slice(0, 8).map((c) => ({
            name: c.name,
            count: c.count,
            percentage: c.percentage,
          })),
          topTags: previousTags.slice(0, 12).map((t) => ({
            name: t.name,
            count: t.count,
            percentage: t.percentage,
          })),
        },
        tagChanges: {
          new: tagDeltas.newItems.slice(0, 6),
          rising: tagDeltas.rising.slice(0, 6),
          falling: tagDeltas.falling.slice(0, 6),
        },
        categoryChanges: {
          new: categoryDeltas.newItems.slice(0, 6),
          rising: categoryDeltas.rising.slice(0, 6),
          falling: categoryDeltas.falling.slice(0, 6),
        },
      };
    } catch (error) {
      logger.warn('Failed to build comparison data for AI summary', error);
      input.comparison = { available: false };
    }

    const prompt = `あなたは技術ニュースの編集長 兼 アナリストです。与えられたデータ（記事タイトル・タグ・カテゴリ・前期間差分）のみを根拠に、${periodLabel}の「意味のある分析」を作成してください。

## 目的（重要）
- 統計の言い換えではなく「何が起きているか」を言語化する
- 各記事にはdetailedSummary（記事要約、最大500文字）が含まれる。記事のdetailedSummaryから技術的な具体内容を読み取り、whatHappenedやwhyItMattersに反映してください。タイトルの言い換えではなく、要約から得られる技術的知見を含めてください。
- 類似記事を束ねて「潮流（テーマ）」として説明する
- 読むべき記事を、具体的理由つきで推薦する
- 前期間比の量的変化はtrendChangesセクションのみで扱う（core/keyTopics/actionsでは量の増減に言及しない）

## 絶対禁止（違反したら失格）
- 「X件あるから注目」「Y%を占める」など、数字だけを根拠に重要と言う
- 記事タイトルを並べるだけ（列挙）
- 「注目を集めています」「トレンドです」「学ぶべきです」など、具体性のない断定
- 同義語・類似表現の繰り返し（例: 「AI/ML分野」と「AI関連」、「減少」と「激減」を同じ文で使う）
- 冗長な言い回し（簡潔に1回で伝える）
- セクション間の同一視点での言い換え重複: core/keyTopics/trendChanges/actionsで同じ事象を同じ切り口で繰り返さない（同一テーマを別視点で扱うのは可）
- keyTopicsで記事数の増減に言及しない（量的変化はtrendChangesの責務）
- coreに「減少」「増加」「急増」等の量的変化の語を使わない

## 出力ルール
- 返答はJSONオブジェクトのみ（前後に文章・コードブロック・Markdownを付けない）
- versionは必ず "trend_ai_summary_v2"
- 指定キー以外を出力しない（追加キー禁止）
- 記事の根拠は evidenceArticleIds / actions.articleIds に入力の topArticles[].ref 値（A1〜A10）を入れて示す
- 文章フィールドでは「件」「%」「割合」「占める」などの統計言い換えをしない（数値は deltaCount や numbers に逃がす）

## 出力形式（厳守）
- keyTopicsは必ず3件以上6件以内で出力すること（入力記事が十分にある場合）
- actionsは必ず3件以上6件以内で出力すること
- evidenceArticleIds / articleIds には入力JSONの topArticles[].ref 値（A1〜A10）を使うこと（架空IDや実IDではなく、必ずref値を使用）
{
  "version": "trend_ai_summary_v2",
  "core": "今日の核心を固有名詞で1文（例: Gemini 2.0発表でマルチモーダルAI開発が加速）。量的変化（増減）は書かない。",
  "overview": "テック系ブログのリード文調で書く（250-350文字）。NG表現:「浮上しています」「求められています」「集約されています」「不可欠です」「注目を集めています」。OK表現:「〜が中心で」「〜を後押し」「〜が広がっています」「〜してみてください」「〜しましょう」。具体的なプロダクト名を挙げながら話題を自然につなぎ、「まずは〜から試してみてください」「〜で一歩リードしましょう」のような呼びかけで締める。例: '3月1日のAI話題は、Claudeのメモリー機能やプラグイン進化が中心で、業務自動化の可能性を広げています。...AIの波に乗り遅れず、さらなる活用で競争力を強化しましょう。'",
  "keyTopics": [
    {
      "topic": "具体的な技術・ツール・手法（固有名詞、10文字以内）",
      "whatHappened": "記事の中身から読み取れる技術的な動き。量的変化は書かない。禁止語: 増加/減少/急増/急減/増えた/減った/拡大/縮小。何が議論・発表・提案されているかを説明する。60-100文字程度で2-3文。",
      "whyItMatters": "whatHappenedとは異なる切り口で、実務者が得られる示唆を具体的に。whatHappenedの言い換えにしない。禁止語: 増加/減少/急増/急減/増えた/減った/拡大/縮小。60-100文字程度で2-3文。",
      "evidenceArticleIds": ["A1", "A3"]
    }
  ],
  "trendChanges": {
    "available": true,
    "basis": { "periodLabel": "前日", "date": "YYYY-MM-DD" },
    "new": [{ "topic": "トピック名", "deltaCount": 3, "reason": "なぜそう言えるか（タイトル/タグ変化から）を1文で。" }],
    "rising": [{ "topic": "トピック名", "deltaCount": 2, "reason": "具体的な変化を1文で。" }],
    "falling": [{ "topic": "トピック名", "deltaCount": -2, "reason": "具体的な変化を1文で。" }],
    "summary": "前期間比の量的変化の全体像を1-2文で。これが量的変化を扱う唯一のセクション。available=falseなら『前期間データなし』を明記。"
  },
  "actions": [
    {
      "action": "読む/試す/設計に反映する等、実行可能な指示を短く",
      "reason": "なぜそれが有効か（何が得られるか）を具体的に。",
      "articleIds": ["A1", "A5"]
    }
  ],
  "numbers": [{ "label": "補助指標（任意）", "value": "例: トップ記事score 123 / 記事総数 42" }],
  "notes": ["任意。制約や前提（例: comparisonがない等）"]
}

## 良い例・悪い例

### keyTopicsの例
悪い例（短すぎる）:
- topic: "AI設計プロトコル"
- whatHappened: "AIとの対話を通じて小さな合意を積み重ね、設計を進めるためのプロトコルが提案されています。"
- whyItMatters: "AIエージェント開発において、複雑なタスクを分解し、一貫性を保ちながら進めるための具体的な設計指針となります。"

良い例（適切な長さ）:
- topic: "AI設計プロトコル"
- whatHappened: "AIとの対話を通じて小さな合意を積み重ね、設計を進めるためのプロトコルが複数の記事で提案されています。これは、AIエージェントがユーザーの意図をより正確に理解し、段階的に目標を達成するための手法です。特にLLMを活用した開発で有効とされています。"
- whyItMatters: "AIエージェント開発において、複雑なタスクを分解し、一貫性を保ちながら進めるための具体的な設計指針となります。コーディングエージェントやLLMを活用した開発で、ユーザーとAI間の認識齟齬を減らし、より効率的な協働が可能になります。"

### actionsの例
悪い例: "TypeScriptの型安全性に関する知見を深めることが推奨されます"
良い例: "as const satisfiesをテストのフィクスチャ定義に適用し、破壊的変更をコンパイル時に検知できるようにする"

### セクション間重複の例
悪い例（3箇所で同じ事象を繰り返し）:
- core: "AI/ML分野の記事数が大幅に減少し、新たなテーマが登場"
- keyTopics[0].whatHappened: "AI/ML関連の話題が減少傾向にある一方..."
- trendChanges.summary: "AI/MLカテゴリの記事が大幅に減少..."

良い例（各セクションが異なる切り口で補完）:
- core: "Bedrock AgentCoreとSoftware Engineering自動化が新たな焦点に"
- keyTopics[0].whatHappened: "AWS Bedrock AgentCoreの実装パターンに関する記事が複数登場。エージェントのオーケストレーションとメモリ管理の手法が具体的に解説されている。"
- trendChanges.summary: "AI/MLカテゴリが前日比で縮小し、代わりにOpen SourceとSoftware Engineeringが拡大。"

## 入力データ
${JSON.stringify(input)}`;

    // 参照キー → 実IDのマッピングを構築
    const refMap = new Map<string, string>();
    const topArticleSlice = topArticles.slice(0, 10);
    topArticleSlice.forEach((a, i) => {
      refMap.set(`A${i + 1}`, a.id);
    });
    const fallbackId = topArticleSlice[0]?.id;

    // 統計言い換えの検出（明らかな悪いパターンのみ）
    // - 「XX%を占める」「XX件あるから」など、数値を根拠にした記述
    const hasStatParaphrase = (value: string) =>
      /(\d+(\.\d+)?%を占|(\d+)\s*件.{0,3}(ある|注目|重要))/.test(value);

    const hasQuantChangeWord = (value: string) =>
      /(増加|減少|急増|急減|増えた|減った|拡大|縮小)/.test(value);

    const validateV2Content = (obj: unknown): string[] => {
      const parsed = TrendAiSummarySchema.safeParse(obj);
      if (!parsed.success) return [`schema: ${parsed.error.message}`];
      if (parsed.data.version !== 'trend_ai_summary_v2')
        return ['version must be trend_ai_summary_v2'];

      const errors: string[] = [];
      if (hasStatParaphrase(parsed.data.core))
        errors.push('core must not paraphrase stats');
      if (hasQuantChangeWord(parsed.data.core))
        errors.push('core must not contain quantitative change words');
      for (const t of parsed.data.keyTopics) {
        if (
          hasStatParaphrase(t.whatHappened) ||
          hasStatParaphrase(t.whyItMatters)
        ) {
          errors.push(`keyTopics("${t.topic}") must not paraphrase stats`);
        }
        if (
          hasQuantChangeWord(t.whatHappened) ||
          hasQuantChangeWord(t.whyItMatters)
        ) {
          errors.push(
            `keyTopics("${t.topic}") must not contain quantitative change words`
          );
        }
      }
      for (const a of parsed.data.actions) {
        if (hasStatParaphrase(a.action) || hasStatParaphrase(a.reason)) {
          errors.push(`actions("${a.action}") must not paraphrase stats`);
        }
      }
      if (
        parsed.data.trendChanges &&
        hasStatParaphrase(parsed.data.trendChanges.summary)
      ) {
        errors.push('trendChanges.summary must not paraphrase stats');
      }
      return errors;
    };

    const generateOnce = async (promptText: string, temperature: number) => {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature,
          responseMimeType: 'application/json',
        },
      });
      return result.response.text().trim();
    };

    const rawText1 = await generateOnce(prompt, 0.2);
    const json1 = extractFirstJsonObject(rawText1);
    if (json1 && typeof json1 === 'object') {
      TrendReportGenerator.resolveRefKeysToIds(
        json1 as Record<string, unknown>,
        refMap,
        fallbackId
      );
    }
    const errors1 = validateV2Content(json1);
    if (errors1.length === 0) {
      return JSON.stringify(json1);
    }

    const refMapInfo = Array.from(refMap.entries())
      .map(([ref, id]) => `${ref} -> ${id}`)
      .join(', ');

    const repairPrompt = `次のモデル出力を、必ず指定のJSONスキーマ（trend_ai_summary_v2）に厳密準拠するJSONオブジェクトへ修正してください。
返答はJSONのみ。追加の文章、コードブロック、コメント禁止。
指定キー（追加/欠落禁止）: version, core, overview, keyTopics, trendChanges, actions, numbers, notes
versionは必ず "trend_ai_summary_v2"。
文章フィールドでは統計の言い換え（"件" "%""割合""占める" 等）をしない（数値はdeltaCountに入れる）。
core/keyTopicsのwhatHappened/whyItMattersでは「増加」「減少」「急増」「急減」「増えた」「減った」「拡大」「縮小」の語を使わない。
core/keyTopics/trendChanges/actionsで同じ事象を同じ切り口で繰り返さない。
evidenceArticleIds / articleIds には参照キー（A1〜A10）を使うこと。

参照キーと実IDの対応: ${refMapInfo}

スキーマ例:
{
  "version": "trend_ai_summary_v2",
  "core": "…。",
  "overview": "ブログのリード文調で250-350文字。柔らかい口調で具体的なプロダクト名を挙げつつ話題をつなぎ、読者への呼びかけで締める。",
  "keyTopics": [{"topic":"…","whatHappened":"…。","whyItMatters":"…。","evidenceArticleIds":["A1"]}],
  "trendChanges": {"available": false, "basis": {"periodLabel":"前日","date":"YYYY-MM-DD"}, "new": [], "rising": [], "falling": [], "summary": "…。"},
  "actions": [{"action":"…","reason":"…","articleIds":["A2"]}],
  "numbers": [{"label":"…","value":"…"}],
  "notes": ["…"]
}

違反箇所: ${errors1.join(' / ')}

モデル出力:
${rawText1}`;

    const rawText2 = await generateOnce(repairPrompt, 0.0);
    const json2 = extractFirstJsonObject(rawText2);
    if (json2 && typeof json2 === 'object') {
      TrendReportGenerator.resolveRefKeysToIds(
        json2 as Record<string, unknown>,
        refMap,
        fallbackId
      );
    }
    const errors2 = validateV2Content(json2);
    if (errors2.length === 0) {
      return JSON.stringify(json2);
    }

    // repair失敗: v2を再生成（temperature=0.0でリトライ）
    logger.warn(
      `Repair failed (${errors2.join(' / ')}), retrying v2 generation with temperature=0.0`
    );

    const rawText3 = await generateOnce(prompt, 0.0);
    const json3 = extractFirstJsonObject(rawText3);
    if (json3 && typeof json3 === 'object') {
      TrendReportGenerator.resolveRefKeysToIds(
        json3 as Record<string, unknown>,
        refMap,
        fallbackId
      );
    }
    const errors3 = validateV2Content(json3);
    if (errors3.length === 0) {
      return JSON.stringify(json3);
    }

    // リトライ生成もバリデーション失敗: もう一度repair
    const repairPrompt2 = repairPrompt
      .replace(
        `違反箇所: ${errors1.join(' / ')}`,
        `違反箇所: ${errors3.join(' / ')}`
      )
      .replace(rawText1, rawText3);

    const rawText4 = await generateOnce(repairPrompt2, 0.0);
    const json4 = extractFirstJsonObject(rawText4);
    if (json4 && typeof json4 === 'object') {
      TrendReportGenerator.resolveRefKeysToIds(
        json4 as Record<string, unknown>,
        refMap,
        fallbackId
      );
    }
    const errors4 = validateV2Content(json4);
    if (errors4.length > 0) {
      throw new Error(
        `Structured AI summary validation failed after retry: ${errors4.join(' / ')}`
      );
    }

    return JSON.stringify(json4);
  }

  private async generateAISummaryLegacyPlainText(
    periodType: TrendPeriodType,
    articles: ArticleWithRelations[],
    topArticles: TopArticleInfo[],
    _categories: CategoryInfo[],
    _tags: TagInfo[]
  ): Promise<string> {
    if (!this.model) {
      throw new Error('Gemini model not initialized');
    }

    const periodLabel = {
      [TrendPeriodType.DAILY]: '本日',
      [TrendPeriodType.WEEKLY]: '今週',
      [TrendPeriodType.MONTHLY]: '今月',
    }[periodType];

    const topArticlesText = topArticles
      .slice(0, 5)
      .map(
        (a, i) =>
          `${i + 1}. [${a.sourceName}] ${a.translatedTitle || a.title}\n   - タグ: ${a.tags.slice(0, 3).join(', ')}\n   - スコア: ${a.score} (閲覧${a.viewCount}/お気に入り${a.favoriteCount})`
      )
      .join('\n');

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

    if (summary.length < 100) {
      throw new Error(
        `Legacy AI summary too short (${summary.length} chars), likely incomplete response`
      );
    }

    return summary;
  }

  /**
   * 特定期間のトレンドレポートを取得
   */
  async getTrendReport(
    periodType: TrendPeriodType,
    periodStart: Date
  ): Promise<TrendReportData | null> {
    const report = await this.prisma.trendReport.findUnique({
      where: {
        periodType_periodStart: {
          periodType,
          periodStart,
        },
      },
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
      generatedAt: report.generatedAt ?? undefined,
    };
  }

  /**
   * 最新のトレンドレポートを取得
   */
  async getLatestReport(
    periodType: TrendPeriodType
  ): Promise<TrendReportData | null> {
    const report = await this.prisma.trendReport.findFirst({
      where: { periodType },
      orderBy: { periodStart: 'desc' },
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
      generatedAt: report.generatedAt ?? undefined,
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
        createdAt: true,
      },
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
        periodStart: { lt: currentPeriodStart },
      },
      orderBy: { periodStart: 'desc' },
      select: { periodStart: true },
    });

    // 次のレポート
    const nextReport = await this.prisma.trendReport.findFirst({
      where: {
        periodType,
        periodStart: { gt: currentPeriodStart },
      },
      orderBy: { periodStart: 'asc' },
      select: { periodStart: true },
    });

    return {
      prevDate: prevReport?.periodStart ?? null,
      nextDate: nextReport?.periodStart ?? null,
    };
  }

  /**
   * 最新レポートの日付を取得（404レスポンス用）
   */
  async getLatestReportDate(periodType: TrendPeriodType): Promise<Date | null> {
    const report = await this.prisma.trendReport.findFirst({
      where: { periodType },
      orderBy: { periodStart: 'desc' },
      select: { periodStart: true },
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
    // JST日付の開始（00:00:00 JST = 前日15:00:00 UTC）
    const jstDate = new Date(date.getTime() + JST_OFFSET_MS);
    const year = jstDate.getUTCFullYear();
    const month = jstDate.getUTCMonth();
    const day = jstDate.getUTCDate();

    // UTC時刻に変換して返す
    const start = new Date(
      Date.UTC(year, month, day, 0, 0, 0, 0) - JST_OFFSET_MS
    );
    const end = new Date(
      Date.UTC(year, month, day + 1, 0, 0, 0, 0) - JST_OFFSET_MS
    );

    return { start, end };
  }

  /**
   * 週の範囲を取得（JST基準、月曜始まり）
   */
  private getWeekRangeJST(date: Date): { start: Date; end: Date } {
    const jstDate = new Date(date.getTime() + JST_OFFSET_MS);

    // 月曜日を週の開始とする
    const dayOfWeek = jstDate.getUTCDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 日曜は-6、それ以外は1-dayOfWeek

    const monday = new Date(jstDate);
    monday.setUTCDate(jstDate.getUTCDate() + diff);
    monday.setUTCHours(0, 0, 0, 0);

    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(monday.getUTCDate() + 7);

    // UTC時刻に変換して返す
    const start = new Date(monday.getTime() - JST_OFFSET_MS);
    const end = new Date(nextMonday.getTime() - JST_OFFSET_MS);

    return { start, end };
  }

  /**
   * 月の範囲を取得（JST基準）
   */
  private getMonthRangeJST(date: Date): { start: Date; end: Date } {
    const jstDate = new Date(date.getTime() + JST_OFFSET_MS);

    const year = jstDate.getUTCFullYear();
    const month = jstDate.getUTCMonth();

    // 月初と翌月初（JST）
    const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const nextMonthStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));

    // UTC時刻に変換して返す
    const start = new Date(monthStart.getTime() - JST_OFFSET_MS);
    const end = new Date(nextMonthStart.getTime() - JST_OFFSET_MS);

    return { start, end };
  }
}
