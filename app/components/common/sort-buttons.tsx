'use client';

import { Button } from '@/components/ui-v2/button-v2';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { clearTransientFilterParams } from '@/lib/utils/url/filter-params';
import {
  TOOLBAR_CONTROL,
  TOOLBAR_OUTLINE,
} from '@/app/components/common/toolbar-styles';
import { cn } from '@/lib/utils';

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
    // ページと /reader の選択中記事をリセット
    clearTransientFilterParams(params);

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

  // 選んでいる並び順は色だけでなく aria-pressed でも伝える（支援技術・テストの判定に使う）
  const isPublishedAt =
    sortBy !== 'bookmarks' &&
    sortBy !== 'qualityScore' &&
    sortBy !== 'createdAt';

  return (
    <div
      role="group"
      aria-label="並び順"
      className="flex gap-1"
      data-testid="sort-buttons"
    >
      <Button
        data-testid="sort-by-publishedAt"
        variant={isPublishedAt ? 'default' : 'outline'}
        aria-pressed={isPublishedAt}
        size="sm"
        className={cn(
          TOOLBAR_CONTROL,
          'px-3',
          !isPublishedAt && TOOLBAR_OUTLINE
        )}
        onClick={() => handleSortChange('publishedAt')}
      >
        公開順
      </Button>
      <Button
        data-testid="sort-by-createdAt"
        variant={sortBy === 'createdAt' ? 'default' : 'outline'}
        aria-pressed={sortBy === 'createdAt'}
        size="sm"
        className={cn(
          TOOLBAR_CONTROL,
          'px-3',
          !(sortBy === 'createdAt') && TOOLBAR_OUTLINE
        )}
        onClick={() => handleSortChange('createdAt')}
      >
        取込順
      </Button>
      <Button
        data-testid="sort-by-qualityScore"
        variant={sortBy === 'qualityScore' ? 'default' : 'outline'}
        aria-pressed={sortBy === 'qualityScore'}
        size="sm"
        className={cn(
          TOOLBAR_CONTROL,
          'px-3',
          !(sortBy === 'qualityScore') && TOOLBAR_OUTLINE
        )}
        onClick={() => handleSortChange('qualityScore')}
      >
        品質
      </Button>
      <Button
        data-testid="sort-by-bookmarks"
        variant={sortBy === 'bookmarks' ? 'default' : 'outline'}
        aria-pressed={sortBy === 'bookmarks'}
        size="sm"
        className={cn(
          TOOLBAR_CONTROL,
          'px-3',
          !(sortBy === 'bookmarks') && TOOLBAR_OUTLINE
        )}
        onClick={() => handleSortChange('bookmarks')}
      >
        人気
      </Button>
    </div>
  );
}
