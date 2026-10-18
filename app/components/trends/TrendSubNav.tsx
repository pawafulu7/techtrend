'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TrendingUp, Calendar, GitCompare, Grid3X3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNavActive, navAriaCurrent } from '@/components/ui-v2/nav-tab';

const trendNavItems = [
  { href: '/trends', label: '概要', icon: TrendingUp, exact: true },
  { href: '/trends/daily', label: 'デイリー', icon: Calendar, exact: false },
  { href: '/trends/diff', label: '週間変化', icon: GitCompare, exact: false },
  {
    href: '/trends/heatmap',
    label: 'セクターマップ',
    icon: Grid3X3,
    exact: false,
  },
] as const;

export function TrendSubNav() {
  const pathname = usePathname();

  return (
    // role="tablist"/"tab" は付けない: 中身は別ページへのリンクで、tabpanel も
    // 矢印キーによる roving tabindex も存在しないため、tabs として告知すると
    // スクリーンリーダー利用者の期待と食い違う。ナビ + aria-current が正しい。
    // モバイルでは横スクロールさせ、ラベルの途中改行（縦書き状の崩れ）を防ぐ。
    <nav
      className="bg-muted/50 flex [scrollbar-width:none] items-center gap-1 overflow-x-auto rounded-lg p-1 [&::-webkit-scrollbar]:hidden"
      aria-label="トレンドナビゲーション"
    >
      {trendNavItems.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(pathname, item.href, { exact: item.exact });

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={navAriaCurrent(pathname, item.href, {
              exact: item.exact,
            })}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200',
              'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
