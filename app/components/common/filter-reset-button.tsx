'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useFilterReset } from './hooks/useFilterReset';

export function FilterResetButton() {
  const { reset: handleReset, isResetting } = useFilterReset();

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
