'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function FilterResetButton() {
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    
    try {
      // Clear all filter preferences
      await fetch('/api/filter-preferences', {
        method: 'DELETE',
      });
      
      // Navigate to clean URL
      router.push('/');
      
      // Force reload to clear all states
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (error) {
      console.error('Failed to reset filters:', error);
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
            <RotateCcw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`} />
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