export default function TechMapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900">
      {children}
    </div>
  );
}
