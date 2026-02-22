'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const TechSectorTreemap = dynamic(
  () =>
    import('@/app/components/trends/TechSectorTreemap').then(
      (mod) => mod.TechSectorTreemap
    ),
  { ssr: false }
);

type Period = 'day' | 'week' | 'month';

interface CategoryData {
  category: string;
  label: string;
  count: number;
  share: number;
  previousShare: number;
  changeRate: number;
}

interface HeatmapApiResponse {
  categories?: CategoryData[];
  period?: string;
  generatedAt?: string;
  error?: string;
}

interface DrilldownArticle {
  id: string;
  title: string;
  translatedTitle?: string | null;
  url: string;
  publishedAt: string;
  source?: { name: string } | null;
  tags?: Array<{ name: string }>;
}

interface ArticlesApiResponse {
  success?: boolean;
  data?: {
    items?: DrilldownArticle[];
  };
  error?: string;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'day', label: '1日' },
  { value: 'week', label: '1週間' },
  { value: 'month', label: '1ヶ月' },
];

function isValidPeriod(value: string | null): value is Period {
  return value === 'day' || value === 'week' || value === 'month';
}

export function HeatmapPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const paramPeriod = searchParams.get('period');
  const period: Period = isValidPeriod(paramPeriod) ? paramPeriod : 'week';

  const [heatmapData, setHeatmapData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drilldown state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [_drilldownCategory, setDrilldownCategory] = useState<string | null>(
    null
  );
  const [drilldownLabel, setDrilldownLabel] = useState<string>('');
  const [drilldownArticles, setDrilldownArticles] = useState<
    DrilldownArticle[]
  >([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const drilldownAbortRef = useRef<AbortController | null>(null);

  // Fetch heatmap data
  const fetchHeatmap = useCallback(async (p: Period) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/trends/heatmap?period=${p}`, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result: HeatmapApiResponse = await response.json();

      if (result.error) {
        setError(result.error);
        setHeatmapData([]);
      } else {
        setHeatmapData(result.categories ?? []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to fetch heatmap data:', err);
      }
      setError('データの取得に失敗しました');
      setHeatmapData([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchHeatmap(period);
    return () => {
      abortRef.current?.abort();
    };
  }, [period, fetchHeatmap]);

  // Period toggle handler
  const handlePeriodChange = useCallback(
    (newPeriod: Period) => {
      if (newPeriod === period) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set('period', newPeriod);
      router.push(`/trends/heatmap?${params.toString()}`);
    },
    [period, searchParams, router]
  );

  // Category click -> drilldown
  const handleCategoryClick = useCallback(
    async (category: string) => {
      const clicked = heatmapData.find((d) => d.category === category);
      setDrilldownCategory(category);
      setDrilldownLabel(clicked?.label ?? category);
      setSheetOpen(true);
      setDrilldownLoading(true);
      setDrilldownArticles([]);

      drilldownAbortRef.current?.abort();
      const controller = new AbortController();
      drilldownAbortRef.current = controller;

      try {
        const url = `/api/articles?category=${encodeURIComponent(category)}&limit=20&sortBy=publishedAt&sortOrder=desc&includeRelations=true`;
        const response = await fetch(url, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result: ArticlesApiResponse = await response.json();
        setDrilldownArticles(result.data?.items ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to fetch drilldown articles:', err);
        }
        setDrilldownArticles([]);
      } finally {
        if (!controller.signal.aborted) {
          setDrilldownLoading(false);
        }
      }
    },
    [heatmapData]
  );

  const handleSheetChange = useCallback((open: boolean) => {
    if (open) return;
    setSheetOpen(false);
    drilldownAbortRef.current?.abort();
    setDrilldownCategory(null);
  }, []);

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">テックセクターマップ</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            カテゴリ別の記事動向をヒートマップで可視化
          </p>
        </div>

        {/* Period toggle */}
        <div
          className="bg-muted/50 flex items-center gap-1 rounded-lg p-1"
          role="radiogroup"
          aria-label="表示期間の選択"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={period === opt.value}
              onClick={() => handlePeriodChange(opt.value)}
              className={cn(
                'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
                'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                period === opt.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchHeatmap(period)}
              className="shrink-0 gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              再試行
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Treemap */}
      <TechSectorTreemap
        data={heatmapData}
        onCategoryClick={handleCategoryClick}
        loading={loading}
      />

      {/* Legend */}
      {!loading && heatmapData.length > 0 && (
        <div className="flex items-center justify-center gap-4 text-xs">
          <span className="text-muted-foreground">シェア変化:</span>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-red-500" />
            <span className="text-muted-foreground">シェア低下</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-gray-500" />
            <span className="text-muted-foreground">横ばい</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-green-500" />
            <span className="text-muted-foreground">シェア上昇</span>
          </div>
        </div>
      )}

      {/* Drilldown Sheet */}
      <Sheet open={sheetOpen} onOpenChange={handleSheetChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>{drilldownLabel}</SheetTitle>
            <SheetDescription>
              カテゴリ「{drilldownLabel}」の最新記事
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            {drilldownLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-md bg-(--tt-color-surface-muted)"
                  />
                ))}
              </div>
            ) : drilldownArticles.length > 0 ? (
              drilldownArticles.map((article) => (
                <a
                  key={article.id}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-md border p-3 transition-colors hover:bg-(--tt-color-surface-hover)"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="line-clamp-2 text-sm leading-snug font-medium">
                        {article.translatedTitle ?? article.title}
                      </h4>
                      <div className="text-muted-foreground mt-1.5 flex items-center gap-2 text-xs">
                        {article.source?.name && (
                          <span>{article.source.name}</span>
                        )}
                        {article.publishedAt && (
                          <time dateTime={article.publishedAt}>
                            {new Date(article.publishedAt).toLocaleDateString(
                              'ja-JP',
                              {
                                month: 'short',
                                day: 'numeric',
                              }
                            )}
                          </time>
                        )}
                      </div>
                      {article.tags && article.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {article.tags.slice(0, 5).map((t) => (
                            <span
                              key={t.name}
                              className="bg-muted rounded px-1.5 py-0.5 text-[10px]"
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ExternalLink className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </a>
              ))
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                記事が見つかりませんでした
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
