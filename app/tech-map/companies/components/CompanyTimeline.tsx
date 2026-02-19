'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useChartColors } from '@/app/components/trends/useChartColors';

interface TimelineEntry {
  month: string;
  entities: { entityId: string; name: string; count: number }[];
}

interface CompanyTimelineProps {
  companyName: string;
  timeline: TimelineEntry[];
}

export default function CompanyTimeline({
  companyName,
  timeline,
}: CompanyTimelineProps) {
  const chartColors = useChartColors();

  if (timeline.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No timeline data available for {companyName}.
      </div>
    );
  }

  // Collect all unique technology names across timeline
  const techNames = Array.from(
    new Set(timeline.flatMap((t) => t.entities.map((e) => e.name)))
  );

  // Transform data for Recharts: each month becomes a row with tech names as keys
  const chartData = timeline.map((entry) => {
    const row: Record<string, string | number> = { month: entry.month };
    for (const entity of entry.entities) {
      row[entity.name] = entity.count;
    }
    return row;
  });

  return (
    <div>
      <h3 className="text-foreground mb-3 text-lg font-semibold">
        {companyName} - Technology Adoption Timeline
      </h3>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--tt-color-border)"
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: 'var(--tt-color-text-muted)' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--tt-color-text-muted)' }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--tt-color-surface)',
                border: '1px solid var(--tt-color-border)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {techNames.map((name, i) => (
              <Bar
                key={name}
                dataKey={name}
                stackId="a"
                fill={chartColors[i % chartColors.length]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
