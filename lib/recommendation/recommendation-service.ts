import { prisma } from '@/lib/prisma';
import { ExtendedArticle } from '@/types/common';
import {
  UserInterests,
  RecommendedArticle,
  RecommendationScore,
  CachedUserInterests
} from './types';
import {
  defaultConfig,
  calculateTimeWeight,
  calculateFreshnessBoost,
  hashTagSet
} from './utils';
import { getRedisService } from '@/lib/redis/factory';
import { createArticleViewLoader } from '@/lib/dataloader/article-view-loader';
import type DataLoader from 'dataloader';
import type { ViewStatus } from '@/lib/dataloader/article-view-loader';
import { recommendationMetrics } from '@/lib/monitoring/recommendation-metrics';
import logger from '@/lib/logger';

const redisService = getRedisService();

// ViewLoaderキャッシュエントリの型定義
interface ViewLoaderCacheEntry {
  loader: DataLoader<string, ViewStatus>;
  createdAt: number;
}

export class RecommendationService {
  private config = defaultConfig;
  private viewLoaderCache = new Map<string, ViewLoaderCacheEntry>();
  private readonly VIEW_LOADER_TTL = 5 * 60 * 1000; // 5分のTTL

  /**
   * DataLoaderインスタンスを取得（ユーザー毎にキャッシュ、TTL付き）
   */
  private getViewLoader(userId: string): DataLoader<string, ViewStatus> {
    const now = Date.now();
    const entry = this.viewLoaderCache.get(userId);

    // TTLチェック
    if (entry && (now - entry.createdAt) < this.VIEW_LOADER_TTL) {
      return entry.loader;
    }

    // 新しいLoaderを作成
    const loader = createArticleViewLoader(userId);
    this.viewLoaderCache.set(userId, {
      loader,
      createdAt: now
    });

    // 古いエントリのクリーンアップ（メモリリーク防止）
    if (this.viewLoaderCache.size > 100) {
      // 最も古いエントリを削除
      const entries = Array.from(this.viewLoaderCache.entries());
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
      const toRemove = entries.slice(0, entries.length - 100);
      toRemove.forEach(([key]) => this.viewLoaderCache.delete(key));
    }

    return loader;
  }

  /**
   * ユーザーの興味分野を分析
   */
  async getUserInterests(userId: string): Promise<UserInterests | null> {
    // キャッシュ確認
    const cacheKey = `user:interests:${userId}`;
    
    try {
      const cached = await redisService.getJSON<CachedUserInterests>(cacheKey);
      if (cached && cached.tagScores) {
        return {
          tagScores: new Map(Object.entries(cached.tagScores)),
          totalActions: cached.totalActions,
          lastUpdated: new Date(cached.lastUpdated),
        };
      }
    } catch (_error) {
      logger.error({ error: _error }, '[RecommendationService] Failed to restore cache');
      // キャッシュを無視して処理を継続
    }

    // 過去30日間の閲覧履歴を取得
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [views, favorites] = await Promise.all([
      prisma.articleView.findMany({
        where: {
          userId,
          viewedAt: { gte: thirtyDaysAgo },
        },
        include: {
          article: {
            include: {
              tags: true,
            },
          },
        },
      }),
      prisma.favorite.findMany({
        where: {
          userId,
          createdAt: { gte: thirtyDaysAgo },
        },
        include: {
          article: {
            include: {
              tags: true,
            },
          },
        },
      }),
    ]);


    if (views.length === 0 && favorites.length === 0) {
      return null;
    }

    // タグごとのスコアを計算
    const tagScores = new Map<string, number>();
    const now = Date.now();
    let totalActions = 0;

    // 閲覧履歴からスコア計算
    for (const view of views) {
      const timeWeight = calculateTimeWeight(view.viewedAt ?? new Date(0), now, this.config.activityWindow);
      const actionScore = this.config.viewWeight * timeWeight;
      
      for (const tag of view.article.tags) {
        const currentScore = tagScores.get(tag.name) || 0;
        tagScores.set(tag.name, currentScore + actionScore);
      }
      totalActions++;
    }

    // お気に入りからスコア計算
    for (const favorite of favorites) {
      const timeWeight = calculateTimeWeight(favorite.createdAt, now, this.config.activityWindow);
      const actionScore = this.config.favoriteWeight * timeWeight;
      
      for (const tag of favorite.article.tags) {
        const currentScore = tagScores.get(tag.name) || 0;
        tagScores.set(tag.name, currentScore + actionScore);
      }
      totalActions++;
    }

    const interests: UserInterests = {
      tagScores,
      totalActions,
      lastUpdated: new Date(),
    };

    // キャッシュに保存（5分間）
    await redisService.setJSON(
      cacheKey,
      {
        tagScores: Object.fromEntries(tagScores),
        totalActions,
        lastUpdated: interests.lastUpdated,
      },
      300
    );

    return interests;
  }

  /**
   * 記事の推薦スコアを計算
   */
  calculateRecommendationScore(
    article: ExtendedArticle & {tags: Array<{name: string} | string>; source?: {name: string}; publishedAt: Date},
    interests: UserInterests
  ): RecommendationScore {
    let score = 0;
    const reasons: string[] = [];

    // タグマッチングスコア
    const matchedTags: string[] = [];
    for (const tag of article.tags) {
      const tagName = typeof tag === 'string' ? tag : tag.name;
      const tagScore = interests.tagScores.get(tagName) || 0;
      if (tagScore > 0) {
        score += tagScore;
        matchedTags.push(tagName);
      }
    }

    if (matchedTags.length > 0) {
      reasons.push(`あなたが興味のある「${matchedTags.slice(0, 3).join('」「')}」に関連`);
    }

    // 時間減衰（新しい記事を優先）
    const freshnessBoost = calculateFreshnessBoost(article.publishedAt, this.config.freshnessWindow);
    score *= freshnessBoost;
    
    if (freshnessBoost > 1) {
      reasons.push('最新の記事');
    }

    // 品質スコアの考慮
    const qualityMultiplier = ((article.qualityScore ?? 0) as number) / 100;
    score *= qualityMultiplier;

    if ((article.qualityScore ?? 0) >= 80) {
      reasons.push('高品質な記事');
    }

    return {
      articleId: article.id,
      score,
      reasons,
      matchedTags,
    };
  }

  /**
   * 推薦記事リストを取得
   */
  async getRecommendations(
    userId: string,
    limit: number = 10
  ): Promise<RecommendedArticle[]> {
    const startTime = Date.now();
    try {
      // ユーザーの興味を取得
      const interests = await this.getUserInterests(userId);

      if (!interests || interests.totalActions < 3) {
        // 新規ユーザーまたは履歴が少ない場合はデフォルト推薦
        return this.getDefaultRecommendations(limit);
      }

    // DataLoaderを使用して効率的に閲覧履歴を取得
    const viewLoader = this.getViewLoader(userId);

    // 1回のクエリで全ての閲覧履歴を取得（最適化: 2つのクエリを1つに統合）
    const viewedArticles = await prisma.articleView.findMany({
      where: { userId },
      select: {
        articleId: true,
        viewedAt: true
      },
      take: 1000, // メモリ使用量制限のため最大1000件
      orderBy: { viewedAt: 'desc' }
    });

    // メモリ上で7日間分とそれ以外を分類
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentlyViewedIds = viewedArticles
      .filter(v => v.viewedAt && v.viewedAt >= sevenDaysAgo)
      .map(v => v.articleId);
    // DataLoaderがisViewedの判定を行うため、allViewedIdsは不要になった

    // 候補記事を取得（過去30日間、品質スコア50以上）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const candidates = await prisma.article.findMany({
      where: {
        // 7日以内に読んだ記事のみ除外（それ以前の既読は推薦対象）
        id: { notIn: recentlyViewedIds },
        publishedAt: { gte: thirtyDaysAgo },
        qualityScore: { gte: this.config.minQualityScore },
      },
      include: {
        tags: true,
        source: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: 100, // 候補を100件に制限
    });

    // スコア計算
    const scoredArticles = candidates.map(article => {
      const scoreData = this.calculateRecommendationScore(article, interests);
      return {
        article,
        ...scoreData,
      };
    });

    // スコアでソート
    scoredArticles.sort((a, b) => b.score - a.score);

    // 相対正規化のためのmin/max計算
    const scores = scoredArticles.map(item => item.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreRange = maxScore - minScore;

    // 多様性を確保しながら選択
    const selected: typeof scoredArticles = [];
    const sourceCount = new Map<string, number>();
    const tagSetCount = new Map<string, number>();

    for (const scored of scoredArticles) {
      if (selected.length >= limit) break;

      const sourceName = scored.article.source.name;
      const tagSet = hashTagSet(scored.article.tags.map(t => typeof t === 'string' ? t : t.name));

      // ソース制限チェック
      const currentSourceCount = sourceCount.get(sourceName) || 0;
      if (currentSourceCount >= this.config.maxPerSource) continue;

      // タグセット制限チェック
      const currentTagSetCount = tagSetCount.get(tagSet) || 0;
      if (currentTagSetCount >= this.config.maxSameTagSet) continue;

      selected.push(scored);
      sourceCount.set(sourceName, currentSourceCount + 1);
      tagSetCount.set(tagSet, currentTagSetCount + 1);
    }

      // DataLoaderを使用して各記事の閲覧状態を効率的に取得
      const articleIds = selected.map(item => item.article.id);
      const viewStatuses = await viewLoader.loadMany(articleIds);

      // メトリクスを記録（バッチサイズのみ、DBクエリはDataLoader内で記録）
      recommendationMetrics.recordBatchSize(articleIds.length);

      // キャッシュヒット/ミスを正確に測定（DataLoader内部で測定済みのため削除）
      // RecommendedArticle形式に変換
      return selected.map((item, index) => {
        const viewStatus = viewStatuses[index];
        const isViewed = viewStatus instanceof Error ? false : viewStatus.isViewed;

        // 相対正規化によるスコア計算（0-100）
        const normalizedScore = scoreRange > 0
          ? Math.round(((item.score - minScore) / scoreRange) * 100)
          : 50; // すべて同じスコアの場合は50

        return {
          id: item.article.id,
          title: item.article.title,
          url: item.article.url,
          summary: item.article.summary,
          thumbnail: item.article.thumbnail,
          publishedAt: item.article.publishedAt,
          sourceName: item.article.source.name,
          tags: item.article.tags.map(t => typeof t === 'string' ? t : t.name),
          recommendationScore: normalizedScore,
          recommendationReasons: item.reasons,
          isViewed,  // DataLoaderから取得した既読フラグ
        };
      });
    } finally {
      // レスポンスタイムを必ず記録
      recommendationMetrics.recordResponseTime('getRecommendations', Date.now() - startTime);
    }
  }

  /**
   * 新規ユーザー向けのデフォルト推薦
   */
  async getDefaultRecommendations(limit: number = 10): Promise<RecommendedArticle[]> {
    // 過去3日間の人気記事を取得
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const popularArticles = await prisma.article.findMany({
      where: {
        publishedAt: { gte: threeDaysAgo },
        qualityScore: { gte: 70 },
      },
      include: {
        tags: true,
        source: true,
      },
      orderBy: [
        { qualityScore: 'desc' },
        { publishedAt: 'desc' },
      ],
      take: limit,
    });

    // 品質スコアで相対正規化（70-100の範囲を0-100に変換）
    const scores = popularArticles.map(a => a.qualityScore as number);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreRange = maxScore - minScore;

    return popularArticles.map(article => {
      const normalizedScore = scoreRange > 0
        ? Math.round(((article.qualityScore as number - minScore) / scoreRange) * 100)
        : 50; // すべて同じスコアの場合は50

      return {
        id: article.id,
        title: article.title,
        url: article.url,
        summary: article.summary,
        thumbnail: article.thumbnail,
        publishedAt: article.publishedAt,
        sourceName: article.source.name,
        tags: article.tags.map(t => t.name),
        recommendationScore: normalizedScore,
        recommendationReasons: ['話題の記事', '高品質な記事'],
      };
    });
  }
}

// シングルトンインスタンス
export const recommendationService = new RecommendationService();
