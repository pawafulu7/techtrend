'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import logger from '@/lib/logger.client';

interface ReadTrackerProps {
  articleId: string;
}

const READ_STATUS_STORAGE_KEY = 'techtrend-read-articles';

export function ReadTracker({ articleId }: ReadTrackerProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const hasSentRequest = useRef(false);
  const isSendingRequest = useRef(false);
  const isMountedRef = useRef(true);
  const retryCount = useRef(0);
  const retryTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRetries = 3;

  useEffect(() => {
    isMountedRef.current = true;

    if (!session?.user?.id || !articleId) {
      return () => {
        isMountedRef.current = false;
      };
    }

    // Reset refs when articleId changes
    hasSentRequest.current = false;
    isSendingRequest.current = false;
    retryCount.current = 0;
    if (retryTimeoutId.current) {
      clearTimeout(retryTimeoutId.current);
      retryTimeoutId.current = null;
    }

    // Mark article as read
    const markAsRead = async () => {
      // Prevent duplicate requests or post-unmount execution
      if (
        hasSentRequest.current ||
        isSendingRequest.current ||
        !isMountedRef.current
      )
        return;

      try {
        isSendingRequest.current = true;
        const response = await fetch('/api/articles/read-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify({ articleId }),
        });

        if (!response.ok) {
          throw new Error(`Failed to mark as read: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          hasSentRequest.current = true;

          // Update react-query caches even if the list page is unmounted (e.g., browser back)
          queryClient.setQueriesData(
            { queryKey: ['infinite-articles'], exact: false },
            (oldData: any) => {
              if (!oldData || !Array.isArray(oldData.pages)) return oldData;

              let changed = false;
              const pages = oldData.pages.map((page: any) => {
                const items: any[] | undefined = page?.data?.items;
                if (!Array.isArray(items)) return page;

                let pageChanged = false;
                const newItems = items.map((item: any) => {
                  if (item?.id === articleId && item?.isRead !== true) {
                    pageChanged = true;
                    changed = true;
                    return { ...item, isRead: true };
                  }
                  return item;
                });

                return pageChanged
                  ? { ...page, data: { ...page.data, items: newItems } }
                  : page;
              });

              return changed ? { ...oldData, pages } : oldData;
            }
          );

          // Dispatch custom event to update UI
          window.dispatchEvent(
            new CustomEvent('article-read-status-changed', {
              detail: { articleId, isRead: true },
            })
          );

          // Also update localStorage cache used by useReadStatus()
          try {
            const stored = localStorage.getItem(READ_STATUS_STORAGE_KEY);
            const parsed = stored ? JSON.parse(stored) : [];
            const ids = Array.isArray(parsed) ? parsed : [];
            if (!ids.includes(articleId)) {
              ids.push(articleId);
              localStorage.setItem(
                READ_STATUS_STORAGE_KEY,
                JSON.stringify(ids)
              );
            }
          } catch {
            // Ignore cache update errors
          }
        }
      } catch (error) {
        logger.error(
          { error, articleId, retryCount: retryCount.current },
          'Error marking article as read'
        );

        // Retry logic - guard against post-unmount retry scheduling
        if (retryCount.current < maxRetries && isMountedRef.current) {
          retryCount.current++;
          const retryDelay = Math.min(
            1000 * Math.pow(2, retryCount.current),
            5000
          );
          retryTimeoutId.current = setTimeout(markAsRead, retryDelay);
        }
      } finally {
        isSendingRequest.current = false;
      }
    };

    // Delay to prioritize initial content rendering over analytics
    const delayId = setTimeout(() => {
      if (isMountedRef.current) {
        void markAsRead();
      }
    }, 3000);

    return () => {
      isMountedRef.current = false;
      clearTimeout(delayId);
      if (retryTimeoutId.current) {
        clearTimeout(retryTimeoutId.current);
        retryTimeoutId.current = null;
      }
    };
  }, [articleId, session?.user?.id, queryClient]);

  return null;
}
