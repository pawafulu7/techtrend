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
import { ArticleList } from '@/app/components/article/list';
import { ArticleSkeleton } from '@/app/components/article/article-skeleton';
import { FilterSkeleton } from '@/app/components/common/filter-skeleton';
import { prisma } from '@/lib/database';
import { ARTICLES_PER_PAGE } from '@/lib/constants';
import { removeDuplicates } from '@/lib/utils/duplicate-detection';
import { parseViewModeFromCookie } from '@/lib/view-mode-cookie';
import type { Prisma } from '@prisma/client';

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

async function getArticles(params: Awaited<PageProps['searchParams']>) {
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = ARTICLES_PER_PAGE;
  // Support both publishedAt and createdAt for sorting
  const sortBy = params.sortBy || 'publishedAt';
  // Validate sortBy parameter
  const validSortFields = ['publishedAt', 'createdAt', 'qualityScore', 'bookmarks', 'userVotes'];
  const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'publishedAt';
  const sortOrder = (params.sortOrder || 'desc') as 'asc' | 'desc';

  // Build where clause
  const where: Prisma.ArticleWhereInput = {};
  if (params.sourceId) {
    where.sourceId = params.sourceId;
  }
  
  // 品質フィルタ（一時的に無効化）
  // where.qualityScore = { gte: 30 };
  
  // タグフィルター（複数対応）
  if (params.tags || params.tag) {
    const tagNames = params.tags ? params.tags.split(',') : [params.tag!];
    const tagMode = params.tagMode || 'OR';
    
    if (tagMode === 'AND') {
      // すべてのタグを含む
      where.AND = tagNames.map(name => ({
        tags: {
          some: {
            name
          }
        }
      }));
    } else {
      // いずれかのタグを含む
      where.tags = {
        some: {
          name: {
            in: tagNames
          }
        }
      };
    }
  }
  
  if (params.search) {
    // Split search string by spaces (both half-width and full-width)
    const keywords = params.search.trim()
      .split(/[\s　]+/)
      .filter(k => k.length > 0);
    
    if (keywords.length === 1) {
      // Single keyword - maintain existing behavior
      where.OR = [
        { title: { contains: keywords[0] } },
        { summary: { contains: keywords[0] } }
      ];
    } else if (keywords.length > 1) {
      // Multiple keywords - AND search
      where.AND = keywords.map(keyword => ({
        OR: [
          { title: { contains: keyword } },
          { summary: { contains: keyword } }
        ]
      }));
    }
  }

  // Get total count and articles in parallel for better performance
  const [total, articles] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      select: {
        id: true,
        title: true,
        url: true,
        summary: true,
        publishedAt: true,
        qualityScore: true,
        bookmarks: true,
        userVotes: true,
        difficulty: true,
        // Exclude: content, thumbnail, detailedSummary
        source: {
          select: {
            id: true,
            name: true,
          },
        },
        tags: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        [finalSortBy]: sortOrder,
      } as Prisma.ArticleOrderByWithRelationInput,
      skip: (page - 1) * limit,
      take: limit,
    })
  ]);

  return {
    articles,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

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
  
  const [data, sources, tags] = await Promise.all([
    getArticles(params),
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
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {data.total.toLocaleString()}件
                </p>
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

          {/* 記事リスト - スクロール可能 */}
          <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
            <Suspense fallback={<ArticleSkeleton />}>
              <ArticleList articles={data.articles} viewMode={viewMode} />
            </Suspense>
          </div>

          {/* ページネーション - 固定 */}
          {data.totalPages > 1 && (
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 lg:px-6 py-3">
              <ServerPagination
                currentPage={data.page}
                totalPages={data.totalPages}
                searchParams={params}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}