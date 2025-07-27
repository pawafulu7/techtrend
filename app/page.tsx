import { Suspense } from 'react';
import { Filters } from '@/app/components/common/filters';
import { ArticleList } from '@/app/components/article/list';
import { ServerPagination } from '@/app/components/common/server-pagination';
import { FeedUpdateButton } from '@/app/components/common/feed-update-button';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/database';
import { ARTICLES_PER_PAGE } from '@/lib/constants';
import Link from 'next/link';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    sourceId?: string;
    tag?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

async function getArticles(params: Awaited<PageProps['searchParams']>) {
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = ARTICLES_PER_PAGE;
  const sortBy = params.sortBy || 'publishedAt';
  const sortOrder = (params.sortOrder || 'desc') as 'asc' | 'desc';

  // Build where clause
  const where: any = {};
  if (params.sourceId) {
    where.sourceId = params.sourceId;
  }
  if (params.tag) {
    where.tags = {
      some: {
        name: params.tag
      }
    };
  }
  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { summary: { contains: params.search, mode: 'insensitive' } }
    ];
  }

  // Get total count and articles in parallel for better performance
  const [total, articles] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      include: {
        source: true,
        tags: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
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
  }));
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const [data, sources, tags] = await Promise.all([
    getArticles(params),
    getSources(),
    getPopularTags(),
  ]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      
      <div className="container mx-auto px-2 py-2 flex flex-col h-full overflow-hidden">
        {/* Header Section */}
        <div className="mb-1 flex-shrink-0">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <h1 className="text-xl font-bold">最新テックトレンド</h1>
            <FeedUpdateButton />
          </div>

        </div>


        <div className="flex gap-4 flex-1 overflow-hidden">
          {/* Sidebar Filters */}
          <aside className="hidden lg:block w-48 flex-shrink-0">
            <Suspense fallback={<div>Loading filters...</div>}>
              <Filters sources={sources} tags={tags} />
            </Suspense>
          </aside>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-2">
              {/* Sort Options */}
              <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {data.total}件
            </p>
            <div className="flex gap-1">
              <Button
                variant={params.sortBy !== 'bookmarks' ? 'default' : 'outline'}
                size="sm"
                asChild
                className="h-7 px-2 text-xs"
              >
                <Link href={`/?${new URLSearchParams({ ...params, sortBy: 'publishedAt' }).toString()}`}>
                  新着
                </Link>
              </Button>
              <Button
                variant={params.sortBy === 'bookmarks' ? 'default' : 'outline'}
                size="sm"
                asChild
                className="h-7 px-2 text-xs"
              >
                <Link href={`/?${new URLSearchParams({ ...params, sortBy: 'bookmarks' }).toString()}`}>
                  人気
                </Link>
              </Button>
            </div>
          </div>

              {/* Articles */}
              <Suspense fallback={<div>Loading articles...</div>}>
                <ArticleList articles={data.articles} />
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