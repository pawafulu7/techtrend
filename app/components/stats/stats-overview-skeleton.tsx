'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function StatsOverviewSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* 総記事数カード */}
      <Card className="animate-pulse">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
          <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-1" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
        </CardContent>
      </Card>

      {/* 今日の記事カード */}
      <Card className="animate-pulse">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
          <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-1" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-28" />
        </CardContent>
      </Card>

      {/* ソース数カード */}
      <Card className="animate-pulse">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-12 mb-1" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
        </CardContent>
      </Card>

      {/* タグ数カード */}
      <Card className="animate-pulse">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12" />
          <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-1" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
        </CardContent>
      </Card>
    </div>
  );
}