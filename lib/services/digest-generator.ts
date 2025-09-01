import { PrismaClient, Prisma } from '@prisma/client';
import logger from '@/lib/logger/index';

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

// Prisma JSON型のための型ガード
function isDigestTopArticleArray(value: unknown): value is DigestTopArticle[] {
  return Array.isArray(value) && value.every(item => 
    typeof item === 'object' && item !== null &&
    'id' in item && typeof item.id === 'string' &&
    'title' in item && typeof item.title === 'string' &&
    'url' in item && typeof item.url === 'string' &&
    'score' in item && typeof item.score === 'number'
  );
}

function isCategorySummaryArray(value: unknown): value is CategorySummary[] {
  return Array.isArray(value) && value.every(item => 
    typeof item === 'object' && item !== null &&
    'name' in item && typeof item.name === 'string' &&
    'count' in item && typeof item.count === 'number'
  );
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
    try {
      // UTC基準で計算し、日付の一貫性を保つ
      const now = startDate || new Date();
      const weekStart = this.getWeekStartUTC(now);
      const weekEnd = this.getWeekEndUTC(weekStart);

      // upsertを使用してレースコンディションを防ぐ
      const existing = await this.prisma.weeklyDigest.findUnique({
        where: { weekStartDate: weekStart }
      });

      if (existing) {
        logger.info(`Weekly digest already exists for week starting ${weekStart.toISOString()}`);
        return existing.id;
      }

      // 週間の記事を取得（_countを使用して最適化）
      const articles = await this.prisma.article.findMany({
        where: {
          publishedAt: {
            gte: weekStart,
            lte: weekEnd
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

      if (articles.length === 0) {
        logger.warn(`No articles found for week starting ${weekStart.toISOString()}`);
      }

      // トップ記事を計算
      const topArticles = this.calculateTopArticles(articles);
      
      // カテゴリ別集計
      const categories = this.calculateCategories(articles);

      // ダイジェストを保存（upsertで二重作成を防ぐ）
      const digest = await this.prisma.weeklyDigest.upsert({
        where: {
          weekStartDate: weekStart
        },
        update: {
          weekEndDate: weekEnd,
          articleCount: articles.length,
          topArticles: JSON.parse(JSON.stringify(topArticles.slice(0, 10).map(a => ({
            id: a.id,
            title: a.title,
            url: a.url,
            score: a.score
          })))),
          categories: JSON.parse(JSON.stringify(categories))
        },
        create: {
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
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

      logger.info(`Weekly digest created/updated: ${digest.id} with ${articles.length} articles`);
      return digest.id;
    } catch (error) {
      logger.error('Failed to generate weekly digest', error);
      throw new Error('Failed to generate weekly digest');
    }
  }

  /**
   * 特定週のダイジェストを取得
   */
  async getWeeklyDigest(weekStartDate: Date) {
    try {
      const weekStart = this.getWeekStartUTC(weekStartDate);
      
      const digest = await this.prisma.weeklyDigest.findUnique({
        where: { weekStartDate: weekStart }
      });

      if (!digest) {
        logger.info(`No digest found for week starting ${weekStart.toISOString()}`);
        return null;
      }

      // 型安全なJSON処理
      const topArticlesData = digest.topArticles;
      if (!isDigestTopArticleArray(topArticlesData)) {
        logger.error('Invalid topArticles data format');
        return null;
      }

      // 記事の詳細情報を取得
      const topArticleIds = topArticlesData.map(a => a.id);
      const articles = await this.prisma.article.findMany({
        where: { id: { in: topArticleIds } },
        include: {
          source: true,
          tags: true
        }
      });

      // 順序を保持しながらマッピング
      const orderedArticles = topArticleIds
        .map(id => articles.find(a => a.id === id))
        .filter((article): article is typeof articles[0] => article !== undefined);

      return {
        ...digest,
        topArticles: topArticlesData,
        categories: isCategorySummaryArray(digest.categories) ? digest.categories : [],
        articles: orderedArticles
      };
    } catch (error) {
      logger.error('Failed to get weekly digest', error);
      return null;
    }
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
   * カテゴリ別集計（大文字小文字を区別しない完全一致）
   */
  private calculateCategories(articles: ArticleWithRelations[]): CategorySummary[] {
    const categoryMap = new Map<string, Set<string>>();
    const categoryArticles = new Map<string, ArticleWithRelations[]>();

    // 重複を防ぐためSetを使用
    articles.forEach(article => {
      const articleTags = article.tags.map((t) => t.name.toLowerCase());
      
      for (const [category, tags] of Object.entries(CATEGORY_TAGS)) {
        const lowerTags = tags.map(t => t.toLowerCase());
        // 完全一致のみを対象とし、部分一致を防ぐ
        const hasExactMatch = articleTags.some((tag) => lowerTags.includes(tag));
        
        if (hasExactMatch) {
          if (!categoryArticles.has(category)) {
            categoryArticles.set(category, []);
            categoryMap.set(category, new Set());
          }
          // 記事IDで重複チェック
          if (!categoryMap.get(category)!.has(article.id)) {
            categoryMap.get(category)!.add(article.id);
            categoryArticles.get(category)!.push(article);
          }
          break; // 1つのカテゴリにのみ分類
        }
      }
    });

    const categories: CategorySummary[] = [];
    for (const [name, articles] of categoryArticles.entries()) {
      const topArticle = this.calculateTopArticles(articles)[0];
      categories.push({
        name,
        count: articles.length,
        topArticle: topArticle ? {
          id: topArticle.id,
          title: topArticle.title
        } : null
      });
    }

    return categories.sort((a, b) => b.count - a.count);
  }

  /**
   * 週の開始日（日曜日）を取得（UTC基準）
   */
  private getWeekStartUTC(date: Date): Date {
    const d = new Date(date);
    const day = d.getUTCDay(); // 0=Sunday
    const diff = d.getUTCDate() - day;
    d.setUTCDate(diff);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  /**
   * 週の終了日（土曜日の23:59:59）を取得（UTC基準）
   */
  private getWeekEndUTC(weekStart: Date): Date {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + 6);
    d.setUTCHours(23, 59, 59, 999);
    return d;
  }

}