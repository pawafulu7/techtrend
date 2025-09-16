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

        // includeEmptyContentを追加（空コンテンツも含めてカウント）
        const countQueryString = queryString
          ? `${queryString}&includeEmptyContent=true`
          : `includeEmptyContent=true`;

        const response = await fetch(`/api/articles?${countQueryString}`, {
          // ブラウザのキャッシュも無効化
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        if (response.ok) {
          const result = await response.json();

          // より堅牢なtotal抽出処理
          let total = 0;
          if (result?.data?.total !== undefined) {
            total = result.data.total;
          } else if (result?.total !== undefined) {
            total = result.total;
          } else if (Array.isArray(result?.data?.items)) {
            // itemsの長さではなく、サーバーから返されたtotalを使用
            // ただし、totalが存在しない場合のフォールバック
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

    // stateをリセットして新規取得
    setLoading(true);
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