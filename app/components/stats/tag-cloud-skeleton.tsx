'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Hash, TrendingUp } from 'lucide-react';

export function TagCloudSkeleton() {
  // 固定されたタグ幅のパターン（リアルなタグ名の長さをシミュレート）
  const tagPatterns = [
    { width: 'w-20', label: 'React' },
    { width: 'w-24', label: 'TypeScript' },
    { width: 'w-16', label: 'Next.js' },
    { width: 'w-28', label: 'JavaScript' },
    { width: 'w-32', label: 'Web開発' },
    { width: 'w-24', label: 'Node.js' },
    { width: 'w-20', label: 'Python' },
    { width: 'w-36', label: 'Machine Learning' },
    { width: 'w-16', label: 'AI' },
    { width: 'w-24', label: 'Docker' },
    { width: 'w-28', label: 'Kubernetes' },
    { width: 'w-20', label: 'AWS' },
    { width: 'w-24', label: 'DevOps' },
    { width: 'w-32', label: 'データベース' },
    { width: 'w-20', label: 'API' },
    { width: 'w-28', label: 'セキュリティ' },
    { width: 'w-24', label: 'テスト' },
    { width: 'w-20', label: 'CI/CD' },
    { width: 'w-16', label: 'Git' },
    { width: 'w-24', label: 'GraphQL' },
  ];

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-muted-foreground/50" />
            <span className="text-sm font-medium text-muted-foreground">人気タグ</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span>TOP 20</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {tagPatterns.map((tag, i) => (
            <div
              key={i}
              className="relative group"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div
                className={`h-8 ${tag.width} bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full animate-pulse flex items-center justify-center px-3`}
              >
                <span className="text-xs text-transparent bg-gradient-to-r from-gray-400 to-gray-500 bg-clip-text">
                  {tag.label}
                </span>
              </div>
              {/* 人気度インジケーター */}
              {i < 5 && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-orange-400/50 rounded-full animate-pulse" />
              )}
            </div>
          ))}
        </div>
        
        {/* フッター */}
        <div className="mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-xs text-muted-foreground">データ集計中</span>
            </div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}