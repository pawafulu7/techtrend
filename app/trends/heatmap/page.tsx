import { Suspense } from 'react';
import { Grid3X3 } from 'lucide-react';
import type { Metadata } from 'next';
import { HeatmapPageClient } from './page-client';
import { PageHeader } from '@/components/ui-v2/page-header';

export const metadata: Metadata = {
  title: 'テックセクターマップ | TechTrend',
  description: 'カテゴリ別の記事動向をヒートマップで可視化',
};

export default function HeatmapPage() {
  return (
    <Suspense
      fallback={
        // クライアント側の描画を待つ間も見出しを出す（h1 を常に1つ置く。Issue #700）
        <div className="mx-auto w-full max-w-7xl px-4 py-6">
          <PageHeader
            icon={Grid3X3}
            title="テックセクターマップ"
            description="カテゴリ別の記事動向をヒートマップで可視化"
            className="pb-0"
          />
        </div>
      }
    >
      <HeatmapPageClient />
    </Suspense>
  );
}
