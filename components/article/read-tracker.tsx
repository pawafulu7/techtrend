'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ReadTrackerProps {
  articleId: string;
}

export function ReadTracker({ articleId }: ReadTrackerProps) {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user?.id || !articleId) return;

    // Mark article as read
    const markAsRead = async () => {
      try {
        await fetch('/api/articles/read-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId })
        });
      } catch (error) {
      }
    };

    // Delay slightly to ensure the page has loaded
    const timer = setTimeout(markAsRead, 500);
    return () => clearTimeout(timer);
  }, [articleId, session?.user?.id]);

  return null;
}