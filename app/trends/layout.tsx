import { TrendSubNav } from '@/app/components/trends/TrendSubNav';

export default function TrendsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">
      {/* Sub Navigation */}
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 border-b backdrop-blur">
        <div className="container mx-auto max-w-7xl px-4 py-3">
          <TrendSubNav />
        </div>
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
}
