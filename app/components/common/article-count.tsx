'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { usePersonalizationPreferences } from '@/lib/hooks/use-personalization-preferences';

interface ArticleCountProps {
  initialSourceIds?: string[];
  excludeSources?: string; // 除外するソースID（カンマ区切り）
}

export function ArticleCount({
  initialSourceIds,
  excludeSources,
}: ArticleCountProps) {
  const searchParams = useSearchParams();

  // Get personalization state
  const {
    selectedCategories,
    filterEnabled,
    periodMonths,
    isLoading: isLoadingPreferences,
  } = usePersonalizationPreferences();

  const {
    data: count,
    isLoading: isFetchingCount,
    isError,
  } = useQuery<number>({
    queryKey: [
      'article-count',
      {
        searchParams: searchParams.toString(),
        filterEnabled,
        selectedCategories,
        periodMonths,
        initialSourceIds,
        excludeSources,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams(searchParams.toString());

      // Add base filters
      params.set('excludeUnprocessed', 'true');
      params.set('includeEmptyContent', 'true');

      // filterEnabled=falseの場合、パーソナライズパラメータをURLから除去
      if (!filterEnabled) {
        params.delete('categoryIds');
        params.delete('periodMonths');
        params.delete('selectedCategories');
      }

      // URLにsourcesパラメータがない場合、cookie由来のinitialSourceIdsを使用
      const hasSourcesParam = searchParams.has('sources');
      const hasSourceIdParam = searchParams.has('sourceId');
      if (
        !hasSourcesParam &&
        !hasSourceIdParam &&
        initialSourceIds !== undefined
      ) {
        if (initialSourceIds.length === 0) {
          params.set('sources', 'none');
        } else {
          params.set('sources', initialSourceIds.join(','));
        }
      }

      // Add personalization filters if enabled
      if (filterEnabled && selectedCategories.length > 0) {
        params.set('categoryIds', selectedCategories.join(','));
        if (periodMonths && periodMonths > 0) {
          params.set('periodMonths', String(periodMonths));
        }
      }

      // 特定のソースを除外（例: arXiv論文をホームページから除外）
      if (excludeSources) {
        params.set('excludeSources', excludeSources);
      }

      const response = await fetch(`/api/articles?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`[ArticleCount] API error: ${response.status}`);
      }

      const result = await response.json();

      if (result?.data?.total !== undefined) {
        return result.data.total as number;
      } else if (result?.total !== undefined) {
        return result.total as number;
      } else if (Array.isArray(result?.data?.items)) {
        return result.data.items.length as number;
      }
      throw new Error('Unexpected API response format');
    },
    // Wait for preferences to load before fetching
    enabled: !isLoadingPreferences,
  });

  if (isFetchingCount || count === undefined || isLoadingPreferences) {
    return (
      <div className="h-5 w-20 animate-pulse rounded bg-(--tt-color-surface-muted)" />
    );
  }

  if (isError) {
    return null;
  }

  return (
    <div className="text-muted-foreground text-sm whitespace-nowrap">
      {count.toLocaleString()}件の記事
    </div>
  );
}
