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
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { useIsNewArticle } from '@/app/components/common/relative-time';
export function ArticleListItem({
  article,
  onTagClick,
  onArticleClick,
  isRead: initialIsRead = true,
  isFavorited = false,
  onToggleFavorite,
}: ArticleListItemProps) {
  const [isRead, setIsRead] = useState(initialIsRead);
  const router = useRouter();

  // Listen for read status changes
  useEffect(() => {
    const handleReadStatusChange = (event: CustomEvent) => {
      if (event.detail.articleId === article.id) {
        setIsRead(event.detail.isRead);
      }
    };

    window.addEventListener(
      'article-read-status-changed',
      handleReadStatusChange as EventListener
    );

    return () => {
      window.removeEventListener(
        'article-read-status-changed',
        handleReadStatusChange as EventListener
      );
    };
  }, [article.id]);

  // Update isRead when prop changes
  useEffect(() => {
    setIsRead(initialIsRead);
  }, [initialIsRead]);

  // Note: Use hook and state to avoid Date.now() during render (React Compiler purity rule)
  const isNew = useIsNewArticle(article.publishedAt, 24) ?? false;
  const [hoursAgo, setHoursAgo] = useState<number | null>(null);
  useEffect(() => {
    const publishedDate = new Date(article.publishedAt);
    setHoursAgo(
      Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60))
    );
  }, [article.publishedAt]);

  const searchParams = useSearchParams();
  const sourceColor = getSourceColor(article.source?.name || 'Unknown');

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
        'group flex cursor-pointer items-center justify-between gap-4 rounded-lg p-3',
        'bg-white dark:bg-gray-800/50',
        'transition-all duration-200',
        'hover:bg-gray-50 dark:hover:bg-gray-700/50',
        'border border-gray-200 dark:border-gray-700',
        'hover:border-gray-300 dark:hover:border-gray-600',
        'hover:shadow-sm',
        sourceColor.hover
      )}
    >
      {/* 左側: タイトルとタグ */}
      <div className="min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isNew && (
              <Badge className="flex-shrink-0 text-xs" variant="destructive">
                <TrendingUp className="mr-0.5 h-3 w-3" />
                New
              </Badge>
            )}
            {!isRead && (
              <Badge className="flex-shrink-0 bg-blue-500 text-xs text-white hover:bg-blue-600">
                <Eye className="mr-0.5 h-3 w-3" />
                未読
              </Badge>
            )}
            <h3 className="line-clamp-1 text-sm font-medium text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              {article.translatedTitle || article.title}
            </h3>
          </div>
          {/* 要約表示 */}
          {article.summary && (
            <p className="mt-0.5 line-clamp-1 text-xs text-gray-600 dark:text-gray-400">
              {article.summary}
            </p>
          )}
        </div>

        {/* タグ（デスクトップのみ） */}
        {article.tags && article.tags.length > 0 && (
          <div className="mt-1 hidden flex-wrap gap-1 sm:flex">
            {article.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="hover:bg-secondary h-5 cursor-pointer px-1.5 py-0 text-xs"
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
      <div className="flex flex-shrink-0 items-center gap-2">
        {/* ソースバッジ */}
        <Badge
          variant="secondary"
          className={cn('text-xs font-medium', sourceColor.tag)}
        >
          {article.source?.name || 'Unknown'}
        </Badge>

        {/* 時間表示 - デスクトップでは配信・取込両方、モバイルでは配信のみ */}
        <div className="text-muted-foreground flex flex-col gap-0.5 text-xs">
          {/* デスクトップ: 配信と取込を表示 */}
          <div className="hidden flex-col gap-0.5 sm:flex">
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
          <span className="flex items-center gap-1 sm:hidden">
            <Clock className="h-3 w-3" />
            {hoursAgo !== null && hoursAgo < 24
              ? `${hoursAgo}h`
              : formatDate(article.publishedAt)}
          </span>
        </div>

        {/* アクション（ホバー時表示） */}
        <div className="hidden items-center gap-1 group-hover:flex">
          <FavoriteButton
            articleId={article.id}
            compact
            isFavorited={isFavorited}
            onToggleFavorite={onToggleFavorite}
            className="h-11 min-h-[44px] w-11 min-w-[44px]"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, '_blank', 'noopener,noreferrer');
            }}
            className="h-11 min-h-[44px] w-11 min-w-[44px] p-0"
            title="元記事を開く"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
