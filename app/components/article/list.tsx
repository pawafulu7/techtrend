'use client';

import { ArticleCard } from './card';
import { ArticleListItem } from './list-item';
import { CompactCard } from './compact-card';
import type { ArticleListProps } from '@/types/components';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';

// 既読状態変更イベントの型定義
interface ArticleReadStatusChangedDetail {
  articleIds: string[];
  isRead: boolean;
}

const GRID_CLASS =
  'grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4 2xl:grid-cols-5';

export function ArticleList({
  articles: initialArticles,
  viewMode = 'card',
  onArticleClick,
  className,
}: ArticleListProps) {
  // 認証状態を取得（お気に入り切り替え用）
  const { data: session } = useSession();

  // ローカルで記事データを管理
  const [articles, setArticles] = useState(initialArticles);

  // 競合状態を防ぐため、最新のarticles状態をrefで保持
  const articlesRef = useRef(articles);
  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  // initialArticlesの変更を反映
  useEffect(() => {
    setArticles(initialArticles);
  }, [initialArticles]);

  // お気に入り切り替え処理
  const handleToggleFavorite = useCallback(
    async (articleId: string) => {
      if (!session?.user) {
        return;
      }

      // 現在のお気に入り状態を確認（楽観的更新前にrefから取得）
      const article = articlesRef.current.find((a) => a.id === articleId);
      if (!article) return;
      const currentlyFavorited = article.isFavorited ?? false;

      const revertFavorite = () => {
        setArticles((prev) =>
          prev.map((a) =>
            a.id === articleId ? { ...a, isFavorited: currentlyFavorited } : a
          )
        );
      };

      // 楽観的更新 - ローカル状態を即座に更新
      setArticles((prev) =>
        prev.map((a) =>
          a.id === articleId ? { ...a, isFavorited: !currentlyFavorited } : a
        )
      );

      try {
        // お気に入り状態に応じてPOSTまたはDELETEを送信
        const response = await fetch(`/api/favorites/${articleId}`, {
          method: currentlyFavorited ? 'DELETE' : 'POST',
        });

        if (response.ok) {
          // API成功時にイベント発火（React Queryキャッシュ同期用）
          window.dispatchEvent(
            new CustomEvent('article-favorite-changed', {
              detail: {
                articleId,
                isFavorited: !currentlyFavorited,
                timestamp: Date.now(),
              },
            })
          );
        } else {
          revertFavorite();
        }
      } catch (error) {
        console.error('Failed to toggle favorite:', error);
        revertFavorite();
      }
    },
    [session]
  );

  // 既読状態変更イベントをリッスンして記事データを更新
  useEffect(() => {
    const handleReadStatusChanged = (event: Event) => {
      const customEvent = event as CustomEvent<ArticleReadStatusChangedDetail>;
      if (customEvent.detail?.articleIds) {
        // 既読状態が変更された記事のIDリストを取得
        const { articleIds, isRead } = customEvent.detail;
        setArticles((prev) =>
          prev.map((a) => (articleIds.includes(a.id) ? { ...a, isRead } : a))
        );
      }
    };

    window.addEventListener(
      'articles-read-status-changed',
      handleReadStatusChanged
    );

    return () => {
      window.removeEventListener(
        'articles-read-status-changed',
        handleReadStatusChanged
      );
    };
  }, []);

  // 一括既読イベントをリッスン
  useEffect(() => {
    const handleBulkRead = (event: Event) => {
      const customEvent = event as CustomEvent<{ isRead: boolean }>;
      if (customEvent.detail?.isRead) {
        // 全記事を既読に更新
        setArticles((prev) => prev.map((a) => ({ ...a, isRead: true })));
      }
    };

    window.addEventListener('articles-bulk-read', handleBulkRead);

    return () => {
      window.removeEventListener('articles-bulk-read', handleBulkRead);
    };
  }, []);

  if (articles.length === 0) {
    return (
      <div className={cn('py-12 text-center', className)}>
        <p className="text-muted-foreground">記事が見つかりませんでした</p>
      </div>
    );
  }

  // リスト形式の場合
  if (viewMode === 'list') {
    return (
      <div className={cn('space-y-2', className)} data-testid="article-list">
        {articles.map((article, index) => (
          <ArticleListItem
            key={article.id}
            article={article}
            articleIndex={index}
            totalArticleCount={articles.length}
            onArticleClick={onArticleClick}
            isRead={article.isRead ?? true}
            isFavorited={article.isFavorited ?? false}
            onToggleFavorite={() => handleToggleFavorite(article.id)}
          />
        ))}
      </div>
    );
  }

  // コンパクト形式の場合
  if (viewMode === 'compact') {
    return (
      <div className={cn(GRID_CLASS, className)} data-testid="article-list">
        {articles.map((article) => (
          <CompactCard
            key={article.id}
            article={article}
            onArticleClick={onArticleClick}
            isRead={article.isRead ?? true}
            isFavorited={article.isFavorited ?? false}
            onToggleFavorite={() => handleToggleFavorite(article.id)}
          />
        ))}
      </div>
    );
  }

  // カード形式の場合
  return (
    <div className={cn(GRID_CLASS, className)} data-testid="article-list">
      {articles.map((article) => (
        <ArticleCard
          key={article.id}
          article={article}
          onArticleClick={onArticleClick}
          isRead={article.isRead ?? true}
          isFavorited={article.isFavorited ?? false}
          onToggleFavorite={() => handleToggleFavorite(article.id)}
        />
      ))}
    </div>
  );
}
