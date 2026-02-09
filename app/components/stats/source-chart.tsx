'use client';

import { PieChart } from 'lucide-react';
import { getSourceColor } from '@/lib/utils/source-colors';

interface SourceChartProps {
  data: { id: string; name: string; count: number; percentage: number }[];
}

const MIN_BAR_PERCENTAGE = 0.5;

export function SourceChart({ data }: SourceChartProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const visibleData = data.filter(
    (s) => s.percentage >= MIN_BAR_PERCENTAGE || s.id === '_others'
  );
  const visibleTotal = visibleData.reduce((sum, s) => sum + s.percentage, 0);

  return (
    <div className="bg-background rounded-lg border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-(--tt-color-info)" />
          <h3 className="text-sm font-semibold">ソース別記事分布</h3>
        </div>
        <span className="text-muted-foreground text-xs">
          {total.toLocaleString()}件
        </span>
      </div>

      {/* 積み上げバー（幅を正規化して常に100%にする） */}
      <div className="mb-3 flex h-3 overflow-hidden rounded-full">
        {visibleData.map((source) => {
          const color = getSourceColor(source.name);
          const normalizedWidth =
            visibleTotal > 0 ? (source.percentage / visibleTotal) * 100 : 0;
          return (
            <div
              key={source.id}
              className={`${color.bar} transition-all duration-500`}
              style={{ width: `${normalizedWidth}%` }}
              title={`${source.name}: ${source.percentage.toFixed(1)}%`}
            />
          );
        })}
      </div>

      {/* 凡例（バーに表示されるソースのみ） */}
      <div
        className="grid grid-flow-col gap-x-4 gap-y-1"
        style={{
          gridTemplateRows: `repeat(${Math.ceil(visibleData.length / 2)}, minmax(0, 1fr))`,
        }}
      >
        {visibleData.map((source) => {
          const color = getSourceColor(source.name);
          return (
            <div key={source.id} className="flex items-center gap-1.5">
              <div className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
              <span className="truncate text-xs">{source.name}</span>
              <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                {source.percentage.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
