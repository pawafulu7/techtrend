'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

const STORAGE_KEY = 'techtrend-read-articles';

export function useReadStatus(articleIds?: string[]) {
  const { data: session } = useSession();
  
  // localStorageから初期値を読み込む
  const getInitialReadStatus = () => {
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return new Set<string>(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading read status from localStorage:', error);
    }
    return new Set<string>();
  };
  
  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(getInitialReadStatus);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);

  // 既読状態を取得
  const fetchReadStatus = useCallback(async () => {
    if (!session?.user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = articleIds?.length 
        ? `?articleIds=${articleIds.join(',')}`
        : '';
      const response = await fetch(`/api/articles/read-status${params}`);
      if (response.ok) {
        const data = await response.json();
        const newReadArticleIds = new Set(data.readArticleIds);
        setReadArticleIds(newReadArticleIds);
        setUnreadCount(data.unreadCount || 0);
        // localStorageに保存
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(newReadArticleIds)));
        } catch (error) {
          console.error('Error saving read status to localStorage:', error);
        }
      }
    } catch (error) {
      console.error('Error fetching read status:', error);
    } finally {
      setIsLoading(false);
      setHasLoadedInitial(true);
    }
  }, [session, articleIds]);

  // 記事を既読にマーク
  const markAsRead = useCallback(async (articleId: string) => {
    if (!session?.user) return;

    try {
      const response = await fetch('/api/articles/read-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId })
      });

      if (response.ok) {
        setReadArticleIds(prev => {
          const newSet = new Set([...prev, articleId]);
          // localStorageに保存
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(newSet)));
          } catch (error) {
            console.error('Error saving read status to localStorage:', error);
          }
          return newSet;
        });
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  }, [session]);

  // 記事を未読に戻す
  const markAsUnread = useCallback(async (articleId: string) => {
    if (!session?.user) return;

    try {
      const response = await fetch(`/api/articles/read-status?articleId=${articleId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setReadArticleIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(articleId);
          // localStorageに保存
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(newSet)));
          } catch (error) {
            console.error('Error saving read status to localStorage:', error);
          }
          return newSet;
        });
        setUnreadCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error marking as unread:', error);
    }
  }, [session]);

  // 全未読記事を一括既読にマーク
  const markAllAsRead = useCallback(async () => {
    if (!session?.user) return;

    // タイムアウトを5分に延長
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    try {
      const response = await fetch('/api/articles/read-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // 空のボディ（サーバー側で全未読を取得）
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        
        // 未読数を0に即座に更新
        setUnreadCount(0);
        
        // 記事リストを再取得するためのカスタムイベントを発火
        // タイミングを少し遅らせて確実にキャッシュをクリアする
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('articles-read-status-changed'));
        }, 100);
        
        // 全記事を既読として扱うため、再取得
        await fetchReadStatus();
        
        return data;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Request timeout after 5 minutes');
      } else {
        console.error('Error marking all as read:', error);
      }
    }
  }, [session, fetchReadStatus]);

  // 記事が既読かどうか
  const isRead = useCallback((articleId: string) => {
    return readArticleIds.has(articleId);
  }, [readArticleIds]);

  // 初回マウント時に既読状態を取得
  useEffect(() => {
    fetchReadStatus();
  }, [fetchReadStatus]);

  return {
    readArticleIds,
    unreadCount,
    isRead,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    isLoading,
    refetch: fetchReadStatus
  };
}