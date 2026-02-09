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
      <div className="mb-3 flex items-center gap-2">
        <PieChart className="h-4 w-4 text-(--tt-color-info)" />
        <h3 className="text-sm font-semibold">ソース別記事分布</h3>
      </div>
      <div className="space-y-4">
        {data.map((source) => {
          const color = getSourceColor(source.name);
          const percentage = total > 0 ? (source.count / total) * 100 : 0;

          return (
            <div key={source.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${color.dot}`} />
                  <span className="text-sm font-medium">{source.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">
                    {source.count.toLocaleString()}件
                  </span>
                  <span className="text-sm font-medium">
                    {percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="bg-secondary h-2 overflow-hidden rounded-full">
                <div
                  className={`h-full transition-all duration-500 ${color.bar}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 border-t pt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">合計</span>
          <span className="font-bold">{total.toLocaleString()}件</span>
        </div>
      </div>
    </div>
  );
}
