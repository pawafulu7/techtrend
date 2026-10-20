import { Hash } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { LoadingOverlay } from '@/app/components/common/loading-overlay';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui-v2/card-v2';
import {
  TagCloudChipsSkeleton,
  TagStatsSkeleton,
} from '@/app/components/tags/tags-skeletons';

// タグ分析の初回待ち（issue #701）。page.tsx の並び（タグクラウド2列・タグ統計1列）を
// スケルトンでなぞり、前面にスピナーを出す
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-3 pb-6">
      <PageHeader
        icon={Hash}
        title="タグ分析"
        description="技術トレンドをタグから探索"
      />

      <LoadingOverlay message="タグを読み込んでいます...">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-8 w-48" />
                </div>
              </CardHeader>
              <CardContent>
                <TagCloudChipsSkeleton />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6 lg:col-span-1">
            <TagStatsSkeleton />
          </div>
        </div>
      </LoadingOverlay>
    </div>
  );
}
