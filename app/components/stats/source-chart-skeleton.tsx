'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PieChart, Database } from 'lucide-react';

export function SourceChartSkeleton() {
  // 実際のソースをシミュレート
  const sources = [
    { name: 'Dev.to', width: 'w-[35%]' },
    { name: 'Qiita', width: 'w-[28%]' },
    { name: 'Zenn', width: 'w-[20%]' },
    { name: 'はてなブックマーク', width: 'w-[15%]' },
    { name: 'Speaker Deck', width: 'w-[12%]' },
    { name: 'Publickey', width: 'w-[8%]' },
  ];

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-muted-foreground/50" />
            <span className="text-sm font-medium text-muted-foreground">ソース別記事分布</span>
          </div>
          <div className="flex items-center gap-1">
            <Database className="h-4 w-4 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">集計中</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sources.map((source, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="h-3 w-3 rounded-full bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-500 animate-pulse"
                  />
                  <span className="text-sm font-medium text-muted-foreground/70">
                    {source.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12 animate-pulse" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-10 animate-pulse" />
                </div>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-500 animate-pulse ${source.width}`}
                />
              </div>
            </div>
          ))}
        </div>
        
        {/* 合計 */}
        <div className="mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">合計</span>
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}