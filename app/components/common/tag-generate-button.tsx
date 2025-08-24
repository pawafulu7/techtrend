'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Hash, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function TagGenerateButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/tags/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        const { generated, errors } = data.data;
        toast({
          title: 'タグ生成完了',
          description: `${generated}件のタグを生成しました${errors > 0 ? `（${errors}件のエラー）` : ''}`,
        });
        
        // 3秒後にリロード
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        toast({
          title: 'エラー',
          description: data.error || 'タグの生成に失敗しました',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'エラー',
        description: 'タグ生成中にエラーが発生しました',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleGenerate} 
      disabled={isLoading}
      variant="outline"
      size="sm"
      className="h-6 sm:h-7 px-2 text-xs"
    >
      {isLoading ? (
        <>
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          <span className="hidden sm:inline">生成中...</span>
          <span className="sm:hidden">生成</span>
        </>
      ) : (
        <>
          <Hash className="h-3 w-3 mr-1" />
          <span className="hidden sm:inline">タグ生成</span>
          <span className="sm:hidden">タグ</span>
        </>
      )}
    </Button>
  );
}