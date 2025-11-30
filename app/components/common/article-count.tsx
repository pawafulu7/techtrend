'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePersonalizationPreferences } from '@/lib/hooks/use-personalization-preferences';

export function ArticleCount() {
  const searchParams = useSearchParams();
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Get personalization state
  const {
    selectedCategories,
    filterEnabled,
    periodMonths,
    isLoading: isLoadingPreferences,
  } = usePersonalizationPreferences();

  useEffect(() => {
    // Wait for preferences to load
    if (isLoadingPreferences) return;

    async function fetchCount() {
      try {
        const params = new URLSearchParams(searchParams.toString());

        // Add base filters
        params.set('excludeUnprocessed', 'true');
        params.set('includeEmptyContent', 'true');

        // Add personalization filters if enabled
        if (filterEnabled && selectedCategories.length > 0) {
          params.set('categoryIds', selectedCategories.join(','));
          if (periodMonths && periodMonths > 0) {
            params.set('periodMonths', String(periodMonths));
          }
        }

        const response = await fetch(`/api/articles?${params.toString()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        if (response.ok) {
          const result = await response.json();

          let total = 0;
          if (result?.data?.total !== undefined) {
            total = result.data.total;
          } else if (result?.total !== undefined) {
            total = result.total;
          } else if (Array.isArray(result?.data?.items)) {
            total = result.data.items.length;
          }

          setCount(total);
        } else {
          console.error('[ArticleCount] API error:', response.status);
          setCount(0);
        }
      } catch (error) {
        console.error('[ArticleCount] Fetch error:', error);
        setCount(0);
      } finally {
        setLoading(false);
      }
    }

    setLoading(true);
    fetchCount();
  }, [searchParams, filterEnabled, selectedCategories, periodMonths, isLoadingPreferences]);

  if (loading || count === null || isLoadingPreferences) {
    return (
      <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
    );
  }

  return (
    <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
      {count.toLocaleString()}件の記事
    </div>
  );
}
