'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function ArticleSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
      {[...Array(6)].map((_, i) => (
        <Card 
          key={i} 
          className="animate-pulse overflow-hidden"
          style={{
            boxShadow: '0 2px 8px rgba(100, 100, 200, 0.15)',
            background: 'rgba(255, 255, 255, 0.98)',
            border: '1px solid rgba(200, 200, 255, 0.2)',
          }}
        >
          <CardHeader className="pb-1 px-3 sm:px-4">
            {/* New Badge skeleton */}
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2" />
            {/* Title skeleton */}
            <div className="space-y-2">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
            </div>
            {/* Meta info skeleton */}
            <div className="flex items-center gap-2 mt-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            </div>
          </CardHeader>
          
          <CardContent className="py-2 px-3 sm:px-4 space-y-3">
            {/* Summary skeleton */}
            <div className="relative pl-3">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-purple-400 rounded-full opacity-50"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
              </div>
            </div>
            
            {/* Tags skeleton */}
            <div className="flex gap-1">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-16" />
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-20" />
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-14" />
            </div>
            
            {/* Action buttons skeleton */}
            <div className="flex items-center justify-between pt-1">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20" />
              <div className="flex gap-1">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-6" />
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-6" />
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}