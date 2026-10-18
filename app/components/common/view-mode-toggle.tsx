'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Grid3x3, Grid2x2, List } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import type { ViewModeToggleProps } from '@/types/components';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import {
  TOOLBAR_ICON_BUTTON,
  TOOLBAR_OUTLINE,
} from '@/app/components/common/toolbar-styles';
import { cn } from '@/lib/utils';

const VIEW_MODES = [
  { mode: 'card', label: 'カード表示', Icon: Grid3x3 },
  { mode: 'compact', label: 'コンパクト表示', Icon: Grid2x2 },
  { mode: 'list', label: 'リスト表示', Icon: List },
] as const satisfies ReadonlyArray<{
  mode: ViewModeToggleProps['currentMode'];
  label: string;
  Icon: typeof List;
}>;

export function ViewModeToggle({ currentMode }: ViewModeToggleProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  // 連打時に古い応答で状態が巻き戻らないよう、最新リクエストだけを採用する
  const requestSeqRef = useRef(0);

  const handleModeChange = async (mode: ViewModeToggleProps['currentMode']) => {
    if (isUpdating) return;

    const seq = ++requestSeqRef.current;
    setIsUpdating(true);

    try {
      const response = await fetch('/api/view-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) {
        throw new Error(`View mode update failed: HTTP ${response.status}`);
      }
      if (seq !== requestSeqRef.current) return;
      // Server Component を再取得して Cookie の表示モードを反映する。
      // フルリロードと違い、読み込み済みの記事とスクロール位置は保持される
      router.refresh();
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      // POST 失敗時は再取得せず、開発者が原因を追跡できるようログだけ残す
      console.error(
        `[ViewModeToggle] failed to update view mode (mode=${mode}):`,
        error
      );
      // ユーザーにも失敗を通知 (silent failure 回避)
      toast({
        title: '表示モード変更に失敗しました',
        description: '時間をおいて再度お試しください。',
        variant: 'destructive',
      });
    } finally {
      if (seq === requestSeqRef.current) setIsUpdating(false);
    }
  };

  return (
    <TooltipProvider>
      <div
        role="group"
        aria-label="表示形式"
        className="flex gap-1"
        data-testid="view-mode-toggle"
        data-view-mode={currentMode}
      >
        {VIEW_MODES.map(({ mode, label, Icon }) => {
          const pressed = currentMode === mode;
          return (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <Button
                  data-testid={`view-mode-${mode}`}
                  aria-pressed={pressed}
                  aria-label={label}
                  variant={pressed ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleModeChange(mode)}
                  disabled={isUpdating}
                  className={cn(
                    TOOLBAR_ICON_BUTTON,
                    !pressed && TOOLBAR_OUTLINE
                  )}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
