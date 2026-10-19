'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type ActiveDotProps,
  type DotItemDotProps,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useChartColors } from './useChartColors';
import { ErrorState } from '@/components/ui-v2/error-state';

/** 系列ごとの線の種類（色だけで見分けなくてよいように。10 系列を 5 種 × 点の形 5 種で分ける） */
const SERIES_DASHES = ['0', '6 3', '2 3', '10 4 2 4', '1 5'] as const;
type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross';
const SERIES_MARKERS: readonly MarkerShape[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'cross',
];

/** 系列 index の線の種類と点の形。5 系列ごとに点の形をずらし、同じ組み合わせが出ないようにする */
export function seriesStyle(index: number): {
  dash: string;
  marker: MarkerShape;
} {
  const dash = SERIES_DASHES[index % SERIES_DASHES.length];
  const marker =
    SERIES_MARKERS[
      (index + Math.floor(index / SERIES_DASHES.length)) % SERIES_MARKERS.length
    ];
  return { dash, marker };
}

interface MarkerProps {
  cx?: number;
  cy?: number;
  stroke?: string;
  shape: MarkerShape;
  size: number;
}

/** 折れ線の点。塗りは面の色にし、線の色で縁取る（線の種類と同じく、色以外でも系列を見分けるため） */
function SeriesMarker({ cx, cy, stroke, shape, size }: MarkerProps) {
  if (cx === undefined || cy === undefined) return null;
  const common = {
    stroke,
    strokeWidth: 1.5,
    fill: 'var(--tt-color-surface)',
  };
  switch (shape) {
    case 'square':
      return (
        <rect
          x={cx - size}
          y={cy - size}
          width={size * 2}
          height={size * 2}
          {...common}
        />
      );
    case 'triangle':
      return (
        <polygon
          points={`${cx},${cy - size * 1.2} ${cx + size * 1.1},${cy + size * 0.8} ${cx - size * 1.1},${cy + size * 0.8}`}
          {...common}
        />
      );
    case 'diamond':
      return (
        <polygon
          points={`${cx},${cy - size * 1.3} ${cx + size * 1.3},${cy} ${cx},${cy + size * 1.3} ${cx - size * 1.3},${cy}`}
          {...common}
        />
      );
    case 'cross':
      return (
        <path
          d={`M${cx - size},${cy - size} L${cx + size},${cy + size} M${cx + size},${cy - size} L${cx - size},${cy + size}`}
          stroke={stroke}
          strokeWidth={2}
        />
      );
    default:
      return <circle cx={cx} cy={cy} r={size} {...common} />;
  }
}

/** 日付のキー（YYYY-MM-DD、日本時間の暦日）を、閲覧者のタイムゾーンに左右されずに M/D にする */
export function formatDateTick(value: unknown): string {
  const [, month, day] = String(value).split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : String(value);
}

/** 日付のキー（YYYY-MM-DD）を Y/M/D にする（ツールチップ） */
export function formatDateLabel(value: unknown): string {
  const [year, month, day] = String(value).split('-');
  return year && month && day
    ? `${year}/${Number(month)}/${Number(day)}`
    : String(value);
}

/**
 * 凡例。色・線の種類・点の形の3つを並べ、色だけに頼らず系列名と線を対応付ける
 * （Recharts の既定の凡例は点の形だけを描き、線の種類を描かない）
 */
function SeriesLegend({
  tags,
  colors,
}: {
  tags: readonly string[];
  colors: readonly string[];
}) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-5 text-xs">
      {tags.map((tag, index) => {
        const { dash, marker } = seriesStyle(index);
        const color = colors[index % colors.length];
        return (
          <li key={tag} className="flex items-center gap-1.5">
            <svg width="28" height="12" aria-hidden="true" focusable="false">
              <line
                x1="0"
                y1="6"
                x2="28"
                y2="6"
                stroke={color}
                strokeWidth={2}
                strokeDasharray={dash}
              />
              <SeriesMarker cx={14} cy={6} stroke={color} shape={marker} size={3} />
            </svg>
            <span>{tag}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface TrendLineChartProps {
  data: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  tags: string[];
  loading?: boolean;
  /** 取得に失敗した。空（データがありません）とは別に表示する */
  error?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}

export function TrendLineChart({
  data,
  tags,
  loading = false,
  error = false,
  onRetry,
  retrying = false,
}: TrendLineChartProps) {
  const colors = useChartColors();

  if (loading) {
    return (
      <div className="bg-background rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="text-tt-primary h-4 w-4" />
          <h3 className="text-h3">タグトレンドの推移</h3>
        </div>
        <div className="h-[300px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-background rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="text-tt-primary h-4 w-4" />
          <h3 className="text-h3">タグトレンドの推移</h3>
        </div>
        <ErrorState
          title="タグトレンドの推移を読み込めませんでした"
          description="時間をおいて再試行してください。"
          onRetry={onRetry}
          retrying={retrying}
          className="h-[300px]"
        />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-background rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="text-tt-primary h-4 w-4" />
          <h3 className="text-h3">タグトレンドの推移</h3>
        </div>
        <div className="text-muted-foreground flex h-[300px] items-center justify-center">
          データがありません
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="text-tt-primary h-4 w-4" />
        <h3 className="text-h3">タグトレンドの推移</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          {/* 日付は日本時間の暦日の文字列（lib/services/trend-analysis.ts）。Date に戻すと UTC の 0 時として読まれ、
              UTC より西の閲覧者には前日の日付が出るので、文字列のまま整形する */}
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickFormatter={formatDateTick}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            labelFormatter={(value) =>
              typeof value === 'string' ? formatDateLabel(value) : value
            }
          />
          <Legend content={() => <SeriesLegend tags={tags} colors={colors} />} />
          {tags.map((tag, index) => {
            const { dash, marker } = seriesStyle(index);
            return (
              <Line
                key={tag}
                type="monotone"
                dataKey={tag}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                strokeDasharray={dash}
                dot={(props: DotItemDotProps) => (
                  <SeriesMarker
                    key={`${tag}-${props.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    stroke={colors[index % colors.length]}
                    shape={marker}
                    size={3}
                  />
                )}
                activeDot={(props: ActiveDotProps) => (
                  <SeriesMarker
                    cx={props.cx}
                    cy={props.cy}
                    stroke={colors[index % colors.length]}
                    shape={marker}
                    size={5}
                  />
                )}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
