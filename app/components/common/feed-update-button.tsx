'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TrendingUp, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function FeedUpdateButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdate = async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/feeds/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        const { totalFetched, totalCreated } = data.data.summary;
        toast({
          title: 'フィード更新完了',
          description: `${totalFetched}件取得、${totalCreated}件の新しい記事を作成しました`,
        });
        
        // 3秒後にリロード
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        toast({
          title: 'エラー',
          description: 'フィードの更新に失敗しました',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'エラー',
        description: 'フィード更新中にエラーが発生しました',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleUpdate} 
      disabled={isLoading}
      variant="outline"
      size="sm"
      className="h-6 sm:h-7 px-2 text-xs"
    >
      {isLoading ? (
        <>
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          <span className="hidden sm:inline">更新中...</span>
          <span className="sm:hidden">更新</span>
        </>
      ) : (
        <>
          <TrendingUp className="h-3 w-3 mr-1" />
          <span className="hidden sm:inline">フィード更新</span>
          <span className="sm:hidden">更新</span>
        </>
      )}
    </Button>
  );
}