'use client';

import { CalendarDays } from 'lucide-react';
import { getSourceColor } from '@/lib/utils/source/source-colors';
import { useState } from 'react';

interface DailyChartProps {
  data: {
    date: string;
    total: number;
    sources: Record<string, number>;
  }[];
}

export function DailyChart({ data }: DailyChartProps) {
  const [hoveredBar, setHoveredBar] = useState<{
    date: string;
    total: number;
    sources: Record<string, number>;
    x: number;
    y: number;
  } | null>(null);

  if (data.length === 0) {
    return (
      <div className="bg-background rounded-lg border p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-(--tt-color-info)" />
          <h3 className="text-sm font-semibold">日別記事数推移</h3>
        </div>
        <p className="text-muted-foreground py-8 text-center text-sm">
          データがありません
        </p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.total));
  const chartHeight = 200;

  const allSources = [
    ...new Set(data.flatMap((d) => Object.keys(d.sources))),
  ].sort();
  const sourceColors = Object.fromEntries(
    allSources.map((source) => [source, getSourceColor(source)])
  );

  return (
    <div className="bg-background rounded-lg border p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-(--tt-color-info)" />
        <h3 className="text-sm font-semibold">日別記事数推移</h3>
        <span className="text-muted-foreground text-xs">過去30日間</span>
      </div>
      <div className="relative" style={{ height: chartHeight }}>
        {hoveredBar && (
          <div
            className="bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded-md border p-3 text-sm whitespace-nowrap shadow-lg"
            style={{
              left: `${hoveredBar.x}px`,
              top: `${hoveredBar.y}px`,
              transform: 'translate(-50%, -100%) translateY(-8px)',
            }}
          >
            <div className="mb-1 font-medium">{hoveredBar.date}</div>
            <div className="text-primary mb-2 font-medium">
              合計: {hoveredBar.total}件
            </div>
            <div className="space-y-1">
              {Object.entries(hoveredBar.sources)
                .sort(([, a], [, b]) => b - a)
                .map(([source, count]) => (
                  <div key={source} className="text-muted-foreground">
                    {source}: {count}件
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="absolute inset-0 flex items-end justify-between gap-1">
          {data.map((item, index) => {
            const date = new Date(item.date);

            let cumulativeHeight = 0;
            const sourceHeights = allSources
              .map((source) => {
                const count = item.sources[source] || 0;
                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                const result = {
                  source,
                  height,
                  offset: cumulativeHeight,
                  count,
                };
                cumulativeHeight += height;
                return result;
              })
              .filter((s) => s.height > 0);

            return (
              <div
                key={index}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className="relative flex w-full items-end"
                  style={{ height: chartHeight - 20 }}
                >
                  {sourceHeights.map(
                    ({ source, height, offset, count: _count }) => (
                      <div
                        key={source}
                        className={`absolute bottom-0 w-full cursor-pointer transition-all duration-300 hover:opacity-80 ${
                          index === 0 ? 'rounded-tl' : ''
                        } ${index === data.length - 1 ? 'rounded-tr' : ''} ${
                          sourceColors[source].bar
                        }`}
                        style={{
                          height: `${height}%`,
                          bottom: `${offset}%`,
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const parentRect =
                            e.currentTarget.parentElement!.parentElement!.parentElement!.getBoundingClientRect();
                          setHoveredBar({
                            date: item.date,
                            total: item.total,
                            sources: item.sources,
                            x: rect.left + rect.width / 2 - parentRect.left,
                            y: rect.top - parentRect.top,
                          });
                        }}
                        onMouseLeave={() => setHoveredBar(null)}
                      />
                    )
                  )}
                </div>
                <div className="text-muted-foreground text-xs">
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
        <span>
          {new Date(data[0].date).toLocaleDateString('ja-JP', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
        <span>最大: {maxCount}件/日</span>
        <span>
          {new Date(data[data.length - 1].date).toLocaleDateString('ja-JP', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {allSources.map((source) => (
          <div key={source} className="flex items-center gap-1 text-xs">
            <div className={`h-3 w-3 rounded ${sourceColors[source].dot}`} />
            <span className="text-muted-foreground">{source}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
