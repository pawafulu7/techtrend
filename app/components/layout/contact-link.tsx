'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const LABEL = 'お問い合わせ・要望';

interface ContactLinkProps {
  /**
   * デスクトップのヘッダー用。文字が入る幅（1280px 以上）ではアイコンに文字を並べ、
   * それより狭い幅ではアイコンだけにして、マウスを乗せたときに文字を出す
   */
  desktop?: boolean;
  testId: string;
}

/** ヘッダーに常に出す、お問い合わせ（/contact）へのリンク */
export function ContactLink({ desktop = false, testId }: ContactLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === '/contact';

  const link = (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className={cn(
        'h-11 w-11 lg:h-9 lg:w-9',
        // ナビより目立たせない。枠や塗りは付けず、補助の文字色で出し、開いているときだけ藍にする。
        // 開いているときはホバーでも藍のまま（ghost のホバーの塗りと文字色を打ち消す）
        isActive
          ? 'bg-(--tt-color-primary-bg) text-(--tt-color-primary) hover:bg-(--tt-color-primary-bg) hover:text-(--tt-color-primary)'
          : 'text-(--tt-color-text-muted) hover:text-(--tt-color-text)',
        desktop && 'xl:w-auto xl:gap-1.5 xl:px-2.5 xl:text-[13px]'
      )}
    >
      <Link
        href="/contact"
        aria-current={isActive ? 'page' : undefined}
        data-testid={testId}
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
        {/* 名前は常にこの文字から付く。見せるのはデスクトップの広い幅だけ */}
        <span className={cn('sr-only', desktop && 'xl:not-sr-only')}>
          {LABEL}
        </span>
      </Link>
    </Button>
  );

  if (!desktop) return link;

  // アプリ全体の TooltipProvider は無いので、ここで巻く（無いと Radix が例外を投げる）
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        {/* 文字が見えている幅では同じ文字を重ねて出さない */}
        <TooltipContent className="xl:hidden">{LABEL}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
