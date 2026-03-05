import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Radio, Users, TrendingUp } from 'lucide-react';
import { prisma } from '@/lib/database';

async function getStats() {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const jstToday = new Date(
    Date.UTC(
      jstNow.getUTCFullYear(),
      jstNow.getUTCMonth(),
      jstNow.getUTCDate()
    ) - jstOffset
  );

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
    title: 'Total Articles',
    icon: FileText,
    format: (n: number) => n.toLocaleString(),
  },
  {
    key: 'sourceCount',
    title: 'Active Sources',
    icon: Radio,
    format: (n: number) => String(n),
  },
  {
    key: 'userCount',
    title: 'Registered Users',
    icon: Users,
    format: (n: number) => String(n),
  },
  {
    key: 'todayArticleCount',
    title: "Today's Articles",
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
          Overview of TechTrend platform statistics.
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
