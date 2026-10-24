import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Filters } from '@/app/components/common/filters';
import { MobileFilters } from '@/app/components/common/mobile-filters';
import {
  FilterSidebarProvider,
  FilterSidebarPanel,
  FilterSidebarOverlay,
} from '@/app/components/home/filter-sidebar';
import { tagCache } from '@/lib/cache/tag-cache';
import { getSourceCache } from '@/lib/cache/source-cache';
import { groupSourcesStatic } from '@/lib/utils/source/source-grouping-static';
import {
  withoutPaperSourceGroups,
  withoutPaperSources,
} from '@/lib/utils/source/paper-source';
import { getSession } from '@/lib/auth/get-session';
import { resolveHomeFilterDefaults } from '@/lib/articles/home-filter-defaults';
import { ReaderClient } from './reader-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reader - TechTrend',
  description: '記事をリーダービューで閲覧',
};

async function getSources() {
  const sourceCache = getSourceCache();
  const allSources = await sourceCache.getAllSources();
  const sources = allSources.filter((source) => source._count.articles > 0);
  const groupedSources = groupSourcesStatic(sources);
  return { sources, groupedSources };
}

async function getPopularTags() {
  const tags = await tagCache.getPopularTags(20);
  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    count: tag._count.articles,
    category: tag.category,
  }));
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReaderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, cookieStore, sourceData, tags, session] = await Promise.all([
    searchParams,
    cookies(),
    getSources(),
    getPopularTags(),
    getSession(),
  ]);

  const { sources, groupedSources } = sourceData;
  // 論文のソースを除外（ホームと同じ。専用の/papersページで表示するため）
  const filteredSources = withoutPaperSources(sources);
  const filteredGroupedSources = withoutPaperSourceGroups(groupedSources);

  // URL に無いソース・並び順は、ホームと同じ Cookie から補う（Issue #709）
  const { initialSourceIds, initialSortBy } = resolveHomeFilterDefaults({
    params: {
      sources: firstValue(query.sources),
      sourceId: firstValue(query.sourceId),
      sortBy: firstValue(query.sortBy),
    },
    cookieStore,
    validSourceIds: new Set(filteredSources.map((s) => s.id)),
  });

  return (
    <FilterSidebarProvider>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
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
          <Suspense
            fallback={
              <div className="flex h-full flex-col items-center justify-center gap-2">
                {/* ReaderClient の読み込み中も見出しを出す（Issue #700）。サーバー側の取得待ちは app/loading.tsx が受け持つ */}
                <h1 className="font-heading text-foreground text-h1">
                  リーダー
                </h1>
                <span className="text-muted-foreground">読み込み中...</span>
              </div>
            }
          >
            <ReaderClient
              tags={tags}
              initialSortBy={initialSortBy}
              initialSourceIds={initialSourceIds}
              mobileFilters={
                // lg 未満はフィルターのサイドバーを開けないので、ホームと同じ Sheet を出す
                <MobileFilters
                  sources={filteredSources}
                  groupedSources={filteredGroupedSources}
                  tags={tags}
                  initialSourceIds={initialSourceIds}
                  initialIsAuthenticated={!!session?.user}
                />
              }
            />
          </Suspense>
        </div>
      </div>
    </FilterSidebarProvider>
  );
}
