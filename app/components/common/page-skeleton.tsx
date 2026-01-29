'use client';

import { ToolbarSkeleton } from './toolbar-skeleton';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Pre-defined widths to avoid Math.random() during render (React Compiler purity rule)
const TAG_SKELETON_WIDTHS = [58, 72, 65];

function ArticleCardSkeleton() {
  return (
    <Card className="animate-pulse overflow-hidden transition-shadow hover:shadow-lg">
      <div className="p-4">
        {/* ソース名と日付 */}
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>

        {/* タイトル */}
        <Skeleton className="mb-2 h-6 w-full" />
        <Skeleton className="mb-3 h-6 w-3/4" />

        {/* 要約 */}
        <div className="mb-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        {/* タグ */}
        <div className="flex flex-wrap gap-2">
          {TAG_SKELETON_WIDTHS.map((width, i) => (
            <Skeleton
              key={i}
              className="h-6 rounded-full"
              style={{ width: `${width}px` }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

interface PageSkeletonProps {
  showSidebar?: boolean;
  articleCount?: number;
}

export function PageSkeleton({
  showSidebar = false,
  articleCount = 10,
}: PageSkeletonProps) {
  return (
    <div className="container mx-auto px-4 py-6">
      {/* ページタイトル */}
      <div className="mb-6">
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* ツールバー */}
      <ToolbarSkeleton />

      {/* メインコンテンツ */}
      <div className={showSidebar ? 'flex gap-6' : ''}>
        {/* 記事リスト */}
        <div className={showSidebar ? 'flex-1' : ''}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(articleCount)].map((_, i) => (
              <div
                key={i}
                style={{
                  animationDelay: `${i * 50}ms`,
                  opacity: 0,
                  animation: 'fadeIn 0.3s ease-out forwards',
                }}
              >
                <ArticleCardSkeleton />
              </div>
            ))}
          </div>
        </div>

        {/* サイドバー */}
        {showSidebar && (
          <aside className="w-80 space-y-4">
            {/* 人気タグ */}
            <Card className="animate-pulse p-4">
              <Skeleton className="mb-3 h-6 w-24" />
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-10 rounded-full" />
                  </div>
                ))}
              </div>
            </Card>

            {/* 人気ソース */}
            <Card className="animate-pulse p-4">
              <Skeleton className="mb-3 h-6 w-32" />
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                ))}
              </div>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}
