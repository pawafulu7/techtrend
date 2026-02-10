import { PopularArticles } from '@/app/components/popular/PopularArticles';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';

export default function PopularPage() {
  return (
    <>
      <PageHeader
        icon={TrendingUp}
        title="人気記事ランキング"
        description="読者に最も読まれている記事をチェック"
      />
      <PopularArticles limit={20} />
    </>
  );
}
