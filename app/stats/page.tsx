import { Suspense } from 'react';
import { StatsOverview } from '@/app/components/stats/overview';
import { SourceChart } from '@/app/components/stats/source-chart';
import { DailyChart } from '@/app/components/stats/daily-chart';
import { TagCloud } from '@/app/components/stats/tag-cloud';
import { prisma } from '@/lib/database';
import { BarChart3, TrendingUp } from 'lucide-react';

async function getStats() {
  const [
    totalArticles,
    articlesLast7Days,
    articlesLast30Days,
    sourceStats,
    dailyStats,
    popularTags,
  ] = await Promise.all([
    prisma.article.count(),
    prisma.article.count({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.article.count({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.source.findMany({
      where: { enabled: true },
      include: {
        _count: {
          select: { articles: true },
        },
      },
      orderBy: {
        articles: {
          _count: 'desc',
        },
      },
    }),
    prisma.$queryRaw`
      SELECT 
        DATE(datetime(publishedAt/1000, 'unixepoch')) as date,
        COUNT(*) as count
      FROM Article
      WHERE datetime(publishedAt/1000, 'unixepoch') >= datetime('now', '-30 days')
      GROUP BY DATE(datetime(publishedAt/1000, 'unixepoch'))
      ORDER BY date ASC
    ` as Promise<{ date: string; count: bigint }[]>,
    prisma.tag.findMany({
      include: {
        _count: {
          select: { articles: true },
        },
      },
      orderBy: {
        articles: {
          _count: 'desc',
        },
      },
      take: 20,
    }),
  ]);

  return {
    overview: {
      total: totalArticles,
      last7Days: articlesLast7Days,
      last30Days: articlesLast30Days,
      averagePerDay: Math.round(articlesLast30Days / 30),
    },
    sources: sourceStats.map(source => ({
      id: source.id,
      name: source.name,
      count: source._count.articles,
      percentage: totalArticles > 0 
        ? Math.round((source._count.articles / totalArticles) * 100) 
        : 0,
    })),
    daily: dailyStats.map(d => ({
      date: d.date,
      count: Number(d.count),
    })),
    tags: popularTags.map(tag => ({
      id: tag.id,
      name: tag.name,
      count: tag._count.articles,
    })),
  };
}

export default async function StatsPage() {
  const stats = await getStats();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          統計情報
        </h1>
        <p className="text-muted-foreground mt-1">
          記事の収集状況とトレンドを可視化
        </p>
      </div>

      <div className="space-y-6">
        {/* 概要 */}
        <Suspense fallback={<div>Loading overview...</div>}>
          <StatsOverview stats={stats.overview} />
        </Suspense>

        {/* チャート */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 日別推移 */}
          <Suspense fallback={<div>Loading daily chart...</div>}>
            <DailyChart data={stats.daily} />
          </Suspense>

          {/* ソース別分布 */}
          <Suspense fallback={<div>Loading source chart...</div>}>
            <SourceChart data={stats.sources} />
          </Suspense>
        </div>

        {/* タグクラウド */}
        <Suspense fallback={<div>Loading tags...</div>}>
          <TagCloud tags={stats.tags} />
        </Suspense>
      </div>
    </div>
  );
}