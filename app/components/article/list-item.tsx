'use client';

import { useSearchParams } from 'next/navigation';
import { Clock, TrendingUp, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateWithTime } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleListItemProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/article/favorite-button';

export function ArticleListItem({ 
  article, 
  onTagClick, 
  onArticleClick 
}: ArticleListItemProps) {
  const searchParams = useSearchParams();
  const sourceColor = getSourceColor(article.source.name);
  const publishedDate = new Date(article.publishedAt);
  const hoursAgo = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
  const isNew = hoursAgo < 24;

  const handleClick = () => {
    // 親コンポーネントのコールバックを実行
    onArticleClick?.();
    
    // URLパラメータを保持して記事詳細ページに遷移
    // returningパラメータを追加して、戻ってきたことを示す
    const params = new URLSearchParams(searchParams.toString());
    
    // 既存のreturningパラメータがあれば削除（重複防止）
    if (params.has('returning')) {
      params.delete('returning');
    }
    // returningパラメータを追加
    params.set('returning', '1');
    
    const returnUrl = `/?${params.toString()}`;
    const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;
    window.location.href = articleUrl;
  };

  return (
    <div 
      onClick={handleClick}
      className={cn(
        "group flex items-center justify-between gap-4 p-3 rounded-lg cursor-pointer",
        "bg-white dark:bg-gray-800/50",
        "transition-all duration-200",
        "hover:bg-gray-50 dark:hover:bg-gray-700/50",
        "border border-gray-200 dark:border-gray-700",
        "hover:border-gray-300 dark:hover:border-gray-600",
        "hover:shadow-sm",
        sourceColor.hover
      )}
    >
      {/* 左側: タイトルとタグ */}
      <div className="flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isNew && (
              <Badge className="text-xs flex-shrink-0" variant="destructive">
                <TrendingUp className="h-3 w-3 mr-0.5" />
                New
              </Badge>
            )}
            <h3 className="text-sm font-medium line-clamp-1 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              {article.title}
            </h3>
          </div>
          {/* 要約表示 */}
          {article.summary && (
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mt-0.5">
              {article.summary}
            </p>
          )}
        </div>
        
        {/* タグ（デスクトップのみ） */}
        {article.tags && article.tags.length > 0 && (
          <div className="hidden sm:flex flex-wrap gap-1 mt-1">
            {article.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-xs px-1.5 py-0 h-5 cursor-pointer hover:bg-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTagClick) {
                    onTagClick(tag.name);
                  } else {
                    window.location.href = `/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`;
                  }
                }}
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* 右側: メタ情報とアクション */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* ソースバッジ */}
        <Badge 
          variant="secondary" 
          className={cn("text-xs font-medium", sourceColor.tag)}
        >
          {article.source.name}
        </Badge>

        {/* 時間表示 - デスクトップでは配信・取込両方、モバイルでは配信のみ */}
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {/* デスクトップ: 配信と取込を表示 */}
          <div className="hidden sm:flex flex-col gap-0.5">
            <span className="flex items-center gap-1">
              <span>📅</span>
              <span>{formatDateWithTime(article.publishedAt)}</span>
            </span>
            <span className="flex items-center gap-1">
              <span>📥</span>
              <span>{formatDateWithTime(article.createdAt)}</span>
            </span>
          </div>
          {/* モバイル: 配信日時のみ表示 */}
          <span className="flex sm:hidden items-center gap-1">
            <Clock className="h-3 w-3" />
            {hoursAgo < 24 ? `${hoursAgo}h` : formatDate(article.publishedAt)}
          </span>
        </div>

        {/* アクション（ホバー時表示） */}
        <div className="hidden group-hover:flex items-center gap-1">
          <FavoriteButton 
            articleId={article.id} 
            className="h-7 w-7 p-0"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, '_blank', 'noopener,noreferrer');
            }}
            className="h-7 w-7 p-0"
            title="元記事を開く"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}