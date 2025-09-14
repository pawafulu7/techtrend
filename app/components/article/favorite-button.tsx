'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFavorite } from '@/app/hooks/use-favorites-batch';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface FavoriteButtonProps {
  articleId: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  showText?: boolean;
  compact?: boolean;
}

export function FavoriteButton({
  articleId,
  className,
  size = 'sm',
  showText = false,
  compact = false
}: FavoriteButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { isFavorited, toggleFavorite, isToggling, isLoading } = useFavorite(articleId);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!session) {
      // 未ログインの場合はログインページへ
      router.push('/auth/signin');
      return;
    }

    setIsAnimating(true);
    toggleFavorite();

    setTimeout(() => setIsAnimating(false), 300);
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={isToggling || isLoading}
        className={cn(
          "p-1.5 rounded-full transition-all",
          "hover:bg-red-50 dark:hover:bg-red-950",
          isAnimating && "scale-110",
          isFavorited && "text-red-500",
          className
        )}
        aria-label={isFavorited ? "お気に入りから削除" : "お気に入りに追加"}
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
      disabled={isToggling || isLoading}
      className={cn(
        "transition-all",
        isAnimating && "scale-110",
        className
      )}
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