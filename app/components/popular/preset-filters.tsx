'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

type PeriodType = 'today' | 'week' | 'month' | 'all';
type MetricType = 'bookmarks' | 'votes' | 'quality' | 'combined';

export const DEFAULT_PERIOD: PeriodType = 'week';
export const DEFAULT_METRIC: MetricType = 'combined';

interface PresetFiltersProps {
  selectedPreset: string | null;
  onPresetChange: (preset: string | null, period: PeriodType, metric: MetricType) => void;
  className?: string;
}

const presets = [
  { id: 'hot', label: 'Trending', period: 'today' as PeriodType, metric: 'combined' as MetricType },
  { id: 'quality', label: 'High Quality', period: 'week' as PeriodType, metric: 'quality' as MetricType },
  { id: 'popular', label: 'Most Saved', period: 'month' as PeriodType, metric: 'bookmarks' as MetricType },
] as const;

export function PresetFilters({
  selectedPreset,
  onPresetChange,
  className,
}: PresetFiltersProps) {
  const handleValueChange = (value: string) => {
    if (!value) {
      // Deselected - reset to default
      onPresetChange(null, DEFAULT_PERIOD, DEFAULT_METRIC);
      return;
    }

    const preset = presets.find((p) => p.id === value);
    if (preset) {
      onPresetChange(preset.id, preset.period, preset.metric);
    }
  };

  return (
    <ToggleGroup
      type="single"
      value={selectedPreset || ''}
      onValueChange={handleValueChange}
      className={cn('flex flex-wrap gap-2', className)}
      aria-label="Quick filter presets"
    >
      {presets.map((preset) => (
        <ToggleGroupItem
          key={preset.id}
          value={preset.id}
          aria-label={preset.label}
          className={cn(
            'rounded-full px-4 min-h-[44px]',
            'text-sm font-medium',
            'transition-all duration-200',
            'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
            'hover:bg-accent hover:text-accent-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'motion-reduce:transition-none'
          )}
        >
          {preset.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export { presets };
export type { PeriodType, MetricType };
