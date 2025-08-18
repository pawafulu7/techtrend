'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function ToolbarSkeleton() {
  return (
    <Card className="mb-4 border-0 shadow-none bg-background/60 backdrop-blur-sm">
      <div className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* 左側: 件数表示 */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
          
          {/* 右側: ボタン群 */}
          <div className="flex-1 flex items-center justify-end gap-2">
            {/* 検索ボックス */}
            <Skeleton className="h-9 w-48 sm:w-64" />
            
            {/* フィルターボタン */}
            <Skeleton className="h-9 w-9 rounded-md" />
            
            {/* ソートボタン */}
            <Skeleton className="h-9 w-9 rounded-md" />
            
            {/* ビューモード切替 */}
            <div className="hidden sm:flex">
              <Skeleton className="h-9 w-20 rounded-l-md rounded-r-none" />
              <Skeleton className="h-9 w-20 rounded-r-md rounded-l-none" />
            </div>
          </div>
        </div>
        
        {/* タグフィルター */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton 
              key={i} 
              className="h-7 rounded-full"
              style={{ width: `${60 + Math.random() * 40}px` }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

export function SimplifiedToolbarSkeleton() {
  return (
    <div className="mb-4 px-4 py-3 bg-background/60 backdrop-blur-sm rounded-lg">
      <div className="flex items-center justify-between">
        {/* 件数表示 */}
        <Skeleton className="h-5 w-32" />
        
        {/* 検索とボタン */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>
    </div>
  );
}