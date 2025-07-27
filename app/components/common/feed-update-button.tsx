'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TrendingUp, Loader2 } from 'lucide-react';

export function FeedUpdateButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpdate = async () => {
    setIsLoading(true);
    setMessage('');

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
        setMessage(`更新完了: ${totalFetched}件取得、${totalCreated}件新規作成`);
        
        // 3秒後にリロード
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        setMessage('更新に失敗しました');
      }
    } catch (error) {
      setMessage('エラーが発生しました');
      console.error('Feed update error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button 
        onClick={handleUpdate} 
        disabled={isLoading}
        variant="outline"
        size="sm"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            更新中...
          </>
        ) : (
          <>
            <TrendingUp className="h-4 w-4 mr-2" />
            フィード更新
          </>
        )}
      </Button>
      {message && (
        <span className="text-sm text-muted-foreground">
          {message}
        </span>
      )}
    </div>
  );
}