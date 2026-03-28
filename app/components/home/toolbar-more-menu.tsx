'use client';

import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { UnreadFilterWithData } from '@/app/components/common/unread-filter-with-data';
import { MarkAllReadWrapper } from '@/app/components/common/mark-all-read-wrapper';
import { FilterResetButton } from '@/app/components/common/filter-reset-button';

export function ToolbarMoreMenu() {
  return (
    <TooltipProvider>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                aria-label="その他のオプション"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="ml-1 hidden text-xs sm:inline">その他</span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>その他のオプション</p>
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-auto min-w-[140px] p-2">
          <div className="flex flex-col gap-2">
            <UnreadFilterWithData />
            <MarkAllReadWrapper />
            <FilterResetButton />
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
