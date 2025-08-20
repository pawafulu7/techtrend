'use client';

import dynamic from 'next/dynamic';

// Filtersコンポーネントを動的インポート（SSRを無効化）
export const ClientFilters = dynamic(
  () => import('./filters').then(mod => ({ default: mod.Filters })),
  {
    ssr: false,
    loading: () => (
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-lg p-3 border border-white/20 shadow-sm">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-2">
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }
);