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
  const [isRead, setIsRead] = useState(initialIsRead);

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

  useEffect(() => {
    setIsRead(initialIsRead);
  }, [initialIsRead]);

  return isRead;
}
