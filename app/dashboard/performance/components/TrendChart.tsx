'use client';

import React, { useMemo, useId, useCallback } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TrendChartProps, TimeSeriesData } from '../types/dashboard';

// カスタムツールチップ用のProps型
interface TrendChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  format?: (value: number) => string;
  color?: string;
}

// カスタムツールチップコンポーネント（トップレベルに移動）
const TrendChartTooltip = React.memo(function TrendChartTooltip({
  active,
  payload,
  label,
  format,
  color = '#3b82f6',
}: TrendChartTooltipProps) {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    const formattedValue = format ? format(value) : value.toFixed(1);

    return (
      <div className="rounded-lg border bg-white p-3 shadow-lg">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-bold" style={{ color }}>
          {formattedValue}
        </p>
      </div>
    );
  }
  return null;
});

// Y軸フォーマット関数を生成するヘルパー
const createFormatYAxis = (format?: (value: number) => string) => {
  return (value: number) => {
    if (format) {
      return format(value);
    }
    return value.toFixed(0);
  };
};

/**
 * トレンドチャートコンポーネント
 * 時系列データを線グラフで表示
 */
export const TrendChart: React.FC<TrendChartProps> = ({
  title,
  data,
  dataKey = 'value',
  color = '#3b82f6',
  height = 300,
  format,
}) => {
  // データのフォーマット
  const formattedData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      [dataKey]:
        typeof item.value === 'number'
          ? item.value
          : parseFloat(item.value as any),
    }));
  }, [data, dataKey]);

  // Y軸のフォーマット関数をメモ化
  const formatYAxis = useCallback(createFormatYAxis(format), [format]);

  // ツールチップにformat/colorを渡すためのレンダーコールバック
  const renderTooltip = useCallback(
    (props: any) => (
      <TrendChartTooltip {...props} format={format} color={color} />
    ),
    [format, color]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={formattedData}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxis}
            />
            <Tooltip content={renderTooltip} />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

/**
 * マルチラインチャート
 * 複数の指標を同時に表示
 */
export const MultiLineChart: React.FC<{
  title: string;
  data: any[];
  lines: Array<{
    dataKey: string;
    color: string;
    name: string;
  }>;
  height?: number;
}> = ({ title, data, lines, height = 300 }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={data}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip />
            <Legend />
            {lines.map((line) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                stroke={line.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                name={line.name}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

/**
 * バーチャート
 * カテゴリ別の値を棒グラフで表示
 */
export const MetricsBarChart: React.FC<{
  title: string;
  data: any[];
  dataKey: string;
  color?: string;
  height?: number;
}> = ({ title, data, dataKey, color = '#3b82f6', height = 300 }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip />
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

/**
 * エリアチャート
 * 累積値や範囲を視覚的に表示
 */
export const MetricsAreaChart: React.FC<{
  title: string;
  data: TimeSeriesData[];
  dataKey?: string;
  color?: string;
  height?: number;
  gradient?: boolean;
}> = ({
  title,
  data,
  dataKey = 'value',
  color = '#3b82f6',
  height = 300,
  gradient = true,
}) => {
  const id = useId();
  const gradientId = `gradient-${id}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart
            data={data}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          >
            {gradient && (
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
            )}
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              fill={gradient ? `url(#${gradientId})` : color}
              fillOpacity={gradient ? 1 : 0.3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default TrendChart;
