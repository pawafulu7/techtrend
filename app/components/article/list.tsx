'use client';

import { ArticleCard } from './card';
import { ArticleListItem } from './list-item';
import type { ArticleListProps } from '@/types/components';

export function ArticleList({ 
  articles, 
  viewMode = 'card',
  onArticleClick 
}: ArticleListProps) {
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
            key={article.id} 
            article={article}
            articleIndex={index}
            totalArticleCount={articles.length}
            onArticleClick={onArticleClick}
          />
        ))}
      </div>
    );
  }

  // カード形式の場合（既存のコード）
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4" data-testid="article-list">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </div>
  );
}