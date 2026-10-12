export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <div className="container mx-auto max-w-4xl space-y-8 px-4 py-6">
        {children}
      </div>
    </div>
  );
}
