import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Filters } from '@/app/components/common/filters';
import {
  FilterSidebarProvider,
  FilterSidebarPanel,
  FilterSidebarOverlay,
} from '@/app/components/home/filter-sidebar';
import { tagCache } from '@/lib/cache/tag-cache';
import { getSourceCache } from '@/lib/cache/source-cache';
import { groupSourcesStatic } from '@/lib/utils/source/source-grouping-static';
import { ARXIV_SOURCE_ID } from '@/lib/constants/source-categories';
import { getSession } from '@/lib/auth/get-session';
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

export default async function ReaderPage() {
  const [sourceData, tags, session] = await Promise.all([
    getSources(),
    getPopularTags(),
    getSession(),
  ]);

  const { sources, groupedSources } = sourceData;
  const filteredSources = sources.filter((s) => s.id !== ARXIV_SOURCE_ID);
  const filteredGroupedSources = groupedSources
    .map((group) => ({
      ...group,
      sources: group.sources.filter((s) => s.id !== ARXIV_SOURCE_ID),
    }))
    .filter((group) => group.sources.length > 0);

  return (
    <FilterSidebarProvider>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <FilterSidebarPanel>
            <Filters
              sources={filteredSources}
              groupedSources={filteredGroupedSources}
              tags={tags}
              initialIsAuthenticated={!!session?.user}
            />
          </FilterSidebarPanel>
          <FilterSidebarOverlay />
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <span className="text-muted-foreground">読み込み中...</span>
              </div>
            }
          >
            <ReaderClient tags={tags} />
          </Suspense>
        </div>
      </div>
    </FilterSidebarProvider>
  );
}
