'use client';

import { useState, useEffect } from 'react';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsInReadingList, useReadingListActions } from '@/lib/reading-list/hooks';
import type { ArticleWithRelations } from '@/lib/types/article';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ReadingListButtonProps {
  article: ArticleWithRelations;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'ghost' | 'outline' | 'default';
  showText?: boolean;
  className?: string;
}

export function ReadingListButton({
  article,
  size = 'sm',
  variant = 'ghost',
  showText = false,
  className
}: ReadingListButtonProps) {
  const { isInList, loading: checkLoading } = useIsInReadingList(article.id);
  const { loading: actionLoading, addToReadingList, removeFromReadingList } = useReadingListActions();
  const [optimisticState, setOptimisticState] = useState(isInList);
  
  useEffect(() => {
    setOptimisticState(isInList);
  }, [isInList]);

  const loading = checkLoading || actionLoading;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (loading) return;

    // 楽観的更新
    const newState = !optimisticState;
    setOptimisticState(newState);

    try {
      if (newState) {
        await addToReadingList(article);
      } else {
        await removeFromReadingList(article.id);
      }
    } catch (error) {
      // エラー時は元に戻す
      setOptimisticState(!newState);
      console.error('Failed to update reading list:', error);
    }
  };

  const buttonContent = (
    <>
      {loading ? (
        <Loader2 className={cn("animate-spin", size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} />
      ) : optimisticState ? (
        <BookmarkCheck className={cn(size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} />
      ) : (
        <Bookmark className={cn(size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} />
      )}
      {showText && (
        <span className={cn(size === 'sm' ? 'ml-1' : 'ml-2')}>
          {optimisticState ? '保存済み' : '後で読む'}
        </span>
      )}
    </>
  );

  const button = (
    <Button
      variant={optimisticState ? 'default' : variant}
      size={size}
      onClick={handleClick}
      disabled={loading}
      className={cn(
        optimisticState && variant === 'ghost' && 'bg-primary/10 hover:bg-primary/20',
        className
      )}
    >
      {buttonContent}
    </Button>
  );

  if (showText) {
    return button;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {button}
        </TooltipTrigger>
        <TooltipContent>
          <p>{optimisticState ? '読書リストから削除' : '読書リストに追加'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}