'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays } from 'lucide-react';

interface DailyChartProps {
  data: { date: string; count: number }[];
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

  const maxCount = Math.max(...data.map(d => d.count));
  const chartHeight = 200;

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
              const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
              const date = new Date(item.date);
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              
              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div className="w-full flex items-end" style={{ height: chartHeight - 40 }}>
                    <div
                      className={`w-full rounded-t transition-all duration-300 hover:opacity-80 ${
                        isWeekend ? 'bg-primary/60' : 'bg-primary'
                      }`}
                      style={{ height: `${height}%` }}
                      title={`${item.date}: ${item.count}件`}
                    />
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
      </CardContent>
    </Card>
  );
}