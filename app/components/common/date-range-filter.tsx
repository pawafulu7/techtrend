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

  const handleDateRangeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (value === 'all') {
      params.delete('dateRange');
    } else {
      params.set('dateRange', value);
    }
    
    // ページ番号をリセット
    params.delete('page');
    
    router.push(`/?${params.toString()}`);
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