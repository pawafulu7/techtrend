import { Skeleton } from '@/components/ui/skeleton';
import { LoadingOverlay } from '@/app/components/common/loading-overlay';

function RankingRows({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-20 w-full"
          style={{ animationDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * 人気記事ランキングの行の読み込み中の表示。画面内の初回取得（PopularArticles）と
 * ルートの初回待ち（app/popular/loading.tsx）で同じ形にする（issue #701）
 */
export function PopularRankingSkeleton({
  count,
  overlay = true,
}: {
  count: number;
  /** スピナーを重ねる。ページ全体の読み込み（loading.tsx）ではページ側で1つだけ重ねるので false */
  overlay?: boolean;
}) {
  return overlay ? (
    <LoadingOverlay message="ランキングを読み込んでいます...">
      <RankingRows count={count} />
    </LoadingOverlay>
  ) : (
    <RankingRows count={count} />
  );
}
