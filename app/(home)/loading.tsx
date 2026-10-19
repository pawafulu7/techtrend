import { Home as HomeIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ArticleListSkeleton } from '@/app/components/article/article-list-skeleton';

// ホームの初回待ち（issue #701）。page.tsx の見出し・ツールバー・記事一覧の並びをなぞる。
// 表示形式の Cookie はここでは読まず、既定のカード表示で出す。
// 検索条件を読めないので、上部の帯（絞り込みの無いときだけ出す）の枠は出さない
export default function Loading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 pb-2 lg:px-6">
        <PageHeader
          icon={HomeIcon}
          title="記事一覧"
          variant="compact"
          className="pb-0"
        />
        <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="hidden h-8 w-72 lg:block" />
          <Skeleton className="hidden h-8 w-28 lg:block" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 lg:px-6">
        <ArticleListSkeleton />
      </div>
    </div>
  );
}
