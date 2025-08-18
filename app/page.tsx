import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { Filters } from '@/app/components/common/filters';
import { MobileFilters } from '@/app/components/common/mobile-filters';
import { SearchBox } from '@/app/components/common/search-box';
import { TagFilterDropdown } from '@/app/components/common/tag-filter-dropdown';
import { ServerPagination } from '@/app/components/common/server-pagination';
import { PopularTags } from '@/app/components/common/popular-tags';
import { ViewModeToggle } from '@/app/components/common/view-mode-toggle';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { HomeClient } from '@/app/components/home/home-client';
import { FilterSkeleton } from '@/app/components/common/filter-skeleton';
import { prisma } from '@/lib/database';
import { parseViewModeFromCookie } from '@/lib/view-mode-cookie';

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
  const viewMode = parseViewModeFromCookie(cookieStore.get('article-view-mode')?.value);
  
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
            <Suspense fallback={<FilterSkeleton />}>
              <Filters sources={sources} tags={tags} />
            </Suspense>
          </div>
        </aside>

        {/* コンテンツエリア */}
        <main className="flex-1 lg:flex lg:flex-col">
          {/* ツールバー - 固定 */}
          <div className="flex-shrink-0 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MobileFilters sources={sources} tags={tags} />
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
                  <div className="flex gap-1">
                    <Button
                      variant={params.sortBy !== 'bookmarks' && params.sortBy !== 'qualityScore' && params.sortBy !== 'createdAt' ? 'default' : 'outline'}
                      size="sm"
                      asChild
                      className="h-6 sm:h-7 px-2 text-xs"
                    >
                      <Link href={`/?${new URLSearchParams({ ...params, sortBy: 'publishedAt' }).toString()}`}>
                        公開順
                    </Link>
                  </Button>
                  <Button
                    variant={params.sortBy === 'createdAt' ? 'default' : 'outline'}
                    size="sm"
                    asChild
                    className="h-6 sm:h-7 px-2 text-xs"
                  >
                    <Link href={`/?${new URLSearchParams({ ...params, sortBy: 'createdAt' }).toString()}`}>
                      取込順
                    </Link>
                  </Button>
                  <Button
                    variant={params.sortBy === 'qualityScore' ? 'default' : 'outline'}
                    size="sm"
                    asChild
                    className="h-6 sm:h-7 px-2 text-xs"
                  >
                    <Link href={`/?${new URLSearchParams({ ...params, sortBy: 'qualityScore' }).toString()}`}>
                      品質
                    </Link>
                  </Button>
                  <Button
                    variant={params.sortBy === 'bookmarks' ? 'default' : 'outline'}
                    size="sm"
                    asChild
                    className="h-6 sm:h-7 px-2 text-xs"
                  >
                    <Link href={`/?${new URLSearchParams({ ...params, sortBy: 'bookmarks' }).toString()}`}>
                      人気
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* クライアントコンポーネント（記事リストとページネーション） */}
          <HomeClient viewMode={viewMode} sources={sources} tags={tags} />
        </main>
      </div>
    </div>
  );
}