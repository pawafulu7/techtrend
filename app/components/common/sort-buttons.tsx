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

const SORT_OPTIONS = [
  { key: 'publishedAt', label: '公開順' },
  { key: 'createdAt', label: '取込順' },
  { key: 'qualityScore', label: '品質' },
  { key: 'bookmarks', label: '人気' },
] as const;

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

  // 知らない値（古い URL など）は公開順として扱う
  const activeSort =
    SORT_OPTIONS.find((option) => option.key === sortBy)?.key ?? 'publishedAt';

  return (
    <div
      role="group"
      aria-label="並び順"
      className="flex gap-1"
      data-testid="sort-buttons"
    >
      {SORT_OPTIONS.map(({ key, label }) => {
        // 選んでいる並び順は色だけでなく aria-pressed でも伝える（支援技術・テストの判定に使う）
        const pressed = activeSort === key;
        return (
          <Button
            key={key}
            data-testid={`sort-by-${key}`}
            variant={pressed ? 'default' : 'outline'}
            aria-pressed={pressed}
            size="sm"
            className={cn(TOOLBAR_CONTROL, 'px-3', !pressed && TOOLBAR_OUTLINE)}
            onClick={() => handleSortChange(key)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
