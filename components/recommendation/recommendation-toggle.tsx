'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { useSession } from 'next-auth/react';

const STORAGE_KEY = 'hide-recommendations';

interface RecommendationToggleProps {
  onToggle?: (isHidden: boolean) => void;
}

export function RecommendationToggle({ onToggle }: RecommendationToggleProps) {
  const { data: session } = useSession();
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

  // クライアントサイドでレンダリングされるまで何も表示しない
  if (!isClient) {
    return null;
  }

  // 未認証時は非表示
  if (!session?.user) {
    return null;
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