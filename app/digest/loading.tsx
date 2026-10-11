import { Newspaper } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { DigestSkeleton } from '@/app/components/digest/digest-skeleton';

export default function Loading() {
  return (
    // 読み込み中も見出しを出す（h1 を常に1つ置く。Issue #700）
    <div className="px-4 py-3 lg:px-6">
      <PageHeader icon={Newspaper} title="ダイジェスト" />
      {/* 期間タブ（今日・今週）の位置 */}
      <Skeleton className="mb-6 h-9 w-28" aria-hidden="true" />
      <DigestSkeleton />
    </div>
  );
}
