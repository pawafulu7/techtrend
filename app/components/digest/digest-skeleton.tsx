import { Skeleton } from '@/components/ui/skeleton';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { LoadingOverlay } from '@/app/components/common/loading-overlay';

// ダイジェストの読み込み中の表示（issue #701）。DigestSection（見出し＋カードのグリッド）と
// DigestArticleCard（カテゴリ・タイトル・要約・日付）の寸法をなぞる
function DigestCardSkeleton() {
  return (
    <CardV2>
      <div className="space-y-2 p-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="mt-1 h-3 w-24" />
      </div>
    </CardV2>
  );
}

export function DigestSkeleton() {
  return (
    <LoadingOverlay message="ダイジェストを読み込んでいます...">
      <div className="space-y-8">
        {[0, 1].map((section) => (
          <div key={section} className="@container">
            <Skeleton className="mb-3 h-6 w-40" />
            <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @lg:grid-cols-3 @xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <DigestCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </LoadingOverlay>
  );
}
