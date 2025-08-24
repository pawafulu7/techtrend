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
      }
    } catch (error) {
      console.error('Error marking as unread:', error);
    }
  }, [session]);

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
    isRead,
    markAsRead,
    markAsUnread,
    isLoading,
    refetch: fetchReadStatus
  };
}