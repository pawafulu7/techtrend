'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildScrollStorageKey } from '@/lib/utils/scroll';
import { PAGINATION, TIMEOUTS, SCROLL } from '@/lib/constants/index';

export function useScrollRestoration(
  articlesCount: number,
  pagesLoaded: number,
  filters: Record<string, string>,
  fetchNextPage: () => Promise<any>,
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
  const fetchingPagesRef = useRef<boolean>(false);
  const pagesLoadedRef = useRef<number>(pagesLoaded);
  const restorationStartedRef = useRef<boolean>(false);

  // Helper to manage timeouts safely
  const setRestorationTimeout = useCallback((fn: () => void, delay: number) => {
    if (restorationTimeoutRef.current) {
      clearTimeout(restorationTimeoutRef.current);
    }
    const handle = setTimeout(() => {
      if (restorationAbortRef.current) return;
      fn();
    }, delay);
    restorationTimeoutRef.current = handle as unknown as NodeJS.Timeout;
    return handle;
  }, []);

  // pagesLoadedRefをpagesLoadedの変更に同期
  useEffect(() => {
    pagesLoadedRef.current = pagesLoaded;
  }, [pagesLoaded]);

  // スクロール位置復元処理（記事詳細から戻った時のみ）
  useEffect(() => {
    if (!isReturningFromArticle) {
      return;
    }

    // 新規復元開始時に abort フラグを解除
    restorationAbortRef.current = false;

    // sessionStorageから保存されたスクロール位置を取得（正規化したキーを使用）
    const scrollKey = buildScrollStorageKey();
    const savedData = sessionStorage.getItem(scrollKey);

    if (!savedData) {
      return;
    }

    // Parse with safety and validation
    let parsed: any;
    try {
      parsed = JSON.parse(savedData);
    } catch {
      sessionStorage.removeItem(scrollKey);
      return;
    }
    const { scrollY, timestamp, articleId, articleIndex } = parsed ?? {};
    if (typeof timestamp !== 'number') {
      sessionStorage.removeItem(scrollKey);
      return;
    }
    const age = Date.now() - Number(timestamp);

    // 指定時間以内のデータのみ有効
    if (age > SCROLL.RESTORE_DATA_EXPIRY_MINUTES * 60 * 1000) {
      sessionStorage.removeItem(scrollKey);
      return;
    }


    // 必要なページ数を計算
    const calculateRequiredPages = () => {
      if (typeof articleIndex === 'number' && articleIndex >= 0) {
        // 記事インデックスから必要なページ数を計算
        return Math.min(
          Math.ceil((articleIndex + 1) / PAGINATION.ITEMS_PER_PAGE),
          PAGINATION.MAX_PREFETCH_PAGES
        );
      }
      return 1; // デフォルトは1ページ
    };

    const requiredPages = calculateRequiredPages();

    // 多重起動防止チェック
    if (restorationStartedRef.current) {
      return;
    }
    restorationStartedRef.current = true;

    // スクロール位置を復元
    // ローディングUIを表示
    setIsRestoring(true);
    setCurrentPage(pagesLoaded);
    setTargetPages(requiredPages);

    // pagesLoadedRefを更新
    pagesLoadedRef.current = pagesLoaded;

    const restoreScroll = () => {
      // 可能なら記事要素の上端に合わせる（タイトルが確実に見える）
      const mainContainer = document.getElementById('main-scroll-container');
      const HEADER_OFFSET_PX = SCROLL.HEADER_OFFSET_PX;

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
          window.scrollTo({ top: 0, behavior: 'auto' });
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
      setRestorationTimeout(() => {
        if (restorationAbortRef.current) return;
        setIsRestoring(false);
        try {
          const evt = new CustomEvent('scrollRestored', { detail: { restored: true, cancelled: false } });
          window.dispatchEvent(evt);
        } catch {}
      }, TIMEOUTS.SCROLL_RESTORE_UI_DELAY);
    };

    // 必要なページをフェッチしてから復元
    const fetchRequiredPagesAndRestore = async () => {
      if (requiredPages > pagesLoadedRef.current && !fetchingPagesRef.current) {
        fetchingPagesRef.current = true;
        try {
          // 必要なページまで自動的にフェッチ
          while (pagesLoadedRef.current < requiredPages && hasNextPage && !restorationAbortRef.current) {
            // fetchNextPageの結果を待ち、成功したらpagesLoadedRefを更新
            const result = await fetchNextPage();

            // abortチェック
            if (restorationAbortRef.current) {
              break;
            }

            // 実際にロードされたページ数を確認
            // fetchNextPageがページ数を返さない場合はインクリメント
            if (result?.pageParams?.length) {
              pagesLoadedRef.current = result.pageParams.length;
            } else {
              pagesLoadedRef.current++;
            }

            // UI更新（abort前に再チェック）
            if (!restorationAbortRef.current) {
              setCurrentPage(pagesLoadedRef.current);
            }

            // hasNextPageの再評価（fetchNextPageの結果を反映）
            if (result?.hasNextPage === false) {
              break;
            }

            // 少し待機（レンダリングを待つ）
            await new Promise(resolve => setTimeout(resolve, TIMEOUTS.PAGE_FETCH_WAIT));

            // 待機後の最終abortチェック
            if (restorationAbortRef.current) {
              break;
            }
          }
        } finally {
          fetchingPagesRef.current = false;
        }
      }
    };

    // 少し遅延してから復元（DOMの準備を待つ）
    const tryRestoreWithRetry = async () => {
      // まず必要なページをフェッチ
      await fetchRequiredPagesAndRestore();

      let attempts = 0;
      const maxAttempts = TIMEOUTS.SCROLL_RESTORE_MAX_ATTEMPTS;
      const interval = TIMEOUTS.SCROLL_RESTORE_RETRY_INTERVAL;

      const tryOnce = () => {
        if (restorationAbortRef.current) return;
        const mainContainer = document.getElementById('main-scroll-container');

        // a) articleId がある場合は要素の出現を優先して待つ
        if (articleId) {
          const el =
            document.getElementById(`article-${articleId}`) ||
            document.querySelector(`[data-article-id="${articleId}"]`);
          if (el) {
            restoreScroll();
            return;
          }
        } else if (mainContainer) {
          // b) articleId が無い場合のみ、コンテナ準備でき次第フォールバック復元
          restoreScroll();
          return;
        }

        // c) まだ要素が無い → リトライ、上限でフォールバック
        if (attempts < maxAttempts) {
          attempts += 1;
          setRestorationTimeout(tryOnce, interval);
        } else {
          restoreScroll();
        }
      };

      setRestorationTimeout(tryOnce, 100);
    };

    tryRestoreWithRetry();

    return () => {
      // cleanup on effect dispose
      restorationAbortRef.current = true;
      fetchingPagesRef.current = false;
      restorationStartedRef.current = false;
      if (restorationTimeoutRef.current) {
        clearTimeout(restorationTimeoutRef.current);
        restorationTimeoutRef.current = null;
      }
    };
  }, [isReturningFromArticle, scrollContainerRef, setRestorationTimeout, fetchNextPage, hasNextPage, pagesLoaded]);

  // スクロール位置を保存（互換性のため残す）
  const saveScrollPosition = useCallback(() => {
    // 新しい実装ではlist-item.tsx内で直接保存するため、ここでは何もしない
  }, []);

  // 復元キャンセル（互換性のため残す）
  const cancelRestoration = useCallback(() => {
    restorationAbortRef.current = true;
    restorationStartedRef.current = false;
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
