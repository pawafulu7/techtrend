import { requireAdmin } from '@/lib/auth/admin-check';

export default async function SourcesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">
      <div className="container mx-auto max-w-6xl space-y-8 px-4 py-6">
        {children}
      </div>
    </div>
  );
}
