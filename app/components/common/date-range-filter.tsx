'use client';

import { useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Calendar as CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui-v2/button-v2';
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
import {
  createLazyComponent,
  LazyLoadFailed,
} from '@/app/components/common/lazy-component';
import { cn } from '@/lib/utils';
import { DATE_RANGE_OPTIONS, getDateRangeLabel } from '@/app/lib/date-utils';
import {
  buildFilterUrl,
  clearTransientFilterParams,
} from '@/lib/utils/url/filter-params';

/**
 * react-day-picker はカレンダーを開いたときだけ要るので、ホームの初回表示の JS に含めない（Issue #718）。
 * ボタンに触れた時点で読み始め、開いたときに枠を見せずに済むようにする。
 * 読み込み中と読み込めなかったときは CalendarFrame を出し、ポップオーバーの大きさが変わらないようにする
 */
const { Component: Calendar, preload: preloadCalendar } = createLazyComponent(
  () =>
    import('@/components/ui/calendar').then((mod) => ({
      default: mod.Calendar,
    }))
);

/** 日曜始まりで、その月のカレンダーが何行になるか（react-day-picker の既定と同じ数え方） */
function weekRowsInMonth(date: Date): number {
  const firstWeekday = new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  ).getDay();
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.ceil((firstWeekday + days) / 7);
}

// 実測: 5行の月で 291px、6行の月で 331px（1行 40px）。
// 幅は numberOfMonths に合わせる（768px 以下は1か月、それより広いと2か月）
const CALENDAR_HEIGHT_FOR_5_ROWS = 291;
const CALENDAR_WEEK_ROW_HEIGHT = 40;

/** 表示する月のカレンダーと同じ大きさの枠 */
function CalendarFrame({
  months,
  loading,
  children,
}: {
  months: Date[];
  loading?: boolean;
  children?: ReactNode;
}) {
  const rows = Math.max(...months.map(weekRowsInMonth));
  return (
    <div
      className={cn(
        'w-[248px] rounded-md bg-(--tt-color-surface-muted) min-[769px]:w-[488px]',
        loading && 'motion-safe:animate-pulse',
        children && 'flex items-center justify-center'
      )}
      style={{
        height:
          CALENDAR_HEIGHT_FOR_5_ROWS + (rows - 5) * CALENDAR_WEEK_ROW_HEIGHT,
      }}
      aria-hidden={children ? undefined : true}
      data-testid={loading ? 'date-range-calendar-placeholder' : undefined}
    >
      {children}
    </div>
  );
}

interface DateRangeFilterProps {
  className?: string;
}

const CUSTOM_VALUE = 'custom';

/** Parse YYYY-MM-DD string to local Date (consistent with date-utils.ts parseLocalDate) */
function parseLocalDateString(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

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

/** Calculate max selectable date (today) and min selectable date (93 days before today) */
function getDateBounds() {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  // Use 93-day fixed limit to match backend parseDateFromTo validation
  const threeMonthsAgo = new Date(Date.now() - 93 * 24 * 60 * 60 * 1000);
  threeMonthsAgo.setHours(0, 0, 0, 0);
  return { today, threeMonthsAgo };
}

export function DateRangeFilter({ className = '' }: DateRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
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
          from: urlDateFrom ? parseLocalDateString(urlDateFrom) : undefined,
          to: urlDateTo ? parseLocalDateString(urlDateTo) : undefined,
        };
      }
      return undefined;
    }
  );
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Sync calendar state from URL when popover opens (handles back/forward nav)
  function handlePopoverOpenChange(open: boolean) {
    if (open) {
      setCalendarRange(
        urlDateFrom || urlDateTo
          ? {
              from: urlDateFrom ? parseLocalDateString(urlDateFrom) : undefined,
              to: urlDateTo ? parseLocalDateString(urlDateTo) : undefined,
            }
          : undefined
      );
    }
    setPopoverOpen(open);
  }

  const { today, threeMonthsAgo } = getDateBounds();
  const defaultMonth = calendarRange?.from ?? new Date();
  const shownMonths = isMobile
    ? [defaultMonth]
    : [
        defaultMonth,
        new Date(defaultMonth.getFullYear(), defaultMonth.getMonth() + 1, 1),
      ];

  function updateUrl(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());

    // Clear all date-related params first
    params.delete('dateRange');
    params.delete('dateFrom');
    params.delete('dateTo');
    // ページと /reader の選択中記事をリセット
    clearTransientFilterParams(params);

    // Set new params
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      }
    }

    // パスを固定すると /reader で日付を選んだ瞬間にホームへ離脱する
    router.push(buildFilterUrl(pathname, params));
  }

  async function saveFilterPreference(prefs: {
    dateRange?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    try {
      await fetch('/api/filter-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
    } catch {
      // Silently ignore preference save failures
    }
  }

  function handlePresetChange(value: string) {
    if (value === CUSTOM_VALUE) {
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
  }

  function handleCalendarApply() {
    if (!calendarRange?.from) return;

    const from = formatLocalDate(calendarRange.from);
    const to = calendarRange.to ? formatLocalDate(calendarRange.to) : from;

    updateUrl({ dateFrom: from, dateTo: to });
    saveFilterPreference({ dateRange: undefined, dateFrom: from, dateTo: to });
    setPopoverOpen(false);
  }

  // Display label
  const parsedFrom = urlDateFrom
    ? parseLocalDateString(urlDateFrom)
    : undefined;
  const parsedTo = urlDateTo ? parseLocalDateString(urlDateTo) : undefined;

  const displayLabel =
    isCustomMode && parsedFrom && parsedTo
      ? formatDateRangeDisplay(parsedFrom, parsedTo)
      : isCustomMode && parsedFrom
        ? `${parsedFrom.getMonth() + 1}/${parsedFrom.getDate()} -`
        : isCustomMode && parsedTo
          ? `- ${parsedTo.getMonth() + 1}/${parsedTo.getDate()}`
          : getDateRangeLabel(currentPreset);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CalendarIcon className="h-4 w-4 shrink-0 text-[var(--tt-color-text-muted)]" />
      <div className="flex items-center gap-1">
        <Select
          value={currentPreset}
          onValueChange={handlePresetChange}
          onOpenChange={(open) => open && preloadCalendar()}
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

        <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={`h-9 w-9 shrink-0 ${isCustomMode ? 'border-primary text-primary' : ''}`}
              data-testid="date-range-calendar-trigger"
              aria-label="カレンダーで日付を選択"
              onPointerEnter={preloadCalendar}
              onFocus={preloadCalendar}
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0"
            align="start"
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <div className="p-3">
              <Calendar
                mode="range"
                selected={calendarRange}
                onSelect={setCalendarRange}
                numberOfMonths={shownMonths.length}
                disabled={[{ before: threeMonthsAgo }, { after: today }]}
                defaultMonth={defaultMonth}
                data-testid="date-range-calendar"
                fallback={<CalendarFrame months={shownMonths} loading />}
                errorFallback={
                  <CalendarFrame months={shownMonths}>
                    <LazyLoadFailed />
                  </CalendarFrame>
                }
              />
              <div className="flex justify-between border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCalendarRange(undefined)}
                  disabled={!calendarRange}
                  data-testid="date-range-calendar-clear"
                >
                  クリア
                </Button>
                <div className="flex gap-2">
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
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
