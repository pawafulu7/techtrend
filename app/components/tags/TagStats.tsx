'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Hash, Calendar, Activity } from 'lucide-react';

interface TagStat {
  totalTags: number;
  activeTags: number; // 過去30日間に使用されたタグ
  newTags: number; // 過去7日間に初めて使用されたタグ
  topGrowthTags: Array<{
    name: string;
    growthRate: number;
  }>;
}

export function TagStats() {
  const [stats, setStats] = useState<TagStat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // 総タグ数
      const totalResponse = await fetch('/api/tags/stats');
      const totalData = await totalResponse.json();

      // アクティブタグ数（30日間）
      const activeResponse = await fetch(
        '/api/tags/cloud?period=30d&limit=1000'
      );
      const activeData = await activeResponse.json();
      const activeTags = activeData.tags.length;

      // 新規タグ（7日間）
      const newResponse = await fetch('/api/tags/new?days=7');
      const newData = await newResponse.json();

      // 成長率の高いタグ（APIから返されるgrowthRateを使用）
      const growthTags = activeData.tags
        .filter(
          (tag: {
            name: string;
            count: number;
            trend?: string;
            growthRate?: number;
          }) => tag.trend === 'rising'
        )
        .sort(
          (a: { growthRate?: number }, b: { growthRate?: number }) =>
            (b.growthRate || 0) - (a.growthRate || 0)
        )
        .slice(0, 5)
        .map((tag: { name: string; count: number; growthRate?: number }) => ({
          name: tag.name,
          growthRate: tag.growthRate || 0,
        }));

      setStats({
        totalTags: totalData.total || 0,
        activeTags,
        newTags: newData.count || 0,
        topGrowthTags: growthTags,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to load tag stats:', error);
      }
    } finally {
      setLoading(false);
    }
  };

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

  if (!stats) {
    return null;
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
              <TrendingUp className="h-5 w-5 text-green-600" />
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
                  <span className="text-sm font-medium text-green-600">
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
