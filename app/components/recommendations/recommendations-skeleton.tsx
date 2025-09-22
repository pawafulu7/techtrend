import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function RecommendationsSkeleton() {
  return (
    <div className="space-y-6">
      {/* ヘッダー部分のスケルトン */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-9 w-20" />
      </div>

      {/* 記事カードのスケルトン */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(12)].map((_, i) => (
          <Card key={i} className="overflow-hidden" data-testid="recommendation-skeleton-card">
            <CardHeader className="pb-3">
              {/* サムネイル */}
              <Skeleton className="h-48 w-full rounded-md mb-3" />

              {/* タイトル */}
              <Skeleton className="h-6 w-full mb-2" />
              <Skeleton className="h-6 w-3/4" />
            </CardHeader>

            <CardContent className="space-y-3">
              {/* 要約 */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>

              {/* メタ情報 */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-1 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>

              {/* タグ */}
              <div className="flex flex-wrap gap-1">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>

              {/* 推薦理由 */}
              <div className="pt-2 border-t">
                <Skeleton className="h-3 w-20 mb-2" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>

              {/* アクションボタン */}
              <div className="flex justify-between items-center pt-2">
                <Skeleton className="h-8 w-24" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-8 rounded" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 情報アラートのスケルトン */}
      <Card className="p-4">
        <div className="flex gap-3">
          <Skeleton className="h-4 w-4 mt-0.5" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      </Card>
    </div>
  );
}

/**
 * 単体の推薦カード用スケルトン
 */
export function RecommendationCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <Skeleton className="h-48 w-full rounded-md mb-3" />
        <Skeleton className="h-6 w-full mb-2" />
        <Skeleton className="h-6 w-3/4" />
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>

        <div className="flex flex-wrap gap-1">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}