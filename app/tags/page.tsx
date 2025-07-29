import { TagCloud } from '@/app/components/tags/TagCloud';
import { TagStats } from '@/app/components/tags/TagStats';

export default function TagsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">タグ分析</h1>
        <p className="text-muted-foreground">
          技術トレンドをタグから探索
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TagCloud />
        </div>
        
        <div className="lg:col-span-1 space-y-6">
          <TagStats />
        </div>
      </div>
    </div>
  );
}