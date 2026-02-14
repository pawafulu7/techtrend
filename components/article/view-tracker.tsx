'use client';

import { useEffect, useRef } from 'react';

interface ViewTrackerProps {
  articleId: string;
}

export function ViewTracker({ articleId }: ViewTrackerProps) {
  const hasRecordedRef = useRef(false);

  useEffect(() => {
    if (hasRecordedRef.current) return;

    const recordView = async () => {
      try {
        const response = await fetch('/api/article-views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
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
        console.error('[ViewTracker] Failed to record view:', error);
      }
    };

    // Delay to avoid competing with RelatedArticles fetch during initial load
    const timeoutId = setTimeout(recordView, 1500);
    return () => clearTimeout(timeoutId);
  }, [articleId]);

  return null;
}
