'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ScrollRestoreData {
  scrollY: number;
  articleCount: number;
  timestamp: number;
  filters: Record<string, string>;
  pageCount?: number;
}

const STORAGE_KEY = 'articleListScroll';
const EXPIRY_TIME = 5 * 60 * 1000; // 5分
const MAX_RESTORE_PAGES = 100; // 最大復元ページ数（2000記事程度まで対応）

export function useScrollRestoration(
  articleCount: number,
  pageCount: number,
  filters: Record<string, string>,
  fetchNextPage: () => void,
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  scrollContainerRef?: React.RefObject<HTMLElement | null>,
  isReturningFromArticle: boolean = false
) {
  const isRestoringRef = useRef(false);
  const targetScrollYRef = useRef<number | null>(null);
  const restorationCompleteRef = useRef(false);
  const userInteractedRef = useRef(false);
  const currentPageRef = useRef(0);
  const targetPagesRef = useRef(0);
  const [restorationState, setRestorationState] = useState({
    isRestoring: false,
    currentPage: 0,
    targetPages: 0
  });

  // スクロール位置の保存
  const saveScrollPosition = useCallback(() => {
    console.log('[ScrollRestore] saveScrollPosition called');

    // スクロール位置を取得（windowから直接取得）
    const currentScrollY = window.pageYOffset ||
                          document.documentElement.scrollTop ||
                          document.body.scrollTop ||
                          window.scrollY || 0;

    console.log('[ScrollRestore] Saving position:', {
      scrollY: currentScrollY,
      articleCount,
      pageCount,
      timestamp: Date.now(),
      hasScrollContainer: !!scrollContainerRef?.current,
      filters: JSON.stringify(filters)
    });

    // 保存が必要ない条件をチェック
    // スクロール位置が小さい（50px未満）場合は保存しない
    if (currentScrollY < 50) {
      console.log('[ScrollRestore] Not saving: scroll position too small (<50px)');
      // 保存しない（既存のデータがあれば削除）
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    const data: ScrollRestoreData = {
      scrollY: currentScrollY,
      articleCount,
      pageCount,
      timestamp: Date.now(),
      filters
    };

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.log('[ScrollRestore] Position saved successfully to sessionStorage');

      // 確認のためsessionStorageから読み込んでログ出力
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        console.log('[ScrollRestore] Verified saved data:', JSON.parse(saved));
      }
    } catch (e) {
      console.error('[ScrollRestore] Failed to save position:', e);
    }
  }, [articleCount, pageCount, filters, scrollContainerRef]);

  // ユーザー操作の検知
  useEffect(() => {
    if (!isRestoringRef.current || restorationCompleteRef.current) return;

    const handleUserInteraction = () => {
      if (isRestoringRef.current && !restorationCompleteRef.current) {
        userInteractedRef.current = true;
        isRestoringRef.current = false;
        sessionStorage.removeItem(STORAGE_KEY);
      }
    };

    const container = scrollContainerRef?.current;
    
    // イベントリスナーを追加
    if (container) {
      container.addEventListener('wheel', handleUserInteraction);
      container.addEventListener('touchstart', handleUserInteraction);
      container.addEventListener('mousedown', handleUserInteraction);
    } else {
      window.addEventListener('wheel', handleUserInteraction);
      window.addEventListener('touchstart', handleUserInteraction);
      window.addEventListener('mousedown', handleUserInteraction);
    }

    return () => {
      // クリーンアップ
      if (container) {
        container.removeEventListener('wheel', handleUserInteraction);
        container.removeEventListener('touchstart', handleUserInteraction);
        container.removeEventListener('mousedown', handleUserInteraction);
      } else {
        window.removeEventListener('wheel', handleUserInteraction);
        window.removeEventListener('touchstart', handleUserInteraction);
        window.removeEventListener('mousedown', handleUserInteraction);
      }
    };
  }, [scrollContainerRef]);

  // URLから'returning'パラメータを削除する関数
  const cleanupReturningParam = useCallback(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('returning')) {
      url.searchParams.delete('returning');
      const newUrl = url.toString();
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // 復元をキャンセルする関数
  const cancelRestoration = useCallback(() => {
    isRestoringRef.current = false;
    restorationCompleteRef.current = true;
    userInteractedRef.current = true;
    sessionStorage.removeItem(STORAGE_KEY);
    cleanupReturningParam();
    setRestorationState({
      isRestoring: false,
      currentPage: 0,
      targetPages: 0
    });
    
    // スクロール復元キャンセルイベントを発火
    window.dispatchEvent(new CustomEvent('scrollRestored', {
      detail: {
        scrollY: 0,
        restored: false,
        cancelled: true
      }
    }));
  }, [cleanupReturningParam]);

  // 復元チェック
  useEffect(() => {
    console.log('[ScrollRestore] Restoration check:', {
      isReturningFromArticle,
      isRestoringRef: isRestoringRef.current,
      restorationCompleteRef: restorationCompleteRef.current,
      userInteractedRef: userInteractedRef.current,
      filters,
      pageCount,
      hasNextPage,
      isFetchingNextPage
    });

    // 記事詳細から戻ってきた場合のみ復元を実行
    if (!isReturningFromArticle) {
      // リロードや通常アクセスの場合はsessionStorageをクリア
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        console.log('[ScrollRestore] Not returning from article, clearing storage');
        sessionStorage.removeItem(STORAGE_KEY);
      }
      return;
    }

    // すでに復元処理中または完了している場合はスキップ
    if (isRestoringRef.current || restorationCompleteRef.current || userInteractedRef.current) {
      return;
    }

    // filtersがnullまたはundefinedの場合はまだ準備ができていない
    // 空のオブジェクトはOK（全記事表示の場合）
    if (filters === null || filters === undefined) {
      return;
    }

    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      console.log('[ScrollRestore] No stored data found');
      return;
    }

    try {
      const data = JSON.parse(stored) as ScrollRestoreData;
      console.log('[ScrollRestore] Found stored data:', data);
      
      // 有効期限チェック
      if (Date.now() - data.timestamp > EXPIRY_TIME) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      
      // フィルター条件の一致確認
      const currentFiltersStr = JSON.stringify(filters);
      const storedFiltersStr = JSON.stringify(data.filters);
      if (currentFiltersStr !== storedFiltersStr) {
        console.log('[ScrollRestore] Filters mismatch, skipping restoration:', {
          current: currentFiltersStr,
          stored: storedFiltersStr
        });
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }

      // 復元が必要ない条件をチェック
      // スクロール位置が小さい（50px未満）場合のみ復元をスキップ
      // 保存されたスクロール位置が大きければページ数に関わらず復元する
      if (data.scrollY < 50) {
        console.log('[ScrollRestore] Skipping restoration: scroll position too small (<50px)');
        // 復元不要なのでクリーンアップ
        sessionStorage.removeItem(STORAGE_KEY);
        cleanupReturningParam();
        return;
      }

      // 復元開始
      console.log('[ScrollRestore] Starting restoration:', {
        targetScrollY: data.scrollY,
        currentPageCount: pageCount,
        targetPageCount: data.pageCount || Math.ceil(data.articleCount / 20)
      });

      isRestoringRef.current = true;
      targetScrollYRef.current = data.scrollY;

      // 必要なページ数まで自動読み込み
      const targetPageCount = Math.min(
        data.pageCount || Math.ceil(data.articleCount / 20),
        MAX_RESTORE_PAGES
      );
      
      // 状態を更新
      currentPageRef.current = pageCount;
      targetPagesRef.current = targetPageCount;
      setRestorationState({
        isRestoring: true,
        currentPage: pageCount,
        targetPages: targetPageCount
      });
      
      if (targetPageCount > pageCount && hasNextPage && !isFetchingNextPage) {
        console.log('[ScrollRestore] Need more pages, fetching next page');
        fetchNextPage();
      } else if (pageCount >= targetPageCount) {
        // すでに必要なページ数に到達している場合は即座にスクロール
        console.log('[ScrollRestore] Target pages reached, scrolling now');
        setTimeout(() => {
          const scrollTarget = targetScrollYRef.current!;

          console.log('[ScrollRestore] Scrolling window to:', scrollTarget);
          // 即座にスクロール（スムーススクロールを使わない）
          window.scrollTo(0, scrollTarget);

          // 少し待ってからもう一度（確実性のため）
          setTimeout(() => {
            window.scrollTo(0, scrollTarget);

            // クリーンアップとイベント発火
            sessionStorage.removeItem(STORAGE_KEY);
            isRestoringRef.current = false;
            restorationCompleteRef.current = true;
            targetScrollYRef.current = null;

            // 状態をリセット
            setRestorationState({
              isRestoring: false,
              currentPage: 0,
              targetPages: 0
            });

            // URLから'returning'パラメータを削除
            cleanupReturningParam();

            // スクロール復元完了イベントを発火（即座に復元の場合）
            window.dispatchEvent(new CustomEvent('scrollRestored', {
              detail: {
                scrollY: scrollTarget,
                restored: true,
                cancelled: false
              }
            }));
          }, 100); // 短い待機時間
        }, 300); // データレンダリング待機
      }
    } catch (_error) {
      sessionStorage.removeItem(STORAGE_KEY);
      isRestoringRef.current = false;
    }
  }, [filters, pageCount, hasNextPage, isFetchingNextPage, fetchNextPage, cleanupReturningParam, isReturningFromArticle, scrollContainerRef]);

  // ページ読み込み完了時のスクロール実行
  useEffect(() => {
    if (!isRestoringRef.current || targetScrollYRef.current === null) return;
    if (restorationCompleteRef.current) return;
    
    // 進捗を更新
    if (currentPageRef.current !== pageCount) {
      currentPageRef.current = pageCount;
      setRestorationState(prev => ({
        ...prev,
        currentPage: pageCount
      }));
    }
    
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    
    try {
      const data = JSON.parse(stored) as ScrollRestoreData;
      const targetPageCount = Math.min(
        data.pageCount || Math.ceil(data.articleCount / 20),
        MAX_RESTORE_PAGES
      );
      
      // 必要なページ数に到達したか確認
      if (pageCount >= targetPageCount) {
        console.log('[ScrollRestore] All pages loaded, executing scroll to:', targetScrollYRef.current);

        // スクロール実行
        setTimeout(() => {
          // ユーザーが操作していたらキャンセル
          if (userInteractedRef.current) {
            console.log('[ScrollRestore] User interaction detected, cancelling');
            return;
          }

          const scrollTarget = targetScrollYRef.current!;

          // windowをスクロール（コンテナは使わない）
          console.log('[ScrollRestore] Executing window scroll to:', scrollTarget);
          window.scrollTo(0, scrollTarget);

          // 少し待ってからもう一度（確実性のため）
          setTimeout(() => {
            window.scrollTo(0, scrollTarget);
            console.log('[ScrollRestore] Second scroll executed, position:', window.scrollY);

            // クリーンアップ
            sessionStorage.removeItem(STORAGE_KEY);
            isRestoringRef.current = false;
            restorationCompleteRef.current = true;
            targetScrollYRef.current = null;

            // 状態をリセット
            setRestorationState({
              isRestoring: false,
              currentPage: 0,
              targetPages: 0
            });

            // URLから'returning'パラメータを削除
            cleanupReturningParam();

            // スクロール復元完了イベントを発火
            window.dispatchEvent(new CustomEvent('scrollRestored', {
              detail: {
                scrollY: scrollTarget,
                restored: true,
                cancelled: false
              }
            }));
            console.log('[ScrollRestore] Restoration complete');
          }, 100); // 短い待機時間
        }, 500); // データレンダリング待機
      } else if (hasNextPage && !isFetchingNextPage) {
        // まだページが不足している場合は追加読み込み
        fetchNextPage();
      }
    } catch (_error) {
      isRestoringRef.current = false;
    }
  }, [pageCount, hasNextPage, isFetchingNextPage, fetchNextPage, cleanupReturningParam, scrollContainerRef]);

  return {
    saveScrollPosition,
    isRestoring: restorationState.isRestoring,
    currentPage: restorationState.currentPage,
    targetPages: restorationState.targetPages,
    cancelRestoration
  };
}