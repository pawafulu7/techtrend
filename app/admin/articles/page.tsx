import { ArticlesPageContent } from './_components/articles-page-content';

export const dynamic = 'force-dynamic';

export default function AdminArticlesPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">記事管理</h1>
      <ArticlesPageContent />
    </div>
  );
}
