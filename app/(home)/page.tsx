import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { Home as HomeIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { Filters } from '@/app/components/common/filters';
import { MobileFilters } from '@/app/components/common/mobile-filters';
import { MobileSearchToggle } from '@/app/components/common/mobile-search-toggle';
import { SearchBox } from '@/app/components/common/search-box';
import { TagFilterDropdown } from '@/app/components/common/tag-filter-dropdown';
import { ViewModeToggle } from '@/app/components/common/view-mode-toggle';
import { ReaderModeLink } from '@/app/components/common/reader-mode-link';
import { SortButtons } from '@/app/components/common/sort-buttons';
import { getSession } from '@/lib/auth/get-session';
import { HomeArticles } from '@/app/components/home/home-articles';
import { ArticleListSkeleton } from '@/app/components/article/article-list-skeleton';
import { PersonalizationToggle } from '@/app/components/personalization';
import {
  FilterSidebarProvider,
  FilterSidebarToggle,
  FilterSidebarPanel,
  FilterSidebarOverlay,
} from '@/app/components/home/filter-sidebar';
import { ToolbarMoreMenu } from '@/app/components/home/toolbar-more-menu';
import { parseViewModeFromCookie } from '@/lib/cookies/view-mode-cookie';
import { resolveHomeFilterDefaults } from '@/lib/articles/home-filter-defaults';
import { tagCache } from '@/lib/cache/tag-cache';
import { getSourceCache } from '@/lib/cache/source-cache';
import { groupSourcesStatic } from '@/lib/utils/source/source-grouping-static';
import {
  PAPER_SOURCE_IDS_PARAM,
  withoutPaperSourceGroups,
  withoutPaperSources,
} from '@/lib/utils/source/paper-source';

interface PageProps {
  // 同じ名前が複数あると配列で届く。クライアントの useSearchParams と同じく、
  // 個々の値は先頭を使い、一覧の取得条件には URL の検索条件をすべて使う
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** ページの searchParams を、クライアントの useSearchParams と同じ並びの URLSearchParams にする */
function toURLSearchParams(
  params: Record<string, string | string[] | undefined>
): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, v));
    } else if (value !== undefined) {
      searchParams.append(key, value);
    }
  }
  return searchParams;
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
  const searchParamList = toURLSearchParams(await searchParams);
  const params = {
    sources: searchParamList.get('sources') ?? undefined,
    sourceId: searchParamList.get('sourceId') ?? undefined,
    tag: searchParamList.get('tag') ?? undefined,
    search: searchParamList.get('search') ?? undefined,
    sortBy: searchParamList.get('sortBy') ?? undefined,
  };

  // Parallel execution of cookies, sources/groups, tags, session
  const [cookieStore, sourceData, tags, session] = await Promise.all([
    cookies(),
    getSources(),
    getPopularTags(),
    getSession(),
  ]);

  const { sources, groupedSources } = sourceData;

  // 論文のソースを除外（専用の/papersページで表示するため）
  const filteredSources = withoutPaperSources(sources);
  const filteredGroupedSources = withoutPaperSourceGroups(groupedSources);

  // URL に無いソース・並び順を Cookie から補う（リーダーと同じ。lib/articles/home-filter-defaults.ts）
  const { filterPreferences, initialSourceIds, initialSortBy } =
    resolveHomeFilterDefaults({
      params,
      cookieStore,
      validSourceIds: new Set(filteredSources.map((s) => s.id)),
    });

  // Get view mode (from dedicated cookie or filter preferences)
  const viewMode =
    parseViewModeFromCookie(cookieStore.get('article-view-mode')?.value) ||
    filterPreferences.viewMode ||
    'card';

  // 検索キーワードはURLパラメータのみで管理（Cookie復元は無効）

  return (
    <FilterSidebarProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Gradient background layer */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* 見出しとツールバー。全幅で、左右の余白は記事一覧と同じ（Issue #700）。
              一覧に縦の領域を残すため、幅が足りれば見出しとツールバーを1行に並べる */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 pb-2 lg:px-6">
            <PageHeader
              icon={HomeIcon}
              title="記事一覧"
              variant="compact"
              className="pb-0"
            />
            <div
              className="flex flex-wrap items-center gap-2"
              data-testid="home-toolbar"
            >
              <FilterSidebarToggle />
              <MobileFilters
                sources={filteredSources}
                groupedSources={filteredGroupedSources}
                tags={tags}
                initialSourceIds={initialSourceIds}
                initialIsAuthenticated={!!session?.user}
              />
              <MobileSearchToggle />
              {/* 見出しと同じ行に収まるよう、2xl 未満は少し狭くする */}
              <div className="hidden lg:block lg:w-64 xl:w-72 2xl:w-96">
                <SearchBox fullWidth />
              </div>
              {/* AI 検索リンクはヘッダーの primaryNav へ移設した（Issue #585）。
                ここに残すとホーム上で同じリンクが 2 つ並び、支援技術にも
                重複して読み上げられるため削除。デスクトップ限定だった導線も
                ヘッダー経由で全ページ・全幅から到達できるようになっている */}
              <div className="hidden lg:block">
                <TagFilterDropdown tags={tags} />
              </div>
              <PersonalizationToggle />
              <div className="bg-border hidden h-5 w-px lg:block" />
              <ViewModeToggle currentMode={viewMode} />
              <ReaderModeLink />
              <SortButtons initialSortBy={initialSortBy} />
              <div className="bg-border hidden h-5 w-px lg:block" />
              <ToolbarMoreMenu />
            </div>
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
                initialIsAuthenticated={!!session?.user}
              />
            </FilterSidebarPanel>
            <FilterSidebarOverlay />

            {/* Article list - 常にフルワイド */}
            {/* RootLayout が <main> を持つため section にする（ランドマーク重複の解消） */}
            <section aria-label="記事一覧" className="flex h-full flex-col">
              <Suspense
                fallback={
                  <div className="flex-1 overflow-hidden px-4 py-4 lg:px-6">
                    <ArticleListSkeleton viewMode={viewMode} />
                  </div>
                }
              >
                <HomeArticles
                  key={`${params.sourceId ?? 'all'}-${params.tag ?? ''}-${params.search ?? ''}`}
                  searchParams={searchParamList}
                  session={session}
                  viewMode={viewMode}
                  sources={sources}
                  tags={tags}
                  enableInfiniteScroll
                  initialSortBy={initialSortBy}
                  initialSourceIds={initialSourceIds}
                  excludeSources={PAPER_SOURCE_IDS_PARAM}
                />
              </Suspense>
            </section>
          </div>
        </div>
      </div>
    </FilterSidebarProvider>
  );
}
