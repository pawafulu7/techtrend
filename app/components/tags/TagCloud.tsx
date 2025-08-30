'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tag {
  id: string;
  name: string;
  count: number;
  trend: 'rising' | 'stable' | 'falling';
}

interface TagCloudProps {
  className?: string;
  limit?: number;
  period?: '7d' | '30d' | 'all';
  onTagClick?: (tag: string) => void;
}

export function TagCloud({ 
  className, 
  limit = 50,
  period: initialPeriod = '30d',
  onTagClick 
}: TagCloudProps) {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(initialPeriod);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTags();
  }, [period, limit]);

  const loadTags = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `/api/tags/cloud?period=${period}&limit=${limit}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to load tags');
      }
      
      const data = await response.json();
      setTags(data.tags);
    } catch (_error) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // フォントサイズの計算
  const { minCount, maxCount, fontSizes } = useMemo(() => {
    if (tags.length === 0) return { minCount: 0, maxCount: 0, fontSizes: {} };
    
    const counts = tags.map(t => t.count);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    
    const sizes = tags.reduce((acc, tag) => {
      const minSize = 12;
      const maxSize = 36;
      
      if (max === min) {
        acc[tag.id] = (minSize + maxSize) / 2;
      } else {
        const ratio = (tag.count - min) / (max - min);
        acc[tag.id] = minSize + ratio * (maxSize - minSize);
      }
      
      return acc;
    }, {} as Record<string, number>);
    
    return { minCount: min, maxCount: max, fontSizes: sizes };
  }, [tags]);

  // タグの色を決定
  const getTagColor = (tag: Tag) => {
    const baseClasses = 'transition-all duration-300 hover:scale-110';
    
    if (tag.trend === 'rising') {
      return cn(baseClasses, 'text-green-600 hover:text-green-700');
    } else if (tag.trend === 'falling') {
      return cn(baseClasses, 'text-red-600 hover:text-red-700');
    }
    
    // 使用頻度に基づいて色の濃さを変える
    const intensity = (tag.count - minCount) / (maxCount - minCount);
    if (intensity > 0.7) {
      return cn(baseClasses, 'text-primary hover:text-primary/80');
    } else if (intensity > 0.4) {
      return cn(baseClasses, 'text-primary/80 hover:text-primary/60');
    }
    return cn(baseClasses, 'text-primary/60 hover:text-primary/40');
  };

  const handleTagClick = (tag: Tag) => {
    if (onTagClick) {
      onTagClick(tag.name);
    } else {
      // デフォルトでは検索ページへ遷移
      router.push(`/search?tags=${encodeURIComponent(tag.name)}`);
    }
  };

  const getTrendIcon = (trend: 'rising' | 'stable' | 'falling') => {
    switch (trend) {
      case 'rising':
        return <TrendingUp className="inline h-3 w-3 ml-1 text-green-600" />;
      case 'falling':
        return <TrendingDown className="inline h-3 w-3 ml-1 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>タグクラウド</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <Button
                variant={period === '7d' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod('7d')}
              >
                週間
              </Button>
              <Button
                variant={period === '30d' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod('30d')}
              >
                月間
              </Button>
              <Button
                variant={period === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod('all')}
              >
                全期間
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadTags}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 20 }).map((_, i) => (
              <Skeleton
                key={i}
                className="inline-block h-6 mr-2 mb-2"
                style={{ width: `${Math.random() * 100 + 50}px` }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadTags}
              className="mt-4"
            >
              再試行
            </Button>
          </div>
        ) : tags.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            タグが見つかりませんでした
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 justify-center items-center min-h-[200px]">
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleTagClick(tag)}
                className={cn(
                  'inline-flex items-center px-3 py-1 rounded-full',
                  'hover:bg-accent transition-all duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-primary',
                  getTagColor(tag)
                )}
                style={{ fontSize: `${fontSizes[tag.id]}px` }}
                title={`${tag.name} (${tag.count}件)`}
              >
                {tag.name}
                {period !== 'all' && getTrendIcon(tag.trend)}
              </button>
            ))}
          </div>
        )}
        
        {!loading && !error && tags.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-600" />
                急上昇
              </span>
              <span className="flex items-center gap-1">
                <Minus className="h-3 w-3" />
                安定
              </span>
              <span className="flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-red-600" />
                下降
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}