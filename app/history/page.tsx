import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { HistoryContent } from './_components/history-content';
import { AnalyticsTab } from './_components/analytics/analytics-tab';
import { isAnalyticsTab } from './_components/history-tab';

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const analytics = isAnalyticsTab(tab);
  const session = await getSession();
  if (!session?.user) {
    redirect(
      `/auth/login?callbackUrl=${encodeURIComponent(
        analytics ? '/history?tab=analytics' : '/history'
      )}`
    );
  }
  return analytics ? <AnalyticsTab /> : <HistoryContent />;
}
