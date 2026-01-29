'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export function InitialLoading() {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  // 初回マウント時のみ表示
  useEffect(() => {
    if (!mounted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: mount tracking
      setMounted(true);
      setShow(true);

      // 初回のみ表示してすぐ非表示
      const timer = setTimeout(() => {
        setShow(false);
      }, 800); // データ取得まで表示

      return () => clearTimeout(timer);
    }
  }, [mounted]);

  if (!show) return null;

  return (
    <div
      className="bg-background fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300"
      style={{ opacity: show ? 1 : 0 }}
    >
      <div className="flex flex-col items-center space-y-4">
        {/* メインローダー */}
        <div className="relative">
          <div className="border-primary/20 border-t-primary h-24 w-24 animate-spin rounded-full border-4" />
          <Loader2 className="text-primary absolute inset-0 m-auto h-10 w-10 animate-pulse" />
        </div>

        {/* テキスト */}
        <div className="space-y-2 text-center">
          <p className="text-foreground text-lg font-semibold">TechTrend</p>
          <div className="flex items-center justify-center space-x-1">
            <span
              className="bg-primary h-2 w-2 animate-bounce rounded-full"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="bg-primary h-2 w-2 animate-bounce rounded-full"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="bg-primary h-2 w-2 animate-bounce rounded-full"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
