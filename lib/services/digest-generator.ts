import { PrismaClient, Prisma } from '@prisma/client';

// カテゴリタグ定義（大文字小文字を区別しない比較用）
const CATEGORY_TAGS = {
  'Frontend': ['React', 'Vue', 'Angular', 'CSS', 'JavaScript', 'TypeScript', 'Next.js'],
  'Backend': ['Node.js', 'Python', 'Ruby', 'Go', 'Java', 'PHP', 'Rails', 'Django'],
  'AI/ML': ['AI', 'LLM', 'Claude', 'GPT', 'Gemini', '機械学習', 'ChatGPT'],
  'Security': ['セキュリティ', 'Security', '脆弱性', 'CVE', 'XSS', 'CSRF'],
  'DevOps': ['Docker', 'Kubernetes', 'CI/CD', 'AWS', 'GCP', 'Azure', 'Jenkins'],
  'Database': ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQL', 'NoSQL'],
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

interface TopArticle {
  id: string;
  title: string;
  url: string;
  viewCount: number;
  favoriteCount: number;
  score: number;
}

interface CategorySummary {
  name: string;
  count: number;
  topArticle: {
    id: string;
    title: string;
  } | null;
}

interface DigestTopArticle {
  id: string;
  title: string;
  url: string;
  score: number;
}

export class DigestGenerator {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * 週刊ダイジェストを生成
   */
  async generateWeeklyDigest(startDate?: Date): Promise<string> {
    // JSTタイムゾーンで現在日時を取得
    const jstDate = startDate ? this.toJST(startDate) : this.getCurrentJST();
    const weekEnd = new Date(jstDate);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);
    
    // 週の開始と終了を日曜日基準に調整（JST）
    const adjustedStart = this.getWeekStartJST(weekStart);
    const adjustedEnd = this.getWeekEndJST(adjustedStart);

    // 既存のダイジェストをチェック
    const existing = await this.prisma.weeklyDigest.findUnique({
      where: { weekStartDate: adjustedStart }
    });

    if (existing) {
      return existing.id;
    }

    // 週間の記事を取得（_countを使用して最適化）
    const articles = await this.prisma.article.findMany({
      where: {
        publishedAt: {
          gte: adjustedStart,
          lte: adjustedEnd
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
      }
    });

    // トップ記事を計算
    const topArticles = this.calculateTopArticles(articles);
    
    // カテゴリ別集計
    const categories = this.calculateCategories(articles);

    // ダイジェストを保存
    const digest = await this.prisma.weeklyDigest.create({
      data: {
        weekStartDate: adjustedStart,
        weekEndDate: adjustedEnd,
        articleCount: articles.length,
        topArticles: JSON.parse(JSON.stringify(topArticles.slice(0, 10).map(a => ({
          id: a.id,
          title: a.title,
          url: a.url,
          score: a.score
        })))),
        categories: JSON.parse(JSON.stringify(categories))
      }
    });

    return digest.id;
  }

  /**
   * 特定週のダイジェストを取得
   */
  async getWeeklyDigest(weekStartDate: Date) {
    const jstDate = this.toJST(weekStartDate);
    const adjustedStart = this.getWeekStartJST(jstDate);
    
    const digest = await this.prisma.weeklyDigest.findUnique({
      where: { weekStartDate: adjustedStart }
    });

    if (!digest) {
      return null;
    }

    // 記事の詳細情報を取得
    const topArticleIds = (digest.topArticles as unknown as DigestTopArticle[]).map(a => a.id);
    const articles = await this.prisma.article.findMany({
      where: { id: { in: topArticleIds } },
      include: {
        source: true,
        tags: true
      }
    });

    return {
      ...digest,
      articles: topArticleIds.map(id => 
        articles.find(a => a.id === id)
      ).filter(Boolean)
    };
  }

  /**
   * トップ記事を計算
   */
  private calculateTopArticles(articles: ArticleWithRelations[]): TopArticle[] {
    return articles.map(article => {
      const viewCount = article._count.articleViews;
      const favoriteCount = article._count.favorites;
      const score = viewCount * 1 + favoriteCount * 3; // お気に入りに重み付け

      return {
        id: article.id,
        title: article.title,
        url: article.url,
        viewCount,
        favoriteCount,
        score
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * カテゴリ別集計
   */
  private calculateCategories(articles: ArticleWithRelations[]): CategorySummary[] {
    const categoryMap = new Map<string, ArticleWithRelations[]>();

    articles.forEach(article => {
      const articleTags = article.tags.map((t) => t.name.toLowerCase());
      
      for (const [category, tags] of Object.entries(CATEGORY_TAGS)) {
        const lowerTags = tags.map(t => t.toLowerCase());
        if (articleTags.some((tag) => lowerTags.includes(tag))) {
          if (!categoryMap.has(category)) {
            categoryMap.set(category, []);
          }
          categoryMap.get(category)!.push(article);
          break; // 1つのカテゴリにのみ分類
        }
      }
    });

    const categories: CategorySummary[] = [];
    for (const [name, categoryArticles] of categoryMap.entries()) {
      const topArticle = this.calculateTopArticles(categoryArticles)[0];
      categories.push({
        name,
        count: categoryArticles.length,
        topArticle: topArticle ? {
          id: topArticle.id,
          title: topArticle.title
        } : null
      });
    }

    return categories.sort((a, b) => b.count - a.count);
  }

  /**
   * 週の開始日（日曜日）を取得（UTC基準）- レガシー用
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getUTCDay(); // 0=Sunday
    const diff = d.getUTCDate() - day;
    d.setUTCDate(diff);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  /**
   * 週の終了日（土曜日の23:59:59）を取得（UTC基準）- レガシー用
   */
  private getWeekEnd(weekStart: Date): Date {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + 6);
    d.setUTCHours(23, 59, 59, 999);
    return d;
  }

  /**
   * 現在のJST日時を取得
   */
  private getCurrentJST(): Date {
    const now = new Date();
    // UTCからJSTへの変換（+9時間）
    return new Date(now.getTime() + (9 * 60 * 60 * 1000));
  }

  /**
   * DateをJSTとして扱う
   */
  private toJST(date: Date): Date {
    // すでにJSTとして扱われている場合はそのまま返す
    return new Date(date.getTime());
  }

  /**
   * 週の開始日（日曜日）を取得（JST基準）
   */
  private getWeekStartJST(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sunday（ローカル時間として扱う）
    const diff = d.getDate() - day;
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    // UTC時間に変換（JSTの0時 = UTC前日15時）
    return new Date(d.getTime() - (9 * 60 * 60 * 1000));
  }

  /**
   * 週の終了日（土曜日の23:59:59）を取得（JST基準）
   */
  private getWeekEndJST(weekStart: Date): Date {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }
}