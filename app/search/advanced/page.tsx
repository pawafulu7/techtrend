'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ArticleCard } from '@/app/components/article/card';
import { Pagination } from '@/app/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, Filter, Calendar, Tag, Database, 
  Star, X, RotateCcw, ChevronDown, ChevronUp,
  Zap, BookOpen, GraduationCap
} from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { ArticleWithRelations } from '@/types/models';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SearchFilters {
  query: string;
  tags: string[];
  sources: string[];
  excludeTags: string[];
  excludeSources: string[];
  dateFrom: string;
  dateTo: string;
  qualityScore: [number, number];
  difficulty: string[];
  hasContent: boolean;
  sortBy: 'relevance' | 'date' | 'popularity' | 'quality';
}

export default function AdvancedSearchPage() {
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    tags: [],
    sources: [],
    excludeTags: [],
    excludeSources: [],
    dateFrom: '',
    dateTo: '',
    qualityScore: [0, 100],
    difficulty: [],
    hasContent: false,
    sortBy: 'relevance'
  });

  const [results, setResults] = useState<ArticleWithRelations[]>([]);
  interface SearchFacets {
    tags?: Array<{ name: string; count: number }>;
    sources?: Array<{ name: string; count: number }>;
    difficulty?: Array<{ level: string; count: number }>;
  }
  const [facets, setFacets] = useState<SearchFacets>({});
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(true);
  const [tagInput, setTagInput] = useState('');
  const [excludeTagInput, setExcludeTagInput] = useState('');

  const executeSearch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: filters.query,
        page: page.toString(),
        limit: '20',
        sortBy: filters.sortBy
      });

      // フィルターパラメータの追加
      filters.tags.forEach(tag => params.append('tags', tag));
      filters.sources.forEach(source => params.append('sources', source));
      filters.difficulty.forEach(diff => params.append('difficulty', diff));
      
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);

      // 拡張検索パラメータ
      if (filters.excludeTags.length > 0) {
        params.set('excludeTags', filters.excludeTags.join(','));
      }
      if (filters.excludeSources.length > 0) {
        params.set('excludeSources', filters.excludeSources.join(','));
      }
      if (filters.qualityScore[0] > 0 || filters.qualityScore[1] < 100) {
        params.set('qualityMin', filters.qualityScore[0].toString());
        params.set('qualityMax', filters.qualityScore[1].toString());
      }
      if (filters.hasContent) {
        params.set('hasContent', 'true');
      }

      const response = await fetch(`/api/articles/search/advanced?${params.toString()}`);
      const data = await response.json();

      setResults(data.articles || []);
      setTotalCount(data.totalCount || 0);
      setFacets(data.facets || {});
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (filters.query || filters.tags.length > 0 || filters.sources.length > 0) {
      executeSearch();
    }
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    executeSearch();
  };

  const handleReset = () => {
    setFilters({
      query: '',
      tags: [],
      sources: [],
      excludeTags: [],
      excludeSources: [],
      dateFrom: '',
      dateTo: '',
      qualityScore: [0, 100],
      difficulty: [],
      hasContent: false,
      sortBy: 'relevance'
    });
    setResults([]);
    setTotalCount(0);
    setPage(1);
  };

  const addTag = (tag: string) => {
    if (tag && !filters.tags.includes(tag)) {
      setFilters({ ...filters, tags: [...filters.tags, tag] });
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setFilters({ ...filters, tags: filters.tags.filter(t => t !== tag) });
  };

  const addExcludeTag = (tag: string) => {
    if (tag && !filters.excludeTags.includes(tag)) {
      setFilters({ ...filters, excludeTags: [...filters.excludeTags, tag] });
    }
    setExcludeTagInput('');
  };

  const removeExcludeTag = (tag: string) => {
    setFilters({ ...filters, excludeTags: filters.excludeTags.filter(t => t !== tag) });
  };

  const totalPages = Math.ceil(totalCount / 20);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Search className="h-8 w-8" />
          高度な検索
        </h1>
        <p className="text-muted-foreground">
          詳細な条件を指定して記事を検索できます
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* フィルターサイドバー */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  検索フィルター
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? <ChevronUp /> : <ChevronDown />}
                </Button>
              </CardTitle>
            </CardHeader>
            
            <Collapsible open={showFilters}>
              <CollapsibleContent>
                <CardContent>
                  <form onSubmit={handleSearch} className="space-y-6">
                    {/* 検索クエリ */}
                    <div>
                      <Label htmlFor="query">検索キーワード</Label>
                      <Input
                        id="query"
                        type="search"
                        value={filters.query}
                        onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                        placeholder="記事を検索..."
                      />
                    </div>

                    {/* タグフィルター */}
                    <div>
                      <Label htmlFor="tags">タグで絞り込み</Label>
                      <div className="flex gap-2 mb-2">
                        <Input
                          id="tags"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addTag(tagInput);
                            }
                          }}
                          placeholder="タグを入力"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => addTag(tagInput)}
                        >
                          追加
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {filters.tags.map(tag => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="ml-1"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* 除外タグ */}
                    <div>
                      <Label htmlFor="excludeTags">除外するタグ</Label>
                      <div className="flex gap-2 mb-2">
                        <Input
                          id="excludeTags"
                          value={excludeTagInput}
                          onChange={(e) => setExcludeTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addExcludeTag(excludeTagInput);
                            }
                          }}
                          placeholder="除外するタグ"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => addExcludeTag(excludeTagInput)}
                        >
                          除外
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {filters.excludeTags.map(tag => (
                          <Badge key={tag} variant="destructive">
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeExcludeTag(tag)}
                              className="ml-1"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* 期間指定 */}
                    <div>
                      <Label>投稿期間</Label>
                      <div className="space-y-2">
                        <Input
                          type="date"
                          value={filters.dateFrom}
                          onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                        />
                        <Input
                          type="date"
                          value={filters.dateTo}
                          onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* 品質スコア */}
                    <div>
                      <Label>品質スコア: {filters.qualityScore[0]} - {filters.qualityScore[1]}</Label>
                      <Slider
                        value={filters.qualityScore}
                        onValueChange={(value) => setFilters({ ...filters, qualityScore: value as [number, number] })}
                        min={0}
                        max={100}
                        step={10}
                        className="mt-2"
                      />
                    </div>

                    {/* 難易度 */}
                    <div>
                      <Label>難易度</Label>
                      <div className="space-y-2 mt-2">
                        {['beginner', 'intermediate', 'advanced'].map(level => (
                          <label key={level} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={filters.difficulty.includes(level)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilters({ ...filters, difficulty: [...filters.difficulty, level] });
                                } else {
                                  setFilters({ ...filters, difficulty: filters.difficulty.filter(d => d !== level) });
                                }
                              }}
                            />
                            <span className="flex items-center gap-1">
                              {level === 'beginner' && <><Zap className="h-4 w-4" /> 初級</>}
                              {level === 'intermediate' && <><BookOpen className="h-4 w-4" /> 中級</>}
                              {level === 'advanced' && <><GraduationCap className="h-4 w-4" /> 上級</>}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* コンテンツありのみ */}
                    <div className="flex items-center justify-between">
                      <Label htmlFor="hasContent">本文ありのみ</Label>
                      <Switch
                        id="hasContent"
                        checked={filters.hasContent}
                        onCheckedChange={(checked) => setFilters({ ...filters, hasContent: checked })}
                      />
                    </div>

                    {/* ソート */}
                    <div>
                      <Label>並び順</Label>
                      <Select
                        value={filters.sortBy}
                        onValueChange={(value: 'relevance' | 'date' | 'popularity' | 'quality') => setFilters({ ...filters, sortBy: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relevance">関連度順</SelectItem>
                          <SelectItem value="date">新着順</SelectItem>
                          <SelectItem value="popularity">人気順</SelectItem>
                          <SelectItem value="quality">品質順</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1">
                        検索
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleReset}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>

        {/* 検索結果 */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : results.length > 0 ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {totalCount}件の記事が見つかりました
                </p>
              </div>

              <div className="space-y-4">
                {results.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-8">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg text-muted-foreground mb-2">
                  検索条件を指定してください
                </p>
                <p className="text-sm text-muted-foreground">
                  左側のフィルターを使用して、詳細な検索条件を設定できます
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}