'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui-v2/button-v2';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth/auth-client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { loginWithCallback } from '@/lib/routes/auth';
import { useToast } from '@/hooks/use-toast';

interface FavoriteButtonProps {
  articleId: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  showText?: boolean;
  compact?: boolean;
  /** Always use outline style with hover preview of toggled state */
  outline?: boolean;
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
  outline = false,
  isFavorited: initialFavorited = false,
  onToggleFavorite,
  fetchInitialStatus = false,
}: FavoriteButtonProps) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isToggling, setIsToggling] = useState(false);
  const isControlled = typeof onToggleFavorite === 'function';
  const [uncontrolledFavorited, setUncontrolledFavorited] =
    useState(initialFavorited);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(
    fetchInitialStatus && !isControlled
  );

  const isFavorited = isControlled ? initialFavorited : uncontrolledFavorited;

  // Fetch initial status from API if fetchInitialStatus is true (for ISR pages)
  useEffect(() => {
    if (!fetchInitialStatus) return;
    if (isPending) return;
    if (onToggleFavorite) return;
    // ISRページ向けのAPI fetch結果でお気に入り状態を初期化する必要がある
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingInitial(true);

    // If not authenticated, no need to fetch
    if (!session?.user?.id) {
      setIsLoadingInitial(false);
      return;
    }

    const abortController = new AbortController();

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/favorites/${articleId}`, {
          credentials: 'include',
          cache: 'no-store',
          signal: abortController.signal,
        });
        if (response.ok) {
          const data = await response.json();
          setUncontrolledFavorited(data.isFavorited);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error('Failed to fetch favorite status:', error);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingInitial(false);
        }
      }
    };

    fetchStatus();

    return () => {
      abortController.abort();
    };
  }, [
    articleId,
    fetchInitialStatus,
    session?.user?.id,
    isPending,
    onToggleFavorite,
  ]);

  // Sync initial value in uncontrolled mode (for non-ISR pages)
  useEffect(() => {
    if (onToggleFavorite) return;
    if (fetchInitialStatus) return;
    // 非ISRページで親から渡されるinitialFavoritedをuncontrolled stateに同期する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUncontrolledFavorited(initialFavorited);
  }, [initialFavorited, fetchInitialStatus, onToggleFavorite]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isPending) return;

    if (!session) {
      // 未ログインの場合はログインページへ（現在のページをcallbackUrlとして設定）
      const currentUrl =
        pathname +
        (searchParams.toString() ? `?${searchParams.toString()}` : '');
      router.push(loginWithCallback(currentUrl));
      return;
    }

    setIsToggling(true);
    setIsAnimating(true);

    try {
      if (onToggleFavorite) {
        // Controlled mode: optimistic update is handled by parent
        try {
          await Promise.resolve(onToggleFavorite());
        } catch (error) {
          console.error('Failed to toggle favorite:', error);
          toast({
            title: 'エラー',
            description:
              'お気に入りの更新に失敗しました。もう一度お試しください。',
            variant: 'destructive',
          });
        }
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
        if (response.ok) {
          // API成功時にイベント発火（React Queryキャッシュ同期用）
          window.dispatchEvent(
            new CustomEvent('article-favorite-changed', {
              detail: {
                articleId,
                isFavorited: newState,
                timestamp: Date.now(),
              },
            })
          );
        } else {
          // エラー時は元に戻す
          setUncontrolledFavorited(!newState);
          throw new Error('Failed to toggle favorite');
        }
      } catch (error) {
        console.error('Failed to toggle favorite:', error);
        toast({
          title: 'エラー',
          description:
            'お気に入りの更新に失敗しました。もう一度お試しください。',
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
        disabled={isToggling || isLoadingInitial || isPending}
        className={cn(
          'rounded-full p-1.5 transition-all duration-300',
          'hover:bg-[var(--tt-color-negative-bg)]',
          isAnimating && 'scale-110',
          isFavorited
            ? 'text-[var(--tt-color-negative)] hover:text-[var(--tt-color-negative)]'
            : 'text-[var(--tt-color-text-muted)] hover:text-[var(--tt-color-negative)]',
          isLoadingInitial && 'opacity-50',
          className
        )}
        aria-label={isFavorited ? 'お気に入りから削除' : 'お気に入りに追加'}
        data-testid="favorite-button"
      >
        <Heart
          className={cn(
            'h-4 w-4 transition-colors',
            isFavorited && 'fill-[var(--tt-color-negative)]',
            (isToggling || isLoadingInitial) && 'opacity-50'
          )}
        />
      </button>
    );
  }

  return (
    <Button
      variant={outline ? 'outline' : isFavorited ? 'destructive' : 'outline'}
      size={size}
      onClick={handleClick}
      disabled={isToggling || isLoadingInitial || isPending}
      className={cn(
        'transition-all duration-300',
        outline && 'group',
        isAnimating && 'scale-110',
        outline
          ? 'hover:bg-transparent'
          : isFavorited
            ? 'bg-[var(--tt-color-negative)] text-white hover:bg-[var(--tt-color-negative)]'
            : 'hover:text-[var(--tt-color-negative)]',
        isLoadingInitial && 'opacity-50',
        className
      )}
      data-testid="favorite-button"
    >
      <Heart
        className={cn(
          'h-4 w-4 transition-colors',
          outline
            ? isFavorited
              ? 'fill-current text-[var(--tt-color-negative)] group-hover:fill-none group-hover:text-[var(--tt-color-text-muted)]'
              : 'fill-none group-hover:fill-current group-hover:text-[var(--tt-color-negative)]'
            : isFavorited
              ? 'fill-white'
              : 'fill-none',
          showText && 'mr-2',
          (isToggling || isLoadingInitial) && 'opacity-50'
        )}
      />
      {showText && (isFavorited ? 'お気に入り解除' : 'お気に入りに追加')}
    </Button>
  );
}
