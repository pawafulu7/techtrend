'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Clock, TrendingUp, ThumbsUp, GraduationCap, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/date';
import { getDomain } from '@/lib/utils/url';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleCardProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { ReadingListButton } from '@/app/components/reading-list/ReadingListButton';
import { ShareButton } from '@/app/components/article/share-button';

export function ArticleCard({ article }: ArticleCardProps) {
  const [votes, setVotes] = useState(article.userVotes || 0);
  const [hasVoted, setHasVoted] = useState(false);
  const searchParams = useSearchParams();
  const domain = getDomain(article.url);
  const sourceColor = getSourceColor(article.source.name);
  const publishedDate = new Date(article.publishedAt);
  const hoursAgo = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
  const isNew = hoursAgo < 24;

  const handleCardClick = (e: React.MouseEvent) => {
    // ボタンクリックの場合は無視
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    // URLパラメータを保持して記事詳細ページに遷移
    const returnUrl = searchParams.toString() ? `/?${searchParams.toString()}` : '/';
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
    } catch (error) {
      console.error('Failed to vote:', error);
    }
  };

  return (
    <Card 
      onClick={handleCardClick}
      className={cn(
        "group relative overflow-hidden cursor-pointer",
        "transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out",
        "hover:shadow-lg hover:-translate-y-0.5",
        "shadow-sm backdrop-blur-sm",
        "border border-border/20 hover:border-border/40",
        sourceColor.border,
        sourceColor.hover
      )}
      style={{
        boxShadow: '0 2px 8px rgba(100, 100, 200, 0.15)',
        background: 'rgba(255, 255, 255, 0.98)',
        border: '1px solid rgba(200, 200, 255, 0.2)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = '0 8px 24px rgba(100, 100, 200, 0.25)';
        el.style.background = 'rgba(255, 255, 255, 1)';
        el.style.border = '1px solid rgba(200, 200, 255, 0.4)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = '0 2px 8px rgba(100, 100, 200, 0.15)';
        el.style.background = 'rgba(255, 255, 255, 0.98)';
        el.style.border = '1px solid rgba(200, 200, 255, 0.2)';
      }}
    >
      {/* グラデーション背景 */}
      <div className={cn(
        "absolute inset-0 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity duration-300 pointer-events-none",
        "bg-gradient-to-br",
        sourceColor.gradient
      )} />
      
      <CardHeader className="pb-0.5 px-2 sm:px-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            {isNew && (
              <Badge className="mb-1 text-xs" variant="destructive">
                <TrendingUp className="h-3 w-3 mr-0.5 sm:mr-1" />
                <span className="hidden sm:inline">New</span>
                <span className="sm:hidden">新</span>
              </Badge>
            )}
            <h3 className="text-sm font-bold leading-tight line-clamp-2 text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {article.title}
            </h3>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <Badge 
            variant="secondary" 
            className={cn("text-xs font-medium", sourceColor.tag)}
          >
            {article.source.name}
          </Badge>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {hoursAgo < 1 ? 'たった今' : 
             hoursAgo < 24 ? `${hoursAgo}時間前` : 
             formatDate(article.publishedAt)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 py-1.5 px-2 sm:px-3 space-y-1.5">
        {article.summary && (
          <div className="relative group/summary">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-purple-400 rounded-full"></div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed pl-3 font-medium group-hover/summary:text-slate-900 dark:group-hover/summary:text-slate-100 transition-colors">
              {article.summary}
            </p>
          </div>
        )}
        
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
          <ReadingListButton 
            article={article} 
            size="sm"
            variant="ghost"
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