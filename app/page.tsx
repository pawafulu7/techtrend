import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { Filters } from '@/app/components/common/filters';
import { MobileFilters } from '@/app/components/common/mobile-filters';
import { SearchBox } from '@/app/components/common/search-box';
import { TagFilterDropdown } from '@/app/components/common/tag-filter-dropdown';
import { ServerPagination } from '@/app/components/common/server-pagination';
import { PopularTags } from '@/app/components/common/popular-tags';
import { ViewModeToggle } from '@/app/components/common/view-mode-toggle';
import { ArticleCount } from '@/app/components/common/article-count';
import { SortButtons } from '@/app/components/common/sort-buttons';
import { FilterResetButton } from '@/app/components/common/filter-reset-button';
import { UnreadFilter } from '@/app/components/common/unread-filter';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { HomeClient } from '@/app/components/home/home-client';
import { HomeClientInfinite } from '@/app/components/home/home-client-infinite';
import { ArticleSkeleton } from '@/app/components/article/article-skeleton';
import { RecommendationToggle } from '@/components/recommendation/recommendation-toggle';
import { prisma } from '@/lib/database';
import { parseViewModeFromCookie } from '@/lib/view-mode-cookie';
import { parseSourceFilterFromCookie } from '@/lib/source-filter-cookie';
import { getFilterPreferencesFromCookies } from '@/lib/filter-preferences-cookie';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    sourceId?: string;
    tag?: string;
    tags?: string;
    tagMode?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

// getArticles function removed - now handled by client component

async function getSources() {
  const sources = await prisma.source.findMany({
    where: { enabled: true },
    include: {
      _count: {
        select: { articles: true }
      }
    },
    orderBy: { name: 'asc' },
  });

  // 記事が1件以上あるソースのみを返す
  return sources.filter(source => source._count.articles > 0);
}

async function getPopularTags() {
  const tags = await prisma.tag.findMany({
    include: {
      _count: {
        select: { articles: true },
      },
    },
    orderBy: {
      articles: {
        _count: 'desc',
      },
    },
    take: 20,
  });

  return tags.map(tag => ({
    id: tag.id,
    name: tag.name,
    count: tag._count.articles,
    category: tag.category,
  }));
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  
  // Get filter preferences from cookie
  const filterPreferences = getFilterPreferencesFromCookies(cookieStore);
  
  
  // Get view mode (from dedicated cookie or filter preferences)
  const viewMode = parseViewModeFromCookie(cookieStore.get('article-view-mode')?.value) || 
                    filterPreferences.viewMode || 'grid';
  
  // Get source filter from cookie if no URL params
  let initialSourceIds: string[] | undefined = undefined;
  if (!params.sourceId) {
    // Try filter preferences first, then fall back to old source-filter cookie
    if (filterPreferences.sources !== undefined) {
      // 空配列の場合は、全選択として扱う場合を考慮
      // ただし、明示的な全解除の場合は空配列を維持
      initialSourceIds = filterPreferences.sources;
    } else {
      const oldCookie = parseSourceFilterFromCookie(cookieStore.get('source-filter')?.value);
      if (oldCookie.length > 0) {
        initialSourceIds = oldCookie;
      }
    }
    
  }
  
  // Get initial sort order from cookie if no URL params
  const initialSortBy = !params.sortBy ? filterPreferences.sortBy : undefined;
  
  // 検索キーワードはURLパラメータのみで管理（Cookie復元は無効）
  
  // Infinite Scroll機能のフラグ（環境変数や設定で切り替え可能）
  const enableInfiniteScroll = true;
  
  // ソースとタグのみサーバー側で取得（フィルター用）
  const [sources, tags] = await Promise.all([
    getSources(),
    getPopularTags(),
  ]);

  return (
    <div className="h-full overflow-hidden flex flex-col">
        {/* メインエリア */}
        <div className="flex-1 lg:flex lg:overflow-hidden">
        {/* サイドバー - デスクトップのみ */}
        <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0 lg:bg-gray-50 dark:lg:bg-gray-900/50 lg:border-r lg:border-gray-200 dark:lg:border-gray-700 lg:overflow-y-auto">
          <div className="p-4">
            <Filters sources={sources} tags={tags} initialSourceIds={initialSourceIds} />
          </div>
        </aside>

        {/* コンテンツエリア */}
        <main className="flex-1 lg:flex lg:flex-col">
          {/* ツールバー - 固定 */}
          <div className="flex-shrink-0 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MobileFilters sources={sources} tags={tags} initialSourceIds={initialSourceIds} />
                <Suspense fallback={<div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />}>
                  <ArticleCount />
                </Suspense>
                <div className="w-px h-5 bg-border" />
                <RecommendationToggle />
              </div>
                
                <div className="flex items-center gap-2">
                  <div className="hidden lg:block">
                    <SearchBox />
                  </div>
                  <div className="hidden lg:block">
                    <TagFilterDropdown tags={tags} />
                  </div>
                  <div className="w-px h-5 bg-border" />
                  <ViewModeToggle currentMode={viewMode} />
                  <div className="w-px h-5 bg-border" />
                  <UnreadFilter />
                  <div className="w-px h-5 bg-border" />
                  <SortButtons initialSortBy={initialSortBy} />
                  <div className="w-px h-5 bg-border" />
                  <FilterResetButton />
              </div>
            </div>
          </div>

          {/* クライアントコンポーネント（記事リストとページネーション） */}
          <Suspense fallback={<ArticleSkeleton />}>
            {enableInfiniteScroll ? (
              <HomeClientInfinite 
                key={`${params.sourceId || 'all'}-${params.tag || ''}-${params.search || ''}`}
                viewMode={viewMode} 
                sources={sources} 
                tags={tags}
                enableInfiniteScroll={enableInfiniteScroll}
                initialSortBy={initialSortBy}
                initialSourceIds={initialSourceIds}
              />
            ) : (
              <HomeClient viewMode={viewMode} sources={sources} tags={tags} />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}