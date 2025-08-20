'use client';

import { useEffect, useState } from 'react';

/**
 * メディアクエリの状態を監視するカスタムフック
 * @param query - メディアクエリ文字列
 * @returns マッチしているかどうかのboolean値
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    
    // 初期値を設定
    setMatches(media.matches);

    // リスナーを定義
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // リスナーを追加
    if (media.addEventListener) {
      media.addEventListener('change', listener);
    } else {
      // 古いブラウザのサポート
      media.addListener(listener);
    }

    // クリーンアップ
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', listener);
      } else {
        // 古いブラウザのサポート
        media.removeListener(listener);
      }
    };
  }, [query]);

  return matches;
}