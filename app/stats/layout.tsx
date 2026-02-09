export default function StatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        {children}
      </div>
    </div>
  );
}
