'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TrendingUp, Calendar, GitCompare, Grid3X3 } from 'lucide-react';
import {
  isNavActive,
  navAriaCurrent,
  navTabClass,
} from '@/components/ui-v2/nav-tab';

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
    // 見た目はヘッダーと同じ文字のタブ（navTabClass）。選ばれている項目の下線を、親（app/trends/layout.tsx）の
    // 下の線に重ねるので、タブは nav の高さいっぱいに伸ばす。
    // モバイルでは横スクロールさせ、ラベルの途中改行（縦書き状の崩れ）を防ぐ。
    <nav
      className="-mx-3 flex h-11 [scrollbar-width:none] items-stretch overflow-x-auto [&::-webkit-scrollbar]:hidden"
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
            className={navTabClass(active)}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
