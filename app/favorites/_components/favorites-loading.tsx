import { Heart } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { LoadingOverlay } from '@/app/components/common/loading-overlay';
import { Skeleton } from '@/components/ui/skeleton';
import { FavoriteSkeletonGrid } from '@/app/components/article/favorite-card';

/**
 * お気に入りの読み込み中の表示。画面内の初回取得（favorites-content.tsx）と
 * ルートの初回待ち（(list)/loading.tsx）で同じ形にする（issue #701）
 */
export function FavoritesLoading() {
  return (
    <div className="px-4 py-3 lg:px-6">
      {/* 見出しは読み込み中も出す（h1 を常に1つ置く。Issue #700） */}
      <PageHeader
        icon={Heart}
        title="お気に入り"
        actions={
          <>
            <Skeleton className="h-9 w-48 lg:w-64" aria-hidden="true" />
            <Skeleton className="h-9 w-44" aria-hidden="true" />
          </>
        }
      />
      <LoadingOverlay message="お気に入りを読み込んでいます...">
        <FavoriteSkeletonGrid standalone={false} />
      </LoadingOverlay>
    </div>
  );
}
