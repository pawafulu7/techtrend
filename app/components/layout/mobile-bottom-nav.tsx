'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  isAdminRoute,
  isPrimaryNavActive,
  primaryNavAriaCurrent,
  usePrimaryNav,
} from './primary-nav';

// 列の数は主要導線の数（AI 検索はログイン中だけ出す）
const GRID_COLS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

/**
 * モバイル（lg 未満）のボトムナビ（Issue #704）。主要導線を常に出し、1 回のタップで移れるようにする。
 *
 * 本文の上に重ねず、ページの下に高さを持った帯として置く（ルートの layout で main の下）。
 * 本文の最後の行や、ページの下に置く状態の表示がナビに隠れない。
 * 今いる項目は、ヘッダーのタブと同じ藍の 2px の線（ここでは上）と、文字の色で示す
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const items = usePrimaryNav();

  if (isAdminRoute(pathname)) return null;

  return (
    <nav
      aria-label="サイトのメニュー"
      className="shrink-0 border-t border-(--tt-color-border) bg-(--tt-color-surface) lg:hidden"
      data-testid="mobile-bottom-nav"
    >
      <ul className={cn('grid', GRID_COLS[items.length])}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = isPrimaryNavActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={item.prefetch}
                aria-current={primaryNavAriaCurrent(pathname, item)}
                data-testid={`bottom-nav-link-${item.label}`}
                className={cn(
                  'relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] leading-none transition-colors duration-150',
                  'focus-visible:ring-2 focus-visible:ring-(--tt-color-primary) focus-visible:outline-none focus-visible:ring-inset',
                  'before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full',
                  active
                    ? 'font-semibold text-(--tt-color-primary) before:bg-(--tt-color-primary)'
                    : 'font-medium text-(--tt-color-text-muted) before:bg-transparent hover:text-(--tt-color-text)'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
