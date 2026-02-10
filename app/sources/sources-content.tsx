'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Search, SortAsc } from 'lucide-react';
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

export default function SourcesContent() {
  const [allSources, setAllSources] = useState<SourceWithStats[]>([]);
  const [sources, setSources] = useState<SourceWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<SourceCategoryWithAll>('all');
  const [sortBy, setSortBy] = useState<SortBy>('articles');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const { isFavorite } = useFavoriteSources();

  const loadAllSources = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sources');
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error(
          { status: response.status, body },
          'Failed to load sources'
        );
        setAllSources([]);
        return;
      }
      const data = await response.json();
      setAllSources(Array.isArray(data.sources) ? data.sources : []);
    } catch (error) {
      logger.error({ error }, 'Failed to load sources');
      setAllSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回ロード時のみ全データを取得
  useEffect(() => {
    loadAllSources();
  }, [loadAllSources]);

  // フィルタリングとソートを適用
  const applyFiltersAndSort = useCallback(() => {
    if (allSources.length === 0) {
      setSources([]);
      return;
    }

    let filtered = [...allSources];

    // カテゴリフィルタリング
    if (category !== 'all') {
      filtered = filtered.filter((s) => s.category === category);
    }

    // 検索フィルタリング
    if (search) {
      filtered = filtered.filter((source) =>
        source.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // ソート
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

    setSources(filtered);
  }, [allSources, category, sortBy, order, search]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [applyFiltersAndSort]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // 検索は自動的にuseEffectで処理される
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

  return (
    <div className="space-y-6">
      <h1 className="sr-only">ソース一覧</h1>
      {loading ? (
        <SourcesOverviewSkeleton />
      ) : (
        <SourcesOverview stats={overviewStats} />
      )}

      {/* 検索・ソート ツールバー */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="relative min-w-0 flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="ソースを検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card border-input pl-10"
          />
        </form>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
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
          onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
          aria-label={order === 'desc' ? '昇順に切り替え' : '降順に切り替え'}
        >
          <SortAsc
            className={`h-4 w-4 transition-transform ${order === 'desc' ? 'rotate-180' : ''}`}
          />
        </Button>
      </div>

      {/* カテゴリータブ */}
      <Tabs
        value={category}
        onValueChange={(v) => setCategory(v as SourceCategoryWithAll)}
      >
        <TabsList className="mb-6 w-full overflow-x-auto">
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-64"
                  style={{ animationDelay: `${i * 75}ms` }}
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sources.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
