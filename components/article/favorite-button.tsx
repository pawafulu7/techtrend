'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface FavoriteButtonProps {
  articleId: string;
  className?: string;
  showCount?: boolean;
}

export function FavoriteButton({ 
  articleId, 
  className,
  showCount = false 
}: FavoriteButtonProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isFavorited, setIsFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);

  // お気に入り状態を取得
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      checkFavoriteStatus();
    }
  }, [status, session, articleId]);

  const checkFavoriteStatus = async () => {
    try {
      const response = await fetch(`/api/favorites/${articleId}`);
      if (response.ok) {
        const data = await response.json();
        setIsFavorited(data.isFavorited);
      }
    } catch (error) {
    }
  };

  const handleToggleFavorite = async () => {
    if (status === 'unauthenticated') {
      toast({
        title: 'ログインが必要です',
        description: 'お気に入り機能を使用するにはログインしてください。',
        variant: 'default',
      });
      router.push(`/auth/login?callbackUrl=${window.location.pathname}`);
      return;
    }

    setIsLoading(true);

    try {
      if (isFavorited) {
        // お気に入りから削除
        const response = await fetch(`/api/favorites?articleId=${articleId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          setIsFavorited(false);
          setFavoriteCount(prev => Math.max(0, prev - 1));
          toast({
            title: 'お気に入りから削除しました',
            variant: 'default',
          });
        } else {
          throw new Error('Failed to remove favorite');
        }
      } else {
        // お気に入りに追加
        const response = await fetch('/api/favorites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ articleId }),
        });

        if (response.ok) {
          setIsFavorited(true);
          setFavoriteCount(prev => prev + 1);
          toast({
            title: 'お気に入りに追加しました',
            variant: 'default',
          });
        } else {
          const error = await response.json();
          if (response.status === 409) {
            setIsFavorited(true);
            toast({
              title: '既にお気に入りに追加されています',
              variant: 'default',
            });
          } else {
            throw new Error(error.error || 'Failed to add favorite');
          }
        }
      }
    } catch (error) {
      toast({
        title: 'エラーが発生しました',
        description: 'もう一度お試しください。',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={isFavorited ? 'default' : 'outline'}
      size="sm"
      className={cn(
        'gap-2',
        isFavorited && 'bg-pink-500 hover:bg-pink-600',
        className
      )}
      onClick={handleToggleFavorite}
      disabled={isLoading}
    >
      <Heart
        className={cn(
          'h-4 w-4',
          isFavorited && 'fill-current'
        )}
      />
      {isFavorited ? 'お気に入り済み' : 'お気に入り'}
      {showCount && favoriteCount > 0 && (
        <span className="ml-1">({favoriteCount})</span>
      )}
    </Button>
  );
}