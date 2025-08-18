'use client';

import { ToolbarSkeleton } from './toolbar-skeleton';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function ArticleCardSkeleton() {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow animate-pulse">
      <div className="p-4">
        {/* ソース名と日付 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
        
        {/* タイトル */}
        <Skeleton className="h-6 w-full mb-2" />
        <Skeleton className="h-6 w-3/4 mb-3" />
        
        {/* 要約 */}
        <div className="space-y-2 mb-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        
        {/* タグ */}
        <div className="flex flex-wrap gap-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton 
              key={i} 
              className="h-6 rounded-full"
              style={{ width: `${50 + Math.random() * 30}px` }}
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
  articleCount = 10 
}: PageSkeletonProps) {
  return (
    <div className="container mx-auto px-4 py-6">
      {/* ページタイトル */}
      <div className="mb-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      
      {/* ツールバー */}
      <ToolbarSkeleton />
      
      {/* メインコンテンツ */}
      <div className={showSidebar ? "flex gap-6" : ""}>
        {/* 記事リスト */}
        <div className={showSidebar ? "flex-1" : ""}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(articleCount)].map((_, i) => (
              <div
                key={i}
                style={{
                  animationDelay: `${i * 50}ms`,
                  opacity: 0,
                  animation: 'fadeIn 0.3s ease-out forwards'
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
            <Card className="p-4 animate-pulse">
              <Skeleton className="h-6 w-24 mb-3" />
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
            <Card className="p-4 animate-pulse">
              <Skeleton className="h-6 w-32 mb-3" />
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

// CSS animation keyframes (will be added to globals.css if not present)
const fadeInStyle = `
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;