import { fetchInitialDailyData } from './_components/daily-data';
import { DailyTrendContent } from './_components/daily-trend-content';

export const dynamic = 'force-dynamic';

export default async function DailyTrendPage() {
  const initialData = await fetchInitialDailyData();

  return <DailyTrendContent initialData={initialData} />;
}
