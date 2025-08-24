'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArticleCard } from '@/app/components/article/card';
import { 
  ArrowLeft, ExternalLink, BookOpen, Star, 
  TrendingUp, Calendar, Tag, BarChart
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { ArticleWithRelations } from '@/types/models';
import type { Source } from '@prisma/client';

interface SourceDetail {
  source: Source & {
    _count: {
      articles: number;
    };
  };
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

export default function SourceDetailPage() {
  const params = useParams();
  const sourceId = params.id as string;
  const [data, setData] = useState<SourceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sourceId) {
      loadSourceDetail();
    }
  }, [sourceId]);

  const loadSourceDetail = async () => {
    try {
      const response = await fetch(`/api/sources/${sourceId}`);
      if (!response.ok) {
        throw new Error('Failed to load source detail');
      }
      const data = await response.json();
      setData(data);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-96" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-60" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">
            ソースが見つかりませんでした
          </p>
          <Button asChild className="mt-4">
            <Link href="/sources">
              ソース一覧に戻る
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const { source, stats, recentArticles, topArticles, tagDistribution } = data;
  const topTags = Object.entries(tagDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href="/sources" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            ソース一覧に戻る
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* ヘッダー */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl mb-2">{source.name}</CardTitle>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{stats.totalArticles}</div>
                  <p className="text-sm text-muted-foreground">記事数</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{stats.avgQualityScore}</div>
                  <p className="text-sm text-muted-foreground">平均品質</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{stats.avgBookmarks}</div>
                  <p className="text-sm text-muted-foreground">平均保存数</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {stats.publishFrequency.toFixed(1)}
                  </div>
                  <p className="text-sm text-muted-foreground">記事/日</p>
                </div>
              </div>
              
              {stats.lastPublished && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    最終更新: {formatDistanceToNow(new Date(stats.lastPublished), {
                      addSuffix: true,
                      locale: ja
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 最新記事 */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              最新記事
            </h2>
            <div className="space-y-4">
              {recentArticles.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
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
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                人気記事TOP5
              </h2>
              <div className="space-y-4">
                {topArticles.map((article, index) => (
                  <div key={article.id} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
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
                    <div key={tag} className="flex items-center justify-between">
                      <Badge variant="secondary">{tag}</Badge>
                      <span className="text-sm text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">
                過去30日間の投稿数推移
              </p>
              <div className="h-32 mt-4 bg-muted rounded flex items-center justify-center">
                <span className="text-muted-foreground">グラフ表示予定</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}