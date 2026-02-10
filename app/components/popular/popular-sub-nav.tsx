'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { PeriodType } from './preset-filters';

const periodItems = [
  { value: 'today', label: '今日' },
  { value: 'week', label: '週間' },
  { value: 'month', label: '月間' },
  { value: 'all', label: '全期間' },
] as const;

export function PopularSubNav() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentPeriod = (searchParams.get('period') || 'week') as PeriodType;

  const handlePeriodChange = (period: PeriodType) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', period);
    // Clear preset when manually changing period
    params.delete('preset');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <nav
      className="bg-muted/50 flex items-center gap-1 rounded-lg p-1"
      role="tablist"
      aria-label="ランキング期間"
    >
      {periodItems.map((item) => {
        const active = currentPeriod === item.value;

        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => handlePeriodChange(item.value as PeriodType)}
            className={cn(
              'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
              'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            )}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
