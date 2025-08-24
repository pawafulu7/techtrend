'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronUp } from 'lucide-react';

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  // スクロール位置を監視
  useEffect(() => {
    const toggleVisibility = () => {
      // 300px以上スクロールしたらボタンを表示
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // スクロールイベントリスナーを追加
    window.addEventListener('scroll', toggleVisibility);

    // 初期状態のチェック
    toggleVisibility();

    // クリーンアップ
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  // トップへスクロール
  const scrollToTop = useCallback(() => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
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

  // ボタンが非表示の時はレンダリングしない
  if (!isVisible) {
    return null;
  }

  return (
    <button
      onClick={scrollToTop}
      className={`
        fixed bottom-6 right-6 z-50
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