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

type SourceCategory = 'all' | 'tech_blog' | 'company_blog' | 'personal_blog' | 'news_site' | 'community' | 'other';
type SortBy = 'articles' | 'quality' | 'frequency' | 'name';

interface SourceWithStats {
  id: string;
  name: string;
  type: string;
  url: string;
  enabled: boolean;
  category: SourceCategory;
  stats: {
    totalArticles: number;
    avgQualityScore: number;
    popularTags: string[];
    publishFrequency: number;
    lastPublished: Date | null;
    growthRate: number;
  };
}

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<SourceCategory>('all');
  const [sortBy, setSortBy] = useState<SortBy>('articles');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadSources();
  }, [category, sortBy, order]);

  const loadSources = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      params.set('sortBy', sortBy);
      params.set('order', order);
      if (search) params.set('search', search);

      const response = await fetch(`/api/sources?${params.toString()}`);
      const data = await response.json();
      setSources(data.sources);
    } catch (error) {
      console.error('Failed to load sources:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadSources();
  };

  const filteredSources = sources.filter(source =>
    source.name.toLowerCase().includes(search.toLowerCase())
  );

  const getCategoryCount = (cat: SourceCategory) => {
    if (cat === 'all') return sources.length;
    return sources.filter(s => s.category === cat).length;
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
              className="pl-10"
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
      <Tabs value={category} onValueChange={(v) => setCategory(v as SourceCategory)}>
        <TabsList className="mb-6">
          <TabsTrigger value="all">
            すべて ({getCategoryCount('all')})
          </TabsTrigger>
          <TabsTrigger value="tech_blog">
            技術ブログ ({getCategoryCount('tech_blog')})
          </TabsTrigger>
          <TabsTrigger value="company_blog">
            企業ブログ ({getCategoryCount('company_blog')})
          </TabsTrigger>
          <TabsTrigger value="personal_blog">
            個人ブログ ({getCategoryCount('personal_blog')})
          </TabsTrigger>
          <TabsTrigger value="news_site">
            ニュース ({getCategoryCount('news_site')})
          </TabsTrigger>
          <TabsTrigger value="community">
            コミュニティ ({getCategoryCount('community')})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={category} className="mt-0">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : filteredSources.length === 0 ? (
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
              {filteredSources.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}