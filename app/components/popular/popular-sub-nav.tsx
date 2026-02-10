'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Flame, Calendar, CalendarDays, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  presets,
  DEFAULT_PERIOD,
  DEFAULT_METRIC,
  type PeriodType,
  type MetricType,
} from './preset-filters';

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
  const currentPreset = searchParams.get('preset');

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handlePeriodChange = (period: PeriodType) => {
    updateParams({ period, preset: null, metric: null });
  };

  const handlePresetToggle = (presetId: string) => {
    if (currentPreset === presetId) {
      // Deselect → reset to defaults
      updateParams({
        period: DEFAULT_PERIOD,
        metric: null,
        preset: null,
      });
    } else {
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        updateParams({
          period: preset.period,
          metric: preset.metric,
          preset: preset.id,
        });
      }
    }
  };

  return (
    <div className="flex items-center justify-between gap-4">
      {/* Period Tabs */}
      <nav
        className="bg-muted/50 flex items-center gap-1 rounded-lg p-1"
        role="tablist"
        aria-label="ランキング期間"
      >
        {periodItems.map((item) => {
          const active = !currentPreset && currentPeriod === item.value;
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

      {/* Preset Filters */}
      <div
        className="flex items-center gap-1.5"
        role="group"
        aria-label="クイックフィルタープリセット"
      >
        {presets.map((preset) => {
          const active = currentPreset === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handlePresetToggle(preset.id)}
              aria-pressed={active}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200',
                'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground border'
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
