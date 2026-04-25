'use client';

import dynamic from 'next/dynamic';

// Filtersコンポーネントを動的インポート（SSRを無効化）
export const ClientFilters = dynamic(
  () => import('./filters').then((mod) => ({ default: mod.Filters })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-white/20 bg-[var(--tt-color-surface)]/80 p-3 shadow-sm backdrop-blur-sm">
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-1/4 rounded bg-[var(--tt-color-surface-hover)]"></div>
          <div className="space-y-2">
            <div className="h-8 rounded bg-[var(--tt-color-surface-hover)]"></div>
            <div className="h-8 rounded bg-[var(--tt-color-surface-hover)]"></div>
          </div>
        </div>
      </div>
    ),
  }
);
