'use client';

import { ThumbsUp, ExternalLink, Clock } from 'lucide-react';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { FavoriteButton } from '@/app/components/article/favorite-button';

interface ArticleCardActionsProps {
  articleId: string;
  articleUrl: string;
  votes: number;
  hasVoted: boolean;
  onVote: (e: React.MouseEvent) => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  readingTime: number | null;
  contentLength: number;
}

export function ArticleCardActions({
  articleId,
  articleUrl,
  votes,
  hasVoted,
  onVote,
  isFavorited,
  onToggleFavorite,
  readingTime,
  contentLength,
}: ArticleCardActionsProps) {
  return (
    <div className="mt-auto flex items-center justify-between pt-1">
      <FavoriteButton
        articleId={articleId}
        className="h-11 px-4 min-w-[44px] min-h-[44px]"
        isFavorited={isFavorited}
        onToggleFavorite={onToggleFavorite}
      />
      <div className="flex items-center gap-3">
        {readingTime && contentLength > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{readingTime}分 / {contentLength.toLocaleString('ja-JP')}字</span>
          </span>
        )}
        <ButtonV2
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            window.open(articleUrl, '_blank', 'noopener,noreferrer');
          }}
          className="h-11 px-4 text-xs min-w-[44px] min-h-[44px]"
        >
          <ExternalLink className="h-4 w-4 mr-1" />
          元記事
        </ButtonV2>
        {votes > 0 && <span className="text-xs text-muted-foreground">{votes}</span>}
        <ButtonV2
          variant={hasVoted ? 'primary' : 'outline'}
          size="sm"
          iconOnly
          onClick={onVote}
          disabled={hasVoted}
          data-testid="vote-button"
          aria-pressed={hasVoted}
          className="h-11 w-11 min-w-[44px] min-h-[44px]"
        >
          <ThumbsUp className="h-4 w-4" />
        </ButtonV2>
      </div>
    </div>
  );
}
