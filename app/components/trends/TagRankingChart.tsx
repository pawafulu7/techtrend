'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';

interface TagRankingData {
  name: string;
  count: number;
}

interface TagRankingChartProps {
  data: TagRankingData[];
  loading?: boolean;
}

// TagRankingChart用のTooltip Payload型
interface TagTooltipPayload {
  value: number;
  payload: TagRankingData;
}

// カスタムツールチップコンポーネント（トップレベルに移動）
const TagRankingChartTooltip = React.memo(function TagRankingChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TagTooltipPayload[];
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background rounded-lg border p-2 shadow-sm">
        <p className="font-semibold">{payload[0].payload.name}</p>
        <p className="text-muted-foreground text-sm">
          記事数: {payload[0].value}件
        </p>
      </div>
    );
  }
  return null;
});

export function TagRankingChart({
  data,
  loading = false,
}: TagRankingChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            人気タグランキング
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            人気タグランキング
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-[300px] items-center justify-center">
            データがありません
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          人気タグランキング
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 60,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              interval={0}
              tick={{ fontSize: 11 }}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<TagRankingChartTooltip />} />
            <Bar dataKey="count" fill="#8884d8" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
