import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Radio, Users, TrendingUp } from 'lucide-react';
import { prisma } from '@/lib/database';
import { getJSTToday } from '@/lib/utils/date';

async function getStats() {
  const jstToday = getJSTToday();

  const [articleCount, sourceCount, userCount, todayArticleCount] =
    await Promise.all([
      prisma.article.count(),
      prisma.source.count({ where: { enabled: true } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.article.count({ where: { publishedAt: { gte: jstToday } } }),
    ]);

  return { articleCount, sourceCount, userCount, todayArticleCount };
}

const statCards = [
  {
    key: 'articleCount',
    title: '記事総数',
    icon: FileText,
    format: (n: number) => n.toLocaleString(),
  },
  {
    key: 'sourceCount',
    title: 'アクティブソース',
    icon: Radio,
    format: (n: number) => String(n),
  },
  {
    key: 'userCount',
    title: '登録ユーザー',
    icon: Users,
    format: (n: number) => String(n),
  },
  {
    key: 'todayArticleCount',
    title: '本日の記事',
    icon: TrendingUp,
    format: (n: number) => String(n),
  },
] as const;

export default async function AdminDashboardPage() {
  const stats = await getStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          TechTrend プラットフォームの統計概要
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <card.icon className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {card.format(stats[card.key])}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
