import { TrendSectionNav } from '@/app/components/trends/TrendSectionNav';

export default function TrendsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <TrendSectionNav />

      {/* Page Content */}
      {children}
    </div>
  );
}
