'use client';

import { Library, Activity, Heart, Layers } from 'lucide-react';

interface SourcesOverviewProps {
  stats: {
    totalSources: number;
    activeSources: number;
    favoriteCount: number;
    categoryCount: number;
  };
}

export function SourcesOverview({ stats }: SourcesOverviewProps) {
  return (
    <div className="bg-background flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-lg border px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Library
          className="h-4 w-4 text-(--tt-color-primary)"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">{stats.totalSources}</span>
        <span className="text-muted-foreground text-xs">ソース</span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <Activity
          className="h-4 w-4 text-(--tt-color-info)"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">{stats.activeSources}</span>
        <span className="text-muted-foreground text-xs">アクティブ</span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <Heart
          className="h-4 w-4 text-(--tt-color-negative)"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">{stats.favoriteCount}</span>
        <span className="text-muted-foreground text-xs">お気に入り</span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <Layers
          className="h-4 w-4 text-(--tt-color-warning)"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">{stats.categoryCount}</span>
        <span className="text-muted-foreground text-xs">カテゴリ</span>
      </div>
    </div>
  );
}
