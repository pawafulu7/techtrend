'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import logger from '@/lib/logger';

interface ReadTrackerProps {
  articleId: string;
}

export function ReadTracker({ articleId }: ReadTrackerProps) {
  const { data: session } = useSession();
  const hasSentRequest = useRef(false);
  const retryCount = useRef(0);
  const maxRetries = 3;

  useEffect(() => {
    if (!session?.user?.id || !articleId) return;

    // Reset refs when articleId changes
    hasSentRequest.current = false;
    retryCount.current = 0;

    // Mark article as read
    const markAsRead = async () => {
      // Prevent duplicate requests
      if (hasSentRequest.current) return;

      try {
        const response = await fetch('/api/articles/read-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId })
        });

        if (!response.ok) {
          throw new Error(`Failed to mark as read: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          hasSentRequest.current = true;

          // Dispatch custom event to update UI
          window.dispatchEvent(new CustomEvent('article-read-status-changed', {
            detail: { articleId, isRead: true }
          }));

          // Also update localStorage cache
          const cachedData = localStorage.getItem('read-status');
          if (cachedData) {
            try {
              const parsed = JSON.parse(cachedData);
              if (!parsed.readArticleIds.includes(articleId)) {
                parsed.readArticleIds.push(articleId);
                localStorage.setItem('read-status', JSON.stringify(parsed));
              }
            } catch (_e) {
              // Ignore cache update errors
            }
          }

          logger.info({ articleId }, 'Article marked as read successfully');
        }
      } catch (error) {
        logger.error({ error, articleId, retryCount: retryCount.current }, 'Error marking article as read');

        // Retry logic
        if (retryCount.current < maxRetries) {
          retryCount.current++;
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount.current), 5000);
          setTimeout(markAsRead, retryDelay);
        }
      }
    };

    // Delay slightly to ensure the page has loaded and session is ready
    const timer = setTimeout(markAsRead, 1000);
    return () => clearTimeout(timer);
  }, [articleId, session?.user?.id]);

  return null;
}