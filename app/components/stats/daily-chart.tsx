'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays } from 'lucide-react';
import { getSourceColor } from '@/lib/utils/source-colors';
import { useState } from 'react';

interface DailyChartProps {
  data: { 
    date: string; 
    total: number; 
    sources: Record<string, number> 
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            日別記事数推移
          </CardTitle>
          <CardDescription>過去30日間の記事取得数</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            データがありません
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...data.map(d => d.total));
  const chartHeight = 200;
  
  // すべてのソースを取得して色を割り当て
  const allSources = [...new Set(data.flatMap(d => Object.keys(d.sources)))].sort();
  const sourceColors = Object.fromEntries(
    allSources.map(source => [source, getSourceColor(source)])
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          日別記事数推移
        </CardTitle>
        <CardDescription>過去30日間の記事取得数</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative" style={{ height: chartHeight }}>
          {/* ツールチップ */}
          {hoveredBar && (
            <div
              className="absolute z-10 bg-popover text-popover-foreground border rounded-md shadow-lg p-3 text-sm pointer-events-none whitespace-nowrap"
              style={{
                left: `${hoveredBar.x}px`,
                top: `${hoveredBar.y}px`,
                transform: 'translate(-50%, -100%) translateY(-8px)',
              }}
            >
              <div className="font-medium mb-1">{hoveredBar.date}</div>
              <div className="font-medium text-primary mb-2">
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
              const totalHeight = maxCount > 0 ? (item.total / maxCount) * 100 : 0;
              const date = new Date(item.date);
              
              // 各ソースの高さを計算
              let cumulativeHeight = 0;
              const sourceHeights = allSources.map(source => {
                const count = item.sources[source] || 0;
                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                const result = { source, height, offset: cumulativeHeight, count };
                cumulativeHeight += height;
                return result;
              }).filter(s => s.height > 0);
              
              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div className="w-full flex items-end relative" style={{ height: chartHeight - 40 }}>
                    {sourceHeights.map(({ source, height, offset, count }) => (
                      <div
                        key={source}
                        className={`absolute bottom-0 w-full transition-all duration-300 hover:opacity-80 cursor-pointer ${
                          index === 0 ? 'rounded-tl' : ''
                        } ${
                          index === data.length - 1 ? 'rounded-tr' : ''
                        } ${
                          sourceColors[source].bar
                        }`}
                        style={{ 
                          height: `${height}%`,
                          bottom: `${offset}%`
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const parentRect = e.currentTarget.parentElement!.parentElement!.parentElement!.getBoundingClientRect();
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
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {date.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{new Date(data[0].date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</span>
          <span>最大: {maxCount}件/日</span>
          <span>{new Date(data[data.length - 1].date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {allSources.map(source => (
            <div key={source} className="flex items-center gap-1 text-xs">
              <div className={`h-3 w-3 rounded ${sourceColors[source].dot}`} />
              <span className="text-muted-foreground">{source}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}