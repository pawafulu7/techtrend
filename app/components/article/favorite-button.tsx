'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { loginWithCallback } from '@/lib/routes/auth';
import { useToast } from '@/hooks/use-toast';

interface FavoriteButtonProps {
  articleId: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  showText?: boolean;
  compact?: boolean;
  isFavorited?: boolean;
  onToggleFavorite?: () => void | Promise<void>;
  /** If true, fetch initial favorite status from API on mount (for ISR pages) */
  fetchInitialStatus?: boolean;
}

export function FavoriteButton({
  articleId,
  className,
  size = 'sm',
  showText = false,
  compact = false,
  isFavorited: initialFavorited = false,
  onToggleFavorite,
  fetchInitialStatus = false
}: FavoriteButtonProps) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isToggling, setIsToggling] = useState(false);
  const isControlled = typeof onToggleFavorite === 'function';
  const [uncontrolledFavorited, setUncontrolledFavorited] = useState(initialFavorited);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(fetchInitialStatus && !isControlled);

  const isFavorited = isControlled ? initialFavorited : uncontrolledFavorited;

  // Fetch initial status from API if fetchInitialStatus is true (for ISR pages)
  useEffect(() => {
    if (!fetchInitialStatus) return;
    if (sessionStatus === 'loading') return;
    if (isControlled) return;

    // If not authenticated, no need to fetch
    if (!session?.user?.id) {
      setIsLoadingInitial(false);
      return;
    }

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/favorites/${articleId}`, {
          credentials: 'include',
          cache: 'no-store'
        });
        if (response.ok) {
          const data = await response.json();
          setUncontrolledFavorited(data.isFavorited);
        }
      } catch (error) {
        console.error('Failed to fetch favorite status:', error);
      } finally {
        setIsLoadingInitial(false);
      }
    };

    fetchStatus();
  }, [articleId, fetchInitialStatus, session?.user?.id, sessionStatus, isControlled]);

  // Sync initial value in uncontrolled mode (for non-ISR pages)
  useEffect(() => {
    if (isControlled) return;
    if (fetchInitialStatus) return;
    setUncontrolledFavorited(initialFavorited);
  }, [initialFavorited, fetchInitialStatus, isControlled]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (sessionStatus === 'loading') return;

    if (!session) {
      // 未ログインの場合はログインページへ（現在のページをcallbackUrlとして設定）
      const currentUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
      router.push(loginWithCallback(currentUrl));
      return;
    }

    setIsToggling(true);
    setIsAnimating(true);

    try {
      if (onToggleFavorite) {
        // Controlled mode: optimistic update is handled by parent
        await Promise.resolve(onToggleFavorite());
        return;
      }

      // スタンドアロン使用の場合は直接APIを呼び出す
      // 楽観的更新
      const newState = !isFavorited;
      setUncontrolledFavorited(newState);

      try {
        const response = await fetch(`/api/favorites/${articleId}`, {
          method: newState ? 'POST' : 'DELETE',
        });
        if (!response.ok) {
          // エラー時は元に戻す
          setUncontrolledFavorited(!newState);
          throw new Error('Failed to toggle favorite');
        }
      } catch (error) {
        console.error('Failed to toggle favorite:', error);
        toast({
          title: 'エラー',
          description: 'お気に入りの更新に失敗しました。もう一度お試しください。',
          variant: 'destructive',
        });
      }
    } finally {
      setIsToggling(false);
      setTimeout(() => setIsAnimating(false), 300);
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={isToggling || isLoadingInitial || sessionStatus === 'loading'}
        className={cn(
          "p-1.5 rounded-full transition-all",
          "hover:bg-red-50 dark:hover:bg-red-950",
          isAnimating && "scale-110",
          isFavorited ? "text-red-500 hover:text-red-600" : "text-gray-500 hover:text-red-500",
          isLoadingInitial && "opacity-50",
          className
        )}
        aria-label={isFavorited ? "お気に入りから削除" : "お気に入りに追加"}
        data-testid="favorite-button"
      >
        <Heart
          className={cn(
            "h-4 w-4 transition-colors",
            isFavorited && "fill-red-500",
            (isToggling || isLoadingInitial) && "opacity-50"
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
        disabled={isToggling || isLoadingInitial || sessionStatus === 'loading'}
        className={cn(
        "transition-all",
        isAnimating && "scale-110",
        isFavorited ? "bg-red-500 hover:bg-red-600 text-white" : "hover:text-red-500",
        isLoadingInitial && "opacity-50",
        className
      )}
      data-testid="favorite-button"
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-colors",
          isFavorited ? "fill-white" : "fill-none",
          showText && "mr-2",
          (isToggling || isLoadingInitial) && "opacity-50"
        )}
      />
      {showText && (
        isFavorited ? "お気に入り解除" : "お気に入りに追加"
      )}
    </Button>
  );
}
