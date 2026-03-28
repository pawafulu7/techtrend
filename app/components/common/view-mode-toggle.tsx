'use client';

import { Grid3x3, Grid2x2, List } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import type { ViewModeToggleProps } from '@/types/components';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ViewModeToggle({ currentMode }: ViewModeToggleProps) {
  const handleModeChange = async (mode: ViewModeToggleProps['currentMode']) => {
    // サーバーに送信してCookieを更新
    try {
      await fetch('/api/view-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      // ページをリロードして新しい表示モードを適用
      window.location.reload();
    } catch {
    }
  };

  return (
    <TooltipProvider>
      <div className="flex gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={currentMode === 'card' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleModeChange('card')}
              className="h-7 w-7 p-0"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>カード表示</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={currentMode === 'compact' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleModeChange('compact')}
              className="h-7 w-7 p-0"
            >
              <Grid2x2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>コンパクト表示</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={currentMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleModeChange('list')}
              className="h-7 w-7 p-0"
            >
              <List className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>リスト表示</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}