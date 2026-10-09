import { Newspaper } from 'lucide-react';
import { LoadingSpinner } from '@/app/components/common/loading-spinner';
import { PageHeader } from '@/components/ui-v2/page-header';

export default function Loading() {
  return (
    // 読み込み中も見出しを出す（h1 を常に1つ置く。Issue #700）
    <div className="px-4 py-3 lg:px-6">
      <PageHeader icon={Newspaper} title="ダイジェスト" />
      <LoadingSpinner message="ダイジェストを準備中..." />
    </div>
  );
}
