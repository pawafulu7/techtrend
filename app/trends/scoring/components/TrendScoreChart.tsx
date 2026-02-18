'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useChartColors } from '@/app/components/trends/useChartColors';

interface ScoreHistoryPoint {
  calculatedAt: string;
  score: number;
}

interface TrendScoreChartProps {
  data: ScoreHistoryPoint[];
  loading?: boolean;
}

export default function TrendScoreChart({
  data,
  loading = false,
}: TrendScoreChartProps) {
  const colors = useChartColors();

  if (loading) {
    return (
      <div className="h-[250px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[250px] items-center justify-center">
        No history data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart
        data={data}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="calculatedAt"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => {
            const date = new Date(value);
            return `${date.getMonth() + 1}/${date.getDate()}`;
          }}
        />
        <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
        <Tooltip
          labelFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('ja-JP');
          }}
          formatter={(value: number | undefined) => [
            value != null ? value.toFixed(1) : '0',
            'Score',
          ]}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke={colors[0]}
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
