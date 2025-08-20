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
  isFetchingNextPage: boolean,
  scrollContainerRef?: React.RefObject<HTMLElement>
) {
  const isRestoringRef = useRef(false);
  const targetScrollYRef = useRef<number | null>(null);
  const restorationCompleteRef = useRef(false);
  const userInteractedRef = useRef(false);

  // スクロール位置の保存
  const saveScrollPosition = useCallback(() => {
    // スクロール位置を取得（コンテナがあればそこから、なければwindowから）
    let currentScrollY = 0;
    
    if (scrollContainerRef?.current) {
      currentScrollY = scrollContainerRef.current.scrollTop;
      console.log('[ScrollRestore] Using container scrollTop:', currentScrollY);
    } else {
      currentScrollY = window.pageYOffset || 
                      document.documentElement.scrollTop || 
                      document.body.scrollTop || 
                      window.scrollY;
      console.log('[ScrollRestore] Using window scroll:', currentScrollY);
    }
    
    console.log('[ScrollRestore] Saving position - Debug info:', {
      'container exists': !!scrollContainerRef?.current,
      'container scrollTop': scrollContainerRef?.current?.scrollTop,
      'window.scrollY': window.scrollY,
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

  // ユーザー操作の検知
  useEffect(() => {
    if (!isRestoringRef.current || restorationCompleteRef.current) return;

    const handleUserInteraction = () => {
      if (isRestoringRef.current && !restorationCompleteRef.current) {
        console.log('[ScrollRestore] User interaction detected, cancelling restoration');
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
  }, [isRestoringRef.current, scrollContainerRef]);

  // 復元チェック
  useEffect(() => {
    // すでに復元処理中または完了している場合はスキップ
    if (isRestoringRef.current || restorationCompleteRef.current || userInteractedRef.current) return;

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
          
          if (scrollContainerRef?.current) {
            scrollContainerRef.current.scrollTo({
              top: scrollTarget,
              behavior: 'smooth'
            });
          } else {
            window.scrollTo({
              top: scrollTarget,
              behavior: 'smooth'
            });
          }
          
          sessionStorage.removeItem(STORAGE_KEY);
          isRestoringRef.current = false;
          restorationCompleteRef.current = true;
          targetScrollYRef.current = null;
        }, 200); // 待機時間を短縮
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
          // ユーザーが操作していたらキャンセル
          if (userInteractedRef.current) {
            console.log('[ScrollRestore] Cancelled due to user interaction');
            return;
          }
          
          const scrollTarget = targetScrollYRef.current!;
          console.log('[ScrollRestore] Attempting to scroll to:', scrollTarget);
          
          if (scrollContainerRef?.current) {
            console.log('[ScrollRestore] Current container scroll:', scrollContainerRef.current.scrollTop);
            console.log('[ScrollRestore] Container height:', scrollContainerRef.current.scrollHeight);
            
            // コンテナをスムーズスクロール
            scrollContainerRef.current.scrollTo({
              top: scrollTarget,
              behavior: 'smooth'
            });
            
            // 完了確認（スムーズスクロールは非同期なので少し待つ）
            setTimeout(() => {
              console.log('[ScrollRestore] Final container scroll:', scrollContainerRef.current?.scrollTop);
            }, 1000);
          } else {
            console.log('[ScrollRestore] Current window scroll:', window.scrollY);
            console.log('[ScrollRestore] Document height:', document.documentElement.scrollHeight);
            
            // windowをスクロール
            window.scrollTo(0, scrollTarget);
            
            // 少し待ってからもう一度（念のため）
            setTimeout(() => {
              console.log('[ScrollRestore] Second attempt to scroll to:', scrollTarget);
              window.scrollTo(0, scrollTarget);
              console.log('[ScrollRestore] Final window scroll:', window.scrollY);
            }, 100);
          }
          
          console.log('[ScrollRestore] Scroll restoration complete');
          
          // クリーンアップ
          sessionStorage.removeItem(STORAGE_KEY);
          isRestoringRef.current = false;
          restorationCompleteRef.current = true;
          targetScrollYRef.current = null;
        }, 200); // 待機時間を短縮 // レンダリング完了を確実に待つ
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