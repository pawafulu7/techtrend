import { Suspense } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Filters } from '@/app/components/common/filters';
import { MobileFilters } from '@/app/components/common/mobile-filters';
import { SearchBox } from '@/app/components/common/search-box';
import { TagFilterDropdown } from '@/app/components/common/tag-filter-dropdown';
import { ViewModeToggle } from '@/app/components/common/view-mode-toggle';
import { ArticleCount } from '@/app/components/common/article-count';
import { SortButtons } from '@/app/components/common/sort-buttons';
import { FilterResetButton } from '@/app/components/common/filter-reset-button';
import { UnreadFilterWithData } from '@/app/components/common/unread-filter-with-data';
import { MarkAllReadWrapper } from '@/app/components/common/mark-all-read-wrapper';
import { auth } from '@/lib/auth/auth';
import { features } from '@/config/features';
import { HomeClient } from '@/app/components/home/home-client';
import { HomeClientInfinite } from '@/app/components/home/home-client-infinite';
import { ArticleSkeleton } from '@/app/components/article/article-skeleton';
import { PersonalizationToggle } from '@/app/components/personalization';
import {
  FilterSidebarProvider,
  FilterSidebarToggle,
  FilterSidebarPanel,
  FilterSidebarOverlay,
} from '@/app/components/home/filter-sidebar';
import { parseViewModeFromCookie } from '@/lib/view-mode-cookie';
import { parseSourceFilterFromCookie } from '@/lib/source-filter-cookie';
import { getFilterPreferencesFromCookies } from '@/lib/filter-preferences-cookie';
import { tagCache } from '@/lib/cache/tag-cache';
import { getSourceCache } from '@/lib/cache/source-cache';
import { groupSourcesStatic } from '@/lib/utils/source-grouping-static';
import { ARXIV_SOURCE_ID } from '@/lib/constants/source-categories';
// prisma import removed - stats bar deleted

interface PageProps {
  searchParams: Promise<{
    page?: string;
    sourceId?: string;
    sources?: string;
    tag?: string;
    tags?: string;
    tagMode?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

async function getSources() {
  // Get all sources (Redis-backed cache)
  const sourceCache = getSourceCache();
  const allSources = await sourceCache.getAllSources();
  const sources = allSources.filter((source) => source._count.articles > 0);

  // Group sources based on Feature Flag
  // NOTE: Currently both paths use static grouping for production parity
  // DB-backed grouping (groupSourcesByGroupId) is temporarily disabled
  // until multi-category support is implemented
  const groupedSources = groupSourcesStatic(sources);
  return { sources, groupedSources };
}

async function getPopularTags() {
  // Redis-backed cache使用（150-250ms短縮）
  const tags = await tagCache.getPopularTags(20);

  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    count: tag._count.articles,
    category: tag.category,
  }));
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;

  // Parallel execution of cookies, sources/groups, tags, session
  const [cookieStore, sourceData, tags, session] = await Promise.all([
    cookies(),
    getSources(),
    getPopularTags(),
    auth(),
  ]);

  const { sources, groupedSources } = sourceData;

  // arXivソースを除外（専用の/papersページで表示するため）
  const filteredSources = sources.filter((s) => s.id !== ARXIV_SOURCE_ID);
  const filteredGroupedSources = groupedSources
    .map((group) => ({
      ...group,
      sources: group.sources.filter((s) => s.id !== ARXIV_SOURCE_ID),
    }))
    .filter((group) => group.sources.length > 0);

  // Get filter preferences from cookie
  const filterPreferences = getFilterPreferencesFromCookies(cookieStore);

  // Get view mode (from dedicated cookie or filter preferences)
  const viewMode =
    parseViewModeFromCookie(cookieStore.get('article-view-mode')?.value) ||
    filterPreferences.viewMode ||
    'card';

  // Get source filter from URL params first, then fall back to cookie
  let initialSourceIds: string[] | undefined = undefined;
  if (params.sources) {
    // URL has explicit sources parameter - use it
    if (params.sources === 'all') {
      // All sources selected - leave undefined to use default (all)
      initialSourceIds = undefined;
    } else if (params.sources === 'none') {
      // No sources selected
      initialSourceIds = [];
    } else {
      // Specific source IDs
      initialSourceIds = params.sources.split(',').filter((id) => id);
    }
  } else if (!params.sourceId) {
    // No URL params - try filter preferences first, then fall back to old source-filter cookie
    if (filterPreferences.sources !== undefined) {
      // 空配列の場合は、全選択として扱う場合を考慮
      // ただし、明示的な全解除の場合は空配列を維持
      initialSourceIds = filterPreferences.sources;
    } else {
      const oldCookie = parseSourceFilterFromCookie(
        cookieStore.get('source-filter')?.value
      );
      if (oldCookie.length > 0) {
        initialSourceIds = oldCookie;
      }
    }
  }

  // Filter out invalid source IDs (excluded or deleted sources)
  if (initialSourceIds && initialSourceIds.length > 0) {
    const validIds = new Set(filteredSources.map((s) => s.id));
    const filtered = initialSourceIds.filter((id) => validIds.has(id));
    // If all IDs were invalid, fall back to all sources (undefined)
    initialSourceIds = filtered.length > 0 ? filtered : undefined;
  }

  // Get initial sort order from cookie if no URL params
  const initialSortBy = !params.sortBy ? filterPreferences.sortBy : undefined;

  // 検索キーワードはURLパラメータのみで管理（Cookie復元は無効）

  // Infinite Scroll機能のフラグ（環境変数や設定で切り替え可能）
  const enableInfiniteScroll = true;

  return (
    <FilterSidebarProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Gradient background layer */}
        <div className="from-background to-muted/20 flex flex-1 flex-col overflow-hidden bg-gradient-to-b">
          {/* Toolbar - 全幅・1行 */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 px-4 pt-3 pb-2 lg:px-6">
            <FilterSidebarToggle />
            <MobileFilters
              sources={filteredSources}
              groupedSources={filteredGroupedSources}
              tags={tags}
              initialSourceIds={initialSourceIds}
            />
            <div className="hidden lg:block">
              <SearchBox />
            </div>
            {features.aiSearch && session?.user && (
              <Link
                href="/search/agent"
                className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-blue-600 transition-colors hover:bg-blue-50 lg:flex dark:text-blue-400 dark:hover:bg-blue-950"
                title="AI検索"
              >
                <Sparkles className="h-4 w-4 flex-shrink-0" />
                <span>AI検索</span>
              </Link>
            )}
            <div className="hidden lg:block">
              <TagFilterDropdown tags={tags} />
            </div>
            <PersonalizationToggle />
            <div className="bg-border hidden h-5 w-px lg:block" />
            <ViewModeToggle currentMode={viewMode} />
            <SortButtons initialSortBy={initialSortBy} />
            <div className="bg-border hidden h-5 w-px lg:block" />
            <UnreadFilterWithData />
            <MarkAllReadWrapper />
            <FilterResetButton />
            <div className="ml-auto" />
            <Suspense
              fallback={
                <div className="h-5 w-16 animate-pulse rounded bg-(--tt-color-surface-muted)" />
              }
            >
              <ArticleCount
                initialSourceIds={initialSourceIds}
                excludeSources={ARXIV_SOURCE_ID}
              />
            </Suspense>
          </div>

          {/* Content area - フルワイド + オーバーレイフィルター */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {/* Overlay filter panel */}
            <FilterSidebarPanel>
              <Filters
                sources={filteredSources}
                groupedSources={filteredGroupedSources}
                tags={tags}
                initialSourceIds={initialSourceIds}
              />
            </FilterSidebarPanel>
            <FilterSidebarOverlay />

            {/* Article list - 常にフルワイド */}
            <main className="flex h-full flex-col">
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
                    excludeSources={ARXIV_SOURCE_ID}
                  />
                ) : (
                  <HomeClient
                    viewMode={viewMode}
                    sources={sources}
                    tags={tags}
                  />
                )}
              </Suspense>
            </main>
          </div>
        </div>
      </div>
    </FilterSidebarProvider>
  );
}
