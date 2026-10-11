import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui-v2/card-v2';

// タグ分析の読み込み中の表示。画面内の初回取得（TagCloud・TagStats）とルートの初回待ち
// （app/tags/loading.tsx）で同じ形にする（issue #701）

// スケルトンの幅は固定値。Math.random() を使うとサーバーとクライアントで別の値になり、
// hydration mismatch を起こすため（見た目のばらつきだけが目的なので決め打ちで十分）
const CHIP_WIDTHS = [
  118, 72, 145, 96, 61, 132, 84, 108, 57, 121, 90, 149, 66, 103, 137, 78, 112,
  54, 126, 88,
];

/** タグクラウドの中身（タグの並び） */
export function TagCloudChipsSkeleton() {
  return (
    <div className="space-y-2">
      {CHIP_WIDTHS.map((width, i) => (
        <Skeleton
          key={i}
          className="mr-2 mb-2 inline-block h-6"
          style={{ width: `${width}px` }}
        />
      ))}
    </div>
  );
}

/** タグ統計のカード */
export function TagStatsSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    </div>
  );
}
