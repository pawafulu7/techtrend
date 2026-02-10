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
    color: 'text-(--tt-color-positive)',
    label: 'ランキング上昇',
  },
  down: {
    icon: ChevronDown,
    color: 'text-(--tt-color-negative)',
    label: 'ランキング下降',
  },
  stable: {
    icon: Minus,
    color: 'text-muted-foreground',
    label: 'ランキング変動なし',
  },
  new: {
    icon: Sparkles,
    color: 'text-(--tt-color-warning)',
    label: '新規エントリー',
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
          trend === 'new' &&
            'motion-safe:animate-pulse motion-reduce:animate-none'
        )}
        aria-hidden="true"
      />
    </div>
  );
}
