'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  TOOLBAR_ICON_BUTTON,
  TOOLBAR_OUTLINE,
} from '@/app/components/common/toolbar-styles';
import { cn } from '@/lib/utils';

// 一覧の位置を表すだけの値は引き継がない（リーダーは自分で 1 ページ目から読む）
const NOT_CARRIED_OVER = ['page', 'returning'];

/**
 * ホームの一覧を、同じ条件のままリーダー（一覧と本文を並べて読む画面）で開くリンク（Issue #704）。
 * 表示切り替え（カード・コンパクト・リスト）の隣に置く。ヘッダーの主要導線からリーダーを外したので、
 * ホームから入れるようにする
 */
export function ReaderModeLink() {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  NOT_CARRIED_OVER.forEach((key) => params.delete(key));
  const query = params.toString();
  const href = query ? `/reader?${query}` : '/reader';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            asChild
            className={cn(TOOLBAR_ICON_BUTTON, TOOLBAR_OUTLINE)}
          >
            <Link
              href={href}
              aria-label="リーダーで読む"
              data-testid="reader-mode-link"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>リーダーで読む（一覧と本文を並べる）</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
