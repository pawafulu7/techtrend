'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { BarChart3, TrendingUp } from 'lucide-react';

export function ChartSkeleton() {
  // 固定された高さのデータ
  const barHeights = [45, 70, 55, 80, 65, 75, 60];
  
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground/50" />
            <span className="text-sm font-medium text-muted-foreground">チャート読み込み中</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4 text-green-500/50" />
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 rounded-lg relative overflow-hidden">
          {/* グリッド線 */}
          <div className="absolute inset-0">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-gray-200/30 dark:border-gray-700/30"
                style={{ top: `${i * 25}%` }}
              />
            ))}
          </div>
          
          {/* Y軸ラベル */}
          <div className="absolute left-2 top-0 bottom-0 flex flex-col justify-between py-4">
            {[100, 75, 50, 25, 0].map((value, i) => (
              <span key={i} className="text-xs text-muted-foreground/50">{value}</span>
            ))}
          </div>
          
          {/* バーチャート */}
          <div className="absolute bottom-0 left-12 right-4 flex items-end justify-around pb-8">
            {barHeights.map((height, i) => (
              <div
                key={i}
                className="relative flex flex-col items-center gap-2"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div
                  className="w-8 md:w-10 bg-gradient-to-t from-blue-500/20 to-blue-400/20 dark:from-blue-600/20 dark:to-blue-500/20 rounded-t animate-pulse"
                  style={{ height: `${height * 3}px` }}
                />
                <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
          
          {/* 中央のローディングテキスト */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse animation-delay-150" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse animation-delay-300" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}