'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { QualitySummaryCards } from './quality-summary-cards';
import { ArticlesFilters } from './articles-filters';
import { ArticlesTable } from './articles-table';
import { ArticleDetailDialog } from './article-detail-dialog';
import type { AdminArticlesResponse, QualityStatus } from '../_types';

async function fetchAdminArticles(params: {
  page: number;
  sourceId: string;
  category: string;
  qualityStatus: string;
  query: string;
}): Promise<AdminArticlesResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page));
  searchParams.set('perPage', '20');
  if (params.sourceId) searchParams.set('sourceId', params.sourceId);
  if (params.category) searchParams.set('category', params.category);
  if (params.qualityStatus)
    searchParams.set('qualityStatus', params.qualityStatus);
  if (params.query) searchParams.set('query', params.query);

  const res = await fetch(`/api/admin/articles?${searchParams.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch articles');
  }
  return res.json();
}

export function ArticlesPageContent() {
  const [query, setQuery] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [category, setCategory] = useState('');
  const [qualityStatus, setQualityStatus] = useState<QualityStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(
    null
  );

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'admin',
      'articles',
      { page, sourceId, category, qualityStatus, query },
    ],
    queryFn: () =>
      fetchAdminArticles({
        page,
        sourceId,
        category,
        qualityStatus,
        query,
      }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    setPage(1);
  };

  const handleSourceIdChange = (newSourceId: string) => {
    setSourceId(newSourceId);
    setPage(1);
  };

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setPage(1);
  };

  const handleQualityStatusChange = (newStatus: QualityStatus | '') => {
    setQualityStatus(newStatus);
    setPage(1);
  };

  const handleQualityCardClick = (status: QualityStatus | '') => {
    const next = qualityStatus === status ? '' : status;
    setQualityStatus(next);
    setPage(1);
  };

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
        記事の読み込みに失敗しました。再試行してください。
      </div>
    );
  }

  // ローディング中やデータ未到着時のフォールバック用サマリー
  const summary = data?.qualitySummary ?? {
    totalArticles: 0,
    missingSummary: 0,
    missingCategory: 0,
    missingContent: 0,
    lowQuality: 0,
    hasError: 0,
    skipped: 0,
  };

  return (
    <div className="space-y-4">
      <QualitySummaryCards
        summary={summary}
        activeStatus={qualityStatus}
        onStatusClick={handleQualityCardClick}
      />

      <ArticlesFilters
        query={query}
        onQueryChange={handleQueryChange}
        sourceId={sourceId}
        onSourceIdChange={handleSourceIdChange}
        category={category}
        onCategoryChange={handleCategoryChange}
        qualityStatus={qualityStatus}
        onQualityStatusChange={handleQualityStatusChange}
        sources={data?.sources ?? []}
      />

      <ArticlesTable
        articles={data?.articles ?? []}
        isLoading={isLoading}
        totalCount={data?.totalCount ?? 0}
        page={page}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onArticleClick={setSelectedArticleId}
      />

      <ArticleDetailDialog
        articleId={selectedArticleId}
        onClose={() => setSelectedArticleId(null)}
      />
    </div>
  );
}
