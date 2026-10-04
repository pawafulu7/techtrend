'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { cn } from '@/lib/utils';

/** 「今日の要点」の読み込み失敗から、サーバーの描画をやり直す（一覧の状態は保つ） */
export function HomeDailyDigestReload() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className="gap-1.5"
    >
      <RefreshCw
        className={cn('h-3.5 w-3.5', isPending && 'animate-spin')}
        aria-hidden="true"
      />
      再読み込み
    </Button>
  );
}
