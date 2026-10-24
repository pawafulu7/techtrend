import { Suspense } from 'react';
import { PopularSubNav } from '@/app/components/popular/popular-sub-nav';
import { TrendSectionNav } from '@/app/components/trends/TrendSectionNav';

export default function PopularLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <TrendSectionNav />

      {/* ランキング期間 */}
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 border-b backdrop-blur">
        <div className="mx-auto w-full max-w-7xl px-4 py-3">
          <Suspense>
            <PopularSubNav />
          </Suspense>
        </div>
      </div>

      {/* Page Content: サブナビと同じ 7xl にそろえる（Issue #700） */}
      <div className="mx-auto w-full max-w-7xl px-4 py-6">{children}</div>
    </div>
  );
}
