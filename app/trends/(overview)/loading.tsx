import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { LoadingOverlay } from '@/app/components/common/loading-overlay';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendStatsBar } from '@/app/components/trends/overview/TrendStatsBar';
import { TrendNavigationCards } from '@/app/components/trends/overview/TrendNavigationCards';

// トレンド概要の初回待ち（issue #701）。サーバーで集計を取る間、trends-content.tsx の
// 並び（件数の読み出し・いま伸びている話題・新着タグ・詳細レポート・分析）をスケルトンでなぞり、
// 前面にスピナーを出す。
// 日次・差分などの配下のページに効かないよう、概要だけをルートグループに置いている
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6">
      <PageHeader icon={BarChart3} title="トレンド概要" className="pb-0" />

      <LoadingOverlay message="トレンドを読み込んでいます...">
        <div className="space-y-8">
          <TrendStatsBar
            trendingCount={null}
            newTagCount={null}
            topTagCount={null}
            loading
          />

          {/* 順位表（2 列 × 10 行）の行の高さをなぞる */}
          <section className="bg-background rounded-lg border p-4">
            <Skeleton className="mb-3 h-5 w-40" />
            <Skeleton className="mb-3 h-4 w-56" />
            <div className="grid md:grid-cols-2 md:gap-x-8">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-[57px] items-center gap-3 border-b border-(--tt-color-border)"
                >
                  <Skeleton className="h-4 w-5" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </section>

          <section className="bg-background rounded-lg border p-4">
            <Skeleton className="mb-3 h-5 w-28" />
            <div className="flex flex-wrap gap-2">
              {[64, 88, 56, 72, 96, 60].map((width, i) => (
                <Skeleton
                  key={i}
                  className="h-6 rounded-full"
                  style={{ width: `${width}px` }}
                />
              ))}
            </div>
          </section>

          <section>
            <Skeleton className="mb-3 h-6 w-32" />
            <TrendNavigationCards />
          </section>

          <section className="border-t pt-6">
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-7 w-48" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-[356px] w-full rounded-lg" />
              <div className="grid gap-6 lg:grid-cols-2">
                <Skeleton className="h-[356px] w-full rounded-lg" />
                <Skeleton className="h-[356px] w-full rounded-lg" />
              </div>
            </div>
          </section>
        </div>
      </LoadingOverlay>
    </div>
  );
}
