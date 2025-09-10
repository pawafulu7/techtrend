/**
 * 品質モニタリングサービス
 * 記事の品質を継続的に監視し、改善を管理
 */

import { PrismaClient } from '@prisma/client';
import logger from '@/lib/logger';

const prisma = new PrismaClient();

interface QualityStats {
  totalArticles: number;
  averageScore: number;
  lowQualityCount: number;
  highQualityCount: number;
  needsRegenerationCount: number;
  distribution: {
    excellent: number;    // 90点以上
    good: number;        // 70-89点
    fair: number;        // 50-69点
    poor: number;        // 50点未満
  };
}

interface QualityTrend {
  date: Date;
  averageScore: number;
  lowQualityCount: number;
  highQualityCount: number;
}

interface RegenerationRecommendation {
  articleId: string;
  title: string;
  currentScore: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export class QualityMonitor {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * 全体の品質統計を取得
   */
  async getQualityStats(days: number = 30): Promise<QualityStats> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const articles = await this.prisma.article.findMany({
      where: {
        createdAt: {
          gte: since,
        },
      },
      select: {
        id: true,
        qualityScore: true,
        summaryVersion: true,
      },
    });

    const scores = articles
      .map(a => a.qualityScore)
      .filter((score): score is number => score !== null);

    const totalArticles = articles.length;
    const averageScore = scores.length > 0 
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;

    const distribution = {
      excellent: scores.filter(s => s >= 90).length,
      good: scores.filter(s => s >= 70 && s < 90).length,
      fair: scores.filter(s => s >= 50 && s < 70).length,
      poor: scores.filter(s => s < 50).length,
    };

    const lowQualityCount = distribution.fair + distribution.poor;
    const highQualityCount = distribution.excellent + distribution.good;
    const needsRegenerationCount = articles.filter(a => 
      (a.qualityScore === null || a.qualityScore < 70) &&
      (a.summaryVersion === null || a.summaryVersion < 8)
    ).length;

    return {
      totalArticles,
      averageScore: Math.round(averageScore * 10) / 10,
      lowQualityCount,
      highQualityCount,
      needsRegenerationCount,
      distribution,
    };
  }

  /**
   * 品質トレンドを取得
   */
  async getQualityTrend(days: number = 7): Promise<QualityTrend[]> {
    const trends: QualityTrend[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const articles = await this.prisma.article.findMany({
        where: {
          createdAt: {
            gte: date,
            lt: nextDate,
          },
          qualityScore: {
            gt: 0,  // nullではなく0より大きい値でフィルタリング
          },
        },
        select: {
          qualityScore: true,
        },
      });

      if (articles.length > 0) {
        const scores = articles.map(a => a.qualityScore!);
        const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const lowQualityCount = scores.filter(s => s < 70).length;
        const highQualityCount = scores.filter(s => s >= 70).length;

        trends.push({
          date,
          averageScore: Math.round(averageScore * 10) / 10,
          lowQualityCount,
          highQualityCount,
        });
      }
    }

    return trends;
  }

  /**
   * 再生成推薦を取得
   */
  async getRegenerationRecommendations(limit: number = 20): Promise<RegenerationRecommendation[]> {
    const articles = await this.prisma.article.findMany({
      where: {
        OR: [
          {
            qualityScore: {
              lt: 70,
            },
          },
          {
            qualityScore: null,
          },
        ],
      },
      orderBy: [
        {
          qualityScore: 'asc',
        },
        {
          viewCount: 'desc',
        },
      ],
      take: limit,
      include: {
        tags: true,
      },
    });

    return articles.map(article => {
      const score = article.qualityScore || 0;
      let priority: 'high' | 'medium' | 'low';
      let reason: string;

      // エンリッチメント済みで低品質
      if (article.content && article.content.length >= 2000 && score < 50) {
        priority = 'high';
        reason = 'エンリッチメント済みだが品質が非常に低い';
      }
      // 高閲覧数で低品質
      else if (article.viewCount > 100 && score < 60) {
        priority = 'high';
        reason = '閲覧数が多いが品質が低い';
      }
      // 通常の低品質
      else if (score < 70) {
        priority = 'medium';
        reason = '品質スコアが基準値未満';
      }
      // スコア未設定
      else {
        priority = 'low';
        reason = '品質スコア未設定';
      }

      return {
        articleId: article.id,
        title: article.title,
        currentScore: score,
        priority,
        reason,
      };
    });
  }

  /**
   * ソース別品質統計を取得
   */
  async getQualityBySource(): Promise<Map<string, QualityStats>> {
    const sources = await this.prisma.source.findMany({
      include: {
        articles: {
          select: {
            qualityScore: true,
            summaryVersion: true,
          },
        },
      },
    });

    const statsBySource = new Map<string, QualityStats>();

    for (const source of sources) {
      const scores = source.articles
        .map(a => a.qualityScore)
        .filter((score): score is number => score !== null);

      const totalArticles = source.articles.length;
      const averageScore = scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : 0;

      const distribution = {
        excellent: scores.filter(s => s >= 90).length,
        good: scores.filter(s => s >= 70 && s < 90).length,
        fair: scores.filter(s => s >= 50 && s < 70).length,
        poor: scores.filter(s => s < 50).length,
      };

      const lowQualityCount = distribution.fair + distribution.poor;
      const highQualityCount = distribution.excellent + distribution.good;
      const needsRegenerationCount = source.articles.filter(a =>
        (a.qualityScore === null || a.qualityScore < 70) &&
        (a.summaryVersion === null || a.summaryVersion < 8)
      ).length;

      statsBySource.set(source.name, {
        totalArticles,
        averageScore: Math.round(averageScore * 10) / 10,
        lowQualityCount,
        highQualityCount,
        needsRegenerationCount,
        distribution,
      });
    }

    return statsBySource;
  }

  /**
   * 品質改善効果を測定
   */
  async measureImprovementImpact(
    before: Date,
    after: Date
  ): Promise<{
    beforeAverage: number;
    afterAverage: number;
    improvement: number;
    improvedCount: number;
    degradedCount: number;
  }> {
    // before時点の記事
    const beforeArticles = await this.prisma.article.findMany({
      where: {
        updatedAt: {
          lt: before,
        },
        qualityScore: {
          not: null,
        },
      },
      select: {
        id: true,
        qualityScore: true,
      },
    });

    // after時点の同じ記事
    const afterArticles = await this.prisma.article.findMany({
      where: {
        id: {
          in: beforeArticles.map(a => a.id),
        },
        updatedAt: {
          gte: after,
        },
      },
      select: {
        id: true,
        qualityScore: true,
      },
    });

    const beforeMap = new Map(beforeArticles.map(a => [a.id, a.qualityScore!]));
    const afterMap = new Map(afterArticles.map(a => [a.id, a.qualityScore!]));

    let improvedCount = 0;
    let degradedCount = 0;
    let totalBefore = 0;
    let totalAfter = 0;
    let count = 0;

    for (const [id, beforeScore] of beforeMap) {
      const afterScore = afterMap.get(id);
      if (afterScore !== undefined) {
        totalBefore += beforeScore;
        totalAfter += afterScore;
        count++;

        if (afterScore > beforeScore) {
          improvedCount++;
        } else if (afterScore < beforeScore) {
          degradedCount++;
        }
      }
    }

    const beforeAverage = count > 0 ? totalBefore / count : 0;
    const afterAverage = count > 0 ? totalAfter / count : 0;
    const improvement = afterAverage - beforeAverage;

    return {
      beforeAverage: Math.round(beforeAverage * 10) / 10,
      afterAverage: Math.round(afterAverage * 10) / 10,
      improvement: Math.round(improvement * 10) / 10,
      improvedCount,
      degradedCount,
    };
  }

  /**
   * リソースのクリーンアップ
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// CLIとして実行された場合
if (require.main === module) {
  const monitor = new QualityMonitor();

  (async () => {
    if (process.env.NODE_ENV !== 'production') {
      logger.info('=== 品質モニタリングレポート ===\n');

      // 全体統計
      const stats = await monitor.getQualityStats(30);
      logger.info('全体統計（過去30日）:');
      logger.info(`  総記事数: ${stats.totalArticles}件`);
      logger.info(`  平均スコア: ${stats.averageScore}点`);
      logger.info(`  高品質記事: ${stats.highQualityCount}件`);
      logger.info(`  低品質記事: ${stats.lowQualityCount}件`);
      logger.info(`  再生成必要: ${stats.needsRegenerationCount}件`);
      logger.info('\n  品質分布:');
      logger.info(`    優秀 (90点以上): ${stats.distribution.excellent}件`);
      logger.info(`    良好 (70-89点): ${stats.distribution.good}件`);
      logger.info(`    普通 (50-69点): ${stats.distribution.fair}件`);
      logger.info(`    不良 (50点未満): ${stats.distribution.poor}件`);

      // トレンド
      logger.info('\n品質トレンド（過去7日）:');
      const trends = await monitor.getQualityTrend(7);
      for (const trend of trends) {
        logger.info(`  ${trend.date.toLocaleDateString('ja-JP')}: 平均${trend.averageScore}点 (高品質${trend.highQualityCount}件/低品質${trend.lowQualityCount}件)`);
      }

      // 推薦
      logger.info('\n再生成推薦（上位10件）:');
      const recommendations = await monitor.getRegenerationRecommendations(10);
      for (const rec of recommendations) {
        logger.info(`  [${rec.priority.toUpperCase()}] ${rec.title.substring(0, 50)}...`);
        logger.info(`    現在スコア: ${rec.currentScore}点 | 理由: ${rec.reason}`);
      }
    }

    await monitor.disconnect();
  })().catch((error) => {
    logger.error({ error }, 'Quality monitor execution failed');
  });
}