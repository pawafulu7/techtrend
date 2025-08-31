import { PrismaClient, Prisma } from '@prisma/client';

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
  };
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
    const weekEnd = startDate || new Date();
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);
    
    // 週の開始と終了を日曜日基準に調整
    const adjustedStart = this.getWeekStart(weekStart);
    const adjustedEnd = this.getWeekEnd(adjustedStart);

    // Digest generation for week

    // 既存のダイジェストをチェック
    const existing = await this.prisma.weeklyDigest.findUnique({
      where: { weekStartDate: adjustedStart }
    });

    if (existing) {
      // Digest already exists
      return existing.id;
    }

    // 週間の記事を取得
    const articles = await this.prisma.article.findMany({
      where: {
        publishedAt: {
          gte: adjustedStart,
          lt: adjustedEnd
        }
      },
      include: {
        tags: true,
        articleViews: true,
        favorites: true,
        source: true
      }
    });

    // Found articles for the week

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
        topArticles: topArticles.slice(0, 10).map(a => ({
          id: a.id,
          title: a.title,
          url: a.url,
          score: a.score
        })) as Prisma.InputJsonValue,
        categories: categories as Prisma.InputJsonValue
      }
    });

    // Weekly digest created
    return digest.id;
  }

  /**
   * 特定週のダイジェストを取得
   */
  async getWeeklyDigest(weekStartDate: Date) {
    const adjustedStart = this.getWeekStart(weekStartDate);
    
    const digest = await this.prisma.weeklyDigest.findUnique({
      where: { weekStartDate: adjustedStart }
    });

    if (!digest) {
      return null;
    }

    // 記事の詳細情報を取得
    const topArticleIds = (digest.topArticles as Array<{id: string; title: string; url: string; score: number}>).map(a => a.id);
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
  private calculateTopArticles(articles: Array<{id: string; title: string; url: string; articleViews: Array<unknown>; favorites: Array<unknown>}>): TopArticle[] {
    return articles.map(article => {
      const viewCount = article.articleViews.length;
      const favoriteCount = article.favorites.length;
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
  private calculateCategories(articles: Array<{id: string; title: string; url: string; tags: Array<{name: string}>; articleViews: Array<unknown>; favorites: Array<unknown>}>): CategorySummary[] {
    const categoryMap = new Map<string, typeof articles>();
    
    // タグからカテゴリを推定
    const categoryTags = {
      'Frontend': ['React', 'Vue', 'Angular', 'CSS', 'JavaScript', 'TypeScript', 'Next.js'],
      'Backend': ['Node.js', 'Python', 'Ruby', 'Go', 'Java', 'PHP', 'Rails', 'Django'],
      'AI/ML': ['AI', 'LLM', 'Claude', 'GPT', 'Gemini', '機械学習', 'ChatGPT'],
      'Security': ['セキュリティ', 'Security', '脆弱性', 'CVE', 'XSS', 'CSRF'],
      'DevOps': ['Docker', 'Kubernetes', 'CI/CD', 'AWS', 'GCP', 'Azure', 'Jenkins'],
      'Database': ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQL', 'NoSQL'],
      'Mobile': ['iOS', 'Android', 'Flutter', 'React Native', 'Swift', 'Kotlin']
    };

    articles.forEach(article => {
      const articleTags = article.tags.map((t) => t.name);
      
      for (const [category, tags] of Object.entries(categoryTags)) {
        if (articleTags.some((tag: string) => tags.includes(tag))) {
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
        } : { id: '', title: '' }
      });
    }

    return categories.sort((a, b) => b.count - a.count);
  }

  /**
   * 週の開始日（日曜日）を取得
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * 週の終了日（土曜日の23:59:59）を取得
   */
  private getWeekEnd(weekStart: Date): Date {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }
}