'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TrendingUp, ThumbsUp, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateWithTime } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleCardProps } from '@/types/components';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/article/favorite-button';
import { ShareButton } from '@/app/components/article/share-button';
import { ArticleThumbnail } from '@/app/components/common/optimized-image';
import { CategoryClassifier } from '@/lib/services/category-classifier';

export function ArticleCard({ article, onArticleClick, isRead = false }: ArticleCardProps & { isRead?: boolean }) {
  const [votes, setVotes] = useState(article.userVotes || 0);
  const [hasVoted, setHasVoted] = useState(false);
  
  // サムネイル表示判定ロジック
  const shouldShowThumbnail = (): boolean => {
    // Speaker DeckとDocswellは常にサムネイル表示（スライドサービス）
    if (article.source.name === 'Speaker Deck' || article.source.name === 'Docswell') {
      return !!article.thumbnail;
    }
    
    // 薄いコンテンツ（300文字未満）でサムネイルがある場合
    if (article.content && article.content.length < 300 && article.thumbnail) {
      return true;
    }
    
    // 品質スコアが低い（30未満）でサムネイルがある場合
    if (article.qualityScore && article.qualityScore < 30 && article.thumbnail) {
      return true;
    }
    
    return false;
  };
  
  const showThumbnail = shouldShowThumbnail();
  
  const searchParams = useSearchParams();
  const sourceColor = getSourceColor(article.source.name);
  const publishedDate = new Date(article.publishedAt);
  const hoursAgo = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
  const isNew = hoursAgo < 24;

  const handleCardClick = (e: React.MouseEvent) => {
    // ボタンクリックの場合は無視
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    // 親コンポーネントのコールバックを実行
    onArticleClick?.();
    // URLパラメータを保持して記事詳細ページに遷移
    const params = new URLSearchParams(searchParams.toString());
    
    // returningパラメータは除外（記事詳細からの戻りを示すパラメータなので）
    params.delete('returning');
    
    // 記事一覧に戻る時用にreturningパラメータを追加
    params.set('returning', '1');
    
    // 現在のフィルター状態を保持したURLを生成
    const returnUrl = `/?${params.toString()}`;
    const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;
    window.location.href = articleUrl;
  };

  const handleVote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasVoted) return;

    try {
      const response = await fetch(`/api/articles/${article.id}/vote`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setVotes(data.votes);
        setHasVoted(true);
      }
    } catch {
    }
  };

  return (
    <Card 
      data-testid="article-card"
      data-article-id={article.id}
      onClick={handleCardClick}
      className={cn(
        "group relative overflow-hidden cursor-pointer",
        "transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out",
        "hover:shadow-lg hover:-translate-y-0.5",
        "shadow-sm backdrop-blur-sm",
        "border border-border/20 hover:border-border/40",
        // ダークモード対応の背景色
        "bg-white/98 dark:bg-gray-800/98",
        "hover:bg-white dark:hover:bg-gray-750",
        // ダークモード対応のシャドウ
        "shadow-[0_2px_8px_rgba(100,100,200,0.15)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
        "hover:shadow-[0_8px_24px_rgba(100,100,200,0.25)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]",
        // ダークモード対応のボーダー
        "border-blue-200/20 dark:border-gray-700/40",
        "hover:border-blue-200/40 dark:hover:border-gray-600/60",
        sourceColor.border,
        sourceColor.hover
      )}
    >
      {/* グラデーション背景 */}
      <div className={cn(
        "absolute inset-0 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity duration-300 pointer-events-none",
        "bg-gradient-to-br",
        sourceColor.gradient
      )} />
      
      <CardHeader className="pb-1 px-2.5 sm:px-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1 mb-1">
              {isNew && (
                <Badge className="text-xs" variant="destructive">
                  <TrendingUp className="h-3 w-3 mr-0.5 sm:mr-1" />
                  <span className="hidden sm:inline">New</span>
                  <span className="sm:hidden">新</span>
                </Badge>
              )}
              {!isRead && (
                <Badge 
                  className="text-xs bg-blue-500 hover:bg-blue-600 text-white"
                  data-testid="unread-badge"
                >
                  <Eye className="h-3 w-3 mr-0.5" />
                  <span className="hidden sm:inline">未読</span>
                  <span className="sm:hidden">未</span>
                </Badge>
              )}
            </div>
            <h3 className={cn(
              "text-base font-bold leading-tight line-clamp-2 transition-colors",
              "text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400",
              isRead && "opacity-70"
            )}>
              {article.title}
            </h3>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
          <Badge 
            variant="secondary" 
            className={cn("text-xs font-medium", sourceColor.tag)}
          >
            {article.source.name}
          </Badge>
          {article.category && (
            <Badge 
              variant="outline" 
              className="text-xs font-medium cursor-pointer hover:bg-secondary"
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = `/?category=${encodeURIComponent(article.category!)}`;
              }}
            >
              {CategoryClassifier.getCategoryLabel(article.category)}
            </Badge>
          )}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span>📅 {formatDateWithTime(article.publishedAt)}</span>
            <span>📥 {formatDateWithTime(article.createdAt)}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 py-2 px-2.5 sm:px-3 space-y-2">
        {/* サムネイル表示条件に基づいて表示を切り替え */}
        {showThumbnail ? (
          <ArticleThumbnail 
            src={article.thumbnail!} 
            alt={article.title}
            priority={false}
            className="rounded-md hover:scale-105 transition-transform duration-300"
          />
        ) : article.summary ? (
          <div className="relative group/summary">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 to-purple-300 rounded-full opacity-50"></div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed pl-3 group-hover/summary:text-gray-700 dark:group-hover/summary:text-gray-200 transition-colors">
              {article.summary}
            </p>
          </div>
        ) : null}
        
        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-xs px-2 py-0 h-5 cursor-pointer hover:bg-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = `/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`;
                }}
              >
                {tag.name}
              </Badge>
            ))}
            {article.tags.length > 2 && (
              <span className="text-xs text-muted-foreground">+{article.tags.length - 2}</span>
            )}
          </div>
        )}
        
        {/* アクションボタン */}
        <div className="flex items-center justify-between pt-1">
          <FavoriteButton 
            articleId={article.id} 
            className="h-8 px-3"
          />
          <div className="flex items-center gap-1">
            <ShareButton
              title={article.title}
              url={article.url}
              size="sm"
              variant="ghost"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                window.open(article.url, '_blank', 'noopener,noreferrer');
              }}
              className="h-5 px-1.5 text-xs hover:bg-secondary"
              title="元記事を開く"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
            <Button
              variant={hasVoted ? "default" : "outline"}
              size="sm"
              onClick={handleVote}
              disabled={hasVoted}
              data-testid="vote-button"
              className={cn(
                "h-5 px-1.5 text-xs",
                hasVoted && "bg-green-600 hover:bg-green-600"
              )}
            >
              <ThumbsUp className={cn("h-3 w-3", votes > 0 && "mr-1")} />
              {votes > 0 && votes}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}