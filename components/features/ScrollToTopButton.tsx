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
      const scrollableElement =
        document.getElementById('main-scroll-container') ||
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
    let intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    if (!setupScrollListener()) {
      // 要素が見つからない場合は少し待って再試行
      intervalId = setInterval(() => {
        if (setupScrollListener()) {
          if (intervalId) clearInterval(intervalId);
        }
      }, 500);

      // 10秒後にはタイムアウト
      timeoutId = setTimeout(() => {
        if (intervalId) clearInterval(intervalId);
      }, 10000);
    }

    // MutationObserverでDOM変更を監視（無限スクロール対応）
    const observer = new MutationObserver(() => {
      // DOM変更時にリスナーを再設定
      setupScrollListener();
    });

    // body全体を監視（記事リストの追加を検知）
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // クリーンアップ
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      observer.disconnect();
      const scrollableElement =
        document.getElementById('main-scroll-container') ||
        document.querySelector('.overflow-y-auto');
      if (scrollableElement) {
        scrollableElement.removeEventListener('scroll', toggleVisibility);
      }
    };
  }, []);

  // トップへスクロール
  const scrollToTop = useCallback(() => {
    // IDで特定の要素を取得してスクロール
    const scrollableElement =
      document.getElementById('main-scroll-container') ||
      document.querySelector('.overflow-y-auto');
    if (scrollableElement) {
      scrollableElement.scrollTo({
        top: 0,
        behavior: 'smooth',
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
      const { restored, cancelled } = customEvent.detail;

      if (restored && !cancelled) {
        // 復元成功：少し遅延を入れてからチェック（スムーススクロール完了待ち）
        setTimeout(() => {
          const scrollableElement =
            document.getElementById('main-scroll-container') ||
            document.querySelector('.overflow-y-auto');
          if (scrollableElement) {
            const currentScrollY = scrollableElement.scrollTop;
            setIsVisible(currentScrollY > 300);
          }
        }, 1000); // 1秒待機
      } else if (cancelled || !restored) {
        // 復元がキャンセルまたはスキップされた場合
        // スクロールリスナーを再設定して通常の動作を確保
        setTimeout(() => {
          const scrollableElement =
            document.getElementById('main-scroll-container') ||
            document.querySelector('.overflow-y-auto');
          if (scrollableElement) {
            // 現在のスクロール位置をチェック
            const currentScrollY = scrollableElement.scrollTop;
            setIsVisible(currentScrollY > 300);

            // スクロールイベントを手動で発火して状態を同期
            scrollableElement.dispatchEvent(new Event('scroll'));
          }
        }, 100); // 短い待機時間
      }
    };

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
      className={`animate-fade-in fixed right-6 bottom-24 z-50 transform rounded-full bg-[var(--tt-color-info)] p-3 text-white shadow-lg transition-all duration-300 ease-in-out hover:scale-110 hover:bg-[var(--tt-color-info)] hover:opacity-90 hover:shadow-xl focus:ring-2 focus:ring-[var(--tt-color-info-border)] focus:ring-offset-2 focus:outline-none`}
      aria-label="ページトップへ戻る"
      title="ページトップへ戻る (Ctrl+Home)"
    >
      <ChevronUp className="h-6 w-6" />
    </button>
  );
}
