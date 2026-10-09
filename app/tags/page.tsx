import { Hash } from 'lucide-react';
import { TagCloud } from '@/app/components/tags/TagCloud';
import { TagStats } from '@/app/components/tags/TagStats';
import { PageHeader } from '@/components/ui-v2/page-header';

export default function TagsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-3 pb-6">
      <PageHeader
        icon={Hash}
        title="タグ分析"
        description="技術トレンドをタグから探索"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TagCloud />
        </div>

        <div className="space-y-6 lg:col-span-1">
          <TagStats />
        </div>
      </div>
    </div>
  );
}
