'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';

export function FilterResetButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    if (isResetting) return;
    setIsResetting(true);

    // 2 本の DELETE は独立しているため、片方だけ成功する部分失敗があり得る。
    // その場合でも一部の Cookie は既に消えているので、成否にかかわらず
    // UI とサーバー状態を再同期する（旧実装は throw して再同期を飛ばしていた）
    let failed = false;
    try {
      const responses = await Promise.all([
        fetch('/api/filter-preferences', { method: 'DELETE' }),
        fetch('/api/source-filter', { method: 'DELETE' }),
      ]);
      failed = responses.some((r) => !r.ok);
      if (failed) {
        console.error(
          '[FilterResetButton] filter reset API returned non-OK:',
          responses.map((r) => r.status)
        );
      }
    } catch (err) {
      console.error('Filter reset failed:', err);
      failed = true;
    }

    // Clear view mode cookie (if exists) — API の成否に依存しない
    document.cookie =
      'article-view-mode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

    try {
      await queryClient.invalidateQueries();
      router.replace('/');
    } finally {
      setIsResetting(false);
    }

    if (failed) {
      toast({
        title: 'フィルターのリセットに一部失敗しました',
        description: '残った条件がある場合は時間をおいて再度お試しください。',
        variant: 'destructive',
      });
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isResetting}
            className="h-7 px-2"
            data-testid="filter-reset-button"
          >
            <RotateCcw
              className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`}
            />
            <span className="ml-1 hidden sm:inline">リセット</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>すべてのフィルター条件をクリア</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
