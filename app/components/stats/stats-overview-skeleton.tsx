'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FileText, TrendingUp, Database, Hash } from 'lucide-react';

export function StatsOverviewSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* 総記事数カード */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <span className="text-sm font-medium text-muted-foreground">総記事数</span>
          <FileText className="h-4 w-4 text-muted-foreground/50" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded w-28 animate-pulse" />
            <div className="flex items-center gap-1">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse" />
              <span className="text-xs text-muted-foreground">件の記事</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 過去7日間カード */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer animation-delay-150" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <span className="text-sm font-medium text-muted-foreground">過去7日間</span>
          <TrendingUp className="h-4 w-4 text-muted-foreground/50" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded w-20 animate-pulse" />
            <div className="flex items-center gap-1">
              <span className="text-xs text-green-600 dark:text-green-400">+</span>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse" />
              <span className="text-xs text-muted-foreground">件</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ソース数カード */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer animation-delay-300" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <span className="text-sm font-medium text-muted-foreground">ソース数</span>
          <Database className="h-4 w-4 text-muted-foreground/50" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded w-12 animate-pulse" />
            <div className="text-xs text-muted-foreground">アクティブなソース</div>
          </div>
        </CardContent>
      </Card>

      {/* タグ数カード */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer animation-delay-450" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <span className="text-sm font-medium text-muted-foreground">タグ数</span>
          <Hash className="h-4 w-4 text-muted-foreground/50" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded w-24 animate-pulse" />
            <div className="text-xs text-muted-foreground">ユニークタグ</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}