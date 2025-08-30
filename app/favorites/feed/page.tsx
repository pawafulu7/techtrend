'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArticleCard } from '@/app/components/article/card';
import { Pagination } from '@/app/components/ui/pagination';
import { 
  Star, Folder, ArrowLeft, Filter, RefreshCw, 
  Newspaper, TrendingUp, Clock
} from 'lucide-react';
import { useFavoriteSources } from '@/lib/favorites/hooks';
import Link from 'next/link';
import type { ArticleWithRelations } from '@/types/models';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function FavoritesFeedPage() {
  const {
    favorites,
    folders,
    isLoading: favoritesLoading,
    getFavoritesByFolder
  } = useFavoriteSources();

  const [articles, setArticles] = useState<ArticleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'quality'>('recent');
  const [refreshing, setRefreshing] = useState(false);

  const loadArticles = async () => {
    setLoading(true);
    try {
      // フォルダーに基づいてソースIDを取得
      let sourceIds: string[] = [];
      if (selectedFolder === 'all') {
        sourceIds = favorites.map(f => f.sourceId);
      } else {
        sourceIds = getFavoritesByFolder(selectedFolder).map(f => f.sourceId);
      }

      if (sourceIds.length === 0) {
        setArticles([]);
        setTotalPages(1);
        return;
      }

      const params = new URLSearchParams({
        sourceIds: sourceIds.join(','),
        page: page.toString(),
        limit: '20'
      });

      const response = await fetch(`/api/articles/favorites?${params.toString()}`);
      const data = await response.json();

      // ソート処理
      const sortedArticles = [...data.articles];
      switch (sortBy) {
        case 'popular':
          sortedArticles.sort((a, b) => b.bookmarkCount - a.bookmarkCount);
          break;
        case 'quality':
          sortedArticles.sort((a, b) => b.qualityScore - a.qualityScore);
          break;
        // 'recent'はデフォルトでpublishedAtでソート済み
      }

      setArticles(sortedArticles);
      setTotalPages(data.pagination.totalPages);
    } catch (_error) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!favoritesLoading) {
      loadArticles();
    }
  }, [favoritesLoading, selectedFolder, page, sortBy]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadArticles();
  };

  if (favoritesLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  const articleCount = articles.length;
  const folderCount = selectedFolder === 'all' 
    ? favorites.length 
    : getFavoritesByFolder(selectedFolder).length;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-8">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/favorites" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            お気に入り管理に戻る
          </Link>
        </Button>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Newspaper className="h-8 w-8" />
              お気に入りフィード
            </h1>
            <p className="text-muted-foreground">
              お気に入りに登録したソースの最新記事
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            更新
          </Button>
        </div>
      </div>

      {/* フィルターとソート */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      すべて ({favorites.length}ソース)
                    </SelectItem>
                    {folders.map(folder => {
                      const count = getFavoritesByFolder(folder.id).length;
                      return (
                        <SelectItem key={folder.id} value={folder.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: folder.color }}
                            />
                            {folder.name} ({count}ソース)
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={(v: 'recent' | 'popular' | 'quality') => setSortBy(v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        新着順
                      </div>
                    </SelectItem>
                    <SelectItem value="popular">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        人気順
                      </div>
                    </SelectItem>
                    <SelectItem value="quality">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4" />
                        品質順
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {folderCount}ソースから{articleCount}件の記事
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 記事一覧 */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="h-32 animate-pulse bg-muted" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Newspaper className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg text-muted-foreground mb-2">
              記事がありません
            </p>
            <p className="text-sm text-muted-foreground">
              {selectedFolder === 'all' 
                ? 'お気に入りソースから新しい記事が投稿されるのをお待ちください'
                : 'このフォルダーのソースから新しい記事が投稿されるのをお待ちください'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Top Pagination - Desktop only */}
          {totalPages > 1 && (
            <div className="mb-6 hidden lg:block">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}

          <div className="space-y-4">
            {articles.map((article) => (
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
      )}
    </div>
  );
}