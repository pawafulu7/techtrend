import { TrendingUp } from 'lucide-react';
import { PopularArticles } from '@/app/components/popular/PopularArticles';
import { PageHeader } from '@/components/ui-v2/page-header';

export default function PopularPage() {
  return (
    <>
      <PageHeader icon={TrendingUp} title="人気記事ランキング" />
      <PopularArticles limit={20} />
    </>
  );
}
