'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Flame, Calendar, CalendarDays, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PeriodType } from './preset-filters';

const periodItems = [
  { value: 'today', label: '今日', icon: Flame },
  { value: 'week', label: '週間', icon: Calendar },
  { value: 'month', label: '月間', icon: CalendarDays },
  { value: 'all', label: '全期間', icon: Clock },
] as const;

export function PopularSubNav() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentPeriod = (searchParams.get('period') || 'week') as PeriodType;

  const handlePeriodChange = (period: PeriodType) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', period);
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
        const Icon = item.icon;

        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => handlePeriodChange(item.value as PeriodType)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
              'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              active
                ? 'bg-background text-primary ring-primary/20 shadow-sm ring-1'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
