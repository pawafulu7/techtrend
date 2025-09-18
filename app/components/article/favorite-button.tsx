'use client';

import { useState, useEffect } from 'react';
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
  isFavorited: initialFavorited = false,
  onToggleFavorite
}: FavoriteButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isToggling, setIsToggling] = useState(false);
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isAnimating, setIsAnimating] = useState(false);

  // プロップスの変更を反映
  useEffect(() => {
    setIsFavorited(initialFavorited);
  }, [initialFavorited]);

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
      // 楽観的更新
      setIsFavorited(!isFavorited);
      onToggleFavorite();
      setTimeout(() => setIsAnimating(false), 300);
    } else {
      // スタンドアロン使用の場合は直接APIを呼び出す
      setIsToggling(true);
      setIsAnimating(true);
      // 楽観的更新
      const newState = !isFavorited;
      setIsFavorited(newState);

      try {
        const response = await fetch(`/api/favorites/${articleId}`, {
          method: newState ? 'POST' : 'DELETE',
        });
        if (!response.ok) {
          // エラー時は元に戻す
          setIsFavorited(!newState);
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
          isFavorited ? "text-red-500 hover:text-red-600" : "text-gray-500 hover:text-red-500",
          className
        )}
        aria-label={isFavorited ? "お気に入りから削除" : "お気に入りに追加"}
        data-testid="favorite-button"
      >
        <Heart
          className={cn(
            "h-4 w-4 transition-colors",
            isFavorited && "fill-red-500",
            isToggling && "opacity-50"
          )}
        />
      </button>
    );
  }

  return (
    <Button
      variant={isFavorited ? "destructive" : "outline"}
      size={size}
      onClick={handleClick}
      disabled={isToggling}
      className={cn(
        "transition-all",
        isAnimating && "scale-110",
        isFavorited ? "bg-red-500 hover:bg-red-600 text-white" : "hover:text-red-500",
        className
      )}
      data-testid="favorite-button"
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-colors",
          isFavorited ? "fill-white" : "fill-none",
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