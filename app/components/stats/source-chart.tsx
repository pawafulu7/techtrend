'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart } from 'lucide-react';
import { getSourceColor } from '@/lib/utils/source-colors';

interface SourceChartProps {
  data: { id: string; name: string; count: number; percentage: number }[];
}

export function SourceChart({ data }: SourceChartProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="h-5 w-5" />
          ソース別記事分布
        </CardTitle>
        <CardDescription>各ソースの記事数と割合</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.map((source) => {
            const color = getSourceColor(source.name);
            const percentage = total > 0 ? (source.count / total) * 100 : 0;
            
            return (
              <div key={source.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className={`h-3 w-3 rounded-full ${color.dot}`}
                    />
                    <span className="text-sm font-medium">{source.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {source.count.toLocaleString()}件
                    </span>
                    <span className="text-sm font-medium">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${color.bar}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">合計</span>
            <span className="font-bold">{total.toLocaleString()}件</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}