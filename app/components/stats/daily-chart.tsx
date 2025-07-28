'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays } from 'lucide-react';
import { getSourceColor } from '@/lib/utils/source-colors';

interface DailyChartProps {
  data: { 
    date: string; 
    total: number; 
    sources: Record<string, number> 
  }[];
}

export function DailyChart({ data }: DailyChartProps) {
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
          <div className="absolute inset-0 flex items-end justify-between gap-1">
            {data.map((item, index) => {
              const totalHeight = maxCount > 0 ? (item.total / maxCount) * 100 : 0;
              const date = new Date(item.date);
              
              // 各ソースの高さを計算
              let cumulativeHeight = 0;
              const sourceHeights = allSources.map(source => {
                const count = item.sources[source] || 0;
                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                const result = { source, height, offset: cumulativeHeight };
                cumulativeHeight += height;
                return result;
              }).filter(s => s.height > 0);
              
              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div className="w-full flex items-end relative" style={{ height: chartHeight - 40 }}>
                    {sourceHeights.map(({ source, height, offset }) => (
                      <div
                        key={source}
                        className={`absolute bottom-0 w-full transition-all duration-300 hover:opacity-80 ${
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
                        title={`${item.date} - ${source}: ${item.sources[source]}件`}
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