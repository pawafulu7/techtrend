'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronUp } from 'lucide-react';

export function ScrollToTopButton() {
  // テスト用：常に表示する（trueに変更）
  const [isVisible, setIsVisible] = useState(true);

  // デバッグ：コンポーネントがマウントされたことを確認
  useEffect(() => {
    console.log('ScrollToTopButton: Component mounted!');
    console.log('ScrollToTopButton: isVisible =', isVisible);
  }, [isVisible]);

  // スクロール位置を監視（一旦コメントアウト）
  /*
  useEffect(() => {
    const toggleVisibility = () => {
      // main要素を取得
      const mainElement = document.querySelector('main');
      if (!mainElement) return;
      
      const scrollY = mainElement.scrollTop;
      
      // 300px以上スクロールしたらボタンを表示
      if (scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // main要素にスクロールイベントリスナーを追加
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.addEventListener('scroll', toggleVisibility);
      
      // 初期状態のチェック
      toggleVisibility();
      
      // クリーンアップ
      return () => {
        mainElement.removeEventListener('scroll', toggleVisibility);
      };
    }
  }, []);
  */

  // トップへスクロール（main要素をスクロール）
  const scrollToTop = useCallback(() => {
    console.log('ScrollToTopButton: Clicked!');
    const mainElement = document.querySelector('main');
    if (mainElement) {
      console.log('ScrollToTopButton: Scrolling main element to top');
      mainElement.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      console.log('ScrollToTopButton: main element not found');
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

  // 常に表示（テスト用）
  console.log('ScrollToTopButton: Rendering button');
  
  // ボタンが非表示の時はレンダリングしない（テスト中はコメントアウト）
  // if (!isVisible) {
  //   return null;
  // }
  
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