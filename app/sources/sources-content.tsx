'use client';

import { useState, useEffect } from 'react';
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
import { Search, Filter, SortAsc } from 'lucide-react';
import type { SourceCategory, SourceCategoryWithAll, SourceWithStats } from '@/types/source';

type SortBy = 'articles' | 'quality' | 'frequency' | 'name';

export default function SourcesContent() {
  const [allSources, setAllSources] = useState<SourceWithStats[]>([]);
  const [sources, setSources] = useState<SourceWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<SourceCategoryWithAll>('all');
  const [sortBy, setSortBy] = useState<SortBy>('articles');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  // 初回ロード時のみ全データを取得
  useEffect(() => {
    loadAllSources();
  }, []);

  // フィルタリングとソートを適用
  useEffect(() => {
    applyFiltersAndSort();
  }, [allSources, category, sortBy, order, search]);

  const loadAllSources = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sources');
      const data = await response.json();
      setAllSources(data.sources);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    if (allSources.length === 0) return;

    let filtered = [...allSources];

    // カテゴリフィルタリング
    if (category !== 'all') {
      filtered = filtered.filter(s => s.category === category);
    }

    // 検索フィルタリング
    if (search) {
      filtered = filtered.filter(source =>
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
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // 検索は自動的にuseEffectで処理される
  };

  const getCategoryCount = (cat: SourceCategoryWithAll) => {
    if (cat === 'all') return allSources.length;
    return allSources.filter(s => s.category === cat).length;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">ソース一覧</h1>
        <p className="text-muted-foreground">
          技術情報を配信しているメディアやブログを探索
        </p>
      </div>

      {/* 検索とフィルター */}
      <div className="mb-6 space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="ソースを検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-card border-input"
            />
          </div>
          <Button type="submit">検索</Button>
        </form>

        <div className="flex flex-wrap gap-4">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[180px]">
              <SortAsc className="h-4 w-4 mr-2" />
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
            onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
          >
            {order === 'desc' ? '降順' : '昇順'}
          </Button>
        </div>
      </div>

      {/* カテゴリータブ */}
      <Tabs value={category} onValueChange={(v) => setCategory(v as SourceCategoryWithAll)}>
        <TabsList className="mb-6">
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
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-lg text-muted-foreground mb-2">
                ソースが見つかりませんでした
              </p>
              <p className="text-sm text-muted-foreground">
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