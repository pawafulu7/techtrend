// 管理者の確認は管理画面の layout（app/admin/layout.tsx）が行う
export default function StatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto max-w-6xl space-y-8">{children}</div>;
}
