import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { FileText } from 'lucide-react';
import { SearchBox } from '@/app/components/common/search-box';
import { ViewModeToggle } from '@/app/components/common/view-mode-toggle';
import { SortButtons } from '@/app/components/common/sort-buttons';
import { ArticleSkeleton } from '@/app/components/article/article-skeleton';
import { parseViewModeFromCookie } from '@/lib/cookies/view-mode-cookie';
import { getFilterPreferencesFromCookies } from '@/lib/cookies/filter-preferences-cookie';
import {
  ARXIV_SOURCE_ID,
  ARXIV_SOURCE_NAME,
} from '@/lib/constants/source-categories';
import { PapersClientInfinite } from '@/app/components/papers/papers-client-infinite';

interface PageProps {
  searchParams: Promise<{
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    tag?: string;
    tags?: string;
  }>;
}

export default async function PapersPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Get cookies for view mode preferences
  const cookieStore = await cookies();
  const filterPreferences = getFilterPreferencesFromCookies(cookieStore);

  // Get view mode
  const viewMode =
    parseViewModeFromCookie(cookieStore.get('article-view-mode')?.value) ||
    filterPreferences.viewMode ||
    'card';

  // Get initial sort order from cookie if no URL params
  const initialSortBy = !params.sortBy ? filterPreferences.sortBy : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* メインエリア - サイドバーなし */}
      <div className="flex-1 lg:flex lg:overflow-hidden">
        {/* コンテンツエリア */}
        <main className="flex-1 lg:flex lg:flex-col">
          {/* ツールバー */}
          <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50/50 px-4 py-2 lg:px-6 dark:border-gray-700 dark:bg-gray-900/50">
            <div className="flex items-center justify-between">
              <div className="flex flex-shrink-0 items-center gap-2">
                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                  <FileText className="h-5 w-5" />
                  <span className="font-medium">{ARXIV_SOURCE_NAME}</span>
                </div>
              </div>

              <div className="ml-4 flex items-center gap-2">
                <div className="hidden lg:block">
                  <SearchBox />
                </div>
                <div className="bg-border h-5 w-px" />
                <ViewModeToggle currentMode={viewMode} />
                <div className="bg-border h-5 w-px" />
                <SortButtons initialSortBy={initialSortBy} />
              </div>
            </div>
          </div>

          {/* 論文リスト */}
          <Suspense fallback={<ArticleSkeleton />}>
            <PapersClientInfinite
              key={`papers-${params.search || ''}-${params.tag || ''}`}
              viewMode={viewMode}
              sourceId={ARXIV_SOURCE_ID}
              initialSortBy={initialSortBy}
            />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
