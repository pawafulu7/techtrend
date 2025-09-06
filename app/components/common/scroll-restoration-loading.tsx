'use client';

import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface ScrollRestorationLoadingProps {
  currentPage: number;
  targetPages: number;
  currentArticles?: number;
  targetArticles?: number;
  onCancel: () => void;
}

export function ScrollRestorationLoading({
  currentPage,
  targetPages,
  currentArticles,
  targetArticles,
  onCancel
}: ScrollRestorationLoadingProps) {
  // 記事数ベースで進捗を計算（記事数が提供されている場合）
  const progress = targetArticles && currentArticles !== undefined
    ? targetArticles > 0 ? (currentArticles / targetArticles) * 100 : 0
    : targetPages > 0 ? (currentPage / targetPages) * 100 : 0;
  
  // 表示テキストを記事数ベースに切り替え
  const displayText = targetArticles && currentArticles !== undefined
    ? `${currentArticles} / ${targetArticles} 件`
    : `${currentPage} / ${targetPages} ページ`;
  
  return (
    <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 
                    backdrop-blur-sm z-40 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 
                      shadow-2xl max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              スクロール位置を復元中...
            </h3>
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>{displayText}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          
          <p className="text-sm text-gray-500 dark:text-gray-400">
            前回の位置まで記事を読み込んでいます...
          </p>
          
          <Button 
            onClick={onCancel}
            variant="outline"
            className="w-full"
          >
            <X className="h-4 w-4 mr-2" />
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  );
}