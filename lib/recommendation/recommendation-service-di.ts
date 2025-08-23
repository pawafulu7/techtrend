import { PrismaClient } from '@prisma/client';
import { 
  UserInterests, 
  RecommendedArticle, 
  RecommendationScore
} from './types';
import { 
  defaultConfig, 
  calculateTimeWeight, 
  calculateFreshnessBoost,
  hashTagSet,
  normalizeScore
} from './utils';
import { getRedisService } from '@/lib/redis/factory';
import { getPrismaClient, getRedisClient } from '@/lib/di';

const redisService = getRedisService();

export class RecommendationServiceDI {
  private config = defaultConfig;
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || getPrismaClient();
  }

  /**
   * ユーザーの興味分野を分析
   */
  async getUserInterests(userId: string): Promise<UserInterests | null> {
    // キャッシュ確認
    const cacheKey = `user:interests:${userId}`;
    const cached = await redisService.getJSON<any>(cacheKey);
    if (cached) {
      return {
        tagScores: new Map(Object.entries(cached.tagScores)),
        totalActions: cached.totalActions,
        lastUpdated: new Date(cached.lastUpdated),
      };
    }

    // 閲覧履歴を取得
    const recentViews = await this.prisma.articleView.findMany({
      where: {
        userId,
        viewedAt: {
          gte: new Date(Date.now() - this.config.activityWindow),
        },
      },
      include: {
        article: {
          include: {
            tags: true,
          },
        },
      },
      orderBy: {
        viewedAt: 'desc',
      },
      take: this.config.maxActivityHistory,
    });

    // お気に入りを取得
    const favorites = await this.prisma.favorite.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - this.config.activityWindow),
        },
      },
      include: {
        article: {
          include: {
            tags: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: this.config.maxActivityHistory,
    });

    // アクティビティがない場合
    if (recentViews.length === 0 && favorites.length === 0) {
      return null;
    }

    // タグスコアを計算
    const tagScores = new Map<string, number>();
    const now = Date.now();

    // 閲覧履歴からスコア計算
    recentViews.forEach((view) => {
      const weight = calculateTimeWeight(view.viewedAt, now, this.config.activityWindow);
      view.article.tags.forEach((tag) => {
        const current = tagScores.get(tag.name) || 0;
        tagScores.set(tag.name, current + this.config.weights.view * weight);
      });
    });

    // お気に入りからスコア計算
    favorites.forEach((favorite) => {
      const weight = calculateTimeWeight(
        favorite.createdAt,
        now,
        this.config.activityWindow
      );
      favorite.article.tags.forEach((tag) => {
        const current = tagScores.get(tag.name) || 0;
        tagScores.set(tag.name, current + this.config.weights.favorite * weight);
      });
    });

    const interests: UserInterests = {
      tagScores,
      totalActions: recentViews.length + favorites.length,
      lastUpdated: new Date(),
    };

    // キャッシュに保存
    await redisService.setJSON(
      cacheKey,
      {
        tagScores: Object.fromEntries(tagScores),
        totalActions: interests.totalActions,
        lastUpdated: interests.lastUpdated.toISOString(),
      },
      this.config.cacheExpiry.userInterests
    );

    return interests;
  }

  /**
   * 記事のレコメンドスコアを計算
   */
  calculateRecommendationScore(
    article: any,
    interests: UserInterests
  ): RecommendationScore {
    let score = 0;
    const reasons: string[] = [];
    const matchedTags: string[] = [];

    // タグマッチングスコア
    article.tags.forEach((tag: any) => {
      const tagName = typeof tag === 'string' ? tag : tag.name;
      const tagScore = interests.tagScores.get(tagName) || 0;
      if (tagScore > 0) {
        score += tagScore;
        matchedTags.push(tagName);
      }
    });

    if (matchedTags.length > 0) {
      reasons.push(`あなたが興味のある「${matchedTags.join('」「')}」に関連`);
    }

    // 新しさによるブースト
    const freshnessBoost = calculateFreshnessBoost(
      new Date(article.publishedAt),
      this.config.freshnessWindow
    );
    score *= 1 + freshnessBoost;

    if (freshnessBoost > 0.3) {
      reasons.push('最新の記事');
    }

    // 品質スコアによる調整
    if (article.qualityScore) {
      score *= article.qualityScore / 100;
      if (article.qualityScore >= 80) {
        reasons.push('高品質な記事');
      }
    }

    // スコア正規化
    score = normalizeScore(score);

    return {
      articleId: article.id,
      score,
      matchedTags,
      reasons,
    };
  }

  /**
   * レコメンド記事を取得
   */
  async getRecommendations(
    userId: string,
    limit: number = 10
  ): Promise<RecommendedArticle[]> {
    // ユーザーの興味を分析
    const interests = await this.getUserInterests(userId);

    // 興味データがない場合はデフォルトのレコメンド
    if (!interests) {
      return this.getDefaultRecommendations(limit);
    }

    // すでに閲覧済みの記事IDを取得
    const viewedArticleIds = await this.prisma.articleView
      .findMany({
        where: { userId },
        select: { articleId: true },
        take: 1000,
      })
      .then((views) => views.map((v) => v.articleId));

    // 候補記事を取得
    const candidateArticles = await this.prisma.article.findMany({
      where: {
        id: {
          notIn: viewedArticleIds,
        },
        publishedAt: {
          gte: new Date(Date.now() - this.config.candidateWindow),
        },
      },
      include: {
        source: true,
        tags: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: limit * 10,
    });

    // 各記事のスコアを計算
    const scoredArticles = candidateArticles
      .map((article) => ({
        article,
        score: this.calculateRecommendationScore(article, interests),
      }))
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, limit);

    // レコメンド記事を構築
    return scoredArticles.map(({ article, score }) => ({
      id: article.id,
      title: article.title,
      url: article.url,
      summary: article.summary || '',
      thumbnail: article.thumbnail,
      publishedAt: article.publishedAt,
      sourceName: article.source.name,
      tags: article.tags.map((t) => t.name),
      recommendationScore: score.score,
      recommendationReasons: score.reasons,
    }));
  }

  /**
   * デフォルトのレコメンド（新規ユーザー向け）
   */
  async getDefaultRecommendations(limit: number): Promise<RecommendedArticle[]> {
    const articles = await this.prisma.article.findMany({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
        qualityScore: {
          gte: 75,
        },
      },
      include: {
        source: true,
        tags: true,
      },
      orderBy: [
        { qualityScore: 'desc' },
        { publishedAt: 'desc' },
      ],
      take: limit,
    });

    return articles.map((article) => ({
      id: article.id,
      title: article.title,
      url: article.url,
      summary: article.summary || '',
      thumbnail: article.thumbnail,
      publishedAt: article.publishedAt,
      sourceName: article.source.name,
      tags: article.tags.map((t) => t.name),
      recommendationScore: article.qualityScore / 100,
      recommendationReasons: ['話題の記事', '高品質なコンテンツ'],
    }));
  }
}

// シングルトンインスタンス（後方互換性のため）
export const recommendationServiceDI = new RecommendationServiceDI();