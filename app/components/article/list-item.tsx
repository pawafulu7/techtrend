'use client';

import { Clock, TrendingUp, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleListItemProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { ReadingListButton } from '@/app/components/reading-list/ReadingListButton';

export function ArticleListItem({ article, onTagClick }: ArticleListItemProps) {
  const sourceColor = getSourceColor(article.source.name);
  const publishedDate = new Date(article.publishedAt);
  const hoursAgo = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
  const isNew = hoursAgo < 24;

  const handleClick = () => {
    window.location.href = `/articles/${article.id}`;
  };

  return (
    <div 
      onClick={handleClick}
      className={cn(
        "group flex items-center justify-between gap-4 p-3 rounded-lg cursor-pointer",
        "transition-all duration-200 hover:bg-secondary/50",
        "border border-transparent hover:border-border",
        sourceColor.hover
      )}
    >
      {/* 左側: タイトルとタグ */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {isNew && (
            <Badge className="text-xs" variant="destructive">
              <TrendingUp className="h-3 w-3 mr-0.5" />
              New
            </Badge>
          )}
          <h3 className="text-sm font-medium truncate text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {article.title}
          </h3>
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

        {/* 時間 */}
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="hidden sm:inline">
            {hoursAgo < 1 ? 'たった今' : 
             hoursAgo < 24 ? `${hoursAgo}時間前` : 
             formatDate(article.publishedAt)}
          </span>
          <span className="sm:hidden">
            {hoursAgo < 24 ? `${hoursAgo}h` : formatDate(article.publishedAt, true)}
          </span>
        </span>

        {/* アクション（ホバー時表示） */}
        <div className="hidden group-hover:flex items-center gap-1">
          <ReadingListButton 
            article={article} 
            size="sm"
            variant="ghost"
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