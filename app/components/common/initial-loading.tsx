'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { usePathname } from 'next/navigation';

export function InitialLoading() {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const pathname = usePathname();
  
  // 初回マウント時のみ表示
  useEffect(() => {
    if (!mounted) {
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity duration-300" 
         style={{ opacity: show ? 1 : 0 }}>
      <div className="flex flex-col items-center space-y-4">
        {/* メインローダー */}
        <div className="relative">
          <div className="h-24 w-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <Loader2 className="absolute inset-0 m-auto h-10 w-10 text-primary animate-pulse" />
        </div>
        
        {/* テキスト */}
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-foreground">
            TechTrend
          </p>
          <div className="flex items-center justify-center space-x-1">
            <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}