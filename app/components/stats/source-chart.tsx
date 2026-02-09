'use client';

import { PieChart } from 'lucide-react';
import { getSourceColor } from '@/lib/utils/source-colors';

interface SourceChartProps {
  data: { id: string; name: string; count: number; percentage: number }[];
}

export function SourceChart({ data }: SourceChartProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

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

      {/* 積み上げバー */}
      <div className="mb-3 flex h-3 overflow-hidden rounded-full">
        {data.map((source) => {
          const color = getSourceColor(source.name);
          const percentage = total > 0 ? (source.count / total) * 100 : 0;
          if (percentage < 0.5) return null;
          return (
            <div
              key={source.id}
              className={`${color.bar} transition-all duration-500`}
              style={{ width: `${percentage}%` }}
              title={`${source.name}: ${percentage.toFixed(1)}%`}
            />
          );
        })}
      </div>

      {/* 凡例 */}
      <div
        className="grid grid-flow-col grid-rows-[repeat(auto-fill,minmax(0,1fr))] gap-x-4 gap-y-1"
        style={{
          gridTemplateRows: `repeat(${Math.ceil(data.length / 2)}, minmax(0, 1fr))`,
        }}
      >
        {data.map((source) => {
          const color = getSourceColor(source.name);
          const percentage = total > 0 ? (source.count / total) * 100 : 0;

          return (
            <div key={source.id} className="flex items-center gap-1.5">
              <div className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
              <span className="truncate text-xs">{source.name}</span>
              <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                {percentage.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
