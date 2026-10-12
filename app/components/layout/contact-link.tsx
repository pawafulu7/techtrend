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

interface ContactLinkProps {
  /** マウスを乗せたときに「お問い合わせ」を出す（デスクトップのヘッダー用） */
  withTooltip?: boolean;
  testId: string;
}

/** ヘッダーに常に出す、お問い合わせ（/contact）へのアイコンリンク */
export function ContactLink({ withTooltip = false, testId }: ContactLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === '/contact';

  const link = (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className={cn(
        'h-11 w-11 lg:h-9 lg:w-9',
        isActive && 'bg-(--tt-color-primary-bg) text-(--tt-color-primary)'
      )}
    >
      <Link
        href="/contact"
        aria-label="お問い合わせ"
        aria-current={isActive ? 'page' : undefined}
        data-testid={testId}
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
      </Link>
    </Button>
  );

  if (!withTooltip) return link;

  // アプリ全体の TooltipProvider は無いので、ここで巻く（無いと Radix が例外を投げる）
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent>お問い合わせ</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
