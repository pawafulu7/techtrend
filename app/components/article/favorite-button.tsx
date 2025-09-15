'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface FavoriteButtonProps {
  articleId: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  showText?: boolean;
  compact?: boolean;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}

export function FavoriteButton({
  articleId,
  className,
  size = 'sm',
  showText = false,
  compact = false,
  isFavorited = false,
  onToggleFavorite
}: FavoriteButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isToggling, setIsToggling] = useState(false);

  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!session) {
      // 未ログインの場合はログインページへ
      router.push('/auth/signin');
      return;
    }

    if (onToggleFavorite) {
      setIsAnimating(true);
      onToggleFavorite();
      setTimeout(() => setIsAnimating(false), 300);
    } else {
      // スタンドアロン使用の場合は直接APIを呼び出す
      setIsToggling(true);
      setIsAnimating(true);
      try {
        const response = await fetch(`/api/favorites/${articleId}`, {
          method: 'POST',
        });
        if (!response.ok) {
          throw new Error('Failed to toggle favorite');
        }
      } catch (error) {
        console.error('Failed to toggle favorite:', error);
      } finally {
        setIsToggling(false);
        setTimeout(() => setIsAnimating(false), 300);
      }
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={isToggling}
        className={cn(
          "p-1.5 rounded-full transition-all",
          "hover:bg-red-50 dark:hover:bg-red-950",
          isAnimating && "scale-110",
          isFavorited && "text-red-500",
          className
        )}
        aria-label={isFavorited ? "お気に入りから削除" : "お気に入りに追加"}
        data-testid="favorite-button"
      >
        <Heart
          className={cn(
            "h-4 w-4",
            isFavorited && "fill-current",
            isToggling && "opacity-50"
          )}
        />
      </button>
    );
  }

  return (
    <Button
      variant={isFavorited ? "default" : "outline"}
      size={size}
      onClick={handleClick}
      disabled={isToggling}
      className={cn(
        "transition-all",
        isAnimating && "scale-110",
        className
      )}
      data-testid="favorite-button"
    >
      <Heart
        className={cn(
          "h-4 w-4",
          isFavorited && "fill-current",
          showText && "mr-2",
          isToggling && "opacity-50"
        )}
      />
      {showText && (
        isFavorited ? "お気に入り解除" : "お気に入りに追加"
      )}
    </Button>
  );
}