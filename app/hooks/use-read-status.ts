'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export function useReadStatus(articleIds?: string[]) {
  const { data: session } = useSession();
  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // 既読状態を取得
  const fetchReadStatus = useCallback(async () => {
    if (!session?.user) return;

    setIsLoading(true);
    try {
      const params = articleIds?.length 
        ? `?articleIds=${articleIds.join(',')}`
        : '';
      const response = await fetch(`/api/articles/read-status${params}`);
      if (response.ok) {
        const data = await response.json();
        setReadArticleIds(new Set(data.readArticleIds));
      }
    } catch (error) {
      console.error('Error fetching read status:', error);
    } finally {
      setIsLoading(false);
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
        setReadArticleIds(prev => new Set([...prev, articleId]));
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