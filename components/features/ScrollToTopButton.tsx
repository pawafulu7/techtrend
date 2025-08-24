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
    
    // スクロール可能な要素を探す
    const findScrollableElement = () => {
      // まずwindowでスクロールしているか確認
      if (window.scrollY > 0 || document.documentElement.scrollTop > 0) {
        console.log('Window is scrollable');
        return window;
      }
      
      // main要素を確認
      const mainElement = document.querySelector('main');
      if (mainElement && (mainElement.scrollHeight > mainElement.clientHeight)) {
        console.log('Main element is scrollable');
        return mainElement;
      }
      
      // overflow-y: autoまたはscrollの要素を探す
      const scrollableElements = document.querySelectorAll('[style*="overflow"], .overflow-y-auto, .overflow-y-scroll');
      for (const elem of scrollableElements) {
        if ((elem as HTMLElement).scrollHeight > (elem as HTMLElement).clientHeight) {
          console.log('Found scrollable element:', elem.className || elem.tagName);
          return elem;
        }
      }
      
      console.log('No scrollable element found, defaulting to window');
      return window;
    };
    
    const toggleVisibility = (event?: Event) => {
      let scrollY = 0;
      
      // イベントターゲットから判断
      if (event && event.target) {
        if (event.target === window || event.target === document) {
          scrollY = window.scrollY || document.documentElement.scrollTop;
          console.log('Window scroll position:', scrollY);
        } else {
          const target = event.target as HTMLElement;
          scrollY = target.scrollTop;
          console.log(`Element scroll position (${target.className || target.tagName}):`, scrollY);
        }
      } else {
        // 初期チェック時
        scrollY = window.scrollY || document.documentElement.scrollTop;
        const mainElement = document.querySelector('main');
        if (mainElement) {
          const mainScroll = mainElement.scrollTop;
          if (mainScroll > 0) {
            scrollY = mainScroll;
            console.log('Using main element scroll:', scrollY);
          }
        }
      }
      
      // 50px以上スクロールしたらボタンを表示（テスト用に閾値を下げる）
      if (scrollY > 50) {
        console.log('Setting button visible');
        setIsVisible(true);
      } else {
        console.log('Setting button hidden');
        setIsVisible(false);
      }
    };

    // 複数の要素にリスナーを追加（どれがスクロールするか不明なため）
    const scrollableElement = findScrollableElement();
    
    // windowとmain要素の両方にリスナーを追加
    console.log('Adding scroll listeners...');
    window.addEventListener('scroll', toggleVisibility, true);  // captureフェーズでも監視
    document.addEventListener('scroll', toggleVisibility, true);
    
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.addEventListener('scroll', toggleVisibility);
      console.log('Added listener to main element');
    }
    
    // 初期状態のチェック
    toggleVisibility();
    
    // クリーンアップ
    return () => {
      console.log('Removing scroll event listeners');
      window.removeEventListener('scroll', toggleVisibility, true);
      document.removeEventListener('scroll', toggleVisibility, true);
      if (mainElement) {
        mainElement.removeEventListener('scroll', toggleVisibility);
      }
    };
  }, []);

  // トップへスクロール（複数の要素を試す）
  const scrollToTop = useCallback(() => {
    console.log('ScrollToTop clicked');
    
    // window, document, main要素すべてでスクロールを試みる
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // overflow要素も探してスクロール
    const scrollableElements = document.querySelectorAll('.overflow-y-auto, .overflow-y-scroll');
    scrollableElements.forEach(elem => {
      (elem as HTMLElement).scrollTo({ top: 0, behavior: 'smooth' });
    });
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