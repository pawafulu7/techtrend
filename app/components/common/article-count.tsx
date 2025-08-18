'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export function ArticleCount() {
  const searchParams = useSearchParams();
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCount() {
      try {
        const queryString = searchParams.toString();
        const response = await fetch(`/api/articles${queryString ? `?${queryString}` : ''}`);
        
        if (response.ok) {
          const result = await response.json();
          const data = result.data || result;
          setCount(data.total || 0);
        }
      } catch {
        // エラーは無視
      } finally {
        setLoading(false);
      }
    }

    fetchCount();
  }, [searchParams]);

  if (loading || count === null) {
    return (
      <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
    );
  }

  return (
    <div className="text-sm text-gray-600 dark:text-gray-400">
      {count.toLocaleString()}件の記事
    </div>
  );
}