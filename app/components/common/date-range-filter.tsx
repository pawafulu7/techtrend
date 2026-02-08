'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar as CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMediaQuery } from '@/app/hooks/use-media-query';
import { DATE_RANGE_OPTIONS, getDateRangeLabel } from '@/app/lib/date-utils';

interface DateRangeFilterProps {
  className?: string;
}

const CUSTOM_VALUE = 'custom';

/** Format Date to YYYY-MM-DD string in local timezone */
function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format date range for display */
function formatDateRangeDisplay(from: Date, to: Date): string {
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(from)} - ${fmt(to)}`;
}

/** Calculate max selectable date (today) and min selectable date (3 months before today) */
function getDateBounds() {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  threeMonthsAgo.setHours(0, 0, 0, 0);
  return { today, threeMonthsAgo };
}

export function DateRangeFilter({ className = '' }: DateRangeFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Determine current mode from URL params
  const urlDateRange = searchParams.get('dateRange') || undefined;
  const urlDateFrom = searchParams.get('dateFrom') || undefined;
  const urlDateTo = searchParams.get('dateTo') || undefined;
  const isCustomMode = !!(urlDateFrom || urlDateTo);

  const currentPreset = isCustomMode ? CUSTOM_VALUE : urlDateRange || 'all';

  // Calendar state for custom range selection
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>(
    () => {
      if (urlDateFrom || urlDateTo) {
        return {
          from: urlDateFrom ? new Date(`${urlDateFrom}T00:00:00`) : undefined,
          to: urlDateTo ? new Date(`${urlDateTo}T00:00:00`) : undefined,
        };
      }
      return undefined;
    }
  );
  const [popoverOpen, setPopoverOpen] = useState(false);

  const { today, threeMonthsAgo } = getDateBounds();

  const updateUrl = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      // Clear all date-related params first
      params.delete('dateRange');
      params.delete('dateFrom');
      params.delete('dateTo');
      params.delete('page');

      // Set new params
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        }
      }

      const queryString = params.toString();
      const newUrl = queryString ? `/?${queryString}` : '/';
      router.push(newUrl);
    },
    [router, searchParams]
  );

  const saveFilterPreference = useCallback(
    async (prefs: {
      dateRange?: string;
      dateFrom?: string;
      dateTo?: string;
    }) => {
      try {
        await fetch('/api/filter-preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prefs),
        });
      } catch {
        // Silently ignore preference save failures
      }
    },
    []
  );

  const handlePresetChange = useCallback(
    (value: string) => {
      if (value === CUSTOM_VALUE) {
        // Open calendar popover without changing URL yet
        setPopoverOpen(true);
        return;
      }

      // Reset calendar state when switching to preset
      setCalendarRange(undefined);

      if (value === 'all') {
        updateUrl({});
        saveFilterPreference({
          dateRange: undefined,
          dateFrom: undefined,
          dateTo: undefined,
        });
      } else {
        updateUrl({ dateRange: value });
        saveFilterPreference({
          dateRange: value,
          dateFrom: undefined,
          dateTo: undefined,
        });
      }
    },
    [updateUrl, saveFilterPreference]
  );

  const handleCalendarApply = useCallback(() => {
    if (!calendarRange?.from) return;

    const from = formatLocalDate(calendarRange.from);
    const to = calendarRange.to ? formatLocalDate(calendarRange.to) : from;

    updateUrl({ dateFrom: from, dateTo: to });
    saveFilterPreference({ dateRange: undefined, dateFrom: from, dateTo: to });
    setPopoverOpen(false);
  }, [calendarRange, updateUrl, saveFilterPreference]);

  // Display label
  const displayLabel =
    isCustomMode && urlDateFrom && urlDateTo
      ? formatDateRangeDisplay(
          new Date(`${urlDateFrom}T00:00:00`),
          new Date(`${urlDateTo}T00:00:00`)
        )
      : isCustomMode && urlDateFrom
        ? `${new Date(`${urlDateFrom}T00:00:00`).getMonth() + 1}/${new Date(`${urlDateFrom}T00:00:00`).getDate()} -`
        : getDateRangeLabel(currentPreset);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CalendarIcon className="h-4 w-4 shrink-0 text-gray-500" />
      <div className="flex items-center gap-1">
        <Select
          value={currentPreset}
          onValueChange={handlePresetChange}
          data-testid="date-range-filter"
        >
          <SelectTrigger className="w-[140px]" data-testid="date-range-trigger">
            <SelectValue placeholder="期間を選択">{displayLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent data-testid="date-range-content">
            {DATE_RANGE_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                data-testid={`date-range-option-${option.value}`}
              >
                {option.label}
              </SelectItem>
            ))}
            <SelectItem
              value={CUSTOM_VALUE}
              data-testid="date-range-option-custom"
            >
              カスタム...
            </SelectItem>
          </SelectContent>
        </Select>

        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={`h-9 w-9 shrink-0 ${isCustomMode ? 'border-primary text-primary' : ''}`}
              data-testid="date-range-calendar-trigger"
              aria-label="カレンダーで日付を選択"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="p-3">
              <Calendar
                mode="range"
                selected={calendarRange}
                onSelect={setCalendarRange}
                numberOfMonths={isMobile ? 1 : 2}
                disabled={[{ before: threeMonthsAgo }, { after: today }]}
                defaultMonth={calendarRange?.from ?? new Date()}
                data-testid="date-range-calendar"
              />
              <div className="flex justify-end gap-2 border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCalendarRange(undefined);
                    setPopoverOpen(false);
                  }}
                  data-testid="date-range-calendar-cancel"
                >
                  キャンセル
                </Button>
                <Button
                  size="sm"
                  onClick={handleCalendarApply}
                  disabled={!calendarRange?.from}
                  data-testid="date-range-calendar-apply"
                >
                  適用
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
