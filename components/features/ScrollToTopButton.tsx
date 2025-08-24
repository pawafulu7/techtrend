'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronUp } from 'lucide-react';

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  // スクロール位置を監視
  useEffect(() => {
    const toggleVisibility = (event: Event) => {
      const target = event.target as HTMLElement;
      const scrollY = target.scrollTop;
      
      // 300px以上スクロールしたらボタンを表示
      if (scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // スクロール可能な要素を定期的にチェック
    const setupScrollListener = () => {
      // IDで特定の要素を取得（より確実）
      const scrollableElement = document.getElementById('main-scroll-container') || 
                               document.querySelector('.overflow-y-auto');
      if (scrollableElement) {
        // 既存のリスナーを削除
        scrollableElement.removeEventListener('scroll', toggleVisibility);
        // 新しいリスナーを追加
        scrollableElement.addEventListener('scroll', toggleVisibility);
        
        // 初期状態のチェック
        const initialScrollY = scrollableElement.scrollTop;
        setIsVisible(initialScrollY > 300);
        
        return true;
      }
      return false;
    };

    // 初回セットアップ
    if (!setupScrollListener()) {
      // 要素が見つからない場合は少し待って再試行
      const intervalId = setInterval(() => {
        if (setupScrollListener()) {
          clearInterval(intervalId);
        }
      }, 500);
      
      // 10秒後にはタイムアウト
      const timeoutId = setTimeout(() => {
        clearInterval(intervalId);
      }, 10000);
      
      return () => {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        const scrollableElement = document.getElementById('main-scroll-container') || 
                                 document.querySelector('.overflow-y-auto');
        if (scrollableElement) {
          scrollableElement.removeEventListener('scroll', toggleVisibility);
        }
      };
    }
    
    // クリーンアップ
    return () => {
      const scrollableElement = document.getElementById('main-scroll-container') || 
                               document.querySelector('.overflow-y-auto');
      if (scrollableElement) {
        scrollableElement.removeEventListener('scroll', toggleVisibility);
      }
    };
  }, []);

  // トップへスクロール
  const scrollToTop = useCallback(() => {
    // IDで特定の要素を取得してスクロール
    const scrollableElement = document.getElementById('main-scroll-container') || 
                             document.querySelector('.overflow-y-auto');
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

  // スクロール復元イベントをリッスン
  useEffect(() => {
    const handleScrollRestored = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { scrollY, restored, cancelled } = customEvent.detail;
      console.log('[ScrollToTopButton] イベント受信 - scrollY:', scrollY, 'restored:', restored, 'cancelled:', cancelled);
      
      if (restored && !cancelled) {
        // 少し遅延を入れてからチェック（スムーススクロール完了待ち）
        setTimeout(() => {
          const scrollableElement = document.getElementById('main-scroll-container') || 
                                   document.querySelector('.overflow-y-auto');
          if (scrollableElement) {
            const currentScrollY = scrollableElement.scrollTop;
            console.log('[ScrollToTopButton] スクロール位置再チェック - currentScrollY:', currentScrollY);
            setIsVisible(currentScrollY > 300);
          } else {
            console.log('[ScrollToTopButton] スクロール要素が見つかりません');
          }
        }, 1000); // 1秒待機
      }
    };
    
    console.log('[ScrollToTopButton] イベントリスナー登録');
    window.addEventListener('scrollRestored', handleScrollRestored);
    return () => {
      window.removeEventListener('scrollRestored', handleScrollRestored);
    };
  }, []);

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