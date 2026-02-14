'use client';

import { useEffect, useRef } from 'react';
import { analyticsTracker } from '@/lib/analytics/tracking';

interface ArticleTrackerProps {
  articleId: string;
  title: string;
  tagNames: string[];
  sourceName: string;
  difficulty: string | null;
}

export function ArticleTracker({
  articleId,
  title,
  tagNames,
  sourceName,
  difficulty,
}: ArticleTrackerProps) {
  const hasStartedRef = useRef(false);
  const articleIdRef = useRef(articleId);

  useEffect(() => {
    if (articleIdRef.current !== articleId) {
      analyticsTracker.endReading(articleIdRef.current);
      articleIdRef.current = articleId;
      hasStartedRef.current = false;
    }

    if (!hasStartedRef.current) {
      analyticsTracker.startReading(articleId, {
        title,
        tags: tagNames,
        source: sourceName,
        difficulty: difficulty || undefined,
      });
      hasStartedRef.current = true;
    }

    const handleBeforeUnload = () => {
      analyticsTracker.endReading(articleId);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        analyticsTracker.endReading(articleId);
        hasStartedRef.current = false;
      } else if (!hasStartedRef.current) {
        analyticsTracker.startReading(articleId, {
          title,
          tags: tagNames,
          source: sourceName,
          difficulty: difficulty || undefined,
        });
        hasStartedRef.current = true;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (hasStartedRef.current) {
        analyticsTracker.endReading(articleId);
      }
    };
    // tagNames serialized to avoid array reference comparison
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, title, tagNames.join(','), sourceName, difficulty]);

  return null;
}
