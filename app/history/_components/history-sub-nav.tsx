'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { History, LineChart } from 'lucide-react';
import { navTabClass } from '@/components/ui-v2/nav-tab';
import { isAnalyticsTab } from './history-tab';

const items = [
  { href: '/history', label: '閲覧履歴', icon: History, analytics: false },
  {
    href: '/history?tab=analytics',
    label: '読書分析',
    icon: LineChart,
    analytics: true,
  },
] as const;

/**
 * 閲覧履歴と読書分析を切り替える文字のタブ（Issue #709）
 *
 * 中身は同じページの表示の切り替えだが、URL（?tab=）で開き直せるようにリンクにする。
 * role="tab" は付けず、aria-current で今の表示を伝える（トレンドのサブナビと同じ）。
 */
export function HistorySubNav() {
  const searchParams = useSearchParams();
  const analytics = isAnalyticsTab(searchParams.get('tab'));

  return (
    <nav
      className="-mx-3 flex h-11 [scrollbar-width:none] items-stretch overflow-x-auto [&::-webkit-scrollbar]:hidden"
      aria-label="閲覧履歴と読書分析"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.analytics === analytics;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
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
