'use client';

import { ChevronUp, ChevronDown, Minus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type TrendType = 'up' | 'down' | 'stable' | 'new';

interface TrendIndicatorProps {
  trend: TrendType;
  className?: string;
}

const trendConfig = {
  up: {
    icon: ChevronUp,
    color: 'text-[var(--tt-color-positive)]',
    label: 'ranking up',
  },
  down: {
    icon: ChevronDown,
    color: 'text-[var(--tt-color-negative)]',
    label: 'ranking down',
  },
  stable: {
    icon: Minus,
    color: 'text-muted-foreground',
    label: 'ranking unchanged',
  },
  new: {
    icon: Sparkles,
    color: 'text-[var(--tt-color-warning)]',
    label: 'new entry',
  },
} as const;

export function TrendIndicator({ trend, className }: TrendIndicatorProps) {
  const config = trendConfig[trend];
  const Icon = config.icon;

  return (
    <div
      role="status"
      aria-label={config.label}
      className={cn('flex items-center', className)}
    >
      <Icon
        className={cn(
          'h-4 w-4',
          config.color,
          trend === 'new' && 'motion-safe:animate-pulse motion-reduce:animate-none'
        )}
        aria-hidden="true"
      />
    </div>
  );
}
