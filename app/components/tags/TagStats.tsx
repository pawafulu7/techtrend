'use client';

import { useQueries } from '@tanstack/react-query';
import { useEffect, useRef, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { Badge } from '@/components/ui-v2/badge-v2';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Hash, Calendar, Activity } from 'lucide-react';
import logger from '@/lib/logger.client';

interface TagCloudItem {
  id?: string;
  name: string;
  count: number;
  trend?: string;
  growthRate?: number;
}

interface TagStat {
  totalTags: number;
  activeTags: number; // 過去30日間に使用されたタグ
  newTags: number; // 過去7日間に初めて使用されたタグ
  topGrowthTags: Array<{
    name: string;
    growthRate: number;
  }>;
}

async function fetchTagStats() {
  const res = await fetch('/api/tags/stats');
  if (!res.ok) throw new Error(`Failed to fetch tag stats: ${res.status}`);
  return res.json();
}

async function fetchTagCloudSummary() {
  const res = await fetch('/api/tags/cloud?period=30d&limit=1000');
  if (!res.ok)
    throw new Error(`Failed to fetch tag cloud summary: ${res.status}`);
  return res.json();
}

async function fetchTagsNew() {
  const res = await fetch('/api/tags/new?days=7');
  if (!res.ok) throw new Error(`Failed to fetch new tags: ${res.status}`);
  return res.json();
}

export function TagStats() {
  const results = useQueries({
    queries: [
      { queryKey: ['tag-stats'], queryFn: fetchTagStats },
      {
        queryKey: ['tag-cloud-summary', { period: '30d', limit: 1000 }],
        queryFn: fetchTagCloudSummary,
      },
      { queryKey: ['tags-new'], queryFn: fetchTagsNew },
    ],
  });

  const [totalResult, activeResult, newResult] = results;
  const loading = results.some((r) => r.isPending);

  // エラーは各クエリの初回発生時のみログ出力（レンダリング毎の重複出力を防ぐ）
  const totalIsError = results[0].isError;
  const activeIsError = results[1].isError;
  const newIsError = results[2].isError;
  const loggedErrorRef = useRef<boolean[]>([false, false, false]);
  useEffect(() => {
    results.forEach((r, i) => {
      if (r.isError && !loggedErrorRef.current[i]) {
        logger.error({ error: r.error }, 'Failed to load tag stats');
        loggedErrorRef.current[i] = true;
      }
      if (!r.isError) {
        loggedErrorRef.current[i] = false;
      }
    });
  }, [totalIsError, activeIsError, newIsError]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalData = useMemo(
    () =>
      totalResult.isError ? { total: 0 } : (totalResult.data ?? { total: 0 }),
    [totalResult.isError, totalResult.data]
  );
  const activeData = useMemo(
    () =>
      activeResult.isError ? { tags: [] } : (activeResult.data ?? { tags: [] }),
    [activeResult.isError, activeResult.data]
  );
  const newData = useMemo(
    () => (newResult.isError ? { count: 0 } : (newResult.data ?? { count: 0 })),
    [newResult.isError, newResult.data]
  );

  // NOTE: /api/tags/cloud?limit=1000 の上限に制約されるため、
  // アクティブタグ数は最大1000件までの近似値。
  // /api/tags/stats は totalTags のみを返すため、activeTags の正確なカウントには
  // サーバー側でのカウントAPIの追加が必要（現状はAPIが提供していない）。
  const activeTags = useMemo(
    () => (Array.isArray(activeData.tags) ? activeData.tags.length : 0),
    [activeData.tags]
  );

  // 成長率の高いタグ（APIから返されるgrowthRateを使用）
  const growthTags = useMemo(() => {
    const tags = Array.isArray(activeData.tags) ? activeData.tags : [];
    return tags
      .filter((tag: TagCloudItem) => tag.trend === 'rising')
      .sort(
        (a: TagCloudItem, b: TagCloudItem) =>
          (b.growthRate || 0) - (a.growthRate || 0)
      )
      .slice(0, 5)
      .map((tag: TagCloudItem) => ({
        name: tag.name,
        growthRate: tag.growthRate || 0,
      }));
  }, [activeData.tags]);

  const stats: TagStat = useMemo(
    () => ({
      totalTags: totalData.total || 0,
      activeTags,
      newTags: newData.count || 0,
      topGrowthTags: growthTags,
    }),
    [totalData.total, activeTags, newData.count, growthTags]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">タグ統計</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-muted-foreground flex items-center text-sm">
                <Hash className="mr-1 h-4 w-4" />
                総タグ数
              </div>
              <p className="text-2xl font-bold">{stats.totalTags}</p>
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground flex items-center text-sm">
                <Activity className="mr-1 h-4 w-4" />
                アクティブ
              </div>
              <p className="text-2xl font-bold">{stats.activeTags}</p>
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground flex items-center text-sm">
                <Calendar className="mr-1 h-4 w-4" />
                新規（週間）
              </div>
              <p className="text-2xl font-bold">{stats.newTags}</p>
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground flex items-center text-sm">
                <TrendingUp className="mr-1 h-4 w-4" />
                成長率
              </div>
              <p className="text-2xl font-bold">
                {stats.activeTags > 0
                  ? Math.round((stats.newTags / stats.activeTags) * 100)
                  : 0}
                %
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {stats.topGrowthTags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-[var(--tt-color-positive)]" />
              急成長タグ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topGrowthTags.map((tag, index) => (
                <div
                  key={tag.name}
                  className="hover:bg-accent flex items-center justify-between rounded-lg p-2 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm font-medium">
                      #{index + 1}
                    </span>
                    <Badge variant="outline">{tag.name}</Badge>
                  </div>
                  <span className="text-sm font-medium text-[var(--tt-color-positive)]">
                    +{tag.growthRate}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
