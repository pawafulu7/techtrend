'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { Button } from '@/components/ui/button';
import { ArticleCard } from '@/app/components/article/card';
import { Pagination } from '@/app/components/ui/pagination';
import {
  Star,
  Folder,
  ArrowLeft,
  RefreshCw,
  Newspaper,
  TrendingUp,
  Clock,
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
    getFavoritesByFolder,
  } = useFavoriteSources();

  const [articles, setArticles] = useState<ArticleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'quality'>(
    'recent'
  );
  const [refreshing, setRefreshing] = useState(false);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      // フォルダーに基づいてソースIDを取得
      let sourceIds: string[] = [];
      if (selectedFolder === 'all') {
        sourceIds = favorites.map((f) => f.sourceId);
      } else {
        sourceIds = getFavoritesByFolder(selectedFolder).map((f) => f.sourceId);
      }

      if (sourceIds.length === 0) {
        setArticles([]);
        setTotalPages(1);
        return;
      }

      const params = new URLSearchParams({
        sourceIds: sourceIds.join(','),
        page: page.toString(),
        limit: '20',
      });

      const response = await fetch(
        `/api/articles/favorites?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
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
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to load favorite articles:', error);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [favorites, selectedFolder, page, sortBy, getFavoritesByFolder]);

  useEffect(() => {
    if (!favoritesLoading) {
      loadArticles();
    }
  }, [favoritesLoading, loadArticles]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadArticles();
  };

  const articleCount = articles.length;
  const folderCount = useMemo(
    () =>
      selectedFolder === 'all'
        ? favorites.length
        : getFavoritesByFolder(selectedFolder).length,
    [selectedFolder, favorites.length, getFavoritesByFolder]
  );

  if (favoritesLoading) {
    return (
      <div className="px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <div className="bg-muted h-4 w-4 animate-pulse rounded" />
          <div className="bg-muted h-5 w-5 animate-pulse rounded" />
          <div className="bg-muted h-5 w-32 animate-pulse rounded" />
          <div className="flex-1" />
          <div className="bg-muted h-9 w-[180px] animate-pulse rounded" />
          <div className="bg-muted h-9 w-[140px] animate-pulse rounded" />
          <div className="bg-muted h-9 w-16 animate-pulse rounded" />
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="border-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2"></div>
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 lg:px-6">
      {/* Toolbar: Back + Title + Count + Folder + Sort + Refresh */}
      <header className="flex flex-wrap items-center gap-2 pb-3">
        <Link
          href="/favorites"
          className="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md"
          aria-label="お気に入りに戻る"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Newspaper className="text-primary h-5 w-5" aria-hidden="true" />
        <h1 className="text-foreground text-lg font-semibold">
          お気に入りフィード
        </h1>
        <span className="text-muted-foreground text-sm">
          {folderCount}ソースから{articleCount}件
        </span>
        <div className="flex-1" />
        <Select value={selectedFolder} onValueChange={setSelectedFolder}>
          <SelectTrigger className="h-9 w-[180px]" aria-label="フォルダー">
            <Folder className="mr-2 h-4 w-4" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              すべて ({favorites.length}ソース)
            </SelectItem>
            {folders.map((folder) => {
              const count = getFavoritesByFolder(folder.id).length;
              return (
                <SelectItem key={folder.id} value={folder.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: folder.color }}
                    />
                    {folder.name} ({count})
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(v) => {
            const valid: Array<'recent' | 'popular' | 'quality'> = [
              'recent',
              'popular',
              'quality',
            ];
            if (valid.includes(v as 'recent' | 'popular' | 'quality')) {
              setSortBy(v as 'recent' | 'popular' | 'quality');
            }
          }}
        >
          <SelectTrigger className="h-9 w-[140px]" aria-label="並び替え">
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-9"
        >
          <RefreshCw
            className={`mr-1 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
          />
          更新
        </Button>
      </header>

      {/* 記事一覧 */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardV2 key={i} className="bg-muted h-32 animate-pulse" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <CardV2 className="mx-auto max-w-md">
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <Newspaper className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
            <p className="text-muted-foreground mb-2 text-lg">
              記事がありません
            </p>
            <p className="text-muted-foreground text-sm">
              {selectedFolder === 'all'
                ? 'お気に入りソースから新しい記事が投稿されるのをお待ちください'
                : 'このフォルダーのソースから新しい記事が投稿されるのをお待ちください'}
            </p>
          </div>
        </CardV2>
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
