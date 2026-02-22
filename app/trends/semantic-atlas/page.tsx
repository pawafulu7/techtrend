import { Suspense } from 'react';
import type { Metadata } from 'next';
import SemanticAtlasClient from './page-client';

export const metadata: Metadata = {
  title: 'Semantic Atlas | TechTrend',
  description: '31,000件の記事を意味空間に投影した3Dビジュアライゼーション',
};

export default function SemanticAtlasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[600px] items-center justify-center">
          <div className="text-muted-foreground">Loading atlas...</div>
        </div>
      }
    >
      <SemanticAtlasClient />
    </Suspense>
  );
}
