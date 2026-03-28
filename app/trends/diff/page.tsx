import { getISOWeek, getPreviousISOWeek } from '@/lib/ai/diff-summary';
import { fetchInitialDiffData } from './_components/diff-data';
import { DiffContent } from './_components/diff-content';

export const dynamic = 'force-dynamic';

export default async function DiffSummaryPage() {
  const initialWeek = getPreviousISOWeek(getISOWeek(new Date()));
  const initialData = await fetchInitialDiffData(initialWeek);
  const displayWeek = initialData.isFallback ? initialData.week : initialWeek;

  return <DiffContent initialData={initialData} initialWeek={displayWeek} />;
}
