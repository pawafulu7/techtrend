import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { PopularStatsBar } from '@/app/components/popular/popular-stats-bar';
import { PopularRankingSkeleton } from '@/app/components/popular/popular-skeletons';
import { LoadingOverlay } from '@/app/components/common/loading-overlay';

// 人気記事ランキングの初回待ち（issue #701）。PopularArticles の並び
// （件数バー・見出し・説明・指標のタブ・ランキング）をスケルトンでなぞり、前面にスピナーを出す
export default function Loading() {
  return (
    <>
      <PageHeader icon={TrendingUp} title="人気記事ランキング" />
      <LoadingOverlay message="ランキングを読み込んでいます...">
        <div className="space-y-4">
          <PopularStatsBar
            articleCount={0}
            topScore={0}
            totalBookmarks={0}
            loading
          />
          <Skeleton className="mx-auto h-6 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full" />
          <PopularRankingSkeleton count={20} overlay={false} />
        </div>
      </LoadingOverlay>
    </>
  );
}
