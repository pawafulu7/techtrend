import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { FileText } from 'lucide-react';
import { MobileSearchToggle } from '@/app/components/common/mobile-search-toggle';
import { SearchBox } from '@/app/components/common/search-box';
import { ViewModeToggle } from '@/app/components/common/view-mode-toggle';
import { SortButtons } from '@/app/components/common/sort-buttons';
import { LoadingSpinner } from '@/app/components/common/loading-spinner';
import { parseViewModeFromCookie } from '@/lib/cookies/view-mode-cookie';
import { getFilterPreferencesFromCookies } from '@/lib/cookies/filter-preferences-cookie';
import {
  ARXIV_SOURCE_ID,
  ARXIV_SOURCE_NAME,
} from '@/lib/constants/source-categories';
import { PapersClientInfinite } from '@/app/components/papers/papers-client-infinite';
import { PageHeader } from '@/components/ui-v2/page-header';

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
      {/* RootLayout が <main> を持つため section にする（ランドマーク重複の解消） */}
      <section aria-label="論文一覧" className="flex min-h-0 flex-1 flex-col">
        {/* 見出しとツールバー。ホームと同じく幅は 7xl にそろえる（Issue #700） */}
        <div className="mx-auto w-full max-w-7xl flex-shrink-0 px-4 pt-3">
          <PageHeader
            icon={FileText}
            title="論文"
            description={`出典: ${ARXIV_SOURCE_NAME}`}
            variant="compact"
          />
          {/* 検索パネル展開時に全幅の行として折り返せるよう flex-wrap にする */}
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <MobileSearchToggle />
            <div className="hidden lg:block">
              <SearchBox />
            </div>
            <div className="bg-border h-5 w-px" />
            <ViewModeToggle currentMode={viewMode} />
            <div className="bg-border h-5 w-px" />
            <SortButtons initialSortBy={initialSortBy} />
          </div>
        </div>

        {/* 論文リスト */}
        <Suspense
          fallback={<LoadingSpinner message="論文を読み込んでいます..." />}
        >
          <PapersClientInfinite
            key={`papers-${params.search || ''}-${params.tag || ''}`}
            viewMode={viewMode}
            sourceId={ARXIV_SOURCE_ID}
            initialSortBy={initialSortBy}
          />
        </Suspense>
      </section>
    </div>
  );
}
