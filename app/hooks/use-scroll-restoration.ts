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
    // スクロール位置を取得（コンテナがあればそこから、なければwindowから）
    let currentScrollY = 0;
    
    if (scrollContainerRef?.current) {
      currentScrollY = scrollContainerRef.current.scrollTop;
    } else {
      currentScrollY = window.pageYOffset || 
                      document.documentElement.scrollTop || 
                      document.body.scrollTop || 
                      window.scrollY;
    }
    
    console.log('[ScrollRestore] Saving position:', {
      scrollY: currentScrollY,
      articleCount,
      pageCount,
      filters,
      timestamp: new Date().toISOString()
    });
    
    // 保存が必要ない条件をチェック
    // スクロール位置が小さい（100px未満）場合は保存しない
    if (currentScrollY < 100) {
      console.log('[ScrollRestore] Not saving: scroll position too small (<100px)');
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
    } catch (e) {
      console.error('[ScrollRestore] Failed to save position:', e);
    }
  }, [articleCount, pageCount, filters]);

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
  }, [isRestoringRef.current, scrollContainerRef]);

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
      isRestoring: isRestoringRef.current,
      restorationComplete: restorationCompleteRef.current,
      userInteracted: userInteractedRef.current,
      filters,
      hasStoredData: !!sessionStorage.getItem(STORAGE_KEY)
    });
    
    // 記事詳細から戻ってきた場合のみ復元を実行
    if (!isReturningFromArticle) {
      // リロードや通常アクセスの場合はsessionStorageをクリア
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        console.log('[ScrollRestore] Not returning from article, clearing stored data');
        sessionStorage.removeItem(STORAGE_KEY);
      }
      return;
    }

    // すでに復元処理中または完了している場合はスキップ
    if (isRestoringRef.current || restorationCompleteRef.current || userInteractedRef.current) {
      console.log('[ScrollRestore] Skipping: already restoring or completed');
      return;
    }

    // filtersがnullまたはundefinedの場合はまだ準備ができていない
    // 空のオブジェクトはOK（全記事表示の場合）
    if (filters === null || filters === undefined) {
      console.log('[ScrollRestore] Filters not ready yet (null or undefined)');
      return;
    }

    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      console.log('[ScrollRestore] No stored data found');
      return;
    }

    try {
      const data = JSON.parse(stored) as ScrollRestoreData;
      console.log('[ScrollRestore] Stored data found:', data);
      
      // 有効期限チェック
      if (Date.now() - data.timestamp > EXPIRY_TIME) {
        console.log('[ScrollRestore] Data expired (older than 5 minutes)');
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      
      // フィルター条件の一致確認
      const currentFiltersStr = JSON.stringify(filters);
      const storedFiltersStr = JSON.stringify(data.filters);
      if (currentFiltersStr !== storedFiltersStr) {
        console.log('[ScrollRestore] Filter mismatch:', {
          current: filters,
          stored: data.filters
        });
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }

      // 復元が必要ない条件をチェック
      // スクロール位置が小さい（100px未満）場合のみ復元をスキップ
      // 保存されたスクロール位置が大きければページ数に関わらず復元する
      if (data.scrollY < 100) {
        // 復元不要なのでクリーンアップ
        sessionStorage.removeItem(STORAGE_KEY);
        cleanupReturningParam();
        return;
      }

      // 復元開始
      console.log('[ScrollRestore] Starting restoration to position:', data.scrollY);
      
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
        fetchNextPage();
      } else if (pageCount >= targetPageCount) {
        // すでに必要なページ数に到達している場合は即座にスクロール
        setTimeout(() => {
          const scrollTarget = targetScrollYRef.current!;
          
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
          
          // スムーススクロール完了後にクリーンアップとイベント発火
          setTimeout(() => {
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
          }, 1000); // スムーススクロール完了待ち
        }, 200); // 待機時間を短縮
      }
    } catch (e) {
      sessionStorage.removeItem(STORAGE_KEY);
      isRestoringRef.current = false;
    }
  }, [filters, pageCount, hasNextPage, isFetchingNextPage, fetchNextPage, cleanupReturningParam]); // 依存関係を追加

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
        
        // スクロール実行
        setTimeout(() => {
          // ユーザーが操作していたらキャンセル
          if (userInteractedRef.current) {
            return;
          }
          
          const scrollTarget = targetScrollYRef.current!;
          
          if (scrollContainerRef?.current) {
            
            // コンテナをスムーズスクロール
            scrollContainerRef.current.scrollTo({
              top: scrollTarget,
              behavior: 'smooth'
            });
            
            // スムーズスクロール完了後にイベント発火
            setTimeout(() => {
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
            }, 1000); // スムーススクロール完了待ち
          } else {
            
            // windowをスクロール
            window.scrollTo(0, scrollTarget);
            
            // 少し待ってからもう一度（念のため）
            setTimeout(() => {
              window.scrollTo(0, scrollTarget);
              
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
            }, 500); // windowスクロール完了待ち
          }
        }, 200); // 待機時間を短縮 // レンダリング完了を確実に待つ
      } else if (hasNextPage && !isFetchingNextPage) {
        // まだページが不足している場合は追加読み込み
        fetchNextPage();
      }
    } catch (e) {
      isRestoringRef.current = false;
    }
  }, [pageCount, hasNextPage, isFetchingNextPage, fetchNextPage, cleanupReturningParam]);

  return {
    saveScrollPosition,
    isRestoring: restorationState.isRestoring,
    currentPage: restorationState.currentPage,
    targetPages: restorationState.targetPages,
    cancelRestoration
  };
}