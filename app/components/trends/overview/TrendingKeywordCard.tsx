'use client';

import Link from 'next/link';
import { TrendingUp, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendingKeyword {
  id: string;
  name: string;
  growthRate: number;
  recentCount: number;
  weeklyAverage: number;
  isTrending: boolean;
}

function getGrowthLabel(rate: number) {
  if (rate >= 100)
    return { label: '急上昇', className: 'text-(--tt-color-secondary)' };
  if (rate >= 50)
    return { label: '上昇', className: 'text-(--tt-color-secondary)' };
  if (rate >= 20)
    return { label: '微増', className: 'text-(--tt-color-positive)' };
  return { label: '減少', className: 'text-muted-foreground' };
}

export function TrendingKeywordCard({ keyword }: { keyword: TrendingKeyword }) {
  const growth = getGrowthLabel(keyword.growthRate);

  return (
    <Link
      href={`/?tags=${encodeURIComponent(keyword.name)}`}
      className="group block focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-(--tt-color-primary) focus-visible:outline-none"
    >
      <div
        className={cn(
          'relative rounded-lg border shadow-sm transition-all duration-200',
          'bg-background',
          'border-l-4 border-l-(--tt-color-secondary)',
          'hover:-translate-y-0.5 hover:shadow-md'
        )}
      >
        <div className="p-4">
          {/* Header */}
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-(--tt-color-secondary)" />
              <span className="text-xs font-bold text-(--tt-color-secondary)">
                {growth.label}
              </span>
            </div>
            <span className={cn('text-sm font-semibold', growth.className)}>
              {keyword.growthRate >= 0 ? '+' : ''}
              {keyword.growthRate}%
            </span>
          </div>

          {/* Keyword name */}
          <h3 className="text-foreground text-base leading-snug font-semibold decoration-1 underline-offset-2 group-hover:underline">
            {keyword.name}
          </h3>

          {/* Count */}
          <p className="text-muted-foreground mt-1 text-xs">
            {keyword.recentCount}件
          </p>
        </div>

        {/* Hover action */}
        <div className="absolute top-2 right-2 rounded p-1 text-(--tt-color-secondary) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--tt-color-secondary)/10">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}

export function TrendingKeywordCardSkeleton() {
  return (
    <div className="bg-background animate-pulse rounded-lg border border-l-4 border-l-(--tt-color-surface-muted) p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="h-3 w-16 rounded bg-(--tt-color-surface-muted)" />
        <div className="h-3 w-10 rounded bg-(--tt-color-surface-muted)" />
      </div>
      <div className="h-5 w-24 rounded bg-(--tt-color-surface-muted)" />
      <div className="mt-1.5 h-3 w-12 rounded bg-(--tt-color-surface-muted)" />
    </div>
  );
}
