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
    const data: ScrollRestoreData = {
      scrollY: window.scrollY,
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

  // 初回マウント時の復元チェック
  useEffect(() => {
    // すでに復元処理中または完了している場合はスキップ
    if (isRestoringRef.current || restorationCompleteRef.current) return;

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
          window.scrollTo({
            top: targetScrollYRef.current!,
            behavior: 'instant'
          });
          sessionStorage.removeItem(STORAGE_KEY);
          isRestoringRef.current = false;
          restorationCompleteRef.current = true;
          targetScrollYRef.current = null;
        }, 100);
      }
    } catch (e) {
      console.warn('[ScrollRestore] Failed to restore scroll position:', e);
      sessionStorage.removeItem(STORAGE_KEY);
      isRestoringRef.current = false;
    }
  }, []); // 初回マウント時のみ実行

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
          window.scrollTo({
            top: targetScrollYRef.current!,
            behavior: 'instant'
          });
          
          console.log('[ScrollRestore] Scroll restoration complete');
          
          // クリーンアップ
          sessionStorage.removeItem(STORAGE_KEY);
          isRestoringRef.current = false;
          restorationCompleteRef.current = true;
          targetScrollYRef.current = null;
        }, 200); // 少し待機時間を長くしてレンダリング完了を待つ
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