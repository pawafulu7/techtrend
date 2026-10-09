import { Card, CardContent, CardHeader } from '@/components/ui-v2/card-v2';
import { LineChart } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui-v2/page-header';

export function AnalyticsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-3 pb-6">
      {/* 見出しは読み込み中も出す（h1 を常に1つ置く。Issue #700） */}
      <PageHeader
        icon={LineChart}
        title="読書分析"
        className="pb-6"
        actions={
          <>
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-10" />
          </>
        }
      />

      {/* サマリーカード */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="mb-1 h-8 w-16" />
              <Skeleton className="h-3 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* タブとグラフエリア */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-80" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
