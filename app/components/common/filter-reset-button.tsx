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

export function FilterResetButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);

    try {
      // Clear all filter-related cookies (parallel)
      const responses = await Promise.all([
        fetch('/api/filter-preferences', { method: 'DELETE' }),
        fetch('/api/source-filter', { method: 'DELETE' }),
      ]);
      if (responses.some((r) => !r.ok)) {
        throw new Error('Filter reset API failed');
      }

      // Clear view mode cookie (if exists)
      document.cookie =
        'article-view-mode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

      await queryClient.invalidateQueries();
      router.replace('/');
    } catch (err) {
      console.error('Filter reset failed:', err);
      alert('フィルターのリセットに失敗しました');
    } finally {
      setIsResetting(false);
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
