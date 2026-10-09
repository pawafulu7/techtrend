'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, AlertCircle, History, Trash2 } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { PageHeader } from '@/components/ui-v2/page-header';
import { ErrorState } from '@/components/ui-v2/error-state';
import { Button } from '@/components/ui-v2/button-v2';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { HistoryArticleCard } from '@/app/components/article/history-card';
import { useGroupedHistory } from '@/app/hooks/use-grouped-history';
import { useFavoriteStatuses } from '@/app/hooks/use-favorite-statuses';
import { getDateGroupHeadingId } from '@/lib/utils/date-grouping';
import { ArticleViewsResponseSchema } from '@/lib/schemas/article-views';
import type { HistoryViewItem } from '@/lib/types/history';

// Skeleton component for loading state (grid layout)
function HistoryCardSkeleton() {
  return (
    <div
      className="bg-card h-[280px] animate-pulse space-y-3 rounded-lg border p-4"
      role="status"
      aria-label="読み込み中"
    >
      <div className="flex items-center gap-2">
        <div className="bg-muted h-5 w-20 rounded" />
        <div className="bg-muted h-5 w-16 rounded" />
      </div>
      <div className="bg-muted h-6 w-full rounded" />
      <div className="space-y-2">
        <div className="bg-muted h-4 w-full rounded" />
        <div className="bg-muted h-4 w-5/6 rounded" />
        <div className="bg-muted h-4 w-4/6 rounded" />
      </div>
      <div className="flex gap-1 pt-2">
        <div className="bg-muted h-5 w-12 rounded" />
        <div className="bg-muted h-5 w-14 rounded" />
      </div>
      <div className="mt-auto flex items-center justify-between pt-2">
        <div className="bg-muted h-8 w-8 rounded" />
        <div className="bg-muted h-8 w-20 rounded" />
      </div>
    </div>
  );
}

// Skeleton grid for loading state
function HistorySkeletonGrid() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
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

export function HistoryContent() {
  const router = useRouter();
  const [views, setViews] = useState<HistoryViewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);
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
  // 履歴は最大 100 件。お気に入り状態は一覧分をまとめて取得し、失敗したら
  // カード側の個別取得に戻す
  const {
    statuses: favoriteStatuses,
    isLoading: isFavoriteStatusLoading,
    isError: isFavoriteStatusError,
  } = useFavoriteStatuses(views.map((view) => view.article.id));

  const fetchHistory = useCallback(
    async (signal?: AbortSignal) => {
      try {
        // エラーは成功したときに消す。再試行中も失敗の表示と再試行ボタン（再試行中…）を残すため
        setLoading(true);
        const params = new URLSearchParams();

        // モバイルの場合は軽量モードを使用
        if (isMobile) {
          params.set('lightweight', 'true');
        }
        // sourceリレーションを含める（表示に必要）
        params.set('includeRelations', 'true');
        // 90日以内の履歴を最大100件取得
        params.set('limit', '100');

        const response = await fetch(
          `/api/article-views?${params.toString()}`,
          {
            signal,
          }
        );

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
        setHasFetched(true);
        setError(null);
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
    const abortController = new AbortController();
    // マウント時にAbortControllerを渡してフェッチを開始する（setState を含む非同期処理のトリガー）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistory(abortController.signal);
    return () => abortController.abort();
  }, [fetchHistory]);

  // クリア完了後のフォーカス管理（宣言的アプローチ）
  useEffect(() => {
    if (justCleared && views.length === 0) {
      emptyStateRef.current?.focus();
      // フォーカス完了後に justCleared フラグをリセットする（副作用完了の通知）
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // 表示できる履歴が無いまま取得に失敗した。以前はスケルトンのまま止まり、失敗の表示に届かなかった
  const failedWithoutData = !!error && !hasFetched;

  // Loading state (hasFetchedを追加してクライアントナビゲーション時も確実にスケルトン表示)
  if (!failedWithoutData && (loading || !hasFetched)) {
    return (
      <div className="px-4 py-3 lg:px-6">
        {/* 見出しは読み込み中も出す（h1 を常に1つ置く。Issue #700） */}
        <PageHeader
          icon={History}
          title="閲覧履歴"
          actions={<div className="bg-muted h-9 w-28 animate-pulse rounded" />}
        />
        <HistorySkeletonGrid />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 lg:px-6">
      <PageHeader
        icon={History}
        title="閲覧履歴"
        count={
          failedWithoutData
            ? undefined
            : { value: views.length, label: `${views.length}件` }
        }
        actions={
          views.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={clearHistory}
              disabled={clearing}
              className="min-h-[44px] gap-2"
              aria-label="閲覧履歴をすべてクリア"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {clearing ? 'クリア中...' : '履歴をクリア'}
            </Button>
          )
        }
      />

      {/* 生の error.message は出さない（issue #701） */}
      {failedWithoutData && (
        <CardV2 className="mx-auto max-w-md">
          <ErrorState
            size="block"
            title="閲覧履歴を読み込めませんでした"
            description="時間をおいて再試行してください。"
            onRetry={() => void fetchHistory()}
            retrying={loading}
          />
        </CardV2>
      )}

      {/* 表示中の履歴がある状態での失敗（履歴のクリアなど） */}
      {error && !failedWithoutData && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {hasFetched && views.length === 0 ? (
        <CardV2
          ref={emptyStateRef}
          tabIndex={-1}
          className="focus:ring-primary mx-auto max-w-md focus:ring-2 focus:outline-none"
        >
          <div className="flex flex-col items-center justify-center px-4 py-12">
            <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <Eye
                className="text-muted-foreground h-8 w-8"
                aria-hidden="true"
              />
            </div>
            <p className="text-foreground mb-2 text-lg font-medium">
              閲覧履歴がありません
            </p>
            <p className="text-muted-foreground mb-6 text-center text-sm">
              記事を読むと自動的に履歴に記録されます
            </p>
            <Button asChild className="min-h-[44px] min-w-[44px]">
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
                className="text-foreground text-h2 mb-4 flex items-center gap-2"
              >
                <span>{group.label}</span>
                <span className="text-muted-foreground text-sm font-normal">
                  ({group.items.length}件)
                </span>
              </h2>
              {/* Grid layout matching home page */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {group.items.map((item) => (
                  <HistoryArticleCard
                    key={item.article.viewId}
                    article={item.article}
                    viewedAt={item.viewedAt}
                    onTagClick={handleTagClick}
                    isFavorited={favoriteStatuses[item.article.id] ?? false}
                    isFavoriteLoading={isFavoriteStatusLoading}
                    fetchInitialStatus={isFavoriteStatusError}
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
