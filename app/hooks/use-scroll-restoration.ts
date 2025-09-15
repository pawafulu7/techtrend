'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildScrollStorageKey } from '@/lib/utils/scroll';

export function useScrollRestoration(
  articlesCount: number,
  pagesLoaded: number,
  filters: Record<string, string>,
  fetchNextPage: () => void,
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  scrollContainerRef?: React.RefObject<HTMLElement | null>,
  isReturningFromArticle: boolean = false
) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [targetPages, setTargetPages] = useState(0);
  const restorationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const restorationAbortRef = useRef<boolean>(false);

  // スクロール位置復元処理（記事詳細から戻った時のみ）
  useEffect(() => {
    if (!isReturningFromArticle) {
      return;
    }

    // sessionStorageから保存されたスクロール位置を取得（正規化したキーを使用）
    const scrollKey = buildScrollStorageKey();
    const savedData = sessionStorage.getItem(scrollKey);

    if (!savedData) {
      return;
    }

    const { scrollY, timestamp, articleId } = JSON.parse(savedData);
    const age = Date.now() - timestamp;

    // 30分以内のデータのみ有効
    if (age > 30 * 60 * 1000) {
      sessionStorage.removeItem(scrollKey);
      return;
    }


    // スクロール位置を復元
    // ローディングUIを表示
    setIsRestoring(true);
    setCurrentPage(1);
    setTargetPages(1);

    const restoreScroll = () => {
      // 可能なら記事要素の上端に合わせる（タイトルが確実に見える）
      const mainContainer = document.getElementById('main-scroll-container');
      const HEADER_OFFSET_PX = 8;

      const tryScrollToElement = (id: string): boolean => {
        const el = document.getElementById(`article-${id}`) || document.querySelector(`[data-article-id="${id}"]`) as HTMLElement | null;
        if (!el) return false;
        // コンテナがスクロール領域の場合はoffsetTopを使う
        if (mainContainer) {
          const target = Math.max(el.offsetTop - HEADER_OFFSET_PX, 0);
          const containerElement = mainContainer as unknown;
          if (containerElement && typeof (containerElement as { scrollTo?: (options: { top: number; behavior: string }) => void }).scrollTo === 'function') {
            (containerElement as { scrollTo: (options: { top: number; behavior: string }) => void }).scrollTo({ top: target, behavior: 'smooth' });
          } else {
            (mainContainer as HTMLElement).scrollTop = target;
          }
          // メインコンテナを使う場合、ウィンドウは最上部に固定
          window.scrollTo({ top: 0, behavior: 'instant' });
          return true;
        }
        // windowスクロールの場合
        const rect = el.getBoundingClientRect();
        const y = Math.max(window.scrollY + rect.top - HEADER_OFFSET_PX, 0);
        window.scrollTo({ top: y, behavior: 'smooth' });
        return true;
      };

      if (articleId && tryScrollToElement(articleId)) {
        // OK: 要素に合わせて復元完了
      } else {
        // フォールバック: 保存されたスクロール値に微調整を加えて復元
        const RESTORE_OFFSET_PX = 0; // 要素に合わせられない場合はそのまま使う
        const adjustedScrollY = Math.max((scrollY ?? 0) + RESTORE_OFFSET_PX, 0);
        window.scrollTo({ top: adjustedScrollY, behavior: 'smooth' });
        if (mainContainer) {
          const containerElement = mainContainer as unknown;
          if (containerElement && typeof (containerElement as { scrollTo?: (options: { top: number; behavior: string }) => void }).scrollTo === 'function') {
            (containerElement as { scrollTo: (options: { top: number; behavior: string }) => void }).scrollTo({ top: adjustedScrollY, behavior: 'smooth' });
          } else {
            mainContainer.scrollTop = adjustedScrollY;
          }
        }
        if (scrollContainerRef?.current) {
          const sc = scrollContainerRef.current as unknown;
          if (sc && typeof (sc as { scrollTo?: (options: { top: number; behavior: string }) => void }).scrollTo === 'function') {
            (sc as { scrollTo: (options: { top: number; behavior: string }) => void }).scrollTo({ top: adjustedScrollY, behavior: 'smooth' });
          } else {
            (scrollContainerRef.current as HTMLElement).scrollTop = adjustedScrollY;
          }
        }
        const scrollableElements = document.querySelectorAll('.overflow-y-auto');
        scrollableElements.forEach((el, _index) => {
          const anyEl = el as unknown;
          if (anyEl && typeof (anyEl as { scrollTo?: (options: { top: number; behavior: string }) => void }).scrollTo === 'function') {
            (anyEl as { scrollTo: (options: { top: number; behavior: string }) => void }).scrollTo({ top: adjustedScrollY, behavior: 'smooth' });
          } else {
            (el as HTMLElement).scrollTop = adjustedScrollY;
          }
        });
      }

      // 復元後にsessionStorageから削除
      sessionStorage.removeItem(scrollKey);

      // スムーススクロール完了を待ってUIを閉じる（簡易的に遅延）
      setTimeout(() => {
        setIsRestoring(false);
        try {
          const evt = new CustomEvent('scrollRestored', { detail: { restored: true, cancelled: false } });
          window.dispatchEvent(evt);
        } catch {}
      }, 700);
    };

    // 少し遅延してから復元（DOMの準備を待つ）
    const tryRestoreWithRetry = () => {
      let attempts = 0;
      const maxAttempts = 12; // 約1.2秒 (100ms間隔)
      const interval = 100;

      const tryOnce = () => {
        const mainContainer = document.getElementById('main-scroll-container');
        const ok = (() => {
          // 記事IDがあり、かつ要素が見つかったら即復元
          if (articleId) {
            const el = document.getElementById(`article-${articleId}`) || document.querySelector(`[data-article-id="${articleId}"]`);
            if (el) {
              restoreScroll();
              return true;
            }
          }
          // 記事IDなしまたは要素未発見だが、スクロール領域が整ったらフォールバック復元
          if (mainContainer) {
            restoreScroll();
            return true;
          }
          return false;
        })();

        if (!ok && attempts < maxAttempts) {
          attempts += 1;
          setTimeout(tryOnce, interval);
        } else if (!ok) {
          // 最後にフォールバックを強制実行
          restoreScroll();
        }
      };

      setTimeout(tryOnce, 100);
    };

    tryRestoreWithRetry();

    return () => {
      // no-op
    };
  }, [isReturningFromArticle, scrollContainerRef]);

  // スクロール位置を保存（互換性のため残す）
  const saveScrollPosition = useCallback(() => {
    // 新しい実装ではlist-item.tsx内で直接保存するため、ここでは何もしない
  }, []);

  // 復元キャンセル（互換性のため残す）
  const cancelRestoration = useCallback(() => {
    restorationAbortRef.current = true;
    setIsRestoring(false);
    setCurrentPage(0);
    setTargetPages(0);
    if (restorationTimeoutRef.current) {
      clearTimeout(restorationTimeoutRef.current);
      restorationTimeoutRef.current = null;
    }
    try {
      const evt = new CustomEvent('scrollRestored', { detail: { restored: false, cancelled: true } });
      window.dispatchEvent(evt);
    } catch {}
  }, []);

  return {
    saveScrollPosition,
    isRestoring,
    currentPage,
    targetPages,
    cancelRestoration
  };
}
