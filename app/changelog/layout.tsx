import { TrendSectionNav } from '@/app/components/trends/TrendSectionNav';

export default function ChangelogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <TrendSectionNav />
      {children}
    </div>
  );
}
