'use client';

import { ArticleCard } from './card';
import { ArticleListItem } from './list-item';
import type { ArticleListProps } from '@/types/components';
import { useReadStatus } from '@/app/hooks/use-read-status';
import { useMemo, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export function ArticleList({ 
  articles, 
  viewMode = 'card',
  onArticleClick 
}: ArticleListProps) {
  // 認証状態を取得
  const { data: session } = useSession();
  
  // 記事IDリストを作成
  const articleIds = useMemo(() => articles.map(a => a.id), [articles]);
  
  // 既読状態を取得
  const { isRead, isLoading, refetch } = useReadStatus(articleIds);
  
  // 強制再レンダリング用のstate
  const [refreshKey, setRefreshKey] = useState(0);
  
  // 既読状態変更イベントをリッスンして再レンダリング
  useEffect(() => {
    const handleReadStatusChanged = () => {
      // 既読状態を再取得して再レンダリング
      refetch();
      setRefreshKey(prev => prev + 1);
    };
    
    window.addEventListener('articles-read-status-changed', handleReadStatusChanged);
    
    return () => {
      window.removeEventListener('articles-read-status-changed', handleReadStatusChanged);
    };
  }, [refetch]);
  
  // 未認証時は全て既読として扱う
  const getReadStatus = (articleId: string) => {
    if (!session?.user) {
      return true; // 未認証時は既読扱い（未読マークを表示しない）
    }
    return isRead(articleId);
  };
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
            key={`${article.id}-${refreshKey}`} 
            article={article}
            articleIndex={index}
            totalArticleCount={articles.length}
            onArticleClick={onArticleClick}
            isRead={isLoading ? true : getReadStatus(article.id)}
          />
        ))}
      </div>
    );
  }

  // カード形式の場合（既存のコード）
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4" data-testid="article-list" key={refreshKey}>
      {articles.map((article) => (
        <ArticleCard 
          key={`${article.id}-${refreshKey}`} 
          article={article}
          onArticleClick={onArticleClick}
          isRead={isLoading ? true : getReadStatus(article.id)}
        />
      ))}
    </div>
  );
}