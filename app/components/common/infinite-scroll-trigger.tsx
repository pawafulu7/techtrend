'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface InfiniteScrollTriggerProps {
  onIntersect: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  className?: string;
}

export function InfiniteScrollTrigger({
  onIntersect,
  hasNextPage,
  isFetchingNextPage,
  className = ''
}: InfiniteScrollTriggerProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const lastTriggerTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!triggerRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          // デバウンス処理: 500ms以内の連続呼び出しを防ぐ
          const now = Date.now();
          if (now - lastTriggerTimeRef.current > 500) {
            lastTriggerTimeRef.current = now;
            onIntersect();
          }
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px', // 100px → 50pxに削減（より近くなってから読み込み開始）
      }
    );

    observer.observe(triggerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [onIntersect, hasNextPage, isFetchingNextPage]);

  // 次のページがない場合は何も表示しない
  if (!hasNextPage && !isFetchingNextPage) {
    return (
      <div className="text-center py-8 text-gray-500">
        すべての記事を読み込みました
      </div>
    );
  }

  return (
    <div
      ref={triggerRef}
      className={`flex justify-center items-center py-8 ${className}`}
      data-testid="infinite-scroll-trigger"
    >
      {isFetchingNextPage ? (
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm text-gray-600">記事を読み込み中...</span>
        </div>
      ) : (
        hasNextPage && (
          <div className="h-10 w-full" aria-hidden="true" />
        )
      )}
    </div>
  );
}