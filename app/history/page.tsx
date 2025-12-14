'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, AlertCircle, History, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { HistoryArticleCard } from '@/app/components/article/history-card';
import { useGroupedHistory } from '@/app/hooks/use-grouped-history';
import { getDateGroupHeadingId } from '@/lib/utils/date-grouping';
import type { HistoryViewItem } from '@/lib/types/history';

// APIレスポンスのZodスキーマ（Prismaモデルに合わせてidはstring）
const ArticleViewSchema = z.object({
  id: z.string(),
  viewId: z.string(),
  title: z.string(),
  translatedTitle: z.string().nullable().optional(),
  summary: z.string().nullable(),
  url: z.string(),
  publishedAt: z.string(),
  viewedAt: z.string().nullable(),
  source: z.object({
    id: z.string(),
    name: z.string(),
  }),
  companyName: z.string().nullable().optional(),
  tags: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .optional(),
  contentLength: z.number().optional(),
  content: z.string().nullable().optional(),
});

const ArticleViewsResponseSchema = z.object({
  views: z.array(ArticleViewSchema),
});

// Skeleton component for loading state (grid layout)
function HistoryCardSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg border bg-card p-4 space-y-3 h-[280px]"
      role="status"
      aria-label="読み込み中"
    >
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 bg-muted rounded" />
        <div className="h-5 w-16 bg-muted rounded" />
      </div>
      <div className="h-6 w-full bg-muted rounded" />
      <div className="space-y-2">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-5/6 bg-muted rounded" />
        <div className="h-4 w-4/6 bg-muted rounded" />
      </div>
      <div className="flex gap-1 pt-2">
        <div className="h-5 w-12 bg-muted rounded" />
        <div className="h-5 w-14 bg-muted rounded" />
      </div>
      <div className="mt-auto flex justify-between items-center pt-2">
        <div className="h-8 w-8 bg-muted rounded" />
        <div className="h-8 w-20 bg-muted rounded" />
      </div>
    </div>
  );
}

// Skeleton grid for loading state
function HistorySkeletonGrid() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      role="status"
      aria-live="polite"
      aria-label="閲覧履歴を読み込み中"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <HistoryCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function HistoryPage() {
  const { data: _session, status } = useSession();
  const router = useRouter();
  const [views, setViews] = useState<HistoryViewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [justCleared, setJustCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emptyStateRef = useRef<HTMLDivElement>(null);

  // モバイル検出（コンポーネントライフサイクル中は変化しない）
  const [isMobile] = useState(
    () =>
      typeof navigator !== 'undefined' &&
      /Mobi|Android/i.test(navigator.userAgent)
  );

  const groupedHistory = useGroupedHistory(views);

  const fetchHistory = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();

        // モバイルの場合は軽量モードを使用
        if (isMobile) {
          params.set('lightweight', 'true');
        }
        // sourceリレーションを含める（表示に必要）
        params.set('includeRelations', 'true');
        // 90日以内の履歴を最大100件取得
        params.set('limit', '100');

        const response = await fetch(`/api/article-views?${params.toString()}`, {
          signal,
        });

        if (!response.ok) {
          throw new Error('閲覧履歴の取得に失敗しました');
        }

        const data = await response.json();
        // APIレスポンスをZodスキーマで検証
        const parsed = ArticleViewsResponseSchema.safeParse(data);
        if (!parsed.success) {
          console.error('API response validation failed:', parsed.error);
          throw new Error('閲覧履歴のデータ形式が不正です');
        }

        // 検証済みデータをHistoryViewItem形式に変換
        const historyItems: HistoryViewItem[] = parsed.data.views.map(
          (view) => ({
            viewedAt: view.viewedAt,
            article: view,
          })
        );
        setViews(historyItems);
      } catch (err) {
        // AbortErrorは無視（コンポーネントアンマウント時）
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    },
    [isMobile]
  );

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/history');
      return;
    }

    if (status === 'authenticated') {
      const abortController = new AbortController();
      fetchHistory(abortController.signal);
      return () => abortController.abort();
    }
  }, [status, router, fetchHistory]);

  // クリア完了後のフォーカス管理（宣言的アプローチ）
  useEffect(() => {
    if (justCleared && views.length === 0) {
      emptyStateRef.current?.focus();
      setJustCleared(false);
    }
  }, [justCleared, views.length]);

  const clearHistory = async () => {
    if (clearing) return;
    try {
      setClearing(true);
      const response = await fetch('/api/article-views', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('履歴のクリアに失敗しました');
      }

      setViews([]);
      setJustCleared(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setClearing(false);
    }
  };

  const handleTagClick = useCallback(
    (tagName: string) => {
      router.push(`/?tags=${encodeURIComponent(tagName)}&tagMode=OR`);
    },
    [router]
  );

  // Loading state
  if (status === 'loading' || loading) {
    return (
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
        {/* Header skeleton */}
        <div className="mb-6">
          <CardV2 className="p-4 sm:p-6 border-l-4 border-l-primary bg-card shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-primary/20 rounded-xl animate-pulse" />
                <div>
                  <div className="h-7 w-32 bg-muted rounded animate-pulse mb-1" />
                  <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                </div>
              </div>
              <div className="h-11 w-36 bg-muted rounded-lg animate-pulse" />
            </div>
          </CardV2>
        </div>
        <HistorySkeletonGrid />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
      {/* Header Card */}
      <header className="mb-6">
        <CardV2 className="p-4 sm:p-6 border-l-4 border-l-primary bg-card shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                <History className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
                  閲覧履歴
                </h1>
                <p className="text-sm text-muted-foreground">
                  最近の記事 ({views.length}件)
                </p>
              </div>
            </div>
            {views.length > 0 && (
              <Button
                variant="destructive"
                size="default"
                onClick={clearHistory}
                disabled={clearing}
                className="min-w-[140px] min-h-[44px] gap-2 shadow-sm font-medium"
                aria-label="閲覧履歴をすべてクリア"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {clearing ? 'クリア中...' : '履歴をクリア'}
              </Button>
            )}
          </div>
        </CardV2>
      </header>

      {/* Error state */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {views.length === 0 ? (
        <CardV2
          ref={emptyStateRef}
          tabIndex={-1}
          className="focus:outline-none focus:ring-2 focus:ring-primary max-w-md mx-auto"
        >
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Eye
                className="h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <p className="text-lg font-medium mb-2 text-foreground">
              閲覧履歴がありません
            </p>
            <p className="text-muted-foreground mb-6 text-center text-sm">
              記事を読むと自動的に履歴に記録されます
            </p>
            <Button asChild className="min-w-[44px] min-h-[44px]">
              <Link href="/">記事を探す</Link>
            </Button>
          </div>
        </CardV2>
      ) : (
        /* Grouped history grid */
        <div className="space-y-8">
          {groupedHistory.map((group) => (
            <section
              key={group.key}
              aria-labelledby={getDateGroupHeadingId(group.key)}
            >
              <h2
                id={getDateGroupHeadingId(group.key)}
                className="flex items-center gap-3 mb-4"
              >
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-card border shadow-sm">
                  <span className="font-heading text-lg font-semibold text-foreground">
                    {group.label}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">
                    ({group.items.length}件)
                  </span>
                </span>
              </h2>
              {/* Grid layout matching home page */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {group.items.map((item) => (
                  <HistoryArticleCard
                    key={item.article.viewId}
                    article={item.article}
                    viewedAt={item.viewedAt}
                    onTagClick={handleTagClick}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
