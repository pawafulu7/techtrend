'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronUp } from 'lucide-react';

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);
  const [isRestoringScroll, setIsRestoringScroll] = useState(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // スクロール復元状態を監視
  useEffect(() => {
    // sessionStorageにスクロール復元データがあるかチェック
    const checkRestoration = () => {
      const restorationData = sessionStorage.getItem('articleListScroll');
      const wasRestoring = isRestoringScroll;
      const nowRestoring = !!restorationData;
      
      setIsRestoringScroll(nowRestoring);
      
      // 復元が完了した場合、スクロール位置を再チェック
      if (wasRestoring && !nowRestoring) {
        const scrollableElement = document.querySelector('.overflow-y-auto');
        if (scrollableElement) {
          const scrollY = scrollableElement.scrollTop;
          setIsVisible(scrollY > 300);
        }
        // チェックを停止
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
      }
    };
    
    checkRestoration();
    
    // 定期的にチェック（復元処理が終わるまで）
    checkIntervalRef.current = setInterval(checkRestoration, 500);
    
    // 5秒後には必ず有効化（フェイルセーフ）
    const timeoutId = setTimeout(() => {
      setIsRestoringScroll(false);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      // タイムアウト後もスクロール位置をチェック
      const scrollableElement = document.querySelector('.overflow-y-auto');
      if (scrollableElement) {
        const scrollY = scrollableElement.scrollTop;
        setIsVisible(scrollY > 300);
      }
    }, 5000);
    
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      clearTimeout(timeoutId);
    };
  }, [isRestoringScroll]);

  // スクロール位置を監視
  useEffect(() => {
    const toggleVisibility = (event: Event) => {
      // スクロール復元中は表示しない
      if (isRestoringScroll) {
        setIsVisible(false);
        return;
      }
      
      const target = event.target as HTMLElement;
      const scrollY = target.scrollTop;
      
      // 300px以上スクロールしたらボタンを表示
      if (scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // overflow-y-autoクラスを持つ要素を探してリスナーを追加
    const scrollableElement = document.querySelector('.overflow-y-auto');
    if (scrollableElement) {
      scrollableElement.addEventListener('scroll', toggleVisibility);
      
      // 初期状態のチェック（復元中でなければ）
      if (!isRestoringScroll) {
        const initialScrollY = scrollableElement.scrollTop;
        setIsVisible(initialScrollY > 300);
      }
      
      // クリーンアップ
      return () => {
        scrollableElement.removeEventListener('scroll', toggleVisibility);
      };
    }
  }, [isRestoringScroll]);

  // トップへスクロール
  const scrollToTop = useCallback(() => {
    // overflow-y-autoクラスを持つ要素をスクロール
    const scrollableElement = document.querySelector('.overflow-y-auto');
    if (scrollableElement) {
      scrollableElement.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, []);

  // キーボードショートカット（Home、Ctrl+Home）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Home' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        scrollToTop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scrollToTop]);

  // ボタンが非表示の時はレンダリングしない
  if (!isVisible) {
    return null;
  }
  
  return (
    <button
      onClick={scrollToTop}
      className={`
        fixed bottom-24 right-6 z-50
        bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600
        text-white rounded-full p-3
        shadow-lg hover:shadow-xl
        transition-all duration-300 ease-in-out
        transform hover:scale-110
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        animate-fade-in
      `}
      aria-label="ページトップへ戻る"
      title="ページトップへ戻る (Ctrl+Home)"
    >
      <ChevronUp className="w-6 h-6" />
    </button>
  );
}