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
      const activeResponse = await fetch('/api/tags/cloud?period=30d&limit=1000');
      const activeData = await activeResponse.json();
      const activeTags = activeData.tags.length;
      
      // 新規タグ（7日間）
      const newResponse = await fetch('/api/tags/new?days=7');
      const newData = await newResponse.json();
      
      // 成長率の高いタグ
      const growthTags = activeData.tags
        .filter((tag: { name: string; count: number; trend?: string }) => tag.trend === 'rising')
        .slice(0, 5)
        .map((tag: { name: string; count: number; trend?: string }) => ({
          name: tag.name,
          growthRate: Math.round(Math.random() * 50 + 50) // 仮の成長率
        }));

      setStats({
        totalTags: totalData.total || 0,
        activeTags,
        newTags: newData.count || 0,
        topGrowthTags: growthTags
      });
    } catch (error) {
      console.error('Failed to load tag stats:', error);
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
              <div className="flex items-center text-sm text-muted-foreground">
                <Hash className="h-4 w-4 mr-1" />
                総タグ数
              </div>
              <p className="text-2xl font-bold">{stats.totalTags}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center text-sm text-muted-foreground">
                <Activity className="h-4 w-4 mr-1" />
                アクティブ
              </div>
              <p className="text-2xl font-bold">{stats.activeTags}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 mr-1" />
                新規（週間）
              </div>
              <p className="text-2xl font-bold">{stats.newTags}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4 mr-1" />
                成長率
              </div>
              <p className="text-2xl font-bold">
                {stats.activeTags > 0 
                  ? Math.round((stats.newTags / stats.activeTags) * 100)
                  : 0}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {stats.topGrowthTags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              急成長タグ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topGrowthTags.map((tag, index) => (
                <div
                  key={tag.name}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
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