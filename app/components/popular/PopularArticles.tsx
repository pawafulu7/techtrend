'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Bookmark, ThumbsUp, Star, Calendar, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import type { ArticleWithRelations } from '@/types/models';
import { RankBadge } from './rank-badge';
import { TrendIndicator } from './trend-indicator';
import { ScoreTooltip } from './score-tooltip';
import { ShareButton } from './share-button';
import { PresetFilters, type PeriodType, type MetricType } from './preset-filters';

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
  showPresetFilters = true
}: PopularArticlesProps) {
  const [articles, setArticles] = useState<RankedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>(initialPeriod);
  const [metric, setMetric] = useState<MetricType>(initialMetric);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

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

  const handlePresetChange = useCallback((preset: string | null, newPeriod: PeriodType, newMetric: MetricType) => {
    setSelectedPreset(preset);
    setPeriod(newPeriod);
    setMetric(newMetric);
  }, []);

  const handlePeriodChange = useCallback((value: string) => {
    setSelectedPreset(null); // Clear preset when manually changing
    setPeriod(value as PeriodType);
  }, []);

  const handleMetricChange = useCallback((value: string) => {
    setSelectedPreset(null); // Clear preset when manually changing
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
              <Link href="/popular">
                もっと見る
              </Link>
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
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold">
                    {article.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">
                      {article.translatedTitle || article.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{article.source.name}</span>
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>人気記事ランキング</CardTitle>
          <div className="flex items-center gap-2">
            <Tabs value={period} onValueChange={handlePeriodChange}>
              <TabsList className="h-8">
                <TabsTrigger value="today" className="text-xs">今日</TabsTrigger>
                <TabsTrigger value="week" className="text-xs">週間</TabsTrigger>
                <TabsTrigger value="month" className="text-xs">月間</TabsTrigger>
                <TabsTrigger value="all" className="text-xs">全期間</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        {showPresetFilters && (
          <PresetFilters
            selectedPreset={selectedPreset}
            onPresetChange={handlePresetChange}
            className="mt-4"
          />
        )}
      </CardHeader>
      <CardContent>
        <Tabs value={metric} onValueChange={handleMetricChange}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="combined">
              <TrendingUp className="h-4 w-4 mr-1" />
              総合
            </TabsTrigger>
            <TabsTrigger value="bookmarks">
              <Bookmark className="h-4 w-4 mr-1" />
              保存
            </TabsTrigger>
            <TabsTrigger value="votes">
              <ThumbsUp className="h-4 w-4 mr-1" />
              投票
            </TabsTrigger>
            <TabsTrigger value="quality">
              <Star className="h-4 w-4 mr-1" />
              品質
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="space-y-3" aria-live="polite">
              {Array.from({ length: limit }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              ランキングデータがありません
            </div>
          ) : (
            <div className="space-y-3">
              {articles.map((article) => (
                <div
                  key={article.id}
                  className={cn(
                    "group relative flex items-start gap-3 p-3 rounded-lg border transition-colors",
                    "hover:bg-accent hover:border-accent-foreground/20",
                    article.rank <= 3 && "border-primary/20 bg-primary/5"
                  )}
                >
                  <div className="flex flex-col items-center gap-1">
                    <RankBadge rank={article.rank} />
                    <TrendIndicator trend={article.trend} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/articles/${article.id}`}
                      className="font-medium hover:text-primary transition-colors line-clamp-2"
                    >
                      {article.translatedTitle || article.title}
                    </Link>

                    <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(article.publishedAt)}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {article.source.name}
                      </Badge>
                      {article.difficulty && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            article.difficulty === 'beginner' && "border-[var(--tt-color-positive)]",
                            article.difficulty === 'intermediate' && "border-[var(--tt-color-info)]",
                            article.difficulty === 'advanced' && "border-[var(--tt-color-warning)]"
                          )}
                        >
                          {article.difficulty === 'beginner' && '初級'}
                          {article.difficulty === 'intermediate' && '中級'}
                          {article.difficulty === 'advanced' && '上級'}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-2">
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

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
                      <div className="flex flex-wrap gap-1 mt-2">
                        {article.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag.id} variant="outline" className="text-xs">
                            {tag.name}
                          </Badge>
                        ))}
                        {article.tags.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{article.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons Overlay */}
                  <div
                    className={cn(
                      "absolute top-2 right-2 flex gap-1 z-10",
                      "opacity-0 transition-opacity duration-200",
                      "group-hover:opacity-100 group-focus-within:opacity-100",
                      "motion-reduce:transition-none"
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
                      className="h-11 w-11 p-0 flex items-center justify-center"
                    >
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Open ${article.translatedTitle || article.title} in new tab`}
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
      </CardContent>
    </Card>
  );
}
