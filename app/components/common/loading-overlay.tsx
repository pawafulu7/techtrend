'use client';

import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  show: boolean;
}

export function LoadingOverlay({ show }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-300">
      <div className="flex flex-col items-center space-y-4">
        {/* メインローダー */}
        <div className="relative">
          <div className="h-24 w-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <Loader2 className="absolute inset-0 m-auto h-10 w-10 text-primary animate-pulse" />
        </div>
        
        {/* テキスト */}
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-foreground">
            記事を読み込んでいます
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