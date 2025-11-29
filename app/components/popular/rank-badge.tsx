'use client';

import { Award } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RankBadgeProps {
  rank: number;
  className?: string;
}

const rankStyles = {
  1: 'text-[var(--tt-color-rank-gold)]',
  2: 'text-[var(--tt-color-rank-silver)]',
  3: 'text-[var(--tt-color-rank-bronze)]',
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
        'flex items-center justify-center w-10 h-10 rounded-full bg-background border-2',
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
