'use client';

import { BookOpen, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ReadingStats } from '@/lib/reading-list/db';
import { cn } from '@/lib/utils';

interface ReadingListStatsProps {
  stats: ReadingStats;
  className?: string;
}

export function ReadingListStats({ stats, className }: ReadingListStatsProps) {
  const statItems = [
    {
      label: '合計',
      value: stats.totalItems,
      icon: BookOpen,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      label: '未読',
      value: stats.unreadItems,
      icon: BookOpen,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50'
    },
    {
      label: '読書中',
      value: stats.readingItems,
      icon: Clock,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    },
    {
      label: '読了',
      value: stats.completedItems,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      label: '今週の読了',
      value: stats.completedThisWeek,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    }
  ];

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-5 gap-3", className)}>
      {statItems.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", item.bgColor)}>
                  <Icon className={cn("h-5 w-5", item.color)} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}