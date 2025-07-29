'use client';

import { useEffect, useRef } from 'react';
import { analyticsTracker } from '@/lib/analytics/tracking';
import type { ArticleWithRelations } from '@/lib/types/article';

interface ArticleTrackerProps {
  article: ArticleWithRelations;
}

export function ArticleTracker({ article }: ArticleTrackerProps) {
  const hasStartedRef = useRef(false);
  const articleIdRef = useRef(article.id);

  useEffect(() => {
    // 記事が変更された場合の処理
    if (articleIdRef.current !== article.id) {
      // 前の記事の読書を終了
      analyticsTracker.endReading(articleIdRef.current);
      articleIdRef.current = article.id;
      hasStartedRef.current = false;
    }

    // 読書開始
    if (!hasStartedRef.current) {
      analyticsTracker.startReading(article.id, {
        title: article.title,
        tags: article.tags.map(t => t.name),
        source: article.source.name,
        difficulty: article.difficulty || undefined
      });
      hasStartedRef.current = true;
    }

    // ページ離脱時の処理
    const handleBeforeUnload = () => {
      analyticsTracker.endReading(article.id);
    };

    // 可視性変更時の処理
    const handleVisibilityChange = () => {
      if (document.hidden) {
        analyticsTracker.endReading(article.id);
        hasStartedRef.current = false;
      } else if (!hasStartedRef.current) {
        analyticsTracker.startReading(article.id, {
          title: article.title,
          tags: article.tags.map(t => t.name),
          source: article.source.name,
          difficulty: article.difficulty || undefined
        });
        hasStartedRef.current = true;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // コンポーネントアンマウント時に読書終了
      if (hasStartedRef.current) {
        analyticsTracker.endReading(article.id);
      }
    };
  }, [article]);

  // 何も描画しない
  return null;
}