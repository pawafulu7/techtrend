'use client';

import { useEffect, useRef } from 'react';

interface ViewTrackerProps {
  articleId: string;
}

export function ViewTracker({ articleId }: ViewTrackerProps) {
  const hasRecordedRef = useRef(false);

  useEffect(() => {
    // 重複記録を防ぐ
    if (hasRecordedRef.current) return;
    
    const recordView = async () => {
      try {
        const response = await fetch('/api/article-views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId })
        });
        
        if (response.ok) {
          hasRecordedRef.current = true;
        }
      } catch (error) {
        console.error('Failed to record article view:', error);
      }
    };
    
    recordView();
  }, [articleId]);
  
  return null;
}