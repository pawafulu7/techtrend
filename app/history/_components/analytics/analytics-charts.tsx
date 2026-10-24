'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { TabsContent } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface AnalyticsChartTabsProps {
  dailyData: { date: string; articles: number; time: number }[];
  tagData: { name: string; value: number }[];
  hourlyData: { hour: string; value: number }[];
  sourceData: { name: string; value: number }[];
  colors: string[];
}

/**
 * 読書分析の4つのタブ（概要・タグ・時間・ソース）のグラフ。Tabs の中に置く。
 * analytics-content.tsx から切り出した（400行を超えていたため。Issue #700 の PR で分割）
 */
export function AnalyticsChartTabs({
  dailyData,
  tagData,
  hourlyData,
  sourceData,
  colors,
}: AnalyticsChartTabsProps) {
  return (
    <>
      <TabsContent value="overview" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>日別読書量</CardTitle>
          </CardHeader>
          <CardContent data-testid="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="articles"
                  stroke={colors[0]}
                  name="記事数"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="time"
                  stroke={colors[1]}
                  name="時間（分）"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tags" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>興味分野TOP10</CardTitle>
          </CardHeader>
          <CardContent data-testid="chart-container">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={tagData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="value" fill={colors[0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="time" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>時間帯別活動</CardTitle>
          </CardHeader>
          <CardContent data-testid="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill={colors[0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sources" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>ソース別分布</CardTitle>
          </CardHeader>
          <CardContent data-testid="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: any) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill={colors[0]}
                  dataKey="value"
                >
                  {sourceData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={colors[index % colors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>
    </>
  );
}
