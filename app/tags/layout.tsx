import { TrendSectionNav } from '@/app/components/trends/TrendSectionNav';

export default function TagsLayout({
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
