/**
 * Period Selector Component
 *
 * Toggle group for selecting the article filtering period.
 * Options: 3 months, 6 months, 12 months, All time
 */

'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { PeriodPreset } from '@/lib/personalization/types';

// =============================================================================
// Constants
// =============================================================================

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 3, label: '3ヶ月' },
  { value: 6, label: '6ヶ月' },
  { value: 12, label: '12ヶ月' },
  { value: 0, label: '全期間' },
];

// =============================================================================
// Props
// =============================================================================

interface PeriodSelectorProps {
  value: PeriodPreset;
  onChange: (value: PeriodPreset) => void;
  className?: string;
  disabled?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function PeriodSelector({
  value,
  onChange,
  className,
  disabled = false,
}: PeriodSelectorProps) {
  const handleValueChange = (newValue: string) => {
    if (newValue) {
      onChange(Number(newValue) as PeriodPreset);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-sm font-medium text-foreground">
        対象期間
      </label>
      <ToggleGroup
        type="single"
        value={String(value)}
        onValueChange={handleValueChange}
        className="flex flex-wrap gap-1"
        aria-label="対象期間"
        disabled={disabled}
      >
        {PERIOD_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={String(option.value)}
            aria-label={option.label}
            className={cn(
              'rounded-md px-3 h-9 sm:h-8',
              'text-sm font-medium',
              'transition-all duration-200',
              'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
              'hover:bg-accent hover:text-accent-foreground',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'motion-reduce:transition-none'
            )}
            data-testid={`period-${option.value}`}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">
        {value === 0
          ? '全期間の記事を対象にします'
          : `過去${value}ヶ月の記事を対象にします`}
      </p>
    </div>
  );
}
