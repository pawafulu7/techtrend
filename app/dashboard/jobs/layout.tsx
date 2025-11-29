import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Job Management Dashboard | TechTrend',
  description: 'Monitor processing logs, embedding jobs, and article collection statistics',
};

export default function JobManagementDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
