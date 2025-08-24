'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

const STORAGE_KEY = 'hide-recommendations';

interface RecommendationToggleProps {
  onToggle?: (isHidden: boolean) => void;
}

export function RecommendationToggle({ onToggle }: RecommendationToggleProps) {
  const [isHidden, setIsHidden] = useState(false); // デフォルトは表示
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // クライアントサイドでのみ実行
    setIsClient(true);
    
    // localStorageから表示設定を読み込む
    const hidden = localStorage.getItem(STORAGE_KEY) === 'true';
    setIsHidden(hidden);
    onToggle?.(hidden);
  }, [onToggle]);

  const handleToggle = () => {
    const newHidden = !isHidden;
    setIsHidden(newHidden);
    localStorage.setItem(STORAGE_KEY, newHidden ? 'true' : 'false');
    onToggle?.(newHidden);
    
    // カスタムイベントを発火して他のコンポーネントに通知
    window.dispatchEvent(new Event('recommendation-toggle'));
  };

  // クライアントサイドでレンダリングされるまで、デフォルト状態を表示
  if (!isClient) {
    return (
      <Button
        variant="secondary"
        size="sm"
        disabled
        className="flex items-center gap-2"
        aria-label="おすすめ"
      >
        <EyeOff className="h-4 w-4" />
        <span className="hidden sm:inline">おすすめを非表示</span>
      </Button>
    );
  }

  return (
    <Button
      variant={isHidden ? "outline" : "secondary"}
      size="sm"
      onClick={handleToggle}
      className="flex items-center gap-2 transition-all hover:scale-105"
      aria-label={isHidden ? 'おすすめを表示' : 'おすすめを非表示'}
      title={isHidden ? 'クリックしておすすめを表示' : 'クリックしておすすめを非表示'}
    >
      {isHidden ? (
        <>
          <Eye className="h-4 w-4" />
          <span className="hidden sm:inline">おすすめを表示</span>
        </>
      ) : (
        <>
          <EyeOff className="h-4 w-4" />
          <span className="hidden sm:inline">おすすめを非表示</span>
        </>
      )}
    </Button>
  );
}