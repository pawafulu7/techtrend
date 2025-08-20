'use client';

import { useCallback, useEffect, useRef } from 'react';

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
  isFetchingNextPage: boolean
) {
  const isRestoringRef = useRef(false);
  const targetScrollYRef = useRef<number | null>(null);
  const restorationCompleteRef = useRef(false);

  // スクロール位置の保存
  const saveScrollPosition = useCallback(() => {
    // 現在のスクロール位置を取得（複数の方法で試す）
    const currentScrollY = window.pageYOffset || 
                          document.documentElement.scrollTop || 
                          document.body.scrollTop || 
                          window.scrollY;
    
    console.log('[ScrollRestore] Saving position - Debug info:', {
      'window.scrollY': window.scrollY,
      'window.pageYOffset': window.pageYOffset,
      'documentElement.scrollTop': document.documentElement.scrollTop,
      'body.scrollTop': document.body.scrollTop,
      'final value': currentScrollY
    });
    
    const data: ScrollRestoreData = {
      scrollY: currentScrollY,
      articleCount,
      pageCount,
      timestamp: Date.now(),
      filters
    };
    
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.log('[ScrollRestore] Position saved:', {
        scrollY: data.scrollY,
        articleCount: data.articleCount,
        pageCount: data.pageCount
      });
    } catch (e) {
      console.warn('[ScrollRestore] Failed to save scroll position:', e);
    }
  }, [articleCount, pageCount, filters]);

  // 復元チェック
  useEffect(() => {
    // すでに復元処理中または完了している場合はスキップ
    if (isRestoringRef.current || restorationCompleteRef.current) return;

    // filtersが空の場合はまだ準備ができていない
    if (!filters || Object.keys(filters).length === 0) {
      console.log('[ScrollRestore] Waiting for filters to be ready');
      return;
    }

    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const data = JSON.parse(stored) as ScrollRestoreData;
      
      // 有効期限チェック
      if (Date.now() - data.timestamp > EXPIRY_TIME) {
        console.log('[ScrollRestore] Data expired, removing');
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      
      // フィルター条件の一致確認
      const currentFiltersStr = JSON.stringify(filters);
      const storedFiltersStr = JSON.stringify(data.filters);
      if (currentFiltersStr !== storedFiltersStr) {
        console.log('[ScrollRestore] Filters mismatch, skipping restoration');
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }

      // 復元開始
      console.log('[ScrollRestore] Starting restoration:', {
        targetScrollY: data.scrollY,
        targetPageCount: data.pageCount,
        currentPageCount: pageCount
      });
      
      isRestoringRef.current = true;
      targetScrollYRef.current = data.scrollY;

      // 必要なページ数まで自動読み込み
      const targetPageCount = Math.min(
        data.pageCount || Math.ceil(data.articleCount / 20),
        MAX_RESTORE_PAGES
      );
      
      if (targetPageCount > pageCount && hasNextPage && !isFetchingNextPage) {
        console.log('[ScrollRestore] Need to load more pages:', {
          current: pageCount,
          target: targetPageCount
        });
        fetchNextPage();
      } else if (pageCount >= targetPageCount) {
        // すでに必要なページ数に到達している場合は即座にスクロール
        console.log('[ScrollRestore] Already have enough pages, scrolling now');
        setTimeout(() => {
          const scrollTarget = targetScrollYRef.current!;
          console.log('[ScrollRestore] Immediate scroll to:', scrollTarget);
          window.scrollTo(0, scrollTarget);
          
          sessionStorage.removeItem(STORAGE_KEY);
          isRestoringRef.current = false;
          restorationCompleteRef.current = true;
          targetScrollYRef.current = null;
        }, 500);
      }
    } catch (e) {
      console.warn('[ScrollRestore] Failed to restore scroll position:', e);
      sessionStorage.removeItem(STORAGE_KEY);
      isRestoringRef.current = false;
    }
  }, [filters, pageCount, hasNextPage, isFetchingNextPage, fetchNextPage]); // 依存関係を追加

  // ページ読み込み完了時のスクロール実行
  useEffect(() => {
    if (!isRestoringRef.current || targetScrollYRef.current === null) return;
    if (restorationCompleteRef.current) return;
    
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
        console.log('[ScrollRestore] Target page count reached, scrolling to position');
        
        // スクロール実行
        setTimeout(() => {
          const scrollTarget = targetScrollYRef.current!;
          console.log('[ScrollRestore] Attempting to scroll to:', scrollTarget);
          console.log('[ScrollRestore] Current scroll position:', window.scrollY);
          console.log('[ScrollRestore] Document height:', document.documentElement.scrollHeight);
          
          // 実際にスクロール
          window.scrollTo(0, scrollTarget);
          
          // 少し待ってからもう一度（念のため）
          setTimeout(() => {
            console.log('[ScrollRestore] Second attempt to scroll to:', scrollTarget);
            window.scrollTo(0, scrollTarget);
            console.log('[ScrollRestore] Final scroll position:', window.scrollY);
          }, 100);
          
          console.log('[ScrollRestore] Scroll restoration complete');
          
          // クリーンアップ
          sessionStorage.removeItem(STORAGE_KEY);
          isRestoringRef.current = false;
          restorationCompleteRef.current = true;
          targetScrollYRef.current = null;
        }, 500); // レンダリング完了を確実に待つ
      } else if (hasNextPage && !isFetchingNextPage) {
        // まだページが不足している場合は追加読み込み
        console.log('[ScrollRestore] Loading more pages:', {
          current: pageCount,
          target: targetPageCount
        });
        fetchNextPage();
      }
    } catch (e) {
      console.warn('[ScrollRestore] Failed during scroll restoration:', e);
      isRestoringRef.current = false;
    }
  }, [pageCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    saveScrollPosition,
    isRestoring: isRestoringRef.current
  };
}