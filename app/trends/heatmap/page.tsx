import { Suspense } from 'react';
import type { Metadata } from 'next';
import { HeatmapPageClient } from './page-client';

export const metadata: Metadata = {
  title: 'テックセクターマップ | TechTrend',
  description: 'カテゴリ別の記事動向をヒートマップで可視化',
};

export default function HeatmapPage() {
  return (
    <Suspense fallback={null}>
      <HeatmapPageClient />
    </Suspense>
  );
}
