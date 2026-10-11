'use client';

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { ArticleListSkeleton } from '@/app/components/article/article-list-skeleton';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { useInfiniteArticles } from '@/app/hooks/use-infinite-articles';
import { useScrollRestoration } from '@/app/hooks/use-scroll-restoration';
import { buildScrollStorageKey } from '@/lib/utils/scroll';
import { PAGINATION, SCROLL } from '@/lib/constants/index';
import { ScrollRestorationLoading } from '@/app/components/common/scroll-restoration-loading';
import type { ViewMode } from '@/types/components';
import { FileText } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { EmptyState } from '@/components/ui-v2/empty-state';
import { ErrorState } from '@/components/ui-v2/error-state';

interface PapersClientInfiniteProps {
  viewMode: ViewMode;
  sourceId: string; // arXiv source ID
  initialSortBy?: string;
}

export function PapersClientInfinite({
  viewMode,
  sourceId,
  initialSortBy,
}: PapersClientInfiniteProps) {
  const searchParams = useSearchParams();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentScrollPositionRef = useRef<number>(0);
  const excludeUnprocessed = true;

  // 記事詳細から戻ってきたかどうかをチェック
  const isReturningFromArticle = searchParams.has('returning');

  // スクロール位置を常に追跡
  useEffect(() => {
    const handleScroll = () => {
      const windowScrollY = window.scrollY || window.pageYOffset || 0;
      const container = scrollContainerRef.current;
      const containerScrollY = container ? container.scrollTop : 0;
      const mainContainer = document.getElementById('papers-scroll-container');
      const mainScrollY = mainContainer ? mainContainer.scrollTop : 0;

      const scrollY = Math.max(windowScrollY, containerScrollY, mainScrollY);
      currentScrollPositionRef.current = scrollY;
    };

    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
    }

    const mainContainer = document.getElementById('papers-scroll-container');
    if (mainContainer) {
      mainContainer.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
      if (mainContainer) {
        mainContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // URLパラメータからフィルターを構築（arXivソースに固定）
  const filters = useMemo(() => {
    const params: Record<string, string> = {};

    // URLパラメータからsearch, tag, sortBy等をコピー
    searchParams.forEach((value, key) => {
      if (
        key !== 'page' &&
        key !== 'limit' &&
        key !== 'returning' &&
        key !== 'sources' &&
        key !== 'sourceId'
      ) {
        params[key] = value;
      }
    });

    // ソースIDを固定（arXiv論文のみ）
    params.sourceId = sourceId;

    // 論文は技術者向けでない記事の判定（issue #722）で外さない。医療・科学の AI 論文が
    // 外れても、この画面には切り替えが無く見る手段がなくなるため
    params.includeOffTopic = 'true';

    // URLパラメータにsortByがない場合、initialSortByを使用
    if (!params.sortBy && initialSortBy) {
      params.sortBy = initialSortBy;
    }

    // 注: returningはスクロール位置復元のトリガーとしてのみ使い、
    // フィルターには含めない（queryKeyが変わり1ページ目から取り直しになるため）

    // 処理中記事を除外するフラグを追加
    if (excludeUnprocessed) {
      params.excludeUnprocessed = 'true';
    }

    return params;
  }, [searchParams, sourceId, initialSortBy, excludeUnprocessed]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError,
    isPending,
    isFetching,
    errorUpdateCount,
    isFetchNextPageError,
    refetch,
  } = useInfiniteArticles({
    ...filters,
    includeUserData: true,
  });

  // ページごとの記事を1つの配列にフラット化（重複除去付き）
  const allArticles = useMemo(() => {
    if (!data) return [];
    const articles = data.pages.flatMap((page) => page.data.items);

    // 重複除去
    const uniqueArticles = articles.filter(
      (article, index, self) =>
        index === self.findIndex((a) => a.id === article.id)
    );

    return uniqueArticles;
  }, [data]);

  // スクロール位置復元フック
  const { isRestoring, currentPage, targetPages, cancelRestoration } =
    useScrollRestoration(
      allArticles.length,
      data?.pages.length || 0,
      filters,
      fetchNextPage,
      hasNextPage || false,
      isFetchingNextPage,
      scrollContainerRef,
      isReturningFromArticle
    );

  // 記事クリック時のコールバック
  const handleArticleClick = useCallback(
    (articleId?: string) => {
      const scrollY = currentScrollPositionRef.current;

      if (scrollY > SCROLL.MIN_SCROLL_SAVE_THRESHOLD) {
        const idx = articleId
          ? allArticles.findIndex((a) => a.id === articleId)
          : -1;

        const scrollKey = buildScrollStorageKey();
        const payload = {
          scrollY,
          timestamp: Date.now(),
          articleId: articleId ?? null,
          articleIndex: idx >= 0 ? idx : undefined,
          totalArticlesLoaded: allArticles.length,
        };

        try {
          sessionStorage.setItem(scrollKey, JSON.stringify(payload));
        } catch {
          // Safari Private Browsing等での保存失敗時は無視
        }
      }
    },
    [allArticles]
  );

  // 生の error.message は出さない。一度失敗したら、再試行中も読み込み中に戻さず
  // 失敗の表示（再試行中…）を残す（issue #701）
  const failedWithoutData = !data && (isError || errorUpdateCount > 0);
  // 取得済みの一覧がある状態で取り直しに失敗した: 一覧を残し、古いことと再試行を示す。
  // 続きのページの失敗は一覧の下端に出す
  const staleAfterError = isError && !!data && !isFetchNextPageError;
  if (failedWithoutData) {
    return (
      <div className="flex min-h-[400px] items-center justify-center px-4">
        <CardV2 className="mx-auto max-w-md">
          <ErrorState
            size="block"
            title="論文を読み込めませんでした"
            description="時間をおいて再試行してください。"
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        </CardV2>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      id="papers-scroll-container"
      className="relative flex-1 overflow-y-auto px-4 py-4 lg:px-6"
    >
      {/* スクロール位置復元中のローディング表示 */}
      {isRestoring && (
        <ScrollRestorationLoading
          currentPage={currentPage}
          targetPages={targetPages}
          onCancel={cancelRestoration}
          itemsPerPage={PAGINATION.ITEMS_PER_PAGE}
        />
      )}

      {staleAfterError && (
        <ErrorState
          title="最新の論文を読み込めませんでした"
          description="前回読み込んだ内容を表示しています。"
          onRetry={() => void refetch()}
          retrying={isFetching}
          className="mb-4 rounded-lg border"
        />
      )}

      {/* isPending（data が無い）で判定する。isLoading は取得が一時停止中（オフライン）だと
          false になり、読み込み前に空状態を出してしまうため */}
      {isPending ? (
        <ArticleListSkeleton
          viewMode={viewMode}
          thumbnail={false}
          label="論文を読み込んでいます..."
        />
      ) : allArticles.length > 0 ? (
        <div className="relative">
          <ArticleList
            articles={allArticles}
            viewMode={viewMode}
            onArticleClick={handleArticleClick}
            currentFilters={filters}
            // arXiv の論文はほぼ画像が無いので、高さを揃えるための空の枠を並べない
            thumbnailPlaceholder={false}
          />

          {/* 続きのページの失敗は下端に出し、続きだけを再試行する（issue #701）。
              トリガーを残すと、末尾が見えている間は失敗した取得をくり返すため止める */}
          {isFetchNextPageError ? (
            <ErrorState
              title="続きを読み込めませんでした"
              description="時間をおいて再試行してください。"
              onRetry={() => void fetchNextPage()}
              retrying={isFetchingNextPage}
              className="mt-4"
            />
          ) : (
            <InfiniteScrollTrigger
              onIntersect={fetchNextPage}
              hasNextPage={hasNextPage || false}
              isFetchingNextPage={isFetchingNextPage}
            />
          )}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="条件に合う論文はありません"
          description="検索語やフィルターを変えてください。"
        />
      )}

      {/* ページネーションフォールバック */}
      {!hasNextPage && allArticles.length > 0 && (
        <div className="text-muted-foreground py-8 text-center text-sm">
          すべての論文を表示しました
        </div>
      )}
    </div>
  );
}
