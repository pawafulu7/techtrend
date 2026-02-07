'use client';

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

interface TrendLineChartProps {
  data: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  tags: string[];
  loading?: boolean;
}

const FALLBACK_COLORS = [
  '#3B82F6',
  '#22C55E',
  '#F97316',
  '#EF4444',
  '#16A34A',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#d97706',
  '#6366f1',
];

function useChartColors(): string[] {
  return useMemo(() => {
    if (typeof document === 'undefined') return FALLBACK_COLORS;
    const style = getComputedStyle(document.documentElement);
    const vars = [
      '--tt-color-info',
      '--tt-color-positive',
      '--tt-color-secondary',
      '--tt-color-negative',
      '--tt-color-primary',
    ];
    const resolved = vars.map((v) => style.getPropertyValue(v).trim());
    if (resolved.every((c) => c)) {
      return [
        ...resolved,
        '#8b5cf6',
        '#ec4899',
        '#06b6d4',
        '#d97706',
        '#6366f1',
      ];
    }
    return FALLBACK_COLORS;
  }, []);
}

export function TrendLineChart({
  data,
  tags,
  loading = false,
}: TrendLineChartProps) {
  const colors = useChartColors();

  if (loading) {
    return (
      <div className="bg-background rounded-lg border p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-(--tt-color-secondary)" />
          <h3 className="text-sm font-semibold">タグトレンドの推移</h3>
        </div>
        <div className="h-[300px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-background rounded-lg border p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-(--tt-color-secondary)" />
          <h3 className="text-sm font-semibold">タグトレンドの推移</h3>
        </div>
        <div className="text-muted-foreground flex h-[300px] items-center justify-center">
          データがありません
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background rounded-lg border p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-(--tt-color-secondary)" />
        <h3 className="text-sm font-semibold">タグトレンドの推移</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()}`;
            }}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            labelFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString('ja-JP');
            }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
          {tags.map((tag, index) => (
            <Line
              key={tag}
              type="monotone"
              dataKey={tag}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
