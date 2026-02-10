import { Suspense } from 'react';
import { PopularSubNav } from '@/app/components/popular/popular-sub-nav';

export default function PopularLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* Sub Navigation */}
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 border-b backdrop-blur">
        <div className="container mx-auto max-w-7xl px-4 py-3">
          <Suspense>
            <PopularSubNav />
          </Suspense>
        </div>
      </div>

      {/* Page Content */}
      <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">
        <div className="container mx-auto max-w-6xl space-y-8 px-4 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
