'use client';

import { Eye, EyeOff, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

type ReadFilterMode = 'all' | 'unread' | 'read';

export function UnreadFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMode = (searchParams.get('readFilter') as ReadFilterMode) || 'all';

  const handleFilterChange = useCallback((mode: ReadFilterMode) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (mode === 'all') {
      params.delete('readFilter');
    } else {
      params.set('readFilter', mode);
    }
    
    // ページをリセット
    params.delete('page');
    
    router.push(`/?${params.toString()}`);
  }, [router, searchParams]);

  const getIcon = (mode: ReadFilterMode) => {
    switch (mode) {
      case 'unread':
        return <Eye className="h-4 w-4" />;
      case 'read':
        return <EyeOff className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getLabel = (mode: ReadFilterMode) => {
    switch (mode) {
      case 'unread':
        return '未読のみ';
      case 'read':
        return '既読のみ';
      default:
        return 'すべて';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className={cn(
            "gap-2",
            currentMode !== 'all' && "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"
          )}
        >
          {getIcon(currentMode)}
          <span className="hidden sm:inline">{getLabel(currentMode)}</span>
          <span className="sm:hidden">
            {currentMode === 'unread' ? '未' : currentMode === 'read' ? '既' : '全'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleFilterChange('all')}>
          <div className="flex items-center justify-between w-full">
            <span>すべて表示</span>
            {currentMode === 'all' && <Check className="h-4 w-4 ml-2" />}
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleFilterChange('unread')}>
          <div className="flex items-center justify-between w-full">
            <span className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              未読のみ
            </span>
            {currentMode === 'unread' && <Check className="h-4 w-4 ml-2" />}
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleFilterChange('read')}>
          <div className="flex items-center justify-between w-full">
            <span className="flex items-center gap-2">
              <EyeOff className="h-4 w-4" />
              既読のみ
            </span>
            {currentMode === 'read' && <Check className="h-4 w-4 ml-2" />}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}