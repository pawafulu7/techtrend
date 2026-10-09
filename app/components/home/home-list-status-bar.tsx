'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { DataFreshness } from '@/app/components/common/data-freshness';
import { cn } from '@/lib/utils';

interface HomeListStatusBarProps {
  /** 一覧の先頭ページを取得した時刻 */
  fetchedAt: number | undefined;
  isRefreshing: boolean;
  /** 次ページの読み込み中・スクロール位置の復元中は更新を受け付けない（取り直しと読み込みが互いを取り消すため） */
  refreshDisabled?: boolean;
  /** 手動更新（取り直し）に失敗した */
  refreshFailed: boolean;
  onRefresh: () => void;
  totalCount: number;
  shownCount: number;
}

/**
 * ホーム一覧の下端の行。一覧を取得した時刻・手動更新・記事件数を出す（issue #707）。
 */
export function HomeListStatusBar({
  fetchedAt,
  isRefreshing,
  refreshDisabled = false,
  refreshFailed,
  onRefresh,
  totalCount,
  shownCount,
}: HomeListStatusBarProps) {
  return (
    <div className="text-muted-foreground mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pb-2 text-sm">
      <div className="flex items-center gap-1">
        <DataFreshness at={fetchedAt} kind="fetched" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing || refreshDisabled}
          className="text-muted-foreground h-8 px-2 text-xs"
        >
          <RefreshCw
            className={cn(
              'h-3.5 w-3.5',
              isRefreshing && 'animate-spin motion-reduce:animate-none'
            )}
            aria-hidden="true"
          />
          {isRefreshing ? '更新中…' : '最新に更新'}
        </Button>
        <span role="status" className="text-xs text-[var(--tt-color-negative)]">
          {refreshFailed && !isRefreshing
            ? '最新の一覧を取得できませんでした。'
            : ''}
        </span>
      </div>
      {totalCount > 0 && (
        <span>
          {totalCount}件の記事 ({shownCount}件表示中)
        </span>
      )}
    </div>
  );
}
