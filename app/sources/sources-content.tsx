'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SourceCard } from '@/app/components/sources/SourceCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, SortAsc, ChevronLeft, ChevronRight } from 'lucide-react';
import { SourcesOverview } from '@/app/components/sources/SourcesOverview';
import { SourcesOverviewSkeleton } from '@/app/components/sources/SourcesOverviewSkeleton';
import { useFavoriteSources } from '@/lib/favorites/hooks';
import type {
  SourceCategory,
  SourceCategoryWithAll,
  SourceWithStats,
} from '@/types/source';
import logger from '@/lib/logger.client';

type SortBy = 'articles' | 'quality' | 'frequency' | 'name';

const ITEMS_PER_PAGE = 20;

export default function SourcesContent() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<SourceCategoryWithAll>('all');
  const [sortBy, setSortBy] = useState<SortBy>('articles');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const { isFavorite } = useFavoriteSources();

  const {
    data,
    isPending: loading,
    isError,
  } = useQuery<SourceWithStats[]>({
    queryKey: ['sources'],
    queryFn: async () => {
      const response = await fetch('/api/sources');
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error(
          { status: response.status, body },
          'Failed to load sources'
        );
        throw new Error(`Failed to load sources: ${response.status}`);
      }
      let json: { sources?: unknown };
      try {
        json = await response.json();
      } catch (parseError) {
        logger.error(
          { parseError },
          'Failed to parse sources response as JSON'
        );
        throw new Error('Failed to parse sources response as JSON');
      }
      return Array.isArray(json.sources) ? json.sources : [];
    },
  });

  const allSources = useMemo(() => data ?? [], [data]);

  const sources = useMemo(() => {
    if (allSources.length === 0) return [];

    let filtered = [...allSources];

    if (category !== 'all') {
      filtered = filtered.filter((s) => s.category === category);
    }

    if (search) {
      filtered = filtered.filter((source) =>
        source.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    filtered.sort((a, b) => {
      let aValue, bValue;
      switch (sortBy) {
        case 'articles':
          aValue = a.stats.totalArticles;
          bValue = b.stats.totalArticles;
          break;
        case 'quality':
          aValue = a.stats.avgQualityScore;
          bValue = b.stats.avgQualityScore;
          break;
        case 'frequency':
          aValue = a.stats.publishFrequency;
          bValue = b.stats.publishFrequency;
          break;
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        default:
          aValue = a.stats.totalArticles;
          bValue = b.stats.totalArticles;
      }

      if (sortBy === 'name') {
        return order === 'asc'
          ? (aValue as string).localeCompare(bValue as string)
          : (bValue as string).localeCompare(aValue as string);
      } else {
        return order === 'asc'
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });

    return filtered;
  }, [allSources, category, sortBy, order, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const getCategoryCount = (cat: SourceCategoryWithAll) => {
    if (cat === 'all') return allSources.length;
    return allSources.filter((s) => s.category === cat).length;
  };

  const overviewStats = useMemo(() => {
    const uniqueCategories = new Set(allSources.map((s) => s.category));
    return {
      totalSources: allSources.length,
      activeSources: allSources.filter((s) => s.stats.publishFrequency > 0)
        .length,
      favoriteCount: allSources.filter((s) => isFavorite(s.id)).length,
      categoryCount: uniqueCategories.size,
    };
  }, [allSources, isFavorite]);

  const totalPages = Math.max(1, Math.ceil(sources.length / ITEMS_PER_PAGE));
  const paginatedSources = sources.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="sr-only">ソース一覧</h1>
        <div
          className="border-destructive/20 bg-destructive/10 rounded-md border p-4"
          role="alert"
        >
          <p className="text-destructive text-sm">
            ソースの読み込みに失敗しました。しばらく経ってから再試行してください。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="sr-only">ソース一覧</h1>
      {loading ? (
        <SourcesOverviewSkeleton />
      ) : (
        <SourcesOverview stats={overviewStats} />
      )}

      {/* Search & Sort toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="relative min-w-0 flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="ソースを検索..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-card border-input pl-10"
          />
        </form>

        <Select
          value={sortBy}
          onValueChange={(v) => {
            setSortBy(v as SortBy);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SortAsc className="mr-2 h-4 w-4" />
            <SelectValue placeholder="並び替え" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="articles">記事数</SelectItem>
            <SelectItem value="quality">品質スコア</SelectItem>
            <SelectItem value="frequency">更新頻度</SelectItem>
            <SelectItem value="name">名前</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setOrder(order === 'desc' ? 'asc' : 'desc');
            setCurrentPage(1);
          }}
          aria-label={order === 'desc' ? '昇順に切り替え' : '降順に切り替え'}
        >
          <SortAsc
            className={`h-4 w-4 transition-transform ${order === 'desc' ? 'rotate-180' : ''}`}
          />
        </Button>
      </div>

      {/* Category tabs */}
      <Tabs
        value={category}
        onValueChange={(v) => {
          setCategory(v as SourceCategoryWithAll);
          setCurrentPage(1);
        }}
      >
        <TabsList className="mb-4 w-full overflow-x-auto">
          <TabsTrigger value="all">
            すべて ({getCategoryCount('all')})
          </TabsTrigger>
          <TabsTrigger value="tech_blog">
            技術ブログ ({getCategoryCount('tech_blog' as SourceCategory)})
          </TabsTrigger>
          <TabsTrigger value="company_blog">
            企業ブログ ({getCategoryCount('company_blog' as SourceCategory)})
          </TabsTrigger>
          <TabsTrigger value="personal_blog">
            個人ブログ ({getCategoryCount('personal_blog' as SourceCategory)})
          </TabsTrigger>
          <TabsTrigger value="news_site">
            ニュース ({getCategoryCount('news_site' as SourceCategory)})
          </TabsTrigger>
          <TabsTrigger value="community">
            コミュニティ ({getCategoryCount('community')})
          </TabsTrigger>
          <TabsTrigger value="other">
            その他 ({getCategoryCount('other')})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={category} className="mt-0">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-14 rounded-lg"
                  style={{ animationDelay: `${i * 50}ms` }}
                />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground mb-2 text-lg">
                ソースが見つかりませんでした
              </p>
              <p className="text-muted-foreground text-sm">
                検索条件を変更してみてください
              </p>
            </div>
          ) : (
            <>
              {/* Source list */}
              <div className="space-y-1.5">
                {paginatedSources.map((source) => (
                  <SourceCard key={source.id} source={source} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    {sources.length}件中{' '}
                    {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
                    {Math.min(currentPage * ITEMS_PER_PAGE, sources.length)}件
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <Button
                        key={i + 1}
                        variant={currentPage === i + 1 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(i + 1)}
                        className="w-8"
                      >
                        {i + 1}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
