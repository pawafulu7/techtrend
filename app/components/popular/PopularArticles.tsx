'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  Bookmark,
  ThumbsUp,
  Star,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import type { ArticleWithRelations } from '@/types/models';
import { RankBadge } from './rank-badge';
import { TrendIndicator } from './trend-indicator';
import { TranslationBadge } from '@/components/ui/translation-badge';
import { ScoreTooltip } from './score-tooltip';
import { ShareButton } from './share-button';
import {
  PresetFilters,
  type PeriodType,
  type MetricType,
} from './preset-filters';
import { PopularStatsBar } from './popular-stats-bar';

interface RankedArticle extends ArticleWithRelations {
  rank: number;
  previousRank?: number;
  score: number;
  trend: 'up' | 'down' | 'stable' | 'new';
}

interface PopularArticlesProps {
  initialPeriod?: PeriodType;
  initialMetric?: MetricType;
  limit?: number;
  compact?: boolean;
  showPresetFilters?: boolean;
}

export function PopularArticles({
  initialPeriod = 'week',
  initialMetric = 'combined',
  limit = 10,
  compact = false,
  showPresetFilters = true,
}: PopularArticlesProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [articles, setArticles] = useState<RankedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<MetricType>(initialMetric);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Period is driven by URL params in full mode, by props in compact mode
  const period = compact
    ? initialPeriod
    : ((searchParams.get('period') || initialPeriod) as PeriodType);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/articles/popular?period=${period}&metric=${metric}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error('Failed to load popular articles');
      }

      const data = await response.json();
      setArticles(data.articles);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to load popular articles:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [period, metric, limit]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  const handlePresetChange = useCallback(
    (preset: string | null, newPeriod: PeriodType, newMetric: MetricType) => {
      setSelectedPreset(preset);
      setMetric(newMetric);
      // Update URL with new period
      const params = new URLSearchParams(searchParams.toString());
      params.set('period', newPeriod);
      params.set('preset', preset || '');
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const handleMetricChange = useCallback((value: string) => {
    setSelectedPreset(null);
    setMetric(value as MetricType);
  }, []);

  const getMetricIcon = (metricType: MetricType) => {
    switch (metricType) {
      case 'bookmarks':
        return <Bookmark className="h-4 w-4" />;
      case 'votes':
        return <ThumbsUp className="h-4 w-4" />;
      case 'quality':
        return <Star className="h-4 w-4" />;
      default:
        return <TrendingUp className="h-4 w-4" />;
    }
  };

  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">人気記事</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/popular">もっと見る</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2" aria-live="polite">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {articles.slice(0, 5).map((article) => (
                <Link
                  key={article.id}
                  href={`/articles/${article.id}`}
                  className="hover:bg-accent flex items-start gap-3 rounded-lg p-2 transition-colors"
                >
                  <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold">
                    {article.rank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">
                      {article.translatedTitle || article.title}
                    </p>
                    <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                      <span>{article.source.name}</span>
                      {article.translatedTitle && (
                        <TranslationBadge className="text-xs" />
                      )}
                      <span aria-hidden="true">-</span>
                      <span>{formatDate(article.publishedAt)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const totalBookmarks = articles.reduce((sum, a) => sum + a.bookmarks, 0);

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <PopularStatsBar
        articleCount={articles.length}
        topScore={articles[0]?.score ?? 0}
        totalBookmarks={totalBookmarks}
        loading={loading}
      />
      {showPresetFilters && (
        <PresetFilters
          selectedPreset={selectedPreset}
          onPresetChange={handlePresetChange}
        />
      )}
      <Tabs value={metric} onValueChange={handleMetricChange}>
        <TabsList className="mb-4 grid w-full grid-cols-4">
          <TabsTrigger value="combined">
            <TrendingUp className="mr-1 h-4 w-4" />
            総合
          </TabsTrigger>
          <TabsTrigger value="bookmarks">
            <Bookmark className="mr-1 h-4 w-4" />
            保存
          </TabsTrigger>
          <TabsTrigger value="votes">
            <ThumbsUp className="mr-1 h-4 w-4" />
            投票
          </TabsTrigger>
          <TabsTrigger value="quality">
            <Star className="mr-1 h-4 w-4" />
            品質
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="space-y-3" aria-live="polite">
            {Array.from({ length: limit }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-20 w-full"
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">
            ランキングデータがありません
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <div
                key={article.id}
                className={cn(
                  'group relative flex items-start gap-3 rounded-lg border p-3 transition-colors',
                  'hover:bg-accent hover:border-accent-foreground/20',
                  article.rank <= 3 && 'border-primary/20 bg-primary/5'
                )}
              >
                <div className="flex flex-col items-center gap-1">
                  <RankBadge rank={article.rank} />
                  <TrendIndicator trend={article.trend} />
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/articles/${article.id}`}
                    className="hover:text-primary line-clamp-2 font-medium transition-colors"
                  >
                    {article.translatedTitle || article.title}
                  </Link>

                  <div className="text-muted-foreground mt-2 flex items-center gap-3 text-sm">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(article.publishedAt)}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {article.source.name}
                    </Badge>
                    {article.translatedTitle && (
                      <TranslationBadge className="text-xs" />
                    )}
                    {article.difficulty && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          article.difficulty === 'beginner' &&
                            'border-(--tt-color-positive)',
                          article.difficulty === 'intermediate' &&
                            'border-(--tt-color-info)',
                          article.difficulty === 'advanced' &&
                            'border-(--tt-color-warning)'
                        )}
                      >
                        {article.difficulty === 'beginner' && '初級'}
                        {article.difficulty === 'intermediate' && '中級'}
                        {article.difficulty === 'advanced' && '上級'}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-4">
                    <ScoreTooltip
                      score={article.score}
                      bookmarks={article.bookmarks}
                      votes={article.userVotes || 0}
                      qualityScore={article.qualityScore}
                    >
                      <span className="flex items-center gap-1 text-sm">
                        {getMetricIcon(metric)}
                        <span className="font-medium">
                          {Math.round(article.score)}
                        </span>
                      </span>
                    </ScoreTooltip>

                    <div className="text-muted-foreground flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <Bookmark className="h-3 w-3" />
                        {article.bookmarks}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        {article.userVotes || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        {Math.round(article.qualityScore)}
                      </span>
                    </div>
                  </div>

                  {article.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {article.tags.slice(0, 3).map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="text-xs"
                        >
                          {tag.name}
                        </Badge>
                      ))}
                      {article.tags.length > 3 && (
                        <span className="text-muted-foreground text-xs">
                          +{article.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    'absolute top-2 right-2 z-10 flex gap-1',
                    'opacity-0 transition-opacity duration-200',
                    'group-focus-within:opacity-100 group-hover:opacity-100',
                    'motion-reduce:transition-none'
                  )}
                >
                  <ShareButton
                    url={article.url}
                    title={article.translatedTitle || article.title}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="flex h-11 w-11 items-center justify-center p-0"
                  >
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${article.translatedTitle || article.title} を新しいタブで開く`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Tabs>
    </div>
  );
}
