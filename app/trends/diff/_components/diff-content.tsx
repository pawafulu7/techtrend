'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui-v2/button-v2';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Info,
  RefreshCw,
  Minus,
} from 'lucide-react';
import {
  getISOWeek,
  getPreviousISOWeek,
  getNextISOWeek,
} from '@/lib/ai/diff-summary';
import { DiffChange } from '@/lib/ai/extraction/extraction-schemas';
import { DiffMainContent } from './diff-sections';
import {
  formatWeekDisplay,
  getGroupedChanges,
  type ArticleInfo,
  type DiffSummaryData,
  type DiffSummaryResponse,
} from './diff-utils';

interface DiffContentProps {
  initialData: DiffSummaryResponse | null;
  initialWeek: string;
}

export function DiffContent({ initialData, initialWeek }: DiffContentProps) {
  const [data, setData] = useState<DiffSummaryResponse | null>(initialData);
  const [articles, setArticles] = useState<Record<string, ArticleInfo>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayWeek, setDisplayWeek] = useState(
    initialData?.week ?? initialWeek
  );
  const [requestedWeek, setRequestedWeek] = useState(initialWeek);
  const [isFallback, setIsFallback] = useState(
    initialData?.isFallback === true
  );
  const [fallbackRequestedWeek, setFallbackRequestedWeek] = useState<
    string | null
  >(initialData?.requestedWeek ?? null);
  const [hoveredTopic, setHoveredTopic] = useState<string | null>(null);
  const fallbackWeekUpdateRef = useRef(false);

  const currentWeek = getISOWeek(new Date());
  const canGoNext = requestedWeek < currentWeek;

  const fetchArticleTitles = useCallback(async (articleIds: string[]) => {
    if (articleIds.length === 0) return;
    try {
      const response = await fetch(
        `/api/articles?ids=${articleIds.slice(0, 20).join(',')}&fields=id,title`
      );
      if (response.ok) {
        const result = await response.json();
        const articlesMap: Record<string, ArticleInfo> = {};
        result.articles?.forEach((a: ArticleInfo) => {
          articlesMap[a.id] = a;
        });
        setArticles((prev) => ({ ...prev, ...articlesMap }));
      }
    } catch {
      // Silent fail
    }
  }, []);

  // 初期データの関連記事タイトルをmount時に取得
  // SC化によりmount時にfetchDataが走らなくなったため、initialDataから直接抽出する
  useEffect(() => {
    if (data) {
      const allArticleIds = data.data.flatMap((item: DiffSummaryData) =>
        (item.changes || []).flatMap(
          (c: DiffChange) => c.relatedArticleIds || []
        )
      );
      if (allArticleIds.length > 0) {
        fetchArticleTitles([...new Set(allArticleIds)] as string[]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount時のみ実行

  const fetchData = useCallback(
    async (week: string, isRetry = false, originalWeek?: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/ai/diff-summary?week=${week}`);
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Failed to fetch data');
        }
        // Handle stale cached empty response from before fallback code deployment
        if (result.data?.length === 0 && !result.isFallback && !isRetry) {
          const prevWeek = getPreviousISOWeek(week);
          if (prevWeek < week) {
            return fetchData(prevWeek, true, week);
          }
        }
        setData(result);
        if (result.isFallback === true || isRetry) {
          setIsFallback(true);
          setFallbackRequestedWeek(
            isRetry ? (originalWeek ?? null) : (result.requestedWeek ?? null)
          );
          fallbackWeekUpdateRef.current = true;
          setDisplayWeek(result.week);
        } else {
          setIsFallback(false);
          setFallbackRequestedWeek(null);
          setDisplayWeek(result.week);
        }
        const allArticleIds: string[] = result.data.flatMap(
          (d: DiffSummaryData) =>
            d.changes.flatMap((c: DiffChange) => c.relatedArticleIds || [])
        );
        if (allArticleIds.length > 0) {
          fetchArticleTitles([...new Set(allArticleIds)] as string[]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsFallback(false);
        setFallbackRequestedWeek(null);
      } finally {
        setLoading(false);
      }
    },
    [fetchArticleTitles]
  );

  const handlePreviousWeek = () => {
    const prev = getPreviousISOWeek(requestedWeek);
    setRequestedWeek(prev);
    fetchData(prev);
  };

  const handleNextWeek = () => {
    if (!canGoNext) return;
    const next = getNextISOWeek(requestedWeek);
    setRequestedWeek(next);
    fetchData(next);
  };

  const grouped = useMemo(() => getGroupedChanges(data), [data]);

  return (
    <div>
      {/* Header */}
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex h-14 items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviousWeek}
              disabled={loading}
              className="gap-1 text-xs"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">前週</span>
            </Button>

            <div className="text-center">
              <h1 className="text-base font-bold tracking-tight">
                週間トピック変化
              </h1>
              <div className="flex items-center justify-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {formatWeekDisplay(displayWeek)}
                </span>
                {displayWeek === currentWeek && (
                  <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
                    今週
                  </span>
                )}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextWeek}
              disabled={loading || !canGoNext}
              className="gap-1 text-xs"
            >
              <span className="hidden sm:inline">次週</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Error state */}
      {error && !loading && (
        <div className="container mx-auto max-w-6xl px-4 py-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchData(requestedWeek)}
                className="ml-4 gap-1.5"
              >
                <RefreshCw className="h-3 w-3" />
                再試行
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Fallback info banner */}
      {isFallback && fallbackRequestedWeek && (
        <div className="container mx-auto max-w-6xl px-4 pt-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {formatWeekDisplay(fallbackRequestedWeek)}
              のデータは未生成のため、最新の
              {data ? formatWeekDisplay(data.week) : ''}
              のデータを表示しています。
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="bg-muted h-16 rounded-lg" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-muted h-28 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      ) : data?.data && data.data.length > 0 ? (
        <DiffMainContent
          data={data}
          grouped={grouped}
          articles={articles}
          hoveredTopic={hoveredTopic}
          onHoverEnter={setHoveredTopic}
          onHoverLeave={() => setHoveredTopic(null)}
        />
      ) : (
        <div className="container mx-auto max-w-6xl px-4 py-16 text-center">
          <div className="bg-muted mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full">
            <Minus className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">データがありません</h3>
          <p className="text-muted-foreground text-sm">
            {formatWeekDisplay(displayWeek)}のデータはまだ生成されていません。
          </p>
        </div>
      )}
    </div>
  );
}
