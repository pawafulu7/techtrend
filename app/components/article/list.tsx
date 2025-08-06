'use client';

import { ArticleCard } from './card';
import { ArticleListItem } from './list-item';
import type { ArticleListProps } from '@/types/components';

export function ArticleList({ articles, viewMode = 'card' }: ArticleListProps) {
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
      <div className="space-y-2">
        {articles.map((article) => (
          <ArticleListItem key={article.id} article={article} />
        ))}
      </div>
    );
  }

  // カード形式の場合（既存のコード）
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </div>
  );
}