import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'パフォーマンスダッシュボード | TechTrend',
  description: 'DBアクセス最適化のリアルタイムメトリクス監視',
};

export default function PerformanceDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
    </>
  );
}