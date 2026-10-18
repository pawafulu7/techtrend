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
import { VALID_SORT_FIELDS } from '@/app/api/articles/lib/types';
import type { SortOption } from '@/types/components';

interface SortButtonsProps {
  initialSortBy?: string;
}

const SORT_OPTIONS = [
  { key: 'publishedAt', label: '公開順' },
  { key: 'createdAt', label: '取込順' },
  { key: 'qualityScore', label: '品質' },
  { key: 'bookmarks', label: '人気' },
] as const satisfies ReadonlyArray<{ key: SortOption; label: string }>;

type ButtonSort = (typeof SORT_OPTIONS)[number]['key'];

/**
 * 選ばれている表示にするボタン。
 * API が受け付けない値は公開順で返る（app/api/articles/handlers/get.ts）ので、公開順にする。
 * 受け付けるがボタンの無い並び順（userVotes など。URL を手で書いたとき）は、どれも選ばれていない表示にする
 */
function activeSortOf(sortBy: string): ButtonSort | null {
  const button = SORT_OPTIONS.find((option) => option.key === sortBy);
  if (button) return button.key;
  return (VALID_SORT_FIELDS as readonly string[]).includes(sortBy)
    ? null
    : 'publishedAt';
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

  // URLパラメータが変更されたら状態を更新。空の sortBy は、初期値やサーバーと同じく「指定なし」として扱う
  // （サーバーは Cookie の並び順で返す。lib/articles/home-articles-query.ts）
  useEffect(() => {
    if (urlSortBy) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync from URL params
      setSortBy(urlSortBy);
    }
  }, [urlSortBy]);

  const handleSortChange = async (newSortBy: ButtonSort) => {
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

  const activeSort = activeSortOf(sortBy);

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
