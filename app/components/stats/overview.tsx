import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Calendar, BarChart3, Activity } from 'lucide-react';

interface StatsOverviewProps {
  stats: {
    total: number;
    last7Days: number;
    last30Days: number;
    averagePerDay: number;
  };
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  const growthRate = stats.last7Days > 0 && stats.averagePerDay > 0
    ? Math.round(((stats.last7Days / 7) / stats.averagePerDay - 1) * 100)
    : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">総記事数</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            全期間の記事数
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">過去7日間</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.last7Days.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            週間取得記事数
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">過去30日間</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.last30Days.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            月間取得記事数
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">成長率</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {growthRate > 0 ? '+' : ''}{growthRate}%
          </div>
          <p className="text-xs text-muted-foreground">
            平均比（過去7日間）
          </p>
        </CardContent>
      </Card>
    </div>
  );
}