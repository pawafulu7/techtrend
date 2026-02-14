'use client';

import { useEffect, useRef } from 'react';

interface ViewTrackerProps {
  articleId: string;
}

export function ViewTracker({ articleId }: ViewTrackerProps) {
  const hasRecordedRef = useRef(false);
  const prevArticleIdRef = useRef(articleId);

  useEffect(() => {
    if (prevArticleIdRef.current !== articleId) {
      hasRecordedRef.current = false;
      prevArticleIdRef.current = articleId;
    }
    if (hasRecordedRef.current) return;

    const controller = new AbortController();

    const recordView = async () => {
      try {
        const response = await fetch('/api/article-views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          signal: controller.signal,
          body: JSON.stringify({ articleId }),
        });

        if (response.ok) {
          hasRecordedRef.current = true;
        } else {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Unknown error' }));
          console.error(
            '[ViewTracker] Server error:',
            response.status,
            errorData
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('[ViewTracker] Failed to record view:', error);
      }
    };

    // Delay to avoid competing with RelatedArticles fetch during initial load.
    // Trade-off: users leaving within 1.5s won't have view recorded.
    // keepalive:true on fetch ensures delivery even during page unload after timer fires.
    const timeoutId = setTimeout(recordView, 1500);
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [articleId]);

  return null;
}
