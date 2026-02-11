export default function FavoritesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">
      {children}
    </div>
  );
}
