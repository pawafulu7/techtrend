'use client';

import { useState, useCallback, useRef } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ShareButtonProps {
  url: string;
  title: string;
  className?: string;
}

const THROTTLE_MS = 2000;

export function ShareButton({ url, title, className }: ShareButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const lastShareTime = useRef<number>(0);
  const { toast } = useToast();

  const canUseWebShare = useCallback(() => {
    if (typeof window === 'undefined') return false;
    if (!navigator.share) return false;
    if (!navigator.canShare) return false;

    // Check if we can share the specific content
    try {
      return navigator.canShare({ url, title });
    } catch {
      return false;
    }
  }, [url, title]);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({
        description: 'リンクをコピーしました',
      });
      return true;
    } catch {
      toast({
        description: 'リンクのコピーに失敗しました',
        variant: 'destructive',
      });
      return false;
    }
  }, [url, toast]);

  const handleShare = useCallback(async () => {
    // Throttle duplicate shares
    const now = Date.now();
    if (now - lastShareTime.current < THROTTLE_MS) {
      return;
    }
    lastShareTime.current = now;

    setIsSharing(true);

    try {
      if (canUseWebShare()) {
        await navigator.share({ url, title });
      } else {
        await copyToClipboard();
      }
    } catch (error) {
      // User cancelled share dialog - not an error
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      // Fallback to clipboard on any error
      await copyToClipboard();
    } finally {
      setIsSharing(false);
    }
  }, [url, title, canUseWebShare, copyToClipboard]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleShare}
      disabled={isSharing}
      aria-label="記事を共有"
      className={cn(
        'flex h-11 w-11 items-center justify-center p-0',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2',
        className
      )}
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
