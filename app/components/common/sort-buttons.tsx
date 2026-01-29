'use client';

import { Button } from '@/components/ui/button';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

interface SortButtonsProps {
  initialSortBy?: string;
}

export function SortButtons({ initialSortBy }: SortButtonsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const urlSortBy = searchParams.get('sortBy');

  // サーバーサイドから渡された値を優先的に使用
  const [sortBy, setSortBy] = useState(() => {
    if (urlSortBy) return urlSortBy;
    if (initialSortBy) return initialSortBy;
    return 'publishedAt'; // デフォルト値
  });

  // URLパラメータが変更されたら状態を更新
  useEffect(() => {
    if (urlSortBy !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync from URL params
      setSortBy(urlSortBy);
    }
  }, [urlSortBy]);

  const handleSortChange = async (newSortBy: string) => {
    setSortBy(newSortBy); // 状態を即座に更新

    const params = new URLSearchParams(searchParams.toString());
    params.set('sortBy', newSortBy);
    params.delete('page'); // Reset to first page

    // 現在のパスを維持してURLパラメータを更新
    router.push(`${pathname}?${params.toString()}`);

    // Update filter preferences cookie
    try {
      await fetch('/api/filter-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortBy: newSortBy }),
      });
    } catch {}
  };

  return (
    <div className="flex gap-1">
      <Button
        variant={
          sortBy !== 'bookmarks' &&
          sortBy !== 'qualityScore' &&
          sortBy !== 'createdAt'
            ? 'default'
            : 'outline'
        }
        size="sm"
        className="h-6 px-2 text-xs sm:h-7"
        onClick={() => handleSortChange('publishedAt')}
      >
        公開順
      </Button>
      <Button
        variant={sortBy === 'createdAt' ? 'default' : 'outline'}
        size="sm"
        className="h-6 px-2 text-xs sm:h-7"
        onClick={() => handleSortChange('createdAt')}
      >
        取込順
      </Button>
      <Button
        variant={sortBy === 'qualityScore' ? 'default' : 'outline'}
        size="sm"
        className="h-6 px-2 text-xs sm:h-7"
        onClick={() => handleSortChange('qualityScore')}
      >
        品質
      </Button>
      <Button
        variant={sortBy === 'bookmarks' ? 'default' : 'outline'}
        size="sm"
        className="h-6 px-2 text-xs sm:h-7"
        onClick={() => handleSortChange('bookmarks')}
      >
        人気
      </Button>
    </div>
  );
}
