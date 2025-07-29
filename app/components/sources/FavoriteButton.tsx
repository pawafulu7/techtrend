'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFavoriteSources } from '@/lib/favorites/hooks';

interface FavoriteButtonProps {
  sourceId: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  showText?: boolean;
}

export function FavoriteButton({ 
  sourceId, 
  className,
  size = 'sm',
  showText = false
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavoriteSources();
  const [isAnimating, setIsAnimating] = useState(false);
  const isFav = isFavorite(sourceId);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsAnimating(true);
    toggleFavorite(sourceId);
    
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <Button
      variant={isFav ? "default" : "outline"}
      size={size}
      onClick={handleClick}
      className={cn(
        "transition-all",
        isAnimating && "scale-110",
        className
      )}
    >
      <Star 
        className={cn(
          "h-4 w-4",
          isFav && "fill-current",
          showText && "mr-2"
        )}
      />
      {showText && (isFav ? "お気に入り解除" : "お気に入りに追加")}
    </Button>
  );
}