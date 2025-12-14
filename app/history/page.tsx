'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, AlertCircle } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { HistoryArticleCard } from '@/app/components/article/history-card';
import { useGroupedHistory } from '@/app/hooks/use-grouped-history';
import { getDateGroupHeadingId } from '@/lib/utils/date-grouping';
import { cn } from '@/lib/utils';

interface ArticleView {
  id: number;
  title: string;
  translatedTitle?: string | null;
  summary: string | null;
  url: string;
  publishedAt: string;
  source: {
    id: number;
    name: string;
  };
  companyName?: string | null;
  tags?: Array<{
    id: number;
    name: string;
  }>;
  content?: string | null;
  contentLength?: number;
  viewId: number;
  viewedAt: string;
}

interface HistoryViewItem {
  viewedAt: string;
  article: ArticleView;
}

// Skeleton component for loading state
function HistoryCardSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg border bg-card p-4 space-y-3"
      role="status"
      aria-label="読み込み中"
    >
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 bg-muted rounded" />
        <div className="h-5 w-16 bg-muted rounded" />
      </div>
      <div className="h-6 w-3/4 bg-muted rounded" />
      <div className="space-y-2">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-5/6 bg-muted rounded" />
      </div>
      <div className="flex gap-1 pt-2">
        <div className="h-5 w-12 bg-muted rounded" />
        <div className="h-5 w-14 bg-muted rounded" />
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const { data: _session, status } = useSession();
  const router = useRouter();
  const [views, setViews] = useState<ArticleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const emptyStateRef = useRef<HTMLDivElement>(null);

  // Convert flat views to grouped format for the hook
  const historyItems: HistoryViewItem[] = views.map((view) => ({
    viewedAt: view.viewedAt,
    article: view,
  }));

  const groupedHistory = useGroupedHistory(historyItems);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/history');
      return;
    }

    if (status === 'authenticated') {
      fetchHistory();
    }
  }, [status, router]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      // モバイルの場合は軽量モードを使用
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const params = new URLSearchParams();

      if (isMobile) {
        params.set('lightweight', 'true');
      }
      // sourceリレーションを含める（表示に必要）
      params.set('includeRelations', 'true');

      const response = await fetch(`/api/article-views?${params.toString()}`);

      if (!response.ok) {
        throw new Error('閲覧履歴の取得に失敗しました');
      }

      const data = await response.json();
      setViews(data.views);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    try {
      const response = await fetch('/api/article-views', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('履歴のクリアに失敗しました');
      }

      setViews([]);
      // Focus on empty state message after clearing
      setTimeout(() => {
        emptyStateRef.current?.focus();
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
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
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="h-9 w-40 bg-muted rounded animate-pulse mb-2" />
            <div className="h-5 w-64 bg-muted rounded animate-pulse" />
          </div>
          <div
            className="space-y-4"
            role="status"
            aria-live="polite"
            aria-label="閲覧履歴を読み込み中"
          >
            <HistoryCardSkeleton />
            <HistoryCardSkeleton />
            <HistoryCardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold mb-2 text-foreground">
              閲覧履歴
            </h1>
            <p className="text-muted-foreground">
              最近読んだ記事の履歴を確認できます
            </p>
          </div>
          {views.length > 0 && (
            <ButtonV2
              variant="outline"
              size="sm"
              onClick={clearHistory}
              className="text-destructive hover:text-destructive min-w-[44px] min-h-[44px]"
              aria-label="閲覧履歴をすべてクリア"
            >
              履歴をクリア
            </ButtonV2>
          )}
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
            className="focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <Eye
                className="h-12 w-12 text-muted-foreground mb-4"
                aria-hidden="true"
              />
              <p className="text-lg font-medium mb-2 text-foreground">
                閲覧履歴がありません
              </p>
              <p className="text-muted-foreground mb-6 text-center">
                記事を読むと自動的に履歴に記録されます
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 min-w-[44px] min-h-[44px] transition-colors"
              >
                記事を探す
              </Link>
            </div>
          </CardV2>
        ) : (
          /* Grouped history list */
          <div className="space-y-8">
            {groupedHistory.map((group) => (
              <section
                key={group.key}
                aria-labelledby={getDateGroupHeadingId(group.key)}
              >
                <h2
                  id={getDateGroupHeadingId(group.key)}
                  className={cn(
                    'font-heading text-xl font-semibold mb-4 text-foreground',
                    'flex items-center gap-2'
                  )}
                >
                  {group.label}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({group.items.length}件)
                  </span>
                </h2>
                <ul role="list" className="space-y-4">
                  {group.items.map((item) => (
                    <li key={item.article.viewId}>
                      <HistoryArticleCard
                        article={item.article}
                        viewedAt={item.viewedAt}
                        onTagClick={handleTagClick}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
