'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Globe, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { AtlasPoint } from '@/app/components/trends/SemanticAtlas';

// ---------------------------------------------------------------------------
// Dynamic import (SSR disabled - Three.js requires DOM)
// ---------------------------------------------------------------------------

const SemanticAtlas = dynamic(
  () =>
    import('@/app/components/trends/SemanticAtlas').then((mod) => ({
      default: mod.SemanticAtlas,
    })),
  {
    loading: () => (
      <div className="flex h-[600px] items-center justify-center rounded-lg border bg-[#0a0a1a]">
        <div className="flex flex-col items-center gap-3">
          <Globe className="h-8 w-8 animate-pulse text-[#546e93]" />
          <span className="text-sm text-[#546e93]">3D空間を構築中...</span>
        </div>
      </div>
    ),
    ssr: false,
  }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AtlasApiResponse {
  points: AtlasPoint[];
  clusters: Array<{
    id: number;
    count: number;
    centroidX: number;
    centroidY: number;
    centroidZ: number;
  }>;
  totalCount: number;
  generatedAt: string;
  error?: string;
}

interface ArticleDetail {
  articleId: string;
  title: string;
  summary: string;
  category: string;
  source: string;
  publishedAt: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'ai_ml', label: 'AI / ML', color: '#54abee' },
  { value: 'frontend', label: 'フロントエンド', color: '#59d18f' },
  { value: 'backend', label: 'バックエンド', color: '#ee7654' },
  { value: 'devops', label: 'DevOps', color: '#ab54ee' },
  { value: 'security', label: 'セキュリティ', color: '#ee5454' },
  { value: 'mobile', label: 'モバイル', color: '#eec754' },
  { value: 'database', label: 'データベース', color: '#54eede' },
  { value: 'cloud', label: 'クラウド', color: '#8787ee' },
  { value: 'data_science', label: 'データサイエンス', color: '#ee87ba' },
  { value: 'programming', label: 'プログラミング', color: '#bade54' },
  { value: 'testing', label: 'テスト', color: '#eeab87' },
  { value: 'other', label: 'その他', color: '#ababab' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SemanticAtlasClient() {
  // Data state
  const [points, setPoints] = useState<AtlasPoint[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [mode, setMode] = useState<'2d' | '3d'>('3d');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Article detail
  const [sheetOpen, setSheetOpen] = useState(false);
  const [articleDetail, setArticleDetail] = useState<ArticleDetail | null>(
    null
  );
  const [detailLoading, setDetailLoading] = useState(false);

  // Tooltip
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const abortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);

  // Track mouse position for tooltip
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setTooltipPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handler, { passive: true });
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // Fetch atlas data
  const fetchAtlas = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/trends/semantic-atlas', {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result: AtlasApiResponse = await response.json();

      if (result.error) {
        setError(result.error);
        setPoints([]);
      } else {
        setPoints(result.points);
        setTotalCount(result.totalCount);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to fetch atlas data:', err);
      }
      setError('データの取得に失敗しました');
      setPoints([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchAtlas();
    return () => {
      abortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, [fetchAtlas]);

  // Point click -> fetch article detail
  const handlePointClick = useCallback(async (articleId: string) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;

    setSheetOpen(true);
    setDetailLoading(true);
    setArticleDetail(null);

    try {
      const response = await fetch(`/api/trends/semantic-atlas/${articleId}`, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result: ArticleDetail = await response.json();
      setArticleDetail(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to fetch article detail:', err);
      }
      setArticleDetail(null);
    } finally {
      if (!controller.signal.aborted) {
        setDetailLoading(false);
      }
    }
  }, []);

  // Point hover
  const handlePointHover = useCallback((articleId: string | null) => {
    setHoveredId(articleId);
  }, []);

  // Find hovered point title for tooltip
  const hoveredPoint = hoveredId
    ? points.find((p) => p.articleId === hoveredId)
    : null;
  const hoveredTitle = hoveredPoint
    ? `Article: ${hoveredPoint.articleId.slice(0, 8)}...`
    : null;

  const handleSheetChange = useCallback((open: boolean) => {
    if (open) return;
    setSheetOpen(false);
    detailAbortRef.current?.abort();
  }, []);

  const handleCategoryChange = useCallback((value: string) => {
    setSelectedCategory(value === 'all' ? null : value);
  }, []);

  // Category label lookup for display
  const getCategoryLabel = (cat: string) => {
    return CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? cat;
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-4 py-6">
      {/* Header + Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Semantic Atlas</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {totalCount > 0
              ? `${totalCount.toLocaleString()}件の記事を意味空間に投影`
              : '記事の意味空間ビジュアライゼーション'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 2D / 3D toggle */}
          <div
            className="bg-muted/50 flex items-center gap-1 rounded-lg p-1"
            role="radiogroup"
            aria-label="表示モードの選択"
          >
            {(['2d', '3d'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
                  'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                  mode === m
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                )}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <Select
            value={selectedCategory ?? 'all'}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="カテゴリを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのカテゴリ</SelectItem>
              {CATEGORY_OPTIONS.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              onClick={fetchAtlas}
              className="shrink-0 gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              再試行
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 3D Canvas */}
      {loading ? (
        <div className="flex h-[600px] items-center justify-center rounded-lg border bg-[#0a0a1a]">
          <div className="flex flex-col items-center gap-3">
            <Globe className="h-8 w-8 animate-pulse text-[#546e93]" />
            <span className="text-sm text-[#546e93]">
              {totalCount > 0
                ? `${totalCount.toLocaleString()}点を配置中...`
                : 'データを読み込み中...'}
            </span>
          </div>
        </div>
      ) : points.length > 0 ? (
        <div className="relative overflow-hidden rounded-lg border">
          <SemanticAtlas
            points={points}
            mode={mode}
            selectedCategory={selectedCategory}
            onPointClick={handlePointClick}
            onPointHover={handlePointHover}
          />

          {/* Tooltip on hover */}
          {hoveredTitle && (
            <div
              className="pointer-events-none fixed z-50 max-w-xs rounded-md bg-black/80 px-3 py-1.5 text-xs text-white shadow-lg"
              style={{
                left: tooltipPos.x + 12,
                top: tooltipPos.y - 8,
              }}
            >
              {hoveredTitle}
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex max-w-sm flex-wrap gap-x-3 gap-y-1 rounded-md bg-black/60 px-3 py-2 text-[10px] backdrop-blur-sm">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() =>
                  setSelectedCategory(
                    selectedCategory === cat.value ? null : cat.value
                  )
                }
                className={cn(
                  'flex items-center gap-1 transition-opacity',
                  selectedCategory !== null &&
                    selectedCategory !== cat.value &&
                    'opacity-40'
                )}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-white/80">{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Controls hint */}
          <div className="absolute top-3 right-3 rounded-md bg-black/60 px-3 py-1.5 text-[10px] text-white/50 backdrop-blur-sm">
            {mode === '3d'
              ? 'ドラッグ: 回転 / スクロール: ズーム'
              : 'スクロール: ズーム / ドラッグ: パン'}
          </div>
        </div>
      ) : (
        <div className="flex h-[600px] items-center justify-center rounded-lg border">
          <p className="text-muted-foreground text-sm">データがありません</p>
        </div>
      )}

      {/* Article Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={handleSheetChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>記事の詳細</SheetTitle>
            <SheetDescription>意味空間上で選択した記事の情報</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {detailLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-6 animate-pulse rounded bg-(--tt-color-surface-muted)"
                  />
                ))}
              </div>
            ) : articleDetail ? (
              <div className="space-y-4">
                <h3 className="text-base leading-snug font-semibold">
                  {articleDetail.title}
                </h3>

                <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          CATEGORY_OPTIONS.find(
                            (c) => c.value === articleDetail.category
                          )?.color ?? '#999',
                      }}
                    />
                    {getCategoryLabel(articleDetail.category)}
                  </span>
                  <span>{articleDetail.source}</span>
                  <time dateTime={articleDetail.publishedAt}>
                    {new Date(articleDetail.publishedAt).toLocaleDateString(
                      'ja-JP',
                      { year: 'numeric', month: 'short', day: 'numeric' }
                    )}
                  </time>
                </div>

                {articleDetail.summary && (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {articleDetail.summary}
                  </p>
                )}

                <a
                  href={articleDetail.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-(--tt-color-surface-hover)"
                >
                  元の記事を読む
                  <ExternalLink className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </a>
              </div>
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                記事情報を取得できませんでした
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
