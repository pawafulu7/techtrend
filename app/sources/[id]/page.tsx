import { notFound } from 'next/navigation';
import logger from '@/lib/logger';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui-v2/card-v2';
import { Button } from '@/components/ui-v2/button-v2';
import { Badge } from '@/components/ui-v2/badge-v2';
import { ArticleCard } from '@/app/components/article/card';
import {
  ArrowLeft,
  ExternalLink,
  TrendingUp,
  Calendar,
  Tag,
  BarChart,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { ArticleWithRelations } from '@/types/models';
import type { Source } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';

interface SourceDetail {
  source: Source;
  stats: {
    totalArticles: number;
    avgQualityScore: number;
    avgBookmarks: number;
    publishFrequency: number;
    lastPublished: Date | null;
  };
  recentArticles: ArticleWithRelations[];
  topArticles: ArticleWithRelations[];
  tagDistribution: Record<string, number>;
}

async function getSourceDetail(id: string): Promise<SourceDetail | null> {
  const source = await prisma.source.findUnique({
    where: { id },
  });

  if (!source) {
    return null;
  }

  const [
    articleAgg,
    recentArticlesCount,
    recentArticles,
    topArticles,
    tagDistribution,
  ] = await Promise.all([
    prisma.article.aggregate({
      where: { sourceId: id, isHidden: false },
      _count: { _all: true },
      _avg: { qualityScore: true, bookmarks: true },
    }),

    prisma.article.count({
      where: {
        sourceId: id,
        isHidden: false,
        publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),

    prisma.article.findMany({
      where: { sourceId: id, isHidden: false },
      include: {
        source: true,
        tags: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: 10,
    }),

    prisma.article.findMany({
      where: { sourceId: id, isHidden: false },
      include: {
        source: true,
        tags: true,
      },
      orderBy: [{ bookmarks: 'desc' }, { publishedAt: 'desc' }],
      take: 5,
    }),

    prisma.$queryRaw<Array<{ name: string; count: bigint }>>`
      SELECT t.name, COUNT(*)::bigint AS count
      FROM "Tag" t
      INNER JOIN "_ArticleToTag" at ON t.id = at."B"
      INNER JOIN "Article" a ON at."A" = a.id
      WHERE a."sourceId" = ${id} AND a."isHidden" = false
      GROUP BY t.name
      ORDER BY count DESC
      LIMIT 20
    `,
  ]);

  const totalArticles = articleAgg._count._all;
  const avgQualityScore = Number(articleAgg._avg.qualityScore ?? 0);
  const avgBookmarks = Number(articleAgg._avg.bookmarks ?? 0);
  const publishFrequency = recentArticlesCount / 30;

  const lastPublished =
    recentArticles.length > 0 ? recentArticles[0].publishedAt : null;

  const tagDistributionObj = tagDistribution.reduce(
    (acc, tag) => {
      acc[tag.name] = Number(tag.count);
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    source,
    stats: {
      totalArticles,
      avgQualityScore: Math.round(avgQualityScore),
      avgBookmarks: Math.round(avgBookmarks),
      publishFrequency: Math.round(publishFrequency * 10) / 10,
      lastPublished: lastPublished ?? null,
    },
    recentArticles,
    topArticles,
    tagDistribution: tagDistributionObj,
  };
}

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: SourceDetail | null;
  try {
    data = await getSourceDetail(id);
  } catch (error) {
    logger.error({ sourceId: id, error }, 'Failed to load source detail');
    notFound();
  }

  if (!data) {
    notFound();
  }

  const { source, stats, recentArticles, topArticles, tagDistribution } = data;
  const topTags = Object.entries(tagDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div>
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href="/sources" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            ソース一覧に戻る
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ヘッダー */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="mb-2 text-2xl">{source.name}</CardTitle>
                  <p className="text-muted-foreground">{source.type}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    サイトを見る
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {stats.totalArticles}
                  </div>
                  <p className="text-muted-foreground text-sm">記事数</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {stats.avgQualityScore}
                  </div>
                  <p className="text-muted-foreground text-sm">平均品質</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{stats.avgBookmarks}</div>
                  <p className="text-muted-foreground text-sm">平均保存数</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {stats.publishFrequency.toFixed(1)}
                  </div>
                  <p className="text-muted-foreground text-sm">記事/日</p>
                </div>
              </div>

              {stats.lastPublished && (
                <div className="mt-4 border-t pt-4">
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4" />
                    最終更新:{' '}
                    {formatDistanceToNow(new Date(stats.lastPublished), {
                      addSuffix: true,
                      locale: ja,
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 最新記事 */}
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
              <Calendar className="h-5 w-5" />
              最新記事
            </h2>
            <div className="space-y-4">
              {recentArticles.length === 0 ? (
                <Card>
                  <CardContent className="text-muted-foreground py-8 text-center">
                    記事がありません
                  </CardContent>
                </Card>
              ) : (
                recentArticles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))
              )}
            </div>
          </div>

          {/* 人気記事 */}
          {topArticles.length > 0 && (
            <div>
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
                <TrendingUp className="h-5 w-5" />
                人気記事TOP5
              </h2>
              <div className="space-y-4">
                {topArticles.map((article, index) => (
                  <div key={article.id} className="flex items-start gap-3">
                    <div className="bg-primary/10 text-primary flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <ArticleCard article={article} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* サイドバー */}
        <div className="space-y-6">
          {/* タグ分布 */}
          {topTags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  人気のタグ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topTags.map(([tag, count]) => (
                    <div
                      key={tag}
                      className="flex items-center justify-between"
                    >
                      <Badge variant="secondary">{tag}</Badge>
                      <span className="text-muted-foreground text-sm">
                        {count}記事
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 統計グラフ（プレースホルダー） */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart className="h-5 w-5" />
                投稿統計
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                過去30日間の投稿数推移
              </p>
              <div className="bg-muted mt-4 flex h-32 items-center justify-center rounded">
                <span className="text-muted-foreground">グラフ表示予定</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
