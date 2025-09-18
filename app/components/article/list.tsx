'use client';

import { ArticleCard } from './card';
import { ArticleListItem } from './list-item';
import type { ArticleListProps } from '@/types/components';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export function ArticleList({
  articles: initialArticles,
  viewMode = 'card',
  onArticleClick
}: ArticleListProps) {
  // 認証状態を取得（お気に入り切り替え用）
  const { data: session } = useSession();

  // ローカルで記事データを管理
  const [articles, setArticles] = useState(initialArticles);

  // initialArticlesの変更を反映
  useEffect(() => {
    setArticles(initialArticles);
  }, [initialArticles]);

  // お気に入り切り替え処理
  const handleToggleFavorite = useCallback(async (articleId: string) => {
    if (!session?.user) {
      return;
    }

    // 楽観的更新 - ローカル状態を即座に更新
    setArticles(prev => prev.map(article =>
      article.id === articleId
        ? { ...article, isFavorited: !article.isFavorited }
        : article
    ));

    try {
      // 現在のお気に入り状態を確認
      const article = articles.find(a => a.id === articleId);
      const currentlyFavorited = article?.isFavorited ?? false;

      // お気に入り状態に応じてPOSTまたはDELETEを送信
      const response = await fetch(`/api/favorites/${articleId}`, {
        method: currentlyFavorited ? 'DELETE' : 'POST',
      });

      if (!response.ok) {
        // エラー時は元に戻す
        setArticles(prev => prev.map(article =>
          article.id === articleId
            ? { ...article, isFavorited: currentlyFavorited }
            : article
        ));
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      // エラー時は元に戻す
      const article = articles.find(a => a.id === articleId);
      const currentlyFavorited = article?.isFavorited ?? false;
      setArticles(prev => prev.map(article =>
        article.id === articleId
          ? { ...article, isFavorited: currentlyFavorited }
          : article
      ));
    }
  }, [session, articles]);
  
  // 既読状態変更イベントをリッスンして記事データを更新
  useEffect(() => {
    const handleReadStatusChanged = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.articleIds) {
        // 既読状態が変更された記事のIDリストを取得
        const { articleIds, isRead } = customEvent.detail;
        setArticles(prev => prev.map(article =>
          articleIds.includes(article.id)
            ? { ...article, isRead }
            : article
        ));
      }
    };

    window.addEventListener('articles-read-status-changed', handleReadStatusChanged);

    return () => {
      window.removeEventListener('articles-read-status-changed', handleReadStatusChanged);
    };
  }, []);
  
  if (articles.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">記事が見つかりませんでした</p>
      </div>
    );
  }

  // リスト形式の場合
  if (viewMode === 'list') {
    return (
      <div className="space-y-2" data-testid="article-list">
        {articles.map((article, index) => (
          <ArticleListItem
            key={`${article.id}-${index}`}
            article={article}
            articleIndex={index}
            totalArticleCount={articles.length}
            onArticleClick={onArticleClick}
            isRead={article.isRead ?? true}
          />
        ))}
      </div>
    );
  }

  // カード形式の場合
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4" data-testid="article-list">
      {articles.map((article, index) => (
        <ArticleCard
          key={`${article.id}-${index}`}
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