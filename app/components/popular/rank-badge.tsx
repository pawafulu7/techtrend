'use client';

import { Award } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RankBadgeProps {
  rank: number;
  className?: string;
}

const rankStyles = {
  1: 'text-(--tt-color-rank-gold)',
  2: 'text-(--tt-color-rank-silver)',
  3: 'text-(--tt-color-rank-bronze)',
} as const;

export function RankBadge({ rank, className }: RankBadgeProps) {
  const isTopThree = rank >= 1 && rank <= 3;
  const colorClass = isTopThree
    ? rankStyles[rank as keyof typeof rankStyles]
    : 'text-foreground';

  return (
    <div
      role="img"
      aria-label={`${rank}`}
      className={cn(
        'bg-background flex h-10 w-10 items-center justify-center rounded-full border-2',
        className
      )}
    >
      {isTopThree ? (
        <Award className={cn('h-5 w-5', colorClass)} aria-hidden="true" />
      ) : (
        <span className={cn('text-lg font-bold', colorClass)}>{rank}</span>
      )}
    </div>
  );
}
