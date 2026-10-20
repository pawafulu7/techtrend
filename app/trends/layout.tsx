import { TrendSubNav } from '@/app/components/trends/TrendSubNav';

export default function TrendsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* Sub Navigation */}
      {/* 文字のタブの下線をこの下の線に重ねる（ヘッダーと同じ） */}
      <div className="border-b border-(--tt-color-border) bg-(--tt-color-surface)">
        <div className="mx-auto w-full max-w-7xl px-4">
          <TrendSubNav />
        </div>
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
}
