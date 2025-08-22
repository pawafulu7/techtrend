'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { RecommendationSection } from './recommendation-section';

const STORAGE_KEY = 'hide-recommendations';

export function RecommendationSectionInline() {
  const { data: session, status } = useSession();
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    // localStorageから表示設定を読み込む
    const hidden = localStorage.getItem(STORAGE_KEY) === 'true';
    setIsHidden(hidden);
  }, []);

  // localStorageの変更を監視
  useEffect(() => {
    const handleStorageChange = () => {
      const hidden = localStorage.getItem(STORAGE_KEY) === 'true';
      setIsHidden(hidden);
    };

    // カスタムイベントを使用してコンポーネント間で同期
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('recommendation-toggle', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('recommendation-toggle', handleStorageChange);
    };
  }, []);

  // 未ログインまたは非表示設定の場合は何も表示しない
  if (status !== 'authenticated' || !session?.user || isHidden) {
    return null;
  }

  return <RecommendationSection forceHidden={isHidden} />;
}