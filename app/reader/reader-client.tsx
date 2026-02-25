'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReaderArticleList } from './article-list';
import { ReaderArticleDetail } from './article-detail';
import type {
  ReaderListArticle,
  ArticleListResponse,
  ArticleDetailResponse,
} from './types';

const ARTICLES_PER_PAGE = 20;

async function fetchArticleList(page: number): Promise<ArticleListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(ARTICLES_PER_PAGE),
    sortBy: 'publishedAt',
    sortOrder: 'desc',
  });
  const res = await fetch(`/api/articles/list?${params}`);
  const json = await res.json();
  if (!json.success)
    throw new Error(
      (typeof json.error === 'string' ? json.error : json.error?.message) ||
        '記事の読み込みに失敗しました'
    );
  return json;
}

async function fetchArticleDetail(id: string): Promise<ArticleDetailResponse> {
  const res = await fetch(`/api/articles/${id}`);
  const json = await res.json();
  if (!res.ok || !json.success)
    throw new Error(
      (typeof json.error === 'string' ? json.error : json.error?.message) ||
        '記事の取得に失敗しました'
    );
  return json;
}

export function ReaderClient() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // リスト取得（React Query）
  const {
    data: listData,
    isLoading: isLoadingList,
    error: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: ['reader-articles', page],
    queryFn: () => fetchArticleList(page),
    staleTime: 2 * 60 * 1000,
  });

  const articles = listData?.data.items ?? [];
  const totalPages = listData?.data.totalPages ?? 1;

  // 先頭記事の自動選択
  const effectiveSelectedId = selectedId ?? articles[0]?.id ?? null;

  // 詳細取得（React Query - AbortController自動管理）
  const {
    data: detailData,
    isLoading: isLoadingDetail,
    error: detailError,
  } = useQuery({
    queryKey: ['reader-article-detail', effectiveSelectedId],
    queryFn: () => fetchArticleDetail(effectiveSelectedId!),
    enabled: !!effectiveSelectedId,
    staleTime: 5 * 60 * 1000,
  });

  const selectedArticle = detailData?.data ?? null;

  // 前後ナビゲーション
  const currentIndex = effectiveSelectedId
    ? articles.findIndex((a: ReaderListArticle) => a.id === effectiveSelectedId)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < articles.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) setSelectedId(articles[currentIndex - 1].id);
  }, [hasPrev, articles, currentIndex]);

  const handleNext = useCallback(() => {
    if (hasNext) setSelectedId(articles[currentIndex + 1].id);
  }, [hasNext, articles, currentIndex]);

  const handleSelectArticle = useCallback((articleId: string) => {
    setSelectedId(articleId);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    setSelectedId(null);
  }, []);

  // キーボードナビゲーション
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!effectiveSelectedId || articles.length === 0) return;
      const currentIndex = articles.findIndex(
        (a: ReaderListArticle) => a.id === effectiveSelectedId
      );
      if (e.key === 'ArrowDown' && currentIndex < articles.length - 1) {
        e.preventDefault();
        setSelectedId(articles[currentIndex + 1].id);
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        e.preventDefault();
        setSelectedId(articles[currentIndex - 1].id);
      }
    },
    [effectiveSelectedId, articles]
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* 左パネル: 記事リスト */}
      <div
        className="w-[380px] shrink-0 overflow-y-auto border-r border-slate-200 bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900/80 dark:to-slate-900"
        role="navigation"
        aria-label="記事リスト"
      >
        <ReaderArticleList
          articles={articles}
          selectedId={effectiveSelectedId}
          isLoading={isLoadingList}
          error={listError instanceof Error ? listError.message : null}
          page={page}
          totalPages={totalPages}
          onSelectArticle={handleSelectArticle}
          onPageChange={handlePageChange}
          onKeyDown={handleKeyDown}
          onRetry={refetchList}
        />
      </div>
      {/* 右パネル: 記事詳細 */}
      <div
        className="flex-1 overflow-y-auto"
        role="article"
        aria-label="記事詳細"
        aria-live="polite"
      >
        <ReaderArticleDetail
          key={effectiveSelectedId}
          article={selectedArticle}
          isLoading={isLoadingDetail}
          error={detailError instanceof Error ? detailError.message : null}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      </div>
    </div>
  );
}
