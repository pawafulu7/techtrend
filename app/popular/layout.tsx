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
        <div className="container mx-auto max-w-6xl px-4 py-3">
          <Suspense>
            <PopularSubNav />
          </Suspense>
        </div>
      </div>

      {/* Page Content */}
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        {children}
      </div>
    </div>
  );
}
