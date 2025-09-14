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
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}

export function FavoriteButton({
  articleId,
  className,
  size = 'sm',
  showText = false,
  compact = false,
  isFavorited: parentIsFavorited,
  onToggleFavorite: parentToggleFavorite
}: FavoriteButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();

  // 親からデータが渡されている場合はそれを使用、そうでない場合は個別フックを使用
  const useParentData = parentIsFavorited !== undefined && parentToggleFavorite !== undefined;

  // 個別フックは親データがない場合のみ有効化
  const individualHook = useFavorite(articleId, !useParentData);

  // 使用するデータを決定
  const isFavorited = useParentData ? parentIsFavorited : individualHook.isFavorited;
  const toggleFavorite = useParentData ? parentToggleFavorite : individualHook.toggleFavorite;
  const isToggling = useParentData ? false : individualHook.isToggling;
  const isLoading = useParentData ? false : individualHook.isLoading;

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