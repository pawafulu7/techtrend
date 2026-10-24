import { Suspense } from 'react';
import { HistorySubNav } from './_components/history-sub-nav';

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* 閲覧履歴と読書分析のタブ（Issue #709）。下線をこの下の線に重ねる（トレンドのサブナビと同じ） */}
      <div className="border-b border-(--tt-color-border) bg-(--tt-color-surface)">
        <div className="px-4 lg:px-6">
          {/* useSearchParams を使うので Suspense で包む（包まないとページ全体がクライアント描画になる） */}
          <Suspense fallback={<div className="h-11" />}>
            <HistorySubNav />
          </Suspense>
        </div>
      </div>
      {children}
    </div>
  );
}
