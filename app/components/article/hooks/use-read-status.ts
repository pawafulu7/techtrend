'use client';

import { useState, useEffect } from 'react';

interface ReadStatusChangeDetail {
  articleId: string;
  isRead: boolean;
}

/**
 * Track article read status via custom events and prop sync
 */
export function useReadStatus(
  articleId: string,
  initialIsRead: boolean
): boolean {
  // Store prev props in state to detect changes without using refs during render
  const [prevArticleId, setPrevArticleId] = useState(articleId);
  const [prevInitialIsRead, setPrevInitialIsRead] = useState(initialIsRead);
  const [isRead, setIsRead] = useState(initialIsRead);

  // Sync state when articleId or initialIsRead prop changes (derived state pattern)
  if (prevArticleId !== articleId || prevInitialIsRead !== initialIsRead) {
    setPrevArticleId(articleId);
    setPrevInitialIsRead(initialIsRead);
    setIsRead(initialIsRead);
  }

  useEffect(() => {
    const handleReadStatusChange = (
      event: CustomEvent<ReadStatusChangeDetail>
    ) => {
      if (event.detail.articleId === articleId) {
        setIsRead(event.detail.isRead);
      }
    };

    window.addEventListener(
      'article-read-status-changed',
      handleReadStatusChange as EventListener
    );
    return () => {
      window.removeEventListener(
        'article-read-status-changed',
        handleReadStatusChange as EventListener
      );
    };
  }, [articleId]);

  return isRead;
}
