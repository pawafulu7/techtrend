'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Clock, TrendingUp, ExternalLink, Eye } from 'lucide-react';
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
  onArticleClick,
  isRead: initialIsRead = true
}: ArticleListItemProps & { isRead?: boolean }) {
  const [isRead, setIsRead] = useState(initialIsRead);
  const router = useRouter();

  // Listen for read status changes
  useEffect(() => {
    const handleReadStatusChange = (event: CustomEvent) => {
      if (event.detail.articleId === article.id) {
        setIsRead(event.detail.isRead);
      }
    };

    window.addEventListener('article-read-status-changed', handleReadStatusChange as EventListener);

    return () => {
      window.removeEventListener('article-read-status-changed', handleReadStatusChange as EventListener);
    };
  }, [article.id]);

  // Update isRead when prop changes
  useEffect(() => {
    setIsRead(initialIsRead);
  }, [initialIsRead]);
  const searchParams = useSearchParams();
  const sourceColor = getSourceColor(article.source.name);
  const publishedDate = new Date(article.publishedAt);
  const hoursAgo = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
  const isNew = hoursAgo < 24;

  const handleClick = (_e: React.MouseEvent) => {
    // 親コンポーネントのスクロール位置保存処理を呼び出し
    if (onArticleClick) {
      onArticleClick(article.id);
    }

    // URLパラメータを保持して記事詳細ページに遷移
    const params = new URLSearchParams(searchParams.toString());

    // returningパラメータは除外（記事詳細からの戻りを示すパラメータなので）
    params.delete('returning');

    // 記事一覧に戻る時用にreturningパラメータを追加
    params.set('returning', '1');

    // 現在のフィルター状態を保持したURLを生成
    const returnUrl = `/?${params.toString()}`;
    const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;

    // 遷移を実行
    router.push(articleUrl);
  };

  return (
    <div 
      id={`article-${article.id}`}
      data-article-id={article.id}
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
            {!isRead && (
              <Badge className="text-xs flex-shrink-0 bg-blue-500 hover:bg-blue-600 text-white">
                <Eye className="h-3 w-3 mr-0.5" />
                未読
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
