'use client';

import { useState } from 'react';
import { Clock, TrendingUp, ThumbsUp, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/date';
import { getDomain } from '@/lib/utils/url';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleWithRelations } from '@/lib/types/article';
import { cn } from '@/lib/utils';

interface ArticleCardProps {
  article: ArticleWithRelations;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const [votes, setVotes] = useState(article.userVotes || 0);
  const [hasVoted, setHasVoted] = useState(false);
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
    window.open(article.url, '_blank', 'noopener,noreferrer');
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
        "group relative overflow-hidden transition-all duration-300 cursor-pointer",
        "hover:shadow-lg hover:-translate-y-1",
        sourceColor.border,
        sourceColor.hover
      )}
    >
      {/* グラデーション背景 */}
      <div className={cn(
        "absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none",
        "bg-gradient-to-br",
        sourceColor.gradient
      )} />
      
      <CardHeader className="pb-1 px-3 sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            {isNew && (
              <Badge className="mb-1 text-xs" variant="destructive">
                <TrendingUp className="h-3 w-3 mr-0.5 sm:mr-1" />
                <span className="hidden sm:inline">New</span>
                <span className="sm:hidden">新</span>
              </Badge>
            )}
            <h3 className="text-sm font-semibold leading-tight line-clamp-2 hover:text-primary transition-colors">
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
          {article.difficulty && (
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs font-medium",
                article.difficulty === 'beginner' && "bg-green-50 text-green-700 border-green-200",
                article.difficulty === 'intermediate' && "bg-blue-50 text-blue-700 border-blue-200",
                article.difficulty === 'advanced' && "bg-purple-50 text-purple-700 border-purple-200"
              )}
            >
              <GraduationCap className="h-3 w-3 mr-1" />
              {article.difficulty === 'beginner' && '初級'}
              {article.difficulty === 'intermediate' && '中級'}
              {article.difficulty === 'advanced' && '上級'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 py-1 px-3 sm:px-4 space-y-2">
        {article.summary && (
          <p className="text-xs text-muted-foreground leading-normal">
            {article.summary}
          </p>
        )}
        
        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-xs px-2 py-0 h-5 cursor-pointer hover:bg-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = `/?tag=${encodeURIComponent(tag.name)}`;
                }}
              >
                {tag.name}
              </Badge>
            ))}
            {article.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">+{article.tags.length - 3}</span>
            )}
          </div>
        )}
        
        {/* 役立ったボタン */}
        <div className="flex items-center justify-end pt-1">
          <Button
            variant={hasVoted ? "default" : "outline"}
            size="sm"
            onClick={handleVote}
            disabled={hasVoted}
            className={cn(
              "h-6 px-2 text-xs",
              hasVoted && "bg-green-600 hover:bg-green-600"
            )}
          >
            <ThumbsUp className={cn("h-3 w-3", votes > 0 && "mr-1")} />
            {votes > 0 && votes}
          </Button>
        </div>
      </CardContent>

    </Card>
  );
}