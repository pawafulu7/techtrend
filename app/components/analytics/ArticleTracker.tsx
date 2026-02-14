'use client';

import { useEffect, useRef } from 'react';
import { analyticsTracker } from '@/lib/analytics/tracking';

interface ArticleTrackerProps {
  articleId: string;
  title: string;
  serializedTagNames: string;
  sourceName: string;
  difficulty: string | null;
}

export function ArticleTracker({
  articleId,
  title,
  serializedTagNames,
  sourceName,
  difficulty,
}: ArticleTrackerProps) {
  const tagNames = serializedTagNames.split(',').filter(Boolean);
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
  }, [articleId, title, serializedTagNames, sourceName, difficulty]);

  return null;
}
