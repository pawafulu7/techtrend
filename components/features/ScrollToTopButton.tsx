'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronUp } from 'lucide-react';

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  // デバッグ用：コンポーネントマウント確認
  useEffect(() => {
    console.log('ScrollToTopButton mounted');
  }, []);

  // スクロール位置を監視
  useEffect(() => {
    console.log('Setting up scroll listener...');
    
    const toggleVisibility = () => {
      // main要素を取得
      const mainElement = document.querySelector('main');
      console.log('Main element found:', !!mainElement);
      
      if (!mainElement) {
        console.log('Main element not found, returning');
        return;
      }
      
      const scrollY = mainElement.scrollTop;
      console.log('Scroll position:', scrollY);
      
      // 50px以上スクロールしたらボタンを表示（テスト用に閾値を下げる）
      if (scrollY > 50) {
        console.log('Setting button visible');
        setIsVisible(true);
      } else {
        console.log('Setting button hidden');
        setIsVisible(false);
      }
    };

    // main要素にスクロールイベントリスナーを追加
    const mainElement = document.querySelector('main');
    if (mainElement) {
      console.log('Adding scroll event listener to main element');
      mainElement.addEventListener('scroll', toggleVisibility);
      
      // 初期状態のチェック
      toggleVisibility();
      
      // クリーンアップ
      return () => {
        console.log('Removing scroll event listener');
        mainElement.removeEventListener('scroll', toggleVisibility);
      };
    } else {
      console.log('Main element not found during setup');
    }
  }, []);

  // トップへスクロール（main要素をスクロール）
  const scrollToTop = useCallback(() => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollTo({
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

  // デバッグ：レンダリング状態を確認
  useEffect(() => {
    console.log('Button visibility changed:', isVisible);
  }, [isVisible]);

  // ボタンが非表示の時はレンダリングしない
  if (!isVisible) {
    console.log('Button not rendering (isVisible = false)');
    return null;
  }
  
  console.log('Button rendering (isVisible = true)');
  
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