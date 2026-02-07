'use client';

import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { PieChartIcon } from 'lucide-react';
import { useChartColors } from './useChartColors';

interface SourceData {
  name: string;
  value: number;
  percentage: number;
  [key: string]: string | number | undefined; // Recharts ChartDataInput compatibility
}

interface SourcePieChartProps {
  data: SourceData[];
  loading?: boolean;
}

// Rechartsのlabelプロパティ用の型定義（Rechartsの内部型に準拠）
interface LabelRenderProps {
  cx?: string | number;
  cy?: string | number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}

// CustomTooltip用のPayload型
interface SourceTooltipPayload {
  name: string;
  value: number;
  payload: SourceData;
}

// カスタムツールチップコンポーネント（トップレベルに移動）
const SourcePieChartTooltip = React.memo(function SourcePieChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: SourceTooltipPayload[];
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background rounded-lg border p-2 shadow-sm">
        <p className="font-semibold">{payload[0].name}</p>
        <p className="text-muted-foreground text-sm">
          記事数: {payload[0].value}件
        </p>
        <p className="text-muted-foreground text-sm">
          割合: {payload[0].payload.percentage}%
        </p>
      </div>
    );
  }
  return null;
});

// カスタムラベルレンダリング関数（トップレベルに移動）
const renderCustomizedLabel = (props: LabelRenderProps): React.ReactNode => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  // 必須プロパティが存在しない場合は早期リターン
  if (
    cx == null ||
    cy == null ||
    midAngle == null ||
    innerRadius == null ||
    outerRadius == null ||
    percent == null
  ) {
    return null;
  }

  // cx, cyを数値に変換（文字列の場合があるため）
  const numCx = typeof cx === 'string' ? parseFloat(cx) : cx;
  const numCy = typeof cy === 'string' ? parseFloat(cy) : cy;

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = numCx + radius * Math.cos(-midAngle * RADIAN);
  const y = numCy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null; // 5%未満は表示しない

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > numCx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize="12"
      fontWeight="bold"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export function SourcePieChart({ data, loading = false }: SourcePieChartProps) {
  const colors = useChartColors();

  if (loading) {
    return (
      <div className="bg-background rounded-lg border p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-(--tt-color-info)" />
          <h3 className="text-sm font-semibold">ソース別記事分布</h3>
        </div>
        <div className="h-[300px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-background rounded-lg border p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-(--tt-color-info)" />
          <h3 className="text-sm font-semibold">ソース別記事分布</h3>
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
        <PieChartIcon className="h-4 w-4 text-(--tt-color-info)" />
        <h3 className="text-sm font-semibold">ソース別記事分布</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="40%"
            labelLine={false}
            label={renderCustomizedLabel}
            outerRadius={70}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={colors[index % colors.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<SourcePieChartTooltip />} />
          <Legend
            verticalAlign="bottom"
            height={100}
            wrapperStyle={{
              paddingTop: '10px',
              maxHeight: '100px',
              overflow: 'auto',
            }}
            formatter={(value, entry) => (
              <span style={{ fontSize: 12 }}>
                {value} (
                {entry?.payload && 'percentage' in entry.payload
                  ? entry.payload.percentage
                  : 0}
                %)
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
