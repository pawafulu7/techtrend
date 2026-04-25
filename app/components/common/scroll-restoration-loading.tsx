'use client';

import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { Progress } from '@/components/ui/progress';

interface ScrollRestorationLoadingProps {
  currentPage: number;
  targetPages: number;
  onCancel: () => void;
  itemsPerPage?: number; // 既定 20
}

export function ScrollRestorationLoading({
  currentPage,
  targetPages,
  onCancel,
  itemsPerPage = 20,
}: ScrollRestorationLoadingProps) {
  const progress = targetPages > 0 ? (currentPage / targetPages) * 100 : 0;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--tt-color-surface)]/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-lg border border-[var(--tt-color-border)] bg-[var(--tt-color-surface)] p-6 shadow-2xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--tt-color-text)]">
              スクロール位置を復元中...
            </h3>
            <Loader2 className="h-5 w-5 animate-spin text-[var(--tt-color-info)]" />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm text-[var(--tt-color-text-muted)]">
              <span>
                記事を読み込んでいます（{currentPage}/{targetPages}ページ）
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <p className="text-sm text-[var(--tt-color-text-muted)]">
            {targetPages > 1
              ? `約${targetPages * itemsPerPage}件の記事を読み込んで、前回の位置まで復元しています...`
              : '前回の位置まで記事を読み込んでいます...'}
          </p>

          <Button onClick={onCancel} variant="outline" className="w-full">
            <X className="mr-2 h-4 w-4" />
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  );
}
