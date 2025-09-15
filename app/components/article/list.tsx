'use client';

import { ArticleCard } from './card';
import { ArticleListItem } from './list-item';
import type { ArticleListProps } from '@/types/components';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export function ArticleList({ 
  articles, 
  viewMode = 'card',
  onArticleClick 
}: ArticleListProps) {
  // 認証状態を取得（お気に入り切り替え用）
  const { data: session } = useSession();
  
  // 強制再レンダリング用のstate
  const [refreshKey, setRefreshKey] = useState(0);
  
  // お気に入り切り替え処理
  const handleToggleFavorite = useCallback(async (articleId: string) => {
    if (!session?.user) {
      return;
    }
    
    try {
      const response = await fetch(`/api/favorites/${articleId}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        // 成功時は再レンダリングをトリガー
        setRefreshKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  }, [session]);
  
  // 既読状態変更イベントをリッスンして再レンダリング
  useEffect(() => {
    const handleReadStatusChanged = () => {
      // 再レンダリングをトリガー
      setRefreshKey(prev => prev + 1);
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
      <div className="space-y-2" data-testid="article-list" key={refreshKey}>
        {articles.map((article, index) => (
          <ArticleListItem
            key={`${article.id}-${index}-${refreshKey}`}
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
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4" data-testid="article-list" key={refreshKey}>
      {articles.map((article, index) => (
        <ArticleCard
          key={`${article.id}-${index}-${refreshKey}`}
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