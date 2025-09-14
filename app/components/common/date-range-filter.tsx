'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import { DATE_RANGE_OPTIONS, getDateRangeLabel } from '@/app/lib/date-utils';

interface DateRangeFilterProps {
  className?: string;
}

export function DateRangeFilter({ className = '' }: DateRangeFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRange = searchParams.get('dateRange') || 'all';

  const handleDateRangeChange = async (value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value === 'all') {
      params.delete('dateRange');
    } else {
      params.set('dateRange', value);
    }

    // ページ番号をリセット
    params.delete('page');

    // URLを更新
    const newUrl = `/?${params.toString()}`;
    router.push(newUrl);

    // E2Eテスト環境またはCI環境では、URLの更新を確実にするため少し待機
    // production環境では待機しない
    if (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || process.env.NODE_ENV === 'test')) {
      // CI環境では長めに待機
      const waitTime = process.env.CI ? 200 : 100;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Update filter preferences cookie
    try {
      await fetch('/api/filter-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRange: value === 'all' ? undefined : value }),
      });
    } catch {
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Calendar className="w-4 h-4 text-gray-500" />
      <Select
        value={currentRange}
        onValueChange={handleDateRangeChange}
        data-testid="date-range-filter"
      >
        <SelectTrigger className="w-[140px]" data-testid="date-range-trigger">
          <SelectValue placeholder="期間を選択">
            {getDateRangeLabel(currentRange)}
          </SelectValue>
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
        </SelectContent>
      </Select>
    </div>
  );
}