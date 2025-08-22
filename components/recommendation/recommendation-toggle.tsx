'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

const STORAGE_KEY = 'hide-recommendations';

interface RecommendationToggleProps {
  onToggle?: (isHidden: boolean) => void;
}

export function RecommendationToggle({ onToggle }: RecommendationToggleProps) {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
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

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
      aria-label={isHidden ? 'おすすめを表示' : 'おすすめを非表示'}
      title={isHidden ? 'おすすめを表示' : 'おすすめを非表示'}
    >
      {isHidden ? (
        <>
          <Eye className="h-4 w-4" />
          <span className="hidden sm:inline">おすすめ</span>
        </>
      ) : (
        <>
          <EyeOff className="h-4 w-4" />
          <span className="hidden sm:inline">おすすめ</span>
        </>
      )}
    </Button>
  );
}