import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { Filters } from '@/app/components/common/filters';
import { MobileFilters } from '@/app/components/common/mobile-filters';
import { SearchBox } from '@/app/components/common/search-box';
import { FeedUpdateButton } from '@/app/components/common/feed-update-button';
import { SummaryGenerateButton } from '@/app/components/common/summary-generate-button';
import { TagGenerateButton } from '@/app/components/common/tag-generate-button';
import { ServerPagination } from '@/app/components/common/server-pagination';
import { PopularTags } from '@/app/components/common/popular-tags';
import { TagFilterDropdown } from '@/app/components/common/tag-filter-dropdown';
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
    where.OR = [
      { title: { contains: params.search } },
      { summary: { contains: params.search } }
    ];
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
    <div className="h-full flex flex-col overflow-hidden">
      
      <div className="container mx-auto px-2 sm:px-4 py-2 flex flex-col h-full overflow-hidden">
        {/* Header Section */}
        <div className="mb-2 flex-shrink-0 space-y-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-lg p-3 border border-white/20 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <h1 className="text-lg sm:text-xl font-bold">最新テックトレンド</h1>
            <div className="flex gap-2">
              <FeedUpdateButton />
              <SummaryGenerateButton />
              <TagGenerateButton />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SearchBox />
            <div className="hidden lg:block">
              <TagFilterDropdown tags={tags} />
            </div>
          </div>
        </div>


        <div className="flex gap-2 sm:gap-4 flex-1 overflow-hidden">
          {/* Sidebar Filters - Desktop */}
          <aside className="hidden lg:block w-48 flex-shrink-0">
            <Suspense fallback={<FilterSkeleton />}>
              <Filters sources={sources} tags={tags} />
            </Suspense>
          </aside>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-2">
              {/* Sort Options and Mobile Filters */}
              <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {data.total.toLocaleString()}件
              </p>
              <MobileFilters sources={sources} tags={tags} />
            </div>
            <div className="flex items-center gap-2">
              {/* 表示切り替えボタン */}
              <ViewModeToggle 
                currentMode={viewMode} 
                onModeChange={() => {/* Client-side only */}}
              />
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

              {/* Articles */}
              <Suspense fallback={<ArticleSkeleton />}>
                <ArticleList articles={data.articles} viewMode={viewMode} />
              </Suspense>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="mt-4">
                  <ServerPagination
                    currentPage={data.page}
                    totalPages={data.totalPages}
                    searchParams={params}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}