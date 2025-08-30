'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/date';
import { Badge } from '@/components/ui/badge';

interface FavoriteArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  source: {
    id: string;
    name: string;
  };
  tags: Array<{
    id: string;
    name: string;
  }>;
  favoriteId: string;
  favoritedAt: string;
  qualityScore: number | null;
}

export default function ArticleFavoritesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [favorites, setFavorites] = useState<FavoriteArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/article-favorites');
    } else if (status === 'authenticated') {
      fetchFavorites();
    }
  }, [status, router]);

  const fetchFavorites = async () => {
    try {
      const response = await fetch('/api/favorites');
      if (!response.ok) {
        throw new Error('Failed to fetch favorites');
      }
      const data = await response.json();
      setFavorites(data.favorites);
    } catch (_error) {
      setError('お気に入りの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFavorite = async (articleId: string) => {
    try {
      const response = await fetch(`/api/favorites?articleId=${articleId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setFavorites(prev => prev.filter(f => f.id !== articleId));
      }
    } catch (_error) {
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-6 w-6 text-pink-500" />
              お気に入り記事
            </CardTitle>
            <CardDescription>
              保存した記事を後で読むことができます
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-6 w-6 text-pink-500" />
              お気に入り記事
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-pink-500" />
            お気に入り記事
          </CardTitle>
          <CardDescription>
            {favorites.length > 0
              ? `${favorites.length}件の記事を保存しています`
              : '保存した記事を後で読むことができます'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {favorites.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-lg font-medium mb-2">
                まだお気に入りに追加した記事がありません
              </p>
              <p className="text-sm text-muted-foreground">
                記事のお気に入りボタンをクリックして保存しましょう
              </p>
              <Link href="/">
                <Button className="mt-4">
                  記事を探す
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {favorites.map((article) => (
                <div
                  key={article.id}
                  className="group relative border rounded-lg p-4 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link 
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2">
                          {article.title}
                        </h3>
                      </Link>
                      
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {article.summary}
                      </p>
                      
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {article.source.name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(article.publishedAt)}
                        </span>
                        {article.qualityScore && (
                          <Badge variant="outline" className="text-xs">
                            品質: {article.qualityScore}
                          </Badge>
                        )}
                      </div>
                      
                      {article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {article.tags.slice(0, 5).map((tag) => (
                            <Badge key={tag.id} variant="outline" className="text-xs">
                              {tag.name}
                            </Badge>
                          ))}
                          {article.tags.length > 5 && (
                            <span className="text-xs text-muted-foreground">
                              +{article.tags.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                      
                      <div className="text-xs text-muted-foreground mt-2">
                        保存日: {formatDate(article.favoritedAt)}
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFavorite(article.id)}
                      className="shrink-0"
                    >
                      <Heart className="h-4 w-4 fill-current text-pink-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}